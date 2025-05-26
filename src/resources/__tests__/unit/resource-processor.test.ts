import { ResourceProcessor } from '../../resource-processor';
import { Resource, WorkflowConfig, WorkflowContext } from '../../../shared/types';
import { WorkflowExecutor } from '../../../workflow/workflow-executor';

// Mock WorkflowExecutor
jest.mock('../../../workflow/workflow-executor');

// Mock resources
const createMockResource = (type: string, source: string): Resource => ({
  type: type as any,
  source,
  async exists() { return true; },
  async validate() { return { valid: true, errors: [] }; }
});

const createMockFileResource = (path: string, content: string) => ({
  ...createMockResource('file', path),
  path,
  async read() { return content; }
});

const createMockDirectoryResource = (path: string, files: any[]) => ({
  ...createMockResource('directory', path),
  path,
  async list() { return files; }
});

describe('ResourceProcessor', () => {
  let processor: ResourceProcessor;
  let mockExecutor: jest.Mocked<WorkflowExecutor>;
  let mockWorkflow: WorkflowConfig;

  beforeEach(() => {
    mockExecutor = {
      execute: jest.fn()
    } as any;
    
    processor = new ResourceProcessor(mockExecutor);
    
    mockWorkflow = {
      name: 'test-workflow',
      steps: [],
      tools: new Map()
    };
    
    jest.clearAllMocks();
  });

  describe('Sequential Processing', () => {
    it('should process resources in order', async () => {
      const resources = [
        createMockFileResource('/file1.txt', 'content1'),
        createMockFileResource('/file2.txt', 'content2'),
        createMockFileResource('/file3.txt', 'content3')
      ];
      
      mockExecutor.execute.mockResolvedValue({ success: true });
      
      const results = await processor.processResources(
        resources, 
        mockWorkflow,
        { parallel: false }
      );
      
      expect(results).toHaveLength(3);
      expect(mockExecutor.execute).toHaveBeenCalledTimes(3);
      
      // Verify order
      expect(mockExecutor.execute).toHaveBeenNthCalledWith(1, 
        mockWorkflow,
        expect.objectContaining({
          type: 'file',
          path: '/file1.txt',
          content: 'content1'
        })
      );
      
      expect(mockExecutor.execute).toHaveBeenNthCalledWith(2,
        mockWorkflow,
        expect.objectContaining({
          type: 'file',
          path: '/file2.txt',
          content: 'content2'
        })
      );
    });

    it('should handle processing errors', async () => {
      const resources = [
        createMockFileResource('/file1.txt', 'content1'),
        createMockFileResource('/file2.txt', 'content2')
      ];
      
      mockExecutor.execute
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Processing failed'));
      
      const results = await processor.processResources(
        resources,
        mockWorkflow
      );
      
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error?.message).toBe('Processing failed');
    });

    it('should collect all results', async () => {
      const resources = [
        createMockFileResource('/file1.txt', 'content1'),
        createMockFileResource('/file2.txt', 'content2')
      ];
      
      mockExecutor.execute
        .mockResolvedValueOnce({ success: true, data: 'result1' })
        .mockResolvedValueOnce({ success: true, data: 'result2' });
      
      const results = await processor.processResources(
        resources,
        mockWorkflow
      );
      
      expect(results[0].result).toEqual({ success: true, data: 'result1' });
      expect(results[1].result).toEqual({ success: true, data: 'result2' });
    });

    it('should maintain resource context', async () => {
      const resource = createMockFileResource('/test.txt', 'test content');
      
      mockExecutor.execute.mockResolvedValue({ success: true });
      
      const results = await processor.processResources(
        [resource],
        mockWorkflow
      );
      
      expect(results[0].resource).toBe(resource);
    });
  });

  describe('Parallel Processing', () => {
    it('should process resources concurrently', async () => {
      // Use real timers
      jest.useRealTimers();
      
      const resources = Array.from({ length: 10 }, (_, i) => 
        createMockFileResource(`/file${i}.txt`, `content${i}`)
      );
      
      let activeCount = 0;
      let maxActive = 0;
      
      mockExecutor.execute.mockImplementation(async () => {
        activeCount++;
        maxActive = Math.max(maxActive, activeCount);
        
        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, 10));
        
        activeCount--;
        return { success: true };
      });
      
      await processor.processResources(
        resources,
        mockWorkflow,
        { parallel: true, maxConcurrency: 5 }
      );
      
      expect(maxActive).toBeLessThanOrEqual(5);
      expect(mockExecutor.execute).toHaveBeenCalledTimes(10);
      
      // Restore fake timers
      jest.useFakeTimers();
    });

    it('should respect concurrency limits', async () => {
      // Use real timers
      jest.useRealTimers();
      
      const resources = Array.from({ length: 20 }, (_, i) => 
        createMockFileResource(`/file${i}.txt`, `content${i}`)
      );
      
      let concurrentExecutions = 0;
      let maxConcurrent = 0;
      
      mockExecutor.execute.mockImplementation(async () => {
        concurrentExecutions++;
        maxConcurrent = Math.max(maxConcurrent, concurrentExecutions);
        
        await new Promise(resolve => setTimeout(resolve, 5));
        
        concurrentExecutions--;
        return { success: true };
      });
      
      await processor.processResources(
        resources,
        mockWorkflow,
        { parallel: true, maxConcurrency: 3 }
      );
      
      expect(maxConcurrent).toBeLessThanOrEqual(3);
      
      // Restore fake timers
      jest.useFakeTimers();
    });

    it('should handle partial failures', async () => {
      const resources = [
        createMockFileResource('/file1.txt', 'content1'),
        createMockFileResource('/file2.txt', 'content2'),
        createMockFileResource('/file3.txt', 'content3')
      ];
      
      mockExecutor.execute
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ success: true });
      
      const results = await processor.processResources(
        resources,
        mockWorkflow,
        { parallel: true }
      );
      
      expect(results.filter(r => r.success)).toHaveLength(2);
      expect(results.filter(r => !r.success)).toHaveLength(1);
    });

    it('should aggregate results correctly', async () => {
      const resources = Array.from({ length: 5 }, (_, i) => 
        createMockFileResource(`/file${i}.txt`, `content${i}`)
      );
      
      mockExecutor.execute.mockImplementation(async (_, context) => ({
        success: true,
        data: context.content
      }));
      
      const results = await processor.processResources(
        resources,
        mockWorkflow,
        { parallel: true }
      );
      
      expect(results).toHaveLength(5);
      
      // Results might be in different order due to parallel execution
      const contents = results.map(r => r.result?.data).sort();
      expect(contents).toEqual([
        'content0', 'content1', 'content2', 'content3', 'content4'
      ]);
    });
  });

  describe('Context Building', () => {
    it('should build context for file resources', async () => {
      const resource = createMockFileResource('/test.txt', 'file content');
      
      mockExecutor.execute.mockResolvedValue({ success: true });
      
      await processor.processResources([resource], mockWorkflow);
      
      expect(mockExecutor.execute).toHaveBeenCalledWith(
        mockWorkflow,
        expect.objectContaining({
          type: 'file',
          path: '/test.txt',
          content: 'file content'
        })
      );
    });

    it('should build context for directory resources', async () => {
      const files = [
        { name: 'file1.txt', path: '/dir/file1.txt' },
        { name: 'file2.txt', path: '/dir/file2.txt' }
      ];
      
      const resource = createMockDirectoryResource('/dir', files);
      
      mockExecutor.execute.mockResolvedValue({ success: true });
      
      await processor.processResources([resource], mockWorkflow);
      
      expect(mockExecutor.execute).toHaveBeenCalledWith(
        mockWorkflow,
        expect.objectContaining({
          type: 'directory',
          path: '/dir',
          files
        })
      );
    });

    it('should build context for URL resources', async () => {
      const resource = {
        ...createMockResource('url', 'https://example.com'),
        url: new URL('https://example.com'),
        async fetch() {
          return {
            text: async () => 'webpage content'
          };
        }
      };
      
      mockExecutor.execute.mockResolvedValue({ success: true });
      
      await processor.processResources([resource], mockWorkflow);
      
      expect(mockExecutor.execute).toHaveBeenCalledWith(
        mockWorkflow,
        expect.objectContaining({
          type: 'url',
          url: 'https://example.com/',
          content: 'webpage content'
        })
      );
    });

    it('should build context for API resources', async () => {
      const resource = {
        ...createMockResource('api', 'api-config'),
        async execute() {
          return { data: { users: [] } };
        }
      };
      
      mockExecutor.execute.mockResolvedValue({ success: true });
      
      await processor.processResources([resource], mockWorkflow);
      
      expect(mockExecutor.execute).toHaveBeenCalledWith(
        mockWorkflow,
        expect.objectContaining({
          type: 'api',
          data: { users: [] }
        })
      );
    });

    it('should build context for none resources', async () => {
      const resource = createMockResource('none', '');
      
      mockExecutor.execute.mockResolvedValue({ success: true });
      
      await processor.processResources([resource], mockWorkflow);
      
      expect(mockExecutor.execute).toHaveBeenCalledWith(
        mockWorkflow,
        expect.objectContaining({ type: 'none' })
      );
    });
  });

  describe('Options Handling', () => {
    it('should use default options', async () => {
      const resources = [
        createMockFileResource('/file1.txt', 'content1'),
        createMockFileResource('/file2.txt', 'content2')
      ];
      
      mockExecutor.execute.mockResolvedValue({ success: true });
      
      // Should default to sequential processing
      const results = await processor.processResources(resources, mockWorkflow);
      
      expect(results).toHaveLength(2);
      
      // Verify sequential by checking call order
      const calls = mockExecutor.execute.mock.calls;
      expect(calls[0][1].path).toBe('/file1.txt');
      expect(calls[1][1].path).toBe('/file2.txt');
    });

    it('should handle empty resource list', async () => {
      const results = await processor.processResources([], mockWorkflow);
      
      expect(results).toEqual([]);
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });

    it('should handle single resource', async () => {
      const resource = createMockFileResource('/single.txt', 'content');
      
      mockExecutor.execute.mockResolvedValue({ success: true });
      
      const results = await processor.processResources([resource], mockWorkflow);
      
      expect(results).toHaveLength(1);
      expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle executor initialization errors', async () => {
      const resource = createMockFileResource('/test.txt', 'content');
      
      mockExecutor.execute.mockRejectedValue(new Error('Executor init failed'));
      
      const results = await processor.processResources([resource], mockWorkflow);
      
      expect(results[0].success).toBe(false);
      expect(results[0].error?.message).toBe('Executor init failed');
    });

    it('should handle resource read errors', async () => {
      const resource = {
        ...createMockResource('file', '/error.txt'),
        path: '/error.txt',
        async read() { throw new Error('Read failed'); }
      };
      
      const results = await processor.processResources([resource], mockWorkflow);
      
      expect(results[0].success).toBe(false);
      expect(results[0].error?.message).toBe('Read failed');
    });

    it('should continue processing after errors', async () => {
      const resources = [
        createMockFileResource('/file1.txt', 'content1'),
        {
          ...createMockResource('file', '/error.txt'),
          path: '/error.txt',
          async read() { throw new Error('Read failed'); }
        },
        createMockFileResource('/file3.txt', 'content3')
      ];
      
      mockExecutor.execute.mockResolvedValue({ success: true });
      
      const results = await processor.processResources(resources, mockWorkflow);
      
      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });
  });
});