-- =========================================================
-- MyNclex — Slice 11.10: atomic library-note publish RPC
-- File: mynclex/db/migrations/20260620120000_slice_11_10_publish_rpc.sql
-- Depends on: 20260616120000_slice_11_1_tutor_library_schema.sql
-- =========================================================
-- The publish flow flips a note's `is_published` + `visibility_mode`
-- AND rewrites its visibility junction (`nclex_tutor_library_note_visibility`)
-- in a single user gesture. These must commit together:
--
--   • The junction carries a DEFERRABLE INITIALLY DEFERRED constraint
--     trigger (`nclex_note_vis_scoped_must_have_visibility`) that only
--     validates at transaction commit — a PROGRAMME_SCOPED note must
--     end the transaction with ≥ 1 row. That design is meaningless
--     across separate REST round trips (each commits on its own).
--   • Re-scoping an already-PROGRAMME_SCOPED note means deleting its
--     old rows before inserting new ones. Done as separate commits,
--     the delete-to-zero step would trip the deferred trigger, and a
--     scoped→tutor-wide→scoped reshuffle would briefly over-expose a
--     cohort-specific note to every one of the tutor's students.
--
-- So the write is one PL/pgSQL function (transaction-atomic). It is
-- SECURITY INVOKER (the house style — see nclex_save_case_with_children):
-- RLS on `_notes` (self-update) + `_note_visibility` (self-all) enforces
-- tutor ownership, the same-tutor BEFORE trigger validates programme
-- ownership, and the deferred trigger validates the scoped-≥1 invariant
-- at commit. RAISE rolls the whole thing back.
--
-- Caller responsibilities (TypeScript, lib/library/actions.ts):
--   * Auth check (signed-in tutor).
--   * Validate mode ∈ {TUTOR_WIDE, PROGRAMME_SCOPED} + the scoped set
--     is non-empty, for UX-friendly errors before the DB.
--   * The alt-text preflight (client-side) before opening the dialog.
--
-- RPC responsibilities:
--   * Guard: the note exists and belongs to the caller (RLS-scoped
--     SELECT; a not-owned note reads as not-found → RAISE).
--   * Set is_published + visibility_mode.
--   * Clear the junction, then for PROGRAMME_SCOPED re-insert the set.
--   * Leave version_id + updated_at untouched — publishing is a
--     visibility state change, not a body edit, and rotating version_id
--     would false-conflict the editor's open autosave guard.
--
-- Unpublish is NOT handled here — it is a plain `is_published = false`
-- UPDATE (the junction is preserved so a later re-publish remembers the
-- scope), which touches no junction trigger.
-- =========================================================

CREATE OR REPLACE FUNCTION nclex_set_library_note_publish(
  p_note_id        UUID,
  p_is_published   BOOLEAN,
  p_mode           TEXT,           -- 'TUTOR_WIDE' | 'PROGRAMME_SCOPED'
  p_programme_ids  UUID[]          -- empty for TUTOR_WIDE; ≥ 1 for scoped
)
RETURNS JSONB AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_owner  UUID;
  v_pid    UUID;
BEGIN
  IF p_mode NOT IN ('TUTOR_WIDE', 'PROGRAMME_SCOPED') THEN
    RAISE EXCEPTION 'Unknown visibility mode: %', p_mode;
  END IF;

  -- Ownership guard. The SELECT is RLS-scoped (self-select), so a note
  -- the caller doesn't own reads as not-found — same surface either way.
  SELECT tutor_id INTO v_owner
  FROM nclex_tutor_library_notes
  WHERE note_id = p_note_id;

  IF v_owner IS NULL OR v_owner <> v_uid THEN
    RAISE EXCEPTION 'note % not found, or not yours to publish', p_note_id;
  END IF;

  IF p_mode = 'PROGRAMME_SCOPED'
     AND (p_programme_ids IS NULL OR array_length(p_programme_ids, 1) IS NULL) THEN
    RAISE EXCEPTION 'PROGRAMME_SCOPED requires at least one programme';
  END IF;

  -- 1. Flip the flags. (version_id + updated_at deliberately untouched.)
  UPDATE nclex_tutor_library_notes
  SET is_published   = p_is_published,
      visibility_mode = p_mode
  WHERE note_id = p_note_id;

  -- 2. Rewrite the junction. Clear first, then re-insert for scoped.
  --    The deferred trigger validates the scoped-≥1 invariant at commit;
  --    the same-tutor BEFORE trigger validates each programme on insert.
  DELETE FROM nclex_tutor_library_note_visibility
  WHERE note_id = p_note_id;

  IF p_mode = 'PROGRAMME_SCOPED' THEN
    FOREACH v_pid IN ARRAY p_programme_ids LOOP
      INSERT INTO nclex_tutor_library_note_visibility (note_id, programme_id)
      VALUES (p_note_id, v_pid)
      ON CONFLICT (note_id, programme_id) DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'note_id',         p_note_id,
    'is_published',    p_is_published,
    'visibility_mode', p_mode
  );
END;
$$ LANGUAGE plpgsql;

-- supabase-js calls this as the `authenticated` role.
GRANT EXECUTE ON FUNCTION nclex_set_library_note_publish(UUID, BOOLEAN, TEXT, UUID[])
  TO authenticated;
