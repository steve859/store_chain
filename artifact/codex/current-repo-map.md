# Current Repo Map - Phase 0

Generated for the Store Chain Management System refactor. This report is analysis-only and records the current repository shape before any business-logic refactor.

## 1. Current Project Structure

### Root

- `backend/` - Node.js, Express, TypeScript backend.
- `frontend/` - React, Vite frontend.
- `artifact/` - architecture, requirements, codex planning documents.
- `scripts/` - utility SQL/scripts.
- `.github/` - workflow files, including disabled CI workflow.
- `docker-compose.yml` and `Dockerfile` - container/deployment support.

### Backend

Important backend folders:

- `backend/src/app.ts` - Express app setup, global middleware, docs, health, metrics, `/api/v1` route mount.
- `backend/src/server.ts` - HTTP server, Socket.IO setup, scheduler startup, queue shutdown handling.
- `backend/src/routes/index.ts` - central API route registry under `/api/v1`.
- `backend/src/routes/health.ts` - health/readiness/full infrastructure checks.
- `backend/src/modules/` - domain and feature modules.
- `backend/src/middlewares/` - auth, RBAC, store scope, cache, monitoring, security, error, not-found middleware.
- `backend/src/db/prisma.ts` - Prisma client using `@prisma/adapter-pg` and `pg`.
- `backend/src/lib/cache/` - Redis cache helpers and catalog cache keys.
- `backend/src/lib/queues/` - Bull queue setup and processors.
- `backend/src/lib/monitoring/` - logger, metrics, error tracking.
- `backend/src/events/socket.ts` - Socket.IO handlers.
- `backend/prisma/schema.prisma` - Prisma schema.
- `backend/prisma/migrations/` - database migrations.
- `backend/tests/` - Jest tests.

Backend package commands from `backend/package.json`:

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm test`
- `npm run test:load`
- `npm run seed`
- `npm run migrate`
- `npm run migrate:deploy`

### Frontend

Important frontend folders:

- `frontend/src/main.tsx` - React entry, renders `RouterProvider`.
- `frontend/src/router/` - browser route definitions.
- `frontend/src/layouts/` - role-oriented layouts.
- `frontend/src/pages/` - page-level feature views.
- `frontend/src/components/` - shared UI and workflow components.
- `frontend/src/services/` - Axios API clients grouped by feature.
- `frontend/src/assets/` - UI images/assets.
- `frontend/src/lib/` - shared utility helpers.

Frontend package commands from `frontend/package.json`:

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run preview`

## 2. Current Backend Modules

Current folders in `backend/src/modules`:

- `audit`
- `audit_logs`
- `auth`
- `categories`
- `complaints`
- `cron`
- `inventory`
- `invoices`
- `loyalty`
- `maintenance`
- `orders`
- `pos`
- `pricing`
- `products`
- `promotions`
- `reports`
- `returns`
- `sales`
- `settings`
- `stores`
- `suppliers`
- `transfers`
- `users`

### Module File Inventory

