# Delivery ledger

This repository follows the twelve phases in the supplied KMart AI brief. A feature is not production-validated merely because its code exists. External provider credentials, real devices, deployment infrastructure and acceptance evidence are required for the release gate.

## Design decisions

- MongoDB is authoritative. A replica set is mandatory for transactional checkout, inventory, coupons and session rotation.
- Monetary values are integer paisa. Server-side calculations are authoritative; client totals are display-only.
- Redis stores expendable cache/rate-limit state and BullMQ queues. Durable job intent lives in MongoDB.
- Customer access tokens are short lived. Refresh secrets are hashed, rotated and bound to a revocable session family.
- Browser refresh secrets use HttpOnly cookies with origin checks; native tokens use SecureStore.
- Recommendations must be selected from bounded database retrieval. Model output cannot introduce products or execute actions.
- External integrations remain disabled until configured. There is no simulated successful payment path.

## Reference documentation

- [Mongoose transaction semantics](https://mongoosejs.com/docs/transactions.html)
- [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs)
- [Expo SDK reference](https://docs.expo.dev/versions/latest/)

## Release evidence

Updated as implementation and verification proceed. Do not interpret this initial ledger as a production certification.

## Restored missing implementation

The admin and mobile workspaces previously contained only package manifests. They now include application entry points, TypeScript configuration, authenticated API clients and screens for the existing catalog/commerce/admin contracts. The previously missing development seed entry point now creates sample catalog records and an explicitly configured administrator without overwriting existing data.

The worker now runs order expiration and processes durable order-notification events into in-app notifications with transactional, idempotent completion. Unsupported outbox kinds remain pending. See the README for setup and remaining integration work; the original twelve-phase brief was unavailable during this repair.
