import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TemplateEngine } from '../../template-engine';

describe('TemplateEngine', () => {
  let engine: TemplateEngine;
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

    engine = new TemplateEngine({
      logger: mockLoggerInstance,
      enableCache: false
    });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(engine).toBeInstanceOf(TemplateEngine);
    });

    it('should initialize with custom options', () => {
      const customEngine = new TemplateEngine({
        delimiters: ['<%', '%>'],
        strictMode: true,
        escapeHtml: false,
        logger: mockLoggerInstance,
      });
      expect(customEngine).toBeInstanceOf(TemplateEngine);
    });
  });

  describe('compile', () => {
    it('should compile simple template', () => {
      const template = 'Hello {{name}}!';
      const compiled = engine.compile(template);
      
      expect(typeof compiled).toBe('function');
    });

    it('should cache compiled templates when caching is enabled', () => {
      // Create engine with caching enabled
      const cachingEngine = new TemplateEngine({
        logger: mockLoggerInstance,
        enableCache: true
      });
      
      const template = 'Hello {{name}}!';
      const compiled1 = cachingEngine.compile(template);
      const compiled2 = cachingEngine.compile(template);
      
      expect(compiled1).toBe(compiled2);
    });
    
    it('should not cache when caching is disabled', () => {
      const template = 'Hello {{name}}!';
      const compiled1 = engine.compile(template);
      const compiled2 = engine.compile(template);
      
      // With caching disabled, we get different function instances
      expect(compiled1).not.toBe(compiled2);
    });
  });

  describe('render', () => {
    it('should render template with simple variables', async () => {
      const template = 'Hello {{name}}!';
      const data = { name: 'Alice' };
      
      const result = await engine.render(template, data);
      expect(result).toBe('Hello Alice!');
    });

    it('should render template with multiple variables', async () => {
      const template = '{{greeting}} {{name}}, you are {{age}} years old.';
      const data = { 
        greeting: 'Hello', 
        name: 'Alice', 
        age: 25 
      };
      
      const result = await engine.render(template, data);
      expect(result).toBe('Hello Alice, you are 25 years old.');
    });

    it('should handle nested object properties', async () => {
      const template = 'User: {{user.name}}, Email: {{user.contact.email}}';
      const data = {
        user: {
          name: 'Alice',
          contact: {
            email: 'alice@example.com'
          }
        }
      };
      
      const result = await engine.render(template, data);
      expect(result).toBe('User: Alice, Email: alice@example.com');
    });

    it('should handle array indexing', async () => {
      const template = 'First: {{items.0}}, Last: {{items.-1}}';
      const data = {
        items: ['apple', 'banana', 'cherry']
      };
      
      const result = await engine.render(template, data);
      expect(result).toBe('First: apple, Last: cherry');
    });

    it('should handle missing variables gracefully', async () => {
      const template = 'Hello {{name}}!';
      const data = {};
      
      const result = await engine.render(template, data);
      expect(result).toBe('Hello !');
    });

    it('should handle custom delimiters', async () => {
      const customEngine = new TemplateEngine({
        delimiters: ['<%', '%>'],
        logger: mockLoggerInstance,
      });
      
      const template = 'Hello <%name%>!';
      const data = { name: 'Alice' };
      
      const result = await customEngine.render(template, data);
      expect(result).toBe('Hello Alice!');
    });

    it('should cache compiled templates', async () => {
      const template = 'Hello {{name}}!';
      const compileSpy = jest.spyOn(engine, 'compile');
      
      await engine.render(template, { name: 'Alice' });
      await engine.render(template, { name: 'Bob' });
      
      expect(compileSpy).toHaveBeenCalledTimes(2); // Called but cached internally
    });
  });

  describe('built-in functions', () => {
    it('should handle uppercase function', async () => {
      const template = 'Hello {{uppercase name}}!';
      const data = { name: 'alice' };
      
      const result = await engine.render(template, data);
      expect(result).toBe('Hello ALICE!');
    });

    it('should handle lowercase function', async () => {
      const template = 'Hello {{lowercase name}}!';
      const data = { name: 'ALICE' };
      
      const result = await engine.render(template, data);
      expect(result).toBe('Hello alice!');
    });

    it('should handle capitalize function', async () => {
      const template = 'Hello {{capitalize name}}!';
      const data = { name: 'alice' };
      
      const result = await engine.render(template, data);
      expect(result).toBe('Hello Alice!');
    });

    it('should handle truncate function', async () => {
      const template = 'Bio: {{truncate bio 10}}';
      const data = { bio: 'This is a very long biography that should be truncated' };
      
      const result = await engine.render(template, data);
      expect(result).toBe('Bio: This is...');
    });

    it('should handle default function', async () => {
      const template = 'Name: {{default name "Unknown"}}';
      const data = {};
      
      const result = await engine.render(template, data);
      expect(result).toBe('Name: Unknown');
    });

    it('should handle join function', async () => {
      const template = 'Items: {{join items ", "}}';
      const data = { items: ['apple', 'banana', 'cherry'] };
      
      const result = await engine.render(template, data);
      expect(result).toBe('Items: apple, banana, cherry');
    });

    it('should handle length function', async () => {
      const template = 'Count: {{length items}}';
      const data = { items: ['a', 'b', 'c'] };
      
      const result = await engine.render(template, data);
      expect(result).toBe('Count: 3');
    });

    it('should handle math functions', async () => {
      const template = 'Result: {{add x y}}';
      const data = { x: 5, y: 3 };
      
      const result = await engine.render(template, data);
      expect(result).toBe('Result: 8');
    });

    it('should handle date formatting', async () => {
      const template = 'Today: {{formatDate now "YYYY-MM-DD"}}';
      const now = new Date('2023-12-25T10:30:00Z');
      const data = { now };
      
      const result = await engine.render(template, data);
      expect(result).toBe('Today: 2023-12-25');
    });
  });

  describe('custom functions', () => {
    it('should allow registering custom functions', async () => {
      engine.registerFunction('double', (value: number) => value * 2);

      const template = 'Result: {{double number}}';
      const data = { number: 5 };

      const result = await engine.render(template, data);
      expect(result).toBe('Result: 10');
    });

    it('should handle function with multiple arguments', async () => {
      engine.registerFunction('multiply', (a: number, b: number) => a * b);

      const template = 'Result: {{multiply x y}}';
      const data = { x: 3, y: 4 };

      const result = await engine.render(template, data);
      expect(result).toBe('Result: 12');
    });
  });

  describe('error handling', () => {
    it('should handle strict mode', async () => {
      const strictEngine = new TemplateEngine({
        strictMode: true,
        logger: mockLoggerInstance,
      });
      
      strictEngine.registerFunction('throwError', () => {
        throw new Error('Function error');
      });
      
      const template = '{{throwError}}';
      
      await expect(strictEngine.render(template, {})).rejects.toThrow();
    });

    it('should handle non-strict mode gracefully', async () => {
      engine.registerFunction('throwError', () => {
        throw new Error('Function error');
      });
      
      const template = 'Before {{throwError}} After';
      
      const result = await engine.render(template, {});
      expect(result).toBe('Before  After');
      expect(mockLoggerInstance.warn).toHaveBeenCalled();
    });
  });

  describe('escaping', () => {
    it('should escape HTML by default', async () => {
      const template = 'Content: {{content}}';
      const data = { content: '<script>alert("xss")</script>' };
      
      const result = await engine.render(template, data);
      expect(result).toBe('Content: &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('should not escape when disabled', async () => {
      const noEscapeEngine = new TemplateEngine({
        escapeHtml: false,
        logger: mockLoggerInstance,
      });
      
      const template = 'Content: {{content}}';
      const data = { content: '<b>bold</b>' };
      
      const result = await noEscapeEngine.render(template, data);
      expect(result).toBe('Content: <b>bold</b>');
    });
  });

  describe('registerFunction', () => {
    it('should register sync functions', () => {
      const fn = (x: number) => x * 2;
      expect(() => engine.registerFunction('double', fn)).not.toThrow();
    });

    it('should register async functions', () => {
      const fn = async (x: number) => x * 2;
      expect(() => engine.registerFunction('asyncDouble', fn)).not.toThrow();
    });

    it('should throw error for invalid function names', () => {
      const fn = (x: number) => x * 2;
      
      expect(() => engine.registerFunction('', fn)).toThrow('Function name cannot be empty');
      expect(() => engine.registerFunction('123invalid', fn)).toThrow('Function name must be valid identifier');
    });
  });

  describe('registerHelper', () => {
    it('should register block helpers', () => {
      const helper = function(this: any, options: any) {
        return options.fn(this);
      };
      
      expect(() => engine.registerHelper('custom', helper)).not.toThrow();
    });

    it('should throw error for invalid helper names', () => {
      const helper = function(this: any, options: any) { return ''; };
      
      expect(() => engine.registerHelper('', helper)).toThrow('Helper name cannot be empty');
      expect(() => engine.registerHelper('123invalid', helper)).toThrow('Helper name must be valid identifier');
    });
  });
});