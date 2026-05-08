-- =========================================================
-- MyNclex — Slice 2.1.5: Mark-for-review table
-- File: mynclex/db/migrations/20260506140000_slice_2_1_5_question_marks.sql
-- =========================================================
-- One row per (student, target). Drives the runner's mark-for-review
-- toggle and the builder's "Marked" pool filter (parent §10, §17).
-- Marking is the student's own state, independent of correct/incorrect,
-- and persists across attempts — so it lives in its own table rather
-- than denormalising onto nclex_attempt_answers.
--
-- Source of truth for shape + semantics:
--   docs/product-plan/bank-consumption.html §10 (line 228 — case + child
--                                                marking work independently)
--   docs/product-plan/bank-consumption-attempt-creation.html §6.3.4 + §7
--                                                (marking lives on its own table)
--   docs/product-plan/bank-consumption-runner.html §14 (skeleton)
--
-- Decisions locked for this slice (planning conversation 2026-05-06):
--   • Two target kinds: 'QUESTION' and 'CASE'. Trend questions are marked
--     at the QUESTION level. 'TREND' as a separate kind deferred — there's
--     no use case for "bookmark this trend dataset" independent of any
--     trend question, since trend datasets aren't standalone scenarios
--     with multiple children the way cases are.
--   • Single polymorphic table (mirrors the QUESTION/CASE pattern already
--     used by nclex_attempt_items.selection_unit_type). Avoids a UNION in
--     the builder pool-filter query.
--   • Row-exists toggle semantics. Mark on = INSERT, mark off = DELETE.
--     No is_marked boolean, no audit history. If a future analytic needs
--     mark history, add a separate audit table — don't bend this one.
--   • Bank + tutor in the same table, distinguished by target_source +
--     tutor_id. Marking is the student's, not the tutor's — same shape
--     regardless of source.
--   • Synthetic UUID PK + partial unique indexes for the actual
--     uniqueness invariant. PG treats NULL as distinct in unique
--     constraints, so a single combined unique constraint on
--     (..., tutor_id) would let the same bank item be marked twice
--     (both rows with tutor_id NULL). Two partial indexes — one for
--     BANK, one for TUTOR — cleanly side-step that.
--   • No FK on target_id (polymorphic across 4 source tables — bank
--     items, case studies, tutor questions, tutor case studies). Mirrors
--     the attempt-items convention. Orphan cleanup, if ever needed,
--     piggybacks on the planned nclex_orphan_cleanup sweep (slice 2.4).
--   • Direct student writes (no RPC). The runner's mark-for-review
--     toggle writes immediately on click — RLS enforces "own rows only."
--
-- Additive-only — new table, no changes to existing tables.


-- =========================================================
-- 1. nclex_question_marks
-- =========================================================
CREATE TABLE nclex_question_marks (
  mark_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,

  -- Target reference (polymorphic — no FK on target_id, see header)
  target_kind    TEXT NOT NULL CHECK (target_kind IN ('QUESTION','CASE')),
  target_source  TEXT NOT NULL CHECK (target_source IN ('BANK','TUTOR')),
  target_id      TEXT NOT NULL,
  tutor_id       UUID REFERENCES nclex_users(id) ON DELETE CASCADE,

  marked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Tutor sourcing requires tutor_id; bank sourcing leaves it null
  CONSTRAINT nclex_question_marks_tutor_id_consistent CHECK (
    (target_source = 'BANK'  AND tutor_id IS NULL)
    OR (target_source = 'TUTOR' AND tutor_id IS NOT NULL)
  )
);

-- Uniqueness invariants — one mark per (student, kind, target).
-- Split by source because PG treats NULL as distinct in unique
-- constraints (would let the same bank item be marked twice with
-- tutor_id NULL on both rows).
CREATE UNIQUE INDEX nclex_question_marks_bank_unique
  ON nclex_question_marks (student_id, target_kind, target_id)
  WHERE target_source = 'BANK';

CREATE UNIQUE INDEX nclex_question_marks_tutor_unique
  ON nclex_question_marks (student_id, target_kind, tutor_id, target_id)
  WHERE target_source = 'TUTOR';

-- Builder pool-filter index: "all marks this student holds, by kind"
CREATE INDEX idx_nclex_question_marks_student_kind
  ON nclex_question_marks (student_id, target_kind);


-- =========================================================
-- RLS — student owns their own marks; SUPER_ADMIN bypass.
-- Direct INSERT / DELETE allowed (no RPC) — toggle is a single-row
-- write whose authorisation reduces to "is this row mine?", which RLS
-- handles cleanly. UPDATE not granted: there is no editable column
-- (marked_at is system-set, target_* is immutable identity).
-- =========================================================

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
