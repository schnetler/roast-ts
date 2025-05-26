import { LLMClient, CompletionRequest, CompletionResponse, CompletionChunk } from '@/shared/types';

export class MockLLMClient implements LLMClient {
  private responses: Map<string, CompletionResponse> = new Map();
  private streamResponses: Map<string, CompletionChunk[]> = new Map();

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const key = JSON.stringify(request);
    const response = this.responses.get(key);
    
    if (response) {
      return response;
    }
    
    // Default response
    return {
      id: 'test-completion-123',
      model: request.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Mock response for: ' + request.messages[request.messages.length - 1].content
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      }
    };
  }

  async *stream(request: CompletionRequest): AsyncIterableIterator<CompletionChunk> {
    const key = JSON.stringify(request);
    const chunks = this.streamResponses.get(key);
    
    if (chunks) {
      for (const chunk of chunks) {
        yield chunk;
      }
      return;
    }
    
    // Default streaming response
    const response = 'Mock streaming response';
    for (const char of response) {
      yield {
        id: 'test-stream-123',
        model: request.model,
        choices: [{
          index: 0,
          delta: {
            content: char
          },
          finish_reason: null
        }]
      };
    }
    
    // Final chunk
    yield {
      id: 'test-stream-123',
      model: request.model,
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop'
      }]
    };
  }

  // Test helper methods
  setResponse(request: Partial<CompletionRequest>, response: CompletionResponse): void {
    const key = JSON.stringify(request);
    this.responses.set(key, response);
  }

  setStreamResponse(request: Partial<CompletionRequest>, chunks: CompletionChunk[]): void {
    const key = JSON.stringify(request);
    this.streamResponses.set(key, chunks);
  }

  reset(): void {
    this.responses.clear();
    this.streamResponses.clear();
  }
}