# Phase 3f-5 Returns, Refunds, and Complaints Audit Logging Audit

Date: 2026-05-24

## Scope

Audited audit logging coverage for:

- `POST /api/v1/returns`
- `POST /api/v1/returns/refund`
- `PATCH /api/v1/complaints/:id/status`
- `DELETE /api/v1/complaints/:id`

No application code was changed during this audit.

## Summary

Phase 3f-5 audit logging coverage is complete for returns/refunds and complaint governance routes.

Returns/refunds upgraded the existing transaction-bound audit rows in place. Complaint governance routes now write best-effort audit logs only after successful status/delete operations.

## Coverage Matrix

| Route | Audit action | Audit write mode | Object type / id | Success response shape | Status |
|---|---|---|---|---|---|
| `POST /api/v1/returns` | `RETURN_CREATED` | Transaction-bound `tx.audit_logs.create` | `return` / created return id | Existing `201` result shape | Complete |
| `POST /api/v1/returns/refund` | `MANAGER_REFUND_CREATED` | Transaction-bound `tx.audit_logs.create`, then same-row payload update | `invoice` / invoice id | `201 { refund: { invoiceId, totalRefund, auditLogId } }` | Complete |
| `PATCH /api/v1/complaints/:id/status` | `COMPLAINT_STATUS_UPDATED` | Best-effort `AuditLogsService.createLog` after successful update | `complaint` / route id or complaint code | Existing `res.json(updated)` | Complete |
| `DELETE /api/v1/complaints/:id` | `COMPLAINT_DELETED` | Best-effort `AuditLogsService.createLog` after successful delete | `complaint` / route id or complaint code | Existing `res.json({ message: 'Deleted' })` | Complete |

## Returns/Refunds

### `POST /api/v1/returns`

Confirmed:

- The existing audit row was upgraded in place from legacy `return_create` to `RETURN_CREATED`.
- No duplicate audit row was added.
- The audit write remains inside the same Prisma transaction.
- The audit row is created after return items, optional restock stock movements, and optional cash movement are created, so the payload can include created IDs.
- Success response remains the existing `201` result shape.

Payload includes:

- `result: success`
- `source: { ip, userAgent }`
- `storeId`
- `invoiceId`
- `returnId`
- `returnNumber`
- safe `after` return snapshot
- metadata for refund method, restock flag, total refund, item count, invoice item ids, variant ids, quantities, return item ids, stock movement ids, cash movement status/id, reason presence/preview, and note presence

Failure behavior:

- Validation failures return before transaction/audit.
- Domain/security sentinel errors return before the audit write.
- Focused tests assert no audit write on cross-store invoice errors.

### `POST /api/v1/returns/refund`

Confirmed:

- The existing audit row was upgraded in place from legacy `manager_refund` to `MANAGER_REFUND_CREATED`.
- No duplicate audit row was added.
- The route still creates the audit row inside the transaction before stock movements so `audit.id` remains available.
- Stock movement `reference_id` still uses `audit:<id>`.
- Response still includes `refund.auditLogId`.
- After stock movement creation, the same audit row payload is updated to include collected `stockMovementIds`.

Payload includes:

- `result: success`
- `source`
- `storeId`
- `invoiceId`
- metadata for total refund, item count, invoice item ids, variant ids, quantities, stock movement ids, reason presence, and capped reason preview

Failure behavior:

- RBAC failures occur before transaction/audit.
- Validation/domain/security sentinel errors return before audit creation.
- Focused tests cover cross-store invoice, missing invoice item, mixed invoice items, excessive refund quantity, and missing inventory errors.

## Complaints

### `PATCH /api/v1/complaints/:id/status`

Confirmed:

- Audit write occurs only after `ComplaintsService.updateStatus()` succeeds.
- Audit write uses best-effort wrapper; audit failure does not break the successful status response.
- Invalid status, missing complaint, RBAC rejection, and store mismatch paths do not write success audit logs.
- Success response remains `res.json(updated)`.

Payload includes:

- `result: success`
- `source`
- `storeId`
- safe `before` status snapshot
- safe `after` status snapshot
- metadata for requested status, normalized status, admin note presence, and capped admin note preview

