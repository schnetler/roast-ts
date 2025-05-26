import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createWorkflow } from '../../../workflow/workflow-builder';
import { FileStateRepository, StateManager } from '../../../state';
import { ToolRegistry } from '../../../tools/tool-registry';
import { ResourceFactory } from '../../../resources/resource-factory';
import { FileResourceHandler } from '../../../resources/handlers/file-resource';
import { DirectoryResourceHandler } from '../../../resources/handlers/directory-resource';
import { ToolContext } from '../../../shared/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Workflow Execution Integration Tests', () => {
  let testDir: string;
  let stateManager: StateManager;
  let toolRegistry: ToolRegistry;

  // Helper to execute tool with either handler or execute
  const executeTool = async (tool: any, params: any, ctx: ToolContext) => {
    const handler = tool.execute || tool.handler;
    if (!handler) {
      throw new Error(`Tool ${tool.name} has no execute or handler function`);
    }
    return handler(params, ctx);
  };

  beforeEach(async () => {
    // Reset module cache to ensure fresh tool instances
    jest.resetModules();
    
    // Create test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'roast-workflow-'));

    // Initialize components
    const repository = new FileStateRepository(path.join(testDir, '.roast-state'));
    stateManager = new StateManager(repository);
    toolRegistry = new ToolRegistry();

    // Dynamically import and register built-in tools to avoid conflicts
    const builtInTools = await import('../../../tools/built-in');
    toolRegistry.register(builtInTools.readFile, { force: true });
    toolRegistry.register(builtInTools.writeFile, { force: true });
    toolRegistry.register(builtInTools.grep, { force: true });
    toolRegistry.register(builtInTools.cmd, { force: true });
    toolRegistry.register(builtInTools.searchFile, { force: true });

    // Register resource handlers
    ResourceFactory.register('file', new FileResourceHandler());
    ResourceFactory.register('directory', new DirectoryResourceHandler());
  });

  afterEach(async () => {
    // Clear tool registry to avoid conflicts
    toolRegistry.clear();
    
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test directory:', error);
    }
  });

  describe('File processing workflows', () => {
    it('should process multiple files in sequence', async () => {
      // Create test files
      const files = ['file1.txt', 'file2.txt', 'file3.txt'];
      for (const file of files) {
        await fs.writeFile(
          path.join(testDir, file),
          `Content of ${file}`
        );
      }

      // Create workflow that reads and transforms files
      const workflow = createWorkflow('file-processor')
        .step('readFiles', async (ctx) => {
          const readFileTool = toolRegistry.get('readFile')!;
          const toolContext: ToolContext = {
            workflowId: 'file-processor',
            stepId: 'readFiles',
            logger: new (await import('../../../helpers/logger')).StructuredLogger()
          };
          const contents = await Promise.all(
            files.map(file => 
              executeTool(readFileTool, { path: path.join(testDir, file) }, toolContext)
            )
          );
          return { files: contents };
        })
        .step('transform', async (ctx) => {
          const transformed = ctx.readFiles.files.map(result => 
            result.content.toUpperCase()
          );
          return { transformed };
        })
        .step('writeResults', async (ctx) => {
          const writeFile = toolRegistry.get('writeFile')!;
          const outputFile = path.join(testDir, 'results.txt');
          const toolContext: ToolContext = {
            workflowId: 'file-processor',
            stepId: 'writeResults',
            logger: new (await import('../../../helpers/logger')).StructuredLogger()
          };
          await executeTool(writeFile,
            { 
              path: outputFile, 
              content: ctx.transform.transformed.join('\n---\n')
            },
            toolContext
          );
          return { outputFile };
        })
        .buildConfig();

      // Create and execute workflow
      const engine = workflow.createEngine!(stateManager, toolRegistry);
      const result = await engine.execute();

      // Verify results
      const outputContent = await fs.readFile(result.writeResults.outputFile, 'utf-8');
      expect(outputContent).toContain('CONTENT OF FILE1.TXT');
      expect(outputContent).toContain('CONTENT OF FILE2.TXT');
      expect(outputContent).toContain('CONTENT OF FILE3.TXT');
    });

    it.skip('should search and process matching files', async () => {
      // Create directory structure
      await fs.mkdir(path.join(testDir, 'src'));
      await fs.mkdir(path.join(testDir, 'src', 'components'));
      await fs.writeFile(path.join(testDir, 'src', 'index.ts'), 'export * from "./components";');
      await fs.writeFile(path.join(testDir, 'src', 'components', 'Button.tsx'), 'export const Button = () => {};');
      await fs.writeFile(path.join(testDir, 'src', 'components', 'Input.tsx'), 'export const Input = () => {};');
      await fs.writeFile(path.join(testDir, 'README.md'), '# Test Project');

      // Workflow to find and analyze TypeScript files
      const workflow = createWorkflow('ts-analyzer')
        .tool('findTsFiles', toolRegistry.get('searchFile')!, {
          pattern: '**/*.{ts,tsx}',
          directory: testDir
        })
        .step('analyzeFiles', async (ctx) => {
          const readFile = toolRegistry.get('readFile')!;
          const toolContext: ToolContext = {
            workflowId: 'ts-analyzer',
            stepId: 'analyzeFiles',
            logger: new (await import('../../../helpers/logger')).StructuredLogger()
          };
          const analyses = await Promise.all(
            ctx.findTsFiles.files.map(async (file: string) => {
              const content = await executeTool(readFile, { path: file }, toolContext);
              return {
                file,
                hasExport: content.includes('export'),
                lineCount: content.split('\n').length
              };
            })
          );
          return { analyses };
        })
        .buildConfig();

      const engine = workflow.createEngine!(stateManager, toolRegistry);
      const result = await engine.execute();

      expect(result.findTsFiles.files).toHaveLength(3);
      expect(result.analyzeFiles.analyses.every((a: any) => a.hasExport)).toBe(true);
    });
  });

  describe('Command execution workflows', () => {
    it.skip('should execute system commands and process output', async () => {
      // Create a test script
      const scriptPath = path.join(testDir, 'test-script.js');
      await fs.writeFile(scriptPath, `
        console.log('Starting process...');
        console.log('Processing data...');
        console.log('Complete!');
        console.log(JSON.stringify({ result: 'success', items: 3 }));
      `);

      const workflow = createWorkflow('command-processor')
        .tool('runScript', toolRegistry.get('cmd')!, {
          command: 'node',
          args: [scriptPath]
        })
        .step('parseOutput', async (ctx) => {
          const lines = ctx.runScript.stdout.trim().split('\n');
          const lastLine = lines[lines.length - 1];
          try {
            const data = JSON.parse(lastLine);
            return { 
              success: true, 
              data,
              logs: lines.slice(0, -1)
            };
          } catch {
            return { 
              success: false, 
              error: 'Failed to parse output',
              logs: lines
            };
          }
        })
        .buildConfig();

      const engine = workflow.createEngine!(stateManager, toolRegistry);
      const result = await engine.execute();

      expect(result.runScript.exitCode).toBe(0);
      expect(result.parseOutput.success).toBe(true);
      expect(result.parseOutput.data).toEqual({ result: 'success', items: 3 });
      expect(result.parseOutput.logs).toContain('Starting process...');
    });
  });

  describe('Pattern search workflows', () => {
    it.skip('should find and replace patterns across files', async () => {
      // Create source files with patterns
      await fs.mkdir(path.join(testDir, 'src'));
      await fs.writeFile(
        path.join(testDir, 'src', 'config.js'),
        'const API_URL = "http://localhost:3000";\nconst TIMEOUT = 5000;'
      );
      await fs.writeFile(
        path.join(testDir, 'src', 'api.js'),
        'fetch("http://localhost:3000/api/users")\n  .then(res => res.json());'
      );

      const workflow = createWorkflow('url-replacer')
        .tool('findUrls', toolRegistry.get('grep')!, {
          pattern: 'http://localhost:3000',
          directory: path.join(testDir, 'src')
        })
        .step('replaceUrls', async (ctx) => {
          const readFile = toolRegistry.get('readFile')!;
          const writeFile = toolRegistry.get('writeFile')!;
          const toolContext: ToolContext = {
            workflowId: 'url-updater',
            stepId: 'replaceUrls',
            logger: new (await import('../../../helpers/logger')).StructuredLogger()
          };
          
          const updatedFiles = [];
          const processedFiles = new Set<string>();
          
          for (const match of ctx.findUrls.matches) {
            if (!processedFiles.has(match.file)) {
              processedFiles.add(match.file);
              
              const content = await executeTool(readFile, { path: match.file }, toolContext);
              const updated = content.replace(
                /http:\/\/localhost:3000/g,
                'https://api.production.com'
              );
              
              await executeTool(writeFile, { 
                path: match.file, 
                content: updated 
              }, toolContext);
              
              updatedFiles.push(match.file);
            }
          }
          
          return { updatedFiles };
        })
        .step('verify', async (ctx) => {
          const grep = toolRegistry.get('grep')!;
          const toolContext: ToolContext = {
            workflowId: 'url-updater',
            stepId: 'verify',
            logger: new (await import('../../../helpers/logger')).StructuredLogger()
          };
          const oldPattern = await executeTool(grep, {
            pattern: 'http://localhost:3000',
            directory: path.join(testDir, 'src')
          }, toolContext);
          const newPattern = await executeTool(grep, {
            pattern: 'https://api.production.com',
            directory: path.join(testDir, 'src')
          }, toolContext);
          
          return {
            oldMatches: oldPattern.matches.length,
            newMatches: newPattern.matches.length
          };
        })
        .buildConfig();

      const engine = workflow.createEngine!(stateManager, toolRegistry);
      const result = await engine.execute();

      expect(result.findUrls.matches.length).toBeGreaterThan(0);
      expect(result.replaceUrls.updatedFiles).toHaveLength(2);
      expect(result.verify.oldMatches).toBe(0);
      expect(result.verify.newMatches).toBeGreaterThan(0);
    });
  });

  describe('State persistence', () => {
    it('should persist workflow state to disk', async () => {
      await stateManager.createSession('test-workflow');

      const workflow = createWorkflow('stateful-workflow')
        .step('step1', async () => ({ timestamp: Date.now(), data: 'step1' }))
        .step('step2', async (ctx) => ({ 
          previousTimestamp: ctx.step1.timestamp,
          data: 'step2' 
        }))
        .buildConfig();

      const engine = workflow.createEngine!(stateManager, toolRegistry);
      const result = await engine.execute();

      // Verify state was persisted
      const stateDir = path.join(testDir, '.roast-state');
      const yearDirs = await fs.readdir(stateDir);
      expect(yearDirs.length).toBeGreaterThan(0);

      // Load state from disk
      const newStateManager = new StateManager(
        new FileStateRepository(stateDir)
      );
      
      // List all sessions to find the one we just created
      const sessions = await newStateManager.listSessions({ workflowName: 'test-workflow' });
      expect(sessions.length).toBeGreaterThan(0);
      
      // Get the session ID from the first session
      const sessionId = sessions[0].sessionId;
      
      const state = await newStateManager.getSession(sessionId);
      expect(state).toBeDefined();
      expect(state!.steps.length).toBeGreaterThan(0);
    });
  });

  describe('Error recovery', () => {
    it('should handle and recover from tool failures', async () => {
      const workflow = createWorkflow('error-recovery')
        .step('tryRead', async (ctx) => {
          const readFile = toolRegistry.get('readFile')!;
          const toolContext: ToolContext = {
            workflowId: 'error-recovery',
            stepId: 'tryRead',
            logger: new (await import('../../../helpers/logger')).StructuredLogger()
          };
          try {
            await executeTool(readFile, { 
              path: '/definitely/does/not/exist.txt' 
            }, toolContext);
            return { success: true, data: null };
          } catch (error) {
            return { 
              success: false, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            };
          }
        })
        .step('fallback', async (ctx) => {
          if (!ctx.tryRead.success) {
            const writeFile = toolRegistry.get('writeFile')!;
            const toolContext: ToolContext = {
              workflowId: 'error-recovery',
              stepId: 'fallback',
              logger: new (await import('../../../helpers/logger')).StructuredLogger()
            };
            const fallbackFile = path.join(testDir, 'fallback.txt');
            await executeTool(writeFile, {
              path: fallbackFile,
              content: `Error occurred: ${ctx.tryRead.error}\nUsing fallback data.`
            }, toolContext);
            return { fallbackFile };
          }
          return { fallbackFile: null };
        })
        .buildConfig();

      const engine = workflow.createEngine!(stateManager, toolRegistry);
      const result = await engine.execute();

      expect(result.tryRead.success).toBe(false);
      expect(result.fallback.fallbackFile).toBeTruthy();
      
      const fallbackContent = await fs.readFile(result.fallback.fallbackFile!, 'utf-8');
      expect(fallbackContent).toContain('Error occurred');
      expect(fallbackContent).toContain('Using fallback data');
    });
  });
});