import { ResourceConfig, ValidationResult } from '../../shared/types';
import { NoneResource, ResourceHandler } from '../types';

export class NoneResourceHandler implements ResourceHandler<NoneResource> {
  async create(config: ResourceConfig): Promise<NoneResource> {
    return {
      type: 'none' as const,
      source: config.source || '',

      async exists(): Promise<boolean> {
        return true;
      },

      async validate(): Promise<ValidationResult> {
        return {
          valid: true,
          errors: []
        };
      }
    };
  }
}