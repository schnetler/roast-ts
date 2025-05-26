import * as fs from 'fs/promises';
import * as path from 'path';
import { updateFiles } from '../update-files';
import { ToolContext } from '../../../shared/types';
import { StructuredLogger } from '../../../helpers/logger';

// Mock fs/promises
jest.mock('fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('updateFiles', () => {
  const mockContext: ToolContext = {
    workflowId: 'test-workflow',
    stepId: 'test-step',
    logger: new StructuredLogger({ level: 'error' })
  };

  // Helper to execute tool
  const executeTool = async (params: any) => {
    const handler = updateFiles.execute || updateFiles.handler;
    if (!handler) {
      throw new Error('Tool has no execute or handler function');
    }
    return handler(params, mockContext);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('basic functionality', () => {
    it('should perform simple text replacement', async () => {
      const testPath = '/test/file.txt';
      const originalContent = 'Hello World! World is great.';
      const expectedContent = 'Hello Universe! Universe is great.';

      mockFs.readFile.mockResolvedValueOnce(originalContent);
      mockFs.writeFile.mockResolvedValueOnce();

      const result = await executeTool({
        updates: [{
          path: testPath,
          search: 'World',
          replace: 'Universe',
          all: true
        }],
        dryRun: false
      });

      expect(result.successCount).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].matches).toBe(2);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.resolve(testPath),
        expectedContent,
        'utf-8'
      );
    });

    it('should replace only first occurrence when all is false', async () => {
      const testPath = '/test/file.txt';
      const originalContent = 'Hello World! World is great.';
      const expectedContent = 'Hello Universe! World is great.';

      mockFs.readFile.mockResolvedValueOnce(originalContent);
      mockFs.writeFile.mockResolvedValueOnce();

      const result = await executeTool({
        updates: [{
          path: testPath,
          search: 'World',
          replace: 'Universe',
          all: false
        }],
        dryRun: false
      });

      expect(result.successCount).toBeGreaterThan(0);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.resolve(testPath),
        expectedContent,
        'utf-8'
      );
    });
  });

  describe('regex support', () => {
    it('should perform regex replacement', async () => {
      const testPath = '/test/file.txt';
      const originalContent = 'foo123bar456baz';
      const expectedContent = 'foo[NUM]bar[NUM]baz';

      mockFs.readFile.mockResolvedValueOnce(originalContent);
      mockFs.writeFile.mockResolvedValueOnce();

      const result = await executeTool({
        updates: [{
          path: testPath,
          search: '\\d+',
          replace: '[NUM]',
          regex: true,
          all: true
        }],
        dryRun: false
      });

      expect(result.successCount).toBeGreaterThan(0);
      expect(result.results[0].matches).toBe(2);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.resolve(testPath),
        expectedContent,
        'utf-8'
      );
    });

    it('should handle regex with capture groups', async () => {
      const testPath = '/test/file.txt';
      const originalContent = 'Name: John, Age: 30';
      const expectedContent = 'Name: John, Age: [REDACTED]';

      mockFs.readFile.mockResolvedValueOnce(originalContent);
      mockFs.writeFile.mockResolvedValueOnce();

      const result = await executeTool({
        updates: [{
          path: testPath,
          search: 'Age: \\d+',
          replace: 'Age: [REDACTED]',
          regex: true,
          all: false
        }],
        dryRun: false
      });

      expect(result.successCount).toBeGreaterThan(0);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.resolve(testPath),
        expectedContent,
        'utf-8'
      );
    });
  });

  describe('dry run mode', () => {
    it('should preview changes without writing', async () => {
      const testPath = '/test/file.txt';
      const originalContent = 'Hello World!';

      mockFs.readFile.mockResolvedValueOnce(originalContent);

      const result = await executeTool({
        updates: [{
          path: testPath,
          search: 'World',
          replace: 'Universe'
        }],
        dryRun: true
      });

      expect(result.successCount).toBeGreaterThan(0);
      expect(result.dryRun).toBe(true);
      expect(result.results[0].preview).toBe('Hello Universe!');
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('should truncate long previews', async () => {
      const testPath = '/test/file.txt';
      const originalContent = 'A'.repeat(600);

      mockFs.readFile.mockResolvedValueOnce(originalContent);

      const result = await executeTool({
        updates: [{
          path: testPath,
          search: 'A',
          replace: 'B',
          all: true
        }],
        dryRun: true
      });

      expect(result.results[0].preview).toHaveLength(500);
    });
  });

  describe('backup functionality', () => {
    it('should create backup when requested', async () => {
      const testPath = '/test/file.txt';
      const originalContent = 'Hello World!';
      const backupPath = path.resolve(testPath) + '.bak';

      mockFs.readFile.mockResolvedValueOnce(originalContent);
      mockFs.writeFile.mockResolvedValue();

      const result = await executeTool({
        updates: [{
          path: testPath,
          search: 'World',
          replace: 'Universe',
          backup: true
        }],
        dryRun: false
      });

      expect(result.successCount).toBeGreaterThan(0);
      expect(result.results[0].backup).toBe(`${testPath}.bak`);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        backupPath,
        originalContent,
        'utf-8'
      );
      expect(mockFs.writeFile).toHaveBeenCalledTimes(2); // backup + actual file
    });
  });

  describe('batch operations', () => {
    it('should process multiple files', async () => {
      const files = [
        { path: '/test/file1.txt', content: 'Hello World!' },
        { path: '/test/file2.txt', content: 'World is great!' },
        { path: '/test/file3.txt', content: 'Goodbye World!' }
      ];

      files.forEach(file => {
        mockFs.readFile.mockResolvedValueOnce(file.content);
        mockFs.writeFile.mockResolvedValueOnce();
      });

      const result = await executeTool({
        updates: files.map(file => ({
          path: file.path,
          search: 'World',
          replace: 'Universe'
        })),
        dryRun: false
      });

      expect(result.successCount).toBeGreaterThan(0);
      expect(result.totalFiles).toBe(3);
      expect(result.successCount).toBe(3);
      expect(mockFs.writeFile).toHaveBeenCalledTimes(3);
    });

    it('should continue processing on individual failures', async () => {
      mockFs.readFile
        .mockResolvedValueOnce('Content 1')
        .mockRejectedValueOnce(new Error('File not found'))
        .mockResolvedValueOnce('Content 3');
      
      mockFs.writeFile.mockResolvedValue();

      const result = await executeTool({
        updates: [
          { path: '/test/file1.txt', search: 'Content', replace: 'Text' },
          { path: '/test/file2.txt', search: 'Content', replace: 'Text' },
          { path: '/test/file3.txt', search: 'Content', replace: 'Text' }
        ],
        dryRun: false
      });

      expect(result.successCount).toBeGreaterThan(0);
      expect(result.successCount).toBe(2);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe('File not found');
    });
  });

  describe('error handling', () => {
    it('should handle file read errors', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('Permission denied'));

      const result = await executeTool({
        updates: [{
          path: '/test/file.txt',
          search: 'test',
          replace: 'TEST'
        }],
        dryRun: false
      });

      expect(result.successCount).toBe(0);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('Permission denied');
    });

    it('should handle file write errors', async () => {
      mockFs.readFile.mockResolvedValueOnce('test content');
      mockFs.writeFile.mockRejectedValueOnce(new Error('Disk full'));

      const result = await executeTool({
        updates: [{
          path: '/test/file.txt',
          search: 'test',
          replace: 'TEST'
        }],
        dryRun: false
      });

      expect(result.successCount).toBe(0);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('Disk full');
    });

    it('should report when no matches found', async () => {
      mockFs.readFile.mockResolvedValueOnce('Hello World!');

      const result = await executeTool({
        updates: [{
          path: '/test/file.txt',
          search: 'Universe',
          replace: 'Galaxy'
        }],
        dryRun: false
      });

      expect(result.successCount).toBe(0);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('No matches found');
      expect(result.results[0].matches).toBe(0);
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('line change calculation', () => {
    it('should calculate lines changed', async () => {
      const originalContent = 'Line1\nLine2\nLine3\nLine4';
      const expectedContent = 'Line1\nModified2\nLine3\nModified4';

      mockFs.readFile.mockResolvedValueOnce(originalContent);
      mockFs.writeFile.mockResolvedValueOnce();

      const result = await executeTool({
        updates: [{
          path: '/test/file.txt',
          search: 'Line',
          replace: 'Modified',
          regex: true,
          all: false // Only first occurrence per line
        }],
        dryRun: false
      });

      expect(result.successCount).toBeGreaterThan(0);
      expect(result.results[0].linesChanged).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty files', async () => {
      mockFs.readFile.mockResolvedValueOnce('');

      const result = await executeTool({
        updates: [{
          path: '/test/empty.txt',
          search: 'test',
          replace: 'TEST'
        }],
        dryRun: false
      });

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].matches).toBe(0);
    });

    it('should handle special characters in search string', async () => {
      const content = 'Price: $10.00 (special offer)';
      mockFs.readFile.mockResolvedValueOnce(content);
      mockFs.writeFile.mockResolvedValueOnce();

      const result = await executeTool({
        updates: [{
          path: '/test/file.txt',
          search: '$10.00',
          replace: '$20.00',
          regex: false // Important: not regex to avoid $ interpretation
        }],
        dryRun: false
      });

      expect(result.successCount).toBeGreaterThan(0);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        'Price: $20.00 (special offer)',
        'utf-8'
      );
    });

    it('should handle relative paths', async () => {
      const relativePath = './test/file.txt';
      const absolutePath = path.resolve(relativePath);

      mockFs.readFile.mockResolvedValueOnce('test');
      mockFs.writeFile.mockResolvedValueOnce();

      await executeTool({
        updates: [{
          path: relativePath,
          search: 'test',
          replace: 'TEST'
        }],
        dryRun: false
      });

      expect(mockFs.readFile).toHaveBeenCalledWith(absolutePath, 'utf-8');
      expect(mockFs.writeFile).toHaveBeenCalledWith(absolutePath, 'TEST', 'utf-8');
    });

    it('should handle empty search/replace strings', async () => {
      mockFs.readFile.mockResolvedValueOnce('Hello  World');
      mockFs.writeFile.mockResolvedValueOnce();

      const result = await executeTool({
        updates: [{
          path: '/test/file.txt',
          search: '  ',
          replace: ' ',
          all: true
        }],
        dryRun: false
      });

      expect(result.successCount).toBeGreaterThan(0);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        'Hello World',
        'utf-8'
      );
    });
  });
});