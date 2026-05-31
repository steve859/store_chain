# Phase 4k POS Refactor Analysis

## Scope

Module: `backend/src/modules/pos`

Files inspected:
- `backend/src/modules/pos/pos.router.ts`
- `backend/tests/pos.rbac.test.ts`

Goal: refactor the POS module into controller/service/repository boundaries without changing Phase 3 behavior.

## Current Structure

`pos.router.ts` is very router-heavy. It currently owns:
- route paths and middleware
- RBAC role constants
- request parsing and response shaping
- shift summary calculations
- effective price lookup
- shift open/current/close behavior
- cash movement creation and lookup
- POS inventory lookup
- strict receipt object-store check
- checkout transaction
- hold transaction
- resume checkout transaction
- refund transaction and sentinel error handling
- best-effort audit logging for POS-sensitive operations

The module has no existing controller/service/repository split.

## Route Groups

| Group | Routes | Risk |
|---|---|---|
| Shifts | `POST /pos/shifts/open`, `GET /pos/shifts/current`, `POST /pos/shifts/close` | Medium |
| Cash movements | `POST /pos/cash-movements`, `GET /pos/shifts/:id/cash-movements` | Medium |
| Inventory lookup | `GET /pos/inventory/lookup` | Low |
| Receipt | `GET /pos/invoices/:id/receipt` | Medium |
| Checkout | `POST /pos/checkout` | Very high |
| Hold/resume | `POST /pos/hold`, `POST /pos/resume/:id/checkout` | Very high |
| Refund | `POST /pos/refund` | High |

All routes currently share:
- `router.use(authenticateToken)`
- `router.use(requireActiveStore)`

RBAC:
- operational routes use `posOperationalRoles`
- legacy refund uses `posRefundRoles`

Middleware order must remain unchanged.

## Current Routes

| Route | Middleware | Success Shape |
|---|---|---|
| `POST /pos/shifts/open` | `authorizeRoles(posOperationalRoles)` | `201 { shift }` |
| `POST /pos/shifts/close` | `authorizeRoles(posOperationalRoles)` | `201 { shift }` |
| `GET /pos/shifts/current` | `authorizeRoles(posOperationalRoles)` | `{ shift: null }` or `{ shift }` |
| `POST /pos/cash-movements` | `authorizeRoles(posOperationalRoles)` | `201 { movement, shiftId, summary }` |
| `GET /pos/shifts/:id/cash-movements` | `authorizeRoles(posOperationalRoles)` | `{ items }` |
| `GET /pos/inventory/lookup` | `authorizeRoles(posOperationalRoles)` | `{ variant, inventory }` |
| `GET /pos/invoices/:id/receipt` | `authorizeRoles(posOperationalRoles)` | `{ invoice, receipt }` |
| `POST /pos/checkout` | `authorizeRoles(posOperationalRoles)` | `201 { invoice }` |
| `POST /pos/hold` | `authorizeRoles(posOperationalRoles)` | `201 { invoice }` |
| `POST /pos/resume/:id/checkout` | `authorizeRoles(posOperationalRoles)` | `{ invoice }` |
| `POST /pos/refund` | `authorizeRoles(posRefundRoles)` | `201 { refund }` |

## Transaction Boundaries

### Checkout

`POST /pos/checkout` uses a Prisma transaction.

Inside the transaction:
- loads variants
- loads store inventory rows
- validates inventory exists and has sufficient available stock
- resolves effective prices from active variant price windows
- creates invoice
- creates invoice items
- decrements inventory quantity
- creates sale stock movements
- fetches invoice with invoice items

After transaction:
- writes best-effort `POS_CHECKOUT_COMPLETED`
- returns `201 { invoice }`

Audit must stay after successful transaction only. Failed validation/domain errors must not write success audit logs.

### Hold

`POST /pos/hold` uses a Prisma transaction.

Inside the transaction:
- loads variants
- loads inventory rows
- validates available stock
- resolves effective prices
- creates held invoice with `payment_method: null`
- creates invoice items
- increments inventory reserved quantity
- fetches invoice with invoice items

No current audit log is written.

### Resume Checkout

