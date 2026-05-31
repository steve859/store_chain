/**
 * Variant Preload Processor
 * Syncs variant pricing data from database to in-memory engine after pricing batch completion
 * Ensures L1 cache stays fresh for <1ms lookups
 */

import { Job } from 'bull';
import { pricingEngine } from '../../cache/pricingEngine';
import { logger } from '../../monitoring/logger';
import prisma from '../../../db/prisma';
import { registerProcessor, JobType } from '../jobQueue';

export interface VariantPreloadJobData {
  storeId: number;
  variantIds?: number[]; // If provided, preload only these variants
  skipIfCached?: boolean; // Skip if cache is already fresh
}

/**
 * Process variant preload job
 * Loads variant pricing data into in-memory cache
 */
export async function variantPreloadProcessor(job: Job<VariantPreloadJobData>) {
  const { storeId, variantIds, skipIfCached } = job.data;

  try {
    // Check if cache is already valid and skip not requested
    if (skipIfCached && pricingEngine.isEngineCacheValid(storeId)) {
      logger.info({
        message: 'Skipping variant preload - cache is fresh',
        storeId,
        jobId: job.id,
      });
      return {
        status: 'skipped',
        storeId,
        reason: 'cache_fresh',
      };
    }

    // If specific variants provided, just preload those
    if (variantIds && variantIds.length > 0) {
      logger.info({
        message: 'Preloading specific variants',
        storeId,
        variantCount: variantIds.length,
      });

      const variants = await prisma.product_variants.findMany({
        where: {
          id: { in: variantIds },
          is_active: true,
        },
        select: {
          id: true,
          price: true,
          cost_price: true,
          variant_code: true,
          product_id: true,
        },
      });

      for (const v of variants) {
        pricingEngine.updateVariantInMemory({
          variantId: v.id,
          storeId,
          currentPrice: Number(v.price),
          costPrice: v.cost_price ? Number(v.cost_price) : 0,
          lastUpdatedAt: Date.now(),
          variantCode: v.variant_code || undefined,
          productId: v.product_id || undefined,
        });
      }

      return {
        status: 'success',
        storeId,
        variantsPreloaded: variants.length,
      };
    }

    // Full store preload
    const stats = await pricingEngine.preloadVariantIndex(storeId);

    return {
      status: 'success',
      storeId,
      variantsPreloaded: stats.variantCount,
      memoryMB: (stats.memoryBytes / 1024 / 1024).toFixed(2),
    };
  } catch (error: any) {
    logger.error({
      message: 'Variant preload job failed',
      storeId,
      jobId: job.id,
      errorMessage: error.message,
    });
    throw error;
  }
}

// Register the processor
registerProcessor<VariantPreloadJobData>(
  JobType.PRELOAD_VARIANTS,
  variantPreloadProcessor,
  3 // 3 concurrent preload workers
);
