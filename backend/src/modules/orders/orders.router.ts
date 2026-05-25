import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';
import { requireActiveStore, requireActiveStoreUnlessAdmin } from '../../middlewares/storeScope.middleware';
import { OrdersController } from './orders.controller';

const router = Router();

router.use(authenticateToken);

const orderReadRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'INVENTORY_STAFF', 'admin', 'district_manager', 'manager', 'store_manager', 'inventory_staff'];
const orderCreateRoles = ['ADMIN', 'STORE_MANAGER', 'INVENTORY_STAFF', 'admin', 'manager', 'store_manager', 'inventory_staff'];
const orderDeleteRoles = ['ADMIN', 'STORE_MANAGER', 'admin', 'manager', 'store_manager'];
const orderStatusRoles = ['ADMIN', 'STORE_MANAGER', 'admin', 'manager', 'store_manager'];
const orderReceiveRoles = ['ADMIN', 'STORE_MANAGER', 'INVENTORY_STAFF', 'admin', 'manager', 'store_manager', 'inventory_staff'];

/**
 * UC-M3: Purchase order list
 * GET /api/v1/orders?storeId=1&status=draft&take=50&skip=0&q=po-2026
 */
router.get('/', requireActiveStoreUnlessAdmin, authorizeRoles(orderReadRoles), OrdersController.listOrders);

/**
 * UC-M3: Delete draft purchase order
 * DELETE /api/v1/orders/:id
 */
router.delete('/:id', requireActiveStoreUnlessAdmin, authorizeRoles(orderDeleteRoles), OrdersController.deleteDraftOrder);

/**
 * UC-M3: Purchase order details
 * GET /api/v1/orders/:id
 */
router.get('/:id', requireActiveStoreUnlessAdmin, authorizeRoles(orderReadRoles), OrdersController.getOrderDetail);

/**
 * UC-M3: Create purchase order
 * POST /api/v1/orders
 */
router.post('/', requireActiveStore, authorizeRoles(orderCreateRoles), OrdersController.createOrder);

/**
 * UC-M3: Update purchase order status
 * POST /api/v1/orders/:id/status
 */
router.post('/:id/status', requireActiveStoreUnlessAdmin, authorizeRoles(orderStatusRoles), OrdersController.updateOrderStatus);

/**
 * UC-M3: Receive purchase order into inventory
 * POST /api/v1/orders/:id/receive
 */
router.post('/:id/receive', requireActiveStoreUnlessAdmin, authorizeRoles(orderReceiveRoles), OrdersController.receiveOrder);

export default router;
