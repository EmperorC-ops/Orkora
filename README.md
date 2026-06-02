# Orkora

A production grade event management platform for mobile and web, built for African and global markets. Monorepo: NestJS API, Next.js admin, Expo attendee app.

## Project layout

```
orkora/
├── apps/
│   ├── api/         NestJS backend (REST, GraphQL ready, WebSocket ready)
│   ├── web/         Next.js 14 admin + public event pages
│   └── mobile/      Expo + expo-router attendee app (RN, iOS + Android + Web)
├── packages/
│   ├── contracts/   Zod schemas, the source of truth for API shapes
│   ├── sdk/         Typed API client used by web and mobile
│   ├── ui/          Shared design tokens (brand color ramp, gradients)
│   └── config/      Shared eslint base
├── infra/
│   ├── docker/      docker-compose for local Postgres, Redis, MailHog, MinIO
│   └── terraform/   AWS infrastructure as code (staging + production)
├── .github/         CI and deploy workflows
├── EVENTAPP_BLUEPRINT.md  Full architectural blueprint (read this first)
└── schema.sql       PostgreSQL schema with RLS policies
```

## Prerequisites

- Node.js 20.11 or later
- pnpm 9 (`npm install -g pnpm`)
- Docker Desktop (for local Postgres and Redis)
- For mobile: Expo Go app on your phone or an iOS/Android simulator

## First time setup

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Spin up local Postgres + Redis + MailHog + MinIO
pnpm db:up

# 3. Copy env templates and fill in
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 4. Generate JWT keys for local auth and paste them into apps/api/.env
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
# Then paste private.pem into JWT_PRIVATE_KEY and public.pem into JWT_PUBLIC_KEY

# 5. Run database migrations and seed demo data
pnpm db:migrate
pnpm db:seed
```

The seed creates a demo organization, an owner account (`owner@demo.orkora.events` / `Demo1234!`), and an event with code `DEMO2026`.

## Run it

In separate terminals:

```bash
# Terminal 1: API on http://localhost:4000  (Swagger at /docs)
pnpm --filter @orkora/api dev

# Terminal 2: Web admin on http://localhost:3000
pnpm --filter @orkora/web dev

# Terminal 3: Mobile (scan the QR with Expo Go)
pnpm --filter @orkora/mobile dev
```

Or run all three in parallel: `pnpm dev`.

Try the flow: open the Expo app, type `DEMO2026` in the event code screen, and you should land on the event home.

## Common scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start API, web, and mobile in parallel |
| `pnpm build` | Build everything via Turborepo |
| `pnpm lint` | Lint every workspace |
| `pnpm typecheck` | Strict TypeScript pass across the monorepo |
| `pnpm test` | Run all unit tests |
| `pnpm db:up` / `pnpm db:down` | Start / stop local infra |
| `pnpm db:migrate` | Apply Prisma migrations |
| `pnpm db:seed` | Insert demo data |
| `pnpm format` | Prettier write |

## Where to look first

- `EVENTAPP_BLUEPRINT.md` covers the architecture, build plan, and deployment guide. Read this before making changes.
- `apps/api/src/modules/` is where all bounded contexts live. The API is a modular monolith. Each module is the seam along which it can be split into a service later.
- `apps/api/prisma/schema.prisma` mirrors `schema.sql` for application access.
- `apps/mobile/app/(auth)/code.tsx` is the event code entry screen that matches the reference UI.
- `packages/contracts/src/index.ts` is the single source of truth for shared types between API and clients.

## Stack

- **Mobile:** React Native via Expo, expo-router, Tanstack Query, expo-secure-store
- **Web:** Next.js 14 App Router, Tailwind, Radix primitives, Tanstack Query
- **Backend:** NestJS, Prisma, PostgreSQL 15 with RLS, Redis, Socket.IO, BullMQ
- **Infra:** Docker Compose locally, AWS ECS Fargate + RDS + ElastiCache + S3 + CloudFront in production
- **Payments:** Stripe (global), Paystack and Flutterwave (Africa) - provider registry pattern, see `apps/api/src/modules/payments/providers/` (added in Phase 3)
- **CI/CD:** GitHub Actions with OIDC into AWS, no long-lived AWS keys

## What's next

The build is now MVP-deployable. The pre-launch checklist in
`OUTSTANDING.md` is down to one item (production secrets rotation, scripted
in `scripts/rotate-secrets.sh`). What's been shipped so far:

- **Identity & auth (Phase 1):** email + password, Apple / Google sign-in
  with verified JWKs, OTP via Postmark / Termii, refresh token in httpOnly
  cookie, per-user rate limiting, request-id correlation.
- **Event builder (Phase 2):** organizer dashboard with event create,
  publish / unpublish / archive, banner upload, tracks / sessions /
  speakers / ticket tiers create UI, public landing page with agenda.
- **Tickets & payments (Phase 3):** Stripe / Paystack / Flutterwave via a
  provider registry, per-(org, currency) provider preferences, signed QR
  ticket tokens, webhook idempotency ledger, refund initiation UI.
- **Mobile attendee app (Phase 4):** Expo + expo-router, register / ticket
  / event home flows, EAS build profiles, smoke tests.
- **Check-in (Phase 5):** scanner page in the dashboard, signed-token
  verification, per-event stats.
- **Engagement (Phase 6):** chat, polls, message upvotes via the
  engagement gateway, public live page on the web.
- **Analytics & rollups (Phase 7):** org-wide dashboards (registrations,
  attendees, analytics, settings), 12-month trend, conversion funnel,
  per-event breakdown, audit log.
- **Streaming start (Phase 8):** session.streamUrl surfaces a "Join live"
  CTA on the public event page when the session is in window.
- **Hardening (Phase 9):** Sentry on the API with release tagging, CSP
  with `report-uri`, helmet, audit log for sensitive actions, API keys +
  scoped read endpoint via `JwtOrApiKeyGuard`.

Remaining roadmap is tracked in `OUTSTANDING.md`. Top of the queue:
discount codes, group ticket UI, Apple / Google Wallet passes, recording
library, mobile chat / poll parity.

## License

Proprietary. Internal use only until further notice.
