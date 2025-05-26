import { ToolBuilder } from '../tool-builder';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { minimatch } from 'minimatch';

const grepSchema = z.object({
  pattern: z.string().describe('Pattern to search for'),
  path: z.string().describe('Directory or file to search in'),
  regex: z.boolean().optional().default(false).describe('Treat pattern as regex'),
  recursive: z.boolean().optional().default(true).describe('Search recursively'),
  include: z.array(z.string()).optional().describe('File patterns to include (e.g., ["*.js", "*.ts"])'),
  exclude: z.array(z.string()).optional().describe('File patterns to exclude'),
  maxMatches: z.number().optional().describe('Maximum number of matches to return'),
  context: z.number().optional().default(0).describe('Number of context lines'),
  caseSensitive: z.boolean().optional().default(false).describe('Case sensitive search'),
});

interface Match {
  file: string;
  line: number;
  content: string;
  match?: string;
  before?: string[];
  after?: string[];
}

export const grep = new ToolBuilder()
  .name('grep')
  .description('Search for patterns in files')
  .category('search')
  .parameters(grepSchema)
  .execute(async (params, context) => {
    const matches: Match[] = [];
    let totalMatches = 0;
    
    const flags = 'g' + (params.caseSensitive ? '' : 'i');
    const searchRegex = params.regex 
      ? new RegExp(params.pattern, flags)
      : new RegExp(params.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

    async function searchFile(filePath: string): Promise<void> {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const regexMatch = searchRegex.exec(line);
          if (regexMatch) {
            totalMatches++;
            
            if (!params.maxMatches || matches.length < params.maxMatches) {
              const match: Match = {
                file: filePath,
                line: i + 1,
                content: line,
                match: regexMatch[0],
              };

              if (params.context > 0) {
                match.before = lines.slice(Math.max(0, i - params.context), i);
                match.after = lines.slice(i + 1, i + 1 + params.context);
              }

              matches.push(match);
            }
          }
          searchRegex.lastIndex = 0; // Reset regex
        }
      } catch (error) {
        // Ignore files that can't be read
      }
    }

    async function searchDirectory(dirPath: string): Promise<void> {
      try {
        const entries = await fs.readdir(dirPath);

        for (const entry of entries) {
          const entryPath = path.join(dirPath, entry);
          const stat = await fs.stat(entryPath);

          if (stat.isDirectory() && params.recursive) {
            await searchDirectory(entryPath);
          } else if (stat.isFile()) {
            // Check include/exclude patterns
            const relativePath = path.relative(params.path, entryPath);
            
            if (params.exclude?.some((pattern: string) => minimatch(relativePath, pattern))) {
              continue;
            }

            if (params.include && !params.include.some((pattern: string) => minimatch(relativePath, pattern))) {
              continue;
            }

            await searchFile(entryPath);
          }
        }
      } catch (error) {
        // Ignore directories that can't be read
      }
    }

    const normalizedPath = path.resolve(params.path);
    const stat = await fs.stat(normalizedPath);

    if (stat.isDirectory()) {
      await searchDirectory(normalizedPath);
    } else {
      await searchFile(normalizedPath);
    }

    return {
      matches,
      totalMatches,
      truncated: params.maxMatches ? totalMatches > params.maxMatches : false,
    };
  })
  .build();