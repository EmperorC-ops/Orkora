-- 0022_payment_connected_accounts.sql
-- Platform fee, slice 2: connected accounts.
--
-- Records the payout account an organization has connected with a provider, so
-- a future paid checkout can settle to the organizer directly and take the
-- platform fee as a split. One row per (organization, provider).
--
--   account_ref: the provider's account identifier (Stripe connected account
--     id acct_..., Paystack subaccount code, or Flutterwave subaccount id).
--   status: 'pending' (created, onboarding incomplete), 'active' (ready to be
--     charged with a split), or 'disabled'.
--   charges_enabled / payouts_enabled: mirror the provider's own readiness
--     flags so the gate can require a genuinely ready account.
--
-- This table only stores connections. Nothing here charges a fee or changes
-- checkout; the gate that uses it is off by default (see connected-accounts
-- config) until the platform fee is scheduled.

create table if not exists payment_connected_accounts (
  id               uuid primary key default uuidv7(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  provider         text not null,
  account_ref      text not null,
  status           text not null default 'pending',
  charges_enabled  boolean not null default false,
  payouts_enabled  boolean not null default false,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, provider)
);

create index if not exists payment_connected_accounts_org_idx
  on payment_connected_accounts (organization_id);
