-- =========================================================
-- MyNclex — RLS policies & helper functions
-- File: mynclex/db/rls.sql
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- HELPER FUNCTIONS
-- SECURITY DEFINER avoids recursive RLS evaluation.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION nclex_user_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION nclex_user_has_role(check_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM nclex_user_roles
    WHERE user_id = auth.uid() AND role = check_role
  );
$$;

CREATE OR REPLACE FUNCTION nclex_user_has_permission(check_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM nclex_user_roles WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
    OR
    EXISTS (SELECT 1 FROM nclex_admin_permissions WHERE user_id = auth.uid() AND permission = check_permission);
$$;

-- Enrolment gates (access-gating step, 2026-05-20). Two granularities ×
-- two strictnesses. The "_active_" variants require status = 'ENROLLED'
-- (content tier); the plain variants accept ANY enrolment row, active or
-- terminal (metadata tier — lets the switcher show a PAUSED/CANCELLED
-- student their programme name + pill without exposing curriculum).
-- SECURITY DEFINER so a student_select policy referencing nclex_enrolments
-- can't recurse through that table's own RLS.

CREATE OR REPLACE FUNCTION nclex_has_programme_enrolment(p_programme_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM nclex_enrolments e
    WHERE e.programme_id = p_programme_id
      AND e.user_id = auth.uid()
  );
$$;

-- Access-window check added Payments 7d (2026-06-10): a past-window enrolment
-- loses content access at read time, before the nightly EXPIRED sweep runs.
CREATE OR REPLACE FUNCTION nclex_has_active_programme_enrolment(p_programme_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM nclex_enrolments e
    WHERE e.programme_id = p_programme_id
      AND e.user_id = auth.uid()
      AND e.status = 'ENROLLED'
      AND (e.access_expires_at IS NULL OR e.access_expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION nclex_has_cohort_enrolment(p_cohort_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM nclex_enrolments e
    WHERE e.cohort_id = p_cohort_id
      AND e.user_id = auth.uid()
  );
$$;

-- Access-window check added Payments 7d (2026-06-10) — see programme twin above.
CREATE OR REPLACE FUNCTION nclex_has_active_cohort_enrolment(p_cohort_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM nclex_enrolments e
    WHERE e.cohort_id = p_cohort_id
      AND e.user_id = auth.uid()
      AND e.status = 'ENROLLED'
      AND (e.access_expires_at IS NULL OR e.access_expires_at > NOW())
  );
$$;


-- ─────────────────────────────────────────────────────────
-- ENABLE RLS
-- ─────────────────────────────────────────────────────────

ALTER TABLE nclex_users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_user_roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_admin_permissions  ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────
-- nclex_users
-- ─────────────────────────────────────────────────────────

CREATE POLICY nclex_users_self_read ON nclex_users FOR SELECT
  USING (id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'));

CREATE POLICY nclex_users_self_update ON nclex_users FOR UPDATE
  USING (id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'));

CREATE POLICY nclex_users_self_insert ON nclex_users FOR INSERT
  WITH CHECK (id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'));

CREATE POLICY nclex_users_admin_delete ON nclex_users FOR DELETE
  USING (nclex_user_has_role('SUPER_ADMIN'));

-- ─────────────────────────────────────────────────────────
-- nclex_tutors  (tutor-onboarding slice 1a, 20260913120000)
-- ─────────────────────────────────────────────────────────
-- Reads: yourself, or an admin holding TUTORS_MANAGE (the helper ORs
-- SUPER_ADMIN in, so the standing bypass still applies).
--
-- ⓘ The PUBLIC needs no policy here. nclex_public_programmes is a view
-- with security_invoker = false (owner rights) — which is why anon can
-- already read tutor names out of the locked-down nclex_users — and the
-- same applies to this table now the view joins it.

ALTER TABLE nclex_tutors ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_tutors_self_read ON nclex_tutors FOR SELECT
  USING (user_id = auth.uid() OR nclex_user_has_permission('TUTORS_MANAGE'));

-- A tutor may update their OWN row. WHICH COLUMNS is restricted
-- separately by the column grants below — read those before touching
-- this policy.
CREATE POLICY nclex_tutors_self_update ON nclex_tutors FOR UPDATE
  USING (user_id = auth.uid() OR nclex_user_has_permission('TUTORS_MANAGE'));

-- Creating and removing tutor records is an admin act. Self-application
-- (slice 2a) goes through a SECURITY DEFINER RPC rather than loosening
-- this, so an applicant can only ever create a PENDING row for
-- themselves and can never choose their own status.
CREATE POLICY nclex_tutors_admin_insert ON nclex_tutors FOR INSERT
  WITH CHECK (nclex_user_has_permission('TUTORS_MANAGE'));

CREATE POLICY nclex_tutors_admin_delete ON nclex_tutors FOR DELETE
  USING (nclex_user_has_permission('TUTORS_MANAGE'));

-- ⚠ THE SELF-APPROVAL GUARD. RLS cannot say "these columns but not
-- those", and this table holds `status`. Without the two lines below, a
-- signed-in tutor could run
--     update nclex_tutors set status = 'APPROVED' where user_id = me
-- and approve themselves, or lift their own suspension. Column
-- privileges are the right tool and PostgREST honours them: revoke
-- UPDATE wholesale, hand back exactly the column a tutor owns.
-- Status transitions belong to the admin actions (slices 1c/1d).
-- ⓘ First column-level grant in this repo; if another table ever needs
-- the same treatment, this is the pattern.
REVOKE UPDATE ON nclex_tutors FROM authenticated;
GRANT  UPDATE (public_profile, updated_at) ON nclex_tutors TO authenticated;

-- ⭐ AND IT COVERS NEW COLUMNS FOR FREE. decision_history (slice 1d-i,
-- 20260916120000) carries no grant because the list above names two
-- columns and it is not one of them — so a tutor cannot rewrite their own
-- history. ⚠ Do NOT "complete" the grant list when adding a column: the
-- omission IS the protection. Only a column a tutor genuinely owns, like
-- public_profile, belongs there.


-- ─────────────────────────────────────────────────────────
-- nclex_user_roles
-- ─────────────────────────────────────────────────────────

CREATE POLICY nclex_roles_self_read ON nclex_user_roles FOR SELECT
  USING (user_id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'));

CREATE POLICY nclex_roles_self_insert_student ON nclex_user_roles FOR INSERT
  WITH CHECK (user_id = auth.uid() AND role = 'STUDENT');

CREATE POLICY nclex_roles_admin_write ON nclex_user_roles FOR ALL
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- ─────────────────────────────────────────────────────────
-- nclex_admin_permissions
-- ─────────────────────────────────────────────────────────

CREATE POLICY nclex_perms_self_read ON nclex_admin_permissions FOR SELECT
  USING (user_id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'));

CREATE POLICY nclex_perms_admin_write ON nclex_admin_permissions FOR ALL
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- ─────────────────────────────────────────────────────────
-- nclex_bank_items
-- QAcademy-owned question bank. Two reader audiences:
--   • any authenticated user → published items only
--   • BANK_CURATE holders (and SUPER_ADMIN via the helper
--     short-circuit) → all items, including drafts + writes
-- Entitlement gating (paid access) happens at the app layer later.
-- ─────────────────────────────────────────────────────────

ALTER TABLE nclex_bank_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_bank_items_read_published ON nclex_bank_items FOR SELECT
  TO authenticated
  USING (is_published = TRUE);

CREATE POLICY nclex_bank_items_curate_all ON nclex_bank_items FOR ALL
  TO authenticated
  USING (nclex_user_has_permission('BANK_CURATE'))
  WITH CHECK (nclex_user_has_permission('BANK_CURATE'));


-- ─────────────────────────────────────────────────────────
-- nclex_tutor_questions
-- Tutor-private question bank. One writer audience:
--   • the owning tutor (tutor_id = auth.uid()) — full CRUD on own rows.
-- SUPER_ADMIN bypasses for moderation / support.
-- No public-read policy: tutor questions stay private until the student
-- runner introduces enrolment-scoped visibility (future slice).
-- No BANK_CURATE access: BANK_CURATE owns QAcademy content only.
-- Added 2026-04-22 in Slice 2.1 (tutor-side bank authoring).
-- ─────────────────────────────────────────────────────────

ALTER TABLE nclex_tutor_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_tutor_questions_tutor_own ON nclex_tutor_questions FOR ALL
  TO authenticated
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_questions_superadmin ON nclex_tutor_questions FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- ─────────────────────────────────────────────────────────
-- nclex_case_studies + nclex_case_study_tabs
-- QAcademy-owned case studies and their chart tabs.
-- Read audiences:
--   • any authenticated user → published cases only (plus their
--     tabs — students need the chart once the runner lands).
--   • BANK_CURATE holders (and SUPER_ADMIN via the helper
--     short-circuit) → full CRUD on cases + tabs.
-- Added 2026-04-22 in Slice 1.11a.
-- ─────────────────────────────────────────────────────────

ALTER TABLE nclex_case_studies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_case_study_tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_case_studies_read_published ON nclex_case_studies FOR SELECT
  TO authenticated
  USING (is_published = TRUE);

CREATE POLICY nclex_case_studies_curate_all ON nclex_case_studies FOR ALL
  TO authenticated
  USING (nclex_user_has_permission('BANK_CURATE'))
  WITH CHECK (nclex_user_has_permission('BANK_CURATE'));

CREATE POLICY nclex_case_study_tabs_read_published ON nclex_case_study_tabs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_case_studies cs
      WHERE cs.case_id = nclex_case_study_tabs.case_id
        AND cs.is_published = TRUE
    )
  );

CREATE POLICY nclex_case_study_tabs_curate_all ON nclex_case_study_tabs FOR ALL
  TO authenticated
  USING (nclex_user_has_permission('BANK_CURATE'))
  WITH CHECK (nclex_user_has_permission('BANK_CURATE'));


-- ─────────────────────────────────────────────────────────
-- nclex_tutor_case_studies + nclex_tutor_case_study_tabs
-- Tutor-private case studies and their chart tabs.
-- One writer audience per table:
--   • the owning tutor (tutor_id = auth.uid()) — full CRUD.
-- SUPER_ADMIN bypasses for moderation / support.
-- No public-read policy: tutor cases stay private until the student
-- runner introduces enrolment-scoped visibility (future slice).
-- Added 2026-04-22 in Slice 1.11a.
-- ─────────────────────────────────────────────────────────

ALTER TABLE nclex_tutor_case_studies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_tutor_case_study_tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_tutor_case_studies_tutor_own ON nclex_tutor_case_studies FOR ALL
  TO authenticated
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_case_studies_superadmin ON nclex_tutor_case_studies FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));

CREATE POLICY nclex_tutor_case_study_tabs_tutor_own ON nclex_tutor_case_study_tabs FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_tutor_case_studies cs
      WHERE cs.case_id = nclex_tutor_case_study_tabs.case_id
        AND cs.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_tutor_case_studies cs
      WHERE cs.case_id = nclex_tutor_case_study_tabs.case_id
        AND cs.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_tutor_case_study_tabs_superadmin ON nclex_tutor_case_study_tabs FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- ─────────────────────────────────────────────────────────
-- nclex_case_study_items + nclex_tutor_case_study_items
-- The 6-slot join tables — one row per populated Q1-Q6 slot on a
-- case study. Added 2026-04-24 in Slice 1.11b when the transactional
-- save started writing them.
-- Admin: authenticated readers can SELECT rows whose parent case is
-- published; BANK_CURATE holders (SUPER_ADMIN via the helper
-- short-circuit) get full CRUD.
-- Tutor: only the owning tutor of the parent case gets access, with
-- a SUPER_ADMIN bypass for moderation. No public-read policy —
-- tutor content stays private until the runner lands enrolment-
-- scoped visibility.
-- ─────────────────────────────────────────────────────────

ALTER TABLE nclex_case_study_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_tutor_case_study_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_case_study_items_read_published ON nclex_case_study_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_case_studies cs
      WHERE cs.case_id = nclex_case_study_items.case_id
        AND cs.is_published = TRUE
    )
  );

CREATE POLICY nclex_case_study_items_curate_all ON nclex_case_study_items FOR ALL
  TO authenticated
  USING (nclex_user_has_permission('BANK_CURATE'))
  WITH CHECK (nclex_user_has_permission('BANK_CURATE'));

CREATE POLICY nclex_tutor_case_study_items_tutor_own ON nclex_tutor_case_study_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_tutor_case_studies cs
      WHERE cs.case_id = nclex_tutor_case_study_items.case_id
        AND cs.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_tutor_case_studies cs
      WHERE cs.case_id = nclex_tutor_case_study_items.case_id
        AND cs.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_tutor_case_study_items_superadmin ON nclex_tutor_case_study_items FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- ─────────────────────────────────────────────────────────
-- nclex_trend_datasets
-- Admin-owned trend datasets (Slice 1.12a).
-- Read audiences:
--   • any authenticated user → published rows only.
--   • BANK_CURATE holders (and SUPER_ADMIN via the helper
--     short-circuit) → full CRUD.
-- Added 2026-04-24 in Slice 1.12a.
-- ─────────────────────────────────────────────────────────

ALTER TABLE nclex_trend_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_trend_datasets_read_published ON nclex_trend_datasets FOR SELECT
  TO authenticated
  USING (is_published = TRUE);

CREATE POLICY nclex_trend_datasets_curate_all ON nclex_trend_datasets FOR ALL
  TO authenticated
  USING (nclex_user_has_permission('BANK_CURATE'))
  WITH CHECK (nclex_user_has_permission('BANK_CURATE'));


-- ─────────────────────────────────────────────────────────
-- nclex_tutor_trend_datasets
-- Tutor-private trend datasets (Slice 1.12a).
-- One writer audience:
--   • the owning tutor (tutor_id = auth.uid()) — full CRUD.
-- SUPER_ADMIN bypasses for moderation / support.
-- No public-read policy: tutor datasets stay private until the
-- student runner introduces enrolment-scoped visibility (future
-- slice).
-- Added 2026-04-24 in Slice 1.12a.
-- ─────────────────────────────────────────────────────────

ALTER TABLE nclex_tutor_trend_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_tutor_trend_datasets_tutor_own ON nclex_tutor_trend_datasets FOR ALL
  TO authenticated
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_trend_datasets_superadmin ON nclex_tutor_trend_datasets FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- ─────────────────────────────────────────────────────────
-- nclex_trend_tabs + nclex_tutor_trend_tabs
-- Trend chart tabs (rich multi-chart, Slice 1). Mirror of
-- nclex_case_study_tabs / nclex_tutor_case_study_tabs.
-- Admin: any authenticated user reads tabs whose parent dataset is
--   published; BANK_CURATE holders (SUPER_ADMIN via the helper
--   short-circuit) get full CRUD.
-- Tutor: only the owning tutor of the parent dataset, plus a
--   SUPER_ADMIN bypass. No public-read policy.
-- Added 2026-07-12 in the trend multi-chart Slice 1.
-- ─────────────────────────────────────────────────────────

ALTER TABLE nclex_trend_tabs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_tutor_trend_tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_trend_tabs_read_published ON nclex_trend_tabs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_trend_datasets td
      WHERE td.trend_id = nclex_trend_tabs.trend_id
        AND td.is_published = TRUE
    )
  );

