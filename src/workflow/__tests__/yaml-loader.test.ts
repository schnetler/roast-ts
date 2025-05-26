import { loadYAMLWorkflow, parseYAMLStep, YAMLWorkflow } from '../yaml-loader';
import { createWorkflow } from '../workflow-builder';
import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('js-yaml');
jest.mock('../workflow-builder');

describe('YAMLLoader', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockYaml = yaml as jest.Mocked<typeof yaml>;
  const mockCreateWorkflow = createWorkflow as jest.MockedFunction<typeof createWorkflow>;

  let mockWorkflowBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockWorkflowBuilder = {
      tool: jest.fn().mockReturnThis(),
      model: jest.fn().mockReturnThis(),
      prompt: jest.fn().mockReturnThis(),
      step: jest.fn().mockReturnThis(),
      parallel: jest.fn().mockReturnThis(),
      agent: jest.fn().mockReturnThis()
    };

    mockCreateWorkflow.mockReturnValue(mockWorkflowBuilder);
  });

  describe('loadYAMLWorkflow', () => {
    it('should load and parse basic YAML workflow', async () => {
      const yamlContent = `
name: test-workflow
model: gpt-4
tools:
  - readFile
  - writeFile
steps:
  - "Analyze the code"
  - step: customStep
`;

      const parsedYAML: YAMLWorkflow = {
        name: 'test-workflow',
        model: 'gpt-4',
        tools: ['readFile', 'writeFile'],
        steps: ['Analyze the code', { step: 'customStep' }]
      };

      mockFs.readFile.mockResolvedValue(yamlContent);
      mockYaml.load.mockReturnValue(parsedYAML);

      const result = await loadYAMLWorkflow('/path/to/workflow.yml');

      expect(mockFs.readFile).toHaveBeenCalledWith('/path/to/workflow.yml', 'utf-8');
      expect(mockYaml.load).toHaveBeenCalledWith(yamlContent);
      expect(mockCreateWorkflow).toHaveBeenCalledWith('test-workflow');
      expect(mockWorkflowBuilder.model).toHaveBeenCalledWith('gpt-4', undefined);
      expect(result).toBe(mockWorkflowBuilder);
    });

    it('should handle workflows with tool configurations', async () => {
      const yamlContent = `
name: configured-workflow
tools:
  - readFile
  - writeFile:
      maxRetries: 3
      timeout: 5000
steps:
  - "Process files"
`;

      const parsedYAML: YAMLWorkflow = {
        name: 'configured-workflow',
        tools: [
          'readFile',
          { writeFile: { maxRetries: 3, timeout: 5000 } }
        ],
        steps: ['Process files']
      };

      mockFs.readFile.mockResolvedValue(yamlContent);
      mockYaml.load.mockReturnValue(parsedYAML);

      await loadYAMLWorkflow('/path/to/configured.yml');

      expect(mockWorkflowBuilder.tool).toHaveBeenCalledWith('readFile', expect.any(Object));
      expect(mockWorkflowBuilder.tool).toHaveBeenCalledWith(
        'writeFile', 
        expect.any(Object),
        { maxRetries: 3, timeout: 5000 }
      );
    });

    it('should handle workflows without optional fields', async () => {
      const yamlContent = `
steps:
  - "Simple workflow"
`;

      const parsedYAML: YAMLWorkflow = {
        steps: ['Simple workflow']
      };

      mockFs.readFile.mockResolvedValue(yamlContent);
      mockYaml.load.mockReturnValue(parsedYAML);

      await loadYAMLWorkflow('/path/to/simple.yml');

      expect(mockCreateWorkflow).toHaveBeenCalledWith('/path/to/simple.yml');
      expect(mockWorkflowBuilder.model).not.toHaveBeenCalled();
      expect(mockWorkflowBuilder.tool).not.toHaveBeenCalled();
    });

    it('should handle model configurations', async () => {
      const yamlContent = `
name: model-test
model: gpt-4
model_options:
  temperature: 0.7
  max_tokens: 1000
steps:
  - "Test model config"
`;

      const parsedYAML: YAMLWorkflow = {
        name: 'model-test',
        model: 'gpt-4',
        model_options: {
          temperature: 0.7,
          max_tokens: 1000
        },
        steps: ['Test model config']
      };

      mockFs.readFile.mockResolvedValue(yamlContent);
      mockYaml.load.mockReturnValue(parsedYAML);

      await loadYAMLWorkflow('/path/to/model.yml');

      expect(mockWorkflowBuilder.model).toHaveBeenCalledWith('gpt-4', {
        temperature: 0.7,
        max_tokens: 1000
      });
    });

    it('should handle parallel execution configuration', async () => {
      const yamlContent = `
name: parallel-workflow
parallel: true
steps:
  - ["step1", "step2", "step3"]
`;

      const parsedYAML: YAMLWorkflow = {
        name: 'parallel-workflow',
        parallel: true,
        steps: [['step1', 'step2', 'step3']]
      };

      mockFs.readFile.mockResolvedValue(yamlContent);
      mockYaml.load.mockReturnValue(parsedYAML);

      await loadYAMLWorkflow('/path/to/parallel.yml');

      expect(mockWorkflowBuilder.parallel).toHaveBeenCalled();
    });

    it('should handle file reading errors', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      await expect(loadYAMLWorkflow('/nonexistent.yml')).rejects.toThrow('File not found');
    });

    it('should handle YAML parsing errors', async () => {
      mockFs.readFile.mockResolvedValue('invalid: yaml: content:');
      mockYaml.load.mockImplementation(() => {
        throw new Error('Invalid YAML syntax');
      });

      await expect(loadYAMLWorkflow('/invalid.yml')).rejects.toThrow('Invalid YAML syntax');
    });
  });

  describe('parseYAMLStep', () => {
    it('should parse simple string steps as prompts', () => {
      const step = 'Analyze the given data thoroughly';
      const result = parseYAMLStep(step);

      expect(result).toEqual({
        type: 'prompt',
        template: 'Analyze the given data thoroughly',
        name: expect.stringMatching(/prompt_\d+/)
      });
    });

    it('should parse step references', () => {
      const step = 'customAnalysis';
      const result = parseYAMLStep(step);

      expect(result).toEqual({
        type: 'step',
        name: 'customAnalysis',
        stepPath: 'customAnalysis',
        handler: expect.any(Function)
      });
    });

    it('should parse parallel step arrays', () => {
      const step = ['step1', 'step2', 'step3'];
      const result = parseYAMLStep(step);

      expect(result).toEqual({
        type: 'parallel',
        name: expect.stringMatching(/parallel_\d+/),
        steps: [
          { type: 'step', name: 'step1', stepPath: 'step1', handler: expect.any(Function) },
          { type: 'step', name: 'step2', stepPath: 'step2', handler: expect.any(Function) },
          { type: 'step', name: 'step3', stepPath: 'step3', handler: expect.any(Function) }
        ]
      });
    });

    it('should parse mixed parallel arrays with prompts and steps', () => {
      const step = ['Read the file content', 'processCode', 'Generate summary'];
      const result = parseYAMLStep(step);

      expect(result.type).toBe('parallel');
      expect((result as any).steps).toHaveLength(3);
      expect((result as any).steps![0].type).toBe('prompt');
      expect((result as any).steps![0].template).toBe('Read the file content');
      expect((result as any).steps![1].type).toBe('step');
      expect((result as any).steps![1].stepPath).toBe('processCode');
      expect((result as any).steps![1].handler).toBeDefined();
      expect((result as any).steps![2].type).toBe('prompt');
      expect((result as any).steps![2].template).toBe('Generate summary');
    });

    it('should parse step objects with configurations', () => {
      const step = {
        step: 'complexAnalysis',
        config: { depth: 'detailed', format: 'json' },
        name: 'customName'
      };

      const result = parseYAMLStep(step);

      expect(result).toEqual({
        type: 'step',
        name: 'customName',
        stepPath: 'complexAnalysis',
        config: { depth: 'detailed', format: 'json' },
        handler: expect.any(Function)
      });
    });

    it('should parse agent step configurations', () => {
      const step = {
        agent: 'codeReviewer',
        max_steps: 10,
        fallback: 'summarize',
        tools: ['readFile', 'searchCode'],
        prompt: 'Review the code for issues'
      };

      const result = parseYAMLStep(step);

      expect(result).toEqual({
        type: 'agent',
        name: 'codeReviewer',
        agentConfig: {
          maxSteps: 10,
          fallback: 'summarize',
          tools: ['readFile', 'searchCode'],
          prompt: 'Review the code for issues'
        }
      });
    });

    it('should parse inline prompt objects', () => {
      const step = {
        prompt: 'Analyze this code: {{context.code}}',
        name: 'codeAnalysis'
      };

      const result = parseYAMLStep(step);

      expect(result).toEqual({
        type: 'prompt',
        name: 'codeAnalysis',
        template: 'Analyze this code: {{context.code}}'
      });
    });

    it('should handle step objects without explicit names', () => {
      const step = {
        step: 'processData'
      };

      const result = parseYAMLStep(step);

      expect(result.name).toBe('processData');
      expect((result as any).stepPath).toBe('processData');
    });

    it('should distinguish between prompts and step names', () => {
      // Long strings with spaces should be treated as prompts
      const promptStep = 'This is a detailed prompt that explains what to do';
      const promptResult = parseYAMLStep(promptStep);
      expect(promptResult.type).toBe('prompt');

      // Short single words should be treated as step references
      const stepRef = 'processCode';
      const stepResult = parseYAMLStep(stepRef);
      expect(stepResult.type).toBe('step');

      // CamelCase or snake_case should be treated as step references
      const camelStep = 'loadDataCarefully';
      const camelResult = parseYAMLStep(camelStep);
      expect(camelResult.type).toBe('step');

      const snakeStep = 'load_data_carefully';
      const snakeResult = parseYAMLStep(snakeStep);
      expect(snakeResult.type).toBe('step');
    });

    it('should generate unique names for anonymous steps', () => {
      const step1 = 'What should I do with this data?';
      const step2 = 'How can I process this information?';
      
      const result1 = parseYAMLStep(step1);
      const result2 = parseYAMLStep(step2);

      expect(result1.type).toBe('prompt');
      expect(result2.type).toBe('prompt');
      expect(result1.name).not.toBe(result2.name);
      expect(result1.name).toMatch(/prompt_\d+/);
      expect(result2.name).toMatch(/prompt_\d+/);
    });

    it('should handle nested parallel structures', () => {
      const step = [
        'Please prepare the data for processing',
        ['substep1', 'substep2'],
        'Generate the final report.'
      ];

      const result = parseYAMLStep(step);

      expect(result.type).toBe('parallel');
      expect((result as any).steps).toHaveLength(3);
      expect((result as any).steps![0].type).toBe('prompt');
      expect((result as any).steps![1].type).toBe('parallel');
      expect((result as any).steps![1].steps).toHaveLength(2);
      expect((result as any).steps![1].steps![0].type).toBe('step');
      expect((result as any).steps![1].steps![0].handler).toBeDefined();
      expect((result as any).steps![1].steps![1].type).toBe('step');
      expect((result as any).steps![1].steps![1].handler).toBeDefined();
      expect((result as any).steps![2].type).toBe('prompt');
    });

    it('should handle empty or invalid step definitions', () => {
      expect(() => parseYAMLStep(null as any)).toThrow('Invalid step definition');
      expect(() => parseYAMLStep(undefined as any)).toThrow('Invalid step definition');
      expect(() => parseYAMLStep('' as any)).toThrow('Invalid step definition');
      expect(() => parseYAMLStep(123 as any)).toThrow('Invalid step definition');
    });
  });

  describe('YAML workflow validation', () => {
    it('should validate required fields', async () => {
      const invalidYaml = `
name: test
# Missing steps field
`;

      mockFs.readFile.mockResolvedValue(invalidYaml);
      mockYaml.load.mockReturnValue({ name: 'test' });

      await expect(loadYAMLWorkflow('/invalid.yml')).rejects.toThrow('Workflow must have steps');
    });

    it('should validate steps array', async () => {
      const invalidYaml = `
name: test
steps: "not an array"
`;

      mockFs.readFile.mockResolvedValue(invalidYaml);
      mockYaml.load.mockReturnValue({ name: 'test', steps: 'not an array' });

      await expect(loadYAMLWorkflow('/invalid.yml')).rejects.toThrow('Steps must be an array');
    });

    it('should validate tools configuration', async () => {
      const invalidYaml = `
name: test
tools: "not an array"
steps: ["test"]
`;

      mockFs.readFile.mockResolvedValue(invalidYaml);
      mockYaml.load.mockReturnValue({ 
        name: 'test', 
        tools: 'not an array',
        steps: ['test']
      });

      await expect(loadYAMLWorkflow('/invalid.yml')).rejects.toThrow('Tools must be an array');
    });
  });

  describe('integration with WorkflowBuilder', () => {
    it('should build complete workflow from YAML', async () => {
      const complexYaml = `
name: complex-workflow
model: gpt-4
model_options:
  temperature: 0.8
tools:
  - readFile
  - writeFile:
      maxRetries: 3
steps:
  - "Initialize the process"
  - step: loadData
    config: { source: "database" }
  - ["processData", "validateResults"]
  - agent: reviewer
    max_steps: 5
    tools: ["readFile"]
    prompt: "Review the results"
`;

      const parsedYAML = {
        name: 'complex-workflow',
        model: 'gpt-4',
        model_options: { temperature: 0.8 },
        tools: ['readFile', { writeFile: { maxRetries: 3 } }],
        steps: [
          'Initialize the process',
          { step: 'loadData', config: { source: 'database' } },
          ['processData', 'validateResults'],
          {
            agent: 'reviewer',
            max_steps: 5,
            tools: ['readFile'],
            prompt: 'Review the results'
          }
        ]
      };

      mockFs.readFile.mockResolvedValue(complexYaml);
      mockYaml.load.mockReturnValue(parsedYAML);

      await loadYAMLWorkflow('/complex.yml');

      expect(mockWorkflowBuilder.model).toHaveBeenCalledWith('gpt-4', { temperature: 0.8 });
      expect(mockWorkflowBuilder.tool).toHaveBeenCalledTimes(2);
      expect(mockWorkflowBuilder.prompt).toHaveBeenCalledWith('Initialize the process', expect.stringMatching(/prompt_\d+/));
      expect(mockWorkflowBuilder.step).toHaveBeenCalled();
      expect(mockWorkflowBuilder.parallel).toHaveBeenCalled();
      expect(mockWorkflowBuilder.agent).toHaveBeenCalled();
    });
  });
});