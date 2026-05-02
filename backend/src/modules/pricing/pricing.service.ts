import prisma from '../../db/prisma';
import { logger } from '../../lib/monitoring/logger';

/**
 * Dynamic Pricing Engine Service
 * Handles pricing rules, demand-based pricing, competitor analysis
 */

interface PricingRule {
  id?: string;
  storeId: number;
  productVariantId?: number;
  categoryId?: number;
  ruleName: string;
  ruleType: 'fixed' | 'percentage' | 'demand_based' | 'competitor_based' | 'time_based';
  basePrice: number;
  minPrice?: number;
  maxPrice?: number;
  adjustmentValue?: number;
  adjustmentType?: 'percentage' | 'fixed_amount';
  conditionType?: string;
  conditionValue?: string;
  priority?: number;
  isActive?: boolean;
  effectiveFrom: Date;
  effectiveUntil?: Date;
}

interface DemandMetrics {
  storeId: number;
  productVariantId?: number;
  categoryId?: number;
  dayOfWeek: number;
  hourOfDay?: number;
  demandLevel: number;
  salesCount24h?: number;
  salesCount7d?: number;
  inventoryLevel: number;
  inventoryTurnover?: number;
  priceElasticity?: number;
}

interface PriceResult {
  currentPrice: number;
  recommendedPrice: number;
  priceChangePercent: number;
  appliedRules: string[];
  reason: string;
}

/**
 * Create a new pricing rule
 */
export async function createPricingRule(rule: PricingRule) {
  try {
    const created = await prisma.pricing_rules.create({
      data: {
        store_id: rule.storeId,
        product_variant_id: rule.productVariantId,
        category_id: rule.categoryId,
        rule_name: rule.ruleName,
        rule_type: rule.ruleType,
        base_price: rule.basePrice,
        min_price: rule.minPrice,
        max_price: rule.maxPrice,
        adjustment_value: rule.adjustmentValue,
        adjustment_type: rule.adjustmentType,
        condition_type: rule.conditionType,
        condition_value: rule.conditionValue,
        priority: rule.priority || 0,
        is_active: rule.isActive !== false,
        effective_from: rule.effectiveFrom,
        effective_until: rule.effectiveUntil,
      },
    });

    logger.info({
      type: 'pricing_rule_created',
      ruleId: created.id,
      storeId: rule.storeId,
      ruleType: rule.ruleType,
    });

    return {
      id: created.id,
      storeId: created.store_id,
      ruleName: created.rule_name,
      ruleType: created.rule_type,
      basePrice: Number(created.base_price),
      isActive: created.is_active,
    };
  } catch (error: any) {
    logger.error({
      type: 'pricing_rule_create_error',
      errorMessage: error.message,
    });
    throw error;
  }
}

/**
 * Get applicable pricing rules for a product
 */
export async function getApplicableRules(
  storeId: number,
  productVariantId?: number,
  categoryId?: number
) {
  const now = new Date();

  const rules = await prisma.pricing_rules.findMany({
    where: {
      store_id: storeId,
      is_active: true,
      effective_from: { lte: now },
      AND: [
        {
          OR: [{ effective_until: null }, { effective_until: { gte: now } }],
        },
        {
          OR: [
            { product_variant_id: productVariantId },
            { category_id: categoryId },
            { product_variant_id: null, category_id: null },
          ],
        },
      ],
    },
    orderBy: { priority: 'desc' },
  });

  return rules.map(r => ({
    id: r.id,
    ruleName: r.rule_name,
    ruleType: r.rule_type,
    basePrice: Number(r.base_price),
    adjustmentValue: r.adjustment_value ? Number(r.adjustment_value) : undefined,
    adjustmentType: r.adjustment_type,
    conditionType: r.condition_type,
    conditionValue: r.condition_value ? JSON.parse(r.condition_value) : undefined,
    priority: r.priority,
  }));
}

/**
 * Calculate recommended price based on rules and demand
 */
