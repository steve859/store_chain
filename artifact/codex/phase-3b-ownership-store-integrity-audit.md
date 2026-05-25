# Phase 3b Ownership and Store Integrity Audit

Date: 2026-05-24

Scope: audit remaining object-level ownership and store-integrity checks after Phase 3b implementations. This report does not change route paths, response shapes, business logic, Prisma schema, or application code.

## Reference Alignment

The SAD and module map target JWT authentication, RBAC, store-scoped authorization, and object-level data integrity for store-specific operations. Phase 2 established route-level auth/RBAC/store-scope. Phase 3a and 3b narrowed the highest-risk object access paths so non-admin users cannot operate on known object IDs from another store.

Relevant target modules:

- `transfers`: inter-store transfer request, dispatch, receive, cancel, and detail visibility.
- `pos` / `transactions`: checkout, receipt, refund, held invoice resume.
- `returns`: return creation, return detail, manager refund.
- `complaints`: complaint submission, handling, resolution, and future ownership handling.
- `invoices`: transaction history and invoice detail.

## Route Matrix

| Route | Route-level protection | Object loaded | Current store/ownership check | Status | Remaining risk |
|---|---|---|---|---|---|
| `GET /api/v1/transfers/:id` | `authenticateToken`, `requireActiveStoreUnlessAdmin`, `authorizeRoles(transferReadRoles)` | `store_transfers` with items and source/destination stores | Non-admin active store must match `from_store_id` or `to_store_id`; ADMIN bypasses | Safe object-level store visibility check present | Missing/invalid transfer store IDs are denied for non-admin by comparison, but ADMIN can view malformed rows |
| `GET /api/v1/complaints/my` | `authenticateToken`, `requireActiveStoreUnlessAdmin`, `authorizeRoles(complaintSubmitRoles)` | Complaint list via `ComplaintsService.list` | Non-admin calls pass `storeId: activeStoreId`; ADMIN omits store filter | Safe store filtering present | Not true ownership; `employeeName` remains client-provided and not bound to JWT |
| `GET /api/v1/complaints/:id` | `authenticateToken`, `requireActiveStoreUnlessAdmin`, `authorizeRoles(complaintDetailRoles)` | Complaint DTO via `ComplaintsService.get` | Non-admin requires finite active store, finite complaint `storeId`, and equality; ADMIN bypasses | Safe strict object-level store check present | No complaint owner binding |
| `PATCH /api/v1/complaints/:id/status` | `authenticateToken`, `requireActiveStoreUnlessAdmin`, `authorizeRoles(complaintStatusRoles)` | Complaint DTO via `ComplaintsService.get` before update | Non-admin requires finite active store, finite complaint `storeId`, and equality; ADMIN bypasses | Safe strict object-level store check present | No complaint owner/resolver model; status update is still handler-local logic |
| `DELETE /api/v1/complaints/:id` | `authenticateToken`, `requireActiveStoreUnlessAdmin`, `authorizeRoles(complaintDeleteRoles)` | Complaint DTO via `ComplaintsService.get` before delete | Same strict non-admin check; ADMIN bypasses | Safe consistency check present | Route is currently ADMIN-only, so non-admin branch is future-safety only |
| `GET /api/v1/invoices/:id` | `authenticateToken`, `requireActiveStoreUnlessAdmin`, `authorizeRoles(invoiceReadRoles)` | `invoices` with store, cashier, and items | Non-admin only checks when `activeStoreId` is finite: `invoice.store_id === activeStoreId`; ADMIN bypasses | Store check exists but not strict for missing active store | If middleware behavior changes or `activeStoreId` is invalid, non-admin check can be skipped; cashier ownership narrowing is not implemented |
| `GET /api/v1/pos/invoices/:id/receipt` | `authenticateToken`, `requireActiveStore`, `authorizeRoles(posOperationalRoles)` | `invoices` with receipt data | Non-admin checks finite active store and invoice store equality; ADMIN also has active-store requirement through POS router | Store check exists | If active store is invalid, non-admin check can be skipped; POS router usually prevents this via `requireActiveStore` |
| `POST /api/v1/pos/refund` | `authenticateToken`, `requireActiveStore`, `authorizeRoles(posRefundRoles)` | Invoice inferred from requested `invoice_items` | Transaction verifies all items belong to one invoice, invoice exists, and `invoice.store_id === activeStoreId` | Store integrity enforced | Store mismatch and missing invoice are thrown as plain `Error`, risking generic 500 behavior instead of stable 4xx |
| `GET /api/v1/returns/:id` | `authenticateToken`, `requireActiveStore`, `authorizeRoles(returnReadRoles)` | `returns` with items, invoice, customer, user | Return must exist and `return.store_id === activeStoreId`; mismatch returns `404 { error: 'Return not found' }` | Safe store hiding present | No ADMIN chain-wide bypass because returns router globally requires active store |
| `POST /api/v1/returns` | `authenticateToken`, `requireActiveStore`, `authorizeRoles(returnCreateRoles)` | Invoice and invoice items inside transaction | Verifies `invoice.store_id === activeStoreId`; creates return with active store | Store integrity enforced | Store mismatch, missing invoice/items, large refund denial, and inventory errors are plain `Error`, risking generic 500 behavior |
| `POST /api/v1/returns/refund` | `authenticateToken`, `requireActiveStore`, `authorizeRoles(managerRefundRoles)` | Invoice inferred from requested `invoice_items` | Verifies all items belong to one invoice and `invoice.store_id === activeStoreId` | Store integrity enforced | Legacy endpoint; store mismatch and validation failures throw plain `Error`, risking generic 500 behavior |

