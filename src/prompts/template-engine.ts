import { Logger } from '../shared/types';

export interface TemplateEngineOptions {
  delimiters?: [string, string];
  strictMode?: boolean;
  escapeHtml?: boolean;
  logger?: Logger;
  enableCache?: boolean;
}

export interface TemplateFunction {
  (...args: any[]): any | Promise<any>;
}

export interface TemplateHelper {
  (this: any, ...args: any[]): any | Promise<any>;
}

export interface CompiledTemplate {
  (data: any): string | Promise<string>;
}

interface HelperOptions {
  fn: (context: any) => string | Promise<string>;
  inverse: (context: any) => string | Promise<string>;
  data?: any;
  hash?: Record<string, any>;
}

interface ParsedBlock {
  type: 'text' | 'variable' | 'helper' | 'block' | 'comment';
  content: string;
  expression?: string;
  children?: ParsedBlock[];
  inverse?: ParsedBlock[];
  args?: string[];
  hash?: Record<string, any>;
}

export class TemplateEngine {
  private functions = new Map<string, TemplateFunction>();
  private helpers = new Map<string, TemplateHelper>();
  private templateCache = new Map<string, CompiledTemplate>();
  private options: Required<TemplateEngineOptions>;

  constructor(options: TemplateEngineOptions = {}) {
    this.options = {
      delimiters: options.delimiters || ['{{', '}}'],
      strictMode: options.strictMode ?? false,
      escapeHtml: options.escapeHtml ?? true,
      enableCache: options.enableCache ?? true,
      logger: options.logger || {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        child: (ctx) => this.options.logger,
      },
    };

    this.registerBuiltInFunctions();
    this.registerBuiltInHelpers();
  }

  private registerBuiltInFunctions(): void {
    // String functions
    this.registerFunction('uppercase', (str: any) => String(str).toUpperCase());
    this.registerFunction('lowercase', (str: any) => String(str).toLowerCase());
    this.registerFunction('capitalize', (str: any) => {
      const s = String(str);
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    });
    this.registerFunction('truncate', (str: any, length: number, suffix = '...') => {
      const s = String(str);
      if (s.length <= length) return s;
      const truncateLength = Math.max(0, length - suffix.length);
      return s.substring(0, truncateLength) + suffix;
    });
    this.registerFunction('trim', (str: any) => String(str).trim());
    this.registerFunction('replace', (str: any, search: string, replace: string) => 
      String(str).replace(new RegExp(search, 'g'), replace)
    );
    this.registerFunction('split', (str: any, separator: string) => 
      String(str).split(separator)
    );
    this.registerFunction('substring', (str: any, start: number, end?: number) => 
      String(str).substring(start, end)
    );

    // Utility functions
    this.registerFunction('default', (value: any, defaultValue: any) => {
      return value != null && value !== '' ? value : defaultValue;
    });
    this.registerFunction('length', (value: any) => {
      if (Array.isArray(value)) return value.length;
      if (typeof value === 'string') return value.length;
      if (typeof value === 'object' && value !== null) return Object.keys(value).length;
      return 0;
    });

    // Array functions
    this.registerFunction('join', (arr: any[], separator = ', ') => {
      return Array.isArray(arr) ? arr.join(separator) : String(arr);
    });
    this.registerFunction('first', (arr: any[]) => 
      Array.isArray(arr) ? arr[0] : undefined
    );
    this.registerFunction('last', (arr: any[]) => 
      Array.isArray(arr) ? arr[arr.length - 1] : undefined
    );
    this.registerFunction('slice', (arr: any[], start: number, end?: number) => 
      Array.isArray(arr) ? arr.slice(start, end) : []
    );

    // Math functions
    this.registerFunction('add', (a: number, b: number) => Number(a) + Number(b));
    this.registerFunction('subtract', (a: number, b: number) => Number(a) - Number(b));
    this.registerFunction('multiply', (a: number, b: number) => Number(a) * Number(b));
    this.registerFunction('divide', (a: number, b: number) => Number(a) / Number(b));

    // Comparison functions
    this.registerFunction('eq', (a: any, b: any) => a === b);
    this.registerFunction('ne', (a: any, b: any) => a !== b);
    this.registerFunction('gt', (a: any, b: any) => a > b);
    this.registerFunction('gte', (a: any, b: any) => a >= b);
    this.registerFunction('lt', (a: any, b: any) => a < b);
    this.registerFunction('lte', (a: any, b: any) => a <= b);

    // Logical functions
    this.registerFunction('and', (...args: any[]) => args.every(Boolean));
    this.registerFunction('or', (...args: any[]) => args.some(Boolean));
    this.registerFunction('not', (value: any) => !value);

    // Type checking
    this.registerFunction('isArray', (value: any) => Array.isArray(value));
    this.registerFunction('isObject', (value: any) => 
      typeof value === 'object' && value !== null && !Array.isArray(value)
    );
    this.registerFunction('isString', (value: any) => typeof value === 'string');
    this.registerFunction('isNumber', (value: any) => typeof value === 'number');
    this.registerFunction('isBoolean', (value: any) => typeof value === 'boolean');
    this.registerFunction('isDefined', (value: any) => value !== undefined);
    this.registerFunction('isNull', (value: any) => value === null);
    this.registerFunction('isEmpty', (value: any) => {
      if (value == null) return true;
      if (typeof value === 'string') return value.length === 0;
      if (Array.isArray(value)) return value.length === 0;
      if (typeof value === 'object') return Object.keys(value).length === 0;
      return false;
    });

    // Date functions
    this.registerFunction('formatDate', (date: Date | string, format: string) => {
      const d = new Date(date);
      if (isNaN(d.getTime())) return String(date);
      
      return format
        .replace('YYYY', d.getFullYear().toString())
        .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
        .replace('DD', String(d.getDate()).padStart(2, '0'))
        .replace('HH', String(d.getHours()).padStart(2, '0'))
        .replace('mm', String(d.getMinutes()).padStart(2, '0'))
        .replace('ss', String(d.getSeconds()).padStart(2, '0'));
    });

    // Formatting functions
    this.registerFunction('json', (value: any, pretty = false) => 
      JSON.stringify(value, null, pretty ? 2 : 0)
    );
    this.registerFunction('url', (value: any) => encodeURIComponent(String(value)));
  }

