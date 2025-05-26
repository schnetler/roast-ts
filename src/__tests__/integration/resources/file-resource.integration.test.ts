import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { FileResourceHandler } from '../../../resources/handlers/file-resource';
import { ResourceConfig } from '../../../shared/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('FileResource Integration Tests', () => {
  let testDir: string;
  let handler: FileResourceHandler;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'roast-file-resource-'));
    handler = new FileResourceHandler();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test directory:', error);
    }
  });

  describe('File operations', () => {
    it('should read real files from disk', async () => {
      // Create a test file
      const testFile = path.join(testDir, 'test.txt');
      const content = 'Real file content\nWith multiple lines\nAnd special chars: 🚀';
      await fs.writeFile(testFile, content, 'utf-8');

      // Create resource and read
      const config: ResourceConfig = { source: testFile };
      const resource = await handler.create(config);
      
      const readContent = await resource.read();
      expect(readContent).toBe(content);
    });

    it('should handle large files', async () => {
      // Create a large file (1MB)
      const largeFile = path.join(testDir, 'large.txt');
      const line = 'This is a line of text that will be repeated many times.\n';
      const content = line.repeat(20000); // ~1MB
      await fs.writeFile(largeFile, content, 'utf-8');

      const config: ResourceConfig = { source: largeFile };
      const resource = await handler.create(config);
      
      const readContent = await resource.read();
      expect(readContent.length).toBe(content.length);
    });

    it('should detect file changes', async () => {
      const testFile = path.join(testDir, 'changing.txt');
      await fs.writeFile(testFile, 'Initial content', 'utf-8');

      const config: ResourceConfig = { source: testFile };
      const resource = await handler.create(config);
      
      // Read initial content
      const content1 = await resource.read();
      expect(content1).toBe('Initial content');

      // Modify file
      await fs.writeFile(testFile, 'Updated content', 'utf-8');

      // Read again - should get new content
      const content2 = await resource.read();
      expect(content2).toBe('Updated content');
    });

    it('should handle file permissions', async () => {
      const protectedFile = path.join(testDir, 'protected.txt');
      await fs.writeFile(protectedFile, 'Protected content', 'utf-8');
      
      // Make file read-only
      await fs.chmod(protectedFile, 0o444);

      const config: ResourceConfig = { source: protectedFile };
      const resource = await handler.create(config);
      
      // Should still be able to read
      const content = await resource.read();
      expect(content).toBe('Protected content');

      // Restore permissions for cleanup
      await fs.chmod(protectedFile, 0o644);
    });

    it('should handle symbolic links', async () => {
      const actualFile = path.join(testDir, 'actual.txt');
      const linkFile = path.join(testDir, 'link.txt');
      
      await fs.writeFile(actualFile, 'Actual file content', 'utf-8');
      await fs.symlink(actualFile, linkFile);

      const config: ResourceConfig = { source: linkFile };
      const resource = await handler.create(config);
      
      const content = await resource.read();
      expect(content).toBe('Actual file content');
    });
  });

  describe('Stream operations', () => {
    it('should stream large files efficiently', async () => {
      // Create a large file
      const largeFile = path.join(testDir, 'stream-test.txt');
      const chunks = [];
      for (let i = 0; i < 1000; i++) {
        chunks.push(`Line ${i}: ${'-'.repeat(100)}\n`);
      }
      await fs.writeFile(largeFile, chunks.join(''), 'utf-8');

      const config: ResourceConfig = { source: largeFile };
      const resource = await handler.create(config);
      
      // Stream the file
      const stream = resource.readStream();
      const reader = stream.getReader();
      
      let bytesRead = 0;
      let chunkCount = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        bytesRead += value.length;
        chunkCount++;
      }

      expect(bytesRead).toBeGreaterThan(0);
      expect(chunkCount).toBeGreaterThan(1); // Should be streamed in chunks
    });
  });

  describe('Validation', () => {
    it('should validate file existence', async () => {
      const existingFile = path.join(testDir, 'exists.txt');
      await fs.writeFile(existingFile, 'content', 'utf-8');

      const config1: ResourceConfig = { source: existingFile };
      const resource1 = await handler.create(config1);
      const validation1 = await resource1.validate();
      expect(validation1.valid).toBe(true);

      const config2: ResourceConfig = { 
        source: path.join(testDir, 'not-exists.txt'),
        mustExist: true 
      };
      const resource2 = await handler.create(config2);
      const validation2 = await resource2.validate();
      expect(validation2.valid).toBe(false);
      expect(validation2.errors[0]).toContain('File does not exist');
    });

    it('should validate mustExist constraint', async () => {
      const config: ResourceConfig = { 
        source: path.join(testDir, 'missing.txt'),
        mustExist: true
      };
      
      const resource = await handler.create(config);
      const validation = await resource.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toContain('File does not exist');
    });
  });

  describe('Binary files', () => {
    it('should handle binary files correctly', async () => {
      // Create a simple binary file (PNG header)
      const binaryFile = path.join(testDir, 'image.png');
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52
      ]);
      await fs.writeFile(binaryFile, pngHeader);

      const config: ResourceConfig = { 
        source: binaryFile,
        encoding: 'base64' as any
      };
      const resource = await handler.create(config);
      
      // Reading binary as base64
      const base64Content = await resource.read();
      expect(base64Content).toBe(pngHeader.toString('base64'));
    });
  });

  describe('Error handling', () => {
    it('should handle read errors gracefully', async () => {
      const testFile = path.join(testDir, 'will-be-deleted.txt');
      await fs.writeFile(testFile, 'content', 'utf-8');

      const config: ResourceConfig = { source: testFile };
      const resource = await handler.create(config);
      
      // Delete file after resource creation
      await fs.unlink(testFile);

      // Should throw when trying to read
      await expect(resource.read()).rejects.toThrow();
    });

    it('should handle concurrent reads', async () => {
      const testFile = path.join(testDir, 'concurrent.txt');
      const content = 'Concurrent read test';
      await fs.writeFile(testFile, content, 'utf-8');

      const config: ResourceConfig = { source: testFile };
      const resource = await handler.create(config);
      
      // Perform multiple concurrent reads
      const reads = Array(10).fill(null).map(() => resource.read());
      const results = await Promise.all(reads);
      
      // All reads should return the same content
      expect(results.every(r => r === content)).toBe(true);
    });
  });
});