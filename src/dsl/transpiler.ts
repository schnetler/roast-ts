/**
 * DSL to YAML Transpiler
 * 
 * Converts DSL workflows to YAML format for compatibility
 * and persistence.
 */

import * as yaml from 'js-yaml';
import { Workflow, DSLWorkflowStep } from './types';
import { Tool, ToolConfig } from '../shared/types';

export interface TranspilerOptions {
  indent?: number;
  lineWidth?: number;
  noRefs?: boolean;
  outputDir?: string;
}

export class DSLTranspiler {
  private options: Required<TranspilerOptions>;

  constructor(options: TranspilerOptions = {}) {
    this.options = {
      indent: 2,
      lineWidth: 80,
      noRefs: true,
      outputDir: './workflows',
      ...options
    };
  }

  /**
   * Transpile a DSL workflow to YAML
   * 
   * @param workflow - The workflow to transpile
   * @returns YAML string representation
   */
  transpile(workflow: Workflow<any>): string {
    const yamlObj = this.buildYAMLObject(workflow);
    
    return yaml.dump(yamlObj, {
      indent: this.options.indent,
      lineWidth: this.options.lineWidth,
      noRefs: this.options.noRefs,
      sortKeys: false,
      quotingType: '"',
      forceQuotes: false
    });
  }

  /**
   * Transpile a DSL workflow to a YAML file
   * 
   * @param workflow - The workflow to transpile
   * @param filename - Output filename (without extension)
   * @returns Path to the generated file
   */
  async transpileToFile(workflow: Workflow<any>, filename?: string): Promise<string> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const yamlContent = this.transpile(workflow);
    const outputFilename = filename || workflow.config.name;
    const outputPath = path.join(this.options.outputDir, `${outputFilename}.yml`);
    
    // Ensure output directory exists
    await fs.mkdir(this.options.outputDir, { recursive: true });
    
    // Write YAML file
    await fs.writeFile(outputPath, yamlContent, 'utf-8');
    
    // Write prompt files if needed
    await this.writePromptFiles(workflow, outputFilename);
    
