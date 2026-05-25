# Phase 4 Fast Backend Architecture Refactor Plan

Date: 2026-05-24

## Scope

This is a planning-only report for Phase 4 backend architecture refactor after Phase 3 closure.

No application code, route paths, request/response shapes, middleware behavior, business logic, or Prisma schema were changed by this plan.

## Inputs Reviewed

Project and architecture sources:

- `AGENTS.md`
- `PLANS.md` because `plan.md` was not present in the repo
- `README_Codex_Refactor_Pack.md`
- `artifact/design/ADD.md`
- `artifact/design/SAD.md`
- `artifact/asr/ASR.md`
- `artifact/srs/SRS.md`
- `artifact/brd/BRD.md`
- `artifact/codex/*`

Current backend state inspected:

- `backend/src/routes/index.ts`
- `backend/src/modules/*`
- `backend/tests/*.test.ts`
- `backend/package.json`

Phase 3 locked compatibility requirements:

- route-level auth/RBAC/store-scope
- object-level store integrity checks
- refund/return stable 4xx error contracts
- invoice/receipt store checks
- audit logging actions, timing, payload safety, and transaction-bound refund behavior
- ownership model implementation remains deferred

## Target Architecture

SAD/ADD and `artifact/codex/module-map.md` target a modular monolith with clear domain boundaries:

```text
routes -> controllers -> services -> repositories -> Prisma/PostgreSQL
services -> audit_logs / cache / queue / socket through explicit helpers
```

The current repo already has the correct high-level backend shape:

- Express + TypeScript
- `/api/v1` route registry
- Prisma/PostgreSQL
- Redis cache/queue infrastructure
- Socket.IO infrastructure
- domain folders under `backend/src/modules`
- focused Jest tests for key route groups

The main Phase 4 gap is internal module structure: many routers still own validation, database access, transactions, audit payload construction, and response mapping.

## Current Router Heaviness

Router line counts from `backend/src/modules`:

| Rank | Router | Lines | Current risk |
|---:|---|---:|---|
| 1 | `pos/pos.router.ts` | 1101 | Very high: checkout, refund, shift, receipt, hold/resume, transactions, audit |
| 2 | `transfers/transfers.router.ts` | 751 | High: cross-store transactions, reserved stock, stock movements, audit |
| 3 | `returns/returns.router.ts` | 722 | Very high: returns/refunds, transaction-bound audit, cash/stock effects |
| 4 | `orders/orders.router.ts` | 604 | High: purchase order lifecycle, receive stock, status/delete integrity |
| 5 | `inventory/inventory.router.ts` | 597 | High: receive/adjust, stock movements, cache invalidation, audit |
| 6 | `products/products.router.ts` | 571 | Medium-high: catalog, product CRUD, variant pricing, cache/audit |
| 7 | `stores/stores.router.ts` | 399 | Medium: direct Prisma and audit; low transaction complexity |
| 8 | `complaints/complaints.router.ts` | 320 | Medium: store checks, status/delete audit, service exists |
| 9 | `users/users.router.ts` | 249 | Medium-high: security-critical, service exists, audit exists |
| 10 | `promotions/promotions.router.ts` | 204 | Medium: promotion CRUD/validate, service exists, audit exists |
| 11 | `invoices/invoices.router.ts` | 177 | Medium: transaction history, strict store checks |
| 12 | `reports/reports.router.ts` | 95 | Low: read-only dashboard endpoints, service exists |

Already closer to target:

- `settings`: router/controller/service/repository present.
- `categories`: router/controller/service/repository present, mutations unsupported by design.
- `suppliers`: router/controller/service/repository present.
- `audit_logs`: router/controller/service/repository present.
- `pricing`: router/controller/service present, still missing repository.
- `loyalty`: router/controller/service present.

## Candidate Ranking

Scoring: 5 is highest. For risk, 5 means highest implementation risk. For speed, 5 means fastest expected implementation.

