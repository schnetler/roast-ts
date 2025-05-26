import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { ReadableStream } from 'stream/web';
import { ResourceConfig, ValidationResult } from '../../shared/types';
import { FileResource, FileStats, ResourceHandler } from '../types';

export class FileResourceHandler implements ResourceHandler<FileResource> {
  async create(config: ResourceConfig): Promise<FileResource> {
    // Normalize path separators to forward slashes
    const normalizedSource = config.source.replace(/\\/g, '/');
    const absolutePath = path.resolve(normalizedSource);
    // Ensure the final path uses forward slashes
    const normalizedPath = absolutePath.replace(/\\/g, '/');
    
    return {
      type: 'file' as const,
      source: config.source,
      path: normalizedPath,

      async exists(): Promise<boolean> {
        try {
          await fs.access(absolutePath);
          return true;
        } catch {
          return false;
        }
      },

      validate: async function(): Promise<ValidationResult> {
        const errors: string[] = [];
        
        if (!path.isAbsolute(absolutePath)) {
          errors.push('Path must be absolute after resolution');
        }

        const fileExists = await (async () => {
          try {
            await fs.access(absolutePath);
            return true;
          } catch {
            return false;
          }
        })();

        if (config.mustExist && !fileExists) {
          errors.push(`File does not exist: ${absolutePath}`);
        }

        // Check size limit if specified
        if (config.maxSize && fileExists) {
          try {
            const stats = await fs.stat(absolutePath);
            if (stats.size > config.maxSize) {
              errors.push(`File size exceeds limit: ${stats.size} > ${config.maxSize}`);
            }
          } catch {
            // Ignore stat errors for validation
          }
        }

        return {
          valid: errors.length === 0,
          errors
        };
      },

      async read(): Promise<string> {
        const encoding = config.encoding === null ? null : (config.encoding || 'utf-8');
        if (encoding === null) {
          const buffer = await fs.readFile(absolutePath);
          return buffer.toString('base64'); // Return base64 for binary files
        }
        return fs.readFile(absolutePath, encoding as BufferEncoding);
      },

      readStream(): ReadableStream {
        return Readable.toWeb(createReadStream(absolutePath)) as ReadableStream;
      },

      async stat(): Promise<FileStats> {
        const stats = await fs.stat(absolutePath);
        return {
          size: stats.size,
          modified: stats.mtime,
          created: stats.birthtime,
          isSymlink: stats.isSymbolicLink()
        };
      }
    };
  }
}