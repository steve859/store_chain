import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';
import { requireActiveStore, requireActiveStoreUnlessAdmin } from '../../middlewares/storeScope.middleware';
import { InventoryController } from './inventory.controller';

const router = Router();

router.use(authenticateToken);

const inventoryReadRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'INVENTORY_STAFF', 'admin', 'manager', 'store_manager', 'inventory_staff'];
const inventoryLookupRoles = [
  'ADMIN',
  'DISTRICT_MANAGER',
  'STORE_MANAGER',
  'INVENTORY_STAFF',
  'CASHIER',
  'admin',
  'manager',
  'store_manager',
  'inventory_staff',
  'cashier',
];
const stockWriteRoles = ['ADMIN', 'STORE_MANAGER', 'INVENTORY_STAFF', 'admin', 'store_manager', 'inventory_staff'];

// Adjustment history (stock_movements of type 'adjustment')
// GET /api/v1/inventory/adjustments?q=milk&take=50&skip=0
router.get('/adjustments', requireActiveStoreUnlessAdmin, authorizeRoles(inventoryReadRoles), InventoryController.listAdjustments);

// Basic inventory list (by store)
router.get('/', requireActiveStoreUnlessAdmin, authorizeRoles(inventoryReadRoles), InventoryController.listInventory);

// Lookup inventory for active store + variant
router.get('/variants/:variantId', requireActiveStore, authorizeRoles(inventoryLookupRoles), InventoryController.getActiveStoreVariantInventory);

// Lookup inventory for a store + variant (legacy route)
router.get('/stores/:storeId/variants/:variantId', requireActiveStoreUnlessAdmin, authorizeRoles(inventoryLookupRoles), InventoryController.getStoreVariantInventory);

// Lookup by barcode (common cashier/manager workflow)
router.get('/lookup', requireActiveStore, authorizeRoles(inventoryLookupRoles), InventoryController.lookupActiveStoreInventory);

// Lookup by barcode for a store (legacy route)
router.get('/stores/:storeId/lookup', requireActiveStoreUnlessAdmin, authorizeRoles(inventoryLookupRoles), InventoryController.lookupStoreInventory);

/**
 * UC-M2: Receistock
 * Body:
 * {
 *   variantId: number,
 *   quantity: number,
 *   unitCost: number,
 *   createdBy?: number,
 *   lotCode?: string,
 *   expiryDate?: string (YYYY-MM-DD),
 *   referenceId?: string,
 *   reason?: string
 * }
 */
router.post('/receive', requireActiveStoreUnlessAdmin, authorizeRoles(stockWriteRoles), InventoryController.receiveInventory);

/**
 * UC-M2: Adjust stock
 * Body:
 * {
 *   variantId: number,
 *   delta?: number,
 *   setTo?: number,
 *   createdBy?: number,
 *   reason?: string,
 *   referenceId?: string
 * }
 */
router.post('/adjust', requireActiveStoreUnlessAdmin, authorizeRoles(stockWriteRoles), InventoryController.adjustInventory);

export default router;
