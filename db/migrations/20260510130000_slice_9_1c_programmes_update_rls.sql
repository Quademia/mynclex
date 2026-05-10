-- =========================================================
-- MyNclex — Slice 9.1c: nclex_programmes UPDATE RLS
-- File: mynclex/db/migrations/20260510130000_slice_9_1c_programmes_update_rls.sql
-- =========================================================
-- Adds the UPDATE policy so tutors can edit their own programmes.
-- INSERT and SELECT policies were applied in slice 9.1a.
--
-- Decisions:
--   • Mirrors the SELECT/INSERT pattern: tutor_id = auth.uid() on
--     both USING (existing-row check) and WITH CHECK (post-update
--     check). The WITH CHECK prevents a tutor from reassigning a
--     programme to a different tutor via UPDATE.
--   • No status guard — tutors can edit DRAFT, PUBLISHED, or
--     ARCHIVED programmes. PUBLISHED edits propagate live, matching
--     the bank's edit-anytime convention; revision-control is a v2+
--     concern.
--   • SUPER_ADMIN bypass already covers admin edits via the
--     existing nclex_programmes_admin_all policy.
--
-- Additive-only — new policy on existing table.

CREATE POLICY nclex_programmes_self_update ON nclex_programmes FOR UPDATE
  TO authenticated
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());
