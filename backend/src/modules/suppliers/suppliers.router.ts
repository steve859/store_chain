import { Router } from 'express';
import { SuppliersController } from './suppliers.controller';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';

const router = Router();

router.use(authenticateToken);

const supplierReadRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'INVENTORY_STAFF', 'admin', 'district_manager', 'manager', 'store_manager', 'inventory_staff'];

router.get('/', authorizeRoles(supplierReadRoles), SuppliersController.getAllSuppliers);
router.get('/:id', authorizeRoles(supplierReadRoles), SuppliersController.getSupplierById);
router.post('/', authorizeRoles(['ADMIN', 'STORE_MANAGER']), SuppliersController.createSupplier);
router.put('/:id', authorizeRoles(['ADMIN', 'STORE_MANAGER']), SuppliersController.updateSupplier);
router.delete('/:id', authorizeRoles(['ADMIN']), SuppliersController.deleteSupplier);

export default router;
