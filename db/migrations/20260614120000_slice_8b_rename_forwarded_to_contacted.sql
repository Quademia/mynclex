-- =========================================================
-- MyNclex — Slice 8b: rename FORWARDED → CONTACTED on enquiries
-- File: mynclex/db/migrations/20260614120000_slice_8b_rename_forwarded_to_contacted.sql
-- =========================================================
-- Tutor-perspective rename of the second status. The original "FORWARDED"
-- came from the design-handoff phrasing where QAcademy would forward the
-- enquiry to the tutor via email (platform-perspective). v1 doesn't ship
-- the auto-forward email — the button represents the *tutor* having
-- contacted the student. "Contacted" is the right name for the action
-- the button records; "Forwarded" was platform jargon for a workflow we
-- never built.
--
-- If we later add platform auto-email, that's a separate concept with
-- its own timestamp (e.g. email_sent_at); the status "Contacted" stays
-- the tutor's action.
--
-- No existing FORWARDED rows in dev (the seed leads are NEW), but the
-- UPDATE is here for completeness and idempotency.

BEGIN;

-- ---------------------------------------------------------
-- 1. Loosen the CHECK, migrate data, re-tighten with new value
-- ---------------------------------------------------------
-- Drop the CHECK first so the UPDATE can write the new value without
-- a constraint violation, then re-add with the renamed allowed set.
ALTER TABLE nclex_programme_enquiries
  DROP CONSTRAINT nclex_programme_enquiries_status_check;

UPDATE nclex_programme_enquiries
   SET status = 'CONTACTED'
 WHERE status = 'FORWARDED';

ALTER TABLE nclex_programme_enquiries
  ADD CONSTRAINT nclex_programme_enquiries_status_check
  CHECK (status IN ('NEW','CONTACTED','CONVERTED','CLOSED'));

-- ---------------------------------------------------------
-- 2. Rename the timestamp column to match
-- ---------------------------------------------------------
ALTER TABLE nclex_programme_enquiries
  RENAME COLUMN forwarded_at TO contacted_at;

-- ---------------------------------------------------------
-- 3. Rebuild the partial indexes that referenced 'FORWARDED'
-- ---------------------------------------------------------
-- The two partial indexes filter `status IN ('NEW','FORWARDED')`. The
-- old definition still works at the row level (the table no longer
-- contains FORWARDED rows after step 1), but the PREDICATE references a
-- value the CHECK now rejects — making it dead text and confusing to a
-- future reader. Rebuild both with the new value.
DROP INDEX idx_nclex_programme_enquiries_open;
DROP INDEX idx_nclex_programme_enquiries_email;

CREATE UNIQUE INDEX idx_nclex_programme_enquiries_open
  ON nclex_programme_enquiries (programme_id, lower(email))
  WHERE status IN ('NEW','CONTACTED');

CREATE INDEX idx_nclex_programme_enquiries_email
  ON nclex_programme_enquiries (lower(email))
  WHERE status IN ('NEW','CONTACTED');

COMMIT;
