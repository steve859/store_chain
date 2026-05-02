import { Router } from 'express';
import { loyaltyController } from './loyalty.controller';

const router = Router();

/**
 * Loyalty Program Routes
 */

// Enroll customer
router.post('/enroll', loyaltyController.enrollHandler);

// Get balance
router.get('/balance/:loyaltyId', loyaltyController.getBalanceHandler);

// Get transaction history
router.get('/transactions/:loyaltyId', loyaltyController.getTransactionsHandler);

// Get personalized offers
router.get('/offers/:loyaltyId', loyaltyController.getOffersHandler);

// Process points for order
router.post('/process-points', loyaltyController.processPointsHandler);

// Redeem reward
router.post('/redeem', loyaltyController.redeemRewardHandler);

export default router;
