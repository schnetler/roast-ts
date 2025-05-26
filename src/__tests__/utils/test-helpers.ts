import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Tool, Workflow, Logger, StateManager } from '@/shared/types';

export class TestHelpers {
  private static tempDirectories: string[] = [];

  static createMockTool(name: string, result: any): Tool {
    return {
      name,
      description: `Mock ${name} tool`,
      category: 'test',
      parameters: { type: 'object', properties: {} },
      execute: jest.fn().mockResolvedValue(result),
      cacheable: false,
      retryable: false
    };
  }

  static createMockWorkflow(steps: any[]): Workflow {
    return {
      config: {
        name: 'test-workflow',
        model: 'gpt-4',
        provider: 'openai',
        tools: new Map(),
        steps: steps,
        metadata: {}
      },
      steps: steps,
      execute: jest.fn().mockResolvedValue({ success: true })
    };
  }

  static async createTempDirectory(): Promise<string> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'roast-test-'));
    this.tempDirectories.push(tempDir);
    return tempDir;
  }

  static async cleanupTempFiles(): Promise<void> {
    for (const dir of this.tempDirectories) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Failed to cleanup temp directory ${dir}:`, error);
      }
    }
    this.tempDirectories = [];
  }

  static mockLogger(): Logger {
    return {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnThis()
    };
  }

  static createMockStateManager(): StateManager {
    return {
      initializeSession: jest.fn(),
      loadSession: jest.fn(),
      updateWorkflow: jest.fn(),
      updateStep: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      getState: jest.fn(),
      saveSnapshot: jest.fn()
    };
  }

  static async waitForCondition(
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  static expectTypeError(fn: () => any): void {
    // This is a compile-time check, not runtime
    // Used in tests to verify TypeScript type safety
    expect(() => {
      // TypeScript should prevent this from compiling
      fn();
    }).toThrow();
  }
}