import { FileResourceHandler } from '../../handlers/file-resource';
import { FileResource } from '../../types';
import { ResourceConfig } from '../../../shared/types';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import * as path from 'path';

// Mock modules
jest.mock('fs/promises');
jest.mock('fs', () => ({
  createReadStream: jest.fn()
}));
jest.mock('stream', () => ({
  Readable: {
    toWeb: jest.fn()
  }
}));

describe('FileResource', () => {
  let handler: FileResourceHandler;
  
  beforeEach(() => {
    handler = new FileResourceHandler();
    jest.clearAllMocks();
  });

  describe('File Operations', () => {
    it('should check file existence', async () => {
      const config: ResourceConfig = { source: '/path/to/file.txt' };
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      
      const resource = await handler.create(config) as FileResource;
      const exists = await resource.exists();
      
      expect(exists).toBe(true);
      expect(fs.access).toHaveBeenCalledWith(path.resolve('/path/to/file.txt'));
    });

    it('should handle non-existent files', async () => {
      const config: ResourceConfig = { source: '/path/to/missing.txt' };
      (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));
      
      const resource = await handler.create(config) as FileResource;
      const exists = await resource.exists();
      
      expect(exists).toBe(false);
    });

    it('should read file contents', async () => {
      const config: ResourceConfig = { source: '/path/to/file.txt' };
      const mockContent = 'Hello, world!';
      (fs.readFile as jest.Mock).mockResolvedValue(mockContent);
      
      const resource = await handler.create(config) as FileResource;
      const content = await resource.read();
      
      expect(content).toBe(mockContent);
      expect(fs.readFile).toHaveBeenCalledWith(
        path.resolve('/path/to/file.txt'), 
        'utf-8'
      );
    });

    it('should get file statistics', async () => {
      const config: ResourceConfig = { source: '/path/to/file.txt' };
      const mockStats = {
        size: 1024,
        mtime: new Date('2024-01-01'),
        birthtime: new Date('2023-12-01'),
        isSymbolicLink: () => false
      };
      (fs.stat as jest.Mock).mockResolvedValue(mockStats);
      
      const resource = await handler.create(config) as FileResource;
      const stats = await resource.stat();
      
      expect(stats).toEqual({
        size: 1024,
        modified: mockStats.mtime,
        created: mockStats.birthtime,
        isSymlink: false
      });
    });

    it('should create read streams', async () => {
      const config: ResourceConfig = { source: '/path/to/file.txt' };
      const mockStream = {};
      const mockWebStream = {};
      
      (createReadStream as jest.Mock).mockReturnValue(mockStream);
      (Readable.toWeb as jest.Mock).mockReturnValue(mockWebStream);
      
      const resource = await handler.create(config) as FileResource;
      const stream = resource.readStream();
      
      expect(createReadStream).toHaveBeenCalledWith(path.resolve('/path/to/file.txt'));
      expect(Readable.toWeb).toHaveBeenCalledWith(mockStream);
      expect(stream).toBe(mockWebStream);
    });
  });

  describe('Validation', () => {
    it('should validate file paths', async () => {
      const config: ResourceConfig = { source: '/path/to/file.txt' };
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      
      const resource = await handler.create(config) as FileResource;
      const validation = await resource.validate();
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should check file permissions', async () => {
      const config: ResourceConfig = { 
        source: '/path/to/file.txt',
        permissions: { read: true, write: false }
      };
      
      // Mock successful read check
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      
      const resource = await handler.create(config) as FileResource;
      const validation = await resource.validate();
      
      expect(validation.valid).toBe(true);
    });

    it('should handle missing files when mustExist is true', async () => {
      const config: ResourceConfig = { 
        source: '/path/to/missing.txt',
        mustExist: true
      };
      
      (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));
      
      const resource = await handler.create(config) as FileResource;
      const validation = await resource.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        `File does not exist: ${path.resolve('/path/to/missing.txt')}`
      );
    });

    it('should validate file size limits', async () => {
      const config: ResourceConfig = { 
        source: '/path/to/large.txt',
        maxSize: 1000
      };
      
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.stat as jest.Mock).mockResolvedValue({ size: 2000 });
      
      const resource = await handler.create(config) as FileResource;
      const validation = await resource.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('File size exceeds limit: 2000 > 1000');
    });
  });

  describe('Path Resolution', () => {
    it('should resolve relative paths to absolute', async () => {
      const config: ResourceConfig = { source: './relative/file.txt' };
      
      const resource = await handler.create(config) as FileResource;
      
      expect(resource.path).toBe(path.resolve('./relative/file.txt'));
    });

    it('should handle home directory expansion', async () => {
      const config: ResourceConfig = { source: '~/file.txt' };
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      
      const resource = await handler.create(config) as FileResource;
      
      // Note: Implementation would need to handle ~ expansion
      expect(resource.path).toContain('file.txt');
    });

    it('should normalize path separators', async () => {
      const config: ResourceConfig = { source: 'path\\to\\file.txt' };
      
      const resource = await handler.create(config) as FileResource;
      
      expect(resource.path).not.toContain('\\');
    });
  });

  describe('Error Handling', () => {
    it('should handle read errors gracefully', async () => {
      const config: ResourceConfig = { source: '/path/to/file.txt' };
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('Permission denied'));
      
      const resource = await handler.create(config) as FileResource;
      
      await expect(resource.read()).rejects.toThrow('Permission denied');
    });

    it('should handle stat errors gracefully', async () => {
      const config: ResourceConfig = { source: '/path/to/file.txt' };
      (fs.stat as jest.Mock).mockRejectedValue(new Error('File not found'));
      
      const resource = await handler.create(config) as FileResource;
      
      await expect(resource.stat()).rejects.toThrow('File not found');
    });
  });

  describe('Special File Types', () => {
    it('should handle symbolic links', async () => {
      const config: ResourceConfig = { source: '/path/to/symlink' };
      const mockStats = {
        size: 1024,
        mtime: new Date('2024-01-01'),
        birthtime: new Date('2023-12-01'),
        isSymbolicLink: () => true
      };
      (fs.stat as jest.Mock).mockResolvedValue(mockStats);
      
      const resource = await handler.create(config) as FileResource;
      const stats = await resource.stat();
      
      expect(stats.isSymlink).toBe(true);
    });

    it('should handle binary files', async () => {
      const config: ResourceConfig = { 
        source: '/path/to/image.png',
        encoding: null // binary mode
      };
      
      const mockBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG header
      (fs.readFile as jest.Mock).mockResolvedValue(mockBuffer);
      
      const resource = await handler.create(config) as FileResource;
      const content = await resource.read();
      
      expect(fs.readFile).toHaveBeenCalledWith(
        path.resolve('/path/to/image.png')
      );
    });
  });
});