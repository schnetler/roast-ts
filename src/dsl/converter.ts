/**
 * Workflow Converter
 * 
 * Bidirectional conversion between YAML and DSL formats
 */

import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import * as path from 'path';
import { workflow } from './workflow-factory';
import { WorkflowDSL, Workflow } from './types';
import { DSLTranspiler } from './transpiler';

export interface ConverterOptions {
  toolImports?: string;
  outputDir?: string;
  preserveComments?: boolean;
}

export class WorkflowConverter {
  private options: Required<ConverterOptions>;
  private transpiler: DSLTranspiler;

  constructor(options: ConverterOptions = {}) {
    this.options = {
      toolImports: '@roast/tools',
      outputDir: './src/workflows',
      preserveComments: true,
      ...options
    };
    
    this.transpiler = new DSLTranspiler({
      outputDir: options.outputDir
    });
  }

  /**
   * Convert YAML workflow to DSL TypeScript code
   * 
   * @param yamlPath - Path to YAML file
   * @returns TypeScript code string
   */
  async yamlToDSL(yamlPath: string): Promise<string> {
    const yamlContent = await fs.readFile(yamlPath, 'utf-8');
    const yamlObj = yaml.load(yamlContent) as any;
    
    return this.generateDSLCode(yamlObj, path.basename(yamlPath, '.yml'));
  }

  /**
   * Convert YAML workflow to DSL and save as TypeScript file
   * 
   * @param yamlPath - Path to YAML file
   * @param outputPath - Optional output path
   * @returns Path to generated TypeScript file
   */
  async yamlToDSLFile(yamlPath: string, outputPath?: string): Promise<string> {
    const code = await this.yamlToDSL(yamlPath);
    const basename = path.basename(yamlPath, '.yml');
    const tsPath = outputPath || path.join(this.options.outputDir, `${basename}.workflow.ts`);
    
    await fs.mkdir(path.dirname(tsPath), { recursive: true });
    await fs.writeFile(tsPath, code, 'utf-8');
    
    return tsPath;
  }

  /**
   * Convert DSL workflow to YAML
   * 
   * @param workflow - DSL workflow instance
   * @returns YAML string
   */
  dslToYAML(workflow: Workflow<any>): string {
    return this.transpiler.transpile(workflow);
  }

  /**
   * Convert DSL workflow to YAML and save file
   * 
   * @param workflow - DSL workflow instance
   * @param outputPath - Optional output path
   * @returns Path to generated YAML file
   */
  async dslToYAMLFile(workflow: Workflow<any>, outputPath?: string): Promise<string> {
    return this.transpiler.transpileToFile(workflow, outputPath);
  }

  /**
   * Generate DSL code from YAML object
   */
  private generateDSLCode(yamlObj: any, name: string): string {
    const code: string[] = [];
    
    // Add imports
    code.push(this.generateImports(yamlObj));
    code.push('');
    
    // Add workflow definition
    const workflowVarName = this.toCamelCase(name) === 'workflow' ? 'wf' : this.toCamelCase(name);
    code.push(`export const ${workflowVarName} = workflow('${yamlObj.name || name}')`);
    
    // Add configuration
    if (yamlObj.model) {
      code.push(`  .model('${yamlObj.model}')`);
    }
    
    if (yamlObj.provider) {
      code.push(`  .provider('${yamlObj.provider}')`);
    }
    
    if (yamlObj.temperature !== undefined) {
      code.push(`  .temperature(${yamlObj.temperature})`);
    }
    
    if (yamlObj.max_tokens !== undefined) {
      code.push(`  .maxTokens(${yamlObj.max_tokens})`);
    }
    
    if (yamlObj.timeout) {
      code.push(`  .timeout('${yamlObj.timeout}')`);
    }
    
    // Add metadata
    if (yamlObj.metadata) {
      Object.entries(yamlObj.metadata).forEach(([key, value]) => {
        code.push(`  .metadata('${key}', ${JSON.stringify(value)})`);
      });
    }
    
    // Add tools
    if (yamlObj.tools) {
      code.push(this.generateToolsCode(yamlObj.tools));
    }
    
    // Add steps
    if (yamlObj.steps) {
      code.push(this.generateStepsCode(yamlObj.steps));
    }
    
    // Add error handling
    if (yamlObj.error_handler) {
      code.push(this.generateErrorHandlerCode(yamlObj.error_handler));
    }
    
    // Add retry
    if (yamlObj.retry) {
      code.push(this.generateRetryCode(yamlObj.retry));
    }
    
    code.push('  .build();');
    
    return code.join('\n');
  }

