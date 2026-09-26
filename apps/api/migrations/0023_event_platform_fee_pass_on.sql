-- 0023_event_platform_fee_pass_on.sql
-- Platform fee: who bears it.
--
-- Per-event organizer choice. false (default) means the organizer absorbs the
-- platform fee (it comes out of their proceeds). true means the fee is passed on
-- to attendees, added to what they pay at checkout.
--
-- Default false, and the fee is 0 today, so this changes nothing until the fee
-- is live and an organizer opts to pass it on.

alter table events add column if not exists platform_fee_pass_on boolean not null default false;
