-- =========================================================
-- MyNclex — Slice 9.3a: Curriculum schema foundation
-- File: mynclex/db/migrations/20260512200000_slice_9_3a_curriculum_schema.sql
-- =========================================================
-- First slice of Phase B (curriculum). Adds the three template
-- tables that hold a programme's curriculum:
--
--   nclex_programme_units       — top-level pacing/grouping
--                                 container (rendered as "Week N"
--                                 or "Module N" per
--                                 programme.unit_label).
--   nclex_programme_blocks      — optional workflow groupings of
--                                 related activities within a unit.
--   nclex_programme_activities  — the leaf nodes; one per Text /
--                                 PDF / External link / Live session
--                                 / Mock / Practice quiz.
--
-- Source of truth for shape + semantics:
--   docs/product-plan/main.md (Programme structure → Curriculum)
--   docs/product-plan/curriculum-authoring-ux.md (screens 3–6)
--
-- Decisions confirmed in the slice planning conversation
-- (2026-05-12):
--   • Curriculum content lives at the programme layer only. Access
--     timing (when each activity opens for students in a cohort)
--     does NOT live on these tables — it lands on the cohort
--     checklist row in slice 9.3f. Same programme can run as a
--     gradual-reveal cohort or an all-open cohort; the cohort owns
--     that decision per row.
--   • Activity payload is a flexible JSONB column with no DB-level
--     shape enforcement. TS types in lib/curriculum/types.ts carry
--     the per-type contract; refined per type when each editor
--     ships (Text in 9.3b, the rest in 9.3d).
--   • Each unit, block, and activity carries an is_published flag
--     so the Live/Draft pill can render at every layer per the
--     planning doc's "dual publish status" rule.
--   • Block ordering and loose-activity ordering share a numeric
--     space within a unit (the unit body is a single interleaved
--     sequence). The reorder transaction (9.3b/c) renumbers both
--     tables atomically to avoid collisions; nothing in v1 relies
--     on cross-table uniqueness at the DB level.
--   • Full CRUD policies ship in this slice even though only SELECT
--     is exercised by 9.3a's read-only UI. Avoids a follow-up
--     migration in 9.3b just to add write policies.
--
-- Backfill safety:
--   • Every existing nclex_programmes row gets N empty unit rows
--     where N = length_units. unit_index 1..N, title NULL,
--     is_published FALSE. 7 dev rows × their length_units =
--     N unit rows on day one (no programme can be in a "no units"
--     state after this migration).
--   • No backfill for blocks / activities — those stay empty.
--   • UNIQUE (programme_id, unit_index) protects the backfill from
--     accidental duplicates if re-run; existing rows survive.


-- =========================================================
-- 1. nclex_programme_units
-- =========================================================
-- One row per unit slot in a programme. unit_index is fixed by
-- programme.length_units at backfill / future creation time; the
-- tutor edits title + description + is_published, never the index.
-- An empty unit (no blocks, no activities) is the default state.

CREATE TABLE nclex_programme_units (
  unit_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id     UUID NOT NULL
                   REFERENCES nclex_programmes(programme_id)
                   ON DELETE CASCADE,

  -- Position in the programme (1 .. programme.length_units).
  -- Stored, not derived — units are addressable rows the tutor
  -- can edit independently. Backfill seeds 1..N per programme.
  unit_index       INTEGER NOT NULL
                   CHECK (unit_index >= 1),

  -- Tutor-set title (e.g. "Cardiac Pharmacology"). NULL until
  -- filled. Display falls back to "Week N" / "Module N" via
  -- unitLabel(programme) when null/empty.
  title            TEXT,

  -- Optional subtitle / one-liner shown on the unit card.
  description      TEXT,

  -- Live / Draft pill at the unit layer per the planning doc's
  -- "dual publish status" rule. Defaults Draft.
  is_published     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Audit (matches nclex_programmes / nclex_cohorts pattern —
  -- no created_by/updated_by; ownership traces via programme_id).
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per slot per programme. Protects backfill + future
  -- length_units expansions from duplicating an index.
  CONSTRAINT nclex_programme_units_slot_unique
    UNIQUE (programme_id, unit_index)
);

-- Units of a programme — drives the Units Overview grid query
-- (this slice) and every curriculum-tab read.
CREATE INDEX idx_nclex_programme_units_programme
  ON nclex_programme_units(programme_id);


-- =========================================================
-- 2. nclex_programme_blocks
-- =========================================================
-- Optional workflow grouping inside a unit. Empty until 9.3c.
-- `ordinal` is the block's position within the unit body — the
-- unit body interleaves blocks + loose activities, so the ordinal
-- shares a numeric space with nclex_programme_activities.ordinal
-- WHERE block_id IS NULL. Collisions are avoided by the reorder
-- transaction (renumbers both atomically), not by a DB constraint.