  /**
   * Generate import statements
   */
  private generateImports(yamlObj: any): string {
    const imports: string[] = [];
    
    imports.push(`import { workflow } from '@roast/dsl';`);
    
    // Import tools if specified
    if (yamlObj.tools && yamlObj.tools.length > 0) {
      const toolNames = yamlObj.tools
        .map((tool: any) => typeof tool === 'string' ? tool : Object.keys(tool)[0])
        .filter((name: string) => name !== 'custom');
      
      if (toolNames.length > 0) {
        imports.push(`import { ${toolNames.join(', ')} } from '${this.options.toolImports}';`);
      }
    }
    
    return imports.join('\n');
  }

  /**
   * Generate tools code
   */
  private generateToolsCode(tools: any[]): string {
    const code: string[] = [];
    
    tools.forEach(tool => {
      if (typeof tool === 'string') {
        code.push(`  .tool('${tool}', ${tool})`);
      } else {
        const [name, config] = Object.entries(tool)[0] as [string, any];
        if (Object.keys(config).length === 0) {
          code.push(`  .tool('${name}', ${name})`);
        } else {
          code.push(`  .tool('${name}', {`);
          code.push(`    ...${name},`);
          
          if (config.description) {
            code.push(`    description: '${config.description}',`);
          }
          
          if (config.cacheable !== undefined) {
            code.push(`    cacheable: ${config.cacheable},`);
          }
          
          if (config.retryable !== undefined) {
            code.push(`    retryable: ${config.retryable},`);
          }
          
          code.push(`  })`);
        }
      }
    });
    
    return code.join('\n');
  }

  /**
   * Generate steps code
   */
  private generateStepsCode(steps: any[]): string {
    const code: string[] = [];
    
    steps.forEach((step, index) => {
      const stepCode = this.generateStepCode(step, index);
      if (stepCode) {
        code.push(stepCode);
      }
    });
    
    return code.join('\n');
  }

  /**
   * Generate code for a single step
   */
  private generateStepCode(step: any, index: number): string {
    // Simple string prompt or step
    if (typeof step === 'string') {
      // Check if this might be a prompt step - simple heuristic based on common patterns
      const looksLikePrompt = step.toLowerCase().includes('analyze') || 
                             step.toLowerCase().includes('generate') ||
                             step.toLowerCase().includes('write') ||
                             step.toLowerCase().includes('create') ||
                             step.toLowerCase().includes('describe') ||
                             step.toLowerCase().includes('explain') ||
                             step.length > 20; // Longer strings are often prompts
      
      // Check if it contains double quotes to determine which quotes to use
      if (step.includes('"') && !step.includes("'")) {
        // Use single quotes when the string contains double quotes
        return (index === 0 || looksLikePrompt)
          ? `  .prompt('${this.escapeString(step)}')`
          : `  .step('${this.escapeString(step)}', ${this.escapeString(step)}Handler)`;
      } else if (step.includes("'") && !step.includes('"')) {
        // Use double quotes when the string contains single quotes
        return (index === 0 || looksLikePrompt)
          ? `  .prompt("${this.escapeStringDouble(step)}")`
          : `  .step("${this.escapeStringDouble(step)}", ${this.escapeStringDouble(step)}Handler)`;
      } else {
        // Default to single quotes
        return (index === 0 || looksLikePrompt)
          ? `  .prompt('${this.escapeString(step)}')`
          : `  .step('${this.escapeString(step)}', ${this.escapeString(step)}Handler)`;
      }
    }
    
    // Array of parallel steps
    if (Array.isArray(step)) {
      const parallelSteps = step.map(s => `    ${s}: ${s}Handler`).join(',\n');
      return `  .parallel({\n${parallelSteps}\n  })`;
    }
    
    // Step object
    if (typeof step === 'object') {
      // Check type-specific steps first
      if (step.type === 'agent') {
        return this.generateAgentStepCode(step);
      }
      
      if (step.type === 'approval') {
        return this.generateApprovalStepCode(step);
      }
      
      if (step.type === 'input') {
        return this.generateInputStepCode(step);
      }
      
      if (step.type === 'conditional') {
        return this.generateConditionalStepCode(step);
      }
      
      if (step.type === 'loop') {
        return this.generateLoopStepCode(step);
      }
      
      if (step.type === 'custom') {
        return `  .step('${step.step}', ${step.step}Handler)`;
      }
      
      // Then check for prompt steps
      if (step.prompt !== undefined) {
        const prompt = typeof step.prompt === 'string' 
          ? `'${this.escapeString(step.prompt)}'`
          : `dynamicPrompt${index}`;
        
        return step.step 
          ? `  .promptAs('${step.step}', ${prompt})`
          : `  .prompt(${prompt})`;
      }
      
      // Tool steps
      if (step.tool) {
        return `  .step('${step.step}', async (context) => {\n` +
               `    return await context.${step.tool};\n` +
               `  })`;
      }
    }
    
    // Default: custom step handler
    if (typeof step === 'string') {
      return `  .step('${step}', ${step}Handler)`;
    }
    
    return '';
  }

