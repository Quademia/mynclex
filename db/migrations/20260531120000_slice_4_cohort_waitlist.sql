-- =========================================================
-- MyNclex — Payments Slice 4: student-initiated waitlist
-- File: mynclex/db/migrations/20260531120000_slice_4_cohort_waitlist.sql
-- =========================================================
-- Source of truth: docs/product-plan/payments-and-enrolment.md
--   ("Enrolment — always tutor-mediated in v1", student-initiated path;
--    "Off-platform flow", convert-waitlist-entry sub-case).
--
-- A visitor on a programme's PUBLIC detail page can express interest in
-- a cohort by leaving name + email + an optional message — WITHOUT an
-- account. That lands in nclex_cohort_waitlist as a PENDING row. The
-- owning tutor sees it in the cohort workspace and either CONVERTS it
-- (one click → invite + ENROLLED enrolment, exactly like the manual
-- "Add student" path, pre-filled from the row) or DISMISSES it.
--
-- These are pre-enrolment LEADS, not financial records: ON DELETE
-- CASCADE off the cohort/programme (unlike nclex_enrolments, which is
-- RESTRICT). A converted row keeps a SET NULL pointer to the enrolment
-- it produced, for audit.
--
-- Write paths (deliberately NOT raw table policies):
--   • INSERT  — only via nclex_join_waitlist (SECURITY DEFINER, granted
--               to anon): one validated, auditable entry point. The
--               public never writes the table directly.
--   • UPDATE  — convert / dismiss run server-side under the service
--               role (the convert path must invite + write the student
--               profile, which the table's RLS can't do anyway), gating
--               tutor ownership in TS first. Mirrors lib/enrolments
--               addStudentAction. So no tutor INSERT/UPDATE policy here.
--   • SELECT  — owning tutor + SUPER_ADMIN (the cohort-workspace panel).


-- =========================================================
-- 1. nclex_cohort_waitlist
-- =========================================================

CREATE TABLE nclex_cohort_waitlist (
  waitlist_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The cohort the visitor wants in. CASCADE: a lead has no value once
  -- the cohort is gone (these are not audit records).
  cohort_id            UUID NOT NULL
                       REFERENCES nclex_cohorts(cohort_id) ON DELETE CASCADE,

  -- Denormalised parent programme (set by the RPC from the cohort) so
  -- the tutor-ownership RLS check is a single join, matching the
  -- nclex_enrolments pattern.
  programme_id         UUID NOT NULL
                       REFERENCES nclex_programmes(programme_id) ON DELETE CASCADE,

  -- Self-supplied lead details (no account yet). forename + surname
  -- (not one "name") so the convert path can create the nclex_users
  -- profile directly — its forename/surname are both NOT NULL. Email
  -- stored lower-cased by the RPC.
  forename             TEXT NOT NULL,
  surname              TEXT NOT NULL,
  email                TEXT NOT NULL,
  message              TEXT,

  status               TEXT NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','CONVERTED','DISMISSED')),

  -- Set when CONVERTED. SET NULL so cancelling/removing the resulting
  -- enrolment never deletes the historical waitlist lead.
  converted_enrolment_id UUID
                       REFERENCES nclex_enrolments(enrolment_id) ON DELETE SET NULL,

  -- Who actioned it (convert/dismiss) and when. Audit only.
  handled_by_user_id   UUID
                       REFERENCES nclex_users(id) ON DELETE SET NULL,
  handled_at           TIMESTAMPTZ,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =========================================================
-- 2. Indexes
-- =========================================================

-- At most ONE pending lead per (cohort, email) — stops a refresh /
-- double-tap from stacking duplicate requests. CONVERTED / DISMISSED
-- rows are excluded so the same person can re-join later if dismissed.
CREATE UNIQUE INDEX idx_nclex_cohort_waitlist_pending
  ON nclex_cohort_waitlist (cohort_id, lower(email))
  WHERE status = 'PENDING';

-- Tutor cohort-workspace panel query (pending leads for a cohort).
CREATE INDEX idx_nclex_cohort_waitlist_cohort_status
  ON nclex_cohort_waitlist (cohort_id, status);


-- =========================================================
-- 3. RLS
-- =========================================================

ALTER TABLE nclex_cohort_waitlist ENABLE ROW LEVEL SECURITY;

-- The owning tutor reads leads for cohorts of programmes they own.
CREATE POLICY nclex_cohort_waitlist_tutor_select
  ON nclex_cohort_waitlist FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_cohort_waitlist.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_waitlist_admin_all
  ON nclex_cohort_waitlist FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- 4. nclex_join_waitlist — anon-callable, validated INSERT
-- =========================================================
-- The ONE public write path. SECURITY DEFINER so it can insert past the
-- (deliberately) policy-less table. Validates the cohort is genuinely
-- joinable ("open", same definition as nclex_public_programmes) before
-- writing, so a forged cohort_id or a closed cohort can't seed leads.
-- Idempotent on (cohort, email): a repeat while still PENDING returns
-- the existing row rather than erroring — the form shows the same
-- "you're on the list" either way (no email-enumeration signal).
CREATE OR REPLACE FUNCTION nclex_join_waitlist(
  p_cohort_id UUID,
  p_forename  TEXT,
  p_surname   TEXT,
  p_email     TEXT,
  p_message   TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_forename   TEXT := btrim(p_forename);
  v_surname    TEXT := btrim(p_surname);
  v_email      TEXT := lower(btrim(p_email));
  v_message    TEXT := NULLIF(btrim(COALESCE(p_message, '')), '');
  v_programme  UUID;
  v_existing   UUID;
BEGIN
  IF v_forename = '' OR v_surname = '' THEN
    RAISE EXCEPTION 'first name and surname are required';
  END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'a valid email is required';
  END IF;

  -- Cohort must be joinable: published + active tutor, not cancelled,
  -- not ended, and either upcoming or late-join-allowed.
  SELECT c.programme_id
  INTO v_programme
  FROM nclex_cohorts c
  JOIN nclex_programmes p ON p.programme_id = c.programme_id
  JOIN nclex_users u      ON u.id = p.tutor_id
  WHERE c.cohort_id = p_cohort_id
    AND p.status = 'PUBLISHED'
    AND u.is_active
    AND c.cancelled_at IS NULL
    AND c.end_date >= CURRENT_DATE
    AND (c.start_date >= CURRENT_DATE OR c.allow_late_join);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cohort is not open for waitlist join';
  END IF;

  -- Idempotent: return the live pending lead if one already exists.
  SELECT waitlist_id
  INTO v_existing
  FROM nclex_cohort_waitlist
  WHERE cohort_id = p_cohort_id
    AND lower(email) = v_email
    AND status = 'PENDING';

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  INSERT INTO nclex_cohort_waitlist (cohort_id, programme_id, forename, surname, email, message)
  VALUES (p_cohort_id, v_programme, v_forename, v_surname, v_email, v_message)
  RETURNING waitlist_id INTO v_existing;

  RETURN v_existing;
END;
$$;

REVOKE EXECUTE ON FUNCTION nclex_join_waitlist(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nclex_join_waitlist(UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
