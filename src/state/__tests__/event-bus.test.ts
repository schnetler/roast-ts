import { EventBus } from '../event-bus';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('on/emit', () => {
    it('should register and call event handlers', () => {
      const handler = jest.fn();
      const data = { test: 'data' };

      eventBus.on('test:event', handler);
      eventBus.emit('test:event', data);

      expect(handler).toHaveBeenCalledWith(data);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple handlers for same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const data = { test: 'data' };

      eventBus.on('test:event', handler1);
      eventBus.on('test:event', handler2);
      eventBus.emit('test:event', data);

      expect(handler1).toHaveBeenCalledWith(data);
      expect(handler2).toHaveBeenCalledWith(data);
    });

    it('should handle multiple events', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.on('event1', handler1);
      eventBus.on('event2', handler2);
      
      eventBus.emit('event1', { data: 1 });
      eventBus.emit('event2', { data: 2 });

      expect(handler1).toHaveBeenCalledWith({ data: 1 });
      expect(handler2).toHaveBeenCalledWith({ data: 2 });
      expect(handler1).not.toHaveBeenCalledWith({ data: 2 });
      expect(handler2).not.toHaveBeenCalledWith({ data: 1 });
    });

    it('should not call handlers for different events', () => {
      const handler = jest.fn();

      eventBus.on('event1', handler);
      eventBus.emit('event2', { data: 'test' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle emit with no handlers', () => {
      expect(() => {
        eventBus.emit('unhandled:event', { data: 'test' });
      }).not.toThrow();
    });
  });

  describe('off', () => {
    it('should unsubscribe using returned function', () => {
      const handler = jest.fn();
      const data = { test: 'data' };

      const unsubscribe = eventBus.on('test:event', handler);
      
      eventBus.emit('test:event', data);
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();
      
      eventBus.emit('test:event', data);
      expect(handler).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should only remove specific handler', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      const unsubscribe1 = eventBus.on('test:event', handler1);
      eventBus.on('test:event', handler2);

      unsubscribe1();

      eventBus.emit('test:event', {});

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should handle multiple unsubscribes', () => {
      const handler = jest.fn();
      const unsubscribe = eventBus.on('test:event', handler);

      unsubscribe();
      unsubscribe(); // Second call should not throw

      expect(() => {
        eventBus.emit('test:event', {});
      }).not.toThrow();
    });
  });

  describe('once', () => {
    it('should only call handler once', () => {
      const handler = jest.fn();
      const data1 = { test: 1 };
      const data2 = { test: 2 };

      eventBus.once('test:event', handler);
      
      eventBus.emit('test:event', data1);
      eventBus.emit('test:event', data2);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(data1);
      expect(handler).not.toHaveBeenCalledWith(data2);
    });

    it('should allow unsubscribe before event', () => {
      const handler = jest.fn();

      const unsubscribe = eventBus.once('test:event', handler);
      unsubscribe();

      eventBus.emit('test:event', {});

      expect(handler).not.toHaveBeenCalled();
    });

    it('should work with multiple once handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.once('test:event', handler1);
      eventBus.once('test:event', handler2);

      eventBus.emit('test:event', { data: 'test' });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      eventBus.emit('test:event', { data: 'test2' });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('should remove all handlers for an event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.on('test:event', handler1);
      eventBus.on('test:event', handler2);

      eventBus.clear('test:event');

      eventBus.emit('test:event', {});

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should only clear specific event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.on('event1', handler1);
      eventBus.on('event2', handler2);

      eventBus.clear('event1');

      eventBus.emit('event1', {});
      eventBus.emit('event2', {});

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should handle clearing non-existent event', () => {
      expect(() => {
        eventBus.clear('non:existent');
      }).not.toThrow();
    });
  });

  describe('clearAll', () => {
    it('should remove all handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      eventBus.on('event1', handler1);
      eventBus.on('event2', handler2);
      eventBus.on('event3', handler3);

      eventBus.clearAll();

      eventBus.emit('event1', {});
      eventBus.emit('event2', {});
      eventBus.emit('event3', {});

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should catch and log handler errors', () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const goodHandler = jest.fn();
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      eventBus.on('test:event', errorHandler);
      eventBus.on('test:event', goodHandler);

      eventBus.emit('test:event', { data: 'test' });

      expect(errorHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        'Error in event handler for test:event:',
        expect.any(Error)
      );

      consoleError.mockRestore();
    });

    it('should continue processing after handler error', () => {
      const handlers = [
        jest.fn(),
        jest.fn(() => { throw new Error('Error'); }),
        jest.fn()
      ];
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      handlers.forEach(h => eventBus.on('test:event', h));

      eventBus.emit('test:event', {});

      expect(handlers[0]).toHaveBeenCalled();
      expect(handlers[1]).toHaveBeenCalled();
      expect(handlers[2]).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('event namespacing', () => {
    it('should support namespaced events', () => {
      const handlers = {
        'user:created': jest.fn(),
        'user:updated': jest.fn(),
        'user:deleted': jest.fn(),
        'post:created': jest.fn()
      };

      Object.entries(handlers).forEach(([event, handler]) => {
        eventBus.on(event, handler);
      });

      eventBus.emit('user:created', { id: 1 });
      eventBus.emit('user:updated', { id: 1 });
      eventBus.emit('post:created', { id: 2 });

      expect(handlers['user:created']).toHaveBeenCalledWith({ id: 1 });
      expect(handlers['user:updated']).toHaveBeenCalledWith({ id: 1 });
      expect(handlers['user:deleted']).not.toHaveBeenCalled();
      expect(handlers['post:created']).toHaveBeenCalledWith({ id: 2 });
    });
  });

  describe('getEventNames', () => {
    it('should return all registered event names', () => {
      eventBus.on('event1', jest.fn());
      eventBus.on('event2', jest.fn());
      eventBus.on('event1', jest.fn()); // Duplicate event

      const eventNames = eventBus.getEventNames();

      expect(eventNames).toContain('event1');
      expect(eventNames).toContain('event2');
      expect(eventNames).toHaveLength(2);
    });

    it('should return empty array when no events', () => {
      const eventNames = eventBus.getEventNames();
      expect(eventNames).toEqual([]);
    });
  });

  describe('getHandlerCount', () => {
    it('should return handler count for event', () => {
      eventBus.on('test:event', jest.fn());
      eventBus.on('test:event', jest.fn());
      eventBus.on('other:event', jest.fn());

      expect(eventBus.getHandlerCount('test:event')).toBe(2);
      expect(eventBus.getHandlerCount('other:event')).toBe(1);
      expect(eventBus.getHandlerCount('non:existent')).toBe(0);
    });
  });
});