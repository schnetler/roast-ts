import { z } from 'zod';

// Base types
export type Provider = 'openai' | 'anthropic' | 'bedrock' | 'ollama' | 'openrouter';
export type Model = string;
export type StepType = 'prompt' | 'step' | 'agent' | 'parallel';
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

// Tool types
export interface Tool<TParams = any, TResult = any> {
  name?: string;
  description?: string;
  category?: string;
  schema?: z.ZodSchema<TParams> | Record<string, any>;
  parameters?: z.ZodSchema<TParams> | Record<string, any>; // Alias for schema
  handler?: (params: TParams, context?: ToolContext) => Promise<TResult>;
  execute?: (params: TParams, context?: ToolContext) => Promise<TResult>; // Alias for handler
  cacheable?: boolean | { ttl: number };
  retryable?: boolean | { maxAttempts: number; backoff?: 'linear' | 'exponential' };
  timeout?: number;
}

export interface ToolContext {
  workflowId: string;
  stepId: string;
  logger: Logger;
  metadata?: Record<string, any>;
  middlewareData?: any;
}

export interface ToolExecutionResult<T = any> {
  success: boolean;
  result?: T;
  error?: {
    message: string;
    stack?: string;
  };
  duration?: number;
  cached?: boolean;
}

export interface ToolResult<T = any> {
  data: T;
  metadata: {
    duration: number;
    cached?: boolean;
    retries?: number;
  };
}

// Step definitions
export interface BaseStepDefinition {
  name: string;
  type: StepType;
  condition?: string | ((context: any) => boolean);
  onError?: 'fail' | 'skip' | 'retry';
}

export interface PromptStepDefinition extends BaseStepDefinition {
  type: 'prompt';
  template: string | ((context: any) => string);
  target?: string | null;
}

export interface CustomStepDefinition extends BaseStepDefinition {
  type: 'step';
  handler: StepHandler<any, any>;
  stepPath?: string;
  config?: any;
}

export interface AgentStepDefinition extends BaseStepDefinition {
  type: 'agent';
  agentConfig: AgentConfig<any>;
}

export interface ParallelStepDefinition extends BaseStepDefinition {
  type: 'parallel';
  steps: StepDefinition[];
}

export type StepDefinition = PromptStepDefinition | CustomStepDefinition | AgentStepDefinition | ParallelStepDefinition;

// Legacy step definitions for compatibility
export interface BaseStep {
  name: string;
  type: StepType;
  condition?: string | ((context: any) => boolean);
  onError?: 'fail' | 'skip' | 'retry';
}

export interface PromptStep extends BaseStep {
  type: 'prompt';
  prompt: string | ((context: any) => string);
  target?: string | null;
}

export interface CustomStep extends BaseStep {
  type: 'step';
  handler: string | ((context: any) => Promise<any>);
}

export interface AgentStep extends BaseStep {
  type: 'agent';
  prompt: string;
  maxSteps: number;
  fallback?: 'fail' | 'return_partial' | 'use_default';
  tools: string[];
}

export interface ParallelStep extends BaseStep {
  type: 'parallel';
  steps: StepDefinition[];
}

// Workflow Builder types
export interface WorkflowBuilder<TContext = any> {
  readonly name: string;
  tool<K extends string, P, R>(
    name: K,
    tool: Tool<P, R>,
    config?: any
  ): WorkflowBuilder<TContext & Record<K, R>>;
  model(modelName: string, options?: any): WorkflowBuilder<TContext>;
  prompt<K extends string = "prompt">(
    template: string | ((ctx: TContext) => string),
    name?: K
  ): WorkflowBuilder<TContext & Record<K, string>>;
  step<K extends string, R>(
    name: K,
    handler: StepHandler<TContext, R>
  ): WorkflowBuilder<TContext & Record<K, R>>;
  parallel<T extends Record<string, StepHandler<TContext, any>>>(
    handlers: T
  ): WorkflowBuilder<TContext & { [K in keyof T]: Awaited<ReturnType<T[K]>> }>;
  agent<K extends string>(
    name: K,
    config: AgentConfig<TContext>
  ): WorkflowBuilder<TContext & Record<K, any>>;
  buildConfig(): WorkflowConfig;
  run(input?: Partial<TContext>): Promise<TContext>;
}

export type StepHandler<TContext, TResult> = (context: TContext) => Promise<TResult>;

export interface AgentConfig<TContext = any> {
  maxSteps: number;
  fallback: 'return_partial' | 'error' | 'summarize';
  prompt: string | ((context: TContext) => string);
  tools: string[];
}

export interface ToolConfig {
  tool: Tool<any, any>;
  config: any;
}