| Candidate | SAD/ADD importance | Router complexity | Business/transaction risk | Test coverage | Speed | Recommended order |
|---|---:|---:|---:|---:|---:|---:|
| `stores` | 5 | 3 | 2 | 4 | 5 | 1 |
| `promotions` | 4 | 2 | 2 | 4 | 5 | 2 |
| `users` | 5 | 2 | 3 | 4 | 4 | 3 |
| `complaints` | 4 | 3 | 3 | 5 | 4 | 4 |
| `invoices` | 4 | 2 | 2 | 4 | 4 | 5 |
| `products` | 5 | 4 | 3 | 4 | 3 | 6 |
| `orders` | 4 | 4 | 4 | 5 | 3 | 7 |
| `inventory` | 5 | 4 | 5 | 4 | 2 | 8 |
| `transfers` | 5 | 5 | 5 | 5 | 2 | 9 |
| `returns` | 5 | 5 | 5 | 5 | 1 | 10 |
| `pos` | 5 | 5 | 5 | 5 | 1 | 11 |

Fastest safe sequence:

1. Start with medium-complexity, high-value modules that have tests and low transaction risk.
2. Move to large read/write modules after helper patterns are proven.
3. Split high-risk transaction modules into sub-batches instead of one big move.

## Phase 4 Batches

### Phase 4a: Stores Module Boundary

Target module: `stores`

Why first:

- High SAD/ADD importance: store scope affects all operational modules.
- Router is large enough to benefit from extraction.
- Business logic is simpler than POS/inventory/returns.
- Focused tests exist in `backend/tests/stores.test.ts`.
- Existing Phase 3 audit behavior is locked and test-covered.

Files to create/change:

- Create `backend/src/modules/stores/stores.controller.ts`
- Create `backend/src/modules/stores/stores.repository.ts`
- Update `backend/src/modules/stores/stores.service.ts`
- Update `backend/src/modules/stores/stores.router.ts`
- Update `backend/tests/stores.test.ts` only if mocks need boundary adjustment

Target boundaries:

- Router:
  - paths only
  - `authenticateToken`
  - `authorizeRoles(readStoreRoles/writeStoreRoles)`
  - controller calls
- Controller:
  - parse query/params/body
  - preserve exact response shapes
  - call service
  - own request-scoped audit source if audit remains HTTP-specific
- Service:
  - build list filters
  - build generated store code
  - orchestrate create/update/deactivate
  - build safe audit payloads or delegate to a helper without changing fields
- Repository:
  - Prisma store queries
  - stats queries for overview/list

Behavior to preserve:

- `GET /stores`
- `GET /stores/:id`
- `GET /stores/:id/overview`
- `POST /stores`
- `PUT /stores/:id`
- `DELETE /stores/:id`
- existing auth/RBAC
- response shapes: `{ items, total, take, skip }`, `{ store }`, overview payload, create/update/delete `{ store }`
- audit actions: `STORE_CREATED`, `STORE_UPDATED`, `STORE_DEACTIVATED`
- sensitive field exclusions

Tests to run:

- `npm test -- --runTestsByPath tests/stores.test.ts --runInBand --forceExit`
- `npm exec -- eslint src/modules/stores/stores.router.ts src/modules/stores/stores.controller.ts src/modules/stores/stores.service.ts src/modules/stores/stores.repository.ts tests/stores.test.ts`

Risk: Medium-low.

Expected complexity: Fast, 1 focused implementation batch.

### Phase 4b: Promotions Module Boundary

Target module: `promotions`

Why next:

- SAD/ADD calls out promotion management as isolated business-rule module.
- Router contains audit helpers and CRUD handling but business logic already lives in service.
- Tests exist in `backend/tests/promotions.test.ts`.
- Low transaction risk.

Files to create/change:

- Create `backend/src/modules/promotions/promotions.controller.ts`
- Create `backend/src/modules/promotions/promotions.repository.ts`
- Update `backend/src/modules/promotions/promotions.service.ts`
- Update `backend/src/modules/promotions/promotions.router.ts`
- Adjust `backend/tests/promotions.test.ts` if mocks need to move from service to repository/controller

Target boundaries:

- Router: route path + auth/RBAC + controller call only.
- Controller: HTTP validation, status codes, response shapes, audit source.
- Service: promotion validation and business rules.
- Repository: Prisma `promotions` access.

Behavior to preserve:

