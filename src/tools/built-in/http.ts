import { z } from 'zod';
import fetch, { RequestInit, Response } from 'node-fetch';
import { ToolBuilder } from '../tool-builder';
import { Tool } from '../../shared/types';
import { ToolContext } from '../tool-executor';
import AbortController from 'abort-controller';

export type HttpToolMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface HttpAuthConfig {
  type: 'bearer' | 'basic' | 'apiKey' | 'oauth2';
  // Bearer token auth
  token?: string;
  // Basic auth
  username?: string;
  password?: string;
  // API Key auth
  key?: string;
  in?: 'header' | 'query';
  name?: string;
  // OAuth2
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  scopes?: string[];
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface HttpEndpointConfig {
  path: string;
  method: HttpToolMethod;
  description?: string;
  headers?: Record<string, string>;
  defaultQuery?: Record<string, any>;
}

export interface HttpToolConfig {
  name: string;
  baseURL: string;
  description?: string;
  auth?: HttpAuthConfig;
  headers?: Record<string, string>;
  timeout?: number;
  retryConfig?: {
    maxAttempts: number;
    backoff?: 'linear' | 'exponential';
  };
  endpoints?: Record<string, HttpEndpointConfig>;
  responseTransformer?: (response: HttpResponse) => any;
  requestInterceptor?: (config: RequestConfig) => RequestConfig;
}

export interface HttpRequestParams {
  endpoint: string;
  method?: HttpToolMethod;
  headers?: Record<string, string>;
  query?: Record<string, any>;
  body?: any;
  timeout?: number;
}

export interface HttpEndpointParams {
  pathParams?: Record<string, string>;
  query?: Record<string, any>;
  body?: any;
  headers?: Record<string, string>;
}

export interface HttpResponse {
  status: number;
  statusText?: string;
  headers: Record<string, string>;
  data: any;
  url: string;
  method: string;
}

interface RequestConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeout?: number;
}