CREATE POLICY nclex_trend_tabs_curate_all ON nclex_trend_tabs FOR ALL
  TO authenticated
  USING (nclex_user_has_permission('BANK_CURATE'))
  WITH CHECK (nclex_user_has_permission('BANK_CURATE'));

CREATE POLICY nclex_tutor_trend_tabs_tutor_own ON nclex_tutor_trend_tabs FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_tutor_trend_datasets td
      WHERE td.trend_id = nclex_tutor_trend_tabs.trend_id
        AND td.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_tutor_trend_datasets td
      WHERE td.trend_id = nclex_tutor_trend_tabs.trend_id
        AND td.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_tutor_trend_tabs_superadmin ON nclex_tutor_trend_tabs FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- ─────────────────────────────────────────────────────────
-- Slice 1.12b (2026-04-24) — trend-linked bank items
-- Added nullable trend_id FK on nclex_bank_items and
-- nclex_tutor_questions. No new RLS policies: the existing
-- bank-item and tutor-question policies apply to trend-linked
-- rows the same way they apply to standalone rows. This
-- comment block exists to keep the audit trail complete.
-- ─────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────
-- Slice 2.1 (2026-05-05) — Attempt tables
-- Five new tables: nclex_attempts, nclex_attempt_items,
-- nclex_attempt_answers, nclex_attempt_case_snapshots,
-- nclex_attempt_trend_snapshots.
-- Conservative shape: students SELECT own rows; SUPER_ADMIN
-- has FOR ALL. No student INSERT/UPDATE/DELETE policies in
-- this slice — write paths land with the create_attempt RPC
-- (SECURITY DEFINER) in slice 2.2, bypassing RLS.
-- Snapshot tables (items, case_snaps, trend_snaps) inherit
-- ownership via EXISTS-on-parent-attempt, same pattern
-- nclex_case_study_tabs uses against nclex_case_studies.
-- attempt_answers has student_id denormalised for fast
-- direct check (used heavily by analytics).
-- No tutor read policy yet — tutors getting visibility into
-- their student's attempts lands with programme assignments
-- (later slice).
-- ─────────────────────────────────────────────────────────

