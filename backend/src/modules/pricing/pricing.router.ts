import express from 'express';
import {
  createPricingRuleHandler,
  getRecommendedPriceHandler,
  getPricingHistoryHandler,
  getCompetitivePricingReportHandler,
  updateDemandMetricsHandler,
  recordCompetitorPriceHandler,
} from './pricing.controller';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { requireActiveStore } from '../../middlewares/storeScope.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';

const router = express.Router();

const pricingManagementRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'admin', 'district_manager', 'manager', 'store_manager'];

// All pricing routes require authentication and active store
router.use(authenticateToken);
router.use(requireActiveStore);

// Management-only: manage pricing rules
router.post('/rules', authorizeRoles(pricingManagementRoles), createPricingRuleHandler);

// Management-only: get price recommendations and reports
router.get('/recommend', authorizeRoles(pricingManagementRoles), getRecommendedPriceHandler);
router.get('/history/:productVariantId', authorizeRoles(pricingManagementRoles), getPricingHistoryHandler);
router.get('/competitors', authorizeRoles(pricingManagementRoles), getCompetitivePricingReportHandler);

// Management-only: update metrics and competitor data
router.post('/demand-metrics', authorizeRoles(pricingManagementRoles), updateDemandMetricsHandler);
router.post('/competitor-prices', authorizeRoles(pricingManagementRoles), recordCompetitorPriceHandler);

export default router;