`POST /pos/resume/:id/checkout` uses a Prisma transaction.

Inside the transaction:
- loads held invoice with invoice items
- returns `null` if missing
- checks `invoice.store_id === req.activeStoreId`
- returns sentinel `{ __forbiddenActiveStore: true }` on store mismatch
- throws if invoice is already paid
- validates store/cashier fields
- loads inventories
- validates final availability considering reserved quantity
- decrements reserved and quantity
- creates sale stock movements
- updates invoice `payment_method`
- fetches invoice with invoice items

After transaction:
- `null` maps to `404 { error: 'Invoice not found' }`
- forbidden sentinel maps to `403 { error: 'Forbidden: invoice does not belong to active store' }`
- success maps to `{ invoice }`

Phase 3a object-store check must remain before inventory mutation.

### Refund

`POST /pos/refund` uses a Prisma transaction.

Inside the transaction:
- loads invoice items
- validates all items exist
- validates all items belong to the same invoice
- loads invoice
- validates invoice belongs to active store
- validates variant ids
- validates refund quantity does not exceed sold quantity
- loads inventory
- increments inventory quantity
- creates refund stock movements
- returns `{ invoiceId, totalRefund }`

After transaction:
- sentinel errors map to stable 4xx responses
- best-effort `POS_REFUND_CREATED` audit log is written after success only
- response remains `201 { refund }`

### Shift Close

No transaction currently wraps shift close.

Sequence:
- parse/validate close input
- load open shift
- update shift
- compute summary
- write best-effort `SHIFT_CLOSED`
- return `201 { shift }`

Audit must remain after successful shift update and summary construction.

### Cash Movement

No transaction currently wraps cash movement.

Sequence:
- parse/validate input
- load open shift
- create cash movement
- compute summary
- write best-effort `CASH_MOVEMENT_CREATED`
- return `201 { movement, shiftId, summary }`

Audit must remain after successful movement creation and summary construction.

## Error Contracts To Preserve

### Shift Routes

`POST /pos/shifts/open`:
- missing store/openedBy: `400 { error: 'openedBy is required' }`
- negative opening cash: `400 { error: 'openingCash must be >= 0' }`
- existing open shift: `409 { error: 'Shift already open', shift }`
- success: `201 { shift }`

`POST /pos/shifts/close`:
- missing close fields: `400 { error: 'closedBy, closingCash are required' }`
- negative closing cash: `400 { error: 'closingCash must be >= 0' }`
- no open shift: `404 { error: 'No open shift found' }`
- success: `201 { shift }`

`GET /pos/shifts/current`:
- no open shift: `{ shift: null }`
- open shift: `{ shift }`

### Cash Movement Routes

`POST /pos/cash-movements`:
- invalid store: `400 { error: 'Invalid store' }`
- invalid type: `400 { error: 'Invalid type' }`
- invalid amount: `400 { error: 'amount must be > 0' }`
- no open shift: `409 { error: 'No open shift. Please open shift first.' }`
- success: `201 { movement, shiftId, summary }`

`GET /pos/shifts/:id/cash-movements`:
- invalid store/shift: `400 { error: 'Invalid store/shift id' }`
- missing or cross-store shift: `404 { error: 'Shift not found' }`
- success: `{ items }`

### Inventory Lookup

`GET /pos/inventory/lookup`:
- missing barcode/variantId: `400 { error: 'Provide barcode or variantId' }`
- missing variant: `404 { error: 'Variant not found' }`
- success: `{ variant, inventory }`

### Receipt

`GET /pos/invoices/:id/receipt`:
- invalid id: `400 { error: 'Invalid invoice id' }`
- missing invoice: `404 { error: 'Invoice not found' }`
- missing/invalid/cross-store invoice store: `403 { error: 'Forbidden: invoice does not belong to active store' }`
- success: `{ invoice, receipt }`

Strict store check applies to all roles, including ADMIN, because POS uses `requireActiveStore`.

### Checkout

`POST /pos/checkout`:
- missing required fields: `400 { error: 'Missing required fields' }`
- invalid items: `400 { error: 'Invalid items' }`
- no open shift: `409 { error: 'No open shift. Please open shift before checkout.' }`
- transaction domain errors currently throw to central error handler:
  - variant not found
  - inventory not found
  - insufficient stock

