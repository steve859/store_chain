# Phase 2 RBAC Audit

Date: 2026-05-24

## Scope

This audit inspected mounted backend route groups under `/api/v1` and router files under `backend/src/modules`. It compares current route protection with the target architecture in `artifact/design/SAD.md`, `artifact/asr/ASR.md`, and `artifact/codex/module-map.md`.

Phase 2 materially improved protection across core modules. Most primary business modules now have JWT authentication, explicit RBAC, and store-scope middleware where store-specific data is handled. Remaining gaps are concentrated in legacy/adjacent route groups and a few read routes that still lack RBAC.

## Target Baseline

The architecture target requires:

- JWT authentication for protected endpoints.
- RBAC enforced in backend middleware, not only frontend route guards.
- Store-scoped authorization for store-specific data.
- Audit logging for sensitive operations.
- Public access only for intentional entry points such as login, health, metrics, and API metadata.

Relevant role model:

- `ADMIN`
- `DISTRICT_MANAGER`
- `STORE_MANAGER`
- `CASHIER`
- `INVENTORY_STAFF`
- `LOYALTY_MEMBER`
- system/background processes where applicable

## Mounted `/api/v1` Route Groups

Mounted in `backend/src/routes/index.ts`:

| Route group | Router | Status |
|---|---|---|
| `/api/v1` | routes index | Public metadata |
| `/api/v1/auth` | `auth.router.ts` | Partially public by design |
| `/api/v1/audit-logs` | `audit_logs.router.ts` | Protected |
| `/api/v1/categories` | `categories.router.ts` | Partially protected |
| `/api/v1/stores` | `stores.router.ts` | Protected |
| `/api/v1/products` | `products.router.ts` | Protected |
| `/api/v1/inventory` | `inventory.router.ts` | Protected |
| `/api/v1/maintenance` | `maintenance.router.ts` | Protected |
| `/api/v1/orders` | `orders.router.ts` | Auth/store scoped, RBAC gap |
| `/api/v1/sales` | `sales.router.ts` | Legacy admin-only gate |
| `/api/v1/invoices` | `invoices.router.ts` | Auth/store scoped, RBAC gap |
| `/api/v1/users` | `users.router.ts` | Protected |
| `/api/v1/pos` | `pos.router.ts` | Protected |
| `/api/v1/promotions` | `promotions.router.ts` | Protected |
| `/api/v1/reports` | `reports.router.ts` | Protected |
| `/api/v1/settings` | `settings.router.ts` | Protected |
| `/api/v1/suppliers` | `suppliers.router.ts` | Partially protected |
| `/api/v1/transfers` | `transfers.router.ts` | Protected |
| `/api/v1/returns` | `returns.router.ts` | Protected |
| `/api/v1/complaints` | `complaints.router.ts` | Protected |
| `/api/v1/loyalty` | `loyalty.router.ts` | Protected, member self-service deferred |
| `/api/v1/pricing` | `pricing.router.ts` | Partially protected |

## Route Group Protection Matrix

