// Main entry point for the Roast TypeScript Framework

// Core exports
export * from './shared/types';
export * from './shared/utils';

// Workflow exports
export { createWorkflow } from './dsl/workflow-factory';
export { WorkflowEngine } from './workflow/workflow-engine';
export { WorkflowExecutor } from './workflow/workflow-executor';
export { StepExecutor } from './workflow/step-executor';
export { loadYAMLWorkflow } from './workflow/yaml-loader';

// Tool exports
export { ToolBuilder } from './tools/tool-builder';
export { ToolRegistry } from './tools/tool-registry';
export { ToolExecutor } from './tools/tool-executor';
export * from './tools/built-in';

// Resource exports
export { ResourceFactory } from './resources/resource-factory';
export { ResourceProcessor } from './resources/resource-processor';
export { FileResourceHandler } from './resources/handlers/file-resource';
export { DirectoryResourceHandler } from './resources/handlers/directory-resource';
export { UrlResourceHandler } from './resources/handlers/url-resource';
export { GlobResourceHandler } from './resources/handlers/glob-resource';
export { NoneResourceHandler } from './resources/handlers/none-resource';
export * from './resources/types';

// State management exports
export { StateManager } from './state/state-manager';
export { StateStore } from './state/state-store';
export { EventBus } from './state/event-bus';
export { FileStateRepository } from './state/file-state-repository';
export * as StateConstants from './state/constants';

// Prompt exports
export { PromptManager } from './prompts/prompt-manager';
export { PromptResolver } from './prompts/prompt-resolver';
export { TemplateEngine } from './prompts/template-engine';
export * from './prompts/types';

// Configuration exports
export { ConfigLoader } from './config/config-loader';
export { ConfigValidator } from './config/config-validator';
export { 
  RoastConfig,
  ProjectConfig,
  WorkflowDefaults,
  ToolConfiguration,
  ProviderConfig,
  PluginConfig,
  FeatureFlags,
  ConfigValidationError,
  RoastConfigSchema,
  ProjectConfigSchema,
  WorkflowDefaultsSchema,
  ProviderConfigSchema
} from './config/config-schema';

// Helper exports
export { StructuredLogger } from './helpers/logger';
export { PathResolver } from './helpers/path-resolver';

// DSL exports
// Note: We're explicitly importing to avoid conflicts with shared/types
export { 
  WorkflowDSL,
  AgentConfig,
  StepHandler,
  ConditionFunction,
  LoopHandler,
  ErrorHandler,
  ItemsFunction,
  TemplateFunction
} from './dsl/types';
export { WorkflowDSLImpl } from './dsl/workflow-dsl-impl';
export { DSLTranspiler } from './dsl/transpiler';
export { WorkflowConverter } from './dsl/converter';
export * as DSLCombinators from './dsl/combinators';

// CLI exports (if needed programmatically)
// TODO: Add CLI exports when implemented

// Re-export commonly used types for convenience
export type {
  Workflow,
  StepDefinition,
  Tool,
  Resource,
  WorkflowState,
  WorkflowConfig,
  Provider,
  StepType,
  Logger
} from './shared/types';