ALTER TABLE nclex_attempts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_attempt_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_attempt_answers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_attempt_case_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_attempt_trend_snapshots  ENABLE ROW LEVEL SECURITY;


-- nclex_attempts: students see own; SUPER_ADMIN sees all
CREATE POLICY nclex_attempts_self_read ON nclex_attempts FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY nclex_attempts_admin_all ON nclex_attempts FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- nclex_attempt_items: visible if the parent attempt is visible
CREATE POLICY nclex_attempt_items_via_attempt ON nclex_attempt_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_attempts a
      WHERE a.attempt_id = nclex_attempt_items.attempt_id
        AND a.student_id = auth.uid()
    )
  );

CREATE POLICY nclex_attempt_items_admin_all ON nclex_attempt_items FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- nclex_attempt_answers: student_id denormalised for fast direct check
CREATE POLICY nclex_attempt_answers_self_read ON nclex_attempt_answers FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY nclex_attempt_answers_admin_all ON nclex_attempt_answers FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- nclex_attempt_case_snapshots: via parent attempt
CREATE POLICY nclex_attempt_case_snapshots_via_attempt ON nclex_attempt_case_snapshots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_attempts a
      WHERE a.attempt_id = nclex_attempt_case_snapshots.attempt_id
        AND a.student_id = auth.uid()
    )
  );

