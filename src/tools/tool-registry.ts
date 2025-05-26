import { Tool } from '../shared/types';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface RegistrationOptions {
  force?: boolean;
}

export interface ToolQuery {
  namePattern?: RegExp;
  category?: string;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  private toolsByCategory = new Map<string | undefined, Tool[]>();

  register(tool: Tool, options: RegistrationOptions = {}): void {
    // Validate tool
    if (!tool.name || tool.name.trim() === '') {
      throw new Error('Invalid tool: name cannot be empty');
    }
    
    // Support both handler and execute
    const executeFunction = tool.execute || tool.handler;
    if (!executeFunction || typeof executeFunction !== 'function') {
      throw new Error('Invalid tool: execute or handler function is required');
    }
    
    // Normalize tool to have execute method
    const normalizedTool = {
      ...tool,
      execute: executeFunction,
      parameters: tool.parameters || tool.schema
    };

    // Ensure tool has a name
    if (!normalizedTool.name) {
      throw new Error('Tool must have a name');
    }
    
    // Check for duplicates
    if (this.tools.has(normalizedTool.name) && !options.force) {
      throw new Error(`Tool ${normalizedTool.name} is already registered`);
    }
    
    // Store the normalized tool
    this.tools.set(normalizedTool.name, normalizedTool);
    
    // Update category index
    const category = normalizedTool.category;
    if (!this.toolsByCategory.has(category)) {
      this.toolsByCategory.set(category, []);
    }
    this.toolsByCategory.get(category)!.push(normalizedTool);
  }

  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: string | undefined): Tool[] {
    return this.toolsByCategory.get(category) || [];
  }

  getCategories(): string[] {
    return Array.from(this.toolsByCategory.keys())
      .filter((cat): cat is string => cat !== undefined);
  }

  getSchemas(): ToolSchema[] {
    return this.getAll().map(tool => this.toolToSchema(tool));
  }

  query(query: ToolQuery): Tool[] {
    let results = this.getAll();

    if (query.namePattern) {
      results = results.filter(tool => tool.name && query.namePattern!.test(tool.name));
    }

    if (query.category !== undefined) {
      results = results.filter(tool => tool.category === query.category);
    }

    return results;
  }

  remove(name: string): void {
    const tool = this.tools.get(name);
    if (tool) {
      this.tools.delete(name);
      
      // Update category index
      const categoryTools = this.toolsByCategory.get(tool.category);
      if (categoryTools) {
        const filtered = categoryTools.filter(t => t.name !== name);
        if (filtered.length > 0) {
          this.toolsByCategory.set(tool.category, filtered);
        } else {
          this.toolsByCategory.delete(tool.category);
        }
      }
    }
  }

  clear(): void {
    this.tools.clear();
    this.toolsByCategory.clear();
  }

  private toolToSchema(tool: Tool): ToolSchema {
    let parameters: Record<string, any>;

    if (tool.parameters && 'parse' in tool.parameters) {
      // It's a Zod schema
      parameters = zodToJsonSchema(tool.parameters as z.ZodSchema, {
        target: 'openApi3',
        $refStrategy: 'none',
      }) as Record<string, any>;
    } else {
      // It's already a plain object schema
      parameters = tool.parameters as Record<string, any>;
    }

    return {
      name: tool.name || '',
      description: tool.description || '',
      parameters,
    };
  }
}