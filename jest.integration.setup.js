// Integration test setup
const os = require('os');
const path = require('path');
const fs = require('fs').promises;

// Set environment variables for integration tests
process.env.ROAST_TEST_TEMP_DIR = path.join(os.tmpdir(), 'roast-integration-tests');
process.env.ROAST_TEST_TIMEOUT = '30000';
process.env.ROAST_TEST_CLEANUP = 'true';

// Ensure test temp directory exists
beforeAll(async () => {
  try {
    await fs.mkdir(process.env.ROAST_TEST_TEMP_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
});

// Clean up after all tests
afterAll(async () => {
  if (process.env.ROAST_TEST_CLEANUP === 'true') {
    try {
      await fs.rm(process.env.ROAST_TEST_TEMP_DIR, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test directory:', error);
    }
  }
});