# CLAUDE.md — Carrify Project Context

> This file is read automatically by Claude Code at the start of every session, and can be referenced by Cursor and other AI tools. It is the single source of truth for project context.
>
> When you (Claude) read this: trust the decisions documented here. They were made deliberately. Do not relitigate stack choices, business model, or architecture unless explicitly asked. If a decision needs revisiting, surface it explicitly rather than quietly working around it.

---

## Project at a Glance

**Carrify** is a managed game-boosting and coaching marketplace, similar to Overgear / Boosting Factory / ePicBoost.

- **Domain:** carrify.gg
- **Team size:** 2 developers (founder + cofounder)
- **Stage:** Early development, pre-launch, building MVP
- **Business model:** *Managed marketplace*. Carrify creates and prices services; boosters claim or are assigned to orders. Buyers do NOT pick individual boosters from a directory. This is intentional and not up for debate — it gives Carrify pricing control, quality control, and prevents off-platform poaching.

### What boosters do
Apply, get approved, complete KYC + Stripe Connect onboarding, then claim/accept orders from a queue. They never have public-facing profiles.

### What buyers do
Browse services by game, configure (e.g., "boost me from Gold 2 → Platinum 4"), pay, get matched with a booster, chat with that booster anonymously through the order, confirm completion, leave a review.

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | NestJS with Fastify adapter | TypeScript end-to-end. Not Express. Not Go. Not Rust. Decision was deliberate for 2-person team productivity. |
| Database | PostgreSQL | Local: Docker. Staging/prod: Neon. |
| ORM | Prisma | Migrations + client + seed. |
| Cache / Queues | Redis + BullMQ | Background jobs, sessions, presence. |
| Real-time | Socket.IO with Redis adapter | Buyer↔booster chat, order status updates. |
| Frontend | Next.js (App Router) | TypeScript, same language as backend. |
| Styling | Tailwind + shadcn/ui | |
| Auth | Clerk | Do NOT build auth ourselves. |
| Payments | Stripe Connect (Express accounts) | Handles KYC, payouts, 1099s. |
| Email | Resend | Plus Google Workspace for hello@carrify.gg etc. |
| Errors | Sentry | Frontend + backend. |
| Analytics | PostHog | Product + funnel analytics. |
| Hosting | Railway or Fly.io (early), AWS later | |
| CDN/DDoS | Cloudflare does NOT support .gg | Use Vercel for frontend's edge, Railway/Fly's built-in protection for API. Revisit later. |

### Why these specifically
- TypeScript end-to-end so two devs can fix anything
- Opinionated frameworks (NestJS, Next.js) reduce architectural bikeshedding
- Managed services (Clerk, Stripe, Neon, etc.) so we don't burn time on undifferentiated infra
- Shared types between frontend and backend via Zod schemas in `packages/shared`

---

## Monorepo Structure

```
carrify/
├── docker-compose.yml          # Local Postgres + Redis
├── turbo.json
├── package.json (root)
├── pnpm-workspace.yaml
├── CLAUDE.md                   # this file
├── apps/
│   ├── api/                    # NestJS backend
│   │   ├── src/
│   │   ├── prisma.config.ts (if used)
│   │   ├── Dockerfile          # production image
│   │   └── package.json
│   └── web/                    # Next.js frontend
│       ├── app/
│       ├── Dockerfile
│       └── package.json
└── packages/
    ├── db/                     # Prisma schema + migrations + generated client
    │   ├── prisma/
    │   │   ├── schema.prisma
    │   │   └── seed.ts
    │   └── package.json
    └── shared/                 # Zod schemas + inferred TS types
        ├── src/schemas/
        └── package.json
```

**Important rules:**
- `docker-compose.yml` lives at the root, NOT inside `apps/api`. The DB is shared infra.
- Logger (Pino, when added) lives in `apps/api` only. The frontend uses Sentry for errors, PostHog for events.
- Don't make shared packages unless multiple apps actually need them. Don't preemptively extract a "logger package" or "config package."

