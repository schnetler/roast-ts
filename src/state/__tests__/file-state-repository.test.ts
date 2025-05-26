import { FileStateRepository } from '../file-state-repository';
import { WorkflowStatus, StepStatus } from '../constants';
import {
  WorkflowState,
  SessionFilter,
  SessionSummary
} from '../../shared/types';
import * as fs from 'fs/promises';
import * as path from 'path';

jest.mock('fs/promises');

describe('FileStateRepository', () => {
  let repository: FileStateRepository;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const baseDir = '.roast/sessions';

  const createMockState = (sessionId: string): WorkflowState => ({
    sessionId,
    workflowName: 'test-workflow',
    status: WorkflowStatus.Running,
    startedAt: new Date('2024-01-15T10:30:00Z'),
    context: { test: true },
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
    ],
    metadata: {
      model: 'gpt-4',
      provider: 'openai',
      targetCount: 1,
      parallelExecution: false,
      tags: ['test', 'unit']
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new FileStateRepository(baseDir);
  });

  describe('save', () => {
    it('should save state to correct directory structure', async () => {
      const state = createMockState('20240115_103000_001');

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({ sessions: {} }));

      await repository.save(state);

      // Check directory creation
      const expectedDir = path.join(baseDir, '2024', '01', '20240115_103000_001');
      expect(mockFs.mkdir).toHaveBeenCalledWith(expectedDir, { recursive: true });

      // Check state file save
      const statePath = path.join(expectedDir, 'state.json');
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        `${statePath}.tmp`,
        JSON.stringify(state, null, 2)
      );
      expect(mockFs.rename).toHaveBeenCalledWith(`${statePath}.tmp`, statePath);
    });

    it('should save completed step states individually', async () => {
      const state = createMockState('20240115_103000_001');

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({ sessions: {} }));

      await repository.save(state);

      // Should save completed step
      const stepPath = path.join(
        baseDir,
        '2024',
        '01',
        '20240115_103000_001',
        '000_analyze.json'
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        `${stepPath}.tmp`,
        JSON.stringify(state.steps[0], null, 2)
      );

      // Should not save pending step
      const pendingStepPath = path.join(
        baseDir,
        '2024',
        '01',
        '20240115_103000_001',
        '001_transform.json'
      );
      expect(mockFs.writeFile).not.toHaveBeenCalledWith(
        `${pendingStepPath}.tmp`,
        expect.any(String)
      );
    });

    it('should update session index', async () => {
      const state = createMockState('20240115_103000_001');

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({ sessions: {} }));

      await repository.save(state);

      const indexPath = path.join(baseDir, 'index.json');
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        `${indexPath}.tmp`,
        JSON.stringify({
          sessions: {
            '20240115_103000_001': {
              sessionId: '20240115_103000_001',
              workflowName: 'test-workflow',
              startedAt: state.startedAt,
              status: WorkflowStatus.Running,
              stepCount: 2,
              completedSteps: 1,
              tags: ['test', 'unit']
            }
          }
        }, null, 2)
      );
    });

    it('should handle atomic writes correctly', async () => {
      const state = createMockState('20240115_103000_001');

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({ sessions: {} }));

      await repository.save(state);

      // All writes should use temp file + rename pattern
      const writeFileCalls = mockFs.writeFile.mock.calls;
      const renameCalls = mockFs.rename.mock.calls;

      writeFileCalls.forEach((call, index) => {
        const tempPath = call[0] as string;
        expect(tempPath).toMatch(/\.tmp$/);
        
        const finalPath = tempPath.replace('.tmp', '');
        expect(renameCalls[index]).toEqual([tempPath, finalPath]);
      });
    });
  });

  describe('load', () => {
    it('should load state from file', async () => {
      const sessionId = '20240115_103000_001';
      const state = createMockState(sessionId);

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(state));

      const loaded = await repository.load(sessionId);

      const expectedPath = path.join(
        baseDir,
        '2024',
        '01',
        sessionId,
        'state.json'
      );
      expect(mockFs.readFile).toHaveBeenCalledWith(expectedPath, 'utf-8');
      expect(loaded).toEqual(state);
    });

    it('should return null if file not found', async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValueOnce(error);

      const loaded = await repository.load('non-existent');

      expect(loaded).toBeNull();
    });

    it('should throw other errors', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(repository.load('session-123')).rejects.toThrow('Permission denied');
    });
  });

  describe('loadHistory', () => {
    it('should load all historical states', async () => {
      const sessionId = '20240115_103000_001';
      const historyDir = path.join(baseDir, '2024', '01', sessionId, 'history');

      mockFs.readdir.mockResolvedValueOnce(['001.json', '002.json', '003.json'] as any);
      
      const states = [
        { ...createMockState(sessionId), context: { version: 1 } },
        { ...createMockState(sessionId), context: { version: 2 } },
        { ...createMockState(sessionId), context: { version: 3 } }
      ];

      states.forEach((state, index) => {
        mockFs.readFile.mockResolvedValueOnce(JSON.stringify(state));
      });

      const history = await repository.loadHistory(sessionId);

      expect(mockFs.readdir).toHaveBeenCalledWith(historyDir);
      expect(history).toHaveLength(3);
      expect(history[0].context.version).toBe(1);
      expect(history[2].context.version).toBe(3);
    });

    it('should return empty array if no history', async () => {
      mockFs.readdir.mockRejectedValueOnce(new Error('ENOENT'));

      const history = await repository.loadHistory('session-123');

      expect(history).toEqual([]);
    });

    it('should sort history files correctly', async () => {
      const sessionId = '20240115_103000_001';
      const historyDir = path.join(baseDir, '2024', '01', sessionId, 'history');

      // Files returned in non-sorted order
      mockFs.readdir.mockResolvedValueOnce(['003.json', '001.json', '002.json'] as any);
      
      const states = [
        { ...createMockState(sessionId), context: { version: 3 } },
        { ...createMockState(sessionId), context: { version: 1 } },
        { ...createMockState(sessionId), context: { version: 2 } }
      ];

      // Mock reads in the order after sorting
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(states[1])) // 001.json
        .mockResolvedValueOnce(JSON.stringify(states[2])) // 002.json
        .mockResolvedValueOnce(JSON.stringify(states[0])); // 003.json

      const history = await repository.loadHistory(sessionId);

      expect(history[0].context.version).toBe(1);
      expect(history[1].context.version).toBe(2);
      expect(history[2].context.version).toBe(3);
    });
  });

  describe('saveSnapshot', () => {
    it('should save snapshot with timestamp', async () => {
      const state = createMockState('20240115_103000_001');
      const mockNow = 1705316400000; // 2024-01-15 11:00:00
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);

      await repository.saveSnapshot(state);

      const expectedPath = path.join(
        baseDir,
        '2024',
        '01',
        '20240115_103000_001',
        'snapshots',
        `${mockNow}.json`
      );

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.dirname(expectedPath),
        { recursive: true }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        `${expectedPath}.tmp`,
        JSON.stringify(state, null, 2)
      );
    });
  });

  describe('listSessions', () => {
    it('should list all sessions from index', async () => {
      const index = {
        sessions: {
          'session1': {
            sessionId: 'session1',
            workflowName: 'workflow1',
            startedAt: new Date('2024-01-15'),
            status: WorkflowStatus.Completed,
            stepCount: 3,
            completedSteps: 3,
            tags: ['prod']
          },
          'session2': {
            sessionId: 'session2',
            workflowName: 'workflow2',
            startedAt: new Date('2024-01-14'),
            status: WorkflowStatus.Failed,
            stepCount: 2,
            completedSteps: 1,
            tags: ['test']
          }
        }
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

      const sessions = await repository.listSessions();

      expect(sessions).toHaveLength(2);
      // Should be sorted by date descending
      expect(sessions[0].sessionId).toBe('session1');
      expect(sessions[1].sessionId).toBe('session2');
    });

    it('should filter by workflow name', async () => {
      const index = {
        sessions: {
          'session1': {
            sessionId: 'session1',
            workflowName: 'workflow1',
            startedAt: new Date(),
            status: WorkflowStatus.Completed,
            stepCount: 1,
            completedSteps: 1
          },
          'session2': {
            sessionId: 'session2',
            workflowName: 'workflow2',
            startedAt: new Date(),
            status: WorkflowStatus.Completed,
            stepCount: 1,
            completedSteps: 1
          }
        }
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

      const filter: SessionFilter = { workflowName: 'workflow1' };
      const sessions = await repository.listSessions(filter);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].workflowName).toBe('workflow1');
    });

    it('should filter by status', async () => {
      const index = {
        sessions: {
          'session1': {
            sessionId: 'session1',
            workflowName: 'workflow1',
            startedAt: new Date(),
            status: WorkflowStatus.Completed,
            stepCount: 1,
            completedSteps: 1
          },
          'session2': {
            sessionId: 'session2',
            workflowName: 'workflow2',
            startedAt: new Date(),
            status: WorkflowStatus.Failed,
            stepCount: 1,
            completedSteps: 0
          }
        }
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

      const filter: SessionFilter = { status: WorkflowStatus.Failed };
      const sessions = await repository.listSessions(filter);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].status).toBe(WorkflowStatus.Failed);
    });

    it('should filter by date', async () => {
      const index = {
        sessions: {
          'session1': {
            sessionId: 'session1',
            workflowName: 'workflow1',
            startedAt: new Date('2024-01-15'),
            status: WorkflowStatus.Completed,
            stepCount: 1,
            completedSteps: 1
          },
          'session2': {
            sessionId: 'session2',
            workflowName: 'workflow2',
            startedAt: new Date('2024-01-10'),
            status: WorkflowStatus.Completed,
            stepCount: 1,
            completedSteps: 1
          }
        }
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

      const filter: SessionFilter = { startedAfter: new Date('2024-01-12') };
      const sessions = await repository.listSessions(filter);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe('session1');
    });

    it('should filter by tags', async () => {
      const index = {
        sessions: {
          'session1': {
            sessionId: 'session1',
            workflowName: 'workflow1',
            startedAt: new Date(),
            status: WorkflowStatus.Completed,
            stepCount: 1,
            completedSteps: 1,
            tags: ['prod', 'critical']
          },
          'session2': {
            sessionId: 'session2',
            workflowName: 'workflow2',
            startedAt: new Date(),
            status: WorkflowStatus.Completed,
            stepCount: 1,
            completedSteps: 1,
            tags: ['test']
          }
        }
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

      const filter: SessionFilter = { tags: ['prod'] };
      const sessions = await repository.listSessions(filter);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].tags).toContain('prod');
    });

    it('should return empty array if index not found', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));

      const sessions = await repository.listSessions();

      expect(sessions).toEqual([]);
    });
  });

  describe('getSessionDir', () => {
    it('should extract date parts correctly', async () => {
      const sessionId = '20240115_103000_001';
      const expectedDir = path.join(baseDir, '2024', '01', sessionId);

      // Access private method through save
      const state = createMockState(sessionId);
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({ sessions: {} }));

      await repository.save(state);

      expect(mockFs.mkdir).toHaveBeenCalledWith(expectedDir, { recursive: true });
    });
  });
});