# Carrify

**A managed game-boosting and coaching marketplace** for League of Legends, Valorant and Dota 2.

Carrify defines and prices every service itself. Buyers configure what they want (e.g. *Gold 2 → Platinum 4*), pay through Stripe, and the order goes into a queue where vetted boosters claim it. Boosters have no public profiles and buyers never pick from a directory. That keeps pricing, quality and the customer relationship on the platform.

> **Status:** early development / pre-launch MVP. The core order lifecycle (pricing → checkout → claim → delivery → completion → booster payout) works end to end.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Repository structure](#repository-structure)
- [How an order flows](#how-an-order-flows)
- [Money: pricing, payouts and the ledger](#money-pricing-payouts-and-the-ledger)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database](#database)
- [API reference](#api-reference)
- [Frontend routes](#frontend-routes)
- [Scripts](#scripts)
- [Security notes](#security-notes)
- [Roadmap](#roadmap)

---

## Features

**For buyers**
- Browse services per game: rank boosts, placement matches and coaching
- Configure an order and get a live server-side price preview
- Pay with Stripe Checkout
- Securely share game account credentials with the assigned booster (encrypted at rest)
- Track order status and confirm completion

**For boosters**
- Apply to become a booster (games, ranks, experience, Discord)
- Onboard to Stripe Connect (Express accounts handle KYC and payouts)
- Browse the queue of available orders and claim them
- Start and deliver orders; payouts are released automatically when the buyer confirms

**For admins**
- Review, approve or reject booster applications
- Manage the service catalog (games, services, pricing)

**Under the hood**
- Explicit order **state machine** that rejects illegal transitions
- Append-only **order event log** for a full audit trail
- **Double-entry ledger** recording every money movement
- **Idempotent** Stripe webhook handling and payouts
- Tier-based booster payout splits
- Shared **Zod** schemas and types between the API and the web app

---

## Tech stack

| Layer | Technology |
|---|---|
| Monorepo | [Turborepo](https://turbo.build/) + npm workspaces |
| Backend | [NestJS 11](https://nestjs.com/) (TypeScript) |
| Database | PostgreSQL ([Neon](https://neon.tech/) serverless driver) |
| ORM | [Prisma 7](https://www.prisma.io/) (migrations + seed) |
| Frontend | [Next.js 16](https://nextjs.org/) (App Router), React 19 |
| Styling | Tailwind CSS 4 |
| Auth | [Clerk](https://clerk.com/) (frontend + backend, synced to the DB via Svix webhooks) |
| Payments | [Stripe](https://stripe.com/) Checkout + Stripe Connect (Express) |
| Validation | [Zod](https://zod.dev/) (shared in `packages/types`) |
| Testing | Jest (unit + e2e) |

TypeScript is used end to end so the same schemas and types are shared across the stack.

---

## Repository structure

```
Carrify/
├── apps/
│   ├── api/                      # NestJS backend (port 3000)
│   │   ├── prisma/
│   │   │   ├── schema.prisma     # Data model
│   │   │   ├── migrations/       # SQL migrations
│   │   │   ├── seed.ts           # Seeds games, ranks, services
│   │   │   └── seed-data/        # JSON per game: lol/, valorant/, dota2/
│   │   ├── src/
│   │   │   ├── auth/             # Clerk guard, roles guard, Clerk webhooks
│   │   │   ├── applications/     # Booster applications
│   │   │   ├── admin/            # Application review
│   │   │   ├── catalog/          # Games, services, pricing engine
│   │   │   ├── orders/           # Orders, state machine, Stripe webhook,
│   │   │   │                     # Connect onboarding, credential encryption
│   │   │   ├── payments/         # Stripe client provider
│   │   │   └── prisma/           # Prisma service
│   │   ├── test/                 # e2e tests
│   │   └── requests.http         # Handy HTTP requests for local testing
│   └── web/                      # Next.js frontend (port 8000)
│       ├── app/                  # Routes (see "Frontend routes")
│       ├── lib/                  # API client, game helpers, useMe hook
│       └── proxy.ts              # Clerk middleware
└── packages/
    ├── types/                    # Shared Zod schemas: pricing, service config, seed
    ├── ui/                       # Shared React components
    ├── eslint-config/            # Shared ESLint configs
    └── typescript-config/        # Shared tsconfig presets
```

---

## How an order flows

Every order moves through an explicit state machine (`apps/api/src/orders/order-status.ts`). Any transition not listed is rejected.

```
PENDING_PAYMENT ──► PAID ──► AWAITING_BOOSTER ──► ASSIGNED ──► IN_PROGRESS ──► DELIVERED ──► COMPLETED
       │              │              │                │              │              │
       ▼              ▼              ▼                ▼              ▼              ▼
   CANCELLED      CANCELLED      CANCELLED     AWAITING_BOOSTER   DISPUTED       DISPUTED
       │                                        (booster didn't       │
       ▼                                           start)             ├──► REFUNDED
   REFUNDED                                                            └──► IN_PROGRESS
```

1. **Order created:** the buyer submits a service and config. The API computes the price itself (it never trusts a client-sent price), stores a price snapshot and creates a Stripe Checkout session.
2. **Paid:** Stripe sends `checkout.session.completed`. The webhook marks the order paid, records the charge ID and moves it straight to `AWAITING_BOOSTER`. Duplicate webhook deliveries are ignored.
3. **Claimed:** an approved booster claims the order from the queue. The payout split is set based on their tier.
4. **In progress → delivered:** the booster starts and then delivers the work.
5. **Completed:** the buyer confirms. The booster's payout is sent via a Stripe Connect transfer. If the booster hasn't finished onboarding yet, the payout is marked pending and backfilled automatically once their account becomes payout-enabled.

Every step writes an immutable `OrderEvent` (who did what, when) for a complete audit trail.

---

## Money: pricing, payouts and the ledger

### Pricing models

Each service has a pricing model with validated data (`packages/types/pricing.ts`):

| Model | Use case | Data |
|---|---|---|
| `RANK_MATRIX` | Rank boosts | Base price, per-division price, tier multipliers, modifiers |
| `PER_UNIT` | Placement matches, coaching hours | Price per unit, unit name, min/max units |
| `TIERED` | Volume discounts | Ascending tiers of `upTo` + per-unit price |
| `FLAT` | Fixed-price services | A single price |

Prices are stored in **cents**. The default currency is **CHF**.

### Revenue split

- The platform take is **20%** at checkout, so the booster payout is snapshotted at the maximum of 80%.
- When a booster claims an order, the split is adjusted to their tier:

| Booster tier | Payout share |
|---|---|
| `STANDARD` | 70% |
| `PREMIUM` | 75% |
| `ELITE` | 80% |

The difference moves from `booster_payable` to `platform_revenue` in the ledger.

### Double-entry ledger

Every money movement writes balanced, immutable `LedgerEntry` rows (debits = credits):

| Event | Debit | Credit |
|---|---|---|
| Buyer pays | `stripe_cash` (full price) | `booster_payable` + `platform_revenue` |
| Booster claims (lower tier) | `booster_payable` (delta) | `platform_revenue` (delta) |
| Payout sent | `booster_payable` | `stripe_cash` |

Payouts use Stripe `transfer_group` and `source_transaction` (linked to the original charge) and an idempotency key per order, so a payout can never be sent twice.

---

## Getting started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 11
- A **PostgreSQL** database (a free [Neon](https://neon.tech/) project works, or a local Postgres)
- A **Clerk** application
- A **Stripe** account in test mode, with Connect enabled
- The [Stripe CLI](https://stripe.com/docs/stripe-cli) for forwarding webhooks locally

### 1. Clone and install

```bash
git clone https://github.com/maxkaiser11/Carrify.git
cd Carrify
npm install
```

### 2. Configure environment variables

```bash
cp apps/api/.env.example apps/api/.env
```

Fill in `apps/api/.env` and create `apps/web/.env.local`. See [Environment variables](#environment-variables) below.

### 3. Set up the database

```bash
cd apps/api
npx prisma migrate dev     # apply migrations and generate the client
npx prisma db seed         # seed games, ranks and services
cd ../..
```

### 4. Forward webhooks

**Stripe:**

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

Copy the `whsec_...` secret it prints into `STRIPE_WEBHOOK_SECRET`.

**Clerk:** in the Clerk dashboard, add a webhook endpoint pointing at `<your-public-url>/webhooks/clerk` (use a tunnel such as ngrok locally). Copy its signing secret into `CLERK_WEBHOOK_SIGNING_SECRET`. Alternatively, the frontend can call `POST /auth/sync` to sync the signed-in user.

### 5. Run everything

```bash
npm run dev
```

| App | URL |
|---|---|
| Web | http://localhost:8000 |
| API | http://localhost:3000 |
| Health check | http://localhost:3000/health |

### Making yourself an admin

New users get the `CUSTOMER` role. To access the admin pages, set your role directly in the database:

```bash
cd apps/api && npx prisma studio
```

Then set `role` to `ADMIN` on your `User` row.

---

## Environment variables

### `apps/api/.env`

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string (pooled) |
| `DIRECT_URL` | Direct (non-pooled) connection string, used by Prisma migrations |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Signing secret for the Clerk webhook endpoint |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `WEB_APP_URL` | Frontend base URL, used for Checkout and Connect redirects (e.g. `http://localhost:8000`) |
| `CREDENTIALS_ENCRYPTION_KEY` | 32-byte base64 key for encrypting account credentials. Generate with `openssl rand -base64 32` |

### `apps/web/.env.local`

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | API base URL (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |

---

## Database

The schema lives in `apps/api/prisma/schema.prisma`. Main models:

| Model | Purpose |
|---|---|
| `User` | Synced from Clerk; has a `role` of `CUSTOMER`, `BOOSTER` or `ADMIN` |
| `BoosterApplication` | A user's application to become a booster, plus review outcome |
| `BoosterProfile` | Approved booster: status, tier, tags, Stripe Connect account, current load |
| `Game` / `Rank` | Supported games and their ordered rank ladders |
| `Service` | A product Carrify sells (e.g. *LoL Rank Boost*): config schema, pricing model, required booster tags |
| `Order` | A purchase: config, price snapshot, assigned booster, status, Stripe references |
| `OrderCredentials` | Account login shared with the booster (password encrypted with AES-256-GCM) |
| `OrderEvent` | Append-only audit log for each order |
| `LedgerEntry` | Immutable double-entry bookkeeping rows |

### Seed data

Catalog data is defined as JSON in `apps/api/prisma/seed-data/<game>/`:

```
seed-data/lol/
├── game.json          # name, slug, icon
├── ranks.json         # ordered ranks and divisions
└── services/
    ├── rank-boost.json
    ├── placement-matches.json
    └── coaching.json
```

To add a game, add a folder with the same shape and re-run `npx prisma db seed`. Seed files are validated against the Zod schemas in `packages/types/seed.ts`.

---

## API reference

All authenticated routes expect a Clerk session token. Role-restricted routes are enforced by `RolesGuard`.

### General
| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |

### Auth
| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/me` | Current user and role |
| `POST` | `/auth/sync` | Sync the Clerk user into the database |
| `POST` | `/webhooks/clerk` | Clerk user lifecycle webhook (Svix-verified) |

### Catalog
| Method | Path | Description |
|---|---|---|
| `GET` | `/games` | List active games |
| `GET` | `/games/:slug` | Game with its ranks and services |
| `POST` | `/pricing/preview` | Compute a price for a service and config |
| `GET` | `/admin/services` | List services (admin) |
| `POST` | `/admin/services` | Create a service (admin) |

### Booster applications
| Method | Path | Description |
|---|---|---|
| `POST` | `/applications` | Submit a booster application |
| `GET` | `/applications/me` | Your application status |
| `GET` | `/admin/applications` | List applications (admin) |
| `POST` | `/admin/applications/:id/approve` | Approve; creates a booster profile (admin) |
| `POST` | `/admin/applications/:id/reject` | Reject (admin) |

### Orders (buyer)
| Method | Path | Description |
|---|---|---|
| `POST` | `/orders` | Create an order and return a Stripe Checkout URL |
| `GET` | `/orders` | Your orders |
| `GET` | `/orders/:id` | Order detail (buyer or assigned booster) |
| `PUT` | `/orders/:id/credentials` | Set account credentials for the booster |
| `GET` | `/orders/:id/credentials` | Read credentials (buyer, assigned booster or admin) |
| `POST` | `/orders/:id/complete` | Confirm completion and trigger the payout |

### Orders (booster)
| Method | Path | Description |
|---|---|---|
| `GET` | `/orders/booster/available` | Orders waiting to be claimed |
| `GET` | `/orders/booster/mine` | Orders assigned to you |
| `POST` | `/orders/:id/claim` | Claim an order |
| `POST` | `/orders/:id/start` | Mark as in progress |
| `POST` | `/orders/:id/deliver` | Mark as delivered |

### Payments
| Method | Path | Description |
|---|---|---|
| `POST` | `/connect/onboarding-link` | Create or resume Stripe Connect onboarding |
| `GET` | `/connect/status` | Connect account and payout status |
| `POST` | `/webhooks/stripe` | Stripe webhook (signature-verified, uses the raw body) |

---

## Frontend routes

| Route | Who | Description |
|---|---|---|
| `/` | Everyone | Landing page and game catalog |
| `/lol`, `/valorant`, `/dota2` | Everyone | Service configuration and checkout per game |
| `/orders` | Buyer | Your orders |
| `/orders/[id]` | Buyer / booster | Order detail, credentials, completion |
| `/user` | Signed-in user | Account page |
| `/apply` | Signed-in user | Booster application form |
| `/booster/orders` | Booster | Order queue and assigned orders |
| `/booster/payouts` | Booster | Stripe Connect onboarding and payout status |
| `/admin/applications` | Admin | Review booster applications |
| `/admin/services` | Admin | Manage the service catalog |

---

## Scripts

From the repo root (run through Turborepo):

| Command | Description |
|---|---|
| `npm run dev` | Run the API and web app in watch mode |
| `npm run build` | Build all apps and packages |
| `npm run lint` | Lint everything |
| `npm run check-types` | Type-check everything |
| `npm run format` | Format with Prettier |

From `apps/api`:

| Command | Description |
|---|---|
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run test:cov` | Test coverage |
| `npx prisma migrate dev` | Create/apply migrations |
| `npx prisma db seed` | Seed the catalog |
| `npx prisma studio` | Browse the database |

---

## Security notes

- **Prices are server-authoritative.** The client only sends the service and config; the API computes the amount.
- **Webhooks are verified:** Stripe by signature against the raw request body, Clerk via Svix.
- **Credentials are encrypted** with AES-256-GCM using a versioned format (`v1.<iv‖tag‖ciphertext>`) so keys can be rotated later. Only the buyer, the assigned booster and admins can read them. In production, the key should come from a secrets manager or KMS.
- **Payouts are idempotent** (one Stripe idempotency key per order), and payment webhook handling is safe to re-deliver.
- **Audit trail:** `OrderEvent` and `LedgerEntry` are append-only and never updated or deleted.

---

## Roadmap

- [ ] Buyer ↔ booster anonymous chat per order (Socket.IO + Redis adapter)
- [ ] Background jobs (BullMQ), e.g. auto-reverting claimed orders that are never started
- [ ] Disputes, cancellations and refunds (`charge.refunded`, `payment_intent.payment_failed` webhooks)
- [ ] Reviews after completion
- [ ] Transactional email (Resend)
- [ ] Error tracking (Sentry) and product analytics (PostHog)
- [ ] `docker-compose.yml` for local Postgres and Redis
- [ ] Deployment (Vercel for web, Railway/Fly.io for the API)

---

## License

Proprietary. All rights reserved.
