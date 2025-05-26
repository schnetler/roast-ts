import { ToolBuilder } from '../tool-builder';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

const writeFileSchema = z.object({
  path: z.string().describe('Path to the file'),
  content: z.string().describe('Content to write'),
  encoding: z.enum(['utf-8', 'base64', 'hex']).optional().default('utf-8').describe('File encoding'),
  createDirs: z.boolean().optional().default(false).describe('Create parent directories if needed'),
  append: z.boolean().optional().default(false).describe('Append to existing file'),
});

const SYSTEM_DIRS = ['/etc', '/usr', '/bin', '/sbin', '/var', '/tmp', '/dev', '/proc', '/sys'];

export const writeFile = new ToolBuilder()
  .name('writeFile')
  .description('Write content to a file')
  .category('file-operations')
  .parameters(writeFileSchema)
  .execute(async (params, context) => {
    // Validate path
    if (params.path.includes('..')) {
      throw new Error('Invalid path: path traversal not allowed');
    }

    const normalizedPath = path.resolve(params.path);

    // Security check - allow temp directories
    const tempDir = require('os').tmpdir();
    const isInTempDir = normalizedPath.startsWith(tempDir);
    const isSystemPath = SYSTEM_DIRS.some(dir => normalizedPath.startsWith(dir)) && !isInTempDir;
    if (isSystemPath) {
      throw new Error('Cannot write to system directory');
    }

    // Create directories if needed
    if (params.createDirs) {
      const dir = path.dirname(normalizedPath);
      await fs.mkdir(dir, { recursive: true });
    }

    // Write or append file
    if (params.append) {
      await fs.appendFile(normalizedPath, params.content, params.encoding as BufferEncoding);
    } else {
      await fs.writeFile(normalizedPath, params.content, params.encoding as BufferEncoding);
    }

    // Get file stats
    const stats = await fs.stat(normalizedPath);

    return {
      path: normalizedPath,
      size: stats.size,
      created: !params.append,
    };
  })
  .build();