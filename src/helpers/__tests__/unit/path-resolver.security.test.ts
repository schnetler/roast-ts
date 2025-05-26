import { PathResolver } from '../../path-resolver';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

jest.mock('fs/promises');

describe('PathResolver - Security Tests', () => {
  let resolver: PathResolver;
  let mockFs: jest.Mocked<typeof fs>;
  let tempDir: string;

  beforeEach(() => {
    mockFs = jest.mocked(fs);
    tempDir = path.resolve('/safe/workspace');
    resolver = new PathResolver(tempDir);
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Default mock - no files exist and no symlinks
    mockFs.access.mockRejectedValue(new Error('ENOENT'));
    mockFs.lstat.mockRejectedValue(new Error('ENOENT'));
  });

  describe('Path Traversal Protection', () => {
    it('should prevent access to files outside working directory', async () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '../../../../etc/shadow',
        '../..',
        '..\\..\\..\\windows\\system32\\config\\sam',
        'subdir/../../../../../../etc/hosts',
        './././../../../etc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      ];

      for (const maliciousPath of maliciousPaths) {
        const result = await resolver.resolve(maliciousPath);
        
        // Should never resolve to a path outside the working directory
        const normalizedResult = path.normalize(result);
        expect(normalizedResult.startsWith(tempDir)).toBe(true);
        
        // Should not contain parent directory references after resolution
        expect(result).not.toContain('..');
      }
    });

    it('should handle symbolic link attacks', async () => {
      // Mock a symlink that points outside the workspace
      let lstatCallCount = 0;
      mockFs.lstat.mockImplementation(async () => {
        lstatCallCount++;
        if (lstatCallCount === 1) {
          // First call - it's a symlink
          return { isSymbolicLink: () => true } as any;
        }
        // Subsequent calls - not a symlink (to avoid infinite recursion)
        throw new Error('ENOENT');
      });
      mockFs.readlink.mockResolvedValue('/etc/passwd');
      mockFs.access.mockResolvedValue(undefined);
      
      const result = await resolver.resolve('config/database.yml');
      
      // Should not follow symlinks that escape the workspace
      expect(result).not.toBe('/etc/passwd');
      expect(result).toContain(tempDir);
    });

    it('should validate against null byte injection', async () => {
      const nullBytePaths = [
        'file.txt\x00.exe',
        'safe_file.txt\x00/etc/passwd',
        'data\x00../../etc/passwd'
      ];

      // No need to setup mocks - defaults handle non-existent files

      for (const maliciousPath of nullBytePaths) {
        const result = await resolver.resolve(maliciousPath);
        
        // Should sanitize null bytes
        expect(result).not.toContain('\x00');
      }
    });

    it('should handle Unicode normalization attacks', async () => {
      // Different Unicode representations of the same character
      const unicodePaths = [
        'café', // é as single character
        'cafe\u0301', // é as e + combining accent
        '\u202e\u202detc/passwd', // Right-to-left override
      ];

      for (const unicodePath of unicodePaths) {
        const result = await resolver.resolve(unicodePath);
        
        // Should normalize Unicode and sanitize
        expect(result).toContain(tempDir);
        // Direction override characters should be removed
        if (unicodePath.includes('\u202e')) {
          expect(result).not.toContain('\u202e');
          expect(result).not.toContain('\u202d');
        }
      }
    });
  });

  describe('Race Condition Protection', () => {
    it('should handle TOCTOU (Time-of-Check-Time-of-Use) vulnerabilities', async () => {
      let accessCallCount = 0;
      
      // Simulate file being moved between check and use
      mockFs.access.mockImplementation(async () => {
        accessCallCount++;
        if (accessCallCount === 1) {
          return; // File exists on first check
        }
        throw new Error('ENOENT'); // File gone on second check
      });
      
      // Override lstat to say it's not a symlink
      mockFs.lstat.mockResolvedValue({
        isSymbolicLink: () => false
      } as any);

      const result = await resolver.resolve('important.conf');
      
      // Should handle the case where file disappears
      expect(result).toBe(path.join(tempDir, 'important.conf'));
    });

    it('should use atomic operations for concurrent access', async () => {
      const concurrentRequests = 10;
      const testPath = 'shared-resource.lock';
      
      // Override default mock for this test only
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      // Launch concurrent resolutions
      const promises = Array(concurrentRequests).fill(null).map(() => 
        resolver.resolve(testPath)
      );

      const results = await Promise.all(promises);
      
      // All should resolve to the same path
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBe(1);
      expect(results[0]).toBe(path.join(tempDir, testPath));
    });
  });

  describe('Resource Exhaustion Protection', () => {
    it('should limit directory traversal depth', async () => {
      // Create a very deep path (over 50 levels)
      const deepPath = Array(60).fill('subdir').join('/') + '/file.txt';
      
      // Should reject paths that are too deep
      await expect(resolver.resolve(deepPath)).rejects.toThrow('Path depth exceeds maximum allowed');
    });

    it('should handle circular symbolic links', async () => {
      let depth = 0;
      
      // Always report as symlink
      mockFs.lstat.mockResolvedValue({
        isSymbolicLink: () => true
      } as any);
      
      // Create circular reference: link_a -> /safe/workspace/link_b -> /safe/workspace/link_a
      mockFs.readlink.mockImplementation(async (linkPath) => {
        depth++;
        const pathStr = String(linkPath);
        if (pathStr.includes('link_a')) {
          return path.join(tempDir, 'link_b');
        } else {
          return path.join(tempDir, 'link_a');
        }
      });
      
      // File exists check
      mockFs.access.mockResolvedValue(undefined);

      await expect(resolver.resolve('link_a')).rejects.toThrow('Maximum symlink depth exceeded');
      expect(depth).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid path characters', async () => {
      const invalidPaths = [
        'file<name>.txt',
        'file>name.txt',
        'file|name.txt',
        'file:name.txt',
        'file*name.txt',
        'file?name.txt',
        'file"name.txt',
        'file\0name.txt',
      ];

      if (process.platform === 'win32') {
        for (const invalidPath of invalidPaths) {
          await expect(resolver.resolve(invalidPath)).rejects.toThrow();
        }
      }
    });

    it('should handle extremely long paths', async () => {
      const longFilename = 'a'.repeat(255) + '.txt'; // Max filename length
      const longPath = 'very/deep/nested/path/' + longFilename;
      
      // Should handle long paths gracefully
      const result = await resolver.resolve(longPath);
      
      // Should be within workspace
      expect(result).toContain(tempDir);
      // Path should be reasonable (OS typically limits to 4096)
      expect(result.length).toBeLessThan(4096);
    });
  });

  describe('Permission Checks', () => {
    it('should respect file system permissions', async () => {
      mockFs.access.mockRejectedValue(Object.assign(
        new Error('EACCES: permission denied'),
        { code: 'EACCES' }
      ));

      const result = await resolver.resolve('restricted.conf');
      
      // Should return path even if not accessible
      expect(result).toBe(path.join(tempDir, 'restricted.conf'));
    });

    it('should not expose information about inaccessible directories', async () => {
      const sensitivePaths = [
        '/root/.ssh/id_rsa',
        '/etc/shadow',
        'C:\\Windows\\System32\\config\\SAM'
      ];

      for (const sensitivePath of sensitivePaths) {
        mockFs.access.mockRejectedValue(new Error('EACCES'));
        
        const result = await resolver.resolve(sensitivePath);
        
        // Should not expose the exact system path - it should be resolved relative to workspace
        expect(result).not.toEqual(sensitivePath);
        expect(result).toContain('workspace');
      }
    });
  });
});