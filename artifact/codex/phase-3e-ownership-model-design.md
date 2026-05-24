# Phase 3e Ownership Model Design

## Scope

This design defines the ownership model needed before narrowing access from store-scoped visibility to owner-scoped visibility for cashier, complaint, loyalty member, and customer self-service flows.

No application code, route paths, response shapes, or Prisma schema are changed by this report.

## Current Identity Model

The current JWT is a staff/store token.

Current token payload from `backend/src/modules/auth/auth.service.ts`:

| Field | Meaning today | Ownership value |
| --- | --- | --- |
| `userId` | Authenticated staff user, maps to `users.id` | Reliable for staff actions |
| `email` | Staff user email | Useful display value, not an ownership key by itself |
| `role` | Staff role name from `roles.name` | Reliable for RBAC |
| `storeId` | Legacy primary/current store | Store scope only |
| `storeIds` | Allowed stores from `user_stores` or admin fallback | Store scope only |
| `primaryStoreId` | Primary store from `user_stores` or `users.store_id` | Store scope only |

`authenticateToken` populates `req.user` with these fields and resolves `req.activeStoreId`. There is no JWT field for `customerId`, `loyaltyId`, `loyaltyCustomerId`, complaint owner, cashier session, or employee record.

## Current Ownership Fields

| Domain | Current fields | What can be proven today | Gaps |
| --- | --- | --- | --- |
| Staff user | `users.id`, `users.role_id`, `users.store_id`, `user_stores.user_id/store_id` | Staff identity and allowed stores | No separate employee profile model |
| Cashier | No `cashiers` model found; cashier is a `users` row with cashier role | Cashier can be represented by `users.id` | No terminal/session ownership beyond POS shift fields |
| POS shift | `pos_shifts.opened_by`, `pos_shifts.closed_by`, `store_id` | Which staff user opened/closed a shift | Current flows are mostly store-scoped, not cashier-owned |
| Invoice | `invoices.created_by`, `store_id`, `customer_id` | Invoice creator can map to `users.id` when populated | Legacy/null `created_by`; no cashier-specific ownership policy yet |
| Receipt | Uses invoice data and `invoice.store_id` | Store integrity can be enforced | No cashier ownership narrowing |
| Return/refund | `returns.created_by`, `store_id`, `invoice_id`, `customer_id` | Staff actor and store can be tracked for persisted returns | Legacy manager refund does not persist a dedicated refund owner table |
| Complaint | `complaints.employee_id`, `employee_name`, `store_id` as text | Store filtering is possible when `store_id` is valid | `employeeName` and `employeeId` are client-provided and not FK-bound to `users.id` |
| Customer | `customers.id`, `email`, `phone`, `loyalty_id` | Customer can be attached to invoice/return by `customer_id` | No auth account binding |
| Loyalty member | `loyalty_customers.id`, `email`, `phone`, `store_id` | Loyalty record exists and is store-associated | No `user_id` or member auth binding; path/body `loyaltyId` is client-controlled |
| Loyalty history/offers/redemption | `loyalty_customer_id` | Can query member data by loyalty id | Cannot prove requester owns that loyalty id |

There is no Prisma `employees` or `cashiers` model in the current schema. The safest current staff identity anchor is `users.id`.

## Frontend Usage Findings

| Flow | Current frontend usage | Ownership implication |
| --- | --- | --- |
| Invoice history | `frontend/src/services/salesOrders.js` calls `GET /invoices` and `GET /invoices/:id`; `frontend/src/pages/Orders/index.jsx` presents store transaction history | Current UI expects store transaction history, not "my invoices only" |
| POS receipt | No current frontend call to `GET /pos/invoices/:id/receipt` found | Receipt route is available but not currently relied on by UI |
| Return flow | `frontend/src/pages/POS/Return.jsx` uses `GET /returns/invoices`, `GET /returns/invoices/:id`, `POST /returns`, `GET /returns` | POS return workflow needs store invoice lookup, not only cashier-owned invoices |
| Complaints/my | `frontend/src/pages/Complaints/index.jsx` derives `employeeName` from `localStorage.userEmail` prefix and calls `/complaints/my?employeeName=...` | Client-supplied name is not trustworthy ownership |
| Complaint creation | Frontend sends `storeName` and derived `employeeName`; no `employeeId` is sent | Backend cannot bind complaint to JWT owner today |
| Loyalty self-service | No frontend calls to `/api/v1/loyalty/*` found | Member self-service should remain disabled/deferred |

