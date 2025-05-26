import { jest } from '@jest/globals';

// Global test setup
beforeEach(() => {
  // Reset all mocks
  jest.clearAllMocks();
  
  // Setup test environment
  process.env.NODE_ENV = 'test';
  process.env.ROAST_LOG_LEVEL = 'error';
});

afterEach(() => {
  // Clean up any mocks
  jest.restoreAllMocks();
  
  // Clean up any temporary files
  // TestHelpers.cleanupTempFiles();
});

// Global error handler for unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing, or other logic here
});