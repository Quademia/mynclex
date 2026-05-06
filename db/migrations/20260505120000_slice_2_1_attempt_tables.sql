-- =========================================================
-- MyNclex — Slice 2.1: Attempt tables (foundation for bank consumption)
-- File: mynclex/db/migrations/20260505120000_slice_2_1_attempt_tables.sql
-- =========================================================
-- The five base tables every consumption surface (Builder, Runner, History,
-- Analytics) reads from or writes to. CAT-specific column additions and the
-- mark-for-review table are deliberately deferred to their own slices —
-- this migration delivers the fixed-length-mode foundation only.
--
-- Source of truth for column lists, semantics, and snapshot rules:
--   docs/product-plan/bank-consumption-attempt-creation.html §6
--
-- Decisions locked for this slice (per planning conversation 2026-05-05):
--   • UUID v4 (gen_random_uuid()) for attempt PKs — no extension needed.
--   • final_score IS in this slice (lifecycle column, not CAT-specific).
--   • CAT result columns + mark-for-review table NOT in this slice.
--   • programme_activity_id added as nullable TEXT with NO FK — the
--     nclex_programme_activities table doesn't exist yet; the FK lands
--     in a later ALTER when programme tables arrive (same pattern as
--     parent_case_id / trend_id forward-references in slice 1.11b/1.12b).
--   • RLS conservative: students SELECT own rows; SUPER_ADMIN full
--     access. Write paths land with the create_attempt RPC in slice 2.2.
--
-- Additive-only — no changes to existing tables. Safe to roll back by
-- dropping the five new tables in reverse FK order.


-- =========================================================
-- 1. nclex_attempts — one row per quiz session
-- =========================================================
CREATE TABLE nclex_attempts (
  attempt_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id                 UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,

  -- Source (where the question list came from)
  source                     TEXT NOT NULL CHECK (source IN
                               ('CUSTOM_BUILT','READINESS_PACK','PROGRAMME_ASSIGNED')),
  readiness_pack_id          TEXT REFERENCES nclex_readiness_packs(pack_id) ON DELETE RESTRICT,
  -- programme_activity_id: forward-reference. FK added later when
  -- nclex_programme_activities lands. Stored as TEXT for now.
  programme_activity_id      TEXT,

  -- Configuration
  intent                     TEXT NOT NULL CHECK (intent IN ('STUDY','EXAM')),
  mode                       TEXT NOT NULL CHECK (mode IN
                               ('UNTIMED_LEARNING','UNTIMED_TEST',
                                'TIMED_FREE_NAV','TIMED_SEQUENTIAL','CAT')),
  duration_seconds           INTEGER,
  mode_overrides_json        JSONB,
  filters_json               JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Status / lifecycle
  status                     TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN
                               ('IN_PROGRESS','COMPLETED','TIMED_OUT','ABANDONED')),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at                 TIMESTAMPTZ,
  last_activity_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at                   TIMESTAMPTZ,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Counts
  requested_question_count   INTEGER NOT NULL CHECK (requested_question_count > 0),
  actual_question_count      INTEGER NOT NULL DEFAULT 0 CHECK (actual_question_count >= 0),
  actual_unit_count          INTEGER NOT NULL DEFAULT 0 CHECK (actual_unit_count >= 0),

  -- Result (non-CAT). NULL while IN_PROGRESS; set on terminal transition.
  -- Item-equivalent average per bank-marks-and-scoring.html §7.
  final_score                NUMERIC CHECK (final_score IS NULL OR (final_score >= 0 AND final_score <= 1)),

  -- (intent, mode) tuple validation per attempt-creation §6.1.2
  -- Valid: 4 STUDY combinations + 4 EXAM combinations = 8 of 10
  -- Invalid: (EXAM, UNTIMED_LEARNING) and (STUDY, CAT)
  CONSTRAINT nclex_attempts_intent_mode_tuple CHECK (
    (intent, mode) IN (
      ('STUDY','UNTIMED_LEARNING'),
      ('STUDY','UNTIMED_TEST'),
      ('STUDY','TIMED_FREE_NAV'),
      ('STUDY','TIMED_SEQUENTIAL'),
      ('EXAM', 'UNTIMED_TEST'),
      ('EXAM', 'TIMED_FREE_NAV'),
      ('EXAM', 'TIMED_SEQUENTIAL'),
      ('EXAM', 'CAT')
    )
  ),

  -- Source-specific reference columns: at most one populated, matching the source
  CONSTRAINT nclex_attempts_source_refs CHECK (
    (source = 'CUSTOM_BUILT'        AND readiness_pack_id IS NULL AND programme_activity_id IS NULL)
    OR (source = 'READINESS_PACK'    AND readiness_pack_id IS NOT NULL AND programme_activity_id IS NULL)
    OR (source = 'PROGRAMME_ASSIGNED' AND programme_activity_id IS NOT NULL)
  )
);

