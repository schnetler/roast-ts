import { describe, it, expect } from '@jest/globals';
import { WorkflowStatus, StepStatus } from '../constants';

describe('State Constants', () => {
  describe('WorkflowStatus', () => {
    it('should have correct enum values', () => {
      expect(WorkflowStatus.Pending).toBe('pending');
      expect(WorkflowStatus.Running).toBe('running');
      expect(WorkflowStatus.Completed).toBe('completed');
      expect(WorkflowStatus.Failed).toBe('failed');
      expect(WorkflowStatus.Cancelled).toBe('cancelled');
    });

    it('should be usable as type', () => {
      const status: WorkflowStatus = WorkflowStatus.Running;
      expect(status).toBe('running');
    });

    it('should have all expected keys', () => {
      const keys = Object.keys(WorkflowStatus);
      expect(keys).toContain('Pending');
      expect(keys).toContain('Running');
      expect(keys).toContain('Completed');
      expect(keys).toContain('Failed');
      expect(keys).toContain('Cancelled');
    });
  });

  describe('StepStatus', () => {
    it('should have correct enum values', () => {
      expect(StepStatus.Pending).toBe('pending');
      expect(StepStatus.Running).toBe('running');
      expect(StepStatus.Completed).toBe('completed');
      expect(StepStatus.Failed).toBe('failed');
      expect(StepStatus.Skipped).toBe('skipped');
    });

    it('should be usable as type', () => {
      const status: StepStatus = StepStatus.Skipped;
      expect(status).toBe('skipped');
    });

    it('should have all expected keys', () => {
      const keys = Object.keys(StepStatus);
      expect(keys).toContain('Pending');
      expect(keys).toContain('Running');
      expect(keys).toContain('Completed');
      expect(keys).toContain('Failed');
      expect(keys).toContain('Skipped');
    });
  });

  describe('Enum usage', () => {
    it('should allow reverse mapping for string enums', () => {
      // String enums don't have reverse mapping by default
      const statusValue = 'running';
      expect(Object.values(WorkflowStatus).includes(statusValue as WorkflowStatus)).toBe(true);
      expect(Object.values(StepStatus).includes(statusValue as StepStatus)).toBe(true);
    });

    it('should be useful in switch statements', () => {
      const getWorkflowMessage = (status: WorkflowStatus): string => {
        switch (status) {
          case WorkflowStatus.Pending:
            return 'Waiting to start';
          case WorkflowStatus.Running:
            return 'In progress';
          case WorkflowStatus.Completed:
            return 'Done';
          case WorkflowStatus.Failed:
            return 'Error occurred';
          case WorkflowStatus.Cancelled:
            return 'Cancelled by user';
          default:
            return 'Unknown status';
        }
      };

      expect(getWorkflowMessage(WorkflowStatus.Running)).toBe('In progress');
      expect(getWorkflowMessage(WorkflowStatus.Failed)).toBe('Error occurred');
    });
  });
});