# Copilot Instructions for `store_chain`

## Build, test, and lint commands

This repository is split into two Node projects (`backend/` and `frontend/`). Run commands from each directory.

### Backend (`backend/`)

```bash
npm install
npm run dev
npm run build
npm run lint
npm test
```

Run a single test file:

```bash
npm test -- tests/health.test.ts
```

Run a single test by name:

```bash
npm test -- -t "GET /health returns ok"
```

### Frontend (`frontend/`)

```bash
npm install
npm run dev
npm run build
npm run lint
npm run preview
```

### Local integration baseline (from repo root)

```bash
docker compose up -d postgres redis pgadmin
```

Backend runs on `http://localhost:3000`, frontend on Vite default (`http://localhost:5173` unless changed).

## High-level architecture

- **Backend API (`backend/src`)**: Express app in `app.ts` mounts `GET /health`, Swagger (`/api-docs`, `/api-docs.json`), and all business routes under `/api/v1` via `routes/index.ts`.
- **Backend module pattern**: Domain modules are mounted as routers (auth, products, inventory, orders, POS, reports, etc.). In this codebase, many routers directly contain Prisma query/transaction logic instead of separate controller/service layers.
- **Auth + store scoping pipeline**: `authenticateToken` parses JWT and then resolves active store with `resolveActiveStore` (from header/query/body, especially `x-store-id`). Store-dependent endpoints use `requireActiveStore`/`requireActiveStoreUnlessAdmin`; role checks use `authorizeRoles`.
- **Caching + invalidation**: Product catalog responses use Redis-backed cache middleware (`catalogCache.middleware.ts`) with store-scoped keys. Mutations touching catalog/stock/price should invalidate store catalog cache via `invalidateCatalogCache(storeId)`.
- **Realtime + background jobs**: `server.ts` wraps Express in HTTP + Socket.IO. Socket handlers use store rooms (`store_<id>`). Scheduler starts on boot and runs maintenance cron jobs.
- **Frontend app shell (`frontend/src`)**: Router only chooses role roots (`/admin`, `/employee`, `/cashier`, `/`). Each role layout switches pages using internal `currentView` state rather than nested route trees.
- **Frontend API access**: All API calls should go through `src/services/axiosClient.js` (base URL normalization + `/api/v1` handling, Bearer token injection, `x-store-id` header injection). Service modules in `src/services/*.js` wrap endpoint calls.
- **Frontend-backend wiring in dev**: `frontend/vite.config.ts` proxies `/api/v1` and `/socket.io` to `http://localhost:3000`.

## Key conventions in this repository

- **Use store-aware requests by default**: frontend persists `activeStoreId` in `localStorage`; axios client sends it as `x-store-id`; backend resolves and enforces allowed stores from JWT payload/store mappings.
- **Role routing convention**: login stores `token` and user metadata in `localStorage`, then routes by role (`admin` -> `/admin`, `cashier` -> `/cashier`, otherwise `/employee`).
- **Mixed JS/TS frontend structure is intentional**: role layouts/pages are mostly `.jsx`/`.js`, while reusable UI primitives are mostly `.tsx`.
- **Swagger docs are generated from both annotations and discovered mounts**: keep route mounts accurate (`src/docs/apiMounts.ts`) and add `@openapi` JSDoc or `src/docs/openapi.annotations.ts` updates for endpoint docs.
- **Backend tests rely heavily on module mocking**: existing Jest tests mock Prisma/Redis and hit Express endpoints via `supertest`; follow that style for new backend tests.
- **Vite API env handling**: `VITE_API_URL` may be host-only; axios client normalizes it to include `/api/v1`. Avoid hardcoding `/api/v1` twice in service paths.
