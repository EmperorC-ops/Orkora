# The Orkora Platform

**A Production Grade Event Management Ecosystem**
*Mobile + Web, Multi Tenant, Built for Africa and the Global Market*

Version: 1.0
Target scale: 100,000+ users in year one
Prepared: April 2026

---

## Table of Contents

1. Product Architecture Overview
2. Database Schema
3. API Design
4. Folder Structure (Frontend + Backend)
5. Sample UI Screens
6. Step by Step Build Plan
7. Deployment Guide
8. Future Scaling Recommendations
9. Extra Intelligence (African Market, Monetization)

---

## 1. Product Architecture Overview

### 1.1 Architectural Philosophy

Orkora is designed as a **modular monolith with service extraction pathways**. A full microservices topology on day one is premature for a seed or Series A stage startup, but the code is partitioned into clean bounded contexts so that each module can be peeled into its own service when traffic justifies it. This avoids the most common failure mode in African and emerging market SaaS builds: burning eighteen months building Kubernetes plumbing for an app that has not yet reached product market fit.

### 1.2 High Level Topology

```
                        ┌──────────────────────────┐
                        │     CloudFront / CDN      │
                        │   (static assets, media)  │
                        └──────────────┬───────────┘
                                       │
             ┌─────────────────────────┼─────────────────────────┐
             │                         │                         │
     ┌───────▼────────┐       ┌────────▼────────┐       ┌────────▼────────┐
     │  Next.js Web   │       │  React Native   │       │  Organizer App  │
     │  (Admin + SSR) │       │  Attendee App   │       │  (RN, check in) │
     └───────┬────────┘       └────────┬────────┘       └────────┬────────┘
             │                         │                         │
             └─────────────────────────┼─────────────────────────┘
                                       │
                            ┌──────────▼──────────┐
                            │   API Gateway (ALB) │
                            │   WAF + Rate Limit  │
                            └──────────┬──────────┘
                                       │
       ┌───────────────────────────────┼───────────────────────────────┐
       │                               │                               │
 ┌─────▼─────┐   ┌──────▼──────┐   ┌──▼───────┐   ┌──────▼──────┐   ┌──▼──────┐
 │ Auth Svc  │   │ Event Svc   │   │ Payment  │   │ Notif Svc   │   │Analytics│
 │ (NestJS)  │   │ (NestJS)    │   │ Svc      │   │ (NestJS +   │   │Svc      │
 │           │   │             │   │ (NestJS) │   │  BullMQ)    │   │         │
 └─────┬─────┘   └──────┬──────┘   └────┬─────┘   └──────┬──────┘   └────┬────┘
       │                │                │                │               │
       └────────────────┴────────────────┼────────────────┴───────────────┘
                                         │
                 ┌───────────────────────┼───────────────────────┐
                 │                       │                       │
          ┌──────▼──────┐         ┌──────▼──────┐         ┌──────▼──────┐
          │ PostgreSQL  │         │    Redis    │         │     S3      │
          │ (RDS, multi │         │ (Elasticache│         │  (media,    │
          │  AZ)        │         │  cluster)   │         │   exports)  │
          └─────────────┘         └─────────────┘         └─────────────┘

                         ┌───────────────────────┐
                         │  Socket.IO Gateway    │
                         │  (stateful, sticky LB)│
                         └───────────────────────┘
```

### 1.3 Bounded Contexts

| Context | Responsibility | Data Ownership |
|---|---|---|
| Identity | Auth, sessions, roles, OTP | users, sessions, refresh_tokens |
| Tenancy | Organizations, membership, subscription plans | organizations, memberships |
| Event | Events, sessions, speakers, tracks, agendas | events, sessions, speakers |
| Registration | Registration forms, responses, tickets, check-in | registrations, tickets, checkins |
| Payment | Orders, invoices, refunds, wallet ledger | orders, payments, wallet_entries |
| Engagement | Chats, polls, Q&A, notifications, networking | messages, polls, reactions |
| Analytics | Event metrics, exports, BI rollups | rollup tables, read-only replicas |
| Content | Uploads, streaming embeds, replays | media_assets |

Each context exposes its own module in the NestJS codebase (`/apps/api/src/modules/<context>`). Cross context calls go through a typed internal service layer, never direct Prisma access. This is the seam along which the monolith can be split later.

### 1.4 Multi Tenancy Model

We use **shared database with tenant_id discriminator**, not schema per tenant or database per tenant. Rationale:

- Schema per tenant explodes migration complexity beyond ~100 tenants.
- DB per tenant is only worth the cost for enterprise deals with data residency requirements. We add that later via a "dedicated tier" SKU.
- Every table except global lookups has `organization_id` on it. Row Level Security (RLS) in PostgreSQL enforces isolation at the database layer, not just the application layer. This is the single most important security control in a multi tenant SaaS.

### 1.5 Offline First Approach

For attendee and organizer mobile apps, this is non negotiable in African markets. Implementation:

- Local SQLite store via WatermelonDB or expo-sqlite with a sync queue.
- Check in actions queue locally, sync to server on reconnect with deterministic conflict resolution (last write wins by server_received_at, but check ins are append only so conflicts are rare).
- Event data (agenda, speakers, map, ticket QR) is hydrated to local cache on first load and served from cache on subsequent opens.
- Push notifications degrade gracefully to in app notification center when offline.

---

## 2. Database Schema

PostgreSQL 15, one schema `public`, UUID v7 primary keys (time sortable, index friendly). Every tenant scoped table carries `organization_id uuid not null`. Timestamps use `timestamptz` and default `now()`.

### 2.1 Core Tables

