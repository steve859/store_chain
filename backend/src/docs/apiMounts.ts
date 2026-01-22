import auditLogsRouter from '../modules/audit_logs/audit_logs.router';
import authRouter from '../modules/auth/auth.router';
import categoriesRouter from '../modules/categories/categories.router';
import inventoryRouter from '../modules/inventory/inventory.router';
import maintenanceRouter from '../modules/maintenance/maintenance.router';
import ordersRouter from '../modules/orders/orders.router';
import posRouter from '../modules/pos/pos.router';
import productsRouter from '../modules/products/products.router';
import promotionsRouter from '../modules/promotions/promotions.router';
import reportsRouter from '../modules/reports/reports.router';
import returnsRouter from '../modules/returns/returns.router';
import salesRouter from '../modules/sales/sales.router';
import settingsRouter from '../modules/settings/settings.router';
import storesRouter from '../modules/stores/stores.router';
import suppliersRouter from '../modules/suppliers/suppliers.router';
import transfersRouter from '../modules/transfers/transfers.router';
import usersRouter from '../modules/users/users.router';
import complaintsRouter from '../modules/complaints/complaints.router';

export type ApiMount = {
  basePath: string;
  router: any;
  tag: string;
};

export const apiV1Mounts: ApiMount[] = [
  { basePath: '/api/v1/audit-logs', router: auditLogsRouter, tag: 'Audit Logs' },
  { basePath: '/api/v1/auth', router: authRouter, tag: 'Auth' },
  { basePath: '/api/v1/categories', router: categoriesRouter, tag: 'Categories' },
  { basePath: '/api/v1/stores', router: storesRouter, tag: 'Stores' },
  { basePath: '/api/v1/products', router: productsRouter, tag: 'Products' },
  { basePath: '/api/v1/inventory', router: inventoryRouter, tag: 'Inventory' },
  { basePath: '/api/v1/maintenance', router: maintenanceRouter, tag: 'Maintenance' },
  { basePath: '/api/v1/orders', router: ordersRouter, tag: 'Orders' },
  { basePath: '/api/v1/users', router: usersRouter, tag: 'Users' },
  { basePath: '/api/v1/pos', router: posRouter, tag: 'POS' },
  { basePath: '/api/v1/promotions', router: promotionsRouter, tag: 'Promotions' },
  { basePath: '/api/v1/sales', router: salesRouter, tag: 'Sales' },
  { basePath: '/api/v1/reports', router: reportsRouter, tag: 'Reports' },
  { basePath: '/api/v1/settings', router: settingsRouter, tag: 'Settings' },
  { basePath: '/api/v1/suppliers', router: suppliersRouter, tag: 'Suppliers' },
  { basePath: '/api/v1/transfers', router: transfersRouter, tag: 'Transfers' },
  { basePath: '/api/v1/returns', router: returnsRouter, tag: 'Returns' },
  { basePath: '/api/v1/complaints', router: complaintsRouter, tag: 'Complaints' },
];
