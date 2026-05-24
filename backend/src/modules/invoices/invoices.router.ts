import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';
import { requireActiveStoreUnlessAdmin } from '../../middlewares/storeScope.middleware';
import { InvoicesController } from './invoices.controller';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveStoreUnlessAdmin);

const invoiceReadRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'CASHIER', 'admin', 'district_manager', 'manager', 'store_manager', 'cashier'];

// List POS invoices (used by Orders page)
// GET /api/v1/invoices?take=20&skip=0&q=...
router.get('/', authorizeRoles(invoiceReadRoles), InvoicesController.listInvoices);

// Invoice details (used by Orders detail modal)
// GET /api/v1/invoices/:id
router.get('/:id', authorizeRoles(invoiceReadRoles), InvoicesController.getInvoiceDetail);

export default router;
