# Phase 3a Object-Store Integrity Audit v2

Date: 2026-05-24

Scope:
- `POST /api/v1/pos/resume/:id/checkout`
- `GET /api/v1/orders/:id`
- `DELETE /api/v1/orders/:id`
- `POST /api/v1/orders/:id/status`
- `POST /api/v1/transfers/:id/dispatch`
- `POST /api/v1/transfers/:id/receive`
- `POST /api/v1/transfers/:id/cancel`

This v2 audit re-checks Phase 3a after adding the object-level store integrity check to `POST /api/v1/orders/:id/status`. No application code was modified during this audit.

## Summary

Phase 3a can be considered complete for the audited high-priority routes. All seven routes have route-level authentication, RBAC, store-scope middleware, object loading before response or mutation, and object-level active-store checks where needed.

`ADMIN` behavior is preserved:
- POS resume checkout does not bypass active-store comparison because the POS router requires an active store for all roles.
- Orders and transfer routes use `requireActiveStoreUnlessAdmin`; `ADMIN` bypasses object-store comparison and retains chain-wide access.

## Route Matrix

| Route | Route-level auth/RBAC/store-scope | Object loaded before response/mutation | Object-level check | ADMIN behavior | Path/success shape |
|---|---|---|---|---|---|
| `POST /api/v1/pos/resume/:id/checkout` | `router.use(authenticateToken)`, `router.use(requireActiveStore)`, `authorizeRoles(posOperationalRoles)` | Held invoice via `tx.invoices.findUnique({ where: { id }, include: { invoice_items: true } })` | Compares `invoice.store_id` to `req.activeStoreId`; mismatch returns `403 { error: 'Forbidden: invoice does not belong to active store' }` | No bypass; POS requires active store for all roles | Path unchanged; success remains `{ invoice }` |
| `GET /api/v1/orders/:id` | `router.use(authenticateToken)`, `requireActiveStoreUnlessAdmin`, `authorizeRoles(orderReadRoles)` | Purchase order via `prisma.purchase_orders.findUnique({ where: { id }, include: ... })` | Non-admin mismatch on `order.store_id` returns `403 { error: 'Forbidden: order does not belong to active store' }` | Bypasses comparison | Path unchanged; success remains `{ order }` |
| `DELETE /api/v1/orders/:id` | `router.use(authenticateToken)`, `requireActiveStoreUnlessAdmin`, `authorizeRoles(orderDeleteRoles)` | Purchase order via `tx.purchase_orders.findUnique({ where: { id }, include: { purchase_items: true } })` | After draft validation, non-admin mismatch on `po.store_id` returns `403 { error: 'Forbidden: order does not belong to active store' }` | Bypasses comparison | Path unchanged; success remains `{ order: deleted }` |
| `POST /api/v1/orders/:id/status` | `router.use(authenticateToken)`, `requireActiveStoreUnlessAdmin`, `authorizeRoles(orderStatusRoles)` | Purchase order preload via `prisma.purchase_orders.findUnique({ where: { id } })` before `update` | After ID/status validation and supported-status validation, non-admin mismatch on `order.store_id` returns `403 { error: 'Forbidden: order does not belong to active store' }` | Bypasses comparison | Path unchanged; success remains `{ order: updated }` |
| `POST /api/v1/transfers/:id/dispatch` | `router.use(authenticateToken)`, `requireActiveStoreUnlessAdmin`, `authorizeRoles(transferWriteRoles)` | Transfer via `tx.store_transfers.findUnique({ where: { id }, include: { store_transfer_items: true } })` | After pending-status validation, non-admin mismatch on `transfer.from_store_id` returns `403 { error: 'Forbidden: transfer source store does not match active store' }` | Bypasses comparison | Path unchanged; success remains `{ transfer: updated }` |
| `POST /api/v1/transfers/:id/receive` | `router.use(authenticateToken)`, `requireActiveStoreUnlessAdmin`, `authorizeRoles(transferWriteRoles)` | Transfer via `tx.store_transfers.findUnique({ where: { id }, include: { store_transfer_items: true } })` | After `in_transit` validation, non-admin mismatch on `transfer.to_store_id` returns `403 { error: 'Forbidden: transfer destination store does not match active store' }` | Bypasses comparison | Path unchanged; success remains `{ transfer: updated }` |
| `POST /api/v1/transfers/:id/cancel` | `router.use(authenticateToken)`, `requireActiveStoreUnlessAdmin`, `authorizeRoles(transferWriteRoles)` | Transfer via `tx.store_transfers.findUnique({ where: { id }, include: { store_transfer_items: true } })` | After pending-status validation, non-admin mismatch on `transfer.from_store_id` returns `403 { error: 'Forbidden: transfer source store does not match active store' }` | Bypasses comparison | Path unchanged; success remains `{ transfer: updated }` |

