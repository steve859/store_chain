import { Router } from 'express';
import { CategoriesController } from './categories.controller';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';

const router = Router();

const categoryReadRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'INVENTORY_STAFF', 'CASHIER', 'admin', 'district_manager', 'manager', 'store_manager', 'inventory_staff', 'cashier'];

router.get('/', authenticateToken, authorizeRoles(categoryReadRoles), CategoriesController.getAllCategories);
router.get('/:id', authenticateToken, authorizeRoles(categoryReadRoles), CategoriesController.getCategoryById);
router.post('/', authenticateToken, authorizeRoles(['ADMIN', 'STORE_MANAGER']), CategoriesController.createCategory);
router.put('/:id', authenticateToken, authorizeRoles(['ADMIN', 'STORE_MANAGER']), CategoriesController.updateCategory);
router.delete('/:id', authenticateToken, authorizeRoles(['ADMIN']), CategoriesController.deleteCategory);

export default router;