| Group | authenticateToken coverage | RBAC coverage | Store-scope coverage | Missing protection | Intentionally public / excluded / legacy |
|---|---|---|---|---|---|
| `/api/v1` | None | None | None | None for metadata route | `GET /api/v1` is public API metadata |
| `/auth` | `GET /me` only | None | Active store resolved by auth token where applicable | None for login; `/me` has no role check, which is acceptable for self-profile | `POST /auth/login` public by design with auth rate limiter |
| `/audit-logs` | Router-wide | `GET /` admin-only | None | No store scope; acceptable if logs are admin/global | None |
| `/categories` | Per-route on all routes | Writes/delete only | None | `GET /categories`, `GET /categories/:id` have no RBAC; may be acceptable for authenticated catalog browsing but should be explicit | None |
| `/stores` | Router-wide | All routes | Handler-level role-aware filtering/checks | Store-scope middleware is not global; current behavior is role-aware service/query logic | None |
| `/products` | Router-wide | All routes | Catalog and variant-price routes require active store; master-data routes intentionally not store scoped | No major Phase 2 gaps | None |
| `/inventory` | Router-wide | All routes | Read/write routes use `requireActiveStore` or `requireActiveStoreUnlessAdmin`; legacy `/stores/:storeId` routes keep inline checks | No major Phase 2 gaps | None |
| `/maintenance` | Router-wide | All routes | None | No store scope; likely acceptable for system-level operations | System operations; should remain admin/manager restricted |
| `/orders` | Router-wide | None | Most routes store scoped except `POST /:id/status` | RBAC missing on every route; `POST /:id/status` also lacks explicit store scope | Purchase order module remains Phase 2 gap |
| `/sales` | Router-wide | Router-level admin-only legacy gate via inline middleware | None | No `authorizeRoles`; no store-scope checks | Intentionally legacy/deprecated, returns `410` for non-admin |
| `/invoices` | Router-wide | None | Router-wide `requireActiveStoreUnlessAdmin`; detail has inline store check | RBAC missing on invoice list/detail | Transaction history target module still incomplete |
| `/users` | Router-wide | Router-wide admin-only | None | No store scope; appropriate for admin user management | None |
| `/pos` | Router-wide | All routes | Router-wide `requireActiveStore`; receipt/refund keep inline invoice checks | `POST /pos/resume/:id/checkout` lacks explicit active-store match against held invoice | None |
| `/promotions` | Router-wide | All routes | None | Store targeting is service/data dependent, no store-scope middleware | `/validate` allows cashier for POS-compatible validation |
| `/reports` | Router-wide | All routes | Router-wide `requireActiveStoreUnlessAdmin` | Only dashboard-style reports exist; chain/export/analytics routes missing | None |
| `/settings` | Router-wide | All routes | None | No store scope; acceptable for global settings as currently modeled | None |
| `/suppliers` | Router-wide | Writes/delete only | None | `GET /suppliers`, `GET /suppliers/:id` have no RBAC; no store scope | Reads may be broadly authenticated, but policy should be explicit |
| `/transfers` | Router-wide | All routes | List/detail/action routes use `requireActiveStoreUnlessAdmin`; create requires active store | Handler-level source/destination ownership checks not fully normalized | None |
| `/returns` | Router-wide | All routes | Router-wide `requireActiveStore`; inline invoice/return checks preserved | Admin also requires active store due current global middleware | None |
| `/complaints` | Router-wide | All routes | Router-wide `requireActiveStoreUnlessAdmin`; inline detail/status/delete checks preserved | Self-service/ownership not safely enforced; `LOYALTY_MEMBER` excluded | Member complaint flow deferred |
| `/loyalty` | Router-wide | All routes | No global store scope; enroll has compatibility mapping from active store if present | No member ownership enforcement; `LOYALTY_MEMBER` excluded | Member self-service deferred because JWT lacks ownership binding |
| `/pricing` | Router-wide | Mutating routes only | Router-wide `requireActiveStore` | `GET /recommend`, `GET /history/:productVariantId`, `GET /competitors` have no RBAC | Read routes intentionally left authenticated-only in Phase 2a |

## Detailed Remaining Gaps

### High Priority

1. `/api/v1/orders`
   - Current: authenticated, mostly store scoped, no RBAC.
   - Gap: purchase order create/delete/status/receive are sensitive inventory/procurement operations.
   - Specific issue: `POST /orders/:id/status` has neither explicit store-scope middleware nor RBAC.
   - Target alignment: ASR inventory and transfer requirements restrict stock/procurement actions to `ADMIN`, `STORE_MANAGER`, and `INVENTORY_STAFF`, with approval-like actions likely restricted further.

