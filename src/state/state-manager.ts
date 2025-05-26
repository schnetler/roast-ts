import { EventBus } from './event-bus';
import { StateStore } from './state-store';
import { WorkflowStatus, StepStatus } from './constants';
import {
  WorkflowState,
  StepState,
  WorkflowConfig,
  SessionOptions,
  StateRepository,
  StateManager as IStateManager,
  StepDefinition,
  StateStoreConfig
} from '../shared/types';

export class StateManager implements IStateManager {
  private currentState!: WorkflowState;
  private eventBus: EventBus;
  private store: StateStore;

  constructor(
    private repository: StateRepository,
    private config: StateStoreConfig = {}
  ) {
    this.eventBus = new EventBus();
    this.store = new StateStore(repository, config);
  }

  /**
   * Create a new session
   */
  async createSession(workflowName: string): Promise<string> {
    const sessionId = this.generateSessionId();
    const state: WorkflowState = {
      sessionId,
      workflowName,
      startedAt: new Date(),
      status: WorkflowStatus.Pending,
      context: {},
      steps: [],
      metadata: {
        model: 'gpt-4',
        provider: 'openai',
        targetCount: 1,
        parallelExecution: false
      }
    };
    
    this.currentState = state;
    await this.store.save(state);
    return sessionId;
  }

  /**
   * Get an existing session by ID
   */
  async getSession(sessionId: string): Promise<WorkflowState | null> {
    const state = await this.store.load(sessionId);
    if (state) {
      this.currentState = state;
    }
    return state;
  }

  /**
   * List sessions with optional filter
   */
  async listSessions(filter?: any): Promise<any[]> {
    return this.repository.listSessions(filter);
  }

  /**
   * Save step result
   */
  async saveStep(stepName: string, result: any, context: any): Promise<void> {
    // Find or create step state
    let stepState = this.currentState.steps.find(s => s.name === stepName);
    
    if (!stepState) {
      // Create new step state
      stepState = {
        id: `${stepName}_${this.currentState.steps.length}`,
        name: stepName,
        index: this.currentState.steps.length,
        status: StepStatus.Completed,
        startedAt: new Date(),
        completedAt: new Date(),
        input: context,
        output: result,
        transcript: [],
        metadata: {}
      };
      
      const updatedSteps = [...this.currentState.steps, stepState];
      await this.updateWorkflow({ steps: updatedSteps });
    } else {
      // Update existing step
      await this.updateStep(stepState.id, {
        status: StepStatus.Completed,
        completedAt: new Date(),
        output: result
      });
    }
    
    this.emit('step:updated', { stepId: stepState.id, updates: { output: result } });
  }

  /**
   * Initialize a new workflow session
   */
  async initializeSession(
    workflow: WorkflowConfig,
    options: SessionOptions = {}
  ): Promise<WorkflowState> {
    const sessionId = options.sessionId || this.generateSessionId();
    
    const initialState: WorkflowState = {
      sessionId,
      workflowName: workflow.name,
      startedAt: new Date(),
      status: WorkflowStatus.Pending,
      context: {},
      steps: this.initializeSteps(workflow.steps),
      metadata: {
        model: workflow.model || 'gpt-4',
        provider: workflow.provider || 'openai',
        targetCount: options.targetCount || 1,
        parallelExecution: workflow.parallel || false,
        resumedFrom: options.resumedFrom,
        tags: options.tags
      }
    };

    this.currentState = initialState;
    await this.store.save(initialState);
    this.emit('session:initialized', initialState);

    return initialState;
  }

  /**
   * Update workflow state immutably
   */
  async updateWorkflow(
    updates: Partial<WorkflowState>
  ): Promise<WorkflowState> {
    const newState = {
      ...this.currentState,
      ...updates,
      metadata: {
        ...this.currentState.metadata,
        ...(updates.metadata || {})
      }
    };

    this.currentState = newState;
    await this.store.save(newState);
    this.emit('workflow:updated', newState);

    return newState;
  }

  /**
   * Update step state immutably
   */
  async updateStep(
    stepId: string,
    updates: Partial<StepState>
  ): Promise<WorkflowState> {
    const stepIndex = this.currentState.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) {
      throw new Error(`Step not found: ${stepId}`);
    }

    const updatedSteps = [...this.currentState.steps];
    updatedSteps[stepIndex] = {
      ...updatedSteps[stepIndex],
      ...updates
    };

    const newState = {
      ...this.currentState,
      steps: updatedSteps
    };

    this.currentState = newState;
    await this.store.save(newState);
    this.emit('step:updated', { stepId, updates, state: newState });

    return newState;
  }

  /**
   * Subscribe to state changes
   */
  subscribe(
    event: string,
    handler: (data: any) => void
  ): () => void {
    return this.eventBus.on(event, handler);
  }

  /**
   * Get current immutable state
   */
  getState(): Readonly<WorkflowState> {
    // Deep freeze the state to ensure immutability
    return this.deepFreeze(this.currentState);
  }

  /**
   * Load state for replay
   */
  async loadSession(sessionId: string): Promise<WorkflowState> {
    const state = await this.repository.load(sessionId);
    if (!state) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    this.currentState = state;
    this.emit('session:loaded', state);

    return state;
  }


  private initializeSteps(stepDefs: StepDefinition[]): StepState[] {
    return stepDefs.map((step, index) => ({
      id: `${step.name}_${index}`,
      name: step.name,
      index,
      status: StepStatus.Pending,
      startedAt: new Date(),
      input: {},
      transcript: [],
      metadata: {}
    }));
  }

  private emit(event: string, data: any): void {
    this.eventBus.emit(event, data);
  }

  private deepFreeze<T>(obj: T): T {
    Object.freeze(obj);
    
    Object.getOwnPropertyNames(obj).forEach(prop => {
      const value = (obj as any)[prop];
      if (value !== null && (typeof value === 'object' || typeof value === 'function') && !Object.isFrozen(value)) {
        this.deepFreeze(value);
      }
    });
    
    return obj;
  }

  private generateSessionId(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const time = now.toTimeString().slice(0, 8).replace(/:/g, ''); // HHMMSS
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0'); // NNN
    return `${date}_${time}_${random}`;
  }
}