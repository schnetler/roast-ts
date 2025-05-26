import { ToolBuilder } from '../tool-builder';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { minimatch } from 'minimatch';

const searchFileSchema = z.object({
  pattern: z.string().describe('File name pattern (supports wildcards)'),
  directory: z.string().optional().default('.').describe('Directory to search in'),
  recursive: z.boolean().optional().default(true).describe('Search recursively'),
  maxDepth: z.number().optional().describe('Maximum directory depth'),
  includeHidden: z.boolean().optional().default(false).describe('Include hidden files'),
  type: z.enum(['file', 'directory', 'all']).optional().default('file').describe('Type of entries to find'),
});

interface SearchResult {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: Date;
}

export const searchFile = new ToolBuilder()
  .name('searchFile')
  .description('Search for files and directories by name pattern')
  .category('search')
  .parameters(searchFileSchema)
  .execute(async (params, context) => {
    // Parse params to apply defaults
    const parsedParams = searchFileSchema.parse(params);
    
    const results: SearchResult[] = [];
    const normalizedDir = path.resolve(parsedParams.directory);

    async function search(dir: string, depth: number = 0): Promise<void> {
      if (parsedParams.maxDepth !== undefined && depth > parsedParams.maxDepth) {
        return;
      }

      try {
        const entries = await fs.readdir(dir);

        for (const entry of entries) {
          // Skip hidden files unless requested
          if (!parsedParams.includeHidden && entry.startsWith('.')) {
            continue;
          }

          const entryPath = path.join(dir, entry);
          const stat = await fs.stat(entryPath);
          const isDirectory = stat.isDirectory();
          const type = isDirectory ? 'directory' : 'file';

          // For glob patterns, we need to check against the relative path
          const relativePath = path.relative(normalizedDir, entryPath);
          
          // Check if entry matches pattern
          let matches = false;
          
          // If pattern contains path separators or glob stars, match against full relative path
          if (parsedParams.pattern.includes('/') || parsedParams.pattern.includes('**')) {
            matches = minimatch(relativePath, parsedParams.pattern, { matchBase: false });
          } else {
            // Otherwise match against just the filename
            matches = minimatch(entry, parsedParams.pattern);
          }

          if (matches && (parsedParams.type === 'all' || parsedParams.type === type)) {
            results.push({
              path: entryPath,
              name: entry,
              type,
              size: isDirectory ? undefined : stat.size,
              modified: stat.mtime,
            });
          }

          // Recurse into directories
          if (isDirectory && parsedParams.recursive) {
            await search(entryPath, depth + 1);
          }
        }
      } catch (error) {
        // Ignore directories that can't be read
        context?.logger?.debug?.(`Failed to read directory: ${dir}`, { error });
      }
    }

    await search(normalizedDir);

    // Sort results by path
    results.sort((a, b) => a.path.localeCompare(b.path));

    return {
      results,
      count: results.length,
      searchDirectory: normalizedDir,
      pattern: parsedParams.pattern,
    };
  })
  .cacheable({ ttl: 30000 }) // Cache for 30 seconds
  .build();