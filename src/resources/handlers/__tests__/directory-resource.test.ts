import * as fs from 'fs/promises';
import * as path from 'path';
import { DirectoryResourceHandler } from '../directory-resource';
import { ResourceConfig } from '../../../shared/types';
import { glob } from 'glob';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('glob');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockGlob = glob as jest.MockedFunction<typeof glob>;

describe('DirectoryResourceHandler', () => {
  let handler: DirectoryResourceHandler;
  const testPath = '/test/directory';
  const absolutePath = path.resolve(testPath);

  beforeEach(() => {
    handler = new DirectoryResourceHandler();
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a directory resource with absolute path', async () => {
      const config: ResourceConfig = {
        source: testPath,
        type: 'directory'
      };

      const resource = await handler.create(config);

      expect(resource.type).toBe('directory');
      expect(resource.source).toBe(testPath);
      expect(resource.path).toBe(absolutePath);
    });

    describe('exists', () => {
      it('should return true for existing directory', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory'
        };

        mockFs.stat.mockResolvedValueOnce({
          isDirectory: () => true
        } as any);

        const resource = await handler.create(config);
        const exists = await resource.exists();

        expect(exists).toBe(true);
        expect(mockFs.stat).toHaveBeenCalledWith(absolutePath);
      });

      it('should return false for non-directory file', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory'
        };

        mockFs.stat.mockResolvedValueOnce({
          isDirectory: () => false
        } as any);

        const resource = await handler.create(config);
        const exists = await resource.exists();

        expect(exists).toBe(false);
      });

      it('should return false when path does not exist', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory'
        };

        mockFs.stat.mockRejectedValueOnce(new Error('ENOENT'));

        const resource = await handler.create(config);
        const exists = await resource.exists();

        expect(exists).toBe(false);
      });
    });

    describe('validate', () => {
      it('should validate successfully when mustExist is false', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory',
          mustExist: false
        };

        const resource = await handler.create(config);
        const validation = await resource.validate();

        expect(validation.valid).toBe(true);
        expect(validation.errors).toEqual([]);
      });

      it('should validate successfully when directory exists', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory',
          mustExist: true
        };

        mockFs.stat.mockResolvedValueOnce({
          isDirectory: () => true
        } as any);

        const resource = await handler.create(config);
        const validation = await resource.validate();

        expect(validation.valid).toBe(true);
        expect(validation.errors).toEqual([]);
      });

      it('should fail validation when directory does not exist', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory',
          mustExist: true
        };

        mockFs.stat.mockRejectedValueOnce(new Error('ENOENT'));

        const resource = await handler.create(config);
        const validation = await resource.validate();

        expect(validation.valid).toBe(false);
        expect(validation.errors).toContain(`Directory does not exist: ${absolutePath}`);
      });

      it('should fail validation when path is not a directory', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory',
          mustExist: true
        };

        mockFs.stat.mockResolvedValueOnce({
          isDirectory: () => false
        } as any);

        const resource = await handler.create(config);
        const validation = await resource.validate();

        expect(validation.valid).toBe(false);
        expect(validation.errors).toContain(`Path exists but is not a directory: ${absolutePath}`);
      });
    });

    describe('list', () => {
      it('should list directory contents', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory'
        };

        const mockEntries = [
          { name: 'file1.txt', isDirectory: () => false },
          { name: 'subdir', isDirectory: () => true },
          { name: 'file2.js', isDirectory: () => false }
        ];

        mockFs.readdir.mockResolvedValueOnce(mockEntries as any);
        
        // Mock stat calls for each entry
        mockFs.stat
          .mockResolvedValueOnce({
            size: 1024,
            mtime: new Date('2023-01-01')
          } as any)
          .mockResolvedValueOnce({
            size: 0,
            mtime: new Date('2023-01-02')
          } as any)
          .mockResolvedValueOnce({
            size: 2048,
            mtime: new Date('2023-01-03')
          } as any);

        const resource = await handler.create(config);
        const files = await resource.list();

        expect(files).toHaveLength(3);
        expect(files[0]).toEqual({
          name: 'file1.txt',
          path: path.join(absolutePath, 'file1.txt'),
          type: 'file',
          size: 1024,
          modified: new Date('2023-01-01')
        });
        expect(files[1]).toEqual({
          name: 'subdir',
          path: path.join(absolutePath, 'subdir'),
          type: 'directory',
          size: 0,
          modified: new Date('2023-01-02')
        });
      });

      it('should filter out . and .. entries', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory'
        };

        const mockEntries = [
          { name: '.', isDirectory: () => true },
          { name: '..', isDirectory: () => true },
          { name: 'file.txt', isDirectory: () => false }
        ];

        mockFs.readdir.mockResolvedValueOnce(mockEntries as any);
        mockFs.stat.mockResolvedValueOnce({
          size: 100,
          mtime: new Date()
        } as any);

        const resource = await handler.create(config);
        const files = await resource.list();

        expect(files).toHaveLength(1);
        expect(files[0].name).toBe('file.txt');
      });

      it('should handle empty directory', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory'
        };

        mockFs.readdir.mockResolvedValueOnce([]);

        const resource = await handler.create(config);
        const files = await resource.list();

        expect(files).toEqual([]);
      });
    });

    describe('walk', () => {
      it('should recursively walk directory tree', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory'
        };

        // Mock root directory
        mockFs.readdir.mockResolvedValueOnce([
          { name: 'file1.txt', isDirectory: () => false },
          { name: 'subdir', isDirectory: () => true }
        ] as any);

        // Mock subdirectory
        mockFs.readdir.mockResolvedValueOnce([
          { name: 'file2.txt', isDirectory: () => false }
        ] as any);

        // Mock stat calls
        mockFs.stat
          .mockResolvedValueOnce({ size: 100, mtime: new Date('2023-01-01') } as any)
          .mockResolvedValueOnce({ size: 0, mtime: new Date('2023-01-02') } as any)
          .mockResolvedValueOnce({ size: 200, mtime: new Date('2023-01-03') } as any);

        const resource = await handler.create(config);
        const files: any[] = [];
        
        for await (const file of resource.walk()) {
          files.push(file);
        }

        expect(files).toHaveLength(3);
        expect(files[0].name).toBe('file1.txt');
        expect(files[0].type).toBe('file');
        expect(files[1].name).toBe('subdir');
        expect(files[1].type).toBe('directory');
        expect(files[2].name).toBe('file2.txt');
        expect(files[2].path).toContain('subdir');
      });

      it('should skip . and .. entries during walk', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory'
        };

        mockFs.readdir.mockResolvedValueOnce([
          { name: '.', isDirectory: () => true },
          { name: '..', isDirectory: () => true },
          { name: 'file.txt', isDirectory: () => false }
        ] as any);

        mockFs.stat.mockResolvedValueOnce({ size: 100, mtime: new Date() } as any);

        const resource = await handler.create(config);
        const files: any[] = [];
        
        for await (const file of resource.walk()) {
          files.push(file);
        }

        expect(files).toHaveLength(1);
        expect(files[0].name).toBe('file.txt');
      });

      it('should handle empty directory tree', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory'
        };

        mockFs.readdir.mockResolvedValueOnce([]);

        const resource = await handler.create(config);
        const files: any[] = [];
        
        for await (const file of resource.walk()) {
          files.push(file);
        }

        expect(files).toEqual([]);
      });
    });

    describe('glob', () => {
      it('should find files matching pattern', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory'
        };

        const expectedFiles = [
          path.join(absolutePath, 'src/file1.js'),
          path.join(absolutePath, 'src/file2.js')
        ];

        mockGlob.mockResolvedValueOnce(expectedFiles);

        const resource = await handler.create(config);
        const files = await resource.glob('**/*.js');

        expect(files).toEqual(expectedFiles);
        expect(mockGlob).toHaveBeenCalledWith(
          path.join(absolutePath, '**/*.js'),
          {
            ignore: ['**/node_modules/**', '**/.git/**']
          }
        );
      });

      it('should ignore node_modules and .git by default', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory'
        };

        mockGlob.mockResolvedValueOnce([]);

        const resource = await handler.create(config);
        await resource.glob('**/*');

        expect(mockGlob).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            ignore: ['**/node_modules/**', '**/.git/**']
          })
        );
      });

      it('should handle no matches', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory'
        };

        mockGlob.mockResolvedValueOnce([]);

        const resource = await handler.create(config);
        const files = await resource.glob('**/*.xyz');

        expect(files).toEqual([]);
      });

      it('should handle complex patterns', async () => {
        const config: ResourceConfig = {
          source: testPath,
          type: 'directory'
        };

        const pattern = '**/*.{js,ts,jsx,tsx}';
        mockGlob.mockResolvedValueOnce([]);

        const resource = await handler.create(config);
        await resource.glob(pattern);

        expect(mockGlob).toHaveBeenCalledWith(
          path.join(absolutePath, pattern),
          expect.any(Object)
        );
      });
    });
  });

  describe('edge cases', () => {
    it('should handle relative paths correctly', async () => {
      const config: ResourceConfig = {
        source: './relative/path',
        type: 'directory'
      };

      const resource = await handler.create(config);

      expect(resource.source).toBe('./relative/path');
      expect(resource.path).toBe(path.resolve('./relative/path'));
    });

    it('should handle absolute paths correctly', async () => {
      const absoluteSource = '/absolute/path';
      const config: ResourceConfig = {
        source: absoluteSource,
        type: 'directory'
      };

      const resource = await handler.create(config);

      expect(resource.source).toBe(absoluteSource);
      expect(resource.path).toBe(absoluteSource);
    });

    it('should handle paths with trailing slashes', async () => {
      const config: ResourceConfig = {
        source: testPath + '/',
        type: 'directory'
      };

      const resource = await handler.create(config);

      expect(resource.path).toBe(absolutePath);
    });
  });
});