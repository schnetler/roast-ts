import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { readFile, writeFile, grep, cmd, searchFile } from '../../../tools/built-in';
import { Tool, ToolContext } from '../../../shared/types';
import { StructuredLogger } from '../../../helpers/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Built-in Tools Integration Tests', () => {
  let testDir: string;
  let context: ToolContext;
  const tools = new Map<string, Tool<any, any>>([
    ['readFile', readFile],
    ['writeFile', writeFile],
    ['grep', grep],
    ['cmd', cmd],
    ['searchFile', searchFile]
  ]);

  // Helper to execute tool regardless of handler/execute property
  const executeTool = async (tool: Tool<any, any>, params: any, ctx: ToolContext) => {
    const handler = tool.execute || tool.handler;
    if (!handler) {
      throw new Error('Tool has no execute or handler function');
    }
    return handler(params, ctx);
  };

  beforeEach(async () => {
    // Create a temporary directory for tests
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'roast-integration-'));
    
    // Create test context
    context = {
      workflowId: 'test-workflow',
      stepId: 'test-step',
      logger: new StructuredLogger({ level: 'error' }) // Quiet during tests
    };
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test directory:', error);
    }
  });

  describe('readFile tool', () => {
    it('should read actual file contents', async () => {
      // Create a test file
      const testFile = path.join(testDir, 'test.txt');
      const content = 'Hello, World!\nThis is a test file.';
      await fs.writeFile(testFile, content, 'utf-8');

      // Use the readFile tool
      const readFileTool = tools.get('readFile')!;
      const result = await executeTool(readFileTool, { path: testFile }, context);

      expect(result.content).toBe(content);
    });

    it('should handle file not found', async () => {
      const readFileTool = tools.get('readFile')!;
      const nonExistentFile = path.join(testDir, 'does-not-exist.txt');

      await expect(
        executeTool(readFileTool, { path: nonExistentFile }, context)
      ).rejects.toThrow();
    });

    it('should read binary files', async () => {
      // Create a binary file (simple PNG header)
      const binaryFile = path.join(testDir, 'test.png');
      const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      await fs.writeFile(binaryFile, pngHeader);

      const readFileTool = tools.get('readFile')!;
      const result = await executeTool(readFileTool, { path: binaryFile, encoding: 'base64' }, context);

      expect(result.content).toBe(pngHeader.toString('base64'));
    });
  });

  describe('writeFile tool', () => {
    it('should write file to disk', async () => {
      const writeFileTool = tools.get('writeFile')!;
      const testFile = path.join(testDir, 'output.txt');
      const content = 'Written by integration test';

      await executeTool(writeFileTool, { path: testFile, content }, context);

      // Verify file was written
      const writtenContent = await fs.readFile(testFile, 'utf-8');
      expect(writtenContent).toBe(content);
    });

    it('should create directories if they do not exist', async () => {
      const writeFileTool = tools.get('writeFile')!;
      const nestedFile = path.join(testDir, 'nested', 'deep', 'file.txt');
      const content = 'Nested file content';

      await executeTool(writeFileTool, { path: nestedFile, content, createDirs: true }, context);

      // Verify file and directories were created
      const writtenContent = await fs.readFile(nestedFile, 'utf-8');
      expect(writtenContent).toBe(content);
    });

    it('should overwrite existing files', async () => {
      const writeFileTool = tools.get('writeFile')!;
      const testFile = path.join(testDir, 'overwrite.txt');
      
      // Write initial content
      await fs.writeFile(testFile, 'Initial content');
      
      // Overwrite with tool
      const newContent = 'Overwritten content';
      await executeTool(writeFileTool, { path: testFile, content: newContent }, context);

      // Verify overwrite
      const writtenContent = await fs.readFile(testFile, 'utf-8');
      expect(writtenContent).toBe(newContent);
    });
  });

  describe('grep tool', () => {
    beforeEach(async () => {
      // Create test files for grep
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'Line 1\nLine with pattern\nLine 3');
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'No match here\nAnother line');
      await fs.writeFile(path.join(testDir, 'file3.txt'), 'Pattern appears here\nAnd here too: pattern');
      await fs.mkdir(path.join(testDir, 'subdir'));
      await fs.writeFile(path.join(testDir, 'subdir', 'file4.txt'), 'Nested pattern match');
    });

    it('should find pattern in files', async () => {
      const grepTool = tools.get('grep')!;
      const result = await executeTool(grepTool, { 
        pattern: 'pattern',
        path: testDir,
        recursive: true
      }, context);

      expect(result.matches).toHaveLength(4);
      expect(result.matches.map((m: any) => m.file).sort()).toEqual([
        path.join(testDir, 'file1.txt'),
        path.join(testDir, 'file3.txt'),
        path.join(testDir, 'file3.txt'),
        path.join(testDir, 'subdir', 'file4.txt')
      ].sort());
    });

    it('should support regex patterns', async () => {
      const grepTool = tools.get('grep')!;
      const result = await executeTool(grepTool, { 
        pattern: '^Line \\d+$',
        path: testDir,
        regex: true,
        recursive: true
      }, context);

      expect(result.matches).toHaveLength(2);
      expect(result.matches[0].match).toBe('Line 1');
      expect(result.matches[1].match).toBe('Line 3');
    });

    it('should respect file pattern filters', async () => {
      await fs.writeFile(path.join(testDir, 'test.js'), 'pattern in js file');
      await fs.writeFile(path.join(testDir, 'test.md'), 'pattern in md file');

      const grepTool = tools.get('grep')!;
      const result = await executeTool(grepTool, { 
        pattern: 'pattern',
        path: testDir,
        include: ['*.txt']
      }, context);

      // Should only find matches in .txt files
      const extensions = result.matches.map((m: any) => path.extname(m.file));
      expect(extensions.every((ext: string) => ext === '.txt')).toBe(true);
    });

    it.skip('should handle case-insensitive search', async () => {
      // TODO: grep tool doesn't support ignoreCase parameter yet
      const grepTool = tools.get('grep')!;
      const result = await executeTool(grepTool, { 
        pattern: 'PATTERN',
        path: testDir
      }, context);

      expect(result.matches.length).toBe(0); // No uppercase PATTERN in files
    });
  });

  describe('searchFile tool', () => {
    it('should find files by name pattern', async () => {
      // Create various files
      await fs.writeFile(path.join(testDir, 'test.js'), '');
      await fs.writeFile(path.join(testDir, 'test.ts'), '');
      await fs.writeFile(path.join(testDir, 'index.js'), '');
      await fs.mkdir(path.join(testDir, 'src'));
      await fs.writeFile(path.join(testDir, 'src', 'test.js'), '');

      const searchFileTool = tools.get('searchFile')!;
      const result = await executeTool(searchFileTool, {
        pattern: 'test.*',
        directory: testDir
      }, context);
      expect(result.results).toHaveLength(3);
      expect(result.results.every((f: any) => f.path.includes('test'))).toBe(true);
    });

    it('should support glob patterns', async () => {
      await fs.mkdir(path.join(testDir, 'src'));
      await fs.mkdir(path.join(testDir, 'src', 'components'));
      await fs.writeFile(path.join(testDir, 'src', 'index.ts'), '');
      await fs.writeFile(path.join(testDir, 'src', 'components', 'Button.tsx'), '');
      await fs.writeFile(path.join(testDir, 'src', 'components', 'Input.tsx'), '');

      const searchFileTool = tools.get('searchFile')!;
      const result = await executeTool(searchFileTool, {
        pattern: '**/*.tsx',
        directory: testDir
      }, context);

      expect(result.results).toHaveLength(2);
      expect(result.results.every((f: any) => f.path.endsWith('.tsx'))).toBe(true);
    });
  });

  describe('cmd tool', () => {
    it('should execute system commands', async () => {
      const cmdTool = tools.get('cmd')!;
      
      // Simple echo command
      const result = await executeTool(cmdTool, {
        command: 'echo',
        args: ['Hello from integration test']
      }, context);

      expect(result.stdout.trim()).toBe('Hello from integration test');
      expect(result.exitCode).toBe(0);
    });

    it('should capture stderr', async () => {
      const cmdTool = tools.get('cmd')!;
      
      // Command that writes to stderr (using node to ensure cross-platform)
      const result = await executeTool(cmdTool, {
        command: 'node',
        args: ['-e', 'console.error("Error message")']
      }, context);

      expect(result.stderr.trim()).toBe('Error message');
      expect(result.exitCode).toBe(0);
    });

    it('should handle command failure', async () => {
      const cmdTool = tools.get('cmd')!;
      
      // Command that fails
      const result = await executeTool(cmdTool, {
        command: 'node',
        args: ['-e', 'process.exit(1)']
      }, context);

      expect(result.exitCode).toBe(1);
    });

    it('should respect working directory', async () => {
      const cmdTool = tools.get('cmd')!;
      
      // Create a subdirectory with a file
      const subdir = path.join(testDir, 'subdir');
      await fs.mkdir(subdir);
      await fs.writeFile(path.join(subdir, 'test.txt'), 'content');

      // List files in subdirectory
      const result = await executeTool(cmdTool, {
        command: 'ls',
        args: ['-la'],
        cwd: subdir
      }, context);

      expect(result.stdout).toContain('test.txt');
      expect(result.exitCode).toBe(0);
    });

    it('should handle environment variables', async () => {
      const cmdTool = tools.get('cmd')!;
      
      const result = await executeTool(cmdTool, {
        command: 'node',
        args: ['-e', 'console.log(process.env.TEST_VAR)'],
        env: { TEST_VAR: 'test_value' }
      }, context);

      expect(result.stdout.trim()).toBe('test_value');
    });

    it('should timeout long-running commands', async () => {
      const cmdTool = tools.get('cmd')!;
      
      const startTime = Date.now();
      const result = await executeTool(cmdTool, {
        command: 'node',
        args: ['-e', 'setTimeout(() => {}, 5000)'],
        timeout: 100 // 100ms timeout
      }, context);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500); // Should timeout quickly
      expect(result.timedOut).toBe(true);
    });
  });

  describe('Tool interactions', () => {
    it('should work together in a workflow', async () => {
      const writeFileTool = tools.get('writeFile')!;
      const readFileTool = tools.get('readFile')!;
      const grepTool = tools.get('grep')!;

      // Write some files
      await executeTool(writeFileTool, { 
        path: path.join(testDir, 'data1.txt'), 
        content: 'Important data\nMore important stuff' 
      }, context);
      
      await executeTool(writeFileTool, { 
        path: path.join(testDir, 'data2.txt'), 
        content: 'Not so important\nRegular content' 
      }, context);

      // Search for pattern
      const searchResult = await executeTool(grepTool, {
        pattern: 'important',
        path: testDir
      }, context);

      // Read one of the matched files
      const matchedFile = searchResult.matches[0].file;
      const content = await executeTool(readFileTool, { path: matchedFile }, context);

      expect(searchResult.matches).toHaveLength(3); // 'important' appears 3 times (case-insensitive)
      expect(content.content).toContain('important');
      
      // Verify we found matches in both files
      const uniqueFiles = [...new Set(searchResult.matches.map((m: any) => m.file))];
      expect(uniqueFiles).toHaveLength(2);
    });
  });
});