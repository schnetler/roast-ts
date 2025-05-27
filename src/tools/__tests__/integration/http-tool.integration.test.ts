import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createHttpTool } from '../../built-in/http';
import { ToolExecutor } from '../../tool-executor';
import { ToolRegistry } from '../../tool-registry';
import { Logger } from '../../../shared/types';

// Mock node-fetch
jest.mock('node-fetch');
import fetch from 'node-fetch';

const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('HTTP Tool Integration', () => {
  let toolRegistry: ToolRegistry;
  let toolExecutor: ToolExecutor;
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as any;
    toolRegistry = new ToolRegistry();
    toolExecutor = new ToolExecutor();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should integrate HTTP tool with workflow', async () => {
    // Create and register an HTTP tool
    const apiTool = createHttpTool({
      name: 'jsonplaceholder',
      baseURL: 'https://jsonplaceholder.typicode.com',
      description: 'JSONPlaceholder API for testing',
      headers: {
        'Accept': 'application/json'
      },
      retryConfig: {
        maxAttempts: 2,
        backoff: 'exponential'
      }
    });

    toolRegistry.register(apiTool);

    // Mock API response
    const mockPost = { id: 1, title: 'Test Post', body: 'Test content', userId: 1 };
    (mockFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: jest.fn(() => 'application/json'),
        forEach: jest.fn()
      },
      json: jest.fn().mockResolvedValue(mockPost),
      text: jest.fn().mockResolvedValue(JSON.stringify(mockPost)),
      buffer: jest.fn().mockResolvedValue(Buffer.from(JSON.stringify(mockPost)))
    });

    // Execute the tool
    const context = {
      workflowId: 'test-workflow',
      stepId: 'fetch-post',
      logger
    };

    const result = await toolExecutor.execute(
      apiTool,
      {
        endpoint: '/posts/1',
        method: 'GET'
      },
      context
    );

    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({
      status: 200,
      data: mockPost
    });
  });

  it('should handle HTTP tool with endpoints', async () => {
    // Create HTTP tool with predefined endpoints
    const githubTool = createHttpTool({
      name: 'github',
      baseURL: 'https://api.github.com',
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      },
      endpoints: {
        getUser: {
          path: '/users/{username}',
          method: 'GET',
          description: 'Get GitHub user information'
        },
        getUserRepos: {
          path: '/users/{username}/repos',
          method: 'GET',
          description: 'Get user repositories'
        }
      }
    });

    toolRegistry.register(githubTool);

    // Mock GitHub API response
    const mockUser = { login: 'octocat', id: 1, name: 'The Octocat' };
    (mockFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: jest.fn(() => 'application/json'),
        forEach: jest.fn()
      },
      json: jest.fn().mockResolvedValue(mockUser),
      text: jest.fn().mockResolvedValue(JSON.stringify(mockUser)),
      buffer: jest.fn().mockResolvedValue(Buffer.from(JSON.stringify(mockUser)))
    });

    // Use endpoint method
    const context = {
      workflowId: 'test-workflow',
      stepId: 'get-user',
      logger
    };

    const result = await githubTool.endpoints!.getUser(
      { pathParams: { username: 'octocat' } },
      context
    );

    expect(result.status).toBe(200);
    expect(result.data).toEqual(mockUser);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/users/octocat',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Accept': 'application/vnd.github.v3+json'
        })
      })
    );
  });

  it('should handle authentication types', async () => {
    // Test Bearer token auth
    const bearerTool = createHttpTool({
      name: 'api-bearer',
      baseURL: 'https://api.example.com',
      auth: {
        type: 'bearer',
        token: 'secret-token-123'
      }
    });

    toolRegistry.register(bearerTool);

    (mockFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: jest.fn(() => 'application/json'),
        forEach: jest.fn()
      },
      json: jest.fn().mockResolvedValue({ success: true }),
      text: jest.fn().mockResolvedValue('{"success":true}'),
      buffer: jest.fn().mockResolvedValue(Buffer.from('{"success":true}'))
    });

    const context = {
      workflowId: 'test-workflow',
      stepId: 'auth-test',
      logger
    };

    await toolExecutor.execute(
      bearerTool,
      { endpoint: '/protected', method: 'GET' },
      context
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/protected',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer secret-token-123'
        })
      })
    );
  });

  it('should handle request transformation', async () => {
    const transformTool = createHttpTool({
      name: 'transform-api',
      baseURL: 'https://api.example.com',
      requestInterceptor: (config) => {
        // Add timestamp to all requests
        const url = new URL(config.url);
        url.searchParams.set('timestamp', Date.now().toString());
        return {
          ...config,
          url: url.toString(),
          headers: {
            ...config.headers,
            'X-Request-Time': new Date().toISOString()
          }
        };
      },
      responseTransformer: (response) => {
        // Add metadata to response
        return {
          ...response,
          metadata: {
            processedAt: new Date().toISOString(),
            took: 100
          }
        };
      }
    });

    toolRegistry.register(transformTool);

    (mockFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: jest.fn(() => 'application/json'),
        forEach: jest.fn()
      },
      json: jest.fn().mockResolvedValue({ data: 'test' }),
      text: jest.fn().mockResolvedValue('{"data":"test"}'),
      buffer: jest.fn().mockResolvedValue(Buffer.from('{"data":"test"}'))
    });

    const context = {
      workflowId: 'test-workflow',
      stepId: 'transform-test',
      logger
    };

    const result = await toolExecutor.execute(
      transformTool,
      { endpoint: '/data', method: 'GET' },
      context
    );

    // Check request was intercepted
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('timestamp='),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Request-Time': expect.any(String)
        })
      })
    );

    // Check response was transformed
    expect(result.result).toHaveProperty('metadata');
    expect((result.result as any).metadata).toMatchObject({
      processedAt: expect.any(String),
      took: 100
    });
  });

  it('should handle errors and retries', async () => {
    const retryTool = createHttpTool({
      name: 'retry-api',
      baseURL: 'https://api.example.com',
      retryConfig: {
        maxAttempts: 3,
        backoff: 'exponential'
      }
    });

    toolRegistry.register(retryTool);

    // First two attempts fail, third succeeds
    (mockFetch as any)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: jest.fn(() => 'application/json'),
          forEach: jest.fn()
        },
        json: jest.fn().mockResolvedValue({ retry: 'success' }),
        text: jest.fn().mockResolvedValue('{"retry":"success"}'),
        buffer: jest.fn().mockResolvedValue(Buffer.from('{"retry":"success"}'))
      });

    const context = {
      workflowId: 'test-workflow',
      stepId: 'retry-test',
      logger
    };

    // Enable retry middleware
    toolExecutor.useRetry();

    const result = await toolExecutor.execute(
      retryTool,
      { endpoint: '/flaky', method: 'GET' },
      context
    );

    expect(result.success).toBe(true);
    expect(result.result!.data).toEqual({ retry: 'success' });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});