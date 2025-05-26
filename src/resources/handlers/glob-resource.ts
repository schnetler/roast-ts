import * as path from 'path';
import { glob } from 'glob';
import { ResourceConfig, ValidationResult } from '../../shared/types';
import { GlobResource, ResourceHandler } from '../types';

// Helper function for glob pattern validation
function isValidGlobPattern(pattern: string): boolean {
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

export class GlobResourceHandler implements ResourceHandler<GlobResource> {
  async create(config: ResourceConfig): Promise<GlobResource> {
    const { dir, pattern } = this.parseGlobPattern(config.source);

    const resolveGlob = async (): Promise<string[]> => {
      return glob(config.source, {
        cwd: dir,
        absolute: true,
        nodir: config.filesOnly ?? true,
        ignore: config.respectGitignore ? ['**/node_modules/**', '**/.git/**'] : []
      });
    };

    const resource: GlobResource = {
      type: 'glob' as const,
      source: config.source,
      pattern,
      baseDir: dir,

      async exists(): Promise<boolean> {
        const matches = await resolveGlob();
        return matches.length > 0;
      },

      async validate(): Promise<ValidationResult> {
        const errors: string[] = [];

        if (!isValidGlobPattern(pattern)) {
          errors.push(`Invalid glob pattern: ${pattern}`);
        }

        return {
          valid: errors.length === 0,
          errors
        };
      },

      async resolve(): Promise<string[]> {
        return resolveGlob();
      },

      async *stream(): AsyncIterableIterator<string> {
        const matches = await resolveGlob();
        for (const match of matches) {
          yield match;
        }
      }
    };

    return resource;
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

}