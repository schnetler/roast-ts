import { ToolExecutor } from '../../tool-executor';
import { Tool, ToolContext, ToolExecutionResult } from '../../../shared/types';
import { z } from 'zod';

describe('ToolExecutor', () => {
  let executor: ToolExecutor;
  let mockTool: Tool;
  let mockContext: ToolContext;

  beforeEach(() => {
    executor = new ToolExecutor();
    mockContext = {
      workflowId: 'test-workflow',
      stepId: 'test-step',
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn().mockReturnThis(),
      },
    };

    mockTool = {
      name: 'testTool',
      description: 'A test tool',
      parameters: z.object({
        input: z.string(),
        count: z.number().optional(),
      }),
      execute: jest.fn().mockResolvedValue({ result: 'success' }),
    };
  });

  describe('Execution', () => {
    it('should execute tools with valid parameters', async () => {
      const params = { input: 'test', count: 5 };
      const result = await executor.execute(mockTool, params, mockContext);

      expect(result).toEqual({
        success: true,
        result: { result: 'success' },
        duration: expect.any(Number),
      });

      expect(mockTool.execute).toHaveBeenCalledWith(params, mockContext);
    });

    it('should validate parameters before execution', async () => {
      const invalidParams = { input: 123, count: 'not a number' };
      const result = await executor.execute(mockTool, invalidParams, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Invalid parameters');
      expect(mockTool.execute).not.toHaveBeenCalled();
    });

    it('should handle execution errors', async () => {
      const errorTool = {
        ...mockTool,
        execute: jest.fn().mockRejectedValue(new Error('Execution failed')),
      };

      const result = await executor.execute(errorTool, { input: 'test' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Execution failed');
    });

    it('should return typed results', async () => {
      const typedTool: Tool<{ name: string }, { greeting: string }> = {
        name: 'greetTool',
        description: 'Greets a user',
        parameters: z.object({ name: z.string() }),
        execute: async (params) => ({ greeting: `Hello, ${params.name}!` }),
      };

      const result = await executor.execute(typedTool, { name: 'John' }, mockContext);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ greeting: 'Hello, John!' });
    });

    it('should measure execution duration', async () => {
      // Use real timers for this test
      jest.useRealTimers();
      
      const slowTool = {
        ...mockTool,
        execute: jest.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { result: 'slow' };
        }),
      };

      const result = await executor.execute(slowTool, { input: 'test' }, mockContext);

      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThanOrEqual(90); // Allow for slight timing variations
      
      // Restore fake timers
      jest.useFakeTimers();
    });

    it('should handle tools with plain object parameters', async () => {
      const plainTool: Tool = {
        name: 'plainTool',
        description: 'Tool with plain parameters',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string' },
          },
          required: ['input'],
        },
        execute: jest.fn().mockResolvedValue({ result: 'plain' }),
      };

      const result = await executor.execute(plainTool, { input: 'test' }, mockContext);

      expect(result.success).toBe(true);
      expect(plainTool.execute).toHaveBeenCalled();
    });
  });

  describe('Middleware Chain', () => {
    it('should apply middleware in order', async () => {
      const callOrder: string[] = [];

      executor.use(async (tool, params, context, next) => {
        callOrder.push('middleware1-before');
        const result = await next();
        callOrder.push('middleware1-after');
        return result;
      });

      executor.use(async (tool, params, context, next) => {
        callOrder.push('middleware2-before');
        const result = await next();
        callOrder.push('middleware2-after');
        return result;
      });

      mockTool.execute = jest.fn().mockImplementation(async () => {
        callOrder.push('execute');
        return { result: 'success' };
      });

      await executor.execute(mockTool, { input: 'test' }, mockContext);

      expect(callOrder).toEqual([
        'middleware1-before',
        'middleware2-before',
        'execute',
        'middleware2-after',
        'middleware1-after',
      ]);
    });

    it('should short-circuit on middleware errors', async () => {
      const errorMiddleware = async () => {
        throw new Error('Middleware error');
      };

      const nextMiddleware = jest.fn();

      executor.use(errorMiddleware);
      executor.use(nextMiddleware);

      const result = await executor.execute(mockTool, { input: 'test' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Middleware error');
      expect(nextMiddleware).not.toHaveBeenCalled();
      expect(mockTool.execute).not.toHaveBeenCalled();
    });

    it('should pass context through chain', async () => {
      const contextValues: any[] = [];

      executor.use(async (tool, params, context, next) => {
        context.middlewareData = { value: 1 };
        contextValues.push({ ...context, middlewareData: { ...context.middlewareData } });
        return next();
      });

      executor.use(async (tool, params, context, next) => {
        if (!context.middlewareData) {
          context.middlewareData = {};
        }
        context.middlewareData.value = 2;
        contextValues.push({ ...context, middlewareData: { ...context.middlewareData } });
        return next();
      });

      mockTool.execute = jest.fn().mockImplementation(async (params, context) => {
        contextValues.push({ ...context, middlewareData: { ...context.middlewareData } });
        return { result: 'success' };
      });

      await executor.execute(mockTool, { input: 'test' }, mockContext);

      expect(contextValues[0].middlewareData).toEqual({ value: 1 });
      expect(contextValues[1].middlewareData).toEqual({ value: 2 });
      expect(contextValues[2].middlewareData).toEqual({ value: 2 });
    });

    it('should handle async middleware', async () => {
      // Use real timers
      jest.useRealTimers();
      
      const delays: number[] = [];

      executor.use(async (tool, params, context, next) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        delays.push(50);
        return next();
      });

      executor.use(async (tool, params, context, next) => {
        await new Promise(resolve => setTimeout(resolve, 30));
        delays.push(30);
        return next();
      });

      const startTime = Date.now();
      await executor.execute(mockTool, { input: 'test' }, mockContext);
      const duration = Date.now() - startTime;

      expect(delays).toEqual([50, 30]);
      expect(duration).toBeGreaterThanOrEqual(80);
      
      // Restore fake timers
      jest.useFakeTimers();
    });

    it('should allow middleware to modify results', async () => {
      executor.use(async (tool, params, context, next) => {
        const result = await next();
        if (result.success && result.result) {
          result.result.modified = true;
        }
        return result;
      });

      const result = await executor.execute(mockTool, { input: 'test' }, mockContext);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ result: 'success', modified: true });
    });

    it('should allow middleware to transform errors', async () => {
      executor.use(async (tool, params, context, next) => {
        const result = await next();
        if (!result.success && result.error) {
          return {
            success: false,
            error: {
              message: `Wrapped: ${result.error.message}`,
              stack: result.error.stack
            }
          };
        }
        return result;
      });

      const errorTool = {
        ...mockTool,
        execute: jest.fn().mockRejectedValue(new Error('Original error')),
      };

      const result = await executor.execute(errorTool, { input: 'test' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Wrapped: Original error');
    });
  });

  describe('Built-in Middleware', () => {
    it('should support caching middleware', async () => {
      const cacheableTool = {
        ...mockTool,
        cacheable: { ttl: 1000 },
      };

      executor.useCaching();

      // First call
      const result1 = await executor.execute(cacheableTool, { input: 'test' }, mockContext);
      expect(cacheableTool.execute).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await executor.execute(cacheableTool, { input: 'test' }, mockContext);
      expect(cacheableTool.execute).toHaveBeenCalledTimes(1);
      expect(result2.success).toBe(true);
      expect(result2.result).toEqual(result1.result);
      expect(result2.cached).toBe(true);

      // Different params - should not use cache
      await executor.execute(cacheableTool, { input: 'different' }, mockContext);
      expect(cacheableTool.execute).toHaveBeenCalledTimes(2);
    });

    it('should support retry middleware', async () => {
      // Use real timers
      jest.useRealTimers();
      
      const retryableTool = {
        ...mockTool,
        retryable: { maxAttempts: 3, backoff: 'exponential' as const },
        execute: jest.fn()
          .mockRejectedValueOnce(new Error('Attempt 1'))
          .mockRejectedValueOnce(new Error('Attempt 2'))
          .mockResolvedValueOnce({ result: 'success' }),
      };

      executor.useRetry();

      const result = await executor.execute(retryableTool, { input: 'test' }, mockContext);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ result: 'success' });
      expect(retryableTool.execute).toHaveBeenCalledTimes(3);
      
      // Restore fake timers
      jest.useFakeTimers();
    }, 10000); // Increase timeout since retries take time

    it('should support rate limiting middleware', async () => {
      // Use real timers
      jest.useRealTimers();
      
      executor.useRateLimit({ maxConcurrent: 2 });

      const slowTool = {
        ...mockTool,
        execute: jest.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { result: 'slow' };
        }),
      };

      // Start 3 executions concurrently
      const startTime = Date.now();
      const promises = [
        executor.execute(slowTool, { input: '1' }, mockContext),
        executor.execute(slowTool, { input: '2' }, mockContext),
        executor.execute(slowTool, { input: '3' }, mockContext),
      ];

      await Promise.all(promises);
      const duration = Date.now() - startTime;

      // With max 2 concurrent, should take at least 200ms
      expect(duration).toBeGreaterThanOrEqual(200);
      
      // Restore fake timers
      jest.useFakeTimers();
    });

    it('should support logging middleware', async () => {
      executor.useLogging();

      await executor.execute(mockTool, { input: 'test' }, mockContext);

      expect(mockContext.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Executing tool: testTool'),
        expect.any(Object)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle parameter validation for non-Zod schemas', async () => {
      const tool: Tool = {
        name: 'plainTool',
        description: 'Tool with plain schema',
        parameters: {
          type: 'object',
          properties: {
            required: { type: 'string' },
          },
          required: ['required'],
        },
        execute: jest.fn(),
      };

      const result = await executor.execute(tool, { notRequired: 'value' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Missing required parameter: required');
    });

    it('should handle timeout', async () => {
      // Use real timers
      jest.useRealTimers();
      
      const timeoutTool = {
        ...mockTool,
        timeout: 100,
        execute: jest.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return { result: 'late' };
        }),
      };

      executor.useTimeout();

      const result = await executor.execute(timeoutTool, { input: 'test' }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timeout');
      
      // Restore fake timers
      jest.useFakeTimers();
    });
  });
});