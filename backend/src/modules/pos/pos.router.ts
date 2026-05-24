import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';
import { requireActiveStore } from '../../middlewares/storeScope.middleware';
import { PosController } from './pos.controller';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveStore);

const posOperationalRoles = ['ADMIN', 'STORE_MANAGER', 'CASHIER', 'admin', 'manager', 'store_manager', 'cashier'];
const posRefundRoles = ['ADMIN', 'STORE_MANAGER', 'admin', 'manager', 'store_manager'];

router.post('/shifts/open', authorizeRoles(posOperationalRoles), PosController.openShift);
router.post('/shifts/close', authorizeRoles(posOperationalRoles), PosController.closeShift);
router.get('/shifts/current', authorizeRoles(posOperationalRoles), PosController.getCurrentShift);
router.post('/cash-movements', authorizeRoles(posOperationalRoles), PosController.createCashMovement);
router.get('/shifts/:id/cash-movements', authorizeRoles(posOperationalRoles), PosController.listShiftCashMovements);
router.get('/inventory/lookup', authorizeRoles(posOperationalRoles), PosController.lookupInventory);
router.get('/invoices/:id/receipt', authorizeRoles(posOperationalRoles), PosController.getReceipt);
router.post('/checkout', authorizeRoles(posOperationalRoles), PosController.checkout);
router.post('/hold', authorizeRoles(posOperationalRoles), PosController.hold);
router.post('/resume/:id/checkout', authorizeRoles(posOperationalRoles), PosController.resumeCheckout);
router.post('/refund', authorizeRoles(posRefundRoles), PosController.refund);

export default router;
