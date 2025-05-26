import { NoneResourceHandler } from '../none-resource';
import { ResourceConfig } from '../../../shared/types';

describe('NoneResourceHandler', () => {
  let handler: NoneResourceHandler;

  beforeEach(() => {
    handler = new NoneResourceHandler();
  });

  describe('create', () => {
    it('should create a none resource with default empty source', async () => {
      const config: ResourceConfig = {
        source: '',
        type: 'none'
      };

      const resource = await handler.create(config);

      expect(resource.type).toBe('none');
      expect(resource.source).toBe('');
    });

    it('should create a none resource with provided source', async () => {
      const config: ResourceConfig = {
        type: 'none',
        source: 'custom-source'
      };

      const resource = await handler.create(config);

      expect(resource.type).toBe('none');
      expect(resource.source).toBe('custom-source');
    });

    describe('resource methods', () => {
      it('should always exist', async () => {
        const config: ResourceConfig = {
          type: 'none',
          source: ''
        };

        const resource = await handler.create(config);
        const exists = await resource.exists();

        expect(exists).toBe(true);
      });

      it('should always be valid', async () => {
        const config: ResourceConfig = {
          type: 'none',
          source: ''
        };

        const resource = await handler.create(config);
        const validation = await resource.validate();

        expect(validation.valid).toBe(true);
        expect(validation.errors).toEqual([]);
      });

      it('should handle exists() with different source values', async () => {
        const configs: ResourceConfig[] = [
          { type: 'none', source: '' },
          { type: 'none', source: 'some-value' },
          { type: 'none', source: '' }  // Can't use undefined for required field
        ];

        for (const config of configs) {
          const resource = await handler.create(config);
          const exists = await resource.exists();
          expect(exists).toBe(true);
        }
      });

      it('should handle validate() with different source values', async () => {
        const configs: ResourceConfig[] = [
          { type: 'none', source: '' },
          { type: 'none', source: 'some-value' },
          { type: 'none', source: '' }  // Can't use undefined for required field
        ];

        for (const config of configs) {
          const resource = await handler.create(config);
          const validation = await resource.validate();
          expect(validation.valid).toBe(true);
          expect(validation.errors).toEqual([]);
        }
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty source gracefully', async () => {
      const config: ResourceConfig = {
        type: 'none',
        source: ''
      };

      const resource = await handler.create(config);
      
      expect(resource.type).toBe('none');
      expect(resource.source).toBe('');
      
      const exists = await resource.exists();
      expect(exists).toBe(true);
      
      const validation = await resource.validate();
      expect(validation.valid).toBe(true);
    });

    it('should use empty string when source not provided in config', async () => {
      const config = {
        type: 'none'
      } as ResourceConfig;

      const resource = await handler.create(config);
      
      expect(resource.type).toBe('none');
      expect(resource.source).toBe('');
    });

    it('should be immutable after creation', async () => {
      const config: ResourceConfig = {
        type: 'none',
        source: 'original'
      };

      const resource = await handler.create(config);
      
      // Modify config after creation
      config.source = 'modified';
      
      // Resource should still have original value
      expect(resource.source).toBe('original');
    });
  });
});