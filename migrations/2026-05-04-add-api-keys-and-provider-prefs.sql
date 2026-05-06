-- Org-level API keys + per-currency payment provider preferences.
-- Run once on the existing database:
--   docker exec -i orkora-postgres psql -U orkora -d orkora < migrations/2026-05-04-add-api-keys-and-provider-prefs.sql
--
-- API keys: scoped to an organization, used by integrators to call the public
-- API on behalf of the org. Plaintext is shown to the user only once at create
-- time; we store a sha256(token + pepper) hash and the last 4 characters for
-- display. last_used_at is best effort, updated lazily on auth.
--
-- Payment provider preferences: per-(org, currency) override of the default
-- registry pickForCurrency() ordering. Lets an org force their preferred PSP
-- for a given currency without a server restart.

create table if not exists api_keys (
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

create index if not exists api_keys_org_idx on api_keys (organization_id, created_at desc);
create index if not exists api_keys_active_idx on api_keys (token_hash) where revoked_at is null;

create table if not exists payment_provider_preferences (
  id              uuid primary key default uuidv7(),
  organization_id uuid not null references organizations(id) on delete cascade,
  currency        char(3) not null,
  provider        text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, currency)
);

create index if not exists payment_provider_preferences_org_idx
  on payment_provider_preferences (organization_id);
