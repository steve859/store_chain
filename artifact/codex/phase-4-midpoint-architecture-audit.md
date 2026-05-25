# Phase 4 Midpoint Architecture Audit

Date: 2026-05-25

## Scope

This is an audit-only report after Phase 4 refactors for:

- `stores`
- `promotions`
- `users`
- `complaints`
- `invoices`
- `products`

No route paths, request/response shapes, business logic, Prisma schema, or application code were changed by this audit.

## Current Backend Structure

The backend remains an Express modular monolith under `backend/src/modules`.

Modules currently following a router/controller/service/repository boundary:

| Module | Router | Controller | Service | Repository | Status |
|---|---|---|---|---|---|
| `stores` | yes | yes | yes | yes | Phase 4a complete |
| `promotions` | yes | yes | yes | yes | Phase 4b complete |
| `users` | yes | yes | yes | yes | Phase 4c complete |
| `complaints` | yes | yes | yes | yes | Phase 4d complete |
| `invoices` | yes | yes | yes | yes | Phase 4e complete |
| `products` | yes | yes | yes | yes | Phase 4f complete |
| `settings` | yes | yes | yes | yes | previously complete |
| `categories` | yes | yes | yes | yes | previously complete |
| `suppliers` | yes | yes | yes | yes | previously complete |
| `audit_logs` | yes | yes | yes | yes | previously complete |

Modules with partial boundaries:

| Module | Current state |
|---|---|
| `pricing` | router/controller/service present; repository still missing |
| `loyalty` | router/controller/service present; repository still missing |
| `reports` | router/service present; controller/repository missing |
| `auth` | router/service present; controller/repository missing |
| `maintenance` | router/service present |
| `sales` | service/state-machine docs exist, but routers remain heavy |

## Router Thinness Check

The six Phase 4 routers now primarily contain route paths, middleware, role constants, cache middleware where applicable, and controller calls.

| Module | Router lines | Thinness result | Notes |
|---|---:|---|---|
| `invoices` | 16 | Pass | Route paths, auth/store-scope/RBAC, controller calls |
| `promotions` | 22 | Pass | Route paths, RBAC, controller calls |
| `users` | 24 | Pass | `authenticateToken`, `authorizeRoles(['ADMIN'])`, controller calls |
| `complaints` | 26 | Pass | Auth, store-scope, RBAC role arrays, controller calls |
| `stores` | 40 | Pass | Comments plus auth/RBAC/controller calls |
| `products` | 65 | Pass | Preserves `cacheCatalogResponse()` on catalog route |

Direct Prisma access for these six modules is now in repository files, not routers.

## Phase 3 Compatibility Check

### RBAC And Store Scope

Preserved in refactored routers:

- `stores`: authenticated read/write RBAC preserved.
- `promotions`: read/write/validate RBAC preserved.
- `users`: `authenticateToken` plus ADMIN-only RBAC preserved.
- `complaints`: `authenticateToken`, `requireActiveStoreUnlessAdmin`, and complaint route RBAC preserved.
- `invoices`: invoice read RBAC plus `requireActiveStoreUnlessAdmin` preserved.
- `products`: product read/write RBAC, catalog/POS read RBAC, variant price RBAC, and active-store middleware preserved.

### Object-Level Store Checks

Preserved:

- `complaints`: `/my` active-store filtering for non-admin users remains; detail/status/delete strict non-admin store policy remains; ADMIN bypass remains where previously allowed.
- `invoices`: non-admin invoice detail requires finite `activeStoreId`, finite `invoice.store_id`, and equality; ADMIN bypass remains.
- `products`: active store remains required for catalog and variant price routes.

### Audit Logging

Preserved:

- `stores`: `STORE_CREATED`, `STORE_UPDATED`, `STORE_DEACTIVATED`.
- `promotions`: `PROMOTION_CREATED`, `PROMOTION_UPDATED`, `PROMOTION_DELETED`.
- `users`: `USER_CREATED`, `USER_UPDATED`, `USER_STORE_ASSIGNMENTS_UPDATED`, `USER_DEACTIVATED`.
- `complaints`: `COMPLAINT_STATUS_UPDATED`, `COMPLAINT_DELETED`.
- `products`: `VARIANT_PRICE_SET`, `VARIANT_PRICE_CLOSED`.

Audit payload safety remains preserved in the refactored modules:

- no full request body logging
- no password/password_hash logging
- no token/secret-like field logging
- no full complaint description or image payload logging

### Cache Behavior

Preserved:

- `products` keeps `cacheCatalogResponse()` on `GET /api/v1/products/catalog`.
- `products` keeps catalog cache invalidation after successful variant price set/close.
- Inventory-triggered catalog invalidation remains outside the products refactor and is still covered by existing tests.

### Response Shapes

Focused tests confirmed preserved response shapes for:

- stores
- promotions
- users
- complaints
- invoices
- products/catalog/variant-prices

## Verification Already Run During Phase 4

Focused test/lint commands were run during implementation of the completed batches:

| Module | Test result | Lint result |
|---|---|---|
| `stores` | passed | passed |
| `promotions` | passed | passed |
| `users` | passed | passed cleanly |
| `complaints` | passed | passed cleanly |
| `invoices` | passed | passed cleanly |
| `products` | passed | eslint exited successfully; existing warnings remain in `tests/catalog.invalidate.test.ts` |

