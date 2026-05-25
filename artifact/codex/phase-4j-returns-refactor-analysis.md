# Phase 4j Returns Refactor Analysis

## Scope

Module: `backend/src/modules/returns`

Files inspected:
- `backend/src/modules/returns/returns.router.ts`
- `backend/tests/returns.rbac.test.ts`

Goal: refactor the returns module into router/controller/service/repository boundaries without changing Phase 3 behavior.

## Current Structure

`returns.router.ts` is router-heavy. It currently owns:
- route paths and middleware
- RBAC role constants
- request parsing and validation
- Prisma read queries
- standard return transaction
- legacy manager refund transaction
- stable sentinel-based error contracts
- transaction-bound audit log creation/update
- `getOpenShiftId`
- audit payload construction
- safe return snapshot helpers
- return number generation

The module has no existing controller/service/repository split.

## Route Groups

| Route | Category | Current Middleware | Current Response Shape |
|---|---|---|---|
| `GET /returns/invoices` | invoice lookup list | `authenticateToken`, `requireActiveStore`, `authorizeRoles(invoiceLookupRoles)` | `{ items, total, take, skip }` |
| `GET /returns/invoices/:id` | invoice lookup detail | `authenticateToken`, `requireActiveStore`, `authorizeRoles(invoiceLookupRoles)` | `{ invoice, items }` |
| `POST /returns` | standard return creation | `authenticateToken`, `requireActiveStore`, `authorizeRoles(returnCreateRoles)` | `201` transaction result: `{ return, returnNumber, totalRefund, restock }` |
| `GET /returns` | return history list | `authenticateToken`, `requireActiveStore`, `authorizeRoles(returnReadRoles)` | `{ items, total, take, skip }` |
| `GET /returns/:id` | return detail | `authenticateToken`, `requireActiveStore`, `authorizeRoles(returnReadRoles)` | `{ return: item }` |
| `POST /returns/refund` | legacy manager refund | `authenticateToken`, `requireActiveStore`, `authorizeRoles(managerRefundRoles)` | `201 { refund: refundResult }` |

Route paths and middleware order should remain exactly as-is.

## Transaction Boundaries

### `POST /returns`

Single transaction via `prisma.$transaction`.

Inside the transaction:
- loads invoice with `invoice_items` and `customers`
- verifies invoice exists and belongs to active store
- loads requested invoice items
- verifies all requested items belong to the invoice
- groups prior non-cancelled returns by invoice item
- validates remaining quantities
- enforces large-refund role policy
- preloads inventory when `restock === true`
- creates `returns`
- creates `return_items`
- increments inventory and creates `stock_movements` when restocking
- optionally creates `cash_movements` for cash refunds
- creates transaction-bound `audit_logs` row with action `RETURN_CREATED`
- fetches full return including return items, invoice, customer, and user

Important: audit creation is inside the same transaction and must remain transaction-bound.

### `POST /returns/refund`

Single transaction via `prisma.$transaction`.

Inside the transaction:
- loads invoice items
- validates all items exist and belong to the same invoice
- loads invoice
- verifies invoice belongs to active store
- validates variant and quantity
- verifies inventory exists
- creates transaction-bound `audit_logs` row first with action `MANAGER_REFUND_CREATED`
- updates inventory
- creates refund `stock_movements`
- sets `stock_movements.reference_id = audit:<id>`
- pushes created stock movement IDs into the existing audit payload metadata
- updates the same audit log payload
- returns `{ invoiceId, totalRefund, auditLogId }`

Critical compatibility requirement: `refund.auditLogId` and `stock_movements.reference_id = audit:<id>` must remain unchanged.

## Sentinel/Error Contracts To Preserve

Phase 3c hardened known domain/security failures to stable 4xx responses.

### `POST /returns`

