import { Router, Request, Response } from 'express';
import { SuppliersService } from './suppliers.service';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';

const router = Router();

// --- ÁP DỤNG MIDDLEWARE CHUNG ---
router.use(authenticateToken);

// --- ĐỊNH NGHĨA ROUTE KÈM LOGIC XỬ LÝ (CONTROLLER) ---

/**
 * GET /api/suppliers
 * Lấy danh sách, có phân trang và tìm kiếm
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;

    const result = await SuppliersService.getAllSuppliers({ page, limit, search });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/suppliers/:id
 * Lấy chi tiết một nhà cung cấp
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const supplier = await SuppliersService.getSupplierById(req.params.id);
    res.json(supplier);
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/suppliers
 * Tạo mới nhà cung cấp (Chỉ Admin/Manager)
 */
router.post('/', authorizeRoles(['ADMIN', 'STORE_MANAGER']), async (req: Request, res: Response) => {
  try {
    if (!req.body.name || !req.body.phone) {
      return res.status(400).json({ error: 'Name and Phone are required' });
    }
    const newSupplier = await SuppliersService.createSupplier(req.body);
    res.status(201).json(newSupplier);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

/**
 * PUT /api/suppliers/:id
 * Cập nhật nhà cung cấp (Chỉ Admin/Manager)
 */
router.put('/:id', authorizeRoles(['ADMIN', 'STORE_MANAGER']), async (req: Request, res: Response) => {
  try {
    const updatedSupplier = await SuppliersService.updateSupplier(req.params.id, req.body);
    res.json(updatedSupplier);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

/**
 * DELETE /api/suppliers/:id
 * Xóa mềm nhà cung cấp (Chỉ Admin)
 */
router.delete('/:id', authorizeRoles(['ADMIN']), async (req: Request, res: Response) => {
  try {
    await SuppliersService.deleteSupplier(req.params.id);
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;