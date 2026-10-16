-- 0026_campaign_flyer.sql
--
-- Optional flyer image on a campaign. The image is uploaded once to the public
-- media bucket and shown inline at the top of every recipient's email, with a
-- "Download flyer" button linking to the same full-resolution image. It is
-- deliberately NOT sent as an attachment: attachments multiply the payload per
-- recipient, break batch sending, and hurt deliverability.
--
-- The API only accepts a URL on our own media host under campaign_flyers/.
-- Nullable, no default: every existing campaign is unchanged.
--
-- Forward-only, additive, idempotent. Campaign tables live only in migrations
-- (from 0005), so this is not folded into schema.sql.

BEGIN;

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS flyer_url text;

COMMIT;
