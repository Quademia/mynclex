-- ─────────────────────────────────────────────────────────────────────
-- CAT Slice 10b1 — the cat_pool reservation flag
-- ─────────────────────────────────────────────────────────────────────
-- Mark a question (or a case / trend wrapper) as reserved CAT-pool stock.
-- See bank-consumption-cat.html §20.
--
-- Reservation lives on the WRAPPER (case / trend) or on a STANDALONE
-- question — never per child. Case / trend children inherit their
-- wrapper's flag, exactly as the readiness reservation works (a tag on a
-- case counts as a tag on every child). So the flag goes on:
--   • standalone question rows   (nclex_bank_items)
--   • case wrappers              (nclex_case_studies)
--   • trend wrappers             (nclex_trend_datasets)
-- plus the tutor mirror of each, dormant-for-symmetry (CAT runs against
-- the bank only in v1, and is admin-only — the tutor columns are never
-- read or set, but the schema stays symmetric, as with difficulty_irt).
--
-- Admin-only writes are already enforced: every admin table's RLS is
-- FOR ALL gated by nclex_user_has_permission('BANK_CURATE'), which tutors
-- do not hold. So cat_pool inherits admin-only writes — no new policy.
--
-- No backfill: everything starts unreserved (default FALSE).

-- ── standalone questions ─────────────────────────────────────────────
ALTER TABLE nclex_bank_items
  ADD COLUMN cat_pool BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE nclex_tutor_questions
  ADD COLUMN cat_pool BOOLEAN NOT NULL DEFAULT FALSE;

-- ── case wrappers ────────────────────────────────────────────────────
ALTER TABLE nclex_case_studies
  ADD COLUMN cat_pool BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE nclex_tutor_case_studies
  ADD COLUMN cat_pool BOOLEAN NOT NULL DEFAULT FALSE;

-- ── trend wrappers ───────────────────────────────────────────────────
ALTER TABLE nclex_trend_datasets
  ADD COLUMN cat_pool BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE nclex_tutor_trend_datasets
  ADD COLUMN cat_pool BOOLEAN NOT NULL DEFAULT FALSE;
