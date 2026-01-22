import { Router } from 'express';
import auditLogsRouter from '../modules/audit_logs/audit_logs.router';
import authRouter from '../modules/auth/auth.router';
import categoriesRouter from '../modules/categories/categories.router';
import storesRouter from '../modules/stores/stores.router';
import productsRouter from '../modules/products/products.router';
import inventoryRouter from '../modules/inventory/inventory.router';
import maintenanceRouter from '../modules/maintenance/maintenance.router';
import ordersRouter from '../modules/orders/orders.router';
import usersRouter from '../modules/users/users.router';
import posRouter from '../modules/pos/pos.router';
import promotionsRouter from '../modules/promotions/promotions.router';
import salesRouter from '../modules/sales/sales.router';
import reportsRouter from '../modules/reports/reports.router';
import settingsRouter from '../modules/settings/settings.router';
import suppliersRouter from '../modules/suppliers/suppliers.router';
import transfersRouter from '../modules/transfers/transfers.router';
import returnsRouter from '../modules/returns/returns.router';
import complaintsRouter from '../modules/complaints/complaints.router';
import invoicesRouter from '../modules/invoices/invoices.router';

const router = Router();

router.get('/', (_req, res) => {
	res.json({
		status: 'ok',
		version: 'v1',
		routes: ['stores', 'products', 'inventory', 'orders', 'sales', 'invoices', 'users', 'pos', 'promotions', 'transfers', 'returns', 'complaints'],
	});
});

router.use('/audit-logs', auditLogsRouter);
router.use('/auth', authRouter);
router.use('/categories', categoriesRouter);
router.use('/stores', storesRouter);
router.use('/products', productsRouter);
router.use('/inventory', inventoryRouter);
router.use('/maintenance', maintenanceRouter);
router.use('/orders', ordersRouter);
router.use('/sales', salesRouter);
router.use('/invoices', invoicesRouter);
router.use('/users', usersRouter);
router.use('/pos', posRouter);
router.use('/promotions', promotionsRouter);
router.use('/reports', reportsRouter);
router.use('/settings', settingsRouter);
router.use('/suppliers', suppliersRouter);
router.use('/transfers', transfersRouter);
router.use('/returns', returnsRouter);
router.use('/complaints', complaintsRouter);

export default router;
