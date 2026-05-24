import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';
import { StoresController } from './stores.controller';

const router = Router();

const readStoreRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER'];
const writeStoreRoles = ['ADMIN', 'DISTRICT_MANAGER'];

router.use(authenticateToken);

/**
 * UC-S1: Store list
 * GET /api/v1/stores?take=50&skip=0&q=q1
 */
router.get('/', authorizeRoles(readStoreRoles), StoresController.listStores);

/**
 * UC-S1: Store details
 * GET /api/v1/stores/:id
 */
router.get('/:id', authorizeRoles(readStoreRoles), StoresController.getStoreById);

/**
 * UC-S1: Store overview (details modal)
 * GET /api/v1/stores/:id/overview
 */
router.get('/:id/overview', authorizeRoles(readStoreRoles), StoresController.getStoreOverview);

/**
 * UC-S1: Create store
 * POST /api/v1/stores
 * Body: { code?: string, name: string, address?: string, phone?: string, timezone?: string, isActive?: boolean }
 */
router.post('/', authorizeRoles(writeStoreRoles), StoresController.createStore);

/**
 * UC-S1: Update store
 * PUT /api/v1/stores/:id
 */
router.put('/:id', authorizeRoles(writeStoreRoles), StoresController.updateStore);

/**
 * UC-S1: Deactivate store (soft delete)
 * DELETE /api/v1/stores/:id
 */
router.delete('/:id', authorizeRoles(writeStoreRoles), StoresController.deactivateStore);

export default router;
