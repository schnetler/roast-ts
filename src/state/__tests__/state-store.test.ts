import { StateStore } from '../state-store';
import { FileStateRepository } from '../file-state-repository';
import { WorkflowStatus, StepStatus } from '../constants';
import {
  WorkflowState,
  StateEvent,
  StateStoreConfig
} from '../../shared/types';

jest.mock('../file-state-repository');

describe('StateStore', () => {
  let stateStore: StateStore;
  let mockRepository: jest.Mocked<FileStateRepository>;

  const createMockState = (sessionId: string): WorkflowState => ({
    sessionId,
    workflowName: 'test-workflow',
    status: WorkflowStatus.Running,
    startedAt: new Date(),
    context: {},
    steps: [
      {
        id: 'step1',
        name: 'analyze',
        index: 0,
        status: StepStatus.Completed,
        startedAt: new Date(),
        completedAt: new Date(),
        input: {},
        output: { result: 'done' },
        transcript: [],
        metadata: {}
      }
    ],
    metadata: {
      model: 'gpt-4',
      provider: 'openai',
      targetCount: 1,
      parallelExecution: false
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRepository = new FileStateRepository() as jest.Mocked<FileStateRepository>;
    mockRepository.save = jest.fn();
    mockRepository.load = jest.fn();
    mockRepository.loadHistory = jest.fn();
    mockRepository.saveSnapshot = jest.fn();
    mockRepository.listSessions = jest.fn();
  });

  describe('save', () => {
    it('should save state to repository', async () => {
      stateStore = new StateStore(mockRepository);
      const state = createMockState('session-123');

      await stateStore.save(state);

      expect(mockRepository.save).toHaveBeenCalledWith(state);
    });

    it('should record state event', async () => {
      stateStore = new StateStore(mockRepository);
      const state = createMockState('session-123');

      await stateStore.save(state);

      const events = (stateStore as any).events;
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'state:updated',
        sessionId: 'session-123',
        data: state
      });
    });

    it('should create snapshot at interval', async () => {
      const config: StateStoreConfig = {
        snapshotInterval: 3,
        compactionThreshold: 100
      };
      stateStore = new StateStore(mockRepository, config);

      // Save states
      for (let i = 1; i <= 4; i++) {
        await stateStore.save(createMockState(`session-${i}`));
      }

      // Should create snapshot on the 3rd save
      expect(mockRepository.saveSnapshot).toHaveBeenCalledTimes(1);
      expect(mockRepository.saveSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-3' })
      );
    });

    it('should trigger compaction at threshold', async () => {
      const config: StateStoreConfig = {
        snapshotInterval: 10,
        compactionThreshold: 3
      };
      stateStore = new StateStore(mockRepository, config);

      // Save states to trigger compaction
      for (let i = 1; i <= 4; i++) {
        await stateStore.save(createMockState('session-123'));
      }

      // Should create snapshot during compaction
      expect(mockRepository.saveSnapshot).toHaveBeenCalled();
      
      // Events should be compacted
      const events = (stateStore as any).events;
      expect(events.length).toBeLessThanOrEqual(1);
    });
  });

  describe('load', () => {
    it('should load from snapshot if available', async () => {
      stateStore = new StateStore(mockRepository);
      const state = createMockState('session-123');
      
      // Add to snapshots
      (stateStore as any).snapshots.set('session-123', state);

      const loaded = await stateStore.load('session-123');

      expect(loaded).toBe(state);
      expect(mockRepository.load).not.toHaveBeenCalled();
    });

    it('should load from repository if no snapshot', async () => {
      stateStore = new StateStore(mockRepository);
      const state = createMockState('session-123');
      
      mockRepository.load.mockResolvedValueOnce(state);

      const loaded = await stateStore.load('session-123');

      expect(loaded).toBe(state);
      expect(mockRepository.load).toHaveBeenCalledWith('session-123');
    });

    it('should return null if not found', async () => {
      stateStore = new StateStore(mockRepository);
      
      mockRepository.load.mockResolvedValueOnce(null);

      const loaded = await stateStore.load('non-existent');

      expect(loaded).toBeNull();
    });
  });

  describe('replay', () => {
    it('should replay to specific step', async () => {
      stateStore = new StateStore(mockRepository);
      
      const states: WorkflowState[] = [
        {
          ...createMockState('session-123'),
          steps: [
            {
              id: 'step1',
              name: 'analyze',
              index: 0,
              status: StepStatus.Completed,
              startedAt: new Date(),
              completedAt: new Date(),
              input: {},
              output: { result: 'analyzed' },
              transcript: [],
              metadata: {}
            },
            {
              id: 'step2',
              name: 'transform',
              index: 1,
              status: StepStatus.Pending,
              startedAt: new Date(),
              input: {},
              transcript: [],
              metadata: {}
            }
          ]
        },
        {
          ...createMockState('session-123'),
          steps: [
            {
              id: 'step1',
              name: 'analyze',
              index: 0,
              status: StepStatus.Completed,
              startedAt: new Date(),
              completedAt: new Date(),
              input: {},
              output: { result: 'analyzed' },
              transcript: [],
              metadata: {}
            },
            {
              id: 'step2',
              name: 'transform',
              index: 1,
              status: StepStatus.Completed,
              startedAt: new Date(),
              completedAt: new Date(),
              input: {},
              output: { result: 'transformed' },
              transcript: [],
              metadata: {}
            }
          ]
        }
      ];

      mockRepository.loadHistory.mockResolvedValueOnce(states);

      const replayState = await stateStore.replay('session-123', 'analyze');

      expect(replayState).toBe(states[0]);
      expect(mockRepository.loadHistory).toHaveBeenCalledWith('session-123');
    });

    it('should replay to latest if no step specified', async () => {
      stateStore = new StateStore(mockRepository);
      
      const states = [
        createMockState('session-123'),
        { ...createMockState('session-123'), context: { updated: true } }
      ];

      mockRepository.loadHistory.mockResolvedValueOnce(states);

      const replayState = await stateStore.replay('session-123');

      expect(replayState).toBe(states[1]);
    });

    it('should throw error if no history found', async () => {
      stateStore = new StateStore(mockRepository);
      
      mockRepository.loadHistory.mockResolvedValueOnce([]);

      await expect(
        stateStore.replay('session-123')
      ).rejects.toThrow('No history found for session: session-123');
    });

    it('should throw error if step not found', async () => {
      stateStore = new StateStore(mockRepository);
      
      const states = [createMockState('session-123')];
      mockRepository.loadHistory.mockResolvedValueOnce(states);

      await expect(
        stateStore.replay('session-123', 'non-existent-step')
      ).rejects.toThrow('Step not found in history: non-existent-step');
    });
  });

  describe('snapshots', () => {
    it('should create and store snapshots', async () => {
      const config: StateStoreConfig = {
        snapshotInterval: 1
      };
      stateStore = new StateStore(mockRepository, config);
      
      const state = createMockState('session-123');

      await stateStore.save(state);

      expect((stateStore as any).snapshots.has('session-123')).toBe(true);
      expect(mockRepository.saveSnapshot).toHaveBeenCalledWith(state);
    });

    it('should respect snapshot interval', async () => {
      const config: StateStoreConfig = {
        snapshotInterval: 5
      };
      stateStore = new StateStore(mockRepository, config);

      for (let i = 1; i <= 10; i++) {
        await stateStore.save(createMockState(`session-${i}`));
      }

      // Should create snapshots at 5th and 10th saves
      expect(mockRepository.saveSnapshot).toHaveBeenCalledTimes(2);
    });
  });

  describe('compaction', () => {
    it('should compact events by session', async () => {
      const config: StateStoreConfig = {
        snapshotInterval: 10,
        compactionThreshold: 5
      };
      stateStore = new StateStore(mockRepository, config);

      // Save multiple events for same session
      for (let i = 1; i <= 6; i++) {
        const state = createMockState('session-123');
        state.context = { iteration: i };
        await stateStore.save(state);
      }

      // After compaction, should only keep latest event
      const events = (stateStore as any).events;
      const sessionEvents = events.filter((e: StateEvent) => e.sessionId === 'session-123');
      expect(sessionEvents).toHaveLength(1);
      expect(sessionEvents[0].data.context.iteration).toBe(6);
    });

    it('should not compact sessions below threshold', async () => {
      const config: StateStoreConfig = {
        snapshotInterval: 10,
        compactionThreshold: 10
      };
      stateStore = new StateStore(mockRepository, config);

      // Save events for different sessions
      for (let i = 1; i <= 5; i++) {
        await stateStore.save(createMockState(`session-${i}`));
      }

      // Save more events for one session to trigger compaction
      for (let i = 1; i <= 6; i++) {
        await stateStore.save(createMockState('session-compact'));
      }

      const events = (stateStore as any).events;
      
      // Non-compacted sessions should have all events
      const session1Events = events.filter((e: StateEvent) => e.sessionId === 'session-1');
      expect(session1Events).toHaveLength(1);
      
      // Compacted session should have fewer events
      const compactEvents = events.filter((e: StateEvent) => e.sessionId === 'session-compact');
      expect(compactEvents.length).toBeLessThanOrEqual(6);
    });
  });

  describe('event management', () => {
    it('should assign unique IDs to events', async () => {
      stateStore = new StateStore(mockRepository);

      await stateStore.save(createMockState('session-1'));
      await stateStore.save(createMockState('session-2'));

      const events = (stateStore as any).events;
      expect(events[0].id).toBeDefined();
      expect(events[1].id).toBeDefined();
      expect(events[0].id).not.toBe(events[1].id);
    });

    it('should timestamp events', async () => {
      stateStore = new StateStore(mockRepository);
      
      const before = new Date();
      await stateStore.save(createMockState('session-123'));
      const after = new Date();

      const events = (stateStore as any).events;
      const eventTime = new Date(events[0].timestamp);
      
      expect(eventTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(eventTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});