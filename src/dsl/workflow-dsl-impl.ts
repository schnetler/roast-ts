/**
 * WorkflowDSL Implementation
 * 
 * Main implementation of the fluent workflow DSL, providing type-safe
 * progressive context building and natural workflow definition.
 */

import { z } from 'zod';
import { 
  WorkflowDSL,
  TemplateFunction,
  StepHandler,
  ConditionFunction,
  LoopHandler,
  ErrorHandler,
  ItemsFunction,
  AgentConfig,
  ApprovalConfig,
  InputConfig,
  RetryConfig,
  Validator,
  ValidationResult,
  ExecutionPlan,
  ToolResult,
  InferToolContext,
  InferStepContext,
  InferWorkflowContext,
  InferWorkflowContexts,
  UnionToIntersection,
  Workflow,
  DSLWorkflowStep
} from './types';
import { Tool, WorkflowConfig } from '../shared/types';
import { WorkflowEngine } from '../workflow/workflow-engine';

export class WorkflowDSLImpl<TContext = {}> implements WorkflowDSL<TContext> {
  private config: WorkflowConfig;
  private workflowSteps: DSLWorkflowStep[] = [];
  private errorHandler?: ErrorHandler<TContext, any>;
  private validators: Validator<TContext>[] = [];
  private retryConfig?: RetryConfig;
  private _tags: Set<string> = new Set();

  constructor(name: string) {
    this.config = {
      name,
      model: 'gpt-4',
      provider: 'openai',
      tools: new Map(),
      steps: [],
      temperature: 0.7,
      maxTokens: 2000,
      metadata: {}
    };
  }

  // Getter for workflow name
  get name(): string {
    return this.config.name;
  }

  // Getter for workflow description
  get workflowDescription(): string | undefined {
    return this.config.metadata?.description;
  }

  // Configuration methods
  model(model: string): this {
    this.config.model = model;
    return this;
  }

  provider(provider: 'openai' | 'anthropic' | 'openrouter'): this {
    this.config.provider = provider;
    return this;
  }

  temperature(temp: number): this {
    this.config.temperature = temp;
    return this;
  }

  maxTokens(tokens: number): this {
    this.config.maxTokens = tokens;
    return this;
  }

  timeout(duration: string): this {
    this.config.timeout = duration;
    return this;
  }

  // Tool methods
  tool<K extends string, TParams, TResult>(
    name: K,
    tool: Tool<TParams, TResult>
  ): WorkflowDSL<TContext & Record<K, ToolResult<TResult>>> {
    // Add tool to configuration
    if (!this.config.tools) {
      this.config.tools = new Map();
    }
    this.config.tools.set(name, {
      tool,
      config: {}
    });
    
    // Add tool step
    this.workflowSteps.push({
      type: 'tool',
      name,
      tool: name
    });
    
    // Type assertion for progressive enhancement
    return this as any;
  }

  tools<TTools extends Record<string, Tool<any, any>>>(
    tools: TTools
  ): WorkflowDSL<TContext & InferToolContext<TTools>> {
    if (!this.config.tools) {
      this.config.tools = new Map();
    }
    Object.entries(tools).forEach(([name, tool]) => {
      this.config.tools!.set(name, {
        tool,
        config: {}
      });
      
      this.workflowSteps.push({
        type: 'tool',
        name,
        tool: name
      });
    });
    
    return this as any;
  }

  // Prompt methods
  prompt(
    template: string | TemplateFunction<TContext>
  ): WorkflowDSL<TContext & { prompt: string }> {
    this.workflowSteps.push({
      type: 'prompt',
      name: 'prompt',
      prompt: template
    });
    
    return this as any;
  }

  promptAs<K extends string>(
    name: K,
    template: string | TemplateFunction<TContext>
  ): WorkflowDSL<TContext & Record<K, string>> {
    this.workflowSteps.push({
      type: 'prompt',
      name,
      prompt: template
    });
    
    return this as any;
  }

  // Step methods
  step<K extends string, TResult>(
    name: K,
    handler: StepHandler<TContext, TResult>
  ): WorkflowDSL<TContext & Record<K, TResult>> {
    this.workflowSteps.push({
      type: 'custom',
      name,
      handler
    });
    
    return this as any;
  }

  steps<TSteps extends Record<string, StepHandler<TContext, any>>>(
    steps: TSteps
  ): WorkflowDSL<TContext & InferStepContext<TContext, TSteps>> {
    Object.entries(steps).forEach(([name, handler]) => {
      this.workflowSteps.push({
        type: 'custom',
        name,
        handler
      });
    });
    
    return this as any;
  }

