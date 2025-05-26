import * as fs from 'fs/promises';
import * as path from 'path';
import { PromptResolver, PromptVariables } from './prompt-resolver';
import { PathResolver } from '../helpers/path-resolver';
import { Logger } from '../shared/types';

export interface PromptManagerOptions {
  promptsDir: string;
  resolver?: PromptResolver;
  pathResolver?: PathResolver;
  logger?: Logger;
  extensions?: string[];
  cacheEnabled?: boolean;
  watchEnabled?: boolean;
}

export interface PromptMetadata {
  name: string;
  path: string;
  lastModified: Date;
  size: number;
  extension: string;
}

export interface PromptCacheEntry {
  content: string;
  metadata: PromptMetadata;
  cachedAt: Date;
}

export class PromptManager {
  private promptsDir: string;
  private resolver: PromptResolver;
  private pathResolver: PathResolver;
  private logger: Logger;
  private extensions: string[];
  private cacheEnabled: boolean;
  private watchEnabled: boolean;
  
  private cache = new Map<string, PromptCacheEntry>();
  private watchers: any[] = [];

  constructor(options: PromptManagerOptions) {
    this.promptsDir = options.promptsDir;
    this.resolver = options.resolver || new PromptResolver();
    this.pathResolver = options.pathResolver || new PathResolver();
    this.logger = options.logger || {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      child: () => this.logger,
    };
    this.extensions = options.extensions || ['.md', '.txt', '.prompt'];
    this.cacheEnabled = options.cacheEnabled ?? true;
    this.watchEnabled = options.watchEnabled ?? false;

    this.logger.debug('PromptManager initialized', {
      promptsDir: this.promptsDir,
      extensions: this.extensions,
      cacheEnabled: this.cacheEnabled,
      watchEnabled: this.watchEnabled
    });
  }

  async loadPrompt(name: string): Promise<string> {
    // Check cache first
    if (this.cacheEnabled && this.cache.has(name)) {
      const cached = this.cache.get(name)!;
      this.logger.debug(`Prompt loaded from cache: ${name}`);
      return cached.content;
    }

    const promptPath = await this.findPromptFile(name);
    if (!promptPath) {
      throw new Error(`Prompt file not found: ${name}`);
    }

    // Verify the path is a file
    try {
      const stat = await fs.stat(promptPath);
      if (!stat.isFile()) {
        throw new Error(`Prompt path is not a file: ${promptPath}`);
      }
    } catch {
      throw new Error(`Prompt path is not accessible: ${promptPath}`);
    }

    try {
      const content = await fs.readFile(promptPath, 'utf-8');
      const stats = await fs.stat(promptPath);
      
      const metadata: PromptMetadata = {
        name,
        path: promptPath,
        lastModified: stats.mtime,
        size: stats.size,
        extension: path.extname(promptPath)
      };

      // Cache the content
      if (this.cacheEnabled) {
        this.cache.set(name, {
          content,
          metadata,
          cachedAt: new Date()
        });
      }

      this.logger.debug(`Prompt loaded from file: ${name}`, {
        path: promptPath,
        size: content.length
      });

      return content;
    } catch (error) {
      this.logger.error(`Failed to load prompt: ${name}`, { error, path: promptPath });
      throw new Error(`Failed to read prompt file: ${error}`);
    }
  }

  async resolvePrompt(name: string, variables: PromptVariables = {}): Promise<string> {
    const template = await this.loadPrompt(name);
    
    try {
      const resolved = await this.resolver.resolve(template, variables);
      
      this.logger.debug(`Prompt resolved: ${name}`, {
        templateLength: template.length,
        resolvedLength: resolved.length,
        variableCount: Object.keys(variables).length
      });

      return resolved;
    } catch (error) {
      this.logger.error(`Failed to resolve prompt: ${name}`, { error });
      throw new Error(`Prompt resolution failed for ${name}: ${error}`);
    }
  }

  async getPromptMetadata(name: string): Promise<PromptMetadata | null> {
    // Check cache first
    if (this.cacheEnabled && this.cache.has(name)) {
      return this.cache.get(name)!.metadata;
    }

    const promptPath = await this.findPromptFile(name);
    if (!promptPath) {
      return null;
    }

    try {
      const stats = await fs.stat(promptPath);
      return {
        name,
        path: promptPath,
        lastModified: stats.mtime,
        size: stats.size,
        extension: path.extname(promptPath)
      };
    } catch (error) {
      this.logger.warn(`Failed to get prompt metadata: ${name}`, { error });
      return null;
    }
  }

  async listPrompts(): Promise<string[]> {
    try {
      const stat = await fs.stat(this.promptsDir);
      if (!stat.isDirectory()) {
        this.logger.warn(`Prompts path is not a directory: ${this.promptsDir}`);
        return [];
      }
    } catch {
      this.logger.warn(`Prompts directory does not exist: ${this.promptsDir}`);
      return [];
    }

    try {
      const files = await fs.readdir(this.promptsDir);
      const promptNames = files
        .filter(file => this.extensions.some(ext => file.endsWith(ext)))
        .map(file => this.getPromptNameFromFile(file))
        .filter(name => name !== null) as string[];

      this.logger.debug(`Found ${promptNames.length} prompts`, { promptNames });
      return promptNames.sort();
    } catch (error) {
      this.logger.error('Failed to list prompts', { error, promptsDir: this.promptsDir });
      throw error;
    }
  }

