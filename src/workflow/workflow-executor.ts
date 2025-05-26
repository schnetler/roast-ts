import { WorkflowConfig, WorkflowContext } from '../shared/types';

// Stub implementation for resources tests
export class WorkflowExecutor {
  async execute(workflow: WorkflowConfig, context: WorkflowContext): Promise<any> {
    // Stub implementation
    return { success: true };
  }
}