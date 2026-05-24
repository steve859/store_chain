# Phase 3c Error Contract Audit

Date: 2026-05-24

Scope: audit refund/return error-contract hardening after Phase 3c implementations. This report inspects only:

- `POST /api/v1/pos/refund`
- `POST /api/v1/returns`
- `POST /api/v1/returns/refund`

No route paths, request shapes, successful response shapes, business logic, or Prisma schema were changed by this audit.

## Summary

Phase 3c can be considered complete for the scoped refund/return transaction routes.

The three target routes now translate known domain and store-security failures to stable 4xx responses using route-local sentinel results. Unknown exceptions still flow to the existing `catch (err) { next(err); }` error handling path.

## Route Matrix

| Route | Success response | Known domain/security errors | Unknown exceptions |
|---|---|---|---|
| `POST /api/v1/pos/refund` | `201 { refund: refundResult }` | Stable `400`, `403`, `404`, `409` via `RefundErrorResult` sentinel | Still passed to `next(err)` |
| `POST /api/v1/returns` | `201` existing result shape | Stable `400`, `403`, `404`, `409` via `ReturnErrorResult` sentinel and local decimal parse handling | Still passed to `next(err)` |
| `POST /api/v1/returns/refund` | `201 { refund: refundResult }` | Stable `400`, `403`, `404`, `409` via `ManagerRefundErrorResult` sentinel | Still passed to `next(err)` |

## POS Refund

Route: `POST /api/v1/pos/refund`

Confirmed unchanged:

- Route path remains `/refund` under `/api/v1/pos`.
- Request shape remains `{ items, reason?, cashierId? }`.
- Success response remains `201 { refund: refundResult }`.
- Refund stock movement behavior remains in the transaction.

Stable error contract:

| Condition | Status | Body |
|---|---:|---|
| Missing required fields | 400 | `{ error: 'Missing required fields' }` |
| Invalid items | 400 | `{ error: 'Invalid items' }` |
| One or more invoice items not found | 404 | `{ error: 'One or more invoice items not found' }` |
| Refund items do not belong to one invoice | 400 | `{ error: 'Refund items must belong to the same invoice' }` |
| Invoice not found | 404 | `{ error: 'Invoice not found' }` |
| Invoice belongs to another store | 403 | `{ error: 'Invoice does not belong to this store' }` |
| Invoice item missing `variant_id` | 409 | Same error message |
| Refund quantity exceeds sold quantity | 409 | Same error message |
| Inventory not found for variant | 409 | Same error message |

## Standard Return

Route: `POST /api/v1/returns`

Confirmed unchanged:

- Route path remains `/` under `/api/v1/returns`.
- Request shape remains `{ invoiceId, refundMethod?, restock?, reason?, note?, items }`.
- Success response remains the existing result shape returned by the transaction.
- Return creation, return items, restock, stock movement, audit logging, and optional cash movement remain in the same route flow.

Stable error contract:

| Condition | Status | Body |
|---|---:|---|
| Missing `invoiceId` or empty items | 400 | `{ error: 'invoiceId and non-empty items are required' }` |
| Invalid decimal quantity from `toDecimal` | 400 | `{ error: 'Invalid items payload' }` |
| Invalid parsed items payload | 400 | `{ error: 'Invalid items payload' }` |
| Invoice not found | 404 | `{ error: 'Invoice not found' }` |
| Invoice belongs to another store | 403 | `{ error: 'Invoice does not belong to this store' }` |
| One or more invoice items not found | 404 | `{ error: 'One or more invoice items not found' }` |
| Items do not belong to the target invoice | 400 | `{ error: 'All items must belong to the same invoice' }` |
| Invoice item missing `variant_id` | 409 | Same error message |
| Invoice item already fully returned | 409 | Same error message |
| Return quantity exceeds remaining quantity | 409 | Same error message |
| Large refund by non-manager/non-admin role | 403 | `{ error: 'Large refund requires manager/admin approval' }` |
| Inventory not found for variant | 409 | Same error message |