CREATE POLICY nclex_attempt_case_snapshots_admin_all ON nclex_attempt_case_snapshots FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- nclex_attempt_trend_snapshots: via parent attempt
CREATE POLICY nclex_attempt_trend_snapshots_via_attempt ON nclex_attempt_trend_snapshots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_attempts a
      WHERE a.attempt_id = nclex_attempt_trend_snapshots.attempt_id
        AND a.student_id = auth.uid()
    )
  );

CREATE POLICY nclex_attempt_trend_snapshots_admin_all ON nclex_attempt_trend_snapshots FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- nclex_programmes (Slice 9.1a, 2026-05-10)
-- =========================================================
-- Tutor owns own programmes; SUPER_ADMIN bypass.
-- UPDATE / DELETE / public-select policies deferred to the slices
-- that need them (edit, discard/archive, public discovery).

ALTER TABLE nclex_programmes ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_programmes_self_select ON nclex_programmes FOR SELECT
  TO authenticated
  USING (tutor_id = auth.uid());

CREATE POLICY nclex_programmes_self_insert ON nclex_programmes FOR INSERT
  TO authenticated
  WITH CHECK (tutor_id = auth.uid());

-- Slice 9.1c: tutor edits own programmes. WITH CHECK prevents
-- reassigning tutor_id to a different tutor via UPDATE.
CREATE POLICY nclex_programmes_self_update ON nclex_programmes FOR UPDATE
  TO authenticated
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY nclex_programmes_admin_all ON nclex_programmes FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));

-- Slice 10.1 → tightened in the access-gating step (2026-05-20):
-- metadata tier. A student SELECTs a programme iff they hold ANY
-- enrolment row for it (active or terminal). Drops the old
-- status='PUBLISHED' gate on purpose — the access window keeps an
-- already-enrolled student's access alive after the programme is
-- ARCHIVED, and you can't hold an enrolment in a never-published
-- programme. Public discovery of PUBLISHED-but-not-enrolled
-- programmes is a separate surface (Slice 3).
CREATE POLICY nclex_programmes_student_select ON nclex_programmes FOR SELECT
  TO authenticated
  USING (nclex_has_programme_enrolment(programme_id));

-- NOTE (Slice 3b): public discovery does NOT read the base table. It
-- reads the nclex_public_programmes view (see "PUBLIC VIEWS" below),
-- which exposes a curated projection with owner rights. The short-lived
-- 3a base-table public-read policy + its nclex_user_is_active helper
-- were dropped once the view became the single public path.


-- =========================================================
-- nclex_cohorts (Slice 9.2a, 2026-05-12)
-- =========================================================
-- Tutor owns cohorts via the parent programme's tutor_id. The
-- ownership EXISTS subquery is the same on USING and WITH CHECK so
-- a tutor can't reassign a cohort to another tutor's programme.
-- SUPER_ADMIN bypass mirrors the programmes pattern.
-- Public-select deferred until public cohort discovery ships.

ALTER TABLE nclex_cohorts ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_cohorts_self_select ON nclex_cohorts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_cohorts.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohorts_self_insert ON nclex_cohorts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_cohorts.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohorts_self_update ON nclex_cohorts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_cohorts.programme_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_cohorts.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohorts_admin_all ON nclex_cohorts FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));

-- Slice 10.1 → tightened in the access-gating step (2026-05-20):
-- metadata tier. A student SELECTs a cohort iff they hold ANY
-- enrolment row in THAT cohort (active or terminal) — so the switcher
-- lists only the cohort they enrolled in, never sibling cohorts, and
-- still shows it after a terminal status (with its pill).
CREATE POLICY nclex_cohorts_student_select ON nclex_cohorts FOR SELECT
  TO authenticated
  USING (nclex_has_cohort_enrolment(cohort_id));


-- =========================================================
-- nclex_question_marks (Slice 2.1.5, 2026-05-06)
-- =========================================================
-- Student owns their own marks; SUPER_ADMIN bypass. Direct
-- INSERT / DELETE allowed (no RPC) — the toggle is a single-row
-- write whose authorisation reduces to "is this row mine?".
-- UPDATE not granted: no editable column exists.

ALTER TABLE nclex_question_marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_question_marks_self_select ON nclex_question_marks FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY nclex_question_marks_self_insert ON nclex_question_marks FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY nclex_question_marks_self_delete ON nclex_question_marks FOR DELETE
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY nclex_question_marks_admin_all ON nclex_question_marks FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- nclex_programme_units (Slice 9.3a, 2026-05-12;
-- student_select added Slice 10.1, 2026-05-15)
-- =========================================================
-- Tutor CRUDs curriculum for programmes they own (ownership via
-- the programme FK). SUPER_ADMIN bypass. The student_select policy
-- exposes units under a PUBLISHED programme to any authenticated
-- user — permissive v1 shape; tightens to "active enrolment" when
-- the enrolment slice ships. Per-row is_published stays a TS render
-- filter, not an RLS gate.

ALTER TABLE nclex_programme_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_programme_units_self_select
  ON nclex_programme_units FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_units.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_units_self_insert
  ON nclex_programme_units FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_units.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_units_self_update
  ON nclex_programme_units FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_units.programme_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_units.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_units_self_delete
  ON nclex_programme_units FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_units.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_units_admin_all
  ON nclex_programme_units FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));

-- Access-gating step (2026-05-20): content tier — was PUBLISHED-parent,
-- now requires an ACTIVE (ENROLLED) programme enrolment. Curriculum is
-- programme-shared; a tutor-led student's cohort row carries
-- programme_id, so this covers both delivery modes.
CREATE POLICY nclex_programme_units_student_select
  ON nclex_programme_units FOR SELECT
  TO authenticated
  USING (nclex_has_active_programme_enrolment(programme_id));


