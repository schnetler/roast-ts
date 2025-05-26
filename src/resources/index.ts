// Export all resource types
export * from './types';

// Export factory
export { ResourceFactory } from './resource-factory';

// Export processor
export { ResourceProcessor } from './resource-processor';

// Export handlers
export { FileResourceHandler } from './handlers/file-resource';
export { DirectoryResourceHandler } from './handlers/directory-resource';
export { GlobResourceHandler } from './handlers/glob-resource';
export { UrlResourceHandler } from './handlers/url-resource';
export { NoneResourceHandler } from './handlers/none-resource';

// Type guards
export const isFileResource = (r: any): r is import('./types').FileResource => 
  r?.type === 'file';

export const isDirectoryResource = (r: any): r is import('./types').DirectoryResource => 
  r?.type === 'directory';

export const isGlobResource = (r: any): r is import('./types').GlobResource => 
  r?.type === 'glob';

export const isUrlResource = (r: any): r is import('./types').UrlResource => 
  r?.type === 'url';

export const isApiResource = (r: any): r is import('./types').ApiResource => 
  r?.type === 'api';

export const isCommandResource = (r: any): r is import('./types').CommandResource => 
  r?.type === 'command';

export const isNoneResource = (r: any): r is import('./types').NoneResource => 
  r?.type === 'none';

// Initialize default handlers
import { ResourceFactory } from './resource-factory';
import { FileResourceHandler } from './handlers/file-resource';
import { DirectoryResourceHandler } from './handlers/directory-resource';
import { GlobResourceHandler } from './handlers/glob-resource';
import { UrlResourceHandler } from './handlers/url-resource';
import { NoneResourceHandler } from './handlers/none-resource';

// Register default handlers
ResourceFactory.register('file', new FileResourceHandler());
ResourceFactory.register('directory', new DirectoryResourceHandler());
ResourceFactory.register('glob', new GlobResourceHandler());
ResourceFactory.register('url', new UrlResourceHandler());
ResourceFactory.register('none', new NoneResourceHandler());