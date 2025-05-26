import { StepExecutor } from '../step-executor';
import { ToolRegistry } from '../../tools/tool-registry';
import { LLMClient, StepDefinition } from '../../shared/types';

// Mock dependencies
jest.mock('../../tools/tool-registry');

describe('StepExecutor', () => {
  let mockToolRegistry: jest.Mocked<ToolRegistry>;
  let mockLLMClient: jest.Mocked<LLMClient>;
  let stepExecutor: StepExecutor;

  beforeEach(() => {
    mockToolRegistry = {
      get: jest.fn(),
      getAll: jest.fn().mockReturnValue([]), // Return empty array by default
      getByCategory: jest.fn(),
      register: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn()
    } as any;

    mockLLMClient = {
      complete: jest.fn(),
      stream: jest.fn()
    } as any;

    stepExecutor = new StepExecutor(mockToolRegistry, mockLLMClient);
  });

  describe('prompt step execution', () => {
    it('should execute simple prompt steps', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'AI response to prompt',
        toolCalls: []
      });

      const step = {
        name: 'simplePrompt',
        type: 'prompt' as const,
        template: 'What is the capital of France?'
      };

      const result = await stepExecutor.execute(step, {});

      expect(result).toBe('AI response to prompt');
      expect(mockLLMClient.complete).toHaveBeenCalledWith({
        messages: [
          { role: 'user', content: 'What is the capital of France?' }
        ],
        tools: []
      });
    });

    it('should execute prompt steps with template functions', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Analysis complete',
        toolCalls: []
      });

      const templateFn = jest.fn((ctx: { data: string }) => `Analyze: ${ctx.data}`);
      const step = {
        name: 'dynamicPrompt',
        type: 'prompt' as const,
        template: templateFn
      };

      const context = { data: 'sample data' };
      const result = await stepExecutor.execute(step, context);

      expect(templateFn).toHaveBeenCalledWith(context);
      expect(mockLLMClient.complete).toHaveBeenCalledWith({
        messages: [
          { role: 'user', content: 'Analyze: sample data' }
        ],
        tools: []
      });
      expect(result).toBe('Analysis complete');
    });

    it('should include available tools in prompt execution', async () => {
      const mockTool = {
        name: 'readFile',
        description: 'Reads a file',
        parameters: {
          type: 'object' as const,
          properties: {
            path: { type: 'string' }
          },
          required: ['path']
        },
        execute: jest.fn()
      };

      mockToolRegistry.getAll.mockReturnValue([mockTool]);
      mockLLMClient.complete.mockResolvedValue({
        content: 'Response with tools available',
        toolCalls: []
      });

      const step = {
        name: 'promptWithTools',
        type: 'prompt' as const,
        template: 'Help me read files'
      };

      await stepExecutor.execute(step, {});

      expect(mockLLMClient.complete).toHaveBeenCalledWith({
        messages: [
          { role: 'user', content: 'Help me read files' }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'readFile',
              description: 'Reads a file',
              parameters: mockTool.parameters
            }
          }
        ]
      });
    });

    it('should handle tool calls in prompt responses', async () => {
      const mockTool = {
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn().mockResolvedValue('File content here')
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
                name: 'readFile',
                arguments: '{"path": "/test/file.txt"}'
              }
            }
          ]
        })
        .mockResolvedValueOnce({
          content: 'Based on the file content: File content here',
          toolCalls: []
        });

      const step = {
        name: 'promptWithToolCall',
        type: 'prompt' as const,
        template: 'Read and analyze the file'
      };

      const result = await stepExecutor.execute(step, {});

      expect(mockTool.handler).toHaveBeenCalledWith(
        { path: '/test/file.txt' },
        expect.objectContaining({
          workflowId: expect.any(String),
          stepId: expect.any(String),
          logger: expect.anything()
        })
      );
      expect(result).toBe('Based on the file content: File content here');
    });

    it('should handle multiple tool calls in sequence', async () => {
      const readTool = {
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn().mockResolvedValue('file content')
      };

      const analyzeTool = {
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn().mockResolvedValue('analysis result')
      };

      mockToolRegistry.get
        .mockReturnValueOnce(readTool)
        .mockReturnValueOnce(analyzeTool);

      mockLLMClient.complete
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'readFile', arguments: '{}' }
            }
          ]
        })
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            {
              id: 'call_2',
              type: 'function',
              function: { name: 'analyze', arguments: '{}' }
            }
          ]
        })
        .mockResolvedValueOnce({
          content: 'Final result',
          toolCalls: []
        });

      const step = {
        name: 'multiToolPrompt',
        type: 'prompt' as const,
        template: 'Read file and analyze it'
      };

      const result = await stepExecutor.execute(step, {});

      expect(readTool.handler).toHaveBeenCalled();
      expect(analyzeTool.handler).toHaveBeenCalled();
      expect(result).toBe('Final result');
    });

    it('should handle tool call errors gracefully', async () => {
      const errorTool = {
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn().mockRejectedValue(new Error('Tool execution failed'))
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

      const step = {
        name: 'errorPrompt',
        type: 'prompt' as const,
        template: 'This will cause a tool error'
      };

      await expect(stepExecutor.execute(step, {})).rejects.toThrow('Tool execution failed');
    });
  });

  describe('custom step execution', () => {
    it('should execute custom step handlers', async () => {
      const customHandler = jest.fn().mockResolvedValue('custom result');
      const step = {
        name: 'customStep',
        type: 'step' as const,
        handler: customHandler
      };

      const context = { input: 'test data' };
      const result = await stepExecutor.execute(step, context);

      expect(customHandler).toHaveBeenCalledWith(context);
      expect(result).toBe('custom result');
    });

    it('should handle async custom step handlers', async () => {
      const asyncHandler = jest.fn().mockResolvedValue('processed: async test');

      const step = {
        name: 'asyncStep',
        type: 'step' as const,
        handler: asyncHandler
      };

      const context = { input: 'async test' };
      const result = await stepExecutor.execute(step, context);

      expect(asyncHandler).toHaveBeenCalledWith(context);
      expect(result).toBe('processed: async test');
    });

    it('should handle custom step errors', async () => {
      const errorHandler = jest.fn().mockRejectedValue(new Error('Custom step failed'));
      const step = {
        name: 'errorStep',
        type: 'step' as const,
        handler: errorHandler
      };

      await expect(stepExecutor.execute(step, {})).rejects.toThrow('Custom step failed');
    });
  });

  describe('parallel step execution', () => {
    it('should execute parallel steps concurrently', async () => {
      const step1Handler = jest.fn().mockResolvedValue('result1');
      const step2Handler = jest.fn().mockResolvedValue('result2');

      const parallelStep = {
        name: 'parallelGroup',
        type: 'parallel' as const,
        steps: [
          { name: 'step1', type: 'step' as const, handler: step1Handler },
          { name: 'step2', type: 'step' as const, handler: step2Handler }
        ]
      };

      const result = await stepExecutor.execute(parallelStep, { shared: 'data' });

      expect(result).toEqual({
        step1: 'result1',
        step2: 'result2'
      });

      // Both handlers should receive the same context
      expect(step1Handler).toHaveBeenCalledWith({ shared: 'data' });
      expect(step2Handler).toHaveBeenCalledWith({ shared: 'data' });
    });

    it('should handle errors in parallel execution', async () => {
      const successHandler = jest.fn().mockResolvedValue('success');
      const errorHandler = jest.fn().mockRejectedValue(new Error('Parallel step failed'));

      const parallelStep = {
        name: 'mixedParallel',
        type: 'parallel' as const,
        steps: [
          { name: 'success', type: 'step' as const, handler: successHandler },
          { name: 'error', type: 'step' as const, handler: errorHandler }
        ]
      };

      await expect(stepExecutor.execute(parallelStep, {})).rejects.toThrow('Parallel step failed');
    });

    it('should provide isolated context copies to parallel steps', async () => {
      const mutatingHandler1 = jest.fn().mockImplementation(async (ctx) => {
        ctx.modified = 'by-step1';
        return 'result1';
      });

      const mutatingHandler2 = jest.fn().mockImplementation(async (ctx) => {
        ctx.modified = 'by-step2';
        return 'result2';
      });

      const parallelStep = {
        name: 'isolatedParallel',
        type: 'parallel' as const,
        steps: [
          { name: 'step1', type: 'step' as const, handler: mutatingHandler1 },
          { name: 'step2', type: 'step' as const, handler: mutatingHandler2 }
        ]
      };

      const originalContext = { shared: 'data' };
      await stepExecutor.execute(parallelStep, originalContext);

      // Original context should not be modified
      expect(originalContext).toEqual({ shared: 'data' });
    });
  });

  describe('agent step execution', () => {
    it('should execute agent steps with conversation loop', async () => {
      const mockTool = {
        name: 'testTool',
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn().mockResolvedValue('tool result')
      };

      mockToolRegistry.getAll.mockReturnValue([mockTool]);
      mockToolRegistry.get.mockReturnValue(mockTool);
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
          content: 'Task completed successfully',
          toolCalls: []
        });

      const agentStep = {
        name: 'agentTask',
        type: 'agent' as const,
        agentConfig: {
          maxSteps: 5,
          fallback: 'return_partial' as const,
          prompt: 'Complete the task using available tools',
          tools: ['testTool']
        }
      };

      const result = await stepExecutor.execute(agentStep, {});

      expect(result).toBe('Task completed successfully');
      expect(mockTool.handler).toHaveBeenCalled();
      expect(mockLLMClient.complete).toHaveBeenCalledTimes(2);
    });

    it('should handle dynamic agent prompts', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: 'Dynamic response',
        toolCalls: []
      });

      const dynamicPrompt = jest.fn((ctx: { task: string }) => `Execute task: ${ctx.task}`);
      const agentStep = {
        name: 'dynamicAgent',
        type: 'agent' as const,
        agentConfig: {
          maxSteps: 3,
          fallback: 'error' as const,
          prompt: dynamicPrompt,
          tools: []
        }
      };

      const context = { task: 'analyze code' };
      const result = await stepExecutor.execute(agentStep, context);

      expect(dynamicPrompt).toHaveBeenCalledWith(context);
      expect(result).toBe('Dynamic response');
    });

    it('should respect maxSteps limit', async () => {
      mockLLMClient.complete.mockResolvedValue({
        content: '',
        toolCalls: [
          {
            id: 'infinite_call',
            type: 'function',
            function: { name: 'infiniteTool', arguments: '{}' }
          }
        ]
      });

      const infiniteTool = {
        name: 'infiniteTool',
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn().mockResolvedValue('keep going')
      };

      mockToolRegistry.getAll.mockReturnValue([infiniteTool]);
      mockToolRegistry.get.mockReturnValue(infiniteTool);

      const agentStep = {
        name: 'limitedAgent',
        type: 'agent' as const,
        agentConfig: {
          maxSteps: 3,
          fallback: 'return_partial' as const,
          prompt: 'This will exceed max steps',
          tools: ['infiniteTool']
        }
      };

      const result = await stepExecutor.execute(agentStep, {});

      expect(mockLLMClient.complete).toHaveBeenCalledTimes(3);
      expect(result).toContain('Partial'); // Fallback behavior
    });

    it('should handle different fallback strategies', async () => {
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
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn().mockResolvedValue('result')
      };

      mockToolRegistry.getAll.mockReturnValue([mockTool]);
      mockToolRegistry.get.mockReturnValue(mockTool);

      // Test error fallback
      const errorAgentStep = {
        name: 'errorAgent',
        type: 'agent' as const,
        agentConfig: {
          maxSteps: 1,
          fallback: 'error' as const,
          prompt: 'This will error on max steps',
          tools: ['tool']
        }
      };

      await expect(stepExecutor.execute(errorAgentStep, {})).rejects.toThrow('Agent exceeded maximum steps');

      // Test summarize fallback
      const summarizeAgentStep = {
        name: 'summarizeAgent',
        type: 'agent' as const,
        agentConfig: {
          maxSteps: 1,
          fallback: 'summarize' as const,
          prompt: 'This will summarize on max steps',
          tools: ['tool']
        }
      };

      mockLLMClient.complete.mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'call', type: 'function', function: { name: 'tool', arguments: '{}' } }]
      }).mockResolvedValueOnce({
        content: 'Summary of conversation',
        toolCalls: []
      });

      const summarizeResult = await stepExecutor.execute(summarizeAgentStep, {});
      expect(summarizeResult).toBe('Summary of conversation');
    });

    it('should handle agent tool execution errors', async () => {
      const errorTool = {
        name: 'errorTool',
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn().mockRejectedValue(new Error('Agent tool failed'))
      };

      mockToolRegistry.getAll.mockReturnValue([errorTool]);
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

      const agentStep = {
        name: 'errorAgent',
        type: 'agent' as const,
        agentConfig: {
          maxSteps: 5,
          fallback: 'error' as const,
          prompt: 'This will cause tool error',
          tools: ['errorTool']
        }
      };

      await expect(stepExecutor.execute(agentStep, {})).rejects.toThrow('Agent tool failed');
    });
  });

  describe('unsupported step types', () => {
    it('should throw error for unknown step types', async () => {
      const unknownStep = {
        name: 'unknown',
        type: 'unknown' as any
      } as StepDefinition;

      await expect(stepExecutor.execute(unknownStep, {})).rejects.toThrow('Unsupported step type: unknown');
    });
  });

  describe('tool registry integration', () => {
    it('should request tools from registry correctly', async () => {
      const step = {
        name: 'toolStep',
        type: 'prompt' as const,
        template: 'Use tools'
      };

      mockToolRegistry.getAll.mockReturnValue([
        {
          name: 'tool1',
          schema: { type: 'object' as const, properties: {} },
          handler: jest.fn()
        },
        {
          name: 'tool2',
          schema: { type: 'object' as const, properties: {} },
          handler: jest.fn()
        }
      ]);
      mockToolRegistry.get.mockReturnValue({
        schema: { type: 'object' as const, properties: {} },
        handler: jest.fn()
      });

      mockLLMClient.complete.mockResolvedValue({
        content: 'Done',
        toolCalls: []
      });

      await stepExecutor.execute(step, {});

      expect(mockToolRegistry.getAll).toHaveBeenCalled();
      // getAll is called to retrieve all tools for prompt execution
      // get is not called in this scenario
    });

    it('should handle missing tools gracefully', async () => {
      mockToolRegistry.get.mockReturnValue(undefined);
      mockLLMClient.complete.mockResolvedValue({
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'missingTool', arguments: '{}' }
          }
        ]
      });

      const step = {
        name: 'missingToolStep',
        type: 'prompt' as const,
        template: 'Use missing tool'
      };

      await expect(stepExecutor.execute(step, {})).rejects.toThrow('Tool not found: missingTool');
    });
  });
});