| Module | Current files | Boundary status |
| --- | --- | --- |
| `audit` | `audit.service.ts` | Service only; separate from `audit_logs`. |
| `audit_logs` | `audit_logs.router.ts`, `audit_logs.service.ts` | Router + service. |
| `auth` | `auth.router.ts`, `auth.service.ts` | Router + service. |
| `categories` | `categories.router.ts`, `categories.service.ts` | Router + service. |
| `complaints` | `complaints.router.ts`, `complaints.service.ts` | Router + service. |
| `cron` | `scheduler.ts` | Scheduler only. |
| `inventory` | `inventory.router.ts` | Router contains DB/business logic directly. |
| `invoices` | `invoices.router.ts` | Router contains DB/query logic directly. |
| `loyalty` | `loyalty.controller.ts`, `loyalty.router.ts`, `loyalty.service.ts` | Has controller + service. |
| `maintenance` | `maintenance.router.ts`, `maintenance.service.ts` | Router + service. |
| `orders` | `orders.router.ts` | Router contains DB/business logic directly. |
| `pos` | `pos.router.ts` | Router contains checkout, shift, refund, and DB transaction logic directly. |
| `pricing` | `pricing.controller.ts`, `pricing.router.ts`, `pricing.service.ts` | Has controller + service. |
| `products` | `products.router.ts` | Router contains DB/business logic directly. |
| `promotions` | `promotions.router.ts`, `promotions.service.ts` | Router + service. |
| `reports` | `reports.router.ts`, `reports.service.ts` | Router + service. |
| `returns` | `returns.router.ts` | Router contains DB/business logic directly. |
| `sales` | `sales.router.ts`, `checkout.router.ts`, `checkout.service.ts`, `checkout.statemachine.ts`, docs/examples | Legacy and experimental checkout code; overlaps with POS. |
| `settings` | `settings.router.ts`, `settings.service.ts` | Router + service. |
| `stores` | `stores.router.ts`, `stores.service.ts` | Router + service exists, but router also contains direct Prisma logic. |
| `suppliers` | `suppliers.router.ts`, `suppliers.service.ts` | Router + service. |
| `transfers` | `transfers.router.ts` | Router contains transactional transfer logic directly. |
| `users` | `users.router.ts`, `users.service.ts` | Router + service. |

No `*.repository.ts`, `*.validation.ts`, `*.types.ts`, or module-level `index.ts` files were found in the current modules.

## 3. Current Frontend Inventory

### Pages

Current page folders/files:

- `pages/Login/index.jsx`
- `pages/DashBoard/index.jsx`
- `pages/Products/index.jsx`
- `pages/Employees/index.jsx`
- `pages/Shops/index.jsx`
- `pages/Users/index.jsx`
- `pages/Orders/index.jsx`
- `pages/PurchaseOrders/index.jsx`
- `pages/InventoryAdjustment/index.jsx`
- `pages/Transfer/index.jsx`
- `pages/Promotions/index.jsx`
- `pages/POS/index.jsx`
- `pages/POS/Return.jsx`
- `pages/Complaints/index.jsx`
- `pages/ComplaintsAdmin/index.jsx`
- `pages/Test/index.jsx`

### Layouts

- `layouts/AdminLayout.jsx`
- `layouts/EmployeeLayout.jsx`
- `layouts/CashierLayout.jsx`

These layouts provide role-oriented navigation, but route access is not guarded by a central auth guard. Users can directly navigate to `/admin`, `/employee`, or `/cashier`; backend authorization is still required for protected API calls.

### Components

- `components/StoreSwitcher.jsx`
- `components/shift/ShiftManager.jsx`
- `components/ui/badge.tsx`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/deletebtn.js`
- `components/ui/header.tsx`
- `components/ui/modal.tsx`
- `components/ui/searchbar.tsx`
- `components/ui/table.tsx`

### Services

- `services/axiosClient.js` - central Axios client; normalizes base URL to `/api/v1`; attaches `Authorization: Bearer <token>` and `x-store-id`.
- `services/complaints.js`
- `services/inventoryAdjustments.js`
- `services/posSales.js`
- `services/posShift.js`
- `services/products.js`
- `services/promotions.js`
- `services/purchaseOrders.js`
- `services/reports.js`
- `services/salesOrders.js`
- `services/stores.js`
- `services/suppliers.js`
- `services/transfers.js`
- `services/users.js`
- `services/fakeip`

## 4. Current API Routes Found

Base path: `/api/v1`, mounted from `backend/src/app.ts`.

Route registry in `backend/src/routes/index.ts`:

- `GET /api/v1/`
- `/api/v1/audit-logs`
- `/api/v1/auth`
- `/api/v1/categories`
- `/api/v1/stores`
- `/api/v1/products`
- `/api/v1/inventory`
- `/api/v1/maintenance`
- `/api/v1/orders`
- `/api/v1/sales`
- `/api/v1/invoices`
- `/api/v1/users`
- `/api/v1/pos`
- `/api/v1/promotions`
- `/api/v1/reports`
- `/api/v1/settings`
- `/api/v1/suppliers`
- `/api/v1/transfers`
- `/api/v1/returns`
- `/api/v1/complaints`
- `/api/v1/loyalty`
- `/api/v1/pricing`

Health and observability routes outside `/api/v1`:

- `GET /health`
- `GET /health/ready`
- `GET /health/full`
- `GET /metrics`
- Swagger UI mounted by `setupSwagger(app)` at `/api-docs`.

### Auth

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`

