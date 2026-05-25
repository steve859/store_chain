import { NextFunction, Request, Response, Router } from 'express';
import { loyaltyController } from './loyalty.controller';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';

const router = Router();
const staffLoyaltyRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'CASHIER'];

const mapActiveStoreToLegacyStoreId = (req: Request, _res: Response, next: NextFunction) => {
  if (req.activeStoreId) {
    (req as any).storeId = req.activeStoreId;
  }
  next();
};

router.use(authenticateToken);

/**
 * Loyalty Program Routes
 */

// Enroll customer
router.post('/enroll', authorizeRoles(staffLoyaltyRoles), mapActiveStoreToLegacyStoreId, loyaltyController.enrollHandler);

// Get balance
router.get('/balance/:loyaltyId', authorizeRoles(staffLoyaltyRoles), loyaltyController.getBalanceHandler);

// Get transaction history
router.get('/transactions/:loyaltyId', authorizeRoles(staffLoyaltyRoles), loyaltyController.getTransactionsHandler);

// Get personalized offers
router.get('/offers/:loyaltyId', authorizeRoles(staffLoyaltyRoles), loyaltyController.getOffersHandler);

// Process points for order
router.post('/process-points', authorizeRoles(staffLoyaltyRoles), loyaltyController.processPointsHandler);

// Redeem reward
router.post('/redeem', authorizeRoles(staffLoyaltyRoles), loyaltyController.redeemRewardHandler);

export default router;