```sql
-- Organizations (tenants)
create table organizations (
  id               uuid primary key default uuidv7(),
  slug             text unique not null,
  name             text not null,
  logo_url         text,
  brand_color      text default '#6D28D9',
  plan             text not null default 'starter',  -- starter | growth | scale | enterprise
  country_code     char(2) not null default 'NG',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Users (global identity)
create table users (
  id               uuid primary key default uuidv7(),
  email            citext unique not null,
  phone            text,
  password_hash    text,                             -- nullable for social logins
  full_name        text not null,
  avatar_url       text,
  email_verified   boolean not null default false,
  phone_verified   boolean not null default false,
  locale           text not null default 'en-NG',
  created_at       timestamptz not null default now(),
  last_login_at    timestamptz
);

-- Many to many: user belongs to org with a role
create table memberships (
  id               uuid primary key default uuidv7(),
  user_id          uuid not null references users(id) on delete cascade,
  organization_id  uuid not null references organizations(id) on delete cascade,
  role             text not null,                    -- owner | admin | organizer | staff | vendor
  created_at       timestamptz not null default now(),
  unique (user_id, organization_id)
);

-- Refresh tokens for JWT rotation
create table refresh_tokens (
  id               uuid primary key default uuidv7(),
  user_id          uuid not null references users(id) on delete cascade,
  token_hash       text not null,
  device_fingerprint text,
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now()
);

-- OTP codes (SMS + email verification)
create table otp_codes (
  id               uuid primary key default uuidv7(),
  destination      text not null,                    -- email or E.164 phone
  channel          text not null,                    -- email | sms
  code_hash        text not null,
  purpose          text not null,                    -- signup | login | payment_confirm
  attempts         int not null default 0,
  expires_at       timestamptz not null,
  consumed_at      timestamptz,
  created_at       timestamptz not null default now()
);
```

### 2.2 Event Domain

```sql
create table events (
  id               uuid primary key default uuidv7(),
  organization_id  uuid not null references organizations(id),
  code             text unique not null,             -- short code entered in the mobile app
  slug             text not null,
  title            text not null,
  description      text,
  kind             text not null,                    -- physical | virtual | hybrid
  start_at         timestamptz not null,
  end_at           timestamptz not null,
  timezone         text not null default 'Africa/Lagos',
  capacity         int,
  waitlist_enabled boolean not null default false,
  banner_url       text,
  theme            jsonb not null default '{}'::jsonb,
  status           text not null default 'draft',    -- draft | published | live | ended | archived
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, slug)
);

create index events_org_status_idx on events (organization_id, status);
create index events_code_idx on events (code);

create table venues (
  id               uuid primary key default uuidv7(),
  event_id         uuid not null references events(id) on delete cascade,
  name             text not null,
  address          text,
  lat              numeric(9,6),
  lng              numeric(9,6),
  map_asset_url    text
);

create table tracks (
  id               uuid primary key default uuidv7(),
  event_id         uuid not null references events(id) on delete cascade,
  name             text not null,
  color            text
);

create table sessions (
  id               uuid primary key default uuidv7(),
  event_id         uuid not null references events(id) on delete cascade,
  track_id         uuid references tracks(id),
  venue_id         uuid references venues(id),
  title            text not null,
  description      text,
  start_at         timestamptz not null,
  end_at           timestamptz not null,
  stream_url       text,
  capacity         int,
  requires_rsvp    boolean not null default false
);

create index sessions_event_start_idx on sessions (event_id, start_at);

create table speakers (
  id               uuid primary key default uuidv7(),
  event_id         uuid not null references events(id) on delete cascade,
  user_id          uuid references users(id),        -- optional link to user account
  full_name        text not null,
  title            text,
  bio              text,
  avatar_url       text,
  social_links     jsonb not null default '{}'::jsonb
);

create table session_speakers (
  session_id       uuid not null references sessions(id) on delete cascade,
  speaker_id       uuid not null references speakers(id) on delete cascade,
  primary key (session_id, speaker_id)
);
```

### 2.3 Registration and Ticketing

```sql
create table ticket_tiers (
  id               uuid primary key default uuidv7(),
  event_id         uuid not null references events(id) on delete cascade,
  name             text not null,                    -- Free | Standard | VIP | Group
  description      text,
  price_minor      bigint not null default 0,        -- store in kobo / cents
  currency         char(3) not null default 'NGN',
  quantity_total   int,                              -- null = unlimited
  quantity_sold    int not null default 0,
  min_per_order    int not null default 1,
  max_per_order    int not null default 10,
  sale_starts_at   timestamptz,
  sale_ends_at     timestamptz,
  is_group         boolean not null default false,
  group_size       int,
  position         int not null default 0
);

create table registration_forms (
  id               uuid primary key default uuidv7(),
  event_id         uuid not null references events(id) on delete cascade,
  schema           jsonb not null                    -- array of {key, label, type, required, options}
);

create table registrations (
  id               uuid primary key default uuidv7(),
  event_id         uuid not null references events(id),
  user_id          uuid not null references users(id),
  status           text not null default 'pending',  -- pending | confirmed | waitlisted | cancelled
  form_responses   jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  unique (event_id, user_id)
);

create table tickets (
  id               uuid primary key default uuidv7(),
  registration_id  uuid not null references registrations(id) on delete cascade,
  tier_id          uuid not null references ticket_tiers(id),
  code             text unique not null,             -- QR payload
  holder_name      text not null,
  holder_email     citext not null,
  status           text not null default 'issued',   -- issued | checked_in | refunded | voided
  issued_at        timestamptz not null default now(),
  checked_in_at    timestamptz
);

create index tickets_reg_idx on tickets (registration_id);
create index tickets_status_idx on tickets (status);

create table checkins (
  id               uuid primary key default uuidv7(),
  ticket_id        uuid not null references tickets(id),
  session_id       uuid references sessions(id),     -- null = main event entry
  scanned_by       uuid references users(id),
  device_id        text,
  scanned_at       timestamptz not null default now(),
  offline_created_at timestamptz                     -- when the scan happened on device, if deferred
);

create index checkins_ticket_idx on checkins (ticket_id);
create index checkins_session_idx on checkins (session_id);
```

### 2.4 Payments and Wallet

```sql
create table orders (
  id               uuid primary key default uuidv7(),
  event_id         uuid not null references events(id),
  user_id          uuid not null references users(id),
  registration_id  uuid references registrations(id),
  subtotal_minor   bigint not null,
  fees_minor       bigint not null default 0,
  total_minor      bigint not null,
  currency         char(3) not null,
  status           text not null default 'pending',  -- pending | paid | failed | refunded
  provider         text,                             -- stripe | paystack | flutterwave | wallet
  provider_ref     text,
  created_at       timestamptz not null default now(),
  paid_at          timestamptz
);

create table order_items (
  id               uuid primary key default uuidv7(),
  order_id         uuid not null references orders(id) on delete cascade,
  tier_id          uuid not null references ticket_tiers(id),
  quantity         int not null,
  unit_price_minor bigint not null
);

create table payments (
  id               uuid primary key default uuidv7(),
  order_id         uuid not null references orders(id),
  provider         text not null,
  provider_ref     text not null,
  amount_minor     bigint not null,
  currency         char(3) not null,
  status           text not null,
  raw_payload      jsonb,
  created_at       timestamptz not null default now()
);

create table invoices (
  id               uuid primary key default uuidv7(),
  order_id         uuid not null references orders(id),
  number           text unique not null,
  pdf_url          text,
  issued_at        timestamptz not null default now()
);

-- Wallet ledger. Append only. Balance is a sum.
create table wallet_entries (
  id               uuid primary key default uuidv7(),
  user_id          uuid not null references users(id),
  organization_id  uuid references organizations(id),
  amount_minor     bigint not null,                  -- positive credit, negative debit
  currency         char(3) not null,
  reason           text not null,                    -- refund | credit | purchase | adjustment
  reference_type   text,
  reference_id     uuid,
  created_at       timestamptz not null default now()
);

create index wallet_user_idx on wallet_entries (user_id, created_at);
```

