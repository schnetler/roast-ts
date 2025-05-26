import { TemplateEngine, TemplateFunction, TemplateHelper } from './template-engine';
import { Logger } from '../shared/types';

export interface PromptResolverOptions {
  logger?: Logger;
  templateEngine?: TemplateEngine;
}

export interface PromptVariables {
  [key: string]: any;
}

export class PromptResolver {
  private templateEngine: TemplateEngine;
  private logger: Logger;

  constructor(options: PromptResolverOptions = {}) {
    this.logger = options.logger || {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      child: () => this.logger,
    };
    this.templateEngine = options.templateEngine || new TemplateEngine({
      logger: this.logger,
    });

    this.registerDefaultFunctions();
    this.registerDefaultHelpers();
  }

  private registerDefaultFunctions(): void {
    // Include function for template composition
    this.templateEngine.registerFunction('include', async (templateName: string) => {
      // This would be implemented to load and resolve other templates
      // For now, we'll return a placeholder
      this.logger.debug(`Include template requested: ${templateName}`);
      return `[Included: ${templateName}]`;
    });

    // Conditional functions
    this.templateEngine.registerFunction('eq', (a: any, b: any) => a === b);
    this.templateEngine.registerFunction('ne', (a: any, b: any) => a !== b);
    this.templateEngine.registerFunction('gt', (a: any, b: any) => a > b);
    this.templateEngine.registerFunction('gte', (a: any, b: any) => a >= b);
    this.templateEngine.registerFunction('lt', (a: any, b: any) => a < b);
    this.templateEngine.registerFunction('lte', (a: any, b: any) => a <= b);

    // Logical functions
    this.templateEngine.registerFunction('and', (...args: any[]) => args.every(Boolean));
    this.templateEngine.registerFunction('or', (...args: any[]) => args.some(Boolean));
    this.templateEngine.registerFunction('not', (value: any) => !value);

    // String manipulation
    this.templateEngine.registerFunction('trim', (str: any) => String(str).trim());
    this.templateEngine.registerFunction('replace', (str: any, search: string, replace: string) => 
      String(str).replace(new RegExp(search, 'g'), replace)
    );
    this.templateEngine.registerFunction('split', (str: any, separator: string) => 
      String(str).split(separator)
    );
    this.templateEngine.registerFunction('substring', (str: any, start: number, end?: number) => 
      String(str).substring(start, end)
    );

    // Array manipulation
    this.templateEngine.registerFunction('first', (arr: any[]) => 
      Array.isArray(arr) ? arr[0] : undefined
    );
    this.templateEngine.registerFunction('last', (arr: any[]) => 
      Array.isArray(arr) ? arr[arr.length - 1] : undefined
    );
    this.templateEngine.registerFunction('slice', (arr: any[], start: number, end?: number) => 
      Array.isArray(arr) ? arr.slice(start, end) : []
    );
    this.templateEngine.registerFunction('filter', (arr: any[], property: string, value: any) => 
      Array.isArray(arr) ? arr.filter(item => item[property] === value) : []
    );
    this.templateEngine.registerFunction('sort', (arr: any[], property?: string) => {
      if (!Array.isArray(arr)) return [];
      if (property) {
        return [...arr].sort((a, b) => {
          const aVal = a[property];
          const bVal = b[property];
          if (aVal < bVal) return -1;
          if (aVal > bVal) return 1;
          return 0;
        });
      }
      return [...arr].sort();
    });

    // Object manipulation
    this.templateEngine.registerFunction('keys', (obj: any) => 
      typeof obj === 'object' && obj !== null ? Object.keys(obj) : []
    );
    this.templateEngine.registerFunction('values', (obj: any) => 
      typeof obj === 'object' && obj !== null ? Object.values(obj) : []
    );
    this.templateEngine.registerFunction('entries', (obj: any) => 
      typeof obj === 'object' && obj !== null ? Object.entries(obj) : []
    );

    // Type checking
    this.templateEngine.registerFunction('isArray', (value: any) => Array.isArray(value));
    this.templateEngine.registerFunction('isObject', (value: any) => 
      typeof value === 'object' && value !== null && !Array.isArray(value)
    );
    this.templateEngine.registerFunction('isString', (value: any) => typeof value === 'string');
    this.templateEngine.registerFunction('isNumber', (value: any) => typeof value === 'number');
    this.templateEngine.registerFunction('isBoolean', (value: any) => typeof value === 'boolean');
    this.templateEngine.registerFunction('isDefined', (value: any) => value !== undefined);
    this.templateEngine.registerFunction('isNull', (value: any) => value === null);
    this.templateEngine.registerFunction('isEmpty', (value: any) => {
      if (value == null) return true;
      if (typeof value === 'string') return value.length === 0;
      if (Array.isArray(value)) return value.length === 0;
      if (typeof value === 'object') return Object.keys(value).length === 0;
      return false;
    });

    // Formatting functions
    this.templateEngine.registerFunction('json', (value: any, pretty = false) => 
      JSON.stringify(value, null, pretty ? 2 : 0)
    );
    this.templateEngine.registerFunction('url', (value: any) => encodeURIComponent(String(value)));
    this.templateEngine.registerFunction('base64', (value: any) => 
      Buffer.from(String(value)).toString('base64')
    );
    this.templateEngine.registerFunction('hash', async (value: any, algorithm = 'sha256') => {
      const crypto = await import('crypto');
      return crypto.createHash(algorithm).update(String(value)).digest('hex');
    });
  }

