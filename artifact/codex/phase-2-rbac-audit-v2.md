# Phase 2 RBAC Audit v2

Date: 2026-05-24

## Scope

This audit re-inspected mounted backend route groups under `/api/v1` after Phase 2n, 2o, 2p, and 2q. It compares current route protection with `artifact/design/SAD.md`, `artifact/asr/ASR.md`, and `artifact/codex/module-map.md`.

No application code was changed for this audit.

## Summary

Phase 2 can be considered complete for route-level authentication and RBAC hardening across the currently mounted `/api/v1` business route groups, with known exclusions documented below.

The main remaining risks are no longer broad missing RBAC. They are deeper authorization and architecture items:

- ownership enforcement for cashier/member/self-service flows
- handler-level store-integrity checks for selected cross-store sensitive operations
- audit logging coverage for sensitive writes
- missing target modules such as `roles`, `transactions`, `dashboard`, and `analytics`
- legacy/deprecated route groups still mounted

## Mounted Route Groups

| Route group | authenticateToken coverage | RBAC coverage | Store-scope coverage | Remaining missing protection | Intentional public / legacy status |
|---|---|---|---|---|---|
| `GET /api/v1` | None | None | None | None for metadata | Public API metadata |
| `/api/v1/auth` | `GET /me` only | None | active store resolved by auth token when present | login audit/rate-limit depth not fully assessed here | `POST /auth/login` public by design |
| `/api/v1/audit-logs` | router-wide | `GET /` admin-only | none | no store scope; acceptable for global admin log access | protected |
| `/api/v1/categories` | all routes | all routes after Phase 2q | none | no major route-level gap | protected catalog metadata |
| `/api/v1/stores` | router-wide | all routes | handler-level role-aware filtering/checks | no region-aware District Manager model | protected |
| `/api/v1/products` | router-wide | all routes | catalog and variant-price routes require active store | no major route-level gap | protected |
| `/api/v1/inventory` | router-wide | all routes | route-level store scope on read/write/lookup routes | no major route-level gap | protected |
| `/api/v1/maintenance` | router-wide | all routes | none | status visibility may be too broad for production | protected system route |
| `/api/v1/orders` | router-wide | all routes after Phase 2n | route-level store scope on all routes after Phase 2n | detail/delete still lack handler-level PO-store ownership check | protected |
| `/api/v1/sales` | router-wide | inline admin-only legacy gate | none | no standard `authorizeRoles`; legacy schema | deprecated legacy route, non-admin gets `410` |
| `/api/v1/invoices` | router-wide | all routes after Phase 2o | router-wide `requireActiveStoreUnlessAdmin`; detail has inline store check | cashier ownership narrowing deferred | protected transaction history |
| `/api/v1/users` | router-wide | router-wide admin-only | none | no major route-level gap | protected |
| `/api/v1/pos` | router-wide | all routes | router-wide `requireActiveStore`; selected inline checks | held-cart resume lacks active-store match against held invoice | protected |
| `/api/v1/promotions` | router-wide | all routes | none | store-targeted promotion scope depends on service/data model | protected |
| `/api/v1/reports` | router-wide | all routes | router-wide `requireActiveStoreUnlessAdmin` | only dashboard-style reports exist; export/chain/analytics routes missing | protected |
| `/api/v1/settings` | router-wide | all routes | none | no store scope; acceptable for current global settings model | protected |
| `/api/v1/suppliers` | router-wide | all routes after Phase 2q | none | supplier reads expose full records to allowed procurement roles | protected procurement metadata |
| `/api/v1/transfers` | router-wide | all routes | route-level store scope on list/detail/actions | dispatch/receive/cancel do not yet enforce source/destination ownership semantics | protected |
| `/api/v1/returns` | router-wide | all routes | router-wide `requireActiveStore`; inline invoice/return checks | admin also needs active store due current route policy | protected |
| `/api/v1/complaints` | router-wide | all routes | router-wide `requireActiveStoreUnlessAdmin`; inline checks | self-service ownership not safe; `employeeName` trust remains | member access deferred |
| `/api/v1/loyalty` | router-wide | all routes | no global store scope; enroll maps active store if present | no `LOYALTY_MEMBER`; no loyaltyId ownership binding | member self-service deferred |
| `/api/v1/pricing` | router-wide | all routes after Phase 2p | router-wide `requireActiveStore` | pricing rollback/A-B routes missing from target architecture | protected |

## Remaining Gaps by Priority

### Critical

None at the broad route-middleware level for currently mounted primary `/api/v1` business route groups.

The original critical gap of unauthenticated or un-RBACed sensitive modules has been addressed across the active modules covered in Phase 2.

### High

1. POS held-cart resume store integrity
   - `POST /api/v1/pos/resume/:id/checkout` requires auth, RBAC, and active store, but the handler resumes using the held invoice store without explicitly matching it to `req.activeStoreId`.
   - Risk: cross-store held invoice completion and stock movement if an invoice id is known.

2. Transfer action ownership semantics
   - Transfer action routes have auth/RBAC/store-scope middleware, but Phase 2 intentionally did not add source/destination ownership checks for dispatch, receive, and cancel.
   - Risk: users with active store access may affect transfers whose operational ownership should depend on source/destination store and status.

3. Orders detail/delete handler-level store integrity
   - `/orders/:id` detail and delete now have route-level store scope and RBAC, but handlers do not explicitly verify the loaded purchase order belongs to the active store.
   - Risk: route-level scope is present, but object-level authorization is incomplete.

4. Audit logging is incomplete for sensitive operations
   - SAD/ASR expects audit logs for user/role changes, pricing, inventory, transfers, report exports, complaints, and sensitive POS/return actions.
   - Current route protection does not guarantee append-only audit coverage.

### Medium

