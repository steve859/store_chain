import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';
import { requireActiveStore } from '../../middlewares/storeScope.middleware';
import { ReturnsController } from './returns.controller';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveStore);

const invoiceLookupRoles = ['ADMIN', 'STORE_MANAGER', 'CASHIER', 'admin', 'manager', 'store_manager', 'cashier'];
const returnCreateRoles = ['ADMIN', 'STORE_MANAGER', 'CASHIER', 'admin', 'manager', 'store_manager', 'cashier'];
const returnReadRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'CASHIER', 'admin', 'district_manager', 'manager', 'store_manager', 'cashier'];
const managerRefundRoles = ['ADMIN', 'STORE_MANAGER', 'admin', 'manager', 'store_manager'];

/**
 * UC-M7: List invoices for return/refund lookup
 * GET /api/v1/returns/invoices?storeId=1&from=2025-01-01&to=2025-01-31&take=50&skip=0
 */
router.get('/invoices', authorizeRoles(invoiceLookupRoles), ReturnsController.listInvoices);

/**
 * UC-M7: Invoice lookup for returns
 * GET /api/v1/returns/invoices/:id
 */
router.get('/invoices/:id', authorizeRoles(invoiceLookupRoles), ReturnsController.getInvoiceForReturn);

/**
 * UC-M7: Create a return (and optionally restock)
 * POST /api/v1/returns
 */
router.post('/', authorizeRoles(returnCreateRoles), ReturnsController.createReturn);

/**
 * UC-M7: List returns
 * GET /api/v1/returns?take=50&skip=0
 */
router.get('/', authorizeRoles(returnReadRoles), ReturnsController.listReturns);

/**
 * UC-M7: Return details
 * GET /api/v1/returns/:id
 */
router.get('/:id', authorizeRoles(returnReadRoles), ReturnsController.getReturnDetail);

/**
 * UC-M7: Manager refund (audit-logged)
 * POST /api/v1/returns/refund
 */
router.post('/refund', authorizeRoles(managerRefundRoles), ReturnsController.createManagerRefund);

export default router;