  // Agent methods
  agent<K extends string, TResult>(
    name: K,
    config: AgentConfig<TContext>
  ): WorkflowDSL<TContext & Record<K, TResult>> {
    this.workflowSteps.push({
      type: 'agent',
      name,
      maxSteps: config.maxSteps,
      prompt: config.prompt,
      tools: config.tools || Array.from(this.config.tools?.keys() || []),
      config: {
        temperature: config.temperature,
        model: config.model,
        fallback: config.fallback
      }
    });
    
    return this as any;
  }

  // Control flow methods
  parallel<TSteps extends Record<string, StepHandler<TContext, any>>>(
    steps: TSteps
  ): WorkflowDSL<TContext & InferStepContext<TContext, TSteps>> {
    const parallelSteps = Object.entries(steps).map(([name, handler]) => ({
      type: 'custom' as const,
      name,
      handler
    }));
    
    this.workflowSteps.push({
      type: 'parallel',
      name: 'parallel',
      steps: parallelSteps
    });
    
    return this as any;
  }

  conditional<TResult>(
    condition: ConditionFunction<TContext>,
    ifTrue: StepHandler<TContext, TResult>,
    ifFalse?: StepHandler<TContext, TResult>
  ): WorkflowDSL<TContext & { conditional: TResult }> {
    this.workflowSteps.push({
      type: 'conditional',
      name: 'conditional',
      condition,
      ifTrue,
      ifFalse
    });
    
    return this as any;
  }

  loop<TItem, TResult>(
    items: ItemsFunction<TContext, TItem>,
    handler: LoopHandler<TContext, TItem, TResult>
  ): WorkflowDSL<TContext & { loop: TResult[] }> {
    this.workflowSteps.push({
      type: 'loop',
      name: 'loop',
      items,
      loopHandler: handler
    });
    
    return this as any;
  }

  // Human interaction methods
  approve(config?: ApprovalConfig<TContext>): this {
    this.workflowSteps.push({
      type: 'approval',
      name: 'approval',
      approvalConfig: config || {
        message: 'Please approve to continue',
        timeout: '1h'
      }
    });
    
    return this;
  }

  input<K extends string, TSchema extends z.ZodSchema>(
    name: K,
    schema: TSchema,
    config?: InputConfig
  ): WorkflowDSL<TContext & Record<K, z.infer<TSchema>>> {
    this.workflowSteps.push({
      type: 'input',
      name,
      inputSchema: schema,
      inputConfig: config
    });
    
    return this as any;
  }

  // Composition methods
  use<TWorkflow extends WorkflowDSL<any>>(
    workflow: TWorkflow
  ): WorkflowDSL<TContext & InferWorkflowContext<TWorkflow>> {
    const subWorkflow = workflow.build();
    
    this.workflowSteps.push({
      type: 'workflow',
      name: subWorkflow.config.name,
      workflow: subWorkflow
    });
    
    // Merge tools
    if (subWorkflow.config.tools) {
      if (!this.config.tools) {
        this.config.tools = new Map();
      }
      for (const [name, toolConfig] of subWorkflow.config.tools) {
        this.config.tools.set(name, toolConfig);
      }
    }
    
    return this as any;
  }

  compose<TWorkflows extends WorkflowDSL<any>[]>(
    ...workflows: TWorkflows
  ): WorkflowDSL<TContext & UnionToIntersection<InferWorkflowContexts<TWorkflows>>> {
    workflows.forEach(workflow => {
      const subWorkflow = workflow.build();
      
      this.workflowSteps.push({
        type: 'workflow',
        name: subWorkflow.config.name,
        workflow: subWorkflow
      });
      
      // Merge tools
      if (subWorkflow.config.tools) {
        if (!this.config.tools) {
          this.config.tools = new Map();
        }
        for (const [name, toolConfig] of subWorkflow.config.tools) {
          this.config.tools.set(name, toolConfig);
        }
      }
    });
    
    return this as any;
  }

  // Error handling methods
  catch<TResult>(
    handler: ErrorHandler<TContext, TResult>
  ): WorkflowDSL<TContext & { error?: TResult }> {
    this.errorHandler = handler;
    return this as any;
  }

  retry(config?: RetryConfig): this {
    this.retryConfig = config || {
      maxAttempts: 3,
      backoff: 'exponential'
    };
    return this;
  }

  // Validation methods
  validate(validator: Validator<TContext>): this {
    this.validators.push(validator);
    return this;
  }

