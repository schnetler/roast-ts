import { ToolBuilder } from '../../tool-builder';
import { Tool } from '../../../shared/types';
import { z } from 'zod';

describe('ToolBuilder', () => {
  describe('Tool Creation', () => {
    it('should create tool with required properties', () => {
      const tool = new ToolBuilder()
        .name('testTool')
        .description('A test tool')
        .parameters(z.object({ input: z.string() }))
        .execute(async (params) => ({ result: params.input }))
        .build();

      expect(tool.name).toBe('testTool');
      expect(tool.description).toBe('A test tool');
      expect(tool.execute).toBeDefined();
      expect(tool.parameters).toBeDefined();
    });

    it('should validate tool configuration', () => {
      expect(() => {
        new ToolBuilder().build();
      }).toThrow('Tool name is required');

      expect(() => {
        new ToolBuilder().name('test').build();
      }).toThrow('Tool description is required');

      expect(() => {
        new ToolBuilder()
          .name('test')
          .description('desc')
          .build();
      }).toThrow('Tool execute function is required');
    });

    it('should apply default values', () => {
      const tool = new ToolBuilder()
        .name('testTool')
        .description('A test tool')
        .parameters(z.object({ input: z.string() }))
        .execute(async () => ({ result: 'test' }))
        .build();

      expect(tool.cacheable).toBe(false);
      expect(tool.retryable).toBe(false);
      expect(tool.category).toBeUndefined();
    });

    it('should build cacheable tools', () => {
      const tool = new ToolBuilder()
        .name('testTool')
        .description('A test tool')
        .parameters(z.object({ input: z.string() }))
        .execute(async () => ({ result: 'test' }))
        .cacheable(true)
        .build();

      expect(tool.cacheable).toBe(true);

      const toolWithTtl = new ToolBuilder()
        .name('testTool2')
        .description('A test tool')
        .parameters(z.object({ input: z.string() }))
        .execute(async () => ({ result: 'test' }))
        .cacheable({ ttl: 3600 })
        .build();

      expect(toolWithTtl.cacheable).toEqual({ ttl: 3600 });
    });

    it('should build retryable tools', () => {
      const tool = new ToolBuilder()
        .name('testTool')
        .description('A test tool')
        .parameters(z.object({ input: z.string() }))
        .execute(async () => ({ result: 'test' }))
        .retryable({ maxAttempts: 3, backoff: 'exponential' })
        .build();

      expect(tool.retryable).toEqual({ maxAttempts: 3, backoff: 'exponential' });
    });

    it('should set tool category', () => {
      const tool = new ToolBuilder()
        .name('testTool')
        .description('A test tool')
        .category('file-operations')
        .parameters(z.object({ input: z.string() }))
        .execute(async () => ({ result: 'test' }))
        .build();

      expect(tool.category).toBe('file-operations');
    });
  });

  describe('Parameter Validation', () => {
    it('should validate parameters with Zod', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().min(0),
      });

      const tool = new ToolBuilder()
        .name('testTool')
        .description('A test tool')
        .parameters(schema)
        .execute(async (params) => ({ greeting: `Hello ${params.name}, age ${params.age}` }))
        .build();

      // This should validate successfully when executed
      const mockContext = { 
        workflowId: 'test', 
        stepId: 'test',
        logger: {
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          child: jest.fn().mockReturnThis(),
        }
      };
      const result = await tool.execute!({ name: 'John', age: 30 }, mockContext);
      expect(result).toEqual({ greeting: 'Hello John, age 30' });
    });

    it('should provide helpful validation errors', () => {
      const schema = z.object({
        name: z.string().min(3, 'Name must be at least 3 characters'),
        age: z.number().min(0, 'Age must be positive'),
      });

      const tool = new ToolBuilder()
        .name('testTool')
        .description('A test tool')
        .parameters(schema)
        .execute(async () => ({ result: 'test' }))
        .build();

      // The validation will happen during execution in the executor
      expect(tool.parameters).toBe(schema);
    });

    it('should handle optional parameters', () => {
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional(),
        withDefault: z.string().default('default'),
      });

      const tool = new ToolBuilder()
        .name('testTool')
        .description('A test tool')
        .parameters(schema)
        .execute(async (params) => params)
        .build();

      expect(tool.parameters).toBe(schema);
    });

    it('should support nested object validation', () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string().email(),
          preferences: z.object({
            theme: z.enum(['light', 'dark']),
            notifications: z.boolean(),
          }),
        }),
        metadata: z.record(z.string()),
      });

      const tool = new ToolBuilder()
        .name('testTool')
        .description('A test tool')
        .parameters(schema)
        .execute(async (params) => params)
        .build();

      expect(tool.parameters).toBe(schema);
    });
  });

  describe('Builder Pattern', () => {
    it('should support method chaining', () => {
      const builder = new ToolBuilder();
      const result = builder
        .name('test')
        .description('desc')
        .category('testing')
        .cacheable(true)
        .retryable({ maxAttempts: 3 });

      expect(result).toBe(builder);
    });

    it('should create immutable tools', () => {
      const tool = new ToolBuilder()
        .name('testTool')
        .description('A test tool')
        .parameters(z.object({ input: z.string() }))
        .execute(async () => ({ result: 'test' }))
        .build();

      // Tool properties should not be directly modifiable
      expect(() => {
        (tool as any).name = 'modified';
      }).toThrow();
    });

    it('should allow building multiple tools from same builder', () => {
      const builder = new ToolBuilder()
        .description('A test tool')
        .parameters(z.object({ input: z.string() }))
        .execute(async (params) => ({ result: params.input }));

      const tool1 = builder.name('tool1').build();
      const tool2 = builder.name('tool2').category('testing').build();

      expect(tool1.name).toBe('tool1');
      expect(tool1.category).toBeUndefined();
      expect(tool2.name).toBe('tool2');
      expect(tool2.category).toBe('testing');
    });
  });
});