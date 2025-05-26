import { Tool } from '../shared/types';
import { z } from 'zod';

export class ToolBuilder<TParams = any, TResult = any> {
  private config: Partial<Tool<TParams, TResult>> = {};

  name(name: string): this {
    this.config.name = name;
    return this;
  }

  description(description: string): this {
    this.config.description = description;
    return this;
  }

  category(category: string): this {
    this.config.category = category;
    return this;
  }

  parameters(parameters: z.ZodSchema<TParams> | Record<string, any>): this {
    this.config.parameters = parameters;
    return this;
  }

  execute(execute: Tool<TParams, TResult>['execute']): this {
    this.config.execute = execute;
    return this;
  }

  cacheable(cacheable: boolean | { ttl: number }): this {
    this.config.cacheable = cacheable;
    return this;
  }

  retryable(retryable: boolean | { maxAttempts: number; backoff?: 'linear' | 'exponential' }): this {
    this.config.retryable = retryable;
    return this;
  }

  build(): Tool<TParams, TResult> {
    if (!this.config.name) {
      throw new Error('Tool name is required');
    }
    if (!this.config.description) {
      throw new Error('Tool description is required');
    }
    if (!this.config.execute) {
      throw new Error('Tool execute function is required');
    }

    // Apply defaults
    const tool: Tool<TParams, TResult> = {
      name: this.config.name,
      description: this.config.description,
      execute: this.config.execute,
      parameters: this.config.parameters || z.any(),
      cacheable: this.config.cacheable ?? false,
      retryable: this.config.retryable ?? false,
      category: this.config.category,
    };

    // Make the tool immutable
    return Object.freeze(tool);
  }
}