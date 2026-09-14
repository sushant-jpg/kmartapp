# KMart AI

A TypeScript monorepo with an Express/MongoDB API, React admin console, and Expo customer app. Prices are stored in integer paisa; clients display NPR and checkout uses server-calculated totals.

## Local setup

1. Install Node.js matching `package.json` and run `npm install` (or `npm ci` for a locked install).
2. Copy `.env.example` to `.env`. Set `JWT_SECRET` to a unique value of at least 48 characters (for example, generate it with `openssl rand -hex 48`).
3. Start MongoDB as a replica set and Redis. You can use `npm run dev:services` (`docker compose up -d mongo redis`). When connecting from the host to that Compose database, use `MONGO_URI=mongodb://127.0.0.1:27017/kmart?replicaSet=rs0&directConnection=true` in `.env`.
4. For development sample products and an admin account, add `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (at least 12 characters) to `.env`, then run `npm run seed -w @kmart/api`. The seed only runs in development, preserves existing records, and never promotes a customer account or changes an existing admin password.
5. Run `npm run dev` from the repository root. This starts the API, order worker, admin (http://localhost:5173), and mobile web app (http://localhost:8081). Press Ctrl+C to stop all four. MongoDB and Redis stay running; the runner does not seed or reset them.
6. Sign in to the admin with the seeded credentials. Register a customer account in the mobile app's Account tab.

To run services individually, use separate terminals instead of also running the root runner:

```sh
npm run dev:api
npm run dev:worker
npm run dev:admin
npm run dev:mobile             # Expo development server, including native-device support
npm run dev:mobile -- --web   # also open the customer web app
```

Root shortcuts forward options to the workspace command. For example, `npm run dev:admin -- --port 5174` selects a different Vite port (also update `ALLOWED_ORIGINS`). Vite fails on an occupied port instead of silently moving to a port that is missing from CORS configuration.

Workspace lifecycle commands:

| Workspace | Development                             | Start                                 | Build                | Tests / typecheck   |
| --------- | --------------------------------------- | ------------------------------------- | -------------------- | ------------------- |
| API       | `dev`, `dev:worker`                     | `start`, `start:worker` (after build) | `build`              | `test`, `typecheck` |
| Admin     | `dev`                                   | `start` (Vite preview after build)    | `build`              | `typecheck`         |
| Mobile    | `dev` or `start` (Expo)                 | `start` (Expo)                        | `build` (web export) | `typecheck`         |
| Shared    | Consumed directly by workspace bundlers | Not an application                    | Bundled by consumers | `typecheck`         |

Run a workspace command with `npm run <command> -w @kmart/<workspace>`. There are no placeholder test scripts for workspaces without test suites; the root test command runs the API integration suite, which also exercises shared contracts. Vite preview is for local build inspection; deploy the admin build with a static host and API proxy.

The admin development server proxies `/api` to port 4000. If you change the API port, update that proxy in `apps/admin/vite.config.ts` or set `VITE_API_URL`. For a separate API deployment, set `VITE_API_URL` in `apps/admin/.env` to the API's `/api/v1` URL. Browser origins must be listed in the API's `ALLOWED_ORIGINS`.

During native Expo development, the mobile app automatically uses the Expo computer’s host on API port 4000; `localhost` on a phone refers to the phone itself. The web preview defaults to `http://localhost:4000/api/v1`. Keep the phone and computer on the same LAN and run the API alongside Expo. For custom ports, tunnels, or release builds, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to a reachable API address, including `/api/v1`, then restart Expo. An Expo tunnel only tunnels Metro, not the API. Native refresh tokens use SecureStore; the web preview keeps them in memory and requires sign-in after a reload. The admin uses the API's HttpOnly refresh cookie.

## Implemented clients

- Admin: session restoration, metrics, product creation, inventory adjustments, order progression, customer suspension, review moderation, and visibility controls for categories, brands, coupons, and banners. Other admin records can be inspected.
- Customer: catalog search, product/variant details, registration and login, wishlist, saved delivery addresses, cart quantities, coupon submission, cash-on-delivery checkout with confirmation and retry keys, order cancellation/return requests, catalog-grounded assistant, and in-app notifications.
- Worker: periodically expires unpaid reservations and transactionally converts durable order events into in-app notifications. Delivery is idempotent across retries and concurrent workers.

## Verification

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

Integration tests start temporary MongoDB replica sets and Redis (`redis-server` must be available). The MongoDB test binary is downloaded on first use; local listening ports are required. In environments without Expo telemetry/cache access, use `EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run build -w @kmart/mobile`.

## Remaining scope

The original twelve-phase brief referenced in `docs/IMPLEMENTATION.md` is not present in this checkout, so complete compliance with that brief cannot be verified. The clients implement the existing API contracts; they are not evidence of a completed production release.

Online payment adapters, password-reset email delivery, push delivery, and an external AI provider still require implementation/configuration and acceptance testing. The current worker handles order notifications only and leaves password-reset outbox records unprocessed. Cash on delivery is the only enabled payment method. The assistant uses the existing deterministic catalog provider. Native device behavior and deployment still need validation.