## Ownership Gaps

1. `employeeName` is client-derived and can be spoofed.
2. `complaints.employee_id` is text, nullable, and not a foreign key to `users.id`.
3. Loyalty routes accept `loyaltyId` from path/body, but JWT has no member/customer binding.
4. The schema has both legacy `customers.loyalty_id` and newer `loyalty_customers.id`; the canonical customer/member model is unclear.
5. Cashier identity is inferred from `users.id`, but historical invoices may have `created_by = null`.
6. Store scope is reliable for many workflows, but store scope does not prove personal ownership.
7. Some POS workflows intentionally need store-wide transaction lookup for returns and reprints.

## Target Ownership Model

### Staff And Cashier Identity

Use `users.id` as the canonical staff identity.

Recommended target:

| Mapping | Target rule |
| --- | --- |
| JWT staff user | `req.user.userId -> users.id` |
| Staff store access | `user_stores` remains the source for allowed stores |
| Cashier identity | Cashier is a staff user with `CASHIER` role or equivalent role assignment |
| POS invoice creator | New POS checkouts and held invoices should continue setting `invoices.created_by = req.user.userId` |
| POS shift actor | `pos_shifts.opened_by/closed_by` should continue mapping to `users.id` |
| Cash movement actor | `cash_movements.created_by` should continue mapping to `users.id` |

Avoid introducing a separate cashier table unless future requirements need cashier-specific attributes that do not belong on `users`.

### Invoice And Receipt Ownership

Recommended policy:

| Role | Invoice history/detail | POS receipt |
| --- | --- | --- |
| `ADMIN` | Chain-wide where route permits admin bypass | Active-store scoped in POS routes |
| `DISTRICT_MANAGER` | Store-scoped or district-scoped once district model exists | No POS access in current policy |
| `STORE_MANAGER` | Active-store invoices | Active-store receipts |
| `CASHIER` | Active-store invoices for POS return/reprint workflows | Active-store receipts |
| `INVENTORY_STAFF` | No invoice history access under current RBAC | No POS receipt access |

Do not globally narrow cashier invoice access to only `created_by = req.user.userId` yet. The current POS return screen searches store invoices, and return/reprint workflows commonly require any cashier or manager at the active store to find an invoice.

Safer future option:

1. Keep default cashier invoice access active-store scoped.
2. Add an optional "my transactions" UI/filter later that narrows to `created_by = req.user.userId`.
3. Consider date/search limits for cashier store-wide invoice history to reduce data exposure.
4. Preserve manager/admin store-wide access.

### Complaint Ownership

Current `/complaints/my` should not be treated as true ownership. It is "my by employeeName within active store" only.

Recommended target:

| Complaint source | Target owner field |
| --- | --- |
| Staff complaint | Add a future nullable FK such as `complaints.created_by_user_id -> users.id` |
| Staff complaint display name | Derive display name from `users.full_name/username/email`, not request body |
| Customer/member complaint | Add future `customer_id` or `loyalty_customer_id`, depending on canonical customer model |
| Legacy complaints | Keep store-scoped access unless a reliable backfill is possible |

Recommended route policy after model support:

| Route | Future owner behavior |
| --- | --- |
| `GET /complaints/my` | For staff submitters, filter by `created_by_user_id = req.user.userId` and active store |
| `POST /complaints` | Set owner from JWT; ignore client-supplied `employeeId` for staff ownership |
| `GET /complaints/:id` | Managers/admins by role/store; submitter can view own complaint after owner field exists |
| Status/delete | Keep manager/admin only; do not allow submitter status mutation |

### Customer And Loyalty Member Identity

Do not enable `LOYALTY_MEMBER` self-service routes yet.

Target member authentication requires a server-issued token that includes a verified member binding:

| JWT field | Target meaning |
| --- | --- |
| `userId` | Staff user id for staff tokens, or account user id if customers share `users` |
| `customerId` | Bound `customers.id`, if `customers` remains canonical |
| `loyaltyCustomerId` | Bound `loyalty_customers.id`, if loyalty customers are canonical |
| `role` | `LOYALTY_MEMBER` only after member account verification |

Recommended canonical direction:

