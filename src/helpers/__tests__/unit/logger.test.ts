import { StructuredLogger, ConsoleTransport, LogLevel, LogEntry, Transport } from '../../logger';

describe('StructuredLogger', () => {
  let mockTransport: jest.Mocked<Transport>;
  let logger: StructuredLogger;

  beforeEach(() => {
    mockTransport = {
      write: jest.fn()
    };
    
    logger = new StructuredLogger({
      level: 'info',
      transport: mockTransport
    });
  });

  describe('Logging Levels', () => {
    it('should log messages at or above configured level', () => {
      logger.info('test message');
      logger.warn('warning message');
      logger.error('error message');
      
      expect(mockTransport.write).toHaveBeenCalledTimes(3);
      expect(mockTransport.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'test message'
        })
      );
      expect(mockTransport.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
          message: 'warning message'
        })
      );
      expect(mockTransport.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: 'error message'
        })
      );
    });

    it('should filter messages below level threshold', () => {
      logger.debug('debug message');
      
      expect(mockTransport.write).not.toHaveBeenCalled();
    });

    it('should respect different log levels', () => {
      const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
      
      levels.forEach((level, index) => {
        const testLogger = new StructuredLogger({ 
          level, 
          transport: mockTransport 
        });
        
        mockTransport.write.mockClear();
        
        testLogger.debug('debug');
        testLogger.info('info');
        testLogger.warn('warn');
        testLogger.error('error');
        
        // Should log messages at or above the configured level
        expect(mockTransport.write).toHaveBeenCalledTimes(4 - index);
      });
    });
  });

  describe('Structured Logging', () => {
    it('should include metadata in log entries', () => {
      logger.info('test', { userId: '123', action: 'login' });
      
      expect(mockTransport.write).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'test',
          userId: '123',
          action: 'login'
        })
      );
    });

    it('should include timestamp in all entries', () => {
      logger.info('test');
      
      expect(mockTransport.write).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
        })
      );
    });

    it('should merge multiple metadata objects', () => {
      const contextLogger = new StructuredLogger({
        transport: mockTransport,
        context: { app: 'test-app', version: '1.0.0' }
      });
      
      contextLogger.info('user action', { userId: '123', action: 'click' });
      
      expect(mockTransport.write).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'test-app',
          version: '1.0.0',
          userId: '123',
          action: 'click'
        })
      );
    });

    it('should handle undefined metadata', () => {
      logger.info('test message');
      
      expect(mockTransport.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'test message',
          timestamp: expect.any(String)
        })
      );
    });
  });

  describe('Child Loggers', () => {
    it('should create child with inherited context', () => {
      const child = logger.child({ component: 'auth' });
      child.info('child message');
      
      expect(mockTransport.write).toHaveBeenCalledWith(
        expect.objectContaining({
          component: 'auth',
          message: 'child message'
        })
      );
    });

    it('should maintain parent log level', () => {
      const child = logger.child({ component: 'auth' });
      child.debug('should be filtered');
      
      expect(mockTransport.write).not.toHaveBeenCalled();
    });

    it('should merge parent and child contexts', () => {
      const parentLogger = new StructuredLogger({
        transport: mockTransport,
        context: { app: 'test-app' }
      });
      
      const child = parentLogger.child({ component: 'auth', module: 'login' });
      child.info('login attempt');
      
      expect(mockTransport.write).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'test-app',
          component: 'auth',
          module: 'login',
          message: 'login attempt'
        })
      );
    });

    it('should allow nested child loggers', () => {
      const child1 = logger.child({ level1: 'value1' });
      const child2 = child1.child({ level2: 'value2' });
      const child3 = child2.child({ level3: 'value3' });
      
      child3.info('nested message');
      
      expect(mockTransport.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level1: 'value1',
          level2: 'value2',
          level3: 'value3',
          message: 'nested message'
        })
      );
    });
  });

  describe('Error Logging', () => {
    it('should format error objects', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', error);
      
      expect(mockTransport.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: 'Error occurred',
          error: {
            name: 'Error',
            message: 'Test error',
            stack: expect.any(String)
          }
        })
      );
    });

    it('should handle custom error types', () => {
      class CustomError extends Error {
        code: string;
        constructor(message: string, code: string) {
          super(message);
          this.name = 'CustomError';
          this.code = code;
        }
      }
      
      const error = new CustomError('Custom error', 'ERR_001');
      logger.error('Custom error occurred', error);
      
      expect(mockTransport.write).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'CustomError',
            message: 'Custom error'
          })
        })
      );
    });

    it('should handle non-error objects in error method', () => {
      logger.error('Error with metadata', { code: 'ERR_001', details: 'Something went wrong' });
      
      expect(mockTransport.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: 'Error with metadata',
          code: 'ERR_001',
          details: 'Something went wrong'
        })
      );
    });
  });

  describe('ConsoleTransport', () => {
    let consoleLogSpy: jest.SpyInstance;
    let consoleTransport: ConsoleTransport;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      consoleTransport = new ConsoleTransport();
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should write to console with proper format', () => {
      const entry: LogEntry = {
        level: 'info',
        message: 'Test message',
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      consoleTransport.write(entry);
      
      expect(consoleLogSpy).toHaveBeenCalledWith('[2024-01-01T00:00:00.000Z] [INFO] Test message');
    });

    it('should include metadata when present', () => {
      const entry: LogEntry = {
        level: 'warn',
        message: 'Warning message',
        timestamp: '2024-01-01T00:00:00.000Z',
        userId: '123',
        action: 'delete'
      };
      
      consoleTransport.write(entry);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[2024-01-01T00:00:00.000Z] [WARN] Warning message',
        { userId: '123', action: 'delete' }
      );
    });
  });

  describe('Default Configuration', () => {
    it('should use info level by default', () => {
      const defaultLogger = new StructuredLogger();
      
      // Create a mock transport to capture writes
      const mockTransport = { write: jest.fn() };
      const testLogger = new StructuredLogger({ transport: mockTransport });
      
      testLogger.debug('should not log');
      testLogger.info('should log');
      
      expect(mockTransport.write).toHaveBeenCalledTimes(1);
      expect(mockTransport.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'should log'
        })
      );
    });

    it('should use ConsoleTransport by default', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const defaultLogger = new StructuredLogger();
      
      defaultLogger.info('test');
      
      expect(consoleLogSpy).toHaveBeenCalled();
      
      consoleLogSpy.mockRestore();
    });
  });
});