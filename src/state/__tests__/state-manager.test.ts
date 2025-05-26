import { StateManager } from '../state-manager';
import { FileStateRepository } from '../file-state-repository';
import { EventBus } from '../event-bus';
import { StateStore } from '../state-store';
import { WorkflowStatus, StepStatus } from '../constants';
import {
  WorkflowState,
  WorkflowConfig,
  SessionOptions,
  StepState,
  WorkflowMetadata
} from '../../shared/types';
import * as fs from 'fs/promises';
import * as path from 'path';

jest.mock('fs/promises');
jest.mock('../event-bus');
jest.mock('../state-store');

describe('StateManager', () => {
  let stateManager: StateManager;
  let mockRepository: jest.Mocked<FileStateRepository>;
  let mockEventBus: jest.Mocked<EventBus>;
  let mockStore: jest.Mocked<StateStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRepository = {
      save: jest.fn(),
      load: jest.fn(),
      loadHistory: jest.fn(),
      saveSnapshot: jest.fn(),
      listSessions: jest.fn()
    } as any;

    stateManager = new StateManager(mockRepository);
    
    // Access private members for mocking
    mockEventBus = (stateManager as any).eventBus;
    mockStore = (stateManager as any).store;
  });

  describe('initializeSession', () => {
    it('should create a new workflow session', async () => {
      const workflow: WorkflowConfig = {
        name: 'test-workflow',
        model: 'gpt-4',
        provider: 'openai',
        steps: [
          { name: 'analyze', type: 'prompt', template: 'Analyze' },
          { name: 'transform', type: 'prompt', template: 'Transform' }
        ]
      };

      const options: SessionOptions = {
        targetCount: 5,
        tags: ['test', 'unit']
      };

      mockStore.save.mockResolvedValueOnce(undefined);

      const state = await stateManager.initializeSession(workflow, options);

      expect(state.workflowName).toBe('test-workflow');
      expect(state.status).toBe(WorkflowStatus.Pending);
      expect(state.metadata.model).toBe('gpt-4');
      expect(state.metadata.targetCount).toBe(5);
      expect(state.metadata.tags).toEqual(['test', 'unit']);
      expect(state.steps).toHaveLength(2);
      expect(state.steps[0].name).toBe('analyze');
      expect(state.steps[0].status).toBe(StepStatus.Pending);
      
      expect(mockStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowName: 'test-workflow',
          status: WorkflowStatus.Pending
        })
      );
      
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'session:initialized',
        expect.any(Object)
      );
    });

    it('should use provided sessionId', async () => {
      const workflow: WorkflowConfig = {
        name: 'test-workflow',
        model: 'gpt-4',
        provider: 'openai',
        steps: []
      };

      const options: SessionOptions = {
        sessionId: 'custom-session-123'
      };

      const state = await stateManager.initializeSession(workflow, options);

      expect(state.sessionId).toBe('custom-session-123');
    });

    it('should generate sessionId if not provided', async () => {
      const workflow: WorkflowConfig = {
        name: 'test-workflow',
        model: 'gpt-4',
        provider: 'openai',
        steps: []
      };

      const state = await stateManager.initializeSession(workflow, {});

      // SessionId should match format: YYYYMMDD_HHMMSS_NNN
      expect(state.sessionId).toMatch(/^\d{8}_\d{6}_\d{3}$/);
    });
  });

  describe('updateWorkflow', () => {
    it('should update workflow state immutably', async () => {
      // Initialize state first
      const workflow: WorkflowConfig = {
        name: 'test-workflow',
        model: 'gpt-4',
        provider: 'openai',
        steps: []
      };

      const initialState = await stateManager.initializeSession(workflow, {});
      const originalState = { ...initialState };

      // Update state
      const updates = {
        status: WorkflowStatus.Running,
        context: { foo: 'bar' }
      };

      const newState = await stateManager.updateWorkflow(updates);

      // Check immutability
      expect(initialState).toEqual(originalState);
      expect(newState).not.toBe(initialState);
      
      // Check updates
      expect(newState.status).toBe(WorkflowStatus.Running);
      expect(newState.context).toEqual({ foo: 'bar' });
      expect(newState.sessionId).toBe(initialState.sessionId);
      
      expect(mockStore.save).toHaveBeenCalledWith(newState);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'workflow:updated',
        newState
      );
    });

    it('should merge metadata updates', async () => {
      const workflow: WorkflowConfig = {
        name: 'test-workflow',
        model: 'gpt-4',
        provider: 'openai',
        steps: []
      };

      await stateManager.initializeSession(workflow, {
        tags: ['initial']
      });

      const currentState = stateManager.getState();
      const newState = await stateManager.updateWorkflow({
        metadata: { ...currentState.metadata, tags: ['initial', 'updated'] } as WorkflowMetadata
      });

      expect(newState.metadata.tags).toEqual(['initial', 'updated']);
      expect(newState.metadata.model).toBe('gpt-4'); // Preserved
    });
  });

  describe('updateStep', () => {
    let initialState: WorkflowState;

    beforeEach(async () => {
      const workflow: WorkflowConfig = {
        name: 'test-workflow',
        model: 'gpt-4',
        provider: 'openai',
        steps: [
          { name: 'step1', type: 'prompt', template: 'Step 1' },
          { name: 'step2', type: 'prompt', template: 'Step 2' }
        ]
      };

      initialState = await stateManager.initializeSession(workflow, {});
    });

    it('should update step state immutably', async () => {
      const stepId = initialState.steps[0].id;
      const updates: Partial<StepState> = {
        status: StepStatus.Running,
        output: { result: 'test' }
      };

      const newState = await stateManager.updateStep(stepId, updates);

      // Check immutability
      expect(newState.steps).not.toBe(initialState.steps);
      expect(newState.steps[0]).not.toBe(initialState.steps[0]);
      expect(newState.steps[1]).toBe(initialState.steps[1]); // Unchanged
      
      // Check updates
      expect(newState.steps[0].status).toBe(StepStatus.Running);
      expect(newState.steps[0].output).toEqual({ result: 'test' });
      
      expect(mockStore.save).toHaveBeenCalledWith(newState);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'step:updated',
        expect.objectContaining({
          stepId,
          updates,
          state: newState
        })
      );
    });

    it('should throw error if step not found', async () => {
      await expect(
        stateManager.updateStep('invalid-step-id', {})
      ).rejects.toThrow('Step not found: invalid-step-id');
    });
  });

  describe('subscribe', () => {
    it('should subscribe to state changes', async () => {
      const handler = jest.fn();
      const unsubscribe = jest.fn();
      
      mockEventBus.on.mockReturnValueOnce(unsubscribe);

      const result = stateManager.subscribe('workflow:updated', handler);

      expect(mockEventBus.on).toHaveBeenCalledWith('workflow:updated', handler);
      expect(result).toBe(unsubscribe);
    });
  });

  describe('getState', () => {
    it('should return current immutable state', async () => {
      const workflow: WorkflowConfig = {
        name: 'test-workflow',
        model: 'gpt-4',
        provider: 'openai',
        steps: []
      };

      const initialState = await stateManager.initializeSession(workflow, {});
      const currentState = stateManager.getState();

      expect(currentState).toEqual(initialState);
      
      // Verify it's readonly
      expect(() => {
        (currentState as any).status = WorkflowStatus.Failed;
      }).toThrow();
    });
  });

  describe('loadSession', () => {
    it('should load existing session', async () => {
      const savedState: WorkflowState = {
        sessionId: 'saved-session-123',
        workflowName: 'saved-workflow',
        status: WorkflowStatus.Completed,
        startedAt: new Date('2024-01-01'),
        completedAt: new Date('2024-01-02'),
        context: { result: 'done' },
        steps: [],
        metadata: {
          model: 'gpt-4',
          provider: 'openai',
          targetCount: 1,
          parallelExecution: false
        }
      };

      mockRepository.load.mockResolvedValueOnce(savedState);

      const loadedState = await stateManager.loadSession('saved-session-123');

      expect(loadedState).toEqual(savedState);
      expect(mockRepository.load).toHaveBeenCalledWith('saved-session-123');
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'session:loaded',
        savedState
      );
    });

    it('should throw error if session not found', async () => {
      mockRepository.load.mockResolvedValueOnce(null);

      await expect(
        stateManager.loadSession('non-existent')
      ).rejects.toThrow('Session not found: non-existent');
    });
  });

  describe('saveStep', () => {
    it('should save step execution result', async () => {
      const workflow: WorkflowConfig = {
        name: 'test-workflow',
        model: 'gpt-4',
        provider: 'openai',
        steps: [{ name: 'analyze', type: 'prompt', template: 'Analyze' }]
      };

      await stateManager.initializeSession(workflow, {});

      const result = { analysis: 'complete' };
      const context = { input: 'test' };

      await stateManager.saveStep('analyze', result, context);

      const state = stateManager.getState();
      const step = state.steps.find(s => s.name === 'analyze');
      
      expect(step?.status).toBe(StepStatus.Completed);
      expect(step?.output).toEqual(result);
      expect(step?.completedAt).toBeDefined();
    });
  });

  describe('createSession', () => {
    it('should create a new session directory', async () => {
      const sessionId = await stateManager.createSession('test-workflow');

      expect(sessionId).toMatch(/^\d{8}_\d{6}_\d{3}$/);
      
      // Should initialize an empty session
      const state = stateManager.getState();
      expect(state.sessionId).toBe(sessionId);
      expect(state.workflowName).toBe('test-workflow');
    });
  });

  describe('generateSessionId', () => {
    it('should generate unique session IDs', async () => {
      const workflow: WorkflowConfig = {
        name: 'test-workflow',
        model: 'gpt-4',
        provider: 'openai',
        steps: []
      };

      const state1 = await stateManager.initializeSession(workflow, {});
      const state2 = await stateManager.initializeSession(workflow, {});

      expect(state1.sessionId).not.toBe(state2.sessionId);
    });

    it('should generate session ID with correct format', async () => {
      const workflow: WorkflowConfig = {
        name: 'test-workflow',
        model: 'gpt-4',
        provider: 'openai',
        steps: []
      };

      const state = await stateManager.initializeSession(workflow, {});

      // Format: YYYYMMDD_HHMMSS_NNN
      const parts = state.sessionId.split('_');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toMatch(/^\d{8}$/); // Date
      expect(parts[1]).toMatch(/^\d{6}$/); // Time
      expect(parts[2]).toMatch(/^\d{3}$/); // Random
    });
  });
});