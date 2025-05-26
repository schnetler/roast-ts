import { WorkflowEngine } from '../workflow-engine';
import { StateManager } from '../../state/state-manager';
import { ToolRegistry } from '../../tools/tool-registry';
import { LLMClient } from '../../shared/types';

// Mock dependencies
jest.mock('../../state/state-manager');
jest.mock('../../tools/tool-registry');

describe('WorkflowEngine', () => {
  let mockStateManager: jest.Mocked<StateManager>;
  let mockToolRegistry: jest.Mocked<ToolRegistry>;
  let mockLLMClient: jest.Mocked<LLMClient>;
  let engine: WorkflowEngine<any>;

  beforeEach(() => {
    mockStateManager = {
      saveStep: jest.fn().mockResolvedValue(undefined),
      loadStep: jest.fn(),
      createSession: jest.fn().mockResolvedValue(undefined),
      loadSession: jest.fn(),
      getState: jest.fn()
    } as any;

    mockToolRegistry = {
      get: jest.fn(),
      getAll: jest.fn().mockReturnValue([]),
      getByCategory: jest.fn(),
      register: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn()
    } as any;

    mockLLMClient = {
      complete: jest.fn(),
      stream: jest.fn()
    } as any;

    const config = {
      name: 'test-workflow',
      model: 'gpt-4',
      steps: [],
      tools: new Map()
    };

    engine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);
  });

  describe('initialization', () => {
    it('should initialize with provided dependencies', () => {
      expect(engine).toBeDefined();
    });

    it('should validate workflow configuration', () => {
      const invalidConfig = {} as any;
      
      expect(() => {
        new WorkflowEngine(invalidConfig, mockStateManager, mockToolRegistry, mockLLMClient);
      }).toThrow('Invalid workflow configuration');
    });
  });

  describe('workflow execution', () => {
    it('should execute empty workflow', async () => {
      const config = {
        name: 'empty-workflow',
        model: 'gpt-4',
        steps: [],
        tools: new Map()
      };

      const emptyEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);
      const result = await emptyEngine.execute();

      expect(result).toEqual({});
    });

    it('should execute workflow with initial context', async () => {
      const config = {
        name: 'test',
        model: 'gpt-4',
        steps: [],
        tools: new Map()
      };

      const engineWithContext = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);
      const initialContext = { input: 'test data' };
      const result = await engineWithContext.execute(initialContext);

      expect(result).toEqual(initialContext);
    });

    it('should execute steps in sequence', async () => {
      const config = {
        name: 'sequential',
        model: 'gpt-4',
        steps: [
          {
            name: 'step1',
            type: 'step' as const,
            handler: jest.fn().mockResolvedValue('result1')
          },
          {
            name: 'step2',
            type: 'step' as const,
            handler: jest.fn().mockResolvedValue('result2')
          }
        ],
        tools: new Map()
      };

      const sequentialEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);
      const result = await sequentialEngine.execute();

      expect(result).toEqual({
        step1: 'result1',
        step2: 'result2'
      });

      expect(config.steps[0].handler).toHaveBeenCalledWith({});
      expect(config.steps[1].handler).toHaveBeenCalledWith({ step1: 'result1' });
    });

    it('should save step results to state manager', async () => {
      const config = {
        name: 'stateful',
        model: 'gpt-4',
        steps: [
          {
            name: 'step1',
            type: 'step' as const,
            handler: jest.fn().mockResolvedValue('result1')
          }
        ],
        tools: new Map()
      };

      const statefulEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);
      await statefulEngine.execute();

      expect(mockStateManager.saveStep).toHaveBeenCalledWith(
        'step1',
        'result1',
        { step1: 'result1' }
      );
    });
  });

  describe('prompt step execution', () => {
    it('should execute simple prompt steps', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'AI response',
        toolCalls: []
      });

      const config = {
        name: 'prompt-test',
        model: 'gpt-4',
        steps: [
          {
            name: 'prompt1',
            type: 'prompt' as const,
            template: 'Analyze this data'
          }
        ],
        tools: new Map()
      };

      const promptEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);
      const result = await promptEngine.execute();

      expect(result).toEqual({ prompt1: 'AI response' });
      expect(mockLLMClient.complete).toHaveBeenCalledWith({
        messages: [
          { role: 'user', content: 'Analyze this data' }
        ],
        tools: []
      });
    });

    it('should execute prompt steps with template functions', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'AI response',
        toolCalls: []
      });

      const templateFn = jest.fn((ctx: { input: string }) => `Process: ${ctx.input}`);
      const config = {
        name: 'template-test',
        model: 'gpt-4',
        steps: [
          {
            name: 'dynamicPrompt',
            type: 'prompt' as const,
            template: templateFn
          }
        ],
        tools: new Map()
      };

      const templateEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);
      const result = await templateEngine.execute({ input: 'test data' });

      expect(templateFn).toHaveBeenCalledWith({ input: 'test data' });
      expect(mockLLMClient.complete).toHaveBeenCalledWith({
        messages: [
          { role: 'user', content: 'Process: test data' }
        ],
        tools: []
      });
    });

    it('should handle tool calls in prompt responses', async () => {
      const mockTool = {
        name: 'testTool',
        description: 'Test tool',
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn().mockResolvedValue('tool result')
      };

      mockToolRegistry.get.mockReturnValue(mockTool);
      mockLLMClient.complete
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'testTool',
                arguments: '{}'
              }
            }
          ]
        })
        .mockResolvedValueOnce({
          content: 'Final response',
          toolCalls: []
        });

      const config = {
        name: 'tool-test',
        model: 'gpt-4',
        steps: [
          {
            name: 'promptWithTools',
            type: 'prompt' as const,
            template: 'Use tools to help'
          }
        ],
        tools: new Map([['testTool', { tool: mockTool, config: {} }]])
      };

      const toolEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);
      const result = await toolEngine.execute();

      expect(mockTool.handler).toHaveBeenCalledWith({}, expect.objectContaining({
        workflowId: 'workflow',
        stepId: 'step',
        logger: expect.any(Object)
      }));
      expect(result).toEqual({ promptWithTools: 'Final response' });
    });
  });

  describe('custom step execution', () => {
    it('should execute custom step handlers', async () => {
      const customHandler = jest.fn().mockResolvedValue('custom result');
      const config = {
        name: 'custom-test',
        model: 'gpt-4',
        steps: [
          {
            name: 'custom',
            type: 'step' as const,
            handler: customHandler
          }
        ],
        tools: new Map()
      };

      const customEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);
      const result = await customEngine.execute({ input: 'data' });

      expect(customHandler).toHaveBeenCalledWith({ input: 'data' });
      expect(result).toEqual({ input: 'data', custom: 'custom result' });
    });

    it('should handle async custom steps', async () => {
      // Use real timers for this test
      jest.useRealTimers();
      
      const asyncHandler = jest.fn().mockImplementation(async (ctx) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return `processed: ${ctx.input}`;
      });

      const config = {
        name: 'async-test',
        model: 'gpt-4',
        steps: [
          {
            name: 'asyncStep',
            type: 'step' as const,
            handler: asyncHandler
          }
        ],
        tools: new Map()
      };

      const asyncEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);
      const result = await asyncEngine.execute({ input: 'test' });

      expect(result).toEqual({ 
        input: 'test', 
        asyncStep: 'processed: test' 
      });
      
      // Restore fake timers for other tests
      jest.useFakeTimers();
    });
  });

  describe('parallel step execution', () => {
    it('should execute parallel steps concurrently', async () => {
      // Use real timers for this test
      jest.useRealTimers();
      
      const start = Date.now();
      const config = {
        name: 'parallel-test',
        model: 'gpt-4',
        steps: [
          {
            name: 'parallel1',
            type: 'parallel' as const,
            steps: [
              {
                name: 'sub1',
                type: 'step' as const,
                handler: jest.fn().mockImplementation(async () => {
                  await new Promise(resolve => setTimeout(resolve, 50));
                  return 'result1';
                })
              },
              {
                name: 'sub2',
                type: 'step' as const,
                handler: jest.fn().mockImplementation(async () => {
                  await new Promise(resolve => setTimeout(resolve, 50));
                  return 'result2';
                })
              }
            ]
          }
        ],
        tools: new Map()
      };

      const parallelEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);
      const result = await parallelEngine.execute();
      const elapsed = Date.now() - start;

      // Should take roughly 50ms, not 100ms (parallel execution)
      expect(elapsed).toBeLessThan(90);
      expect(result).toEqual({
        sub1: 'result1',
        sub2: 'result2'
      });
      
      // Restore fake timers for other tests
      jest.useFakeTimers();
    });

    it('should provide isolated context to parallel steps', async () => {
      const handler1 = jest.fn().mockResolvedValue('result1');
      const handler2 = jest.fn().mockResolvedValue('result2');

      const config = {
        name: 'isolation-test',
        model: 'gpt-4',
        steps: [
          {
            name: 'parallel1',
            type: 'parallel' as const,
            steps: [
              { name: 'sub1', type: 'step' as const, handler: handler1 },
              { name: 'sub2', type: 'step' as const, handler: handler2 }
            ]
          }
        ],
        tools: new Map()
      };

      const isolationEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);
      await isolationEngine.execute({ shared: 'data' });

      // Both handlers should receive the same initial context
      expect(handler1).toHaveBeenCalledWith({ shared: 'data' });
      expect(handler2).toHaveBeenCalledWith({ shared: 'data' });
    });
  });

  describe('agent step execution', () => {
    it('should execute agent steps with tool interactions', async () => {
      const mockTool = {
        name: 'testTool',
        description: 'Test tool',
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn().mockResolvedValue('tool result')
      };

      mockToolRegistry.get.mockReturnValue(mockTool);
      mockToolRegistry.getAll.mockReturnValue([mockTool]);
      mockLLMClient.complete
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'testTool', arguments: '{}' }
            }
          ]
        })
        .mockResolvedValueOnce({
          content: 'Agent finished',
          toolCalls: []
        });

      const config = {
        name: 'agent-test',
        model: 'gpt-4',
        steps: [
          {
            name: 'agent1',
            type: 'agent' as const,
            agentConfig: {
              maxSteps: 5,
              fallback: 'return_partial' as const,
              prompt: 'Act as an assistant',
              tools: ['testTool']
            }
          }
        ],
        tools: new Map([['testTool', { tool: mockTool, config: {} }]])
      };

      const agentEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);
      const result = await agentEngine.execute();

      expect(result).toEqual({ agent1: 'Agent finished' });
      expect(mockTool.handler).toHaveBeenCalled();
    });

    it('should respect maxSteps limit', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'infiniteTool', arguments: '{}' }
          }
        ]
      });

      const mockTool = {
        name: 'infiniteTool',
        description: 'Infinite tool',
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn().mockResolvedValue('continuing...')
      };

      mockToolRegistry.get.mockReturnValue(mockTool);
      mockToolRegistry.getAll.mockReturnValue([mockTool]);

      const config = {
        name: 'max-steps-test',
        model: 'gpt-4',
        steps: [
          {
            name: 'limitedAgent',
            type: 'agent' as const,
            agentConfig: {
              maxSteps: 2,
              fallback: 'return_partial' as const,
              prompt: 'Keep going',
              tools: ['infiniteTool']
            }
          }
        ],
        tools: new Map([['infiniteTool', { tool: mockTool, config: {} }]])
      };

      const limitedEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);
      const result = await limitedEngine.execute();

      expect(mockLLMClient.complete).toHaveBeenCalledTimes(2);
      expect(result.limitedAgent).toContain('Partial');
    });

    it('should handle agent fallback strategies', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'tool', arguments: '{}' }
          }
        ]
      });

      const mockTool = {
        name: 'tool',
        description: 'Test tool',
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn().mockResolvedValue('result')
      };

      mockToolRegistry.get.mockReturnValue(mockTool);
      mockToolRegistry.getAll.mockReturnValue([mockTool]);

      const config = {
        name: 'fallback-test',
        model: 'gpt-4',
        steps: [
          {
            name: 'errorAgent',
            type: 'agent' as const,
            agentConfig: {
              maxSteps: 1,
              fallback: 'error' as const,
              prompt: 'This will hit max steps',
              tools: ['tool']
            }
          }
        ],
        tools: new Map([['tool', { tool: mockTool, config: {} }]])
      };

      const errorEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);

      await expect(errorEngine.execute()).rejects.toThrow('Agent exceeded maximum steps');
    });
  });

  describe('error handling', () => {
    it('should handle step execution errors', async () => {
      const errorHandler = jest.fn().mockRejectedValue(new Error('Step failed'));
      const config = {
        name: 'error-test',
        model: 'gpt-4',
        steps: [
          {
            name: 'errorStep',
            type: 'step' as const,
            handler: errorHandler
          }
        ],
        tools: new Map()
      };

      const errorEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);

      await expect(errorEngine.execute()).rejects.toThrow('Step failed');
    });

    it('should handle LLM client errors', async () => {
      mockLLMClient.complete.mockRejectedValue(new Error('LLM failed'));

      const config = {
        name: 'llm-error-test',
        model: 'gpt-4',
        steps: [
          {
            name: 'promptStep',
            type: 'prompt' as const,
            template: 'This will fail'
          }
        ],
        tools: new Map()
      };

      const llmErrorEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);

      await expect(llmErrorEngine.execute()).rejects.toThrow('LLM failed');
    });

    it('should handle tool execution errors gracefully', async () => {
      const errorTool = {
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn().mockRejectedValue(new Error('Tool failed'))
      };

      mockToolRegistry.get.mockReturnValue(errorTool);
      mockLLMClient.complete.mockResolvedValue({
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'errorTool', arguments: '{}' }
          }
        ]
      });

      const config = {
        name: 'tool-error-test',
        model: 'gpt-4',
        steps: [
          {
            name: 'toolStep',
            type: 'prompt' as const,
            template: 'Use the tool'
          }
        ],
        tools: new Map([['errorTool', { tool: errorTool, config: {} }]])
      };

      const toolErrorEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);

      await expect(toolErrorEngine.execute()).rejects.toThrow('Tool failed');
    });
  });

  describe('context passing', () => {
    it('should accumulate context through workflow execution', async () => {
      const step1Handler = jest.fn().mockResolvedValue('step1_result');
      const step2Handler = jest.fn().mockResolvedValue('step2_result');

      const config = {
        name: 'context-test',
        model: 'gpt-4',
        steps: [
          { name: 'step1', type: 'step' as const, handler: step1Handler },
          { name: 'step2', type: 'step' as const, handler: step2Handler }
        ],
        tools: new Map()
      };

      const contextEngine = new WorkflowEngine(config, mockStateManager, mockToolRegistry, mockLLMClient);
      await contextEngine.execute({ initial: 'data' });

      expect(step1Handler).toHaveBeenCalledWith({ initial: 'data' });
      expect(step2Handler).toHaveBeenCalledWith({ 
        initial: 'data', 
        step1: 'step1_result' 
      });
    });

    it('should preserve type safety in context passing', async () => {
      // This is more of a compilation test
      interface TestContext {
        input: string;
        step1: number;
        step2: boolean;
      }

      const typedHandler = jest.fn().mockImplementation(
        (ctx: { input: string; step1: number }) => !ctx.input.includes('error')
      );

      const config = {
        name: 'typed-context-test',
        model: 'gpt-4',
        steps: [
          {
            name: 'step1',
            type: 'step' as const,
            handler: () => Promise.resolve(42)
          },
          {
            name: 'step2',
            type: 'step' as const,
            handler: typedHandler
          }
        ],
        tools: new Map()
      };

      const typedEngine = new WorkflowEngine<TestContext>(config, mockStateManager, mockToolRegistry, mockLLMClient);
      const result = await typedEngine.execute({ input: 'test' });

      expect(result).toHaveProperty('step1', 42);
      expect(result).toHaveProperty('step2', true);
    });
  });
});