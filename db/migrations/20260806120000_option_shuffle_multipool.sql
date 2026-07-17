-- =========================================================
-- MyNclex — Option shuffle, slice 3b: the multi-pool types (CLOZE, BOWTIE)
-- File: mynclex/db/migrations/20260806120000_option_shuffle_multipool.sql
-- =========================================================
-- Extends the runtime option shuffle to the two types that hold SEVERAL
-- independent pools in one question:
--   • CLOZE  — one dropdown per blank; each blank has its own choices[].
--   • BOWTIE — three wings (left / centre / right), each its own tokens[].
-- The renderer shows each pool in stored order, so a lazily-authored pool
-- (correct choice/token first) is gameable. Each pool shuffles independently.
--
-- Storage shape goes polymorphic: option_order_json is now an OBJECT keyed by
-- pool, not a flat array —
--   CLOZE  → { "<blankId>": ["<choiceId>", …], … }   (choice ids restart per
--             blank, so it MUST be keyed by blank)
--   BOWTIE → { "left": [...], "centre": [...], "right": [...] }
-- The runner applies orderedOptions() once per blank / per wing. No positional
-- relabelling (dropdown options + token chips show text, not A/B/C) and no
-- anti-giveaway guard (each pool is independent — there is no sequence to
-- reveal). shuffle_options is honoured per item; scoring is untouched (keys on
-- the choice/token id).
--
-- Two objects are CREATE OR REPLACE'd (same objects from slices 1 + 3a):
--   1. nclex_build_option_order — adds CLOZE + BOWTIE, returning an object.
--   2. _nclex_attempt_item_shuffle — gate widens to include them, and the
--      "stamp" check now accepts a non-empty OBJECT as well as an array.
-- =========================================================

-- ── 1. Permutation builder — add the multi-pool types ────────────────────
CREATE OR REPLACE FUNCTION nclex_build_option_order(
  p_question_type text,
  p_content       jsonb,
  p_seed          integer
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- Flat option-list types (slice 1) — shuffle content.options → array.
    WHEN p_question_type IN ('MCQ', 'SATA', 'SELECT_N')
     AND jsonb_typeof(p_content -> 'options') = 'array'
    THEN COALESCE(
           (SELECT jsonb_agg(opt ->> 'id'
                             ORDER BY md5(p_seed::text || (opt ->> 'id')))
            FROM jsonb_array_elements(p_content -> 'options') AS opt),
           '[]'::jsonb)

    -- Single-pool drag types (slice 3a) — shuffle content.tokens → array.
    WHEN p_question_type IN ('DRAG_CLOZE', 'DRAG_ORDER')
     AND jsonb_typeof(p_content -> 'tokens') = 'array'
    THEN COALESCE(
           (SELECT jsonb_agg(tok ->> 'id'
                             ORDER BY md5(p_seed::text || (tok ->> 'id')))
            FROM jsonb_array_elements(p_content -> 'tokens') AS tok),
           '[]'::jsonb)

    -- CLOZE (slice 3b) — shuffle each blank's choices independently → object
    -- keyed by blank id. The blank id is folded into the sort key so every
    -- blank shuffles on its own.
    WHEN p_question_type = 'CLOZE'
     AND jsonb_typeof(p_content -> 'blanks') = 'array'
    THEN COALESCE(
           (SELECT jsonb_object_agg(
                     b ->> 'id',
                     (SELECT jsonb_agg(c ->> 'id'
                             ORDER BY md5(p_seed::text || (b ->> 'id') || (c ->> 'id')))
                      FROM jsonb_array_elements(b -> 'choices') AS c))
            FROM jsonb_array_elements(p_content -> 'blanks') AS b
            WHERE jsonb_typeof(b -> 'choices') = 'array'),
           '{}'::jsonb)

    -- BOWTIE (slice 3b) — shuffle each wing's tokens independently → object
    -- keyed by wing. Missing/empty wings drop out via jsonb_strip_nulls.
    WHEN p_question_type = 'BOWTIE'
     AND jsonb_typeof(p_content -> 'left' -> 'tokens') = 'array'
    THEN jsonb_strip_nulls(jsonb_build_object(
           'left',   (SELECT jsonb_agg(t ->> 'id'
                             ORDER BY md5(p_seed::text || 'left'   || (t ->> 'id')))
                      FROM jsonb_array_elements(p_content -> 'left'   -> 'tokens') AS t),
           'centre', (SELECT jsonb_agg(t ->> 'id'
                             ORDER BY md5(p_seed::text || 'centre' || (t ->> 'id')))
                      FROM jsonb_array_elements(p_content -> 'centre' -> 'tokens') AS t),
           'right',  (SELECT jsonb_agg(t ->> 'id'
                             ORDER BY md5(p_seed::text || 'right'  || (t ->> 'id')))
                      FROM jsonb_array_elements(p_content -> 'right'  -> 'tokens') AS t)
         ))

    ELSE '{}'::jsonb
  END
$$;

-- ── 2. Trigger fn — widen the gate + object-aware stamp ──────────────────
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

  -- 2. Only the shuffleable types run.
  IF NEW.question_type NOT IN
       ('MCQ', 'SATA', 'SELECT_N', 'DRAG_CLOZE', 'DRAG_ORDER', 'CLOZE', 'BOWTIE') THEN
    RETURN NEW;
  END IF;

  -- 3. Resolve the per-item shuffle flag (default TRUE when not found).
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

  -- 4b. DRAG_ORDER anti-giveaway guard (slice 3a) — never open the pool with
  --     the answer tokens already in canonical rank order.
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

          EXIT WHEN v_subseq IS DISTINCT FROM v_answer;
          EXIT WHEN v_tries >= 6;
          v_tries := v_tries + 1;
          v_seed  := v_seed + 1;
          v_order := nclex_build_option_order(
                       NEW.question_type, NEW.content_snapshot_json, v_seed);
        END LOOP;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- 5. Stamp when there is a meaningful permutation — a >1-element array
  --    (flat / drag pools) OR a non-empty object (cloze / bowtie multi-pool).
  IF (jsonb_typeof(v_order) = 'array'  AND jsonb_array_length(v_order) > 1)
     OR (jsonb_typeof(v_order) = 'object' AND v_order <> '{}'::jsonb) THEN
    NEW.option_order_json := v_order;
    NEW.shuffle_seed      := v_seed;
  END IF;

  RETURN NEW;
END;
$$;