-- =========================================================
-- nclex_programme_blocks (Slice 9.3a, 2026-05-12;
-- student_select added Slice 10.1, 2026-05-15)
-- =========================================================
-- Ownership traces block -> unit -> programme.tutor_id.

ALTER TABLE nclex_programme_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_programme_blocks_self_select
  ON nclex_programme_blocks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_blocks.unit_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_blocks_self_insert
  ON nclex_programme_blocks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_blocks.unit_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_blocks_self_update
  ON nclex_programme_blocks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_blocks.unit_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_blocks.unit_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_blocks_self_delete
  ON nclex_programme_blocks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_blocks.unit_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_blocks_admin_all
  ON nclex_programme_blocks FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));

-- Access-gating step (2026-05-20): content tier — active programme
-- enrolment via the parent unit.
CREATE POLICY nclex_programme_blocks_student_select
  ON nclex_programme_blocks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programme_units u
      WHERE u.unit_id = nclex_programme_blocks.unit_id
        AND nclex_has_active_programme_enrolment(u.programme_id)
    )
  );


-- =========================================================
-- nclex_programme_activities (Slice 9.3a, 2026-05-12;
-- student_select added Slice 10.1, 2026-05-15)
-- =========================================================
-- Ownership traces activity -> unit -> programme.tutor_id (via
-- unit_id — loose activities still carry a unit).

ALTER TABLE nclex_programme_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_programme_activities_self_select
  ON nclex_programme_activities FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_activities.unit_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_activities_self_insert
  ON nclex_programme_activities FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_activities.unit_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_activities_self_update
  ON nclex_programme_activities FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_activities.unit_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_activities.unit_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_activities_self_delete
  ON nclex_programme_activities FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_activities.unit_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_activities_admin_all
  ON nclex_programme_activities FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));

-- Access-gating step (2026-05-20): content tier — active programme
-- enrolment via the parent unit.
CREATE POLICY nclex_programme_activities_student_select
  ON nclex_programme_activities FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programme_units u
      WHERE u.unit_id = nclex_programme_activities.unit_id
        AND nclex_has_active_programme_enrolment(u.programme_id)
    )
  );


-- =========================================================
-- nclex_cohort_checklist_items (Slice 9.3f, 2026-05-14;
-- student_select added Slice 10.1, 2026-05-15)
-- =========================================================
-- Ownership chain: checklist_item -> cohort -> programme.tutor_id
-- (two-hop join). SUPER_ADMIN bypass. The student_select policy
-- exposes rows under a PUBLISHED programme; is_included and the
-- activity-window dates stay TS render filters, not RLS gates.

ALTER TABLE nclex_cohort_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_cohort_checklist_items_self_select
  ON nclex_cohort_checklist_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_checklist_items.cohort_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_checklist_items_self_insert
  ON nclex_cohort_checklist_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_checklist_items.cohort_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_checklist_items_self_update
  ON nclex_cohort_checklist_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_checklist_items.cohort_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_checklist_items.cohort_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_checklist_items_self_delete
  ON nclex_cohort_checklist_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_checklist_items.cohort_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_checklist_items_admin_all
  ON nclex_cohort_checklist_items FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));

-- Access-gating step (2026-05-20): content tier — the checklist is
-- cohort-specific, so it requires an ACTIVE enrolment in THIS cohort.
CREATE POLICY nclex_cohort_checklist_items_student_select
  ON nclex_cohort_checklist_items FOR SELECT
  TO authenticated
  USING (nclex_has_active_cohort_enrolment(cohort_id));


-- =========================================================
-- nclex_cohort_live_sessions (Live sessions Slice 1b, 2026-06-15)
-- =========================================================
-- Tutor side: ownership chain schedule -> cohort -> programme -> tutor
-- (mirrors nclex_cohort_checklist_items). Student side: an ACTIVELY
-- enrolled student of the cohort may read its schedules (the student
-- viewer reads them). SUPER_ADMIN bypass. Origin migration:
-- db/migrations/20260703120000_live_session_marker_planner.sql.

ALTER TABLE nclex_cohort_live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_cohort_live_sessions_self_select
  ON nclex_cohort_live_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_live_sessions.cohort_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_live_sessions_self_insert
  ON nclex_cohort_live_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_live_sessions.cohort_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_live_sessions_self_update
  ON nclex_cohort_live_sessions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_live_sessions.cohort_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_live_sessions.cohort_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_live_sessions_self_delete
  ON nclex_cohort_live_sessions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_live_sessions.cohort_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_live_sessions_student_select
  ON nclex_cohort_live_sessions FOR SELECT
  TO authenticated
  USING (nclex_has_active_cohort_enrolment(cohort_id));

CREATE POLICY nclex_cohort_live_sessions_admin_all
  ON nclex_cohort_live_sessions FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- nclex_cohort_session_attendance (Live sessions Slice 3, 2026-06-16)
-- =========================================================
-- Tutor: full CRUD on registers for sessions in their own programmes
-- (chain attendance -> session -> cohort -> programme -> tutor). Student:
-- read OWN rows only (the student Sessions page shows a student their own
-- attendance record). SUPER_ADMIN bypass. Origin migration:
-- db/migrations/20260704120000_live_session_attendance.sql.

ALTER TABLE nclex_cohort_session_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_cohort_session_attendance_tutor_all
  ON nclex_cohort_session_attendance FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_cohort_live_sessions s
      JOIN nclex_cohorts c ON c.cohort_id = s.cohort_id
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE s.session_id = nclex_cohort_session_attendance.session_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nclex_cohort_live_sessions s
      JOIN nclex_cohorts c ON c.cohort_id = s.cohort_id
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE s.session_id = nclex_cohort_session_attendance.session_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_session_attendance_student_select
  ON nclex_cohort_session_attendance FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY nclex_cohort_session_attendance_admin_all
  ON nclex_cohort_session_attendance FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- nclex_media_assets (Slice 9.3d-b, 2026-05-13)
