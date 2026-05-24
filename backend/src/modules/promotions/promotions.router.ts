import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';
import { PromotionsController } from './promotions.controller';

const router = Router();

const readPromotionRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'CASHIER'];
const writePromotionRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER'];
const validatePromotionRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'CASHIER'];

router.use(authenticateToken);

// GET /api/promotions
router.get('/', authorizeRoles(readPromotionRoles), PromotionsController.getAllPromotions);

// GET /api/promotions/:id
router.get('/:id', authorizeRoles(readPromotionRoles), PromotionsController.getPromotionById);

// POST /api/promotions
router.post('/', authorizeRoles(writePromotionRoles), PromotionsController.createPromotion);

// PUT /api/promotions/:id
router.put('/:id', authorizeRoles(writePromotionRoles), PromotionsController.updatePromotion);

// DELETE /api/promotions/:id
router.delete('/:id', authorizeRoles(writePromotionRoles), PromotionsController.deletePromotion);

// POST /api/promotions/validate
router.post('/validate', authorizeRoles(validatePromotionRoles), PromotionsController.validatePromotion);

export default router;
