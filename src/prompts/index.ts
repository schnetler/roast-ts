// Core classes
export { TemplateEngine } from './template-engine';
export { PromptResolver } from './prompt-resolver';
export { PromptManager } from './prompt-manager';

// Types and interfaces
export type {
  TemplateEngineOptions,
  TemplateFunction,
  TemplateHelper,
  CompiledTemplate
} from './template-engine';

export type {
  PromptResolverOptions,
  PromptVariables
} from './prompt-resolver';

export type {
  PromptManagerOptions,
  PromptMetadata,
  PromptCacheEntry
} from './prompt-manager';

export type {
  PromptVariable,
  PromptSchema,
  PromptExample,
  PromptConfig,
  PromptExecutionContext,
  PromptExecutionResult,
  PromptLibrary,
  PromptRegistry,
  PromptValidationResult,
  PromptValidationError,
  PromptValidationWarning,
  PromptCacheOptions,
  PromptWatchOptions,
  PromptProcessingOptions,
  PromptEvents,
  PromptEventHandler,
  TemplateFunctionDescriptor,
  TemplateFunctionParameter,
  TemplateHelperDescriptor,
  BuiltInFunctionCategory,
  BuiltInFunctionRegistry
} from './types';

// Utility functions
export const createPromptManager = (options: PromptManagerOptions) => {
  return new PromptManager(options);
};

export const createPromptResolver = (options?: PromptResolverOptions) => {
  return new PromptResolver(options);
};

export const createTemplateEngine = (options?: TemplateEngineOptions) => {
  return new TemplateEngine(options);
};

// Default configurations
export const DEFAULT_PROMPT_CONFIG: PromptConfig = {
  prompts: {
    directory: './prompts',
    extensions: ['.md', '.txt', '.prompt'],
    cacheEnabled: true,
    watchEnabled: false,
  },
  templates: {
    delimiters: ['{{', '}}'],
    strictMode: false,
    escapeHtml: true,
  },
  resolution: {
    timeout: 30000, // 30 seconds
    maxDepth: 10,
    allowIncludes: true,
  },
};

// Built-in function categories for documentation
export const BUILT_IN_FUNCTIONS: Record<BuiltInFunctionCategory, string[]> = {
  string: [
    'uppercase',
    'lowercase', 
    'capitalize',
    'truncate',
    'trim',
    'replace',
    'split',
    'substring'
  ],
  array: [
    'first',
    'last',
    'slice',
    'filter',
    'sort',
    'join',
    'length'
  ],
  object: [
    'keys',
    'values',
    'entries'
  ],
  math: [
    'add',
    'subtract',
    'multiply',
    'divide'
  ],
  date: [
    'formatDate'
  ],
  logic: [
    'eq',
    'ne',
    'gt',
    'gte',
    'lt',
    'lte',
    'and',
    'or',
    'not'
  ],
  utility: [
    'default',
    'isDefined',
    'isNull',
    'isEmpty',
    'isArray',
    'isObject',
    'isString',
    'isNumber',
    'isBoolean'
  ],
  formatting: [
    'json',
    'url',
    'base64',
    'hash'
  ]
};

// Built-in helpers for documentation  
export const BUILT_IN_HELPERS: string[] = [
  'if',
  'unless',
  'each',
  'with',
  'lookup',
  'log',
  'raw',
  'partial',
  'markdown',
  'compare',
  'times',
  'group'
];

// Version info
export const VERSION = '1.0.0';