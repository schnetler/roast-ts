import { z } from 'zod';
import { 
  WorkflowConfigSchema, 
  ToolSchema, 
  StepDefinitionSchema,
  Tool,
  InferToolContext,
  ToolResult,
  WorkflowConfig,
  StepDefinition,
  PromptStep,
  CustomStep,
  AgentStep,
  ParallelStep,
  PromptStepDefinition,
  CustomStepDefinition,
  AgentStepDefinition,
  ParallelStepDefinition
} from '../../types';

describe('Shared Types', () => {
  describe('WorkflowConfig Schema', () => {
    it('should validate complete workflow config', () => {
      const validConfig = {
        name: 'test-workflow',
        model: 'gpt-4',
        provider: 'openai',
        tools: new Map(),
        steps: [],
        metadata: {}
      };
      
      expect(() => WorkflowConfigSchema.parse(validConfig)).not.toThrow();
    });

    it('should reject config missing required fields', () => {
      const invalidConfig = {
        model: 'gpt-4'
        // Missing name, provider, etc.
      };
      
      expect(() => WorkflowConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('should apply default values', () => {
      const minimalConfig = {
        name: 'test',
        tools: new Map(),
        steps: []
      };
      
      const parsed = WorkflowConfigSchema.parse(minimalConfig);
      expect(parsed.model).toBe('gpt-4');
      expect(parsed.provider).toBe('openai');
    });

    it('should validate provider enum', () => {
      const invalidProvider = {
        name: 'test',
        provider: 'invalid-provider',
        tools: new Map(),
        steps: []
      };

      expect(() => WorkflowConfigSchema.parse(invalidProvider)).toThrow();
    });

    it('should accept valid providers', () => {
      const providers = ['openai', 'anthropic', 'bedrock', 'ollama', 'openrouter'];
      
      providers.forEach(provider => {
        const config = {
          name: 'test',
          provider,
          tools: new Map(),
          steps: []
        };
        
        expect(() => WorkflowConfigSchema.parse(config)).not.toThrow();
      });
    });
  });

  describe('Tool Schema', () => {
    it('should validate tool definition', () => {
      const validTool = {
        name: 'testTool',
        description: 'A test tool',
        parameters: z.object({ input: z.string() }),
        execute: async () => ({ result: 'test' })
      };
      
      expect(() => ToolSchema.parse(validTool)).not.toThrow();
    });

    it('should require essential tool properties', () => {
      const invalidTool = {
        name: 'testTool'
        // Missing description, parameters, execute
      };
      
      expect(() => ToolSchema.parse(invalidTool)).toThrow();
    });

    it('should validate optional cacheable property', () => {
      const cacheableBool = {
        name: 'testTool',
        description: 'A test tool',
        parameters: z.object({}),
        execute: async () => ({}),
        cacheable: true
      };

      const cacheableObj = {
        name: 'testTool',
        description: 'A test tool',
        parameters: z.object({}),
        execute: async () => ({}),
        cacheable: { ttl: 300 }
      };

      expect(() => ToolSchema.parse(cacheableBool)).not.toThrow();
      expect(() => ToolSchema.parse(cacheableObj)).not.toThrow();
    });

    it('should validate optional retryable property', () => {
      const retryableBool = {
        name: 'testTool',
        description: 'A test tool',
        parameters: z.object({}),
        execute: async () => ({}),
        retryable: true
      };

      const retryableObj = {
        name: 'testTool',
        description: 'A test tool',
        parameters: z.object({}),
        execute: async () => ({}),
        retryable: { maxAttempts: 3, backoff: 'exponential' }
      };

      expect(() => ToolSchema.parse(retryableBool)).not.toThrow();
      expect(() => ToolSchema.parse(retryableObj)).not.toThrow();
    });
  });

  describe('StepDefinition Schema', () => {
    describe('PromptStep', () => {
      it('should validate prompt step', () => {
        const promptStep = {
          name: 'analyze',
          type: 'prompt',
          prompt: 'Analyze this data',
          target: null
        };

        expect(() => StepDefinitionSchema.parse(promptStep)).not.toThrow();
      });

      it('should validate prompt step with function prompt', () => {
        const promptStep = {
          name: 'analyze',
          type: 'prompt',
          prompt: (ctx: any) => `Analyze ${ctx.data}`,
          target: 'output.md'
        };

        expect(() => StepDefinitionSchema.parse(promptStep)).not.toThrow();
      });

      it('should validate optional properties', () => {
        const promptStep = {
          name: 'analyze',
          type: 'prompt',
          prompt: 'Analyze this',
          condition: 'hasData',
          onError: 'skip'
        };

        expect(() => StepDefinitionSchema.parse(promptStep)).not.toThrow();
      });
    });

    describe('CustomStep', () => {
      it('should validate custom step with string handler', () => {
        const customStep = {
          name: 'process',
          type: 'step',
          handler: 'processData'
        };

        expect(() => StepDefinitionSchema.parse(customStep)).not.toThrow();
      });

      it('should validate custom step with function handler', () => {
        const customStep = {
          name: 'process',
          type: 'step',
          handler: async (ctx: any) => ({ processed: true })
        };

        expect(() => StepDefinitionSchema.parse(customStep)).not.toThrow();
      });
    });

    describe('AgentStep', () => {
      it('should validate agent step', () => {
        const agentStep = {
          name: 'agent',
          type: 'agent',
          prompt: 'Complete the task',
          maxSteps: 5,
          tools: ['read', 'write']
        };

        expect(() => StepDefinitionSchema.parse(agentStep)).not.toThrow();
      });

      it('should validate agent step with fallback', () => {
        const agentStep = {
          name: 'agent',
          type: 'agent',
          prompt: 'Complete the task',
          maxSteps: 10,
          fallback: 'return_partial',
          tools: ['read', 'write', 'search']
        };

        expect(() => StepDefinitionSchema.parse(agentStep)).not.toThrow();
      });

      it('should reject invalid fallback values', () => {
        const agentStep = {
          name: 'agent',
          type: 'agent',
          prompt: 'Complete the task',
          maxSteps: 5,
          fallback: 'invalid_fallback',
          tools: ['read']
        };

        expect(() => StepDefinitionSchema.parse(agentStep)).toThrow();
      });
    });

    describe('ParallelStep', () => {
      it('should validate parallel step', () => {
        const parallelStep = {
          name: 'parallel',
          type: 'parallel',
          steps: [
            {
              name: 'task1',
              type: 'prompt',
              prompt: 'Task 1'
            },
            {
              name: 'task2',
              type: 'prompt',
              prompt: 'Task 2'
            }
          ]
        };

        expect(() => StepDefinitionSchema.parse(parallelStep)).not.toThrow();
      });
    });
  });

  describe('Type Inference', () => {
    it('should infer tool result types correctly', () => {
      // This test verifies TypeScript compilation
      type TestTool = Tool<{ input: string }, { output: number }>;
      type InferredContext = InferToolContext<{ test: TestTool }>;
      
      // Type should be: { test: ToolResult<{ output: number }> }
      const context: InferredContext = {
        test: { 
          data: { output: 42 }, 
          metadata: { duration: 100 }
        }
      };
      
      expect(context.test.data.output).toBe(42);
      expect(context.test.metadata.duration).toBe(100);
    });

    it('should handle complex tool context inference', () => {
      type ReadTool = Tool<{ path: string }, { content: string }>;
      type WriteTool = Tool<{ path: string; content: string }, { success: boolean }>;
      type SearchTool = Tool<{ query: string }, { results: string[] }>;

      type ToolContext = InferToolContext<{
        read: ReadTool;
        write: WriteTool;
        search: SearchTool;
      }>;

      const context: ToolContext = {
        read: {
          data: { content: 'file content' },
          metadata: { duration: 50 }
        },
        write: {
          data: { success: true },
          metadata: { duration: 100 }
        },
        search: {
          data: { results: ['result1', 'result2'] },
          metadata: { duration: 200, cached: true }
        }
      };

      expect(context.read.data.content).toBe('file content');
      expect(context.write.data.success).toBe(true);
      expect(context.search.data.results).toHaveLength(2);
      expect(context.search.metadata.cached).toBe(true);
    });
  });

  describe('WorkflowConfig Type', () => {
    it('should accept valid workflow configurations', () => {
      const workflow: WorkflowConfig = {
        name: 'test-workflow',
        model: 'gpt-4',
        provider: 'openai',
        tools: new Map([
          ['read', {
            tool: {
              name: 'read',
              description: 'Read file',
              parameters: z.object({ path: z.string() }),
              execute: async ({ path }: { path: string }) => ({ content: 'test' })
            },
            config: {}
          }]
        ]),
        steps: [
          {
            name: 'analyze',
            type: 'prompt',
            template: 'Analyze the code'
          },
          {
            name: 'process',
            type: 'step',
            handler: async () => ({ processed: true })
          }
        ],
        metadata: {
          version: '1.0.0',
          author: 'test'
        }
      };

      expect(workflow.name).toBe('test-workflow');
      expect(workflow.tools?.size).toBe(1);
      expect(workflow.steps).toHaveLength(2);
    });
  });

  describe('Step Type Guards', () => {
    const isPromptStep = (step: StepDefinition): step is PromptStepDefinition => {
      return step.type === 'prompt';
    };

    const isCustomStep = (step: StepDefinition): step is CustomStepDefinition => {
      return step.type === 'step';
    };

    const isAgentStep = (step: StepDefinition): step is AgentStepDefinition => {
      return step.type === 'agent';
    };

    const isParallelStep = (step: StepDefinition): step is ParallelStepDefinition => {
      return step.type === 'parallel';
    };

    it('should correctly identify step types', () => {
      const promptStep: StepDefinition = {
        name: 'prompt',
        type: 'prompt',
        template: 'Test'
      };

      const customStep: StepDefinition = {
        name: 'custom',
        type: 'step',
        handler: async (context: any) => ({ result: 'test' })
      };

      const agentStep: StepDefinition = {
        name: 'agent',
        type: 'agent',
        agentConfig: {
          prompt: 'Test',
          maxSteps: 5,
          fallback: 'return_partial',
          tools: []
        }
      };

      const parallelStep: StepDefinition = {
        name: 'parallel',
        type: 'parallel',
        steps: []
      };

      expect(isPromptStep(promptStep)).toBe(true);
      expect(isCustomStep(customStep)).toBe(true);
      expect(isAgentStep(agentStep)).toBe(true);
      expect(isParallelStep(parallelStep)).toBe(true);

      // Cross-checks
      expect(isPromptStep(customStep)).toBe(false);
      expect(isCustomStep(promptStep)).toBe(false);
      expect(isAgentStep(parallelStep)).toBe(false);
      expect(isParallelStep(agentStep)).toBe(false);
    });
  });
});