### Users

- `GET /api/v1/users/meta`
- `GET /api/v1/users`
- `GET /api/v1/users/:id`
- `GET /api/v1/users/:id/stores`
- `PUT /api/v1/users/:id/stores`
- `POST /api/v1/users`
- `PUT /api/v1/users/:id`
- `DELETE /api/v1/users/:id`

### Stores

- `GET /api/v1/stores`
- `GET /api/v1/stores/:id`
- `GET /api/v1/stores/:id/overview`
- `POST /api/v1/stores`
- `PUT /api/v1/stores/:id`
- `DELETE /api/v1/stores/:id`

### Products

- `GET /api/v1/products`
- `GET /api/v1/products/catalog`
- `GET /api/v1/products/variant-prices`
- `POST /api/v1/products/variant-prices`
- `POST /api/v1/products/variant-prices/close`
- `GET /api/v1/products/:id`
- `POST /api/v1/products`
- `PUT /api/v1/products/:id`
- `POST /api/v1/products/:id/variants`
- `PUT /api/v1/products/variants/:variantId`

### Categories

- `GET /api/v1/categories`
- `GET /api/v1/categories/:id`
- `POST /api/v1/categories`
- `PUT /api/v1/categories/:id`
- `DELETE /api/v1/categories/:id`

### Inventory

- `GET /api/v1/inventory/adjustments`
- `GET /api/v1/inventory`
- `GET /api/v1/inventory/variants/:variantId`
- `GET /api/v1/inventory/stores/:storeId/variants/:variantId`
- `GET /api/v1/inventory/lookup`
- `GET /api/v1/inventory/stores/:storeId/lookup`
- `POST /api/v1/inventory/receive`
- `POST /api/v1/inventory/adjust`

### Orders / Purchase Orders

- `GET /api/v1/orders`
- `DELETE /api/v1/orders/:id`
- `GET /api/v1/orders/:id`
- `POST /api/v1/orders`
- `POST /api/v1/orders/:id/status`
- `POST /api/v1/orders/:id/receive`

### POS

- `POST /api/v1/pos/shifts/open`
- `POST /api/v1/pos/shifts/close`
- `GET /api/v1/pos/shifts/current`
- `POST /api/v1/pos/cash-movements`
- `GET /api/v1/pos/shifts/:id/cash-movements`
- `GET /api/v1/pos/inventory/lookup`
- `GET /api/v1/pos/invoices/:id/receipt`
- `POST /api/v1/pos/checkout`
- `POST /api/v1/pos/hold`
- `POST /api/v1/pos/resume/:id/checkout`
- `POST /api/v1/pos/refund`

### Sales

The `sales` module is marked in code as legacy/admin-only for older UUID-based sales structures.

- `GET /api/v1/sales/catalog`
- `POST /api/v1/sales/checkout`
- `GET /api/v1/sales`
- `GET /api/v1/sales/:id`

`sales/checkout.router.ts` also defines checkout-session routes, but no mount for this router was observed in `routes/index.ts`.

### Invoices

- `GET /api/v1/invoices`
- `GET /api/v1/invoices/:id`

### Returns

- `GET /api/v1/returns/invoices`
- `GET /api/v1/returns/invoices/:id`
- `POST /api/v1/returns`
- `GET /api/v1/returns`
- `GET /api/v1/returns/:id`
- `POST /api/v1/returns/refund`

