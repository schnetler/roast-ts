export const Fixtures = {
  workflows: {
    simple: {
      name: 'simple-workflow',
      model: 'gpt-4',
      provider: 'openai',
      tools: new Map(),
      steps: [
        {
          name: 'analyze',
          type: 'prompt',
          prompt: 'Analyze this data',
          target: null
        }
      ],
      metadata: {}
    },
    
    complex: {
      name: 'complex-workflow',
      model: 'gpt-4',
      provider: 'openai',
      tools: new Map(),
      steps: [
        {
          name: 'read',
          type: 'step',
          handler: 'readFile'
        },
        {
          name: 'process',
          type: 'prompt',
          prompt: 'Process the data'
        },
        {
          name: 'save',
          type: 'step',
          handler: 'writeFile'
        }
      ],
      metadata: {
        version: '1.0.0',
        author: 'test'
      }
    },
    
    withAgents: {
      name: 'agent-workflow',
      model: 'gpt-4',
      provider: 'openai',
      tools: new Map([
        ['read', { name: 'read', execute: async () => ({ content: 'test' }) }],
        ['write', { name: 'write', execute: async () => ({ success: true }) }]
      ]),
      steps: [
        {
          name: 'agent-step',
          type: 'agent',
          prompt: 'Analyze and process files',
          maxSteps: 5,
          fallback: 'return_partial',
          tools: ['read', 'write']
        }
      ],
      metadata: {}
    }
  },
  
  prompts: {
    basic: "Analyze this code",
    
    templated: "Analyze {{file.name}} and provide insights",
    
    withMetadata: {
      content: "Analyze the following data:\\n{{data}}",
      metadata: {
        variables: ['data'],
        required: ['data'],
        engine: 'handlebars'
      }
    }
  },
  
  tools: {
    readFile: {
      name: 'readFile',
      description: 'Read a file',
      category: 'file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' }
        },
        required: ['path']
      },
      execute: jest.fn().mockResolvedValue({ content: 'file content' })
    },
    
    writeFile: {
      name: 'writeFile',
      description: 'Write a file',
      category: 'file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['path', 'content']
      },
      execute: jest.fn().mockResolvedValue({ success: true })
    }
  },
  
  resources: {
    file: {
      type: 'file',
      path: '/test/file.ts',
      exists: true,
      readable: true
    },
    
    directory: {
      type: 'directory',
      path: '/test/dir',
      exists: true,
      files: ['file1.ts', 'file2.ts']
    },
    
    url: {
      type: 'url',
      url: 'https://api.example.com/data',
      method: 'GET',
      headers: {}
    }
  },
  
  states: {
    initial: {
      sessionId: 'test-session-123',
      workflowName: 'test-workflow',
      status: 'pending',
      steps: [
        {
          id: 'step-1',
          name: 'step1',
          status: 'pending',
          type: 'prompt'
        },
        {
          id: 'step-2', 
          name: 'step2',
          status: 'pending',
          type: 'step'
        }
      ],
      context: {},
      startedAt: null,
      completedAt: null,
      error: null
    },
    
    running: {
      sessionId: 'test-session-123',
      workflowName: 'test-workflow',
      status: 'running',
      steps: [
        {
          id: 'step-1',
          name: 'step1',
          status: 'completed',
          type: 'prompt',
          result: { analysis: 'complete' }
        },
        {
          id: 'step-2',
          name: 'step2', 
          status: 'running',
          type: 'step'
        }
      ],
      context: {
        step1: { analysis: 'complete' }
      },
      startedAt: new Date('2024-01-01T00:00:00Z'),
      completedAt: null,
      error: null
    }
  }
};