- all `/api/v1/promotions` routes
- write/read/validate RBAC
- create/update/delete audit actions and payload behavior
- validate required-field response `{ error: 'Code and orderTotal are required' }`
- existing error status behavior: CRUD validation errors currently return 400, detail missing returns 404

Tests to run:

- `npm test -- --runTestsByPath tests/promotions.test.ts --runInBand --forceExit`
- targeted ESLint for promotions files and test

Risk: Low-medium.

Expected complexity: Fast.

### Phase 4c: Users Module Boundary

Target module: `users`

Why third:

- Security-critical in SAD/ASR.
- Existing service exists, but router owns audit orchestration and response handling.
- Good test coverage in `backend/tests/users.test.ts`.
- Refactor should be structural only; no auth/role policy change.

Files to create/change:

- Create `backend/src/modules/users/users.controller.ts`
- Create `backend/src/modules/users/users.repository.ts`
- Update `backend/src/modules/users/users.service.ts`
- Update `backend/src/modules/users/users.router.ts`
- Adjust `backend/tests/users.test.ts`

Target boundaries:

- Router: `authenticateToken`, `authorizeRoles(['ADMIN'])`, paths, controller calls.
- Controller: request parsing, response shapes, audit source.
- Service: user create/update/deactivate/store assignment orchestration.
- Repository: Prisma user/user_store/role queries.

Behavior to preserve:

- all `/api/v1/users` public routes
- ADMIN-only RBAC
- audit actions:
  - `USER_CREATED`
  - `USER_UPDATED`
  - `USER_STORE_ASSIGNMENTS_UPDATED`
  - `USER_DEACTIVATED`
- password/password_hash exclusion from audit payloads
- existing response shapes and validation behavior

Tests to run:

- `npm test -- --runTestsByPath tests/users.test.ts --runInBand --forceExit`
- targeted ESLint for users files and test

Risk: Medium.

Expected complexity: Moderate.

### Phase 4d: Complaints Module Boundary

Target module: `complaints`

Why now:

- Complaint governance is covered by Phase 3 store checks and audit tests.
- Service exists, but router owns RBAC-aware store checks and audit payloads.
- Good regression coverage in `backend/tests/complaints.rbac.test.ts`.

Files to create/change:

- Create `backend/src/modules/complaints/complaints.controller.ts`
- Create `backend/src/modules/complaints/complaints.repository.ts` if service currently accesses Prisma directly
- Update `backend/src/modules/complaints/complaints.service.ts`
- Update `backend/src/modules/complaints/complaints.router.ts`
- Adjust `backend/tests/complaints.rbac.test.ts`

Target boundaries:

- Router: middleware and controller calls.
- Controller: HTTP query/body handling, store check decisions, response shapes.
- Service: complaint list/get/create/update/remove.
- Repository: Prisma complaint data access.

Behavior to preserve:

- all `/api/v1/complaints` routes
- `/complaints/my` still uses `employeeName` plus non-admin active-store filtering
- strict non-admin store policy on detail/status/delete
- no true ownership enforcement yet
- audit actions:
  - `COMPLAINT_STATUS_UPDATED`
  - `COMPLAINT_DELETED`

Tests to run:

- `npm test -- --runTestsByPath tests/complaints.rbac.test.ts --runInBand --forceExit`
- targeted ESLint

Risk: Medium.

Expected complexity: Moderate.

### Phase 4e: Invoices Module Boundary

Target module: `invoices` or future `transactions`

Why:

- SAD/ADD target has a `transactions` module; current implementation uses `invoices`.
- Keep route group `/invoices` for compatibility.
- Small router but security-sensitive.
- Good test coverage in `backend/tests/invoices.rbac.test.ts`.

Files to create/change:

- Create `backend/src/modules/invoices/invoices.controller.ts`
- Create `backend/src/modules/invoices/invoices.service.ts`
- Create `backend/src/modules/invoices/invoices.repository.ts`
- Update `backend/src/modules/invoices/invoices.router.ts`
- Adjust `backend/tests/invoices.rbac.test.ts`

Target boundaries:

- Router: middleware and controller calls.
- Controller: param/query parsing and response shape.
- Service: list/detail orchestration and strict store visibility policy.
- Repository: Prisma invoice queries.

