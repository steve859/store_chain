import { Request, Response } from 'express';
import { pricingService } from './pricing.service';
import { AuditLogsService } from '../audit_logs/audit_logs.service';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const getActorUserId = (req: Request): number | undefined => {
  const userId = Number(asRecord(req.user).userId);
  return Number.isFinite(userId) ? userId : undefined;
};

const getAuditSource = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const writeAuditLog = async (params: Parameters<typeof AuditLogsService.createLog>[0]) => {
  try {
    await AuditLogsService.createLog(params);
  } catch {
    // Audit logging is best-effort for this phase.
  }
};

const deriveDemandMetricsId = (storeId: number, input: Record<string, unknown>) => {
  const productVariantId = input.productVariantId || 0;
  const categoryId = input.categoryId || 0;
  const dayOfWeek = input.dayOfWeek || 0;
  const hourOfDay = input.hourOfDay || new Date().getHours();
  return `${storeId}-${productVariantId}-${categoryId}-${dayOfWeek}-${hourOfDay}`;
};

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

    await writeAuditLog({
      action: 'PRICING_RULE_CREATED',
      objectType: 'pricing_rule',
      objectId: rule?.id !== undefined && rule?.id !== null ? String(rule.id) : undefined,
      userId: getActorUserId(req),
      payload: {
        result: 'success',
        source: getAuditSource(req),
        storeId,
        after: rule,
        metadata: {
          ruleName,
          ruleType,
          productVariantId: req.body?.productVariantId,
          categoryId: req.body?.categoryId,
          priority: priority || 0,
          effectiveFrom,
          effectiveUntil: effectiveUntil ?? null,
          minPrice: minPrice ?? null,
          maxPrice: maxPrice ?? null,
        },
      },
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

    await writeAuditLog({
      action: 'DEMAND_METRICS_UPDATED',
      objectType: 'demand_metrics',
      objectId: deriveDemandMetricsId(storeId, { productVariantId, categoryId, dayOfWeek, hourOfDay: rest.hourOfDay }),
      userId: getActorUserId(req),
      payload: {
        result: 'success',
        source: getAuditSource(req),
        storeId,
        after: metrics,
        metadata: {
          productVariantId,
          categoryId,
          dayOfWeek,
          hourOfDay: rest.hourOfDay,
          demandLevel,
          inventoryLevel,
        },
      },
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

    await writeAuditLog({
      action: 'COMPETITOR_PRICE_RECORDED',
      objectType: 'competitor_price',
      objectId: undefined,
      userId: getActorUserId(req),
      payload: {
        result: 'success',
        source: getAuditSource(req),
        storeId,
        metadata: {
          productSku,
          competitorName,
          competitorPrice,
          ourPrice,
          isCompetitive: result.isCompetitive,
          priceDiffPercent: result.priceDiffPercent,
        },
      },
    });

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

