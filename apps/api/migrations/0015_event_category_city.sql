-- 0015_event_category_city.sql
--
-- Discovery groundwork (not the marketplace itself): a topic category and a
-- city on each event. This is the substrate that makes future browse/SEO pages
-- possible and lets them fill in automatically as events accrue. Both nullable
-- so existing events are untouched.
--
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

ALTER TABLE events ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS city     text;

-- Partial indexes: browse/facet queries only ever look at rows that have a
-- value, and only public statuses, so keep the indexes small.
CREATE INDEX IF NOT EXISTS events_category_idx ON events (category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_city_idx     ON events (city)     WHERE city IS NOT NULL;

COMMIT;