---

## Domain Model

### Core entities

```prisma
model User {
  id           String   @id @default(cuid())
  clerkId      String   @unique
  email        String   @unique
  displayName  String?
  avatarUrl    String?
  
  buyerOrders     Order[]          @relation("BuyerOrders")
  boosterOrders   Order[]          @relation("BoosterOrders")
  boosterProfile  BoosterProfile?
  
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model BoosterProfile {
  userId              String   @id
  user                User     @relation(fields: [userId], references: [id])
  
  status              BoosterStatus  @default(PENDING)
  tier                BoosterTier    @default(STANDARD)
  
  tags                String[]       // ["lol", "diamond+", "english", "eu-west"]
  
  stripeAccountId     String?
  payoutSchedule      String?
  
  completedOrders     Int      @default(0)
  avgRating           Float?
  responseTimeMin     Int?
  cancellationRate    Float?
  isAvailable         Boolean  @default(true)
  currentLoad         Int      @default(0)
  maxConcurrentOrders Int      @default(3)
  
  appliedAt           DateTime @default(now())
  approvedAt          DateTime?
}

model Game {
  id          String   @id @default(cuid())
  slug        String   @unique   // "wow", "lol", "valorant", "dota2"
  name        String
  iconUrl     String?
  isActive    Boolean  @default(true)
  
  services    Service[]
  ranks       Rank[]
}

model Service {
  // Carrify-defined. Buyers pick from these; boosters do NOT create them.
  id            String   @id @default(cuid())
  gameId        String
  game          Game     @relation(fields: [gameId], references: [id])
  
  slug          String   // "rank-boost", "coaching", "placement-matches"
  name          String
  description   String
  category      ServiceCategory
  
  configSchema  Json     // Zod schema serialized — defines the buyer-facing form
  pricingModel  PricingModel
  pricingData   Json     // shape depends on pricingModel
  
  requiredBoosterTags String[]
  isActive      Boolean  @default(true)
  
  @@unique([gameId, slug])
}

model Rank {
  id        String   @id @default(cuid())
  gameId    String
  game      Game     @relation(fields: [gameId], references: [id])
  tier      String   // "Bronze", "Silver", "Gold"
  division  Int?     // 4, 3, 2, 1 — null for tier-only games
  order     Int      // global ordering within the game
  iconUrl   String?
  
  @@unique([gameId, tier, division])
  @@index([gameId, order])
}

model Order {
  id                 String   @id @default(cuid())
  buyerId            String
  buyer              User     @relation("BuyerOrders", fields: [buyerId], references: [id])
  
  serviceId          String
  service            Service  @relation(fields: [serviceId], references: [id])
  
  config             Json     // buyer's chosen configuration, e.g. { fromRank, toRank, modifiers }
  
  // Price snapshot — never recompute
  priceCents         Int
  platformFeeCents   Int
  boosterPayoutCents Int
  currency           String   @default("USD")
  
  // Booster assignment (nullable until claimed/assigned)
  boosterId          String?
  booster            User?    @relation("BoosterOrders", fields: [boosterId], references: [id])
  assignedAt         DateTime?
  
  status             OrderStatus  @default(PENDING_PAYMENT)
  
  events             OrderEvent[]
  
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  
  @@index([status, createdAt])
  @@index([buyerId])
  @@index([boosterId])
}

model OrderEvent {
  // Immutable append-only audit log. Never UPDATE, never DELETE.
  id        String   @id @default(cuid())
  orderId   String
  order     Order    @relation(fields: [orderId], references: [id])
  
  type      String   // "PAYMENT_RECEIVED", "BOOSTER_ASSIGNED", "STATUS_CHANGED", etc.
  data      Json
  
  actorType String   // "BUYER" | "BOOSTER" | "ADMIN" | "SYSTEM" | "STRIPE"
  actorId   String?
  
  createdAt DateTime @default(now())
  
  @@index([orderId, createdAt])
}

model LedgerEntry {
  // Double-entry bookkeeping for every money movement.
  // Two rows per movement (debit + credit). Immutable.
  id            String   @id @default(cuid())
  orderId       String?
  userId        String?
  
  account       String   // "platform_revenue", "booster_payable", "buyer_refundable", etc.
  direction     String   // "DEBIT" | "CREDIT"
  amountCents   Int
  currency      String   @default("USD")
  
  description   String
  externalRef   String?  // Stripe payment_intent id, transfer id, etc.
  
  createdAt     DateTime @default(now())
  
  @@index([orderId])
  @@index([userId])
  @@index([account])
}
```

