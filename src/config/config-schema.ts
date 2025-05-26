import { z } from 'zod';

// Path configuration schema
export const PathConfigSchema = z.object({
  workflows: z.string().default('.roast/workflows'),
  tools: z.string().default('.roast/tools'),
  prompts: z.string().default('.roast/prompts'),
  sessions: z.string().default('.roast/sessions'),
  cache: z.string().default('.roast/cache')
});

// Project configuration schema
export const ProjectConfigSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be in semver format').default('0.1.0'),
  description: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),
  paths: PathConfigSchema.default({})
});

// Session configuration schema
export const SessionConfigSchema = z.object({
  persist: z.boolean().default(true),
  compression: z.boolean().optional(),
  retention: z.number().positive().optional() // days
});

// Workflow defaults schema
export const WorkflowDefaultsSchema = z.object({
  model: z.string().default('gpt-4'),
  provider: z.string().default('openai'),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  timeout: z.number().positive().optional(),
  retries: z.number().min(0).max(5).optional(),
  parallel: z.boolean().optional(),
  defaultTools: z.array(z.string()).optional(),
  session: SessionConfigSchema.default({})
});

// Tool configuration schema
export const ToolConfigurationSchema = z.object({
  builtin: z.record(z.any()).optional(),
  custom: z.array(z.string()).optional(),
  settings: z.record(z.any()).optional()
});

// Provider schemas
export const OpenAIProviderSchema = z.object({
  apiKey: z.string().optional(),
  organization: z.string().optional(),
  baseUrl: z.string().url().optional(),
  timeout: z.number().positive().optional(),
  maxRetries: z.number().min(0).max(10).optional()
});

export const AnthropicProviderSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  version: z.string().optional()
});

export const ProviderConfigSchema = z.object({
  openai: OpenAIProviderSchema.optional(),
  anthropic: AnthropicProviderSchema.optional(),
  custom: z.record(z.any()).optional()
});

// Plugin configuration schema
export const PluginConfigSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    path: z.string().optional(),
    options: z.record(z.any()).optional()
  })
]);

// Feature flags schema
export const FeatureFlagsSchema = z.record(z.boolean());

// Environment override schema
export const EnvironmentOverrideSchema = z.object({
  workflows: WorkflowDefaultsSchema.partial().optional(),
  tools: ToolConfigurationSchema.partial().optional(),
  providers: ProviderConfigSchema.partial().optional(),
  features: FeatureFlagsSchema.optional()
});

// Complete Roast configuration schema
export const RoastConfigSchema = z.object({
  project: ProjectConfigSchema,
  workflows: WorkflowDefaultsSchema.default({}),
  tools: ToolConfigurationSchema.default({}),
  providers: ProviderConfigSchema.default({}),
  plugins: z.array(PluginConfigSchema).optional(),
  environments: z.record(EnvironmentOverrideSchema).optional(),
  features: FeatureFlagsSchema.optional()
});

// Type exports
export type PathConfig = z.infer<typeof PathConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type SessionConfig = z.infer<typeof SessionConfigSchema>;
export type WorkflowDefaults = z.infer<typeof WorkflowDefaultsSchema>;
export type ToolConfiguration = z.infer<typeof ToolConfigurationSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;
export type EnvironmentOverride = z.infer<typeof EnvironmentOverrideSchema>;
export type RoastConfig = z.infer<typeof RoastConfigSchema>;

// Validation error class
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public details?: string
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}