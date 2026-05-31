# Phase 3f Audit Logging Coverage Analysis

## Scope

This report analyzes current audit logging coverage for sensitive backend operations before any implementation changes.

No application code, route paths, response shapes, business logic, or Prisma schema are changed by this report.

## Target Requirement Summary

`artifact/design/SAD.md` and `artifact/asr/ASR.md` expect append-only audit logging for sensitive operations, especially:

- user and permission management
- store create/update/deactivation
- pricing changes, rollback, and rejected pricing actions
- inventory adjustments and stock movement decisions
- transfer approval/dispatch/receive/cancel decisions
- report export
- complaint resolution
- login success/failure and failed-login monitoring

SAD section 6.6 calls out expected audit fields: actor, action, entity, timestamp, old/new value, result, and request source.

## Current Audit Infrastructure

### Database Model

Current `audit_logs` Prisma model:

| Field | Current purpose | Gap |
| --- | --- | --- |
| `id` | Append-only row id | OK |
| `user_id` | Actor user FK | OK when populated |
| `action` | Action name | No taxonomy yet |
| `object_type` | Entity type | OK but inconsistent names possible |
| `object_id` | Entity id as string | OK |
| `payload` | JSON metadata | Carries store/result/before-after when provided |
| `created_at` | Timestamp | OK |

Missing top-level fields relative to SAD: `store_id`, `result`, `request_source`, `ip`, `user_agent`, `correlation_id`, and explicit before/after fields. These can be carried in `payload` for now without schema change.

### Audit Writers

| Writer | Location | Usage today |
| --- | --- | --- |
| `AuditLogsService.createLog` | `backend/src/modules/audit_logs/audit_logs.service.ts` | Used by maintenance flows only in current scan |
| `AuditLogsRepository.create` | `backend/src/modules/audit_logs/audit_logs.repository.ts` | Backing repository for service |
| `logAction` helper | `backend/src/modules/audit/audit.service.ts` | Legacy helper; no current sensitive-route usage found |
| Direct `tx.audit_logs.create` | `backend/src/modules/returns/returns.router.ts` | Used by `POST /returns` and `POST /returns/refund` |
| In-memory sales checkout audit | `backend/src/modules/sales/*` | Separate legacy/experimental sales state machine, not the active `/api/v1/pos` router |

### Audit Read API

`GET /api/v1/audit-logs` is authenticated and ADMIN-only. It supports filtering by action, object type, user id, and date range.

## Current Coverage Matrix

| Area | Operation | Current audit log exists? | Current fields logged | Risk |
| --- | --- | --- | --- | --- |
| Users | `POST /api/v1/users` create user | No | None | Critical |
| Users | `PUT /api/v1/users/:id` update user/password/role/status | No | None | Critical |
| Users | `PUT /api/v1/users/:id/stores` update store assignments | No | None | Critical |
| Users | `DELETE /api/v1/users/:id` soft delete/deactivate | No | None | Critical |
| Stores | `POST /api/v1/stores` create store | No | None | High |
| Stores | `PUT /api/v1/stores/:id` update store | No | None | High |
| Stores | `DELETE /api/v1/stores/:id` deactivate store | No | None | High |
| Pricing | `POST /api/v1/pricing/rules` create rule | No `audit_logs`; app logger only | Logger has type/ruleId/storeId/ruleType after create | Critical |
| Pricing | `POST /api/v1/pricing/demand-metrics` upsert metrics | No `audit_logs`; app logger only | Logger has type/storeId/demandLevel | Medium |
| Pricing | `POST /api/v1/pricing/competitor-prices` record competitor price | No `audit_logs`; app logger only | Logger has productSku/competitorName/priceDiff | Medium |
| Products pricing | `POST /api/v1/products/variant-prices` set effective price | No | `variant_prices.created_by` stores actor, but no audit event | Critical |
| Products pricing | `POST /api/v1/products/variant-prices/close` close price window | No | `variant_prices.created_by` updated, but no audit event | Critical |
| Inventory | `POST /api/v1/inventory/receive` receive stock | No `audit_logs` | `stock_movements` row with store, variant, change, reason, reference, created_by | High |
| Inventory | `POST /api/v1/inventory/adjust` adjust stock | No `audit_logs` | `stock_movements` row with store, variant, change, reason, reference, created_by | High |
| Transfers | `POST /api/v1/transfers` create transfer | No | `store_transfers.created_by`, items, reserved inventory mutation | High |
| Transfers | `POST /api/v1/transfers/:id/dispatch` | No `audit_logs` | `stock_movements` rows for transfer out with store, variant, change, reason, created_by from body if provided | High |
| Transfers | `POST /api/v1/transfers/:id/receive` | No `audit_logs` | `stock_movements` rows for transfer in with store, variant, change, reason, created_by from body if provided | High |
| Transfers | `POST /api/v1/transfers/:id/cancel` | No | Transfer status changes and reserved stock release only | High |
| POS | `POST /api/v1/pos/checkout` | No `audit_logs` | Invoice, invoice items, stock movements with actor | High |
| POS | `POST /api/v1/pos/hold` | No | Held invoice and reserved inventory only | Medium |
| POS | `POST /api/v1/pos/resume/:id/checkout` | No `audit_logs` | Invoice update and stock movements with original cashier | High |
| POS | `POST /api/v1/pos/refund` | No `audit_logs` | Stock movements with actor; refund is not persisted separately | Critical |
| POS | `POST /api/v1/pos/shifts/open` | No `audit_logs` | `pos_shifts.opened_by`; opening cash movement if applicable | Medium |
| POS | `POST /api/v1/pos/shifts/close` | No `audit_logs` | `pos_shifts.closed_by`, closing cash, computed variance in response only | High |
| POS | `POST /api/v1/pos/cash-movements` | No `audit_logs` | `cash_movements` row with store, shift, type, amount, reason, actor | High |
| Returns | `POST /api/v1/returns` standard return | Yes | `user_id`, action `return_create`, object `return`, object id, payload with storeId, invoiceId, returnNumber, totalRefund, restock, refundMethod | Partial |
| Returns | `POST /api/v1/returns/refund` legacy manager refund | Yes | `user_id`, action `manager_refund`, object `invoice`, object id invoiceId, payload with storeId, reason, items; response includes auditLogId | Partial |
| Complaints | `PATCH /api/v1/complaints/:id/status` | No | None | High |
| Complaints | `DELETE /api/v1/complaints/:id` | No | None | High |
| Reports | Export routes | No export route found | Not applicable yet | Low now, High when added |
| Reports | Dashboard/read routes | No | Read-only dashboard routes only | Low |