Known non-blocking test output:

- `SENTRY_DSN not set, error tracking disabled` appears in focused test runs.

## Remaining Router-Heavy Modules

Current router line counts:

| Rank | Module/router | Lines | Current concern |
|---:|---|---:|---|
| 1 | `pos/pos.router.ts` | 962 | checkout, refund, hold/resume, receipt, shifts, cash movement, audit, transactions |
| 2 | `transfers/transfers.router.ts` | 659 | transfer lifecycle, source/destination store checks, reserved stock, stock movement, audit |
| 3 | `returns/returns.router.ts` | 639 | invoice lookup, standard returns, manager refund, stable error contracts, transaction-bound audit |
| 4 | `orders/orders.router.ts` | 534 | purchase order lifecycle, receive stock, status/delete object checks, cache invalidation |
| 5 | `inventory/inventory.router.ts` | 532 | stock read/lookup, receive/adjust transactions, stock movement, cache invalidation, audit |
| 6 | `sales/sales.router.ts` | 369 | sales route layer still substantial |
| 7 | `sales/checkout.router.ts` | 353 | checkout-specific routing remains substantial |
| 8 | `reports/reports.router.ts` | 79 | small, but still router/controller split incomplete |

Other partial modules:

- `pricing`: router is thin, but service still owns Prisma access; repository extraction remains.
- `loyalty`: router is thin, but repository extraction remains.
- `auth`: security-sensitive but small; auth audit logging remains a deferred Phase 3f follow-up.

## Remaining Module Ranking

Scoring: 5 is highest. For risk, 5 means highest implementation risk. For speed, 5 means fastest expected implementation.

| Candidate | SAD/ADD importance | Implementation risk | Test coverage | Speed | Notes |
|---|---:|---:|---:|---:|---|
| `orders` | 4 | 4 | 5 | 3 | Best next balance: important, covered, less broad than inventory/transfers/returns/POS |
| `inventory` | 5 | 5 | 4 | 2 | High importance, but stock mutation transactions are riskier |
| `transfers` | 5 | 5 | 5 | 2 | Strong tests, but lifecycle transactions are larger |
| `returns` | 5 | 5 | 5 | 1 | Very sensitive due refund contracts and transaction-bound audit |
| `pos` | 5 | 5 | 5 | 1 | Highest blast radius; leave until more transaction modules are split |
| `reports` | 3 | 2 | 3 | 5 | Fast, but lower priority than operational modules |
| `pricing` repository extraction | 4 | 3 | 4 | 4 | Useful cleanup, but router boundary is already mostly done |
| `loyalty` repository extraction | 4 | 4 | 3 | 3 | Ownership model remains deferred, so avoid policy changes |
| `sales` | 4 | 4 | unknown | 2 | Needs separate inspection because it overlaps POS/checkout concepts |

## Recommended Next Batch

Recommended next module: `orders`.

Rationale:

- It is operationally important but narrower than POS, returns, inventory, and transfers.
- It already has strong Phase 2/3 focused tests for RBAC and object-level store checks.
- It contains direct Prisma reads, transactions, status changes, receive-stock flow, and catalog cache invalidation, making it a useful bridge toward the harder inventory/transfer modules.
- Refactoring `orders` first should establish patterns for purchase/inventory-adjacent transactions before touching inventory receive/adjust and transfer dispatch/receive/cancel.

Recommended Phase 4g structure:

- `orders.router.ts`: route paths, `authenticateToken`, route-level store-scope/RBAC middleware, controller calls only.
- `orders.controller.ts`: parse params/body/query and preserve status/body mapping.
- `orders.service.ts`: list/detail/create/status/delete/receive orchestration, object-store checks, cache invalidation decisions.
- `orders.repository.ts`: Prisma purchase order/item/receipt queries and transactions.

Target tests:

```bash
npm test -- --runTestsByPath tests/orders.rbac.test.ts --runInBand --forceExit
npm exec -- eslint src/modules/orders/orders.router.ts src/modules/orders/orders.controller.ts src/modules/orders/orders.service.ts src/modules/orders/orders.repository.ts tests/orders.rbac.test.ts
```

## Suggested Remaining Phase 4 Sequence

1. `orders`
2. `inventory`, split into read/lookup routes first, then receive/adjust
3. `transfers`, split list/detail/create first, then dispatch/receive/cancel
4. `returns`, split read/invoice lookup first, then standard return, then manager refund
5. `pos`, split shifts/cash movement first, then receipt/inventory lookup, then checkout/hold/resume/refund
6. smaller cleanup pass for `reports`, `pricing` repository, `loyalty` repository, `auth` boundary/audit planning

## Midpoint Conclusion

Phase 4 is on track.

The completed modules now align materially better with the SAD/ADD architecture target:

```text
router -> controller -> service -> repository -> Prisma
```

The highest-risk router-heavy modules remain, but the completed Phase 4 batches have established repeatable patterns for:

- keeping routers thin
- preserving middleware and RBAC/store-scope behavior
- moving Prisma access into repositories
- keeping response mapping in controllers
- preserving audit and cache behavior without shared global abstractions

Proceeding to `orders` next is the safest high-value continuation.