  private registerDefaultHelpers(): void {
    // with helper - changes context
    this.templateEngine.registerHelper('with', function(context: any, options: any) {
      if (context == null) return '';
      return options.fn(context);
    });

    // lookup helper - dynamic property access
    this.templateEngine.registerHelper('lookup', function(obj: any, key: any, options: any) {
      const value = obj?.[key];
      return options.fn(value != null ? value : this);
    });

    // log helper - for debugging
    this.templateEngine.registerHelper('log', function(...args: any[]) {
      const options = args[args.length - 1];
      const values = args.slice(0, -1);
      console.log('[Template Log]', ...values);
      return '';
    });

    // raw helper - output without escaping
    this.templateEngine.registerHelper('raw', function(options: any) {
      return options.fn(this);
    });

    // partial helper - for including sub-templates
    this.templateEngine.registerHelper('partial', function(name: string, context?: any, options?: any) {
      if (typeof context === 'object' && context.fn) {
        options = context;
        context = this;
      }
      // This would be implemented to load and render partial templates
      return `[Partial: ${name}]`;
    });

    // markdown helper - render markdown content
    this.templateEngine.registerHelper('markdown', function(options: any) {
      const content = options.fn(this);
      // In a real implementation, this would use a markdown parser
      return `<div class="markdown">${content}</div>`;
    });

    // compare helper - for complex comparisons
    this.templateEngine.registerHelper('compare', function(a: any, operator: string, b: any, options: any) {
      let result = false;
      switch (operator) {
        case '==': result = a == b; break;
        case '===': result = a === b; break;
        case '!=': result = a != b; break;
        case '!==': result = a !== b; break;
        case '<': result = a < b; break;
        case '<=': result = a <= b; break;
        case '>': result = a > b; break;
        case '>=': result = a >= b; break;
        case '&&': result = a && b; break;
        case '||': result = a || b; break;
        default: result = false;
      }
      return result ? options.fn(this) : options.inverse(this);
    });

    // times helper - repeat content n times
    this.templateEngine.registerHelper('times', function(n: number, options: any) {
      let result = '';
      for (let i = 0; i < n; i++) {
        result += options.fn({ index: i, first: i === 0, last: i === n - 1 });
      }
      return result;
    });

    // group helper - group array items
    this.templateEngine.registerHelper('group', function(array: any[], size: number, options: any) {
      if (!Array.isArray(array)) return '';
      
      let result = '';
      for (let i = 0; i < array.length; i += size) {
        const group = array.slice(i, i + size);
        result += options.fn({
          items: group,
          index: Math.floor(i / size),
          first: i === 0,
          last: i + size >= array.length
        });
      }
      return result;
    });
  }

