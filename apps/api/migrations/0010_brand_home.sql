-- 0010_brand_home.sql
--
-- Brand Home composer fields on organizations, plus an audience capture table
-- (community subscribe on the public /o/<slug> page).
--
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tagline         text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS hero_variant    text NOT NULL DEFAULT 'default';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS hero_media_url  text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS hero_media_type text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS hero_bio        text;

-- Constrain the hero variant. 'default' = the auto-composed gradient hero.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_hero_variant_check'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_hero_variant_check
      CHECK (hero_variant IN ('default','cinematic','editorial'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS brand_subscribers (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           citext      NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS brand_subscribers_org_created_idx
  ON brand_subscribers (organization_id, created_at DESC);

COMMIT;
