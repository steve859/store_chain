# Repo Information Needed

The current architecture documents are enough to guide Codex, but the following repo-specific details are needed for accurate refactor.

## Please provide or let Codex inspect

1. Actual repository folder structure.
2. `package.json` files from root, backend, and frontend.
3. Current backend entry files, such as `app.ts`, `server.ts`, `index.ts`.
4. Current route files.
5. Current database schema/ORM files.
6. Current auth middleware and permission logic.
7. Current Docker/Docker Compose files.
8. Current test/lint/build commands.
9. Current `.env.example` only — not real `.env` secrets.
10. Any generated API docs if available.

## Do not share

- Real private keys.
- Real database passwords.
- Production JWT secrets.
- Payment gateway secret keys.
- Personal user data from production database.

## Best extra document to create after Codex inspects repo

Ask Codex to create:

```text
docs/codex/current-repo-map.md
```

It should contain:

- Actual modules and folders.
- Actual routes.
- Actual dependencies.
- Actual tests.
- Actual gaps vs target architecture.

This file will make later refactor prompts much safer.