  async resolve(template: string, variables: PromptVariables = {}): Promise<string> {
    try {
      this.logger.debug('Resolving template', { 
        templateLength: template.length,
        variableKeys: Object.keys(variables)
      });

      // Add helper variables to context
      const context = {
        ...variables,
        $: {
          // System variables
          timestamp: new Date().toISOString(),
          date: new Date().toLocaleDateString(),
          time: new Date().toLocaleTimeString(),
          platform: process.platform,
          version: process.version,
        }
      };

      const result = await this.templateEngine.render(template, context);
      
      this.logger.debug('Template resolved successfully', {
        originalLength: template.length,
        resolvedLength: result.length
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to resolve template', { error });
      throw new Error(`Template resolution failed: ${error}`);
    }
  }

  registerFunction(name: string, fn: TemplateFunction): void {
    this.logger.debug(`Registering template function: ${name}`);
    this.templateEngine.registerFunction(name, fn);
  }

  registerHelper(name: string, helper: TemplateHelper): void {
    this.logger.debug(`Registering template helper: ${name}`);
    this.templateEngine.registerHelper(name, helper);
  }

  // Utility methods for common template operations
  
  async resolveConditional(
    condition: any, 
    trueTemplate: string, 
    falseTemplate: string = '',
    variables: PromptVariables = {}
  ): Promise<string> {
    const template = condition ? trueTemplate : falseTemplate;
    return this.resolve(template, variables);
  }

  async resolveLoop(
    items: any[], 
    itemTemplate: string, 
    variables: PromptVariables = {},
    separator: string = ''
  ): Promise<string> {
    const results = await Promise.all(
      items.map(async (item, index) => {
        const itemContext = {
          ...variables,
          item,
          index,
          first: index === 0,
          last: index === items.length - 1,
          count: items.length,
        };
        return this.resolve(itemTemplate, itemContext);
      })
    );
    
    return results.join(separator);
  }

  async resolvePartial(
    templateParts: string[], 
    variables: PromptVariables = {}
  ): Promise<string> {
    const resolved = await Promise.all(
      templateParts.map(part => this.resolve(part, variables))
    );
    return resolved.join('');
  }

  // Template validation
  validateTemplate(template: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    try {
      // Basic syntax validation
      const [openDelim, closeDelim] = ['{{', '}}'];
      const openCount = (template.match(new RegExp(this.escapeRegExp(openDelim), 'g')) || []).length;
      const closeCount = (template.match(new RegExp(this.escapeRegExp(closeDelim), 'g')) || []).length;
      
      if (openCount !== closeCount) {
        errors.push(`Mismatched delimiters: ${openCount} opening, ${closeCount} closing`);
      }

      // Check for unclosed blocks
      const blockPattern = /\{\{#(\w+)[^}]*\}\}/g;
      const endBlockPattern = /\{\{\/(\w+)\}\}/g;
      
      const openBlocks = [];
      let match;
      
      while ((match = blockPattern.exec(template)) !== null) {
        openBlocks.push(match[1]);
      }
      
      while ((match = endBlockPattern.exec(template)) !== null) {
        const blockName = match[1];
        const index = openBlocks.lastIndexOf(blockName);
        if (index === -1) {
          errors.push(`Unexpected closing block: ${blockName}`);
        } else {
          openBlocks.splice(index, 1);
        }
      }
      
      if (openBlocks.length > 0) {
        errors.push(`Unclosed blocks: ${openBlocks.join(', ')}`);
      }

      // Try to compile the template
      this.templateEngine.compile(template);
      
    } catch (error) {
      errors.push(`Compilation error: ${error}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Extract variables used in template
  extractVariables(template: string): string[] {
    const variables = new Set<string>();
    const pattern = /\{\{[^}]*\}\}/g;
    let match;

    while ((match = pattern.exec(template)) !== null) {
      const expression = match[0].slice(2, -2).trim();
      
      // Skip block statements
      if (expression.startsWith('#') || expression.startsWith('/')) {
        continue;
      }

      // Handle function calls with arguments
      if (/^\w+\s+/.test(expression)) {
        // This is a function call like "uppercase name" or "formatDate now 'YYYY-MM-DD'"
        const parts = expression.split(/\s+/);
        // Skip the first part (function name) and extract variable names from arguments
        for (let i = 1; i < parts.length; i++) {
          const arg = parts[i];
          // Skip quoted strings
          if (!arg.startsWith('"') && !arg.startsWith("'") && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(arg)) {
            variables.add(arg);
          }
        }
        continue;
      }

      // Extract variable name (first part before any operators)
      const variable = expression.split(/[\s.()]/)[0];
      if (variable && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(variable)) {
        variables.add(variable);
      }
    }

    return Array.from(variables);
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}