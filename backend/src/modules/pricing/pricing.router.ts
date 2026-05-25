import express from 'express';
import {
  createPricingRuleHandler,
  getRecommendedPriceHandler,
  getPricingHistoryHandler,
  getCompetitivePricingReportHandler,
  updateDemandMetricsHandler,
  recordCompetitorPriceHandler,
  calculatePricingBatchHandler,
} from './pricing.controller';
import { requireActiveStore } from '../../middlewares/storeScope.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';
import { pricingCacheMiddleware } from '../../middlewares/pricingCache.middleware';

const router = express.Router();

// All pricing routes require authentication and active store
router.use(requireActiveStore);

// Admin-only: manage pricing rules
router.post('/rules', authorizeRoles(['admin', 'manager']), createPricingRuleHandler);

// Any authenticated user: get price recommendations and reports
router.get('/recommend', pricingCacheMiddleware, getRecommendedPriceHandler);
router.get('/history/:productVariantId', getPricingHistoryHandler);
router.get('/competitors', getCompetitivePricingReportHandler);

// Admin-only: update metrics and competitor data
router.post('/demand-metrics', authorizeRoles(['admin', 'manager']), updateDemandMetricsHandler);
router.post('/competitor-prices', authorizeRoles(['admin', 'manager']), recordCompetitorPriceHandler);

// Admin-only: manual batch pricing calculation (ASR-S3)
router.post('/calculate-batch', authorizeRoles(['admin']), calculatePricingBatchHandler);

export default router;