### 2.5 Engagement

```sql
create table channels (
  id               uuid primary key default uuidv7(),
  event_id         uuid not null references events(id) on delete cascade,
  session_id       uuid references sessions(id),     -- null = event wide
  kind             text not null,                    -- announcement | chat | qna
  title            text
);

create table messages (
  id               uuid primary key default uuidv7(),
  channel_id       uuid not null references channels(id) on delete cascade,
  user_id          uuid not null references users(id),
  body             text not null,
  reply_to_id      uuid references messages(id),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index messages_channel_idx on messages (channel_id, created_at desc);

create table polls (
  id               uuid primary key default uuidv7(),
  session_id       uuid not null references sessions(id) on delete cascade,
  question         text not null,
  options          jsonb not null,                   -- [{id, text}]
  status           text not null default 'draft',    -- draft | active | closed
  multi_select     boolean not null default false,
  closed_at        timestamptz
);

create table poll_votes (
  id               uuid primary key default uuidv7(),
  poll_id          uuid not null references polls(id) on delete cascade,
  user_id          uuid not null references users(id),
  option_ids       text[] not null,
  created_at       timestamptz not null default now(),
  unique (poll_id, user_id)
);

create table connections (
  id               uuid primary key default uuidv7(),
  event_id         uuid not null references events(id),
  requester_id     uuid not null references users(id),
  recipient_id     uuid not null references users(id),
  status           text not null default 'pending',  -- pending | accepted | declined
  created_at       timestamptz not null default now(),
  unique (event_id, requester_id, recipient_id)
);

create table notifications (
  id               uuid primary key default uuidv7(),
  user_id          uuid not null references users(id),
  event_id         uuid references events(id),
  title            text not null,
  body             text,
  data             jsonb,
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);
```

### 2.6 Content and Analytics

```sql
create table media_assets (
  id               uuid primary key default uuidv7(),
  organization_id  uuid not null references organizations(id),
  event_id         uuid references events(id),
  session_id       uuid references sessions(id),
  kind             text not null,                    -- image | doc | slides | video | replay
  s3_key           text not null,
  mime             text,
  size_bytes       bigint,
  created_at       timestamptz not null default now()
);

-- Append only event stream for analytics
create table event_metrics (
  id               bigserial primary key,
  organization_id  uuid not null,
  event_id         uuid not null,
  kind             text not null,                    -- registration | check_in | poll_vote | chat_msg | stream_minute
  user_id          uuid,
  payload          jsonb,
  occurred_at      timestamptz not null default now()
);

create index event_metrics_event_occurred_idx
  on event_metrics (event_id, occurred_at desc);

-- Rollup table refreshed hourly
create materialized view event_daily_rollup as
select
  event_id,
  date_trunc('day', occurred_at) as day,
  count(*) filter (where kind = 'registration') as registrations,
  count(*) filter (where kind = 'check_in') as check_ins,
  count(*) filter (where kind = 'poll_vote') as poll_votes,
  count(*) filter (where kind = 'chat_msg') as chat_msgs
from event_metrics
group by event_id, date_trunc('day', occurred_at);
```

### 2.7 Row Level Security (mandatory)

```sql
alter table events enable row level security;
create policy org_isolation on events
  using (organization_id = current_setting('app.org_id')::uuid);

-- Repeat for every tenant scoped table.
-- The NestJS request interceptor sets app.org_id at the start of each request.
```

---

## 3. API Design

The API is a hybrid: REST for CRUD and webhooks, GraphQL for read heavy client surfaces (agenda, attendee directory, analytics), and WebSockets for real time channels. All three sit behind the same NestJS app and share the same auth and tenancy interceptors.

### 3.1 REST Endpoints (selected)

```
# Auth
POST   /v1/auth/signup                    { email, password, fullName, phone }
POST   /v1/auth/login                     { email, password }
POST   /v1/auth/social                    { provider, idToken }
POST   /v1/auth/otp/send                  { channel, destination, purpose }
POST   /v1/auth/otp/verify                { destination, code, purpose }
POST   /v1/auth/refresh                   { refreshToken }
POST   /v1/auth/logout

# Me
GET    /v1/me
PATCH  /v1/me
GET    /v1/me/events
GET    /v1/me/tickets
GET    /v1/me/wallet

# Organizations (organizer admin)
POST   /v1/organizations
GET    /v1/organizations/:id
PATCH  /v1/organizations/:id
POST   /v1/organizations/:id/members
PATCH  /v1/organizations/:id/members/:userId      { role }
DELETE /v1/organizations/:id/members/:userId

# Events
POST   /v1/events
GET    /v1/events                         ?status=&q=&cursor=
GET    /v1/events/:idOrCode
PATCH  /v1/events/:id
POST   /v1/events/:id/publish
POST   /v1/events/:id/duplicate
DELETE /v1/events/:id

# Attendee entry point (mobile app home screen)
GET    /v1/events/by-code/:code           -> minimal public payload for code screen

# Sessions and agenda
POST   /v1/events/:id/sessions
GET    /v1/events/:id/agenda              -> pre rendered agenda tree (cached)
POST   /v1/events/:id/tracks
POST   /v1/events/:id/speakers

# Tickets and registration
POST   /v1/events/:id/tiers
GET    /v1/events/:id/tiers
POST   /v1/events/:id/register            { tierSelections, formResponses }
POST   /v1/events/:id/checkin             { ticketCode, sessionId? }    (organizer only)

# Payments
POST   /v1/orders                         { eventId, items, currency }
POST   /v1/orders/:id/pay                 { provider, returnUrl }
POST   /v1/webhooks/stripe
POST   /v1/webhooks/paystack
POST   /v1/webhooks/flutterwave

# Engagement
POST   /v1/events/:id/polls
POST   /v1/polls/:id/vote                 { optionIds }
POST   /v1/channels/:id/messages          { body }     (also broadcast on WS)

# Analytics
GET    /v1/events/:id/analytics/overview
GET    /v1/events/:id/analytics/export    ?format=pdf|csv

# Media
POST   /v1/media/presign                  { mime, kind }  -> { uploadUrl, s3Key }
POST   /v1/media                          { s3Key, kind, ... }
```

