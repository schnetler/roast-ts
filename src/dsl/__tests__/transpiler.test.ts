/**
 * Tests for DSL to YAML transpiler
 */

import { DSLTranspiler } from '../transpiler';
import { workflow } from '../workflow-factory';
import * as yaml from 'js-yaml';

// Mock fs for file operations
jest.mock('fs/promises');

describe('DSL Transpiler', () => {
  let transpiler: DSLTranspiler;

  beforeEach(() => {
    transpiler = new DSLTranspiler();
  });

  describe('Basic transpilation', () => {
    it('should transpile simple workflow to YAML', () => {
      const wf = workflow('simple-workflow')
        .model('gpt-4')
        .provider('openai')
        .prompt('Analyze this data')
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.name).toBe('simple-workflow');
      expect(yamlObj.model).toBe('gpt-4');
      expect(yamlObj.provider).toBe('openai');
      expect(yamlObj.steps).toHaveLength(1);
      expect(yamlObj.steps[0]).toBe('Analyze this data');
    });

    it('should transpile workflow with tools', () => {
      const wf = workflow('with-tools')
        .tool('search', {
          description: 'Search tool',
          parameters: { type: 'object' as const, properties: {} },
          execute: jest.fn()
        })
        .tool('read', {
          description: 'Read tool',
          parameters: { type: 'object' as const, properties: {} },
          execute: jest.fn(),
          cacheable: true,
          retryable: { maxAttempts: 3 }
        })
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.tools).toHaveLength(2);
      expect(yamlObj.tools[0]).toBe('search');
      expect(yamlObj.tools[1]).toEqual({
        read: {
          description: 'Read tool',
          cacheable: true,
          retryable: true
        }
      });
    });

    it('should transpile workflow configuration', () => {
      const wf = workflow('configured')
        .model('claude-3')
        .provider('anthropic')
        .temperature(0.3)
        .maxTokens(4000)
        .timeout('5m')
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.temperature).toBe(0.3);
      expect(yamlObj.max_tokens).toBe(4000);
      expect(yamlObj.timeout).toBe('5m');
    });

    it('should omit default values', () => {
      const wf = workflow('defaults')
        .temperature(0.7) // Default
        .maxTokens(2000)  // Default
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.temperature).toBeUndefined();
      expect(yamlObj.max_tokens).toBeUndefined();
    });
  });

  describe('Step transpilation', () => {
    it('should transpile prompt steps', () => {
      const wf = workflow('prompts')
        .prompt('Simple prompt')
        .promptAs('analysis', 'Analyze the data')
        .prompt((ctx) => `Dynamic: ${ctx.analysis}`)
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.steps[0]).toBe('Simple prompt');
      expect(yamlObj.steps[1]).toEqual({
        step: 'analysis',
        prompt: 'Analyze the data'
      });
      expect(yamlObj.steps[2]).toEqual({
        step: 'prompt',
        prompt: 'dynamic',
        _comment: 'Dynamic prompt - see prompt file'
      });
    });

    it('should transpile tool steps', () => {
      const wf = workflow('tools')
        .tool('search', {} as any)
        .tool('read', {} as any)
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.steps[0]).toEqual({
        step: 'search',
        tool: 'search'
      });
      expect(yamlObj.steps[1]).toEqual({
        step: 'read',
        tool: 'read'
      });
    });

    it('should transpile agent steps', () => {
      const wf = workflow('agents')
        .tool('search', {} as any)
        .agent('analyzer', {
          maxSteps: 5,
          fallback: 'summarize',
          prompt: 'Analyze the code',
          tools: ['search'],
          temperature: 0.5,
          model: 'gpt-4-turbo'
        })
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.steps[1]).toEqual({
        step: 'analyzer',
        type: 'agent',
        max_steps: 5,
        prompt: 'Analyze the code',
        tools: ['search'],
        temperature: 0.5,
        model: 'gpt-4-turbo',
        fallback: 'summarize'
      });
    });

    it('should transpile parallel steps', () => {
      const wf = workflow('parallel')
        .parallel({
          lint: async () => ({ passed: true }),
          test: async () => ({ passed: true }),
          build: async () => ({ success: true })
        })
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.steps[0]).toEqual(['lint', 'test', 'build']);
    });

    it('should transpile custom steps', () => {
      const wf = workflow('custom')
        .step('process', async () => ({ done: true }))
        .step('save', async () => ({ saved: true }))
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.steps[0]).toEqual({
        step: 'process',
        type: 'custom',
        _comment: 'Custom handler - implement in code'
      });
    });

    it('should transpile conditional steps', () => {
      const wf = workflow('conditional')
        .step('value', async () => 42)
        .conditional(
          (ctx) => ctx.value > 0,
          async () => ({ positive: true }),
          async () => ({ positive: false })
        )
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.steps[1]).toEqual({
        step: 'conditional',
        type: 'conditional',
        condition: 'dynamic',
        if_true: 'dynamic',
        if_false: 'dynamic',
        _comment: 'Conditional logic - implement in code'
      });
    });

    it('should transpile loop steps', () => {
      const wf = workflow('loops')
        .step('items', async () => [1, 2, 3])
        .loop(
          (ctx) => ctx.items,
          async (item, idx) => ({ processed: item })
        )
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.steps[1]).toEqual({
        step: 'loop',
        type: 'loop',
        items: 'dynamic',
        handler: 'dynamic',
        _comment: 'Loop logic - implement in code'
      });
    });

    it('should transpile approval steps', () => {
      const wf = workflow('approval')
        .approve({
          message: 'Deploy to production?',
          timeout: '30m',
          channels: ['slack', 'email'],
          fallback: 'reject'
        })
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.steps[0]).toEqual({
        step: 'approval',
        type: 'approval',
        message: 'Deploy to production?',
        timeout: '30m',
        channels: ['slack', 'email'],
        fallback: 'reject'
      });
    });

    it('should transpile input steps', () => {
      const wf = workflow('input')
        .input('username', {} as any, {
          prompt: 'Enter username:',
          default: 'guest',
          choices: ['guest', 'admin', 'user']
        })
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.steps[0]).toEqual({
        step: 'username',
        type: 'input',
        prompt: 'Enter username:',
        default: 'guest',
        choices: ['guest', 'admin', 'user'],
        schema: 'dynamic',
        _comment: 'Schema validation - implement in code'
      });
    });
  });

  describe('Advanced features', () => {
    it('should transpile metadata', () => {
      const wf = workflow('with-metadata')
        .description('Test workflow')
        .tag('production')
        .tag('critical')
        .metadata('version', '1.0.0')
        .metadata('author', 'test')
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.metadata).toEqual({
        description: 'Test workflow',
        tags: ['production', 'critical'],
        version: '1.0.0',
        author: 'test'
      });
    });

    it('should transpile error handling', () => {
      const wf = workflow('error-handling')
        .catch(async (error) => ({ handled: true }))
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.error_handler).toBe('custom');
    });

    it('should transpile retry configuration', () => {
      const wf = workflow('retry')
        .retry({
          maxAttempts: 5,
          backoff: 'exponential'
        })
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.retry).toEqual({
        max_attempts: 5,
        backoff: 'exponential'
      });
    });
  });

  describe('Complex workflows', () => {
    it('should transpile complete workflow', () => {
      const wf = workflow('complete')
        .model('gpt-4')
        .provider('openai')
        .temperature(0.5)
        .tool('search', {
          description: 'Search files',
          parameters: { type: 'object' as const, properties: {} },
          execute: jest.fn()
        })
        .tool('read', {
          description: 'Read file',
          parameters: { type: 'object' as const, properties: {} },
          execute: jest.fn()
        })
        .prompt('Analyze the codebase')
        .agent('analyzer', {
          maxSteps: 10,
          fallback: 'summarize',
          tools: ['search', 'read']
        })
        .parallel({
          lint: async () => ({ ok: true }),
          test: async () => ({ ok: true })
        })
        .conditional(
          (ctx) => ctx.lint.ok && ctx.test.ok,
          async () => ({ deploy: true }),
          async () => ({ deploy: false })
        )
        .approve({
          message: 'Deploy to production?',
          timeout: '1h'
        })
        .catch(async (error) => ({ error: error.message }))
        .retry({ maxAttempts: 3 })
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.name).toBe('complete');
      expect(yamlObj.model).toBe('gpt-4');
      expect(yamlObj.temperature).toBe(0.5);
      expect(yamlObj.tools).toHaveLength(2);
      expect(yamlObj.steps.length).toBeGreaterThan(5);
      expect(yamlObj.error_handler).toBe('custom');
      expect(yamlObj.retry.max_attempts).toBe(3);
    });

    it('should handle nested workflows', () => {
      const subWorkflow = workflow('sub')
        .step('subStep', async () => ({ sub: true }));
      
      const mainWorkflow = workflow('main')
        .step('before', async () => ({ setup: true }))
        .use(subWorkflow)
        .step('after', async () => ({ cleanup: true }))
        .build();
      
      const yamlStr = transpiler.transpile(mainWorkflow);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.steps[1]).toEqual({
        step: 'sub',
        type: 'workflow',
        workflow: 'sub',
        _comment: 'Sub-workflow reference'
      });
    });
  });

  describe('File operations', () => {
    it('should create transpiler with custom options', () => {
      const customTranspiler = new DSLTranspiler({
        indent: 4,
        lineWidth: 120,
        noRefs: false,
        outputDir: './custom-workflows'
      });
      
      const wf = workflow('test').prompt('Test').build();
      const yamlStr = customTranspiler.transpile(wf);
      
      expect(yamlStr).toContain('name: test');
      expect(yamlStr).toContain('steps:');
    });

    it('should handle special characters in strings', () => {
      const wf = workflow('special')
        .prompt('Line 1\nLine 2\tTabbed')
        .prompt("String with 'quotes' and \"double quotes\"")
        .build();
      
      const yamlStr = transpiler.transpile(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.steps[0]).toContain('Line 1');
      expect(yamlObj.steps[0]).toContain('Line 2');
      expect(yamlObj.steps[1]).toContain('quotes');
    });
  });
});