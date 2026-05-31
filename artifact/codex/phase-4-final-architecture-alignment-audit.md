# Phase 4 Final Architecture Alignment Audit

Date: 2026-05-25

## Scope

This is a final architecture alignment audit after Phase 4 backend refactors.

No application code, route paths, request/response shapes, middleware, business logic, Prisma schema, cache behavior, or audit behavior were changed by this report.

## Sources Reviewed

- `artifact/design/SAD.md`
- `artifact/design/ADD.md`
- `artifact/codex/phase-4-fast-refactor-plan.md`
- `artifact/codex/phase-4-midpoint-architecture-audit.md`
- `artifact/codex/phase-3-final-security-audit-closure.md`
- current `backend/src/routes/index.ts`
- current `backend/src/modules/*` structure

## SAD/ADD Target

SAD/ADD define the backend as a Node.js/Express modular monolith with domain modules, PostgreSQL transactions, Redis cache/queue/PubSub where applicable, REST routes under `/api/v1`, JWT/RBAC/store-scoped authorization, and audit logging for sensitive operations.

The implementation-view target is:

```text
router -> controller -> service -> repository -> Prisma/PostgreSQL
```

Routers should primarily own route paths and middleware. Controllers should own HTTP parsing and response mapping. Services should own orchestration, business rules, store/object policy, cache/audit decisions, and transaction intent. Repositories should own Prisma queries and transaction details.

## Current Mounted Route Groups

`backend/src/routes/index.ts` currently mounts these `/api/v1` route groups:

- `/audit-logs`
- `/auth`
- `/categories`
- `/stores`
- `/products`
- `/inventory`
- `/maintenance`
- `/orders`
- `/sales`
- `/invoices`
- `/users`
- `/pos`
- `/promotions`
- `/reports`
- `/settings`
- `/suppliers`
- `/transfers`
- `/returns`
- `/complaints`
- `/loyalty`
- `/pricing`

## Fully Aligned Modules

These modules currently have router/controller/service/repository boundaries and materially match the SAD/ADD module pattern.

| Module | Router | Controller | Service | Repository | Alignment |
|---|---:|---:|---:|---:|---|
| `stores` | yes | yes | yes | yes | Fully aligned |
| `promotions` | yes | yes | yes | yes | Fully aligned |
| `users` | yes | yes | yes | yes | Fully aligned |
| `complaints` | yes | yes | yes | yes | Fully aligned |
| `invoices` | yes | yes | yes | yes | Fully aligned |
| `products` | yes | yes | yes | yes | Fully aligned |
| `orders` | yes | yes | yes | yes | Fully aligned |
| `inventory` | yes | yes | yes | yes | Fully aligned |
| `transfers` | yes | yes | yes | yes | Fully aligned |
| `returns` | yes | yes | yes | yes | Fully aligned |
| `pos` | yes | yes | yes | yes | Fully aligned |
| `categories` | yes | yes | yes | yes | Fully aligned |
| `suppliers` | yes | yes | yes | yes | Fully aligned |
| `settings` | yes | yes | yes | yes | Fully aligned |
| `audit_logs` | yes | yes | yes | yes | Fully aligned |

## Partially Aligned Modules

| Module | Current structure | Remaining gap |
|---|---|---|
| `pricing` | router/controller/service | Repository extraction remains. Pricing service still carries persistence responsibilities. |
| `loyalty` | router/controller/service | Repository extraction remains. Ownership/member binding is intentionally deferred. |
| `reports` | router/service | Controller/repository split remains. Report export audit remains deferred until export routes are formalized. |
| `auth` | router/service | Controller/repository split remains. Login success/failure audit remains deferred. |
| `maintenance` | router/service | Controller/repository split remains, lower priority because it is operational/supporting scope. |
| `audit` | service only | Helper/service-style module, not a mounted full domain boundary. |
| `cron` | scheduler only | Infrastructure/background scheduler, not a full HTTP module. |

## Still Router-Heavy Modules

The main remaining router-heavy area is `sales`, which was not part of the Phase 4 completed refactor set.

| Router | Lines | Current concern |
|---|---:|---|
| `backend/src/modules/sales/sales.router.ts` | 369 | Direct Prisma access and query logic remain in router. |
| `backend/src/modules/sales/checkout.router.ts` | 353 | Checkout-specific routing remains substantial. |

Current router scan found direct Prisma access in `sales` routers. The Phase 4 target modules no longer show direct Prisma use in their routers; products router still intentionally contains catalog cache middleware wiring.

## Thin Router Check

After Phase 4, the formerly high-risk routers are now thin:

