-- 0014_brand_surface_socials.sql
--
-- Design-system completeness for the flagship surfaces (D0):
--   brand_accent  - secondary/hover colour. Falls back to a hue-shifted
--                   brand_color in the client if not set.
--   brand_surface - page background for Brand Home / Story Mode dark sections.
--   socials       - JSON map of the brand's channels (instagram, tiktok, x,
--                   whatsapp) for the Brand Home SocialsBar.
--
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_accent  text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_surface text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS socials       jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
