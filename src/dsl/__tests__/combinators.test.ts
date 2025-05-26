/**
 * Tests for workflow combinators
 */

import { workflow } from '../workflow-factory';
import {
  compose,
  parallel,
  conditional,
  loop,
  retry,
  timeout,
  cache,
  rateLimit,
  map,
  filter,
  reduce,
  pipe,
  debounce,
  throttle
} from '../combinators';

describe('Workflow Combinators', () => {
  describe('compose()', () => {
    it('should compose multiple workflows', () => {
      const wf1 = workflow('wf1').step('step1', async () => ({ a: 1 }));
      const wf2 = workflow('wf2').step('step2', async () => ({ b: 2 }));
      const wf3 = workflow('wf3').step('step3', async () => ({ c: 3 }));
      
      const composed = compose('composed', wf1, wf2, wf3);
      const built = composed.build();
      
      expect(built.config.name).toBe('composed');
      expect(built.steps).toHaveLength(3);
      expect(built.steps.map(s => s.name)).toEqual(['wf1', 'wf2', 'wf3']);
    });

    it('should merge tools from composed workflows', () => {
      const wf1 = workflow('wf1').tool('tool1', {} as any);
      const wf2 = workflow('wf2').tool('tool2', {} as any);
      
      const composed = compose('composed', wf1, wf2);
      const built = composed.build();
      
      expect(built.config.tools).toBeDefined();
      expect(built.config.tools!.size).toBe(2);
    });
  });

  describe('parallel()', () => {
    it('should create parallel steps', () => {
      const steps = {
        task1: jest.fn().mockResolvedValue({ result: 1 }),
        task2: jest.fn().mockResolvedValue({ result: 2 }),
        task3: jest.fn().mockResolvedValue({ result: 3 })
      };
      
      const wf = workflow('test');
      const withParallel = parallel<{}, typeof steps>(steps)(wf);
      const built = withParallel.build();
      
      expect(built.steps).toHaveLength(1);
      expect(built.steps[0].type).toBe('parallel');
      expect(built.steps[0].steps).toHaveLength(3);
    });
  });

  describe('conditional()', () => {
    it('should add conditional execution with functions', () => {
      const condition = jest.fn().mockReturnValue(true);
      const ifTrue = jest.fn().mockResolvedValue({ branch: 'true' });
      const ifFalse = jest.fn().mockResolvedValue({ branch: 'false' });
      
      const wf = workflow('test');
      const withConditional = conditional(condition, ifTrue, ifFalse)(wf);
      const built = withConditional.build();
      
      expect(built.steps).toHaveLength(1);
      expect(built.steps[0].type).toBe('conditional');
    });

    it('should add conditional execution with workflows', () => {
      const condition = (ctx: any) => ctx.value > 0;
      const trueWorkflow = workflow('true-branch').step('true', async () => ({ ok: true }));
      const falseWorkflow = workflow('false-branch').step('false', async () => ({ ok: false }));
      
      const wf = workflow('test');
      const withConditional = conditional(condition, trueWorkflow, falseWorkflow)(wf);
      const built = withConditional.build();
      
      expect(built.steps).toHaveLength(1);
      expect(built.steps[0].type).toBe('conditional');
    });
  });

  describe('loop()', () => {
    it('should add loop execution', () => {
      const items = (ctx: any) => [1, 2, 3, 4, 5];
      const handler = async (item: number, index: number) => ({ 
        value: item * 2, 
        index 
      });
      
      const wf = workflow('test');
      const withLoop = loop(items, handler)(wf);
      const built = withLoop.build();
      
      expect(built.steps).toHaveLength(1);
      expect(built.steps[0].type).toBe('loop');
      expect(built.steps[0].name).toBe('loop');
    });
  });

  describe('retry()', () => {
    it('should add retry configuration', () => {
      const wf = workflow('test').step('process', async () => ({ done: true }));
      const withRetry = retry(5, wf);
      const built = withRetry.build();
      
      expect(built.metadata?.retryConfig).toEqual({
        maxAttempts: 5,
        backoff: 'exponential'
      });
    });
  });

  describe('timeout()', () => {
    it('should add timeout configuration', () => {
      const wf = workflow('test').step('process', async () => ({ done: true }));
      const withTimeout = timeout('5m', wf);
      const built = withTimeout.build();
      
      expect(built.config.timeout).toBe('5m');
    });
  });

  describe('cache()', () => {
    it('should add cache metadata', () => {
      const keyFn = (ctx: any) => `cache:${ctx.id}`;
      const wf = workflow('test').step('expensive', async () => ({ computed: true }));
      const withCache = cache('1h', keyFn, wf);
      const built = withCache.build();
      
      expect(built.config.metadata?.['cache.ttl']).toBe('1h');
      expect(built.config.metadata?.['cache.keyFn']).toBe(keyFn);
    });
  });

  describe('rateLimit()', () => {
    it('should add rate limit metadata', () => {
      const wf = workflow('test').step('api', async () => ({ data: [] }));
      const withRateLimit = rateLimit(10, '1m', wf);
      const built = withRateLimit.build();
      
      expect(built.config.metadata?.['rateLimit.limit']).toBe(10);
      expect(built.config.metadata?.['rateLimit.window']).toBe('1m');
    });
  });

  describe('map()', () => {
    it('should map over items with a workflow', () => {
      const itemsFn = (ctx: any) => ctx.files || [];
      const itemWorkflow = workflow('process-item')
        .step('process', async (ctx: any) => ({ processed: ctx._item }));
      
      const wf = workflow('test');
      const withMap = map(itemsFn, itemWorkflow)(wf);
      const built = withMap.build();
      
      // Should have loop and transform steps
      expect(built.steps.length).toBeGreaterThan(0);
      expect(built.steps.some(s => s.type === 'loop')).toBe(true);
      expect(built.steps.some(s => s.name === 'transform')).toBe(true);
    });
  });

  describe('filter()', () => {
    it('should filter items based on predicate', () => {
      const itemsFn = (ctx: any) => ctx.records || [];
      const predicate = (item: any) => item.valid === true;
      
      const wf = workflow('test');
      const withFilter = filter(itemsFn, predicate)(wf);
      const built = withFilter.build();
      
      expect(built.steps).toHaveLength(1);
      expect(built.steps[0].name).toBe('filtered');
      expect(built.steps[0].type).toBe('custom');
    });

    it('should support async predicates', () => {
      const itemsFn = (ctx: any) => ctx.urls || [];
      const predicate = async (url: string) => {
        // Simulate async check
        return url.startsWith('https://');
      };
      
      const wf = workflow('test');
      const withFilter = filter(itemsFn, predicate)(wf);
      const built = withFilter.build();
      
      expect(built.steps[0].handler).toBeDefined();
    });
  });

  describe('reduce()', () => {
    it('should reduce items to single value', () => {
      const itemsFn = (ctx: any) => ctx.numbers || [];
      const reducer = (acc: number, item: number) => acc + item;
      const initial = 0;
      
      const wf = workflow('test');
      const withReduce = reduce(itemsFn, reducer, initial)(wf);
      const built = withReduce.build();
      
      expect(built.steps).toHaveLength(1);
      expect(built.steps[0].name).toBe('reduced');
    });

    it('should support async reducers', () => {
      const itemsFn = (ctx: any) => ctx.data || [];
      const reducer = async (acc: any[], item: any) => {
        // Simulate async processing
        return [...acc, await processItem(item)];
      };
      const initial: any[] = [];
      
      async function processItem(item: any) {
        return { ...item, processed: true };
      }
      
      const wf = workflow('test');
      const withReduce = reduce(itemsFn, reducer, initial)(wf);
      const built = withReduce.build();
      
      expect(built.steps[0].handler).toBeDefined();
    });
  });

  describe('pipe()', () => {
    it('should create a pipeline of workflows', () => {
      const extract = workflow('extract').step('extract', async () => ({ data: [] }));
      const transform = workflow('transform').step('transform', async (ctx: any) => ({ 
        transformed: ctx.extract?.data || [] 
      }));
      const load = workflow('load').step('load', async (ctx) => ({ 
        loaded: true 
      }));
      
      const pipeline = pipe(extract, transform, load);
      const built = pipeline.build();
      
      expect(built.config.name).toBe('pipeline');
      expect(built.steps).toHaveLength(3);
    });
  });

  describe('debounce()', () => {
    it('should add debounce behavior', () => {
      const wf = workflow('test').step('search', async () => ({ results: [] }));
      const debounced = debounce(500, wf);
      const built = debounced.build();
      
      expect(built.config.metadata?.['debounce.delay']).toBe(500);
      expect(built.steps.some(s => s.name.startsWith('tap_'))).toBe(true);
    });
  });

  describe('throttle()', () => {
    it('should add throttle behavior', () => {
      const wf = workflow('test').step('api', async () => ({ data: [] }));
      const throttled = throttle(1000, wf);
      const built = throttled.build();
      
      expect(built.config.metadata?.['throttle.limit']).toBe(1000);
      expect(built.steps.some(s => s.name.startsWith('tap_'))).toBe(true);
    });
  });

  describe('Combinator composition', () => {
    it('should compose multiple combinators', () => {
      const baseWorkflow = workflow('base')
        .step('process', async () => ({ result: 'done' }));
      
      const enhanced = pipe(
        retry(3, baseWorkflow),
        timeout('5m', baseWorkflow),
        cache('1h', (ctx) => 'key', baseWorkflow)
      );
      
      const built = enhanced.build();
      
      expect(built.config.metadata).toBeDefined();
      expect(built.steps.length).toBeGreaterThan(0);
    });

    it('should work with complex workflows', () => {
      const complexWorkflow = workflow('complex')
        .tool('search', {} as any)
        .prompt('Analyze data')
        .parallel({
          check1: async () => ({ ok: true }),
          check2: async () => ({ ok: true })
        })
        .conditional(
          (ctx) => ctx.check1.ok && ctx.check2.ok,
          async () => ({ proceed: true }),
          async () => ({ proceed: false })
        );
      
      const enhanced = retry(3, timeout('10m', complexWorkflow));
      const built = enhanced.build();
      
      expect(built.config.timeout).toBe('10m');
      expect(built.metadata?.retryConfig?.maxAttempts).toBe(3);
    });
  });
});