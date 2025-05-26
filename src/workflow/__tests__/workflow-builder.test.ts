import { createWorkflow } from '../workflow-builder';
import { ToolRegistry } from '../../tools/tool-registry';
import { StateManager } from '../../state/state-manager';
import { WorkflowEngine } from '../workflow-engine';

// Mock dependencies
jest.mock('../../tools/tool-registry');
jest.mock('../../state/state-manager');
jest.mock('../../state/file-state-repository');
jest.mock('../workflow-engine');

describe('WorkflowBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createWorkflow', () => {
    it('should create a new workflow builder with given name', () => {
      const workflow = createWorkflow('test-workflow');
      expect(workflow).toBeDefined();
      expect(workflow.name).toBe('test-workflow');
    });

    it('should have empty configuration initially', () => {
      const workflow = createWorkflow('test');
      const config = workflow.buildConfig();
      expect(config.name).toBe('test');
      expect(config.steps).toEqual([]);
      expect(config.tools).toEqual(new Map());
    });
  });

  describe('tool registration', () => {
    it('should register tools with fluent API', () => {
      const testTool = {
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn()
      };

      const workflow = createWorkflow('test')
        .tool('readFile', testTool);

      const config = workflow.buildConfig();
      expect(config.tools).toBeDefined();
      expect(config.tools!.has('readFile')).toBe(true);
      expect(config.tools!.get('readFile')?.tool).toBe(testTool);
    });

    it('should support tool configuration', () => {
      const testTool = {
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn()
      };

      const toolConfig = { maxRetries: 3 };
      const workflow = createWorkflow('test')
        .tool('readFile', testTool, toolConfig);

      const config = workflow.buildConfig();
      expect(config.tools).toBeDefined();
      expect(config.tools!.get('readFile')?.config).toEqual(toolConfig);
    });

    it('should maintain type safety with tool registration', () => {
      const readFileTool = {
        schema: { 
          type: 'object' as const, 
          properties: { path: { type: 'string' } },
          required: ['path']
        },
        handler: async (params: { path: string }) => 'file content'
      };

      const workflow = createWorkflow<{}>('test')
        .tool('readFile', readFileTool);

      // Type should be inferred as WorkflowBuilder<{ readFile: string }>
      expect(workflow).toBeDefined();
    });
  });

  describe('step definitions', () => {
    it('should add prompt steps', () => {
      const workflow = createWorkflow('test')
        .prompt('Analyze this code');

      const config = workflow.buildConfig();
      expect(config.steps).toHaveLength(1);
      expect(config.steps[0].type).toBe('prompt');
      expect((config.steps[0] as any).template).toBe('Analyze this code');
    });

    it('should add custom steps', () => {
      const stepHandler = jest.fn(async (ctx: any) => 'result');
      
      const workflow = createWorkflow('test')
        .step('customStep', stepHandler);

      const config = workflow.buildConfig();
      expect(config.steps).toHaveLength(1);
      expect(config.steps[0].type).toBe('step');
      expect((config.steps[0] as any).handler).toBe(stepHandler);
    });

    it('should support template functions for prompts', () => {
      const templateFn = (ctx: { input: string }) => `Process: ${ctx.input}`;
      
      const workflow = createWorkflow<{ input: string }>('test')
        .prompt(templateFn);

      const config = workflow.buildConfig();
      expect((config.steps[0] as any).template).toBe(templateFn);
    });

    it('should auto-generate step names', () => {
      const workflow = createWorkflow('test')
        .prompt('First prompt')
        .prompt('Second prompt');

      const config = workflow.buildConfig();
      expect(config.steps[0].name).toBe('prompt_1');
      expect(config.steps[1].name).toBe('prompt_2');
    });
  });

  describe('parallel execution', () => {
    it('should add parallel step groups', () => {
      const workflow = createWorkflow('test')
        .parallel({
          step1: async () => 'result1',
          step2: async () => 'result2'
        });

      const config = workflow.buildConfig();
      expect(config.steps).toHaveLength(1);
      expect(config.steps[0].type).toBe('parallel');
      expect((config.steps[0] as any).steps).toHaveLength(2);
    });

    it('should maintain step order in parallel groups', () => {
      const workflow = createWorkflow('test')
        .parallel({
          stepA: async () => 'A',
          stepB: async () => 'B',
          stepC: async () => 'C'
        });

      const config = workflow.buildConfig();
      const parallelStep = config.steps[0];
      expect((parallelStep as any).steps?.map((s: any) => s.name)).toEqual(['stepA', 'stepB', 'stepC']);
    });
  });

  describe('agent steps', () => {
    it('should add agent steps with configuration', () => {
      const agentConfig = {
        maxSteps: 5,
        fallback: 'return_partial' as const,
        prompt: 'Act as a code reviewer',
        tools: ['readFile', 'searchCode']
      };

      const workflow = createWorkflow('test')
        .agent('reviewer', agentConfig);

      const config = workflow.buildConfig();
      expect(config.steps).toHaveLength(1);
      expect(config.steps[0].type).toBe('agent');
      expect((config.steps[0] as any).agentConfig).toEqual(agentConfig);
    });

    it('should support dynamic prompt functions for agents', () => {
      const promptFn = (ctx: { file: string }) => `Review file: ${ctx.file}`;
      const agentConfig = {
        maxSteps: 3,
        fallback: 'error' as const,
        prompt: promptFn,
        tools: ['readFile']
      };

      const workflow = createWorkflow<{ file: string }>('test')
        .agent('reviewer', agentConfig);

      const config = workflow.buildConfig();
      expect((config.steps[0] as any).agentConfig?.prompt).toBe(promptFn);
    });
  });

  describe('model configuration', () => {
    it('should set model configuration', () => {
      const workflow = createWorkflow('test')
        .model('gpt-4');

      const config = workflow.buildConfig();
      expect(config.model).toBe('gpt-4');
    });

    it('should support model with options', () => {
      const modelOptions = {
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000
      };

      const workflow = createWorkflow('test')
        .model('gpt-4', { temperature: 0.7, maxTokens: 1000 });

      const config = workflow.buildConfig();
      expect(config.model).toBe('gpt-4');
      expect(config.modelOptions).toEqual({ temperature: 0.7, maxTokens: 1000 });
    });
  });

  describe('configuration building', () => {
    it('should build complete workflow configuration', () => {
      const testTool = {
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn()
      };

      const workflow = createWorkflow('complete-test')
        .model('gpt-4')
        .tool('readFile', testTool)
        .prompt('Analyze the file')
        .step('process', async () => 'processed');

      const config = workflow.buildConfig();
      
      expect(config.name).toBe('complete-test');
      expect(config.model).toBe('gpt-4');
      expect(config.tools).toBeDefined();
      expect(config.tools!.size).toBe(1);
      expect(config.steps).toHaveLength(2);
    });

    it('should validate required fields', () => {
      const workflow = createWorkflow('test');
      
      expect(() => workflow.buildConfig()).not.toThrow();
      
      // Should have at least a name
      const config = workflow.buildConfig();
      expect(config.name).toBe('test');
    });
  });

  describe('workflow execution', () => {
    it('should create and execute workflow engine', async () => {
      const mockExecute = jest.fn().mockResolvedValue({ result: 'success' });
      (WorkflowEngine as jest.MockedClass<typeof WorkflowEngine>).mockImplementation(() => ({
        execute: mockExecute,
        validateConfig: jest.fn()
      } as any));

      const workflow = createWorkflow('test')
        .prompt('Test prompt');

      const result = await workflow.run();
      expect(result).toEqual({ result: 'success' });
      expect(WorkflowEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test',
          steps: expect.arrayContaining([
            expect.objectContaining({
              type: 'prompt'
            })
          ])
        }),
        expect.any(StateManager),
        expect.any(ToolRegistry),
        undefined
      );
    });

    it('should pass initial context to execution', async () => {
      const mockExecute = jest.fn().mockResolvedValue({ input: 'test', result: 'success' });
      (WorkflowEngine as jest.MockedClass<typeof WorkflowEngine>).mockImplementation(() => ({
        execute: mockExecute,
        validateConfig: jest.fn()
      } as any));

      const workflow = createWorkflow<{ input: string }>('test')
        .prompt('Process input');

      const result = await workflow.run({ input: 'test' });
      expect(mockExecute).toHaveBeenCalledWith({ input: 'test' });
      expect(result).toEqual({ input: 'test', result: 'success' });
    });
  });

  describe('type inference', () => {
    it('should build proper context types through chaining', () => {
      const readFileTool = {
        schema: { 
          type: 'object' as const, 
          properties: { path: { type: 'string' } },
          required: ['path']
        },
        handler: async () => 'file content'
      };

      const workflow = createWorkflow<{ initialData: string }>('test')
        .tool('readFile', readFileTool)
        .step('process', async (ctx: { initialData: string; readFile: string }) => {
          return ctx.initialData + ctx.readFile;
        });

      // This should compile without type errors
      expect(workflow).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle tool registration errors', () => {
      const invalidTool = null as any;
      
      expect(() => {
        createWorkflow('test').tool('invalid', invalidTool);
      }).toThrow();
    });

    it('should handle duplicate tool names', () => {
      const tool1 = {
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn()
      };
      const tool2 = {
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn()
      };

      expect(() => {
        createWorkflow('test')
          .tool('sameName', tool1)
          .tool('sameName', tool2);
      }).toThrow('Tool "sameName" is already registered');
    });

    it('should validate step names for conflicts', () => {
      expect(() => {
        createWorkflow('test')
          .step('duplicate', async () => 'first')
          .step('duplicate', async () => 'second');
      }).toThrow('Step "duplicate" already exists');
    });
  });
});