### Promotions

- `GET /api/v1/promotions`
- `GET /api/v1/promotions/:id`
- `POST /api/v1/promotions`
- `PUT /api/v1/promotions/:id`
- `DELETE /api/v1/promotions/:id`
- `POST /api/v1/promotions/validate`

### Reports

- `GET /api/v1/reports/dashboard`
- `GET /api/v1/reports/revenue-chart`
- `GET /api/v1/reports/top-products`

### Settings

- `GET /api/v1/settings`
- `GET /api/v1/settings/:group`
- `POST /api/v1/settings`
- `POST /api/v1/settings/init-defaults`

### Suppliers

- `GET /api/v1/suppliers`
- `GET /api/v1/suppliers/:id`
- `POST /api/v1/suppliers`
- `PUT /api/v1/suppliers/:id`
- `DELETE /api/v1/suppliers/:id`

### Transfers

- `GET /api/v1/transfers`
- `GET /api/v1/transfers/:id`
- `POST /api/v1/transfers`
- `POST /api/v1/transfers/:id/dispatch`
- `POST /api/v1/transfers/:id/receive`
- `POST /api/v1/transfers/:id/cancel`

### Complaints

- `GET /api/v1/complaints`
- `GET /api/v1/complaints/my`
- `GET /api/v1/complaints/:id`
- `POST /api/v1/complaints`
- `PATCH /api/v1/complaints/:id/status`
- `DELETE /api/v1/complaints/:id`

### Loyalty

- `POST /api/v1/loyalty/enroll`
- `GET /api/v1/loyalty/balance/:loyaltyId`
- `GET /api/v1/loyalty/transactions/:loyaltyId`
- `GET /api/v1/loyalty/offers/:loyaltyId`
- `POST /api/v1/loyalty/process-points`
- `POST /api/v1/loyalty/redeem`

### Pricing

- `POST /api/v1/pricing/rules`
- `GET /api/v1/pricing/recommend`
- `GET /api/v1/pricing/history/:productVariantId`
- `GET /api/v1/pricing/competitors`
- `POST /api/v1/pricing/demand-metrics`
- `POST /api/v1/pricing/competitor-prices`

### Audit Logs

- `GET /api/v1/audit-logs`

### Maintenance

- `GET /api/v1/maintenance/status`
- `POST /api/v1/maintenance/backup`
- `POST /api/v1/maintenance/cleanup`
- `POST /api/v1/maintenance/disaster-recovery/drill`

## 5. Middleware Inventory

Current middleware files in `backend/src/middlewares`:

- `auth.middleware.ts` - verifies JWT, attaches `req.user`, resolves active store.
- `rbac.middleware.ts` - `authorizeRoles(allowedRoles)` role-name check.
- `storeScope.middleware.ts` - resolves `req.activeStoreId`, validates `x-store-id`, query/body `storeId`, provides `requireActiveStore` and `requireActiveStoreUnlessAdmin`.
- `security.middleware.ts` - Helmet headers, general rate limit, auth rate limit, input sanitization, CORS validation, HTTPS redirect, payload size limit, request timeout.
- `cache.middleware.ts` - generic JSON response cache middleware.
- `catalogCache.middleware.ts` - catalog-specific cache wrapper.
- `monitoring.middleware.ts` - request ID, verbose logging, monitoring, error monitoring.
- `errorHandler.ts` - centralized Express error handler.
- `notFound.ts` - 404 handler.

Auth/RBAC/store-scope consistency observations:

- Protected modules include `audit_logs`, `categories`, `complaints`, `inventory`, `invoices`, `maintenance`, `orders`, `pos`, `products`, `reports`, `returns`, `sales`, `suppliers`, and `transfers`.
- `users`, `stores`, `promotions`, `settings`, and `loyalty` currently expose routes without module-level `authenticateToken`.
- `pricing.router.ts` applies `requireActiveStore` and RBAC, but does not apply `authenticateToken` in that router.
- RBAC is implemented with simple role strings, not permission records from a `roles`/`permissions` module.