  async searchPrompts(query: string): Promise<string[]> {
    const allPrompts = await this.listPrompts();
    const lowerQuery = query.toLowerCase();
    
    const matches = allPrompts.filter(name => 
      name.toLowerCase().includes(lowerQuery)
    );

    // Also search within prompt content for more comprehensive results
    const contentMatches: string[] = [];
    for (const name of allPrompts) {
      if (matches.includes(name)) continue;
      
      try {
        const content = await this.loadPrompt(name);
        if (content.toLowerCase().includes(lowerQuery)) {
          contentMatches.push(name);
        }
      } catch (error) {
        this.logger.warn(`Failed to search in prompt: ${name}`, { error });
      }
    }

    const result = [...matches, ...contentMatches];
    this.logger.debug(`Search for "${query}" found ${result.length} prompts`, { result });
    return result;
  }

  invalidateCache(promptName?: string): void {
    if (promptName) {
      if (this.cache.has(promptName)) {
        this.cache.delete(promptName);
        this.logger.debug(`Cache invalidated for prompt: ${promptName}`);
      }
    } else {
      const cacheSize = this.cache.size;
      this.cache.clear();
      this.logger.debug(`Entire cache cleared (${cacheSize} entries)`);
    }
  }

  async refreshPrompt(name: string): Promise<string> {
    this.invalidateCache(name);
    return this.loadPrompt(name);
  }

  async validatePrompt(name: string): Promise<{ isValid: boolean; errors: string[] }> {
    try {
      const template = await this.loadPrompt(name);
      const validation = this.resolver.validateTemplate(template);
      
      this.logger.debug(`Prompt validation for ${name}`, validation);
      return validation;
    } catch (error) {
      return {
        isValid: false,
        errors: [`Failed to load prompt: ${error}`]
      };
    }
  }

  async getPromptVariables(name: string): Promise<string[]> {
    try {
      const template = await this.loadPrompt(name);
      const variables = this.resolver.extractVariables(template);
      
      this.logger.debug(`Extracted variables from ${name}`, { variables });
      return variables;
    } catch (error) {
      this.logger.error(`Failed to extract variables from prompt: ${name}`, { error });
      return [];
    }
  }

  async watchPrompts(): Promise<void> {
    if (!this.watchEnabled) {
      this.logger.debug('Prompt watching disabled');
      return;
    }

    try {
      // Dynamic import to handle environments where chokidar might not be available
      let chokidar: any;
      try {
        // Use eval to prevent TypeScript from checking module existence at compile time
        chokidar = await eval('import("chokidar")');
      } catch {
        this.logger.warn('chokidar not available, prompt watching disabled');
        return;
      }
      
      const watcher = chokidar.default.watch(this.promptsDir, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true
      });

      watcher
        .on('change', (filePath: string) => {
          const promptName = this.getPromptNameFromPath(filePath);
          if (promptName) {
            this.logger.debug(`Prompt file changed: ${promptName}`);
            this.invalidateCache(promptName);
          }
        })
        .on('unlink', (filePath: string) => {
          const promptName = this.getPromptNameFromPath(filePath);
          if (promptName) {
            this.logger.debug(`Prompt file deleted: ${promptName}`);
            this.invalidateCache(promptName);
          }
        })
        .on('error', (error: Error) => {
          this.logger.error('Prompt watcher error', { error });
        });

      this.watchers.push(watcher);
      this.logger.info('Prompt file watcher started', { promptsDir: this.promptsDir });
    } catch (error) {
      this.logger.warn('Failed to start prompt file watcher', { error });
    }
  }

  async stopWatching(): Promise<void> {
    for (const watcher of this.watchers) {
      if (watcher && typeof watcher.close === 'function') {
        await watcher.close();
      }
    }
    this.watchers = [];
    this.logger.debug('Prompt file watchers stopped');
  }

  // Utility methods

  private async findPromptFile(name: string): Promise<string | null> {
    for (const extension of this.extensions) {
      const fileName = `${name}${extension}`;
      const filePath = path.join(this.promptsDir, fileName);
      
      try {
        await fs.access(filePath);
        return filePath;
      } catch {
        // File doesn't exist, continue to next extension
      }
    }
    
    return null;
  }

  private getPromptNameFromFile(fileName: string): string | null {
    for (const extension of this.extensions) {
      if (fileName.endsWith(extension)) {
        return fileName.slice(0, -extension.length);
      }
    }
    return null;
  }

  private getPromptNameFromPath(filePath: string): string | null {
    const fileName = path.basename(filePath);
    return this.getPromptNameFromFile(fileName);
  }

  // Statistics and debugging

  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  async getPromptStats(): Promise<{
    totalPrompts: number;
    cachedPrompts: number;
    totalSize: number;
    averageSize: number;
    extensions: Record<string, number>;
  }> {
    const prompts = await this.listPrompts();
    const extensionCounts: Record<string, number> = {};
    let totalSize = 0;

    for (const name of prompts) {
      const metadata = await this.getPromptMetadata(name);
      if (metadata) {
        totalSize += metadata.size;
        extensionCounts[metadata.extension] = (extensionCounts[metadata.extension] || 0) + 1;
      }
    }

    return {
      totalPrompts: prompts.length,
      cachedPrompts: this.cache.size,
      totalSize,
      averageSize: prompts.length > 0 ? totalSize / prompts.length : 0,
      extensions: extensionCounts
    };
  }

  // Cleanup
  async dispose(): Promise<void> {
    await this.stopWatching();
    this.invalidateCache();
    this.logger.debug('PromptManager disposed');
  }
}