| Module router | Lines | Result |
|---|---:|---|
| `pos/pos.router.ts` | 22 | Thin |
| `returns/returns.router.ts` | 43 | Thin |
| `transfers/transfers.router.ts` | 40 | Thin |
| `inventory/inventory.router.ts` | 63 | Thin |
| `orders/orders.router.ts` | 43 | Thin |
| `products/products.router.ts` | 65 | Thin; keeps catalog cache middleware |
| `stores/stores.router.ts` | 40 | Thin |
| `complaints/complaints.router.ts` | 26 | Thin |
| `users/users.router.ts` | 24 | Thin |
| `promotions/promotions.router.ts` | 22 | Thin |
| `invoices/invoices.router.ts` | 16 | Thin |

These routers now primarily contain route paths, middleware, role constants where needed, cache middleware where applicable, and controller calls.

## Completed Phase 4 Refactors

| Phase | Module | Result | Key behavior preserved |
|---|---|---|---|
| 4a | `stores` | Split into router/controller/service/repository | Store RBAC, response shapes, `STORE_CREATED`, `STORE_UPDATED`, `STORE_DEACTIVATED` |
| 4b | `promotions` | Split into router/controller/service/repository | Promotion RBAC, validate behavior, `PROMOTION_CREATED`, `PROMOTION_UPDATED`, `PROMOTION_DELETED` |
| 4c | `users` | Split into router/controller/service/repository | ADMIN-only users routes, password handling, user audit actions |
| 4d | `complaints` | Split into router/controller/service/repository | `/my` store filtering, strict store checks, complaint audit actions |
| 4e | `invoices` | Split into router/controller/service/repository | Invoice read RBAC, strict non-admin detail store check, ADMIN bypass |
| 4f | `products` | Split into router/controller/service/repository | Product/catalog RBAC, active-store catalog/price behavior, cache invalidation, variant price audit |
| 4g | `orders` | Split into router/controller/service/repository | Purchase order lifecycle, status/detail/delete store checks, receive/cache behavior |
| 4h | `inventory` | Split into router/controller/service/repository | Receive/adjust transactions, stock movements, cache invalidation, inventory audit |
| 4i | `transfers` | Split into router/controller/service/repository | Source/destination store checks, reserved stock, stock movements, transfer audit |
| 4j | `returns` | Split into router/controller/service/repository | Stable 4xx error contracts, transaction-bound return/refund audit, `auditLogId` behavior |
| 4k | `pos` | Split into router/controller/service/repository | Checkout, refund, receipt, hold/resume, shifts, cash movement, POS audit actions |

## Phase 3 Locked Behavior Preservation

Phase 4 treated Phase 3 as locked compatibility requirements. Based on the current module structure and completed focused verification during the implementation batches, the following behavior remains preserved.

### RBAC And Store Scope

Preserved across refactored modules:

- `stores`, `promotions`, `users`, `complaints`, `invoices`, `products`
- `orders`, `inventory`, `transfers`, `returns`, `pos`

Routers still own middleware placement, and the refactors moved handler logic behind controller calls without changing route declarations or middleware ordering.

### Object-Level Store Checks

Preserved:

- POS resume checkout active-store check.
- Orders detail/delete/status non-admin active-store checks with ADMIN bypass where expected.
- Transfers detail/dispatch/receive/cancel source/destination active-store checks with ADMIN bypass where expected.
- Complaints `/my` non-admin store filtering and strict detail/status/delete store policy.
- Invoice detail strict non-admin store policy with ADMIN bypass.
- POS receipt strict active-store policy with no ADMIN bypass.
- Returns and refund store integrity checks.

### Error Contracts

Preserved:

- POS refund known domain/security failures return stable `400`, `403`, `404`, or `409` responses.
- Standard returns known failures return stable `400`, `403`, `404`, or `409` responses.
- Legacy manager refund known failures return stable `400`, `403`, `404`, or `409` responses.
- Unknown exceptions continue to flow to existing error handling.

### Audit Logging

Preserved audit actions:

- User management: `USER_CREATED`, `USER_UPDATED`, `USER_STORE_ASSIGNMENTS_UPDATED`, `USER_DEACTIVATED`
- Pricing and variant pricing: `PRICING_RULE_CREATED`, `DEMAND_METRICS_UPDATED`, `COMPETITOR_PRICE_RECORDED`, `VARIANT_PRICE_SET`, `VARIANT_PRICE_CLOSED`
- POS: `POS_REFUND_CREATED`, `SHIFT_CLOSED`, `CASH_MOVEMENT_CREATED`, `POS_CHECKOUT_COMPLETED`
- Inventory and transfers: `INVENTORY_RECEIVED`, `INVENTORY_ADJUSTED`, `TRANSFER_CREATED`, `TRANSFER_DISPATCHED`, `TRANSFER_RECEIVED`, `TRANSFER_CANCELLED`
- Returns/refunds and complaints: `RETURN_CREATED`, `MANAGER_REFUND_CREATED`, `COMPLAINT_STATUS_UPDATED`, `COMPLAINT_DELETED`
- Master data: `STORE_CREATED`, `STORE_UPDATED`, `STORE_DEACTIVATED`, `PROMOTION_CREATED`, `PROMOTION_UPDATED`, `PROMOTION_DELETED`, `SUPPLIER_CREATED`, `SUPPLIER_UPDATED`, `SUPPLIER_DELETED`