    return outputPath;
  }

  /**
   * Build YAML object from workflow
   */
  private buildYAMLObject(workflow: Workflow<any>): any {
    const config = workflow.config;
    const yamlObj: any = {
      name: config.name,
      model: config.model,
      provider: config.provider
    };

    // Add optional configuration
    if (config.temperature !== undefined && config.temperature !== 0.7) {
      yamlObj.temperature = config.temperature;
    }

    if (config.maxTokens !== undefined && config.maxTokens !== 2000) {
      yamlObj.max_tokens = config.maxTokens;
    }

    if (config.timeout) {
      yamlObj.timeout = config.timeout;
    }

    // Add metadata
    if (config.metadata && Object.keys(config.metadata).length > 0) {
      yamlObj.metadata = config.metadata;
    }

    // Transpile tools
    if (config.tools && config.tools.size > 0) {
      yamlObj.tools = this.transpileTools(config.tools);
    }

    // Transpile steps
    yamlObj.steps = this.transpileSteps(workflow.steps);

    // Add error handling
    if (workflow.errorHandler) {
      yamlObj.error_handler = 'custom';
    }

    // Add retry configuration
    if (workflow.metadata?.retryConfig) {
      yamlObj.retry = this.transpileRetryConfig(workflow.metadata.retryConfig);
    }

    return yamlObj;
  }

  /**
   * Transpile tools map
   */
  private transpileTools(tools: Map<string, ToolConfig>): any[] {
    const result: any[] = [];
    
    for (const [name, toolConfig] of tools) {
      const tool = toolConfig.tool;
      
      // Check if tool has non-description configuration
      const hasNonDescriptionConfig = tool.cacheable || tool.retryable || 
                                     Object.keys(toolConfig.config).length > 0;
      
      if (hasNonDescriptionConfig) {
        const yamlToolConfig: any = {};
        
        if (tool.description) {
          yamlToolConfig.description = tool.description;
        }
        
        if (tool.cacheable) {
          yamlToolConfig.cacheable = tool.cacheable;
        }
        
        if (tool.retryable) {
          yamlToolConfig.retryable = true;
        }
        
        // Add any additional config
        Object.assign(yamlToolConfig, toolConfig.config);
        
        result.push({ [name]: yamlToolConfig });
      } else {
        // Just a simple tool name if only has description or no config at all
        result.push(name);
      }
    }
    
    return result;
  }

  /**
   * Transpile workflow steps
   */
  private transpileSteps(steps: DSLWorkflowStep[]): any[] {
    return steps.map(step => this.transpileStep(step));
  }

  /**
   * Transpile a single step
   */
  private transpileStep(step: DSLWorkflowStep): any {
    switch (step.type) {
      case 'prompt':
        return this.transpilePromptStep(step);
      
      case 'tool':
        return this.transpileToolStep(step);
      
      case 'agent':
        return this.transpileAgentStep(step);
      
      case 'parallel':
        return this.transpileParallelStep(step);
      
      case 'custom':
        return this.transpileCustomStep(step);
      
      case 'conditional':
        return this.transpileConditionalStep(step);
      
      case 'loop':
        return this.transpileLoopStep(step);
      
      case 'approval':
        return this.transpileApprovalStep(step);
      
      case 'input':
        return this.transpileInputStep(step);
      
      case 'workflow':
        return this.transpileWorkflowStep(step);
      
      default:
        return step.name;
    }
  }

  /**
   * Transpile prompt step
   */
  private transpilePromptStep(step: DSLWorkflowStep): any {
    if (typeof step.prompt === 'string') {
      // Simple string prompt
      if (step.name === 'prompt') {
        return step.prompt;
      }
      
      return {
        step: step.name,
        prompt: step.prompt
      };
    }
    
    // Dynamic prompt function - needs a sidecar file
    return {
      step: step.name,
      prompt: 'dynamic',
      _comment: 'Dynamic prompt - see prompt file'
    };
  }

  /**
   * Transpile tool step
   */
  private transpileToolStep(step: DSLWorkflowStep): any {
    if (step.tool) {
      return {
        step: step.name,
        tool: step.tool
      };
    }
    
    return step.name;
  }

  /**
   * Transpile agent step
   */
  private transpileAgentStep(step: DSLWorkflowStep): any {
    const agentConfig: any = {
      step: step.name,
      type: 'agent',
      max_steps: step.maxSteps
    };

    if (step.prompt) {
      agentConfig.prompt = typeof step.prompt === 'string' 
        ? step.prompt 
        : 'dynamic';
    }

    if (step.tools && step.tools.length > 0) {
      agentConfig.tools = step.tools;
    }

    if (step.config) {
      if (step.config.temperature !== undefined) {
        agentConfig.temperature = step.config.temperature;
      }
      
      if (step.config.model) {
        agentConfig.model = step.config.model;
      }
      
      if (step.config.fallback) {
        agentConfig.fallback = typeof step.config.fallback === 'string'
          ? step.config.fallback
          : 'custom';
      }
    }

    return agentConfig;
  }

  /**
   * Transpile parallel step
   */
  private transpileParallelStep(step: DSLWorkflowStep): any {
    if (step.steps) {
      const parallelSteps = step.steps.map(s => 
        typeof s === 'string' ? s : s.name
      );
      
      return parallelSteps;
    }
    
    return [];
  }

  /**
   * Transpile custom step
   */
  private transpileCustomStep(step: DSLWorkflowStep): any {
    // Custom steps with handlers need special handling
    if (step.handler) {
      return {
        step: step.name,
        type: 'custom',
        _comment: 'Custom handler - implement in code'
      };
    }
    
    return step.name;
  }

  /**
   * Transpile conditional step
   */
  private transpileConditionalStep(step: DSLWorkflowStep): any {
    return {
      step: step.name,
      type: 'conditional',
      condition: 'dynamic',
      if_true: 'dynamic',
      if_false: step.ifFalse ? 'dynamic' : undefined,
      _comment: 'Conditional logic - implement in code'
    };
  }

  /**
   * Transpile loop step
   */
  private transpileLoopStep(step: DSLWorkflowStep): any {
    return {
      step: step.name,
      type: 'loop',
      items: 'dynamic',
      handler: 'dynamic',
      _comment: 'Loop logic - implement in code'
    };
  }

  /**
   * Transpile approval step
   */
  private transpileApprovalStep(step: DSLWorkflowStep): any {
    if (!step.approvalConfig) {
      return {
        step: step.name,
        type: 'approval'
      };
    }

    const config = step.approvalConfig;
    const approval: any = {
      step: step.name,
      type: 'approval'
    };

    if (typeof config.message === 'string') {
      approval.message = config.message;
    } else {
      approval.message = 'dynamic';
    }

    if (config.timeout) {
      approval.timeout = config.timeout;
    }

    if (config.channels) {
      approval.channels = config.channels;
    }

    if (config.fallback) {
      approval.fallback = typeof config.fallback === 'string'
        ? config.fallback
        : 'custom';
    }

    return approval;
  }

  /**
   * Transpile input step
   */
  private transpileInputStep(step: DSLWorkflowStep): any {
    const input: any = {
      step: step.name,
      type: 'input'
    };

    if (step.inputConfig) {
      const config = step.inputConfig;
      
      if (config.prompt) {
        input.prompt = config.prompt;
      }
      
      if (config.default !== undefined) {
        input.default = config.default;
      }
      
      if (config.choices) {
        input.choices = config.choices;
      }
      
      if (config.multiple) {
        input.multiple = config.multiple;
      }
    }

    if (step.inputSchema) {
      input.schema = 'dynamic';
      input._comment = 'Schema validation - implement in code';
    }

    return input;
  }

  /**
   * Transpile workflow step (sub-workflow)
   */
  private transpileWorkflowStep(step: DSLWorkflowStep): any {
    if (step.workflow) {
      return {
        step: step.name,
        type: 'workflow',
        workflow: step.workflow.config.name,
        _comment: 'Sub-workflow reference'
      };
    }
    
    return step.name;
  }

  /**
   * Transpile retry configuration
   */
  private transpileRetryConfig(config: any): any {
    const retry: any = {};
    
    if (config.maxAttempts) {
      retry.max_attempts = config.maxAttempts;
    }
    
    if (config.backoff) {
      retry.backoff = config.backoff;
    }
    
    return retry;
  }

  /**
   * Write prompt files for dynamic prompts
   */
  private async writePromptFiles(workflow: Workflow<any>, basename: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const promptDir = path.join(this.options.outputDir, basename);
    let hasPrompts = false;
    
    for (const step of workflow.steps) {
      if (step.type === 'prompt' && typeof step.prompt === 'function') {
        hasPrompts = true;
        
        // Create prompt directory
        await fs.mkdir(promptDir, { recursive: true });
        
        // Write prompt file
        const promptPath = path.join(promptDir, `${step.name}.md`);
        const promptContent = `# ${step.name}

This is a dynamic prompt that requires runtime context.

To implement this prompt:
1. Access the context variables
2. Generate the prompt dynamically
3. Return the formatted prompt string

Example:
\`\`\`typescript
export function ${step.name}Prompt(context: any): string {
  // Your dynamic prompt logic here
  return \`Process \${context.data}\`;
}
\`\`\`
`;
        
        await fs.writeFile(promptPath, promptContent, 'utf-8');
      }
    }
    
    // Write a README if we created prompt files
    if (hasPrompts) {
      const readmePath = path.join(promptDir, 'README.md');
      const readmeContent = `# ${basename} Prompts

This directory contains dynamic prompt templates for the ${basename} workflow.

Dynamic prompts are implemented as functions in the DSL and need to be
manually implemented when using the YAML format.

Each .md file represents a prompt step that requires runtime context.
`;
      
      await fs.writeFile(readmePath, readmeContent, 'utf-8');
    }
  }
}