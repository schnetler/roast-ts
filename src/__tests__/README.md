# Test Directory Structure

This directory contains all test suites for the Roast TypeScript framework, organized by test type as recommended in PRODUCTION-TESTING.md.

## Test Categories

### `/unit/`
Fast, isolated tests with mocked dependencies. These tests run on every commit.
- ✅ Currently implemented in component directories
- Run with: `npm test`

### `/integration/`
Component interaction tests with real system resources (file system, network, etc.).
- 🚧 Being implemented
- Run with: `npm run test:integration`

### `/security/`
Security-focused tests including path traversal, input validation, and authentication.
- ❌ Not yet implemented
- Run with: `npm run test:security`

### `/performance/`
Benchmark and performance regression tests.
- ❌ Not yet implemented
- Run with: `npm run test:performance`

### `/concurrency/`
Thread safety and concurrent operation tests.
- ❌ Not yet implemented
- Run with: `npm run test:concurrency`

### `/e2e/`
Full system end-to-end tests in production-like environment.
- ❌ Not yet implemented
- Run with: `npm run test:e2e`

### `/stress/`
Load and stress tests for scalability validation.
- ❌ Not yet implemented
- Run with: `npm run test:stress`

## Running Tests

```bash
# Run all unit tests (fast, mocked)
npm test

# Run integration tests (slower, real resources)
npm run test:integration

# Run all test suites
npm run test:all

# Run specific test category
npm run test:security
npm run test:performance
```

## Test Environment Variables

Integration tests may require:
- `ROAST_TEST_TEMP_DIR`: Directory for test file operations
- `ROAST_TEST_TIMEOUT`: Extended timeout for integration tests
- `ROAST_TEST_CLEANUP`: Whether to cleanup test artifacts

## Writing Tests

When adding new tests, place them in the appropriate category:
- Unit tests: Mock all external dependencies
- Integration tests: Use real file system, network, etc.
- Security tests: Focus on vulnerability prevention
- Performance tests: Measure and benchmark operations
- Concurrency tests: Validate thread safety
- E2E tests: Test complete workflows
- Stress tests: Push system limits