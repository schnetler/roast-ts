import { createWorkflow } from '../workflow-builder';
import { FileStateRepository, StateManager } from '../../state';
import { ToolRegistry } from '../../tools/tool-registry';
import { ResourceFactory } from '../../resources/resource-factory';
import { FileResourceHandler } from '../../resources/handlers/file-resource';
import { UrlResourceHandler } from '../../resources/handlers/url-resource';
import { Tool } from '../../shared/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';

// Mock modules
jest.mock('fs/promises');
jest.mock('node-fetch');

describe('Workflow Integration', () => {
  let toolRegistry: ToolRegistry;
  let stateManager: StateManager;
  const mockFs = fs as jest.Mocked<typeof fs>;
  
  // Helper to create workflow engine
  const createEngine = (workflow: any, llmClient?: any) => {
    if (!workflow.createEngine) {
      throw new Error('createEngine method not found on workflow');
    }
    return workflow.createEngine(stateManager, toolRegistry, llmClient);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Initialize components
    toolRegistry = new ToolRegistry();
    const repository = new FileStateRepository();
    stateManager = new StateManager(repository);

    // Register resource handlers
    ResourceFactory.register('file', new FileResourceHandler());
    ResourceFactory.register('url', new UrlResourceHandler());
    
    // Mock file system
    mockFs.stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
      size: 1000,
      mtime: new Date(),
      birthtime: new Date(),
      isSymbolicLink: () => false
    } as any);
    
    mockFs.readFile.mockResolvedValue('file content');
    mockFs.access.mockResolvedValue(undefined);
  });

  describe('Tools and Resources Integration', () => {
    it('should execute workflow with file reading tool', async () => {
      // Create a file reading tool
      const readFileTool: Tool<{ path: string }, string> = {
        name: 'read_file',
        description: 'Read file contents',
        schema: z.object({
          path: z.string()
        }),
        handler: async (params) => {
          const resource = await ResourceFactory.create(params.path);
          if (resource.type !== 'file') {
            throw new Error('Expected file resource');
          }
          return (resource as any).read();
        }
      };

      // Create workflow
      const workflow = createWorkflow('test-workflow')
        .tool('fileContent', readFileTool, { path: 'test.txt' })
        .prompt<'analysis'>(ctx => `Analyze this content: ${ctx.fileContent}`, 'analysis')
        .buildConfig();

      // Mock LLM client
      const mockLLMClient = {
        async complete() {
          return {
            content: 'This is a test file with sample content.'
          };
        }
      };

      // Create and execute workflow
      if (!workflow.createEngine) {
        throw new Error('createEngine method not found on workflow');
      }
      const engine = workflow.createEngine(stateManager, toolRegistry, mockLLMClient);
      const result = await engine.execute();

      expect(result).toHaveProperty('fileContent');
      expect(result).toHaveProperty('analysis');
    });

    it('should execute workflow with URL fetching tool', async () => {
      // Create URL fetching tool
      const fetchUrlTool: Tool<{ url: string }, any> = {
        name: 'fetch_url',
        description: 'Fetch data from URL',
        schema: z.object({
          url: z.string().url()
        }),
        handler: async (params) => {
          const resource = await ResourceFactory.create(params.url);
          if (resource.type !== 'url') {
            throw new Error('Expected URL resource');
          }
          return { data: 'mocked response' };
        }
      };

      // Create workflow with parallel API calls
      const workflow = createWorkflow('api-workflow')
        .parallel({
          api1: async (ctx) => {
            return fetchUrlTool.handler!({ url: 'https://api1.example.com' });
          },
          api2: async (ctx) => {
            return fetchUrlTool.handler!({ url: 'https://api2.example.com' });
          }
        })
        .step('combine', async (ctx) => ({
          combined: [ctx.api1, ctx.api2]
        }))
        .buildConfig();

      const engine = createEngine(workflow);
      const result = await engine.execute();

      expect(result.api1).toBeDefined();
      expect(result.api2).toBeDefined();
      expect(result.combine).toHaveProperty('combined');
    });

    it('should handle resource validation in tools', async () => {
      // Create a tool that validates resources
      const validateResourceTool: Tool<{ source: string, mustExist: boolean }, boolean> = {
        name: 'validate_resource',
        description: 'Validate resource existence',
        schema: z.object({
          source: z.string(),
          mustExist: z.boolean()
        }),
        handler: async (params) => {
          const resource = await ResourceFactory.create({
            source: params.source,
            mustExist: params.mustExist
          });
          const validation = await resource.validate();
          return validation.valid;
        }
      };

      const workflow = createWorkflow('validation-workflow')
        .tool('isValid', validateResourceTool, { source: '/path/to/file.txt', mustExist: true })
        .step('handleResult', async (ctx) => ({
          message: ctx.isValid ? 'Resource is valid' : 'Resource is invalid'
        }))
        .buildConfig();

      const engine = createEngine(workflow);
      const result = await engine.execute();

      expect(result.isValid).toBe(true);
      expect(result.handleResult.message).toBe('Resource is valid');
    });

    it('should integrate with state management', async () => {
      // Initialize session
      await stateManager.createSession('test-workflow');

      // Create a simple workflow
      const workflow = createWorkflow('stateful-workflow')
        .step('step1', async () => ({ data: 'step1 result' }))
        .step('step2', async (ctx) => ({ 
          data: 'step2 result',
          previous: ctx.step1.data 
        }))
        .buildConfig();

      // Subscribe to state updates
      const stateUpdates: any[] = [];
      const unsubscribe = stateManager.subscribe('step:updated', (data) => {
        stateUpdates.push(data);
      });

      const engine = createEngine(workflow);
      await engine.execute();

      // Verify state was tracked
      expect(stateUpdates).toHaveLength(2);
      expect(stateUpdates[0]).toMatchObject({
        stepId: expect.stringContaining('step1'),
        updates: expect.objectContaining({
          output: { data: 'step1 result' }
        })
      });

      unsubscribe();
    });

    it('should handle tool errors gracefully', async () => {
      // Create a failing tool
      const failingTool: Tool<{}, never> = {
        name: 'failing_tool',
        description: 'Tool that always fails',
        schema: z.object({}),
        handler: async () => {
          throw new Error('Tool execution failed');
        }
      };

      const workflow = createWorkflow('error-workflow')
        .tool('willFail', failingTool, {})
        .buildConfig();

      const engine = createEngine(workflow);
      
      await expect(engine.execute()).rejects.toThrow('Step "willFail" failed');
    });

    it('should support custom step handlers with resources', async () => {
      const workflow = createWorkflow('custom-workflow')
        .step('processFiles', async () => {
          // Find all TypeScript files
          const files = ['file1.ts', 'file2.ts']; // Mocked for test
          
          const results = await Promise.all(
            files.map(async (file) => {
              const resource = await ResourceFactory.create(file);
              return {
                path: file,
                exists: await resource.exists()
              };
            })
          );
          
          return { files: results };
        })
        .buildConfig();

      const engine = createEngine(workflow);
      const result = await engine.execute();

      expect(result.processFiles.files).toHaveLength(2);
      expect(result.processFiles.files[0]).toHaveProperty('exists', true);
    });
  });

  describe('Advanced Integration Scenarios', () => {
    it('should support agent steps with tool execution', async () => {
      // Create tools for the agent
      const calculatorTool: Tool<{ a: number, b: number, op: string }, number> = {
        name: 'calculator',
        description: 'Perform calculations',
        schema: z.object({
          a: z.number(),
          b: z.number(),
          op: z.enum(['add', 'subtract', 'multiply', 'divide'])
        }),
        handler: async ({ a, b, op }) => {
          switch (op) {
            case 'add': return a + b;
            case 'subtract': return a - b;
            case 'multiply': return a * b;
            case 'divide': return a / b;
            default: throw new Error('Unknown operation');
          }
        }
      };

      // Mock LLM with tool calls
      const mockLLMClient = {
        async complete(request: any) {
          if (request.messages.length === 1) {
            // First call - return tool use
            return {
              content: '',
              toolCalls: [{
                id: 'call_1',
                type: 'function' as const,
                function: {
                  name: 'calculator',
                  arguments: JSON.stringify({ a: 10, b: 5, op: 'multiply' })
                }
              }]
            };
          } else {
            // Second call - return final answer
            return {
              content: 'The result of 10 × 5 is 50.'
            };
          }
        }
      };

      const workflow = createWorkflow('agent-workflow')
        .tool('calculator', calculatorTool)
        .agent('calculate', {
          prompt: 'Calculate 10 times 5',
          tools: ['calculator'],
          maxSteps: 3,
          fallback: 'return_partial'
        })
        .buildConfig();

      const engine = createEngine(workflow, mockLLMClient);
      const result = await engine.execute();

      expect(result.calculate).toBe('The result of 10 × 5 is 50.');
    });

    it('should support workflow composition', async () => {
      // Create sub-workflow
      const subWorkflow = createWorkflow('sub-workflow')
        .step('transform', async (ctx: any) => ({
          transformed: ctx.input.toUpperCase()
        }))
        .buildConfig();

      // Create main workflow that uses sub-workflow
      const mainWorkflow = createWorkflow('main-workflow')
        .step('prepare', async () => ({ input: 'hello world' }))
        .step('runSub', async (ctx) => {
          // Execute sub-workflow with context
          const subEngine = createEngine(subWorkflow);
          return subEngine.execute(ctx.prepare);
        })
        .step('finalize', async (ctx) => ({
          result: `Final: ${ctx.runSub.transform.transformed}`
        }))
        .buildConfig();

      const engine = createEngine(mainWorkflow);
      const result = await engine.execute();

      expect(result.finalize.result).toBe('Final: HELLO WORLD');
    });
  });
});