-- =========================================================
-- Narrow, owner-based gates. Cross-feature read access (an
-- enrolled student viewing a tutor's PDF) does NOT live here —
-- it's enforced at the consumer's RLS and bridged by a
-- service-role-minted signed URL.

ALTER TABLE nclex_media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_media_assets_owner_select
  ON nclex_media_assets FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR nclex_user_has_role('SUPER_ADMIN')
  );

CREATE POLICY nclex_media_assets_self_insert
  ON nclex_media_assets FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND owner_user_id = auth.uid()
  );

CREATE POLICY nclex_media_assets_owner_update
  ON nclex_media_assets FOR UPDATE
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR nclex_user_has_role('SUPER_ADMIN')
  )
  WITH CHECK (
    owner_user_id = auth.uid()
    OR nclex_user_has_role('SUPER_ADMIN')
  );

CREATE POLICY nclex_media_assets_owner_delete
  ON nclex_media_assets FOR DELETE
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR nclex_user_has_role('SUPER_ADMIN')
  );


-- =========================================================
-- storage.objects — nclex-pdf-activities bucket (Slice 9.3d-b)
-- =========================================================
-- Authenticated users can INSERT (upload) to this bucket; the
-- app-layer uploadAssetAction does the additional gating. No
-- SELECT / UPDATE / DELETE policies — the legitimate read path is
-- a service-role-minted signed URL (1-hour expiry), which bypasses
-- storage.objects RLS by design. storage.objects already has RLS
-- enabled by the Supabase platform default.

CREATE POLICY nclex_pdf_activities_upload
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nclex-pdf-activities');


-- =========================================================
-- storage.objects — the later media buckets
-- =========================================================
-- Same shape as nclex-pdf-activities: INSERT-only for authenticated,
-- reads via service-role signed URLs. The library pair shipped in
-- slices 11.6a/11.6b (2026-06) but was never mirrored here —
-- backfilled 2026-07-03 alongside the bank-images policy
-- (rich-content Slice 7, migration 20260716120000).

CREATE POLICY nclex_library_images_upload
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nclex-library-images');

CREATE POLICY nclex_library_pdfs_upload
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nclex-library-pdfs');

CREATE POLICY nclex_bank_images_upload
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nclex-bank-images');


-- =========================================================
-- nclex_tutor_quizzes (Tutor Quiz Slice 1, 2026-05-16)
-- =========================================================
-- Tutor-owned, following the nclex_tutor_questions pattern:
-- one FOR ALL "own" policy (direct tutor_id) + one FOR ALL
-- SUPER_ADMIN bypass. Students never SELECT this table directly —
-- the student read path is the SECURITY DEFINER launch RPC
-- (tutor-quiz slice 3).

ALTER TABLE nclex_tutor_quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_tutor_quizzes_tutor_own
  ON nclex_tutor_quizzes FOR ALL
  TO authenticated
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_quizzes_superadmin
  ON nclex_tutor_quizzes FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- nclex_tutor_quiz_items (Tutor Quiz Slice 1, 2026-05-16)
-- =========================================================
-- Ownership traces through the parent quiz (the row has no
-- tutor_id column). Same FOR ALL "own" + SUPER_ADMIN bypass shape.

ALTER TABLE nclex_tutor_quiz_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_tutor_quiz_items_tutor_own
  ON nclex_tutor_quiz_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_tutor_quizzes q
      WHERE q.quiz_id = nclex_tutor_quiz_items.quiz_id
        AND q.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_tutor_quizzes q
      WHERE q.quiz_id = nclex_tutor_quiz_items.quiz_id
        AND q.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_tutor_quiz_items_superadmin
  ON nclex_tutor_quiz_items FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- ---------- nclex_tutor_quizzes: student-read (Slice 5, 2026-05-19) ----------
-- Added by Tutor Quiz Slice 5 so the Slice 6 student Quizzes page
-- can read quiz metadata (title, kind, mode, pass_score,
-- max_attempts) directly from this table. Readable when the quiz
-- itself is PUBLISHED AND it's attached (via the junction) to a
-- PUBLISHED programme. Permissive v1; tightens to enrolment-aware
-- when the enrolment slice lands.

-- Access-gating step (2026-05-20): content tier. Quiz still must be
-- PUBLISHED, but the attachment must be to a programme the student is
-- ACTIVELY enrolled in (was: any PUBLISHED programme).
CREATE POLICY nclex_tutor_quizzes_student_select
  ON nclex_tutor_quizzes FOR SELECT
  TO authenticated
  USING (
    status = 'PUBLISHED'
    AND EXISTS (
      SELECT 1 FROM nclex_programme_quizzes pq
      WHERE pq.quiz_id = nclex_tutor_quizzes.quiz_id
        AND nclex_has_active_programme_enrolment(pq.programme_id)
    )
  );


-- =========================================================
-- nclex_programme_quizzes (Tutor Quiz Slice 5, 2026-05-19)
-- =========================================================
-- Tutor own: walks the parent programme's tutor_id (the junction
-- row has no tutor_id — ownership is through the programme).
-- SUPER_ADMIN bypass mirrors the established v1 pattern.
-- Student select: PUBLISHED-parent-only — permissive v1, tightens
-- to enrolment-aware when the enrolment slice ships.

ALTER TABLE nclex_programme_quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_programme_quizzes_tutor_own
  ON nclex_programme_quizzes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_quizzes.programme_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_quizzes.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_quizzes_superadmin
  ON nclex_programme_quizzes FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));

-- Access-gating step (2026-05-20): content tier — active programme
-- enrolment (was: PUBLISHED parent).
CREATE POLICY nclex_programme_quizzes_student_select
  ON nclex_programme_quizzes FOR SELECT
  TO authenticated
  USING (nclex_has_active_programme_enrolment(programme_id));


-- =========================================================
-- nclex_student_activity_progress (Progress engine Slice 1, 2026-05-18)
-- =========================================================
-- Students own their own progress rows (FOR ALL, scoped to
-- student_id = auth.uid()). Tutors read progress for activities in
-- their own programmes (FOR SELECT, joined through unit ->
-- programme). SUPER_ADMIN bypass for FOR ALL — same intentional v1
-- pattern as other tutor-side tables.