## Validation and Response Compatibility

Confirmed preserved behavior:
- POS resume invalid request still returns `400 { error: 'Invalid request' }`.
- Orders detail/delete invalid order ID behavior remains unchanged.
- Orders status invalid ID or missing status still returns `400 { error: 'Invalid id/status' }`.
- Orders status unsupported status still returns `400 { error: 'Unsupported status' }`.
- Orders status missing-order behavior remains error-handler based through `throw new Error('Order not found')`.
- Transfer invalid ID and existing status/store validation branches remain unchanged.
- Successful response envelopes are unchanged for all audited routes.

## Test Coverage Observed

Focused tests now cover:
- POS resume cross-store `403` and same-store success.
- Order detail cross-store `403`, same-store success, and `ADMIN` no-active-store success.
- Order delete cross-store `403`, same-store success, and `ADMIN` no-active-store success.
- Order status cross-store `403`, no update on mismatch, same-store success, `ADMIN` no-active-store success, invalid ID/status `400`, and unsupported status `400`.
- Transfer dispatch cross-source `403`, same-source success, and `ADMIN` no-active-store success.
- Transfer receive cross-destination `403`, same-destination success, and `ADMIN` no-active-store success.
- Transfer cancel cross-source `403`, same-source success, and `ADMIN` no-active-store success.

Latest targeted implementation verification:
- `npm test -- --runTestsByPath tests/pos.rbac.test.ts --runInBand --forceExit`
- `npm test -- --runTestsByPath tests/orders.rbac.test.ts --runInBand --forceExit`
- `npm test -- --runTestsByPath tests/transfers.rbac.test.ts --runInBand --forceExit`
- Direct ESLint checks for touched POS, orders, and transfer files completed with warnings only.

## Remaining Risks

1. Several handlers use sentinel objects such as `__forbiddenActiveStore` to return explicit `403` from transaction flows. This avoids broader refactors but should eventually be replaced by a shared typed error/result pattern.
2. Some existing business errors still throw plain `Error`, and the global error handler maps them to `500`.
3. Transfer detail `GET /api/v1/transfers/:id` was not part of this high-priority mutation set and should be reviewed for explicit object-level source/destination visibility.
4. Audit logging is not yet centralized for cross-store denial attempts.
5. Jest targeted suites still require `--forceExit`, indicating existing open handles.

## Completion Recommendation

Phase 3a is complete for the audited object-level store integrity scope:
- POS resume checkout is active-store constrained.
- Order detail, delete, and status update are active-store constrained for non-admin users.
- Transfer dispatch and cancel are source-store constrained for non-admin users.
- Transfer receive is destination-store constrained for non-admin users.
- `ADMIN` chain-wide access remains intact outside POS, where active store is intentionally required.

## Recommended Next Phase 3 Task

Proceed with a focused Phase 3b analysis for remaining object-level ownership/store integrity gaps, starting with:
1. `GET /api/v1/transfers/:id` visibility rules for source/destination stores.
2. Invoice and POS receipt/refund object-store checks.
3. Returns and complaints object ownership/store checks.
4. A shared typed forbidden/error helper and audit logging for denied cross-store attempts.