### `DELETE /api/v1/complaints/:id`

Confirmed:

- Audit write occurs only after `ComplaintsService.remove()` succeeds.
- Audit write uses best-effort wrapper; audit failure does not break `{ message: 'Deleted' }`.
- Missing complaint, RBAC rejection, and store mismatch paths do not write success audit logs.
- Success response remains `res.json({ message: 'Deleted' })`.

Payload includes:

- `result: success`
- `source`
- `storeId`
- safe `before` delete snapshot
- metadata for employee name presence, description presence, and image presence

## Sensitive Field Review

Confirmed payloads avoid:

- full request bodies
- authorization headers
- tokens
- passwords
- generic secrets
- customer PII
- full invoice payloads
- full receipt payloads
- full complaint description text
- complaint image payload
- raw user records

Returns/refunds use explicit operational fields and capped reason previews. Complaints use presence flags for employee name, description, and image, plus capped previews only for reason/admin note where needed.

## Route and Response Compatibility

Confirmed route paths remain unchanged:

- `POST /api/v1/returns`
- `POST /api/v1/returns/refund`
- `PATCH /api/v1/complaints/:id/status`
- `DELETE /api/v1/complaints/:id`

Confirmed success response shapes remain unchanged:

- Standard return: existing `201` result shape.
- Legacy manager refund: `201 { refund: { invoiceId, totalRefund, auditLogId } }`.
- Complaint status update: `res.json(updated)`.
- Complaint delete: `res.json({ message: 'Deleted' })`.

## Verification Evidence

Focused tests cover the audit behavior:

- `backend/tests/returns.rbac.test.ts`
  - `RETURN_CREATED` payload and no duplicate audit row.
  - standard return validation/domain errors avoid success audit writes.
  - `MANAGER_REFUND_CREATED` payload.
  - `refund.auditLogId` preserved.
  - stock movement reference remains `audit:<id>`.
  - sensitive token/password/secret-like fields excluded.
- `backend/tests/complaints.rbac.test.ts`
  - `COMPLAINT_STATUS_UPDATED` success audit.
  - status validation/missing complaint/RBAC/store mismatch avoid success audit writes.
  - status audit failure does not break response.
  - `COMPLAINT_DELETED` success audit.
  - delete missing complaint/RBAC/store mismatch avoid success audit writes.
  - delete audit failure does not break response.
  - sensitive fields and full complaint description/image values excluded.

Last known targeted implementation verification:

- `npm test -- --runTestsByPath tests/returns.rbac.test.ts --runInBand --forceExit`
  - Passed: 21 tests.
- `npm exec -- eslint src/modules/returns/returns.router.ts tests/returns.rbac.test.ts`
  - Passed with warning-only existing `any` findings.
- `npm test -- --runTestsByPath tests/complaints.rbac.test.ts --runInBand --forceExit`
  - Passed: 26 tests.
- `npm exec -- eslint src/modules/complaints/complaints.router.ts tests/complaints.rbac.test.ts`
  - Passed with warning-only existing `any` findings.

## Remaining Risks

- `POST /api/v1/returns/refund` uses an audit row as part of business behavior via `auditLogId` and `stock_movements.reference_id`; this is preserved, but it means the audit row cannot be made purely best-effort without a separate compatibility change.
- Capped reason/admin note previews are still user-entered text. They are bounded but not semantically redacted.
- Some return/refund domain errors still rely on existing route-local sentinel behavior rather than a shared typed domain error system.

## Completion Recommendation

Phase 3f-5 can be considered complete.

The required audit actions exist, returns/refunds upgraded existing rows without duplicates, complaint governance audit writes are best-effort and success-only, route paths and success response shapes are preserved, and sensitive field exclusions are covered by tests.

## Recommended Next Phase 3f Batch

Recommended Phase 3f-6: store and master-data governance audit logging:

- store create/update/delete
- supplier create/update/delete
- category create/update/delete
- promotion create/update/delete

Prioritize store governance first because store records affect scope, RBAC context, reporting, inventory, POS, and audit interpretation across the system.