const httpRequestSchema = z.object({
  endpoint: z.string().describe('API endpoint path (e.g., /users/123)'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
    .optional()
    .default('GET')
    .describe('HTTP method'),
  headers: z.record(z.string())
    .optional()
    .describe('Additional HTTP headers'),
  query: z.record(z.any())
    .optional()
    .describe('Query parameters'),
  body: z.any()
    .optional()
    .describe('Request body (will be JSON stringified)'),
  timeout: z.number()
    .optional()
    .describe('Request timeout in milliseconds')
});

export function createHttpTool(config: HttpToolConfig): Tool<HttpRequestParams, HttpResponse> & {
  endpoints?: Record<string, (params: HttpEndpointParams, context?: ToolContext) => Promise<HttpResponse>>;
} {
  // Validate config
  if (!config.name) {
    throw new Error('name is required');
  }
  if (!config.baseURL) {
    throw new Error('baseURL is required');
  }
  
  // Validate URL format
  try {
    new URL(config.baseURL);
  } catch {
    throw new Error('Invalid baseURL format');
  }

  // Build auth headers
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    if (!config.auth) return {};

    switch (config.auth.type) {
      case 'bearer':
        if (!config.auth.token) throw new Error('Bearer token required');
        return { 'Authorization': `Bearer ${config.auth.token}` };
      
      case 'basic':
        if (!config.auth.username || !config.auth.password) {
          throw new Error('Username and password required for basic auth');
        }
        const credentials = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64');
        return { 'Authorization': `Basic ${credentials}` };
      
      case 'apiKey':
        if (!config.auth.key || !config.auth.name) {
          throw new Error('API key and name required');
        }
        if (config.auth.in === 'header') {
          return { [config.auth.name]: config.auth.key };
        }
        return {}; // Query param handled elsewhere
      
      case 'oauth2':
        // Simplified OAuth2 - in real implementation would handle token refresh
        if (config.auth.accessToken) {
          return { 'Authorization': `Bearer ${config.auth.accessToken}` };
        }
        // Token refresh logic would go here
        return await refreshOAuth2Token(config.auth);
      
      default:
        return {};
    }
  };

  // OAuth2 token refresh (simplified)
  const refreshOAuth2Token = async (auth: HttpAuthConfig): Promise<Record<string, string>> => {
    if (!auth.clientId || !auth.clientSecret || !auth.tokenUrl) {
      throw new Error('OAuth2 configuration incomplete');
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: auth.clientId,
      client_secret: auth.clientSecret,
      scope: auth.scopes?.join(' ') || ''
    });

    const response = await fetch(auth.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      throw new Error(`OAuth2 token refresh failed: ${response.statusText}`);
    }

    const data = await response.json() as any;
    auth.accessToken = data.access_token;
    auth.expiresAt = Date.now() + (data.expires_in * 1000);

    return { 'Authorization': `Bearer ${auth.accessToken}` };
  };

  // Build query string
  const buildQueryString = (params: Record<string, any>): string => {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => searchParams.append(key, String(v)));
      } else if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });

    // Add API key to query if configured
    if (config.auth?.type === 'apiKey' && config.auth.in === 'query' && config.auth.key && config.auth.name) {
      searchParams.append(config.auth.name, config.auth.key);
    }

    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : '';
  };

  // Main execute function
  const executeRequest = async (params: HttpRequestParams, context?: ToolContext): Promise<HttpResponse> => {
    const url = new URL(params.endpoint, config.baseURL);
    if (params.query) {
      url.search = buildQueryString(params.query);
    }

    // Build headers
    const authHeaders = await getAuthHeaders();
    const headers: Record<string, string> = {
      ...config.headers,
      ...authHeaders,
      ...params.headers
    };

    // Set content-type for JSON body
    if (params.body && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Build request config
    let requestConfig: RequestConfig = {
      url: url.toString(),
      method: params.method || 'GET',
      headers,
      timeout: params.timeout || config.timeout || 30000
    };

    // Add body
    if (params.body) {
      if (headers['Content-Type']?.includes('application/json')) {
        requestConfig.body = JSON.stringify(params.body);
      } else if (headers['Content-Type']?.includes('application/x-www-form-urlencoded')) {
        requestConfig.body = new URLSearchParams(params.body).toString();
      } else {
        // For multipart/form-data or other types, pass as-is
        requestConfig.body = params.body;
      }
    }

    // Apply request interceptor
    if (config.requestInterceptor) {
      requestConfig = config.requestInterceptor(requestConfig);
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestConfig.timeout!);

    try {
      context?.logger.debug(`HTTP ${requestConfig.method} ${requestConfig.url}`);

      const fetchOptions: RequestInit = {
        method: requestConfig.method,
        headers: requestConfig.headers,
        body: requestConfig.body,
        signal: controller.signal as any
      };

      const response = await fetch(requestConfig.url, fetchOptions);
      clearTimeout(timeoutId);

      if (!response) {
        throw new Error('No response received');
      }

      // Parse response headers
      const responseHeaders: Record<string, string> = {};
      if (response.headers && typeof response.headers.forEach === 'function') {
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });
      } else if (response.headers) {
        // Handle plain object headers
        Object.entries(response.headers).forEach(([key, value]) => {
          responseHeaders[key] = String(value);
        });
      }

      let data: any;
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else if (contentType.includes('text/')) {
        data = await response.text();
      } else {
        data = await response.buffer();
      }

      // Check for HTTP errors
      if (!response.ok) {
        const errorMessage = typeof data === 'object' && data.error 
          ? data.error 
          : typeof data === 'object' && data.message
          ? data.message
          : response.statusText;
        throw new Error(`HTTP ${response.status}: ${errorMessage}`);
      }

      const result: HttpResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        data,
        url: requestConfig.url,
        method: requestConfig.method
      };

      // Apply response transformer
      if (config.responseTransformer) {
        return config.responseTransformer(result);
      }

      return result;

    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        throw new Error('Request timeout');
      }
      
      throw error;
    }
  };

  // Build the tool
  const toolBuilder = new ToolBuilder<HttpRequestParams, HttpResponse>()
    .name(config.name)
    .description(config.description || `Make HTTP requests to ${config.baseURL}`)
    .category('network')
    .parameters(httpRequestSchema)
    .execute(executeRequest)
    .cacheable(true) // Cache GET requests by default
    .retryable(config.retryConfig || { maxAttempts: 3, backoff: 'exponential' });

  // Build tool without freezing
  const baseToolBuilder = toolBuilder;
  const baseConfig = (baseToolBuilder as any).config;
  
  const tool: Tool<HttpRequestParams, HttpResponse> = {
    ...baseConfig,
    timeout: config.timeout
  };

  // Add endpoint methods if configured
  if (config.endpoints) {
    const endpoints: Record<string, any> = {};
    
    for (const [name, endpointConfig] of Object.entries(config.endpoints)) {
      endpoints[name] = async (params: HttpEndpointParams, context?: ToolContext) => {
        // Replace path parameters
        let path = endpointConfig.path;
        if (params.pathParams) {
          for (const [key, value] of Object.entries(params.pathParams)) {
            path = path.replace(`{${key}}`, value);
          }
        }

        // Check for unresolved path parameters
        const unresolvedParams = path.match(/{(\w+)}/g);
        if (unresolvedParams) {
          const paramName = unresolvedParams[0].slice(1, -1);
          throw new Error(`Missing required path parameter: ${paramName}`);
        }

        // Merge query parameters
        const query = {
          ...endpointConfig.defaultQuery,
          ...params.query
        };

        // Execute request
        return executeRequest({
          endpoint: path,
          method: endpointConfig.method,
          headers: {
            ...endpointConfig.headers,
            ...params.headers
          },
          query: Object.keys(query).length > 0 ? query : undefined,
          body: params.body
        }, context);
      };
    }

    // Create a new object with endpoints
    return {
      ...tool,
      endpoints
    } as any;
  }

  return tool;
}