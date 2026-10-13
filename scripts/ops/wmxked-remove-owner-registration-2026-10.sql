-- WMXKED: remove the owner's own registration and release its seat(s).
-- Standalone. Touches ONLY the one registration identified in step 1.
--
-- HOW TO RUN (owner only):
--   0. Take a Neon branch / snapshot of production first.
--   1. Run PART A (read only). Find your row and copy its ticket code.
--      Part A also shows whether the earlier cleanup already ran.
--   2. In PART B, replace PASTE_TICKET_CODE_HERE with that code (one place).
--   3. Run PART B. It applies inside a transaction, prints before and after
--      counts, and STOPS without committing. Registrations should drop by 1
--      and live tickets by the number shown in Part A. Then COMMIT; or
--      ROLLBACK;.
--   If a guard fires, Postgres refuses further statements until you type
--   ROLLBACK; and nothing will have changed. The error text says which guard.

-- =====================================================================
-- PART A: DRY RUN (read only)
-- =====================================================================

-- A1. Candidate registrations. Broad search on surname, registrant email and
--     ticket holder name, so a different spelling still shows up.
SELECT t.code AS ticket_code, t.status AS ticket_status, t.holder_name, t.holder_email,
       u.email AS registrant_email, u.full_name AS registrant_name,
       r.created_at AS registered_at,
       (SELECT count(*) FROM tickets t2 WHERE t2.registration_id = r.id) AS tickets_on_registration,
       (SELECT count(*) FROM orders o WHERE o.registration_id = r.id) AS orders
FROM registrations r
JOIN users u ON u.id = r.user_id
LEFT JOIN tickets t ON t.registration_id = r.id
WHERE r.event_id = (SELECT id FROM events WHERE code = 'WMXKED')
  AND (u.full_name ILIKE '%sodeinde%'
       OR u.email ILIKE '%temmychoo%'
       OR EXISTS (SELECT 1 FROM tickets t3 WHERE t3.registration_id = r.id
                  AND t3.holder_name ILIKE '%sodeinde%'))
ORDER BY r.created_at;

-- A2. Did the earlier cleanup already run? Expect the 3 codes to show
--     'cancelled' and no test registration if it was committed.
SELECT code, status FROM tickets
WHERE code IN ('B2U63PVHRK', 'ZFMEEGUETK', 'TGRK6YB5AE');

SELECT count(*) AS test_registrations_remaining
FROM registrations r JOIN users u ON u.id = r.user_id
WHERE r.event_id = (SELECT id FROM events WHERE code = 'WMXKED')
  AND u.email = 'test+regq@orkora.events';

-- =====================================================================
-- PART B: APPLY (transaction; ends WITHOUT commit)
-- =====================================================================

BEGIN;

-- >>> Edit this one value: the ticket code from Part A. <<<
CREATE TEMP TABLE wmx_target_code ON COMMIT DROP AS
SELECT upper(btrim('PASTE_TICKET_CODE_HERE')) AS code;

CREATE TEMP TABLE wmx_owner ON COMMIT DROP AS
SELECT DISTINCT r.id
FROM tickets t
JOIN registrations r ON r.id = t.registration_id
WHERE r.event_id = (SELECT id FROM events WHERE code = 'WMXKED')
  AND t.code = (SELECT code FROM wmx_target_code);

DO $$
DECLARE n_reg int; n_orders int; n_holders int;
BEGIN
  IF (SELECT code FROM wmx_target_code) = 'PASTE_TICKET_CODE_HERE' THEN
    RAISE EXCEPTION 'Paste your ticket code from Part A into wmx_target_code first. Aborting.';
  END IF;

  SELECT count(*) INTO n_reg FROM wmx_owner;
  IF n_reg <> 1 THEN
    RAISE EXCEPTION 'That code matched % registration(s) on WMXKED; expected 1. Aborting.', n_reg;
  END IF;

  SELECT count(*) INTO n_orders FROM orders WHERE registration_id IN (SELECT id FROM wmx_owner);
  IF n_orders <> 0 THEN
    RAISE EXCEPTION 'This registration has % order(s); refusing to delete. Aborting.', n_orders;
  END IF;

  -- If the registration carries tickets for more than one distinct holder,
  -- a guest would be removed with it. Stop and let the owner decide.
  SELECT count(DISTINCT lower(regexp_replace(btrim(holder_name), '\s+', ' ', 'g')))
    INTO n_holders
  FROM tickets WHERE registration_id IN (SELECT id FROM wmx_owner);
  IF n_holders > 1 THEN
    RAISE EXCEPTION 'This registration holds tickets for % different people. Aborting so no guest is removed.', n_holders;
  END IF;
END $$;

-- Before.
SELECT
  (SELECT count(*) FROM registrations r
     WHERE r.event_id = (SELECT id FROM events WHERE code = 'WMXKED')) AS registrations_before,
  (SELECT count(*) FROM tickets t JOIN registrations r ON r.id = t.registration_id
     WHERE r.event_id = (SELECT id FROM events WHERE code = 'WMXKED')
       AND t.status IN ('issued', 'checked_in')) AS live_tickets_before;

-- Release the seat(s) held, then remove the registration. Its tickets are
-- removed with it (tickets.registration_id ON DELETE CASCADE).
UPDATE ticket_tiers tt
SET quantity_sold = GREATEST(0, tt.quantity_sold - c.n)
FROM (
  SELECT t.tier_id, count(*) AS n
  FROM tickets t
  WHERE t.registration_id IN (SELECT id FROM wmx_owner)
    AND t.status IN ('issued', 'checked_in')
  GROUP BY t.tier_id
) c
WHERE tt.id = c.tier_id;

DELETE FROM registrations WHERE id IN (SELECT id FROM wmx_owner);

-- After. Registrations should be 1 lower; live tickets lower by the count
-- Part A showed for this registration.
SELECT
  (SELECT count(*) FROM registrations r
     WHERE r.event_id = (SELECT id FROM events WHERE code = 'WMXKED')) AS registrations_after,
  (SELECT count(*) FROM tickets t JOIN registrations r ON r.id = t.registration_id
     WHERE r.event_id = (SELECT id FROM events WHERE code = 'WMXKED')
       AND t.status IN ('issued', 'checked_in')) AS live_tickets_after;

SELECT tt.name, tt.quantity_total, tt.quantity_sold
FROM ticket_tiers tt
WHERE tt.event_id = (SELECT id FROM events WHERE code = 'WMXKED');

-- Now type COMMIT; to keep the change, or ROLLBACK; to undo it.
