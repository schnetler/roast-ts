import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import { createWorkflow } from './workflow-builder';
import { WorkflowBuilder, StepDefinition } from '../shared/types';

export interface YAMLWorkflow {
  name?: string;
  model?: string;
  model_options?: any;
  tools?: (string | Record<string, any>)[];
  steps: (string | Record<string, any> | string[])[];
  parallel?: boolean;
}

let yamlStepCounter = 0;

export async function loadYAMLWorkflow(path: string): Promise<WorkflowBuilder> {
  try {
    const yamlContent = await fs.readFile(path, 'utf-8');
    const config: YAMLWorkflow = yaml.load(yamlContent) as YAMLWorkflow;

    validateYAMLWorkflow(config);

    const workflowName = config.name || path;
    let builder = createWorkflow(workflowName);

    // Configure model
    if (config.model) {
      builder = builder.model(config.model, config.model_options);
    }

    // Configure tools
    if (config.tools) {
      for (const tool of config.tools) {
        if (typeof tool === 'string') {
          // Simple tool reference
          const builtInTool = getBuiltInTool(tool);
          builder = builder.tool(tool, builtInTool);
        } else {
          // Tool with configuration
          const [name, toolConfig] = Object.entries(tool)[0];
          const builtInTool = getBuiltInTool(name);
          builder = builder.tool(name, builtInTool, toolConfig);
        }
      }
    }

    // Add steps
    for (const step of config.steps) {
      builder = addYAMLStep(builder, step);
    }

    return builder;
  } catch (error) {
    throw new Error(`Failed to load YAML workflow: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function parseYAMLStep(step: any): StepDefinition {
  if (!step) {
    throw new Error('Invalid step definition: step cannot be null or undefined');
  }

  if (typeof step === 'string') {
    if (!step.trim()) {
      throw new Error('Invalid step definition: empty string');
    }
    
    // Distinguish between prompts and step references
    if (isPrompt(step)) {
      return {
        type: 'prompt',
        name: generateStepName('prompt'),
        template: step
      };
    } else {
      return {
        type: 'step',
        name: step,
        stepPath: step,
        handler: async (context: any) => {
          // This handler will be replaced by the actual step handler
          // when the workflow is executed
          throw new Error(`Step handler for ${step} not loaded`);
        }
      };
    }
  }

  if (Array.isArray(step)) {
    // Parallel steps
    return {
      type: 'parallel',
      name: generateStepName('parallel'),
      steps: step.map(s => parseYAMLStep(s))
    };
  }

  if (typeof step === 'object') {
    if (step.agent) {
      // Agent step - check this before prompt to handle agents with custom prompts
      return {
        type: 'agent',
        name: step.name || step.agent,
        agentConfig: {
          maxSteps: step.max_steps || 10,
          fallback: step.fallback || 'return_partial',
          prompt: step.prompt || `Act as ${step.agent}`,
          tools: step.tools || []
        }
      };
    }

    if (step.prompt) {
      // Inline prompt
      return {
        type: 'prompt',
        name: step.name || generateStepName('prompt'),
        template: step.prompt
      };
    }

    if (step.step) {
      // Custom step with configuration
      return {
        type: 'step',
        name: step.name || step.step,
        stepPath: step.step,
        config: step.config,
        handler: async (context: any) => {
          // This handler will be replaced by the actual step handler
          // when the workflow is executed
          throw new Error(`Step handler for ${step.step} not loaded`);
        }
      };
    }

    throw new Error(`Invalid step definition: ${JSON.stringify(step)}`);
  }

  throw new Error(`Invalid step definition: ${typeof step}`);
}

function addYAMLStep(builder: WorkflowBuilder, step: any): WorkflowBuilder {
  const stepDef = parseYAMLStep(step);

  switch (stepDef.type) {
    case 'prompt':
      return builder.prompt(stepDef.template!, stepDef.name);
    
    case 'step':
      const stepHandler = loadStepHandler(stepDef.stepPath!, stepDef.config);
      return builder.step(stepDef.name, stepHandler);
    
    case 'parallel':
      const handlers = stepDef.steps!.reduce((acc, s) => {
        if (s.type === 'step') {
          acc[s.name] = loadStepHandler(s.stepPath!, s.config);
        } else if (s.type === 'prompt') {
          acc[s.name] = async () => s.template; // Simple prompt handler
        }
        return acc;
      }, {} as Record<string, any>);
      
      return builder.parallel(handlers);
    
    case 'agent':
      return builder.agent(stepDef.name, stepDef.agentConfig!);
    
    default:
      throw new Error(`Unsupported step type: ${(stepDef as any).type}`);
  }
}

function validateYAMLWorkflow(config: any): void {
  if (!config.steps) {
    throw new Error('Workflow must have steps');
  }

  if (!Array.isArray(config.steps)) {
    throw new Error('Steps must be an array');
  }

  if (config.tools && !Array.isArray(config.tools)) {
    throw new Error('Tools must be an array');
  }
}

function isPrompt(str: string): boolean {
  // Heuristic to distinguish prompts from step names
  // Prompts typically:
  // - Contain spaces
  // - Are longer than typical identifiers
  // - Use natural language
  
  if (str.includes(' ') && str.length > 20) {
    return true;
  }

  // Check for common prompt patterns
  const promptPatterns = [
    /^(analyze|review|generate|create|write|explain|describe)/i,
    /\b(please|help|can you|what|how|why)\b/i,
    /[.!?]$/ // Ends with punctuation
  ];

  return promptPatterns.some(pattern => pattern.test(str));
}

function generateStepName(prefix: string): string {
  return `${prefix}_${++yamlStepCounter}`;
}

function loadStepHandler(stepPath: string, config?: any): (ctx: any) => Promise<any> {
  // In a real implementation, this would load step handlers from files
  // For now, return a placeholder that includes the step path in the result
  return async (ctx: any) => {
    return `Step ${stepPath} executed with context: ${JSON.stringify(ctx)}${config ? ` and config: ${JSON.stringify(config)}` : ''}`;
  };
}

function getBuiltInTool(name: string): any {
  // In a real implementation, this would return actual built-in tools
  // For now, return a placeholder tool
  return {
    schema: {
      type: 'object',
      properties: {},
      required: []
    },
    handler: async (params: any) => {
      return `Built-in tool ${name} executed with params: ${JSON.stringify(params)}`;
    },
    description: `Built-in tool: ${name}`
  };
}