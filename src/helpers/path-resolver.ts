import * as path from 'path';
import * as fs from 'fs/promises';

export class PathResolver {
  private workingDirectory: string;
  private projectMarkers = ['package.json', '.git', 'tsconfig.json', '.roast'];
  private maxSymlinkDepth = 10;
  private maxPathDepth = 50;
  private strictSecurity: boolean;

  constructor(workingDirectory: string = process.cwd(), options?: { strictSecurity?: boolean }) {
    this.workingDirectory = path.resolve(workingDirectory);
    this.strictSecurity = options?.strictSecurity ?? true;
  }

  async resolve(filePath: string): Promise<string> {
    // Security: Validate input
    filePath = this.sanitizePath(filePath);
    
    // Normalize Windows paths to Unix style for consistent handling
    filePath = filePath.replace(/\\/g, '/');
    
    // Security: Check for invalid characters on Windows
    if (process.platform === 'win32' && this.containsInvalidWindowsChars(filePath)) {
      throw new Error(`Invalid path characters in: ${filePath}`);
    }

    // If absolute path, check if it exists first
    if (path.isAbsolute(filePath)) {
      const normalized = path.normalize(filePath);
      
      // In non-strict mode, allow existing absolute paths
      if (!this.strictSecurity && await this.exists(normalized)) {
        return normalized;
      }
      
      // In strict mode or if file doesn't exist, enforce workspace boundaries
      if (!this.isWithinWorkspace(normalized)) {
        // Force it to be relative to workspace
        filePath = path.relative(this.workingDirectory, normalized);
        if (filePath.startsWith('..')) {
          // If still outside, use just the basename
          filePath = path.basename(normalized);
        }
      } else if (await this.exists(normalized)) {
        return normalized;
      }
    }

    // Try relative to working directory
    const relativeToWd = path.resolve(this.workingDirectory, filePath);
    const normalizedPath = path.normalize(relativeToWd);
    
    // Security: Ensure resolved path is within workspace
    if (!this.isWithinWorkspace(normalizedPath)) {
      // In non-strict mode, allow going up a reasonable amount
      if (!this.strictSecurity) {
        const relative = path.relative(this.workingDirectory, normalizedPath);
        const upLevels = relative.split(path.sep).filter(part => part === '..').length;
        if (upLevels <= 2) {
          // Allow up to 2 levels up for common project structures
          return normalizedPath;
        }
      }
      
      // In strict mode or too many levels up, force to workspace bounds
      const segments = filePath.split(/[\/\\]+/);
      const lastSegment = segments[segments.length - 1];
      const safeFilename = lastSegment && lastSegment !== '..' && lastSegment !== '.' 
        ? lastSegment.replace(/\.\./g, '') 
        : 'file';
      return path.join(this.workingDirectory, safeFilename);
    }
    
    // Security: Check path depth to prevent resource exhaustion
    if (this.getPathDepth(normalizedPath) > this.maxPathDepth) {
      throw new Error('Path depth exceeds maximum allowed');
    }
    
    if (await this.exists(normalizedPath)) {
      // Security: Check for symlinks that might escape workspace
      try {
        const resolved = await this.resolveSymlinks(normalizedPath);
        if (!this.isWithinWorkspace(resolved)) {
          // Don't follow symlinks outside workspace
          return normalizedPath;
        }
        return resolved;
      } catch (error: any) {
        // If symlink resolution fails (circular, too deep, etc), return the normalized path
        if (error.message === 'Maximum symlink depth exceeded') {
          throw error;
        }
        return normalizedPath;
      }
    }

    // Try removing duplicate segments
    const deduped = this.removeDuplicateSegments(filePath);
    if (deduped !== filePath) {
      const dedupedPath = path.resolve(this.workingDirectory, deduped);
      if (await this.exists(dedupedPath) && this.isWithinWorkspace(dedupedPath)) {
        return dedupedPath;
      }
    }

    // Try resolving from project markers
    const fromMarker = await this.resolveFromProjectMarkers(filePath);
    if (fromMarker && this.isWithinWorkspace(fromMarker)) {
      return fromMarker;
    }

    // Return the normalized path even if it doesn't exist
    // Final security check
    if (!this.isWithinWorkspace(normalizedPath)) {
      const segments = filePath.split(/[\/\\]+/);
      const lastSegment = segments[segments.length - 1];
      const safeFilename = lastSegment && lastSegment !== '..' && lastSegment !== '.' 
        ? lastSegment.replace(/\.\./g, '') 
        : 'file';
      return path.join(this.workingDirectory, safeFilename);
    }
    return normalizedPath;
  }
  
