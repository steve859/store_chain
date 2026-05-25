# AGENTS.md — Store Chain Management System

Bạn là coding agent hỗ trợ refactor dự án Store Chain Management System theo tài liệu SAD/ADD/ASR/SRS.

## Project architecture target

Target architecture is documented in:

- `docs/codex/architecture-target.md`
- `docs/codex/module-map.md`
- `docs/codex/api-route-map.md`
- `docs/codex/refactor-plan.md`
- `docs/codex/test-verification.md`

If original documents exist, also consult:

- `docs/architecture/SAD_Store_Chain_Revised_Theo_ADD_Template.docx`
- `docs/architecture/ADD_Store_Chain_Revised_By_ASR.docx`
- `docs/architecture/ASR_checked_corrected_with_SRS.xlsx`
- `docs/requirements/Completed_Store_Chain_SRS_With_Pseudocode_Business_Rules.docx`

## Core technology assumptions

Unless the existing repo proves otherwise, assume:

- Frontend: ReactJS.
- Backend: Node.js + ExpressJS.
- Database: PostgreSQL.
- Cache / queue / pub-sub: Redis.
- API style: REST under `/api/v1`.
- Real-time: WebSocket for dashboard, price updates, and notifications where required.
- Deployment: Docker / Docker Compose.

Do not introduce a new framework, database, ORM, state manager, queue system, or deployment platform unless explicitly requested.

## Working rules

1. Do not refactor the entire repository in one step.
2. For broad architecture work, first inspect the codebase and produce a plan before changing code.
3. Preserve existing behavior unless a task explicitly asks to change behavior.
4. Prefer moving code into modules over rewriting business logic.
5. Keep commits/changes small and reviewable.
6. Do not rename public APIs unless the task explicitly includes API migration.
7. Do not delete working code without replacing it and explaining why.
8. Do not modify secrets, `.env`, production config, or deployment credentials.
9. Do not run destructive database commands such as reset/drop/truncate unless explicitly approved.
10. All sensitive operations must support audit logging when implemented.

## Expected backend structure

```text
backend/src/
  app.ts
  server.ts
  routes/
    index.ts
  modules/
    auth/
    users/
    roles/
    stores/
    dashboard/
    products/
    inventory/
    transfers/
    pos/
    transactions/
    loyalty/
    promotions/
    pricing/
    reports/
    analytics/
    complaints/
    audit_logs/
    settings/
  middlewares/
    auth.middleware.ts
    rbac.middleware.ts
    storeScope.middleware.ts
    rateLimit.middleware.ts
    error.middleware.ts
  lib/
    db.ts
    redis.ts
    logger.ts
    socket.ts
    queue.ts
  validations/
```

Adapt names to existing conventions if the repo already uses a consistent structure.

## Expected module pattern

Each backend module should normally contain:

```text
<module>/
  <module>.routes.ts
  <module>.controller.ts
  <module>.service.ts
  <module>.repository.ts
  <module>.validation.ts
  <module>.types.ts
  index.ts
```

If the current project is small, do not over-engineer. A module may initially contain only the files it needs.

## Middleware expectations

The backend should consistently support:

- JWT authentication middleware.
- RBAC middleware.
- Store-scope authorization middleware for store-specific data.
- Centralized error handling.
- Request logging.
- Rate limiting for login and sensitive endpoints.
- Audit logging for sensitive operations.

## Verification commands

Before finishing a coding task, run the available commands from the repo. If commands are unknown, inspect `package.json`, README, Docker files, or CI config.

Common commands to try when applicable:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

For monorepos, run commands in the relevant frontend/backend package folders.

## Definition of done

A task is done only when:

- Code compiles/builds or the reason it cannot be run is documented.
- Tests/lint/typecheck pass or failures are clearly listed with causes.
- API route behavior is preserved or migration is documented.
- New module boundaries match `docs/codex/module-map.md`.
- Security and data-integrity rules are not weakened.
- The final response includes files changed, tests run, and follow-up risks.
