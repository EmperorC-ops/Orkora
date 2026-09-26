-- 0021_event_platform_fee_flat.sql
-- Platform fee, slice 1 (extension): the fixed per-ticket component.
--
-- The fee structure is 3% PLUS a flat 0.99 USD per paid ticket. Migration 0020
-- captured the percentage (platform_fee_bps). This adds the flat part, also
-- stamped per event at creation for grandfathering:
--   - platform_fee_flat_minor: the fixed amount in minor units (99 = 0.99).
--   - platform_fee_flat_currency: the currency that amount is denominated in
--     (USD). Kept explicit because events sell in many currencies and the
--     conversion policy is decided in a later slice.
--
-- Defaults of 0 / null mean no flat fee, which is the case for every event today
-- and every event already in the table. Nothing is charged by this migration.

alter table events add column if not exists platform_fee_flat_minor integer not null default 0;
alter table events add column if not exists platform_fee_flat_currency char(3);
