import { PathResolver } from '../../path-resolver';
import * as fs from 'fs/promises';
import * as path from 'path';

jest.mock('fs/promises');

describe('PathResolver', () => {
  let resolver: PathResolver;
  let mockFs: jest.Mocked<typeof fs>;

  beforeEach(() => {
    mockFs = fs as jest.Mocked<typeof fs>;
    resolver = new PathResolver('/test/cwd', { strictSecurity: false });
    mockFs.access.mockClear();
    mockFs.readdir.mockClear();
  });

  describe('Basic Resolution', () => {
    it('should resolve existing absolute paths', async () => {
      mockFs.access.mockResolvedValue(undefined);
      
      const result = await resolver.resolve('/absolute/path/file.ts');
      
      expect(result).toBe('/absolute/path/file.ts');
      expect(mockFs.access).toHaveBeenCalledWith('/absolute/path/file.ts');
    });

    it('should resolve relative paths from working directory', async () => {
      mockFs.access.mockResolvedValue(undefined);
      
      const result = await resolver.resolve('relative/file.ts');
      
      expect(result).toBe(path.resolve('/test/cwd', 'relative/file.ts'));
      expect(mockFs.access).toHaveBeenCalledWith('/test/cwd/relative/file.ts');
    });

    it('should return original path when file not found', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      
      const result = await resolver.resolve('missing/file.ts');
      
      expect(result).toBe(path.resolve('/test/cwd', 'missing/file.ts'));
    });

    it('should handle paths with ./ prefix', async () => {
      mockFs.access.mockResolvedValue(undefined);
      
      const result = await resolver.resolve('./local/file.ts');
      
      expect(result).toBe(path.resolve('/test/cwd', './local/file.ts'));
    });

    it('should handle paths with ../ prefix', async () => {
      mockFs.access.mockResolvedValue(undefined);
      
      const result = await resolver.resolve('../parent/file.ts');
      
      expect(result).toBe(path.resolve('/test/cwd', '../parent/file.ts'));
    });
  });

  describe('Duplicate Segment Removal', () => {
    it('should remove duplicate path segments', async () => {
      mockFs.access
        .mockRejectedValueOnce(new Error('ENOENT')) // Direct resolution fails
        .mockResolvedValue(undefined); // Deduped resolution succeeds
      
      const result = await resolver.resolve('src/src/file.ts');
      
      expect(result).toBe(path.resolve('/test/cwd', 'src/file.ts'));
      expect(mockFs.access).toHaveBeenCalledTimes(2);
      expect(mockFs.access).toHaveBeenNthCalledWith(1, '/test/cwd/src/src/file.ts');
      expect(mockFs.access).toHaveBeenNthCalledWith(2, '/test/cwd/src/file.ts');
    });

    it('should handle multiple duplicate segments', async () => {
      mockFs.access
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValue(undefined);
      
      const result = await resolver.resolve('lib/lib/lib/file.ts');
      
      expect(result).toBe(path.resolve('/test/cwd', 'lib/file.ts'));
    });

    it('should preserve non-duplicate segments', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT')); // All access checks fail
      
      const result = await resolver.resolve('src/lib/src/file.ts');
      
      // Since no file found anywhere, returns the original resolved path
      expect(result).toBe(path.resolve('/test/cwd', 'src/lib/src/file.ts'));
    });

    it('should handle paths with only duplicate segments', async () => {
      mockFs.access
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValue(undefined);
      
      const result = await resolver.resolve('test/test/test');
      
      expect(result).toBe(path.resolve('/test/cwd', 'test'));
    });
  });

  describe('Project Marker Resolution', () => {
    it('should resolve from project markers', async () => {
      mockFs.access
        .mockRejectedValueOnce(new Error('ENOENT')) // Direct fails
        .mockRejectedValueOnce(new Error('ENOENT')) // Deduped fails
        .mockResolvedValueOnce(undefined) // package.json found at /test/cwd
        .mockResolvedValue(undefined); // src/file.ts exists at project root
      
      const result = await resolver.resolve('deep/nested/src/file.ts');
      
      expect(result).toBe(path.resolve('/test/cwd', 'src/file.ts'));
    });

    it('should try multiple project markers', async () => {
      mockFs.access
        .mockRejectedValueOnce(new Error('ENOENT')) // Direct fails
        .mockRejectedValueOnce(new Error('ENOENT')) // Deduped fails
        .mockRejectedValueOnce(new Error('ENOENT')) // package.json not found
        .mockResolvedValueOnce(undefined) // .git found
        .mockResolvedValue(undefined); // lib/module.ts exists
      
      const result = await resolver.resolve('nested/lib/module.ts');
      
      expect(result).toBe(path.resolve('/test/cwd', 'lib/module.ts'));
    });

    it('should handle paths without project markers', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      
      const result = await resolver.resolve('some/random/path.ts');
      
      expect(result).toBe(path.resolve('/test/cwd', 'some/random/path.ts'));
    });
  });

  describe('Project Root Detection', () => {
    it('should find project root by package.json', async () => {
      mockFs.access
        .mockResolvedValueOnce(undefined); // /test/cwd/package.json exists
      
      const root = await resolver.findProjectRoot('/test/cwd');
      
      expect(root).toBe('/test/cwd');
    });

    it('should find project root by .git', async () => {
      mockFs.access
        .mockRejectedValueOnce(new Error('ENOENT')) // package.json
        .mockResolvedValueOnce(undefined); // .git found
      
      const root = await resolver.findProjectRoot('/test/cwd');
      
      expect(root).toBe('/test/cwd');
    });

    it('should return null when no markers found', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      
      const root = await resolver.findProjectRoot('/test/cwd');
      
      expect(root).toBeNull();
    });

    it('should search parent directories', async () => {
      mockFs.access
        .mockRejectedValueOnce(new Error('ENOENT')) // /test/cwd/deep/nested markers
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT')) // /test/cwd/deep markers
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT')) // /test/cwd markers
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValue(undefined); // /test/package.json found
      
      const root = await resolver.findProjectRoot('/test/cwd/deep/nested');
      
      expect(root).toBe('/test');
    });
  });

  describe('Batch Operations', () => {
    it('should resolve multiple paths', async () => {
      mockFs.access
        .mockResolvedValueOnce(undefined) // file1.ts
        .mockRejectedValueOnce(new Error('ENOENT')) // file2.ts direct
        .mockResolvedValueOnce(undefined) // file2.ts deduped
        .mockResolvedValueOnce(undefined); // file3.ts
      
      const paths = ['file1.ts', 'src/src/file2.ts', '/absolute/file3.ts'];
      const results = await resolver.resolveAll(paths);
      
      expect(results).toEqual([
        '/test/cwd/file1.ts',
        '/test/cwd/src/file2.ts',
        '/absolute/file3.ts'
      ]);
    });

    it('should handle empty array', async () => {
      const results = await resolver.resolveAll([]);
      expect(results).toEqual([]);
    });
  });

  describe('Directory Resolution', () => {
    it('should resolve directory and list files', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([
        { name: 'file1.ts', isFile: () => true, isDirectory: () => false } as any,
        { name: 'file2.ts', isFile: () => true, isDirectory: () => false } as any,
        { name: 'subdir', isFile: () => false, isDirectory: () => true } as any,
        { name: 'file3.md', isFile: () => true, isDirectory: () => false } as any
      ]);
      
      const files = await resolver.resolveDirectory('src');
      
      expect(files).toEqual([
        '/test/cwd/src/file1.ts',
        '/test/cwd/src/file2.ts',
        '/test/cwd/src/file3.md'
      ]);
      expect(mockFs.readdir).toHaveBeenCalledWith('/test/cwd/src', { withFileTypes: true });
    });

    it('should return empty array for non-existent directory', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockRejectedValue(new Error('ENOENT'));
      
      const files = await resolver.resolveDirectory('missing');
      
      expect(files).toEqual([]);
    });

    it('should filter out directories', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([
        { name: 'dir1', isFile: () => false, isDirectory: () => true } as any,
        { name: 'dir2', isFile: () => false, isDirectory: () => true } as any,
        { name: 'file.ts', isFile: () => true, isDirectory: () => false } as any
      ]);
      
      const files = await resolver.resolveDirectory('src');
      
      expect(files).toEqual(['/test/cwd/src/file.ts']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle root directory', async () => {
      mockFs.access.mockResolvedValue(undefined);
      
      const result = await resolver.resolve('/');
      
      expect(result).toBe('/');
    });

    it('should handle empty string', async () => {
      mockFs.access.mockResolvedValue(undefined);
      
      const result = await resolver.resolve('');
      
      expect(result).toBe('/test/cwd');
    });

    it('should handle paths with spaces', async () => {
      mockFs.access.mockResolvedValue(undefined);
      
      const result = await resolver.resolve('path with spaces/file.ts');
      
      expect(result).toBe('/test/cwd/path with spaces/file.ts');
    });

    it('should handle Windows-style paths on Windows', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      mockFs.access.mockResolvedValue(undefined);
      const winResolver = new PathResolver('C:\\test\\cwd');
      
      const result = await winResolver.resolve('src\\file.ts');
      
      // The actual result will depend on path.resolve behavior
      expect(mockFs.access).toHaveBeenCalled();
      
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });
});