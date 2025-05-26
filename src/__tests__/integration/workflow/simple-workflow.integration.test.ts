import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { readFile, writeFile, grep, searchFile } from '../../../tools/built-in';
import { StructuredLogger } from '../../../helpers/logger';
import { Tool, ToolContext } from '../../../shared/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Simple Workflow Integration Tests', () => {
  let testDir: string;
  let context: ToolContext;

  // Helper to execute tool regardless of handler/execute property
  const executeTool = async (tool: Tool<any, any>, params: any, ctx: ToolContext) => {
    const handler = tool.execute || tool.handler;
    if (!handler) {
      throw new Error('Tool has no execute or handler function');
    }
    return handler(params, ctx);
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'roast-simple-workflow-'));
    context = {
      workflowId: 'test-workflow',
      stepId: 'test-step',
      logger: new StructuredLogger({ level: 'error' })
    };
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test directory:', error);
    }
  });

  it('should read, transform, and write files', async () => {
    // Step 1: Write initial files
    const files = ['input1.txt', 'input2.txt', 'input3.txt'];
    for (const file of files) {
      await executeTool(writeFile, {
        path: path.join(testDir, file),
        content: `Original content of ${file}`
      }, context);
    }

    // Step 2: Read files
    const contents = await Promise.all(
      files.map(file => 
        executeTool(readFile, { path: path.join(testDir, file) }, context)
      )
    );

    // Step 3: Transform content
    const transformed = contents.map(result => result.content.toUpperCase());

    // Step 4: Write transformed content
    await executeTool(writeFile, {
      path: path.join(testDir, 'output.txt'),
      content: transformed.join('\n---\n')
    }, context);

    // Verify
    const output = await fs.readFile(path.join(testDir, 'output.txt'), 'utf-8');
    expect(output).toContain('ORIGINAL CONTENT OF INPUT1.TXT');
    expect(output).toContain('ORIGINAL CONTENT OF INPUT2.TXT');
    expect(output).toContain('ORIGINAL CONTENT OF INPUT3.TXT');
    expect(output).toContain('---');
  });

  it('should search and replace patterns', async () => {
    // Create files with patterns
    await executeTool(writeFile, {
      path: path.join(testDir, 'config.js'),
      content: 'const API_URL = "http://localhost:3000";\nconst PORT = 3000;'
    }, context);

    await executeTool(writeFile, {
      path: path.join(testDir, 'api.js'),
      content: 'fetch("http://localhost:3000/api")\n  .then(res => res.json());'
    }, context);

    // Search for pattern
    const searchResult = await executeTool(grep, {
      pattern: 'http://localhost:3000',
      path: testDir
    }, context);

    expect(searchResult.matches).toHaveLength(2);

    // Replace in files
    for (const match of searchResult.matches) {
      const result = await executeTool(readFile, { path: match.file }, context);
      const updated = result.content.replace(/http:\/\/localhost:3000/g, 'https://api.example.com');
      await executeTool(writeFile, { path: match.file, content: updated }, context);
    }

    // Verify replacement
    const newSearchResult = await executeTool(grep, {
      pattern: 'https://api.example.com',
      path: testDir
    }, context);

    expect(newSearchResult.matches).toHaveLength(2);
  });

  it('should find files by pattern', async () => {
    // Create directory structure
    await fs.mkdir(path.join(testDir, 'src'));
    await fs.mkdir(path.join(testDir, 'src', 'components'));
    await fs.mkdir(path.join(testDir, 'test'));

    const files = [
      'src/index.ts',
      'src/app.ts',
      'src/components/Button.tsx',
      'src/components/Input.tsx',
      'test/app.test.ts',
      'README.md'
    ];

    for (const file of files) {
      await executeTool(writeFile, {
        path: path.join(testDir, file),
        content: `// ${file}`,
        createDirs: true
      }, context);
    }

    // Find TypeScript files
    const tsFiles = await executeTool(searchFile, {
      pattern: '**/*.ts',
      directory: testDir
    }, context);

    expect(tsFiles.results).toHaveLength(3);
    expect(tsFiles.results.every((f: any) => f.path.endsWith('.ts'))).toBe(true);

    // Find React components
    const components = await executeTool(searchFile, {
      pattern: '**/components/*.tsx',
      directory: testDir
    }, context);

    expect(components.results).toHaveLength(2);
    expect(components.results.every((f: any) => f.path.includes('components'))).toBe(true);
  });

  it('should handle errors gracefully', async () => {
    // Try to read non-existent file
    let capturedError: any;
    try {
      await executeTool(readFile, {
        path: path.join(testDir, 'does-not-exist.txt')
      }, context);
      fail('Should have thrown an error');
    } catch (error) {
      capturedError = error;
      expect(error).toBeDefined();
    }

    // Write error log
    await executeTool(writeFile, {
      path: path.join(testDir, 'error.log'),
      content: `Error occurred: ${capturedError instanceof Error ? capturedError.message : 'Unknown error'}`
    }, context);

    // Verify error was logged
    const errorLogResult = await executeTool(readFile, {
      path: path.join(testDir, 'error.log')
    }, context);

    expect(errorLogResult.content).toContain('Error occurred:');
  });

  it('should process files in batches', async () => {
    // Create many files
    const fileCount = 20;
    const batchSize = 5;
    
    for (let i = 0; i < fileCount; i++) {
      await executeTool(writeFile, {
        path: path.join(testDir, `file${i}.txt`),
        content: `Content of file ${i}`
      }, context);
    }

    // Search for all files
    const allFiles = await executeTool(searchFile, {
      pattern: '*.txt',
      directory: testDir
    }, context);

    expect(allFiles.results).toHaveLength(fileCount);

    // Process in batches
    const results: string[] = [];
    for (let i = 0; i < fileCount; i += batchSize) {
      const batch = allFiles.results.slice(i, i + batchSize);
      const batchContents = await Promise.all(
        batch.map((file: any) => executeTool(readFile, { path: file.path }, context))
      );
      results.push(...batchContents.map(r => r.content));
    }

    expect(results).toHaveLength(fileCount);
    
    // Results are sorted by path, so file10-19 come before file2-9
    // Let's verify by content instead
    const fileContents = results.map(r => {
      const match = r.match(/Content of file (\d+)/);
      return match ? parseInt(match[1]) : -1;
    });
    
    expect(fileContents).toContain(0);
    expect(fileContents).toContain(19);
    expect(new Set(fileContents).size).toBe(fileCount); // All unique files
  });
});