-- 20260626130000_slice_11_12c_shelf_seen.sql
-- Slice 11.12c — "Your tutor updated this shelf" drift hint.
--
-- A shelf reads its membership LIVE (slice 11.12b), so a tutor can add or
-- remove notes after a student has already worked through it — flipping a
-- "done" shelf back to incomplete. This table lets the student side show a
-- calm "your tutor updated this shelf" cue when that happens, and clear it
-- once the student has seen the change.
--
-- One row per (student, shelf PLACEMENT). Keyed on activity_id, NOT
-- shelf_id: two placements of the same shelf can carry different
-- skipped_note_ids, so their visible sets — and therefore what the
-- student "last saw" — differ. seen_note_ids is the visible member set at
-- the student's last open; on the next render we diff the current visible
-- set against it (added = current\seen, removed = seen\current).
--
-- Student-owned state (like nclex_library_note_state) — the nclex_library_
-- prefix (not nclex_tutor_library_), self-only RLS.

BEGIN;

CREATE TABLE nclex_library_shelf_seen (
  student_id    UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  -- The SHELF activity placement (one shelf can be attached to many
  -- units; each placement tracks its own seen-set). Cascades on detach.
  activity_id   UUID NOT NULL REFERENCES nclex_programme_activities(activity_id) ON DELETE CASCADE,

  -- The visible member note_ids at the student's last open. '[]' until
  -- the first open. Diffed against the current visible set to derive the
  -- added / removed counts behind the "updated" cue.
  seen_note_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (student_id, activity_id)
);

ALTER TABLE nclex_library_shelf_seen ENABLE ROW LEVEL SECURITY;

-- Self-only — a student reads/writes only their own seen-rows. Mirrors
-- the nclex_library_note_state policy set.
CREATE POLICY nclex_library_shelf_seen_self_select
  ON nclex_library_shelf_seen FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY nclex_library_shelf_seen_self_insert
  ON nclex_library_shelf_seen FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY nclex_library_shelf_seen_self_update
  ON nclex_library_shelf_seen FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY nclex_library_shelf_seen_self_delete
  ON nclex_library_shelf_seen FOR DELETE
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY nclex_library_shelf_seen_admin_all
  ON nclex_library_shelf_seen FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));

COMMIT;
