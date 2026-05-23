# Test and Verification Guide

Codex must inspect the repo and use actual commands. The commands below are defaults only.

## Discover commands

Check these files first:

```text
package.json
backend/package.json
frontend/package.json
README.md
Makefile
docker-compose.yml
.github/workflows/*
```

## Common commands

Root project:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Backend:

```bash
cd backend
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Frontend:

```bash
cd frontend
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Docker smoke test if available:

```bash
docker compose up -d
curl http://localhost:3000/health
```

## Critical smoke tests

### Auth

- Login with valid account.
- Login with invalid password.
- Access protected endpoint without token.
- Access admin endpoint with non-admin user.

### Store scope

- Store Manager can see own store data.
- Store Manager cannot see another store's data.
- Admin/District Manager scope follows existing rules.

### POS

- Scan/add product.
- Apply loyalty member.
- Apply promotion.
- Complete payment.
- Verify inventory decreased.
- Verify receipt/transaction created.

### Inventory and transfers

- Update stock.
- Create transfer request.
- Approve transfer.
- Verify source/destination stock changes.
- Verify rejection does not move stock.

### Pricing

- Create pricing rule.
- Execute pricing.
- View price history.
- Roll back price.
- Verify POS price update path remains valid.

### Reports and export

- Generate store report.
- Generate chain report.
- Export PDF/XLSX/CSV if implemented.
- Verify unauthorized users cannot export restricted reports.

## Final response requirement for Codex

Every Codex implementation response should include:

```text
Summary:
- ...

Files changed:
- ...

Tests run:
- command: result

Known gaps / risks:
- ...

Recommended next phase:
- ...
```
