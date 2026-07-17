-- =========================================================
-- MyNclex — Option shuffle, slice 3a: the DRAG token pools
-- File: mynclex/db/migrations/20260805120000_option_shuffle_drag_pool.sql
-- =========================================================
-- Extends the runtime option shuffle (20260804120000) to the two single-pool
-- drag types — DRAG_CLOZE and DRAG_ORDER. Both present a pool of draggable
-- tokens (content.tokens, distractors included) that the student places into
-- fixed slots. The pool renders in stored order, so an authored pool leaks:
-- for DRAG_ORDER especially, the machine-authored CAT items place the answer
-- tokens first in rank order (e.g. NCLEX_DO_95001: tokens t1..t5, answer
-- sequence t1,t2,t3,t4), i.e. reading the pool top-to-bottom hands over the
-- whole ordering.
--
-- Storage: option_order_json = a JSON array of the token IDs in display
-- order (same array shape as the flat option-list types — the runner reuses
-- the same orderedOptions() reorder on content.tokens). Tokens are draggable
-- chips with no A/B/C badge, so there is NO positional relabelling here.
--
-- Two objects are CREATE OR REPLACE'd (same objects from slice 1, extended):
--   1. nclex_build_option_order — now also shuffles content.tokens for the
--      two drag types.
--   2. _nclex_attempt_item_shuffle (trigger fn) — the type gate widens to
--      include the drag types, plus a DRAG_ORDER-only anti-giveaway guard.
-- The trigger itself (nclex_attempt_items_shuffle_trg) is unchanged — it
-- binds to the function by name, so replacing the body is enough.
--
-- DRAG_ORDER guard (Sam's call 2026-07-17, option a): never open the pool on
-- the answer. After shuffling, if the pool's answer-token subsequence equals
-- the canonical rank order, deterministically re-seed and re-shuffle (bounded
-- to a few tries). Fully defensive — any malformed rubric skips the guard and
-- falls back to the plain shuffle, so the guard can never break attempt
-- creation. DRAG_CLOZE needs no such guard: its slots are sentence positions,
-- not a ranked sequence, so pool order reveals nothing.
--
-- Scope unchanged otherwise: honours the per-item shuffle_options flag
-- (default TRUE); scoring is untouched (keys on token ID via scorePerSlot).
-- =========================================================

-- ── 1. Permutation builder — add the drag token pools ────────────────────
CREATE OR REPLACE FUNCTION nclex_build_option_order(
  p_question_type text,
  p_content       jsonb,
  p_seed          integer
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- Flat option-list types (slice 1) — shuffle content.options.
    WHEN p_question_type IN ('MCQ', 'SATA', 'SELECT_N')
     AND jsonb_typeof(p_content -> 'options') = 'array'
    THEN COALESCE(
           (SELECT jsonb_agg(opt ->> 'id'
                             ORDER BY md5(p_seed::text || (opt ->> 'id')))
            FROM jsonb_array_elements(p_content -> 'options') AS opt),
           '[]'::jsonb)
    -- Single-pool drag types (slice 3a) — shuffle content.tokens.
    WHEN p_question_type IN ('DRAG_CLOZE', 'DRAG_ORDER')
     AND jsonb_typeof(p_content -> 'tokens') = 'array'
    THEN COALESCE(
           (SELECT jsonb_agg(tok ->> 'id'
                             ORDER BY md5(p_seed::text || (tok ->> 'id')))
            FROM jsonb_array_elements(p_content -> 'tokens') AS tok),
           '[]'::jsonb)
    ELSE '{}'::jsonb
  END
$$;

-- ── 2. Trigger fn — widen the gate + DRAG_ORDER guard ────────────────────
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
  v_answer  text[];
  v_subseq  text[];
  v_tries   integer := 0;
BEGIN
  -- 1. Never overwrite an order a caller supplied explicitly.
  IF NEW.option_order_json IS DISTINCT FROM '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  -- 2. Only the flat option-list types + the single-pool drag types shuffle.
  IF NEW.question_type NOT IN
       ('MCQ', 'SATA', 'SELECT_N', 'DRAG_CLOZE', 'DRAG_ORDER') THEN
    RETURN NEW;
  END IF;

  -- 3. Resolve the per-item shuffle flag from the source table (default TRUE
  --    when the row can't be found so protection is never silently lost).
  IF NEW.item_source = 'TUTOR' THEN
    SELECT shuffle_options INTO v_shuffle
    FROM nclex_tutor_questions WHERE item_id = NEW.item_id;
  ELSE
    SELECT shuffle_options INTO v_shuffle
    FROM nclex_bank_items WHERE item_id = NEW.item_id;
  END IF;

  IF COALESCE(v_shuffle, true) = false THEN
    RETURN NEW;
  END IF;

  -- 4. Build the permutation.
  v_seed  := floor(random() * 2147483646)::int + 1;
  v_order := nclex_build_option_order(
               NEW.question_type, NEW.content_snapshot_json, v_seed);

  -- 4b. DRAG_ORDER anti-giveaway guard — never open the pool with the answer
  --     tokens already in canonical rank order. Re-seed deterministically
  --     until the pool's answer-token subsequence differs from the answer,
  --     bounded to a few tries. Defensive: any malformed rubric skips it.
  IF NEW.question_type = 'DRAG_ORDER'
     AND jsonb_typeof(v_order) = 'array'
     AND jsonb_array_length(v_order) > 1 THEN
    BEGIN
      SELECT array_agg(
               NEW.correct_answer_snapshot_json -> 'slots' ->> (s ->> 'id')
               ORDER BY ord)
        INTO v_answer
        FROM jsonb_array_elements(NEW.content_snapshot_json -> 'slots')
             WITH ORDINALITY AS z(s, ord);

      IF v_answer IS NOT NULL
         AND cardinality(v_answer) > 0
         AND cardinality(array_remove(v_answer, NULL)) = cardinality(v_answer)
      THEN
        LOOP
          SELECT array_agg(tid ORDER BY ord)
            INTO v_subseq
            FROM jsonb_array_elements_text(v_order) WITH ORDINALITY AS q(tid, ord)
            WHERE tid = ANY(v_answer);

          EXIT WHEN v_subseq IS DISTINCT FROM v_answer;  -- no longer reveals it
          EXIT WHEN v_tries >= 6;                         -- give up (tiny pool)
          v_tries := v_tries + 1;
          v_seed  := v_seed + 1;
          v_order := nclex_build_option_order(
                       NEW.question_type, NEW.content_snapshot_json, v_seed);
        END LOOP;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- guard must never break attempt creation; keep the shuffle
    END;
  END IF;

  -- 5. Only stamp when there's something meaningful to shuffle (>1 element).
  IF jsonb_typeof(v_order) = 'array' AND jsonb_array_length(v_order) > 1 THEN
    NEW.option_order_json := v_order;
    NEW.shuffle_seed      := v_seed;
  END IF;

  RETURN NEW;
END;
$$;
