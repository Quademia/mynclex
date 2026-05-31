-- Slice 11.16c-2 — custom library views (saved filter combos)
--
-- A "view" is a tutor-saved combination of filter chips over their own
-- library notes. v1 filters on three dimensions (status / pillars /
-- tags); the combo is stored opaquely in `filters_json` so the filter
-- model can grow (folder / shelf / saved search) without a schema
-- change. The note set is computed in the app layer over the cached
-- lens-row fetch — no view ever runs a stored query, so there's no
-- query language to validate at the DB.
--
-- Mirrors the folders table exactly: UUID PK, tutor_id → auth.users
-- with ON DELETE CASCADE, a position column for sidebar ordering, and
-- four self-scoped RLS policies (select / insert / update / delete) on
-- `tutor_id = auth.uid()`. No SECURITY DEFINER RPCs — plain CRUD
-- through PostgREST under the caller's own RLS, like folders + shelves.

BEGIN;

CREATE TABLE nclex_tutor_library_views (
  view_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nclex_tutor_library_views_name_len
    CHECK (char_length(name) BETWEEN 1 AND 60)
);

-- One read path: every view for a tutor, ordered by position. The
-- index covers the (tutor_id, position) ORDER BY directly.
CREATE INDEX nclex_tutor_library_views_tutor_pos
  ON nclex_tutor_library_views (tutor_id, position);

ALTER TABLE nclex_tutor_library_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_tutor_library_views_self_select
  ON nclex_tutor_library_views FOR SELECT
  USING (tutor_id = (SELECT auth.uid()));
CREATE POLICY nclex_tutor_library_views_self_insert
  ON nclex_tutor_library_views FOR INSERT
  WITH CHECK (tutor_id = (SELECT auth.uid()));
CREATE POLICY nclex_tutor_library_views_self_update
  ON nclex_tutor_library_views FOR UPDATE
  USING (tutor_id = (SELECT auth.uid()))
  WITH CHECK (tutor_id = (SELECT auth.uid()));
CREATE POLICY nclex_tutor_library_views_self_delete
  ON nclex_tutor_library_views FOR DELETE
  USING (tutor_id = (SELECT auth.uid()));

COMMIT;
