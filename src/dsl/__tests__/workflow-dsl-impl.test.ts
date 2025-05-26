/**
 * Tests for WorkflowDSL implementation
 */

import { workflow } from '../workflow-factory';
import { z } from 'zod';

// Mock dependencies
jest.mock('../../workflow/workflow-engine');

describe('WorkflowDSL Implementation', () => {
  describe('Configuration methods', () => {
    it('should set model configuration', () => {
      const wf = workflow('test')
        .model('gpt-4-turbo')
        .build();
      
      expect(wf.config.model).toBe('gpt-4-turbo');
    });

    it('should set provider configuration', () => {
      const wf = workflow('test')
        .provider('anthropic')
        .build();
      
      expect(wf.config.provider).toBe('anthropic');
    });

    it('should set temperature', () => {
      const wf = workflow('test')
        .temperature(0.3)
        .build();
      
      expect(wf.config.temperature).toBe(0.3);
    });

    it('should set max tokens', () => {
      const wf = workflow('test')
        .maxTokens(4000)
        .build();
      
      expect(wf.config.maxTokens).toBe(4000);
    });

    it('should set timeout', () => {
      const wf = workflow('test')
        .timeout('5m')
        .build();
      
      expect(wf.config.timeout).toBe('5m');
    });

    it('should chain configuration methods', () => {
      const wf = workflow('test')
        .model('claude-3')
        .provider('anthropic')
        .temperature(0.5)
        .maxTokens(3000)
        .timeout('10m')
        .build();
      
      expect(wf.config).toMatchObject({
        model: 'claude-3',
        provider: 'anthropic',
        temperature: 0.5,
        maxTokens: 3000,
        timeout: '10m'
      });
    });
  });

  describe('Tool methods', () => {
    const mockTool = {
      description: 'Test tool',
      parameters: { type: 'object' as const, properties: {} },
      execute: jest.fn().mockResolvedValue({ data: 'result' })
    };

    it('should add a single tool', () => {
      const wf = workflow('test')
        .tool('myTool', mockTool)
        .build();
      
      expect(wf.config.tools).toBeDefined();
      expect(wf.config.tools!.size).toBe(1);
      expect(wf.config.tools!.get('myTool')).toMatchObject({
        tool: expect.objectContaining({
          description: 'Test tool'
        }),
        config: {}
      });
      
      expect(wf.steps).toHaveLength(1);
      expect(wf.steps[0]).toMatchObject({
        type: 'tool',
        name: 'myTool',
        tool: 'myTool'
      });
    });

    it('should add multiple tools at once', () => {
      const tools = {
        tool1: { ...mockTool, description: 'Tool 1' },
        tool2: { ...mockTool, description: 'Tool 2' },
        tool3: { ...mockTool, description: 'Tool 3' }
      };
      
      const wf = workflow('test')
        .tools(tools)
        .build();
      
      expect(wf.config.tools).toBeDefined();
      expect(wf.config.tools!.size).toBe(3);
      expect(wf.steps).toHaveLength(3);
      
      expect(Array.from(wf.config.tools!.keys())).toEqual(['tool1', 'tool2', 'tool3']);
    });

    it('should maintain type safety with tools', () => {
      const wf = workflow('test')
        .tool('fetch', mockTool)
        .prompt(({ fetch }) => `Process ${fetch.data}`);
      
      // This should compile without errors
      expect(wf).toBeDefined();
    });
  });

  describe('Prompt methods', () => {
    it('should add a simple string prompt', () => {
      const wf = workflow('test')
        .prompt('Analyze this data')
        .build();
      
      expect(wf.steps).toHaveLength(1);
      expect(wf.steps[0]).toMatchObject({
        type: 'prompt',
        name: 'prompt',
        prompt: 'Analyze this data'
      });
    });

    it('should add a dynamic prompt function', () => {
      const promptFn = (ctx: any) => `Process ${ctx.data}`;
      
      const wf = workflow('test')
        .prompt(promptFn)
        .build();
      
      expect(wf.steps).toHaveLength(1);
      expect(wf.steps[0]).toMatchObject({
        type: 'prompt',
        name: 'prompt',
        prompt: promptFn
      });
    });

    it('should add a named prompt', () => {
      const wf = workflow('test')
        .promptAs('analysis', 'Analyze the data')
        .promptAs('summary', 'Summarize the results')
        .build();
      
      expect(wf.steps).toHaveLength(2);
      expect(wf.steps[0].name).toBe('analysis');
      expect(wf.steps[1].name).toBe('summary');
    });
  });

  describe('Step methods', () => {
    it('should add a single custom step', () => {
      const handler = jest.fn().mockResolvedValue({ result: 'done' });
      
      const wf = workflow('test')
        .step('process', handler)
        .build();
      
      expect(wf.steps).toHaveLength(1);
      expect(wf.steps[0]).toMatchObject({
        type: 'custom',
        name: 'process',
        handler
      });
    });

    it('should add multiple steps at once', () => {
      const steps = {
        validate: jest.fn().mockResolvedValue({ valid: true }),
        process: jest.fn().mockResolvedValue({ processed: true }),
        save: jest.fn().mockResolvedValue({ saved: true })
      };
      
      const wf = workflow('test')
        .steps(steps)
        .build();
      
      expect(wf.steps).toHaveLength(3);
      expect(wf.steps.map(s => s.name)).toEqual(['validate', 'process', 'save']);
    });
  });

  describe('Agent methods', () => {
    it('should add an agent step', () => {
      const wf = workflow('test')
        .agent('analyzer', {
          maxSteps: 5,
          fallback: 'summarize',
          prompt: 'Analyze the code',
          tools: ['search', 'read']
        })
        .build();
      
      expect(wf.steps).toHaveLength(1);
      expect(wf.steps[0]).toMatchObject({
        type: 'agent',
        name: 'analyzer',
        maxSteps: 5,
        prompt: 'Analyze the code',
        tools: ['search', 'read']
      });
    });

    it('should use workflow tools if not specified', () => {
      const wf = workflow('test')
        .tool('search', {} as any)
        .tool('read', {} as any)
        .agent('analyzer', {
          maxSteps: 3,
          fallback: 'done'
        })
        .build();
      
      const agentStep = wf.steps.find(s => s.type === 'agent');
      expect(agentStep?.tools).toEqual(['search', 'read']);
    });
  });

  describe('Control flow methods', () => {
    it('should add parallel steps', () => {
      const steps = {
        lint: jest.fn(),
        test: jest.fn(),
        build: jest.fn()
      };
      
      const wf = workflow('test')
        .parallel(steps)
        .build();
      
      expect(wf.steps).toHaveLength(1);
      expect(wf.steps[0].type).toBe('parallel');
      expect(wf.steps[0].steps).toHaveLength(3);
    });

    it('should add conditional step', () => {
      const condition = jest.fn().mockReturnValue(true);
      const ifTrue = jest.fn().mockResolvedValue({ branch: 'true' });
      const ifFalse = jest.fn().mockResolvedValue({ branch: 'false' });
      
      const wf = workflow('test')
        .conditional(condition, ifTrue, ifFalse)
        .build();
      
      expect(wf.steps).toHaveLength(1);
      expect(wf.steps[0]).toMatchObject({
        type: 'conditional',
        name: 'conditional',
        condition,
        ifTrue,
        ifFalse
      });
    });

    it('should add loop step', () => {
      const items = jest.fn().mockResolvedValue([1, 2, 3]);
      const handler = jest.fn().mockResolvedValue({ processed: true });
      
      const wf = workflow('test')
        .loop(items, handler)
        .build();
      
      expect(wf.steps).toHaveLength(1);
      expect(wf.steps[0]).toMatchObject({
        type: 'loop',
        name: 'loop',
        items,
        loopHandler: handler
      });
    });
  });

  describe('Human interaction methods', () => {
    it('should add approval step with defaults', () => {
      const wf = workflow('test')
        .approve()
        .build();
      
      expect(wf.steps).toHaveLength(1);
      expect(wf.steps[0]).toMatchObject({
        type: 'approval',
        name: 'approval',
        approvalConfig: {
          message: 'Please approve to continue',
          timeout: '1h'
        }
      });
    });

    it('should add approval step with custom config', () => {
      const wf = workflow('test')
        .approve({
          message: 'Deploy to production?',
          timeout: '30m',
          channels: ['slack', 'email']
        })
        .build();
      
      const approvalStep = wf.steps[0];
      expect(approvalStep.approvalConfig).toMatchObject({
        message: 'Deploy to production?',
        timeout: '30m',
        channels: ['slack', 'email']
      });
    });

    it('should add input step', () => {
      const schema = z.string().min(1);
      
      const wf = workflow('test')
        .input('username', schema, {
          prompt: 'Enter username:',
          default: 'guest'
        })
        .build();
      
      expect(wf.steps).toHaveLength(1);
      expect(wf.steps[0]).toMatchObject({
        type: 'input',
        name: 'username',
        inputSchema: schema,
        inputConfig: {
          prompt: 'Enter username:',
          default: 'guest'
        }
      });
    });
  });

  describe('Composition methods', () => {
    it('should compose workflows with use()', () => {
      const subWorkflow = workflow('sub')
        .step('subStep', async () => ({ sub: true }));
      
      const wf = workflow('main')
        .use(subWorkflow)
        .build();
      
      expect(wf.steps).toHaveLength(1);
      expect(wf.steps[0]).toMatchObject({
        type: 'workflow',
        name: 'sub'
      });
    });

    it('should compose multiple workflows', () => {
      const wf1 = workflow('wf1').tool('tool1', {} as any);
      const wf2 = workflow('wf2').tool('tool2', {} as any);
      const wf3 = workflow('wf3').tool('tool3', {} as any);
      
      const composed = workflow('main')
        .compose(wf1, wf2, wf3)
        .build();
      
      expect(composed.steps).toHaveLength(3);
      expect(composed.config.tools).toBeDefined();
      expect(composed.config.tools!.size).toBe(3);
    });
  });

  describe('Error handling methods', () => {
    it('should add error handler', () => {
      const errorHandler = jest.fn().mockResolvedValue({ handled: true });
      
      const wf = workflow('test')
        .catch(errorHandler)
        .build();
      
      expect(wf.errorHandler).toBe(errorHandler);
    });

    it('should add retry configuration', () => {
      const wf = workflow('test')
        .retry({
          maxAttempts: 5,
          backoff: 'exponential',
          retryIf: (error) => error.message.includes('timeout')
        })
        .build();
      
      expect(wf.metadata?.retryConfig).toMatchObject({
        maxAttempts: 5,
        backoff: 'exponential'
      });
    });
  });

  describe('Validation methods', () => {
    it('should add validators', () => {
      const validator1 = jest.fn().mockReturnValue(true);
      const validator2 = jest.fn().mockReturnValue('Error message');
      
      const wf = workflow('test')
        .validate(validator1)
        .validate(validator2)
        .build();
      
      expect(wf.validators).toHaveLength(2);
      expect(wf.validators).toContain(validator1);
      expect(wf.validators).toContain(validator2);
    });

    it('should validate workflow structure', () => {
      const wf = workflow('test')
        .agent('invalid', {
          maxSteps: 0, // Invalid
          fallback: 'done'
        });
      
      const result = wf.validateWorkflow();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Agent step 'invalid' must have positive maxSteps");
    });
  });

  describe('Utility methods', () => {
    it('should add log steps', () => {
      const wf = workflow('test')
        .log('Starting process')
        .step('process', async () => ({ done: true }))
        .log((ctx) => `Completed: ${ctx.process.done}`)
        .build();
      
      expect(wf.steps).toHaveLength(3);
      expect(wf.steps[0].name).toMatch(/^log_/);
      expect(wf.steps[2].name).toMatch(/^log_/);
    });

    it('should add tap steps', () => {
      const tapFn = jest.fn();
      
      const wf = workflow('test')
        .tap(tapFn)
        .build();
      
      expect(wf.steps).toHaveLength(1);
      expect(wf.steps[0].name).toMatch(/^tap_/);
    });

    it('should transform context', () => {
      const wf = workflow('test')
        .step('getData', async () => ({ data: [1, 2, 3] }))
        .transform((ctx) => ({ 
          ...ctx, 
          sum: ctx.getData.data.reduce((a: number, b: number) => a + b, 0) 
        }))
        .build();
      
      expect(wf.steps).toHaveLength(2);
      expect(wf.steps[1].name).toBe('transform');
    });
  });

  describe('Metadata methods', () => {
    it('should set description', () => {
      const wf = workflow('test')
        .description('This workflow processes data')
        .build();
      
      expect(wf.config.metadata?.description).toBe('This workflow processes data');
    });

    it('should add tags', () => {
      const wf = workflow('test')
        .tag('production')
        .tag('critical')
        .tags(['api', 'v2'])
        .build();
      
      expect(wf.config.metadata?.tags).toEqual(['production', 'critical', 'api', 'v2']);
    });

    it('should set custom metadata', () => {
      const wf = workflow('test')
        .metadata('version', '1.0.0')
        .metadata('author', 'test')
        .metadata('config', { timeout: 5000 })
        .build();
      
      expect(wf.config.metadata).toMatchObject({
        version: '1.0.0',
        author: 'test',
        config: { timeout: 5000 }
      });
    });
  });

  describe('Execution methods', () => {
    it('should build a complete workflow', () => {
      const wf = workflow('complete')
        .model('gpt-4')
        .provider('openai')
        .tool('search', {} as any)
        .prompt('Analyze data')
        .step('process', async (ctx) => ({ result: 'done' }))
        .build();
      
      expect(wf.config.name).toBe('complete');
      expect(wf.config.model).toBe('gpt-4');
      expect(wf.config.tools).toBeDefined();
      expect(wf.config.tools!.size).toBe(1);
      expect(wf.steps).toHaveLength(3); // tool, prompt, step
    });

    it('should validate before running', async () => {
      const wf = workflow('test')
        .prompt('test prompt')
        .validate((ctx) => false);
      
      await expect(wf.run({})).rejects.toThrow('Input validation failed');
    });

    it('should generate execution plan', async () => {
      const wf = workflow('test')
        .prompt('Start')
        .parallel({
          check1: async () => ({ ok: true }),
          check2: async () => ({ ok: true })
        })
        .agent('process', { maxSteps: 3, fallback: 'done' });
      
      const plan = await wf.dryRun();
      
      expect(plan.totalSteps).toBeGreaterThan(0);
      expect(plan.parallelizable).toBe(true);
      expect(plan.steps).toContainEqual(
        expect.objectContaining({
          type: 'parallel'
        })
      );
    });
  });
});