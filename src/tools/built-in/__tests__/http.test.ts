import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { z } from 'zod';
import { createHttpTool, HttpToolConfig, HttpToolMethod } from '../http';
import { ToolContext } from '../../tool-executor';

// Mock node-fetch
jest.mock('node-fetch');
import fetch, { Response, Headers } from 'node-fetch';

const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

// Helper to create mock responses
const createMockResponse = (data: any, options: {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  contentType?: string;
} = {}) => {
  const {
    status = 200,
    statusText = 'OK',
    headers = {},
    contentType = 'application/json'
  } = options;

  const mockHeaders = new Headers({
    'content-type': contentType,
    ...headers
  });

  const isJson = contentType.includes('application/json');
  const responseText = isJson ? JSON.stringify(data) : String(data);

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: {
      ...mockHeaders,
      get: jest.fn((key: string) => {
        if (key.toLowerCase() === 'content-type') return contentType;
        return headers[key] || null;
      }),
      forEach: jest.fn((callback: (value: string, key: string) => void) => {
        callback(contentType, 'content-type');
        Object.entries(headers).forEach(([k, v]) => callback(v, k));
      })
    },
    json: jest.fn().mockImplementation(() => {
      if (isJson) return Promise.resolve(data);
      return Promise.reject(new Error('Invalid JSON'));
    }),
    text: jest.fn().mockResolvedValue(responseText),
    buffer: jest.fn().mockResolvedValue(Buffer.from(responseText))
  } as any;
};