  private registerBuiltInHelpers(): void {
    // if helper
    this.registerHelper('if', async function(this: any, condition: any, options: HelperOptions) {
      if (this.isTruthy(condition)) {
        return await options.fn(this);
      } else {
        return options.inverse ? await options.inverse(this) : '';
      }
    });

    // unless helper
    this.registerHelper('unless', async function(this: any, condition: any, options: HelperOptions) {
      if (!this.isTruthy(condition)) {
        return await options.fn(this);
      } else {
        return options.inverse ? await options.inverse(this) : '';
      }
    });

    // each helper
    this.registerHelper('each', async function(this: any, context: any, options: HelperOptions) {
      if (!context) return '';
      
      let result = '';
      if (Array.isArray(context)) {
        for (let i = 0; i < context.length; i++) {
          const itemContext = {
            ...this,
            ...context[i],
            '@index': i,
            '@first': i === 0,
            '@last': i === context.length - 1
          };
          result += await options.fn(itemContext);
        }
      } else if (typeof context === 'object') {
        const keys = Object.keys(context);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const itemContext = {
            ...this,
            '@key': key,
            '@index': i,
            '@first': i === 0,
            '@last': i === keys.length - 1,
            this: context[key]
          };
          result += await options.fn(itemContext);
        }
      }
      return result;
    });

    // with helper
    this.registerHelper('with', async function(this: any, context: any, options: HelperOptions) {
      if (context == null) return '';
      return await options.fn({ ...this, ...context });
    });

    // lookup helper
    this.registerHelper('lookup', async function(this: any, obj: any, key: any, options: HelperOptions) {
      const value = obj?.[key];
      return await options.fn(value != null ? { ...this, this: value } : this);
    });

    // log helper
    this.registerHelper('log', function(this: any, ...args: any[]) {
      const options = args[args.length - 1];
      const values = args.slice(0, -1);
      console.log('[Template Log]', ...values);
      return '';
    });