Implementation note: required inventory is now validated before return/audit/cash movement writes for the known missing-inventory case, preserving the previous no-partial-write intent while avoiding a generic 500.

## Legacy Manager Refund

Route: `POST /api/v1/returns/refund`

Confirmed unchanged:

- Route path remains `/refund` under `/api/v1/returns`.
- Request shape remains `{ createdBy?, items, reason? }`.
- Success response remains `201 { refund: refundResult }`.
- Audit logging, inventory increment, and refund stock movement remain in the handler flow.

Stable error contract:

| Condition | Status | Body |
|---|---:|---|
| Missing required fields | 400 | `{ error: 'Missing required fields' }` |
| Invalid items | 400 | `{ error: 'Invalid items' }` |
| One or more invoice items not found | 404 | `{ error: 'One or more invoice items not found' }` |
| Refund items do not belong to one invoice | 400 | `{ error: 'Refund items must belong to the same invoice' }` |
| Invoice not found | 404 | `{ error: 'Invoice not found' }` |
| Invoice belongs to another store | 403 | `{ error: 'Invoice does not belong to this store' }` |
| Invoice item missing `variant_id` | 409 | Same error message |
| Refund quantity exceeds sold quantity | 409 | Same error message |
| Inventory not found for variant | 409 | Same error message |

Implementation note: item/inventory validation now happens before the audit log write for known error cases, preserving the previous transaction rollback intent while returning stable 4xx responses.

## Test Coverage Observed

Focused tests verify:

- POS refund:
  - valid refund still returns `201 { refund }`
  - cross-store invoice returns 403
  - missing invoice item returns 404
  - mixed invoice items return 400
  - refund quantity exceeds sold quantity returns 409
  - missing inventory returns 409

- Standard return:
  - valid return still returns the existing `201` result shape
  - invalid decimal quantity returns 400
  - cross-store invoice returns 403
  - missing invoice returns 404
  - missing invoice item returns 404
  - item from another invoice returns 400
  - already fully returned and exceeds remaining return 409
  - large refund by cashier returns 403
  - missing inventory returns 409

- Legacy manager refund:
  - valid legacy refund still returns `201 { refund }`
  - cross-store invoice returns 403
  - missing invoice item returns 404
  - mixed invoice items return 400
  - refund quantity exceeds sold quantity returns 409
  - missing inventory returns 409

## Remaining Risks

- Unknown unexpected exceptions still flow to the existing error handler. This is intentional for Phase 3c.
- The three routes remain router-heavy and still contain direct transaction/business logic. This matches the current scope but remains a module-boundary cleanup target.
- Error contract hardening is route-local; there is not yet a shared typed domain error pattern across modules.
- Existing lint warnings about `any` remain in the touched routers, but no new global lint cleanup was attempted.

## Completion Recommendation

Phase 3c can be considered complete.

The scoped refund/return transaction routes now have stable 4xx responses for known domain/security errors, unchanged route/request/success contracts, and preserved fallback to the existing error handler for unknown failures.

## Recommended Next Phase 3 Tasks

1. Phase 3d: strict invoice and receipt object-store checks.
   - Harden `GET /api/v1/invoices/:id`.
   - Harden `GET /api/v1/pos/invoices/:id/receipt`.

2. Phase 3e: ownership model design.
   - Define how JWT users map to cashier-created invoices, complaints, employee records, and loyalty members.
   - Avoid cashier/member self-service narrowing until the model exists.

3. Phase 3f: audit logging coverage.
   - Verify sensitive operations have audit logs: refunds, returns, transfer actions, complaint status/delete, and sensitive invoice access where required.

4. Phase 3g: module-boundary cleanup.
   - Move POS refund and returns transaction logic from routers toward service/repository boundaries without changing public API behavior.