### 3.2 GraphQL Surface (read side)

```graphql
type Query {
  event(code: String, id: ID): Event
  myAgenda(eventId: ID!): [Session!]!
  attendees(eventId: ID!, search: String, cursor: String): AttendeeConnection!
  analytics(eventId: ID!): AnalyticsSnapshot!
}

type Event {
  id: ID!
  code: String!
  title: String!
  startAt: DateTime!
  endAt: DateTime!
  kind: EventKind!
  theme: JSON
  tracks: [Track!]!
  sessions: [Session!]!
  speakers: [Speaker!]!
  tiers: [TicketTier!]!
}

type Session {
  id: ID!
  title: String!
  startAt: DateTime!
  endAt: DateTime!
  speakers: [Speaker!]!
  track: Track
  isBookmarked: Boolean!      # per requesting user
  polls: [Poll!]!
}
```

GraphQL is deliberately read only. All mutations go through REST so that webhooks, idempotency keys, and replayable payloads stay simple.

### 3.3 WebSocket Namespaces

```
/ws/event/:eventId           -> announcements, presence count
/ws/session/:sessionId       -> chat, polls, Q&A
/ws/checkin/:eventId         -> organizer scan stream (dashboard live tally)

Events:
  server -> client:   message.new | poll.open | poll.close | announcement | checkin.count
  client -> server:   message.send | poll.vote | typing
```

Socket.IO with Redis adapter for horizontal scaling. Sticky sessions on the ALB.

### 3.4 Auth and Tenancy Flow

1. Client calls `/v1/auth/login`. Server returns `accessToken` (15 min, JWT signed RS256) and `refreshToken` (30 day, rotating, stored hashed).
2. Access token payload: `{ sub: userId, email, memberships: [{ orgId, role }] }`. Memberships are snapshotted so the server only hits the DB on refresh.
3. On every request the `TenancyInterceptor` reads `X-Org-Id` (or infers from route), verifies the user has a membership with a sufficient role, then sets the PostgreSQL session variable `app.org_id` inside the per request transaction. RLS does the rest.
4. Refresh rotates: each refresh call issues a new refresh token and revokes the old one.

### 3.5 Rate Limiting and Idempotency

- Global: 300 req/min per IP, 600 req/min per authenticated user. Redis token bucket.
- Auth endpoints: 10 req/min per IP and per destination for OTP.
- All POST endpoints on payments and registration accept `Idempotency-Key` header and persist the response for 24 hours.

---

## 4. Folder Structure

### 4.1 Monorepo Layout

We use pnpm workspaces plus Turborepo. One repository, clear seams.