## 6. Database Access Pattern

Database stack:

- PostgreSQL target/current database.
- Prisma ORM via `@prisma/client`.
- Prisma adapter-pg via `@prisma/adapter-pg`.
- `pg` connection pool.
- Prisma client file: `backend/src/db/prisma.ts`.
- Schema file: `backend/prisma/schema.prisma`.
- Migrations folder: `backend/prisma/migrations`.
- Seed file: `backend/prisma/seed.ts`.

Current Prisma models include:

- `audit_logs`
- `customers`
- `inventories`
- `invoice_items`
- `invoices`
- `loyalty_points`
- `product_variants`
- `products`
- `promotions`
- `complaints`
- `purchase_items`
- `purchase_orders`
- `roles`
- `stock_lots`
- `stock_movements`
- `store_transfer_items`
- `store_transfers`
- `stores`
- `suppliers`
- `users`
- `user_stores`
- `categories`
- `brands`
- `variant_prices`
- `purchase_order_receipts`
- `purchase_order_receipt_items`
- `returns`
- `return_items`
- `pos_shifts`
- `cash_movements`
- `loyalty_customers`
- `loyalty_transactions`
- `loyalty_redemptions`
- `loyalty_offers`
- `pricing_rules`
- `pricing_history`
- `demand_metrics`
- `competitor_prices`

Access pattern:

- Many modules import `prisma` directly from `../../db/prisma`.
- Several routers contain direct database queries and business rules.
- Some modules have services, but repositories are not separated.
- Raw SQL via Prisma query APIs is used in the legacy `sales` module.
- Transaction boundaries are present in important flows, including POS checkout/hold/resume/refund and transfer create/dispatch/receive/cancel.

Target gap:

- The target dependency direction is `routes -> controllers -> services -> repositories -> database`.
- Current code is closer to `routes -> services/database`, with many routers directly handling validation, business rules, and persistence.

## 7. Redis, Queue, and WebSocket Usage

### Redis

Redis-related files:

- `backend/src/lib/cache/redis.ts`
- `backend/src/lib/cache/catalog.ts`
- `backend/src/middlewares/cache.middleware.ts`
- `backend/src/middlewares/catalogCache.middleware.ts`
- `backend/src/lib/queues/jobQueue.ts`
- `backend/src/lib/queues/processors/cacheProcessor.ts`
- `backend/src/lib/queues/processors/emailProcessor.ts`
- `backend/src/lib/queues/processors/loyaltyProcessor.ts`

Current usage:

- `getRedis()` provides a best-effort Redis client using `REDIS_URL`.
- Catalog responses can be cached.
- Catalog cache invalidation is called from product/order/inventory paths.
- Health and maintenance checks verify Redis availability.
- Bull queues use Redis for async jobs.

Observed gaps:

- Bull queue Redis configuration is separate from `lib/cache/redis.ts`.
- Cache invalidation processor includes TODO-level Redis invalidation.
- Redis Pub/Sub for dashboard, price updates, and notifications is not clearly implemented.
- Redis is not yet clearly used as active promotion/pricing/dashboard cache beyond catalog caching.

### Queue

Queue file:

- `backend/src/lib/queues/jobQueue.ts`

Current job types:

- `SEND_EMAIL`
- `GENERATE_REPORT`
- `EXPORT_DATA`
- `SYNC_INVENTORY`
- `PROCESS_REFUND`
- `INVALIDATE_CACHE`
- `RECONCILE_PAYMENTS`

Current direct module usage found:

- `loyalty.service.ts` enqueues email jobs.

### WebSocket

WebSocket files:

- `backend/src/server.ts`
- `backend/src/events/socket.ts`
- `backend/src/types/socket.d.ts`

Current behavior:

