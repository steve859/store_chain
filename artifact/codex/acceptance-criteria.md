# Acceptance Criteria — Architecture Refactor

Use this as the final checklist for the project-level refactor.

## Backend structure

- [ ] Backend organized by domain modules.
- [ ] Each major module has clear route/controller/service/repository boundaries or justified smaller structure.
- [ ] Route registry is centralized.
- [ ] Shared infrastructure is not duplicated across modules.

## Frontend structure

- [ ] Frontend has role-based layouts or route guards.
- [ ] API clients are organized by module/domain.
- [ ] Unauthorized functions are hidden in UI but also protected by backend.

## Security

- [ ] JWT authentication works.
- [ ] RBAC works.
- [ ] Store-scope authorization works.
- [ ] Failed login / sensitive action logging exists or is clearly planned.
- [ ] No secret leakage.

## Data integrity

- [ ] POS checkout is transaction-safe where possible.
- [ ] Inventory update validates quantity.
- [ ] Loyalty redeem validates balance.
- [ ] Transfer approval is atomic.
- [ ] Price rollback records history.

## Performance and reliability

- [ ] Search/list endpoints support pagination.
- [ ] Redis usage is centralized if implemented.
- [ ] Background jobs are isolated if implemented.
- [ ] WebSocket usage is scoped by store if implemented.
- [ ] Health check exists.

## Documentation

- [ ] README updated with setup commands.
- [ ] API route map updated.
- [ ] Architecture docs mention remaining gaps.
- [ ] Tests/run commands documented.

## Verification

- [ ] Lint passes.
- [ ] Typecheck passes.
- [ ] Tests pass or failures are documented.
- [ ] Build passes.
- [ ] Docker/local run instructions confirmed.
