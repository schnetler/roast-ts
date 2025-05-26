import { ResourceFactory } from '../../resource-factory';
import { ResourceHandler } from '../../types';
import { Resource, ResourceConfig, ValidationResult } from '../../../shared/types';

// Mock handlers
class MockFileHandler implements ResourceHandler {
  constructor(private resourceType: string = 'file') {}
  
  async create(config: ResourceConfig): Promise<Resource> {
    return {
      type: this.resourceType,
      source: config.source,
      async exists() { return true; },
      async validate() { return { valid: true, errors: [] }; }
    };
  }
}

class MockUrlHandler implements ResourceHandler {
  async create(config: ResourceConfig): Promise<Resource> {
    return {
      type: 'url',
      source: config.source,
      async exists() { return true; },
      async validate() { return { valid: true, errors: [] }; }
    };
  }
}

// Mock fs module
jest.mock('fs/promises', () => ({
  stat: jest.fn()
}));

import * as fs from 'fs/promises';

describe('ResourceFactory', () => {
  beforeEach(() => {
    // Clear registered handlers
    (ResourceFactory as any).handlers.clear();
    jest.clearAllMocks();
  });

  describe('Type Detection', () => {
    it('should detect file resources', async () => {
      const mockStat = { isDirectory: () => false };
      (fs.stat as jest.Mock).mockResolvedValue(mockStat);
      
      ResourceFactory.register('file', new MockFileHandler());
      
      const resource = await ResourceFactory.create('/path/to/file.txt');
      expect(resource.type).toBe('file');
    });

    it('should detect directory resources', async () => {
      const mockStat = { isDirectory: () => true };
      (fs.stat as jest.Mock).mockResolvedValue(mockStat);
      
      ResourceFactory.register('directory', new MockFileHandler('directory'));
      
      const resource = await ResourceFactory.create('/path/to/directory');
      expect(resource.type).toBe('directory');
    });

    it('should detect URL resources', async () => {
      ResourceFactory.register('url', new MockUrlHandler());
      
      const resource = await ResourceFactory.create('https://example.com');
      expect(resource.type).toBe('url');
    });

    it('should detect command resources', async () => {
      ResourceFactory.register('command', new MockFileHandler('command'));
      
      const resource = await ResourceFactory.create('$(echo hello)');
      expect(resource.type).toBe('command');
    });

    it('should detect API resources', async () => {
      ResourceFactory.register('api', new MockFileHandler('api'));
      
      const apiConfig = JSON.stringify({
        url: 'https://api.example.com',
        options: { method: 'GET' }
      });
      
      const resource = await ResourceFactory.create(apiConfig);
      expect(resource.type).toBe('api');
    });

    it('should detect glob patterns', async () => {
      ResourceFactory.register('glob', new MockFileHandler('glob'));
      
      const resource = await ResourceFactory.create('src/**/*.ts');
      expect(resource.type).toBe('glob');
    });

    it('should default to none resource', async () => {
      ResourceFactory.register('none', new MockFileHandler('none'));
      (fs.stat as jest.Mock).mockRejectedValue(new Error('Not found'));
      
      const resource = await ResourceFactory.create('nonexistent');
      expect(resource.type).toBe('none');
    });
  });

  describe('Resource Creation', () => {
    it('should create appropriate resource types', async () => {
      const handler = new MockFileHandler();
      ResourceFactory.register('file', handler);
      (fs.stat as jest.Mock).mockResolvedValue({ isDirectory: () => false });
      
      const resource = await ResourceFactory.create('/path/to/file.txt');
      expect(resource).toBeDefined();
      expect(resource.source).toBe('/path/to/file.txt');
    });

    it('should validate resource configurations', async () => {
      const invalidHandler: ResourceHandler = {
        async create(config: ResourceConfig): Promise<Resource> {
          return {
            type: 'file',
            source: config.source,
            async exists() { return false; },
            async validate() { 
              return { 
                valid: false, 
                errors: ['File does not exist'] 
              }; 
            }
          };
        }
      };
      
      ResourceFactory.register('file', invalidHandler);
      (fs.stat as jest.Mock).mockResolvedValue({ isDirectory: () => false });
      
      await expect(ResourceFactory.create('/invalid/file.txt'))
        .rejects.toThrow('Invalid file resource: File does not exist');
    });

    it('should handle creation failures', async () => {
      await expect(ResourceFactory.create('https://example.com'))
        .rejects.toThrow('No handler registered for resource type: url');
    });

    it('should apply default configurations', async () => {
      const handler: ResourceHandler = {
        async create(config: ResourceConfig): Promise<Resource> {
          expect(config).toMatchObject({
            source: '/path/to/file.txt'
            // mustExist is not a default value
          });
          
          return {
            type: 'file',
            source: config.source,
            async exists() { return true; },
            async validate() { return { valid: true, errors: [] }; }
          };
        }
      };
      
      ResourceFactory.register('file', handler);
      (fs.stat as jest.Mock).mockResolvedValue({ isDirectory: () => false });
      
      await ResourceFactory.create('/path/to/file.txt');
    });

    it('should handle ResourceConfig objects', async () => {
      ResourceFactory.register('file', new MockFileHandler());
      (fs.stat as jest.Mock).mockResolvedValue({ isDirectory: () => false });
      
      const config: ResourceConfig = {
        source: '/path/to/file.txt',
        mustExist: true,
        metadata: { custom: 'data' }
      };
      
      const resource = await ResourceFactory.create(config);
      expect(resource.type).toBe('file');
    });
  });

  describe('Pattern Detection', () => {
    it('should detect various glob patterns', async () => {
      ResourceFactory.register('glob', new MockFileHandler('glob'));
      
      const patterns = [
        'src/*.js',
        '**/*.ts',
        'test/**/*.spec.{js,ts}',
        'files/[a-z]*.txt',
        'src/**/test?.js'
      ];
      
      for (const pattern of patterns) {
        const resource = await ResourceFactory.create(pattern);
        expect(resource.type).toBe('glob');
      }
    });

    it('should handle paths that look like directories', async () => {
      ResourceFactory.register('directory', new MockFileHandler('directory'));
      (fs.stat as jest.Mock).mockRejectedValue(new Error('Not found'));
      
      const resource = await ResourceFactory.create('/path/to/dir/');
      expect(resource.type).toBe('directory');
    });

    it('should handle URL variations', async () => {
      ResourceFactory.register('url', new MockUrlHandler());
      
      const urls = [
        'https://example.com',
        'http://localhost:3000',
        'https://api.example.com/v1/users',
        'https://example.com?query=test'
      ];
      
      for (const url of urls) {
        const resource = await ResourceFactory.create(url);
        expect(resource.type).toBe('url');
      }
    });
  });
});