## Safe Checks Confirmed

Phase 3b can confirm safe object-level or store-filtering behavior on:

- `GET /api/v1/transfers/:id`
- `GET /api/v1/complaints/my`
- `GET /api/v1/complaints/:id`
- `PATCH /api/v1/complaints/:id/status`
- `DELETE /api/v1/complaints/:id`
- `GET /api/v1/returns/:id`

The following routes also enforce store integrity, but still have error-handling cleanup work:

- `POST /api/v1/pos/refund`
- `POST /api/v1/returns`
- `POST /api/v1/returns/refund`

The following routes have object-level checks, but are less strict than the Phase 3b complaint policy:

- `GET /api/v1/invoices/:id`
- `GET /api/v1/pos/invoices/:id/receipt`

## Plain Error / 500 Risk

Several high-risk operations enforce store integrity by throwing `Error` inside transactions. This preserves business logic but may flow through the global error handler as a generic 500 depending on current error mapping.

Routes with this risk:

- `POST /api/v1/pos/refund`
  - `Invoice does not belong to this store`
  - `Invoice not found`
  - `Refund items must belong to the same invoice`
  - inventory and quantity validation errors
- `POST /api/v1/returns`
  - `Invoice not found`
  - `Invoice does not belong to this store`
  - item ownership and quantity validation errors
  - `Large refund requires manager/admin approval`
- `POST /api/v1/returns/refund`
  - `Invoice does not belong to this store`
  - item ownership and quantity validation errors
  - inventory errors
- Transfer action routes from Phase 3a still use plain `Error` for missing transfer, missing store IDs, invalid status, inventory, and stock validation, even though cross-store mismatches now return explicit 403 sentinel responses.

Recommended cleanup is to convert known business/security errors to stable 4xx responses without changing success shapes.

## Ownership Model Gaps

These should not be tightened further until the JWT/user model and domain ownership fields are clearly linked:

- `GET /api/v1/complaints/my`
  - Current filter is by client-provided `employeeName` plus active store.
  - True ownership needs a reliable complaint owner field such as `employee_id`, `user_id`, or loyalty member binding.
- `GET /api/v1/invoices/:id`
  - CASHIER can view store-scoped invoice history, but there is no cashier-created-only narrowing.
  - Narrowing would need a policy decision: cashiers may need all store receipts for returns/reprints, or only their own transactions.
- `GET /api/v1/pos/invoices/:id/receipt`
  - Same cashier ownership question as invoice detail.
- `POST /api/v1/pos/refund`, `POST /api/v1/returns`, `POST /api/v1/returns/refund`
  - Store integrity is present, but operator authorization and approval thresholds need a richer refund approval/audit workflow before narrowing by creator or cashier.

## Remaining Gaps by Priority

High:

- Convert store-mismatch and known validation errors in `POST /api/v1/pos/refund`, `POST /api/v1/returns`, and `POST /api/v1/returns/refund` from plain thrown `Error` to explicit 4xx responses.
- Make `GET /api/v1/invoices/:id` strict for non-admin users: deny if active store or invoice store is missing/invalid, not only when active store is finite.

Medium:

- Align `GET /api/v1/pos/invoices/:id/receipt` with the strict non-admin check style, even though `requireActiveStore` currently supplies active store.
- Normalize transfer action error handling for missing transfer, invalid status, and missing store IDs into stable 4xx responses.
- Decide whether returns should support ADMIN chain-wide access via `requireActiveStoreUnlessAdmin`; current behavior intentionally requires active store for all roles.

Low:

- Extract repeated role/admin/store comparison helpers to reduce router duplication once security behavior stabilizes.
- Move return/refund and POS refund transaction logic out of routers into service/repository layers per target module-map direction.

## Phase 3b Completion Recommendation

Phase 3b can be considered complete for the intended scope: the implemented routes now have safe object-level store checks or conservative active-store filtering without adding an unsafe ownership model.

The remaining work is best handled as Phase 3c because it is primarily error-contract hardening and ownership-model design, not missing object-level store checks in the Phase 3b set.

## Recommended Next Phase 3 Tasks

1. Phase 3c: error-contract hardening for refund/return/transfer transaction routes.
   - Replace known store mismatch and domain validation `throw new Error(...)` paths with explicit 400/403/404/409 responses or typed domain errors.
   - Preserve all success shapes.

2. Phase 3d: strict invoice and receipt object-store checks.
   - Harden `GET /api/v1/invoices/:id`.
   - Harden `GET /api/v1/pos/invoices/:id/receipt`.

3. Phase 3e: ownership model design.
   - Define how JWT users map to complaints, invoice creators, cashier sessions, loyalty members, and employee records.
   - Do not implement cashier/member self-service narrowing until this model exists.

4. Phase 3f: audit logging coverage.
   - Verify audit entries for refund, return, transfer dispatch/receive/cancel, complaint status/delete, and sensitive invoice access where required.