1. Use `loyalty_customers` as the loyalty program member record.
2. Add a future nullable unique auth binding, such as `loyalty_customers.user_id -> users.id`, or create a dedicated customer account table if staff and member accounts should stay separate.
3. Reconcile `customers.loyalty_id` with `loyalty_customers.id` through migration/backfill before enforcing member self-service ownership.
4. For self-service routes, compare route/body `loyaltyId` with the authenticated `req.user.loyaltyCustomerId`; do not trust client-provided loyalty IDs alone.

Recommended loyalty route posture now:

| Route | Current safe posture |
| --- | --- |
| `POST /loyalty/enroll` | Staff/POS only |
| `GET /loyalty/balance/:loyaltyId` | Staff/POS only until member binding exists |
| `GET /loyalty/transactions/:loyaltyId` | Staff/POS only until member binding exists |
| `GET /loyalty/offers/:loyaltyId` | Staff/POS only until member binding exists |
| `POST /loyalty/process-points` | Staff/system only |
| `POST /loyalty/redeem` | Staff/POS only until member binding exists |

## Migration And Backfill Needs

No schema change should be made in Phase 3e, but future ownership enforcement will need migrations.

Recommended migration candidates:

| Area | Future schema change | Backfill approach |
| --- | --- | --- |
| Complaints | Add `created_by_user_id Int?` FK to `users.id` | Backfill only when `employee_id` can be verified as a user id; otherwise leave null |
| Complaints | Add optional `customer_id` or `loyalty_customer_id` for customer complaints | Backfill only from verified customer/member workflows |
| Loyalty members | Add `user_id Int?` unique FK or dedicated member account binding | Link by verified login/claim flow, not by raw email match alone |
| Customers | Add `user_id Int?` if customers become login principals | Dedupe by verified email/phone before constraints |
| Invoices | Keep `created_by`; consider index on `(store_id, created_by, created_at)` | Legacy nulls remain store-scoped |
| Returns | Keep `created_by`; consider index on `(store_id, created_by, created_at)` | Legacy nulls remain store-scoped |

Backfill cautions:

1. Do not auto-claim complaints by `employeeName`.
2. Do not auto-link loyalty members by email alone without duplicate handling.
3. Preserve legacy rows with missing owner fields as store-scoped manager-visible data.
4. Add constraints only after data cleanup and acceptance tests.

## Recommended Implementation Order

1. Document and accept this ownership policy.
2. Add focused migration design for complaint owner and loyalty member account binding.
3. Add backend helper functions for normalized role and owner checks after schema support exists.
4. Add optional cashier "my invoices" filtering without changing existing store-wide return/reprint behavior.
5. Bind new complaints to `req.user.userId`; keep legacy complaint access store-scoped.
6. Add loyalty member authentication and JWT fields only after member account binding exists.
7. Enable `LOYALTY_MEMBER` routes with strict `loyaltyId === req.user.loyaltyCustomerId` checks.
8. Add audit logging for owner-sensitive reads and mutations where required by ASR/SAD.

## Decisions Recommended Now

| Decision | Recommendation |
| --- | --- |
| Can cashiers see all active-store invoices? | Yes, for current return/reprint workflows, with active-store scope and possible future date/search limits |
| Should cashiers be limited only to invoices they created? | Not globally now; add a separate "my transactions" mode later |
| Should loyalty member routes be enabled now? | No. Defer until JWT/member ownership binding exists |
| Is `/complaints/my` true ownership today? | No. It is active-store plus client-supplied employeeName only |
| Is `invoice.created_by` usable? | Yes for new POS data when populated, but legacy nulls require fallback store-scope behavior |

## Remaining Risks

1. Store-scoped cashier invoice history exposes all active-store transactions to cashiers.
2. Complaint ownership remains spoofable until complaints are server-bound to `users.id`.
3. Loyalty IDs remain sensitive bearer-like identifiers until member auth binding exists.
4. Legacy data with null `created_by`, null store IDs, or text-only employee IDs cannot be safely owner-narrowed.
5. Customer and loyalty models are split, which can lead to duplicate or ambiguous member identities.

## Completion Recommendation

Phase 3e design can be considered complete once this report is reviewed and accepted. Implementation should not proceed to owner-scoped enforcement until the team decides the canonical member/customer model and approves the required migration/backfill strategy.