Behavior to preserve:

- `GET /api/v1/invoices`
- `GET /api/v1/invoices/:id`
- `requireActiveStoreUnlessAdmin`
- invoice read RBAC
- strict non-admin store check
- ADMIN bypass for general invoice detail
- success shape `{ order, items }`

Tests to run:

- `npm test -- --runTestsByPath tests/invoices.rbac.test.ts --runInBand --forceExit`
- targeted ESLint

Risk: Medium-low.

Expected complexity: Fast.

### Phase 4f: Products Module Split

Target module: `products`

Why:

- SAD/ADD high importance for product catalog and POS performance.
- Current router has product CRUD, catalog cache, and variant pricing in one file.
- Tests exist for RBAC, catalog cache, and variant-price cache invalidation.

Files to create/change:

- Create `backend/src/modules/products/products.controller.ts`
- Create `backend/src/modules/products/products.service.ts`
- Create `backend/src/modules/products/products.repository.ts`
- Optionally create `backend/src/modules/products/variant-prices.service.ts` only if it reduces complexity without changing behavior
- Update `backend/src/modules/products/products.router.ts`
- Adjust:
  - `backend/tests/products.rbac.test.ts`
  - `backend/tests/catalog.invalidate.test.ts`
  - `backend/tests/products.catalog.cache.test.ts`

Target boundaries:

- Router: route definitions, auth/RBAC/store-scope/cache middleware, controller calls.
- Controller: response shapes and request parsing.
- Service: product/variant/price orchestration, cache invalidation decisions, audit payloads.
- Repository: Prisma product, variant, variant price queries.

Behavior to preserve:

- product read/write RBAC from Phase 2g
- catalog allows cashier
- variant price routes keep `requireActiveStore`
- `VARIANT_PRICE_SET` and `VARIANT_PRICE_CLOSED`
- catalog cache invalidation behavior
- response shapes: `{ price }`, product list/detail/create/update shapes

Tests to run:

- `npm test -- --runTestsByPath tests/products.rbac.test.ts tests/catalog.invalidate.test.ts tests/products.catalog.cache.test.ts --runInBand --forceExit`
- targeted ESLint

Risk: Medium-high.

Expected complexity: Moderate.

### Phase 4g: Orders Module Boundary

Target module: `orders`

Why:

- Purchase orders are procurement/inventory-adjacent and router-heavy.
- Phase 3a added object-store checks for detail/delete/status.
- Tests are strong in `backend/tests/orders.rbac.test.ts`.

Files to create/change:

- Create `backend/src/modules/orders/orders.controller.ts`
- Create `backend/src/modules/orders/orders.service.ts`
- Create `backend/src/modules/orders/orders.repository.ts`
- Update `backend/src/modules/orders/orders.router.ts`
- Adjust `backend/tests/orders.rbac.test.ts`

Target boundaries:

- Router: middleware/path/controller only.
- Controller: HTTP parsing and response mapping.
- Service: purchase order lifecycle, status/delete/receive business orchestration, object-store policy.
- Repository: Prisma purchase order/item/receipt queries and transactions.

Behavior to preserve:

- all `/api/v1/orders` routes
- Phase 2n RBAC
- Phase 3a object-store checks for detail/delete/status
- existing receive behavior and stock movement behavior
- audit behavior if present or existing absence if not covered
- existing response shapes and error contracts

Tests to run:

- `npm test -- --runTestsByPath tests/orders.rbac.test.ts --runInBand --forceExit`
- targeted ESLint

Risk: Medium-high.

Expected complexity: Moderate-high.

### Phase 4h: Inventory Module Boundary

Target module: `inventory`

Why:

- SAD/ADD high importance: stock integrity, low-stock, near-real-time sync.
- Current router contains receive/adjust transactions, stock movement creation, cache invalidation, audit logging.
- Good focused tests exist.

Files to create/change:

- Create `backend/src/modules/inventory/inventory.controller.ts`
- Create `backend/src/modules/inventory/inventory.service.ts`
- Create `backend/src/modules/inventory/inventory.repository.ts`
- Update `backend/src/modules/inventory/inventory.router.ts`
- Adjust `backend/tests/inventory.rbac.test.ts`