CREATE INDEX idx_nclex_attempts_student            ON nclex_attempts(student_id);
CREATE INDEX idx_nclex_attempts_student_status     ON nclex_attempts(student_id, status);
CREATE INDEX idx_nclex_attempts_last_activity      ON nclex_attempts(last_activity_at)
  WHERE status = 'IN_PROGRESS';
CREATE INDEX idx_nclex_attempts_pack               ON nclex_attempts(readiness_pack_id)
  WHERE readiness_pack_id IS NOT NULL;
CREATE INDEX idx_nclex_attempts_programme_activity ON nclex_attempts(programme_activity_id)
  WHERE programme_activity_id IS NOT NULL;


-- =========================================================
-- 2. nclex_attempt_case_snapshots — case scenarios snapshotted per attempt
-- =========================================================
-- Created BEFORE nclex_attempt_items because attempt_items has a composite
-- FK to (attempt_id, case_id) on this table.
CREATE TABLE nclex_attempt_case_snapshots (
  attempt_id                 UUID NOT NULL REFERENCES nclex_attempts(attempt_id) ON DELETE CASCADE,
  case_id                    TEXT NOT NULL,
  title_snapshot             TEXT NOT NULL,
  scenario_summary_snapshot  TEXT,
  tabs_snapshot_json         JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attempt_id, case_id)
);


-- =========================================================
-- 3. nclex_attempt_trend_snapshots — trend datasets snapshotted per attempt
-- =========================================================
CREATE TABLE nclex_attempt_trend_snapshots (
  attempt_id                 UUID NOT NULL REFERENCES nclex_attempts(attempt_id) ON DELETE CASCADE,
  trend_id                   TEXT NOT NULL,
  title_snapshot             TEXT NOT NULL,
  scenario_snapshot          TEXT,
  kind_snapshot              TEXT NOT NULL,
  row_label_snapshot         TEXT,
  timepoints_snapshot_json   JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows_snapshot_json         JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attempt_id, trend_id)
);


-- =========================================================
-- 4. nclex_attempt_items — one row per question delivered (snapshot)
-- =========================================================
CREATE TABLE nclex_attempt_items (
  attempt_item_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id                 UUID NOT NULL REFERENCES nclex_attempts(attempt_id) ON DELETE CASCADE,
  position                   INTEGER NOT NULL CHECK (position > 0),

  -- Source reference (polymorphic — no FK on item_id, snapshot is source of truth)
  item_id                    TEXT NOT NULL,
  item_source                TEXT NOT NULL DEFAULT 'BANK' CHECK (item_source IN ('BANK','TUTOR')),
  tutor_id                   UUID REFERENCES nclex_users(id) ON DELETE SET NULL,

  -- Selection provenance
  selection_unit_type        TEXT NOT NULL CHECK (selection_unit_type IN ('QUESTION','CASE')),
  selection_unit_id          TEXT NOT NULL,

  -- Wrapper references — composite FK to case snapshot (case children only)
  parent_case_id             TEXT,
  case_position              INTEGER CHECK (case_position IS NULL OR (case_position BETWEEN 1 AND 6)),
  cjmm_step                  TEXT CHECK (cjmm_step IS NULL OR cjmm_step IN
                               ('Recognise cues','Analyse cues','Prioritise',
                                'Generate solutions','Take action','Evaluate outcomes')),
  trend_id                   TEXT,

  -- Snapshot — granular columns
  question_type              TEXT NOT NULL CHECK (question_type IN
                               ('MCQ','TF','SATA','SELECT_N','MATRIX',
                                'HIGHLIGHT','CLOZE','DRAG_DROP','BOWTIE')),
  stem_snapshot              TEXT NOT NULL,
  instruction_snapshot       TEXT,
  rationale_snapshot         TEXT,
  rationale_img_snapshot     TEXT,
  marks_snapshot             NUMERIC NOT NULL CHECK (marks_snapshot > 0),
  classification_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Snapshot — polymorphic blobs (shape varies by question_type)
  content_snapshot_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  correct_answer_snapshot_json   JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Display state
  shuffle_seed               INTEGER,
  option_order_json          JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (attempt_id, position),

  -- Composite FK: case child rows must reference an existing case snapshot
  -- on the same attempt. Nullable parts (parent_case_id NULL) skip the check.
  FOREIGN KEY (attempt_id, parent_case_id)
    REFERENCES nclex_attempt_case_snapshots(attempt_id, case_id)
    ON DELETE CASCADE,

  -- Composite FK: trend question rows must reference an existing trend
  -- snapshot on the same attempt.
  FOREIGN KEY (attempt_id, trend_id)
    REFERENCES nclex_attempt_trend_snapshots(attempt_id, trend_id)
    ON DELETE CASCADE,

  -- Tutor sourcing requires tutor_id; bank sourcing leaves it null
  CONSTRAINT nclex_attempt_items_tutor_id_consistent CHECK (
    (item_source = 'BANK'  AND tutor_id IS NULL)
    OR (item_source = 'TUTOR' AND tutor_id IS NOT NULL)
  ),

  -- Case wrapper columns are all-or-nothing
  CONSTRAINT nclex_attempt_items_case_wrapper_consistent CHECK (
    (parent_case_id IS NULL AND case_position IS NULL AND cjmm_step IS NULL)
    OR (parent_case_id IS NOT NULL AND case_position IS NOT NULL AND cjmm_step IS NOT NULL)
  )
);