Preserve:
- missing invoice/items input: `400 { error: 'invoiceId and non-empty items are required' }`
- invalid decimal parsing: `400 { error: 'Invalid items payload' }`
- parsed item mismatch: `400 { error: 'Invalid items payload' }`
- invoice not found: `404 { error: 'Invoice not found' }`
- invoice store mismatch: `403 { error: 'Invoice does not belong to this store' }`
- invoice item not found: `404 { error: 'One or more invoice items not found' }`
- item belongs to different invoice: `400 { error: 'All items must belong to the same invoice' }`
- missing `variant_id`: `409 { error: 'Invoice item X missing variant_id' }`
- fully returned item: `409 { error: 'Invoice item X already fully returned' }`
- quantity exceeds remaining: `409 { error: 'Return quantity exceeds remaining for invoice item X' }`
- large refund by non-manager/admin: `403 { error: 'Large refund requires manager/admin approval' }`
- missing inventory: `409 { error: 'Inventory not found for variant X' }`

Current implementation uses route-local sentinel objects:
`{ __error: true, status, body: { error } }`

That shape can be moved to service/repository but should not be changed externally.

### `POST /returns/refund`

Preserve:
- missing required fields: `400 { error: 'Missing required fields' }`
- invalid items: `400 { error: 'Invalid items' }`
- invoice item not found: `404 { error: 'One or more invoice items not found' }`
- items from multiple invoices: `400 { error: 'Refund items must belong to the same invoice' }`
- invoice not found: `404 { error: 'Invoice not found' }`
- invoice store mismatch: `403 { error: 'Invoice does not belong to this store' }`
- missing `variant_id`: `409 { error: 'Invoice item X missing variant_id' }`
- quantity exceeds sold: `409 { error: 'Refund quantity exceeds sold quantity for invoice item X' }`
- missing inventory: `409 { error: 'Inventory not found for variant X' }`

Unknown exceptions should continue to flow to the existing Express error handler.

## Audit Behavior To Preserve

### `RETURN_CREATED`

Current behavior:
- transaction-bound via `tx.audit_logs.create`
- action: `RETURN_CREATED`
- object type: `return`
- object id: created return id as string
- user id: JWT `userId`, falling back to current created-by behavior only if needed
- payload includes:
  - `result`
  - `source`
  - `storeId`
  - `invoiceId`
  - `returnId`
  - `returnNumber`
  - `after` safe return snapshot
  - metadata for refund method, restock, totals, item IDs, variant IDs, quantities, return item IDs, stock movement IDs, cash movement flags, capped reason preview, and note presence

Must not log:
- full request body
- auth headers
- token/password/secret-like fields
- customer PII
- full invoice/receipt payloads
- unrestricted notes/reasons

### `MANAGER_REFUND_CREATED`

Current behavior:
- transaction-bound via `tx.audit_logs.create`
- same audit row is updated after stock movements are created
- action: `MANAGER_REFUND_CREATED`
- object type: `invoice`
- object id: invoice id as string
- response includes `refund.auditLogId`
- stock movements use `reference_id: audit:<auditLogId>`
- payload metadata includes `stockMovementIds` after audit update

Do not convert this to best-effort logging. It is part of the business record linkage.

## Recommended Split

### `returns.router.ts`

Keep only:
- `Router`
- `router.use(authenticateToken)`
- `router.use(requireActiveStore)`
- role constants
- route declarations
- middleware order
- controller method calls

No Prisma calls, audit helper code, or transaction logic should remain in the router.

### `returns.controller.ts`

Own:
- reading `req.params`, `req.query`, `req.body`
- reading `req.activeStoreId`
- deriving actor from `req.user`
- building HTTP audit source from `req.ip` and `req.get('user-agent')`
- mapping service result tags to response statuses/bodies
- preserving all route response shapes

Recommended controller methods:
- `listInvoices`
- `getInvoiceForReturn`
- `createReturn`
- `listReturns`
- `getReturnDetail`
- `createManagerRefund`

### `returns.service.ts`

Own:
- `toDecimal`
- `generateReturnNumber`
- parsing and validating return/refund item payloads
- role-based large-refund policy
- sentinel result construction/typing
- orchestration around repository calls
- safe audit payload construction
- `safeReturnSnapshot`
- `toAuditScalar`

