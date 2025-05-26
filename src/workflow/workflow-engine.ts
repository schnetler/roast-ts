import { 
  WorkflowConfig, 
  StepDefinition, 
  LLMClient,
  LLMResponse,
  ToolCall
} from '../shared/types';
import { StateManager } from '../state/state-manager';
import { ToolRegistry } from '../tools/tool-registry';
import { StepExecutor } from './step-executor';

export class WorkflowEngine<TContext = any> {
  private stepExecutor: StepExecutor;

  constructor(
    private config: WorkflowConfig,
    private stateManager: StateManager,
    private toolRegistry: ToolRegistry,
    private llmClient?: LLMClient
  ) {
    this.validateConfig();
    this.stepExecutor = new StepExecutor(toolRegistry, llmClient);
  }

  async execute(input?: Partial<TContext>): Promise<TContext> {
    let context = this.initializeContext(input);

    // Initialize session if not already done
    try {
      this.stateManager.getState();
    } catch {
      await this.stateManager.createSession(this.config.name);
    }

    for (const step of this.config.steps) {
      try {
        const result = await this.stepExecutor.execute(step, context);
        
        // Update context with step result first
        if (step.type === 'parallel' && typeof result === 'object' && result !== null) {
          // For parallel steps, merge the results directly into context
          context = { ...context, ...result };
        } else {
          context = { ...context, [step.name]: result };
        }
        
        // Save step result to state manager with updated context
        await this.stateManager.saveStep(step.name, result, context);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Step "${step.name}" failed: ${message}`);
      }
    }

    return context;
  }

  private initializeContext(input?: Partial<TContext>): TContext {
    return (input || {}) as TContext;
  }

  private validateConfig(): void {
    if (!this.config || !this.config.name) {
      throw new Error('Invalid workflow configuration: missing name');
    }

    if (!Array.isArray(this.config.steps)) {
      throw new Error('Invalid workflow configuration: steps must be an array');
    }
  }
}