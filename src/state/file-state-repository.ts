import * as fs from 'fs/promises';
import * as path from 'path';
import { StepStatus } from './constants';
import {
  WorkflowState,
  StateRepository,
  SessionFilter,
  SessionSummary,
  SessionIndex
} from '../shared/types';

export class FileStateRepository implements StateRepository {
  constructor(
    private baseDir: string = '.roast/sessions'
  ) {}

  async save(state: WorkflowState): Promise<void> {
    const dir = this.getSessionDir(state.sessionId);
    await fs.mkdir(dir, { recursive: true });

    // Save current state
    const statePath = path.join(dir, 'state.json');
    await this.atomicWrite(statePath, JSON.stringify(state, null, 2));

    // Save step state
    for (const step of state.steps) {
      if (step.status !== StepStatus.Pending) {
        const stepPath = path.join(dir, `${step.index.toString().padStart(3, '0')}_${step.name}.json`);
        await this.atomicWrite(stepPath, JSON.stringify(step, null, 2));
      }
    }

    // Update index
    await this.updateIndex(state);
  }

  async load(sessionId: string): Promise<WorkflowState | null> {
    const statePath = path.join(this.getSessionDir(sessionId), 'state.json');
    
    try {
      const content = await fs.readFile(statePath, 'utf-8');
      return this.parseWithDates(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async loadHistory(sessionId: string): Promise<WorkflowState[]> {
    const dir = this.getSessionDir(sessionId);
    const historyDir = path.join(dir, 'history');
    
    try {
      const files = await fs.readdir(historyDir);
      const states: WorkflowState[] = [];

      for (const file of files.sort()) {
        const content = await fs.readFile(path.join(historyDir, file), 'utf-8');
        states.push(this.parseWithDates(content));
      }

      return states;
    } catch {
      return [];
    }
  }

  async saveSnapshot(state: WorkflowState): Promise<void> {
    const snapshotPath = path.join(
      this.getSessionDir(state.sessionId),
      'snapshots',
      `${Date.now()}.json`
    );

    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    await this.atomicWrite(snapshotPath, JSON.stringify(state, null, 2));
  }

  async listSessions(
    filter?: SessionFilter
  ): Promise<SessionSummary[]> {
    const indexPath = path.join(this.baseDir, 'index.json');
    
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const index: SessionIndex = this.parseWithDates(content);
      
      let sessions = Object.values(index.sessions);

      // Apply filters
      if (filter) {
        if (filter.workflowName) {
          sessions = sessions.filter(s => s.workflowName === filter.workflowName);
        }
        if (filter.status) {
          sessions = sessions.filter(s => s.status === filter.status);
        }
        if (filter.startedAfter) {
          sessions = sessions.filter(s => new Date(s.startedAt) >= filter.startedAfter!);
        }
        if (filter.tags) {
          sessions = sessions.filter(s => 
            filter.tags!.every(tag => s.tags?.includes(tag))
          );
        }
      }

      // Sort by date descending
      sessions.sort((a, b) => 
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      );

      return sessions;
    } catch {
      return [];
    }
  }

  private getSessionDir(sessionId: string): string {
    const [datePart] = sessionId.split('_');
    const year = datePart.substring(0, 4);
    const month = datePart.substring(4, 6);
    
    return path.join(this.baseDir, year, month, sessionId);
  }

  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, content);
    await fs.rename(tempPath, filePath);
  }

  private async updateIndex(state: WorkflowState): Promise<void> {
    const indexPath = path.join(this.baseDir, 'index.json');
    let index: SessionIndex;

    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      index = JSON.parse(content);
    } catch {
      index = { sessions: {} };
    }

    index.sessions[state.sessionId] = {
      sessionId: state.sessionId,
      workflowName: state.workflowName,
      startedAt: state.startedAt,
      status: state.status,
      stepCount: state.steps.length,
      completedSteps: state.steps.filter(s => s.status === StepStatus.Completed).length,
      tags: state.metadata.tags
    };

    await this.atomicWrite(indexPath, JSON.stringify(index, null, 2));
  }

  private parseWithDates(json: string): any {
    return JSON.parse(json, (key, value) => {
      // Convert ISO date strings back to Date objects
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return new Date(value);
      }
      return value;
    });
  }
}