export async function calculateRecommendedPrice(
  storeId: number,
  currentPrice: number,
  productVariantId?: number,
  categoryId?: number,
  demandLevel?: number
): Promise<PriceResult> {
  let recommendedPrice = currentPrice;
  const appliedRules: string[] = [];
  let reason = 'No pricing rules applied';

  try {
    // Get applicable rules
    const rules = await getApplicableRules(storeId, productVariantId, categoryId);

    if (rules.length === 0) {
      return { currentPrice, recommendedPrice, priceChangePercent: 0, appliedRules, reason };
    }

    // Apply rules by priority
    for (const rule of rules) {
      switch (rule.ruleType) {
        case 'fixed':
          recommendedPrice = rule.basePrice || recommendedPrice;
          appliedRules.push(rule.ruleName);
          break;

        case 'percentage':
          if (rule.adjustmentValue && rule.adjustmentType === 'percentage') {
            recommendedPrice = recommendedPrice * (1 + rule.adjustmentValue / 100);
            appliedRules.push(rule.ruleName);
          }
          break;

        case 'demand_based':
          if (demandLevel !== undefined) {
            // High demand (>80%): increase price up to 15%
            // Medium demand (40-80%): keep base price
            // Low demand (<40%): reduce price up to 20%
            if (demandLevel > 80) {
              recommendedPrice = recommendedPrice * 1.15;
              reason = 'High demand pricing';
            } else if (demandLevel < 40) {
              recommendedPrice = recommendedPrice * 0.8;
              reason = 'Low demand discount';
            }
            appliedRules.push(rule.ruleName);
          }
          break;

        case 'competitor_based':
          // Will be enhanced with competitor price data
          appliedRules.push(rule.ruleName);
          break;

        case 'time_based':
          // Apply time-based adjustments (peak hours, days, seasons)
          const hour = new Date().getHours();
          const dayOfWeek = new Date().getDay();

          if ((hour >= 11 && hour <= 14) || (hour >= 17 && hour <= 20)) {
            // Peak hours: slight increase
            recommendedPrice = recommendedPrice * 1.05;
            reason = 'Peak hours pricing';
          } else if (dayOfWeek === 0 || dayOfWeek === 6) {
            // Weekend: slight increase
            recommendedPrice = recommendedPrice * 1.03;
            reason = 'Weekend pricing';
          }
          appliedRules.push(rule.ruleName);
          break;
      }
    }

    // Apply min/max constraints from the first rule
    const firstRule = rules[0];
    if (firstRule) {
      const rule = await prisma.pricing_rules.findUnique({
        where: { id: firstRule.id },
      });

      if (rule?.min_price) {
        recommendedPrice = Math.max(recommendedPrice, Number(rule.min_price));
      }
      if (rule?.max_price) {
        recommendedPrice = Math.min(recommendedPrice, Number(rule.max_price));
      }
    }

    const priceChangePercent = Number(
      (((recommendedPrice - currentPrice) / currentPrice) * 100).toFixed(2)
    );

    return {
      currentPrice,
      recommendedPrice: Number(recommendedPrice.toFixed(2)),
      priceChangePercent,
      appliedRules,
      reason,
    };
  } catch (error: any) {
    logger.error({
      type: 'price_calculation_error',
      storeId,
      productVariantId,
      errorMessage: error.message,
    });
    throw error;
  }
}

/**
 * Record pricing history when price changes
 */
export async function recordPriceChange(
  ruleId: string,
  productVariantId: number,
  storeId: number,
  oldPrice: number,
  newPrice: number,
  reason: string,
  triggeredBy?: string
) {
  try {
    const priceChangePercent = (((newPrice - oldPrice) / oldPrice) * 100).toFixed(2);

    await prisma.pricing_history.create({
      data: {
        pricing_rule_id: ruleId,
        product_variant_id: productVariantId,
        store_id: storeId,
        old_price: oldPrice,
        new_price: newPrice,
        price_change_percent: Number(priceChangePercent),
        reason,
        triggered_by: triggeredBy,
      },
    });

    logger.info({
      type: 'price_change_recorded',
      productVariantId,
      oldPrice,
      newPrice,
      changePercent: priceChangePercent,
    });
  } catch (error: any) {
    logger.error({
      type: 'price_change_error',
      errorMessage: error.message,
    });
    throw error;
  }
}

/**
 * Update demand metrics (called periodically)
 */