  /**
   * Generate agent step code
   */
  private generateAgentStepCode(step: any): string {
    const config: string[] = [];
    
    config.push(`    maxSteps: ${step.max_steps || 5},`);
    
    if (step.fallback) {
      config.push(`    fallback: '${step.fallback}',`);
    }
    
    if (step.prompt) {
      const prompt = typeof step.prompt === 'string'
        ? `'${this.escapeString(step.prompt)}'`
        : 'agentPrompt';
      config.push(`    prompt: ${prompt},`);
    }
    
    if (step.tools) {
      config.push(`    tools: [${step.tools.map((t: string) => `'${t}'`).join(', ')}],`);
    }
    
    if (step.temperature !== undefined) {
      config.push(`    temperature: ${step.temperature},`);
    }
    
    if (step.model) {
      config.push(`    model: '${step.model}',`);
    }
    
    return `  .agent('${step.step}', {\n${config.join('\n')}\n  })`;
  }

  /**
   * Generate approval step code
   */
  private generateApprovalStepCode(step: any): string {
    if (!step.message && !step.timeout && !step.channels) {
      return `  .approve()`;
    }
    
    const config: string[] = [];
    
    if (step.message) {
      const message = typeof step.message === 'string'
        ? `'${this.escapeString(step.message)}'`
        : 'approvalMessage';
      config.push(`    message: ${message},`);
    }
    
    if (step.timeout) {
      config.push(`    timeout: '${step.timeout}',`);
    }
    
    if (step.channels) {
      config.push(`    channels: [${step.channels.map((c: string) => `'${c}'`).join(', ')}],`);
    }
    
    if (step.fallback) {
      config.push(`    fallback: '${step.fallback}',`);
    }
    
    return `  .approve({\n${config.join('\n')}\n  })`;
  }

  /**
   * Generate input step code
   */
  private generateInputStepCode(step: any): string {
    const schemaCode = step.schema === 'dynamic' 
      ? `${step.step}Schema`
      : 'z.string()';
    
    const config: string[] = [];
    
    if (step.prompt) {
      config.push(`    prompt: '${this.escapeString(step.prompt)}',`);
    }
    
    if (step.default !== undefined) {
      config.push(`    default: ${JSON.stringify(step.default)},`);
    }
    
    if (step.choices) {
      config.push(`    choices: ${JSON.stringify(step.choices)},`);
    }
    
    if (step.multiple) {
      config.push(`    multiple: ${step.multiple},`);
    }
    
    const configCode = config.length > 0
      ? `, {\n${config.join('\n')}\n  }`
      : '';
    
    return `  .input('${step.step}', ${schemaCode}${configCode})`;
  }

