-- =========================================================
-- MyNclex — Slice 1.11b: RLS for case-study join tables
-- File: mynclex/db/migrations/mynclex_case_study_items_rls_slice_1_11b.sql
-- Depends on: mynclex_case_save_rpc_slice_1_11b.sql (RPC in place)
-- =========================================================
-- `nclex_case_study_items` and `nclex_tutor_case_study_items` existed
-- as empty placeholder tables before Slice 1.11b with RLS disabled.
-- Slice 1.11b starts writing to them via the save RPC, so this
-- migration turns RLS on and adds policies that mirror the 1.11a
-- pattern for case studies + tabs.
--
-- Admin join table (nclex_case_study_items):
--   * Read: any authenticated user, as long as the parent case is
--     published. (Students will need this once the runner ships.)
--   * Write: BANK_CURATE permission holders — the helper
--     short-circuits SUPER_ADMIN so no separate policy for that.
--
-- Tutor join table (nclex_tutor_case_study_items):
--   * Full CRUD: the tutor who owns the parent case
--     (tutor_id = auth.uid() via an EXISTS on the parent).
--   * SUPER_ADMIN bypass for moderation.
--   * No public read — tutor content stays private until the runner
--     introduces enrolment-scoped visibility.
-- =========================================================

ALTER TABLE nclex_case_study_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_tutor_case_study_items ENABLE ROW LEVEL SECURITY;

-- Admin join: published-case read-through.
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

-- Tutor join: owner-scoped access via parent case.
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
