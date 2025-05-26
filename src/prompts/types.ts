export interface PromptVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  required: boolean;
  description?: string;
  defaultValue?: any;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    enum?: any[];
  };
}

export interface PromptSchema {
  name: string;
  description?: string;
  variables: PromptVariable[];
  tags?: string[];
  version?: string;
  author?: string;
  examples?: PromptExample[];
}

export interface PromptExample {
  name: string;
  description?: string;
  variables: Record<string, any>;
  expectedOutput?: string;
}

export interface PromptConfig {
  prompts: {
    directory: string;
    extensions: string[];
    cacheEnabled: boolean;
    watchEnabled: boolean;
  };
  templates: {
    delimiters: [string, string];
    strictMode: boolean;
    escapeHtml: boolean;
  };
  resolution: {
    timeout: number;
    maxDepth: number;
    allowIncludes: boolean;
  };
}

export interface PromptExecutionContext {
  promptName: string;
  variables: Record<string, any>;
  workflowId?: string;
  stepId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface PromptExecutionResult {
  resolved: string;
  variables: Record<string, any>;
  executionTime: number;
  cacheHit: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface PromptLibrary {
  name: string;
  description?: string;
  version: string;
  prompts: Record<string, PromptSchema>;
  dependencies?: string[];
}

export interface PromptRegistry {
  libraries: Record<string, PromptLibrary>;
  aliases: Record<string, string>;
  categories: Record<string, string[]>;
}

export interface PromptValidationResult {
  isValid: boolean;
  errors: PromptValidationError[];
  warnings: PromptValidationWarning[];
}

export interface PromptValidationError {
  type: 'syntax' | 'reference' | 'type' | 'required' | 'custom';
  message: string;
  line?: number;
  column?: number;
  variable?: string;
}

export interface PromptValidationWarning {
  type: 'unused' | 'deprecated' | 'performance' | 'style';
  message: string;
  line?: number;
  column?: number;
  variable?: string;
}

export interface PromptCacheOptions {
  enabled: boolean;
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of entries
  invalidateOnChange?: boolean;
}

export interface PromptWatchOptions {
  enabled: boolean;
  recursive?: boolean;
  ignored?: string[];
  debounce?: number; // Debounce time in milliseconds
}

export interface PromptProcessingOptions {
  timeout?: number;
  maxDepth?: number;
  allowUnsafeEval?: boolean;
  sandbox?: boolean;
}

// Event types for prompt system
export interface PromptEvents {
  'prompt:loaded': { name: string; path: string; size: number };
  'prompt:resolved': { name: string; variables: Record<string, any>; executionTime: number };
  'prompt:cached': { name: string; cacheKey: string };
  'prompt:invalidated': { name: string; reason: string };
  'prompt:error': { name: string; error: Error; context?: any };
  'prompt:watched': { path: string; event: 'change' | 'add' | 'unlink' };
}

export type PromptEventHandler<T extends keyof PromptEvents> = (
  event: PromptEvents[T]
) => void | Promise<void>;

// Function and helper types
export interface TemplateFunctionDescriptor {
  name: string;
  description?: string;
  parameters: TemplateFunctionParameter[];
  returnType: string;
  examples?: string[];
  async?: boolean;
}

export interface TemplateFunctionParameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: any;
}

export interface TemplateHelperDescriptor {
  name: string;
  description?: string;
  type: 'block' | 'inline';
  parameters: TemplateFunctionParameter[];
  examples?: string[];
}

// Built-in function categories
export type BuiltInFunctionCategory = 
  | 'string'
  | 'array'
  | 'object'
  | 'math'
  | 'date'
  | 'logic'
  | 'utility'
  | 'formatting';

export interface BuiltInFunctionRegistry {
  [category: string]: {
    functions: Record<string, TemplateFunctionDescriptor>;
    helpers: Record<string, TemplateHelperDescriptor>;
  };
}