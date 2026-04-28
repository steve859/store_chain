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

// Get personalized offers
router.get('/offers/:loyaltyId', loyaltyController.getOffersHandler);

// Redeem reward
router.post('/redeem', loyaltyController.redeemRewardHandler);

export default router;