  /**
   * Generate conditional step code
   */
  private generateConditionalStepCode(step: any): string {
    const condition = step.condition === 'dynamic'
      ? `${step.step}Condition`
      : `() => true`;
    
    const ifTrue = step.if_true === 'dynamic'
      ? `${step.step}IfTrue`
      : `() => ({})`;
    
    const ifFalse = step.if_false
      ? step.if_false === 'dynamic'
        ? `, ${step.step}IfFalse`
        : `, () => ({})`
      : '';
    
    return `  .conditional(${condition}, ${ifTrue}${ifFalse})`;
  }

  /**
   * Generate loop step code
   */
  private generateLoopStepCode(step: any): string {
    const items = step.items === 'dynamic'
      ? `${step.step}Items`
      : `() => []`;
    
    const handler = step.handler === 'dynamic'
      ? `${step.step}Handler`
      : `async (item, index, context) => item`;
    
    return `  .loop(${items}, ${handler})`;
  }

  /**
   * Generate error handler code
   */
  private generateErrorHandlerCode(errorHandler: any): string {
    if (errorHandler === 'custom') {
      return `  .catch(errorHandler)`;
    }
    
    return `  .catch(async (error, context) => {\n` +
           `    console.error('Workflow error:', error);\n` +
           `    return { error: error.message };\n` +
           `  })`;
  }

  /**
   * Generate retry code
   */
  private generateRetryCode(retry: any): string {
    const config: string[] = [];
    
    if (retry.max_attempts) {
      config.push(`    maxAttempts: ${retry.max_attempts},`);
    }
    
    if (retry.backoff) {
      config.push(`    backoff: '${retry.backoff}',`);
    }
    
    return `  .retry({\n${config.join('\n')}\n  })`;
  }

  /**
   * Convert string to camelCase
   */
  private toCamelCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
      .replace(/^(.)/, (_, char) => char.toLowerCase());
  }

  /**
   * Escape string for TypeScript (single quotes)
   */
  private escapeString(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  /**
   * Escape string for TypeScript (double quotes)
   */
  private escapeStringDouble(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  /**
   * Generate example workflow handlers file
   */
  async generateHandlersTemplate(workflowName: string, outputPath?: string): Promise<string> {
    const handlersPath = outputPath || 
      path.join(this.options.outputDir, `${workflowName}.handlers.ts`);
    
    const template = `/**
 * Handler functions for ${workflowName} workflow
 * 
 * This file contains the custom handler implementations
 * referenced in the workflow definition.
 */

import { z } from 'zod';

// Custom step handlers
export async function exampleHandler(context: any) {
  // Implement your custom logic here
  return { result: 'processed' };
}

// Dynamic prompts
export function dynamicPrompt0(context: any): string {
  // Generate prompt based on context
  return \`Process \${context.data}\`;
}

// Agent prompts
export function agentPrompt(context: any): string {
  // Generate agent prompt
  return 'Analyze the following data and provide insights';
}

// Conditional logic
export function conditionalCondition(context: any): boolean {
  // Implement condition logic
  return context.someValue > 0;
}

export async function conditionalIfTrue(context: any) {
  // Handle true case
  return { branch: 'true' };
}

export async function conditionalIfFalse(context: any) {
  // Handle false case
  return { branch: 'false' };
}

// Loop handlers
export function loopItems(context: any): any[] {
  // Return items to loop over
  return context.items || [];
}

export async function loopHandler(item: any, index: number, context: any) {
  // Process each item
  return { processed: item, index };
}

// Input schemas
export const inputSchema = z.object({
  value: z.string(),
  optional: z.number().optional()
});

// Approval messages
export function approvalMessage(context: any): string {
  return \`Approve \${context.changes.length} changes?\`;
}

// Error handler
export async function errorHandler(error: Error, context: any) {
  console.error('Workflow error:', error);
  
  // Handle specific error types
  if (error.message.includes('rate limit')) {
    return { retry: true, delay: 5000 };
  }
  
  return { error: error.message, failed: true };
}
`;
    
    await fs.mkdir(path.dirname(handlersPath), { recursive: true });
    await fs.writeFile(handlersPath, template, 'utf-8');
    
    return handlersPath;
  }
}