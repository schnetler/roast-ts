/**
 * Tests for bidirectional workflow converter
 */

import { WorkflowConverter } from '../converter';
import { workflow } from '../workflow-factory';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';

// Mock fs
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn()
}));

describe('Workflow Converter', () => {
  let converter: WorkflowConverter;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    converter = new WorkflowConverter();
    jest.clearAllMocks();
  });

  describe('YAML to DSL conversion', () => {
    it('should convert simple YAML to DSL code', async () => {
      const yamlContent = `
name: simple-workflow
model: gpt-4
provider: openai
steps:
  - Analyze this data
`;
      
      mockFs.readFile.mockResolvedValue(yamlContent);
      
      const code = await converter.yamlToDSL('workflow.yml');
      
      expect(code).toContain("import { workflow } from '@roast/dsl';");
      expect(code).toContain("workflow('simple-workflow')");
      expect(code).toContain(".model('gpt-4')");
      expect(code).toContain(".provider('openai')");
      expect(code).toContain(".prompt('Analyze this data')");
      expect(code).toContain(".build();");
    });

    it('should convert YAML with tools to DSL', async () => {
      const yamlContent = `
name: with-tools
tools:
  - search
  - read:
      description: Read files
      cacheable: true
steps:
  - Use the tools
`;
      
      mockFs.readFile.mockResolvedValue(yamlContent);
      
      const code = await converter.yamlToDSL('workflow.yml');
      
      expect(code).toContain("import { search, read } from '@roast/tools';");
      expect(code).toContain(".tool('search', search)");
      expect(code).toContain(".tool('read', {");
      expect(code).toContain("...read,");
      expect(code).toContain("description: 'Read files',");
      expect(code).toContain("cacheable: true,");
    });

    it('should convert YAML with agent steps', async () => {
      const yamlContent = `
name: agent-workflow
tools:
  - search
  - read
steps:
  - step: analyzer
    type: agent
    max_steps: 5
    prompt: Analyze the code
    tools:
      - search
      - read
    temperature: 0.5
    fallback: summarize
`;
      
      mockFs.readFile.mockResolvedValue(yamlContent);
      
      const code = await converter.yamlToDSL('workflow.yml');
      
      expect(code).toContain(".agent('analyzer', {");
      expect(code).toContain("maxSteps: 5,");
      expect(code).toContain("fallback: 'summarize',");
      expect(code).toContain("prompt: 'Analyze the code',");
      expect(code).toContain("tools: ['search', 'read'],");
      expect(code).toContain("temperature: 0.5,");
    });

    it('should convert YAML with parallel steps', async () => {
      const yamlContent = `
name: parallel-workflow
steps:
  - [lint, test, build]
`;
      
      mockFs.readFile.mockResolvedValue(yamlContent);
      
      const code = await converter.yamlToDSL('workflow.yml');
      
      expect(code).toContain(".parallel({");
      expect(code).toContain("lint: lintHandler,");
      expect(code).toContain("test: testHandler,");
      expect(code).toContain("build: buildHandler");
      expect(code).toContain("})");
    });

    it('should convert YAML with approval steps', async () => {
      const yamlContent = `
name: approval-workflow
steps:
  - step: approval
    type: approval
    message: Deploy to production?
    timeout: 30m
    channels:
      - slack
      - email
`;
      
      mockFs.readFile.mockResolvedValue(yamlContent);
      
      const code = await converter.yamlToDSL('workflow.yml');
      
      expect(code).toContain(".approve({");
      expect(code).toContain("message: 'Deploy to production?',");
      expect(code).toContain("timeout: '30m',");
      expect(code).toContain("channels: ['slack', 'email'],");
    });

    it('should handle configuration options', async () => {
      const yamlContent = `
name: configured
temperature: 0.3
max_tokens: 4000
timeout: 5m
metadata:
  version: 1.0.0
  author: test
steps:
  - Test step
`;
      
      mockFs.readFile.mockResolvedValue(yamlContent);
      
      const code = await converter.yamlToDSL('workflow.yml');
      
      expect(code).toContain(".temperature(0.3)");
      expect(code).toContain(".maxTokens(4000)");
      expect(code).toContain(".timeout('5m')");
      expect(code).toContain(".metadata('version', \"1.0.0\")");
      expect(code).toContain(".metadata('author', \"test\")");
    });

    it('should handle error handling and retry', async () => {
      const yamlContent = `
name: resilient
error_handler: custom
retry:
  max_attempts: 3
  backoff: exponential
steps:
  - Process data
`;
      
      mockFs.readFile.mockResolvedValue(yamlContent);
      
      const code = await converter.yamlToDSL('workflow.yml');
      
      expect(code).toContain(".catch(errorHandler)");
      expect(code).toContain(".retry({");
      expect(code).toContain("maxAttempts: 3,");
      expect(code).toContain("backoff: 'exponential',");
    });
  });

  describe('DSL to YAML conversion', () => {
    it('should convert DSL workflow to YAML', () => {
      const wf = workflow('test-workflow')
        .model('gpt-4')
        .provider('openai')
        .prompt('Test prompt')
        .build();
      
      const yamlStr = converter.dslToYAML(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.name).toBe('test-workflow');
      expect(yamlObj.model).toBe('gpt-4');
      expect(yamlObj.provider).toBe('openai');
      expect(yamlObj.steps[0]).toBe('Test prompt');
    });

    it('should use transpiler internally', () => {
      const wf = workflow('complex')
        .tool('search', {} as any)
        .agent('analyzer', {
          maxSteps: 5,
          fallback: 'done'
        })
        .build();
      
      const yamlStr = converter.dslToYAML(wf);
      const yamlObj = yaml.load(yamlStr) as any;
      
      expect(yamlObj.tools).toContain('search');
      expect(yamlObj.steps[1].type).toBe('agent');
    });
  });

  describe('File operations', () => {
    it('should save YAML to file', async () => {
      const yamlContent = `
name: test
steps:
  - Test step
`;
      
      mockFs.readFile.mockResolvedValue(yamlContent);
      
      const outputPath = await converter.yamlToDSLFile('test.yml');
      
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('src/workflows'),
        { recursive: true }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test.workflow.ts'),
        expect.stringContaining("workflow('test')"),
        'utf-8'
      );
      expect(outputPath).toContain('test.workflow.ts');
    });

    it('should use custom output path', async () => {
      const yamlContent = `
name: test
steps:
  - Test step
`;
      
      mockFs.readFile.mockResolvedValue(yamlContent);
      
      const customPath = './custom/output.ts';
      const outputPath = await converter.yamlToDSLFile('test.yml', customPath);
      
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        customPath,
        expect.any(String),
        'utf-8'
      );
      expect(outputPath).toBe(customPath);
    });

    it('should generate handlers template', async () => {
      const handlersPath = await converter.generateHandlersTemplate('my-workflow');
      
      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('my-workflow.handlers.ts'),
        expect.stringContaining('Handler functions for my-workflow'),
        'utf-8'
      );
      expect(handlersPath).toContain('my-workflow.handlers.ts');
    });

    it('should include all handler types in template', async () => {
      await converter.generateHandlersTemplate('test');
      
      const writeCall = mockFs.writeFile.mock.calls[0];
      const content = writeCall[1] as string;
      
      expect(content).toContain('export async function exampleHandler');
      expect(content).toContain('export function dynamicPrompt0');
      expect(content).toContain('export function agentPrompt');
      expect(content).toContain('export function conditionalCondition');
      expect(content).toContain('export async function conditionalIfTrue');
      expect(content).toContain('export function loopItems');
      expect(content).toContain('export async function loopHandler');
      expect(content).toContain('export const inputSchema');
      expect(content).toContain('export function approvalMessage');
      expect(content).toContain('export async function errorHandler');
    });
  });

  describe('Complex conversions', () => {
    it('should handle complete workflow conversion', async () => {
      const yamlContent = `
name: complete-workflow
model: gpt-4
provider: openai
temperature: 0.5
tools:
  - search
  - read:
      description: Read files
      cacheable: true
steps:
  - Initial analysis
  - step: process
    tool: search
  - step: analyzer
    type: agent
    max_steps: 10
    tools: [search, read]
  - [lint, test, build]
  - step: conditional
    type: conditional
    condition: dynamic
    if_true: dynamic
    if_false: dynamic
  - step: approval
    type: approval
    message: Continue?
error_handler: custom
retry:
  max_attempts: 3
metadata:
  version: 1.0.0
`;
      
      mockFs.readFile.mockResolvedValue(yamlContent);
      
      const code = await converter.yamlToDSL('workflow.yml');
      
      // Check imports
      expect(code).toContain("import { workflow } from '@roast/dsl';");
      expect(code).toContain("import { search, read } from '@roast/tools';");
      
      // Check configuration
      expect(code).toContain(".model('gpt-4')");
      expect(code).toContain(".temperature(0.5)");
      
      // Check tools
      expect(code).toContain(".tool('search', search)");
      expect(code).toContain(".tool('read', {");
      
      // Check steps
      expect(code).toContain(".prompt('Initial analysis')");
      expect(code).toContain(".agent('analyzer', {");
      expect(code).toContain(".parallel({");
      expect(code).toContain(".conditional(");
      expect(code).toContain(".approve({");
      
      // Check error handling
      expect(code).toContain(".catch(errorHandler)");
      expect(code).toContain(".retry({");
      
      // Check metadata
      expect(code).toContain(".metadata('version', \"1.0.0\")");
    });

    it('should handle string escaping', async () => {
      const yamlContent = `
name: escaping-test
steps:
  - "String with 'single quotes'"
  - 'String with "double quotes"'
  - |
    Multiline
    string with
    special chars: \t \n
`;
      
      mockFs.readFile.mockResolvedValue(yamlContent);
      
      const code = await converter.yamlToDSL('workflow.yml');
      
      // Check that strings are properly escaped based on quote type used
      expect(code).toMatch(/\.prompt\(["']String with 'single quotes'["']\)/);
      expect(code).toMatch(/\.prompt\(['"]String with \\"double quotes\\"['"]|\)/);
      expect(code).toContain("Multiline\\nstring with\\nspecial chars: \\t \\n");
    });

    it('should handle custom converter options', async () => {
      const customConverter = new WorkflowConverter({
        toolImports: '@my-org/tools',
        outputDir: './my-workflows',
        preserveComments: false
      });
      
      const yamlContent = `
name: custom
tools: [myTool]
steps:
  - Use custom tool
`;
      
      mockFs.readFile.mockResolvedValue(yamlContent);
      
      const code = await customConverter.yamlToDSL('workflow.yml');
      
      expect(code).toContain("import { myTool } from '@my-org/tools';");
    });
  });

  describe('Round-trip conversion', () => {
    it('should maintain workflow structure in round-trip', async () => {
      // Create DSL workflow
      const originalWf = workflow('round-trip')
        .model('gpt-4')
        .provider('openai')
        .temperature(0.5)
        .tool('search', {
          description: 'Search tool',
          parameters: { type: 'object' as const, properties: {} },
          execute: jest.fn()
        })
        .prompt('Analyze data')
        .step('process', async () => ({ done: true }))
        .build();
      
      // Convert to YAML
      const yamlStr = converter.dslToYAML(originalWf);
      
      // Write YAML to mock file
      mockFs.readFile.mockResolvedValue(yamlStr);
      
      // Convert back to DSL code
      const dslCode = await converter.yamlToDSL('workflow.yml');
      
      // Check key elements are preserved
      expect(dslCode).toContain("workflow('round-trip')");
      expect(dslCode).toContain(".model('gpt-4')");
      expect(dslCode).toContain(".temperature(0.5)");
      expect(dslCode).toContain(".tool('search'");
      expect(dslCode).toContain(".prompt('Analyze data')");
      expect(dslCode).toContain(".step('process'");
    });
  });
});