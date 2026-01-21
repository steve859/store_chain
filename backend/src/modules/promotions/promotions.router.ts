import { Router } from 'express';
import { PromotionService } from './promotions.service';

const router = Router();

// GET /api/promotions
router.get('/', async (req, res) => {
  try {
    const promos = await PromotionService.getAllPromotions();
    res.json(promos);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/promotions/:id
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const promo = await PromotionService.getPromotionById(id);
    res.json(promo);
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
});

// POST /api/promotions
router.post('/', async (req, res) => {
  try {
    // Dữ liệu mẫu body:
    // { "code": "TEST10", "name": "Test", "type": "PERCENTAGE", "value": 10, 
    //   "startDate": "2023-10-01", "endDate": "2023-10-30" }
    const newPromo = await PromotionService.createPromotion(req.body);
    res.status(201).json(newPromo);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// PUT /api/promotions/:id
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updatedPromo = await PromotionService.updatePromotion(id, req.body);
    res.json(updatedPromo);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// DELETE /api/promotions/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await PromotionService.deletePromotion(id);
    res.json({ message: 'Promotion deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// POST /api/promotions/validate (API phụ trợ để check mã)
router.post('/validate', async (req, res) => {
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