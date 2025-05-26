import { 
  WorkflowBuilder, 
  WorkflowConfig, 
  Tool, 
  StepDefinition, 
  StepHandler,
  AgentConfig,
  ToolConfig,
  LLMClient
} from '../shared/types';
import { WorkflowEngine } from './workflow-engine';
import { StateManager } from '../state/state-manager';
import { ToolRegistry } from '../tools/tool-registry';

export function createWorkflow<T = {}>(name: string): WorkflowBuilder<T> {
  return new WorkflowBuilderImpl<T>(name);
}

class WorkflowBuilderImpl<TContext> implements WorkflowBuilder<TContext> {
  public readonly name: string;
  private config: Partial<WorkflowConfig> = {};
  private steps: StepDefinition[] = [];
  private toolMap = new Map<string, { tool: Tool<any, any>; config: any }>();
  private stepNames = new Set<string>();
  private stepCounter = 0;

  constructor(name: string) {
    this.name = name;
    this.config.name = name;
  }

  tool<K extends string, P, R>(
    name: K,
    tool: Tool<P, R>,
    config?: any
  ): WorkflowBuilder<TContext & Record<K, R>> {
    if (!tool || (typeof tool.handler !== 'function' && typeof tool.execute !== 'function')) {
      throw new Error(`Invalid tool: ${name}`);
    }

    if (this.toolMap.has(name)) {
      throw new Error(`Tool "${name}" is already registered`);
    }

    this.toolMap.set(name, { tool, config: config || {} });
    
    // If config is provided, create a step that executes the tool
    // Otherwise, just register the tool for use by other steps
    if (config !== undefined) {
      const step: StepDefinition = {
        type: 'step',
        name,
        handler: async (context) => {
          const execute = tool.execute || tool.handler;
          if (!execute) {
            throw new Error(`Tool ${name} has no execute or handler method`);
          }
          return execute(config, {
            workflowId: this.name,
            stepId: name,
            logger: console as any
          });
        }
      };
      
      this.steps.push(step);
      this.stepNames.add(name);
    }
    
    return this as any;
  }

  model(modelName: string, options?: any): WorkflowBuilder<TContext> {
    this.config.model = modelName;
    if (options) {
      this.config.modelOptions = options;
    }
    return this;
  }

  prompt<K extends string = "prompt">(
    template: string | ((ctx: TContext) => string),
    name?: K
  ): WorkflowBuilder<TContext & Record<K, string>> {
    const stepName = name || this.generateStepName('prompt');
    this.validateStepName(stepName);

    const step: StepDefinition = {
      type: 'prompt',
      name: stepName,
      template
    };

    this.steps.push(step);
    this.stepNames.add(stepName);
    return this as any;
  }

  step<K extends string, R>(
    name: K,
    handler: StepHandler<TContext, R>
  ): WorkflowBuilder<TContext & Record<K, R>> {
    this.validateStepName(name);

    const step: StepDefinition = {
      type: 'step',
      name,
      handler
    };

    this.steps.push(step);
    this.stepNames.add(name);
    return this as any;
  }

  parallel<T extends Record<string, StepHandler<TContext, any>>>(
    handlers: T
  ): WorkflowBuilder<TContext & { [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
    const parallelSteps: StepDefinition[] = Object.entries(handlers).map(([name, handler]) => ({
      type: 'step',
      name,
      handler: handler as StepHandler<TContext, any>
    }));

    const parallelStep: StepDefinition = {
      type: 'parallel',
      name: this.generateStepName('parallel'),
      steps: parallelSteps
    };

    this.steps.push(parallelStep);
    return this as any;
  }

  agent<K extends string>(
    name: K,
    config: AgentConfig<TContext>
  ): WorkflowBuilder<TContext & Record<K, any>> {
    this.validateStepName(name);

    const step: StepDefinition = {
      type: 'agent',
      name,
      agentConfig: config
    };

    this.steps.push(step);
    this.stepNames.add(name);
    return this as any;
  }

  buildConfig(): WorkflowConfig {
    const config: WorkflowConfig = {
      name: this.config.name!,
      model: this.config.model || 'gpt-4',
      modelOptions: this.config.modelOptions,
      steps: [...this.steps],
      tools: new Map(this.toolMap),
      createEngine: (stateManager, toolRegistry, llmClient) => {
        // Register tools with the registry
        for (const [name, { tool }] of this.toolMap) {
          const toolWithExecute = {
            ...tool,
            name: tool.name || name, // Use tool's name if provided, otherwise use map key
            execute: tool.execute || tool.handler
          };
          toolRegistry.register(toolWithExecute);
        }
        
        return new WorkflowEngine(config, stateManager, toolRegistry, llmClient);
      }
    };
    
    return config;
  }

  async run(input?: Partial<TContext>): Promise<TContext> {
    const config = this.buildConfig();
    const { FileStateRepository } = await import('../state');
    const stateManager = new StateManager(new FileStateRepository());
    const toolRegistry = new ToolRegistry();

    // Register tools with the registry
    for (const [name, { tool, config: toolConfig }] of config.tools || new Map()) {
      const toolWithExecute = {
        ...tool,
        name: tool.name || name,
        execute: tool.execute || tool.handler
      };
      toolRegistry.register(toolWithExecute);
    }

    // Create a mock LLM client if one is needed for prompt or agent steps
    const needsLLMClient = config.steps.some(step => 
      step.type === 'prompt' || step.type === 'agent'
    );
    
    const llmClient = needsLLMClient ? await this.createLLMClient(config) : undefined;
    
    const engine = new WorkflowEngine<TContext>(config, stateManager, toolRegistry, llmClient);
    return engine.execute(input);
  }

  private generateStepName(prefix: string): string {
    return `${prefix}_${++this.stepCounter}`;
  }

  private validateStepName(name: string): void {
    if (this.stepNames.has(name)) {
      throw new Error(`Step "${name}" already exists`);
    }
  }

  private async createLLMClient(config: WorkflowConfig): Promise<LLMClient | undefined> {
    // TODO: Create actual LLM client based on config.model
    // For now, return undefined to let tests mock it
    return undefined;
  }
}