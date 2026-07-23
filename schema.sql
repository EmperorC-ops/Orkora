-- Orkora Production Schema
-- PostgreSQL 15+
-- Requires: citext, pgcrypto

create extension if not exists citext;
create extension if not exists pgcrypto;

-- uuidv7() polyfill. We keep the function name so every `default uuidv7()` in the
-- schema below stays valid. This lets us run on plain postgres:15 without needing
-- a custom image that bundles the pg_uuidv7 extension.
-- Layout: 48-bit Unix-ms timestamp || 4-bit version (0111) || 12 random bits ||
-- 2-bit variant (10) || 62 random bits.
create or replace function uuidv7() returns uuid as $$
declare
  unix_ts_ms bigint;
  uuid_bytes bytea;
begin
  unix_ts_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  uuid_bytes := substring(int8send(unix_ts_ms) from 3 for 6) || gen_random_bytes(10);
  uuid_bytes := set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);
  uuid_bytes := set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);
  return encode(uuid_bytes, 'hex')::uuid;
end;
$$ language plpgsql volatile;

-- ============================================================
-- IDENTITY + TENANCY
-- ============================================================

create table organizations (
  id               uuid primary key default uuidv7(),
  slug             text unique not null,
  name             text not null,
  logo_url         text,
  brand_color      text default '#6D28D9',
  plan             text not null default 'starter',
  status           text not null default 'active',
  country_code     char(2) not null default 'NG',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table users (
  id               uuid primary key default uuidv7(),
  email            citext unique not null,
  phone            text,
  password_hash    text,
  full_name        text not null,
  avatar_url       text,
  email_verified   boolean not null default false,
  phone_verified   boolean not null default false,
  locale           text not null default 'en-NG',
  platform_role    text not null default 'none',
  created_at       timestamptz not null default now(),
  last_login_at    timestamptz
);

create table memberships (
  id               uuid primary key default uuidv7(),
  user_id          uuid not null references users(id) on delete cascade,
  organization_id  uuid not null references organizations(id) on delete cascade,
  role             text not null,
  created_at       timestamptz not null default now(),
  unique (user_id, organization_id)
);

create table refresh_tokens (
  id               uuid primary key default uuidv7(),
  user_id          uuid not null references users(id) on delete cascade,
  token_hash       text not null,
  device_fingerprint text,
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now()
);

-- Per-account exponential-backoff tracking for password login. One row per
-- email (lower-cased). Cleared on first successful login. The per-IP throttler
-- handles single-attacker brute force; this protects a single account against
-- a slow, distributed brute-force across many IPs.
create table login_failures (
  email_lower    text primary key,
  failed_count   int not null default 0,
  last_failed_at timestamptz not null default now(),
  locked_until   timestamptz
);

-- Per-(order, notification kind) idempotency log. Inserted in the same
-- transaction that ships an order-side email (paid receipt, ticket
-- confirmation, refund confirmation). A second settlement path that tries to
-- send the same kind hits the unique constraint and skips the send, so the
-- verify-on-action + webhook + reconcile race produces exactly one email.
create table notification_log (
  id        uuid primary key default uuidv7(),
  order_id  uuid not null references orders(id) on delete cascade,
  kind      text not null,
  sent_at   timestamptz not null default now(),
  unique (order_id, kind)
);

create index notification_log_order_id_idx on notification_log (order_id);

create table otp_codes (
  id               uuid primary key default uuidv7(),
  destination      text not null,
  channel          text not null,
  code_hash        text not null,
  purpose          text not null,
  attempts         int not null default 0,
  expires_at       timestamptz not null,
  consumed_at      timestamptz,
  created_at       timestamptz not null default now()
);

create table invitations (
  id               uuid primary key default uuidv7(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  email            citext not null,
  role             text not null,
  invited_by_id    uuid not null references users(id),
  token_hash       text unique not null,
  expires_at       timestamptz not null,
  accepted_at      timestamptz,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now(),
  unique (organization_id, email)
);
create index idx_invitations_org on invitations(organization_id);

-- ============================================================
-- EVENTS
-- ============================================================

create table events (
  id               uuid primary key default uuidv7(),
  organization_id  uuid not null references organizations(id),
  code             text unique not null,
  slug             text not null,
  title            text not null,
  description      text,
  kind             text not null,
  start_at         timestamptz not null,
  end_at           timestamptz not null,
  timezone         text not null default 'Africa/Lagos',
  capacity         int,
  waitlist_enabled boolean not null default false,
  banner_url       text,
  theme            jsonb not null default '{}'::jsonb,
  status           text not null default 'draft',
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
  user_id          uuid references users(id),
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

-- ============================================================
-- REGISTRATION + TICKETING
-- ============================================================

create table ticket_tiers (
  id               uuid primary key default uuidv7(),
  event_id         uuid not null references events(id) on delete cascade,
  name             text not null,
  description      text,
  price_minor      bigint not null default 0,
  currency         char(3) not null default 'NGN',
  quantity_total   int,
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
  schema           jsonb not null
);

create table registrations (
  id               uuid primary key default uuidv7(),
  event_id         uuid not null references events(id),
  user_id          uuid not null references users(id),
  status           text not null default 'pending',
  form_responses   jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  unique (event_id, user_id)
);

create table tickets (
  id               uuid primary key default uuidv7(),
  registration_id  uuid not null references registrations(id) on delete cascade,
  tier_id          uuid not null references ticket_tiers(id),
  -- The order that issued this ticket. Set whenever a paid registration
  -- creates tickets (registrations.service.register). NULL is tolerated for
  -- legacy rows; the payments service falls back to registration_id scoping
  -- when this is NULL. See migration 0004 and SECURITY_REVIEW addendum 13.
  order_id         uuid references orders(id) on delete set null,
  code             text unique not null,
  holder_name      text not null,
  holder_email     citext not null,
  -- Lifecycle: 'pending' (held for a paid order awaiting payment), 'issued'
  -- (valid for check-in), 'cancelled' (the order that issued it failed or
  -- expired before payment), 'void' (the order that issued it was refunded
  -- after payment, so the QR no longer admits the attendee).
  status           text not null default 'issued',
  issued_at        timestamptz not null default now(),
  checked_in_at    timestamptz
);

create index tickets_reg_idx on tickets (registration_id);
create index tickets_status_idx on tickets (status);
create index tickets_order_id_idx on tickets (order_id);

create table checkins (
  id               uuid primary key default uuidv7(),
  ticket_id        uuid not null references tickets(id),
  session_id       uuid references sessions(id),
  scanned_by       uuid references users(id),
  device_id        text,
  scanned_at       timestamptz not null default now(),
  offline_created_at timestamptz
);

create index checkins_ticket_idx on checkins (ticket_id);
create index checkins_session_idx on checkins (session_id);

-- ============================================================
-- PAYMENTS + WALLET
-- ============================================================

create table orders (
  id               uuid primary key default uuidv7(),
  event_id         uuid not null references events(id),
  user_id          uuid not null references users(id),
  registration_id  uuid references registrations(id),
  subtotal_minor   bigint not null,
  fees_minor       bigint not null default 0,
  total_minor      bigint not null,
  currency         char(3) not null,
  status           text not null default 'pending',
  provider         text,
  provider_ref     text,
  created_at       timestamptz not null default now(),
  paid_at          timestamptz,
  -- Set when a refund is requested upstream; the order stays 'paid' until the
  -- refund is confirmed (synchronously, by webhook, or by reconciliation), at
  -- which point status flips to 'refunded'. reconcileRefunds() scans this.
  refund_initiated_at timestamptz
);

-- Lets the refund reconciliation sweep cheaply find paid orders with a refund
-- still in flight (partial index: only rows that have a refund pending).
create index if not exists orders_refund_in_flight_idx
  on orders (refund_initiated_at)
  where status = 'paid' and refund_initiated_at is not null;

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

create table wallet_entries (
  id               uuid primary key default uuidv7(),
  user_id          uuid not null references users(id),
  organization_id  uuid references organizations(id),
  amount_minor     bigint not null,
  currency         char(3) not null,
  reason           text not null,
  reference_type   text,
  reference_id     uuid,
  created_at       timestamptz not null default now()
);

create index wallet_user_idx on wallet_entries (user_id, created_at);

-- ============================================================
-- ENGAGEMENT
-- ============================================================

create table channels (
  id               uuid primary key default uuidv7(),
  event_id         uuid not null references events(id) on delete cascade,
  session_id       uuid references sessions(id),
  kind             text not null,
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

create table message_upvotes (
  id               uuid primary key default uuidv7(),
  message_id       uuid not null references messages(id) on delete cascade,
  user_id          uuid not null references users(id),
  created_at       timestamptz not null default now(),
  unique (message_id, user_id)
);

create index message_upvotes_message_idx on message_upvotes (message_id);
create index message_upvotes_user_idx on message_upvotes (user_id);

-- Webhook event-id ledger: dedupes provider redeliveries.
create table webhook_events (
  id                uuid primary key default uuidv7(),
  provider          text not null,
  provider_event_id text not null,
  received_at       timestamptz not null default now(),
  outcome           text,
  unique (provider, provider_event_id)
);

create index webhook_events_provider_idx on webhook_events (provider, received_at desc);

-- Audit log: sensitive actions only (refunds, role changes, deletions).
create table audit_events (
  id              uuid primary key default uuidv7(),
  organization_id uuid references organizations(id) on delete set null,
  actor_user_id   uuid references users(id) on delete set null,
  action          text not null,
  resource_type   text not null,
  resource_id     uuid,
  metadata        jsonb not null default '{}'::jsonb,
  request_id      text,
  occurred_at     timestamptz not null default now()
);

create index audit_events_org_idx on audit_events (organization_id, occurred_at desc);
create index audit_events_actor_idx on audit_events (actor_user_id, occurred_at desc);
create index audit_events_resource_idx on audit_events (resource_type, resource_id);

-- Organization-scoped API keys. Plaintext shown to caller once at create time;
-- only the sha256(token + pepper) hash is persisted. last_four is for display.
create table api_keys (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  token_hash      text not null unique,
  last_four       text not null,
  scopes          text[] not null default '{}',
  created_by_id   uuid not null references users(id),
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz,
  revoked_at      timestamptz
);
create index api_keys_org_idx on api_keys (organization_id, created_at desc);
create index api_keys_active_idx on api_keys (token_hash) where revoked_at is null;

-- Per-(org, currency) override of the registry's default pickForCurrency()
-- ordering. Lets organizers force a preferred PSP for a given currency
-- without restarting the API.
create table payment_provider_preferences (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null references organizations(id) on delete cascade,
  currency        char(3) not null,
  provider        text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, currency)
);
create index payment_provider_preferences_org_idx
  on payment_provider_preferences (organization_id);

create table polls (
  id               uuid primary key default uuidv7(),
  session_id       uuid not null references sessions(id) on delete cascade,
  question         text not null,
  options          jsonb not null,
  status           text not null default 'draft',
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
  status           text not null default 'pending',
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

-- ============================================================
-- CONTENT + ANALYTICS
-- ============================================================

create table media_assets (
  id               uuid primary key default uuidv7(),
  organization_id  uuid not null references organizations(id),
  event_id         uuid references events(id),
  session_id       uuid references sessions(id),
  kind             text not null,
  s3_key           text not null,
  mime             text,
  size_bytes       bigint,
  created_at       timestamptz not null default now()
);

create table event_metrics (
  id               bigserial primary key,
  organization_id  uuid not null,
  event_id         uuid not null,
  kind             text not null,
  user_id          uuid,
  payload          jsonb,
  occurred_at      timestamptz not null default now()
);

create index event_metrics_event_occurred_idx
  on event_metrics (event_id, occurred_at desc);

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

-- ============================================================
-- HOT-PATH INDEXES
-- ============================================================
-- Covers the queries we run on every request or every cron tick. Migration
-- 0002 ships the same statements (idempotent IF NOT EXISTS) for existing
-- databases.

-- Refresh tokens: token_hash lookup on every API refresh; user_id scans on
-- logout / reuse detection.
create unique index if not exists refresh_tokens_token_hash_key
  on refresh_tokens (token_hash);
create index if not exists refresh_tokens_user_id_idx
  on refresh_tokens (user_id);

-- OTP: cooldown, hourly per-destination cap, and verify all read by
-- (destination, purpose) with a recency filter.
create index if not exists otp_codes_destination_purpose_created_at_idx
  on otp_codes (destination, purpose, created_at desc);

-- Event sub-resources: list/lookup by event_id. Sessions already had
-- (event_id, start_at).
create index if not exists tracks_event_id_idx on tracks (event_id);
create index if not exists speakers_event_id_idx on speakers (event_id);
create index if not exists ticket_tiers_event_id_position_idx
  on ticket_tiers (event_id, position);

-- Orders: TTL release + payment reconciliation filter by (status, created_at);
-- attendee / my-orders pages read by (user_id, created_at desc). The
-- orders_refund_in_flight partial index from migration 0001 covers the refund
-- reconciliation sweep separately.
create index if not exists orders_status_created_at_idx
  on orders (status, created_at);
create index if not exists orders_user_id_created_at_idx
  on orders (user_id, created_at desc);

-- Order items: cascade reads + tier joins are always by order_id.
create index if not exists order_items_order_id_idx
  on order_items (order_id);

-- Live engagement: getOrCreateEventChat / getOrCreateEventQa find by
-- (event_id, kind).
create index if not exists channels_event_id_kind_idx
  on channels (event_id, kind);

-- Polls: per-session lookups when shaping individual polls.
create index if not exists polls_session_id_idx on polls (session_id);

-- ============================================================
-- ROW LEVEL SECURITY (tenant isolation)
-- ============================================================

alter table events enable row level security;
alter table sessions enable row level security;
alter table tracks enable row level security;
alter table speakers enable row level security;
alter table ticket_tiers enable row level security;
alter table registrations enable row level security;
alter table tickets enable row level security;
alter table checkins enable row level security;
alter table orders enable row level security;
alter table channels enable row level security;
alter table media_assets enable row level security;

create policy org_isolation_events on events
  using (organization_id = current_setting('app.org_id', true)::uuid);

-- Apply similar policies to every tenant scoped table.
-- The NestJS TenancyInterceptor sets app.org_id on each request.

-- ============================================================
-- EVENT FEEDBACK (migration 0006, folded in for fresh installs)
-- ============================================================
-- Attendee feedback for an event (session_id NULL) or a single session.
-- Each row may carry a 1-5 rating, a 0-10 NPS score, and a comment. Collected
-- from the public event page; optional and possibly anonymous.

create table if not exists event_feedback (
  id              uuid        primary key default uuidv7(),
  organization_id uuid        not null references organizations(id) on delete cascade,
  event_id        uuid        not null references events(id) on delete cascade,
  session_id      uuid        references sessions(id) on delete cascade,
  user_id         uuid        references users(id) on delete set null,
  attendee_email  citext,
  rating          smallint    check (rating is null or rating between 1 and 5),
  nps_score       smallint    check (nps_score is null or nps_score between 0 and 10),
  comment         text,
  created_at      timestamptz not null default now(),
  constraint event_feedback_has_content check (
    rating is not null
    or nps_score is not null
    or (comment is not null and length(btrim(comment)) > 0)
  )
);

create index if not exists event_feedback_event_created_idx
  on event_feedback (event_id, created_at desc);
create index if not exists event_feedback_session_idx
  on event_feedback (session_id) where session_id is not null;
create index if not exists event_feedback_org_idx
  on event_feedback (organization_id);

alter table event_feedback enable row level security;

drop policy if exists org_isolation_event_feedback on event_feedback;
create policy org_isolation_event_feedback on event_feedback
  using (organization_id = current_setting('app.org_id', true)::uuid);

-- ============================================================
-- DISCOUNT CODES (migration 0007, folded in for fresh installs)
-- ============================================================
create table if not exists discount_codes (
  id              uuid        primary key default uuidv7(),
  event_id        uuid        not null references events(id) on delete cascade,
  code            text        not null,
  kind            text        not null check (kind in ('percent','fixed')),
  value           integer     not null check (value > 0),
  currency        char(3),
  max_redemptions integer,
  times_redeemed  integer     not null default 0,
  starts_at       timestamptz,
  ends_at         timestamptz,
  active          boolean     not null default true,
  created_at      timestamptz not null default now(),
  constraint discount_codes_percent_range check (kind <> 'percent' or value between 1 and 100)
);
create unique index if not exists discount_codes_event_code_uniq on discount_codes (event_id, code);
create index if not exists discount_codes_event_idx on discount_codes (event_id);

create table if not exists discount_redemptions (
  id               uuid        primary key default uuidv7(),
  discount_code_id uuid        not null references discount_codes(id) on delete cascade,
  order_id         uuid        not null unique references orders(id) on delete cascade,
  user_id          uuid        references users(id),
  amount_minor     bigint      not null,
  created_at       timestamptz not null default now()
);
create index if not exists discount_redemptions_code_idx on discount_redemptions (discount_code_id);

alter table orders add column if not exists discount_minor   bigint not null default 0;
alter table orders add column if not exists discount_code_id uuid references discount_codes(id);

-- ============================================================
-- RECORDINGS (migration 0008, folded in for fresh installs)
-- ============================================================
create table if not exists recordings (
  id               uuid        primary key default uuidv7(),
  event_id         uuid        not null references events(id) on delete cascade,
  session_id       uuid        references sessions(id) on delete set null,
  title            text        not null,
  description      text,
  source           text        not null check (source in ('link','upload')),
  url              text,
  storage_key      text,
  duration_sec     integer,
  visibility       text        not null default 'ticket' check (visibility in ('public','ticket','tier')),
  required_tier_id uuid        references ticket_tiers(id) on delete set null,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  constraint recordings_source_shape check (
    (source = 'link'   and url is not null) or
    (source = 'upload' and storage_key is not null)
  )
);
create index if not exists recordings_event_idx   on recordings (event_id);
create index if not exists recordings_session_idx on recordings (session_id);

-- ============================================================
-- Q&A MODERATION (migration 0009, folded in for fresh installs)
-- ============================================================
alter table messages add column if not exists answered_at timestamptz;
