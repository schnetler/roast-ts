/**
 * DSL Type Definitions
 * 
 * Core types for the fluent workflow DSL, building on shared types
 * while adding DSL-specific functionality.
 */

import { z } from 'zod';
import { Tool, WorkflowConfig } from '../shared/types';

// Template function for dynamic prompts
export type TemplateFunction<TContext> = (context: TContext) => string | Promise<string>;

// Step handler function
export type StepHandler<TContext, TResult> = (
  context: TContext
) => TResult | Promise<TResult>;

// Condition function for conditional execution
export type ConditionFunction<TContext> = (context: TContext) => boolean | Promise<boolean>;

// Loop handler function
export type LoopHandler<TContext, TItem, TResult> = (
  item: TItem,
  index: number,
  context: TContext
) => TResult | Promise<TResult>;

// Error handler function
export type ErrorHandler<TContext, TResult> = (
  error: Error,
  context: TContext
) => TResult | Promise<TResult>;

// Items function for loops
export type ItemsFunction<TContext, TItem> = (
  context: TContext
) => TItem[] | Promise<TItem[]>;

// Agent configuration with context
export interface AgentConfig<TContext> {
  maxSteps: number;
  fallback: string | StepHandler<TContext, any>;
  prompt?: string | TemplateFunction<TContext>;
  tools?: string[];
  temperature?: number;
  model?: string;
}

// Approval configuration
export interface ApprovalConfig<TContext> {
  message: string | ((context: TContext) => string);
  timeout?: string;
  channels?: string[];
  fallback?: 'approve' | 'reject' | StepHandler<TContext, boolean>;
  metadata?: Record<string, any>;
}

// Input configuration
export interface InputConfig {
  prompt?: string;
  default?: any;
  choices?: any[];
  multiple?: boolean;
  validation?: (value: any) => boolean | string;
}

// Retry configuration
export interface RetryConfig {
  maxAttempts?: number;
  backoff?: 'linear' | 'exponential' | ((attempt: number) => number);
  retryIf?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

// Validator function
export type Validator<TContext> = (context: TContext) => boolean | string;

// Validation result
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

// Execution plan for dry runs
export interface ExecutionPlan {
  steps: Array<{
    name: string;
    type: string;
    dependencies: string[];
    estimatedDuration?: number;
  }>;
  totalSteps: number;
  parallelizable: boolean;
  estimatedTotalDuration?: number;
}

// Tool result wrapper
export type ToolResult<T> = {
  data: T;
  metadata?: {
    duration: number;
    cached?: boolean;
    retries?: number;
  };
};

// Type inference helpers
export type InferToolContext<TTools extends Record<string, Tool<any, any>>> = {
  [K in keyof TTools]: TTools[K] extends Tool<any, infer R> 
    ? ToolResult<R>
    : never;
};

export type InferStepContext<TContext, TSteps extends Record<string, StepHandler<TContext, any>>> = {
  [K in keyof TSteps]: TSteps[K] extends StepHandler<TContext, infer R>
    ? R
    : never;
};

export type InferWorkflowContext<T> = T extends WorkflowDSL<infer C> ? C : never;

export type InferWorkflowContexts<T extends WorkflowDSL<any>[]> = {
  [K in keyof T]: InferWorkflowContext<T[K]>;
};

export type UnionToIntersection<U> = 
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) 
    ? I 
    : never;

// Internal workflow representation
export interface Workflow<TContext> {
  config: WorkflowConfig;
  steps: DSLWorkflowStep[];
  errorHandler?: ErrorHandler<TContext, any>;
  validators: Validator<TContext>[];
  metadata?: Record<string, any>;
}

// Base DSL step interface
export interface BaseDSLStep {
  name: string;
  type: string;
}

// Extended workflow step for DSL
export interface DSLWorkflowStep extends BaseDSLStep {
  // Prompt step properties
  prompt?: string | TemplateFunction<any>;
  template?: string | TemplateFunction<any>;
  
  // Tool step properties
  tool?: string;
  
  // Agent step properties
  maxSteps?: number;
  tools?: string[];
  config?: any;
  
  // Custom step properties
  handler?: StepHandler<any, any>;
  
  // Conditional properties
  condition?: ConditionFunction<any>;
  ifTrue?: StepHandler<any, any>;
  ifFalse?: StepHandler<any, any>;
  
