import * as path from 'path';
import { glob } from 'glob';
import { ResourceConfig, ValidationResult } from '../../shared/types';
import { GlobResource, ResourceHandler } from '../types';

export class GlobResourceHandler implements ResourceHandler<GlobResource> {
  async create(config: ResourceConfig): Promise<GlobResource> {
    const { dir, pattern } = this.parseGlobPattern(config.source);

    return {
      type: 'glob' as const,
      source: config.source,
      pattern,
      baseDir: dir,

      async exists(): Promise<boolean> {
        const matches = await this.resolve();
        return matches.length > 0;
      },

      async validate(): Promise<ValidationResult> {
        const errors: string[] = [];

        if (!this.isValidGlobPattern(pattern)) {
          errors.push(`Invalid glob pattern: ${pattern}`);
        }

        return {
          valid: errors.length === 0,
          errors
        };
      },

      async resolve(): Promise<string[]> {
        return glob(config.source, {
          cwd: dir,
          absolute: true,
          nodir: config.filesOnly ?? true,
          ignore: config.respectGitignore ? ['**/node_modules/**', '**/.git/**'] : []
        });
      },

      async *stream(): AsyncIterableIterator<string> {
        const matches = await this.resolve();
        for (const match of matches) {
          yield match;
        }
      }
    };
  }

  private parseGlobPattern(source: string): { dir: string; pattern: string } {
    const firstWildcard = source.search(/[*?{]/);
    if (firstWildcard === -1) {
      return { dir: path.dirname(source), pattern: path.basename(source) };
    }

    const lastSlashBeforeWildcard = source.lastIndexOf('/', firstWildcard);
    const dir = lastSlashBeforeWildcard === -1 ? '.' : source.substring(0, lastSlashBeforeWildcard);
    const pattern = source.substring(dir.length + 1);

    return { dir: dir || '.', pattern };
  }

  private isValidGlobPattern(pattern: string): boolean {
    try {
      // Basic validation - check for balanced brackets
      let bracketCount = 0;
      let inBracket = false;
      
      for (const char of pattern) {
        if (char === '[') {
          bracketCount++;
          inBracket = true;
        } else if (char === ']' && inBracket) {
          bracketCount--;
          inBracket = false;
        }
      }
      
      return bracketCount === 0;
    } catch {
      return false;
    }
  }
}