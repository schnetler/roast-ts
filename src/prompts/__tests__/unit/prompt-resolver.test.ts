import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PromptResolver } from '../../prompt-resolver';
import { TemplateEngine } from '../../template-engine';

describe('PromptResolver', () => {
  let resolver: PromptResolver;
  let mockLoggerInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLoggerInstance = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn(),
    };

    resolver = new PromptResolver({
      logger: mockLoggerInstance,
    });
  });

  describe('constructor', () => {
    it('should initialize with provided logger', () => {
      expect(resolver).toBeInstanceOf(PromptResolver);
    });

    it('should create default dependencies when not provided', () => {
      const resolverWithDefaults = new PromptResolver();
      expect(resolverWithDefaults).toBeInstanceOf(PromptResolver);
    });
  });

  describe('resolve', () => {
    describe('basic variable substitution', () => {
      it('should resolve simple variables', async () => {
        const template = 'Hello {{name}}!';
        const variables = { name: 'Alice' };

        const result = await resolver.resolve(template, variables);

        expect(result).toBe('Hello Alice!');
      });

      it('should resolve multiple variables', async () => {
        const template = 'Hello {{name}}, you are {{age}} years old.';
        const variables = { name: 'Alice', age: 25 };

        const result = await resolver.resolve(template, variables);

        expect(result).toBe('Hello Alice, you are 25 years old.');
      });

      it('should handle nested variables', async () => {
        const template = 'User: {{user.name}}, Email: {{user.email}}';
        const variables = { 
          user: { 
            name: 'Alice', 
            email: 'alice@example.com' 
          } 
        };

        const result = await resolver.resolve(template, variables);

        expect(result).toBe('User: Alice, Email: alice@example.com');
      });

      it('should handle array access', async () => {
        const template = 'First item: {{items.0}}, Second item: {{items.1}}';
        const variables = { items: ['apple', 'banana', 'cherry'] };

        const result = await resolver.resolve(template, variables);

        expect(result).toBe('First item: apple, Second item: banana');
      });

      it('should leave undefined variables as empty string', async () => {
        const template = 'Hello {{name}}! Your age is {{age}}.';
        const variables = { name: 'Alice' };

        const result = await resolver.resolve(template, variables);

        expect(result).toBe('Hello Alice! Your age is .');
      });
    });

    describe('built-in functions', () => {
      it('should handle uppercase function', async () => {
        const template = 'Hello {{uppercase name}}!';
        const variables = { name: 'alice' };

        const result = await resolver.resolve(template, variables);

        expect(result).toBe('Hello ALICE!');
      });

      it('should handle lowercase function', async () => {
        const template = 'Hello {{lowercase name}}!';
        const variables = { name: 'ALICE' };

        const result = await resolver.resolve(template, variables);

        expect(result).toBe('Hello alice!');
      });

      it('should handle capitalize function', async () => {
        const template = 'Hello {{capitalize name}}!';
        const variables = { name: 'alice' };

        const result = await resolver.resolve(template, variables);

        expect(result).toBe('Hello Alice!');
      });

      it('should handle truncate function', async () => {
        const template = 'Bio: {{truncate bio 10}}';
        const variables = { bio: 'This is a very long biography that should be truncated' };

        const result = await resolver.resolve(template, variables);

        expect(result).toBe('Bio: This is...');
      });

      it('should handle default function', async () => {
        const template = 'Name: {{default name "Unknown"}}';
        const variables = {};

        const result = await resolver.resolve(template, variables);

        expect(result).toBe('Name: Unknown');
      });

      it('should handle join function', async () => {
        const template = 'Items: {{join items ", "}}';
        const variables = { items: ['apple', 'banana', 'cherry'] };

        const result = await resolver.resolve(template, variables);

        expect(result).toBe('Items: apple, banana, cherry');
      });

      it('should handle length function', async () => {
        const template = 'Count: {{length items}}';
        const variables = { items: ['a', 'b', 'c'] };

        const result = await resolver.resolve(template, variables);

        expect(result).toBe('Count: 3');
      });

      it('should handle date formatting', async () => {
        const template = 'Today: {{formatDate now "YYYY-MM-DD"}}';
        const now = new Date('2023-12-25T10:30:00Z');
        const variables = { now };

        const result = await resolver.resolve(template, variables);

        expect(result).toBe('Today: 2023-12-25');
      });
    });

    describe('custom functions', () => {
      it('should allow registering custom functions', async () => {
        resolver.registerFunction('double', (value: number) => value * 2);

        const template = 'Result: {{double number}}';
        const variables = { number: 5 };

        const result = await resolver.resolve(template, variables);

        expect(result).toBe('Result: 10');
      });

      it('should handle function with multiple arguments', async () => {
        resolver.registerFunction('multiply', (a: number, b: number) => a * b);

        const template = 'Result: {{multiply x y}}';
        const variables = { x: 3, y: 4 };

        const result = await resolver.resolve(template, variables);

        expect(result).toBe('Result: 12');
      });
    });

    describe('error handling', () => {
      it('should handle function errors gracefully', async () => {
        // Create a resolver with strict mode enabled
        const strictResolver = new PromptResolver({
          templateEngine: new TemplateEngine({ strictMode: true })
        });
        
        strictResolver.registerFunction('throwError', () => {
          throw new Error('Function error');
        });

        const template = 'Result: {{throwError}}';
        const variables = {};

        await expect(strictResolver.resolve(template, variables)).rejects.toThrow('Template resolution failed');
      });
    });

    describe('system variables', () => {
      it('should provide system variables', async () => {
        const template = 'Platform: {{$.platform}}';
        const variables = {};

        const result = await resolver.resolve(template, variables);

        expect(result).toContain('Platform: ');
      });

      it('should provide timestamp', async () => {
        const template = 'Time: {{$.timestamp}}';
        const variables = {};

        const result = await resolver.resolve(template, variables);

        expect(result).toContain('Time: ');
      });
    });
  });

  describe('registerFunction', () => {
    it('should register sync functions', () => {
      const fn = (x: number) => x * 2;
      resolver.registerFunction('double', fn);
      
      expect(() => resolver.registerFunction('double', fn)).not.toThrow();
    });

    it('should register async functions', () => {
      const fn = async (x: number) => x * 2;
      resolver.registerFunction('asyncDouble', fn);
      
      expect(() => resolver.registerFunction('asyncDouble', fn)).not.toThrow();
    });
  });

  describe('registerHelper', () => {
    it('should register block helpers', () => {
      const helper = function(this: any, options: any) {
        return options.fn(this);
      };
      
      resolver.registerHelper('custom', helper);
      
      expect(() => resolver.registerHelper('custom', helper)).not.toThrow();
    });
  });

  describe('utility methods', () => {
    it('should resolve conditional templates', async () => {
      const result = await resolver.resolveConditional(
        true,
        'Hello {{name}}!',
        'Goodbye {{name}}!',
        { name: 'Alice' }
      );

      expect(result).toBe('Hello Alice!');
    });

    it('should resolve loop templates', async () => {
      const items = ['apple', 'banana'];
      const result = await resolver.resolveLoop(
        items,
        'Item: {{item}}',
        {},
        ', '
      );

      expect(result).toBe('Item: apple, Item: banana');
    });

    it('should resolve partial templates', async () => {
      const parts = ['Hello ', '{{name}}', '!'];
      const result = await resolver.resolvePartial(parts, { name: 'Alice' });

      expect(result).toBe('Hello Alice!');
    });
  });

  describe('template validation', () => {
    it('should validate correct templates', () => {
      const template = 'Hello {{name}}!';
      const validation = resolver.validateTemplate(template);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should detect mismatched delimiters', () => {
      const template = 'Hello {{name!';
      const validation = resolver.validateTemplate(template);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Mismatched delimiters: 1 opening, 0 closing');
    });
  });

  describe('variable extraction', () => {
    it('should extract variables from template', () => {
      const template = 'Hello {{name}}, you are {{age}} years old. Your email is {{user.email}}.';
      const variables = resolver.extractVariables(template);

      expect(variables).toContain('name');
      expect(variables).toContain('age');
      expect(variables).toContain('user');
    });

    it('should ignore functions and helpers', () => {
      const template = 'Hello {{uppercase name}}! Today is {{formatDate now "YYYY-MM-DD"}}.';
      const variables = resolver.extractVariables(template);

      expect(variables).toContain('name');
      expect(variables).toContain('now');
      expect(variables).not.toContain('uppercase');
      expect(variables).not.toContain('formatDate');
    });
  });
});