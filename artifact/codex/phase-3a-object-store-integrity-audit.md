# Phase 3a Object-Store Integrity Audit

Date: 2026-05-24

Scope:
- `POST /api/v1/pos/resume/:id/checkout`
- `GET /api/v1/orders/:id`
- `DELETE /api/v1/orders/:id`
- `POST /api/v1/transfers/:id/dispatch`
- `POST /api/v1/transfers/:id/receive`
- `POST /api/v1/transfers/:id/cancel`

This audit confirms the object-level active-store integrity checks added in Phase 3a. Application code was not modified during this audit.

## Summary

Phase 3a can be considered complete for the six high-priority cross-store routes. Each route has route-level authentication, RBAC, store-scope middleware, object loading before response or mutation, and an object-store comparison before cross-store data can be returned or mutated.

The POS resume route applies the active-store comparison to all roles, including `ADMIN`, because the POS router requires an active store globally. Orders and transfers preserve chain-wide `ADMIN` access by bypassing the active-store comparison for admin users.

## Route Matrix

| Route | Route-level auth/RBAC/store-scope | Object loaded before response/mutation | Object-store comparison | ADMIN behavior | Route/response shape |
|---|---|---|---|---|---|
| `POST /api/v1/pos/resume/:id/checkout` | `router.use(authenticateToken)`, `router.use(requireActiveStore)`, `authorizeRoles(posOperationalRoles)` | Held invoice loaded with `tx.invoices.findUnique({ id, include: invoice_items })` before inventory/payment mutation | `Number(invoice.store_id) !== Number(req.activeStoreId)` returns `403 { error: 'Forbidden: invoice does not belong to active store' }` | No bypass. POS requires active store for all roles, including `ADMIN` | Path unchanged. Success remains `200 { invoice }` |
| `GET /api/v1/orders/:id` | `router.use(authenticateToken)`, route `requireActiveStoreUnlessAdmin`, `authorizeRoles(orderReadRoles)` | Purchase order loaded with `prisma.purchase_orders.findUnique({ id, include: ... })` before response | Non-admin mismatch `Number(order.store_id) !== Number(req.activeStoreId)` returns `403 { error: 'Forbidden: order does not belong to active store' }` | `ADMIN` bypasses object-store comparison and may read without active store | Path unchanged. Success remains `200 { order }` |
| `DELETE /api/v1/orders/:id` | `router.use(authenticateToken)`, route `requireActiveStoreUnlessAdmin`, `authorizeRoles(orderDeleteRoles)` | Purchase order loaded with `tx.purchase_orders.findUnique({ id, include: purchase_items })` before delete | After existing draft-status validation, non-admin mismatch returns sentinel and then `403 { error: 'Forbidden: order does not belong to active store' }` | `ADMIN` bypasses object-store comparison and may delete eligible draft orders without active store | Path unchanged. Success remains `200 { order: deleted }` |
| `POST /api/v1/transfers/:id/dispatch` | `router.use(authenticateToken)`, route `requireActiveStoreUnlessAdmin`, `authorizeRoles(transferWriteRoles)` | Transfer loaded with `tx.store_transfers.findUnique({ id, include: store_transfer_items })` before stock decrement/status mutation | After existing pending-status validation, non-admin mismatch on `from_store_id` returns `403 { error: 'Forbidden: transfer source store does not match active store' }` | `ADMIN` bypasses source-store comparison | Path unchanged. Success remains `201 { transfer }` |
| `POST /api/v1/transfers/:id/receive` | `router.use(authenticateToken)`, route `requireActiveStoreUnlessAdmin`, `authorizeRoles(transferWriteRoles)` | Transfer loaded with `tx.store_transfers.findUnique({ id, include: store_transfer_items })` before destination inventory/status mutation | After existing `in_transit` validation, non-admin mismatch on `to_store_id` returns `403 { error: 'Forbidden: transfer destination store does not match active store' }` | `ADMIN` bypasses destination-store comparison | Path unchanged. Success remains `201 { transfer }` |
| `POST /api/v1/transfers/:id/cancel` | `router.use(authenticateToken)`, route `requireActiveStoreUnlessAdmin`, `authorizeRoles(transferWriteRoles)` | Transfer loaded with `tx.store_transfers.findUnique({ id, include: store_transfer_items })` before reserved stock release/status mutation | After existing pending-status validation, non-admin mismatch on `from_store_id` returns `403 { error: 'Forbidden: transfer source store does not match active store' }` | `ADMIN` bypasses source-store comparison | Path unchanged. Success remains `201 { transfer }` |

## Test Coverage Observed

Focused route tests exist for the Phase 3a checks:
- POS resume checkout covers cross-store `403` and same-store success path.
- Orders detail covers non-admin cross-store `403`, same-store success, and `ADMIN` no-active-store access.
- Orders delete covers non-admin cross-store `403`, same-store success, and `ADMIN` no-active-store delete.
- Transfer dispatch covers non-admin cross-source `403`, same-source success, and `ADMIN` no-active-store dispatch.
- Transfer receive covers non-admin cross-destination `403`, same-destination success, and `ADMIN` no-active-store receive.
- Transfer cancel covers non-admin cross-source `403`, same-source success, and `ADMIN` no-active-store cancel.

Latest targeted verification from implementation phases:
- `npm test -- --runTestsByPath tests/pos.rbac.test.ts --runInBand --forceExit`
- `npm test -- --runTestsByPath tests/orders.rbac.test.ts --runInBand --forceExit`
- `npm test -- --runTestsByPath tests/transfers.rbac.test.ts --runInBand --forceExit`
- Direct ESLint checks for touched POS, orders, and transfer files passed with warnings only.

## Remaining Risks

1. The transaction handlers use sentinel objects such as `__forbiddenActiveStore` to preserve explicit `403` responses without broader error-handler refactoring. This is functional but not a shared error pattern.
2. Several non-Phase-3a transactional errors still throw plain `Error`; the global error handler maps those to `500`. This audit did not change that behavior.
3. Transfer detail `GET /api/v1/transfers/:id` still relies on prior Phase 2 route/list scope behavior and was not part of Phase 3a high-priority mutation scope.
4. `POST /api/v1/orders/:id/status` has route-level store-scope but was not part of this Phase 3a object-level implementation set.
5. Audit logging for denied cross-store attempts is not yet centralized.
6. Test suites still require `--forceExit`, indicating existing open handles in the test/app setup.

## Completion Recommendation

Phase 3a should be considered complete for the requested high-priority object-level store integrity set:
- POS resume checkout cannot complete a held invoice from another active store.
- Order detail/delete now enforce PO store ownership for non-admin users.
- Transfer dispatch/cancel enforce source-store ownership for non-admin users.
- Transfer receive enforces destination-store ownership for non-admin users.
- `ADMIN` chain-wide behavior is preserved where expected.

## Recommended Next Phase 3 Tasks

1. Add object-level store checks to `POST /api/v1/orders/:id/status`.
2. Review `GET /api/v1/transfers/:id` and decide whether object-level detail checks should allow either source or destination active store for non-admin users.
3. Review invoice, returns, complaints, and POS receipt/refund routes for remaining object-level store checks beyond Phase 3a.
4. Introduce a small shared forbidden-result or typed HTTP error helper to replace ad hoc sentinel objects in transactional handlers.
5. Add audit logging for cross-store denial events on sensitive routes.
6. Fix the Jest open-handle issue so targeted tests can complete without `--forceExit`.
