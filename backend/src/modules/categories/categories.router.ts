import { Router } from 'express';
import { CategoriesController } from './categories.controller';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';

const router = Router();

router.get('/', authenticateToken, CategoriesController.getAllCategories);
router.get('/:id', authenticateToken, CategoriesController.getCategoryById);
router.post('/', authenticateToken, authorizeRoles(['ADMIN', 'STORE_MANAGER']), CategoriesController.createCategory);
router.put('/:id', authenticateToken, authorizeRoles(['ADMIN', 'STORE_MANAGER']), CategoriesController.updateCategory);
router.delete('/:id', authenticateToken, authorizeRoles(['ADMIN']), CategoriesController.deleteCategory);

export default router;
