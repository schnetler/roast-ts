import { z } from 'zod';
import {
  ProjectConfigSchema,
  WorkflowDefaultsSchema,
  ToolConfigurationSchema,
  ProviderConfigSchema,
  RoastConfigSchema,
  ConfigValidationError,
  RoastConfig,
  ProjectConfig,
  WorkflowDefaults,
  ProviderConfig
} from './config-schema';

export class ConfigValidator {
  /**
   * Validate project configuration
   */
  async validateProject(config: unknown): Promise<ProjectConfig> {
    try {
      return await ProjectConfigSchema.parseAsync(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = this.formatZodErrors(error);
        throw new ConfigValidationError(
          `Project configuration validation failed: ${details}`,
          details
        );
      }
      throw error;
    }
  }

  /**
   * Validate workflow defaults
   */
  async validateWorkflows(config: unknown): Promise<WorkflowDefaults> {
    try {
      return await WorkflowDefaultsSchema.parseAsync(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = this.formatZodErrors(error);
        throw new ConfigValidationError(
          `Workflow configuration validation failed: ${details}`,
          details
        );
      }
      throw error;
    }
  }

  /**
   * Validate provider configuration
   */
  async validateProviders(config: unknown): Promise<ProviderConfig> {
    try {
      return await ProviderConfigSchema.parseAsync(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = this.formatZodErrors(error);
        throw new ConfigValidationError(
          `Provider configuration validation failed: ${details}`,
          details
        );
      }
      throw error;
    }
  }

  /**
   * Validate complete configuration
   */
  async validateComplete(config: unknown): Promise<RoastConfig> {
    try {
      // Apply defaults for missing sections
      const configWithDefaults = {
        project: (config as any)?.project || { name: 'unnamed' },
        workflows: (config as any)?.workflows || {},
        tools: (config as any)?.tools || {},
        providers: (config as any)?.providers || {},
        ...(config as any)
      };

      return await RoastConfigSchema.parseAsync(configWithDefaults);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = this.formatZodErrors(error);
        throw new ConfigValidationError(
          `Configuration validation failed: ${details}`,
          details
        );
      }
      throw error;
    }
  }

  /**
   * Validate partial configuration for updates
   */
  async validatePartial(config: unknown): Promise<Partial<RoastConfig>> {
    try {
      // Create a partial schema that makes all fields optional
      const PartialSchema = RoastConfigSchema.partial();
      return await PartialSchema.parseAsync(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = this.formatZodErrors(error);
        throw new ConfigValidationError(
          `Partial configuration validation failed: ${details}`,
          details
        );
      }
      throw error;
    }
  }

  /**
   * Format Zod validation errors into readable messages
   */
  private formatZodErrors(error: z.ZodError): string {
    const errors = error.errors.map(err => {
      const path = err.path.join('.');
      let message = err.message;

      // Customize error messages for common issues
      if (err.code === 'invalid_type') {
        message = `Expected ${err.expected}, received ${err.received}`;
      } else if (err.code === 'too_small') {
        if (err.type === 'string') {
          message = `String must contain at least ${err.minimum} character(s)`;
        } else if (err.type === 'number') {
          if (err.minimum === 0) {
            message = `Number must be positive or zero`;
          } else if (err.minimum === 1) {
            message = `Number must be positive`;
          } else {
            message = `Number must be greater than or equal to ${err.minimum}`;
          }
        }
      } else if (err.code === 'too_big') {
        if (err.type === 'number') {
          message = `Number must be less than or equal to ${err.maximum}`;
        }
      }

      return path ? `${path}: ${message}` : message;
    });

    return errors.join('\n');
  }

  /**
   * Check if a configuration is valid without throwing
   */
  async isValid(config: unknown): Promise<boolean> {
    try {
      await this.validateComplete(config);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get validation errors without throwing
   */
  async getValidationErrors(config: unknown): Promise<string[] | null> {
    try {
      await this.validateComplete(config);
      return null;
    } catch (error) {
      if (error instanceof ConfigValidationError && error.details) {
        return error.details.split('\n');
      }
      return ['Unknown validation error'];
    }
  }

  /**
   * Merge and validate configurations
   */
  async mergeAndValidate(
    base: RoastConfig,
    ...overrides: Array<Partial<RoastConfig>>
  ): Promise<RoastConfig> {
    // Deep merge configurations
    let merged = { ...base };
    
    for (const override of overrides) {
      merged = this.deepMerge(merged, override);
    }

    // Validate the merged result
    return this.validateComplete(merged);
  }

  /**
   * Deep merge objects
   */
  private deepMerge(target: any, source: any): any {
    if (!source) return target;

    const output = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          output[key] = this.deepMerge(target[key] || {}, source[key]);
        } else {
          output[key] = source[key];
        }
      }
    }
    
    return output;
  }
}