- Socket.IO server is created in `server.ts`.
- Socket handlers support `join_store_room` and `leave_store_room`.
- Room naming convention is `store_<storeId>`.

Observed gaps:

- Socket connections and room joins are not authenticated in the current handler.
- Store-room membership is not checked against JWT/store scope.
- No clear event emit paths were found for dashboard updates, price updates, notifications, inventory sync, or analytics.
- Target document mentions `lib/socket.ts`; current implementation is in `events/socket.ts`.

## 8. Comparison With SAD and Module Map

### Target from SAD and `artifact/codex/module-map.md`

The target architecture is a modular monolith:

- Frontend: ReactJS, role-based layouts, route guards, API clients.
- Backend: Node.js/ExpressJS, REST under `/api/v1`.
- Database: PostgreSQL.
- Cache/queue/pub-sub: Redis.
- Real-time: WebSocket.
- Backend modules: `auth`, `users`, `roles`, `stores`, `dashboard`, `products`, `inventory`, `transfers`, `pos`, `transactions`, `loyalty`, `promotions`, `pricing`, `reports`, `analytics`, `complaints`, `audit_logs`, `settings`.
- Middleware: JWT auth, RBAC, store scope, rate limiting, centralized errors, request logging, audit logging for sensitive operations.

### Alignment

Already aligned:

- Backend uses Express + TypeScript and is mounted under `/api/v1`.
- Frontend uses React + Vite.
- PostgreSQL/Prisma is used.
- Redis and Bull queue infrastructure exists.
- Socket.IO exists.
- Health, metrics, structured logging, security headers, rate limiting, and Swagger are present.
- Many target modules already exist by folder name.
- POS checkout and transfers use database transactions in key write flows.
- Store scope middleware and frontend `x-store-id` propagation exist.

### Partial alignment

- Role-based frontend layouts exist, but there is no central route guard.
- RBAC middleware exists, but no dedicated roles/permissions module exists.
- Store scope exists, but route coverage is uneven.
- Audit log tables/module exist, but audit logging is not consistently applied to sensitive operations.
- Redis cache exists, but target Pub/Sub and broader cache responsibilities are incomplete.
- WebSocket rooms exist, but authentication and event publishing are incomplete.
- Reports exist, but `dashboard` and `analytics` are not separated into target modules.

### Missing target modules/routes

- `roles`
- `permissions`
- `dashboard`
- `transactions`
- `analytics`

### Overlapping or extra modules

- `sales` overlaps with `pos` and appears legacy.
- `invoices` overlaps with target `transactions`.
- `orders` currently represents purchase orders and should be mapped carefully against inventory/procurement needs.
- `categories`, `suppliers`, `returns`, and `maintenance` are useful modules but not explicitly listed in the target module map.
- `audit` and `audit_logs` duplicate governance naming.

## 9. Refactor Risks To Address Before Code Movement

- Some sensitive endpoints are currently unprotected or inconsistently protected.
- `pricing` middleware ordering appears incomplete because auth is not applied before store scope/RBAC in that module.
- Direct Prisma logic in routers increases risk when moving code into services/repositories.
- `sales` legacy module and current `pos` module overlap; route compatibility must be preserved before consolidation.
- Frontend role selection is localStorage/layout-driven and lacks central route guards.
- WebSocket room joins are not authenticated or store-scoped by middleware.
- Audit logging is not yet consistently tied to user, role, store, stock, transfer, pricing, report export, or complaint operations.
- `docker-compose.yml` currently contains an inline database connection string value; this should be handled carefully in a separate secrets/config cleanup task with explicit approval.

## 10. Recommended Next Phase

For Phase 1, keep runtime behavior and public routes stable. The safest first implementation target is structure-only normalization:

- Add no new behavior.
- Do not rename public routes.
- Start by documenting route ownership and selecting one low-risk module for route/controller/service extraction.
- Avoid touching POS, transfers, auth, and pricing until middleware coverage and route compatibility are explicitly planned.

