import * as path from 'path';

export class MockFileSystem {
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();
  
  constructor() {
    // Initialize with root directory
    this.directories.add('/');
  }

  async readFile(filePath: string, encoding: string = 'utf-8'): Promise<string> {
    const normalizedPath = path.normalize(filePath);
    
    if (!this.files.has(normalizedPath)) {
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
    }
    
    return this.files.get(normalizedPath)!;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const normalizedPath = path.normalize(filePath);
    const dir = path.dirname(normalizedPath);
    
    if (!this.directories.has(dir)) {
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
    }
    
    this.files.set(normalizedPath, content);
  }

  async exists(filePath: string): Promise<boolean> {
    const normalizedPath = path.normalize(filePath);
    return this.files.has(normalizedPath) || this.directories.has(normalizedPath);
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    const normalizedPath = path.normalize(dirPath);
    
    if (options?.recursive) {
      // Create all parent directories
      const parts = normalizedPath.split(path.sep).filter(Boolean);
      let currentPath = '/';
      
      for (const part of parts) {
        currentPath = path.join(currentPath, part);
        this.directories.add(currentPath);
      }
    } else {
      const parent = path.dirname(normalizedPath);
      if (!this.directories.has(parent)) {
        throw new Error(`ENOENT: no such file or directory, mkdir '${dirPath}'`);
      }
      this.directories.add(normalizedPath);
    }
  }

  async readdir(dirPath: string): Promise<string[]> {
    const normalizedPath = path.normalize(dirPath);
    
    if (!this.directories.has(normalizedPath)) {
      throw new Error(`ENOENT: no such file or directory, scandir '${dirPath}'`);
    }
    
    const entries: string[] = [];
    
    // Find all files in this directory
    for (const filePath of this.files.keys()) {
      if (path.dirname(filePath) === normalizedPath) {
        entries.push(path.basename(filePath));
      }
    }
    
    // Find all subdirectories
    for (const dir of this.directories) {
      if (path.dirname(dir) === normalizedPath && dir !== normalizedPath) {
        entries.push(path.basename(dir));
      }
    }
    
    return entries.sort();
  }

  async stat(filePath: string): Promise<{ isFile(): boolean; isDirectory(): boolean; size: number }> {
    const normalizedPath = path.normalize(filePath);
    
    if (this.files.has(normalizedPath)) {
      return {
        isFile: () => true,
        isDirectory: () => false,
        size: this.files.get(normalizedPath)!.length
      };
    }
    
    if (this.directories.has(normalizedPath)) {
      return {
        isFile: () => false,
        isDirectory: () => true,
        size: 0
      };
    }
    
    throw new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
  }

  // Test helper methods
  addFile(filePath: string, content: string): void {
    const normalizedPath = path.normalize(filePath);
    const dir = path.dirname(normalizedPath);
    
    // Ensure parent directory exists
    this.ensureDirectory(dir);
    this.files.set(normalizedPath, content);
  }

  addDirectory(dirPath: string): void {
    this.ensureDirectory(dirPath);
  }

  private ensureDirectory(dirPath: string): void {
    const normalizedPath = path.normalize(dirPath);
    const parts = normalizedPath.split(path.sep).filter(Boolean);
    let currentPath = '/';
    
    for (const part of parts) {
      currentPath = path.join(currentPath, part);
      this.directories.add(currentPath);
    }
  }

  reset(): void {
    this.files.clear();
    this.directories.clear();
    this.directories.add('/');
  }
}