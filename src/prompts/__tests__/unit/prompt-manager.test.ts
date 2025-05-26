import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PromptManager } from '../../prompt-manager';
import { PromptResolver } from '../../prompt-resolver';
import { PathResolver } from '../../../helpers/path-resolver';
import * as fs from 'fs/promises';
import * as path from 'path';

jest.mock('fs/promises');
jest.mock('../../../helpers/path-resolver');

const mockFs = jest.mocked(fs);
const mockPathResolver = jest.mocked(PathResolver);

describe('PromptManager', () => {
  let promptManager: PromptManager;
  let mockResolver: PromptResolver;
  let mockPathResolverInstance: any;
  let mockLoggerInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockPathResolverInstance = {
      resolve: jest.fn(),
      exists: jest.fn(),
      isFile: jest.fn(),
      isDirectory: jest.fn(),
    };
    mockPathResolver.mockImplementation(() => mockPathResolverInstance);

    mockLoggerInstance = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockResolver = {
      resolve: jest.fn(),
      registerFunction: jest.fn(),
      registerHelper: jest.fn(),
      validateTemplate: jest.fn(),
      extractVariables: jest.fn(),
    } as any;

    promptManager = new PromptManager({
      promptsDir: '/test/prompts',
      resolver: mockResolver,
      pathResolver: mockPathResolverInstance,
      logger: mockLoggerInstance,
      watchEnabled: false, // Disable by default, enable in specific tests
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      expect(promptManager).toBeInstanceOf(PromptManager);
    });

    it('should create default dependencies when not provided', () => {
      const manager = new PromptManager({
        promptsDir: '/test/prompts',
      });
      expect(manager).toBeInstanceOf(PromptManager);
    });
  });

  describe('loadPrompt', () => {
    it('should load and cache a prompt file', async () => {
      const promptContent = 'Hello {{name}}!';
      const promptPath = '/test/prompts/greeting.md';
      
      // Mock fs.access for findPromptFile
      mockFs.access.mockResolvedValue(undefined);
      
      // Mock fs.stat for loadPrompt
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        mtime: new Date(),
        size: promptContent.length
      } as any);
      
      mockFs.readFile.mockResolvedValue(promptContent);

      const result = await promptManager.loadPrompt('greeting');

      expect(mockFs.access).toHaveBeenCalledWith(promptPath);
      expect(mockFs.readFile).toHaveBeenCalledWith(promptPath, 'utf-8');
      expect(result).toBe(promptContent);
    });

    it('should return cached prompt on subsequent calls', async () => {
      const promptContent = 'Hello {{name}}!';
      const promptPath = '/test/prompts/greeting.md';
      
      // Mock fs.access for findPromptFile
      mockFs.access.mockResolvedValue(undefined);
      
      // Mock fs.stat for loadPrompt
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        mtime: new Date(),
        size: promptContent.length
      } as any);
      
      mockFs.readFile.mockResolvedValue(promptContent);

      // First call
      await promptManager.loadPrompt('greeting');
      // Second call
      const result = await promptManager.loadPrompt('greeting');

      expect(mockFs.readFile).toHaveBeenCalledTimes(1);
      expect(result).toBe(promptContent);
    });

    it('should try multiple extensions when file not found', async () => {
      const promptContent = 'Hello {{name}}!';
      const mdPath = '/test/prompts/greeting.md';
      const txtPath = '/test/prompts/greeting.txt';
      
      // Mock fs.access - first extension fails, second succeeds
      mockFs.access
        .mockRejectedValueOnce(new Error('File not found'))
        .mockResolvedValueOnce(undefined);
      
      // Mock fs.stat for loadPrompt
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        mtime: new Date(),
        size: promptContent.length
      } as any);
      
      mockFs.readFile.mockResolvedValue(promptContent);

      const result = await promptManager.loadPrompt('greeting');

      expect(mockFs.access).toHaveBeenCalledTimes(2);
      expect(mockFs.access).toHaveBeenNthCalledWith(1, mdPath);
      expect(mockFs.access).toHaveBeenNthCalledWith(2, txtPath);
      expect(result).toBe(promptContent);
    });

    it('should throw error when prompt file not found', async () => {
      // Mock fs.access to always reject (file not found)
      mockFs.access.mockRejectedValue(new Error('File not found'));

      await expect(promptManager.loadPrompt('nonexistent')).rejects.toThrow(
        'Prompt file not found: nonexistent'
      );
    });

    it('should throw error when path is not a file', async () => {
      const promptPath = '/test/prompts/greeting.md';
      
      // Mock fs.access for findPromptFile
      mockFs.access.mockResolvedValue(undefined);
      
      // Mock fs.stat to return a directory instead of file
      // First call succeeds returning directory, second call for the actual check
      mockFs.stat
        .mockResolvedValueOnce({
          isFile: () => false,
          isDirectory: () => true
        } as any)
        .mockResolvedValueOnce({
          isFile: () => false,
          isDirectory: () => true
        } as any);

      await expect(promptManager.loadPrompt('greeting')).rejects.toThrow(
        'Prompt path is not accessible: /test/prompts/greeting.md'
      );
    });
  });

  describe('resolvePrompt', () => {
    it('should load and resolve a prompt with variables', async () => {
      const promptContent = 'Hello {{name}}!';
      const resolvedContent = 'Hello Alice!';
      const variables = { name: 'Alice' };
      
      // Mock fs.access for findPromptFile
      mockFs.access.mockResolvedValue(undefined);
      
      // Mock fs.stat for loadPrompt
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        mtime: new Date(),
        size: promptContent.length
      } as any);
      
      mockFs.readFile.mockResolvedValue(promptContent);
      (mockResolver.resolve as jest.Mock).mockResolvedValue(resolvedContent as never);

      const result = await promptManager.resolvePrompt('greeting', variables);

      expect(mockResolver.resolve).toHaveBeenCalledWith(promptContent, variables);
      expect(result).toBe(resolvedContent);
    });

    it('should resolve prompt without variables', async () => {
      const promptContent = 'Hello world!';
      
      // Mock fs.access for findPromptFile
      mockFs.access.mockResolvedValue(undefined);
      
      // Mock fs.stat for loadPrompt
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        mtime: new Date(),
        size: promptContent.length
      } as any);
      
      mockFs.readFile.mockResolvedValue(promptContent);
      (mockResolver.resolve as jest.Mock).mockResolvedValue(promptContent as never);

      const result = await promptManager.resolvePrompt('greeting');

      expect(mockResolver.resolve).toHaveBeenCalledWith(promptContent, {});
      expect(result).toBe(promptContent);
    });
  });

  describe('invalidateCache', () => {
    it('should remove specific prompt from cache', async () => {
      const promptContent = 'Hello {{name}}!';
      
      // Mock fs.access for findPromptFile
      mockFs.access.mockResolvedValue(undefined);
      
      // Mock fs.stat for loadPrompt
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        mtime: new Date(),
        size: promptContent.length
      } as any);
      
      mockFs.readFile.mockResolvedValue(promptContent);

      // Load prompt to cache it
      await promptManager.loadPrompt('greeting');
      
      // Invalidate cache
      promptManager.invalidateCache('greeting');
      
      // Load again - should read from file system
      await promptManager.loadPrompt('greeting');

      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    });

    it('should clear entire cache when no prompt name provided', async () => {
      const promptContent1 = 'Hello {{name}}!';
      const promptContent2 = 'Goodbye {{name}}!';
      
      // Mock fs.access for findPromptFile
      mockFs.access.mockResolvedValue(undefined);
      
      // Mock fs.stat for loadPrompt
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        mtime: new Date(),
        size: 100
      } as any);
      
      mockFs.readFile
        .mockResolvedValueOnce(promptContent1)
        .mockResolvedValueOnce(promptContent2)
        .mockResolvedValueOnce(promptContent1)
        .mockResolvedValueOnce(promptContent2);

      // Load prompts to cache them
      await promptManager.loadPrompt('greeting');
      await promptManager.loadPrompt('goodbye');
      
      // Clear entire cache
      promptManager.invalidateCache();
      
      // Load again - should read from file system
      await promptManager.loadPrompt('greeting');
      await promptManager.loadPrompt('goodbye');

      expect(mockFs.readFile).toHaveBeenCalledTimes(4);
    });
  });

  describe('listPrompts', () => {
    it('should list all available prompts', async () => {
      const files = ['greeting.md', 'goodbye.txt', 'welcome.md', 'non-prompt.js'];
      
      // Mock fs.stat to return a directory
      mockFs.stat.mockResolvedValue({
        isDirectory: () => true
      } as any);
      
      mockFs.readdir.mockResolvedValue(files as any);

      const result = await promptManager.listPrompts();

      expect(mockFs.readdir).toHaveBeenCalledWith('/test/prompts');
      expect(result).toEqual(['goodbye', 'greeting', 'welcome']);
    });

    it('should return empty array when prompts directory does not exist', async () => {
      // Mock fs.stat to throw error (directory doesn't exist)
      mockFs.stat.mockRejectedValue(new Error('ENOENT'));

      const result = await promptManager.listPrompts();

      expect(result).toEqual([]);
    });

    it('should handle errors when reading directory', async () => {
      // Mock fs.stat to return a directory
      mockFs.stat.mockResolvedValue({
        isDirectory: () => true
      } as any);
      
      mockFs.readdir.mockRejectedValue(new Error('Permission denied'));

      await expect(promptManager.listPrompts()).rejects.toThrow('Permission denied');
    });
  });

  describe('watchPrompts', () => {
    it('should setup file watchers for hot reloading', async () => {
      // Create a new manager with watching enabled
      const watchingManager = new PromptManager({
        promptsDir: '/test/prompts',
        resolver: mockResolver,
        pathResolver: mockPathResolverInstance,
        logger: mockLoggerInstance,
        watchEnabled: true,
      });
      
      const mockWatcher = {
        on: jest.fn().mockReturnThis(),
        close: jest.fn(),
      };
      
      // Mock eval to return mocked chokidar
      const originalEval = global.eval;
      (global as any).eval = jest.fn().mockImplementation(() => 
        Promise.resolve({
          default: {
            watch: jest.fn().mockReturnValue(mockWatcher),
          },
        })
      );

      await watchingManager.watchPrompts();

      expect(mockWatcher.on).toHaveBeenCalledWith('change', expect.any(Function));
      expect(mockWatcher.on).toHaveBeenCalledWith('unlink', expect.any(Function));
      
      // Restore original eval
      (global as any).eval = originalEval;
    });

    it('should invalidate cache when prompt file changes', async () => {
      // Create a new manager with watching enabled
      const watchingManager = new PromptManager({
        promptsDir: '/test/prompts',
        resolver: mockResolver,
        pathResolver: mockPathResolverInstance,
        logger: mockLoggerInstance,
        watchEnabled: true,
      });
      
      const mockWatcher = {
        on: jest.fn().mockReturnThis(),
        close: jest.fn(),
      };
      
      let changeHandler: Function | undefined;
      mockWatcher.on.mockImplementation(((event: string, handler: Function) => {
        if (event === 'change') {
          changeHandler = handler;
        }
        return mockWatcher;
      }) as any);

      // Mock eval to return mocked chokidar
      const originalEval = global.eval;
      (global as any).eval = jest.fn().mockImplementation(() => 
        Promise.resolve({
          default: {
            watch: jest.fn().mockReturnValue(mockWatcher),
          },
        })
      );

      const spy = jest.spyOn(watchingManager, 'invalidateCache');
      
      await watchingManager.watchPrompts();
      
      // Simulate file change
      if (changeHandler) {
        changeHandler('/test/prompts/greeting.md');
      }

      expect(spy).toHaveBeenCalledWith('greeting');
      
      // Restore original eval
      (global as any).eval = originalEval;
    });
  });

  describe('stopWatching', () => {
    it('should close file watchers', async () => {
      // Create a new manager with watching enabled
      const watchingManager = new PromptManager({
        promptsDir: '/test/prompts',
        resolver: mockResolver,
        pathResolver: mockPathResolverInstance,
        logger: mockLoggerInstance,
        watchEnabled: true,
      });
      
      const mockWatcher = {
        on: jest.fn().mockReturnThis(),
        close: jest.fn(),
      };
      
      // Mock eval to return mocked chokidar
      const originalEval = global.eval;
      (global as any).eval = jest.fn().mockImplementation(() => 
        Promise.resolve({
          default: {
            watch: jest.fn().mockReturnValue(mockWatcher),
          },
        })
      );

      await watchingManager.watchPrompts();
      await watchingManager.stopWatching();

      expect(mockWatcher.close).toHaveBeenCalled();
      
      // Restore original eval
      (global as any).eval = originalEval;
    });

    it('should handle case when no watchers exist', async () => {
      await expect(promptManager.stopWatching()).resolves.not.toThrow();
    });
  });
});