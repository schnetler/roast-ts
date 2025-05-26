import {
  deepmerge,
  sleep,
  retry,
  debounce,
  throttle,
  timeout,
  chunk,
  formatBytes,
  createId,
  safeJsonParse,
  pick,
  omit
} from '../../utils';

describe('utils', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  describe('deepmerge', () => {
    describe('all', () => {
      it('should return empty object for empty array', () => {
        const result = deepmerge.all([]);
        expect(result).toEqual({});
      });

      it('should return single object for array with one element', () => {
        const obj = { a: 1, b: { c: 2 } };
        const result = deepmerge.all([obj]);
        expect(result).toEqual(obj);
      });

      it('should merge multiple objects', () => {
        const obj1 = { a: 1, b: { c: 2 } };
        const obj2 = { b: { d: 3 }, e: 4 };
        const obj3 = { b: { c: 5, f: 6 } };
        
        const result = deepmerge.all<any>([obj1, obj2, obj3]);
        
        expect(result).toEqual({
          a: 1,
          b: { c: 5, d: 3, f: 6 },
          e: 4
        });
      });

      it('should handle null and undefined in array', () => {
        const obj1 = { a: 1 };
        const result = deepmerge.all([obj1, null as any, undefined as any]);
        expect(result).toEqual({ a: 1 });
      });
    });

    describe('merge', () => {
      it('should return target if source is not an object', () => {
        const target = { a: 1 };
        
        expect(deepmerge.merge(target, null)).toEqual(target);
        expect(deepmerge.merge(target, undefined)).toEqual(target);
        expect(deepmerge.merge(target, 'string')).toEqual(target);
        expect(deepmerge.merge(target, 123)).toEqual(target);
        expect(deepmerge.merge(target, true)).toEqual(target);
      });

      it('should merge nested objects', () => {
        const target = { 
          a: 1, 
          b: { c: 2, d: 3 },
          e: { f: { g: 4 } }
        };
        const source = { 
          b: { c: 5, h: 6 },
          e: { f: { i: 7 } },
          j: 8
        };
        
        const result = deepmerge.merge(target, source);
        
        expect(result).toEqual({
          a: 1,
          b: { c: 5, d: 3, h: 6 },
          e: { f: { g: 4, i: 7 } },
          j: 8
        });
      });

      it('should replace arrays rather than merge them', () => {
        const target = { arr: [1, 2, 3] };
        const source = { arr: [4, 5] };
        
        const result = deepmerge.merge(target, source);
        
        expect(result).toEqual({ arr: [4, 5] });
      });

      it('should handle Date objects correctly', () => {
        const date = new Date();
        const target = { date: new Date('2020-01-01') };
        const source = { date };
        
        const result = deepmerge.merge(target, source);
        
        expect(result.date).toBe(date);
      });

      it('should handle objects with no hasOwnProperty', () => {
        const target = { a: 1 };
        const source = Object.create(null);
        source.b = 2;
        
        const result = deepmerge.merge(target, source);
        
        expect(result).toEqual({ a: 1, b: 2 });
      });
    });

    describe('isObject', () => {
      it('should correctly identify plain objects', () => {
        expect(deepmerge.isObject({})).toBe(true);
        expect(deepmerge.isObject({ a: 1 })).toBe(true);
        expect(deepmerge.isObject(Object.create(null))).toBe(true);
      });

      it('should return false for non-objects', () => {
        expect(deepmerge.isObject(null)).toBe(false);
        expect(deepmerge.isObject(undefined)).toBe(false);
        expect(deepmerge.isObject([])).toBe(false);
        expect(deepmerge.isObject(new Date())).toBe(false);
        expect(deepmerge.isObject('string')).toBe(false);
        expect(deepmerge.isObject(123)).toBe(false);
        expect(deepmerge.isObject(true)).toBe(false);
        expect(deepmerge.isObject(() => {})).toBe(false);
      });
    });
  });

  describe('sleep', () => {
    it('should resolve after specified milliseconds', async () => {
      jest.useRealTimers();
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(150);
      jest.useFakeTimers();
    });
  });

  describe('retry', () => {
    it('should succeed on first try', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      const result = await retry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      jest.useRealTimers();
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');
      
      const result = await retry(fn, { initialDelay: 10 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
      jest.useFakeTimers();
    });

    it('should throw after max retries', async () => {
      jest.useRealTimers();
      const error = new Error('persistent failure');
      const fn = jest.fn().mockRejectedValue(error);
      
      await expect(retry(fn, { maxRetries: 2, initialDelay: 10 }))
        .rejects.toThrow('persistent failure');
      
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
      jest.useFakeTimers();
    });

    it('should use exponential backoff', async () => {
      jest.useRealTimers();
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');
      
      const start = Date.now();
      await retry(fn, { 
        maxRetries: 2, 
        initialDelay: 50,
        factor: 2 
      });
      const elapsed = Date.now() - start;
      
      // Should wait ~50ms after first failure, ~100ms after second
      expect(elapsed).toBeGreaterThanOrEqual(140);
      expect(elapsed).toBeLessThan(200);
      jest.useFakeTimers();
    });

    it('should respect maxDelay', async () => {
      jest.useRealTimers();
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      
      const start = Date.now();
      await retry(fn, { 
        initialDelay: 100,
        maxDelay: 50,
        factor: 10 
      });
      const elapsed = Date.now() - start;
      
      // Should be capped at maxDelay
      expect(elapsed).toBeLessThan(80);
      jest.useFakeTimers();
    });

    it('should work with default options', async () => {
      jest.useRealTimers();
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      
      // Override default delay to make test faster
      const result = await retry(fn, { initialDelay: 10 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
      jest.useFakeTimers();
    });
  });

  describe('debounce', () => {
    it('should debounce function calls', () => {
      jest.useFakeTimers();
      const fn = jest.fn();
      const debounced = debounce(fn, 100);
      
      debounced('a');
      debounced('b');
      debounced('c');
      
      expect(fn).not.toHaveBeenCalled();
      
      jest.advanceTimersByTime(100);
      
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('c');
    });

    it('should reset timer on each call', () => {
      jest.useFakeTimers();
      const fn = jest.fn();
      const debounced = debounce(fn, 100);
      
      debounced('a');
      jest.advanceTimersByTime(50);
      debounced('b');
      jest.advanceTimersByTime(50);
      debounced('c');
      jest.advanceTimersByTime(50);
      
      expect(fn).not.toHaveBeenCalled();
      
      jest.advanceTimersByTime(50);
      
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('c');
    });
  });

  describe('throttle', () => {
    it('should throttle function calls', () => {
      jest.useFakeTimers();
      const fn = jest.fn();
      const throttled = throttle(fn, 100);
      
      throttled('a');
      throttled('b');
      throttled('c');
      
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('a');
      
      jest.advanceTimersByTime(100);
      
      throttled('d');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith('d');
    });

    it('should allow calls after throttle period', () => {
      jest.useFakeTimers();
      const fn = jest.fn();
      const throttled = throttle(fn, 100);
      
      throttled('a');
      jest.advanceTimersByTime(50);
      throttled('b'); // ignored
      jest.advanceTimersByTime(50);
      throttled('c'); // allowed
      
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenNthCalledWith(1, 'a');
      expect(fn).toHaveBeenNthCalledWith(2, 'c');
    });
  });

  describe('timeout', () => {
    it('should resolve if promise completes before timeout', async () => {
      const promise = Promise.resolve('success');
      const result = await timeout(promise, 100);
      expect(result).toBe('success');
    });

    it('should reject if promise takes too long', async () => {
      jest.useRealTimers();
      const promise = new Promise(resolve => setTimeout(() => resolve('success'), 200));
      
      await expect(timeout(promise, 50))
        .rejects.toThrow('Operation timed out');
      jest.useFakeTimers();
    });

    it('should use custom error message', async () => {
      jest.useRealTimers();
      const promise = new Promise(resolve => setTimeout(() => resolve('success'), 100));
      
      await expect(timeout(promise, 50, 'Custom timeout'))
        .rejects.toThrow('Custom timeout');
      jest.useFakeTimers();
    });

    it('should propagate promise rejection', async () => {
      const error = new Error('Promise failed');
      const promise = Promise.reject(error);
      
      await expect(timeout(promise, 100))
        .rejects.toThrow('Promise failed');
    });
  });

  describe('chunk', () => {
    it('should chunk array into specified sizes', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      
      expect(chunk(array, 3)).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
      ]);
      
      expect(chunk(array, 4)).toEqual([
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [9]
      ]);
    });

    it('should handle empty array', () => {
      expect(chunk([], 3)).toEqual([]);
    });

    it('should handle size larger than array', () => {
      expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
    });

    it('should handle size of 1', () => {
      expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1023)).toBe('1023 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(1099511627776)).toBe('1 TB');
    });

    it('should handle custom decimal places', () => {
      expect(formatBytes(1536, 0)).toBe('2 KB');
      expect(formatBytes(1536, 1)).toBe('1.5 KB');
      expect(formatBytes(1536, 3)).toBe('1.5 KB');
    });

    it('should handle negative decimals', () => {
      expect(formatBytes(1536, -1)).toBe('2 KB');
    });

    it('should handle large numbers', () => {
      expect(formatBytes(1099511627776)).toBe('1 TB');  // 1 TB exactly
      expect(formatBytes(2199023255552)).toBe('2 TB');  // 2 TB
    });
  });

  describe('createId', () => {
    it('should create unique IDs', () => {
      const id1 = createId();
      const id2 = createId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[a-z0-9]+_[a-z0-9]+$/);
    });

    it('should include prefix if provided', () => {
      const id = createId('test');
      expect(id).toMatch(/^test_[a-z0-9]+_[a-z0-9]+$/);
    });

    it('should generate different IDs even when called quickly', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(createId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      expect(safeJsonParse('{"a": 1}')).toEqual({ a: 1 });
      expect(safeJsonParse('[1, 2, 3]')).toEqual([1, 2, 3]);
      expect(safeJsonParse('"string"')).toBe('string');
      expect(safeJsonParse('123')).toBe(123);
      expect(safeJsonParse('true')).toBe(true);
      expect(safeJsonParse('null')).toBe(null);
    });

    it('should return undefined for invalid JSON', () => {
      expect(safeJsonParse('invalid')).toBeUndefined();
      expect(safeJsonParse('{invalid}')).toBeUndefined();
      expect(safeJsonParse('')).toBeUndefined();
    });

    it('should return fallback for invalid JSON', () => {
      const fallback = { default: true };
      expect(safeJsonParse('invalid', fallback)).toBe(fallback);
      expect(safeJsonParse('', fallback)).toBe(fallback);
    });

    it('should not use fallback for valid JSON', () => {
      const fallback = { default: true };
      expect(safeJsonParse('{"a": 1}', fallback)).toEqual({ a: 1 });
      expect(safeJsonParse('null', fallback)).toBe(null);
    });
  });

  describe('pick', () => {
    it('should pick specified keys', () => {
      const obj = { a: 1, b: 2, c: 3, d: 4 };
      
      expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
      expect(pick(obj, [])).toEqual({});
      expect(pick(obj, ['a', 'b', 'c', 'd'])).toEqual(obj);
    });

    it('should ignore non-existent keys', () => {
      const obj = { a: 1, b: 2 };
      
      expect(pick(obj, ['a', 'c' as keyof typeof obj])).toEqual({ a: 1 });
    });

    it('should handle undefined and null values', () => {
      const obj = { a: undefined, b: null, c: 0, d: '' };
      
      expect(pick(obj, ['a', 'b', 'c', 'd'])).toEqual(obj);
    });
  });

  describe('omit', () => {
    it('should omit specified keys', () => {
      const obj = { a: 1, b: 2, c: 3, d: 4 };
      
      expect(omit(obj, ['b', 'd'])).toEqual({ a: 1, c: 3 });
      expect(omit(obj, [])).toEqual(obj);
      expect(omit(obj, ['a', 'b', 'c', 'd'])).toEqual({});
    });

    it('should handle non-existent keys', () => {
      const obj = { a: 1, b: 2 };
      
      expect(omit(obj, ['c' as keyof typeof obj])).toEqual(obj);
    });

    it('should not mutate original object', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = omit(obj, ['b']);
      
      expect(obj).toEqual({ a: 1, b: 2, c: 3 });
      expect(result).toEqual({ a: 1, c: 3 });
    });

    it('should handle objects with undefined and null values', () => {
      const obj = { a: undefined, b: null, c: 0, d: '' };
      
      expect(omit(obj, ['a', 'b'])).toEqual({ c: 0, d: '' });
    });
  });
});