# KMart AI

A TypeScript monorepo with an Express/MongoDB API, React admin console, and Expo customer app. Prices are stored in integer paisa; clients display NPR and checkout uses server-calculated totals.

## Local setup

1. Install Node.js matching `package.json` and run `npm ci`.
2. Copy `.env.example` to `.env`. Set `JWT_SECRET` to a unique value of at least 48 characters (for example, generate it with `openssl rand -hex 48`).
3. Start MongoDB as a replica set and Redis. You can use `docker compose up -d mongo redis`. When connecting from the host to that Compose database, use `MONGO_URI=mongodb://127.0.0.1:27017/kmart?replicaSet=rs0&directConnection=true` in `.env`.
4. For development sample products and an admin account, add `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (at least 12 characters) to `.env`, then run `npm run seed -w @kmart/api`. The seed only runs in development, preserves existing records, and never promotes a customer account or changes an existing admin password.
5. Start the API with `npm run dev:api` and the order worker in another terminal with `npm run worker -w @kmart/api`.
6. Start the admin with `npm run dev:admin` (http://localhost:5173). Sign in using the email/password supplied to the seed.
7. Start the customer app with `npm run dev:mobile`. Register a customer account in its Account tab.

The admin development server proxies `/api` to port 4000. For a separate API deployment, set `VITE_API_URL` in `apps/admin/.env` to the API's `/api/v1` URL. Browser origins must be listed in the API's `ALLOWED_ORIGINS`.

The mobile app defaults to `http://localhost:4000/api/v1`. On a physical device, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to a reachable API address, including `/api/v1`. Native refresh tokens use SecureStore; the web preview keeps them in memory and requires sign-in after a reload. The admin uses the API's HttpOnly refresh cookie.

## Implemented clients

- Admin: session restoration, metrics, product creation, inventory adjustments, order progression, customer suspension, review moderation, and visibility controls for categories, brands, coupons, and banners. Other admin records can be inspected.
- Customer: catalog search, product/variant details, registration and login, wishlist, saved delivery addresses, cart quantities, coupon submission, cash-on-delivery checkout with confirmation and retry keys, order cancellation/return requests, catalog-grounded assistant, and in-app notifications.
- Worker: periodically expires unpaid reservations and transactionally converts durable order events into in-app notifications. Delivery is idempotent across retries and concurrent workers.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Integration tests start temporary MongoDB replica sets and Redis (`redis-server` must be available). The MongoDB test binary is downloaded on first use; local listening ports are required. In environments without Expo telemetry/cache access, use `EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run build -w @kmart/mobile`.

## Remaining scope

The original twelve-phase brief referenced in `docs/IMPLEMENTATION.md` is not present in this checkout, so complete compliance with that brief cannot be verified. The clients implement the existing API contracts; they are not evidence of a completed production release.

Online payment adapters, password-reset email delivery, push delivery, and an external AI provider still require implementation/configuration and acceptance testing. The current worker handles order notifications only and leaves password-reset outbox records unprocessed. Cash on delivery is the only enabled payment method. The assistant uses the existing deterministic catalog provider. Native device behavior and deployment still need validation.