  // Execution methods
  build(): Workflow<TContext> {
    // Convert DSL steps to workflow steps
    const workflowSteps = this.workflowSteps.map(step => {
      const baseStep: any = {
        name: step.name,
        type: step.type
      };

      // Add type-specific properties
      switch (step.type) {
        case 'prompt':
          baseStep.prompt = step.prompt;
          break;
        case 'tool':
          baseStep.tool = step.tool;
          break;
        case 'agent':
          baseStep.maxSteps = step.maxSteps;
          baseStep.prompt = step.prompt;
          baseStep.tools = step.tools;
          if (step.config) {
            baseStep.config = step.config;
          }
          break;
        case 'parallel':
          baseStep.steps = step.steps;
          break;
      }

      return baseStep;
    });

    return {
      config: {
        ...this.config,
        steps: workflowSteps,
        metadata: {
          ...this.config.metadata,
          tags: Array.from(this._tags)
        }
      },
      steps: this.workflowSteps,
      errorHandler: this.errorHandler,
      validators: this.validators,
      metadata: {
        retryConfig: this.retryConfig
      }
    };
  }

  async run(input?: Partial<TContext>): Promise<TContext> {
    const workflow = this.build();
    
    // Validate workflow structure
    const validationResult = this.validateWorkflow();
    if (!validationResult.valid) {
      throw new Error(`Workflow validation failed: ${validationResult.errors?.join(', ')}`);
    }
    
    // Run validators on input
    for (const validator of this.validators) {
      const result = await validator(input as TContext);
      if (result !== true) {
        throw new Error(`Input validation failed: ${result}`);
      }
    }
    
    // Create workflow engine with custom step executor
    const engine = new WorkflowEngine(
      workflow.config,
      {} as any, // stateManager - will be injected by container
      {} as any, // toolRegistry - will be injected by container
      {} as any  // llmClient - will be injected by container
    );
    
    try {
      // Execute with retry logic if configured
      if (this.retryConfig) {
        return await this.executeWithRetry(engine, workflow, input);
      }
      
      // Normal execution
      const result = await engine.execute(input);
      return result;
    } catch (error) {
      if (this.errorHandler) {
        const errorResult = await this.errorHandler(error as Error, input as TContext);
        return { ...input, error: errorResult } as TContext;
      }
      throw error;
    }
  }

  async dryRun(input?: Partial<TContext>): Promise<ExecutionPlan> {
    const workflow = this.build();
    
    // Analyze workflow structure
    const plan: ExecutionPlan = {
      steps: [],
      totalSteps: 0,
      parallelizable: false,
      estimatedTotalDuration: 0
    };
    
    // Build dependency graph
    const dependencies = new Map<string, string[]>();
    let currentDeps: string[] = [];
    
    for (const step of this.workflowSteps) {
      const stepInfo = {
        name: step.name,
        type: step.type,
        dependencies: [...currentDeps],
        estimatedDuration: this.estimateStepDuration(step)
      };
      
      plan.steps.push(stepInfo);
      dependencies.set(step.name, currentDeps);
      
      // Update dependencies based on step type
      if (step.type === 'parallel') {
        // Parallel steps don't depend on each other
        const parallelNames = step.steps?.map(s => s.name) || [];
        parallelNames.forEach(name => {
          dependencies.set(name, currentDeps);
        });
        currentDeps = [...currentDeps, ...parallelNames];
        plan.parallelizable = true;
      } else {
        currentDeps = [...currentDeps, step.name];
      }
    }
    
    plan.totalSteps = plan.steps.length;
    plan.estimatedTotalDuration = this.calculateTotalDuration(plan.steps, dependencies);
    
    return plan;
  }