For `POST /returns` and `POST /returns/refund`, the service should call repository transaction methods and then return the same success/sentinel shape the router currently maps.

### `returns.repository.ts`

Own:
- Prisma invoice lookup/list queries
- Prisma return list/detail queries
- `getOpenShiftId`
- standard return transaction
- legacy manager refund transaction
- all `tx.*` mutation/query calls for return/refund workflows

The transaction methods should accept already-parsed values plus audit source/payload fragments where needed. Because audit rows are transaction-bound, repository methods should either:
- receive fully assembled safe payload data from the service, or
- receive a small audit context and build only transaction-derived fields internally.

Recommended pragmatic split for speed:
- service parses, validates early input, generates `returnNumber`, and passes `auditSource`
- repository transaction performs domain validations that depend on DB data and creates/updates transaction-bound audit rows
- repository returns either a sentinel or success data

This keeps transaction ordering stable and avoids accidentally moving audit writes outside the transaction.

## Implementation Order

1. Add `returns.repository.ts` with read/list helpers only:
   - invoice list
   - invoice detail
   - return list
   - return detail

2. Add `returns.service.ts` for read/list orchestration:
   - preserve date validation and pagination behavior in controller/service
   - preserve store filters
   - preserve return detail `404` behavior for missing/cross-store rows

3. Add `returns.controller.ts` for read/list routes and make those router routes thin first.

4. Move `POST /returns/refund` next, before standard returns:
   - smaller transaction than standard return
   - must preserve `auditLogId` and `reference_id = audit:<id>`
   - tests strongly assert this linkage

5. Move `POST /returns` last:
   - highest complexity
   - includes return item creation, optional restock, optional cash movement, transaction-bound audit row, and full return fetch

6. After each step, run `tests/returns.rbac.test.ts` to catch behavior drift early.

## Test Plan

Run targeted tests:

```bash
npm test -- --runTestsByPath tests/returns.rbac.test.ts --runInBand --forceExit
npm exec -- eslint src/modules/returns/returns.router.ts src/modules/returns/returns.controller.ts src/modules/returns/returns.service.ts src/modules/returns/returns.repository.ts tests/returns.rbac.test.ts
```

Existing tests cover:
- unauthenticated access returns `401`
- cashier invoice lookup/list/create behavior
- inventory staff RBAC rejection
- manager refund RBAC
- standard return sentinel errors
- legacy manager refund sentinel errors
- transaction-bound `RETURN_CREATED`
- transaction-bound `MANAGER_REFUND_CREATED`
- no duplicate audit rows for covered paths
- `refund.auditLogId`
- `stock_movements.reference_id = audit:<id>`
- sensitive field exclusions from audit payloads

Additional tests are not required for a behavior-preserving refactor unless extraction creates uncovered branches.

## Risks

High-risk areas:
- moving `tx.audit_logs.create` outside the standard return transaction
- moving or removing the legacy refund audit update that adds stock movement IDs
- breaking `stock_movements.reference_id = audit:<id>`
- changing sentinel 4xx responses into thrown errors
- changing `POST /returns` success shape
- changing `POST /returns/refund` success shape
- changing cash refund shift lookup timing
- logging full request bodies or sensitive fields

Mitigation:
- move code in-place rather than rewrite
- preserve sentinel result names and bodies internally during first extraction
- keep transaction bodies nearly identical in repository methods
- keep audit writes transaction-bound for both return mutation routes
- run focused returns tests after each extraction step

## Recommendation

Proceed with Phase 4j implementation, but treat it as a high-risk refactor batch. The safest first implementation target is to extract read/list routes and helpers, then move `POST /returns/refund`, and move `POST /returns` last.

Phase 4j can be completed without changing route paths, request/response shapes, Prisma schema, error contracts, audit behavior, or return/refund business logic if transaction bodies are moved conservatively.
