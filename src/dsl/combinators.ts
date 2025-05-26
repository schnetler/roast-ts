/**
 * Workflow Combinators
 * 
 * Higher-order functions for composing workflows and creating
 * reusable workflow patterns.
 */

import { workflow } from './workflow-factory';
import { WorkflowDSL, StepHandler, ConditionFunction } from './types';

/**
 * Compose multiple workflows into a single workflow
 * 
 * @param name - Name for the composed workflow
 * @param workflows - Workflows to compose
 * @returns A new workflow that runs all workflows in sequence
 * 
 * @example
 * ```typescript
 * const composed = compose('full-analysis', 
 *   securityWorkflow,
 *   performanceWorkflow,
 *   qualityWorkflow
 * );
 * ```
 */
export function compose<T extends WorkflowDSL<any>[]>(
  name: string,
  ...workflows: T
): WorkflowDSL<any> {
  return workflow(name).compose(...workflows);
}

/**
 * Run multiple steps in parallel
 * 
 * @param steps - Object mapping step names to handlers
 * @returns A workflow step that runs all steps in parallel
 * 
 * @example
 * ```typescript
 * const parallelChecks = parallel({
 *   lint: runLinter,
 *   test: runTests,
 *   security: runSecurityScan
 * });
 * ```
 */
export function parallel<TContext, TSteps extends Record<string, StepHandler<TContext, any>>>(
  steps: TSteps
): (workflow: WorkflowDSL<TContext>) => WorkflowDSL<TContext & { [K in keyof TSteps]: any }> {
  return (wf) => wf.parallel(steps);
}

/**
 * Conditional workflow execution
 * 
 * @param condition - Condition function
 * @param ifTrue - Workflow to run if condition is true
 * @param ifFalse - Optional workflow to run if condition is false
 * @returns A workflow that conditionally executes
 * 
 * @example
 * ```typescript
 * const deployIfPassing = conditional(
 *   ({ tests }) => tests.passed,
 *   deployWorkflow,
 *   notifyFailureWorkflow
 * );
 * ```
 */
export function conditional<TContext, TResult = any>(
  condition: ConditionFunction<TContext>,
  ifTrue: WorkflowDSL<any> | StepHandler<TContext, TResult>,
  ifFalse?: WorkflowDSL<any> | StepHandler<TContext, TResult>
): (workflow: WorkflowDSL<TContext>) => WorkflowDSL<TContext & { conditional: TResult }> {
  return (wf) => {
    const ifTrueHandler: StepHandler<TContext, TResult> = typeof ifTrue === 'function' 
      ? ifTrue 
      : async (ctx: TContext) => {
          const result = await ifTrue.run(ctx as any);
          return result as TResult;
        };
    
    const ifFalseHandler: StepHandler<TContext, TResult> | undefined = ifFalse 
      ? (typeof ifFalse === 'function' 
          ? ifFalse 
          : async (ctx: TContext) => {
              const result = await ifFalse.run(ctx as any);
              return result as TResult;
            })
      : undefined;
    
    return wf.conditional(condition, ifTrueHandler, ifFalseHandler) as any;
  };
}

/**
 * Loop over items with a handler
 * 
 * @param items - Function to get items from context
 * @param handler - Handler for each item
 * @returns A workflow that processes items in a loop
 * 
 * @example
 * ```typescript
 * const processFiles = loop(
 *   ({ files }) => files,
 *   async (file, index, context) => {
 *     return processFile(file);
 *   }
 * );
 * ```
 */
export function loop<TContext, TItem, TResult>(
  items: (context: TContext) => TItem[] | Promise<TItem[]>,
  handler: (item: TItem, index: number, context: TContext) => TResult | Promise<TResult>
): (workflow: WorkflowDSL<TContext>) => WorkflowDSL<TContext & { loop: TResult[] }> {
  return (wf) => wf.loop(items, handler);
}

/**
 * Retry a workflow with exponential backoff
 * 
 * @param maxAttempts - Maximum number of attempts
 * @param workflow - Workflow to retry
 * @returns A workflow with retry logic
 * 
 * @example
 * ```typescript
 * const reliableApi = retry(3, unreliableApiWorkflow);
 * ```
 */
export function retry<T extends WorkflowDSL<any>>(
  maxAttempts: number,
  workflow: T
): T {
  return workflow.retry({ 
    maxAttempts, 
    backoff: 'exponential' 
  }) as T;
}

/**
 * Timeout a workflow
 * 
 * @param duration - Timeout duration (e.g., '30s', '5m', '1h')
 * @param workflow - Workflow to timeout
 * @returns A workflow with timeout
 * 
 * @example
 * ```typescript
 * const timedWorkflow = timeout('5m', longRunningWorkflow);
 * ```
 */
export function timeout<T extends WorkflowDSL<any>>(
  duration: string,
  workflow: T
): T {
  return workflow.timeout(duration) as T;
}

/**
 * Cache workflow results
 * 
 * @param ttl - Time to live for cache (e.g., '1h', '24h')
 * @param keyFn - Function to generate cache key from context
 * @param workflow - Workflow to cache
 * @returns A workflow with caching
 * 
 * @example
 * ```typescript
 * const cachedAnalysis = cache(
 *   '1h',
 *   ({ fileHash }) => `analysis:${fileHash}`,
 *   expensiveAnalysisWorkflow
 * );
 * ```
 */
export function cache<T extends WorkflowDSL<any>>(
  ttl: string,
  keyFn: (context: any) => string,
  workflow: T
): T {
  return workflow
    .metadata('cache.ttl', ttl)
    .metadata('cache.keyFn', keyFn) as T;
}

