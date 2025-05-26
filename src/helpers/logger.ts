import { Logger } from '@/shared/types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: any;
}

export interface Transport {
  write(entry: LogEntry): void;
}

export class ConsoleTransport implements Transport {
  write(entry: LogEntry): void {
    const { level, message, timestamp, ...metadata } = entry;
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (Object.keys(metadata).length > 0) {
      console.log(`${prefix} ${message}`, metadata);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
}

export interface StructuredLoggerOptions {
  level?: LogLevel;
  transport?: Transport;
  context?: Record<string, any>;
}

export class StructuredLogger implements Logger {
  private level: LogLevel;
  private transport: Transport;
  private context: Record<string, any>;
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor(options: StructuredLoggerOptions = {}) {
    this.level = options.level || 'info';
    this.transport = options.transport || new ConsoleTransport();
    this.context = options.context || {};
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.level];
  }

  private log(level: LogLevel, message: string, metadata?: any): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.context,
      ...metadata
    };

    if (metadata instanceof Error) {
      entry.error = {
        name: metadata.name,
        message: metadata.message,
        stack: metadata.stack
      };
    }

    this.transport.write(entry);
  }

  debug(message: string, metadata?: any): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: any): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: any): void {
    this.log('warn', message, metadata);
  }

  error(message: string, error?: Error | any): void {
    this.log('error', message, error);
  }

  child(context: Record<string, any>): Logger {
    return new StructuredLogger({
      level: this.level,
      transport: this.transport,
      context: { ...this.context, ...context }
    });
  }
}