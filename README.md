# Roast TypeScript Framework

> A powerful, type-safe workflow automation framework for building AI-powered applications with LLM integration.

[![npm version](https://img.shields.io/npm/v/roast-ts.svg)](https://www.npmjs.com/package/roast-ts)
[![npm downloads](https://img.shields.io/npm/dm/roast-ts.svg)](https://www.npmjs.com/package/roast-ts)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/roast-ts)](https://bundlephobia.com/package/roast-ts)

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
  - [Workflows](#workflows)
  - [Tools](#tools)
  - [Resources](#resources)
  - [State Management](#state-management)
- [Configuration](#configuration)
- [Built-in Tools](#built-in-tools)
- [Advanced Usage](#advanced-usage)
  - [Custom Tools](#custom-tools)
  - [Parallel Execution](#parallel-execution)
  - [Error Handling](#error-handling)
  - [State Persistence](#state-persistence)
- [CLI Usage](#cli-usage)
- [API Reference](#api-reference)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

Roast TypeScript is a production-ready framework for building AI-powered workflows with strong typing, state management, and LLM integration. It provides a fluent, type-safe API that makes it easy to compose complex workflows while maintaining code clarity and reliability.

### Why Roast?

- **Type Safety**: Full TypeScript support with automatic context inference
- **AI-First**: Built-in integration with OpenAI, Anthropic, Bedrock, Ollama, and OpenRouter
- **Production Ready**: Battle-tested with comprehensive error handling and state persistence
- **Developer Friendly**: Intuitive fluent API with excellent IDE support
- **Flexible**: Support for both programmatic and YAML-based workflow definitions
- **Extensible**: Easy to create custom tools and integrate with existing systems

### Why Structured Workflows Matter

If you've worked with multi-agent AI systems, you've likely encountered the chaos that emerges when agents operate without rails. What starts as a simple task can quickly devolve into a tangled mess of agents calling each other, losing context, or worse—getting stuck in infinite loops. Your customers expect software to be predictable and reliable, but unstructured agent interactions are anything but.

Roast solves this by putting you back in control:

- **You Own the Flow**: Define explicit paths for execution—no more agents wandering off into unexpected territory
- **Bounded Context**: Each agent knows exactly what it owns and where its responsibilities end
- **Small, Focused Agents**: Instead of monolithic agents trying to do everything, compose small, specialized tools
- **No Infinite Loops**: Built-in safeguards ensure your workflows terminate predictably
- **Deterministic Results**: Same inputs produce same outputs, making debugging and testing actually possible

Think of it as guard rails for AI: you get the power of intelligent agents without sacrificing the predictability your applications need.

## Features

- 🔧 **Fluent Workflow DSL** - Build complex workflows with intuitive method chaining
- 🤖 **LLM Integration** - Seamless integration with major AI providers
- 📦 **Built-in Tools** - File operations, command execution, pattern matching, and more
- 💾 **State Management** - Event-sourced state tracking with persistence and replay
- 🔄 **Parallel Execution** - Run multiple steps concurrently with automatic result merging
- 🛡️ **Type Safety** - Full TypeScript support with automatic type inference
- 🔌 **Extensible** - Create custom tools and resources for your specific needs
- 📝 **Multiple Formats** - Define workflows in TypeScript or YAML
- 🚀 **Performance** - Optimized for production workloads with caching and batching
- 🔒 **Security** - Built-in path traversal protection and input sanitization

## Installation

```bash
npm install roast-ts
```

Or with yarn:

```bash
yarn add roast-ts
```

## Quick Start

### Basic Workflow Example

```typescript
import { createWorkflow } from 'roast-ts';
import { readFileTool, writeFileTool } from 'roast-ts/tools';

// Create a simple workflow
const workflow = createWorkflow('process-file')
  .tool('readFile', readFileTool)
  .tool('writeFile', writeFileTool)
  .prompt(({ readFile }) => `
    Analyze this TypeScript file and suggest improvements:
    ${readFile.content}
  `)
  .step('saveAnalysis', async ({ prompt, writeFile }) => {
    await writeFile({
      path: './analysis.md',
      content: prompt.result
    });
    return { saved: true };
  });

// Execute the workflow
const result = await workflow.run({
  readFile: { path: './src/index.ts' }
});
```

### AI-Powered Code Review

```typescript
const codeReviewWorkflow = createWorkflow('code-review')
  .tool('grep', grepTool)
  .prompt(({ grep }) => `
    Review these TypeScript files for potential issues:
    ${grep.matches.map(m => m.content).join('\n')}
    
    Focus on:
    1. Security vulnerabilities
    2. Performance issues
    3. Code quality
  `)
  .parallel({
    security: async (ctx) => analyzeSecurityIssues(ctx.prompt.result),
    performance: async (ctx) => analyzePerformance(ctx.prompt.result),
    quality: async (ctx) => analyzeCodeQuality(ctx.prompt.result)
  })
  .step('generateReport', async ({ parallel }) => {
    return {
      report: formatReport(parallel.security, parallel.performance, parallel.quality)
    };
  });

const review = await codeReviewWorkflow.run({
  grep: { pattern: '.*\\.ts$', path: './src' }
});
```

## Core Concepts

### Workflows

Workflows are the heart of Roast. They define a sequence of operations that can include tool execution, LLM prompts, custom logic, and parallel processing.

```typescript
const workflow = createWorkflow('workflow-name')
  .tool('toolName', toolInstance)        // Register tools
  .prompt(context => 'prompt template')   // Define prompts
  .step('stepName', async (context) => { // Execute custom logic
    return { result: 'data' };
  })
  .parallel({                            // Run steps in parallel
    task1: async (ctx) => result1,
    task2: async (ctx) => result2
  });
```

### Tools

Tools are reusable functions that perform specific operations. Roast includes several built-in tools and supports custom tool creation.

```typescript
import { createTool } from 'roast-ts';
import { z } from 'zod';

const customTool = createTool({
  name: 'myTool',
  description: 'Does something useful',
  input: z.object({
    param: z.string()
  }),
  output: z.object({
    result: z.string()
  }),
  execute: async (input) => {
    // Tool implementation
    return { result: `Processed: ${input.param}` };
  }
});
```

### Resources

Resources represent external data sources or targets that workflows can interact with.

```typescript
import { FileResource, DirectoryResource, URLResource } from 'roast-ts/resources';

// File resource
const fileRes = new FileResource('/path/to/file.txt');

// Directory resource
const dirRes = new DirectoryResource('/path/to/directory');

// URL resource
const urlRes = new URLResource('https://api.example.com/data');
```

### State Management

Roast provides comprehensive state management with persistence and replay capabilities.

```typescript
import { StateManager } from 'roast-ts/state';

const stateManager = new StateManager({
  baseDir: './workflow-states',
  enablePersistence: true
});

// Subscribe to state changes
stateManager.on('stateChange', (event) => {
  console.log('State updated:', event);
});

// Replay workflow from a specific point
const replayedState = await stateManager.replay(sessionId, stepIndex);
```

## Configuration

Create a `roast.config.ts` file in your project root:

```typescript
import { RoastConfig } from 'roast-ts';

const config: RoastConfig = {
  // LLM Configuration
  llm: {
    provider: 'openai', // or 'anthropic', 'bedrock', 'ollama', 'openrouter'
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 2000
  },
  
  // State Management
  state: {
    baseDir: './workflow-states',
    enablePersistence: true,
    compactionThreshold: 1000
  },
  
  // Tool Configuration
  tools: {
    timeout: 30000,
    retryCount: 3,
    cacheEnabled: true
  },
  
  // Security Settings
  security: {
    enablePathTraversal: false,
    allowedPaths: ['/workspace', '/tmp'],
    sanitizeInputs: true
  }
};

export default config;
```

## Built-in Tools

### File Operations

```typescript
// Read File
const readResult = await readFileTool.execute({
  path: './data.json',
  encoding: 'utf8'
});

// Write File
await writeFileTool.execute({
  path: './output.txt',
  content: 'Hello, World!',
  options: { encoding: 'utf8', flag: 'w' }
});

// Update Multiple Files
await updateFilesTool.execute({
  updates: [
    { path: './file1.txt', content: 'Updated content 1' },
    { path: './file2.txt', content: 'Updated content 2' }
  ]
});
```

### Pattern Matching

```typescript
// Search files with grep
const matches = await grepTool.execute({
  pattern: 'TODO|FIXME',
  path: './src',
  recursive: true,
  ignoreCase: true
});

// Advanced file search
const files = await searchFileTool.execute({
  directory: './src',
  pattern: '*.ts',
  excludePatterns: ['*.test.ts', '*.spec.ts'],
  maxDepth: 3
});
```

### Command Execution

```typescript
// Execute shell commands
const result = await cmdTool.execute({
  command: 'npm test',
  cwd: './project',
  timeout: 60000
});
```

## Advanced Usage

### Custom Tools

Create domain-specific tools for your application:

```typescript
const databaseQueryTool = createTool({
  name: 'dbQuery',
  description: 'Execute database queries',
  input: z.object({
    query: z.string(),
    params: z.array(z.any()).optional()
  }),
  output: z.object({
    rows: z.array(z.record(z.any())),
    rowCount: z.number()
  }),
  execute: async ({ query, params }) => {
    const result = await db.query(query, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount
    };
  }
});
```

### Parallel Execution

Execute multiple operations concurrently:

```typescript
const workflow = createWorkflow('parallel-processing')
  .parallel({
    // Each function runs concurrently
    fetchUserData: async (ctx) => {
      return await api.getUser(ctx.userId);
    },
    fetchOrderHistory: async (ctx) => {
      return await api.getOrders(ctx.userId);
    },
    fetchRecommendations: async (ctx) => {
      return await api.getRecommendations(ctx.userId);
    }
  })
  .step('combineResults', async ({ parallel }) => {
    return {
      user: parallel.fetchUserData,
      orders: parallel.fetchOrderHistory,
      recommendations: parallel.fetchRecommendations
    };
  });
```

### Error Handling

Implement robust error handling:

```typescript
const workflow = createWorkflow('error-handling')
  .step('riskyOperation', async (ctx) => {
    try {
      return await performRiskyOperation();
    } catch (error) {
      // Log error and provide fallback
      console.error('Operation failed:', error);
      return { fallback: true, error: error.message };
    }
  })
  .conditional({
    if: (ctx) => ctx.riskyOperation.fallback,
    then: (wf) => wf.step('handleFallback', async (ctx) => {
      // Handle fallback scenario
      return { recovered: true };
    }),
    else: (wf) => wf.step('continueNormal', async (ctx) => {
      // Continue with normal flow
      return { success: true };
    })
  });
```

### State Persistence

Enable workflow persistence for long-running operations:

```typescript
const workflow = createWorkflow('long-running', {
  persistence: {
    enabled: true,
    checkpointInterval: 5, // Save state every 5 steps
    resumable: true
  }
})
  .step('checkpoint1', async (ctx) => {
    // This state will be persisted
    return { data: 'important' };
  })
  .step('checkpoint2', async (ctx) => {
    // Can resume from here if interrupted
    return { moreData: 'also important' };
  });

// Resume a workflow
const resumedWorkflow = await workflow.resume(sessionId);
```

## CLI Usage

Roast provides a command-line interface for workflow management:

```bash
# Run a workflow file
roast run workflow.ts

# Run with specific configuration
roast run workflow.ts --config ./custom.config.ts

# List available workflows
roast list

# Show workflow details
roast info workflow-name

# Resume a suspended workflow
roast resume session-id

# Clean up old workflow states
roast cleanup --days 30
```

## API Reference

### Workflow API

- `createWorkflow(name: string, options?: WorkflowOptions)` - Create a new workflow
- `workflow.tool(name: string, tool: Tool)` - Register a tool
- `workflow.prompt(template: string | PromptFunction)` - Add a prompt step
- `workflow.step(name: string, handler: StepHandler)` - Add a custom step
- `workflow.parallel(steps: ParallelSteps)` - Add parallel execution
- `workflow.conditional(condition: ConditionalStep)` - Add conditional logic
- `workflow.loop(options: LoopOptions)` - Add loop logic
- `workflow.run(input: WorkflowInput)` - Execute the workflow

### Tool API

- `createTool(config: ToolConfig)` - Create a custom tool
- `tool.execute(input: ToolInput)` - Execute a tool
- `tool.validate(input: unknown)` - Validate tool input
- `tool.withMiddleware(middleware: ToolMiddleware)` - Add middleware

### State API

- `StateManager.save(state: WorkflowState)` - Save workflow state
- `StateManager.load(sessionId: string)` - Load workflow state
- `StateManager.replay(sessionId: string, toStep?: number)` - Replay workflow
- `StateManager.on(event: string, handler: EventHandler)` - Subscribe to events

For complete API documentation, see [API Reference](./docs/api-reference.md).

## Production Deployment

### Performance Optimization

```typescript
// Enable caching for expensive operations
const config: RoastConfig = {
  tools: {
    cacheEnabled: true,
    cacheStrategy: 'lru',
    cacheSize: 1000
  },
  // Batch LLM requests
  llm: {
    batchSize: 10,
    batchDelay: 100
  }
};
```

### Monitoring and Logging

```typescript
import { Logger } from 'roast-ts/helpers';

// Configure logging
Logger.configure({
  level: 'info',
  format: 'json',
  transports: [
    { type: 'console' },
    { type: 'file', path: './logs/roast.log' }
  ]
});

// Monitor workflow execution
workflow.on('stepComplete', (event) => {
  metrics.record('workflow.step.duration', event.duration);
});
```

### Scaling Considerations

- Use worker pools for CPU-intensive operations
- Implement request queuing for LLM calls
- Enable state persistence for fault tolerance
- Use distributed locking for concurrent workflows

### Security Best Practices

- Always validate and sanitize user inputs
- Use environment variables for sensitive configuration
- Enable path traversal protection
- Implement rate limiting for LLM requests
- Regular security audits of custom tools

## Troubleshooting

### Common Issues

**LLM Connection Errors**
```typescript
// Add retry logic
const config: RoastConfig = {
  llm: {
    retryCount: 3,
    retryDelay: 1000,
    timeout: 30000
  }
};
```

**Memory Issues with Large Files**
```typescript
// Use streaming for large files
const readResult = await readFileTool.execute({
  path: './large-file.txt',
  stream: true,
  chunkSize: 1024 * 1024 // 1MB chunks
});
```

**State Corruption**
```bash
# Verify state integrity
roast state verify session-id

# Repair corrupted state
roast state repair session-id
```

### Debug Mode

Enable debug logging:

```typescript
process.env.ROAST_DEBUG = 'true';
process.env.ROAST_LOG_LEVEL = 'debug';
```

### Getting Help

- [Documentation](https://roast-ts.dev/docs)
- [GitHub Issues](https://github.com/roast-ts/roast-ts/issues)
- [Discord Community](https://discord.gg/roast-ts)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/roast-ts)

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/roast-ts/roast-ts.git

# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type check
npm run typecheck

# Lint
npm run lint
```

## Acknowledgments

This project draws inspiration from [Shopify's Roast](https://github.com/Shopify/roast/), a declarative deployment tool that pioneered the concept of simple, powerful workflow definitions. We extend our gratitude to the Shopify team for their innovative approach to declarative systems, which influenced our design philosophy of making complex workflows simple and type-safe.

## License

MIT © [Roast TypeScript Contributors](LICENSE)

