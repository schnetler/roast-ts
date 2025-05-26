export { ConfigLoader, ConfigLoaderOptions } from './config-loader';
export { ConfigValidator } from './config-validator';
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
} from './config-schema';

// Helper function for creating typed configurations
export function defineConfig(config: RoastConfig): RoastConfig;
export function defineConfig(
  configFn: (env: string) => RoastConfig
): RoastConfig;
export function defineConfig(
  configOrFn: RoastConfig | ((env: string) => RoastConfig)
): RoastConfig {
  if (typeof configOrFn === 'function') {
    const env = process.env.NODE_ENV || 'development';
    return configOrFn(env);
  }
  return configOrFn;
}