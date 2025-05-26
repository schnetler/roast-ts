import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { EventEmitter } from 'events';
import { ConfigValidator } from './config-validator';
import { RoastConfig, ConfigValidationError } from './config-schema';
import { deepmerge } from '../shared/utils';

export interface ConfigLoaderOptions {
  searchPaths?: string[];
  configFiles?: string[];
  envPrefix?: string;
  watch?: boolean;
  environment?: string;
}

export class ConfigLoader extends EventEmitter {
  private config: RoastConfig | null = null;
  private validator: ConfigValidator;
  private watchers = new Map<string, any>();
  private options: Required<ConfigLoaderOptions>;

  constructor(options: ConfigLoaderOptions = {}) {
    super();
    this.validator = new ConfigValidator();
    this.options = {
      searchPaths: options.searchPaths || ['.', '.roast', process.cwd()],
      configFiles: options.configFiles || [
        'roast.config.ts',
        'roast.config.js', 
        'roast.json',
        'roast.yml',
        'roast.yaml',
        '.roastrc'
      ],
      envPrefix: options.envPrefix || 'ROAST_',
      watch: options.watch || false,
      environment: options.environment || process.env.NODE_ENV || 'development'
    };
  }

  /**
   * Load configuration from all sources
   */
  async load(): Promise<RoastConfig> {
    try {
      // 1. Load base configuration
      const baseConfig = await this.loadBaseConfig();
      
      // 2. Load environment-specific config
      const envConfig = await this.loadEnvironmentConfig(baseConfig);
      
      // 3. Load environment variables
      const envVars = this.loadEnvironmentVariables();
      
      // 4. Merge configurations
      const merged = await this.mergeConfigs(baseConfig, envConfig, envVars);
      
      // 5. Validate configuration
      const validated = await this.validator.validateComplete(merged);
      
      // 6. Apply defaults and transformations
      const final = this.applyDefaults(validated);
      
      // 7. Set up watching if enabled
      if (this.options.watch) {
        await this.setupWatchers();
      }
      
      this.config = final;
      this.emit('config:loaded', final);
      
      return final;
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        throw error;
      }
      throw new Error(`Failed to load configuration: ${error}`);
    }
  }

  /**
   * Get current configuration
   */
  get(): RoastConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    return this.config;
  }

  /**
   * Update configuration at runtime
   */
  async update(updates: Partial<RoastConfig>): Promise<RoastConfig> {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }

    const merged = await this.mergeConfigs(this.config, updates);
    const validated = await this.validator.validateComplete(merged);
    
    this.config = validated;
    this.emit('config:updated', this.config);
    
    return this.config;
  }

  /**
   * Reload configuration
   */
  async reload(): Promise<RoastConfig> {
    const newConfig = await this.load();
    this.emit('config:reloaded', newConfig);
    return newConfig;
  }

  /**
   * Load base configuration from files
   */
  private async loadBaseConfig(): Promise<Partial<RoastConfig>> {
    for (const searchPath of this.options.searchPaths) {
      for (const configFile of this.options.configFiles) {
        const fullPath = path.resolve(searchPath, configFile);
        
        if (await this.fileExists(fullPath)) {
          return await this.loadConfigFile(fullPath);
        }
      }
    }
    
    // No config file found, return minimal defaults
    return {};
  }

  /**
   * Load configuration file based on extension
   */
  private async loadConfigFile(filePath: string): Promise<Partial<RoastConfig>> {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (ext) {
      case '.ts':
      case '.js':
        return this.loadJavaScriptConfig(filePath);
      
      case '.json':
        return this.loadJsonConfig(filePath);
      
      case '.yml':
      case '.yaml':
        return this.loadYamlConfig(filePath);
      
      default:
        // Try JSON for extensionless files like .roastrc
        return this.loadJsonConfig(filePath);
    }
  }

  /**
   * Load JavaScript/TypeScript configuration
   */
  private async loadJavaScriptConfig(filePath: string): Promise<Partial<RoastConfig>> {
    try {
      // Clear module cache for hot reloading
      const resolvedPath = require.resolve(filePath);
      delete require.cache[resolvedPath];
    } catch {
      // Module not in cache yet, that's fine
    }
    
    // For TypeScript files, ensure ts-node or similar is available
    if (filePath.endsWith('.ts')) {
      await this.ensureTypeScriptLoader();
    }
    
    const module = await import(filePath);
    const config = module.default || module.config;
    
    if (typeof config === 'function') {
      return await config(this.options.environment);
    }
    
    return config;
  }

  /**
   * Load JSON configuration
   */
  private async loadJsonConfig(filePath: string): Promise<Partial<RoastConfig>> {
    const content = await fs.readFile(filePath, 'utf-8');
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Invalid JSON in ${filePath}: ${error}`);
    }
  }

  /**
   * Load YAML configuration
   */
  private async loadYamlConfig(filePath: string): Promise<Partial<RoastConfig>> {
    const content = await fs.readFile(filePath, 'utf-8');
    try {
      return yaml.load(content) as Partial<RoastConfig>;
    } catch (error) {
      throw new Error(`Invalid YAML in ${filePath}: ${error}`);
    }
  }

  /**
   * Load environment-specific configuration
   */
  private async loadEnvironmentConfig(baseConfig: Partial<RoastConfig>): Promise<Partial<RoastConfig>> {
    if (!baseConfig.environments || !baseConfig.environments[this.options.environment]) {
      return {};
    }

    return baseConfig.environments[this.options.environment] as Partial<RoastConfig>;
  }

  /**
   * Load environment variables
   */
  private loadEnvironmentVariables(): Partial<RoastConfig> {
    const config: any = {};
    const prefix = this.options.envPrefix;
    
    // Map environment variables to config paths
    const envMappings: Record<string, string> = {
      [`${prefix}MODEL`]: 'workflows.model',
      [`${prefix}PROVIDER`]: 'workflows.provider',
      [`${prefix}OPENAI_API_KEY`]: 'providers.openai.apiKey',
      [`${prefix}ANTHROPIC_API_KEY`]: 'providers.anthropic.apiKey',
      [`${prefix}OPENAI_ORG`]: 'providers.openai.organization',
      [`${prefix}LOG_LEVEL`]: 'logging.level',
      [`${prefix}CACHE_DIR`]: 'project.paths.cache',
      [`${prefix}SESSION_DIR`]: 'project.paths.sessions',
      [`${prefix}TEMPERATURE`]: 'workflows.temperature',
      [`${prefix}MAX_TOKENS`]: 'workflows.maxTokens',
      [`${prefix}TIMEOUT`]: 'workflows.timeout',
      [`${prefix}RETRIES`]: 'workflows.retries'
    };
    
    for (const [envVar, configPath] of Object.entries(envMappings)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        // Parse numeric values
        let parsedValue: any = value;
        if (configPath.includes('temperature') || configPath.includes('Tokens') || 
            configPath.includes('timeout') || configPath.includes('retries')) {
          parsedValue = parseFloat(value) || parseInt(value);
        }
        
        this.setNestedValue(config, configPath, parsedValue);
      }
    }
    
    // Parse complex environment variables
    const featuresEnv = process.env[`${prefix}FEATURES`];
    if (featuresEnv) {
      try {
        config.features = JSON.parse(featuresEnv);
      } catch {
        console.warn(`Failed to parse ${prefix}FEATURES environment variable`);
      }
    }

    const defaultToolsEnv = process.env[`${prefix}DEFAULT_TOOLS`];
    if (defaultToolsEnv) {
      try {
        config.workflows = config.workflows || {};
        config.workflows.defaultTools = defaultToolsEnv.split(',').map(s => s.trim());
      } catch {
        console.warn(`Failed to parse ${prefix}DEFAULT_TOOLS environment variable`);
      }
    }
    
    return config;
  }

  /**
   * Merge configurations with proper precedence
   */
  private async mergeConfigs(...configs: Partial<RoastConfig>[]): Promise<RoastConfig> {
    // Filter out empty configs
    const validConfigs = configs.filter(c => c && Object.keys(c).length > 0);
    
    if (validConfigs.length === 0) {
      return this.getMinimalConfig();
    }

    // Use deepmerge for proper nested object merging
    return deepmerge.all(validConfigs) as RoastConfig;
  }

  /**
   * Apply smart defaults and transformations
   */
  private applyDefaults(config: RoastConfig): RoastConfig {
    // Apply computed defaults
    if (!config.project.name && this.isInGitRepo()) {
      config.project.name = path.basename(process.cwd());
    }
    
    if (!config.project.version) {
      config.project.version = this.readPackageVersion() || '0.1.0';
    }
    
    // Ensure all paths are absolute
    const pathKeys: Array<keyof typeof config.project.paths> = [
      'workflows', 'tools', 'prompts', 'sessions', 'cache'
    ];
    
    for (const key of pathKeys) {
      const value = config.project.paths[key];
      if (value && !path.isAbsolute(value)) {
        config.project.paths[key] = path.resolve(process.cwd(), value);
      }
    }
    
    return config;
  }

  /**
   * Set up file watchers for hot reloading
   */
  private async setupWatchers(): Promise<void> {
    try {
      // Dynamic import to avoid bundling chokidar when not needed
      const chokidar = await import('chokidar' as any);
      
      const configFiles = await this.findConfigFiles();
      
      for (const file of configFiles) {
        const watcher = chokidar.watch(file, {
          persistent: true,
          ignoreInitial: true
        });
        
        watcher.on('change', async () => {
          console.log(`Config file changed: ${file}`);
          try {
            await this.reload();
          } catch (error) {
            console.error(`Failed to reload configuration: ${error}`);
            this.emit('config:error', error);
          }
        });
        
        this.watchers.set(file, watcher);
      }
    } catch (error) {
      console.warn('Chokidar not available, file watching disabled:', error);
    }
  }

  /**
   * Clean up watchers
   */
  async close(): Promise<void> {
    for (const [file, watcher] of this.watchers) {
      await watcher.close();
    }
    this.watchers.clear();
  }

  /**
   * Helper methods
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  private async ensureTypeScriptLoader(): Promise<void> {
    // In test environment, skip TypeScript loader setup
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    
    try {
      require.resolve('ts-node');
      require('ts-node/register');
    } catch {
      // Try other loaders like esbuild-register
      try {
        require.resolve('esbuild-register');
        require('esbuild-register/dist/node').register();
      } catch {
        throw new Error(
          'TypeScript configuration files require ts-node or esbuild-register. ' +
          'Please install one of them: npm install -D ts-node'
        );
      }
    }
  }

  private async findConfigFiles(): Promise<string[]> {
    const files: string[] = [];
    
    for (const searchPath of this.options.searchPaths) {
      for (const configFile of this.options.configFiles) {
        const fullPath = path.resolve(searchPath, configFile);
        if (await this.fileExists(fullPath)) {
          files.push(fullPath);
        }
      }
    }
    
    return files;
  }

  private isInGitRepo(): boolean {
    try {
      require('child_process').execSync('git rev-parse --git-dir', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  private readPackageVersion(): string | null {
    try {
      const pkg = JSON.parse(
        require('fs').readFileSync(
          path.join(process.cwd(), 'package.json'), 
          'utf-8'
        )
      );
      return pkg.version || null;
    } catch {
      return null;
    }
  }

  private getMinimalConfig(): RoastConfig {
    return {
      project: {
        name: 'unnamed',
        version: '0.1.0',
        paths: {
          workflows: '.roast/workflows',
          tools: '.roast/tools',
          prompts: '.roast/prompts',
          sessions: '.roast/sessions',
          cache: '.roast/cache'
        }
      },
      workflows: {
        model: 'gpt-4',
        provider: 'openai',
        session: {
          persist: true
        }
      },
      tools: {},
      providers: {}
    };
  }
}