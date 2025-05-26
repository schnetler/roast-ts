import { describe, it, expect, beforeEach } from '@jest/globals';
import { PromptResolver } from '../../prompt-resolver';

describe('PromptResolver - Built-in Functions (Simple Syntax)', () => {
  let resolver: PromptResolver;

  beforeEach(() => {
    resolver = new PromptResolver();
  });

  describe('Comparison Functions', () => {
    it('should handle eq function', async () => {
      // Since we don't have if/else, we'll test the function directly
      resolver.registerFunction('testEq', (value: any) => {
        const fn = (resolver as any).templateEngine.functions.get('eq');
        return fn(value, 10) ? 'equal' : 'not equal';
      });
      
      expect(await resolver.resolve('{{testEq value}}', { value: 10 })).toBe('equal');
      expect(await resolver.resolve('{{testEq value}}', { value: 5 })).toBe('not equal');
    });

    it('should test comparison functions exist', () => {
      const engine = (resolver as any).templateEngine;
      expect(engine.functions.has('eq')).toBe(true);
      expect(engine.functions.has('ne')).toBe(true);
      expect(engine.functions.has('gt')).toBe(true);
      expect(engine.functions.has('gte')).toBe(true);
      expect(engine.functions.has('lt')).toBe(true);
      expect(engine.functions.has('lte')).toBe(true);
    });
  });

  describe('Logical Functions', () => {
    it('should test logical functions exist', () => {
      const engine = (resolver as any).templateEngine;
      expect(engine.functions.has('and')).toBe(true);
      expect(engine.functions.has('or')).toBe(true);
      expect(engine.functions.has('not')).toBe(true);
    });

    it('should handle not function', async () => {
      resolver.registerFunction('testNot', (value: any) => {
        const fn = (resolver as any).templateEngine.functions.get('not');
        return fn(value) ? 'yes' : 'no';
      });
      
      expect(await resolver.resolve('{{testNot value}}', { value: false })).toBe('yes');
      expect(await resolver.resolve('{{testNot value}}', { value: true })).toBe('no');
    });
  });

  describe('String Manipulation Functions', () => {
    it('should handle trim function', async () => {
      const result = await resolver.resolve('{{trim text}}', { text: '  hello world  ' });
      expect(result).toBe('hello world');
    });

    it('should handle replace function', async () => {
      const result = await resolver.resolve('{{replace text "world" "universe"}}', 
        { text: 'hello world, wonderful world' });
      expect(result).toBe('hello universe, wonderful universe');
    });

    it('should handle split function', async () => {
      // Test that split returns an array by checking with a custom function
      resolver.registerFunction('splitAndJoin', (text: string, sep: string) => {
        const fn = (resolver as any).templateEngine.functions.get('split');
        const parts = fn(text, sep);
        return parts.join(';');
      });
      
      const result = await resolver.resolve('{{splitAndJoin text ","}}', { text: 'a,b,c' });
      expect(result).toBe('a;b;c');
    });

    it('should handle substring function', async () => {
      expect(await resolver.resolve('{{substring text 0 5}}', { text: 'hello world' })).toBe('hello');
      expect(await resolver.resolve('{{substring text 6}}', { text: 'hello world' })).toBe('world');
    });
  });

  describe('Array Manipulation Functions', () => {
    it('should handle first/last functions', async () => {
      const arr = [1, 2, 3, 4, 5];
      expect(await resolver.resolve('{{first items}}', { items: arr })).toBe('1');
      expect(await resolver.resolve('{{last items}}', { items: arr })).toBe('5');
      
      // Edge cases - these might return empty string or undefined
      const emptyResult = await resolver.resolve('{{first items}}', { items: [] });
      expect(emptyResult === '' || emptyResult === 'undefined').toBe(true);
    });

    it('should handle slice function', async () => {
      resolver.registerFunction('sliceAndJoin', (arr: any[], start: number, end?: number) => {
        const fn = (resolver as any).templateEngine.functions.get('slice');
        const sliced = fn(arr, start, end);
        return sliced.join(',');
      });
      
      const arr = [1, 2, 3, 4, 5];
      const result = await resolver.resolve('{{sliceAndJoin items 1 3}}', { items: arr });
      expect(result).toBe('2,3');
    });

    it('should handle filter function', async () => {
      resolver.registerFunction('filterByAge', (items: any[], age: number) => {
        const fn = (resolver as any).templateEngine.functions.get('filter');
        const filtered = fn(items, 'age', age);
        return filtered.map((i: any) => i.name).join(',');
      });
      
      const items = [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 },
        { name: 'Charlie', age: 25 }
      ];
      
      const result = await resolver.resolve('{{filterByAge items 25}}', { items });
      expect(result).toBe('Alice,Charlie');
    });

    it('should handle sort function', async () => {
      resolver.registerFunction('sortAndJoin', (arr: any[], prop?: string) => {
        const fn = (resolver as any).templateEngine.functions.get('sort');
        const sorted = fn(arr, prop);
        if (prop) {
          return sorted.map((i: any) => i[prop]).join(',');
        }
        return sorted.join(',');
      });
      
      const items = [
        { name: 'Charlie', age: 25 },
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 20 }
      ];
      
      const result = await resolver.resolve('{{sortAndJoin items "name"}}', { items });
      expect(result).toBe('Alice,Bob,Charlie');
      
      const numbers = [3, 1, 4, 1, 5];
      const result2 = await resolver.resolve('{{sortAndJoin numbers}}', { numbers });
      expect(result2).toBe('1,1,3,4,5');
    });
  });

  describe('Object Manipulation Functions', () => {
    it('should handle keys function', async () => {
      resolver.registerFunction('keysJoined', (obj: any) => {
        const fn = (resolver as any).templateEngine.functions.get('keys');
        return fn(obj).join(',');
      });
      
      const obj = { a: 1, b: 2, c: 3 };
      const result = await resolver.resolve('{{keysJoined obj}}', { obj });
      expect(result).toBe('a,b,c');
    });

    it('should handle values function', async () => {
      resolver.registerFunction('valuesJoined', (obj: any) => {
        const fn = (resolver as any).templateEngine.functions.get('values');
        return fn(obj).join(',');
      });
      
      const obj = { a: 1, b: 2, c: 3 };
      const result = await resolver.resolve('{{valuesJoined obj}}', { obj });
      expect(result).toBe('1,2,3');
    });

    it('should handle entries function', async () => {
      resolver.registerFunction('entriesFormatted', (obj: any) => {
        const fn = (resolver as any).templateEngine.functions.get('entries');
        return fn(obj).map(([k, v]: [string, any]) => `${k}=${v}`).join(',');
      });
      
      const obj = { a: 1, b: 2 };
      const result = await resolver.resolve('{{entriesFormatted obj}}', { obj });
      expect(result).toBe('a=1,b=2');
    });
  });

  describe('Type Checking Functions', () => {
    it('should handle isArray function', async () => {
      resolver.registerFunction('checkArray', (value: any) => {
        const fn = (resolver as any).templateEngine.functions.get('isArray');
        return fn(value) ? 'yes' : 'no';
      });
      
      expect(await resolver.resolve('{{checkArray value}}', { value: [] })).toBe('yes');
      expect(await resolver.resolve('{{checkArray value}}', { value: {} })).toBe('no');
    });

    it('should handle isEmpty function', async () => {
      resolver.registerFunction('checkEmpty', (value: any) => {
        const fn = (resolver as any).templateEngine.functions.get('isEmpty');
        return fn(value) ? 'yes' : 'no';
      });
      
      // Test various empty values
      expect(await resolver.resolve('{{checkEmpty value}}', { value: null })).toBe('yes');
      expect(await resolver.resolve('{{checkEmpty value}}', { value: '' })).toBe('yes');
      expect(await resolver.resolve('{{checkEmpty value}}', { value: [] })).toBe('yes');
      expect(await resolver.resolve('{{checkEmpty value}}', { value: {} })).toBe('yes');
      
      // Test non-empty values
      expect(await resolver.resolve('{{checkEmpty value}}', { value: 'text' })).toBe('no');
      expect(await resolver.resolve('{{checkEmpty value}}', { value: [1] })).toBe('no');
      expect(await resolver.resolve('{{checkEmpty value}}', { value: { a: 1 } })).toBe('no');
      expect(await resolver.resolve('{{checkEmpty value}}', { value: 0 })).toBe('no');
      expect(await resolver.resolve('{{checkEmpty value}}', { value: false })).toBe('no');
    });

    it('should test all type checking functions exist', () => {
      const engine = (resolver as any).templateEngine;
      const typeFunctions = [
        'isArray', 'isObject', 'isString', 'isNumber', 
        'isBoolean', 'isDefined', 'isNull', 'isEmpty'
      ];
      
      typeFunctions.forEach(fn => {
        expect(engine.functions.has(fn)).toBe(true);
      });
    });
  });

  describe('Formatting Functions', () => {
    it('should handle json function', async () => {
      const obj = { a: 1, b: 2 };
      expect(await resolver.resolve('{{json obj}}', { obj })).toBe('{"a":1,"b":2}');
      expect(await resolver.resolve('{{json obj true}}', { obj })).toBe('{\n  "a": 1,\n  "b": 2\n}');
    });

    it('should handle url function', async () => {
      expect(await resolver.resolve('{{url text}}', { text: 'hello world' })).toBe('hello%20world');
      expect(await resolver.resolve('{{url text}}', { text: 'a&b=c' })).toBe('a%26b%3Dc');
    });

    it('should handle base64 function', async () => {
      const result = await resolver.resolve('{{base64 text}}', { text: 'hello' });
      expect(result).toBe(Buffer.from('hello').toString('base64'));
    });

    it('should handle hash function', async () => {
      const result = await resolver.resolve('{{hash text}}', { text: 'hello' });
      expect(result).toMatch(/^[a-f0-9]{64}$/); // SHA256 produces 64 hex chars
      
      const result2 = await resolver.resolve('{{hash text "md5"}}', { text: 'hello' });
      expect(result2).toMatch(/^[a-f0-9]{32}$/); // MD5 produces 32 hex chars
    });
  });

  describe('Special Functions', () => {
    it('should handle include function', async () => {
      const result = await resolver.resolve('{{include "header"}}', {});
      expect(result).toBe('[Included: header]');
    });
  });
});