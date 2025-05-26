import { Tool, ToolContext, ToolExecutionResult } from '../shared/types';
import { z } from 'zod';

export type ToolMiddleware = (
  tool: Tool,
  params: any,
  context: ToolContext,
  next: () => Promise<ToolExecutionResult>
) => Promise<ToolExecutionResult>;

export class ToolExecutor {
  private middlewares: ToolMiddleware[] = [];
  private cache = new Map<string, { result: any; expiry: number }>();
  private rateLimitQueue: Promise<void> = Promise.resolve();
  private concurrentCount = 0;
  private maxConcurrent = Infinity;

  use(middleware: ToolMiddleware): void {
    this.middlewares.push(middleware);
  }

  async execute<TParams = any, TResult = any>(
    tool: Tool<TParams, TResult>,
    params: TParams,
    context: ToolContext
  ): Promise<ToolExecutionResult<TResult>> {
    const startTime = Date.now();

    try {
      // Build middleware chain
      const chain = this.buildMiddlewareChain(tool, params, context);
      
      // Execute chain
      const result = await chain();
      
      return {
        ...result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        duration: Date.now() - startTime,
      };
    }
  }

  private buildMiddlewareChain(
    tool: Tool,
    params: any,
    context: ToolContext
  ): () => Promise<ToolExecutionResult> {
    // Core execution function
    const executeCore = async (): Promise<ToolExecutionResult> => {
      try {
        // Validate parameters
        const validatedParams = await this.validateParameters(tool, params);
        
        // Execute tool - check for both execute and handler
        const executeFn = tool.execute || tool.handler;
        if (!executeFn) {
          throw new Error(`Tool "${tool.name}" has no execute or handler function`);
        }
        
        const result = await executeFn(validatedParams, context);
        
        return {
          success: true,
          result,
        };
      } catch (error) {
        return {
          success: false,
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        };
      }
    };

    // Build middleware chain
    return this.middlewares.reduceRight<() => Promise<ToolExecutionResult>>(
      (next, middleware) => {
        return () => middleware(tool, params, context, next);
      },
      executeCore
    );
  }

  private async validateParameters(tool: Tool, params: any): Promise<any> {
    if (!tool.parameters) {
      return params;
    }

    // Check if it's a Zod schema
    if ('parse' in tool.parameters) {
      try {
        return tool.parameters.parse(params);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new Error(`Invalid parameters: ${error.message}`);
        }
        throw error;
      }
    }

    // Handle plain object schema validation
    if (tool.parameters.type === 'object' && tool.parameters.required) {
      for (const required of tool.parameters.required) {
        if (!(required in params)) {
          throw new Error(`Missing required parameter: ${required}`);
        }
      }
    }

    return params;
  }

  // Built-in middleware methods
  useCaching(): void {
    this.use(async (tool, params, context, next) => {
      if (!tool.cacheable) {
        return next();
      }

      const cacheKey = `${tool.name}:${JSON.stringify(params)}`;
      const cached = this.cache.get(cacheKey);

      if (cached && cached.expiry > Date.now()) {
        return {
          success: true,
          result: cached.result,
          cached: true,
        };
      }

      const result = await next();

      if (result.success && tool.cacheable) {
        const ttl = typeof tool.cacheable === 'object' ? tool.cacheable.ttl : 3600000;
        this.cache.set(cacheKey, {
          result: result.result,
          expiry: Date.now() + ttl,
        });
      }

      return result;
    });
  }

  useRetry(): void {
    this.use(async (tool, params, context, next) => {
      if (!tool.retryable) {
        return next();
      }

      const config = typeof tool.retryable === 'object' 
        ? tool.retryable 
        : { maxAttempts: 3, backoff: 'exponential' };

      let lastError: Error | undefined;
      
      for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
        try {
          const result = await next();
          if (result.success) {
            return result;
          }
          lastError = new Error(result.error?.message || 'Unknown error');
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }

        if (attempt < config.maxAttempts) {
          const delay = config.backoff === 'exponential' 
            ? Math.pow(2, attempt - 1) * 1000 
            : attempt * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      throw lastError || new Error('All retry attempts failed');
    });
  }

  useRateLimit(options: { maxConcurrent: number }): void {
    this.maxConcurrent = options.maxConcurrent;

    this.use(async (tool, params, context, next) => {
      // Wait for our turn
      while (this.concurrentCount >= this.maxConcurrent) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      this.concurrentCount++;
      try {
        return await next();
      } finally {
        this.concurrentCount--;
      }
    });
  }

  useLogging(): void {
    this.use(async (tool, params, context, next) => {
      context.logger.info(`Executing tool: ${tool.name}`, {
        tool: tool.name,
        params,
      });

      const result = await next();

      if (result.success) {
        context.logger.debug(`Tool executed successfully: ${tool.name}`, {
          tool: tool.name,
          duration: result.duration,
        });
      } else {
        context.logger.error(`Tool execution failed: ${tool.name}`, {
          tool: tool.name,
          error: result.error,
        });
      }

      return result;
    });
  }

  useTimeout(): void {
    this.use(async (tool, params, context, next) => {
      if (!tool.timeout) {
        return next();
      }

      const timeoutPromise = new Promise<ToolExecutionResult>((_, reject) => {
        setTimeout(() => reject(new Error(`Tool execution timeout after ${tool.timeout}ms`)), tool.timeout);
      });

      return Promise.race([next(), timeoutPromise]);
    });
  }
}