  // Loop properties
  items?: ItemsFunction<any, any>;
  loopHandler?: LoopHandler<any, any, any>;
  
  // Parallel properties
  steps?: DSLWorkflowStep[];
  
  // Approval properties
  approvalConfig?: ApprovalConfig<any>;
  
  // Input properties
  inputConfig?: InputConfig;
  inputSchema?: z.ZodSchema;
  
  // Sub-workflow properties
  workflow?: Workflow<any>;
}

// Main DSL interface
export interface WorkflowDSL<TContext = {}> {
  // Configuration
  model(model: string): this;
  provider(provider: 'openai' | 'anthropic' | 'openrouter'): this;
  temperature(temp: number): this;
  maxTokens(tokens: number): this;
  timeout(duration: string): this;
  
  // Tools
  tool<K extends string, TParams, TResult>(
    name: K,
    tool: Tool<TParams, TResult>
  ): WorkflowDSL<TContext & Record<K, ToolResult<TResult>>>;
  
  tools<TTools extends Record<string, Tool<any, any>>>(
    tools: TTools
  ): WorkflowDSL<TContext & InferToolContext<TTools>>;
  
  // Prompts
  prompt(template: string | TemplateFunction<TContext>): WorkflowDSL<TContext & { prompt: string }>;
  
  promptAs<K extends string>(
    name: K,
    template: string | TemplateFunction<TContext>
  ): WorkflowDSL<TContext & Record<K, string>>;
  
  // Steps
  step<K extends string, TResult>(
    name: K,
    handler: StepHandler<TContext, TResult>
  ): WorkflowDSL<TContext & Record<K, TResult>>;
  
  steps<TSteps extends Record<string, StepHandler<TContext, any>>>(
    steps: TSteps
  ): WorkflowDSL<TContext & InferStepContext<TContext, TSteps>>;
  
  // Agents
  agent<K extends string, TResult>(
    name: K,
    config: AgentConfig<TContext>
  ): WorkflowDSL<TContext & Record<K, TResult>>;
  
  // Control flow
  parallel<TSteps extends Record<string, StepHandler<TContext, any>>>(
    steps: TSteps
  ): WorkflowDSL<TContext & InferStepContext<TContext, TSteps>>;
  
  conditional<TResult>(
    condition: ConditionFunction<TContext>,
    ifTrue: StepHandler<TContext, TResult>,
    ifFalse?: StepHandler<TContext, TResult>
  ): WorkflowDSL<TContext & { conditional: TResult }>;
  
  loop<TItem, TResult>(
    items: ItemsFunction<TContext, TItem>,
    handler: LoopHandler<TContext, TItem, TResult>
  ): WorkflowDSL<TContext & { loop: TResult[] }>;
  
  // Human interaction
  approve(config?: ApprovalConfig<TContext>): this;
  
  input<K extends string, TSchema extends z.ZodSchema>(
    name: K,
    schema: TSchema,
    config?: InputConfig
  ): WorkflowDSL<TContext & Record<K, z.infer<TSchema>>>;
  
  // Composition
  use<TWorkflow extends WorkflowDSL<any>>(
    workflow: TWorkflow
  ): WorkflowDSL<TContext & InferWorkflowContext<TWorkflow>>;
  
  compose<TWorkflows extends WorkflowDSL<any>[]>(
    ...workflows: TWorkflows
  ): WorkflowDSL<TContext & UnionToIntersection<InferWorkflowContexts<TWorkflows>>>;
  
  // Error handling
  catch<TResult>(
    handler: ErrorHandler<TContext, TResult>
  ): WorkflowDSL<TContext & { error?: TResult }>;
  
  retry(config?: RetryConfig): this;
  
  // Validation
  validate(validator: Validator<TContext>): this;
  
  // Execution
  build(): Workflow<TContext>;
  run(input?: Partial<TContext>): Promise<TContext>;
  dryRun(input?: Partial<TContext>): Promise<ExecutionPlan>;
  validateWorkflow(): ValidationResult;
  
  // Utilities
  log(message: string | ((ctx: TContext) => string)): this;
  tap(fn: (ctx: TContext) => void | Promise<void>): this;
  transform<TNewContext>(
    fn: (ctx: TContext) => TNewContext
  ): WorkflowDSL<TNewContext>;
  
  // Metadata
  description(desc: string): this;
  tag(tag: string): this;
  tags(tags: string[]): this;
  metadata(key: string, value: any): this;
}