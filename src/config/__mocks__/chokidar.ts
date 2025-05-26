// Mock implementation of chokidar for testing
export const watch = jest.fn(() => ({
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined)
}));

export default {
  watch
};