1. Member and ownership authorization deferred
   - Loyalty member self-service is not enabled because JWT does not bind `loyaltyId` or member identity.
   - Complaint `/my` still depends on `employeeName` semantics rather than robust ownership.
   - Cashier transaction-history narrowing was deferred; cashier invoice access remains store-scoped.

2. Promotion store scope
   - Promotion routes have RBAC, but no route-level store-scope middleware.
   - If promotions are store-targeted, service-level scope should be verified and documented.

3. District Manager region model
   - Current auth/store scope is based on store ids and active store.
   - SAD/ASR describe region/chain access, but no explicit region assignment model is consistently enforced.

4. Legacy `/api/v1/sales`
   - Route is still mounted and protected by an inline admin-only/deprecated gate returning `410` for non-admin.
   - It does not use standard RBAC middleware and relies on legacy UUID schema.

5. Maintenance route posture
   - `/maintenance/status` permits manager/store manager roles.
   - Production posture may require admin-only visibility or sanitized operational status.

### Low

1. Public metadata
   - `GET /api/v1` is public and lists some routes.
   - Acceptable for development, but production exposure should be reviewed.

2. Public non-`/api/v1` operational endpoints
   - `/health`, `/metrics`, and Swagger are outside this requested audit scope but should be reviewed before production.

3. Supplier read data minimization
   - Supplier reads are now RBAC protected but still return full supplier records to allowed roles.
   - A later data-minimization pass may define list/detail view models.

4. Role constants are duplicated across routers
   - Route-level protection is now explicit, but role arrays are repeated in many modules.
   - Centralized role policy constants would reduce drift.

## Comparison With SAD / ASR / Module Map

### Aligned

- Protected business endpoints now generally enforce JWT and backend RBAC.
- Store-specific modules generally use `requireActiveStore` or `requireActiveStoreUnlessAdmin`.
- Pricing reads and writes are now RBAC protected and active-store scoped.
- Transaction history via `/invoices` is now RBAC protected and store scoped.
- Orders/procurement routes are now RBAC protected and the status route has explicit store-scope middleware.
- Categories and suppliers read routes now have explicit RBAC.
- The current backend better matches SAD security principles: backend is the final enforcement point, not frontend layout alone.

### Partially Aligned

- Reports expose dashboard-style reads only; target `reports` includes store report, chain report, and export.
- Analytics and realtime dashboard stream requirements are not represented as a dedicated `/analytics` module.
- District Manager behavior is role-aware but not region-model aware.
- POS, orders, transfers, returns, and inventory use transactions in important places, but audit coverage is inconsistent.
- Some modules still keep business logic directly in routers rather than the target `routes -> controllers -> services -> repositories` dependency direction.

### Not Yet Aligned

- Dedicated target modules for `roles`, `transactions`, `dashboard`, and `analytics` are absent or represented indirectly.
- Loyalty member self-service and complaint member ownership are not safely enforceable with the current JWT model.
- Pricing target capabilities for A/B tests and rollback routes are not implemented as public route groups.
- Report export and generated report persistence are not implemented as described in ASR UC28.
- WebSocket/store-scoped realtime authorization was not part of Phase 2 and remains to be audited separately.

## Phase 2 Completion Recommendation

Phase 2 can be considered complete for the agreed scope: route-level authentication, RBAC, and store-scope baseline alignment for mounted `/api/v1` backend routes.

Do not continue adding more route-level RBAC phases unless a new route group is added or a missed mounted route is discovered. The next meaningful work is object-level authorization, ownership, audit logging, and module-boundary cleanup.

## Recommended Phase 3 Tasks

### Phase 3a: Object-Level Store Integrity

- Add active-store object ownership checks to:
  - `POST /pos/resume/:id/checkout`
  - `GET /orders/:id`
  - `DELETE /orders/:id`
  - transfer dispatch/receive/cancel operations
- Keep route paths and response shapes stable unless explicitly approved.
- Add tests for cross-store object access.

### Phase 3b: Ownership and Self-Service Model

- Extend JWT/session model or lookup layer to bind:
  - users to employee/cashier identity
  - loyalty members to `loyaltyId`
  - complaint submitters to a stable user/member identity
- Revisit:
  - cashier invoice history: own transactions vs active-store transactions
  - `LOYALTY_MEMBER` access to loyalty balance/history/offers/redeem
  - complaint `/my` ownership

### Phase 3c: Audit Logging Coverage

- Define audit event taxonomy and add append-only logs for:
  - users and roles changes
  - store mutations
  - pricing rule/demand/competitor changes
  - inventory adjustments and receiving
  - transfer lifecycle actions
  - POS refund, close shift, cash movement
  - returns/refunds
  - complaint status/delete
  - report export when implemented

### Phase 3d: Store/Region Scope Model

- Formalize District Manager region/store assignments.
- Decide how admin, district, store manager, inventory staff, and cashier scopes are represented in JWT and database.
- Add shared helpers for object-level store/region authorization.

### Phase 3e: Legacy and Public Surface Cleanup

- Decide whether `/api/v1/sales` should be removed, hidden, or converted to standard admin-only middleware.
- Review production exposure of:
  - `/api/v1` route metadata
  - `/health`
  - `/metrics`
  - Swagger docs

### Phase 3f: Module-Boundary Cleanup

- Continue moving large routers toward:
  - router
  - controller
  - service
  - repository
- Prioritize modules with large route-contained business logic:
  - `pos`
  - `orders`
  - `inventory`
  - `transfers`
  - `returns`
  - `products`

### Phase 3g: Missing Target Modules

- Plan dedicated modules or route aliases for:
  - `roles`
  - `transactions`
  - `dashboard`
  - `analytics`
- Avoid introducing routes until API shape and frontend usage are agreed.

