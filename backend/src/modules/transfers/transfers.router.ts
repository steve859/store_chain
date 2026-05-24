import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';
import { requireActiveStore, requireActiveStoreUnlessAdmin } from '../../middlewares/storeScope.middleware';
import { TransfersController } from './transfers.controller';

const router = Router();

router.use(authenticateToken);

const transferReadRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'INVENTORY_STAFF', 'admin', 'manager', 'store_manager', 'inventory_staff'];
const transferWriteRoles = ['ADMIN', 'STORE_MANAGER', 'INVENTORY_STAFF', 'admin', 'store_manager', 'inventory_staff'];

/**
 * UC-M8: List transfers
 * GET /api/v1/transfers?fromStoreId=1&toStoreId=2&status=pending&take=50&skip=0&q=tr-
 */
router.get('/', requireActiveStoreUnlessAdmin, authorizeRoles(transferReadRoles), TransfersController.listTransfers);

/**
 * UC-M8: Transfer details
 * GET /api/v1/transfers/:id
 */
router.get('/:id', requireActiveStoreUnlessAdmin, authorizeRoles(transferReadRoles), TransfersController.getTransferDetail);

/**
 * UC-M8: Create transfer (reserves stock at origin store)
 * POST /api/v1/transfers
 */
router.post('/', requireActiveStore, authorizeRoles(transferWriteRoles), TransfersController.createTransfer);

/**
 * UC-M8: Dispatch transfer (moves stock out of origin: reserved->quantity decrement)
 * POST /api/v1/transfers/:id/dispatch
 */
router.post('/:id/dispatch', requireActiveStoreUnlessAdmin, authorizeRoles(transferWriteRoles), TransfersController.dispatchTransfer);

/**
 * UC-M8: Receive transfer (moves stock into destination)
 * POST /api/v1/transfers/:id/receive
 */
router.post('/:id/receive', requireActiveStoreUnlessAdmin, authorizeRoles(transferWriteRoles), TransfersController.receiveTransfer);

/**
 * UC-M8: Cancel transfer (only while pending)
 * POST /api/v1/transfers/:id/cancel
 */
router.post('/:id/cancel', requireActiveStoreUnlessAdmin, authorizeRoles(transferWriteRoles), TransfersController.cancelTransfer);

export default router;
