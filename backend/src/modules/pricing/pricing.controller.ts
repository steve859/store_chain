import { Request, Response } from 'express';
import { pricingService } from './pricing.service';

/**
 * Create a new pricing rule
 * POST /api/v1/pricing/rules
 */
export const createPricingRuleHandler = async (req: Request, res: Response) => {
  try {
    const storeId = req.activeStoreId || 1;
    const { ruleName, ruleType, basePrice, minPrice, maxPrice, priority, effectiveFrom, effectiveUntil, ...rest } = req.body;

    if (!ruleName || !ruleType || basePrice === undefined || !effectiveFrom) {
      return res.status(400).json({
        error: 'Missing required fields: ruleName, ruleType, basePrice, effectiveFrom',
      });
    }

    const validRuleTypes = ['fixed', 'percentage', 'demand_based', 'competitor_based', 'time_based'];
    if (!validRuleTypes.includes(ruleType)) {
      return res.status(400).json({ error: `Invalid ruleType. Must be one of: ${validRuleTypes.join(', ')}` });
    }

    const rule = await pricingService.createPricingRule({
      storeId,
      ruleName,
      ruleType,
      basePrice,
      minPrice,
      maxPrice,
      priority: priority || 0,
      effectiveFrom: new Date(effectiveFrom),
      effectiveUntil: effectiveUntil ? new Date(effectiveUntil) : undefined,
      ...rest,
    });

    res.status(201).json({
      message: 'Pricing rule created successfully',
      rule,
    });
  } catch (error: any) {
    console.error('Error creating pricing rule:', error);
    res.status(500).json({
      error: 'Failed to create pricing rule',
      details: error.message,
    });
  }
};

/**
 * Get recommended price for a product
 * GET /api/v1/pricing/recommend
 */
export const getRecommendedPriceHandler = async (req: Request, res: Response) => {
  try {
    const storeId = req.activeStoreId || 1;
    const { currentPrice, productVariantId, categoryId, demandLevel } = req.query;

    if (!currentPrice) {
      return res.status(400).json({ error: 'Missing required parameter: currentPrice' });
    }

    const price = await pricingService.calculateRecommendedPrice(
      storeId,
      parseFloat(currentPrice as string),
      productVariantId ? parseInt(productVariantId as string) : undefined,
      categoryId ? parseInt(categoryId as string) : undefined,
      demandLevel ? parseFloat(demandLevel as string) : undefined
    );

    res.json({
      message: 'Price recommendation calculated',
      price,
    });
  } catch (error: any) {
    console.error('Error calculating recommended price:', error);
    res.status(500).json({
      error: 'Failed to calculate recommended price',
      details: error.message,
    });
  }
};

/**
 * Get pricing history for a product
 * GET /api/v1/pricing/history/:productVariantId
 */
export const getPricingHistoryHandler = async (req: Request, res: Response) => {
  try {
    const storeId = req.activeStoreId || 1;
    const { productVariantId } = req.params;
    const { days } = req.query;

    if (!productVariantId) {
      return res.status(400).json({ error: 'Missing required parameter: productVariantId' });
    }

    const history = await pricingService.getPricingHistory(
      storeId,
      parseInt(productVariantId),
      days ? parseInt(days as string) : 30
    );

    res.json({
      message: 'Pricing history retrieved',
      count: history.length,
      history,
    });
  } catch (error: any) {
    console.error('Error retrieving pricing history:', error);
    res.status(500).json({
      error: 'Failed to retrieve pricing history',
      details: error.message,
    });
  }
};

/**
 * Get competitive pricing report
 * GET /api/v1/pricing/competitors
 */
export const getCompetitivePricingReportHandler = async (req: Request, res: Response) => {
  try {
    const storeId = req.activeStoreId || 1;

    const report = await pricingService.getCompetitivePricingReport(storeId);

    res.json({
      message: 'Competitive pricing report retrieved',
      report,
    });
  } catch (error: any) {
    console.error('Error retrieving competitive pricing report:', error);
    res.status(500).json({
      error: 'Failed to retrieve competitive pricing report',
      details: error.message,
    });
  }
};

/**
 * Update demand metrics
 * POST /api/v1/pricing/demand-metrics
 */
export const updateDemandMetricsHandler = async (req: Request, res: Response) => {
  try {
    const storeId = req.activeStoreId || 1;
    const { productVariantId, categoryId, dayOfWeek, demandLevel, inventoryLevel, ...rest } = req.body;

    if (dayOfWeek === undefined || demandLevel === undefined || inventoryLevel === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: dayOfWeek, demandLevel, inventoryLevel',
      });
    }

    const metrics = await pricingService.updateDemandMetrics({
      storeId,
      productVariantId,
      categoryId,
      dayOfWeek,
      demandLevel,
      inventoryLevel,
      ...rest,
    });

    res.json({
      message: 'Demand metrics updated',
      metrics,
    });
  } catch (error: any) {
    console.error('Error updating demand metrics:', error);
    res.status(500).json({
      error: 'Failed to update demand metrics',
      details: error.message,
    });
  }
};

/**
 * Record competitor price
 * POST /api/v1/pricing/competitor-prices
 */
export const recordCompetitorPriceHandler = async (req: Request, res: Response) => {
  try {
    const storeId = req.activeStoreId || 1;
    const { productSku, competitorName, competitorPrice, ourPrice } = req.body;

    if (!productSku || !competitorName || !competitorPrice || !ourPrice) {
      return res.status(400).json({
        error: 'Missing required fields: productSku, competitorName, competitorPrice, ourPrice',
      });
    }

    const result = await pricingService.recordCompetitorPrice(
      storeId,
      productSku,
      competitorName,
      parseFloat(competitorPrice),
      parseFloat(ourPrice)
    );

    res.status(201).json({
      message: 'Competitor price recorded',
      isCompetitive: result.isCompetitive,
      priceDiffPercent: result.priceDiffPercent,
    });
  } catch (error: any) {
    console.error('Error recording competitor price:', error);
    res.status(500).json({
      error: 'Failed to record competitor price',
      details: error.message,
    });
  }
};


/**
 * Calculate batch pricing for a store (ASR-S3)
 * POST /api/v1/pricing/calculate-batch
 * Admin-only endpoint to manually trigger batch pricing recalculation
 */
export const calculatePricingBatchHandler = async (req: Request, res: Response) => {
  try {
    const { enqueueJob, JobType } = await import('../../lib/queues/jobQueue');
    const storeId = req.activeStoreId || Number(req.headers['x-store-id'] || 1);
    const { limit = 1000, offset = 0, forceRecalculate = false } = req.body;

    if (!storeId) {
      return res.status(400).json({
        error: 'Store ID is required',
      });
    }

    // Enqueue batch pricing job
    const job = await enqueueJob(
      JobType.CALCULATE_PRICING,
      {
        storeId,
        limit,
        offset,
        forceRecalculate,
      },
      {
        priority: parseInt(process.env.PRICING_JOB_PRIORITY || '5', 10),
        removeOnComplete: true,
      }
    );

    res.status(202).json({
      message: 'Batch pricing calculation enqueued',
      jobId: job.id,
      storeId,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error('Error enqueueing batch pricing job:', error);
    res.status(500).json({
      error: 'Failed to enqueue batch pricing job',
      details: error.message,
    });
  }
};
