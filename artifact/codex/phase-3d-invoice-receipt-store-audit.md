# Phase 3d Invoice and Receipt Store Integrity Audit

Date: 2026-05-24

Scope: audit strict object-store checks for:

- `GET /api/v1/invoices/:id`
- `GET /api/v1/pos/invoices/:id/receipt`

No route paths, request shapes, successful response shapes, business logic, or Prisma schema were changed by this audit.

## Summary

Phase 3d can be considered complete.

Both invoice detail routes now have strict object-level `invoice.store_id` checks. The general invoice detail route preserves ADMIN chain-wide access, while the POS receipt route remains active-store scoped for every role, including ADMIN.

## Route Matrix

| Route | Route-level protection | Object-level check | ADMIN behavior | Success shape |
|---|---|---|---|---|
| `GET /api/v1/invoices/:id` | `authenticateToken`, `requireActiveStoreUnlessAdmin`, `authorizeRoles(invoiceReadRoles)` | Non-admin must have finite `activeStoreId`, finite `invoice.store_id`, and equality | ADMIN bypasses store comparison | `{ order, items }` |
| `GET /api/v1/pos/invoices/:id/receipt` | `authenticateToken`, `requireActiveStore`, `authorizeRoles(posOperationalRoles)` | All roles must have finite `activeStoreId`, finite `invoice.store_id`, and equality | No ADMIN bypass | `{ invoice, receipt }` |

## Invoice Detail

Route: `GET /api/v1/invoices/:id`

Confirmed route-level protection:

- `router.use(authenticateToken)`
- `router.use(requireActiveStoreUnlessAdmin)`
- `authorizeRoles(invoiceReadRoles)`
- Allowed roles include `ADMIN`, `DISTRICT_MANAGER`, `STORE_MANAGER`, `CASHIER`, plus lowercase compatibility.

Confirmed preserved responses:

- Invalid id: `400 { error: 'Invalid invoice id' }`
- Missing invoice: `404 { error: 'Invoice not found' }`
- Success: unchanged `{ order, items }`

Confirmed strict non-admin object-store check:

```ts
const isAdmin = isAdminRequest(req);
const activeStoreId = Number(req.activeStoreId);
const invoiceStoreId = invoice.store_id !== undefined && invoice.store_id !== null ? Number(invoice.store_id) : NaN;
if (!isAdmin) {
  if (!Number.isFinite(activeStoreId) || !Number.isFinite(invoiceStoreId) || invoiceStoreId !== activeStoreId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
}
```

Security behavior:

- Non-admin missing/invalid active store: denied with `403 { error: 'Forbidden' }`.
- Non-admin missing/null/invalid invoice store: denied with `403 { error: 'Forbidden' }`.
- Non-admin cross-store invoice: denied with `403 { error: 'Forbidden' }`.
- ADMIN can view detail without active store and can view malformed historical rows with missing/null/invalid `store_id`.

## POS Receipt

Route: `GET /api/v1/pos/invoices/:id/receipt`

Confirmed route-level protection:

- `router.use(authenticateToken)`
- `router.use(requireActiveStore)`
- `authorizeRoles(posOperationalRoles)`
- Allowed roles include `ADMIN`, `STORE_MANAGER`, `CASHIER`, plus lowercase compatibility.

Confirmed preserved responses:

- Invalid id: `400 { error: 'Invalid invoice id' }`
- Missing invoice: `404 { error: 'Invoice not found' }`
- Success: unchanged `{ invoice, receipt }`

Confirmed strict all-role object-store check:

```ts
const activeStoreId = Number(req.activeStoreId);
const invoiceStoreId = invoice.store_id !== undefined && invoice.store_id !== null ? Number(invoice.store_id) : NaN;
if (!Number.isFinite(activeStoreId) || !Number.isFinite(invoiceStoreId) || invoiceStoreId !== activeStoreId) {
  return res.status(403).json({ error: 'Forbidden: invoice does not belong to active store' });
}
```

Security behavior:

- Missing/invalid active store: denied with `403 { error: 'Forbidden: invoice does not belong to active store' }` after invoice load, though `requireActiveStore` normally blocks earlier with 400.
- Missing/null/invalid invoice store: denied with `403 { error: 'Forbidden: invoice does not belong to active store' }`.
- Cross-store receipt: denied with `403 { error: 'Forbidden: invoice does not belong to active store' }`.
- ADMIN has no bypass because POS receipt is active-store scoped.

## Test Coverage Observed

Focused tests verify:

- `GET /api/v1/invoices/:id`
  - non-admin same-store detail returns `200`
  - non-admin cross-store detail returns `403 { error: 'Forbidden' }`
  - non-admin null/missing/invalid `store_id` returns `403`
  - ADMIN can view detail without active store
  - ADMIN can view null/missing/invalid `store_id`
  - missing invoice returns `404`
  - invalid invoice id returns `400`

- `GET /api/v1/pos/invoices/:id/receipt`
  - same-store receipt returns `200` with unchanged `{ invoice, receipt }`
  - cross-store receipt returns `403`
  - null/missing/invalid `store_id` returns `403`
  - ADMIN with active store still receives `403` for cross-store receipt
  - missing invoice returns `404`
  - invalid invoice id returns `400`

## Remaining Risks

- Cashier ownership narrowing is still intentionally deferred. Current behavior is store-scoped, not cashier-created-only.
- ADMIN can view malformed invoice rows through `/api/v1/invoices/:id` because chain-wide/admin diagnostic access is preserved.
- The invoice and POS routers still contain direct query/DTO mapping logic; module-boundary cleanup remains future work.

## Completion Recommendation

Phase 3d can be considered complete.

The two scoped invoice/receipt routes now have strict object-store integrity checks, preserved success responses, preserved invalid-id and missing-invoice responses, and the intended ADMIN behavior difference.

## Recommended Next Phase 3 Tasks

1. Phase 3e: ownership model design.
   - Define whether cashiers should see all store invoices/receipts or only their own.
   - Define mappings between JWT users, cashier sessions, invoice `created_by`, employee records, loyalty members, and complaint ownership.

2. Phase 3f: audit logging coverage.
   - Verify audit logs for refund, return, transfer actions, complaint status/delete, and sensitive invoice/receipt access where required.

3. Phase 3g: module-boundary cleanup.
   - Move invoice detail and POS receipt DTO/query logic from routers toward controller/service/repository structure.

4. Phase 3h: store-scope middleware error normalization.
   - Review `resolveActiveStore` error paths that call `next(new Error(...))` for possible stable 403 response conversion.
