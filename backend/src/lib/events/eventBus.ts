import { EventEmitter } from 'events';
import Redis, { Cluster } from 'ioredis';

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

export interface CheckoutFailedEvent {
  transactionId: string;
  storeId: number;
  reason: string;
  failureStage: 'validation' | 'reserve_inventory' | 'authorize_payment' | 'process_transaction';
  timestamp: number;
}

export interface CheckoutCompletedEvent {
  transactionId: string;
  storeId: number;
  totalAmount: number;
  paidAmount: number;
  paymentMethod: string;
  items: Array<{
    skuId: string;
    quantity: number;
    price: number;
  }>;
  timestamp: number;
}

export type DomainEvent = InventoryUpdateEvent | StoreTransferEvent | CheckoutFailedEvent | CheckoutCompletedEvent;

interface EventSubscriber<T extends DomainEvent> {
  id: string;
  handler: (event: T) => Promise<void> | void;
}

const REDIS_CHANNEL_PREFIX = 'events:';

export const publishCheckoutFailed = async (event: CheckoutFailedEvent) => {
  await eventBus.publish('checkout.failed', event);
};

class EventBus extends EventEmitter {
  private static instance: EventBus;

  private subscribers: Map<string, Set<EventSubscriber<any>>> = new Map();
  private publisher: Redis | Cluster | null = null;
  private subscriberClient: Redis | Cluster | null = null;
  private isRedisEnabled = false;

  private constructor() {
    super();
    this.setMaxListeners(100);
    this.initRedis();
  }

  private initRedis() {
    const url = process.env.REDIS_URL?.trim();
    const clusterNodesRaw = process.env.REDIS_CLUSTER_NODES;
    const clusterNodes = clusterNodesRaw
      ? clusterNodesRaw
          .split(',')
          .map((x) => x.trim())
          .filter((x) => x.length > 0)
      : [];

    if (!url && clusterNodes.length === 0) {
      console.warn('[EventBus] No Redis configuration found. Falling back to local in-memory event bus.');
      return;
    }

    try {
      if (clusterNodes.length > 0) {
        const nodes = clusterNodes.map((node) => {
          const [host, portRaw] = node.split(':');
          return { host, port: Number(portRaw ?? 6379) };
        });
        this.publisher = new Cluster(nodes, { redisOptions: { lazyConnect: true } });
        this.subscriberClient = new Cluster(nodes, { redisOptions: { lazyConnect: true } });
      } else if (url) {
        this.publisher = new Redis(url, { lazyConnect: true });
        this.subscriberClient = new Redis(url, { lazyConnect: true });
      }

      if (this.subscriberClient && this.publisher) {
        this.subscriberClient.on('message', this.handleRedisMessage.bind(this));
        
        // Connect both
        this.publisher.connect().catch(() => {});
        this.subscriberClient.connect().then(() => {
          this.isRedisEnabled = true;
          // Subscribe to already registered channels if any
          for (const eventType of this.subscribers.keys()) {
             this.subscriberClient?.subscribe(`${REDIS_CHANNEL_PREFIX}${eventType}`).catch(() => {});
          }
        }).catch((err) => {
          console.warn('[EventBus] Failed to connect subscriber:', err.message);
        });
      }
    } catch (err) {
      console.warn('[EventBus] Failed to initialize Redis clients. Falling back to local in-memory event bus.', err);
    }
  }

  private handleRedisMessage(channel: string, message: string) {
    if (!channel.startsWith(REDIS_CHANNEL_PREFIX)) return;
    
    const eventType = channel.substring(REDIS_CHANNEL_PREFIX.length);
    try {
      const event = JSON.parse(message, (key, value) => {
        // Revive dates
        if (key === 'timestamp' && typeof value === 'string') {
          return new Date(value);
        }
        return value;
      });
      
      this.handleLocalEvent(eventType, event);
    } catch (error) {
      console.error(`[EventBus] Error parsing event from channel ${channel}:`, error);
    }
  }

  private async handleLocalEvent(eventType: string, event: any) {
    const subscribers = this.subscribers.get(eventType);
    if (!subscribers || subscribers.size === 0) return;

    const promises = Array.from(subscribers).map(async (subscriber) => {
      try {
        await Promise.resolve(subscriber.handler(event));
      } catch (error) {
        console.error(`Error in event subscriber ${subscriber.id} for ${eventType}:`, error);
      }
    });

    await Promise.all(promises);
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
      
      // If Redis is enabled, subscribe to the channel
      if (this.isRedisEnabled && this.subscriberClient) {
        this.subscriberClient.subscribe(`${REDIS_CHANNEL_PREFIX}${eventType}`).catch((err) => {
          console.error(`[EventBus] Failed to subscribe to Redis channel for ${eventType}:`, err);
        });
      }
    }

    const subscriber: EventSubscriber<T> = { id, handler };
    this.subscribers.get(eventType)!.add(subscriber);

    const unsubscribe = () => {
      const subs = this.subscribers.get(eventType);
      if (subs) {
        subs.delete(subscriber);
        if (subs.size === 0) {
          this.subscribers.delete(eventType);
          
          // Unsubscribe from Redis if no local listeners left
          if (this.isRedisEnabled && this.subscriberClient) {
            this.subscriberClient.unsubscribe(`${REDIS_CHANNEL_PREFIX}${eventType}`).catch(() => {});
          }
        }
      }
    };

    return unsubscribe;
  }

  /**
   * Publish an event to all subscribers
   */
  async publish<T extends DomainEvent>(eventType: string, event: T): Promise<void> {
    if (this.isRedisEnabled && this.publisher) {
      try {
        const payload = JSON.stringify(event);
        await this.publisher.publish(`${REDIS_CHANNEL_PREFIX}${eventType}`, payload);
      } catch (err) {
        console.error(`[EventBus] Failed to publish event ${eventType} to Redis:`, err);
        // Fallback to local
        await this.handleLocalEvent(eventType, event);
      }
    } else {
      // Local only
      await this.handleLocalEvent(eventType, event);
    }
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
    if (this.isRedisEnabled && this.subscriberClient) {
      for (const eventType of this.subscribers.keys()) {
        this.subscriberClient.unsubscribe(`${REDIS_CHANNEL_PREFIX}${eventType}`).catch(() => {});
      }
    }
    this.subscribers.clear();
  }
}

export const eventBus = EventBus.getInstance();
