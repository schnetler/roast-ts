import { ToolBuilder } from '../tool-builder';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

const readFileSchema = z.object({
  path: z.string().describe('Path to the file or directory'),
  encoding: z.enum(['utf-8', 'base64', 'hex']).optional().default('utf-8').describe('File encoding'),
  list: z.boolean().optional().describe('List directory contents instead of reading file'),
});

export const readFile = new ToolBuilder()
  .name('readFile')
  .description('Read file contents or list directory contents')
  .category('file-operations')
  .parameters(readFileSchema)
  .execute(async (params, context) => {
    // Validate path
    if (params.path.includes('..')) {
      throw new Error('Invalid path: path traversal not allowed');
    }

    const normalizedPath = path.resolve(params.path);

    if (params.list) {
      // List directory contents
      try {
        const entries = await fs.readdir(normalizedPath);
        const stats = await Promise.all(
          entries.map(async (entry) => {
            const entryPath = path.join(normalizedPath, entry);
            const stat = await fs.stat(entryPath);
            return {
              name: entry,
              type: stat.isDirectory() ? 'directory' : 'file',
              size: stat.isFile() ? stat.size : undefined,
              modified: stat.mtime,
            };
          })
        );

        return {
          path: normalizedPath,
          entries: stats,
        };
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          throw new Error(`Directory not found: ${params.path}`);
        }
        throw error;
      }
    } else {
      // Read file contents
      try {
        const buffer = await fs.readFile(normalizedPath, params.encoding === 'utf-8' ? 'utf-8' : null);
        const content = params.encoding !== 'utf-8' && Buffer.isBuffer(buffer) 
          ? buffer.toString(params.encoding as BufferEncoding)
          : buffer;

        let size = 0;
        try {
          const stats = await fs.stat(normalizedPath);
          size = stats.size;
        } catch {
          // If stat fails, calculate size from content
          size = typeof content === 'string' ? content.length : (content as Buffer).length;
        }

        return {
          content,
          size,
          encoding: params.encoding,
        };
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          throw new Error(`File not found: ${params.path}`);
        }
        throw error;
      }
    }
  })
  .cacheable({ ttl: 60000 }) // Cache for 1 minute
  .build();