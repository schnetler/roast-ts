import { v4 as uuid } from 'uuid';
import { StepStatus } from './constants';
import {
  WorkflowState,
  StateEvent,
  StateStoreConfig,
  StateRepository
} from '../shared/types';

export class StateStore {
  private snapshots: Map<string, WorkflowState> = new Map();
  private events: StateEvent[] = [];
  private config: Required<StateStoreConfig>;

  constructor(
    private repository: StateRepository,
    config: StateStoreConfig = {}
  ) {
    this.config = {
      snapshotInterval: 10,
      compactionThreshold: 100,
      ...config
    };
  }

  async save(state: WorkflowState): Promise<void> {
    // Record event
    const event: StateEvent = {
      id: uuid(),
      timestamp: new Date(),
      type: 'state:updated',
      sessionId: state.sessionId,
      data: state
    };

    this.events.push(event);

    // Save to repository
    await this.repository.save(state);

    // Create snapshot if needed
    if (this.shouldSnapshot()) {
      await this.createSnapshot(state);
    }

    // Compact if needed
    if (this.shouldCompact()) {
      await this.compact();
    }
  }

  async load(sessionId: string): Promise<WorkflowState | null> {
    // Try to load from snapshot first
    const snapshot = this.snapshots.get(sessionId);
    if (snapshot) {
      return snapshot;
    }

    // Load from repository
    return this.repository.load(sessionId);
  }

  async replay(
    sessionId: string,
    toStep?: string
  ): Promise<WorkflowState> {
    // Load initial state
    const states = await this.repository.loadHistory(sessionId);
    if (states.length === 0) {
      throw new Error(`No history found for session: ${sessionId}`);
    }

    // Find replay point
    let replayIndex = states.length - 1;
    if (toStep) {
      replayIndex = states.findIndex(s => 
        s.steps.some(step => step.name === toStep && step.status === StepStatus.Completed)
      );
      if (replayIndex === -1) {
        throw new Error(`Step not found in history: ${toStep}`);
      }
    }

    // Return state at replay point
    return states[replayIndex];
  }

  private shouldSnapshot(): boolean {
    return this.events.length % this.config.snapshotInterval === 0;
  }

  private shouldCompact(): boolean {
    return this.events.length > this.config.compactionThreshold;
  }

  private async createSnapshot(state: WorkflowState): Promise<void> {
    this.snapshots.set(state.sessionId, state);
    await this.repository.saveSnapshot(state);
  }

  private async compact(): Promise<void> {
    // Group events by session
    const eventsBySession = new Map<string, StateEvent[]>();
    
    for (const event of this.events) {
      const sessionEvents = eventsBySession.get(event.sessionId) || [];
      sessionEvents.push(event);
      eventsBySession.set(event.sessionId, sessionEvents);
    }

    // Compact each session
    for (const [sessionId, events] of eventsBySession) {
      if (events.length > this.config.compactionThreshold) {
        // Keep only the latest state and clear old events
        const latestEvent = events[events.length - 1];
        await this.createSnapshot(latestEvent.data);
        
        // Remove old events
        this.events = this.events.filter(e => 
          e.sessionId !== sessionId || e.id === latestEvent.id
        );
      }
    }
  }
}