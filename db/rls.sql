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
