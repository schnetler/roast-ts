import { ResourceConfig } from '../shared/types';
import { Resource, ResourceHandler } from './types';
import * as fs from 'fs/promises';

export class ResourceFactory {
  private static handlers = new Map<string, ResourceHandler>();

  static register(type: string, handler: ResourceHandler): void {
    this.handlers.set(type, handler);
  }

  static async create(input: string | ResourceConfig): Promise<Resource> {
    // Normalize input
    const config = typeof input === 'string' 
      ? { source: input } 
      : input;

    // Detect resource type
    const type = await this.detectType(config);
    
    // Get appropriate handler
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`No handler registered for resource type: ${type}`);
    }

    // Create and validate resource
    const resource = await handler.create(config);
    const validation = await resource.validate();
    
    if (!validation.valid) {
      throw new Error(`Invalid ${type} resource: ${validation.errors.join(', ')}`);
    }

    return resource as Resource;
  }

  private static async detectType(config: ResourceConfig): Promise<string> {
    const { source } = config;
    
    // If type is explicitly specified, use it
    if (config.type) {
      return config.type;
    }

    // Command syntax: $(command)
    if (source.startsWith('$(') && source.endsWith(')')) {
      return 'command';
    }

    // URL detection
    if (this.isUrl(source)) {
      return 'url';
    }

    // API detection (JSON config)
    if (this.isApiConfig(source)) {
      return 'api';
    }

    // File system detection
    const fsType = await this.detectFileSystemType(source);
    if (fsType) {
      return fsType;
    }

    // Default to none
    return 'none';
  }

  private static isUrl(source: string): boolean {
    try {
      new URL(source);
      return true;
    } catch {
      return false;
    }
  }

  private static isApiConfig(source: string): boolean {
    try {
      const config = JSON.parse(source);
      return 'url' in config && 'options' in config;
    } catch {
      return false;
    }
  }

  private static async detectFileSystemType(source: string): Promise<string | null> {
    // Check for glob patterns
    if (this.isGlobPattern(source)) {
      return 'glob';
    }

    // Check file system
    try {
      const stats = await fs.stat(source);
      return stats.isDirectory() ? 'directory' : 'file';
    } catch {
      // Path doesn't exist, check if it looks like a directory
      if (source.endsWith('/') || source.endsWith('\\')) {
        return 'directory';
      }
      // For non-existent paths that don't look like directories,
      // return null so that detectType can default to 'none'
      return null;
    }
  }

  private static isGlobPattern(source: string): boolean {
    return source.includes('*') || source.includes('?') || source.includes('{');
  }
}