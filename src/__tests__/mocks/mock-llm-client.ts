import { LLMClient, LLMRequest, LLMResponse, LLMChunk } from '@/shared/types';

export class MockLLMClient implements LLMClient {
  private responses: Map<string, LLMResponse> = new Map();
  private streamResponses: Map<string, LLMChunk[]> = new Map();

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const key = JSON.stringify(request);
    const response = this.responses.get(key);
    
    if (response) {
      return response;
    }
    
    // Default response
    return {
      content: 'Mock response for: ' + request.messages[request.messages.length - 1].content,
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      }
    };
  }

  async *stream(request: LLMRequest): AsyncIterableIterator<LLMChunk> {
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
        content: char,
        done: false
      };
    }
    
    // Final chunk
    yield {
      content: '',
      done: true
    };
  }

  // Test helper methods
  setResponse(request: Partial<LLMRequest>, response: LLMResponse): void {
    const key = JSON.stringify(request);
    this.responses.set(key, response);
  }

  setStreamResponse(request: Partial<LLMRequest>, chunks: LLMChunk[]): void {
    const key = JSON.stringify(request);
    this.streamResponses.set(key, chunks);
  }

  reset(): void {
    this.responses.clear();
    this.streamResponses.clear();
  }
}