Best-effort audit behavior remains where intended. Returns/refunds remain transaction-bound where required, including `POST /returns/refund` `refund.auditLogId` behavior and `stock_movements.reference_id = audit:<id>`.

Sensitive audit payload exclusions remain part of the service/controller behavior:

- no full request bodies
- no auth headers
- no tokens
- no passwords or password hashes
- no secrets
- no raw phone/email/address/contact/note fields where presence flags are used
- no full customer records
- no full invoice/receipt payloads
- no full complaint description or image payloads

### Cache Invalidation

Preserved:

- Product catalog cache read middleware remains wired on the catalog route.
- Product/variant/variant-price mutations preserve catalog cache invalidation.
- Inventory receive/adjust preserve catalog cache invalidation after successful mutation.
- Orders receive preserves catalog cache invalidation behavior where previously present.

## Remaining Architecture Debt

| Debt | Status | Blocking submission/demo? | Recommendation |
|---|---|---:|---|
| Shared audit helper | Deferred | No | Extract after module boundaries settle to reduce duplicated best-effort wrappers. |
| Shared redaction helper | Deferred | No | Add a whitelist-based utility for audit payloads and capped previews. |
| Shared typed error/domain error helper | Deferred | No | Replace route-local sentinels gradually without changing error bodies. |
| Ownership implementation | Deferred by Phase 3e | No | Requires schema/JWT/member binding decisions and migration/backfill. |
| Auth login success/failure audit | Deferred | No | Implement as a focused auth governance batch. |
| Settings write audit | Deferred | No | Implement as a focused settings governance batch. |
| Redis/socket boundaries | Partial | No | Formalize cache, queue, Pub/Sub, and socket adapters as infrastructure modules. |
| Optional POS sub-service split | Deferred | No | Split `pos.service.ts` into shift/checkout/refund sub-services only if maintainability requires it. |
| Transaction helper cleanup in repositories | Deferred | No | Consolidate repeated transaction patterns after behavior is stable. |
| Pricing repository extraction | Partial | No | Add `pricing.repository.ts` in a small follow-up. |
| Loyalty repository extraction | Partial | No | Add repository boundary after ownership/member policy is settled. |
| Reports controller/repository split | Partial | No | Refactor before adding export/report-generation audit. |
| Sales router cleanup | Remaining router-heavy area | No for current Phase 4 core scope | Decide whether `sales` is legacy/parallel POS, then refactor or retire with migration plan. |

## Alignment Assessment

The backend is now substantially aligned with SAD/ADD for the core operational modules:

- store governance
- user administration
- product catalog
- promotions
- complaints
- invoice history
- purchase orders
- inventory
- transfers
- returns/refunds
- POS

The highest-risk Phase 4 modules have been moved to controller/service/repository boundaries while preserving Phase 3 security, integrity, audit, error-contract, and cache behavior.

Remaining gaps are mostly secondary architecture cleanup or deferred security/product decisions that were already identified as non-blocking:

- ownership narrowing needs schema/JWT design work
- auth/settings audit are separate small governance batches
- shared helpers can be introduced after the structural refactor
- `sales` needs an explicit legacy-vs-active-module decision
- Redis/socket/report-export boundaries can be refined in later architecture hardening

## Final Recommendation

The backend is sufficiently aligned with SAD/ADD for submission or demo.

It is not a finished clean architecture in every module, but the central SAD/ADD capabilities are now represented by domain modules with clear boundaries, thin routers, preserved security controls, preserved audit coverage, and preserved transaction-sensitive behavior.

Recommended next phase options:

1. Phase 5 architecture cleanup: shared audit/redaction/error helpers and repository transaction helper cleanup.
2. Auth/settings governance: login success/failure audit and settings write audit.
3. Ownership implementation planning: schema/JWT/member binding migration plan from Phase 3e.
4. Sales module decision: classify as legacy/parallel POS, then refactor or remove through an explicit API migration plan.
5. Infrastructure hardening: formal Redis/cache/queue/socket adapter boundaries and report/export audit coverage.
