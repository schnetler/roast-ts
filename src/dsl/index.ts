/**
 * DSL Integration Module - Fluent, type-safe API for building AI workflows
 * 
 * This module provides the main entry points for the Roast TypeScript DSL,
 * offering a natural way to define workflows using TypeScript's type system.
 */

export { workflow, createWorkflow } from './workflow-factory';
export { compose, parallel, conditional, loop } from './combinators';
export { 
  WorkflowDSL,
  StepHandler,
  TemplateFunction,
  ConditionFunction,
  LoopHandler,
  ErrorHandler,
  AgentConfig,
  ApprovalConfig,
  InputConfig,
  RetryConfig
} from './types';
export { DSLTranspiler } from './transpiler';
export { WorkflowConverter } from './converter';