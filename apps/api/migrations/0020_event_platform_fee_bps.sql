-- 0020_event_platform_fee_bps.sql
-- Platform fee, slice 1: data model and grandfathering.
--
-- Each event carries the platform fee rate (in basis points) that was in effect
-- when it was created. This is how the fee is grandfathered per Terms of Service
-- sections 4 and 7: an event keeps its creation-time rate for its whole life,
-- and a future rate change only affects events created after it.
--
-- Default 0 means every event today, and every event already in the table, is at
-- 0% and stays there. Nothing is charged by this migration.

alter table events add column if not exists platform_fee_bps integer not null default 0;
