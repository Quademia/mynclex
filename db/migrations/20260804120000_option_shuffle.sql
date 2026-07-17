-- =========================================================
-- MyNclex — Runtime option shuffle (Slice 1: generation layer)
-- File: mynclex/db/migrations/20260804120000_option_shuffle.sql
-- =========================================================
-- Fills nclex_attempt_items.option_order_json + shuffle_seed at attempt
-- creation so the runner can present option-list answers in a randomized,
-- per-sitting order. Until now every create path stored option_order_json
-- = '{}' ("deferred to runner shuffle (slice 4.x)") with shuffle_seed NULL,
-- and nothing consumed them — the runner rendered options in AUTHORED order.
-- Authored content (especially the machine-authored CAT seed pool) clusters
-- correct answers at the front (A, B, C…), so the answer position is
-- currently visible / gameable. Flagged as a hard prerequisite before any
-- authored bank content goes student-facing: bank-consumption-cat.html §19.
--
-- This is SLICE 1 (GENERATION only). The runner does NOT yet consume the
-- order — that is Slice 2 (a read-time helper + the option-list renderers +
-- positional letter relabelling). Scoring is untouched in both slices: it
-- already compares by option ID, which is independent of display position.
--
-- Design:
--   • content_snapshot_json is LEFT UNTOUCHED — it stays the honest record
--     of the authored option order.
--   • option_order_json holds the DISPLAY PERMUTATION: a JSON array of the
--     option IDs in the order to present them, e.g. ["C","A","D","B"].
--   • shuffle_seed records the per-item seed. Non-null ⇒ shuffle was applied
--     (matches the column's documented contract). The permutation is
--     DETERMINISTIC from (seed, id set) via an md5 sort, so it is
--     reproducible / auditable without relying on global RNG state.
--
-- Scope (v1): the three flat option-list types only — MCQ, SATA, SELECT_N.
--   • TF excluded — 2 fixed options (True/False), no anti-gaming benefit.
--   • MATRIX / MATRIX_MR excluded — a shared-header grid, not an option
--     list; rows are scored independently, columns are a meaningful scale.
--   • HIGHLIGHT excluded — its "options" are chunks inline in the passage
--     prose; reordering would scramble the sentence.
--   • CLOZE / BOWTIE / DRAG_CLOZE / DRAG_ORDER — shuffleable pools, but each
--     needs its own per-pool permutation shape; deferred to a later slice.
--   Honours the per-item shuffle_options flag (default TRUE) on the source
--   table (nclex_bank_items / nclex_tutor_questions) — a curator can opt a
--   specific question out (e.g. options that read as an ordered scale).
--
-- Mechanism: a BEFORE INSERT trigger on nclex_attempt_items. Attempt items
-- are snapshotted exactly once, at creation, by five paths (bank practice,
-- readiness sittings, the two tutor-quiz launches, and the note-embed
-- player). One trigger covers ALL of them without editing any of the large
-- create RPCs.
-- =========================================================

-- ── 1. Pure permutation builder ──────────────────────────────────────────
-- Given a question type, its content snapshot, and a seed, return the option
-- IDs in shuffled DISPLAY order (JSON array) for the flat option-list types,
-- or '{}' for every other type. Deterministic + side-effect-free (md5 sort),
-- so the same (seed, id set) always yields the same order.
CREATE OR REPLACE FUNCTION nclex_build_option_order(
  p_question_type text,
  p_content       jsonb,
  p_seed          integer
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_question_type IN ('MCQ', 'SATA', 'SELECT_N')
     AND jsonb_typeof(p_content -> 'options') = 'array'
    THEN COALESCE(
           (SELECT jsonb_agg(opt ->> 'id'
                             ORDER BY md5(p_seed::text || (opt ->> 'id')))
            FROM jsonb_array_elements(p_content -> 'options') AS opt),
           '[]'::jsonb)
    ELSE '{}'::jsonb
  END
$$;

-- ── 2. BEFORE INSERT trigger function ────────────────────────────────────
-- SECURITY DEFINER so the per-item shuffle_options lookup on the source
-- table always succeeds regardless of the calling context (all real inserts
-- already come via SECURITY DEFINER create RPCs; this keeps it robust).
CREATE OR REPLACE FUNCTION _nclex_attempt_item_shuffle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shuffle boolean;
  v_seed    integer;
  v_order   jsonb;
BEGIN
  -- 1. Never overwrite an order a caller supplied explicitly.
  IF NEW.option_order_json IS DISTINCT FROM '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  -- 2. Only the flat option-list types shuffle in v1.
  IF NEW.question_type NOT IN ('MCQ', 'SATA', 'SELECT_N') THEN
    RETURN NEW;
  END IF;

  -- 3. Resolve the per-item shuffle flag from the source table.
  --    Default TRUE when the row can't be found so protection is never
  --    silently lost.
  IF NEW.item_source = 'TUTOR' THEN
    SELECT shuffle_options INTO v_shuffle
    FROM nclex_tutor_questions WHERE item_id = NEW.item_id;
  ELSE
    SELECT shuffle_options INTO v_shuffle
    FROM nclex_bank_items WHERE item_id = NEW.item_id;
  END IF;

  IF COALESCE(v_shuffle, true) = false THEN
    RETURN NEW;   -- curator opted this item out; leave '{}' + NULL seed
  END IF;

  -- 4. Build the permutation. Seed range 1 .. 2^31-1 (fits INTEGER).
  v_seed  := floor(random() * 2147483646)::int + 1;
  v_order := nclex_build_option_order(
               NEW.question_type, NEW.content_snapshot_json, v_seed);

  -- 5. Only stamp when there's something meaningful to shuffle (>1 option).
  IF jsonb_typeof(v_order) = 'array' AND jsonb_array_length(v_order) > 1 THEN
    NEW.option_order_json := v_order;
    NEW.shuffle_seed      := v_seed;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 3. Wire the trigger ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS nclex_attempt_items_shuffle_trg ON nclex_attempt_items;

CREATE TRIGGER nclex_attempt_items_shuffle_trg
BEFORE INSERT ON nclex_attempt_items
FOR EACH ROW
EXECUTE FUNCTION _nclex_attempt_item_shuffle();
