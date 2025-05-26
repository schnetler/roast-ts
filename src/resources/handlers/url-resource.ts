import { ReadableStream } from 'stream/web';
import { ResourceConfig, ValidationResult } from '../../shared/types';
import { UrlResource, HttpMethod, ResourceHandler } from '../types';

export class UrlResourceHandler implements ResourceHandler<UrlResource> {
  async create(config: ResourceConfig): Promise<UrlResource> {
    const url = new URL(config.source);
    const method = (config.method || 'GET') as HttpMethod;
    const headers = config.headers;

    const resource: UrlResource = {
      type: 'url' as const,
      source: config.source,
      url,
      method,
      headers,

      async exists(): Promise<boolean> {
        try {
          const response = await fetch(url, {
            method: 'HEAD',
            headers: headers
          });
          return response.ok;
        } catch {
          return false;
        }
      },

      async validate(): Promise<ValidationResult> {
        const errors: string[] = [];

        if (!['http:', 'https:', 'ftp:'].includes(url.protocol)) {
          errors.push(`Unsupported protocol: ${url.protocol}`);
        }

        return {
          valid: errors.length === 0,
          errors
        };
      },

      async fetch(): Promise<Response> {
        const response = await fetch(url, {
          method: method,
          headers: headers,
          signal: AbortSignal.timeout(config.timeout || 30000)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      },

      async stream(): Promise<ReadableStream> {
        const response = await resource.fetch();
        if (!response.body) {
          throw new Error('Response has no body');
        }
        return response.body as ReadableStream;
      }
    };

    return resource;
  }
}