CREATE TABLE nclex_programme_blocks (
  block_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id          UUID NOT NULL
                   REFERENCES nclex_programme_units(unit_id)
                   ON DELETE CASCADE,

  -- Position within the unit body.
  ordinal          INTEGER NOT NULL
                   CHECK (ordinal >= 1),

  -- Block must have a title — empty blocks aren't allowed per
  -- the planning doc. Tutor sets at create-time.
  title            TEXT NOT NULL,

  -- Optional one-liner on the block card.
  description      TEXT,

  -- Live / Draft pill. Draft blocks can sit inside a Live unit.
  is_published     BOOLEAN NOT NULL DEFAULT FALSE,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nclex_programme_blocks_unit
  ON nclex_programme_blocks(unit_id);


-- =========================================================
-- 3. nclex_programme_activities
-- =========================================================
-- The leaf node — one row per Text / PDF / External link / Live
-- session / Mock / Practice quiz. block_id NULL means loose
-- under the unit; NOT NULL means inside that block.

CREATE TABLE nclex_programme_activities (
  activity_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Activity always belongs to a unit (required). Activities
  -- inside a block also satisfy this via the block's unit_id;
  -- duplicating the unit_id on the activity row keeps the
  -- Units Overview count query cheap (no join through blocks).
  unit_id          UUID NOT NULL
                   REFERENCES nclex_programme_units(unit_id)
                   ON DELETE CASCADE,

  -- Optional parent block. NULL → loose activity under the unit;
  -- NOT NULL → activity sits inside that block. Cascade on the
  -- block FK so deleting a block deletes its activities (the
  -- empty-block prevention rule lives in app code — DB allows
  -- mid-state).
  block_id         UUID
                   REFERENCES nclex_programme_blocks(block_id)
                   ON DELETE CASCADE,

  -- Position within immediate parent. If block_id IS NULL, this
  -- is the activity's position within the unit body (shared
  -- numeric space with nclex_programme_blocks.ordinal). If
  -- block_id IS NOT NULL, it's the position within the block.
  ordinal          INTEGER NOT NULL
                   CHECK (ordinal >= 1),

  -- Six v1 types. Library Note + uploaded-video deferred to v2
  -- per the planning doc.
  type             TEXT NOT NULL
                   CHECK (type IN (
                     'TEXT',
                     'PDF',
                     'EXTERNAL_LINK',
                     'LIVE_SESSION',
                     'MOCK',
                     'PRACTICE_QUIZ'
                   )),

  -- Activity title shown to students (the line in their checklist).
  title            TEXT NOT NULL,

  -- Optional "Note to student" — the line under the activity
  -- title in the editor (mockup screen 6).
  note             TEXT,

  -- Type-specific fields. Shape varies by `type`; TS discriminated
  -- union in lib/curriculum/types.ts carries the contract.
  -- Validation lives at the action layer when each editor ships;
  -- the DB stores any JSONB so refining payloads later is a TS
  -- change, not a migration.
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Live / Draft pill. Per main.md §Content visibility, Draft
  -- activities don't surface in any cohort's checklist.
  is_published     BOOLEAN NOT NULL DEFAULT FALSE,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nclex_programme_activities_unit
  ON nclex_programme_activities(unit_id);

-- Partial index — only blocked activities (block_id IS NOT NULL)
-- need the by-block lookup; loose-activity queries hit the unit
-- index above. Keeps the index small.
CREATE INDEX idx_nclex_programme_activities_block
  ON nclex_programme_activities(block_id)
  WHERE block_id IS NOT NULL;


-- =========================================================
-- 4. Backfill — empty units for every existing programme
-- =========================================================
-- Every existing programme gets N rows where N = length_units.
-- After this migration every programme has a full set of empty
-- unit slots (title NULL, is_published FALSE, no blocks, no
-- activities). The Units Overview grid renders these as dashed
-- placeholders.

INSERT INTO nclex_programme_units (programme_id, unit_index)
SELECT p.programme_id, gs.idx
FROM   nclex_programmes p
CROSS  JOIN LATERAL generate_series(1, p.length_units) AS gs(idx);


-- =========================================================
-- 5. RLS — units / blocks / activities
-- =========================================================
-- Tutors CRUD curriculum for programmes they own. Ownership
-- traces via the programme FK chain:
--   unit       → programme.tutor_id
--   block      → unit → programme.tutor_id
--   activity   → unit → programme.tutor_id
--
-- Activities additionally validate via unit_id (not block_id) —
-- a loose activity still has a unit, so the chain is uniform.
-- SUPER_ADMIN gets a separate bypass policy per table, matching
-- the nclex_cohorts pattern.
--
-- Student SELECT visibility is NOT added here. Students will
-- need read access via the cohort-checklist row (9.3f), at which
-- point we'll add policy(ies) to expose published curriculum
-- through that membership. v1 keeps the surface tutor-only.

ALTER TABLE nclex_programme_units      ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_programme_blocks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_programme_activities ENABLE ROW LEVEL SECURITY;


-- ---------- nclex_programme_units ----------

CREATE POLICY nclex_programme_units_self_select
  ON nclex_programme_units FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_units.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_units_self_insert
  ON nclex_programme_units FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_units.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_units_self_update
  ON nclex_programme_units FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_units.programme_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_units.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_units_self_delete
  ON nclex_programme_units FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_units.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_units_admin_all
  ON nclex_programme_units FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- ---------- nclex_programme_blocks ----------

CREATE POLICY nclex_programme_blocks_self_select
  ON nclex_programme_blocks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_blocks.unit_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_blocks_self_insert
  ON nclex_programme_blocks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_blocks.unit_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_blocks_self_update
  ON nclex_programme_blocks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_blocks.unit_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_blocks.unit_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_blocks_self_delete
  ON nclex_programme_blocks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_blocks.unit_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_blocks_admin_all
  ON nclex_programme_blocks FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- ---------- nclex_programme_activities ----------

CREATE POLICY nclex_programme_activities_self_select
  ON nclex_programme_activities FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_activities.unit_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_activities_self_insert
  ON nclex_programme_activities FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_activities.unit_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_activities_self_update
  ON nclex_programme_activities FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_activities.unit_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_activities.unit_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_activities_self_delete
  ON nclex_programme_activities FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_activities.unit_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_activities_admin_all
  ON nclex_programme_activities FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));
