-- =========================================================
-- MyNclex — Auth & Roles schema (first migration)
-- File: mynclex/db/schema.sql
-- Depends on: auth.users (Supabase built-in)
-- =========================================================

-- 1. Core user profile
-- PK = auth.users.id (Supabase pattern, greenfield)
CREATE TABLE nclex_users (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT NOT NULL UNIQUE,

  -- Identity
  forename              TEXT NOT NULL,
  surname               TEXT NOT NULL,
  name                  TEXT NOT NULL,

  -- Contact
  phone_number          TEXT,
  avatar_url            TEXT,

  -- Auth state
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password  BOOLEAN NOT NULL DEFAULT FALSE,
  signup_source         TEXT NOT NULL DEFAULT 'MYNCLEX',

  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_utc        TIMESTAMPTZ
);

CREATE INDEX idx_nclex_users_email ON nclex_users(email);


-- 2. Roles (one row per user-role pair; user can hold multiple roles)
CREATE TABLE nclex_user_roles (
  user_id     UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('STUDENT','TUTOR','ADMIN','SUPER_ADMIN')),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by  UUID REFERENCES nclex_users(id),
  PRIMARY KEY (user_id, role)
);


-- 3. Admin permissions (one row per user-permission pair)
-- No CHECK constraint on permission values yet (deferred per main.md)
CREATE TABLE nclex_admin_permissions (
  user_id     UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  permission  TEXT NOT NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by  UUID REFERENCES nclex_users(id),
  PRIMARY KEY (user_id, permission)
);


-- =========================================================
-- MyNclex — Bank schema (second migration)
-- Adds the 7 bank tables per docs/product-plan/bank.md.
-- No RLS in this migration — policies added per-table later.
-- =========================================================