### Enums

```prisma
enum ServiceCategory {
  BOOST
  COACHING
  FARMING
  COMPLETION
  PLACEMENT
  OTHER
}

enum PricingModel {
  RANK_MATRIX
  PER_UNIT
  TIERED
  FLAT
}

enum OrderStatus {
  PENDING_PAYMENT
  PAID
  AWAITING_BOOSTER
  ASSIGNED
  IN_PROGRESS
  DELIVERED
  COMPLETED
  DISPUTED
  CANCELLED
  REFUNDED
}

enum BoosterStatus {
  PENDING
  APPROVED
  SUSPENDED
  REJECTED
  INACTIVE
}

enum BoosterTier {
  STANDARD
  PREMIUM
  ELITE
}
```

---

## Order State Machine

Use **XState** to model transitions. Do NOT mutate `order.status` ad-hoc — every transition goes through the state machine.

```
PENDING_PAYMENT
  ↓ (Stripe webhook: payment_intent.succeeded)
PAID
  ↓ (auto, immediate)
AWAITING_BOOSTER
  ↓ (admin assigns OR booster claims)
ASSIGNED
  ↓ (booster confirms start within window; auto-reverts to AWAITING_BOOSTER if no response in 10 min)
IN_PROGRESS
  ↓ (booster marks delivered)
DELIVERED
  ↓ (buyer confirms OR auto-confirm after 72h)
COMPLETED
  → triggers payout to booster
```

**Branches:**
- `DISPUTED` from `IN_PROGRESS` or `DELIVERED` (either party can open)
- `CANCELLED` from `PAID` or earlier (no work started)
- `REFUNDED` from `CANCELLED` or as resolution of `DISPUTED`

**Things that are NOT separate statuses:**
- Pause/resume — use a boolean flag on Order, not a status
- Reassignment — go back to `AWAITING_BOOSTER`, log as OrderEvent
- "Awaiting payment confirmation by webhook" — that's just `PENDING_PAYMENT`

Every transition appends an `OrderEvent` row. Chat history persists across reassignment.

---

## Pricing System

`Service.pricingModel` + `Service.pricingData` drive how prices are calculated. All calculation lives in a `PricingService` in `apps/api/src/pricing/`. Never inline price math in controllers.

### Models

**RANK_MATRIX** — for rank boost services
```json
{
  "basePriceCents": 500,
  "perDivisionCents": 300,
  "tierMultipliers": {
    "bronze": 1.0, "silver": 1.0, "gold": 1.1,
    "platinum": 1.3, "diamond": 1.7, "master": 2.5,
    "grandmaster": 3.5, "challenger": 5.0
  },
  "modifiers": {
    "soloOnly": 1.4,
    "specificRole": 1.15,
    "streaming": 1.1
  }
}
```

**PER_UNIT** — for coaching, gold farming
```json
{ "pricePerUnitCents": 2500, "unitName": "hour", "minUnits": 1, "maxUnits": 20 }
```

**TIERED** — for placement matches with diminishing rates
```json
{
  "tiers": [
    { "upTo": 5, "perUnitCents": 1500 },
    { "upTo": 10, "perUnitCents": 1200 },
    { "upTo": 100, "perUnitCents": 1000 }
  ]
}
```

**FLAT** — fixed price
```json
{ "priceCents": 4999 }
```

### Rules