2. `/api/v1/invoices`
   - Current: authenticated and store scoped, no RBAC.
   - Gap: invoice list/detail expose transaction history and customer/cashier/store data.
   - Target alignment: ASR UC17 requires transaction history visibility restricted by role and scope.
   - Recommended roles: `ADMIN`, `DISTRICT_MANAGER`, `STORE_MANAGER`, `CASHIER`; consider cashier narrowing to own transactions in a later ownership phase.

3. POS held-cart resume integrity
   - Current: `POST /pos/resume/:id/checkout` requires active store and RBAC, but resumes using the held invoice store without checking it matches `req.activeStoreId`.
   - Gap: store-scope middleware is present, but handler-level ownership validation is incomplete.
   - Recommended next phase: add explicit active-store match for held invoices before stock movement.

### Medium Priority

4. `/api/v1/pricing` read routes
   - Current: authenticated and active-store scoped; no RBAC on:
     - `GET /pricing/recommend`
     - `GET /pricing/history/:productVariantId`
     - `GET /pricing/competitors`
   - Gap: ASR UC15 restricts price history to `ADMIN`, `DISTRICT_MANAGER`, `STORE_MANAGER`.
   - Recommended roles:
     - recommendation: `ADMIN`, `DISTRICT_MANAGER`, `STORE_MANAGER`
     - history: `ADMIN`, `DISTRICT_MANAGER`, `STORE_MANAGER`
     - competitors: `ADMIN`, `DISTRICT_MANAGER`, `STORE_MANAGER`

5. `/api/v1/categories` reads
   - Current: authenticated, no RBAC for reads.
   - Gap: role policy is implicit.
   - Recommended roles: align with product catalog reads: `ADMIN`, `DISTRICT_MANAGER`, `STORE_MANAGER`, `INVENTORY_STAFF`, and possibly `CASHIER` if POS/catalog UI needs categories.

6. `/api/v1/suppliers` reads
   - Current: authenticated, no RBAC for reads.
   - Gap: supplier data may be procurement-sensitive.
   - Recommended roles: `ADMIN`, `STORE_MANAGER`, `INVENTORY_STAFF`; consider `DISTRICT_MANAGER` for read-only oversight.

7. `/api/v1/promotions` store scope
   - Current: authenticated and RBAC protected, no route-level store-scope middleware.
   - Gap: if promotions can be store-specific, route/service logic should enforce target-store scope.
   - Recommended follow-up: inspect promotion model and add store-scope checks where promotion rules target stores.

### Medium/Low Priority

8. `/api/v1/sales`
   - Current: authenticated, inline admin-only legacy gate, returns `410` for non-admin.
   - Gap: no standard `authorizeRoles` middleware or store scope.
   - Recommended approach: keep legacy/deprecated for now, then remove from public route map or replace inline gate with `authorizeRoles(['ADMIN'])`.

9. `/api/v1/maintenance`
   - Current: authenticated and RBAC protected.
   - Gap: status allows `manager` / `store_manager`; system maintenance may be too broad depending production posture.
   - Recommended follow-up: decide whether maintenance status should be `ADMIN` only or remain manager-visible.

10. `/api/v1/loyalty`
   - Current: authenticated and staff RBAC protected; no `LOYALTY_MEMBER`.
   - Gap: member ownership cannot be enforced because JWT does not bind `loyaltyId` or member identity.
   - Recommended follow-up: introduce member identity binding before exposing self-service routes.

11. `/api/v1/complaints`
   - Current: authenticated, RBAC protected, store scoped.
   - Gap: `/complaints/my` still trusts `employeeName` query semantics; member/self-service ownership is deferred.
   - Recommended follow-up: add user/member ownership model before `LOYALTY_MEMBER` access.

## Intentionally Public Routes

| Route | Reason |
|---|---|
| `GET /api/v1` | API version/status metadata |
| `POST /api/v1/auth/login` | Login entry point; protected by auth rate limiter |

