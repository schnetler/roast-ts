export type EventHandler<T = any> = (data: T) => void;

export class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  /**
   * Subscribe to an event
   */
  on<T = any>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }

    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      const eventHandlers = this.handlers.get(event);
      if (eventHandlers) {
        eventHandlers.delete(handler);
        if (eventHandlers.size === 0) {
          this.handlers.delete(event);
        }
      }
    };
  }

  /**
   * Subscribe to an event that fires only once
   */
  once<T = any>(event: string, handler: EventHandler<T>): () => void {
    const wrappedHandler: EventHandler<T> = (data) => {
      handler(data);
      unsubscribe();
    };

    const unsubscribe = this.on(event, wrappedHandler);
    return unsubscribe;
  }

  /**
   * Emit an event
   */
  emit<T = any>(event: string, data: T): void {
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers) {
      return;
    }

    // Make a copy to avoid issues if handlers modify the set
    const handlers = Array.from(eventHandlers);
    
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Remove all handlers for an event
   */
  clear(event: string): void {
    this.handlers.delete(event);
  }

  /**
   * Remove all handlers for all events
   */
  clearAll(): void {
    this.handlers.clear();
  }

  /**
   * Get all registered event names
   */
  getEventNames(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get handler count for an event
   */
  getHandlerCount(event: string): number {
    const eventHandlers = this.handlers.get(event);
    return eventHandlers ? eventHandlers.size : 0;
  }
}