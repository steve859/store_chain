import { Router, Request, Response, NextFunction } from 'express';
import * as categoryService from './categories.service';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';

// Define AuthRequest interface
interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
    storeId?: string | null;
  };
}

const router = Router();

// Public hoặc Authenticated user đều xem được danh mục (để load dropdown)
router.get('/', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await categoryService.getAllCategories();
    res.json(categories);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = await categoryService.getCategoryById(req.params.id);
    res.json(category);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Category not found') {
        return res.status(404).json({ message: error.message });
    }
    next(error);
  }
});

// Chỉ Admin/Manager mới được Tạo/Sửa/Xóa danh mục
router.post('/', authenticateToken, authorizeRoles(['ADMIN', 'STORE_MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) return res.status(401).json({ message: 'User context missing' });

    const result = await categoryService.createCategory(req.body, authReq.user.userId);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticateToken, authorizeRoles(['ADMIN', 'STORE_MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) return res.status(401).json({ message: 'User context missing' });

    const result = await categoryService.updateCategory(req.params.id, req.body, authReq.user.userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticateToken, authorizeRoles(['ADMIN']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) return res.status(401).json({ message: 'User context missing' });

    await categoryService.deleteCategory(req.params.id, authReq.user.userId);
    res.json({ message: 'Category deleted successfully' });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Cannot delete category')) {
        return res.status(400).json({ message: error.message });
    }
    next(error);
  }
});

export default router;