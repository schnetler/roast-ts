import { ConfigValidator } from '../config-validator';
import { 
  ProjectConfigSchema, 
  RoastConfigSchema,
  WorkflowDefaultsSchema,
  ProviderConfigSchema 
} from '../config-schema';
import { z } from 'zod';

describe('ConfigValidator', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    validator = new ConfigValidator();
  });

  describe('validateProject', () => {
    it('should validate valid project config', async () => {
      const validConfig = {
        name: 'test-project',
        version: '1.0.0',
        description: 'Test project',
        paths: {
          workflows: './workflows',
          tools: './tools',
          prompts: './prompts',
          sessions: './sessions',
          cache: './cache'
        }
      };

      const result = await validator.validateProject(validConfig);
      expect(result).toEqual(validConfig);
    });

    it('should reject project without name', async () => {
      const invalidConfig = {
        version: '1.0.0',
        paths: {}
      };

      await expect(validator.validateProject(invalidConfig))
        .rejects.toThrow(/name/i);
    });

    it('should reject invalid version format', async () => {
      const invalidConfig = {
        name: 'test',
        version: 'v1.0', // Should be semver format
        paths: {}
      };

      await expect(validator.validateProject(invalidConfig))
        .rejects.toThrow(/version/i);
    });

    it('should apply default paths', async () => {
      const minimalConfig = {
        name: 'test',
        version: '1.0.0'
      };

      const result = await validator.validateProject(minimalConfig);
      
      expect(result.paths.workflows).toBe('.roast/workflows');
      expect(result.paths.tools).toBe('.roast/tools');
      expect(result.paths.prompts).toBe('.roast/prompts');
      expect(result.paths.sessions).toBe('.roast/sessions');
      expect(result.paths.cache).toBe('.roast/cache');
    });
  });

  describe('validateWorkflows', () => {
    it('should validate valid workflow defaults', async () => {
      const validConfig = {
        model: 'gpt-4',
        provider: 'openai',
        temperature: 0.7,
        maxTokens: 2000,
        timeout: 30000,
        retries: 3,
        parallel: true,
        defaultTools: ['readFile', 'writeFile'],
        session: {
          persist: true,
          compression: true,
          retention: 30
        }
      };

      const result = await validator.validateWorkflows(validConfig);
      expect(result).toEqual(validConfig);
    });

    it('should apply default values', async () => {
      const minimalConfig = {};

      const result = await validator.validateWorkflows(minimalConfig);
      
      expect(result.model).toBe('gpt-4');
      expect(result.provider).toBe('openai');
      expect(result.session.persist).toBe(true);
    });

    it('should reject invalid temperature', async () => {
      const invalidConfig = {
        temperature: 2.5 // Max is 2.0
      };

      await expect(validator.validateWorkflows(invalidConfig))
        .rejects.toThrow(/temperature/i);
    });

    it('should reject negative values', async () => {
      const invalidConfig = {
        maxTokens: -100
      };

      await expect(validator.validateWorkflows(invalidConfig))
        .rejects.toThrow(/positive/i);
    });
  });

  describe('validateProviders', () => {
    it('should validate OpenAI provider config', async () => {
      const validConfig = {
        openai: {
          apiKey: 'sk-test123',
          organization: 'org-test',
          baseUrl: 'https://api.openai.com',
          timeout: 60000,
          maxRetries: 3
        }
      };

      const result = await validator.validateProviders(validConfig);
      expect(result).toEqual(validConfig);
    });

    it('should validate Anthropic provider config', async () => {
      const validConfig = {
        anthropic: {
          apiKey: 'sk-ant-test123',
          baseUrl: 'https://api.anthropic.com',
          version: '2024-01-01'
        }
      };

      const result = await validator.validateProviders(validConfig);
      expect(result).toEqual(validConfig);
    });

    it('should allow custom providers', async () => {
      const validConfig = {
        custom: {
          myProvider: {
            apiKey: 'custom-key',
            endpoint: 'https://custom.api.com'
          }
        }
      };

      const result = await validator.validateProviders(validConfig);
      expect(result.custom?.myProvider).toBeDefined();
    });

    it('should reject invalid URLs', async () => {
      const invalidConfig = {
        openai: {
          baseUrl: 'not-a-url'
        }
      };

      await expect(validator.validateProviders(invalidConfig))
        .rejects.toThrow(/url/i);
    });
  });

  describe('validateComplete', () => {
    it('should validate complete configuration', async () => {
      const completeConfig = {
        project: {
          name: 'complete-test',
          version: '1.0.0',
          paths: {
            workflows: './workflows',
            tools: './tools',
            prompts: './prompts',
            sessions: './sessions',
            cache: './cache'
          }
        },
        workflows: {
          model: 'gpt-4',
          provider: 'openai',
          session: {
            persist: true
          }
        },
        tools: {
          builtin: { readFile: { cache: true } },
          custom: ['./tools/custom.ts']
        },
        providers: {
          openai: {
            apiKey: 'sk-test'
          }
        },
        plugins: [],
        features: {
          telemetry: true,
          caching: false
        }
      };

      const result = await validator.validateComplete(completeConfig);
      expect(result.project.name).toBe('complete-test');
      expect(result.features?.telemetry).toBe(true);
    });

    it('should handle partial configurations with defaults', async () => {
      const partialConfig = {
        project: {
          name: 'partial-test'
        }
      };

      const result = await validator.validateComplete(partialConfig);
      
      // Check defaults were applied
      expect(result.project.version).toBe('0.1.0');
      expect(result.workflows.model).toBe('gpt-4');
      expect(result.project.paths.workflows).toBe('.roast/workflows');
    });

    it('should validate environment-specific overrides', async () => {
      const configWithEnvs = {
        project: {
          name: 'env-test',
          version: '1.0.0'
        },
        workflows: {
          model: 'gpt-3.5-turbo',
          temperature: 0.9
        },
        environments: {
          production: {
            workflows: {
              model: 'gpt-4',
              temperature: 0.3,
              maxTokens: 4000
            },
            features: {
              caching: true,
              monitoring: true
            }
          },
          development: {
            workflows: {
              temperature: 1.0
            }
          }
        }
      };

      const result = await validator.validateComplete(configWithEnvs);
      expect(result.environments?.production?.workflows?.temperature).toBe(0.3);
      expect(result.environments?.development?.workflows?.temperature).toBe(1.0);
    });
  });

  describe('custom validation rules', () => {
    it('should validate plugin configurations', async () => {
      const config = {
        project: { name: 'plugin-test', version: '1.0.0' },
        plugins: [
          '@roast/plugin-github',
          {
            name: 'custom-plugin',
            path: './plugins/custom.ts',
            options: {
              apiUrl: 'https://api.example.com'
            }
          }
        ]
      };

      const result = await validator.validateComplete(config);
      expect(result.plugins).toHaveLength(2);
      expect(result.plugins?.[1]).toHaveProperty('options.apiUrl');
    });

    it('should validate tool settings', async () => {
      const config = {
        project: { name: 'tool-test', version: '1.0.0' },
        tools: {
          settings: {
            readFile: {
              cache: true,
              maxSize: '10MB'
            },
            cmd: {
              whitelist: ['npm', 'yarn', 'git'],
              timeout: 30000
            }
          }
        }
      };

      const result = await validator.validateComplete(config);
      expect(result.tools.settings?.readFile.cache).toBe(true);
      expect(result.tools.settings?.cmd.whitelist).toContain('npm');
    });
  });

  describe('error messages', () => {
    it('should provide clear error messages for validation failures', async () => {
      const invalidConfig = {
        project: {
          name: '', // Empty string
          version: 'not-semver',
          paths: {
            workflows: 123 // Should be string
          }
        },
        workflows: {
          temperature: 3.0, // Too high
          retries: -1 // Negative
        }
      };

      try {
        await validator.validateComplete(invalidConfig);
        fail('Should have thrown validation error');
      } catch (error: any) {
        expect(error.message).toContain('validation failed');
        expect(error.details).toBeDefined();
        expect(error.details).toContain('name');
        expect(error.details).toContain('version');
        expect(error.details).toContain('temperature');
      }
    });
  });
});