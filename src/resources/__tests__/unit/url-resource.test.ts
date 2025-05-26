import { UrlResourceHandler } from '../../handlers/url-resource';
import { UrlResource } from '../../types';
import { ResourceConfig } from '../../../shared/types';

// Mock fetch
global.fetch = jest.fn();
global.AbortSignal = {
  timeout: jest.fn(() => new AbortController().signal)
} as any;

describe('UrlResource', () => {
  let handler: UrlResourceHandler;
  
  beforeEach(() => {
    handler = new UrlResourceHandler();
    jest.clearAllMocks();
  });

  describe('HTTP Operations', () => {
    it('should fetch URL content', async () => {
      const config: ResourceConfig = { source: 'https://example.com' };
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('Hello, world!'),
        body: new ReadableStream()
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      
      const resource = await handler.create(config) as UrlResource;
      const response = await resource.fetch();
      
      expect(response).toBe(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        new URL('https://example.com'),
        expect.objectContaining({
          method: 'GET',
          signal: expect.anything()
        })
      );
    });

    it('should handle HTTP errors', async () => {
      const config: ResourceConfig = { source: 'https://example.com/404' };
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found'
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      
      const resource = await handler.create(config) as UrlResource;
      
      await expect(resource.fetch()).rejects.toThrow('HTTP 404: Not Found');
    });

    it('should support different methods', async () => {
      const config: ResourceConfig = { 
        source: 'https://api.example.com/users',
        method: 'POST'
      };
      const mockResponse = {
        ok: true,
        status: 201,
        statusText: 'Created'
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      
      const resource = await handler.create(config) as UrlResource;
      await resource.fetch();
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should handle redirects', async () => {
      const config: ResourceConfig = { source: 'https://example.com/redirect' };
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        redirected: true,
        url: 'https://example.com/final'
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      
      const resource = await handler.create(config) as UrlResource;
      const response = await resource.fetch();
      
      expect(response.redirected).toBe(true);
    });

    it('should include custom headers', async () => {
      const config: ResourceConfig = { 
        source: 'https://api.example.com',
        headers: {
          'Authorization': 'Bearer token123',
          'Content-Type': 'application/json'
        }
      };
      const mockResponse = { ok: true, status: 200, statusText: 'OK' };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      
      const resource = await handler.create(config) as UrlResource;
      await resource.fetch();
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer token123',
            'Content-Type': 'application/json'
          }
        })
      );
    });
  });

  describe('Streaming', () => {
    it('should create response streams', async () => {
      const config: ResourceConfig = { source: 'https://example.com/stream' };
      const mockStream = new ReadableStream();
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: mockStream
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      
      const resource = await handler.create(config) as UrlResource;
      const stream = await resource.stream();
      
      expect(stream).toBe(mockStream);
    });

    it('should handle large responses', async () => {
      const config: ResourceConfig = { source: 'https://example.com/large' };
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-length': '10485760' }), // 10MB
        body: new ReadableStream()
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      
      const resource = await handler.create(config) as UrlResource;
      const response = await resource.fetch();
      
      expect(response.headers.get('content-length')).toBe('10485760');
    });

    it('should support partial content', async () => {
      const config: ResourceConfig = { 
        source: 'https://example.com/video.mp4',
        headers: { 'Range': 'bytes=0-1023' }
      };
      const mockResponse = {
        ok: true,
        status: 206,
        statusText: 'Partial Content',
        headers: new Headers({ 'content-range': 'bytes 0-1023/10240' })
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      
      const resource = await handler.create(config) as UrlResource;
      const response = await resource.fetch();
      
      expect(response.status).toBe(206);
    });

    it('should handle connection timeouts', async () => {
      const config: ResourceConfig = { 
        source: 'https://slow.example.com',
        timeout: 100
      };
      
      // Mock AbortSignal.timeout
      const mockAbortSignal = { aborted: false };
      const originalTimeout = AbortSignal.timeout;
      AbortSignal.timeout = jest.fn().mockReturnValue(mockAbortSignal);
      
      // Mock fetch to simulate a timeout by rejecting with abort error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('The operation was aborted'));
      
      const resource = await handler.create(config) as UrlResource;
      
      // Try to fetch, which should trigger the timeout
      await expect(resource.fetch()).rejects.toThrow('The operation was aborted');
      
      // Verify timeout signal was created with correct value
      expect(AbortSignal.timeout).toHaveBeenCalledWith(100);
      
      // Verify fetch was called with the abort signal
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          signal: mockAbortSignal
        })
      );
      
      // Restore original
      AbortSignal.timeout = originalTimeout;
    });

    it('should handle missing response body', async () => {
      const config: ResourceConfig = { source: 'https://example.com/nobody' };
      const mockResponse = {
        ok: true,
        status: 204,
        statusText: 'No Content',
        body: null
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      
      const resource = await handler.create(config) as UrlResource;
      
      await expect(resource.stream()).rejects.toThrow('Response has no body');
    });
  });

  describe('Validation', () => {
    it('should validate URL format', async () => {
      const config: ResourceConfig = { source: 'https://example.com' };
      
      const resource = await handler.create(config) as UrlResource;
      const validation = await resource.validate();
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should reject unsupported protocols', async () => {
      const config: ResourceConfig = { source: 'file:///etc/passwd' };
      
      const resource = await handler.create(config) as UrlResource;
      const validation = await resource.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Unsupported protocol: file:');
    });

    it('should check URL existence with HEAD request', async () => {
      const config: ResourceConfig = { source: 'https://example.com/exists' };
      const mockResponse = { ok: true };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      
      const resource = await handler.create(config) as UrlResource;
      const exists = await resource.exists();
      
      expect(exists).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({ method: 'HEAD' })
      );
    });

    it('should handle HEAD request failures', async () => {
      const config: ResourceConfig = { source: 'https://example.com/nohead' };
      
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      
      const resource = await handler.create(config) as UrlResource;
      const exists = await resource.exists();
      
      expect(exists).toBe(false);
    });
  });

  describe('URL Parsing', () => {
    it('should parse URLs with query parameters', async () => {
      const config: ResourceConfig = { 
        source: 'https://api.example.com/search?q=test&limit=10' 
      };
      
      const resource = await handler.create(config) as UrlResource;
      
      expect(resource.url.searchParams.get('q')).toBe('test');
      expect(resource.url.searchParams.get('limit')).toBe('10');
    });

    it('should handle URL fragments', async () => {
      const config: ResourceConfig = { 
        source: 'https://example.com/page#section' 
      };
      
      const resource = await handler.create(config) as UrlResource;
      
      expect(resource.url.hash).toBe('#section');
    });

    it('should handle encoded URLs', async () => {
      const config: ResourceConfig = { 
        source: 'https://example.com/path%20with%20spaces' 
      };
      
      const resource = await handler.create(config) as UrlResource;
      
      expect(resource.url.pathname).toBe('/path%20with%20spaces');
    });

    it('should handle port numbers', async () => {
      const config: ResourceConfig = { 
        source: 'https://example.com:8080/api' 
      };
      
      const resource = await handler.create(config) as UrlResource;
      
      expect(resource.url.port).toBe('8080');
    });
  });

  describe('Authentication', () => {
    it('should handle basic auth in URL', async () => {
      const config: ResourceConfig = { 
        source: 'https://user:pass@example.com/api' 
      };
      
      const resource = await handler.create(config) as UrlResource;
      
      expect(resource.url.username).toBe('user');
      expect(resource.url.password).toBe('pass');
    });

    it('should handle bearer token auth', async () => {
      const config: ResourceConfig = { 
        source: 'https://api.example.com',
        headers: { 'Authorization': 'Bearer secret-token' }
      };
      const mockResponse = { ok: true, status: 200, statusText: 'OK' };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      
      const resource = await handler.create(config) as UrlResource;
      await resource.fetch();
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer secret-token'
          })
        })
      );
    });
  });
});