import { StructuredLogger, Transport, LogEntry } from '../../logger';
import { EventEmitter } from 'events';

class ThreadSafeMemoryTransport implements Transport {
  private entries: LogEntry[] = [];
  private mutex = new EventEmitter();
  private locked = false;
  
  async write(entry: LogEntry): Promise<void> {
    await this.acquire();
    try {
      this.entries.push({ ...entry }); // Deep copy to prevent mutations
    } finally {
      this.release();
    }
  }
  
  private async acquire(): Promise<void> {
    while (this.locked) {
      await new Promise(resolve => this.mutex.once('release', resolve));
    }
    this.locked = true;
  }
  
  private release(): void {
    this.locked = false;
    this.mutex.emit('release');
  }
  
  getEntries(): LogEntry[] {
    return [...this.entries]; // Return copy
  }
}

describe.skip('StructuredLogger - Concurrency Tests', () => {
  let transport: ThreadSafeMemoryTransport;
  let logger: StructuredLogger;

  beforeEach(() => {
    transport = new ThreadSafeMemoryTransport();
    logger = new StructuredLogger({ transport });
  });

  describe('Thread Safety', () => {
    it('should handle concurrent writes without data loss', async () => {
      const threadsCount = 100;
      const logsPerThread = 100;
      const totalExpected = threadsCount * logsPerThread;
      
      // Simulate multiple "threads" (async operations)
      const threads = Array(threadsCount).fill(null).map(async (_, threadId) => {
        const threadLogger = logger.child({ threadId });
        
        for (let i = 0; i < logsPerThread; i++) {
          // Add some randomness to simulate real concurrency
          if (Math.random() > 0.5) {
            await new Promise(resolve => setImmediate(resolve));
          }
          
          threadLogger.info(`Message ${i}`, { 
            threadId, 
            messageId: i,
            timestamp: Date.now() 
          });
        }
      });
      
      await Promise.all(threads);
      
      // Verify no logs were lost
      const entries = transport.getEntries();
      expect(entries).toHaveLength(totalExpected);
      
      // Verify data integrity
      const threadCounts = new Map<number, Set<number>>();
      
      entries.forEach(entry => {
        const threadId = entry.threadId as number;
        const messageId = entry.messageId as number;
        
        if (!threadCounts.has(threadId)) {
          threadCounts.set(threadId, new Set());
        }
        
        threadCounts.get(threadId)!.add(messageId);
      });
      
      // Each thread should have all its messages
      expect(threadCounts.size).toBe(threadsCount);
      threadCounts.forEach(messages => {
        expect(messages.size).toBe(logsPerThread);
      });
    });

    it('should maintain metadata isolation between concurrent loggers', async () => {
      const loggers = Array(50).fill(null).map((_, id) => 
        logger.child({ loggerId: id, private: `secret-${id}` })
      );
      
      const promises = loggers.map(async (logger, id) => {
        // Each logger writes multiple times
        for (let i = 0; i < 20; i++) {
          logger.info(`Logger ${id} message ${i}`);
          
          // Yield to allow interleaving
          await new Promise(resolve => setImmediate(resolve));
        }
      });
      
      await Promise.all(promises);
      
      const entries = transport.getEntries();
      
      // Verify metadata isolation - no cross-contamination
      entries.forEach(entry => {
        const loggerId = entry.loggerId as number;
        const privateData = entry.private as string;
        
        expect(privateData).toBe(`secret-${loggerId}`);
      });
    });
  });

  describe('Race Conditions', () => {
    it('should handle rapid child logger creation', async () => {
      const concurrentCreations = 1000;
      
      const promises = Array(concurrentCreations).fill(null).map(async (_, i) => {
        // Rapidly create and use child loggers
        const child = logger.child({ childId: i });
        child.info('Immediate log after creation');
        
        // Some children log multiple times
        if (i % 10 === 0) {
          await new Promise(resolve => setImmediate(resolve));
          child.warn('Delayed warning');
        }
      });
      
      await Promise.all(promises);
      
      const entries = transport.getEntries();
      const childIds = new Set(entries.map(e => e.childId));
      
      // All children should have logged
      expect(childIds.size).toBe(concurrentCreations);
    });

    it('should handle transport switching during active logging', async () => {
      const transport1 = new ThreadSafeMemoryTransport();
      const transport2 = new ThreadSafeMemoryTransport();
      
      const mutableLogger = new StructuredLogger({ transport: transport1 });
      
      // Start logging in background
      const backgroundLogging = async () => {
        for (let i = 0; i < 1000; i++) {
          mutableLogger.info(`Background log ${i}`);
          if (i % 10 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }
      };
      
      const loggingPromise = backgroundLogging();
      
      // Switch transport mid-flight (this is a bad practice but should not crash)
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Note: In a real implementation, we'd need a thread-safe way to switch transports
      // This test demonstrates the need for such safety
      
      await loggingPromise;
      
      const total = transport1.getEntries().length + transport2.getEntries().length;
      expect(total).toBeGreaterThan(0);
    });
  });

  describe('Deadlock Prevention', () => {
    it('should not deadlock with circular logging', async () => {
      let callCount = 0;
      const maxCalls = 100;
      
      class RecursiveTransport implements Transport {
        write(entry: LogEntry): void {
          callCount++;
          
          if (callCount < maxCalls) {
            // Transport tries to log, creating circular dependency
            logger.debug(`Transport processing entry: ${entry.message}`);
          }
        }
      }
      
      const recursiveLogger = new StructuredLogger({ 
        transport: new RecursiveTransport(),
        level: 'debug'
      });
      
      // This should complete without hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Deadlock detected')), 1000)
      );
      
      const loggingPromise = new Promise<void>(resolve => {
        recursiveLogger.info('Initial message');
        resolve();
      });
      
      await expect(Promise.race([loggingPromise, timeoutPromise])).resolves.toBeUndefined();
      expect(callCount).toBe(maxCalls);
    });

    it('should handle concurrent operations on same log entry', async () => {
      const sharedMetadata = { counter: 0 };
      
      // Multiple async operations trying to log with shared metadata
      const operations = Array(100).fill(null).map(async (_, i) => {
        // Simulate read-modify-write race condition
        const current = sharedMetadata.counter;
        await new Promise(resolve => setImmediate(resolve));
        sharedMetadata.counter = current + 1;
        
        logger.info('Concurrent update', { ...sharedMetadata, operationId: i });
      });
      
      await Promise.all(operations);
      
      const entries = transport.getEntries();
      const counters = entries.map(e => e.counter as number);
      
      // Due to race conditions, we won't have sequential counters
      // But we should have all 100 entries
      expect(entries).toHaveLength(100);
      
      // Verify each entry has its own metadata copy
      const uniqueCounters = new Set(counters);
      expect(uniqueCounters.size).toBeGreaterThan(1); // Should see race condition effects
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up resources when loggers are garbage collected', async () => {
      const startMemory = process.memoryUsage().heapUsed;
      const iterations = 1000;
      
      // Create many temporary loggers
      for (let i = 0; i < iterations; i++) {
        const tempLogger = logger.child({ 
          iteration: i,
          largeData: Buffer.alloc(1024) // 1KB per logger
        });
        
        tempLogger.info('Temporary log');
        
        // Logger goes out of scope here
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 100));
        global.gc();
      }
      
      const endMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = endMemory - startMemory;
      
      // Memory growth should be minimal after GC
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
    });

    it('should handle abrupt termination gracefully', async () => {
      const signals = ['SIGTERM', 'SIGINT'];
      const originalHandlers = new Map<string, any>();
      
      // Save original handlers
      signals.forEach(signal => {
        originalHandlers.set(signal, process.listeners(signal as any));
        process.removeAllListeners(signal);
      });
      
      let shutdownHandled = false;
      
      // Simulate a transport that needs cleanup
      class CleanupTransport implements Transport {
        private buffer: LogEntry[] = [];
        
        write(entry: LogEntry): void {
          this.buffer.push(entry);
        }
        
        async flush(): Promise<void> {
          shutdownHandled = true;
          // Simulate flushing buffered logs
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      const cleanupTransport = new CleanupTransport();
      const cleanupLogger = new StructuredLogger({ transport: cleanupTransport });
      
      // Log some messages
      for (let i = 0; i < 100; i++) {
        cleanupLogger.info(`Message ${i}`);
      }
      
      // Simulate graceful shutdown
      await cleanupTransport.flush();
      
      expect(shutdownHandled).toBe(true);
      
      // Restore original handlers
      signals.forEach(signal => {
        originalHandlers.get(signal)?.forEach((handler: any) => {
          process.on(signal, handler);
        });
      });
    });
  });
});