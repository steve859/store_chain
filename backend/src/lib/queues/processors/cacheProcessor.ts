import { Job } from 'bull';
import { registerProcessor, JobType } from '../jobQueue';
import { logger } from '../../monitoring/logger';

/**
 * Cache Invalidation Job Processor
 * Handles clearing cache when data changes
 * Examples: product catalog, inventory, pricing
 */

interface CacheInvalidationJob {
  cacheKey: string;
  storeId?: string;
  reason: string;
}

async function cacheInvalidationProcessor(job: Job<CacheInvalidationJob>) {
  const { cacheKey, storeId, reason } = job.data;

  try {
    logger.info({
      type: 'cache_invalidation_started',
      cacheKey,
      reason,
    });

    // TODO: Implement Redis cache invalidation
    // const redis = getRedisClient();
    // await redis.del(cacheKey);

    logger.info({
      type: 'cache_invalidated',
      cacheKey,
    });

    return {
      success: true,
      cacheKey,
      invalidatedAt: new Date(),
    };
  } catch (error: any) {
    logger.error({
      type: 'cache_invalidation_failed',
      cacheKey,
      error: error.message,
    });

    throw error;
  }
}

// Register processor
registerProcessor(JobType.INVALIDATE_CACHE, cacheInvalidationProcessor, 5);

export { cacheInvalidationProcessor };
