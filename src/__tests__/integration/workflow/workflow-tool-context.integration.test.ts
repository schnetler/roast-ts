import { workflow } from '../../../dsl/workflow-factory';
import { readFile, writeFile } from '../../../tools/built-in';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Workflow Tool Context Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'roast-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should inject tools as callable functions in step context', async () => {
    // Create a test file
    const testFile = path.join(tempDir, 'test.txt');
    await fs.writeFile(testFile, 'Hello World');

    const testWorkflow = workflow('tool-context-test')
      .tool('readFile', readFile)
      .tool('writeFile', writeFile)
      .step('readContent', async (context) => {
        // Tools should be available as functions in context
        expect(typeof context.readFile).toBe('function');
        expect(typeof context.writeFile).toBe('function');

        // Call the readFile tool
        const result = await context.readFile({ path: testFile });
        return result.content;
      })
      .step('processContent', async (context) => {
        // Previous step result should be available
        expect(context.readContent).toBe('Hello World');
        
        // Transform the content
        const newContent = context.readContent.toUpperCase();
        
        // Write to a new file using the tool
        const outputFile = path.join(tempDir, 'output.txt');
        await context.writeFile({ 
          path: outputFile, 
          content: newContent 
        });
        
        return { outputFile, newContent };
      });

    // Execute the workflow
    const result = await testWorkflow.run();

    // Verify results
    expect(result.readContent).toBe('Hello World');
    expect(result.processContent.newContent).toBe('HELLO WORLD');
    
    // Verify the output file was created
    const outputContent = await fs.readFile(result.processContent.outputFile, 'utf-8');
    expect(outputContent).toBe('HELLO WORLD');
  });

  it('should handle parallel steps with tool context', async () => {
    const file1 = path.join(tempDir, 'file1.txt');
    const file2 = path.join(tempDir, 'file2.txt');
    await fs.writeFile(file1, 'Content 1');
    await fs.writeFile(file2, 'Content 2');

    const parallelWorkflow = workflow('parallel-tools-test')
      .tool('readFile', readFile)
      .parallel({
        read1: async (context) => {
          const result = await context.readFile({ path: file1 });
          return result.content;
        },
        read2: async (context) => {
          const result = await context.readFile({ path: file2 });
          return result.content;
        }
      })
      .step('combine', async (context) => {
        // Both parallel results should be available
        expect(context.read1).toBe('Content 1');
        expect(context.read2).toBe('Content 2');
        return `${context.read1} + ${context.read2}`;
      });

    const result = await parallelWorkflow.run();
    expect(result.combine).toBe('Content 1 + Content 2');
  });

  it('should maintain tool context across multiple steps', async () => {
    let stepExecutions: string[] = [];

    const multiStepWorkflow = workflow('multi-step-tools')
      .tool('customTool', {
        name: 'customTool',
        description: 'A custom tool for testing',
        parameters: {},
        handler: async (params: { message: string }) => {
          stepExecutions.push(params.message);
          return `Processed: ${params.message}`;
        }
      })
      .step('step1', async (context) => {
        const result = await context.customTool({ message: 'Step 1' });
        return result;
      })
      .step('step2', async (context) => {
        expect(context.step1).toBe('Processed: Step 1');
        const result = await context.customTool({ message: 'Step 2' });
        return result;
      })
      .step('step3', async (context) => {
        expect(context.step2).toBe('Processed: Step 2');
        const result = await context.customTool({ message: 'Step 3' });
        return result;
      });

    const result = await multiStepWorkflow.run();

    // Verify all steps executed in order
    expect(stepExecutions).toEqual(['Step 1', 'Step 2', 'Step 3']);
    expect(result.step1).toBe('Processed: Step 1');
    expect(result.step2).toBe('Processed: Step 2');
    expect(result.step3).toBe('Processed: Step 3');
  });

  it('should handle errors in tool execution', async () => {
    const errorWorkflow = workflow('error-handling-test')
      .tool('errorTool', {
        name: 'errorTool',
        description: 'A tool that throws errors',
        parameters: {},
        handler: async () => {
          throw new Error('Tool execution failed');
        }
      })
      .step('tryTool', async (context) => {
        try {
          await context.errorTool({});
          return 'Should not reach here';
        } catch (error) {
          return `Caught error: ${error.message}`;
        }
      });

    const result = await errorWorkflow.run();
    expect(result.tryTool).toBe('Caught error: Tool execution failed');
  });

  it('should pass correct metadata to tools', async () => {
    let capturedMetadata: any;

    const metadataWorkflow = workflow('metadata-test')
      .tool('metadataTool', {
        name: 'metadataTool',
        description: 'Captures metadata',
        parameters: {},
        handler: async (params: any, metadata: any) => {
          capturedMetadata = metadata;
          return 'done';
        }
      })
      .step('useToolWithMetadata', async (context) => {
        return await context.metadataTool({});
      });

    await metadataWorkflow.run();

    // Verify metadata was passed
    expect(capturedMetadata).toBeDefined();
    expect(capturedMetadata.workflowId).toBe('metadata-test');
    expect(capturedMetadata.stepId).toBe('current');
    expect(capturedMetadata.logger).toBeDefined();
  });
});