```
orkora/
├── apps/
│   ├── api/                      # NestJS backend (the modular monolith)
│   ├── web/                      # Next.js admin + public event pages
│   ├── mobile/                   # React Native (Expo) attendee app
│   └── scanner/                  # React Native (Expo) organizer / check in app
├── packages/
│   ├── ui/                       # shared design tokens + React components (web + mobile via Tamagui)
│   ├── sdk/                      # generated TS client for the REST + GraphQL API
│   ├── config/                   # eslint, tsconfig, prettier, tailwind presets
│   ├── contracts/                # zod schemas + OpenAPI + GraphQL SDL (source of truth)
│   └── analytics/                # shared event tracking helpers
├── infra/
│   ├── terraform/                # AWS infra as code
│   ├── docker/                   # Dockerfiles + compose for local dev
│   └── github-actions/           # reusable CI workflows
├── docs/
│   ├── architecture/
│   ├── runbooks/
│   └── onboarding.md
├── .github/workflows/
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### 4.2 Backend (apps/api)

```
apps/api/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/
│   │   ├── interceptors/         # tenancy, logging, timing, idempotency
│   │   ├── guards/               # auth, roles, feature flag
│   │   ├── filters/              # global exception filter -> RFC 7807 problem+json
│   │   ├── pipes/                # zod validation pipe
│   │   └── decorators/           # @CurrentUser, @OrgId, @Idempotent
│   ├── config/                   # env schema (zod), typed config service
│   ├── database/
│   │   ├── prisma/               # schema.prisma, migrations
│   │   └── rls.ts                # sets app.org_id on each tx
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── strategies/
│   │   │   └── dto/
│   │   ├── users/
│   │   ├── orgs/
│   │   ├── events/
│   │   ├── sessions/
│   │   ├── speakers/
│   │   ├── tickets/
│   │   ├── registrations/
│   │   ├── orders/
│   │   ├── payments/
│   │   │   ├── providers/
│   │   │   │   ├── stripe.provider.ts
│   │   │   │   ├── paystack.provider.ts
│   │   │   │   └── flutterwave.provider.ts
│   │   │   └── webhooks.controller.ts
│   │   ├── checkin/
│   │   ├── engagement/           # chat, polls, qna, networking
│   │   ├── notifications/        # push (FCM, APNs), email (Postmark), SMS (Termii, Twilio)
│   │   ├── media/
│   │   ├── analytics/
│   │   └── realtime/             # Socket.IO gateway, Redis adapter
│   ├── graphql/                  # resolvers that delegate into modules
│   └── jobs/                     # BullMQ workers (analytics rollup, email, PDF invoice)
├── test/
│   ├── e2e/
│   └── unit/
├── prisma/schema.prisma
├── Dockerfile
└── package.json
```

Key principles: controllers stay thin, business logic lives in services, Prisma is only touched inside repositories. The `realtime` module and the `jobs` module are the two that will be extracted first when we split the monolith.

### 4.3 Web Admin (apps/web)

```
apps/web/
├── app/                          # Next.js 14 App Router
│   ├── (marketing)/              # public landing, pricing
│   ├── (auth)/login/
│   ├── (auth)/signup/
│   ├── (public)/e/[code]/        # public event page (SSR, indexable)
│   ├── (organizer)/dashboard/
│   │   ├── page.tsx
│   │   ├── events/
│   │   │   ├── page.tsx          # list
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/
│   │   │       ├── overview/
│   │   │       ├── agenda/
│   │   │       ├── registrations/
│   │   │       ├── tickets/
│   │   │       ├── check-in/
│   │   │       ├── engagement/
│   │   │       ├── analytics/
│   │   │       └── settings/
│   │   └── team/
│   ├── api/                      # server actions and small BFF routes
│   └── layout.tsx
├── components/
│   ├── ui/                       # primitives (Button, Input, Dialog) from @orkora/ui
│   ├── charts/                   # recharts wrappers
│   ├── builders/                 # agenda builder, form builder, tier editor
│   └── marketing/
├── lib/
│   ├── api.ts                    # typed client wrapping @orkora/sdk
│   ├── auth.ts                   # session helpers
│   └── feature-flags.ts
├── styles/
│   └── globals.css               # Tailwind entry + design tokens
├── public/
├── next.config.mjs
└── tsconfig.json
```

### 4.4 Attendee Mobile (apps/mobile)

```
apps/mobile/
├── app/                          # expo-router
│   ├── (auth)/code.tsx           # event code entry screen (matches attached UI)
│   ├── (auth)/login.tsx
│   ├── (auth)/signup.tsx
│   ├── (auth)/otp.tsx
│   ├── (event)/home.tsx
│   ├── (event)/agenda.tsx
│   ├── (event)/session/[id].tsx
│   ├── (event)/speakers.tsx
│   ├── (event)/ticket.tsx
│   ├── (event)/map.tsx
│   ├── (event)/chat.tsx
│   ├── (event)/networking.tsx
│   └── (profile)/wallet.tsx
├── src/
│   ├── components/               # ThemedView, EventCard, QrBadge, Timeline
│   ├── features/                 # feature slices (agenda, chat, polls)
│   ├── db/                       # WatermelonDB schema + models
│   ├── sync/                     # offline queue, sync engine
│   ├── api/                      # @orkora/sdk client + react-query hooks
│   ├── realtime/                 # Socket.IO client wrapper
│   ├── notifications/            # expo-notifications
│   ├── theme/                    # tokens, gradients, typography
│   └── i18n/                     # en, fr, sw, ha, yo, ig
├── assets/
├── app.json
└── eas.json
```

### 4.5 Organizer Scanner (apps/scanner)

A stripped down RN app focused on check in. Separate binary because it ships to venue staff devices, often rented or shared. Smaller permissions footprint.

```
apps/scanner/
├── app/
│   ├── (auth)/pin.tsx            # fast PIN unlock after first login
│   ├── scan.tsx                  # camera + QR decode
│   ├── sessions/[id].tsx         # session scoped scanning
│   └── stats.tsx                 # live numbers, syncs from /ws/checkin
├── src/
│   ├── db/                       # local ticket cache, offline queue
│   ├── sync/
│   └── scanner/                  # camera, haptics, manual code entry
```

---

## 5. Sample UI Screens

### 5.1 Event Code Entry (attendee mobile, matches reference image)

**Purpose:** first screen when the app opens, before any auth. Scan or type an event code to jump into the right tenant context.

**Layout:**
- Full bleed purple gradient background (`#6D28D9` at top blending to `#4C1D95` at bottom), faint decorative "E" glyph watermark at ~8 percent opacity.
- Status bar in light mode text.
- Hero lockup centered at 22 percent from top: `The` in 22pt regular white, `EVENTAPP` in 44pt bold, with `APP` shown in 60 percent opacity white to create the two tone wordmark.
- Card component at 48 percent from top: 24dp rounded corners, white fill, subtle shadow. Inside the card:
  - Label: `Please enter your Event Code:` in 16pt medium.
  - Input row: lock icon on the left, placeholder `Event Code`, monospace font for the typed code, uppercase autocorrect off.
  - Primary button full width, purple fill matching the gradient top, label `Submit` in 16pt semibold white.
  - Secondary link below the card: `Scan QR instead` which launches the camera.
- Footer: `eventsair` wordmark replaced with our own lockup, centered, 4 percent from bottom.

**Behavior:**
- Submit hits `GET /v1/events/by-code/:code`. On 200 we prefetch the event bundle, stash it in the offline store, and push to the home route. On 404 we inline an error under the input.
- Long press on the logo reveals a staging environment picker for internal QA builds only.

### 5.2 Attendee Home (after code entry and login)

Hero card shows event banner, title, date chip, and a live status pill (`Live now`, `Starts in 2h`, `Ended`). Below, a horizontal scroller of action cards: `My Ticket`, `Agenda`, `Speakers`, `Map`, `Chat`, `Networking`. Below that, a `Happening now` section driven by the WebSocket presence feed, followed by `Up next` pulled from the agenda.

### 5.3 Ticket Screen

Single screen, card style. QR code renders from the cached ticket payload so it works offline. Below the QR: ticket holder name, tier name, order reference. `Add to wallet` button on iOS (PassKit) and Android (Google Wallet). A subtle last sync timestamp in the footer signals freshness.

### 5.4 Session Detail

Header image, title, speakers row with avatars, start end time, venue, track color chip. Tabs: `About`, `Q&A`, `Polls`, `Resources`. Floating bookmark button in the top right. If the session is live and virtual, a primary play button replaces the header image.

### 5.5 Admin Dashboard (web)

Left nav with event switcher at top. Main panel has a four card KPI row: Registrations, Revenue, Check ins, Engagement Index. Below, a two column grid: line chart of registrations over time, funnel chart for order conversion. A `Live` tab at the top of every event page shows a real time tally and a scrolling activity feed when the event is running, powered by the same Socket.IO stream.

### 5.6 Admin Event Builder

Three pane layout. Left: section list (Details, Branding, Agenda, Tickets, Registration Form, Communications, Publish). Center: the editor for the selected section. Right: a live preview iframe of the public event page that updates as you edit. Save is autosave with a visible last saved indicator.

---

## 6. Step by Step Build Plan

This is a 16 week plan to reach a revenue generating V1 with one paying design partner. It is aggressive but achievable with a team of five: one backend lead, one mobile lead, one web lead, one designer, one product / PM. Each phase ends with something testable by real users.

