import { BaseResource, ResourceConfig, ValidationResult } from '../shared/types';
import { ReadableStream } from 'stream/web';

// Resource handler interface
export interface ResourceHandler<T extends BaseResource = BaseResource> {
  create(config: ResourceConfig): Promise<T>;
}

// File resource types
export interface FileStats {
  size: number;
  modified: Date;
  created: Date;
  isSymlink: boolean;
}

export interface FileResource extends BaseResource {
  type: 'file';
  path: string;
  read(): Promise<string>;
  readStream(): ReadableStream;
  stat(): Promise<FileStats>;
}

// Directory resource types
export interface FileInfo {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: Date;
}

export interface DirectoryResource extends BaseResource {
  type: 'directory';
  path: string;
  list(): Promise<FileInfo[]>;
  walk(): AsyncIterableIterator<FileInfo>;
  glob(pattern: string): Promise<string[]>;
}

// Glob resource types
export interface GlobResource extends BaseResource {
  type: 'glob';
  pattern: string;
  baseDir: string;
  resolve(): Promise<string[]>;
  stream(): AsyncIterableIterator<string>;
}

// URL resource types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';

export interface UrlResource extends BaseResource {
  type: 'url';
  url: URL;
  method: HttpMethod;
  headers?: Record<string, string>;
  fetch(): Promise<Response>;
  stream(): Promise<ReadableStream>;
}

// API resource types
export interface ApiConfig {
  url: string;
  options?: RequestInit;
  schema?: any; // Would be z.ZodSchema in real implementation
  transform?: (data: any) => any;
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
  duration: number;
}

export interface ApiResource extends BaseResource {
  type: 'api';
  config: ApiConfig;
  execute<T = any>(): Promise<ApiResponse<T>>;
  validate(): Promise<ValidationResult>;
}

// Command resource types
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
}

export interface CommandOutput {
  type: 'stdout' | 'stderr' | 'exit';
  data?: string;
  exitCode?: number;
}

export interface CommandResource extends BaseResource {
  type: 'command';
  command: string;
  args: string[];
  execute(): Promise<CommandResult>;
  stream(): AsyncIterableIterator<CommandOutput>;
}

// None resource type
export interface NoneResource extends BaseResource {
  type: 'none';
}

// Union type for all resources
export type Resource = 
  | FileResource 
  | DirectoryResource 
  | GlobResource 
  | UrlResource 
  | ApiResource 
  | CommandResource 
  | NoneResource;

// Process result types
export interface ProcessResult {
  resource: Resource;
  success: boolean;
  result?: any;
  error?: Error;
}

export interface ProcessOptions {
  parallel?: boolean;
  maxConcurrency?: number;
}