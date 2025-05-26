import { ConfigLoader } from '../config-loader';
import { RoastConfig } from '../../shared/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { z } from 'zod';

// Mock fs and other modules
jest.mock('fs/promises');
jest.mock('chokidar');
jest.mock('js-yaml');

describe('ConfigLoader', () => {
  let loader: ConfigLoader;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockYaml = yaml as jest.Mocked<typeof yaml>;
  let originalImport: any;
  let originalNodeEnv: string | undefined;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    // Set NODE_ENV to test
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    
    // Clear environment variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('ROAST_')) {
        delete process.env[key];
      }
    });
    
    // Mock file existence checks - default to file not found
    mockFs.access.mockImplementation(async (path) => {
      throw new Error('File not found');
    });
    
    // Mock readFile to return empty when file doesn't exist
    mockFs.readFile.mockImplementation(async (path) => {
      throw new Error('File not found');
    });
    
    // Mock require.resolve to prevent module not found errors
    jest.spyOn(require, 'resolve').mockImplementation((id) => {
      if (typeof id === 'string' && id.includes('roast.config')) {
        return id;
      }
      return jest.requireActual('module')._resolveFilename(id, module, false);
    });
    
    // Store original import and mock it
    originalImport = (global as any).import;
    (global as any).import = jest.fn().mockRejectedValue(new Error('Module not found'));
    
    loader = new ConfigLoader();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Restore original import
    (global as any).import = originalImport;
    // Restore NODE_ENV
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  describe('load', () => {
    it('should load TypeScript configuration', async () => {
      const mockConfig: Partial<RoastConfig> = {
        project: {
          name: 'test-project',
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
        tools: {},
        providers: {}
      };

      // Mock the config file to exist
      mockFs.access.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('roast.config.ts')) {
          return Promise.resolve();
        }
        throw new Error('File not found');
      });

      // Mock dynamic import
      (global as any).import = jest.fn().mockResolvedValue({ default: mockConfig });
      
      // Spy on private method to bypass actual file loading
      const loadJavaScriptConfigSpy = jest.spyOn(loader as any, 'loadJavaScriptConfig');
      loadJavaScriptConfigSpy.mockResolvedValue(mockConfig);

      const config = await loader.load();
      
      expect(config.project.name).toBe('test-project');
      expect(config.workflows.model).toBe('gpt-4');

      // Restore original import
      (global as any).import = originalImport;
    });

    it('should load JSON configuration', async () => {
      // Change loader to look for JSON file
      loader = new ConfigLoader({
        configFiles: ['roast.config.json']
      });
      
      const mockConfig = {
        project: {
          name: 'json-project',
          version: '0.1.0',
          paths: {
            workflows: './workflows',
            tools: './tools',
            prompts: './prompts',
            sessions: './sessions',
            cache: './cache'
          }
        },
        workflows: {
          model: 'gpt-3.5-turbo',
          provider: 'openai',
          session: { persist: false }
        },
        tools: {},
        providers: {}
      };

      // Mock file exists for JSON file
      mockFs.access.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('roast.config.json')) {
          return Promise.resolve();
        }
        throw new Error('File not found');
      });

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockConfig));
      
      const config = await loader.load();
      
      expect(config.project.name).toBe('json-project');
      expect(config.workflows.model).toBe('gpt-3.5-turbo');
    });

    it('should load YAML configuration', async () => {
      const yamlContent = `
project:
  name: yaml-project
  version: 2.0.0
  paths:
    workflows: ./workflows
    tools: ./tools
    prompts: ./prompts
    sessions: ./sessions
    cache: ./cache

workflows:
  model: claude-3
  provider: anthropic
  session:
    persist: true

tools: {}
providers: {}
`;

      // Setup YAML file loader
      loader = new ConfigLoader({
        configFiles: ['roast.yml']
      });

      // Mock file exists for YAML file
      mockFs.access.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('roast.yml')) {
          return Promise.resolve();
        }
        throw new Error('File not found');
      });

      mockFs.readFile.mockResolvedValueOnce(yamlContent);
      
      // Mock yaml.load to parse the YAML content
      mockYaml.load.mockReturnValueOnce({
        project: {
          name: 'yaml-project',
          version: '2.0.0',
          paths: {
            workflows: './workflows',
            tools: './tools',
            prompts: './prompts',
            sessions: './sessions',
            cache: './cache'
          }
        },
        workflows: {
          model: 'claude-3',
          provider: 'anthropic',
          session: {
            persist: true
          }
        },
        tools: {},
        providers: {}
      });
      
      const config = await loader.load();
      
      expect(config.project.name).toBe('yaml-project');
      expect(config.workflows.provider).toBe('anthropic');
    });

    it('should merge environment variables', async () => {
      process.env.ROAST_MODEL = 'gpt-4-turbo';
      process.env.ROAST_OPENAI_API_KEY = 'test-key';
      
      const baseConfig = {
        project: {
          name: 'env-test',
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
          model: 'gpt-3.5-turbo',
          provider: 'openai',
          session: { persist: true }
        },
        tools: {},
        providers: {}
      };

      // Setup JSON file loader
      loader = new ConfigLoader({
        configFiles: ['roast.config.json']
      });

      // Mock file exists for JSON file
      mockFs.access.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('roast.config.json')) {
          return Promise.resolve();
        }
        throw new Error('File not found');
      });

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(baseConfig));
      
      const config = await loader.load();
      
      expect(config.workflows.model).toBe('gpt-4-turbo');
      expect(config.providers.openai?.apiKey).toBe('test-key');
    });

    it('should apply defaults for missing values', async () => {
      const minimalConfig = {
        project: {
          name: 'minimal',
          paths: {}
        },
        workflows: {},
        tools: {},
        providers: {}
      };

      // Setup JSON file loader
      loader = new ConfigLoader({
        configFiles: ['roast.config.json']
      });

      // Mock file exists for JSON file
      mockFs.access.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('roast.config.json')) {
          return Promise.resolve();
        }
        throw new Error('File not found');
      });

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(minimalConfig));
      
      const config = await loader.load();
      
      expect(config.project.version).toBe('0.1.0');
      expect(config.workflows.model).toBe('gpt-4');
      expect(config.workflows.provider).toBe('openai');
      expect(config.project.paths.workflows).toContain('.roast/workflows');
    });

    it('should validate configuration schema', async () => {
      const invalidConfig = {
        project: {
          // Missing required 'name' field
          version: 'invalid-version', // Invalid format
          paths: {}
        },
        workflows: {},
        tools: {},
        providers: {}
      };

      // Setup JSON file loader
      loader = new ConfigLoader({
        configFiles: ['roast.config.json']
      });

      // Mock file exists for JSON file
      mockFs.access.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('roast.config.json')) {
          return Promise.resolve();
        }
        throw new Error('File not found');
      });

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(invalidConfig));
      
      await expect(loader.load()).rejects.toThrow('Configuration validation failed');
    });

    it('should handle missing configuration file', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));
      
      const config = await loader.load();
      
      // Should return config with defaults
      expect(config.workflows.model).toBe('gpt-4');
      expect(config.workflows.provider).toBe('openai');
    });

    it('should load environment-specific configuration', async () => {
      process.env.NODE_ENV = 'production';
      
      const configWithEnvs = {
        project: {
          name: 'env-specific',
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
          model: 'gpt-3.5-turbo',
          provider: 'openai',
          session: { persist: true }
        },
        tools: {},
        providers: {},
        environments: {
          production: {
            workflows: {
              model: 'gpt-4',
              temperature: 0.3
            }
          }
        }
      };

      // Setup JSON file loader
      loader = new ConfigLoader({
        configFiles: ['roast.config.json']
      });

      // Mock file exists for JSON file
      mockFs.access.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('roast.config.json')) {
          return Promise.resolve();
        }
        throw new Error('File not found');
      });

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(configWithEnvs));
      
      const config = await loader.load();
      
      expect(config.workflows.model).toBe('gpt-4');
      expect(config.workflows.temperature).toBe(0.3);
    });
  });

  describe('get', () => {
    it('should throw if configuration not loaded', () => {
      expect(() => loader.get()).toThrow('Configuration not loaded');
    });

    it('should return loaded configuration', async () => {
      const mockConfig = {
        project: {
          name: 'test',
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
          session: { persist: true }
        },
        tools: {},
        providers: {}
      };

      // Setup JSON file loader
      loader = new ConfigLoader({
        configFiles: ['roast.config.json']
      });

      // Mock file exists for JSON file
      mockFs.access.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('roast.config.json')) {
          return Promise.resolve();
        }
        throw new Error('File not found');
      });

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockConfig));
      
      await loader.load();
      const config = loader.get();
      
      expect(config.project.name).toBe('test');
    });
  });

  describe('update', () => {
    it('should update configuration at runtime', async () => {
      const initialConfig = {
        project: {
          name: 'test',
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
          model: 'gpt-3.5-turbo',
          provider: 'openai',
          session: { persist: true }
        },
        tools: {},
        providers: {}
      };

      // Setup JSON file loader
      loader = new ConfigLoader({
        configFiles: ['roast.config.json']
      });

      // Mock file exists for JSON file
      mockFs.access.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('roast.config.json')) {
          return Promise.resolve();
        }
        throw new Error('File not found');
      });

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(initialConfig));
      
      await loader.load();
      
      const updated = await loader.update({
        workflows: {
          model: 'gpt-4',
          temperature: 0.7
        } as any
      });
      
      expect(updated.workflows.model).toBe('gpt-4');
      expect(updated.workflows.temperature).toBe(0.7);
      expect(updated.project.name).toBe('test'); // Unchanged
    });

    it('should validate updates', async () => {
      const initialConfig = {
        project: {
          name: 'test',
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
          session: { persist: true }
        },
        tools: {},
        providers: {}
      };

      // Setup JSON file loader
      loader = new ConfigLoader({
        configFiles: ['roast.config.json']
      });

      // Mock file exists for JSON file
      mockFs.access.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('roast.config.json')) {
          return Promise.resolve();
        }
        throw new Error('File not found');
      });

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(initialConfig));
      
      await loader.load();
      
      // Invalid temperature value
      await expect(loader.update({
        workflows: {
          temperature: 3.0 // Max is 2.0
        } as any
      })).rejects.toThrow();
    });
  });

  describe('reload', () => {
    it('should reload configuration from disk', async () => {
      const config1 = {
        project: {
          name: 'original',
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
          model: 'gpt-3.5-turbo',
          provider: 'openai',
          session: { persist: true }
        },
        tools: {},
        providers: {}
      };

      const config2 = {
        ...config1,
        project: { ...config1.project, name: 'updated' }
      };

      // Setup JSON file loader
      loader = new ConfigLoader({
        configFiles: ['roast.config.json']
      });

      // Mock file exists for JSON file
      mockFs.access.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('roast.config.json')) {
          return Promise.resolve();
        }
        throw new Error('File not found');
      });

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(config1))
        .mockResolvedValueOnce(JSON.stringify(config2));
      
      await loader.load();
      expect(loader.get().project.name).toBe('original');
      
      await loader.reload();
      expect(loader.get().project.name).toBe('updated');
    });
  });

  describe('complex environment variables', () => {
    it('should parse JSON features from environment', async () => {
      process.env.ROAST_FEATURES = '{"telemetry":true,"caching":false}';
      
      const config = {
        project: {
          name: 'test',
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
          session: { persist: true }
        },
        tools: {},
        providers: {}
      };

      // Setup JSON file loader
      loader = new ConfigLoader({
        configFiles: ['roast.config.json']
      });

      // Mock file exists for JSON file
      mockFs.access.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('roast.config.json')) {
          return Promise.resolve();
        }
        throw new Error('File not found');
      });

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(config));
      
      const loaded = await loader.load();
      
      expect(loaded.features?.telemetry).toBe(true);
      expect(loaded.features?.caching).toBe(false);
    });

    it('should handle invalid JSON in environment gracefully', async () => {
      process.env.ROAST_FEATURES = 'invalid-json';
      
      const config = {
        project: {
          name: 'test',
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
          session: { persist: true }
        },
        tools: {},
        providers: {}
      };

      // Setup JSON file loader
      loader = new ConfigLoader({
        configFiles: ['roast.config.json']
      });

      // Mock file exists for JSON file
      mockFs.access.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('roast.config.json')) {
          return Promise.resolve();
        }
        throw new Error('File not found');
      });

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(config));
      
      // Should not throw, just warn
      const loaded = await loader.load();
      expect(loaded.features).toBeUndefined();
    });
  });
});