### Hold

`POST /pos/hold`:
- missing required fields: `400 { error: 'Missing required fields' }`
- invalid items: `400 { error: 'Invalid items' }`
- transaction domain errors currently throw to central error handler:
  - variant not found
  - inventory not found
  - insufficient stock

### Resume Checkout

`POST /pos/resume/:id/checkout`:
- invalid request: `400 { error: 'Invalid request' }`
- missing invoice: `404 { error: 'Invoice not found' }`
- cross-store held invoice: `403 { error: 'Forbidden: invoice does not belong to active store' }`
- transaction domain errors currently throw to central error handler:
  - already paid
  - missing store/cashier
  - inventory not found
  - insufficient stock

### Refund

`POST /pos/refund`:
- missing fields: `400 { error: 'Missing required fields' }`
- invalid items: `400 { error: 'Invalid items' }`
- invoice item not found: `404 { error: 'One or more invoice items not found' }`
- items not from same invoice: `400 { error: 'Refund items must belong to the same invoice' }`
- invoice missing: `404 { error: 'Invoice not found' }`
- invoice store mismatch: `403 { error: 'Invoice does not belong to this store' }`
- missing variant id: `409 { error: 'Invoice item X missing variant_id' }`
- refund quantity exceeds sold quantity: `409 { error: 'Refund quantity exceeds sold quantity for invoice item X' }`
- missing inventory: `409 { error: 'Inventory not found for variant X' }`
- success: `201 { refund }`

## Object-Store Checks To Preserve

| Route | Check |
|---|---|
| `GET /pos/invoices/:id/receipt` | `activeStoreId` finite, `invoice.store_id` finite, exact match required for every role including ADMIN |
| `POST /pos/resume/:id/checkout` | held invoice `store_id` must equal active store before any inventory or invoice mutation |
| `POST /pos/refund` | invoice `store_id` must equal active store before inventory mutation |
| `GET /pos/shifts/:id/cash-movements` | shift must exist and belong to active store |
| shift/cash/checkout/hold routes | all operations derive store from `req.activeStoreId` |

Do not introduce ADMIN bypass inside POS object checks. The router requires active store for all roles.

## Audit Behavior To Preserve

All POS audit writes are best-effort via `AuditLogsService.createLog`; audit failure must not break successful responses.

| Action | Route | Timing | Object |
|---|---|---|---|
| `SHIFT_CLOSED` | `POST /pos/shifts/close` | after successful shift update and summary calculation | `pos_shift` |
| `CASH_MOVEMENT_CREATED` | `POST /pos/cash-movements` | after successful cash movement and summary calculation | `cash_movement` |
| `POS_CHECKOUT_COMPLETED` | `POST /pos/checkout` | after successful checkout transaction | `invoice` |
| `POS_REFUND_CREATED` | `POST /pos/refund` | after successful refund transaction | `invoice` |

Sensitive fields must remain excluded:
- full request body
- auth headers
- tokens
- passwords
- card/payment secrets
- customer phone/email
- full customer records
- full receipt payloads

Reason/note previews are capped at 80 characters where currently used.

## Recommended Split

### `pos.router.ts`

Keep only:
- `Router`
- `router.use(authenticateToken)`
- `router.use(requireActiveStore)`
- `posOperationalRoles`
- `posRefundRoles`
- route declarations
- middleware
- controller method calls

### `pos.controller.ts`

Own:
- reading `req.params`, `req.query`, `req.body`
- deriving active store from `req.activeStoreId`
- deriving actor/cashier fallback context from `req.user`
- HTTP audit source: `req.ip`, `req.get('user-agent')`
- mapping service result tags to HTTP statuses
- preserving exact response shapes

Recommended controller methods:
- `openShift`
- `closeShift`
- `getCurrentShift`
- `createCashMovement`
- `listShiftCashMovements`
- `lookupInventory`
- `getReceipt`
- `checkout`
- `holdCart`
- `resumeCheckout`
- `refund`

### `pos.service.ts`

