-- =========================================================
-- MyNclex — CAT Slice 1: schema foundation
-- File: mynclex/db/migrations/20260808120000_cat_slice1_schema.sql
-- =========================================================
-- The first build slice of Computerised Adaptive Testing, per
-- bank-consumption-cat.html §12.7 (schema additions) and §19.4 (slice plan).
--
-- ENTIRELY ADDITIVE. Every new column is nullable (or carries a default that
-- reproduces today's behaviour), no existing column is altered, moved or
-- dropped, and no existing row changes meaning. Nothing in this migration is
-- read by any code path yet — the engine is Slices 2–5, the runner Slice 6.
-- Applying it changes what a student experiences: nothing.
--
-- Eight parts:
--   1. difficulty_irt + difficulty_source on nclex_bank_items
--   2. the same two mirrored onto nclex_tutor_questions   (§12.7.2)
--   3. seed difficulty_irt from the existing Easy/Medium/Hard label
--   4. six CAT result columns on nclex_attempts           (§12.7.3)
--   5. five per-item CAT columns on nclex_attempt_items   (§12.7.4)
--   6. nclex_bank_item_calibration_history + RLS          (§12.7.5, §12.7.7)
--   7. cat_allowance on nclex_products + nclex_subscriptions (§12.7.5b, §15.5)
--   8. two RPC stubs, signatures only                     (§12.7.6)
--
-- Two deliberate NON-additions, both for the same reason — a value that can
-- be recomputed should not also be stored, because the copy can drift from
-- the formula that produces it (§12.7.12):
--   • cat_readiness_probability on nclex_attempts. §12.7.3 floats it as an
--     optional companion column, but it is derivable from cat_final_theta +
--     cat_final_se, so the results page computes it.
--   • a per-case display-only "clinical judgment" figure. Floated by §7.4,
--     dropped 2026-07-19 — computable on read from the six stored answers.
--
-- Rollback: §12.7.9. Additive-only, so reversal is DROP COLUMN / DROP TABLE /
-- DROP FUNCTION with no data reconstruction required.
-- =========================================================


-- ── 1. nclex_bank_items — numeric difficulty ─────────────────────────
-- The engine cannot do arithmetic against the words 'Easy'/'Medium'/'Hard',
-- so difficulty gains a numeric twin on the Rasch logit scale. The existing
-- TEXT column is deliberately UNTOUCHED and remains what curators author
-- against; difficulty_irt is system-managed.
--
-- difficulty_source records where the number came from, so the weekly
-- recalibration job (§5.3 / §17, Slice 10) can tell a curator's guess apart
-- from a value fitted to real student responses. Everything starts as
-- CURATOR_LABEL; recalibration flips rows to EMPIRICAL as evidence arrives.

ALTER TABLE nclex_bank_items
  ADD COLUMN difficulty_irt    NUMERIC,
  ADD COLUMN difficulty_source TEXT NOT NULL DEFAULT 'CURATOR_LABEL'
                               CHECK (difficulty_source IN ('CURATOR_LABEL','EMPIRICAL'));


-- ── 2. nclex_tutor_questions — the same two columns ──────────────────
-- Schema parity is intentional (§12.7.2). CAT becomes available as a tutor
-- quiz mode in v2 against tutor-owned banks; v1 recalibration runs against
-- nclex_bank_items only, but the schema should not preclude the tutor side.

ALTER TABLE nclex_tutor_questions
  ADD COLUMN difficulty_irt    NUMERIC,
  ADD COLUMN difficulty_source TEXT NOT NULL DEFAULT 'CURATOR_LABEL'
                               CHECK (difficulty_source IN ('CURATOR_LABEL','EMPIRICAL'));


-- ── 3. Seed difficulty_irt from the curator label ────────────────────
-- Easy → −1.0, Medium → 0.0, Hard → +1.0 (§12.7.1). Anything else, and NULL,
-- is left NULL rather than guessed at: a question with no difficulty has no
-- honest position on the scale, and §7.3 eligibility will simply not select
-- it until a curator or the recalibration job supplies one. Silently
-- defaulting those to 0.0 would inject fake "Medium" evidence into the
-- ability estimate.

UPDATE nclex_bank_items
   SET difficulty_irt = CASE difficulty
                          WHEN 'Easy'   THEN -1.0
                          WHEN 'Medium' THEN  0.0
                          WHEN 'Hard'   THEN  1.0
                        END
 WHERE difficulty IN ('Easy','Medium','Hard');

UPDATE nclex_tutor_questions
   SET difficulty_irt = CASE difficulty
                          WHEN 'Easy'   THEN -1.0
                          WHEN 'Medium' THEN  0.0
                          WHEN 'Hard'   THEN  1.0
                        END
 WHERE difficulty IN ('Easy','Medium','Hard');


-- ── 4. nclex_attempts — CAT result columns ───────────────────────────
-- All nullable: they stay NULL for every non-CAT attempt, and for a CAT that
-- is still IN_PROGRESS. final_score stays untouched and stays NULL for CAT —
-- CAT has no raw score, it has an ability estimate and a verdict.
--
-- cat_engine_version is the exception to "written at completion": it is
-- stamped at attempt CREATION, so it survives an ABANDONED attempt. That is
-- the point — an abandoned CAT still produced real responses that the §5/§17
-- recalibration pipeline will consume, and that pipeline has to know which
-- formula produced them (§12.7.12).

ALTER TABLE nclex_attempts
  ADD COLUMN cat_verdict            TEXT
                                    CHECK (cat_verdict IS NULL OR
                                           cat_verdict IN ('ABOVE_STANDARD','BELOW_STANDARD')),
  ADD COLUMN cat_final_theta        NUMERIC,
  ADD COLUMN cat_final_se           NUMERIC,
  ADD COLUMN cat_termination_reason TEXT
                                    CHECK (cat_termination_reason IS NULL OR
                                           cat_termination_reason IN ('CONFIDENCE_REACHED',
                                                                      'MAX_ITEMS_HIT',
                                                                      'TIME_LIMIT_HIT',
                                                                      'ABANDONED')),
  ADD COLUMN cat_items_administered INTEGER
                                    CHECK (cat_items_administered IS NULL OR
                                           cat_items_administered >= 0),
  ADD COLUMN cat_engine_version     TEXT;


-- ── 5. nclex_attempt_items — per-question CAT record ─────────────────
-- theta/SE are captured BEFORE the item is answered, which is what makes the
-- trajectory reconstructible after the fact: item N's theta-after is item
-- N+1's theta-before.
--
-- cat_item_difficulty is COPIED rather than joined, because recalibration
-- rewrites nclex_bank_items.difficulty_irt over time and would otherwise
-- retroactively change what a past exam was measuring against.
--
-- cat_weight records the weight the answer actually carried: 1.0 for a
-- standalone question, 0.5 for a case child under the §7.4 hybrid. It is
-- stored rather than inferred because it is only derivable from consecutive
-- theta values while the update formula is unchanged — and §4.4 (2PL) and
-- §4.5 (Option 3) both plan to change it, after which back-solving old
-- deltas returns wrong weights with no error (§12.7.12).
--
-- The case linkage needed to tune that weight — parent_case_id,
-- case_position, cjmm_step, selection_unit_type — already exists on this
-- table from the original attempt-tables migration. Nothing new is required
-- for it.

ALTER TABLE nclex_attempt_items
  ADD COLUMN cat_theta_before           NUMERIC,
  ADD COLUMN cat_se_before              NUMERIC,
  ADD COLUMN cat_item_difficulty        NUMERIC,
  ADD COLUMN cat_item_difficulty_source TEXT
                                        CHECK (cat_item_difficulty_source IS NULL OR
                                               cat_item_difficulty_source IN ('CURATOR_LABEL','EMPIRICAL')),
  ADD COLUMN cat_weight                 NUMERIC
                                        CHECK (cat_weight IS NULL OR cat_weight > 0);


-- ── 6. nclex_bank_item_calibration_history ───────────────────────────
-- Audit log for the recalibration job (Slice 10). Empty until then. Bank
-- only — no tutor mirror, since tutor calibration is not in v1 or v2 scope.
-- Every difficulty change is recorded with what it was, what it became, and
-- how much evidence justified it, so a bad batch can be identified and
-- reversed by job run.

CREATE TABLE nclex_bank_item_calibration_history (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NOTE: §12.7.5 specifies this as UUID → nclex_bank_items(id). That is a
  -- doc error: the table's primary key is item_id TEXT (e.g. 'BQ_00123'),
  -- there is no id column. Corrected here and in the doc, 2026-07-19.
  bank_item_id             TEXT NOT NULL REFERENCES nclex_bank_items(item_id) ON DELETE CASCADE,

  previous_difficulty_irt  NUMERIC,                    -- NULL when there was no prior value
  new_difficulty_irt       NUMERIC NOT NULL,

  previous_source          TEXT CHECK (previous_source IS NULL OR
                                       previous_source IN ('CURATOR_LABEL','EMPIRICAL')),
  new_source               TEXT NOT NULL
                           CHECK (new_source IN ('CURATOR_LABEL','EMPIRICAL')),

  responses_used           INTEGER NOT NULL CHECK (responses_used >= 0),

  recalibrated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recalibration_job_run_id TEXT                        -- identifies the batch, for rollback
);

-- Per-question history lookups (the curator-facing "why did this change?").
CREATE INDEX idx_nclex_bank_item_calibration_history_item
  ON nclex_bank_item_calibration_history (bank_item_id);

-- Time-range queries + per-run rollback.
CREATE INDEX idx_nclex_bank_item_calibration_history_at
  ON nclex_bank_item_calibration_history (recalibrated_at);

ALTER TABLE nclex_bank_item_calibration_history ENABLE ROW LEVEL SECURITY;

-- §12.7.7: admin-only. Curators do not read the audit log directly in v1;
-- relevant slices get surfaced through admin views later. The job itself
-- runs service-role, which bypasses RLS.
CREATE POLICY nclex_bank_item_calibration_history_admin_all
  ON nclex_bank_item_calibration_history FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- ── 7. cat_allowance — how many CATs a tier grants ───────────────────
-- §15.5. NULL = unlimited, 0 = none, N = N per entitlement window.
--
-- NULL is unlimited deliberately: every existing product and subscription
-- row keeps NULL, which reads as today's §15.1 behaviour, so this migration
-- is behaviour-neutral for everyone already holding access. No backfill.
--
-- It is a CEILING, not a balance — consumption is DERIVED by counting CAT
-- attempts inside the window, so there is no balance to decrement and no
-- double-spend to guard against. This is why the readiness-credit machinery
-- is deliberately not copied here.
--
-- Nothing reads these columns until the Slice 3 guard in create_cat_attempt.
-- They ride along now because the alternative is a second migration later
-- against tables that are live.

ALTER TABLE nclex_products
  ADD COLUMN cat_allowance INTEGER
             CHECK (cat_allowance IS NULL OR cat_allowance >= 0);

-- Snapshotted from the product at activation, so a later admin edit to the
-- SKU does not retroactively change what an existing buyer paid for — the
-- same reasoning that snapshots price. Denormalised onto the row for cheap
-- entitlement reads, exactly as pack_type already is on this table.
ALTER TABLE nclex_subscriptions
  ADD COLUMN cat_allowance INTEGER
             CHECK (cat_allowance IS NULL OR cat_allowance >= 0);


-- ── 8. RPC stubs — signatures only ───────────────────────────────────
-- Created now so downstream slices have a stable contract to build against.
-- Both raise; neither is granted to authenticated, so nothing can call them
-- into a half-built state.
--
-- The signatures encode the §10.6 engine-runtime decision: TypeScript
-- computes (Rasch math + the existing pure scoring functions, reused
-- unchanged per §10.2), and the RPC persists and selects. That is why
-- cat_next_item takes an already-computed score and an already-updated
-- theta/SE rather than deriving them — a PL/pgSQL engine could not reuse
-- lib/scoring without reimplementing all five scoring functions in SQL.
--
-- p_last_answer_payload is still passed because the RPC writes it into
-- nclex_attempt_answers verbatim.

CREATE OR REPLACE FUNCTION create_cat_attempt(
  p_student_id UUID,
  p_intent     TEXT,
  p_mode       TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  -- Returns { attempt_id: UUID, first_item_payload: JSONB }.
  RAISE EXCEPTION 'create_cat_attempt not yet implemented';
END;
$$;

CREATE OR REPLACE FUNCTION cat_next_item(
  p_attempt_id          UUID,
  p_last_answer_payload JSONB,
  p_score_awarded       NUMERIC,
  p_is_correct          BOOLEAN,
  p_theta_after         NUMERIC,
  p_se_after            NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  -- Returns { status: 'CONTINUE', next_item_payload: JSONB }
  --      or { status: 'COMPLETE', verdict_payload: JSONB }.
  RAISE EXCEPTION 'cat_next_item not yet implemented';
END;
$$;

-- No GRANT EXECUTE to authenticated — deliberate. These are stubs; they get
-- granted, and switched to SECURITY DEFINER, when the bodies land (§12.7.6).
REVOKE EXECUTE ON FUNCTION create_cat_attempt(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cat_next_item(UUID, JSONB, NUMERIC, BOOLEAN, NUMERIC, NUMERIC) FROM PUBLIC;