### Phase 0: Foundations (Week 1)

1. Create the monorepo, configure pnpm workspaces, Turborepo, shared eslint and tsconfig.
2. Bootstrap `apps/api` with NestJS, Prisma, Zod, Pino logger, OpenAPI generator.
3. Bootstrap `apps/web` with Next.js 14 App Router, Tailwind, shadcn primitives.
4. Bootstrap `apps/mobile` with Expo, expo-router, Tamagui, WatermelonDB.
5. Wire GitHub Actions: lint, typecheck, test, build matrix.
6. Provision staging AWS environment via Terraform (VPC, RDS, Elasticache, S3, ECR, ECS Fargate, ALB, Route53). Do not do this by hand.
7. Ship a "hello world" deploy end to end so the pipeline is real before feature work starts.

**Exit criteria:** a commit on main triggers a deploy to staging, an attendee app build appears in Expo Go, the admin web is reachable at staging.orkora.events.

### Phase 1: Identity and Tenancy (Week 2 to 3)

1. `auth` module: signup, login, social (Google, Apple), OTP via Termii (SMS) and Postmark (email), refresh rotation.
2. `orgs` module: create organization, invite members, role checks.
3. Middleware: tenancy interceptor sets RLS context.
4. Mobile and web login flows wired to the same backend.
5. Error tracking (Sentry), structured logging, request IDs.

**Exit criteria:** a new user can sign up on mobile, verify by SMS OTP, create an organization, invite a teammate, and see their session revoke when they log out.

### Phase 2: Event Creation and Public Page (Week 4 to 5)

1. `events`, `tracks`, `sessions`, `speakers` modules with full CRUD.
2. Admin UI: event list, event create wizard, agenda builder, speaker manager, branding editor.
3. Public SSR event page at `/e/[code]` with schema.org Event metadata for SEO.
4. Media upload via S3 presigned URLs.
5. Cache public event pages on CloudFront with SWR revalidation (5 minute TTL).

**Exit criteria:** an organizer creates an event end to end in under 10 minutes and the public page is shareable.

### Phase 3: Registration, Tickets, Payments (Week 6 to 8)

1. `tiers`, `registrations`, `orders`, `payments` modules.
2. Provider adapters for Stripe, Paystack, Flutterwave. Webhook handlers with signature verification and idempotent processing.
3. QR ticket generation (signed JWT payload, short, offline verifiable).
4. Invoice PDF generation via a BullMQ worker using `pdfkit` or Chromium headless.
5. Admin UI: tier editor, registration list with filters, refund flow.
6. Attendee UI: register flow, payment, ticket screen.

**Exit criteria:** a real NGN 5,000 ticket is purchased via Paystack on live production keys in a sandbox event, the attendee sees the QR ticket on their phone, the organizer sees the registration in the dashboard.

### Phase 4: Attendee Experience and Offline (Week 9 to 10)

1. Attendee home, agenda, session detail, speakers, map screens.
2. WatermelonDB sync engine: pull event bundle on first open, queue writes, reconcile on reconnect.
3. Push notifications via Expo Notifications (FCM / APNs).
4. Bookmarks and personal agenda.
5. Wallet screen (refund credits).

**Exit criteria:** an attendee can open the app with no connectivity, see the full agenda and their ticket QR, make changes offline, and have them sync when data returns.

### Phase 5: Check In and Organizer App (Week 11)

1. Dedicated `apps/scanner` app. Camera based QR scan, haptic feedback, manual code entry fallback.
2. Offline check in queue with conflict resolution.
3. Live check in tally dashboard on web admin via WebSockets.

**Exit criteria:** in a simulated event with 500 pre registered attendees, three scanners can run in parallel offline and reconcile correctly when reconnected.

### Phase 6: Real Time Engagement (Week 12 to 13)

1. `realtime` module with Socket.IO and Redis adapter.
2. Event wide announcements, session chat, Q&A, polls.
3. Moderation tools (soft delete messages, block users per event).
4. Networking: attendee directory with search and connection requests, in app DMs.

**Exit criteria:** a 500 person simulated session can sustain a live poll and chat stream without dropped messages.

### Phase 7: Analytics and Reporting (Week 14)

1. `analytics` module emits events to `event_metrics`.
2. Hourly rollup job refreshes `event_daily_rollup`.
3. Dashboard charts: registrations, revenue, check in rate, engagement.
4. Exports: CSV (streaming, no memory blow up), PDF recap report.

### Phase 8: Content and Streaming (Week 15)

1. Media library per event.
2. Embed YouTube and Vimeo, plus a WebRTC room option via Daily or 100ms for smaller virtual sessions.
3. Replay: after a live stream ends, store a link to the recording and make it available on the session detail screen.

### Phase 9: Hardening and Launch (Week 16)

1. Load test: k6 scenarios at 10x expected peak. Fix whatever breaks.
2. Security review: OWASP top 10 pass, penetration test on auth and payments.
3. WCAG AA audit on web admin and public pages.
4. App Store and Play Store submission. Allow two weeks buffer for review.
5. First design partner event runs in production.

### Parallel tracks (always on)

- Documentation in `docs/` updated per feature.
- Observability: CloudWatch metrics, Grafana dashboards, alerting via PagerDuty.
- Feature flags via LaunchDarkly or an internal OSS alternative.
- Backups: RDS automated snapshots daily, point in time recovery enabled, monthly restore drill.

---

## 7. Deployment Guide

### 7.1 Environment Variables

Create `.env` files per environment. The API enforces a Zod schema on boot and refuses to start if anything is missing.

```
# Core
NODE_ENV=production
APP_URL=https://app.orkora.events
API_URL=https://api.orkora.events
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:pass@rds-endpoint:5432/orkora?sslmode=require
REDIS_URL=rediss://elasticache-endpoint:6379

# Auth
JWT_PRIVATE_KEY=...                 # RS256 private key, loaded from SSM Parameter Store
JWT_PUBLIC_KEY=...
REFRESH_TOKEN_PEPPER=...

# Storage
AWS_REGION=eu-west-1
S3_BUCKET_MEDIA=orkora-prod-media
S3_BUCKET_EXPORTS=orkora-prod-exports

# Email + SMS
POSTMARK_TOKEN=...
TERMII_API_KEY=...                  # preferred for NG, GH, KE, ZA
TWILIO_SID=...                      # fallback for global
TWILIO_AUTH_TOKEN=...

# Payments
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
PAYSTACK_SECRET_KEY=...
PAYSTACK_WEBHOOK_SECRET=...
FLUTTERWAVE_SECRET_KEY=...
FLUTTERWAVE_WEBHOOK_SECRET=...

# Push
FCM_SERVER_KEY=...
APNS_KEY_ID=...
APNS_TEAM_ID=...
APNS_BUNDLE_ID=io.orkora.attendee

# Observability
SENTRY_DSN=...
OTEL_EXPORTER_OTLP_ENDPOINT=...
```