describe('HTTP Tool', () => {
  const mockContext: ToolContext = {
    workflowId: 'test-workflow',
    stepId: 'test-step',
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as any,
    metadata: {}
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createHttpTool', () => {
    it('should create a basic HTTP tool with minimal config', () => {
      const tool = createHttpTool({
        name: 'simple-api',
        baseURL: 'https://api.example.com'
      });

      expect(tool.name).toBe('simple-api');
      expect(tool.category).toBe('network');
      expect(tool.description).toContain('HTTP requests');
      expect(tool.cacheable).toBe(true);
      expect(tool.retryable).toEqual({ maxAttempts: 3, backoff: 'exponential' });
    });

    it('should create HTTP tool with custom configuration', () => {
      const config: HttpToolConfig = {
        name: 'outlook',
        baseURL: 'https://graph.microsoft.com/v1.0',
        description: 'Microsoft Graph API client',
        auth: {
          type: 'bearer',
          token: 'test-token'
        },
        headers: {
          'X-Custom-Header': 'custom-value'
        },
        timeout: 5000,
        retryConfig: {
          maxAttempts: 5,
          backoff: 'linear'
        }
      };

      const tool = createHttpTool(config);

      expect(tool.name).toBe('outlook');
      expect(tool.description).toBe('Microsoft Graph API client');
      expect(tool.timeout).toBe(5000);
      expect(tool.retryable).toEqual({ maxAttempts: 5, backoff: 'linear' });
    });

    it('should validate required configuration', () => {
      expect(() => createHttpTool({} as any)).toThrow('name is required');
      expect(() => createHttpTool({ name: 'test' } as any)).toThrow('baseURL is required');
    });

    it('should validate baseURL format', () => {
      expect(() => createHttpTool({
        name: 'test',
        baseURL: 'not-a-url'
      })).toThrow('Invalid baseURL');
    });
  });

  describe('HTTP Tool Execution', () => {
    let httpTool: ReturnType<typeof createHttpTool>;

    beforeEach(() => {
      httpTool = createHttpTool({
        name: 'test-api',
        baseURL: 'https://api.example.com',
        auth: {
          type: 'bearer',
          token: 'test-token'
        },
        headers: {
          'X-API-Version': '1.0'
        }
      });
    });

    it('should execute GET request successfully', async () => {
      const mockResponse = {
        id: 1,
        name: 'Test Item'
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await httpTool.execute!({
        endpoint: '/items/1',
        method: 'GET'
      }, mockContext);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/items/1',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'X-API-Version': '1.0'
          })
        })
      );

      expect(result).toEqual({
        status: 200,
        statusText: 'OK',
        data: mockResponse,
        headers: { 'content-type': 'application/json' },
        url: 'https://api.example.com/items/1',
        method: 'GET'
      });
    });

    it('should execute POST request with body', async () => {
      const requestBody = { name: 'New Item', value: 100 };
      const mockResponse = { id: 2, ...requestBody };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse, { status: 201, statusText: 'Created' }));

      const result = await httpTool.execute!({
        endpoint: '/items',
        method: 'POST',
        body: requestBody
      }, mockContext);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/items',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestBody),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token'
          })
        })
      );

      expect(result.status).toBe(201);
      expect(result.data).toEqual(mockResponse);
    });

    it('should handle query parameters', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse([]));

      await httpTool.execute!({
        endpoint: '/items',
        method: 'GET',
        query: {
          filter: 'active',
          limit: 10,
          tags: ['a', 'b']
        }
      }, mockContext);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/items?filter=active&limit=10&tags=a&tags=b',
        expect.any(Object)
      );
    });

    it('should merge custom headers with default headers', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await httpTool.execute!({
        endpoint: '/items',
        method: 'GET',
        headers: {
          'X-Request-ID': '12345',
          'X-API-Version': '2.0' // Override default
        }
      }, mockContext);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Request-ID': '12345',
            'X-API-Version': '2.0', // Overridden
            'Authorization': 'Bearer test-token' // Still included
          })
        })
      );
    });

    it('should handle non-JSON responses', async () => {
      const textResponse = 'Plain text response';
      mockFetch.mockResolvedValueOnce(createMockResponse(textResponse, { contentType: 'text/plain' }));

      const result = await httpTool.execute!({
        endpoint: '/text',
        method: 'GET'
      }, mockContext);

      expect(result.data).toBe(textResponse);
    });

    it('should handle HTTP errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ error: 'Not found' }, { status: 404, statusText: 'Not Found' }));

      await expect(httpTool.execute!({
        endpoint: '/items/999',
        method: 'GET'
      }, mockContext)).rejects.toThrow('HTTP 404: Not found');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(httpTool.execute!({
        endpoint: '/items',
        method: 'GET'
      }, mockContext)).rejects.toThrow('Network error');
    });

    it('should respect timeout configuration', async () => {
      const timeoutTool = createHttpTool({
        name: 'timeout-api',
        baseURL: 'https://api.example.com',
        timeout: 100
      });

      // Simulate timeout - the fetch will never resolve and AbortController will cancel it
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => {
          // This promise will be aborted by the controller
          setTimeout(() => reject(new Error('The operation was aborted')), 200);
        })
      );

      await expect(timeoutTool.execute!({
        endpoint: '/slow',
        method: 'GET'
      }, mockContext)).rejects.toThrow('Request timeout');
    });

    it('should support different auth types', async () => {
      // Basic auth
      const basicAuthTool = createHttpTool({
        name: 'basic-api',
        baseURL: 'https://api.example.com',
        auth: {
          type: 'basic',
          username: 'user',
          password: 'pass'
        }
      });

      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await basicAuthTool.execute!({ endpoint: '/', method: 'GET' }, mockContext);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Basic ${Buffer.from('user:pass').toString('base64')}`
          })
        })
      );

      // API Key auth
      const apiKeyTool = createHttpTool({
        name: 'apikey-api',
        baseURL: 'https://api.example.com',
        auth: {
          type: 'apiKey',
          key: 'secret-key',
          in: 'header',
          name: 'X-API-Key'
        }
      });

      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await apiKeyTool.execute!({ endpoint: '/', method: 'GET' }, mockContext);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'secret-key'
          })
        })
      );
    });

    it('should support OAuth2 auth with token refresh', async () => {
      const oauth2Tool = createHttpTool({
        name: 'oauth2-api',
        baseURL: 'https://api.example.com',
        auth: {
          type: 'oauth2',
          clientId: 'client-id',
          clientSecret: 'client-secret',
          tokenUrl: 'https://auth.example.com/token',
          scopes: ['read', 'write']
        }
      });

      // Mock token request
      mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'new-token', expires_in: 3600 }));

      // Mock actual API request
      mockFetch.mockResolvedValueOnce(createMockResponse({ result: 'success' }));

      const result = await oauth2Tool.execute!({ endpoint: '/data', method: 'GET' }, mockContext);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(1, 
        'https://auth.example.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded'
          })
        })
      );
      expect(result.data).toEqual({ result: 'success' });
    });

    it('should handle form data requests', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ uploaded: true }));

      await httpTool.execute!({
        endpoint: '/upload',
        method: 'POST',
        body: { file: 'data' },
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }, mockContext);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'multipart/form-data'
          })
        })
      );
    });
  });

  describe('HTTP Tool with Endpoints', () => {
    it('should create predefined endpoint methods', () => {
      const tool = createHttpTool({
        name: 'api-with-endpoints',
        baseURL: 'https://api.example.com',
        endpoints: {
          getUser: {
            path: '/users/{id}',
            method: 'GET',
            description: 'Get user by ID'
          },
          createUser: {
            path: '/users',
            method: 'POST',
            description: 'Create a new user'
          },
          searchUsers: {
            path: '/users/search',
            method: 'GET',
            description: 'Search users'
          }
        }
      });

      expect(tool.endpoints).toBeDefined();
      expect(tool.endpoints!.getUser).toBeDefined();
      expect(tool.endpoints!.createUser).toBeDefined();
      expect(tool.endpoints!.searchUsers).toBeDefined();
    });

    it('should execute endpoint with path parameters', async () => {
      const tool = createHttpTool({
        name: 'endpoint-api',
        baseURL: 'https://api.example.com',
        endpoints: {
          getItem: {
            path: '/items/{id}/details/{type}',
            method: 'GET'
          }
        }
      });

      mockFetch.mockResolvedValueOnce(createMockResponse({ id: 123, type: 'full' }));

      const result = await tool.endpoints!.getItem({
        pathParams: { id: '123', type: 'full' }
      }, mockContext);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/items/123/details/full',
        expect.any(Object)
      );
      expect(result.data).toEqual({ id: 123, type: 'full' });
    });

    it('should validate required path parameters', async () => {
      const tool = createHttpTool({
        name: 'endpoint-api',
        baseURL: 'https://api.example.com',
        endpoints: {
          getItem: {
            path: '/items/{id}',
            method: 'GET'
          }
        }
      });

      await expect(tool.endpoints!.getItem({}, mockContext))
        .rejects.toThrow('Missing required path parameter: id');
    });
  });

  describe('HTTP Tool Parameter Schema', () => {
    it('should generate correct parameter schema', () => {
      const tool = createHttpTool({
        name: 'schema-api',
        baseURL: 'https://api.example.com'
      });

      const schema = tool.parameters as z.ZodSchema<any>;
      const parsed = schema.parse({
        endpoint: '/test',
        method: 'POST',
        body: { key: 'value' },
        headers: { 'X-Custom': 'header' },
        query: { filter: 'active' }
      });

      expect(parsed).toEqual({
        endpoint: '/test',
        method: 'POST',
        body: { key: 'value' },
        headers: { 'X-Custom': 'header' },
        query: { filter: 'active' }
      });
    });

    it('should validate method enum', () => {
      const tool = createHttpTool({
        name: 'method-api',
        baseURL: 'https://api.example.com'
      });

      const schema = tool.parameters as z.ZodSchema<any>;
      
      expect(() => schema.parse({
        endpoint: '/test',
        method: 'INVALID'
      })).toThrow();
    });
  });

  describe('Response Transformation', () => {
    it('should support custom response transformer', async () => {
      const tool = createHttpTool({
        name: 'transform-api',
        baseURL: 'https://api.example.com',
        responseTransformer: (response) => {
          return {
            ...response,
            transformed: true,
            timestamp: new Date().toISOString()
          };
        }
      });

      mockFetch.mockResolvedValueOnce(createMockResponse({ original: true }));

      const result = await tool.execute!({
        endpoint: '/data',
        method: 'GET'
      }, mockContext);

      expect(result.transformed).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(result.data).toEqual({ original: true });
    });
  });

  describe('Request Interceptor', () => {
    it('should support request interceptor', async () => {
      let interceptedConfig: any;
      
      const tool = createHttpTool({
        name: 'intercept-api',
        baseURL: 'https://api.example.com',
        requestInterceptor: (config) => {
          interceptedConfig = { ...config };
          return {
            ...config,
            headers: {
              ...config.headers,
              'X-Intercepted': 'true'
            }
          };
        }
      });

      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await tool.execute!({
        endpoint: '/data',
        method: 'GET'
      }, mockContext);

      expect(interceptedConfig).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Intercepted': 'true'
          })
        })
      );
    });
  });
});