  validateWorkflow(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check for empty workflow
    if (this.workflowSteps.length === 0) {
      errors.push('Workflow has no steps');
    }
    
    // Check for circular dependencies
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    for (const step of this.workflowSteps) {
      if (!visited.has(step.name)) {
        if (this.hasCycle(step, visited, recursionStack)) {
          errors.push(`Circular dependency detected at step: ${step.name}`);
        }
      }
    }
    
    // Check agent configurations
    this.workflowSteps.forEach(step => {
      if (step.type === 'agent') {
        if (!step.maxSteps || step.maxSteps <= 0) {
          errors.push(`Agent step '${step.name}' must have positive maxSteps`);
        }
        if (!step.prompt) {
          warnings.push(`Agent step '${step.name}' has no prompt defined`);
        }
      }
    });
    
    // Check tool availability
    const availableTools = new Set(this.config.tools?.keys() || []);
    
    this.workflowSteps.forEach(step => {
      if (step.type === 'agent' && step.tools) {
        step.tools.forEach(tool => {
          if (!availableTools.has(tool)) {
            errors.push(`Tool '${tool}' used in step '${step.name}' is not defined`);
          }
        });
      }
    });
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  // Utility methods
  log(message: string | ((ctx: TContext) => string)): this {
    this.workflowSteps.push({
      type: 'custom',
      name: `log_${this.workflowSteps.length}`,
      handler: async (ctx: TContext) => {
        const msg = typeof message === 'function' ? message(ctx) : message;
        console.log(`[${this.config.name}] ${msg}`);
        return null;
      }
    });
    
    return this;
  }

  tap(fn: (ctx: TContext) => void | Promise<void>): this {
    this.workflowSteps.push({
      type: 'custom',
      name: `tap_${this.workflowSteps.length}`,
      handler: async (ctx: TContext) => {
        await fn(ctx);
        return null;
      }
    });
    
    return this;
  }

  transform<TNewContext>(
    fn: (ctx: TContext) => TNewContext
  ): WorkflowDSL<TNewContext> {
    this.workflowSteps.push({
      type: 'custom',
      name: 'transform',
      handler: fn
    });
    
    return this as any;
  }

  // Metadata methods
  description(desc: string): this {
    this.config.metadata = this.config.metadata || {};
    this.config.metadata.description = desc;
    return this;
  }

  tag(tag: string): this {
    this._tags.add(tag);
    return this;
  }

  tags(tags: string[]): this {
    tags.forEach(tag => this._tags.add(tag));
    return this;
  }

  metadata(key: string, value: any): this {
    this.config.metadata = this.config.metadata || {};
    this.config.metadata[key] = value;
    return this;
  }

  // Private helper methods
  private async executeWithRetry(
    engine: WorkflowEngine,
    workflow: Workflow<TContext>,
    input?: Partial<TContext>
  ): Promise<TContext> {
    const config = this.retryConfig!;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= (config.maxAttempts || 3); attempt++) {
      try {
        const result = await engine.execute(input);
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Check if we should retry
        if (config.retryIf && !config.retryIf(lastError)) {
          throw lastError;
        }
        
        // Call retry callback if provided
        if (config.onRetry) {
          config.onRetry(lastError, attempt);
        }
        
        // Don't sleep after last attempt
        if (attempt < (config.maxAttempts || 3)) {
          const delay = this.calculateBackoff(attempt, config.backoff);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }

  private calculateBackoff(
    attempt: number,
    backoff?: 'linear' | 'exponential' | ((attempt: number) => number)
  ): number {
    if (typeof backoff === 'function') {
      return backoff(attempt);
    }
    
    switch (backoff) {
      case 'exponential':
        return Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      case 'linear':
      default:
        return attempt * 1000;
    }
  }

  private estimateStepDuration(step: DSLWorkflowStep): number {
    switch (step.type) {
      case 'prompt':
        return 2000; // 2 seconds for LLM call
      case 'agent':
        return (step.maxSteps || 5) * 3000; // 3 seconds per agent step
      case 'tool':
        return 1000; // 1 second for tool execution
      case 'parallel':
        // Max duration of parallel steps
        return Math.max(...(step.steps?.map(s => 
          this.estimateStepDuration(s as DSLWorkflowStep)
        ) || [0]));
      default:
        return 500; // 0.5 seconds for custom steps
    }
  }

  private calculateTotalDuration(
    steps: Array<{ estimatedDuration?: number }>,
    dependencies: Map<string, string[]>
  ): number {
    // Simple sum for now - could be optimized with critical path analysis
    return steps.reduce((total, step) => 
      total + (step.estimatedDuration || 0), 0
    );
  }

  private hasCycle(
    step: DSLWorkflowStep,
    visited: Set<string>,
    recursionStack: Set<string>
  ): boolean {
    visited.add(step.name);
    recursionStack.add(step.name);
    
    // Check sub-workflows
    if (step.type === 'workflow' && step.workflow) {
      for (const subStep of step.workflow.steps) {
        if (!visited.has(subStep.name)) {
          if (this.hasCycle(subStep, visited, recursionStack)) {
            return true;
          }
        } else if (recursionStack.has(subStep.name)) {
          return true;
        }
      }
    }
    
    recursionStack.delete(step.name);
    return false;
  }
}