- ALL money is integer cents. Never use floats for currency. Ever.
- `Order.priceCents` is a snapshot at order time. Future price changes don't affect existing orders.
- Platform take: 20% by default. Configurable per-service later. Currently NOT per-booster.
- Booster payout share varies by `BoosterTier`: STANDARD 70%, PREMIUM 75%, ELITE 80% of `priceCents`. The buyer always pays the same price; the platform's take shrinks for higher-tier boosters.

---

## Matching System

**Current strategy: manual admin assignment.** Orders enter `AWAITING_BOOSTER`, admin assigns from a dashboard.

**Next iteration (after ~50 orders): claim queue.** Qualified boosters see a queue of unassigned orders and click to claim. First valid claim wins.

**Future (if cherry-picking becomes a problem): automatic assignment.** Algorithm scores boosters and pushes orders. Booster has window to accept/decline.

A booster qualifies for an order if `Service.requiredBoosterTags ⊆ BoosterProfile.tags` AND `BoosterProfile.status == APPROVED` AND `isAvailable` AND `currentLoad < maxConcurrentOrders`.

---

## Team & Ownership

Two-person team. Split by **vertical slice**, not frontend/backend.

**Dev A — "Money Side"**
Payments, payouts, Stripe Connect integration, KYC, disputes, refunds, ledger, admin financial tools.

**Dev B — "Product Side"**
Catalog, services, orders, chat, booster onboarding (non-financial), reviews, search, matching.

**Shared (pair on these)**
Auth setup (Clerk), design system, deployment, admin shell, marketing site.

**Rule:** if you're touching the other person's slice, ping in Slack first. No silent cross-slice PRs.

---

## Coding Conventions

### General
- TypeScript strict mode everywhere
- Zod for all validation, schemas in `packages/shared`
- Prefer composition over inheritance
- Pure functions for business logic, classes for stateful services
- No `any`. Use `unknown` and narrow, or fix the types.

### NestJS specifics
- Controllers stay thin — parse request, call service, return result
- Services contain business logic; no HTTP knowledge
- One module per domain concept (`orders`, `payments`, `chat`, etc.)
- Use NestJS DI properly — no `new Service()` in controllers
- Dependency injection over service locator patterns

### Logging
- Currently: NestJS built-in `Logger` is fine. Don't over-engineer.
- Pino + nestjs-pino added later when there's a real reason (production debugging, log aggregator integration). Not now.

### Money
- `*Cents` suffix on every monetary field, every variable
- Integer arithmetic only
- Round at the boundary (when displaying or charging Stripe), not inside calculations
- Every money movement creates two LedgerEntry rows (debit + credit). Nightly reconciliation job compares ledger sum to Stripe balance.

### Database
- All migrations through Prisma — never edit prod schema by hand
- Index every foreign key and every column you'll filter/sort on
- Never DELETE rows for orders, users, ledger entries, or order events — soft-delete or status-flag instead
- `cuid()` over `uuid()` for IDs (URL-safe, sortable)

### Naming
- Models in `PascalCase`, fields in `camelCase` (Prisma defaults)
- Files in `kebab-case.ts`
- Routes in `kebab-case`
- Env vars in `SCREAMING_SNAKE_CASE`
- React components in `PascalCase.tsx`

---

## Infrastructure

### Local dev
- Docker Compose at root with Postgres + Redis
- `pnpm db:up` / `pnpm db:reset` scripts in root package.json
- `.env` per app, with `.env.example` checked in

### Staging/Prod
- Neon for Postgres (use POOLED connection string for app, DIRECT for migrations)
- Upstash for Redis
- Railway or Fly.io for the API
- Vercel for the frontend
- Sentry for errors, PostHog for analytics, Resend for transactional email

### Known issues
- Cloudflare does not support `.gg` domains for new additions on free plan. Skip Cloudflare for now; revisit later or transfer to Porkbun if we really want it.
- Neon free tier auto-suspends after 5 min idle. Cold starts cause WebSocket errors. Use Docker locally; upgrade Neon to paid tier when staging matters.

---

## Domain & Accounts

