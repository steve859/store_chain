import { eventBus, CheckoutCompletedEvent } from '../../lib/events/eventBus';
import { getRedis } from '../../lib/cache/redis';
import { logger } from '../../lib/monitoring/logger';

/**
 * Data Aggregation Pipeline (CQRS)
 * Listens to domain events and updates real-time analytics projections in Redis
 */
class AnalyticsAggregator {
  public start() {
    eventBus.subscribe<CheckoutCompletedEvent>('checkout.completed', async (event) => {
      try {
        await this.handleCheckoutCompleted(event);
      } catch (error) {
        logger.error({ message: `[AnalyticsAggregator] Failed to aggregate checkout ${event.transactionId}`, error: String(error) });
      }
    });
    logger.info('[AnalyticsAggregator] Started listening to streaming events for OLAP projections');
  }

  private async handleCheckoutCompleted(event: CheckoutCompletedEvent) {
    const redis = getRedis();
    if (!redis) {
      logger.warn('[AnalyticsAggregator] Redis not available, skipping realtime aggregation');
      return;
    }

    const dateStr = new Date(event.timestamp).toISOString().split('T')[0];
    const storeId = event.storeId;

    // Keys for projections
    const dailyStoreKey = `analytics:store:${storeId}:daily:${dateStr}`;
    const globalDailyKey = `analytics:global:daily:${dateStr}`;

    const totalQuantity = event.items.reduce((sum, item) => sum + item.quantity, 0);

    const pipeline = redis.pipeline();

    // 1. Update Store-level daily metrics
    pipeline.hincrbyfloat(dailyStoreKey, 'revenue', event.totalAmount);
    pipeline.hincrby(dailyStoreKey, 'orders', 1);
    pipeline.hincrby(dailyStoreKey, 'products_sold', totalQuantity);

    // 2. Update Global-level daily metrics
    pipeline.hincrbyfloat(globalDailyKey, 'revenue', event.totalAmount);
    pipeline.hincrby(globalDailyKey, 'orders', 1);
    pipeline.hincrby(globalDailyKey, 'products_sold', totalQuantity);

    // 3. Update top products sorted set (Store level)
    const productZsetKey = `analytics:store:${storeId}:top_products:${dateStr}`;
    for (const item of event.items) {
      pipeline.zincrby(productZsetKey, item.quantity, item.skuId);
    }

    // Set TTL to 30 days for these real-time dashboard keys
    pipeline.expire(dailyStoreKey, 30 * 24 * 60 * 60);
    pipeline.expire(globalDailyKey, 30 * 24 * 60 * 60);
    pipeline.expire(productZsetKey, 30 * 24 * 60 * 60);

    await pipeline.exec();

    logger.debug(`[AnalyticsAggregator] Real-time metrics updated for store ${storeId}`);
  }
}

export const analyticsAggregator = new AnalyticsAggregator();