export async function updateDemandMetrics(metrics: DemandMetrics) {
  try {
    const dayOfWeek = metrics.dayOfWeek;
    const hourOfDay = metrics.hourOfDay || new Date().getHours();

    const updated = await prisma.demand_metrics.upsert({
      where: {
        id: `${metrics.storeId}-${metrics.productVariantId || 0}-${metrics.categoryId || 0}-${dayOfWeek}-${hourOfDay}`,
      },
      update: {
        demand_level: metrics.demandLevel,
        sales_count_24h: metrics.salesCount24h || 0,
        sales_count_7d: metrics.salesCount7d || 0,
        inventory_level: metrics.inventoryLevel,
        inventory_turnover: metrics.inventoryTurnover,
        price_elasticity: metrics.priceElasticity,
        last_calculated_at: new Date(),
      },
      create: {
        store_id: metrics.storeId,
        product_variant_id: metrics.productVariantId,
        category_id: metrics.categoryId,
        day_of_week: dayOfWeek,
        hour_of_day: hourOfDay,
        demand_level: metrics.demandLevel,
        sales_count_24h: metrics.salesCount24h || 0,
        sales_count_7d: metrics.salesCount7d || 0,
        inventory_level: metrics.inventoryLevel,
        inventory_turnover: metrics.inventoryTurnover,
        price_elasticity: metrics.priceElasticity,
      },
    });

    logger.info({
      type: 'demand_metrics_updated',
      storeId: metrics.storeId,
      demandLevel: metrics.demandLevel,
    });

    return {
      demandLevel: updated.demand_level,
      inventoryLevel: Number(updated.inventory_level),
      lastCalculated: updated.last_calculated_at,
    };
  } catch (error: any) {
    logger.error({
      type: 'demand_metrics_error',
      errorMessage: error.message,
    });
    throw error;
  }
}

/**
 * Get pricing history for a product
 */
export async function getPricingHistory(
  storeId: number,
  productVariantId: number,
  days = 30
) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const history = await prisma.pricing_history.findMany({
    where: {
      store_id: storeId,
      product_variant_id: productVariantId,
      created_at: { gte: since },
    },
    orderBy: { created_at: 'desc' },
  });

  return history.map(h => ({
    id: h.id,
    oldPrice: Number(h.old_price),
    newPrice: Number(h.new_price),
    changePercent: h.price_change_percent ? Number(h.price_change_percent) : 0,
    reason: h.reason,
    createdAt: h.created_at,
  }));
}

/**
 * Record competitor prices
 */
export async function recordCompetitorPrice(
  storeId: number,
  productSku: string,
  competitorName: string,
  competitorPrice: number,
  ourPrice: number
) {
  try {
    const priceDifference = ourPrice - competitorPrice;
    const priceDiffPercent = ((priceDifference / competitorPrice) * 100).toFixed(2);
    const isCompetitive = priceDifference <= 0;

    await prisma.competitor_prices.create({
      data: {
        store_id: storeId,
        product_sku: productSku,
        competitor_name: competitorName,
        competitor_price: competitorPrice,
        our_price: ourPrice,
        price_difference: priceDifference,
        price_diff_percent: Number(priceDiffPercent),
        is_competitive: isCompetitive,
        scraped_at: new Date(),
      },
    });

    logger.info({
      type: 'competitor_price_recorded',
      productSku,
      competitorName,
      priceDiff: priceDifference,
    });

    return { isCompetitive, priceDiffPercent };
  } catch (error: any) {
    logger.error({
      type: 'competitor_price_error',
      errorMessage: error.message,
    });
    throw error;
  }
}

/**
 * Get competitive pricing report
 */
export async function getCompetitivePricingReport(storeId: number) {
  const latestPrices = await prisma.competitor_prices.findMany({
    where: { store_id: storeId },
    orderBy: { scraped_at: 'desc' },
    take: 100,
  });

  const competitive = latestPrices.filter(p => p.is_competitive).length;
  const total = latestPrices.length;
  const competitivePercentage = total > 0 ? ((competitive / total) * 100).toFixed(2) : '0';

  return {
    totalProducts: total,
    competitiveProducts: competitive,
    competitivePercentage: Number(competitivePercentage),
    avgPriceDifference: latestPrices.length > 0
      ? (latestPrices.reduce((sum, p) => sum + Number(p.price_diff_percent || 0), 0) / latestPrices.length).toFixed(2)
      : 0,
    report: latestPrices.map(p => ({
      productSku: p.product_sku,
      competitor: p.competitor_name,
      theirPrice: Number(p.competitor_price),
      ourPrice: Number(p.our_price),
      difference: Number(p.price_difference),
      diffPercent: p.price_diff_percent ? Number(p.price_diff_percent) : 0,
      isCompetitive: p.is_competitive,
    })),
  };
}

export const pricingService = {
  createPricingRule,
  getApplicableRules,
  calculateRecommendedPrice,
  recordPriceChange,
  updateDemandMetrics,
  getPricingHistory,
  recordCompetitorPrice,
  getCompetitivePricingReport,
};