// Workflow types
export interface WorkflowConfig {
  name: string;
  model?: Model;
  modelOptions?: any;
  provider?: Provider;
  tools?: Map<string, ToolConfig>;
  steps: StepDefinition[];
  metadata?: Record<string, any>;
  parallel?: boolean;
  createEngine?: (stateManager: any, toolRegistry: any, llmClient?: any) => any;
  temperature?: number;
  maxTokens?: number;
  timeout?: string;
}

export interface Workflow {
  config: WorkflowConfig;
  steps: StepDefinition[];
  execute: (context?: any) => Promise<WorkflowResult>;
}

export interface WorkflowResult {
  success: boolean;
  sessionId: string;
  results: Record<string, any>;
  error?: Error;
}

// State management types
export interface WorkflowState {
  sessionId: string;
  workflowName: string;
  status: WorkflowStatus;
  steps: StepState[];
  context: Record<string, any>;
  startedAt: Date;
  completedAt?: Date;
  error?: Error;
  metadata: WorkflowMetadata;
}

export interface StepState {
  id: string;
  name: string;
  index: number;
  status: StepStatus;
  startedAt: Date;
  completedAt?: Date;
  input: any;
  output?: any;
  error?: ErrorInfo;
  transcript: Message[];
  metadata: Record<string, any>;
}

export interface WorkflowMetadata {
  model: string;
  provider: string;
  targetCount: number;
  parallelExecution: boolean;
  resumedFrom?: string;
  tags?: string[];
}

export interface ErrorInfo {
  message: string;
  stack?: string;
  code?: string;
  details?: any;
}

export interface SessionOptions {
  sessionId?: string;
  targetCount?: number;
  tags?: string[];
  resumedFrom?: string;
}

export interface SessionFilter {
  workflowName?: string;
  status?: WorkflowStatus;
  startedAfter?: Date;
  startedBefore?: Date;
  tags?: string[];
}

export interface SessionSummary {
  sessionId: string;
  workflowName: string;
  startedAt: Date;
  status: WorkflowStatus;
  stepCount: number;
  completedSteps: number;
  tags?: string[];
}

export interface StateEvent {
  id: string;
  timestamp: Date;
  type: string;
  sessionId: string;
  data: any;
}

export interface StateStoreConfig {
  snapshotInterval?: number;
  compactionThreshold?: number;
}

export interface StateRepository {
  save(state: WorkflowState): Promise<void>;
  load(sessionId: string): Promise<WorkflowState | null>;
  loadHistory(sessionId: string): Promise<WorkflowState[]>;
  saveSnapshot(state: WorkflowState): Promise<void>;
  listSessions(filter?: SessionFilter): Promise<SessionSummary[]>;
}

export interface SessionIndex {
  sessions: Record<string, SessionSummary>;
}

export interface ReplayOptions {
  fromStep?: string;
  fromIndex?: number;
  autoExecute?: boolean;
}

export interface ReplayPoint {
  type: 'step' | 'index' | 'beginning';
  index: number;
}

// Logger interface
export interface Logger {
  debug(message: string, metadata?: any): void;
  info(message: string, metadata?: any): void;
  warn(message: string, metadata?: any): void;
  error(message: string, error?: Error | any): void;
  child(context: Record<string, any>): Logger;
}

// State manager interface
export interface StateManager {
  initializeSession(workflow: WorkflowConfig, options?: SessionOptions): Promise<WorkflowState>;
  loadSession(sessionId: string): Promise<WorkflowState>;
  updateWorkflow(updates: Partial<WorkflowState>): Promise<WorkflowState>;
  updateStep(stepId: string, updates: Partial<StepState>): Promise<WorkflowState>;
  subscribe(event: string, handler: (data: any) => void): () => void;
  getState(): Readonly<WorkflowState>;
  saveStep(stepName: string, result: any, context: any): Promise<void>;
  createSession(workflowName: string): Promise<string>;
}

// LLM Client types
export interface LLMClient {
  complete(request: LLMRequest): Promise<LLMResponse>;
  stream?(request: LLMRequest): AsyncIterableIterator<LLMChunk>;
}