**Secrets never live in `.env` files in production.** They are stored in AWS SSM Parameter Store (SecureString) and injected into the ECS task definition at deploy time. The `.env` file is only for local development.

### 7.2 Database Migration

```bash
# Generate a migration after editing prisma/schema.prisma
pnpm --filter api exec prisma migrate dev --name add_wallet_entries

# In CI, on deploy:
pnpm --filter api exec prisma migrate deploy

# Seed lookup data (currencies, timezones, sample org for staging)
pnpm --filter api run seed
```

Migrations run as a one off ECS task before the new API tasks start serving traffic. Zero downtime is achieved by only shipping additive migrations in the same PR as code that uses them. Destructive migrations (drop column, rename) run in a two step release: add the new column and dual write, flip reads, then drop the old column in the next deploy.

### 7.3 Domain and SSL

1. Register domain (e.g. orkora.events) with a registrar that supports DNSSEC.
2. Create a Route 53 hosted zone.
3. Request ACM certificates in `us-east-1` (for CloudFront) and in the API region for the ALB. Use wildcard `*.orkora.events` plus apex.
4. Point A / AAAA alias records:
   - `app.orkora.events` and `orkora.events` to the CloudFront distribution fronting the Next.js app.
   - `api.orkora.events` to the API ALB.
   - `ws.orkora.events` to a second ALB tuned for long lived WebSocket connections.
5. Enable HSTS with a one year max age after SSL is verified in production.

### 7.4 Backend Deploy (ECS Fargate)

```yaml
# .github/workflows/deploy-api.yml (condensed)
on:
  push:
    branches: [main]
    paths: ['apps/api/**', 'packages/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123:role/github-oidc-deploy
          aws-region: eu-west-1
      - uses: aws-actions/amazon-ecr-login@v2
      - run: docker build -t $ECR_URL/api:${{ github.sha }} -f apps/api/Dockerfile .
      - run: docker push $ECR_URL/api:${{ github.sha }}
      - run: aws ecs run-task --task-definition orkora-migrations --launch-type FARGATE ...
      - run: aws ecs update-service --cluster orkora --service api \
              --force-new-deployment \
              --task-definition orkora-api:${{ github.sha }}
```

ECS service is set to minimum healthy 100 percent, maximum 200 percent for rolling deploys. Health checks hit `/health` which asserts DB and Redis connectivity.

### 7.5 Web Deploy

Next.js standalone output deployed to ECS Fargate behind CloudFront. Alternative: Vercel for the web app only. Keep it on AWS for now to keep a single billing surface and VPC for private API access.

### 7.6 Mobile Deploy

```bash
# iOS + Android production builds with EAS
eas build --profile production --platform all

# Submit to stores
eas submit --profile production --platform ios
eas submit --profile production --platform android

# Over the air JS updates for non native changes
eas update --branch production --message "fix agenda timezone bug"
```

App store assets (screenshots, descriptions, privacy declarations) live in `apps/mobile/store/`. iOS privacy manifest is mandatory since Apple's 2024 policy change.

### 7.7 Observability at Deploy

- Sentry release is created per deploy and sourcemaps uploaded.
- CloudWatch alarms: API p95 latency > 500ms for 5 minutes, 5xx rate > 1 percent, RDS CPU > 80 percent, Redis evictions > 0, ECS task unhealthy.
- A synthetic canary hits the critical path (event code lookup, register, pay sandbox) every 5 minutes.

---

## 8. Future Scaling Recommendations

### 8.1 When to scale, and what to scale first

The platform is built to absorb growth without rewrites. Do not scale preemptively. Each scaling lever below has a trigger, a cost, and a risk. Pull the lever only when the trigger fires.

| Trigger | Action | Cost | Risk if pulled early |
|---|---|---|---|
| Single RDS CPU sustained > 60 percent | Vertical scale RDS, then add read replicas | Low | Wasted spend |
| Same as above, plus read heavy analytics | Offload analytics to ClickHouse via Debezium CDC | Medium | Extra pipeline to maintain |
| Single region latency > 300ms for > 10 percent of users | Add a second region with active-passive replication | High | Operational complexity doubles |
| 1M MAU crossed | Extract `notifications` and `analytics` services | High | Team velocity drops for 2 quarters |
| Chat throughput > 10k msg/sec in a session | Move realtime to a dedicated fleet, add Redis Streams for fanout | Medium | Rare to actually need |

### 8.2 Data tier scaling path

1. **Read replicas** for analytics queries first. One replica is usually enough to 5x read capacity.
2. **Connection pooling** via PgBouncer in transaction mode. Prisma does not hold connections well under high concurrency.
3. **Partition `event_metrics` and `messages` by month** using PostgreSQL declarative partitioning. Drop old partitions instead of deleting rows.
4. **Move analytics to ClickHouse** once `event_metrics` crosses ~500M rows. Use Debezium to stream from Postgres.
5. **Shard by organization_id** only as the absolute last resort. Most SaaS never needs this. If you do, do it at the Postgres level using Citus, not in app code.

### 8.3 Real time scaling path

- Socket.IO with Redis adapter works cleanly up to ~50k concurrent connections per node. Scale horizontally with sticky sessions on the ALB.
- For very large virtual events (100k+ concurrent), switch the broadcast path to a fanout service like Ably or Pusher Channels for the announcement channel, while keeping our Socket.IO fleet for session chats. This is a surgical replacement, not a rewrite.

### 8.4 Edge and bandwidth

- Serve all static event assets from CloudFront. Use Lambda@Edge to inject tenant theming so the same cached HTML works for multiple orgs.
- For African markets specifically, add a CloudFront edge in Cape Town and Lagos (once available). Fall back to the nearest edge with HTTP/3 for faster handshakes on lossy mobile networks.
- Enable Brotli compression. Aggressively set `cache-control: immutable` on hashed assets.

### 8.5 Organizational scaling

