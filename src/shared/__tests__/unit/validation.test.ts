import { z } from 'zod';
import {
  WorkflowConfigSchema,
  ToolSchema,
  StepDefinitionSchema,
  WorkflowConfig,
  Tool,
  StepDefinition
} from '../../types';

describe('Type Validation', () => {
  describe('Workflow Configuration Validation', () => {
    it('should validate workflow configurations at runtime', () => {
      const rawConfig = {
        name: 'data-pipeline',
        model: 'gpt-4',
        provider: 'openai',
        tools: new Map(),
        steps: [
          {
            name: 'load',
            type: 'prompt',
            prompt: 'Load data from source'
          },
          {
            name: 'transform',
            type: 'step',
            handler: 'transformData'
          },
          {
            name: 'save',
            type: 'prompt',
            prompt: 'Save transformed data'
          }
        ]
      };

      const validated = WorkflowConfigSchema.parse(rawConfig);
      expect(validated.name).toBe('data-pipeline');
      expect(validated.steps).toHaveLength(3);
    });

    it('should catch type mismatches at runtime', () => {
      const invalidConfig = {
        name: 123, // Should be string
        model: 'gpt-4',
        tools: new Map(),
        steps: []
      };

      expect(() => WorkflowConfigSchema.parse(invalidConfig)).toThrow(
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({
              path: ['name'],
              message: expect.stringContaining('string')
            })
          ])
        })
      );
    });

    it('should provide helpful error messages for missing fields', () => {
      const incompleteConfig = {
        model: 'gpt-4'
        // Missing required fields
      };

      try {
        WorkflowConfigSchema.parse(incompleteConfig);
        fail('Should have thrown validation error');
      } catch (error) {
        if (error instanceof z.ZodError) {
          expect(error.issues).toHaveLength(3);
          expect(error.issues).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                path: ['name'],
                message: expect.stringContaining('Required')
              }),
              expect.objectContaining({
                path: ['tools']
              }),
              expect.objectContaining({
                path: ['steps'],
                message: expect.stringContaining('Required')
              })
            ])
          );
        }
      }
    });

    it('should validate nested step configurations', () => {
      const configWithNestedSteps = {
        name: 'complex-workflow',
        tools: new Map(),
        steps: [
          {
            name: 'sequential',
            type: 'prompt',
            prompt: 'Start process'
          },
          {
            name: 'parallel-tasks',
            type: 'parallel',
            steps: [
              {
                name: 'task1',
                type: 'prompt',
                prompt: 'First parallel task'
              },
              {
                name: 'task2',
                type: 'step',
                handler: 'processTask2'
              }
            ]
          },
          {
            name: 'agent-task',
            type: 'agent',
            prompt: 'Complete remaining tasks',
            maxSteps: 5,
            tools: ['read', 'write']
          }
        ]
      };

      const validated = WorkflowConfigSchema.parse(configWithNestedSteps);
      expect(validated.steps).toHaveLength(3);
      expect(validated.steps[1].type).toBe('parallel');
    });
  });

  describe('Tool Validation', () => {
    it('should validate tool with Zod schema parameters', () => {
      const toolWithZodParams = {
        name: 'fileReader',
        description: 'Read files from disk',
        category: 'file',
        parameters: z.object({
          path: z.string(),
          encoding: z.enum(['utf8', 'ascii', 'base64']).optional()
        }),
        execute: async ({ path, encoding = 'utf8' }: { path: string; encoding?: string }) => {
          return { content: `Contents of ${path}` };
        }
      };

      const validated = ToolSchema.parse(toolWithZodParams);
      expect(validated.name).toBe('fileReader');
      expect(validated.category).toBe('file');
    });

    it('should validate tool with JSON schema parameters', () => {
      const toolWithJsonSchema = {
        name: 'apiCaller',
        description: 'Make API calls',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
            body: { type: 'object' }
          },
          required: ['url', 'method']
        },
        execute: async ({ url, method, body }: { url: string; method: string; body?: any }) => {
          return { status: 200, data: {} };
        }
      };

      const validated = ToolSchema.parse(toolWithJsonSchema);
      expect(validated.name).toBe('apiCaller');
    });

    it('should validate complex tool configurations', () => {
      const complexTool = {
        name: 'dataProcessor',
        description: 'Process data with caching and retry',
        category: 'processing',
        parameters: z.object({
          data: z.array(z.any()),
          options: z.object({
            format: z.enum(['json', 'csv', 'xml']),
            validate: z.boolean().optional()
          })
        }),
        execute: async ({ data, options }: { data: any[]; options: { format: string; validate?: boolean } }) => {
          return { processed: data.length, format: options.format };
        },
        cacheable: {
          ttl: 3600
        },
        retryable: {
          maxAttempts: 3,
          backoff: 'exponential'
        }
      };

      const validated = ToolSchema.parse(complexTool);
      expect(validated.cacheable).toEqual({ ttl: 3600 });
      expect(validated.retryable).toEqual({ 
        maxAttempts: 3, 
        backoff: 'exponential' 
      });
    });

    it('should reject tools with invalid retry configuration', () => {
      const invalidTool = {
        name: 'badTool',
        description: 'Tool with invalid retry config',
        parameters: z.object({}),
        execute: async () => ({}),
        retryable: {
          maxAttempts: 3,
          backoff: 'invalid-strategy' // Should be 'linear' or 'exponential'
        }
      };

      expect(() => ToolSchema.parse(invalidTool)).toThrow();
    });
  });

  describe('Step Definition Validation', () => {
    it('should validate all step types in a single workflow', () => {
      const steps: any[] = [
        {
          name: 'prompt-step',
          type: 'prompt',
          prompt: 'Analyze the input data',
          target: 'analysis.md',
          condition: 'hasInputData',
          onError: 'skip'
        },
        {
          name: 'custom-step',
          type: 'step',
          handler: async (ctx: any) => ({ processed: true }),
          onError: 'retry'
        },
        {
          name: 'agent-step',
          type: 'agent',
          prompt: 'Complete the analysis',
          maxSteps: 10,
          fallback: 'return_partial',
          tools: ['read', 'write', 'search'],
          condition: (ctx: any) => ctx.needsAgent === true
        },
        {
          name: 'parallel-step',
          type: 'parallel',
          steps: [
            {
              name: 'parallel-1',
              type: 'prompt',
              prompt: 'First parallel task'
            },
            {
              name: 'parallel-2',
              type: 'prompt',
              prompt: 'Second parallel task'
            }
          ]
        }
      ];

      steps.forEach(step => {
        expect(() => StepDefinitionSchema.parse(step)).not.toThrow();
      });
    });

    it('should reject steps with invalid error handling', () => {
      const invalidStep = {
        name: 'bad-step',
        type: 'prompt',
        prompt: 'Test',
        onError: 'panic' // Should be 'fail', 'skip', or 'retry'
      };

      expect(() => StepDefinitionSchema.parse(invalidStep)).toThrow();
    });

    it('should validate conditional steps', () => {
      const conditionalSteps = [
        {
          name: 'string-condition',
          type: 'prompt',
          prompt: 'Conditional prompt',
          condition: 'context.hasData === true'
        },
        {
          name: 'function-condition',
          type: 'step',
          handler: 'processIfNeeded',
          condition: (ctx: any) => ctx.score > 0.5
        }
      ];

      conditionalSteps.forEach(step => {
        expect(() => StepDefinitionSchema.parse(step)).not.toThrow();
      });
    });
  });

  describe('Complex Type Validation', () => {
    it('should validate workflows with mixed tool types', () => {
      const workflow = {
        name: 'mixed-tools-workflow',
        tools: new Map([
          ['zodTool', {
            name: 'zodTool',
            description: 'Tool with Zod params',
            parameters: z.object({ input: z.string() }),
            execute: async ({ input }: { input: string }) => ({ output: input.toUpperCase() })
          }],
          ['jsonTool', {
            name: 'jsonTool',
            description: 'Tool with JSON schema',
            parameters: {
              type: 'object',
              properties: { data: { type: 'array' } }
            },
            execute: async ({ data }: { data: any[] }) => ({ count: data.length })
          }]
        ]),
        steps: [
          {
            name: 'use-tools',
            type: 'agent',
            prompt: 'Use both tools',
            maxSteps: 5,
            tools: ['zodTool', 'jsonTool']
          }
        ]
      };

      const validated = WorkflowConfigSchema.parse(workflow);
      expect(validated.tools.size).toBe(2);
    });

    it('should handle workflows with deeply nested parallel steps', () => {
      const deepWorkflow = {
        name: 'deep-parallel',
        tools: new Map(),
        steps: [
          {
            name: 'outer-parallel',
            type: 'parallel',
            steps: [
              {
                name: 'inner-parallel-1',
                type: 'parallel',
                steps: [
                  {
                    name: 'leaf-1',
                    type: 'prompt',
                    prompt: 'Leaf task 1'
                  },
                  {
                    name: 'leaf-2',
                    type: 'prompt',
                    prompt: 'Leaf task 2'
                  }
                ]
              },
              {
                name: 'inner-step',
                type: 'step',
                handler: 'processInParallel'
              }
            ]
          }
        ]
      };

      const validated = WorkflowConfigSchema.parse(deepWorkflow);
      expect(validated.steps[0].type).toBe('parallel');
    });
  });
});