ALTER TABLE nclex_student_activity_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_student_activity_progress_student_own
  ON nclex_student_activity_progress FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY nclex_student_activity_progress_tutor_read
  ON nclex_student_activity_progress FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_activities pa
      JOIN nclex_programme_units pu ON pu.unit_id = pa.unit_id
      JOIN nclex_programmes p ON p.programme_id = pu.programme_id
      WHERE pa.activity_id = nclex_student_activity_progress.activity_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_student_activity_progress_superadmin
  ON nclex_student_activity_progress FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- nclex_enrolments (Slice 1a, 2026-05-20)
-- =========================================================
-- Read: enrolled student (own rows), owning tutor (walks the parent
-- programme tutor_id), SUPER_ADMIN. Write: owning tutor (insert +
-- status flips) + SUPER_ADMIN; no tutor DELETE (terminal state is
-- CANCELLED, not row removal). The off-platform tutor-add action also
-- uses the service role (invite + invited-student profile write),
-- which bypasses RLS by design and validates tutor ownership in TS.
--
-- The student-select policies on nclex_cohorts / nclex_programme_* were
-- tightened to enrolment-aware in the access-gating step (migration
-- 20260526120000_enrolments_access_gating.sql): metadata tier (any
-- enrolment) for programmes + cohorts, content tier (ENROLLED) for
-- units/blocks/activities/checklist/quizzes, via the
-- nclex_has[_active]_programme/cohort_enrolment helpers above.

ALTER TABLE nclex_enrolments ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_enrolments_student_select
  ON nclex_enrolments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY nclex_enrolments_tutor_select
  ON nclex_enrolments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_enrolments.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_enrolments_tutor_insert
  ON nclex_enrolments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_enrolments.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

-- No tutor UPDATE policy: status transitions are RPC-gated (Slice 2a).
-- The Slice 1a direct tutor UPDATE policy was dropped in migration
-- 20260524120000_enrolments_2a_transitions.sql — tutors change status
-- only through the SECURITY DEFINER transition functions
-- (nclex_approve/reject/pause/unpause/cancel_enrolment), which validate
-- ownership + the legal source status in one auditable place.

CREATE POLICY nclex_enrolments_admin_all
  ON nclex_enrolments FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- ─────────────────────────────────────────────────────────
-- PUBLIC VIEWS (Slice 3b)
-- The single public read path for programme data. Owner-rights views
-- (security_invoker = false, default) expose a curated projection to
-- anon WITHOUT opening the base tables, whose RLS stays
-- authenticated-only. Every public page reads from these and takes the
-- columns it needs — the "what's public" rule lives here, once.
-- ─────────────────────────────────────────────────────────

-- One row per publicly-visible programme: programme public fields + the
-- tutor's PUBLIC profile (name + avatar only) + a cohort rollup + a
-- derived headline price. Gate: PUBLISHED + active tutor. The open-cohort
-- discovery rule is a LIST filter on open_cohort_count, applied by the
-- page — NOT baked in here, so the detail page can read a published-but-
-- cohortless programme.
--
-- headline_price_minor (slice 7e) — derived since price_minor was retired
-- on the base table:
--   • active UPFRONT_FULL plan's total_price_minor when offered,
--   • else the cheapest first payment across other active plans,
--   • else 0 ("Contact for price" / disabled Enrol).
-- headline_is_upfront flags which case fired so the discovery card can
-- prefix "from " when the headline is a first payment, not a full price.
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
  -- slice 3.5; MOVED off nclex_users to nclex_tutors in tutor-onboarding
  -- slice 1a (20260913120000). LEFT JOIN + COALESCE below: a programme
  -- whose tutor somehow has no tutor row must still appear in the
  -- catalogue with an empty profile. An inner join would let a missing
  -- row silently unpublish someone's programme.
  COALESCE(t.public_profile, '{}'::jsonb) AS tutor_profile,
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

-- Published units of a public programme (Slice 3c). Draft units stay
-- hidden. Feeds the detail page's "Syllabus" section.
CREATE OR REPLACE VIEW nclex_public_units AS
SELECT
  pu.programme_id,
  pu.unit_index,
  pu.title,
  pu.description
FROM nclex_programme_units pu
JOIN nclex_programmes p ON p.programme_id = pu.programme_id
JOIN nclex_users u      ON u.id = p.tutor_id
WHERE p.status = 'PUBLISHED'
  AND u.is_active
  AND pu.is_published;

GRANT SELECT ON nclex_public_units TO anon, authenticated;

-- Non-cancelled cohorts of a public programme (Slice 3c). Feeds the
-- detail page's "Available cohorts" section; status is derived in TS.
CREATE OR REPLACE VIEW nclex_public_cohorts AS
SELECT
  c.cohort_id,
  c.programme_id,
  c.name,
  c.start_date,
  c.end_date,
  c.allow_late_join
FROM nclex_cohorts c
JOIN nclex_programmes p ON p.programme_id = c.programme_id
JOIN nclex_users u      ON u.id = p.tutor_id
WHERE p.status = 'PUBLISHED'
  AND u.is_active
  AND c.cancelled_at IS NULL;

GRANT SELECT ON nclex_public_cohorts TO anon, authenticated;


-- ============================================================
-- PAYMENTS (Slice 5.1) — config / products / payments / subscriptions
-- Migration: db/migrations/20260601120000_slice_5_1_payments_schema.sql
-- ============================================================

-- nclex_config — read PUBLIC (the bank-opt-in discount is shown on the
-- guest-accessible checkout); write SUPER_ADMIN only.
ALTER TABLE nclex_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_config_public_select
  ON nclex_config FOR SELECT
  USING (true);

CREATE POLICY nclex_config_admin_write
  ON nclex_config FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- nclex_products — public reads ACTIVE SKUs (landing + checkout);
-- SUPER_ADMIN manages (and can read ARCHIVED for historical payments).
-- 20260723120000: PAYMENTS_MANAGE holders also manage — the Products
-- & Pricing admin surface gates on that permission (layered rule).
ALTER TABLE nclex_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_products_public_select
  ON nclex_products FOR SELECT
  USING (status = 'ACTIVE');

