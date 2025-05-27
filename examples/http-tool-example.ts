import { createWorkflow, createHttpTool } from '../src';

// Example 1: Basic HTTP Tool
async function basicExample() {
  // Create a simple HTTP tool
  const jsonApi = createHttpTool({
    name: 'jsonplaceholder',
    baseURL: 'https://jsonplaceholder.typicode.com',
    description: 'JSONPlaceholder API for testing'
  });

  // Create a workflow that uses the HTTP tool
  const workflow = createWorkflow('fetch-posts')
    .tool('api', jsonApi)
    .step('fetchPosts', async (context) => {
      const result = await context.api({
        endpoint: '/posts',
        method: 'GET',
        query: { _limit: 5 }
      });
      return result.data;
    })
    .step('displayPosts', async (context) => {
      const posts = context.fetchPosts;
      console.log(`Fetched ${posts.length} posts:`);
      posts.forEach((post: any) => {
        console.log(`- ${post.title}`);
      });
      return posts;
    });

  await workflow.run();
}

// Example 2: HTTP Tool with Authentication
async function authExample() {
  // Create an HTTP tool with Bearer token authentication
  const githubApi = createHttpTool({
    name: 'github',
    baseURL: 'https://api.github.com',
    auth: {
      type: 'bearer',
      token: process.env.GITHUB_TOKEN || 'your-token-here'
    },
    headers: {
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  const workflow = createWorkflow('github-user-info')
    .tool('github', githubApi)
    .step('getUser', async (context) => {
      const result = await context.github({
        endpoint: '/user',
        method: 'GET'
      });
      return result.data;
    })
    .step('displayUser', async (context) => {
      const user = context.getUser;
      console.log(`GitHub User: ${user.login}`);
      console.log(`Name: ${user.name}`);
      console.log(`Public Repos: ${user.public_repos}`);
      return user;
    });

  await workflow.run();
}

// Example 3: HTTP Tool with Predefined Endpoints
async function endpointsExample() {
  // Create an HTTP tool with predefined endpoint methods
  const outlookTool = createHttpTool({
    name: 'outlook',
    baseURL: 'https://graph.microsoft.com/v1.0',
    auth: {
      type: 'bearer',
      token: process.env.OUTLOOK_TOKEN || 'your-token-here'
    },
    endpoints: {
      getMessages: {
        path: '/me/messages',
        method: 'GET',
        description: 'Get user messages'
      },
      sendMessage: {
        path: '/me/sendMail',
        method: 'POST',
        description: 'Send an email'
      },
      getCalendarEvents: {
        path: '/me/events',
        method: 'GET',
        description: 'Get calendar events'
      }
    }
  });

  const workflow = createWorkflow('outlook-integration')
    .tool('outlook', outlookTool)
    .step('fetchEmails', async (context) => {
      // Use the predefined endpoint
      const result = await context.outlook.endpoints.getMessages({
        query: { 
          $top: 10,
          $select: 'subject,from,receivedDateTime'
        }
      });
      return result.data.value;
    })
    .step('displayEmails', async (context) => {
      const emails = context.fetchEmails;
      console.log(`Recent emails:`);
      emails.forEach((email: any) => {
        console.log(`- ${email.subject} from ${email.from.emailAddress.address}`);
      });
      return emails;
    });

  await workflow.run();
}

// Example 4: HTTP Tool with Request/Response Transformation
async function transformExample() {
  // Create an HTTP tool with custom transformations
  const apiWithTransform = createHttpTool({
    name: 'transform-api',
    baseURL: 'https://api.example.com',
    requestInterceptor: (config) => {
      // Add API key to all requests
      const url = new URL(config.url);
      url.searchParams.set('api_key', process.env.API_KEY || 'demo-key');
      
      // Add request ID header
      return {
        ...config,
        url: url.toString(),
        headers: {
          ...config.headers,
          'X-Request-ID': `req-${Date.now()}`
        }
      };
    },
    responseTransformer: (response) => {
      // Add timing information to all responses
      return {
        ...response,
        timing: {
          timestamp: new Date().toISOString(),
          duration: response.headers['x-response-time'] || 'unknown'
        }
      };
    }
  });

  const workflow = createWorkflow('transform-example')
    .tool('api', apiWithTransform)
    .step('makeRequest', async (context) => {
      const result = await context.api({
        endpoint: '/data',
        method: 'GET'
      });
      
      console.log(`Request completed at: ${result.timing.timestamp}`);
      return result;
    });

  await workflow.run();
}

// Example 5: Complete REST API Integration
async function restApiExample() {
  // Create a full-featured REST API tool
  const restApi = createHttpTool({
    name: 'rest-api',
    baseURL: 'https://api.example.com/v1',
    auth: {
      type: 'apiKey',
      key: process.env.API_KEY || 'your-api-key',
      in: 'header',
      name: 'X-API-Key'
    },
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    timeout: 30000,
    retryConfig: {
      maxAttempts: 3,
      backoff: 'exponential'
    }
  });

  const workflow = createWorkflow('rest-crud-operations')
    .tool('api', restApi)
    .step('createResource', async (context) => {
      const result = await context.api({
        endpoint: '/resources',
        method: 'POST',
        body: {
          name: 'New Resource',
          type: 'example',
          metadata: {
            created: new Date().toISOString()
          }
        }
      });
      console.log(`Created resource with ID: ${result.data.id}`);
      return result.data;
    })
    .step('updateResource', async (context) => {
      const resource = context.createResource;
      const result = await context.api({
        endpoint: `/resources/${resource.id}`,
        method: 'PUT',
        body: {
          ...resource,
          name: 'Updated Resource',
          metadata: {
            ...resource.metadata,
            updated: new Date().toISOString()
          }
        }
      });
      console.log(`Updated resource: ${result.data.name}`);
      return result.data;
    })
    .step('getResource', async (context) => {
      const resource = context.updateResource;
      const result = await context.api({
        endpoint: `/resources/${resource.id}`,
        method: 'GET'
      });
      console.log(`Retrieved resource: ${JSON.stringify(result.data, null, 2)}`);
      return result.data;
    })
    .step('deleteResource', async (context) => {
      const resource = context.getResource;
      const result = await context.api({
        endpoint: `/resources/${resource.id}`,
        method: 'DELETE'
      });
      console.log(`Deleted resource with status: ${result.status}`);
      return result;
    });

  await workflow.run();
}

// Run examples (comment out as needed)
if (require.main === module) {
  console.log('Running HTTP Tool Examples...\n');
  
  // Run basic example
  basicExample()
    .then(() => console.log('\n✓ Basic example completed'))
    .catch(console.error);

  // Other examples require authentication tokens
  // authExample().catch(console.error);
  // endpointsExample().catch(console.error);
  // transformExample().catch(console.error);
  // restApiExample().catch(console.error);
}