# PLANS.md — Execution Plan Template for Codex

Use this template before implementing any large refactor.

## Task title

Short name of the refactor.

## Goal

What architecture target from SAD/ADD this task implements.

## Current state found in repo

- Current files/modules involved:
- Current routes/APIs involved:
- Current tests involved:
- Current risks:

## Target state

- Target folders:
- Target files:
- Target APIs:
- Target middleware/service boundaries:

## Steps

1. Inspect relevant files.
2. Move/rename only the minimum necessary files.
3. Update imports and route registry.
4. Preserve existing behavior.
5. Add or adjust tests.
6. Run verification commands.
7. Summarize changes.

## Acceptance criteria

- [ ] Build passes.
- [ ] Tests pass or known failures are documented.
- [ ] Route behavior remains compatible.
- [ ] Module follows expected structure.
- [ ] No secrets/config credentials modified.
- [ ] No destructive DB command executed.

## Rollback notes

How to revert this phase if it breaks the repo.
