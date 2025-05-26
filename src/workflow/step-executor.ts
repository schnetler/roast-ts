import { 
  StepDefinition, 
  LLMClient, 
  LLMResponse, 
  ToolCall,
  AgentConfig
} from '../shared/types';
import { ToolRegistry } from '../tools/tool-registry';

export class StepExecutor {
  constructor(
    private toolRegistry: ToolRegistry,
    private llmClient?: LLMClient
  ) {}

  async execute<T>(step: StepDefinition, context: T): Promise<any> {
    switch (step.type) {
      case 'prompt':
        return this.executePromptStep(step, context);
      case 'step':
        return this.executeCustomStep(step, context);
      case 'parallel':
        if (step.type !== 'parallel' || !step.steps) {
          throw new Error('Invalid parallel step');
        }
        return this.executeParallelSteps(step.steps, context);
      case 'agent':
        return this.executeAgentStep(step, context);
      default:
        throw new Error(`Unsupported step type: ${(step as any).type}`);
    }
  }

  private async executePromptStep<T>(step: StepDefinition, context: T): Promise<string> {
    if (step.type !== 'prompt') {
      throw new Error('Not a prompt step');
    }
    
    if (!this.llmClient) {
      throw new Error('LLM client is required for prompt steps');
    }

    // Resolve template
    const prompt = typeof step.template === 'function' 
      ? step.template(context)
      : step.template!;

    // Get available tools
    const availableTools = this.getAvailableTools();

    let messages: any[] = [{ role: 'user', content: prompt }];
    let response: LLMResponse;

    // Tool calling loop
    while (true) {
      response = await this.llmClient.complete({
        messages,
        tools: availableTools
      });

      if (!response.toolCalls || response.toolCalls.length === 0) {
        break;
      }

      // Execute tool calls
      const toolResults = await this.executeToolCalls(response.toolCalls);
      
      // Add assistant message and tool results to conversation
      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls
      });

      for (const [index, toolCall] of response.toolCalls.entries()) {
        messages.push({
          role: 'tool',
          content: JSON.stringify(toolResults[index]),
          toolCallId: toolCall.id
        });
      }
    }

    return response.content;
  }

  private async executeCustomStep<T>(step: StepDefinition, context: T): Promise<any> {
    if (step.type !== 'step') {
      throw new Error('Not a custom step');
    }
    
    if (!step.handler) {
      throw new Error(`Step "${step.name}" is missing handler`);
    }

    return step.handler(context);
  }

  private async executeParallelSteps<T>(steps: StepDefinition[], context: T): Promise<Record<string, any>> {
    // Create isolated context copies for each parallel step
    const results = await Promise.all(
      steps.map(step => this.execute(step, { ...context }))
    );

    // Combine results by step name
    return steps.reduce((acc, step, index) => ({
      ...acc,
      [step.name]: results[index]
    }), {});
  }

  private async executeAgentStep<T>(step: StepDefinition, context: T): Promise<any> {
    if (step.type !== 'agent') {
      throw new Error('Not an agent step');
    }
    
    if (!this.llmClient) {
      throw new Error('LLM client is required for agent steps');
    }

    const config = step.agentConfig!;
    let stepCount = 0;
    let agentContext = { ...context };

    // Resolve initial prompt
    const initialPrompt = typeof config.prompt === 'function'
      ? config.prompt(context)
      : config.prompt;

    let messages: any[] = [{ role: 'user', content: initialPrompt }];

    // Get tools available to agent
    const agentTools = this.getAgentTools(config.tools);

    while (stepCount < config.maxSteps) {
      const response = await this.llmClient.complete({
        messages,
        tools: agentTools
      });

      if (!response.toolCalls || response.toolCalls.length === 0) {
        // Agent finished without tool calls
        return response.content;
      }

      // Execute tool calls
      const toolResults = await this.executeToolCalls(response.toolCalls);

      // Update conversation history
      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls
      });

      for (const [index, toolCall] of response.toolCalls.entries()) {
        messages.push({
          role: 'tool',
          content: JSON.stringify(toolResults[index]),
          toolCallId: toolCall.id
        });
      }

      stepCount++;
    }

    // Handle max steps reached
    return this.handleAgentMaxSteps(config.fallback, messages);
  }

  private async executeToolCalls(toolCalls: ToolCall[]): Promise<any[]> {
    const results = [];

    for (const toolCall of toolCalls) {
      try {
        const tool = this.toolRegistry.get(toolCall.function.name);
        if (!tool) {
          throw new Error(`Tool not found: ${toolCall.function.name}`);
        }

        const params = JSON.parse(toolCall.function.arguments);
        const executeFunction = tool.execute || tool.handler;
        if (!executeFunction) {
          throw new Error(`Tool ${tool.name} has no execute or handler function`);
        }
        
        const result = await executeFunction(params, {
          workflowId: 'workflow',
          stepId: 'step',
          logger: console as any
        });
        results.push(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Tool execution failed: ${message}`);
      }
    }

    return results;
  }

  private getAvailableTools(): any[] {
    const tools = this.toolRegistry.getAll();
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.parameters || {}
      }
    }));
  }

  private getAgentTools(toolNames?: string[]): any[] {
    if (!toolNames || toolNames.length === 0) {
      return [];
    }

    return toolNames.map(name => {
      const tool = this.toolRegistry.get(name);
      if (!tool) {
        throw new Error(`Agent tool not found: ${name}`);
      }

      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.parameters || {}
        }
      };
    });
  }

  private async handleAgentMaxSteps(fallback: AgentConfig<any>['fallback'], messages: any[]): Promise<any> {
    switch (fallback) {
      case 'error':
        throw new Error('Agent exceeded maximum steps');
      
      case 'return_partial':
        return `Agent reached maximum steps. Partial results from ${messages.length} messages.`;
      
      case 'summarize':
        if (!this.llmClient) {
          throw new Error('LLM client required for summarize fallback');
        }
        
        const summaryResponse = await this.llmClient.complete({
          messages: [
            ...messages,
            {
              role: 'user',
              content: 'Summarize the conversation and provide the best answer you can based on what we\'ve discussed.'
            }
          ],
          tools: []
        });
        
        return summaryResponse.content;
      
      default:
        throw new Error(`Unknown fallback strategy: ${fallback}`);
    }
  }
}