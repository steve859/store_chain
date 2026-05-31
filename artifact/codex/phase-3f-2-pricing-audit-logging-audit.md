# Phase 3f-2 Pricing Audit Logging Audit

Date: 2026-05-24

Scope:
- `POST /api/v1/pricing/rules`
- `POST /api/v1/pricing/demand-metrics`
- `POST /api/v1/pricing/competitor-prices`
- `POST /api/v1/products/variant-prices`
- `POST /api/v1/products/variant-prices/close`

## Summary

Phase 3f-2 audit logging coverage is complete for the requested pricing-related mutation routes.

All five routes now write success audit events after successful mutations only. Audit writes are best-effort and do not change successful route responses when audit persistence fails. Route paths, request shapes, and successful response shapes are unchanged.

## Coverage Matrix

| Route | Mutation location | Audit action | objectType / objectId | Actor / store source | Response shape preserved | Status |
|---|---|---|---|---|---|---|
| `POST /api/v1/pricing/rules` | `pricing.controller.ts` after `pricingService.createPricingRule()` | `PRICING_RULE_CREATED` | `pricing_rule` / created rule id when available | `req.user.userId` / `req.activeStoreId` | `201 { message, rule }` | Covered |
| `POST /api/v1/pricing/demand-metrics` | `pricing.controller.ts` after `pricingService.updateDemandMetrics()` | `DEMAND_METRICS_UPDATED` | `demand_metrics` / derived stable id | `req.user.userId` / `req.activeStoreId` | `200 { message, metrics }` | Covered |
| `POST /api/v1/pricing/competitor-prices` | `pricing.controller.ts` after `pricingService.recordCompetitorPrice()` | `COMPETITOR_PRICE_RECORDED` | `competitor_price` / unavailable | `req.user.userId` / `req.activeStoreId` | `201 { message, isCompetitive, priceDiffPercent }` | Covered with object id limitation |
| `POST /api/v1/products/variant-prices` | `products.router.ts` after transaction and catalog cache invalidation | `VARIANT_PRICE_SET` | `variant_price` / created price id | `req.user.userId` / `req.activeStoreId` | `201 { price }` | Covered |
| `POST /api/v1/products/variant-prices/close` | `products.router.ts` after transaction and catalog cache invalidation | `VARIANT_PRICE_CLOSED` | `variant_price` / closed price id | `req.user.userId` / `req.activeStoreId` | `200 { price }` | Covered |

## Best-Effort Behavior

Both pricing and product variant price code paths use a route-local `writeAuditLog()` wrapper around `AuditLogsService.createLog()`.

The wrapper catches audit write failures and does not rethrow. `AuditLogsService.createLog()` itself also catches repository write failures. This means audit persistence failure does not block pricing mutations or alter successful route responses.

Focused tests confirm:
- pricing rule responses still succeed when audit logging rejects
- variant price set responses still succeed when audit logging rejects
- validation/service failure paths do not write success audit logs

## Sensitive Field Review

The implementation does not blindly log the full request body.

Logged payloads are whitelisted around:
- `result`
- `source.ip`
- `source.userAgent`
- `storeId`
- safe `before` / `after` snapshots where available
- route-specific pricing metadata

Sensitive fields such as passwords, auth tokens, secrets, and raw authorization data are not included in audit payloads. Existing focused tests verify token/password-like request fields are excluded for pricing rules, competitor prices, variant price set, and variant price close.

## Known Limitations

- `COMPETITOR_PRICE_RECORDED` currently has no database row id because `recordCompetitorPrice()` returns competitiveness data rather than the inserted competitor price row.
- `VARIANT_PRICE_SET` records whether a prior active price window was closed, but it does not record exact closed row ids or before snapshots for those rows because the route uses `updateMany()`.
- Audit writes are intentionally best-effort and are not transaction-bound. A mutation can succeed even if the audit write fails.

## Verification Evidence

Implementation-targeted tests from Phase 3f-2 passed:

- `npm test -- --runTestsByPath tests/pricing.middleware.test.ts --runInBand --forceExit`
- `npm test -- --runTestsByPath tests/catalog.invalidate.test.ts --runInBand --forceExit`
- `npm exec -- eslint src/modules/pricing/pricing.controller.ts tests/pricing.middleware.test.ts`
- `npm exec -- eslint src/modules/products/products.router.ts tests/catalog.invalidate.test.ts`

The ESLint commands completed with warning-only existing `any` warnings and no blocking errors.

## Completion Recommendation

Phase 3f-2 can be considered complete for pricing audit logging coverage.

## Recommended Next Phase 3f Batch

Proceed with POS-sensitive audit logging next:

- `POST /api/v1/pos/refund`
- `POST /api/v1/pos/shifts/close`
- `POST /api/v1/pos/cash-movements`
- optionally `POST /api/v1/pos/checkout` if sales transaction audit detail is required beyond invoice/payment records

After that, cover inventory and transfer stock movement operations:

- `POST /api/v1/inventory/receive`
- `POST /api/v1/inventory/adjust`
- `POST /api/v1/transfers`
- `POST /api/v1/transfers/:id/dispatch`
- `POST /api/v1/transfers/:id/receive`
- `POST /api/v1/transfers/:id/cancel`
