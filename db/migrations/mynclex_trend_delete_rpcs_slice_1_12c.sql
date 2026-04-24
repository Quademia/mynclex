-- =========================================================
-- MyNclex — Slice 1.12c: trend delete RPCs (two paths × two surfaces)
-- File: mynclex/db/migrations/mynclex_trend_delete_rpcs_slice_1_12c.sql
-- Depends on:
--   mynclex_trend_datasets_slice_1_12a.sql  (dataset tables)
--   mynclex_trend_id_column_slice_1_12b.sql (trend_id FK on items)
-- Applied: 2026-04-24 (dev — zrakjibtxyzoqcdtvpmq)
-- =========================================================
-- Four RPC functions, one per (surface × path) combination. The
-- 1.12c delete-confirmation dialog picks one based on the curator's
-- choice: Detach (questions survive as standalone) or Delete-
-- everything (questions + dataset removed atomically).
--
-- Why RPCs rather than sequential supabase.from(...).update/delete():
--   Each path requires 2 statements (update-or-delete children, then
--   delete the dataset). Without a wrapping transaction, a failure
--   between the two leaves the DB in a half-finished state — bank
--   items stripped of trend_id but the dataset still present, or
--   vice versa. Every plpgsql function runs in an implicit
--   transaction, so RAISE EXCEPTION on any statement rolls back the
--   whole call. Same atomic-write pattern 1.11b and 1.12b established.
--
-- Why four separate functions rather than one branched on (surface,
-- path): matches the 1.12b save-RPC convention — the handoff
-- specified two-functions-per-surface there, and keeping the same
-- shape for delete avoids a surface-arg asymmetry between save and
-- delete in the TS action layer.
--
-- RESTRICT remains the DB-level safety net:
-- The bare deleteTrendAction (1.12a, tightened in 1.12c) refuses
-- ≥1-child datasets at the TS layer. ON DELETE RESTRICT on the
-- trend_id FK catches anyone who bypasses the action entirely (direct
-- SQL, raw REST calls). Neither of these RPCs relies on RESTRICT:
-- detach first NULLs trend_id, then deletes; delete-everything
-- removes the bank items first (which doesn't trigger RESTRICT since
-- bank items reference the dataset, not the other way round), then
-- the dataset. Both are safe against the existing FK.

-- ─────────────────────────────────────────────────────────
-- Admin: detach attached questions, then delete the dataset
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION nclex_detach_and_delete_trend(
  p_trend_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_detached_count INT := 0;
BEGIN
  IF p_trend_id IS NULL OR p_trend_id = '' THEN
    RAISE EXCEPTION 'p_trend_id is required';
  END IF;

  UPDATE nclex_bank_items
     SET trend_id = NULL, updated_at = NOW()
   WHERE trend_id = p_trend_id;
  GET DIAGNOSTICS v_detached_count = ROW_COUNT;

  DELETE FROM nclex_trend_datasets WHERE trend_id = p_trend_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trend dataset not found: %', p_trend_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',               TRUE,
    'detached_count',   v_detached_count,
    'deleted_trend_id', p_trend_id
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION nclex_detach_and_delete_trend(TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────
-- Admin: delete attached questions AND the dataset
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION nclex_delete_trend_and_children(
  p_trend_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_deleted_item_count INT := 0;
BEGIN
  IF p_trend_id IS NULL OR p_trend_id = '' THEN
    RAISE EXCEPTION 'p_trend_id is required';
  END IF;

  DELETE FROM nclex_bank_items WHERE trend_id = p_trend_id;
  GET DIAGNOSTICS v_deleted_item_count = ROW_COUNT;

  DELETE FROM nclex_trend_datasets WHERE trend_id = p_trend_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trend dataset not found: %', p_trend_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',                  TRUE,
    'deleted_item_count',  v_deleted_item_count,
    'deleted_trend_id',    p_trend_id
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION nclex_delete_trend_and_children(TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────
-- Tutor: detach attached questions, then delete the dataset
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION nclex_tutor_detach_and_delete_trend(
  p_trend_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_detached_count INT := 0;
BEGIN
  IF p_trend_id IS NULL OR p_trend_id = '' THEN
    RAISE EXCEPTION 'p_trend_id is required';
  END IF;

  UPDATE nclex_tutor_questions
     SET trend_id = NULL, updated_at = NOW()
   WHERE trend_id = p_trend_id;
  GET DIAGNOSTICS v_detached_count = ROW_COUNT;

  DELETE FROM nclex_tutor_trend_datasets WHERE trend_id = p_trend_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tutor trend dataset not found: %', p_trend_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',               TRUE,
    'detached_count',   v_detached_count,
    'deleted_trend_id', p_trend_id
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION nclex_tutor_detach_and_delete_trend(TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────
-- Tutor: delete attached questions AND the dataset
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION nclex_tutor_delete_trend_and_children(
  p_trend_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_deleted_item_count INT := 0;
BEGIN
  IF p_trend_id IS NULL OR p_trend_id = '' THEN
    RAISE EXCEPTION 'p_trend_id is required';
  END IF;

  DELETE FROM nclex_tutor_questions WHERE trend_id = p_trend_id;
  GET DIAGNOSTICS v_deleted_item_count = ROW_COUNT;

  DELETE FROM nclex_tutor_trend_datasets WHERE trend_id = p_trend_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tutor trend dataset not found: %', p_trend_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',                  TRUE,
    'deleted_item_count',  v_deleted_item_count,
    'deleted_trend_id',    p_trend_id
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION nclex_tutor_delete_trend_and_children(TEXT) TO authenticated;