Target boundaries:

- Router: middleware/path/controller only.
- Controller: request/response mapping.
- Service: stock receive/adjust/list/lookup orchestration, audit payloads, cache invalidation calls.
- Repository: Prisma inventory/lot/movement queries and transactions.

Behavior to preserve:

- all `/api/v1/inventory` routes
- Phase 2h RBAC/store-scope
- legacy store mismatch checks
- `INVENTORY_RECEIVED` and `INVENTORY_ADJUSTED`
- catalog cache invalidation after successful mutation
- success response shapes

Tests to run:

- `npm test -- --runTestsByPath tests/inventory.rbac.test.ts --runInBand --forceExit`
- targeted ESLint

Risk: High.

Expected complexity: High; split into read routes first, then receive/adjust.

### Phase 4i: Transfers Module Boundary

Target module: `transfers`

Why:

- SAD/ADD high importance for inter-store transfer integrity.
- Current router is very large and transaction-heavy.
- Strong tests exist for RBAC, object-store checks, audit logging.

Files to create/change:

- Create `backend/src/modules/transfers/transfers.controller.ts`
- Create `backend/src/modules/transfers/transfers.service.ts`
- Create `backend/src/modules/transfers/transfers.repository.ts`
- Update `backend/src/modules/transfers/transfers.router.ts`
- Adjust `backend/tests/transfers.rbac.test.ts`

Target boundaries:

- Router: middleware/path/controller only.
- Controller: request parsing and response mapping.
- Service: list/detail/create/dispatch/receive/cancel orchestration, object-store policy, audit payloads.
- Repository: Prisma transfer/inventory/stock movement transactions.

Behavior to preserve:

- all `/api/v1/transfers` routes
- Phase 2i RBAC/store-scope
- Phase 3a/3b source/destination active-store checks
- transfer status validation
- reserved stock behavior
- stock movement behavior
- `TRANSFER_CREATED`, `TRANSFER_DISPATCHED`, `TRANSFER_RECEIVED`, `TRANSFER_CANCELLED`

Tests to run:

- `npm test -- --runTestsByPath tests/transfers.rbac.test.ts --runInBand --forceExit`
- targeted ESLint

Risk: High.

Expected complexity: High; split into read/create first, then dispatch/receive/cancel.

### Phase 4j: Returns Module Boundary

Target module: `returns`

Why:

- High business risk: returns affect cash, inventory, invoices, audit.
- Current router has hardened error contracts and transaction-bound audit behavior.
- Refactor only after simpler transaction module patterns are proven.

Files to create/change:

- Create `backend/src/modules/returns/returns.controller.ts`
- Create `backend/src/modules/returns/returns.service.ts`
- Create `backend/src/modules/returns/returns.repository.ts`
- Update `backend/src/modules/returns/returns.router.ts`
- Adjust `backend/tests/returns.rbac.test.ts`

Target boundaries:

- Router: middleware/path/controller only.
- Controller: HTTP validation and response mapping.
- Service: invoice lookup, standard return, manager refund orchestration.
- Repository: Prisma return/refund/invoice/inventory/cash movement transaction helpers.

Behavior to preserve:

- all `/api/v1/returns` routes
- Phase 2l RBAC/store-scope
- Phase 3c stable 4xx error contracts
- transaction-bound `RETURN_CREATED`
- transaction-bound `MANAGER_REFUND_CREATED`
- `refund.auditLogId`
- `stock_movements.reference_id = audit:<id>`
- success response shapes

Tests to run:

- `npm test -- --runTestsByPath tests/returns.rbac.test.ts --runInBand --forceExit`
- targeted ESLint

Risk: Very high.

Expected complexity: High; split into read/invoice lookup first, then `POST /returns`, then `POST /returns/refund`.

### Phase 4k: POS Module Boundary

Target module: `pos`

Why last:

- Largest and most critical router.
- Contains checkout, hold/resume, refund, receipt, shifts, cash movements, inventory lookup.
- Phase 3 added store integrity, error contracts, and audit behavior that must remain locked.

