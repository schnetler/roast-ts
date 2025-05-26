// Main entry point for the Roast TypeScript Framework

// Core exports
export * from './shared/types';
export * from './shared/utils';

// Workflow exports
export { createWorkflow, WorkflowBuilder } from './dsl/workflow-factory';
export { WorkflowEngine } from './workflow/workflow-engine';
export { WorkflowExecutor } from './workflow/workflow-executor';
export { StepExecutor } from './workflow/step-executor';
export { loadWorkflowFromYaml } from './workflow/yaml-loader';

// Tool exports
export { createTool, ToolBuilder } from './tools/tool-builder';
export { ToolRegistry } from './tools/tool-registry';
export { ToolExecutor } from './tools/tool-executor';
export * from './tools/built-in';

// Resource exports
export { ResourceFactory } from './resources/resource-factory';
export { ResourceProcessor } from './resources/resource-processor';
export { FileResource } from './resources/handlers/file-resource';
export { DirectoryResource } from './resources/handlers/directory-resource';
export { URLResource } from './resources/handlers/url-resource';
export { GlobResource } from './resources/handlers/glob-resource';
export { NoneResource } from './resources/handlers/none-resource';
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
export * from './config/config-schema';

// Helper exports
export { Logger } from './helpers/logger';
export { PathResolver } from './helpers/path-resolver';

// DSL exports
export * from './dsl/types';
export { WorkflowDSLImpl } from './dsl/workflow-dsl-impl';
export { Transpiler } from './dsl/transpiler';
export { Converter } from './dsl/converter';
export * as DSLCombinators from './dsl/combinators';

// CLI exports (if needed programmatically)
export * from './cli';

// Re-export commonly used types for convenience
export type {
  Workflow,
  WorkflowStep,
  Tool,
  Resource,
  WorkflowState,
  WorkflowConfig,
  LLMProvider,
  ToolInput,
  ToolOutput,
  StepType,
  ExecutionContext
} from './shared/types';