Own:
- generic helpers: `toNumber`, `decimalToNumber`, `safeInvoiceSnapshot`
- shift summary orchestration
- effective price lookup orchestration
- validation decisions
- object-store policy decisions
- sentinel result typing/mapping
- audit payload construction
- best-effort audit wrapper

Because POS is large, a single `pos.service.ts` may become hard to review. Optional sub-services are recommended after or during the refactor if kept module-local:
- `pos.shift.service.ts`
- `pos.checkout.service.ts`
- `pos.refund.service.ts`

Do not introduce shared global abstractions in the first POS refactor.

### `pos.repository.ts`

Own:
- Prisma reads/mutations for shifts, invoices, inventory, prices, cash movements, stock movements
- checkout transaction
- hold transaction
- resume checkout transaction
- refund transaction
- receipt query
- inventory lookup query

Repository methods should preserve current Prisma call order as much as possible because tests mock transaction-local objects.

## Recommended Implementation Slices

### Slice 1: Low-risk Reads and Lookup

Move:
- `GET /pos/shifts/current`
- `GET /pos/shifts/:id/cash-movements`
- `GET /pos/inventory/lookup`

Why first:
- no writes
- no audit writes
- simpler response contracts

Run:
```bash
npm test -- --runTestsByPath tests/pos.rbac.test.ts --runInBand --forceExit
```

### Slice 2: Shift and Cash Control

Move:
- `POST /pos/shifts/open`
- `POST /pos/shifts/close`
- `POST /pos/cash-movements`

Preserve:
- shift summary calculations
- `SHIFT_CLOSED`
- `CASH_MOVEMENT_CREATED`
- best-effort audit behavior
- no audit on validation/domain failures

Run:
```bash
npm test -- --runTestsByPath tests/pos.rbac.test.ts --runInBand --forceExit
```

### Slice 3: Receipt

Move:
- `GET /pos/invoices/:id/receipt`

Preserve:
- strict store check for all roles including ADMIN
- `400`, `404`, `403` bodies
- `{ invoice, receipt }` response shape

Run POS tests after this slice.

### Slice 4: Refund

Move:
- `POST /pos/refund`

Preserve:
- Phase 3c sentinel 4xx responses
- inventory restock and refund stock movements
- `POS_REFUND_CREATED` after successful transaction only
- best-effort audit behavior
- `201 { refund }`

Run POS tests after this slice.

### Slice 5: Checkout

Move:
- `POST /pos/checkout`

Preserve:
- open shift prerequisite
- effective price lookup
- invoice creation
- invoice items
- inventory decrement
- sale stock movements
- `POS_CHECKOUT_COMPLETED` after successful transaction only
- `201 { invoice }`

Run POS tests after this slice.

### Slice 6: Hold and Resume

Move last:
- `POST /pos/hold`
- `POST /pos/resume/:id/checkout`

Preserve:
- held invoice representation using `payment_method: null`
- inventory reservation on hold
- active-store held invoice check on resume before mutation
- reserved/quantity mutation logic
- sale stock movements on resume
- resume success `{ invoice }`

Run POS tests after this slice.

## Final Verification Commands

```bash
npm test -- --runTestsByPath tests/pos.rbac.test.ts --runInBand --forceExit
npm exec -- eslint src/modules/pos/pos.router.ts src/modules/pos/pos.controller.ts src/modules/pos/pos.service.ts src/modules/pos/pos.repository.ts tests/pos.rbac.test.ts
```

If optional sub-service files are created, include them in the lint command.

## Risk Assessment

Very high-risk areas:
- checkout transaction
- hold/resume transaction
- refund sentinel contract
- receipt strict store check
- audit timing for checkout/refund/shift/cash movement

Medium-risk areas:
- shift summary calculation reuse
- cash movement response shape
- effective price lookup moving out of router

Low-risk areas:
- current shift read
- shift cash movement list
- inventory lookup

## Recommendation

Proceed with Phase 4k implementation only in slices. Do not try to move the full POS router in one pass unless each slice is tested before continuing.

The first implementation slice should be low-risk reads and lookup, followed by shift/cash control. Refund and checkout/hold/resume should be handled after those simpler extractions prove the module boundaries and test mocks are stable.
