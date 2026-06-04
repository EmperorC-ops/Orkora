-- Orkora staging seed.
--
-- Applied manually after the staging database is empty and migrations have
-- run. Idempotent: safe to re-run because every insert is guarded by a stable
-- UUID and ON CONFLICT DO NOTHING. The fixed UUIDs let the smoke test
-- script (apps/api/scripts/staging_smoke.mjs) reference these records by id
-- without parsing API responses for primary keys.
--
-- Column shape verified against apps/api/prisma/schema.prisma on 3 June 2026.
-- If the schema changes upstream, this file must change with it.
--
-- Usage from your laptop:
--
--   psql "<staging DATABASE_URL>" -f infra/staging/seed.sql
--
-- Or from Render, set SEED_ON_BOOT=true once and let docker-entrypoint.sh
-- pick it up on the next deploy, then flip it back to 'false' immediately so
-- subsequent boots do not re-seed.
--
-- What this seed creates:
--   * One organization: "Orkora Staging Co"
--   * One owner user: staging-owner@orkora.events (no password; OTP only)
--   * One membership tying the user to the org as owner
--   * One published event: "Staging Smoke Event 2026"
--   * One free NGN tier and one paid USD tier (Stripe TEST mode)
--
-- What this seed deliberately does NOT create:
--   * Real PII, real names, real phone numbers
--   * Any payment provider configuration (those live in env vars)
--   * Any registration or order (those are created by the smoke-test script
--     on every run, so the absence on first boot is intentional)

begin;

-- 1. Organization
insert into organizations (
  id, slug, name, brand_color, plan, status, country_code, created_at, updated_at
)
values (
  '019e0000-0000-7000-8000-000000000001'::uuid,
  'orkora-staging',
  'Orkora Staging Co',
  '#6D28D9',
  'starter',
  'active',
  'NG',
  now(),
  now()
)
on conflict (id) do nothing;

-- 2. Owner user.
-- password_hash is null because staging uses email-OTP sign-in like prod.
-- To log in: trigger an OTP for staging-owner@orkora.events, read the code
-- from the staging-api logs (set LOG_OTP_TO_CONSOLE=true on staging if you
-- have not already), then complete the OTP step in the UI.
insert into users (
  id, email, full_name, locale, email_verified, platform_role, created_at
)
values (
  '019e0000-0000-7000-8000-000000000002'::uuid,
  'staging-owner@orkora.events',
  'Staging Owner',
  'en-NG',
  true,
  'none',
  now()
)
on conflict (id) do nothing;

-- 3. Membership: the user is an owner of the org.
insert into memberships (
  id, user_id, organization_id, role, created_at
)
values (
  '019e0000-0000-7000-8000-000000000003'::uuid,
  '019e0000-0000-7000-8000-000000000002'::uuid,
  '019e0000-0000-7000-8000-000000000001'::uuid,
  'owner',
  now()
)
on conflict (id) do nothing;

-- 4. Event - "Staging Smoke Event 2026", published, future-dated.
insert into events (
  id, organization_id, code, slug, title, description, kind,
  start_at, end_at, timezone, capacity, status, theme, created_at, updated_at
)
values (
  '019e0000-0000-7000-8000-000000000004'::uuid,
  '019e0000-0000-7000-8000-000000000001'::uuid,
  'STG2026',
  'staging-smoke-event-2026',
  'Staging Smoke Event 2026',
  'Synthetic event used by the staging smoke-test script. Created by infra/staging/seed.sql. Safe to delete and re-seed at any time.',
  'in_person',
  '2026-09-01 10:00:00+00',
  '2026-09-01 18:00:00+00',
  'Africa/Lagos',
  500,
  'published',
  '{}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

-- 5. Free tier (NGN, price_minor = 0 means free).
insert into ticket_tiers (
  id, event_id, name, description, price_minor, currency,
  quantity_total, quantity_sold, min_per_order, max_per_order, position
)
values (
  '019e0000-0000-7000-8000-000000000005'::uuid,
  '019e0000-0000-7000-8000-000000000004'::uuid,
  'Free Pass',
  'Walk-in admission. Used by the staging smoke test (apps/api/scripts/staging_smoke.mjs).',
  0,
  'NGN',
  100,
  0,
  1,
  4,
  1
)
on conflict (id) do nothing;

-- 6. Paid tier (USD, $20.00 = 2000 minor units; Stripe TEST mode).
insert into ticket_tiers (
  id, event_id, name, description, price_minor, currency,
  quantity_total, quantity_sold, min_per_order, max_per_order, position
)
values (
  '019e0000-0000-7000-8000-000000000006'::uuid,
  '019e0000-0000-7000-8000-000000000004'::uuid,
  'Premium Pass',
  'Paid tier for exercising the Stripe TEST checkout in staging. Charges $20 in TEST mode; do not enter real cards.',
  2000,
  'USD',
  50,
  0,
  1,
  4,
  2
)
on conflict (id) do nothing;

commit;

-- Reference IDs for smoke tests and ad-hoc verification:
--   org:           019e0000-0000-7000-8000-000000000001
--   owner user:    019e0000-0000-7000-8000-000000000002  (staging-owner@orkora.events)
--   membership:    019e0000-0000-7000-8000-000000000003
--   event:         019e0000-0000-7000-8000-000000000004  (slug: staging-smoke-event-2026, code: STG2026)
--   free tier:     019e0000-0000-7000-8000-000000000005
--   paid tier:     019e0000-0000-7000-8000-000000000006
