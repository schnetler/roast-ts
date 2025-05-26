import { ToolBuilder } from '../tool-builder';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

const updateSchema = z.object({
  path: z.string().describe('File path'),
  search: z.string().describe('Text to search for'),
  replace: z.string().describe('Text to replace with'),
  regex: z.boolean().optional().default(false).describe('Treat search as regex'),
  all: z.boolean().optional().default(true).describe('Replace all occurrences'),
  backup: z.boolean().optional().default(false).describe('Create backup before updating'),
});

const batchUpdateSchema = z.object({
  updates: z.array(updateSchema).describe('List of update operations'),
  dryRun: z.boolean().optional().default(false).describe('Preview changes without applying'),
});

export const updateFiles = new ToolBuilder()
  .name('updateFiles')
  .description('Update file contents with search and replace')
  .category('file-operations')
  .parameters(batchUpdateSchema)
  .execute(async (params, context) => {
    const results = [];

    for (const update of params.updates) {
      try {
        const normalizedPath = path.resolve(update.path);
        
        // Read file
        const content = await fs.readFile(normalizedPath, 'utf-8');
        
        // Create search pattern
        const searchPattern = update.regex 
          ? new RegExp(update.search, update.all ? 'g' : '')
          : update.search;

        // Count matches
        const matches = update.regex
          ? [...content.matchAll(new RegExp(update.search, 'g'))].length
          : content.split(update.search).length - 1;

        if (matches === 0) {
          results.push({
            path: update.path,
            success: false,
            error: 'No matches found',
            matches: 0,
          });
          continue;
        }

        // Perform replacement
        let newContent: string;
        if (update.regex) {
          newContent = update.all 
            ? content.replace(new RegExp(update.search, 'g'), update.replace)
            : content.replace(new RegExp(update.search), update.replace);
        } else {
          newContent = update.all
            ? content.split(update.search).join(update.replace)
            : content.replace(update.search, update.replace);
        }

        // Apply changes if not dry run
        if (!params.dryRun) {
          // Create backup if requested
          if (update.backup) {
            const backupPath = `${normalizedPath}.bak`;
            await fs.writeFile(backupPath, content, 'utf-8');
          }

          // Write updated content
          await fs.writeFile(normalizedPath, newContent, 'utf-8');
        }

        // Calculate diff stats
        const linesChanged = content.split('\n').filter((line, i) => 
          line !== newContent.split('\n')[i]
        ).length;

        results.push({
          path: update.path,
          success: true,
          matches,
          linesChanged,
          backup: update.backup ? `${update.path}.bak` : undefined,
          preview: params.dryRun ? newContent.substring(0, 500) : undefined,
        });
      } catch (error: any) {
        results.push({
          path: update.path,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      results,
      totalFiles: params.updates.length,
      successCount: results.filter(r => r.success).length,
      dryRun: params.dryRun,
    };
  })
  .build();