/**
 * Rate limit workflow execution
 * 
 * @param limit - Number of executions
 * @param window - Time window (e.g., '1m', '1h')
 * @param workflow - Workflow to rate limit
 * @returns A rate-limited workflow
 * 
 * @example
 * ```typescript
 * const rateLimited = rateLimit(10, '1m', apiWorkflow);
 * ```
 */
export function rateLimit<T extends WorkflowDSL<any>>(
  limit: number,
  window: string,
  workflow: T
): T {
  return workflow
    .metadata('rateLimit.limit', limit)
    .metadata('rateLimit.window', window) as T;
}

/**
 * Map over an array with a workflow
 * 
 * @param itemsFn - Function to get items from context
 * @param itemWorkflow - Workflow to run for each item
 * @returns A workflow that maps over items
 * 
 * @example
 * ```typescript
 * const processAll = map(
 *   ({ files }) => files,
 *   workflow('process-file')
 *     .tool('read', readFile)
 *     .prompt(({ read }) => `Analyze: ${read}`)
 * );
 * ```
 */
export function map<TContext, TItem, TResult = any>(
  itemsFn: (context: TContext) => TItem[] | Promise<TItem[]>,
  itemWorkflow: WorkflowDSL<TItem & TContext>
): (workflow: WorkflowDSL<TContext>) => WorkflowDSL<TContext & { mapped: TResult[] }> {
  return (wf) => {
    const loopWorkflow = wf.loop(
      itemsFn,
      async (item, index, context) => {
        const itemContext = { ...context, ...item, _item: item, _index: index };
        return await itemWorkflow.run(itemContext) as TResult;
      }
    );
    
    return loopWorkflow.transform((ctx: any) => ({
      ...ctx,
      mapped: ctx.loop
    })) as any;
  };
}

/**
 * Filter items based on a predicate
 * 
 * @param itemsFn - Function to get items from context
 * @param predicate - Filter predicate
 * @returns A workflow that filters items
 * 
 * @example
 * ```typescript
 * const filterValid = filter(
 *   ({ records }) => records,
 *   (record) => record.isValid
 * );
 * ```
 */
export function filter<TContext, TItem>(
  itemsFn: (context: TContext) => TItem[] | Promise<TItem[]>,
  predicate: (item: TItem, index: number, context: TContext) => boolean | Promise<boolean>
): (workflow: WorkflowDSL<TContext>) => WorkflowDSL<TContext & { filtered: TItem[] }> {
  return (wf) => wf.step('filtered', async (context) => {
    const items = await itemsFn(context);
    const results: TItem[] = [];
    
    for (let i = 0; i < items.length; i++) {
      if (await predicate(items[i], i, context)) {
        results.push(items[i]);
      }
    }
    
    return results;
  });
}

/**
 * Reduce items to a single value
 * 
 * @param itemsFn - Function to get items from context
 * @param reducer - Reducer function
 * @param initial - Initial value
 * @returns A workflow that reduces items
 * 
 * @example
 * ```typescript
 * const sum = reduce(
 *   ({ numbers }) => numbers,
 *   (acc, num) => acc + num,
 *   0
 * );
 * ```
 */
export function reduce<TContext, TItem, TResult>(
  itemsFn: (context: TContext) => TItem[] | Promise<TItem[]>,
  reducer: (acc: TResult, item: TItem, index: number, context: TContext) => TResult | Promise<TResult>,
  initial: TResult
): (workflow: WorkflowDSL<TContext>) => WorkflowDSL<TContext & { reduced: TResult }> {
  return (wf) => wf.step('reduced', async (context) => {
    const items = await itemsFn(context);
    let result = initial;
    
    for (let i = 0; i < items.length; i++) {
      result = await reducer(result, items[i], i, context);
    }
    
    return result;
  });
}

/**
 * Create a pipeline of workflows
 * 
 * @param workflows - Workflows to pipeline
 * @returns A pipelined workflow
 * 
 * @example
 * ```typescript
 * const pipeline = pipe(
 *   extractWorkflow,
 *   transformWorkflow,
 *   loadWorkflow
 * );
 * ```
 */
export function pipe<T extends WorkflowDSL<any>[]>(
  ...workflows: T
): WorkflowDSL<any> {
  return workflow('pipeline').compose(...workflows);
}

/**
 * Debounce workflow execution
 * 
 * @param delay - Debounce delay in milliseconds
 * @param workflow - Workflow to debounce
 * @returns A debounced workflow
 * 
 * @example
 * ```typescript
 * const debounced = debounce(1000, searchWorkflow);
 * ```
 */
export function debounce<T extends WorkflowDSL<any>>(
  delay: number,
  workflow: T
): T {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return workflow
    .metadata('debounce.delay', delay)
    .tap(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      return new Promise(resolve => {
        timeoutId = setTimeout(resolve, delay);
      });
    }) as T;
}

/**
 * Throttle workflow execution
 * 
 * @param limit - Minimum time between executions in milliseconds
 * @param workflow - Workflow to throttle
 * @returns A throttled workflow
 * 
 * @example
 * ```typescript
 * const throttled = throttle(5000, apiWorkflow);
 * ```
 */
export function throttle<T extends WorkflowDSL<any>>(
  limit: number,
  workflow: T
): T {
  let lastExecution = 0;
  
  return workflow
    .metadata('throttle.limit', limit)
    .tap(async () => {
      const now = Date.now();
      const timeSinceLastExecution = now - lastExecution;
      
      if (timeSinceLastExecution < limit) {
        await new Promise(resolve => 
          setTimeout(resolve, limit - timeSinceLastExecution)
        );
      }
      
      lastExecution = Date.now();
    }) as T;
}