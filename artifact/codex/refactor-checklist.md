# Refactor Checklist

Use this checklist after each Codex task.

## Architecture alignment

- [ ] Code is organized by domain modules.
- [ ] REST routes are grouped under `/api/v1` or existing route compatibility is preserved.
- [ ] Controllers do not contain heavy business logic.
- [ ] Services contain business logic.
- [ ] Repositories/data-access files contain DB logic.
- [ ] Shared infrastructure is centralized in `lib` or equivalent.

## Security

- [ ] Protected routes require JWT.
- [ ] RBAC is enforced on the backend.
- [ ] Store-scoped routes check active store/region access.
- [ ] Passwords are never returned by API.
- [ ] No raw card data is stored.
- [ ] Sensitive operations create audit logs or have TODO with exact missing implementation.

## Data integrity

- [ ] POS checkout uses transaction boundaries where possible.
- [ ] Inventory deduction cannot create negative stock.
- [ ] Loyalty redemption cannot create negative points.
- [ ] Transfer approval either completes fully or rolls back.
- [ ] Price rollback records old/new values.

## Performance

- [ ] List/search/history endpoints support pagination.
- [ ] Frequently accessed catalog/dashboard data can use cache where suitable.
- [ ] Long-running report/notification tasks are not blocking critical request path.

## Reliability

- [ ] Background jobs retry on failure where applicable.
- [ ] Errors are logged.
- [ ] Health check endpoint exists or remains intact.
- [ ] Metrics endpoint exists or remains intact if already present.

## Verification

- [ ] Lint ran.
- [ ] Typecheck ran.
- [ ] Tests ran.
- [ ] Build ran.
- [ ] Manual smoke test steps are listed if automated tests are missing.