  private sanitizePath(filePath: string): string {
    // Remove null bytes
    filePath = filePath.replace(/\x00/g, '');
    
    // Decode URL encoding that might hide path traversal
    try {
      filePath = decodeURIComponent(filePath);
    } catch {
      // If decoding fails, use as-is
    }
    
    // Normalize Unicode to prevent bypasses
    filePath = filePath.normalize('NFC');
    
    // Remove Unicode direction override characters
    filePath = filePath.replace(/[\u202A-\u202E\u2066-\u2069]/g, '');
    
    return filePath;
  }
  
  private containsInvalidWindowsChars(filePath: string): boolean {
    // Windows invalid characters: < > : " | ? *
    return /[<>:"|?*]/.test(filePath);
  }
  
  private isWithinWorkspace(resolvedPath: string): boolean {
    const normalized = path.normalize(resolvedPath);
    const workspace = path.normalize(this.workingDirectory);
    
    // Must start with workspace path
    return normalized === workspace || normalized.startsWith(workspace + path.sep);
  }
  
  private getPathDepth(filePath: string): number {
    return filePath.split(path.sep).filter(s => s !== '').length;
  }
  
  private async resolveSymlinks(filePath: string, depth: number = 0): Promise<string> {
    if (depth > this.maxSymlinkDepth) {
      throw new Error('Maximum symlink depth exceeded');
    }
    
    try {
      const stats = await fs.lstat(filePath);
      if (stats.isSymbolicLink()) {
        const target = await fs.readlink(filePath);
        const resolved = path.resolve(path.dirname(filePath), target);
        
        // Recursively resolve if target is also a symlink
        return this.resolveSymlinks(resolved, depth + 1);
      }
    } catch {
      // Not a symlink or doesn't exist
    }
    
    return filePath;
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private removeDuplicateSegments(filePath: string): string {
    const segments = filePath.split(path.sep);
    const deduped: string[] = [];
    
    for (let i = 0; i < segments.length; i++) {
      // Only add if it's not the same as the previous segment
      if (i === 0 || segments[i] !== segments[i - 1]) {
        deduped.push(segments[i]);
      }
    }
    
    return deduped.join(path.sep);
  }

  private async resolveFromProjectMarkers(filePath: string): Promise<string | null> {
    const projectRoot = await this.findProjectRoot(this.workingDirectory);
    if (!projectRoot) {
      return null;
    }

    // Extract the last segment that might be a project marker
    const segments = filePath.split(path.sep);
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i] === 'src' || segments[i] === 'lib' || segments[i] === 'test') {
        // Try path from project root starting at this segment
        const fromMarker = segments.slice(i).join(path.sep);
        const resolvedPath = path.join(projectRoot, fromMarker);
        if (await this.exists(resolvedPath)) {
          return resolvedPath;
        }
      }
    }

    return null;
  }

  async findProjectRoot(startDir: string): Promise<string | null> {
    let currentDir = startDir;
    
    while (currentDir !== path.dirname(currentDir)) {
      for (const marker of this.projectMarkers) {
        const markerPath = path.join(currentDir, marker);
        if (await this.exists(markerPath)) {
          return currentDir;
        }
      }
      currentDir = path.dirname(currentDir);
    }
    
    return null;
  }

  resolveAll(filePaths: string[]): Promise<string[]> {
    return Promise.all(filePaths.map(p => this.resolve(p)));
  }

  async resolveDirectory(dirPath: string): Promise<string[]> {
    const resolvedDir = await this.resolve(dirPath);
    
    try {
      const entries = await fs.readdir(resolvedDir, { withFileTypes: true });
      return entries
        .filter(entry => entry.isFile())
        .map(entry => path.join(resolvedDir, entry.name));
    } catch {
      return [];
    }
  }
}