CREATE INDEX idx_nclex_attempt_items_attempt        ON nclex_attempt_items(attempt_id);
CREATE INDEX idx_nclex_attempt_items_attempt_case   ON nclex_attempt_items(attempt_id, parent_case_id)
  WHERE parent_case_id IS NOT NULL;
CREATE INDEX idx_nclex_attempt_items_attempt_trend  ON nclex_attempt_items(attempt_id, trend_id)
  WHERE trend_id IS NOT NULL;
CREATE INDEX idx_nclex_attempt_items_item_source    ON nclex_attempt_items(item_source, item_id);


-- =========================================================
-- 5. nclex_attempt_answers — one row per question the student touched
-- =========================================================
-- Lazy insert on first interaction (option click, blank typing). Separate
-- from nclex_attempt_items because items are immutable (question delivered)
-- and answers mutate as the student edits, submits, or auto-submits.
CREATE TABLE nclex_attempt_answers (
  answer_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_item_id            UUID NOT NULL UNIQUE REFERENCES nclex_attempt_items(attempt_item_id) ON DELETE CASCADE,
  attempt_id                 UUID NOT NULL REFERENCES nclex_attempts(attempt_id) ON DELETE CASCADE,
  student_id                 UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,

  -- The answer
  answer_json                JSONB,
  submission_status          TEXT NOT NULL DEFAULT 'DRAFT' CHECK (submission_status IN
                               ('DRAFT','SUBMITTED','AUTO_SUBMITTED','SKIPPED')),

  -- Scoring (nullable until graded)
  is_correct                 BOOLEAN,
  score_awarded              NUMERIC CHECK (score_awarded IS NULL OR score_awarded >= 0),

  -- Time spent (runner-computed, see attempt-creation §6.3.2)
  time_spent_sec             INTEGER CHECK (time_spent_sec IS NULL OR time_spent_sec >= 0),

  -- Append-only event log of selection changes (see attempt-creation §6.3.3)
  answer_changes_json        JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Housekeeping
  submitted_at               TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nclex_attempt_answers_attempt          ON nclex_attempt_answers(attempt_id);
CREATE INDEX idx_nclex_attempt_answers_student          ON nclex_attempt_answers(student_id);
CREATE INDEX idx_nclex_attempt_answers_student_status   ON nclex_attempt_answers(student_id, submission_status);


-- =========================================================
-- RLS — conservative: SELECT own rows + SUPER_ADMIN bypass.
-- Write paths land with the create_attempt RPC in slice 2.2 (SECURITY
-- DEFINER, bypasses RLS). No student INSERT/UPDATE/DELETE policies in
-- this slice — defense in depth: nothing writes to these tables yet.
-- =========================================================

ALTER TABLE nclex_attempts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_attempt_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_attempt_answers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_attempt_case_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_attempt_trend_snapshots  ENABLE ROW LEVEL SECURITY;


-- nclex_attempts: students see own; SUPER_ADMIN sees all
CREATE POLICY nclex_attempts_self_read ON nclex_attempts FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY nclex_attempts_admin_all ON nclex_attempts FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- nclex_attempt_items: visible if the parent attempt is visible
CREATE POLICY nclex_attempt_items_via_attempt ON nclex_attempt_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_attempts a
      WHERE a.attempt_id = nclex_attempt_items.attempt_id
        AND a.student_id = auth.uid()
    )
  );

CREATE POLICY nclex_attempt_items_admin_all ON nclex_attempt_items FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- nclex_attempt_answers: student_id is denormalised for fast direct check
CREATE POLICY nclex_attempt_answers_self_read ON nclex_attempt_answers FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY nclex_attempt_answers_admin_all ON nclex_attempt_answers FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- nclex_attempt_case_snapshots: via parent attempt
CREATE POLICY nclex_attempt_case_snapshots_via_attempt ON nclex_attempt_case_snapshots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_attempts a
      WHERE a.attempt_id = nclex_attempt_case_snapshots.attempt_id
        AND a.student_id = auth.uid()
    )
  );

CREATE POLICY nclex_attempt_case_snapshots_admin_all ON nclex_attempt_case_snapshots FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- nclex_attempt_trend_snapshots: via parent attempt
CREATE POLICY nclex_attempt_trend_snapshots_via_attempt ON nclex_attempt_trend_snapshots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_attempts a
      WHERE a.attempt_id = nclex_attempt_trend_snapshots.attempt_id
        AND a.student_id = auth.uid()
    )
  );

CREATE POLICY nclex_attempt_trend_snapshots_admin_all ON nclex_attempt_trend_snapshots FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));
