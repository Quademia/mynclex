-- ─────────────────────────────────────────────────────────────────────
-- Flag for review — the per-sitting half of "marking"
-- ─────────────────────────────────────────────────────────────────────
-- docs/product-plan/flag-and-bookmark.md §2. Slice 2 of 5: storage and
-- the write path only. No UI reads this yet — that is slice 3.
--
-- WHY A COLUMN AND NOT A TABLE. "Marking" was two features sharing one
-- icon, and only one of them fits nclex_question_marks:
--
--   • BOOKMARK — (student, question), persists across every sitting.
--     That table, whose unique index is (student_id, target_kind,
--     target_id) with no attempt_id anywhere. Shipped in slice 1.
--   • FLAG — (attempt, question), "come back to this before I submit",
--     meaningless once the sitting is over. THIS.
--
-- A flag cannot live in the marks table: the same question flagged in
-- two sittings is refused by that unique index, and unflagging in one
-- sitting would delete the row an older sitting's report depends on.
-- nclex_attempt_items is already exactly one row per (attempt, question),
-- created up front, so the flag is a column on a row that already exists.
--
-- IT IS NEVER DELETED. The flag is part of the attempt record, so it
-- becomes history rather than rubbish: a report can say "you flagged 6
-- questions in this sitting" a year later, while the flag stops being
-- ACTIONABLE the moment the sitting ends (see the IN_PROGRESS guard
-- below). That is cheaper and more useful than expiring it.
--
-- WHY A FUNCTION. Students hold SELECT and nothing else on
-- nclex_attempt_items (db/rls.sql — nclex_attempt_items_via_attempt).
-- Granting a student UPDATE on that table to save writing this function
-- would be a scoring hole: attempt_items holds the frozen snapshot
-- (correct_answer_snapshot_json, marks_snapshot) that every score is
-- computed against. A SECURITY DEFINER function that touches one boolean
-- is the narrow door; a policy would be a wide one.
--
-- NO INDEX. The only readers are per-attempt ("which items in THIS
-- sitting are flagged"), and those already load every item row for the
-- attempt, so the flag arrives in the same row. Add one only if a
-- cross-attempt reader ever appears.


-- ── 1. the column ────────────────────────────────────────────────────
ALTER TABLE nclex_attempt_items
  ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN nclex_attempt_items.is_flagged IS
  'Student flagged this question for review DURING this sitting. Per-attempt '
  'and independent of correct/incorrect. Not a bookmark: that is '
  'nclex_question_marks, is (student, question), and persists across '
  'sittings. See docs/product-plan/flag-and-bookmark.md.';


-- ── 2. the toggle ────────────────────────────────────────────────────
-- Mirrors nclex_discard_attempt's shape: auth, then ownership, then
-- eligibility, then the narrowest possible write.
--
-- SCOPE, and what is deliberately NOT restricted here:
--
--   • CAT is refused. bank-consumption-cat.html §16 settled that a CAT
--     has no live-run mark-for-review, independently of this arc, and a
--     CAT cannot navigate backwards so a flag could never be acted on.
--   • Every other mode is permitted at this layer. Whether Timed
--     Sequential — forward-only, no grid — should OFFER the control is
--     still open (flag-and-bookmark.md §7.1) and is a UI decision for
--     slice 3. Encoding a guess here would quietly settle it in the one
--     layer that is hardest to change later.
--   • NO source restriction. Unlike the bookmark, a flag says nothing
--     about the practice pool, so readiness packs and tutor quizzes get
--     it too. The bookmark's exclusions exist because the Builder could
--     never serve those questions back; that reasoning does not apply to
--     navigating within a sitting you are already in.
--
-- IN_PROGRESS is the load-bearing guard. Without it a student could
-- unflag in review, which would rewrite the attempt record after the
-- fact and make the report's "you flagged 6" retroactively untrue.

CREATE OR REPLACE FUNCTION nclex_set_attempt_item_flag(
  p_attempt_item_id UUID,
  p_flagged         BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student UUID := auth.uid();
  v_owner   UUID;
  v_status  TEXT;
  v_mode    TEXT;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_flagged IS NULL THEN
    RAISE EXCEPTION 'flag state is required';
  END IF;

  SELECT a.student_id, a.status, a.mode
    INTO v_owner, v_status, v_mode
  FROM nclex_attempt_items ai
  JOIN nclex_attempts      a ON a.attempt_id = ai.attempt_id
  WHERE ai.attempt_item_id = p_attempt_item_id;

  -- One message for "no such item" and "not yours". SECURITY DEFINER
  -- sees every row, so two messages would let a caller probe whether an
  -- arbitrary attempt_item_id exists.
  IF v_owner IS NULL OR v_owner <> v_student THEN
    RAISE EXCEPTION 'question not found';
  END IF;

  IF v_status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'this sitting has ended';
  END IF;

  IF v_mode = 'CAT' THEN
    RAISE EXCEPTION 'flagging is not available in an adaptive exam';
  END IF;

  -- Touches the flag and nothing else. No updated_at on this table, and
  -- deliberately no write to the parent attempt's last_activity_at:
  -- flagging is not progress, and letting it defer a timed attempt's
  -- expiry would make it a way to buy time.
  UPDATE nclex_attempt_items
     SET is_flagged = p_flagged
   WHERE attempt_item_id = p_attempt_item_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION nclex_set_attempt_item_flag(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION nclex_set_attempt_item_flag(UUID, BOOLEAN) TO authenticated;