Outside `/api/v1`, current public operational endpoints include `/health`, `/metrics`, and Swagger documentation. They were not part of the requested `/api/v1` route-group audit but should be reviewed before production exposure.

## Intentionally Excluded or Legacy Routes

| Route group | Current reason |
|---|---|
| `/api/v1/sales` | Legacy UUID-based sales module; non-admin requests receive `410`; current app uses `/pos` and `/invoices` |
| `backend/src/modules/sales/checkout.router.ts` | Not mounted in `backend/src/routes/index.ts`; referenced by docs only |
| `/api/v1/loyalty` member self-service | Deferred because JWT lacks `loyaltyId` / member ownership binding |
| `/api/v1/complaints` loyalty-member access | Deferred because complaint ownership cannot be safely enforced yet |
| Missing `/roles`, `/dashboard`, `/transactions`, `/analytics` modules | Present in target module map but not currently mounted as dedicated route groups |

## Comparison With Target Architecture

### Aligned

- Core protected modules now mostly enforce JWT and RBAC server-side.
- Store-specific modules generally use `requireActiveStore` or `requireActiveStoreUnlessAdmin`.
- Phase 2 changes align with the SAD security principle that backend enforcement is authoritative.
- POS, inventory, transfers, returns, complaints, reports, products, users, stores, settings, promotions, loyalty, and audit logs now have route-level protection appropriate for a phased hardening pass.

### Partially Aligned

- Pricing still lacks RBAC on read/report routes.
- Categories and suppliers have authenticated reads but no explicit read RBAC.
- Invoices have store scope but no explicit RBAC, leaving transaction history policy incomplete.
- Orders have authentication and partial store scope but lack RBAC; one status route lacks route-level store scope.
- Store/region semantics for District Manager are not consistently enforceable because current JWT/store assignment model is store-list based, not region-scoped.

### Not Yet Aligned

- Dedicated target modules for `roles`, `dashboard`, `transactions`, and `analytics` are absent or represented by other modules.
- Loyalty member self-service and complaint ownership are not safely enforceable with the current JWT model.
- Audit logging for all sensitive operations is not consistently implemented across route groups.
- Some route groups still contain business logic directly in routers rather than target `routes -> controllers -> services -> repositories` structure.

## Recommended Next Phases

1. Phase 2n: Orders RBAC and store-scope hardening
   - Add RBAC to all `/orders` routes.
   - Add explicit store-scope middleware to `POST /orders/:id/status`.
   - Preserve procurement/order behavior.

2. Phase 2o: Invoices / transaction history RBAC
   - Add role policy for invoice list/detail.
   - Preserve current store-scope filtering.
   - Defer cashier ownership narrowing unless explicitly requested.

3. Phase 2p: Pricing read RBAC
   - Add RBAC to recommend/history/competitor read routes.
   - Consider whether active-store scope should remain mandatory for all pricing reads.

4. Phase 2q: Catalog-adjacent read RBAC
   - Add explicit read RBAC for categories and suppliers.
   - Keep route paths and response shapes unchanged.

5. Phase 2r: POS store-integrity follow-up
   - Add held-invoice active-store check to `POST /pos/resume/:id/checkout`.
   - Consider audit logging for checkout, refund, shift close, and cash movements.

6. Phase 3: Ownership and member-scope model
   - Extend JWT/session model or lookup path to bind users to loyalty members and complaint ownership.
   - Only then expose `LOYALTY_MEMBER` self-service routes.

7. Phase 4: Missing target modules and module-boundary cleanup
   - Introduce or normalize `roles`, `transactions`, `dashboard`, and `analytics`.
   - Move large router business logic toward controller/service/repository boundaries.

8. Phase 5: Audit logging and observability completion
   - Ensure user, store, pricing, inventory, transfer, POS refund, return, complaint, and report-export operations write audit logs.
   - Review `/metrics`, Swagger, and health exposure for production posture.

