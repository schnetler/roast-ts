import { WorkflowConfig, WorkflowContext } from '../shared/types';
import { WorkflowExecutor } from '../workflow/workflow-executor';
import { 
  Resource, 
  ProcessResult, 
  ProcessOptions,
  FileResource,
  DirectoryResource,
  UrlResource,
  ApiResource
} from './types';

export class ResourceProcessor {
  constructor(private executor: WorkflowExecutor) {}

  async processResources(
    resources: Resource[],
    workflow: WorkflowConfig,
    options: ProcessOptions = {}
  ): Promise<ProcessResult[]> {
    const { parallel = false, maxConcurrency = 5 } = options;

    if (parallel) {
      return this.processParallel(resources, workflow, maxConcurrency);
    } else {
      return this.processSequential(resources, workflow);
    }
  }

  private async processSequential(
    resources: Resource[],
    workflow: WorkflowConfig
  ): Promise<ProcessResult[]> {
    const results: ProcessResult[] = [];

    for (const resource of resources) {
      const result = await this.processResource(resource, workflow);
      results.push(result);
    }

    return results;
  }

  private async processParallel(
    resources: Resource[],
    workflow: WorkflowConfig,
    maxConcurrency: number
  ): Promise<ProcessResult[]> {
    const queue = [...resources];
    const results: ProcessResult[] = [];
    const processing = new Set<Promise<void>>();

    while (queue.length > 0 || processing.size > 0) {
      while (processing.size < maxConcurrency && queue.length > 0) {
        const resource = queue.shift()!;
        const promise = this.processResource(resource, workflow)
          .then(result => {
            results.push(result);
            processing.delete(promise);
          });
        
        processing.add(promise);
      }

      if (processing.size > 0) {
        await Promise.race(processing);
      }
    }

    return results;
  }

  private async processResource(
    resource: Resource,
    workflow: WorkflowConfig
  ): Promise<ProcessResult> {
    try {
      const context = await this.buildContext(resource);
      const result = await this.executor.execute(workflow, context);
      
      return {
        resource,
        success: true,
        result
      };
    } catch (error) {
      return {
        resource,
        success: false,
        error: error as Error
      };
    }
  }

  private async buildContext(resource: Resource): Promise<WorkflowContext> {
    switch (resource.type) {
      case 'file':
        const fileResource = resource as FileResource;
        return {
          type: 'file',
          path: fileResource.path,
          content: await fileResource.read()
        } as any;
      
      case 'directory':
        const dirResource = resource as DirectoryResource;
        return {
          type: 'directory',
          path: dirResource.path,
          files: await dirResource.list()
        } as any;
      
      case 'url':
        const urlResource = resource as UrlResource;
        const response = await urlResource.fetch();
        return {
          type: 'url',
          url: urlResource.url.toString(),
          content: await response.text()
        } as any;
      
      case 'api':
        const apiResource = resource as ApiResource;
        const apiResult = await apiResource.execute();
        return {
          type: 'api',
          data: apiResult.data
        } as any;
      
      default:
        return { type: 'none' } as any;
    }
  }
}