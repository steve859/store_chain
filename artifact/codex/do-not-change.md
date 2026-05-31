# Do Not Change Without Explicit Approval

Codex should not change these areas unless the prompt explicitly asks for it.

## Secrets and environment

- Do not edit real `.env` files.
- Do not print secrets.
- Do not rotate JWT secrets or API keys.
- Do not add secrets to source code.

## Database destructive operations

Do not run:

```bash
DROP DATABASE
DROP TABLE
TRUNCATE
prisma migrate reset
sequelize db:drop
npm run db:reset
```

Unless the user explicitly approves.

## Public API compatibility

Do not rename or remove public endpoints during refactor unless the task explicitly includes API migration.

## Business behavior

Do not change business rules accidentally. In particular:

- Login validation.
- Role permission behavior.
- Store-scope access.
- POS payment calculation.
- Inventory deduction rules.
- Loyalty point rules.
- Promotion application rules.
- Dynamic pricing calculation.
- Transfer approval behavior.
- Report export format.

## Dependencies

Do not add heavy new dependencies if existing code can solve the task.

Ask before introducing:

- New framework.
- New ORM.
- New database.
- New queue system.
- New state management library.
- New authentication provider.
