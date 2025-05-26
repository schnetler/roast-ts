/**
 * Deep merge utility for configuration objects
 */
export const deepmerge = {
  /**
   * Merge multiple objects deeply
   */
  all<T = any>(objects: Array<Partial<T>>): T {
    if (objects.length === 0) {
      return {} as T;
    }
    
    if (objects.length === 1) {
      return objects[0] as T;
    }
    
    return objects.reduce((result, obj) => {
      return this.merge(result, obj);
    }, {} as any) as T;
  },

  /**
   * Merge two objects deeply
   */
  merge<T = any>(target: any, source: any): T {
    if (!source || typeof source !== 'object') {
      return target;
    }

    const output = { ...target };
    
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (this.isObject(source[key])) {
          if (key in target && this.isObject(target[key])) {
            output[key] = this.merge(target[key], source[key]);
          } else {
            output[key] = source[key];
          }
        } else if (Array.isArray(source[key])) {
          // For arrays, replace rather than merge
          output[key] = [...source[key]];
        } else {
          output[key] = source[key];
        }
      }
    }
    
    return output;
  },

  /**
   * Check if value is a plain object
   */
  isObject(obj: any): boolean {
    return !!(obj && typeof obj === 'object' && !Array.isArray(obj) && !(obj instanceof Date));
  }
};

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2
  } = options;

  let lastError: any;
  let delay = initialDelay;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i < maxRetries) {
        await sleep(Math.min(delay, maxDelay));
        delay *= factor;
      }
    }
  }

  throw lastError;
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  
  return function debounced(...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return function throttled(...args: Parameters<T>) {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Create a promise that resolves after a timeout
 */
export function timeout<T>(
  promise: Promise<T>,
  ms: number,
  message = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(message)), ms)
    )
  ]);
}

/**
 * Chunk an array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  
  return chunks;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Create a unique ID
 */
export function createId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Safely parse JSON with error handling
 */
export function safeJsonParse<T = any>(json: string, fallback?: T): T | undefined {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Pick specific keys from an object
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  
  return result;
}

/**
 * Omit specific keys from an object
 */
export function omit<T, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  
  for (const key of keys) {
    delete result[key];
  }
  
  return result as Omit<T, K>;
}