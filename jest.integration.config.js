module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/integration/**/*.test.ts'],
  testTimeout: 30000, // 30 seconds for integration tests
  maxWorkers: 1, // Run integration tests sequentially
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**'
  ],
  coverageDirectory: 'coverage/integration',
  setupFilesAfterEnv: ['<rootDir>/jest.integration.setup.js']
};