- Domain registrar: **Namecheap**
- Domain: `carrify.gg`
- Email: **Google Workspace** on the domain (`hello@`, `support@`, `disputes@`, `boosters@`)
- DNS: Namecheap (Cloudflare unavailable for `.gg` on free tier)
- GitHub org: `carrify-gg` (because `carrify` was taken)
- Trademark: not filed yet. Plan to file USPTO Class 41 once revenue starts or by month 6.

### Handles secured
- X / Twitter: `@carrify` (confirm)
- Instagram, TikTok, YouTube, Discord, Reddit: to be claimed
- npm scope: `@carrify-gg` (consistent with GitHub)

---

## Anti-Patterns to Avoid

1. **Building auth ourselves.** Use Clerk. Period.
2. **Floating-point money.** Integer cents only.
3. **Storing computed balances.** Always derive from LedgerEntry rows.
4. **Treating chat as an afterthought.** Persist every message, admin-readable, never delete.
5. **One 60-column orders table.** Use OrderEvent for history, separate concerns.
6. **Hand-rolled state machines with if-else.** Use XState.
7. **Premature microservices.** One NestJS app until we have 10+ engineers.
8. **Optimizing performance before users exist.** Postgres handles 100k orders/day on a $20 instance.
9. **Launching with 5 games.** Start with ONE. Dominate it. Then expand.
10. **Both devs working on the same feature.** Vertical slices exist to prevent this.
11. **Public booster profiles.** This is a managed marketplace. Boosters stay anonymous to buyers.
12. **Letting boosters set their own prices.** Carrify controls pricing.
13. **Auto-applying schema changes to prod.** Always review migration SQL before running.
14. **Trusting JSON fields without Zod validation.** Validate on read AND write.

---

## Roadmap Phase (current)

**Phase 0: Foundation** — in progress.

Done so far:
- [x] Domain bought (carrify.gg on Namecheap)
- [x] Google Workspace verified, MX records set
- [x] Monorepo skeleton (Turborepo + NestJS + Next.js)
- [x] Local Docker Postgres working

In progress:
- [ ] Clerk auth wired up (both apps)
- [ ] CI on GitHub Actions
- [ ] Staging + prod deploys
- [ ] Initial Prisma schema with enums

Not started (Phase 1+):
- [ ] First game seeded (TBD which: WoW / LoL / Valorant)
- [ ] Service catalog UI
- [ ] Order creation + Stripe payment flow
- [ ] Stripe Connect booster onboarding
- [ ] Order state machine (XState)
- [ ] Chat (Socket.IO)
- [ ] Admin assignment dashboard
- [ ] Disputes + reviews

---

## Open Decisions (need to make before they block work)

- **Which game to launch with?** Pick ONE. Recommendation: whichever the founders personally know best.
- **Account sharing policy?** Most boosting requires booster logging into buyer's account, which violates many games' ToS. Decide: account-sharing allowed (Overgear model, larger market, more legal risk) or self-play coaching/duo-only (smaller market, cleaner). This affects ToS, payment processor relationships, and product surface area. Talk to a lawyer before this goes live.
- **Take rate per service category?** Default 20%. Coaching probably should be lower (15%) to attract premium coaches. Decide before launch pricing.
- **Auto-confirm window?** Default 72h post-delivery. Could be shorter for cheaper services.

---

## How to Work With This Codebase (notes for AI assistants)

- Read the Prisma schema before suggesting data model changes
- Read the relevant module's existing code before proposing a new file structure
- When in doubt about whether a feature belongs in `apps/api` or `apps/web`: business logic → api, presentation → web
- When asked to add a feature, ask which phase it belongs in if it's unclear — we ship in slices
- Prefer editing existing files over creating new ones
- Don't add dependencies without a clear reason; ask first if the choice is non-obvious
- Always use integer cents for money
- Never mutate `order.status` outside the state machine
- Never delete rows from `Order`, `OrderEvent`, `LedgerEntry`, `User`, or `BoosterProfile`