## Existing Audit Log Detail Assessment

### `POST /api/v1/returns`

Current audit event:

- actor: `createdBy` from JWT user id
- action: `return_create`
- object type/id: `return` / created return id
- metadata: `storeId`, `invoiceId`, `returnNumber`, `totalRefund`, `restock`, `refundMethod`

Gaps:

- no explicit `result: success`
- no request source metadata
- no before/after inventory quantities
- no per-line return item quantities in audit payload

### `POST /api/v1/returns/refund`

Current audit event:

- actor: `createdByEffective` from JWT user id
- action: `manager_refund`
- object type/id: `invoice` / invoice id
- metadata: `storeId`, `reason`, `items`

Gaps:

- no explicit refund object because legacy refund does not persist a refund table
- no total refund in audit payload
- no explicit `result: success`
- no request source metadata
- no before/after inventory quantities

## Missing Audit Logs By Risk

### Critical

| Operation | Reason |
| --- | --- |
| User create/update/delete/store assignment | Direct permission/account lifecycle changes required by ASR UC02 |
| Pricing rule create and product variant price set/close | Pricing affects POS prices and financial outcomes; SAD/ASR explicitly require pricing audit |
| POS refund | Money movement and inventory restock without dedicated persisted refund/audit record |

### High

| Operation | Reason |
| --- | --- |
| Store create/update/deactivate | Store scope and operational topology changes |
| Inventory receive/adjust | Stock quantity integrity; stock movement exists but not governance audit |
| Transfer create/dispatch/receive/cancel | Cross-store inventory movement and transfer decisions |
| POS checkout/resume checkout | Sales and stock decrement; existing operational records exist but no explicit audit event |
| Shift close | Cash reconciliation and variance should be traceable |
| Cash movement | Manual cash in/out is fraud-sensitive |
| Complaint status/delete | Complaint resolution/governance actions required by SAD |

### Medium

| Operation | Reason |
| --- | --- |
| Pricing demand metrics and competitor prices | Inputs influence pricing recommendations; lower risk than actual price/rule changes |
| POS hold | Reserves inventory; lower financial impact than checkout/refund |
| Shift open | Important operational event, but less sensitive than shift close |

### Low

| Operation | Reason |
| --- | --- |
| Reports dashboard reads | No export route found; read audit can be deferred unless compliance requires sensitive report read tracking |

## Recommended Audit Event Taxonomy

Use stable uppercase action names. Keep `object_type` singular lower_snake_case or domain nouns consistently.

### Identity And Access

| Action | Object type | Expected payload |
| --- | --- | --- |
| `AUTH_LOGIN_SUCCESS` | `user` | email, role, storeIds, source |
| `AUTH_LOGIN_FAILURE` | `auth` | email/username attempted, reason category, source |
| `USER_CREATED` | `user` | targetUserId, roleId, storeIds, result |
| `USER_UPDATED` | `user` | before/after safe fields, changedFields |
| `USER_STORE_ASSIGNMENTS_UPDATED` | `user` | before/after storeIds, primaryStoreId |
| `USER_DEACTIVATED` | `user` | previous status, result |

### Store Management

| Action | Object type | Expected payload |
| --- | --- | --- |
| `STORE_CREATED` | `store` | created fields, result |
| `STORE_UPDATED` | `store` | before/after changed fields |
| `STORE_DEACTIVATED` | `store` | previous status, result |

### Pricing

