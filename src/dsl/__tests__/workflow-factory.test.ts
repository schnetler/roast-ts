/**
 * Tests for workflow factory functions
 */

import { workflow, createWorkflow } from '../workflow-factory';
import { WorkflowDSL } from '../types';

describe('Workflow Factory', () => {
  describe('workflow()', () => {
    it('should create a new workflow instance', () => {
      const wf = workflow('test-workflow');
      
      expect(wf).toBeDefined();
      expect(wf.build).toBeDefined();
      expect(wf.run).toBeDefined();
    });

    it('should set the workflow name', () => {
      const wf = workflow('my-workflow');
      const built = wf.build();
      
      expect(built.config.name).toBe('my-workflow');
    });

    it('should support type parameters', () => {
      interface MyContext {
        input: string;
      }
      
      const wf = workflow<MyContext>('typed-workflow');
      
      // TypeScript should infer the correct type
      const _typeCheck: WorkflowDSL<MyContext> = wf;
      expect(wf).toBeDefined();
    });
  });

  describe('createWorkflow()', () => {
    it('should be an alias for workflow()', () => {
      const wf1 = workflow('test');
      const wf2 = createWorkflow('test');
      
      expect(wf1.constructor).toBe(wf2.constructor);
    });

    it('should create equivalent workflows', () => {
      const wf1 = workflow('test').model('gpt-4').temperature(0.5);
      const wf2 = createWorkflow('test').model('gpt-4').temperature(0.5);
      
      const built1 = wf1.build();
      const built2 = wf2.build();
      
      expect(built1.config.name).toBe(built2.config.name);
      expect(built1.config.model).toBe(built2.config.model);
      expect(built1.config.temperature).toBe(built2.config.temperature);
    });
  });

  describe('Basic workflow creation', () => {
    it('should create a simple prompt workflow', () => {
      const wf = workflow('simple')
        .prompt('Analyze this data')
        .build();
      
      expect(wf.config.name).toBe('simple');
      expect(wf.steps).toHaveLength(1);
      expect(wf.steps[0].type).toBe('prompt');
    });

    it('should create a workflow with tools', () => {
      const mockTool = {
        description: 'Mock tool',
        parameters: { type: 'object' as const, properties: {} },
        execute: jest.fn()
      };
      
      const wf = workflow('with-tools')
        .tool('myTool', mockTool)
        .build();
      
      expect(wf.config.tools).toBeDefined();
      expect(wf.config.tools!.size).toBe(1);
      expect(wf.config.tools!.get('myTool')).toMatchObject({
        tool: expect.objectContaining({
          description: 'Mock tool'
        }),
        config: {}
      });
    });

    it('should create a workflow with custom steps', () => {
      const wf = workflow('with-steps')
        .step('process', async (ctx) => ({ result: 'processed' }))
        .step('save', async (ctx) => ({ saved: true }))
        .build();
      
      expect(wf.steps).toHaveLength(2);
      expect(wf.steps[0].name).toBe('process');
      expect(wf.steps[1].name).toBe('save');
    });
  });
});