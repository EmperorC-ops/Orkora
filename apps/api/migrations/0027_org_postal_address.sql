-- 0027_org_postal_address.sql
--
-- Optional mailing address per organization, printed in the footer of that
-- organization's campaign emails. Marketing email law (notably US CAN-SPAM)
-- expects the sender's physical postal address; the sender is the organization
-- whose event the email promotes, not the platform. When an organization has
-- not set one, the platform-wide CAMPAIGN_POSTAL_ADDRESS env value is used.
--
-- Nullable, no default: every existing organization is unchanged.
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS postal_address text;

COMMIT;