| Action | Object type | Expected payload |
| --- | --- | --- |
| `PRICING_RULE_CREATED` | `pricing_rule` | storeId, target, rule type, guardrails, effective window |
| `VARIANT_PRICE_SET` | `variant_price` | storeId, variantId, price, startAt, closedPriorWindow |
| `VARIANT_PRICE_CLOSED` | `variant_price` | storeId, variantId, previous window, endAt |
| `DEMAND_METRICS_UPDATED` | `demand_metrics` | storeId, productVariantId/categoryId, demandLevel |
| `COMPETITOR_PRICE_RECORDED` | `competitor_price` | storeId, productSku, competitorName, competitorPrice, ourPrice |
| `PRICE_ROLLBACK` | `variant_price` | previousPriceId, restoredPrice, affected store/variant |
| `PRICE_REJECTED` | `pricing_rule` | reason, guardrail violated |

### Inventory And Transfers

| Action | Object type | Expected payload |
| --- | --- | --- |
| `INVENTORY_RECEIVED` | `inventory` | storeId, variantId, quantity, cost, lotId, movementId |
| `INVENTORY_ADJUSTED` | `inventory` | storeId, variantId, before/after quantity, delta, reason, movementId |
| `TRANSFER_CREATED` | `transfer` | fromStoreId, toStoreId, items, actor |
| `TRANSFER_DISPATCHED` | `transfer` | source store, items, stock movement ids |
| `TRANSFER_RECEIVED` | `transfer` | destination store, received items, stock movement ids |
| `TRANSFER_CANCELLED` | `transfer` | source store, released reservations |

### POS And Cash

| Action | Object type | Expected payload |
| --- | --- | --- |
| `POS_CHECKOUT_COMPLETED` | `invoice` | storeId, cashierId, invoiceId, total, paymentMethod, item count |
| `POS_HELD` | `invoice` | storeId, cashierId, invoiceId, reserved items |
| `POS_HELD_CHECKOUT_RESUMED` | `invoice` | storeId, cashierId, invoiceId, paymentMethod |
| `POS_REFUND_CREATED` | `invoice` | storeId, cashierId, invoiceId, items, totalRefund, reason |
| `SHIFT_OPENED` | `pos_shift` | storeId, shiftId, openingCash |
| `SHIFT_CLOSED` | `pos_shift` | storeId, shiftId, closingCash, expectedCash, difference |
| `CASH_MOVEMENT_CREATED` | `cash_movement` | storeId, shiftId, type, amount, reason |

### Returns, Complaints, Reports

| Action | Object type | Expected payload |
| --- | --- | --- |
| `RETURN_CREATED` | `return` | storeId, invoiceId, returnNumber, totalRefund, restock, items |
| `MANAGER_REFUND_CREATED` | `invoice` or `refund` | storeId, invoiceId, totalRefund, items, reason |
| `COMPLAINT_STATUS_UPDATED` | `complaint` | storeId, complaintId/code, beforeStatus, afterStatus, adminNote present flag |
| `COMPLAINT_DELETED` | `complaint` | storeId, complaintId/code, previous status |
| `REPORT_EXPORTED` | `report` | report type, storeId/query scope, date range, format, result |

## Recommended Payload Contract

Without schema changes, use `payload` consistently:

```json
{
  "storeId": 1,
  "result": "success",
  "source": {
    "ip": "request.ip",
    "userAgent": "request.get('user-agent')",
    "requestId": "optional correlation id"
  },
  "before": {},
  "after": {},
  "metadata": {}
}
```

Sensitive values to avoid logging:

- passwords or password hashes
- JWTs, refresh tokens, cookies
- full payment card data
- large base64 images
- unnecessary customer PII when a stable object id is enough

## Safe Implementation Order

1. Standardize a route/service-local audit helper wrapper around `AuditLogsService.createLog`.
2. Add audit logs to user management first: create, update, store assignments, deactivate.
3. Add audit logs to pricing changes and product variant price set/close.
4. Add audit logs to POS refund and shift close/cash movement.
5. Add audit logs to inventory receive/adjust.
6. Add audit logs to transfer create/dispatch/receive/cancel.
7. Add audit logs to complaint status/delete.
8. Upgrade existing return/refund audit payloads to include item details, result, and request source.
9. Add report export audit when export routes are introduced.
10. Add login success/failure audit and failed-login monitoring in an auth-focused phase.

## Implementation Notes For Future Phase

- Prefer writing audit logs inside the same transaction for operations where rollback consistency matters, such as returns, refunds, inventory, and transfers.
- For user/store/pricing changes, capture a minimal before snapshot before mutation and after snapshot after mutation.
- For operations that already create business-ledger rows (`stock_movements`, `cash_movements`, `returns`), include those record IDs in the audit payload instead of duplicating full row contents.
- Treat audit write failures as non-blocking only for low-risk reads. For sensitive mutations, decide explicitly whether audit failure should fail the mutation based on compliance requirements.
- Keep route paths and response shapes unchanged when adding logging.

## Phase 3f Recommendation

Audit logging coverage is currently incomplete and does not meet SAD/ASR expectations for sensitive operations. Phase 3f should be considered analysis-complete, but implementation should proceed in small batches starting with critical identity, pricing, POS refund, and inventory/transfer operations.
