-- mynclex/db/migrations/20260913120000_tutor_record.sql
--
-- Tutor onboarding — slice 1a: the tutor record, and the profile lift.
-- Plan: docs/product-plan/tutor-onboarding.md (§2, §3, §11).
--
-- ⭐ WHY THIS TABLE EXISTS. Today "tutor" is not a thing in this
-- database — it is an *implication*: a role string in nclex_user_roles
-- plus a JSONB bag on nclex_users that only tutors ever use. There is no
-- row anywhere saying "this person is a tutor of ours", which is exactly
-- why there is nowhere to hang an approval, a suspension, or (later) a
-- plan. This table names the entity.
--
-- ⚠ IT IS NOT AN APPLICATION TABLE. The grain is one row PER PERSON, not
-- per request, and the row is permanent: it survives approval,
-- suspension, re-approval and re-application. The application fields are
-- the record of how the row came to exist, and a re-application UPDATES
-- them in place rather than filing a second row. (A per-request
-- applications table was the first proposal and was rejected: it records
-- the application and still leaves no row representing the tutor.)
--
-- ⭐ THE ROLE STAYS IN nclex_user_roles. This table EXPLAINS the
-- tutorship; the role GRANTS access. Role table = "can they get in",
-- this table = "who they are and what we decided". Keeping the grant
-- where it is means every existing gate — requireTutor(), the /tutor
-- layout, every RLS policy keyed on nclex_user_has_role('TUTOR') —
-- keeps working untouched by this migration.
--
-- NO MONEY, NO EXPIRY, NO PLAN — deliberately, and it is load-bearing.
-- Tutor plans are quota tiers ("50 students, 1 programme"), a shape
-- nothing in nclex_products expresses, and the pricing is not settled.
-- Because this table holds nothing commercial, whatever plan model
-- eventually lands attaches by user_id without touching it. See the
-- plan doc §12, including why EXPIRED is NOT a status value here:
-- suspend → subscription lapses → sweep sets EXPIRED → they pay → set
-- APPROVED → a SUSPENDED tutor is teaching again. Standing and money
-- are different axes.
--
-- Convention notes: no updated_at trigger (this repo sets updated_at
-- explicitly in every write path — see the 1.12a migration's header);
-- FKs target nclex_users(id), never auth.users, matching every other
-- tutor-owned table here.


-- ── 1. the table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nclex_tutors (
  -- The person. No email/name copy: MyTeacher's teacher_profiles
  -- duplicated both because its schema predates a real FK; we have one.
  user_id            UUID PRIMARY KEY REFERENCES nclex_users(id) ON DELETE CASCADE,

  -- ── Axis 1: standing with us (vetting / conduct) ──────────────────
  -- REJECTED is deliberately NOT terminal — a rejected person may
  -- re-apply, which moves the row back to PENDING. A CHECK is the
  -- expensive kind of thing to change later, so it allows it now.
  status             TEXT NOT NULL
                     CHECK (status IN ('PENDING','APPROVED','REJECTED','SUSPENDED')),

  -- How they got here. LEGACY = the hand-made tutors that predate this
  -- table (see section 3): calling those ADMIN_PROMOTION would invent a
  -- decision nobody made, and provenance is the entire point of source.
  source             TEXT NOT NULL
                     CHECK (source IN ('SELF_APPLICATION','ADMIN_PROMOTION',
                                       'ADMIN_INVITE','REGISTRATION','LEGACY')),

  -- ── Public-facing, lifted from nclex_users.public_profile ─────────
  -- PUBLIC-ONLY BY RULE, and the invariant is encoded in the NAME — see
  -- migration 20260530120000, which said the same thing in its old home.
  -- Never put vetting or private data in this bag: it is the one column
  -- on this table that strangers read (through nclex_public_programmes).
  public_profile     JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- ── Application payload (what a vetting decision is made on) ───────
  -- phone_number is deliberately absent: every user has a phone, so it
  -- lives on nclex_users and an application merely POPULATES it there.
  -- The boundary rule: a field belongs here only if a non-tutor would
  -- never need it.
  organisation       TEXT,
  request_note       TEXT,
  -- Shown to the applicant as "Request #N" — a user-facing number, not
  -- back-office plumbing (the MyTeacher precedent, verified in its
  -- access-request page). Re-application increments it.
  submission_count   SMALLINT NOT NULL DEFAULT 1,
  first_applied_at   TIMESTAMPTZ,
  last_applied_at    TIMESTAMPTZ,

  -- ── Decision ──────────────────────────────────────────────────────
  -- Two pairs on purpose. approved_* is the permanent vetting fact, set
  -- once on FIRST approval and never overwritten — "who let this person
  -- in", which survives a later suspension. decided_* is the LAST
  -- decision of any kind, suspensions included. Overwrite the second
  -- freely; never the first.
  approved_at        TIMESTAMPTZ,
  approved_by        UUID REFERENCES nclex_users(id) ON DELETE SET NULL,
  decided_at         TIMESTAMPTZ,
  decided_by         UUID REFERENCES nclex_users(id) ON DELETE SET NULL,
  decision_reason    TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE nclex_tutors IS
  'One row per person who has ever asked to be, or been made, a tutor. '
  'The tutor RECORD, not an application log: permanent, one row per '
  'person, updated in place by re-application. The TUTOR role itself '
  'lives in nclex_user_roles. Holds no money, expiry or plan by design.';


-- ── 2. indexes ───────────────────────────────────────────────────────
-- The admin directory (slice 1b) filters by status, and the applications
-- queue (2b) reads PENDING specifically.

CREATE INDEX IF NOT EXISTS nclex_tutors_status_idx
  ON nclex_tutors (status);


-- ── 3. backfill: the tutors that already exist ───────────────────────
-- Every current TUTOR-role holder gets a row, carrying their existing
-- public_profile across so nothing they wrote is lost.
--
-- ⚠ source = 'LEGACY' and approved_at / approved_by stay NULL. These
-- tutors were created by hand, directly against the database, before any
-- of this existed. NULL is the honest answer to "who approved them, and
-- when": nobody knows. Inventing an approver to satisfy a NOT NULL would
-- put a fact in the table that is not true.

INSERT INTO nclex_tutors (
  user_id, status, source, public_profile, created_at, updated_at
)
SELECT
  r.user_id,
  'APPROVED',
  'LEGACY',
  COALESCE(u.public_profile, '{}'::jsonb),
  NOW(),
  NOW()
FROM nclex_user_roles r
JOIN nclex_users u ON u.id = r.user_id
WHERE r.role = 'TUTOR'
ON CONFLICT (user_id) DO NOTHING;


-- ── 4. RLS ───────────────────────────────────────────────────────────
-- Reads: yourself, or an admin holding TUTORS_MANAGE (the helper ORs
-- SUPER_ADMIN in, so super-admins keep their standing bypass).
--
-- ⓘ The public does NOT need a read policy here. nclex_public_programmes
-- is a view with security_invoker = false (owner rights), which is why
-- anon can already read tutor names out of the locked-down nclex_users;
-- the same applies to this table once the view joins it.

ALTER TABLE nclex_tutors ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_tutors_self_read ON nclex_tutors FOR SELECT
  USING (user_id = auth.uid() OR nclex_user_has_permission('TUTORS_MANAGE'));

-- A tutor may update their OWN row. Which COLUMNS they may touch is
-- restricted separately, in section 5 — read that before changing this.
CREATE POLICY nclex_tutors_self_update ON nclex_tutors FOR UPDATE
  USING (user_id = auth.uid() OR nclex_user_has_permission('TUTORS_MANAGE'));

-- Creating and removing tutor records is an admin act. Self-application
-- (slice 2a) will go through a SECURITY DEFINER RPC rather than loosen
-- this, so that a self-applicant can only ever create a PENDING row for
-- themselves and can never choose their own status.
CREATE POLICY nclex_tutors_admin_insert ON nclex_tutors FOR INSERT
  WITH CHECK (nclex_user_has_permission('TUTORS_MANAGE'));

CREATE POLICY nclex_tutors_admin_delete ON nclex_tutors FOR DELETE
  USING (nclex_user_has_permission('TUTORS_MANAGE'));


-- ── 5. ⚠ COLUMN-LEVEL WRITE GRANTS — THE SELF-APPROVAL GUARD ─────────
--
-- THIS IS THE SECURITY-CRITICAL PART OF THE MIGRATION.
--
-- The old home for public_profile was nclex_users, whose self-update
-- policy is whole-row — harmless there, because that row holds nothing
-- that grants privilege. This table is different: it holds `status`.
-- Move the same whole-row shape here and any signed-in tutor could call
--
--     update nclex_tutors set status = 'APPROVED' where user_id = me
--
-- and approve themselves — or lift their own suspension. RLS cannot
-- express "these columns but not those", so the row policy above is not
-- enough on its own.
--
-- Postgres column privileges are the right tool, and PostgREST honours
-- them: revoke UPDATE wholesale, then hand back exactly the one column
-- a tutor legitimately owns. An attempt to write any other column now
-- fails at the database, whatever the client sends.
--
-- Status transitions therefore belong exclusively to the admin actions
-- in slices 1c/1d, which run under TUTORS_MANAGE.
--
-- ⓘ First column-level grant in this repo (there were none before this
-- migration, checked). If a later table needs the same treatment, this
-- is the pattern.

REVOKE UPDATE ON nclex_tutors FROM authenticated;
GRANT  UPDATE (public_profile, updated_at) ON nclex_tutors TO authenticated;


-- ── 6. re-point the public view at the new home ──────────────────────
-- nclex_public_programmes is the only public view that reads the profile
-- bag. (nclex_public_units and nclex_public_cohorts join nclex_users
-- purely for the is_active check and select no profile — they are
-- untouched here, and get the tutor-level suspension filter in 1d.)
--
-- The join is LEFT: a programme whose tutor somehow has no nclex_tutors
-- row must still appear in the catalogue with an empty profile, rather
-- than vanishing from public discovery. An inner join would make a
-- missing row silently unpublish someone's programme.
--
-- ⚠ nclex_users.public_profile is deliberately NOT dropped in this
-- migration. Moving data and deleting the source in one step leaves no
-- way back. The DROP is its own migration (plan doc §11, "1a-drop")
-- once prod has run on the new home for a release.

CREATE OR REPLACE VIEW nclex_public_programmes AS
SELECT
  p.programme_id,
  p.title,
  p.tagline,
  p.description,
  p.delivery_mode,
  p.unit_label,
  p.length_units,
  p.price_currency,
  p.show_price_publicly,
  p.payment_collection_mode,
  p.access_window_days,
  p.published_at,
  u.name           AS tutor_name,
  u.avatar_url     AS tutor_avatar_url,
  oc.next_cohort_start,
  COALESCE(oc.open_cohort_count, 0) AS open_cohort_count,
  COALESCE(t.public_profile, '{}'::jsonb) AS tutor_profile,  -- slice 3.5, moved 1a
  COALESCE(
    (SELECT s.total_price_minor
       FROM nclex_programme_payment_strategies s
      WHERE s.programme_id = p.programme_id
        AND s.kind = 'UPFRONT_FULL'
        AND s.is_active
      LIMIT 1),
    (SELECT MIN(s.initial_price_minor)
       FROM nclex_programme_payment_strategies s
      WHERE s.programme_id = p.programme_id
        AND s.is_active),
    0
  )                AS headline_price_minor,    -- slice 7e
  EXISTS (
    SELECT 1
      FROM nclex_programme_payment_strategies s
     WHERE s.programme_id = p.programme_id
       AND s.kind = 'UPFRONT_FULL'
       AND s.is_active
  )                AS headline_is_upfront     -- slice 7e
FROM nclex_programmes p
JOIN nclex_users u ON u.id = p.tutor_id
LEFT JOIN nclex_tutors t ON t.user_id = p.tutor_id
LEFT JOIN LATERAL (
  -- "Open" = joinable: not cancelled, not yet ended, and either
  -- upcoming or in-progress with late-join allowed.
  SELECT
    MIN(c.start_date) FILTER (WHERE c.start_date >= CURRENT_DATE)
                                         AS next_cohort_start,
    COUNT(*)                             AS open_cohort_count
  FROM nclex_cohorts c
  WHERE c.programme_id = p.programme_id
    AND c.cancelled_at IS NULL
    AND c.end_date >= CURRENT_DATE
    AND (c.start_date >= CURRENT_DATE OR c.allow_late_join)
) oc ON TRUE
WHERE p.status = 'PUBLISHED'
  AND u.is_active;

GRANT SELECT ON nclex_public_programmes TO anon, authenticated;
