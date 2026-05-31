# Codex Prompt Pack

Use these prompts one at a time.

## Prompt 1 — Analyze repo only

```text
Read AGENTS.md and the files under docs/codex.

Inspect the current codebase and compare it with docs/codex/architecture-target.md and docs/codex/module-map.md.

Do not modify code yet.

Create a markdown report with:
1. Current frontend/backend structure
2. Current modules found
3. Current API routes found
4. Current database/ORM setup
5. Current auth/RBAC/store-scope implementation
6. Missing modules compared with the target architecture
7. Risks if refactoring now
8. Recommended phase-by-phase plan
```

## Prompt 2 — Create refactor plan file from actual repo

```text
Based on your repository analysis, create docs/codex/current-repo-refactor-plan.md.

Use PLANS.md format.
Do not change application code.
Make the plan specific to the actual files in this repo.
```

## Prompt 3 — Phase 1 structure only

```text
Implement Phase 1 from docs/codex/refactor-plan.md.

Scope:
- Normalize project structure only.
- Move or group files only when safe.
- Preserve existing behavior and route paths.
- Update imports.

Do not implement new features.
Do not rewrite business logic.

After changes, run available lint/typecheck/build/test commands and summarize results.
```

## Prompt 4 — Middleware baseline

```text
Implement Phase 2 from docs/codex/refactor-plan.md.

Scope:
- Centralize JWT auth middleware if already present or create a minimal compatible middleware if missing.
- Centralize RBAC middleware.
- Centralize store-scope middleware.
- Centralize error handling.
- Preserve existing route behavior.

Do not change database schema unless strictly necessary.
Run verification commands and summarize results.
```

## Prompt 5 — Refactor one module

Replace `<module>` before using.

```text
Refactor only the <module> module according to docs/codex/module-map.md.

Scope:
- Create/adjust module folder structure.
- Move related routes/controllers/services/repositories/validations.
- Preserve API behavior.
- Update imports and route registry.
- Add minimal tests if the repo has an existing test setup.

Do not modify unrelated modules.
Run verification commands and summarize results.
```

## Prompt 6 — POS transactional consistency

```text
Inspect the POS checkout flow and compare it with docs/codex/architecture-target.md data integrity rules.

First report whether checkout currently updates transaction, inventory, loyalty, promotion/discount, payment, receipt, and audit log in a consistent way.

Then implement the smallest safe improvement to ensure POS checkout uses transaction boundaries where the current database/ORM supports it.

Do not rewrite the entire POS feature.
Run tests/build and summarize results.
```

## Prompt 7 — Audit log integration

```text
Inspect sensitive operations listed in docs/codex/refactor-checklist.md.

Add or standardize audit logging for one module only: <module>.

Audit record should include actor, action, target entity, timestamp, result, and old/new values where available.

Do not change unrelated modules.
Run verification commands.
```

## Prompt 8 — Final architecture review

```text
Review the current codebase after refactor against docs/codex/refactor-checklist.md.

Do not modify code.

Produce a final report listing:
1. Items completed
2. Items partially completed
3. Items not implemented
4. Remaining risks
5. Suggested next tasks in priority order
```
