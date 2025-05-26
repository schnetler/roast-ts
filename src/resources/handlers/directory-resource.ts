import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { ResourceConfig, ValidationResult } from '../../shared/types';
import { DirectoryResource, FileInfo, ResourceHandler } from '../types';

export class DirectoryResourceHandler implements ResourceHandler<DirectoryResource> {
  async create(config: ResourceConfig): Promise<DirectoryResource> {
    const absolutePath = path.resolve(config.source);

    return {
      type: 'directory' as const,
      source: config.source,
      path: absolutePath,

      async exists(): Promise<boolean> {
        try {
          const stats = await fs.stat(absolutePath);
          return stats.isDirectory();
        } catch {
          return false;
        }
      },

      async validate(): Promise<ValidationResult> {
        const errors: string[] = [];

        // Check existence using fs directly
        if (config.mustExist) {
          try {
            const stats = await fs.stat(absolutePath);
            if (!stats.isDirectory()) {
              errors.push(`Path exists but is not a directory: ${absolutePath}`);
            }
          } catch {
            errors.push(`Directory does not exist: ${absolutePath}`);
          }
        }

        return {
          valid: errors.length === 0,
          errors
        };
      },

      async list(): Promise<FileInfo[]> {
        const entries = await fs.readdir(absolutePath, { withFileTypes: true });
        
        return Promise.all(
          entries
            .filter(entry => entry.name !== '.' && entry.name !== '..')
            .map(async entry => {
              const fullPath = path.join(absolutePath, entry.name);
              const stats = await fs.stat(fullPath);
              
              return {
                name: entry.name,
                path: fullPath,
                type: entry.isDirectory() ? 'directory' : 'file',
                size: stats.size,
                modified: stats.mtime
              };
            })
        );
      },

      async *walk(): AsyncIterableIterator<FileInfo> {
        const queue: string[] = [absolutePath];

        while (queue.length > 0) {
          const currentPath = queue.shift()!;
          const entries = await fs.readdir(currentPath, { withFileTypes: true });

          for (const entry of entries) {
            if (entry.name === '.' || entry.name === '..') continue;
            
            const fullPath = path.join(currentPath, entry.name);
            const stats = await fs.stat(fullPath);
            
            const fileInfo: FileInfo = {
              name: entry.name,
              path: fullPath,
              type: entry.isDirectory() ? 'directory' : 'file',
              size: stats.size,
              modified: stats.mtime
            };
            
            yield fileInfo;
            
            if (entry.isDirectory()) {
              queue.push(fullPath);
            }
          }
        }
      },

      async glob(pattern: string): Promise<string[]> {
        const globPattern = path.join(absolutePath, pattern);
        return glob(globPattern, {
          ignore: ['**/node_modules/**', '**/.git/**']
        });
      }
    };
  }
}