Files to create/change:

- Create `backend/src/modules/pos/pos.controller.ts`
- Create `backend/src/modules/pos/pos.service.ts`
- Create `backend/src/modules/pos/pos.repository.ts`
- Optional split services:
  - `pos.shift.service.ts`
  - `pos.checkout.service.ts`
  - `pos.refund.service.ts`
  - only if done incrementally without changing behavior
- Update `backend/src/modules/pos/pos.router.ts`
- Adjust `backend/tests/pos.rbac.test.ts`

Target boundaries:

- Router: middleware/path/controller only.
- Controller: request parsing and response mapping.
- Service: checkout/hold/resume/refund/shift/cash orchestration.
- Repository: Prisma invoice/shift/cash/inventory transaction helpers.

Behavior to preserve:

- all `/api/v1/pos` routes
- Phase 2m RBAC/store-scope
- Phase 3a resume checkout active-store check
- Phase 3c refund error contract
- Phase 3d receipt strict store check
- audit actions:
  - `POS_REFUND_CREATED`
  - `SHIFT_CLOSED`
  - `CASH_MOVEMENT_CREATED`
  - `POS_CHECKOUT_COMPLETED`
- success response shapes

Tests to run:

- `npm test -- --runTestsByPath tests/pos.rbac.test.ts --runInBand --forceExit`
- targeted ESLint

Risk: Very high.

Expected complexity: Very high; split by route category.

## First Implementation Batch Recommendation

Start with Phase 4a: `stores`.

Rationale:

- It is architecturally important because store records and scope are central to SAD/ADD.
- It has meaningful router heaviness but lower transaction risk than POS/inventory/returns/transfers.
- It has focused tests for RBAC, response shape, audit logging, and sensitive field exclusions.
- It allows the team to establish a clean extraction pattern for audit-aware controllers/services/repositories before touching transaction-heavy modules.

Recommended Phase 4a implementation rule:

- Move code, do not rewrite behavior.
- Keep `stores.router.ts` path/middleware declarations only.
- Preserve existing audit helper behavior exactly, including best-effort semantics.
- Avoid introducing shared abstractions in the first batch unless they are purely local to `stores`.

## Phase 4 Guardrails

Hard rules for all batches:

- Do not change public route paths.
- Do not change request or response shapes.
- Do not change middleware order unless the batch explicitly identifies a required preservation fix.
- Do not change Prisma schema.
- Do not change business logic.
- Preserve all Phase 2 and Phase 3 security behavior.
- Preserve audit action names, object types, object ids, payload safety, and write timing.
- Preserve transaction boundaries and rollback behavior.
- Run only targeted tests/lint for the touched module unless explicitly asked otherwise.

## Recommended Verification Pattern

For each implementation batch:

1. Capture current route list for the target router.
2. Move one route category at a time if the module is large.
3. Run the target test file after each meaningful extraction.
4. Run targeted ESLint on changed module files and tests.
5. Compare `git diff` for route path/middleware changes before final response.

General command template:

```bash
cd backend
npm test -- --runTestsByPath tests/<module>.test.ts --runInBand --forceExit
npm exec -- eslint src/modules/<module>/*.ts tests/<module>.test.ts
```

Use actual test names for each module, such as:

- `tests/stores.test.ts`
- `tests/promotions.test.ts`
- `tests/users.test.ts`
- `tests/complaints.rbac.test.ts`
- `tests/invoices.rbac.test.ts`
- `tests/products.rbac.test.ts`
- `tests/catalog.invalidate.test.ts`
- `tests/inventory.rbac.test.ts`
- `tests/transfers.rbac.test.ts`
- `tests/returns.rbac.test.ts`
- `tests/pos.rbac.test.ts`

## Phase 4 Completion Criteria

Phase 4 should be considered successful when:

- high-priority router-heavy modules have controller/service/repository boundaries or an explicit reason not to split further
- routers are thin and mainly own paths/middleware
- Phase 3 security/audit behavior remains test-verified
- direct Prisma access in routers is reduced significantly
- transaction-heavy business logic is isolated in services/repositories without behavior changes
- target module map alignment is improved without introducing new frameworks or API migrations

