import { describe, it, expect } from '@jest/globals';
import { workflow, createWorkflow } from '../workflow-factory';
import { WorkflowDSLImpl } from '../workflow-dsl-impl';

describe('WorkflowFactory - Extended', () => {
  describe('workflow function', () => {
    it('should create a WorkflowDSL instance', () => {
      const wf = workflow('test-workflow');
      expect(wf).toBeInstanceOf(WorkflowDSLImpl);
    });

    it('should pass the name to the workflow', () => {
      const name = 'my-special-workflow';
      const wf = workflow(name);
      
      // Access internal property to verify
      expect((wf as any).name).toBe(name);
    });

    it('should create unique instances', () => {
      const wf1 = workflow('workflow-1');
      const wf2 = workflow('workflow-2');
      
      expect(wf1).not.toBe(wf2);
    });

    it('should support type parameters', () => {
      interface MyContext {
        userId: string;
        data: string[];
      }
      
      const wf = workflow<MyContext>('typed-workflow');
      expect(wf).toBeInstanceOf(WorkflowDSLImpl);
    });

    it('should handle empty string name', () => {
      const wf = workflow('');
      expect(wf).toBeInstanceOf(WorkflowDSLImpl);
    });

    it('should handle special characters in name', () => {
      const wf = workflow('workflow-with-special-chars!@#$%');
      expect(wf).toBeInstanceOf(WorkflowDSLImpl);
    });
  });

  describe('createWorkflow function', () => {
    it('should be an alias for workflow', () => {
      const wf1 = workflow('test');
      const wf2 = createWorkflow('test');
      
      expect(wf1.constructor).toBe(wf2.constructor);
    });

    it('should create a WorkflowDSL instance', () => {
      const wf = createWorkflow('test-workflow');
      expect(wf).toBeInstanceOf(WorkflowDSLImpl);
    });

    it('should pass the name correctly', () => {
      const name = 'created-workflow';
      const wf = createWorkflow(name);
      
      expect((wf as any).name).toBe(name);
    });

    it('should support type parameters', () => {
      interface CustomContext {
        config: Record<string, any>;
      }
      
      const wf = createWorkflow<CustomContext>('typed-create-workflow');
      expect(wf).toBeInstanceOf(WorkflowDSLImpl);
    });
  });

  describe('Factory pattern usage', () => {
    it('should allow chaining immediately after creation', () => {
      const wf = workflow('chainable')
        .description('Test workflow');
      
      expect(wf).toBeInstanceOf(WorkflowDSLImpl);
    });

    it('should maintain separate state for each instance', () => {
      const wf1 = workflow('workflow-1').description('First workflow');
      const wf2 = workflow('workflow-2').description('Second workflow');
      
      expect((wf1 as any).workflowDescription).toBe('First workflow');
      expect((wf2 as any).workflowDescription).toBe('Second workflow');
    });

    it('should handle multiple workflows with same name', () => {
      const wf1 = workflow('duplicate-name');
      const wf2 = workflow('duplicate-name');
      
      // They should be different instances
      expect(wf1).not.toBe(wf2);
      
      // But have the same name
      expect((wf1 as any).name).toBe((wf2 as any).name);
    });
  });
});