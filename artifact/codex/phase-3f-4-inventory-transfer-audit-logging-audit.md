# Phase 3f-4 Inventory and Transfer Audit Logging Audit

Date: 2026-05-24

## Scope

Audited Phase 3f-4 audit logging coverage for:

- `POST /api/v1/inventory/receive`
- `POST /api/v1/inventory/adjust`
- `POST /api/v1/transfers`
- `POST /api/v1/transfers/:id/dispatch`
- `POST /api/v1/transfers/:id/receive`
- `POST /api/v1/transfers/:id/cancel`

No application code was changed during this audit.

## Summary

Phase 3f-4 audit logging coverage is complete for the inspected inventory and transfer mutation routes.

The implemented audit logs are best-effort, written only after successful mutations, and use explicit whitelisted payload fields instead of full request bodies. Validation, RBAC, store mismatch, and domain failure paths do not write success audit logs in the focused test coverage.

## Coverage Matrix

| Route | Audit action | Object type / id | Success response unchanged | Success-only timing | Stock movement ids |
|---|---|---|---|---|---|
| `POST /api/v1/inventory/receive` | `INVENTORY_RECEIVED` | `stock_movement` / created movement id | `201` with existing `{ inventory, lot, movement }` result | After transaction and catalog cache invalidation | Included as `objectId` and `metadata.stockMovementId` |
| `POST /api/v1/inventory/adjust` | `INVENTORY_ADJUSTED` | `stock_movement` / created movement id | `201` with existing `{ inventory, movement }` result | After transaction and catalog cache invalidation | Included as `objectId` and `metadata.stockMovementId` |
| `POST /api/v1/transfers` | `TRANSFER_CREATED` | `store_transfer` / created transfer id | `201 { transfer }` | After successful transaction | Not applicable; create reserves stock but does not create stock movement rows |
| `POST /api/v1/transfers/:id/dispatch` | `TRANSFER_DISPATCHED` | `store_transfer` / transfer id | `201 { transfer }` | After successful transaction and after store-mismatch sentinel handling | Included as `metadata.stockMovementIds` |
| `POST /api/v1/transfers/:id/receive` | `TRANSFER_RECEIVED` | `store_transfer` / transfer id | `201 { transfer }` | After successful transaction and after store-mismatch sentinel handling | Included as `metadata.stockMovementIds` |
| `POST /api/v1/transfers/:id/cancel` | `TRANSFER_CANCELLED` | `store_transfer` / transfer id | `201 { transfer }` | After successful transaction and after store-mismatch sentinel handling | Not applicable; cancel releases reserved stock without stock movement rows |

## Best-Effort Behavior

Both routers use route-local `writeAuditLog` wrappers that catch audit write failures. `AuditLogsService.createLog()` also catches repository write failures internally. This means audit write failure does not break successful inventory or transfer responses.

Focused tests confirm best-effort behavior for:

- successful inventory adjust when audit logging rejects
- successful transfer create when audit logging rejects

## Failure Paths

The inspected routes write audit logs only after successful mutation paths.

Focused tests confirm no success audit log is written for:

- inventory RBAC rejection for `CASHIER`
- inventory adjust validation failure
- transfer RBAC rejection for `CASHIER`
- transfer create active-store mismatch
- transfer dispatch source-store mismatch
- transfer receive destination-store mismatch
- transfer cancel source-store mismatch

Domain exceptions still flow through the existing error handler and do not reach the post-success audit calls.

## Sensitive Field Review

Audit payloads are explicitly assembled from safe fields. They do not log:

- full request bodies
- authorization headers
- tokens
- passwords
- generic secrets
- supplier or customer PII
- full product objects
- full store objects
- raw user records

The payloads include operational summaries only: actor id, source IP/user agent, store ids, variant ids, quantities, transfer ids, safe inventory/transfer snapshots, and capped reason previews where present.

Known limitation: `reasonPreview` remains free text, capped to 80 characters. This is useful for operations review but can still contain user-entered content; future hardening could redact patterns that look like secrets or personal data.

## Verification Evidence

Previously run targeted checks for these implementations:

- `npm test -- --runTestsByPath tests/inventory.rbac.test.ts --runInBand --forceExit`
  - Passed: 9 tests.
- `npm exec -- eslint src/modules/inventory/inventory.router.ts tests/inventory.rbac.test.ts`
  - Passed with existing warning-only `any` findings in the router.
- `npm test -- --runTestsByPath tests/transfers.rbac.test.ts --runInBand --forceExit`
  - Passed: 21 tests.
- `npm exec -- eslint src/modules/transfers/transfers.router.ts tests/transfers.rbac.test.ts`
  - Passed with existing warning-only `any` findings in the router.

## Remaining Risks

- Some domain errors in inventory and transfer routes still rely on the existing generic error handler rather than stable domain-specific 4xx contracts.
- Transfer create and cancel do not include stock movement ids because those paths do not create stock movement rows by current business logic.
- `reasonPreview` is capped but not semantically redacted.
- Audit logging is best-effort by design, so operational mutations can succeed even if the audit repository is unavailable.

## Completion Recommendation

Phase 3f-4 can be considered complete.

The required inventory and transfer mutation routes have audit actions, best-effort behavior, success-only placement, focused tests, response-shape preservation, and sensitive-field exclusions.

## Recommended Next Phase 3f Batch

Recommended Phase 3f-5: audit logging for remaining sensitive customer/cash and administrative operations:

- `POST /api/v1/returns`
- `POST /api/v1/returns/refund`
- `PATCH /api/v1/complaints/:id/status`
- `DELETE /api/v1/complaints/:id`
- store management create/update/delete routes if still unaudited

Priority should go first to returns/refunds because they affect cash, inventory, invoices, and customer-facing transaction history.
