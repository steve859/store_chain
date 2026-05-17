import { EventEmitter } from 'events';

export interface InventoryUpdateEvent {
  storeId: number;
  variantId: number;
  quantity: number;
  reserved: number;
  previousQuantity: number;
  change: number;
  movementType: 'receive' | 'adjustment' | 'sale' | 'return' | 'transfer';
  reason?: string;
  timestamp: Date;
}

export interface StoreTransferEvent {
  fromStoreId: number;
  toStoreId: number;
  variantId: number;
  quantity: number;
  status: 'pending' | 'completed' | 'cancelled';
  timestamp: Date;
}

export type DomainEvent = InventoryUpdateEvent | StoreTransferEvent;

interface EventSubscriber<T extends DomainEvent> {
  id: string;
  handler: (event: T) => Promise<void> | void;
}

class EventBus extends EventEmitter {
  private static instance: EventBus;

  private subscribers: Map<string, Set<EventSubscriber<any>>> = new Map();

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to events of a specific type
   */
  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: (event: T) => Promise<void> | void,
    subscriberId?: string
  ): () => void {
    const id = subscriberId || `${eventType}-${Date.now()}-${Math.random()}`;

    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }

    const subscriber: EventSubscriber<T> = { id, handler };
    this.subscribers.get(eventType)!.add(subscriber);

    const unsubscribe = () => {
      const subs = this.subscribers.get(eventType);
      if (subs) {
        subs.delete(subscriber);
        if (subs.size === 0) {
          this.subscribers.delete(eventType);
        }
      }
    };

    return unsubscribe;
  }

  /**
   * Publish an event to all subscribers
   */
  async publish<T extends DomainEvent>(eventType: string, event: T): Promise<void> {
    const subscribers = this.subscribers.get(eventType);

    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const promises = Array.from(subscribers).map(async (subscriber) => {
      try {
        await Promise.resolve(subscriber.handler(event));
      } catch (error) {
        console.error(
          `Error in event subscriber ${subscriber.id} for ${eventType}:`,
          error
        );
      }
    });

    await Promise.all(promises);
  }

  /**
   * Get subscriber count for an event type
   */
  getSubscriberCount(eventType: string): number {
    return this.subscribers.get(eventType)?.size ?? 0;
  }

  /**
   * Get all event types with subscribers
   */
  getEventTypes(): string[] {
    return Array.from(this.subscribers.keys());
  }

  /**
   * Clear all subscribers (for testing)
   */
  clearAll(): void {
    this.subscribers.clear();
  }
}

export const eventBus = EventBus.getInstance();