- Once the team passes 15 engineers, split ownership along the bounded contexts in section 1.3. Each team owns its module, its on call, its dashboards, and its SLOs.
- Keep one shared platform team that owns the API gateway, auth, observability, and the CI pipeline. Do not let it balloon; three to five people is the right size for a company under 100 engineers.

### 8.6 Compliance milestones

- **Year 1:** GDPR basics (right to erasure, data export), Nigerian NDPR registration, PCI compliance via providers only, SOC 2 Type 1 readiness.
- **Year 2:** SOC 2 Type 2, ISO 27001, data residency options for enterprise contracts.
- **Year 3:** HIPAA ready tier if we target healthcare conferences, FedRAMP Moderate if we target US public sector.

---

## 9. Extra Intelligence

### 9.1 Designed for African Realities

Most event platforms from Silicon Valley assume 4G everywhere, credit cards, and dollar pricing. Those assumptions fail on the continent. The following choices are deliberate:

**Connectivity:**
- Offline first attendee app. The ticket QR renders from a locally cached signed payload; it does not need a round trip to display.
- Agenda and speakers are bundled and hydrated on first open, then diffed on subsequent opens using ETags.
- Media uses HLS with low bitrate rungs (240p, 360p) as defaults, not afterthoughts. The player picks the rung from measured bandwidth, not from device class.
- All API responses are Brotli compressed, and the mobile client uses HTTP/2 multiplexing.

**Payments:**
- Primary gateway is Paystack for NG, GH, ZA, KE. Flutterwave is the fallback. Stripe handles the rest of the world. The `payments` module has a provider registry so adding Ozow (SA) or M-Pesa Daraja (KE) later is a new file, not a refactor.
- Prices are stored in minor currency units (kobo, cents) to avoid floating point rounding.
- We settle to the organizer in their local currency to avoid FX drag. If the organizer chooses to accept USD, we show both prices at checkout.
- USSD fallback via a partner (e.g. Pay With Bank Transfer on Paystack) gets us to attendees without cards.

**Languages:**
- First pass: English, French, Swahili, Portuguese, Arabic.
- Second pass: Hausa, Yoruba, Igbo, Amharic, Zulu.
- Right to left layout is supported from day one (Arabic), not retrofitted.

**Devices:**
- Target Android 9 and above, iOS 14 and above. That covers ~90 percent of active smartphones in the key markets.
- Keep the app APK under 30 MB. Expo's asset split and Hermes engine help here.
- Support PWA fallback for attendees on feature phones or low storage devices; the public event page at `/e/[code]` is installable.

**Content moderation:**
- Local language moderation matters. Plug in a moderation service that supports African languages (Sift, Perspective API's limited coverage, or a simple Lingua + keyword list fallback).

### 9.2 Monetization

The platform targets three revenue streams from day one, with two more unlocked in years two and three.

**Stream 1: SaaS subscription (primary)**

| Tier | Price (monthly) | Target | Limits |
|---|---|---|---|
| Starter | Free | Community organizers, small meetups | 1 event / month, 100 attendees / event, Orkora branding on attendee app |
| Growth | USD 99 | Associations, training companies | 5 events, 1,000 attendees each, custom branding |
| Scale | USD 399 | Conference producers, agencies | Unlimited events, 10,000 attendees, white label mobile theming, priority support |
| Enterprise | Custom | Corporates, government, associations with 10k+ attendees | SSO, data residency, dedicated success manager |

Local currency pricing: offer NGN, ZAR, KES, GHS, EGP, MAD equivalents with FX locked quarterly, not daily. This reduces chargebacks and matches how buyers in these markets actually budget.

**Stream 2: Transaction fees**

- 2 percent platform fee on paid tickets, on top of processor fees.
- Organizers can absorb or pass through to attendees. Default is pass through, since that is the industry norm.
- Fee waived on Enterprise tier.

**Stream 3: Add on modules**

- Lead capture for vendors and exhibitors: USD 30 per scanner per event.
- Live captioning and translation: USD 2 per attendee per session.
- Dedicated streaming bandwidth beyond the 10 hour baseline: metered.
- Advanced analytics and BI exports: USD 49 per event.

**Stream 4 (year 2): Marketplace**

- Curated vendor directory (AV, catering, venues) with lead gen fees.
- Speaker bureau integration.

**Stream 5 (year 3): Financial services**

- Merchant cash advance against future ticket sales, underwritten by historical sell through data. This is the highest margin product a vertical SaaS can layer on, and Paystack / Flutterwave already have the rails.

### 9.3 Smart defaults and opinions we took

These are the non obvious design decisions worth calling out:

- **UUID v7 over v4.** Time sortable primary keys dramatically improve B-tree index locality, which matters at scale.
- **RLS over app level tenancy checks.** An app bug cannot leak another tenant's data if the database itself refuses to return it.
- **REST for writes, GraphQL for reads.** GraphQL mutations complicate idempotency, retries, and webhooks; we do not need that complexity.
- **Socket.IO over raw WebSockets.** Reconnection, rooms, and the Redis adapter are solved problems; do not reinvent them.
- **Two separate mobile apps (attendee and scanner), not one.** Smaller attack surface, clearer UX, different app store permissions, easier to hand a scanner to venue staff without exposing attendee data.
- **Modular monolith over microservices at launch.** Deploy one service, keep the blast radius small, extract modules when the pain is real.
- **Provider registry for payments.** Adding a new gateway should be a one file change, never a refactor.
- **Append only analytics, rollups for dashboards.** Your dashboards stay fast and you never lose the raw data.

### 9.4 What we intentionally did NOT build in V1

Discipline matters. These are tempting but postponed:

- Marketplace for event organizers to hire speakers.
- AI matchmaking for networking beyond simple tag overlap.
- Custom WebRTC rooms (use Daily or 100ms until volume justifies going native).
- Ad platform for sponsors.
- Marketing automation (use an integration with Mailchimp or Brevo instead).

Each of these is a product in itself. Ship the core, win your first 10 paying organizers, then revisit.

---

## Closing Note

This document is a blueprint, not a contract. The sharpest thing a startup can do with a plan this size is to treat every week as an opportunity to falsify an assumption. Ship the event code screen and the first paid ticket flow in six weeks, put it in front of one real organizer, and let their feedback rewrite the next 10 weeks. That is how this reaches 100,000 users, not by executing a 16 week Gantt chart flawlessly.




