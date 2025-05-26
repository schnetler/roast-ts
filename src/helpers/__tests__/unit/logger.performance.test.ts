import { StructuredLogger, Transport, LogEntry } from '../../logger';

class MemoryTransport implements Transport {
  public entries: LogEntry[] = [];
  
  write(entry: LogEntry): void {
    this.entries.push(entry);
  }
}

describe.skip('StructuredLogger - Performance Tests', () => {
  let logger: StructuredLogger;
  let transport: MemoryTransport;

  beforeEach(() => {
    transport = new MemoryTransport();
    logger = new StructuredLogger({ transport });
  });

  describe('High-Frequency Logging', () => {
    it('should handle 10,000 log entries per second', async () => {
      const logCount = 10000;
      const startTime = Date.now();

      for (let i = 0; i < logCount; i++) {
        logger.info(`Test message ${i}`, { index: i, data: 'x'.repeat(100) });
      }

      const duration = Date.now() - startTime;
      const logsPerSecond = (logCount / duration) * 1000;

      expect(logsPerSecond).toBeGreaterThan(10000);
      expect(transport.entries).toHaveLength(logCount);
    });

    it('should not degrade with deep metadata objects', () => {
      const deepMetadata = createDeepObject(100);
      const iterations = 1000;
      
      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        logger.info('Deep metadata test', deepMetadata);
      }
      
      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time even with deep objects
      expect(duration).toBeLessThan(1000); // Less than 1 second for 1000 logs
    });

    it('should maintain performance with many child loggers', () => {
      const childCount = 100;
      const logsPerChild = 100;
      const children: StructuredLogger[] = [];
      
      // Create nested children
      let current = logger;
      for (let i = 0; i < childCount; i++) {
        current = current.child({ level: i }) as StructuredLogger;
        children.push(current);
      }
      
      const startTime = Date.now();
      
      // Each child logs messages
      children.forEach((child, index) => {
        for (let i = 0; i < logsPerChild; i++) {
          child.info(`Child ${index} message ${i}`);
        }
      });
      
      const duration = Date.now() - startTime;
      const totalLogs = childCount * logsPerChild;
      
      // Should not have exponential slowdown
      expect(duration).toBeLessThan(totalLogs / 10); // At least 10 logs per ms
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory with child logger chains', () => {
      const iterations = 10000;
      const memoryUsageBefore = process.memoryUsage().heapUsed;
      
      for (let i = 0; i < iterations; i++) {
        const child = logger.child({ iteration: i });
        child.info('Test message');
        // Child should be garbage collected after this scope
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const memoryUsageAfter = process.memoryUsage().heapUsed;
      const memoryIncrease = memoryUsageAfter - memoryUsageBefore;
      
      // Memory increase should be reasonable (less than 50MB for 10k iterations)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should handle large log entries efficiently', () => {
      const largeData = 'x'.repeat(1024 * 1024); // 1MB string
      const iterations = 100;
      
      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        logger.info('Large data test', { data: largeData });
      }
      
      const duration = Date.now() - startTime;
      
      // Should handle 100MB of data in under 1 second
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Concurrent Logging', () => {
    it('should handle concurrent writes from multiple async operations', async () => {
      const concurrentOps = 1000;
      const startTime = Date.now();
      
      const promises = Array(concurrentOps).fill(null).map(async (_, index) => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        logger.info(`Async operation ${index} completed`);
      });
      
      await Promise.all(promises);
      
      const duration = Date.now() - startTime;
      
      expect(transport.entries).toHaveLength(concurrentOps);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      
      // Verify no log entries were lost
      const indices = transport.entries
        .map(entry => parseInt(entry.message.match(/\d+/)?.[0] || '0'))
        .sort((a, b) => a - b);
      
      expect(indices).toHaveLength(concurrentOps);
    });

    it('should maintain chronological order for synchronous logs', () => {
      const logCount = 1000;
      
      for (let i = 0; i < logCount; i++) {
        logger.info(`Sequential log ${i}`);
      }
      
      // Verify logs are in order
      for (let i = 1; i < transport.entries.length; i++) {
        const prevTime = new Date(transport.entries[i - 1].timestamp).getTime();
        const currTime = new Date(transport.entries[i].timestamp).getTime();
        
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    });
  });

  describe('Transport Performance', () => {
    it('should not block on slow transports', async () => {
      let writeDelayTotal = 0;
      
      class SlowTransport implements Transport {
        async write(entry: LogEntry): Promise<void> {
          const delay = 100; // 100ms delay per write
          writeDelayTotal += delay;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      const slowLogger = new StructuredLogger({ 
        transport: new SlowTransport() 
      });
      
      const logCount = 10;
      const startTime = Date.now();
      
      for (let i = 0; i < logCount; i++) {
        slowLogger.info(`Message ${i}`);
      }
      
      const duration = Date.now() - startTime;
      
      // Should return immediately, not wait for transport
      expect(duration).toBeLessThan(50); // Much less than 10 * 100ms
    });
  });

  describe('Benchmarks', () => {
    it('should establish performance baselines', () => {
      const benchmarks = {
        simpleLog: 0,
        withMetadata: 0,
        withError: 0,
        childLogger: 0,
      };
      
      const iterations = 10000;
      const error = new Error('Test error');
      
      // Benchmark simple log
      let start = Date.now();
      for (let i = 0; i < iterations; i++) {
        logger.info('Simple message');
      }
      benchmarks.simpleLog = Date.now() - start;
      
      // Benchmark with metadata
      start = Date.now();
      for (let i = 0; i < iterations; i++) {
        logger.info('With metadata', { user: 'test', action: 'benchmark', index: i });
      }
      benchmarks.withMetadata = Date.now() - start;
      
      // Benchmark with error
      start = Date.now();
      for (let i = 0; i < iterations; i++) {
        logger.error('Error occurred', error);
      }
      benchmarks.withError = Date.now() - start;
      
      // Benchmark child logger
      const child = logger.child({ component: 'benchmark' });
      start = Date.now();
      for (let i = 0; i < iterations; i++) {
        child.info('Child logger message');
      }
      benchmarks.childLogger = Date.now() - start;
      
      // All operations should complete in reasonable time
      Object.values(benchmarks).forEach(duration => {
        expect(duration).toBeLessThan(100); // Less than 100ms for 10k ops
      });
      
      // Log benchmarks for regression detection
      console.log('Logger Performance Benchmarks:', benchmarks);
    });
  });
});

function createDeepObject(depth: number): any {
  if (depth === 0) return { value: 'leaf' };
  
  return {
    level: depth,
    nested: createDeepObject(depth - 1),
    array: Array(10).fill(null).map((_, i) => ({ index: i })),
    metadata: {
      timestamp: Date.now(),
      random: Math.random()
    }
  };
}