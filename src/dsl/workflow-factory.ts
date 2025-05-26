/**
 * Workflow Factory - Entry point for creating DSL workflows
 */

import { WorkflowDSL } from './types';
import { WorkflowDSLImpl } from './workflow-dsl-impl';

/**
 * Create a new workflow using the fluent DSL
 * 
 * @param name - The workflow name
 * @returns A new WorkflowDSL instance
 * 
 * @example
 * ```typescript
 * const myWorkflow = workflow('process-data')
 *   .tool('fetch', fetchData)
 *   .prompt(({ fetch }) => `Process ${fetch.data.length} items`)
 *   .step('analyze', async ({ prompt }) => analyzeData(prompt));
 * ```
 */
export function workflow<TContext = {}>(name: string): WorkflowDSL<TContext> {
  return new WorkflowDSLImpl<TContext>(name);
}

/**
 * Alias for workflow() - create a new workflow using the fluent DSL
 * 
 * @param name - The workflow name
 * @returns A new WorkflowDSL instance
 */
export function createWorkflow<TContext = {}>(name: string): WorkflowDSL<TContext> {
  return workflow<TContext>(name);
}