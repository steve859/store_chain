import { Router } from 'express';
import { SuppliersController } from './suppliers.controller';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/', SuppliersController.getAllSuppliers);
router.get('/:id', SuppliersController.getSupplierById);
router.post('/', authorizeRoles(['ADMIN', 'STORE_MANAGER']), SuppliersController.createSupplier);
router.put('/:id', authorizeRoles(['ADMIN', 'STORE_MANAGER']), SuppliersController.updateSupplier);
router.delete('/:id', authorizeRoles(['ADMIN']), SuppliersController.deleteSupplier);

export default router;