-- 4. QAcademy-owned questions (all 9 question types, JSONB content/correct)
CREATE TABLE nclex_bank_items (
  item_id                   TEXT PRIMARY KEY,
  question_type             TEXT NOT NULL CHECK (question_type IN
                              ('MCQ','TF','SATA','SELECT_N','MATRIX',
                               'HIGHLIGHT','CLOZE','DRAG_DROP','BOWTIE')),

  -- Common content shell
  stem                      TEXT NOT NULL,
  rationale                 TEXT,
  rationale_img             TEXT,

  -- Polymorphic content (shape varies by question_type)
  content                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  correct                   JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Classification axes (all optional at DB level)
  client_needs_category     TEXT,
  client_needs_subcategory  TEXT,
  nursing_subject           TEXT,
  body_system               TEXT,
  topic                     TEXT,
  subtopic                  TEXT,
  difficulty                TEXT CHECK (difficulty IN ('Easy','Medium','Hard')),
  bloom_level               TEXT,
  tags                      TEXT[] NOT NULL DEFAULT '{}',

  -- Visibility and packaging
  is_free_sample            BOOLEAN NOT NULL DEFAULT FALSE,
  is_builder_visible        BOOLEAN NOT NULL DEFAULT TRUE,
  is_published              BOOLEAN NOT NULL DEFAULT FALSE,

  -- Housekeeping
  marks                     NUMERIC NOT NULL DEFAULT 1,
  shuffle_options           BOOLEAN NOT NULL DEFAULT TRUE,
  question_ref              TEXT,
  batch_id                  TEXT,
  instruction               TEXT,

  -- parent_case_id (Slice 1.11b) is added via ALTER TABLE at the bottom
  -- of this file because it forward-references nclex_case_studies.

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 5. QAcademy-owned case studies (scenario + 6 chart tabs as JSONB)
CREATE TABLE nclex_case_studies (
  case_id                   TEXT PRIMARY KEY,
  title                     TEXT NOT NULL,
  scenario_summary          TEXT,

  -- Chart tabs live in nclex_case_study_tabs (child table, added in Slice 1.11a).

  -- Classification (subset — no bloom_level on case studies per bank.md)
  client_needs_category     TEXT,
  client_needs_subcategory  TEXT,
  nursing_subject           TEXT,
  body_system               TEXT,
  topic                     TEXT,
  subtopic                  TEXT,
  difficulty                TEXT CHECK (difficulty IN ('Easy','Medium','Hard')),
  tags                      TEXT[] NOT NULL DEFAULT '{}',

  -- Visibility
  is_free_sample            BOOLEAN NOT NULL DEFAULT FALSE,
  is_builder_visible        BOOLEAN NOT NULL DEFAULT TRUE,
  is_published              BOOLEAN NOT NULL DEFAULT FALSE,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 6. Join: QAcademy case study <-> its 6 questions (ordered, with CJMM step)
CREATE TABLE nclex_case_study_items (
  id                        TEXT PRIMARY KEY,
  case_id                   TEXT NOT NULL REFERENCES nclex_case_studies(case_id) ON DELETE CASCADE,
  item_id                   TEXT NOT NULL REFERENCES nclex_bank_items(item_id) ON DELETE RESTRICT,
  position                  INTEGER NOT NULL CHECK (position BETWEEN 1 AND 6),
  cjmm_step                 TEXT NOT NULL CHECK (cjmm_step IN
                              ('Recognise cues','Analyse cues','Prioritise',
                               'Generate solutions','Take action','Evaluate outcomes')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_id, position)
);


-- 6b. Chart tabs for QAcademy case studies (Slice 1.11a).
-- One row per tab per case. Built-in tabs (tab_key in nurses_notes,
-- vital_signs, lab_results, orders, history, diagnostics) and custom
-- tabs (tab_key = custom_narrative or custom_grid) share this table.
CREATE TABLE nclex_case_study_tabs (
  tab_id        TEXT PRIMARY KEY,
  case_id       TEXT NOT NULL REFERENCES nclex_case_studies(case_id) ON DELETE CASCADE,
  tab_key       TEXT NOT NULL,
  title         TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  is_custom     BOOLEAN NOT NULL DEFAULT FALSE,
  custom_shape  TEXT,
  columns_def   JSONB NOT NULL DEFAULT '[]'::jsonb,
  entries       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_id, display_order),
  CHECK (tab_key <> ''),
  CHECK (
    (is_custom = FALSE AND custom_shape IS NULL)
    OR
    (is_custom = TRUE  AND custom_shape IN ('free_text', 'rows_cols'))
  )
);

CREATE INDEX idx_nclex_case_study_tabs_case ON nclex_case_study_tabs(case_id);


-- 7. QAcademy-owned readiness packs (curated assessments, sold separately)
CREATE TABLE nclex_readiness_packs (
  pack_id                   TEXT PRIMARY KEY,
  title                     TEXT NOT NULL,
  description               TEXT,
  item_ids                  TEXT[] NOT NULL DEFAULT '{}',
  n                         INTEGER,
  time_limit_sec            INTEGER,
  price_cents               INTEGER,
  published                 BOOLEAN NOT NULL DEFAULT FALSE,
  publish_at                TIMESTAMPTZ,
  unpublish_at              TIMESTAMPTZ,
  status                    TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','active','archived')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 8. Tutor-private questions (same shape as nclex_bank_items + tutor_id)
CREATE TABLE nclex_tutor_questions (
  item_id                   TEXT PRIMARY KEY,
  tutor_id                  UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  question_type             TEXT NOT NULL CHECK (question_type IN
                              ('MCQ','TF','SATA','SELECT_N','MATRIX',
                               'HIGHLIGHT','CLOZE','DRAG_DROP','BOWTIE')),

  stem                      TEXT NOT NULL,
  rationale                 TEXT,
  rationale_img             TEXT,

  content                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  correct                   JSONB NOT NULL DEFAULT '{}'::jsonb,

  client_needs_category     TEXT,
  client_needs_subcategory  TEXT,
  nursing_subject           TEXT,
  body_system               TEXT,
  topic                     TEXT,
  subtopic                  TEXT,
  difficulty                TEXT CHECK (difficulty IN ('Easy','Medium','Hard')),
  bloom_level               TEXT,
  tags                      TEXT[] NOT NULL DEFAULT '{}',

  is_free_sample            BOOLEAN NOT NULL DEFAULT FALSE,
  is_builder_visible        BOOLEAN NOT NULL DEFAULT TRUE,
  is_published              BOOLEAN NOT NULL DEFAULT FALSE,

  marks                     NUMERIC NOT NULL DEFAULT 1,
  shuffle_options           BOOLEAN NOT NULL DEFAULT TRUE,
  question_ref              TEXT,
  batch_id                  TEXT,
  instruction               TEXT,

  -- parent_case_id (Slice 1.11b) is added via ALTER TABLE at the bottom
  -- of this file because it forward-references nclex_tutor_case_studies.

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nclex_tutor_questions_tutor ON nclex_tutor_questions(tutor_id);


-- 9. Tutor-private case studies (same shape as nclex_case_studies + tutor_id)
CREATE TABLE nclex_tutor_case_studies (
  case_id                   TEXT PRIMARY KEY,
  tutor_id                  UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  title                     TEXT NOT NULL,
  scenario_summary          TEXT,

  -- Chart tabs live in nclex_tutor_case_study_tabs (child table, added in Slice 1.11a).

  client_needs_category     TEXT,
  client_needs_subcategory  TEXT,
  nursing_subject           TEXT,
  body_system               TEXT,
  topic                     TEXT,
  subtopic                  TEXT,
  difficulty                TEXT CHECK (difficulty IN ('Easy','Medium','Hard')),
  tags                      TEXT[] NOT NULL DEFAULT '{}',

  is_free_sample            BOOLEAN NOT NULL DEFAULT FALSE,
  is_builder_visible        BOOLEAN NOT NULL DEFAULT TRUE,
  is_published              BOOLEAN NOT NULL DEFAULT FALSE,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nclex_tutor_case_studies_tutor ON nclex_tutor_case_studies(tutor_id);


-- 10. Join: Tutor-private case study <-> its questions
CREATE TABLE nclex_tutor_case_study_items (
  id                        TEXT PRIMARY KEY,
  case_id                   TEXT NOT NULL REFERENCES nclex_tutor_case_studies(case_id) ON DELETE CASCADE,
  item_id                   TEXT NOT NULL REFERENCES nclex_tutor_questions(item_id) ON DELETE RESTRICT,
  position                  INTEGER NOT NULL CHECK (position BETWEEN 1 AND 6),
  cjmm_step                 TEXT NOT NULL CHECK (cjmm_step IN
                              ('Recognise cues','Analyse cues','Prioritise',
                               'Generate solutions','Take action','Evaluate outcomes')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_id, position)
);


-- 10b. Chart tabs for tutor-private case studies (Slice 1.11a).
-- Same shape as nclex_case_study_tabs; FK points at the tutor parent table.
CREATE TABLE nclex_tutor_case_study_tabs (
  tab_id        TEXT PRIMARY KEY,
  case_id       TEXT NOT NULL REFERENCES nclex_tutor_case_studies(case_id) ON DELETE CASCADE,
  tab_key       TEXT NOT NULL,
  title         TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  is_custom     BOOLEAN NOT NULL DEFAULT FALSE,
  custom_shape  TEXT,
  columns_def   JSONB NOT NULL DEFAULT '[]'::jsonb,
  entries       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_id, display_order),
  CHECK (tab_key <> ''),
  CHECK (
    (is_custom = FALSE AND custom_shape IS NULL)
    OR
    (is_custom = TRUE  AND custom_shape IN ('free_text', 'rows_cols'))
  )
);

CREATE INDEX idx_nclex_tutor_case_study_tabs_case ON nclex_tutor_case_study_tabs(case_id);


-- =========================================================
-- Added 2026-04-24 in Slice 1.12a — Trend datasets
-- =========================================================
-- The Trend wrapper's dataset layer. Two parallel tables:
--   • nclex_trend_datasets       — admin-owned, QAcademy bank.
--   • nclex_tutor_trend_datasets — tutor-private, one row per
--     tutor-authored dataset.
-- In 1.12a datasets stand alone; the trend_id FK on bank items
-- lands in Slice 1.12b when attachment becomes a real feature.
-- See `mynclex/docs/product-plan/slice-1.12-plan.md` for the
-- three-sub-slice shape.

-- 11. Admin-owned trend datasets
-- is_free_sample + is_builder_visible added in slice 13 so the
-- trend wrapper-v2 can carry the same three-row Visibility section
-- as the case-study wrapper. Defaults match nclex_bank_items
-- (FALSE / TRUE).
CREATE TABLE nclex_trend_datasets (
  trend_id            TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  scenario            TEXT,
  kind                TEXT NOT NULL,
  row_label           TEXT,
  timepoints          JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows                JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published        BOOLEAN NOT NULL DEFAULT FALSE,
  is_free_sample      BOOLEAN NOT NULL DEFAULT FALSE,
  is_builder_visible  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 12. Tutor-private trend datasets
-- tutor_id follows the repo's existing tutor-table convention
-- (FK to nclex_users with ON DELETE CASCADE) rather than
-- referencing auth.users directly.
-- is_free_sample + is_builder_visible added in slice 13 alongside
-- the admin twin.
CREATE TABLE nclex_tutor_trend_datasets (
  trend_id            TEXT PRIMARY KEY,
  tutor_id            UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  scenario            TEXT,
  kind                TEXT NOT NULL,
  row_label           TEXT,
  timepoints          JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows                JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published        BOOLEAN NOT NULL DEFAULT FALSE,
  is_free_sample      BOOLEAN NOT NULL DEFAULT FALSE,
  is_builder_visible  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nclex_tutor_trend_datasets_tutor
  ON nclex_tutor_trend_datasets(tutor_id);


-- =========================================================
-- Added 2026-04-23 in Slice 1.11b — parent_case_id FK on question tables
-- =========================================================
-- Deferred to the bottom of schema.sql because each FK forward-references
-- a case-studies table defined later in the file. Origin migration:
-- mynclex/db/migrations/mynclex_parent_case_id_slice_1_11b.sql.
-- ON DELETE SET NULL preserves authored content if the parent case is
-- deleted (children become orphans, re-linkable via the bank list).
-- Partial indexes keep lookups on case-linked items fast without bloating
-- the table-wide index (most rows will have parent_case_id IS NULL).

ALTER TABLE nclex_bank_items
  ADD COLUMN parent_case_id TEXT
  REFERENCES nclex_case_studies(case_id) ON DELETE SET NULL;

CREATE INDEX idx_nclex_bank_items_parent_case
  ON nclex_bank_items(parent_case_id)
  WHERE parent_case_id IS NOT NULL;

ALTER TABLE nclex_tutor_questions
  ADD COLUMN parent_case_id TEXT
  REFERENCES nclex_tutor_case_studies(case_id) ON DELETE SET NULL;

CREATE INDEX idx_nclex_tutor_questions_parent_case
  ON nclex_tutor_questions(parent_case_id)
  WHERE parent_case_id IS NOT NULL;


-- =========================================================
-- Added 2026-04-24 in Slice 1.12b — trend_id FK on bank items
-- =========================================================
-- Nullable FK on both question tables pointing at the matching
-- trend dataset tables. ON DELETE RESTRICT prevents bare deletes of
-- datasets with attached questions (the 1.12c delete-confirmation
-- flow handles the user-facing path). 99% of items stay NULL, so
-- each column takes a partial index scoped to non-null rows.
--
-- No new RLS policies — the existing nclex_bank_items and
-- nclex_tutor_questions policies already cover trend-linked rows.

ALTER TABLE nclex_bank_items
  ADD COLUMN trend_id TEXT
  REFERENCES nclex_trend_datasets(trend_id) ON DELETE RESTRICT;

ALTER TABLE nclex_tutor_questions
  ADD COLUMN trend_id TEXT
  REFERENCES nclex_tutor_trend_datasets(trend_id) ON DELETE RESTRICT;

CREATE INDEX nclex_bank_items_trend_id_idx
  ON nclex_bank_items(trend_id)
  WHERE trend_id IS NOT NULL;

CREATE INDEX nclex_tutor_questions_trend_id_idx
  ON nclex_tutor_questions(trend_id)
  WHERE trend_id IS NOT NULL;

-- =========================================================
-- Added 2026-05-05 in Slice 2.1 — Attempt tables (bank consumption foundation)
-- =========================================================
-- Five tables every consumption surface (Builder, Runner, History, Analytics)
-- reads from or writes to. Source of truth for column lists, semantics, and
-- snapshot rules: docs/product-plan/bank-consumption-attempt-creation.html §6.
--
-- Decisions locked 2026-05-05: UUID v4 PKs, final_score in this slice, CAT
-- result columns + mark-for-review table NOT in this slice (deferred to
-- their own slices), programme_activity_id added as nullable TEXT with NO
-- FK (forward-reference — nclex_programme_activities doesn't exist yet),
-- conservative RLS (SELECT own + SUPER_ADMIN bypass; writes via RPC later).

-- 13. nclex_attempts — one row per quiz session
CREATE TABLE nclex_attempts (
  attempt_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id                 UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,

  source                     TEXT NOT NULL CHECK (source IN
                               ('CUSTOM_BUILT','READINESS_PACK','PROGRAMME_ASSIGNED')),
  readiness_pack_id          TEXT REFERENCES nclex_readiness_packs(pack_id) ON DELETE RESTRICT,
  -- programme_activity_id: forward-reference. FK added later when
  -- nclex_programme_activities lands. Stored as TEXT for now.
  programme_activity_id      TEXT,

  intent                     TEXT NOT NULL CHECK (intent IN ('STUDY','EXAM')),
  mode                       TEXT NOT NULL CHECK (mode IN
                               ('UNTIMED_LEARNING','UNTIMED_TEST',
                                'TIMED_FREE_NAV','TIMED_SEQUENTIAL','CAT')),
  duration_seconds           INTEGER,
  mode_overrides_json        JSONB,
  filters_json               JSONB NOT NULL DEFAULT '{}'::jsonb,

  status                     TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN
                               ('IN_PROGRESS','COMPLETED','TIMED_OUT','ABANDONED')),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at                 TIMESTAMPTZ,
  last_activity_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at                   TIMESTAMPTZ,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  requested_question_count   INTEGER NOT NULL CHECK (requested_question_count > 0),
  actual_question_count      INTEGER NOT NULL DEFAULT 0 CHECK (actual_question_count >= 0),
  actual_unit_count          INTEGER NOT NULL DEFAULT 0 CHECK (actual_unit_count >= 0),

  -- Item-equivalent average per bank-marks-and-scoring.html §7
  final_score                NUMERIC CHECK (final_score IS NULL OR (final_score >= 0 AND final_score <= 1)),

  -- (intent, mode) tuple validation per attempt-creation §6.1.2
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


-- 14. nclex_attempt_case_snapshots — case scenarios snapshotted per attempt
-- Created BEFORE nclex_attempt_items because items has a composite FK
-- (attempt_id, parent_case_id) → (attempt_id, case_id) on this table.
CREATE TABLE nclex_attempt_case_snapshots (
  attempt_id                 UUID NOT NULL REFERENCES nclex_attempts(attempt_id) ON DELETE CASCADE,
  case_id                    TEXT NOT NULL,
  title_snapshot             TEXT NOT NULL,
  scenario_summary_snapshot  TEXT,
  tabs_snapshot_json         JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attempt_id, case_id)
);


-- 15. nclex_attempt_trend_snapshots — trend datasets snapshotted per attempt
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


-- 16. nclex_attempt_items — one row per question delivered (snapshot)
-- Composite FKs to the case/trend snapshot tables guarantee that case/trend
-- children always have their wrapper-snapshot row on the same attempt.
-- Nullable parts skip the check, so standalone questions are fine.
CREATE TABLE nclex_attempt_items (
  attempt_item_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id                 UUID NOT NULL REFERENCES nclex_attempts(attempt_id) ON DELETE CASCADE,
  position                   INTEGER NOT NULL CHECK (position > 0),

  -- Source reference (polymorphic — no FK on item_id; snapshot is source of
  -- truth at runtime so the attempt survives a source item being deleted)
  item_id                    TEXT NOT NULL,
  item_source                TEXT NOT NULL DEFAULT 'BANK' CHECK (item_source IN ('BANK','TUTOR')),
  tutor_id                   UUID REFERENCES nclex_users(id) ON DELETE SET NULL,

  -- Selection provenance (the unit selector picked QUESTION or CASE)
  selection_unit_type        TEXT NOT NULL CHECK (selection_unit_type IN ('QUESTION','CASE')),
  selection_unit_id          TEXT NOT NULL,

  -- Wrapper references (case children only / trend questions only)
  parent_case_id             TEXT,
  case_position              INTEGER CHECK (case_position IS NULL OR (case_position BETWEEN 1 AND 6)),
  cjmm_step                  TEXT CHECK (cjmm_step IS NULL OR cjmm_step IN
                               ('Recognise cues','Analyse cues','Prioritise',
                                'Generate solutions','Take action','Evaluate outcomes')),
  trend_id                   TEXT,

  -- Snapshot — granular columns (queryable / stable shape)
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

  -- Display state (shuffle_seed nullability encodes whether shuffle was on)
  shuffle_seed               INTEGER,
  option_order_json          JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (attempt_id, position),

  FOREIGN KEY (attempt_id, parent_case_id)
    REFERENCES nclex_attempt_case_snapshots(attempt_id, case_id)
    ON DELETE CASCADE,

  FOREIGN KEY (attempt_id, trend_id)
    REFERENCES nclex_attempt_trend_snapshots(attempt_id, trend_id)
    ON DELETE CASCADE,

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


-- 17. nclex_attempt_answers — one row per question the student touched
-- Lazy insert on first interaction. Separate from nclex_attempt_items
-- because items are immutable (the question delivered) and answers
-- mutate as the student edits, submits, or auto-submits.
CREATE TABLE nclex_attempt_answers (
  answer_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_item_id            UUID NOT NULL UNIQUE REFERENCES nclex_attempt_items(attempt_item_id) ON DELETE CASCADE,
  attempt_id                 UUID NOT NULL REFERENCES nclex_attempts(attempt_id) ON DELETE CASCADE,
  student_id                 UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,

  answer_json                JSONB,
  submission_status          TEXT NOT NULL DEFAULT 'DRAFT' CHECK (submission_status IN
                               ('DRAFT','SUBMITTED','AUTO_SUBMITTED','SKIPPED')),

  is_correct                 BOOLEAN,
  score_awarded              NUMERIC CHECK (score_awarded IS NULL OR score_awarded >= 0),

  -- Runner-computed (pauses on inactivity for STUDY engagement-clock; sums
  -- multi-visit spans for free-nav modes — see attempt-creation §6.3.2)
  time_spent_sec             INTEGER CHECK (time_spent_sec IS NULL OR time_spent_sec >= 0),

  -- Append-only event log of selection changes (see attempt-creation §6.3.3)
  answer_changes_json        JSONB NOT NULL DEFAULT '[]'::jsonb,

  submitted_at               TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nclex_attempt_answers_attempt          ON nclex_attempt_answers(attempt_id);
CREATE INDEX idx_nclex_attempt_answers_student          ON nclex_attempt_answers(student_id);
CREATE INDEX idx_nclex_attempt_answers_student_status   ON nclex_attempt_answers(student_id, submission_status);


-- RPC functions are large and tracked by their migration files
-- (mynclex/db/migrations/mynclex_trend_save_rpc_slice_1_12b.sql).
-- The function bodies are NOT mirrored into schema.sql to keep the
-- schema file's focus on tables + indexes + constraints. The
-- migrations folder is the authoritative source for PL/pgSQL
-- definitions; schema.sql is a shape reference.
