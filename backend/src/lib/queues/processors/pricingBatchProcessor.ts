import { Job } from 'bull';
import { registerProcessor, JobType, enqueueJob } from '../jobQueue';
import prisma from '../../../db/prisma';
import { getRulesFromCache } from '../../cache/pricingRules';
import { logger } from '../../monitoring/logger';

interface PricingBatchJobData {
  storeId: number;
  limit?: number;
  offset?: number;
  forceRecalculate?: boolean;
}

interface PricingBatchResult {
  calculated: number;
  failed: number;
  skipped: number;
  errors: Array<{ variantId: number; error: string }>;
  duration: number;
}

/**
 * Calculate recommended prices for batch of product variants
 * Processes in pagination to handle large stores efficiently
 */
async function calculatePriceForVariant(
  storeId: number,
  variantId: number,
  rules: any[],
  demandMetrics?: any
): Promise<number | null> {
  try {
    let recommendedPrice = 0;

    // Get current price from variant_prices (store-specific)
    const currentPricing = await prisma.variant_prices.findFirst({
      where: {
        variant_id: variantId,
        store_id: storeId,
      },
    });

    if (!currentPricing) {
      // Fallback to product variant base price
      const variant = await prisma.product_variants.findUnique({
        where: { id: variantId },
      });
      if (!variant) return null;
      recommendedPrice = Number(variant.price);
    } else {
      recommendedPrice = Number(currentPricing.price);
    }

    // Apply rules by priority
    for (const rule of rules) {
      const demandLevel = demandMetrics?.demand_level;

      switch (rule.ruleType) {
        case 'fixed':
          recommendedPrice = rule.basePrice || recommendedPrice;
          break;

        case 'percentage':
          if (rule.adjustmentValue && rule.adjustmentType === 'percentage') {
            recommendedPrice = recommendedPrice * (1 + rule.adjustmentValue / 100);
          }
          break;

        case 'demand_based':
          if (demandLevel !== undefined) {
            if (demandLevel > 80) {
              recommendedPrice = recommendedPrice * 1.15; // High demand
            } else if (demandLevel < 40) {
              recommendedPrice = recommendedPrice * 0.8; // Low demand
            }
          }
          break;

        case 'competitor_based':
          // Handled separately or via competitor price tracking
          break;

        case 'time_based':
          const hour = new Date().getHours();
          const dayOfWeek = new Date().getDay();

          if ((hour >= 11 && hour <= 14) || (hour >= 17 && hour <= 20)) {
            recommendedPrice = recommendedPrice * 1.05; // Peak hours
          } else if (dayOfWeek === 0 || dayOfWeek === 6) {
            recommendedPrice = recommendedPrice * 1.03; // Weekend
          }
          break;
      }
    }

    // Apply min/max constraints
    if (rules.length > 0) {
      const firstRule = rules[0];
      if (firstRule.minPrice) {
        recommendedPrice = Math.max(recommendedPrice, firstRule.minPrice);
      }
      if (firstRule.maxPrice) {
        recommendedPrice = Math.min(recommendedPrice, firstRule.maxPrice);
      }
    }

    return Number(recommendedPrice.toFixed(2));
  } catch (error) {
    logger.error({
      message: 'Error calculating price for variant',
      storeId,
      variantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Process pricing batch job
 * Recalculates recommended prices for variants in a store
 */
const processPricingBatch = async (
  job: Job<PricingBatchJobData>
): Promise<PricingBatchResult> => {
  const startTime = Date.now();
  const { storeId, limit = 1000, offset = 0 } = job.data;

  const result: PricingBatchResult = {
    calculated: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    duration: 0,
  };

  try {
    logger.info({
      message: 'Starting pricing batch calculation',
      jobId: job.id,
      storeId,
      limit,
      offset,
    });

    // Get rules from cache (preloaded or fetched)
    const rules = await getRulesFromCache(storeId);

    // Fetch batch of variants for this store
    const variants = await prisma.inventories.findMany({
      where: { store_id: storeId },
      select: { variant_id: true },
      distinct: ['variant_id'],
      skip: offset,
      take: limit,
    });

    if (variants.length === 0) {
      logger.info({
        message: 'No variants found for pricing batch',
        storeId,
        offset,
      });
      result.duration = Date.now() - startTime;
      return result;
    }

    // Fetch demand metrics for variants
    const demandMap = new Map();
    const demandMetrics = await prisma.demand_metrics.findMany({
      where: {
        store_id: storeId,
        product_variant_id: { in: variants.map(v => v.variant_id).filter(id => id) as number[] },
      },
    });

    demandMetrics.forEach(dm => {
      if (dm.product_variant_id) {
        demandMap.set(dm.product_variant_id, dm);
      }
    });

    // Calculate prices for batch
    for (const variant of variants) {
      const variantId = variant.variant_id;
      if (!variantId) {
        result.skipped++;
        continue;
      }

      try {
        const recommendedPrice = await calculatePriceForVariant(
          storeId,
          variantId,
          rules,
          demandMap.get(variantId)
        );

        if (recommendedPrice === null) {
          result.skipped++;
          continue;
        }

        // Record price change in pricing_history if price differs
        const currentPrice = await prisma.variant_prices.findFirst({
          where: { variant_id: variantId, store_id: storeId },
          select: { price: true, id: true },
        });

        const oldPrice = currentPrice ? Number(currentPrice.price) : null;
        if (oldPrice && oldPrice !== recommendedPrice) {
          await prisma.pricing_history.create({
            data: {
              product_variant_id: variantId,
              store_id: storeId,
              old_price: Number(oldPrice),
              new_price: recommendedPrice,
              price_change_percent: Number((((recommendedPrice - oldPrice) / oldPrice) * 100).toFixed(2)),
              reason: 'Batch pricing recalculation',
              triggered_by: `job_${job.id}`,
              pricing_rule_id: rules[0]?.id || 'system',
            },
          });

          // Update variant_prices
          if (currentPrice?.id) {
            await prisma.variant_prices.update({
              where: { id: currentPrice.id },
              data: {
                price: recommendedPrice,
              },
            });
          }

          result.calculated++;
        } else {
          result.skipped++;
        }
      } catch (variantError) {
        result.failed++;
        result.errors.push({
          variantId,
          error: variantError instanceof Error ? variantError.message : String(variantError),
        });
      }
    }

    logger.info({
      message: 'Pricing batch calculation completed',
      jobId: job.id,
      storeId,
      calculated: result.calculated,
      failed: result.failed,
      skipped: result.skipped,
    });

    // Enqueue variant preload to refresh L1 cache after pricing updates
    try {
      await enqueueJob(
        JobType.PRELOAD_VARIANTS,
        { storeId, skipIfCached: false },
        { priority: 7, delay: 1000 } // Higher priority, 1s delay to let DB settle
      );
      logger.info({
        message: 'Variant preload job enqueued after pricing batch',
        storeId,
        jobId: job.id,
      });
    } catch (enqueuError: any) {
      logger.warn({
        message: 'Failed to enqueue variant preload',
        storeId,
        errorMessage: enqueuError.message,
      });
    }
  } catch (error) {
    logger.error({
      message: 'Pricing batch job failed',
      jobId: job.id,
      storeId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    result.duration = Date.now() - startTime;
  }

  return result;
};

// Register the processor
registerProcessor<PricingBatchJobData>(
  JobType.CALCULATE_PRICING,
  processPricingBatch,
  parseInt(process.env.PRICING_JOB_CONCURRENCY || '5', 10) // 5 concurrent workers default
);
