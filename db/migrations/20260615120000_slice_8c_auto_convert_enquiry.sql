-- =========================================================
-- MyNclex — Slice 8c: auto-stamp enquiry as CONVERTED on enrolment
-- File: mynclex/db/migrations/20260615120000_slice_8c_auto_convert_enquiry.sql
-- =========================================================
-- When a new nclex_enrolments row lands, check whether the enrolled
-- student has an OPEN (NEW/CONTACTED) enquiry for the same programme,
-- matched by email. If so, stamp it: status → CONVERTED, and link to
-- the resulting enrolment via converted_enrolment_id.
--
-- Why a DB trigger (vs hooking into activate.ts + addStudentAction):
--   • Fires for every enrolment regardless of where it was created.
--     Tutor-add, on-platform checkout, future flows — all routes covered
--     with one mechanism. No "we forgot to call the matcher" risk.
--   • Atomic with the INSERT. The stamp can't drift out of sync.
--
-- SECURITY DEFINER is required because:
--   • nclex_users has self-read-only RLS — the trigger needs to read
--     the new enrolment owner's email.
--   • nclex_programme_enquiries has no tutor UPDATE policy (only
--     SUPER_ADMIN ALL bypass) — the trigger needs to UPDATE the
--     matched enquiry row.
-- Both are safe under SECURITY DEFINER because the trigger only ever
-- fires from a legitimate enrolment INSERT (which itself is RLS-gated)
-- and operates strictly on rows matching programme_id + lower(email).

BEGIN;

CREATE OR REPLACE FUNCTION nclex_stamp_enquiry_converted()
RETURNS TRIGGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT;
BEGIN
  -- Email of the enrolled student. Defensive lower+btrim to match how the
  -- enquiry RPC normalised the lead's email at insert.
  SELECT lower(btrim(email))
    INTO v_email
    FROM nclex_users
   WHERE id = NEW.user_id;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN NEW;
  END IF;

  -- Stamp every OPEN enquiry for this programme + email — there should be
  -- at most one (UNIQUE partial index), but UPDATE is set-safe so we don't
  -- have to assert that here. updated_at moves with the change.
  UPDATE nclex_programme_enquiries
     SET status = 'CONVERTED',
         converted_enrolment_id = NEW.enrolment_id,
         updated_at = NOW()
   WHERE programme_id = NEW.programme_id
     AND lower(email)  = v_email
     AND status IN ('NEW','CONTACTED');

  RETURN NEW;
END;
$$;

-- AFTER INSERT — we want the enrolment row to exist before stamping the
-- FK target (converted_enrolment_id REFERENCES nclex_enrolments). BEFORE
-- would also work but AFTER is the natural placement for "react to a row
-- that just landed."
DROP TRIGGER IF EXISTS nclex_enrolments_stamp_enquiry_converted ON nclex_enrolments;
CREATE TRIGGER nclex_enrolments_stamp_enquiry_converted
  AFTER INSERT ON nclex_enrolments
  FOR EACH ROW EXECUTE FUNCTION nclex_stamp_enquiry_converted();

COMMIT;
