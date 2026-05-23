import { Router } from 'express';
import { PromotionService } from './promotions.service';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';

const router = Router();

const readPromotionRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'CASHIER'];
const writePromotionRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER'];
const validatePromotionRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'CASHIER'];

router.use(authenticateToken);

// GET /api/promotions
router.get('/', authorizeRoles(readPromotionRoles), async (req, res) => {
  try {
    const promos = await PromotionService.getAllPromotions();
    res.json(promos);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/promotions/:id
router.get('/:id', authorizeRoles(readPromotionRoles), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const promo = await PromotionService.getPromotionById(id);
    res.json(promo);
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
});

// POST /api/promotions
router.post('/', authorizeRoles(writePromotionRoles), async (req, res) => {
  try {
    const newPromo = await PromotionService.createPromotion(req.body);
    res.status(201).json(newPromo);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// PUT /api/promotions/:id
router.put('/:id', authorizeRoles(writePromotionRoles), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updatedPromo = await PromotionService.updatePromotion(id, req.body);
    res.json(updatedPromo);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// DELETE /api/promotions/:id
router.delete('/:id', authorizeRoles(writePromotionRoles), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await PromotionService.deletePromotion(id);
    res.json({ message: 'Promotion deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// POST /api/promotions/validate
router.post('/validate', authorizeRoles(validatePromotionRoles), async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    if (!code || orderTotal === undefined) {
      return res.status(400).json({ error: 'Code and orderTotal are required' });
    }
    const promo = await PromotionService.validateCode(code, orderTotal);
    res.json({ valid: true, promotion: promo });
  } catch (error) {
    res.status(400).json({ valid: false, error: (error as Error).message });
  }
});

export default router;