CREATE POLICY nclex_products_admin_all
  ON nclex_products FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));

CREATE POLICY nclex_products_payments_manage_all
  ON nclex_products FOR ALL
  TO authenticated
  USING (nclex_user_has_permission('PAYMENTS_MANAGE'))
  WITH CHECK (nclex_user_has_permission('PAYMENTS_MANAGE'));


-- nclex_payments — owner reads own rows; SUPER_ADMIN reads all. No
-- authenticated WRITE policy: writes happen only via the service-role
-- checkout handlers (5.2/5.3), which bypass RLS.
ALTER TABLE nclex_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_payments_owner_select
  ON nclex_payments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'));


-- nclex_subscriptions — owner reads own; SUPER_ADMIN reads/manages
-- (manual grants). Service-role handlers do the routine writes.
ALTER TABLE nclex_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_subscriptions_owner_select
  ON nclex_subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'));

CREATE POLICY nclex_subscriptions_admin_all
  ON nclex_subscriptions FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- nclex_programme_payment_strategies (Payments Slice 7a, 2026-05-22)
-- =========================================================
-- Read + write: the owning tutor (walks the parent programme's tutor_id);
-- SUPER_ADMIN bypass. Direct tutor RLS writes (not RPC-gated) — strategies
-- are tutor-owned config like programmes/cohorts themselves. NO public
-- base-table policy: public checkout / discovery read a curated view
-- (added in 7c/7e), matching the nclex_public_programmes pattern (3b).
ALTER TABLE nclex_programme_payment_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_pps_tutor_all
  ON nclex_programme_payment_strategies FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_payment_strategies.programme_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_payment_strategies.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_pps_admin_all
  ON nclex_programme_payment_strategies FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- ============================================================
-- READINESS PACKS (Slice 1) — pack + membership link table
-- Migration: db/migrations/20260721120000_readiness_pack_link_table.sql
-- ============================================================

-- nclex_readiness_packs — ANYONE (incl. anon) reads PUBLISHED + active
-- packs; BANK_CURATE (SUPER_ADMIN via the helper) reads drafts + writes.
-- RLS was entirely OFF on this table before Slice ①.
-- 20260726120000: the read widened from `TO authenticated` to the public
-- role — the public /readiness page lists each published pack's title,
-- description, question count and time limit to logged-out visitors,
-- exactly as /bank-access prices itself from nclex_products. Membership
-- (nclex_readiness_pack_items) stays curator-only, so no question leaks.
ALTER TABLE nclex_readiness_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_readiness_packs_public_select ON nclex_readiness_packs FOR SELECT
  USING (published = TRUE AND status = 'active');

CREATE POLICY nclex_readiness_packs_curate_all ON nclex_readiness_packs FOR ALL
  TO authenticated
  USING (nclex_user_has_permission('BANK_CURATE'))
  WITH CHECK (nclex_user_has_permission('BANK_CURATE'));

-- nclex_readiness_pack_items — curator-only. Students never read pack
-- membership live: a sitting reads the attempt's frozen rows. Widen
-- deliberately at the student slices if a real need appears.
ALTER TABLE nclex_readiness_pack_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_readiness_pack_items_curate_all ON nclex_readiness_pack_items FOR ALL
  TO authenticated
  USING (nclex_user_has_permission('BANK_CURATE'))
  WITH CHECK (nclex_user_has_permission('BANK_CURATE'));


-- ============================================================
-- nclex_auth_events — the auth logbook (build-order item 2, slice 2a)
-- Migration: db/migrations/20260904120000_auth_events.sql
-- ============================================================

-- ⭐ THE ABSENT POLICIES ARE THE DESIGN. One SELECT policy and nothing
-- else: no INSERT, no UPDATE, no DELETE, for anybody. With RLS enabled an
-- operation with no policy is denied, so "append-only — no row is ever
-- updated" is something the database refuses rather than something every
-- future call site has to remember.
--
-- Writes come through createServiceRoleClient(), which bypasses RLS. That
-- is required, not a workaround: the most important row here is a FAILED
-- login, and a failed login has no session — auth.uid() is NULL, so no
-- policy we could express would ever let it be written.
--
-- Retention deletes run through nclex_purge_auth_events(), SECURITY
-- DEFINER, nightly on pg_cron. Removing whole rows on age is not a breach
-- of append-only, which is about an event's record never being revised.
ALTER TABLE nclex_auth_events ENABLE ROW LEVEL SECURITY;

-- USERS_MANAGE rather than a bare SUPER_ADMIN check — the helper already
-- returns true for SUPER_ADMIN, and this is the bucket the future
-- "account activity" panel on admin user detail will sit behind.
--
-- A student cannot read her own rows, deliberately: handing her the log
-- would hand an attacker who got in once the list of every address and
-- device that had tried. The support answer is given BY support.
CREATE POLICY nclex_auth_events_admin_read ON nclex_auth_events FOR SELECT
  TO authenticated
  USING (nclex_user_has_permission('USERS_MANAGE'));


-- nclex_email_outbox — admins read; nobody writes through RLS.
-- ⭐ THE ABSENT POLICIES ARE THE DESIGN, as on nclex_auth_events. One
-- SELECT policy and nothing else: with RLS on, an operation with no
-- policy is denied, so "the browser cannot queue an email" is refused by
-- the database rather than remembered by every future call site.
--
-- Writes go through createServiceRoleClient(). Required, not a
-- workaround: the most important row here is the receipt for a pay-first
-- buyer, who has no session and no profile — auth.uid() is NULL, so no
-- policy we could express would ever admit her row.
--
-- COMMS_MANAGE rather than a bare SUPER_ADMIN check (the helper already
-- returns true for SUPER_ADMIN); it is the bucket that already gates
-- /admin/announcements. A student cannot read her own rows: the payload
-- carries frozen money facts and the failure reasons are operational.
ALTER TABLE nclex_email_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_email_outbox_admin_read ON nclex_email_outbox FOR SELECT
  TO authenticated
  USING (nclex_user_has_permission('COMMS_MANAGE'));