    // compare helper
    this.registerHelper('compare', async function(this: any, a: any, operator: string, b: any, options: HelperOptions) {
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
      return result ? await options.fn(this) : (options.inverse ? await options.inverse(this) : '');
    });

    // times helper
    this.registerHelper('times', async function(this: any, n: number, options: HelperOptions) {
      let result = '';
      for (let i = 0; i < n; i++) {
        const context = {
          ...this,
          index: i,
          first: i === 0,
          last: i === n - 1
        };
        result += await options.fn(context);
      }
      return result;
    });
  }

  compile(template: string): CompiledTemplate {
    // Check cache first if caching is enabled
    if (this.options.enableCache && this.templateCache.has(template)) {
      return this.templateCache.get(template)!;
    }

    const compiled = this.compileTemplate(template);
    
    // Only cache if caching is enabled
    if (this.options.enableCache) {
      this.templateCache.set(template, compiled);
    }
    
    return compiled;
  }

  async render(template: string, data: any = {}): Promise<string> {
    const compiled = this.compile(template);
    const result = await compiled(data);
    return result;
  }

  registerFunction(name: string, fn: TemplateFunction): void {
    if (!name || name.trim() === '') {
      throw new Error('Function name cannot be empty');
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error('Function name must be valid identifier');
    }
    this.functions.set(name, fn);
  }

  registerHelper(name: string, helper: TemplateHelper): void {
    if (!name || name.trim() === '') {
      throw new Error('Helper name cannot be empty');
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error('Helper name must be valid identifier');
    }
    this.helpers.set(name, helper);
  }

  private compileTemplate(template: string): CompiledTemplate {
    const blocks = this.parseTemplate(template);
    
    return async (data: any) => {
      const context = {
        ...data,
        isTruthy: this.isTruthy.bind(this),
        escapeHtml: this.escapeHtml.bind(this),
        toString: this.toString.bind(this)
      };
      
      return await this.renderBlocks(blocks, context);
    };
  }

  private parseTemplate(template: string): ParsedBlock[] {
    const [openDelim, closeDelim] = this.options.delimiters;
    const blocks: ParsedBlock[] = [];
    let currentIndex = 0;

    // First, handle escaped delimiters by replacing them with placeholders
    const escapedOpenPlaceholder = '\x00ESCAPED_OPEN\x00';
    const escapedClosePlaceholder = '\x00ESCAPED_CLOSE\x00';
    let processedTemplate = template
      .replace(new RegExp(`\\\\${this.escapeRegExp(openDelim)}`, 'g'), escapedOpenPlaceholder)
      .replace(new RegExp(`\\\\${this.escapeRegExp(closeDelim)}`, 'g'), escapedClosePlaceholder);

    // Pattern to match all template expressions (including triple braces)
    const triplePattern = new RegExp(
      `${this.escapeRegExp(openDelim)}{([^${this.escapeRegExp(closeDelim)}]+?)}${this.escapeRegExp(closeDelim)}`,
      'g'
    );
    const doublePattern = new RegExp(
      `${this.escapeRegExp(openDelim)}([^${this.escapeRegExp(closeDelim)}]+?)${this.escapeRegExp(closeDelim)}`,
      'g'
    );

    // First, handle triple braces to mark them as unescaped
    const tripleBraceMarkers: Array<{index: number, length: number, expression: string}> = [];
    let tripleMatch;
    
    while ((tripleMatch = triplePattern.exec(processedTemplate)) !== null) {
      tripleBraceMarkers.push({
        index: tripleMatch.index,
        length: tripleMatch[0].length,
        expression: tripleMatch[1].trim()
      });
    }

    // Process template with double braces pattern
    let match: RegExpExecArray | null;
    while ((match = doublePattern.exec(processedTemplate)) !== null) {
      // Check if this is actually a triple brace expression
      const isTripleBrace = tripleBraceMarkers.some(marker => 
        match!.index >= marker.index && match!.index < marker.index + marker.length
      );

      // Add text before the match
      if (match.index > currentIndex) {
        let textContent = processedTemplate.slice(currentIndex, match.index);
        if (textContent) {
          // Restore escaped delimiters
          textContent = textContent
            .replace(new RegExp(escapedOpenPlaceholder, 'g'), openDelim)
            .replace(new RegExp(escapedClosePlaceholder, 'g'), closeDelim);
          blocks.push({
            type: 'text',
            content: textContent
          });
        }
      }

      if (isTripleBrace) {
        // Find the corresponding triple brace marker
        const marker = tripleBraceMarkers.find(m => 
          match!.index >= m.index && match!.index < m.index + m.length
        );
        if (marker) {
          blocks.push({
            type: 'variable',
            expression: marker.expression,
            content: marker.expression,
            hash: { escapeHtml: false }
          });
          // Skip past the triple brace expression
          doublePattern.lastIndex = marker.index + marker.length;
          currentIndex = marker.index + marker.length;
          continue;
        }
      }

      let expression = match[1];
      
      // Check for whitespace control
      const trimLeft = expression.startsWith('-');
      const trimRight = expression.endsWith('-');
      
      // Remove whitespace control indicators
      if (trimLeft) expression = expression.slice(1);
      if (trimRight) expression = expression.slice(0, -1);
      expression = expression.trim();
      
      // Apply whitespace trimming to previous text block if needed
      if (trimLeft && blocks.length > 0 && blocks[blocks.length - 1].type === 'text') {
        blocks[blocks.length - 1].content = blocks[blocks.length - 1].content.replace(/\s+$/, '');
      }
      
      // Handle comments
      if (expression.startsWith('!')) {
        blocks.push({
          type: 'comment',
          content: expression.slice(1)
        });
      }
      // Handle block helpers
      else if (expression.startsWith('#')) {
        const blockResult = this.parseBlockHelper(processedTemplate, match.index, doublePattern);
        if (blockResult) {
          blocks.push(blockResult.block);
          doublePattern.lastIndex = blockResult.endIndex;
          currentIndex = blockResult.endIndex;
          continue;
        }
      }
      // Handle closing tags (should be handled by block parsing)
      else if (expression.startsWith('/')) {
        // Skip - this should be handled by block parsing
      }
      // Handle regular expressions or functions
      else {
        const parsedExpr = this.parseExpression(expression);
        blocks.push({
          type: parsedExpr.type,
          expression: expression,
          content: expression,
          args: parsedExpr.args,
          hash: { ...parsedExpr.hash, trimRight }
        });
      }

      currentIndex = doublePattern.lastIndex;
      
      // Apply right whitespace trimming to next text if needed
      if (trimRight) {
        // Mark that the next text block should be left-trimmed
        const nextTextStart = currentIndex;
        const nextMatch = doublePattern.exec(processedTemplate);
        if (nextMatch) {
          doublePattern.lastIndex = currentIndex; // Reset position
        }
        
        // Find next non-whitespace or end of template
        let peekIndex = currentIndex;
        while (peekIndex < processedTemplate.length && /\s/.test(processedTemplate[peekIndex])) {
          peekIndex++;
        }
        if (peekIndex > currentIndex) {
          currentIndex = peekIndex;
        }
      }
    }

    // Add remaining text
    if (currentIndex < processedTemplate.length) {
      let textContent = processedTemplate.slice(currentIndex);
      if (textContent) {
        // Restore escaped delimiters
        textContent = textContent
          .replace(new RegExp(escapedOpenPlaceholder, 'g'), openDelim)
          .replace(new RegExp(escapedClosePlaceholder, 'g'), closeDelim);
        blocks.push({
          type: 'text',
          content: textContent
        });
      }
    }

    return blocks;
  }

  private parseBlockHelper(template: string, startIndex: number, pattern: RegExp): { block: ParsedBlock; endIndex: number } | null {
    const [openDelim, closeDelim] = this.options.delimiters;
    const openMatch = template.slice(startIndex).match(new RegExp(`${this.escapeRegExp(openDelim)}#([^${this.escapeRegExp(closeDelim)}]+?)${this.escapeRegExp(closeDelim)}`));
    
    if (!openMatch) return null;

    const expression = openMatch[1].trim();
    const parsedExpr = this.parseExpression(expression);
    const helperName = parsedExpr.args?.[0] || '';

    // Find the matching closing tag
    const closePattern = new RegExp(`${this.escapeRegExp(openDelim)}\\/${helperName}${this.escapeRegExp(closeDelim)}`);
    const elsePattern = new RegExp(`${this.escapeRegExp(openDelim)}else${this.escapeRegExp(closeDelim)}`);
    
    let depth = 1;
    let currentPos = startIndex + openMatch[0].length;
    let elsePosition = -1;
    let endPosition = -1;

    while (depth > 0 && currentPos < template.length) {
      const nextOpen = template.indexOf(openDelim + '#' + helperName, currentPos);
      const nextClose = template.search(closePattern);
      const nextElse = elsePosition === -1 ? template.search(elsePattern) : -1;

      if (nextElse !== -1 && nextElse < nextClose && depth === 1) {
        elsePosition = nextElse;
        currentPos = nextElse + (openDelim + 'else' + closeDelim).length;
        continue;
      }

      if (nextOpen !== -1 && (nextClose === -1 || nextOpen < nextClose)) {
        depth++;
        currentPos = nextOpen + (openDelim + '#' + helperName).length;
      } else if (nextClose !== -1) {
        depth--;
        if (depth === 0) {
          endPosition = nextClose;
        } else {
          currentPos = nextClose + (openDelim + '/' + helperName + closeDelim).length;
        }
      } else {
        break;
      }
    }

    if (endPosition === -1) {
      throw new Error(`Unclosed block helper: ${helperName}`);
    }

    const contentStart = startIndex + openMatch[0].length;
    const contentEnd = elsePosition !== -1 ? elsePosition : endPosition;
    const content = template.slice(contentStart, contentEnd);

    let inverseContent = '';
    if (elsePosition !== -1) {
      const elseStart = elsePosition + (openDelim + 'else' + closeDelim).length;
      inverseContent = template.slice(elseStart, endPosition);
    }

    const children = this.parseTemplate(content);
    const inverse = inverseContent ? this.parseTemplate(inverseContent) : undefined;

    return {
      block: {
        type: 'block',
        expression,
        content: helperName,
        args: parsedExpr.args,
        hash: parsedExpr.hash,
        children,
        inverse
      },
      endIndex: endPosition + (openDelim + '/' + helperName + closeDelim).length
    };
  }

  private parseExpression(expression: string): { type: 'variable' | 'helper'; args?: string[]; hash?: Record<string, any> } {
    // Simple parsing - could be enhanced
    const parts = expression.split(/\s+/);
    
    if (parts.length === 1) {
      return { type: 'variable' };
    } else {
      return {
        type: 'helper',
        args: parts,
        hash: {}
      };
    }
  }

  private async renderBlocks(blocks: ParsedBlock[], context: any): Promise<string> {
    let result = '';
    
    for (const block of blocks) {
      try {
        switch (block.type) {
          case 'text':
            result += block.content;
            break;
            
          case 'comment':
            // Comments are ignored
            break;
            
          case 'variable':
            const value = await this.evaluateExpression(block.expression || '', context);
            // Check if this specific variable should not be escaped (triple braces)
            const shouldEscape = block.hash?.escapeHtml === false ? false : this.options.escapeHtml;
            result += this.toString(shouldEscape ? this.escapeHtml(value) : value);
            break;
            
          case 'helper':
            const helperResult = await this.evaluateExpression(block.expression || '', context);
            result += this.toString(helperResult);
            break;
            
          case 'block':
            const blockResult = await this.evaluateBlockHelper(block, context);
            result += blockResult;
            break;
        }
      } catch (error) {
        if (this.options.strictMode) {
          throw error;
        }
        this.options.logger.warn(`Template evaluation error: ${error}`);
      }
    }
    
    return result;
  }

  private async evaluateBlockHelper(block: ParsedBlock, context: any): Promise<string> {
    const helperName = block.args?.[0] || '';
    const helper = this.helpers.get(helperName);
    
    if (!helper) {
      throw new Error(`Unknown helper: ${helperName}`);
    }

    const args = block.args?.slice(1).map(arg => this.resolveValue(arg, context)) || [];
    
    const options: HelperOptions = {
      fn: async (ctx: any) => {
        return block.children ? await this.renderBlocks(block.children, ctx) : '';
      },
      inverse: async (ctx: any) => {
        return block.inverse ? await this.renderBlocks(block.inverse, ctx) : '';
      },
      hash: block.hash || {}
    };

    const result = await helper.call(context, ...args, options);
    return Promise.resolve(result);
  }

  private async evaluateExpression(expression: string, context: any): Promise<any> {
    if (!expression) return '';

    // Handle function calls with arguments
    const functionMatch = expression.match(/^(\w+)\s+(.+)$/);
    if (functionMatch) {
      const [, funcName, argsStr] = functionMatch;
      if (this.functions.has(funcName)) {
        try {
          const fn = this.functions.get(funcName)!;
          const args = this.parseArguments(argsStr, context);
          const result = await fn(...args);
          return result;
        } catch (error) {
          if (this.options.strictMode) {
            throw error;
          }
          this.options.logger.warn('Function error', { 
            function: funcName,
            error: error instanceof Error ? error.message : String(error) 
          });
          return '';
        }
      } else {
        // Log warning for missing function with arguments
        this.options.logger.warn(`Function not found: ${funcName}`, { expression });
        return '';
      }
    }

    // Handle simple function calls (no arguments)
    if (this.functions.has(expression)) {
      try {
        const fn = this.functions.get(expression)!;
        const result = await fn();
        return result;
      } catch (error) {
        if (this.options.strictMode) {
          throw error;
        }
        this.options.logger.warn('Function error', { 
          function: expression,
          error: error instanceof Error ? error.message : String(error) 
        });
        return '';
      }
    }

    // Handle simple property access
    return this.getProperty(expression, context);
  }

  private parseArguments(argsStr: string, context: any): any[] {
    // Enhanced argument parsing
    const args: any[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    
    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];
      
      if (!inQuotes && (char === '"' || char === "'")) {
        inQuotes = true;
        quoteChar = char;
      } else if (inQuotes && char === quoteChar) {
        inQuotes = false;
        args.push(current);
        current = '';
        quoteChar = '';
      } else if (!inQuotes && char === ' ') {
        if (current.trim()) {
          args.push(this.resolveValue(current.trim(), context));
          current = '';
        }
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      if (inQuotes) {
        args.push(current);
      } else {
        args.push(this.resolveValue(current.trim(), context));
      }
    }
    
    return args;
  }

  private resolveValue(value: string, context: any): any {
    // Handle quoted strings
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    
    // Handle numbers
    if (/^\d+(\.\d+)?$/.test(value)) {
      return parseFloat(value);
    }
    
    // Handle booleans
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (value === 'undefined') return undefined;
    
    // Handle property access
    return this.getProperty(value, context);
  }

  private getProperty(path: string, data: any): any {
    if (!path || path === 'this') return data;
    if (!data) {
      if (this.options.strictMode) {
        throw new Error(`Variable not found: ${path}`);
      }
      return '';
    }

    const parts = path.split('.');
    let current = data;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      if (current == null) {
        if (this.options.strictMode) {
          const missingPath = parts.slice(0, i + 1).join('.');
          throw new Error(`Variable not found: ${missingPath}`);
        }
        return '';
      }
      
      // Handle array access with negative indices
      if (Array.isArray(current) && /^-?\d+$/.test(part)) {
        const index = parseInt(part);
        current = index < 0 ? current[current.length + index] : current[index];
      } else {
        current = current[part];
      }
    }

    // Check if final value is undefined in strict mode
    if (current === undefined && this.options.strictMode) {
      throw new Error(`Variable not found: ${path}`);
    }

    return current;
  }

  private isTruthy(value: any): boolean {
    if (value == null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    // For non-array objects, follow JavaScript truthiness (objects are always truthy)
    if (typeof value === 'object') return true;
    return Boolean(value);
  }

  private toString(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private escapeHtml(str: string): string {
    if (typeof str !== 'string') return this.toString(str);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}