export interface LLMRequest {
  messages: LLMMessage[];
  tools?: LLMTool[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface LLMChunk {
  content?: string;
  toolCalls?: ToolCall[];
  done?: boolean;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

// Legacy types for compatibility
export interface CompletionRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  tools?: any[];
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: any[];
}

export interface CompletionResponse {
  id: string;
  model: string;
  choices: Choice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface Choice {
  index: number;
  message: Message;
  finish_reason: string;
}

export interface CompletionChunk {
  id: string;
  model: string;
  choices: ChunkChoice[];
}

export interface ChunkChoice {
  index: number;
  delta: Partial<Message>;
  finish_reason: string | null;
}

// Type inference helpers
export type InferToolParams<T> = T extends Tool<infer P, any> ? P : never;
export type InferToolResult<T> = T extends Tool<any, infer R> ? R : never;

export type ToolMap = Record<string, Tool>;
export type InferToolContext<T extends ToolMap> = {
  [K in keyof T]: ToolResult<InferToolResult<T[K]>>;
};

// Zod schemas for validation
export const WorkflowConfigSchema = z.object({
  name: z.string(),
  model: z.string().optional().default('gpt-4'),
  provider: z.enum(['openai', 'anthropic', 'bedrock', 'ollama', 'openrouter']).optional().default('openai'),
  tools: z.instanceof(Map),
  steps: z.array(z.any()), // Complex validation needed
  metadata: z.record(z.any()).optional()
});

export const ToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  category: z.string().optional(),
  parameters: z.any(), // Could be Zod schema or JSON schema
  execute: z.function(),
  cacheable: z.union([z.boolean(), z.object({ ttl: z.number() })]).optional(),
  retryable: z.union([z.boolean(), z.object({ 
    maxAttempts: z.number(),
    backoff: z.enum(['linear', 'exponential']).optional()
  })]).optional()
});

export const StepDefinitionSchema = z.discriminatedUnion('type', [
  z.object({
    name: z.string(),
    type: z.literal('prompt'),
    prompt: z.union([z.string(), z.function()]),
    target: z.string().nullable().optional(),
    condition: z.union([z.string(), z.function()]).optional(),
    onError: z.enum(['fail', 'skip', 'retry']).optional()
  }),
  z.object({
    name: z.string(),
    type: z.literal('step'),
    handler: z.union([z.string(), z.function()]),
    condition: z.union([z.string(), z.function()]).optional(),
    onError: z.enum(['fail', 'skip', 'retry']).optional()
  }),
  z.object({
    name: z.string(),
    type: z.literal('agent'),
    prompt: z.string(),
    maxSteps: z.number(),
    fallback: z.enum(['fail', 'return_partial', 'use_default']).optional(),
    tools: z.array(z.string()),
    condition: z.union([z.string(), z.function()]).optional(),
    onError: z.enum(['fail', 'skip', 'retry']).optional()
  }),
  z.object({
    name: z.string(),
    type: z.literal('parallel'),
    steps: z.array(z.any()), // Recursive type
    condition: z.union([z.string(), z.function()]).optional(),
    onError: z.enum(['fail', 'skip', 'retry']).optional()
  })
]);

// Resource types
export interface BaseResource {
  type: string;
  source: string;
  exists(): Promise<boolean>;
  validate(): Promise<ValidationResult>;
}

// Re-export Resource union type from resources module
export type Resource = any; // Will be properly typed by resources module

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ResourceConfig {
  source: string;
  type?: string;
  mustExist?: boolean;
  permissions?: {
    read?: boolean;
    write?: boolean;
  };
  maxSize?: number;
  encoding?: string | null;
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
  shell?: boolean;
  cwd?: string;
  env?: Record<string, string>;
  filesOnly?: boolean;
  respectGitignore?: boolean;
  metadata?: Record<string, any>;
}

export interface WorkflowContext {
  sessionId?: string;
  stepId?: string;
  workflowName?: string;
  [key: string]: any;
}

// Configuration types
export interface RoastConfig {
  project: ProjectConfig;
  workflows: WorkflowDefaults;
  tools: ToolConfiguration;
  providers: ProviderConfig;
  plugins?: PluginConfig[];
  environments?: Record<string, EnvironmentOverride>;
  features?: FeatureFlags;
}

export interface ProjectConfig {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  paths: {
    workflows: string;
    tools: string;
    prompts: string;
    sessions: string;
    cache: string;
  };
  metadata?: Record<string, any>;
}

export interface WorkflowDefaults {
  model: string;
  provider: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  retries?: number;
  parallel?: boolean;
  defaultTools?: string[];
  session: {
    persist: boolean;
    compression?: boolean;
    retention?: number;
  };
}

export interface ToolConfiguration {
  builtin?: Record<string, any>;
  custom?: string[];
  settings?: Record<string, any>;
}

export interface ProviderConfig {
  openai?: {
    apiKey?: string;
    organization?: string;
    baseUrl?: string;
    timeout?: number;
    maxRetries?: number;
  };
  anthropic?: {
    apiKey?: string;
    baseUrl?: string;
    version?: string;
  };
  custom?: Record<string, any>;
}

export type PluginConfig = string | {
  name: string;
  path?: string;
  options?: Record<string, any>;
};

export type FeatureFlags = Record<string, boolean>;

export interface EnvironmentOverride {
  workflows?: Partial<WorkflowDefaults>;
  tools?: Partial<ToolConfiguration>;
  providers?: Partial<ProviderConfig>;
  features?: FeatureFlags;
}