import { ToolRegistry } from '../../tool-registry';
import { Tool } from '../../../shared/types';
import { z } from 'zod';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let mockTool: Tool;

  beforeEach(() => {
    registry = new ToolRegistry();
    mockTool = {
      name: 'testTool',
      description: 'A test tool',
      category: 'testing',
      parameters: z.object({ input: z.string() }),
      execute: jest.fn().mockResolvedValue({ result: 'test' }),
    };
  });

  describe('Registration', () => {
    it('should register new tools', () => {
      registry.register(mockTool);
      const registered = registry.get('testTool');
      expect(registered).toBeDefined();
      expect(registered?.name).toBe('testTool');
      expect(registered?.description).toBe('A test tool');
      expect(registered?.category).toBe('testing');
    });

    it('should prevent duplicate registration', () => {
      registry.register(mockTool);
      expect(() => registry.register(mockTool)).toThrow('Tool testTool is already registered');
    });

    it('should organize tools by category', () => {
      const tool1 = { ...mockTool, name: 'tool1', category: 'file' };
      const tool2 = { ...mockTool, name: 'tool2', category: 'file' };
      const tool3 = { ...mockTool, name: 'tool3', category: 'network' };

      registry.register(tool1);
      registry.register(tool2);
      registry.register(tool3);

      const fileTools = registry.getByCategory('file');
      expect(fileTools).toHaveLength(2);
      expect(fileTools.map(t => t.name)).toEqual(['tool1', 'tool2']);

      const networkTools = registry.getByCategory('network');
      expect(networkTools).toHaveLength(1);
      expect(networkTools[0].name).toBe('tool3');
    });

    it('should validate tool interfaces', () => {
      const invalidTool = {
        name: '',
        description: 'Invalid tool',
      } as any;

      expect(() => registry.register(invalidTool)).toThrow('Invalid tool: name cannot be empty');

      const toolWithoutExecute = {
        name: 'noExecute',
        description: 'Tool without execute',
        parameters: z.object({}),
      } as any;

      expect(() => registry.register(toolWithoutExecute)).toThrow('Invalid tool: execute or handler function is required');
    });

    it('should handle tools without category', () => {
      const uncategorizedTool = { ...mockTool, category: undefined };
      registry.register(uncategorizedTool);
      
      const uncategorized = registry.getByCategory(undefined);
      expect(uncategorized).toHaveLength(1);
      expect(uncategorized[0].name).toBe('testTool');
    });

    it('should allow force registration to override existing tools', () => {
      registry.register(mockTool);
      
      const updatedTool = { ...mockTool, description: 'Updated description' };
      registry.register(updatedTool, { force: true });
      
      expect(registry.get('testTool')?.description).toBe('Updated description');
    });
  });

  describe('Discovery', () => {
    beforeEach(() => {
      registry.register({ ...mockTool, name: 'readFile', category: 'file' });
      registry.register({ ...mockTool, name: 'writeFile', category: 'file' });
      registry.register({ ...mockTool, name: 'httpGet', category: 'network' });
      registry.register({ ...mockTool, name: 'grep', category: 'search' });
    });

    it('should find tools by name', () => {
      expect(registry.get('readFile')).toBeDefined();
      expect(registry.get('readFile')?.name).toBe('readFile');
      expect(registry.get('nonExistent')).toBeUndefined();
    });

    it('should list tools by category', () => {
      const fileTools = registry.getByCategory('file');
      expect(fileTools.map(t => t.name)).toEqual(['readFile', 'writeFile']);
    });

    it('should generate LLM schemas', () => {
      const schemas = registry.getSchemas();
      
      expect(schemas).toHaveLength(4);
      expect(schemas[0]).toEqual({
        name: 'readFile',
        description: mockTool.description,
        parameters: expect.any(Object),
      });

      // Verify schema can be used for LLM function calling
      const readFileSchema = schemas.find(s => s.name === 'readFile');
      expect(readFileSchema).toBeDefined();
      expect(readFileSchema?.parameters).toBeDefined();
    });

    it('should support tool queries', () => {
      // Query by name pattern
      const fileTools = registry.query({ namePattern: /File$/ });
      expect(fileTools.map(t => t.name)).toEqual(['readFile', 'writeFile']);

      // Query by category
      const networkTools = registry.query({ category: 'network' });
      expect(networkTools.map(t => t.name)).toEqual(['httpGet']);

      // Query by multiple criteria
      const readTools = registry.query({ 
        namePattern: /^read/,
        category: 'file' 
      });
      expect(readTools.map(t => t.name)).toEqual(['readFile']);
    });

    it('should list all tools', () => {
      const allTools = registry.getAll();
      expect(allTools).toHaveLength(4);
      expect(allTools.map(t => t.name).sort()).toEqual(['grep', 'httpGet', 'readFile', 'writeFile']);
    });

    it('should list all categories', () => {
      const categories = registry.getCategories();
      expect(categories.sort()).toEqual(['file', 'network', 'search']);
    });
  });

  describe('Schema Generation', () => {
    it('should generate schemas compatible with OpenAI function calling', () => {
      const complexTool: Tool = {
        name: 'complexTool',
        description: 'A complex tool for testing',
        parameters: z.object({
          path: z.string().describe('File path'),
          options: z.object({
            recursive: z.boolean().optional().describe('Search recursively'),
            maxDepth: z.number().int().min(1).optional().describe('Maximum depth'),
          }).optional(),
          filters: z.array(z.string()).optional().describe('Filter patterns'),
        }),
        execute: jest.fn(),
      };

      registry.register(complexTool);
      const schemas = registry.getSchemas();
      const complexSchema = schemas.find(s => s.name === 'complexTool');

      expect(complexSchema).toEqual({
        name: 'complexTool',
        description: 'A complex tool for testing',
        parameters: expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            path: expect.objectContaining({
              type: 'string',
              description: 'File path',
            }),
            options: expect.objectContaining({
              type: 'object',
              properties: expect.objectContaining({
                recursive: expect.objectContaining({
                  type: 'boolean',
                  description: 'Search recursively',
                }),
                maxDepth: expect.objectContaining({
                  type: 'integer',
                  minimum: 1,
                  description: 'Maximum depth',
                }),
              }),
            }),
            filters: expect.objectContaining({
              type: 'array',
              items: expect.objectContaining({
                type: 'string',
              }),
              description: 'Filter patterns',
            }),
          }),
          required: ['path'],
        }),
      });
    });

    it('should handle tools with plain object parameters', () => {
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
        execute: jest.fn(),
      };

      registry.register(plainTool);
      const schemas = registry.getSchemas();
      const plainSchema = schemas.find(s => s.name === 'plainTool');

      expect(plainSchema?.parameters).toEqual(plainTool.parameters);
    });
  });

  describe('Bulk Operations', () => {
    it('should register multiple tools at once', () => {
      const tools = [
        { ...mockTool, name: 'tool1' },
        { ...mockTool, name: 'tool2' },
        { ...mockTool, name: 'tool3' },
      ];

      registry.registerAll(tools);

      expect(registry.getAll()).toHaveLength(3);
      expect(registry.get('tool1')).toBeDefined();
      expect(registry.get('tool2')).toBeDefined();
      expect(registry.get('tool3')).toBeDefined();
    });

    it('should clear all tools', () => {
      registry.register({ ...mockTool, name: 'tool1' });
      registry.register({ ...mockTool, name: 'tool2' });

      expect(registry.getAll()).toHaveLength(2);

      registry.clear();

      expect(registry.getAll()).toHaveLength(0);
      expect(registry.get('tool1')).toBeUndefined();
    });

    it('should remove specific tool', () => {
      registry.register({ ...mockTool, name: 'tool1' });
      registry.register({ ...mockTool, name: 'tool2' });

      registry.remove('tool1');

      expect(registry.get('tool1')).toBeUndefined();
      expect(registry.get('tool2')).toBeDefined();
      expect(registry.getAll()).toHaveLength(1);
    });
  });
});