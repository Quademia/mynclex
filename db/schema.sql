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

  -- Public-display bag (role-agnostic). Outward-facing fields any user
  -- may show to others — today the tutor public profile (headline /
  -- speciality / years / bio + optional business branding). Shape is
  -- the TS type lib/discovery/types.ts#PublicProfile. PUBLIC-ONLY by
  -- rule: never put private/sensitive data here (those get own columns).
  -- Added slice 3.5 (20260530120000).
  public_profile        JSONB NOT NULL DEFAULT '{}'::jsonb,

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
                              ('MCQ','TF','SATA','SELECT_N','MATRIX','MATRIX_MR',
                               'HIGHLIGHT','CLOZE','DRAG_DROP','DRAG_CLOZE','DRAG_ORDER','BOWTIE')),

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
  difficulty                TEXT CHECK (difficulty IN ('Very easy','Easy','Medium','Hard','Very hard')),
  bloom_level               TEXT,
  tags                      TEXT[] NOT NULL DEFAULT '{}',

  -- Visibility and packaging
  is_free_sample            BOOLEAN NOT NULL DEFAULT FALSE,
  is_builder_visible        BOOLEAN NOT NULL DEFAULT TRUE,
  is_published              BOOLEAN NOT NULL DEFAULT FALSE,

  -- Housekeeping
  -- marks is system-managed — derived from the answer key by the editor
  -- save handler (lib/scoring/computeMarksFromKey). The DEFAULT 1 is a
  -- safety net for rows that bypass the editor; in practice every save
  -- writes a recomputed value. See bank-marks-and-scoring.html §5.
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
-- Classification lives on the CHILD questions only (wrapper-v2 decision
-- 9.2); the seven legacy case-level classification columns were dropped
-- in 20260719120000 — the builder derives a case's match from its
-- children. `tags` survives: a tag on the case counts as a tag on every
-- child in the student builder (20260717120000).
CREATE TABLE nclex_case_studies (
  case_id                   TEXT PRIMARY KEY,
  title                     TEXT NOT NULL,
  scenario_summary          TEXT,

  -- Chart tabs live in nclex_case_study_tabs (child table, added in Slice 1.11a).

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
-- Reshaped 20260721120000: item_ids TEXT[] → the link table below;
-- price_cents → the products catalogue (nclex_products).
CREATE TABLE nclex_readiness_packs (
  pack_id                   TEXT PRIMARY KEY,
  title                     TEXT NOT NULL,
  description               TEXT,
  n                         INTEGER,
  time_limit_sec            INTEGER,
  published                 BOOLEAN NOT NULL DEFAULT FALSE,
  publish_at                TIMESTAMPTZ,
  unpublish_at              TIMESTAMPTZ,
  status                    TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','active','archived')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7b. Pack membership (20260721120000) — one row per question-in-a-pack,
-- per-child rows for wrapper members (the nclex_attempt_items flattening
-- pattern at authoring time — readiness-packs.md §6). Global
-- UNIQUE(item_id): a question belongs to at most ONE pack, DB-enforced.
-- id = '<pack_id>:<item_id>' — composite on purpose, so an audit row's
-- entity_id names both halves even after the link row is deleted.
CREATE TABLE nclex_readiness_pack_items (
  id          TEXT PRIMARY KEY,
  pack_id     TEXT NOT NULL REFERENCES nclex_readiness_packs(pack_id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES nclex_bank_items(item_id) ON DELETE RESTRICT,
  position    INTEGER NOT NULL CHECK (position >= 1),   -- sat order; completeness owned by the publish gate
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id),
  UNIQUE (pack_id, position)
);


-- 8. Tutor-private questions (same shape as nclex_bank_items + tutor_id)
CREATE TABLE nclex_tutor_questions (
  item_id                   TEXT PRIMARY KEY,
  tutor_id                  UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  question_type             TEXT NOT NULL CHECK (question_type IN
                              ('MCQ','TF','SATA','SELECT_N','MATRIX','MATRIX_MR',
                               'HIGHLIGHT','CLOZE','DRAG_DROP','DRAG_CLOZE','DRAG_ORDER','BOWTIE')),

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
  difficulty                TEXT CHECK (difficulty IN ('Very easy','Easy','Medium','Hard','Very hard')),
  bloom_level               TEXT,
  tags                      TEXT[] NOT NULL DEFAULT '{}',

  is_free_sample            BOOLEAN NOT NULL DEFAULT FALSE,
  is_builder_visible        BOOLEAN NOT NULL DEFAULT TRUE,
  is_published              BOOLEAN NOT NULL DEFAULT FALSE,

  -- marks is system-managed — derived from the answer key by the editor
  -- save handler (lib/scoring/computeMarksFromKey). See nclex_bank_items
  -- above for the full note.
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
-- Legacy classification columns dropped in 20260719120000 (see the
-- admin twin above); tags survive.
CREATE TABLE nclex_tutor_case_studies (
  case_id                   TEXT PRIMARY KEY,
  tutor_id                  UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  title                     TEXT NOT NULL,
  scenario_summary          TEXT,

  -- Chart tabs live in nclex_tutor_case_study_tabs (child table, added in Slice 1.11a).

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
-- The stimulus lives entirely in nclex_trend_tabs — the old flat-grid
-- columns (row_label / timepoints / rows) were retired in 20260714120000.
-- `kind` (a single-dataset descriptor from the flat-grid era) was retired
-- in 20260715120000 — a trend is now a group of chart tabs, each titled.
-- `tags` added in 20260718120000 (case-wrapper symmetry): a tag on a
-- trend counts as a tag on every linked question in the student builder.
CREATE TABLE nclex_trend_datasets (
  trend_id            TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  scenario            TEXT,
  tags                TEXT[] NOT NULL DEFAULT '{}',
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
  tags                TEXT[] NOT NULL DEFAULT '{}',
  is_published        BOOLEAN NOT NULL DEFAULT FALSE,
  is_free_sample      BOOLEAN NOT NULL DEFAULT FALSE,
  is_builder_visible  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nclex_tutor_trend_datasets_tutor
  ON nclex_tutor_trend_datasets(tutor_id);


-- Trend chart tabs (rich multi-chart, added 20260712120000). Mirror of
-- nclex_case_study_tabs — one row per tab per dataset. Trend is a fresh
-- v2-only build, so `entries` holds the rich v2 blob (merge-table list
-- or narrative); unlike case study there is no progressive disclosure.
CREATE TABLE nclex_trend_tabs (
  tab_id        TEXT PRIMARY KEY,
  trend_id      TEXT NOT NULL REFERENCES nclex_trend_datasets(trend_id) ON DELETE CASCADE,
  tab_key       TEXT NOT NULL,
  title         TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  is_custom     BOOLEAN NOT NULL DEFAULT FALSE,
  custom_shape  TEXT,
  columns_def   JSONB NOT NULL DEFAULT '[]'::jsonb,
  entries       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trend_id, display_order),
  CHECK (tab_key <> ''),
  CHECK (display_order >= 0),
  CHECK (
    (is_custom = FALSE AND custom_shape IS NULL)
    OR
    (is_custom = TRUE  AND custom_shape IN ('free_text', 'rows_cols'))
  )
);

CREATE INDEX idx_nclex_trend_tabs_trend ON nclex_trend_tabs(trend_id);

CREATE TABLE nclex_tutor_trend_tabs (
  tab_id        TEXT PRIMARY KEY,
  trend_id      TEXT NOT NULL REFERENCES nclex_tutor_trend_datasets(trend_id) ON DELETE CASCADE,
  tab_key       TEXT NOT NULL,
  title         TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  is_custom     BOOLEAN NOT NULL DEFAULT FALSE,
  custom_shape  TEXT,
  columns_def   JSONB NOT NULL DEFAULT '[]'::jsonb,
  entries       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trend_id, display_order),
  CHECK (tab_key <> ''),
  CHECK (display_order >= 0),
  CHECK (
    (is_custom = FALSE AND custom_shape IS NULL)
    OR
    (is_custom = TRUE  AND custom_shape IN ('free_text', 'rows_cols'))
  )
);

CREATE INDEX idx_nclex_tutor_trend_tabs_trend ON nclex_tutor_trend_tabs(trend_id);


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
  -- Engagement clock (STUDY, TIMED_FREE_NAV only): engaged seconds spent so
  -- far. remaining = duration_seconds - engaged_seconds_used. NULL elsewhere
  -- / before first save = treated as 0. Written only by
  -- nclex_record_engaged_time (monotonic, clamped to duration).
  -- Migration 20260815120000_engagement_clock.sql.
  engaged_seconds_used       INTEGER
                               CHECK (engaged_seconds_used IS NULL OR engaged_seconds_used >= 0),
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

  -- Pass threshold this attempt is graded against (0..1 fraction).
  -- Added Tutor-Quiz slice 3. General-purpose (not programme-only):
  -- bank Builder + future Readiness Packs can populate it later.
  -- NULL = ungraded; the runner renders just "Score · NN%" instead
  -- of "Score · NN% · Pass/Fail".
  pass_score                 NUMERIC CHECK (pass_score IS NULL OR (pass_score >= 0 AND pass_score <= 1)),

  -- (intent, mode) tuple validation per attempt-creation §6.1.2.
  -- SIX tuples, three per intent. Was eight until 2026-07-24, when
  -- (EXAM, UNTIMED_TEST) and (STUDY, TIMED_SEQUENTIAL) were removed as
  -- duplicates of their twins under the other intent — migration
  -- 20260814120000_modes_remove_two_tuples.sql carries the full reasoning.
  -- Note no mode was deleted: both still exist under one intent.
  CONSTRAINT nclex_attempts_intent_mode_tuple CHECK (
    (intent, mode) IN (
      -- STUDY — your own pace, resumable
      ('STUDY','UNTIMED_LEARNING'),
      ('STUDY','UNTIMED_TEST'),
      ('STUDY','TIMED_FREE_NAV'),
      -- EXAM — one bounded sitting, all timed
      ('EXAM', 'TIMED_FREE_NAV'),
      ('EXAM', 'TIMED_SEQUENTIAL'),
      ('EXAM', 'CAT')
    )
  ),

  -- programme_id + quiz_id (Tutor Quiz Slice 6, 2026-05-20) —
  -- populated ONLY for standalone PROGRAMME_ASSIGNED attempts
  -- (those that launched from the Slice 6 student Quizzes page
  -- without an underlying activity). Activity-linked attempts
  -- leave both NULL; the (programme, quiz) tuple is derivable via
  -- the activity JOIN.
  programme_id               UUID REFERENCES nclex_programmes(programme_id) ON DELETE SET NULL,
  quiz_id                    UUID REFERENCES nclex_tutor_quizzes(quiz_id) ON DELETE SET NULL,

  -- Source-specific reference columns: at most one populated, matching the source.
  -- The PROGRAMME_ASSIGNED branch was relaxed in Tutor Quiz Slice 6
  -- (2026-05-20) to permit a standalone shape (programme_activity_id
  -- NULL + programme_id + quiz_id NOT NULL) alongside the original
  -- activity-linked shape.
  CONSTRAINT nclex_attempts_source_refs CHECK (
    (source = 'CUSTOM_BUILT'        AND readiness_pack_id IS NULL AND programme_activity_id IS NULL AND programme_id IS NULL AND quiz_id IS NULL)
    OR (source = 'READINESS_PACK'   AND readiness_pack_id IS NOT NULL AND programme_activity_id IS NULL AND programme_id IS NULL AND quiz_id IS NULL)
    OR (
      source = 'PROGRAMME_ASSIGNED'
      AND (
        (programme_activity_id IS NOT NULL AND programme_id IS NULL AND quiz_id IS NULL)
        OR
        (programme_activity_id IS NULL AND programme_id IS NOT NULL AND quiz_id IS NOT NULL)
      )
    )
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
-- Slice 6 — partial index for the per-(student, quiz, programme)
-- cap count on standalone attempts.
CREATE INDEX idx_nclex_attempts_standalone_quiz    ON nclex_attempts(student_id, programme_id, quiz_id)
  WHERE source = 'PROGRAMME_ASSIGNED' AND programme_activity_id IS NULL;


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
  -- Frozen chart tabs (rich multi-chart, Slice 3b). Mirror of
  -- nclex_attempt_case_snapshots.tabs_snapshot_json. The flat-grid
  -- snapshot columns were retired in 20260714120000; kind_snapshot in
  -- 20260715120000.
  tabs_snapshot_json         JSONB NOT NULL DEFAULT '[]'::jsonb,
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
                               ('MCQ','TF','SATA','SELECT_N','MATRIX','MATRIX_MR',
                                'HIGHLIGHT','CLOZE','DRAG_DROP','DRAG_CLOZE','DRAG_ORDER','BOWTIE')),
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


-- =========================================================
-- Added 2026-05-06 in Slice 2.1.5 — Mark-for-review table
-- =========================================================
-- One row per (student, target). Drives the runner's mark-for-
-- review toggle and the builder's "Marked" pool filter. Marking is
-- the student's own state, independent of correct/incorrect, and
-- persists across attempts — so it lives in its own table.
-- Polymorphic target (QUESTION / CASE x BANK / TUTOR); no FK on
-- target_id (mirrors the attempt-items convention). Origin
-- migration: db/migrations/20260506140000_slice_2_1_5_question_marks.sql.

CREATE TABLE nclex_question_marks (
  mark_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,

  -- Target reference (polymorphic — no FK on target_id)
  target_kind    TEXT NOT NULL CHECK (target_kind IN ('QUESTION','CASE')),
  target_source  TEXT NOT NULL CHECK (target_source IN ('BANK','TUTOR')),
  target_id      TEXT NOT NULL,
  tutor_id       UUID REFERENCES nclex_users(id) ON DELETE CASCADE,

  marked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Tutor sourcing requires tutor_id; bank sourcing leaves it null
  CONSTRAINT nclex_question_marks_tutor_id_consistent CHECK (
    (target_source = 'BANK'  AND tutor_id IS NULL)
    OR (target_source = 'TUTOR' AND tutor_id IS NOT NULL)
  )
);

-- Uniqueness invariants — one mark per (student, kind, target).
-- Split by source because PG treats NULL as distinct in unique
-- constraints (a single combined constraint would let the same
-- bank item be marked twice with tutor_id NULL on both rows).
CREATE UNIQUE INDEX nclex_question_marks_bank_unique
  ON nclex_question_marks (student_id, target_kind, target_id)
  WHERE target_source = 'BANK';

CREATE UNIQUE INDEX nclex_question_marks_tutor_unique
  ON nclex_question_marks (student_id, target_kind, tutor_id, target_id)
  WHERE target_source = 'TUTOR';

CREATE INDEX idx_nclex_question_marks_student_kind
  ON nclex_question_marks (student_id, target_kind);


-- =========================================================
-- Programme tables (Slice 9.1a, 2026-05-10)
-- =========================================================
-- The first table on the Programme side. Tutor-owned programmes plug
-- into Phase 4 of the Journey Tracker. Programme = reusable design
-- (curriculum + identity + pricing); cohort = one specific run
-- (dates, seats, enrolment, schedule). Two-layer model settled
-- 2026-05-10; curriculum architecture rework (blocks/units/dual
-- delivery modes/decoupled unit_label) settled 2026-05-11.
--
-- Source of truth: docs/product-plan/main.md (Programme structure,
-- Cohort layer, Self-paced surface, Pricing), curriculum-authoring-
-- ux.md (delivery mode + unit label + curriculum rework),
-- payments-and-enrolment.md (price location, v1 deferrals).
--
-- Schema is provisional — programme work is in build; expect
-- revisions during build.

CREATE TABLE nclex_programmes (
  programme_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id              UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,

  -- Identity
  title                 TEXT NOT NULL,
  tagline               TEXT,
  description           TEXT,

  -- Shape
  delivery_mode         TEXT NOT NULL DEFAULT 'TUTOR_LED'
                        CHECK (delivery_mode IN ('TUTOR_LED','SELF_PACED')),
  unit_label            TEXT NOT NULL DEFAULT 'WEEK'         -- decoupled from delivery_mode
                        CHECK (unit_label IN ('WEEK','MODULE')),
  length_units          SMALLINT NOT NULL                    -- count of curriculum units
                        CHECK (length_units BETWEEN 1 AND 52),

  -- Pricing (Slice 3a — single tutor-chosen currency vs the bank's
  -- deliberate dual-currency PPP on nclex_products). The tutor settles
  -- in one currency; an FX "≈ equivalent" public display is deferred
  -- polish.
  --
  -- The price amount lives on nclex_programme_payment_strategies (one
  -- row per plan; UPFRONT_FULL is the canonical full-price plan). Slice
  -- 7e retired the legacy price_minor column on this table — two copies
  -- of the same number = drift risk. The public view derives a headline
  -- from active plans (upfront total when offered, else min initial).
  price_currency        TEXT NOT NULL
                        CHECK (price_currency IN ('GHS','USD')),
  show_price_publicly   BOOLEAN NOT NULL DEFAULT TRUE,
  -- OFF_PLATFORM (tutor collects + adds students) | ON_PLATFORM
  -- (Paystack checkout). No runtime effect until Slice 5. Self-paced
  -- must be ON_PLATFORM (enforced in TS).
  payment_collection_mode TEXT NOT NULL DEFAULT 'OFF_PLATFORM'
                        CHECK (payment_collection_mode IN ('OFF_PLATFORM','ON_PLATFORM')),
  -- NULL = lifetime of tutor's sub (Pattern A). Otherwise N days from
  -- enrolled_at; the deferred EXPIRED/PAUSED pg_cron sweep reads this.
  access_window_days    INTEGER
                        CHECK (access_window_days IS NULL OR access_window_days > 0),
  -- Does a missed payment gate access on this programme? TRUE (default) =
  -- the nightly sweep PAUSEs students overdue on a deposit/installment plan
  -- (today's behaviour). FALSE = a tutor opt-out: missed payments never
  -- pause access here (money is still tracked, just not enforced). Read by
  -- the sweep's pause step; toggling it off also auto-resumes the
  -- programme's payment-paused students (app action). See
  -- payments-and-enrolment.md "Settled 2026-06-24".
  payment_gates_access  BOOLEAN NOT NULL DEFAULT TRUE,

  -- Lifecycle. CANCELLED moved to nclex_cohorts.cancelled_at.
  status                TEXT NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  published_at          TIMESTAMPTZ,
  archived_at           TIMESTAMPTZ,

  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nclex_programmes_tutor   ON nclex_programmes(tutor_id);
CREATE INDEX idx_nclex_programmes_public  ON nclex_programmes(status) WHERE status = 'PUBLISHED';
-- Slice 3a — discovery filter on collection mode (published rows only).
CREATE INDEX idx_nclex_programmes_collection_public
  ON nclex_programmes(payment_collection_mode) WHERE status = 'PUBLISHED';


-- 14. Cohorts (slice 9.2a — programme/cohort split)
-- One row per cohort run of a tutor-led programme. Self-paced
-- programmes have no cohort rows; enrolments link directly to the
-- programme with cohort_id = NULL.
--
-- Status (UPCOMING / IN_PROGRESS / ENDED / CANCELLED) is NOT stored.
-- The first three derive from (start_date, end_date, today) in TS
-- (`cohortStatus()` helper); only CANCELLED is persisted via
-- cancelled_at IS NOT NULL.

CREATE TABLE nclex_cohorts (
  cohort_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id     UUID NOT NULL
                   REFERENCES nclex_programmes(programme_id)
                   ON DELETE CASCADE,

  name             TEXT,                                     -- NULL → UI auto-generates from dates

  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  cohort_size      INTEGER                                   -- nullable: blank = no cap
                   CHECK (cohort_size IS NULL OR cohort_size > 0),
  allow_late_join  BOOLEAN NOT NULL DEFAULT FALSE,

  cancelled_at     TIMESTAMPTZ,                              -- only persisted lifecycle field

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT nclex_cohorts_dates_ok CHECK (end_date >= start_date)
);

CREATE INDEX idx_nclex_cohorts_programme ON nclex_cohorts(programme_id);


-- =========================================================
-- Curriculum tables (Slice 9.3a, 2026-05-12)
-- =========================================================
-- A programme's curriculum: units -> (optional) blocks -> activities.
--   nclex_programme_units       — top-level pacing/grouping container
--                                 (rendered "Week N" / "Module N").
--   nclex_programme_blocks      — optional workflow grouping of related
--                                 activities within a unit.
--   nclex_programme_activities  — the leaf nodes; one per Text / PDF /
--                                 External link / Online live session /
--                                 Mock / Practice quiz.
-- Activity payload is flexible JSONB (no DB-level shape enforcement —
-- the per-type contract is the TS discriminated union in
-- lib/curriculum/types.ts). Origin migration:
-- db/migrations/20260512200000_slice_9_3a_curriculum_schema.sql.
-- The unit-count reconciliation triggers (slice 9.1d) are functions —
-- see the migrations folder, per the RPC note at the foot of this file.
-- (9.3f also shipped a cohort-checklist seed trigger. It was RETIRED
-- on 2026-06-25 — see the note on nclex_cohort_checklist_items below.)

CREATE TABLE nclex_programme_units (
  unit_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id     UUID NOT NULL
                   REFERENCES nclex_programmes(programme_id)
                   ON DELETE CASCADE,

  -- Position in the programme (1 .. programme.length_units).
  unit_index       INTEGER NOT NULL CHECK (unit_index >= 1),

  -- Tutor-set title; NULL falls back to "Week N" / "Module N".
  title            TEXT,
  description      TEXT,

  is_published     BOOLEAN NOT NULL DEFAULT FALSE,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT nclex_programme_units_slot_unique
    UNIQUE (programme_id, unit_index)
);

CREATE INDEX idx_nclex_programme_units_programme
  ON nclex_programme_units(programme_id);


CREATE TABLE nclex_programme_blocks (
  block_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id          UUID NOT NULL
                   REFERENCES nclex_programme_units(unit_id)
                   ON DELETE CASCADE,

  -- Cohort-specific activities (Slice 1, 20260702120000): NULL =
  -- template block (shared by every cohort of the programme); set =
  -- cohort-only block (belongs to that one run, never propagates).
  cohort_id        UUID
                   REFERENCES nclex_cohorts(cohort_id)
                   ON DELETE CASCADE,

  -- Position within the unit body (shares a numeric space with
  -- loose activities' ordinal; reorder renumbers both atomically).
  ordinal          INTEGER NOT NULL CHECK (ordinal >= 1),

  title            TEXT NOT NULL,
  description      TEXT,

  is_published     BOOLEAN NOT NULL DEFAULT FALSE,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nclex_programme_blocks_unit
  ON nclex_programme_blocks(unit_id);

-- Partial — only cohort-only blocks carry a non-NULL cohort_id
-- (20260702120000).
CREATE INDEX idx_nclex_programme_blocks_cohort
  ON nclex_programme_blocks(cohort_id)
  WHERE cohort_id IS NOT NULL;


-- The `description` column and the ONLINE_LIVE_SESSION type name
-- both arrived in Slice 9.3d-a (the type was originally
-- LIVE_SESSION); shown here in final state.
CREATE TABLE nclex_programme_activities (
  activity_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Activity always belongs to a unit. Activities inside a block
  -- also carry the block's unit_id (kept denormalised so the
  -- units-overview count query needs no join through blocks).
  unit_id          UUID NOT NULL
                   REFERENCES nclex_programme_units(unit_id)
                   ON DELETE CASCADE,

  -- Optional parent block. NULL -> loose under the unit.
  block_id         UUID
                   REFERENCES nclex_programme_blocks(block_id)
                   ON DELETE CASCADE,

  -- Cohort-specific activities (Slice 1, 20260702120000): NULL =
  -- template activity; set = cohort-only (one run). Per-cohort scoping
  -- is enforced in the TS delivery layer (students read THROUGH the
  -- cohort-keyed checklist), so no extra RLS was needed.
  cohort_id        UUID
                   REFERENCES nclex_cohorts(cohort_id)
                   ON DELETE CASCADE,

  -- Position within immediate parent (unit body or block).
  ordinal          INTEGER NOT NULL CHECK (ordinal >= 1),

  type             TEXT NOT NULL
                   CHECK (type IN (
                     'TEXT',
                     'PDF',
                     'EXTERNAL_LINK',
                     'ONLINE_LIVE_SESSION',
                     'MOCK',
                     'PRACTICE_QUIZ'
                   )),

  title            TEXT NOT NULL,

  -- "What the activity is about" (substantive) — added 9.3d-a.
  description      TEXT,

  -- "Note to student" — operational directive under the title.
  note             TEXT,

  -- Type-specific fields; the TS discriminated union carries the
  -- contract. The DB stores any JSONB.
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,

  is_published     BOOLEAN NOT NULL DEFAULT FALSE,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nclex_programme_activities_unit
  ON nclex_programme_activities(unit_id);

CREATE INDEX idx_nclex_programme_activities_block
  ON nclex_programme_activities(block_id)
  WHERE block_id IS NOT NULL;

-- Partial — only cohort-only activities carry a non-NULL cohort_id
-- (20260702120000).
CREATE INDEX idx_nclex_programme_activities_cohort
  ON nclex_programme_activities(cohort_id)
  WHERE cohort_id IS NOT NULL;


-- =========================================================
-- Cohort curriculum checklist (Slice 9.3f, 2026-05-14;
-- due_date + close_date added Slice 10.7, 2026-05-15)
-- =========================================================
-- The cohort layer's curation surface. The programme owns the
-- curriculum template; the cohort-side row stores only what's
-- cohort-specific: inclusion flag + the activity window
-- (release -> due -> close). Cohort = pointer to template, not a
-- copy. Origin migrations:
-- db/migrations/20260514120000_slice_9_3f_cohort_checklist.sql,
-- db/migrations/20260515160000_slice_10_7_activity_window.sql.
-- There is NO seed-on-cohort-INSERT trigger. One shipped with 9.3f and
-- was dropped on 2026-06-25 (migration
-- 20260625130000_drop_cohort_checklist_seed_trigger.sql) when the
-- checklist stopped being a snapshot taken at cohort creation and
-- became an OVERRIDE on the LIVE template. Three states:
--   • no row      — unconfigured. The TUTOR sees the activity rendered
--                   from the template with default dates; STUDENTS do
--                   not see it at all.
--   • is_included — TRUE = included, FALSE = excluded.
-- A row appears on the tutor's first explicit action, or in bulk via
-- the "N unconfigured → Include all" affordance
-- (includeAllUnconfiguredActivitiesAction). So a brand-new cohort
-- correctly starts with ZERO rows — that is the design, not a missing
-- seed. Rows seeded by the old trigger were left in place as valid
-- overrides, which is why some older cohorts hold more rows than their
-- programme currently has activities.

CREATE TABLE nclex_cohort_checklist_items (
  checklist_item_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cohort_id             UUID NOT NULL
                        REFERENCES nclex_cohorts(cohort_id)
                        ON DELETE CASCADE,

  template_activity_id  UUID NOT NULL
                        REFERENCES nclex_programme_activities(activity_id)
                        ON DELETE CASCADE,

  -- Cohort-side controls.
  is_included           BOOLEAN NOT NULL DEFAULT TRUE,

  -- Activity window. release_date is trigger-seeded + NOT NULL;
  -- due_date (soft target) and close_date (hard gate) are nullable,
  -- tutor-set. Ordering (release <= due <= close) is validated in
  -- the server actions, not as a DB CHECK.
  release_date          DATE NOT NULL,
  due_date              DATE,
  close_date            DATE,

  -- Reserved for future COHORT_ONLY adds; v1 only writes 'TEMPLATE'.
  source                TEXT NOT NULL DEFAULT 'TEMPLATE'
                        CHECK (source IN ('TEMPLATE', 'COHORT_ONLY')),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (cohort_id, template_activity_id)
);

CREATE INDEX idx_nclex_cohort_checklist_cohort
  ON nclex_cohort_checklist_items(cohort_id);
CREATE INDEX idx_nclex_cohort_checklist_activity
  ON nclex_cohort_checklist_items(template_activity_id);


-- =========================================================
-- Cohort live-session planner (Live sessions Slice 1b, 2026-06-15)
-- =========================================================
-- A live session is an EVENT, not content — its date, connection
-- details, and recording are PER-RUN. The TEMPLATE marker (an
-- ONLINE_LIVE_SESSION activity) keeps only identity + position + an
-- optional typical_duration_minutes; this per-(cohort, marker) table
-- holds the per-run schedule. A marker with no row = "unscheduled" for
-- that cohort. Origin migration:
-- db/migrations/20260703120000_live_session_marker_planner.sql.

CREATE TABLE nclex_cohort_live_sessions (
  session_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cohort_id            UUID NOT NULL
                       REFERENCES nclex_cohorts(cohort_id)
                       ON DELETE CASCADE,

  -- The live-session MARKER this schedule belongs to (template or
  -- cohort-only). CASCADE removes the schedule when the marker goes.
  marker_activity_id   UUID NOT NULL
                       REFERENCES nclex_programme_activities(activity_id)
                       ON DELETE CASCADE,

  scheduled_at         TIMESTAMPTZ,         -- UTC; NULL = unscheduled
  duration_minutes     INTEGER,             -- override; falls back to the marker's typical
  platform             TEXT
                       CHECK (platform IS NULL OR platform IN
                         ('ZOOM', 'GOOGLE_MEET', 'MS_TEAMS', 'OTHER')),
  join_url             TEXT,
  meeting_id           TEXT,
  passcode             TEXT,
  joining_instructions TEXT,
  recording_url        TEXT,                -- filled after the session airs

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (cohort_id, marker_activity_id),

  CONSTRAINT nclex_cohort_live_sessions_duration_positive
    CHECK (duration_minutes IS NULL OR duration_minutes > 0)
);

CREATE INDEX idx_nclex_cohort_live_sessions_cohort
  ON nclex_cohort_live_sessions(cohort_id);
CREATE INDEX idx_nclex_cohort_live_sessions_marker
  ON nclex_cohort_live_sessions(marker_activity_id);


-- =========================================================
-- Cohort session attendance register (Live sessions Slice 3, 2026-06-16)
-- =========================================================
-- One row per (planner session, student). Tutor-marked attendance is the
-- "only verified completion counts" signal for live sessions: PRESENT
-- derives an ATTENDANCE row in nclex_student_activity_progress (via the
-- nclex_progress_on_attendance() trigger, tracked in the migration, not
-- mirrored here); ABSENT / EXCUSED derive nothing (EXCUSED also drops out
-- of the % denominator at read time). Origin migration:
-- db/migrations/20260704120000_live_session_attendance.sql.

CREATE TABLE nclex_cohort_session_attendance (
  attendance_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id      UUID NOT NULL
                  REFERENCES nclex_cohort_live_sessions(session_id)
                  ON DELETE CASCADE,
  student_id      UUID NOT NULL
                  REFERENCES nclex_users(id)
                  ON DELETE CASCADE,

  status          TEXT NOT NULL
                  CHECK (status IN ('PRESENT', 'ABSENT', 'EXCUSED')),

  marked_by       UUID
                  REFERENCES nclex_users(id)
                  ON DELETE SET NULL,
  marked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (session_id, student_id)
);

CREATE INDEX idx_nclex_cohort_session_attendance_session
  ON nclex_cohort_session_attendance(session_id);
CREATE INDEX idx_nclex_cohort_session_attendance_student
  ON nclex_cohort_session_attendance(student_id);


-- =========================================================
-- Media assets (Slice 9.3d-b, 2026-05-13)
-- =========================================================
-- Centralised media-asset control records. The file bytes live in
-- object storage (Supabase Storage for v1); this row is the
-- control record — who uploaded it, who owns it, what it's for,
-- what state it's in, where it physically lives. First consumer:
-- PDF activity. Origin migration:
-- db/migrations/20260513120000_slice_9_3d_b_media_assets.sql.

CREATE TABLE nclex_media_assets (
  asset_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Coarse classification (filtering / admin views).
  media_type        TEXT NOT NULL
                    CHECK (media_type IN ('IMAGE','PDF','VIDEO','OTHER')),

  -- Fine-grained classification — drives bucket choice, MIME
  -- allow-list, size cap at the app layer (PURPOSE_CONFIG). Free
  -- text at the DB level so new purposes are a TS-only edit.
  purpose           TEXT NOT NULL,

  storage_provider  TEXT NOT NULL DEFAULT 'SUPABASE'
                    CHECK (storage_provider IN
                      ('SUPABASE','CLOUDFLARE_R2','CLOUDFLARE_STREAM','EXTERNAL')),

  bucket            TEXT NOT NULL,

  -- Server-generated, UUID-based: {purpose}/{uuid}.{ext}.
  storage_path      TEXT NOT NULL,

  -- What the user saw on disk. Display-only.
  original_filename TEXT NOT NULL,

  mime_type         TEXT NOT NULL,
  size_bytes        BIGINT NOT NULL CHECK (size_bytes >= 0),

  status            TEXT NOT NULL DEFAULT 'UPLOADING'
                    CHECK (status IN ('UPLOADING','READY','DELETED','PURGED')),

  -- Who pressed upload. Immutable. ON DELETE RESTRICT preserves
  -- audit integrity.
  uploaded_by       UUID NOT NULL
                    REFERENCES nclex_users(id) ON DELETE RESTRICT,

  -- Who controls edit/delete. NULL = platform-owned. ON DELETE
  -- SET NULL — a deleted owner's asset becomes platform-owned.
  owner_user_id     UUID
                    REFERENCES nclex_users(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (storage_provider, bucket, storage_path)
);

CREATE INDEX idx_nclex_media_assets_owner_status
  ON nclex_media_assets(owner_user_id, status);
CREATE INDEX idx_nclex_media_assets_purpose_status
  ON nclex_media_assets(purpose, status);
CREATE INDEX idx_nclex_media_assets_uploaded_by
  ON nclex_media_assets(uploaded_by);

-- Storage bucket for tutor-uploaded PDF activity files. Private,
-- 25 MB cap, application/pdf only. Included here so a fresh
-- bootstrap reaches the same functional state as dev / prod.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nclex-pdf-activities',
  'nclex-pdf-activities',
  FALSE,
  26214400,
  ARRAY['application/pdf']
);

-- The later media buckets, same private/signed-URL posture. The
-- library pair (slices 11.6a/11.6b) was never mirrored here —
-- backfilled 2026-07-03 alongside the bank-images bucket
-- (rich-content Slice 7, migration 20260716120000).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nclex-library-images',
  'nclex-library-images',
  FALSE,
  5242880,
  ARRAY['image/png','image/jpeg','image/webp']
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nclex-library-pdfs',
  'nclex-library-pdfs',
  FALSE,
  26214400,
  ARRAY['application/pdf']
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nclex-bank-images',
  'nclex-bank-images',
  FALSE,
  5242880,
  ARRAY['image/png','image/jpeg','image/webp']
);


-- =========================================================
-- Tutor quiz tables (Tutor Quiz Slice 1, 2026-05-16)
-- =========================================================
-- The central tutor-quiz system: a reusable tutor-owned quiz plan
-- (nclex_tutor_quizzes) + its ordered list of question references
-- (nclex_tutor_quiz_items). The quiz stores references; a student
-- attempt snapshots them at attempt-creation time. Origin
-- migration: db/migrations/20260516120000_tutor_quiz_1_foundation.sql.

CREATE TABLE nclex_tutor_quizzes (
  quiz_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id         UUID NOT NULL
                   REFERENCES nclex_users(id) ON DELETE CASCADE,

  title            TEXT NOT NULL,
  description      TEXT,

  quiz_kind        TEXT NOT NULL
                   CHECK (quiz_kind IN ('MOCK', 'PRACTICE')),

  -- The four non-adaptive runner modes. CAT is excluded — it
  -- selects questions adaptively, incompatible with a fixed list.
  mode             TEXT NOT NULL
                   CHECK (mode IN (
                     'UNTIMED_LEARNING',
                     'UNTIMED_TEST',
                     'TIMED_FREE_NAV',
                     'TIMED_SEQUENTIAL'
                   )),

  -- Set for timed modes only; the mode<->duration coherence rule
  -- is app-layer (the save action), not a DB CHECK.
  duration_seconds INTEGER
                   CHECK (duration_seconds IS NULL OR duration_seconds > 0),

  -- Pass threshold as a 0..1 fraction (same scale as
  -- nclex_attempts.final_score). NULL = ungraded.
  pass_score       NUMERIC
                   CHECK (pass_score IS NULL
                          OR (pass_score >= 0 AND pass_score <= 1)),

  -- NULL = unlimited.
  max_attempts     INTEGER
                   CHECK (max_attempts IS NULL OR max_attempts >= 1),

  status           TEXT NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),

  -- Free-text tutor taxonomy for identifying + searching quizzes
  -- (migration 20260701120000). Mirrors the question tables' tags
  -- column; the system doesn't prescribe meaning.
  tags             TEXT[] NOT NULL DEFAULT '{}',

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- (quiz_kind, mode) pairing, mirroring nclex_attempts_intent_
  -- mode_tuple via MOCK -> EXAM / PRACTICE -> STUDY. There is no
  -- intent column here — intent is DERIVED at launch — so this CHECK
  -- must move whenever that one does, or a tutor could author a quiz
  -- that fails on launch. MOCK excludes UNTIMED_LEARNING (that mode
  -- reveals answers live) and cannot be CAT (own surface, metered
  -- allowance, never authored as a tutor quiz).
  -- FIVE pairs. Was seven until 2026-07-24: MOCK lost UNTIMED_TEST (an
  -- untimed mock exam is the same contradiction as Untimed Test under
  -- EXAM was) and PRACTICE lost TIMED_SEQUENTIAL (forward-only is an
  -- exam constraint, not a teaching one). Full reasoning in
  -- db/migrations/20260814120000_modes_remove_two_tuples.sql.
  CONSTRAINT nclex_tutor_quizzes_kind_mode_tuple CHECK (
    (quiz_kind, mode) IN (
      ('PRACTICE', 'UNTIMED_LEARNING'),
      ('PRACTICE', 'UNTIMED_TEST'),
      ('PRACTICE', 'TIMED_FREE_NAV'),
      ('MOCK',     'TIMED_FREE_NAV'),
      ('MOCK',     'TIMED_SEQUENTIAL')
    )
  )
);

CREATE INDEX idx_nclex_tutor_quizzes_tutor
  ON nclex_tutor_quizzes(tutor_id);


CREATE TABLE nclex_tutor_quiz_items (
  quiz_item_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id          UUID NOT NULL
                   REFERENCES nclex_tutor_quizzes(quiz_id)
                   ON DELETE CASCADE,

  -- 1-based position within the quiz; renumbered by the reorder
  -- action (no DB-level contiguity guarantee).
  position         INTEGER NOT NULL CHECK (position >= 1),

  -- Real FK — tutor-authored questions only. ON DELETE CASCADE:
  -- deleting a question drops it from any quiz referencing it
  -- (in-progress / past attempts hold snapshots, unaffected).
  item_id          TEXT NOT NULL
                   REFERENCES nclex_tutor_questions(item_id)
                   ON DELETE CASCADE,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT nclex_tutor_quiz_items_unique UNIQUE (quiz_id, item_id)
);

CREATE INDEX idx_nclex_tutor_quiz_items_quiz
  ON nclex_tutor_quiz_items(quiz_id);


-- =========================================================
-- Programme-level quiz membership (Tutor Quiz Slice 5, 2026-05-19)
-- =========================================================
-- The canonical record of "what quizzes are in this programme." Two
-- write paths feed it: the activity-save auto-mirror (saving an
-- activity with a non-null quiz_id upserts here too) and the
-- standalone-add from the /tutor/programme/[id]/quizzes page.
-- Composite PK enforces idempotency at the row level — both paths
-- can safely use ON CONFLICT DO NOTHING.
--
-- "Linked to Unit N" / "Standalone" hint on the tutor row is
-- derived from a LEFT JOIN to nclex_programme_activities — there is
-- NO `linked_via_activity_id` column. Whether a quiz is also
-- activity-linked stays consistent automatically.
--
-- Remove is BLOCK, not cascade — enforced in the remove server
-- action (§9.3). The DB only has the FK CASCADEs (which fire when
-- the programme or quiz itself is deleted).

CREATE TABLE nclex_programme_quizzes (
  programme_id  UUID NOT NULL
                REFERENCES nclex_programmes(programme_id) ON DELETE CASCADE,
  quiz_id       UUID NOT NULL
                REFERENCES nclex_tutor_quizzes(quiz_id)   ON DELETE CASCADE,

  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (programme_id, quiz_id)
);

-- Reverse-lookup index — drives the "Used in N programmes" chip on
-- /tutor/quizzes and the Slice 6 student read path keyed on quiz_id.
CREATE INDEX idx_nclex_programme_quizzes_quiz
  ON nclex_programme_quizzes(quiz_id);


-- =========================================================
-- Student activity progress (Progress engine, Slice 1, 2026-05-18)
-- =========================================================
-- One row per (student, activity) when the activity is DONE.
-- Same shape for QUIZ_ATTEMPT and MANUAL completion sources. The
-- table stores the completion record only — NOT_STARTED is
-- implicit (no row); IN_PROGRESS for quiz types is derived from
-- nclex_attempts at read time; roll-ups (unit/programme %) are
-- computed at read time too. See docs/product-plan/progress-engine.md.
--
-- Quiz completion is written by the
-- nclex_progress_on_attempt_terminal() trigger function (tracked in
-- the migration, not mirrored here). Manual completion is written
-- by Slice 2 server actions. ATTENDANCE completion (live sessions,
-- Slice 3) is written by the nclex_progress_on_attendance() trigger
-- (also migration-tracked). Origin migration:
-- db/migrations/20260518120000_progress_engine_1_foundation.sql.

CREATE TABLE nclex_student_activity_progress (
  progress_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  student_id         UUID NOT NULL
                     REFERENCES nclex_users(id)
                     ON DELETE CASCADE,

  -- Row attaches to the TEMPLATE activity, never to a cohort. A
  -- self-paced student and a cohort student share the same progress
  -- for the same activity.
  activity_id        UUID NOT NULL
                     REFERENCES nclex_programme_activities(activity_id)
                     ON DELETE CASCADE,

  completion_source  TEXT NOT NULL
                     CHECK (completion_source IN ('QUIZ_ATTEMPT', 'MANUAL', 'ATTENDANCE')),

  -- Populated only for QUIZ_ATTEMPT. ON DELETE CASCADE is the void
  -- cascade — hard-deleting an attempt removes its progress row.
  attempt_id         UUID
                     REFERENCES nclex_attempts(attempt_id)
                     ON DELETE CASCADE,

  -- NEVER updated on retake — DONE is a one-time state transition.
  completed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Who marked the row. NULL = self-marked by student_id (MANUAL).
  -- Set to the tutor for ATTENDANCE rows (live-session attendance,
  -- Slice 3) — the verified-completion signal.
  marked_by          UUID
                     REFERENCES nclex_users(id)
                     ON DELETE SET NULL,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (student_id, activity_id),

  CONSTRAINT nclex_student_activity_progress_source_consistent CHECK (
    (completion_source = 'QUIZ_ATTEMPT' AND attempt_id IS NOT NULL)
    OR (completion_source IN ('MANUAL', 'ATTENDANCE') AND attempt_id IS NULL)
  )
);

CREATE INDEX idx_nclex_student_activity_progress_activity_student
  ON nclex_student_activity_progress(activity_id, student_id);

CREATE INDEX idx_nclex_student_activity_progress_attempt
  ON nclex_student_activity_progress(attempt_id)
  WHERE attempt_id IS NOT NULL;


-- =========================================================
-- Programme payment strategies (Payments Slice 7a, 2026-05-22)
-- =========================================================
-- One row per payment plan a tutor offers on a programme. UPFRONT_FULL is
-- a real row (auto-created by the 7a backfill, deactivatable), so this
-- table is the single source of truth for programme amounts. Currency is
-- inherited from the programme (price_currency), not stored here.
-- UNIQUE (programme_id, kind) → at most one plan of each kind. Defined
-- BEFORE enrolments/payments so their strategy_id FKs resolve on a fresh
-- bootstrap. Origin migration:
-- db/migrations/20260606120000_slice_7a_payment_strategies.sql.

CREATE TABLE nclex_programme_payment_strategies (
  strategy_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id         UUID NOT NULL
                       REFERENCES nclex_programmes(programme_id) ON DELETE CASCADE,
  -- Per-cohort override (2026-06-22, migration 20260705120000): NULL = the
  -- programme default (every existing row); set = this cohort's own plan
  -- (clone-and-edit). Checkout reads a cohort's rows if any, else defaults.
  cohort_id            UUID
                       REFERENCES nclex_cohorts(cohort_id) ON DELETE CASCADE,
  kind                 TEXT NOT NULL
                       CHECK (kind IN ('UPFRONT_FULL','DEPOSIT_BALANCE','EQUAL_INSTALLMENTS')),
  label                TEXT,                                      -- optional tutor display name
  total_price_minor    INTEGER NOT NULL CHECK (total_price_minor   >= 0),  -- minor units, programme's currency
  initial_price_minor  INTEGER NOT NULL CHECK (initial_price_minor >= 0),  -- paid at checkout (full/deposit/installment 1)
  installment_count            SMALLINT
                               CHECK (installment_count IS NULL OR installment_count BETWEEN 2 AND 12),
  installment_interval_days    SMALLINT
                               CHECK (installment_interval_days IS NULL OR installment_interval_days > 0),
  balance_due_days_after_enrolment SMALLINT
                               CHECK (balance_due_days_after_enrolment IS NULL OR balance_due_days_after_enrolment >= 0),
  is_active            BOOLEAN  NOT NULL DEFAULT TRUE,            -- hide-not-delete
  sort_order           SMALLINT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nclex_pps_initial_le_total CHECK (initial_price_minor <= total_price_minor),
  -- Per-kind field shape: each kind uses only its own optional fields.
  CONSTRAINT nclex_pps_kind_fields CHECK (
    (kind = 'UPFRONT_FULL'
       AND initial_price_minor = total_price_minor
       AND installment_count IS NULL AND installment_interval_days IS NULL
       AND balance_due_days_after_enrolment IS NULL)
    OR (kind = 'DEPOSIT_BALANCE'
       AND installment_count IS NULL AND installment_interval_days IS NULL
       AND balance_due_days_after_enrolment IS NOT NULL)
    OR (kind = 'EQUAL_INSTALLMENTS'
       AND installment_count IS NOT NULL AND installment_interval_days IS NOT NULL
       AND balance_due_days_after_enrolment IS NULL)
  )
);
CREATE INDEX idx_nclex_pps_programme_sort
  ON nclex_programme_payment_strategies (programme_id, sort_order);
-- One programme-default plan per kind, one cohort-override plan per kind
-- (per-cohort pricing, migration 20260705120000).
CREATE UNIQUE INDEX idx_nclex_pps_programme_kind
  ON nclex_programme_payment_strategies (programme_id, kind)
  WHERE cohort_id IS NULL;
CREATE UNIQUE INDEX idx_nclex_pps_cohort_kind
  ON nclex_programme_payment_strategies (cohort_id, kind)
  WHERE cohort_id IS NOT NULL;
CREATE INDEX idx_nclex_pps_cohort_sort
  ON nclex_programme_payment_strategies (cohort_id, sort_order)
  WHERE cohort_id IS NOT NULL;


-- =========================================================
-- Enrolments (Slice 1a, 2026-05-20)
-- =========================================================
-- One row = "this student is in this programme (and cohort, for
-- tutor-led)". 6-status lifecycle + enrolment source + audit + frozen
-- access expiry. Built lifecycle-ready; Slice 1 only writes
-- ENROLLED / TUTOR_ADDED. strategy_id + strategy_snapshot_json added in
-- Payments Slice 7a. Origin migration:
-- db/migrations/20260522120000_enrolments_1_foundation.sql.
-- Source of truth: docs/product-plan/payments-and-enrolment.md.

CREATE TABLE nclex_enrolments (
  enrolment_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id              UUID NOT NULL
                       REFERENCES nclex_users(id) ON DELETE CASCADE,
  programme_id         UUID NOT NULL
                       REFERENCES nclex_programmes(programme_id) ON DELETE RESTRICT,
  cohort_id            UUID                                       -- NULL for self-paced
                       REFERENCES nclex_cohorts(cohort_id) ON DELETE RESTRICT,

  status               TEXT NOT NULL
                       CHECK (status IN (
                         'PENDING_APPROVAL','ENROLLED','PAUSED',
                         'REJECTED','CANCELLED','EXPIRED'
                       )),
  enrolment_source     TEXT NOT NULL
                       CHECK (enrolment_source IN (
                         'SELF_PAID','TUTOR_ADDED','ADMIN_GRANT'
                       )),

  enrolled_by_user_id  UUID                                       -- NULL for SELF_PAID
                       REFERENCES nclex_users(id) ON DELETE SET NULL,
  enrolled_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  approved_at          TIMESTAMPTZ,
  approved_by_user_id  UUID
                       REFERENCES nclex_users(id) ON DELETE SET NULL,

  access_expires_at    TIMESTAMPTZ,                               -- NULL = lifetime of tutor sub

  -- Payment plan the student is on (Slice 7a). NULL until 7c writes it;
  -- may stay NULL for plain upfront. RESTRICT: a plan with live enrolments
  -- can't be deleted (deactivate instead). strategy_snapshot_json freezes
  -- the plan's terms at checkout so later tutor edits don't rewrite it.
  strategy_id          UUID
                       REFERENCES nclex_programme_payment_strategies(strategy_id) ON DELETE RESTRICT,
  strategy_snapshot_json JSONB,

  paused_at            TIMESTAMPTZ,
  paused_reason        TEXT
                       CHECK (paused_reason IS NULL OR paused_reason IN (
                         'INSTALLMENT_OVERDUE','TUTOR_MANUAL'
                       )),
  terminal_at          TIMESTAMPTZ,
  tutor_note           TEXT,

  -- "Give more time" grace (Payments 7d follow-up, 2026-06-10).
  -- installment_grace_until is the active deadline the nightly sweep respects
  -- (defers the overdue pause without recording a payment); grace_history_json
  -- is an append-only log of each grant ({granted_at, granted_by, days, grace_until}).
  installment_grace_until TIMESTAMPTZ,
  grace_history_json   JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT nclex_enrolments_actor_consistent CHECK (
    (enrolment_source = 'SELF_PAID' AND enrolled_by_user_id IS NULL)
    OR (enrolment_source <> 'SELF_PAID' AND enrolled_by_user_id IS NOT NULL)
  )
);

-- One active enrolment per (student, cohort) / (student, programme);
-- terminal rows excluded so a lapsed student can re-enrol.
CREATE UNIQUE INDEX idx_nclex_enrolments_active_cohort
  ON nclex_enrolments (user_id, cohort_id)
  WHERE cohort_id IS NOT NULL
    AND status IN ('PENDING_APPROVAL','ENROLLED','PAUSED');
CREATE UNIQUE INDEX idx_nclex_enrolments_active_selfpaced
  ON nclex_enrolments (user_id, programme_id)
  WHERE cohort_id IS NULL
    AND status IN ('PENDING_APPROVAL','ENROLLED','PAUSED');
CREATE INDEX idx_nclex_enrolments_cohort_status
  ON nclex_enrolments (cohort_id, status);
CREATE INDEX idx_nclex_enrolments_user_status
  ON nclex_enrolments (user_id, status);
CREATE INDEX idx_nclex_enrolments_expiry
  ON nclex_enrolments (access_expires_at)
  WHERE status IN ('ENROLLED','PAUSED');


-- =========================================================
-- Cohort waitlist (Payments Slice 4, 2026-05-20)
-- =========================================================
-- Student-initiated interest in a cohort, captured from the PUBLIC
-- programme page WITHOUT an account. PENDING leads; the owning tutor
-- converts (→ invite + ENROLLED enrolment) or dismisses. Pre-enrolment
-- leads, so CASCADE off cohort/programme (not RESTRICT like enrolments).
-- INSERT is via the SECURITY DEFINER nclex_join_waitlist RPC only;
-- convert/dismiss run service-side. Origin migration:
-- db/migrations/20260531120000_slice_4_cohort_waitlist.sql.

CREATE TABLE nclex_cohort_waitlist (
  waitlist_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cohort_id            UUID NOT NULL
                       REFERENCES nclex_cohorts(cohort_id) ON DELETE CASCADE,
  programme_id         UUID NOT NULL                              -- denormalised from cohort (RLS)
                       REFERENCES nclex_programmes(programme_id) ON DELETE CASCADE,

  forename             TEXT NOT NULL,                            -- split name → convert creates the profile directly
  surname              TEXT NOT NULL,
  email                TEXT NOT NULL,                             -- lower-cased by the RPC
  phone                TEXT,                                      -- optional; required if a phone method chosen
  preferred_contact    TEXT[] NOT NULL DEFAULT ARRAY['EMAIL']::TEXT[],  -- subset of CALL/SMS/WHATSAPP/EMAIL
  message              TEXT,

  status               TEXT NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','CONVERTED','DISMISSED')),

  converted_enrolment_id UUID                                     -- set on CONVERTED
                       REFERENCES nclex_enrolments(enrolment_id) ON DELETE SET NULL,
  handled_by_user_id   UUID                                       -- tutor who actioned it
                       REFERENCES nclex_users(id) ON DELETE SET NULL,
  handled_at           TIMESTAMPTZ,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT nclex_waitlist_pref_contact_valid CHECK (
    array_length(preferred_contact, 1) >= 1
    AND preferred_contact <@ ARRAY['CALL','SMS','WHATSAPP','EMAIL']::TEXT[]
  ),
  CONSTRAINT nclex_waitlist_phone_when_needed CHECK (
    NOT (preferred_contact && ARRAY['CALL','SMS','WHATSAPP']::TEXT[])
    OR (phone IS NOT NULL AND btrim(phone) <> '')
  )
);

-- One pending lead per (cohort, email); converted/dismissed excluded so
-- a dismissed person can re-join.
CREATE UNIQUE INDEX idx_nclex_cohort_waitlist_pending
  ON nclex_cohort_waitlist (cohort_id, lower(email))
  WHERE status = 'PENDING';
CREATE INDEX idx_nclex_cohort_waitlist_cohort_status
  ON nclex_cohort_waitlist (cohort_id, status);


-- ────────────────────────────────────────────────────────────
-- PROGRAMME ENQUIRIES (Slice 8a) — contact-first lead capture
-- Migration: db/migrations/20260613120000_slice_8a_programme_enquiries.sql
-- ────────────────────────────────────────────────────────────
-- Public lead capture for programmes that don't expose an on-page
-- commitment path (off-platform OR price hidden). Mirrors the waitlist
-- contact-preference shape exactly. Programme-scoped, not cohort-scoped:
-- the tutor figures out cohort + scheduling during the conversation.

CREATE TABLE nclex_programme_enquiries (
  enquiry_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  programme_id         UUID NOT NULL
                       REFERENCES nclex_programmes(programme_id) ON DELETE CASCADE,

  name                 TEXT NOT NULL,                                -- single field (vs waitlist's forename+surname)
  email                TEXT NOT NULL,                                -- lower-cased by the RPC
  phone                TEXT,                                         -- optional; required if a phone method chosen
  preferred_contact    TEXT[] NOT NULL DEFAULT ARRAY['EMAIL']::TEXT[],  -- subset of CALL/SMS/WHATSAPP/EMAIL
  message              TEXT,

  status               TEXT NOT NULL DEFAULT 'NEW'
                       CHECK (status IN ('NEW','CONTACTED','CONVERTED','CLOSED')),

  contacted_at         TIMESTAMPTZ,                                  -- tutor marked Contacted (8b — renamed from forwarded_at)
  converted_enrolment_id UUID                                        -- 8c auto-stamp on email match
                       REFERENCES nclex_enrolments(enrolment_id) ON DELETE SET NULL,
  admin_notes          TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT nclex_enquiry_pref_contact_valid CHECK (
    array_length(preferred_contact, 1) >= 1
    AND preferred_contact <@ ARRAY['CALL','SMS','WHATSAPP','EMAIL']::TEXT[]
  ),
  CONSTRAINT nclex_enquiry_phone_when_needed CHECK (
    NOT (preferred_contact && ARRAY['CALL','SMS','WHATSAPP']::TEXT[])
    OR (phone IS NOT NULL AND btrim(phone) <> '')
  )
);

-- One open lead per (programme, email); converted/closed excluded so a
-- closed contact can re-enquire later.
CREATE UNIQUE INDEX idx_nclex_programme_enquiries_open
  ON nclex_programme_enquiries (programme_id, lower(email))
  WHERE status IN ('NEW','CONTACTED');
CREATE INDEX idx_nclex_programme_enquiries_programme_status
  ON nclex_programme_enquiries (programme_id, status);
-- 8c email matcher (auto-convert on enrolment).
CREATE INDEX idx_nclex_programme_enquiries_email
  ON nclex_programme_enquiries (lower(email))
  WHERE status IN ('NEW','CONTACTED');


-- ────────────────────────────────────────────────────────────
-- PAYMENTS (Slice 5.1) — catalogue, payments, subscriptions, config
-- Migration: db/migrations/20260601120000_slice_5_1_payments_schema.sql
-- RLS policies live in db/rls.sql; seed rows live in the migration.
-- ────────────────────────────────────────────────────────────

-- nclex_config — runtime-tunable key/value constants (gamma `config`
-- pattern). NON-SECRET values only. First key: bank_optin_discount.
CREATE TABLE nclex_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- nclex_products — QAcademy's buyable SKU catalogue (bank durations,
-- readiness, trial). NOT programme fees. Dual-currency by column.
--
-- 20260724120000: the two columns divide cleanly — pack_type = WHAT it
-- grants, kind = WHETHER you pay. The trial is a free BANK_DURATION
-- pass (kind='TRIAL'), not its own pack_type; 'TRIAL' was dropped from
-- the pack_type CHECK. A trial SUBSCRIPTION is identified by
-- source='SELF_TRIAL_SIGNUP', not by its pack_type.
-- 20260725120000: readiness_pack_count + bundled_readiness_credits
-- collapsed into ONE readiness_credits — both answered "how many
-- credits does activating this MINT?" (§3: bundled and standalone packs
-- are granted by the identical credit mechanism). Provenance derives
-- from pack_type.
CREATE TABLE nclex_products (
  product_id            TEXT PRIMARY KEY,                          -- slug: BANK_30D, READINESS_ALL5, NCLEX_TRIAL
  name                  TEXT NOT NULL,
  kind                  TEXT NOT NULL DEFAULT 'PAID'
                        CHECK (kind IN ('PAID','TRIAL')),
  pack_type             TEXT NOT NULL
                        CHECK (pack_type IN ('BANK_DURATION','READINESS')),
  duration_days         INTEGER,                                   -- NULL for readiness
  -- Credits minted on activation. READINESS: the SKU IS the count (>=1,
  -- free integer — no 1/3/5 rule). BANK_DURATION: bundled sweetener (0 = none).
  readiness_credits     SMALLINT NOT NULL DEFAULT 0,
  -- price_minor_* is the exact integer Paystack charges. full_price_minor_*
  -- (20260726120000) is the OPTIONAL pre-offer "was" price: decorative only,
  -- struck through on sales cards, never charged; the "% off" is derived
  -- from the pair. NULL = not on offer.
  price_minor_ghs       INTEGER NOT NULL DEFAULT 0,
  price_minor_usd       INTEGER NOT NULL DEFAULT 0,
  full_price_minor_ghs  INTEGER,
  full_price_minor_usd  INTEGER,
  status                TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE','ARCHIVED')),
  sort_order            SMALLINT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nclex_products_readiness_credits_positive
    CHECK (pack_type <> 'READINESS' OR readiness_credits >= 1),
  CONSTRAINT nclex_products_full_price_ghs_above_price
    CHECK (full_price_minor_ghs IS NULL OR full_price_minor_ghs > price_minor_ghs),
  CONSTRAINT nclex_products_full_price_usd_above_price
    CHECK (full_price_minor_usd IS NULL OR full_price_minor_usd > price_minor_usd)
);
CREATE INDEX idx_nclex_products_status_sort ON nclex_products (status, sort_order);
-- At most one trial product (the admin create form guards it too).
CREATE UNIQUE INDEX idx_nclex_products_single_trial
  ON nclex_products ((kind)) WHERE kind = 'TRIAL';

-- nclex_payments — Paystack audit trail. One row per txn; polymorphic
-- single-purpose rows (`purpose` enum + exactly one of product/programme).
CREATE TABLE nclex_payments (
  payment_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paystack_reference    TEXT,                                    -- Paystack charge id; SHARED across a checkout group's rows (5.4b) so not unique per row
  checkout_group_id     UUID NOT NULL DEFAULT gen_random_uuid(), -- order-grouping key: rows of one combined charge share it (5.4b)
  user_id               UUID REFERENCES nclex_users(id) ON DELETE SET NULL,  -- NULL while pay-first
  email                 TEXT NOT NULL,
  purpose               TEXT NOT NULL
                        CHECK (purpose IN ('BANK_PURCHASE','READINESS_PURCHASE',
                          'PROGRAMME_INITIAL','PROGRAMME_INSTALLMENT','BANK_OPTIN_AT_PROGRAMME')),
  product_id            TEXT REFERENCES nclex_products(product_id) ON DELETE RESTRICT,
  programme_id          UUID REFERENCES nclex_programmes(programme_id) ON DELETE RESTRICT,
  strategy_id           UUID REFERENCES nclex_programme_payment_strategies(strategy_id) ON DELETE RESTRICT,  -- FK added Slice 7a
  enrolment_id          UUID REFERENCES nclex_enrolments(enrolment_id) ON DELETE SET NULL,
  cohort_id             UUID REFERENCES nclex_cohorts(cohort_id) ON DELETE RESTRICT,  -- chosen cohort, carried across the Paystack round trip (5.4a)
  installment_index     SMALLINT,
  currency              TEXT NOT NULL CHECK (currency IN ('GHS','USD')),
  amount_minor          INTEGER NOT NULL,
  status                TEXT NOT NULL DEFAULT 'INIT'
                        CHECK (status IN ('INIT','PAID','SETUP_REQUIRED','ACTIVATED','FAILED','REFUNDED')),
  paystack_payload_json JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at               TIMESTAMPTZ,
  activated_at          TIMESTAMPTZ,
  -- Reconciliation (Payments 7d follow-up, 2026-06-09): PAYSTACK = money into
  -- QAcademy via Paystack; OFF_PLATFORM = a tutor recorded a cash/transfer.
  -- recorded_by_user_id = the tutor who recorded an off-platform payment.
  collection_channel    TEXT NOT NULL DEFAULT 'PAYSTACK',
  recorded_by_user_id   UUID REFERENCES nclex_users(id) ON DELETE SET NULL,
  -- programme purposes carry a programme; bank/readiness carry a product
  CONSTRAINT nclex_payments_purpose_target CHECK (
    (purpose IN ('PROGRAMME_INITIAL','PROGRAMME_INSTALLMENT') AND programme_id IS NOT NULL AND product_id IS NULL)
    OR (purpose IN ('BANK_PURCHASE','READINESS_PURCHASE','BANK_OPTIN_AT_PROGRAMME') AND product_id IS NOT NULL AND programme_id IS NULL)
  ),
  CONSTRAINT nclex_payments_programme_only_fields CHECK (
    purpose IN ('PROGRAMME_INITIAL','PROGRAMME_INSTALLMENT') OR (strategy_id IS NULL AND installment_index IS NULL)
  ),
  CONSTRAINT nclex_payments_installment_index_scope CHECK (
    purpose = 'PROGRAMME_INSTALLMENT' OR installment_index IS NULL
  ),
  CONSTRAINT nclex_payments_cohort_scope CHECK (
    cohort_id IS NULL OR purpose = 'PROGRAMME_INITIAL'
  ),
  CONSTRAINT nclex_payments_collection_channel_check CHECK (
    collection_channel IN ('PAYSTACK','OFF_PLATFORM')
  ),
  CONSTRAINT nclex_payments_recorded_by_scope CHECK (
    recorded_by_user_id IS NULL OR collection_channel = 'OFF_PLATFORM'
  )
);
CREATE INDEX idx_nclex_payments_user      ON nclex_payments (user_id);
CREATE INDEX idx_nclex_payments_email     ON nclex_payments (email);
CREATE INDEX idx_nclex_payments_enrolment ON nclex_payments (enrolment_id);
CREATE INDEX idx_nclex_payments_reference ON nclex_payments (paystack_reference);
CREATE INDEX idx_nclex_payments_group     ON nclex_payments (checkout_group_id);
CREATE INDEX idx_nclex_payments_open_status ON nclex_payments (status)
  WHERE status IN ('INIT','PAID','SETUP_REQUIRED');
-- One settled installment per position (Payments 7d follow-up).
CREATE UNIQUE INDEX idx_nclex_payments_one_settled_installment
  ON nclex_payments (enrolment_id, installment_index)
  WHERE purpose = 'PROGRAMME_INSTALLMENT' AND status IN ('PAID','ACTIVATED');
CREATE INDEX idx_nclex_payments_channel ON nclex_payments (collection_channel);

-- nclex_subscriptions — bank + readiness entitlements only (programme
-- access is the enrolment row). Stacks: new row per purchase, access = max(end_at).
CREATE TABLE nclex_subscriptions (
  subscription_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  product_id             TEXT NOT NULL REFERENCES nclex_products(product_id) ON DELETE RESTRICT,
  pack_type              TEXT NOT NULL
                         CHECK (pack_type = 'BANK_DURATION'),  -- denormalised; bank time only (20260728120000)
  source                 TEXT NOT NULL
                         CHECK (source IN ('SELF_PURCHASE','PROGRAMME_OPTIN','SELF_TRIAL_SIGNUP','ADMIN_GRANT')),
  status                 TEXT NOT NULL DEFAULT 'ACTIVE'
                         CHECK (status IN ('ACTIVE','EXPIRED','REVOKED')),
  started_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_at                 TIMESTAMPTZ,                              -- NULL for lifetime; readiness grants no subscription at all
  payment_id             UUID REFERENCES nclex_payments(payment_id) ON DELETE RESTRICT,  -- NULL for trial/admin
  granted_by             UUID REFERENCES nclex_users(id) ON DELETE SET NULL,             -- ADMIN_GRANT only
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_nclex_subscriptions_user_status ON nclex_subscriptions (user_id, status);
CREATE INDEX idx_nclex_subscriptions_expiry ON nclex_subscriptions (end_at) WHERE status = 'ACTIVE';
-- One subscription per payment (idempotent activation). Partial: trial /
-- admin grants carry no payment_id. (migration 20260602120000)
CREATE UNIQUE INDEX idx_nclex_subscriptions_payment ON nclex_subscriptions (payment_id) WHERE payment_id IS NOT NULL;


-- nclex_readiness_credits — one row per readiness credit (§7). A credit
-- arrives via a standalone READINESS purchase, a bundled credit on a
-- longer bank pass, or an admin grant; the student claims it against a
-- pack, then activates its own one-shot 21-day window. Status-free by
-- design (Sam 2026-07-04): the lifecycle is strictly one-way, so the
-- event timestamps ARE the state — the stage is derived in TS
-- (creditStage). (migration 20260728120000)
CREATE TABLE nclex_readiness_credits (
  credit_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  source          TEXT NOT NULL CHECK (source IN ('SELF_PURCHASE','BANK_BUNDLE','ADMIN_GRANT')),
  payment_id      UUID REFERENCES nclex_payments(payment_id) ON DELETE RESTRICT,   -- NULL for admin grants
  granted_by      UUID REFERENCES nclex_users(id) ON DELETE SET NULL,              -- admin grants only
  pack_id         TEXT REFERENCES nclex_readiness_packs(pack_id) ON DELETE RESTRICT,  -- NULL before claim; RESTRICT = a claimed pack can't be deleted
  attempt_id      UUID REFERENCES nclex_attempts(attempt_id) ON DELETE RESTRICT,   -- NULL before the sitting
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- minted
  claimed_at      TIMESTAMPTZ,                          -- pack picked (with pack_id)
  activated_at    TIMESTAMPTZ,                          -- window started
  expires_at      TIMESTAMPTZ,                          -- deadline = activation + 21d, frozen (with activated_at)
  used_at         TIMESTAMPTZ,                          -- sitting completed (with attempt_id)
  expired_at      TIMESTAMPTZ,                          -- lapse event (nightly sweep)
  revoked_at      TIMESTAMPTZ,                          -- taken back
  revoked_reason  TEXT,                                 -- why (with revoked_at)
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- provenance matches source; a claim names a pack; activation needs a
  -- claim + sets a deadline; used needs activation + names an attempt;
  -- expiry needs activation; revoke carries a reason; at most one ending.
  CONSTRAINT nclex_readiness_credits_provenance CHECK (
    (source IN ('SELF_PURCHASE','BANK_BUNDLE') AND payment_id IS NOT NULL AND granted_by IS NULL)
    OR (source = 'ADMIN_GRANT' AND granted_by IS NOT NULL AND payment_id IS NULL)),
  CONSTRAINT nclex_readiness_credits_claim_names_pack CHECK ((claimed_at IS NULL) = (pack_id IS NULL)),
  CONSTRAINT nclex_readiness_credits_activation_requires_claim CHECK (activated_at IS NULL OR claimed_at IS NOT NULL),
  CONSTRAINT nclex_readiness_credits_activation_sets_deadline CHECK ((activated_at IS NULL) = (expires_at IS NULL)),
  CONSTRAINT nclex_readiness_credits_used_requires_activation CHECK (used_at IS NULL OR activated_at IS NOT NULL),
  CONSTRAINT nclex_readiness_credits_used_names_attempt CHECK ((used_at IS NULL) = (attempt_id IS NULL)),
  CONSTRAINT nclex_readiness_credits_expiry_requires_activation CHECK (expired_at IS NULL OR activated_at IS NOT NULL),
  CONSTRAINT nclex_readiness_credits_revoke_has_reason CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL)),
  CONSTRAINT nclex_readiness_credits_one_ending CHECK (
    (used_at IS NOT NULL)::int + (expired_at IS NOT NULL)::int + (revoked_at IS NOT NULL)::int <= 1)
);
CREATE INDEX idx_nclex_readiness_credits_user ON nclex_readiness_credits (user_id);
CREATE INDEX idx_nclex_readiness_credits_payment ON nclex_readiness_credits (payment_id) WHERE payment_id IS NOT NULL;
-- One LIVE claim per (student, pack) — one-shot-per-pack with teeth. A
-- used claim stays live forever (can't re-sit); expired/revoked release
-- the pack for a fresh credit (§2 r4).
CREATE UNIQUE INDEX idx_nclex_readiness_credits_one_live_claim_per_pack
  ON nclex_readiness_credits (user_id, pack_id)
  WHERE pack_id IS NOT NULL AND expired_at IS NULL AND revoked_at IS NULL;


-- nclex_auth_events — append-only log of authentication attempts (login,
-- registration, invite acceptance, reset, login code). Build-order item 2
-- slice 2a; migration 20260904120000_auth_events.sql, which carries the
-- full rationale for every column.
--
-- Three things about this table are decisions rather than defaults:
--   • user_id has NO foreign key. An FK would either block deleting a
--     user or cascade their history away, and a log that vanishes with
--     its subject is not a log. The register rollback path hard-deletes
--     auth users, so this is live, not hypothetical.
--   • email is kept even when it matches no account — "she asked for her
--     Yahoo, her account is under her Gmail" is the #1 support case and
--     is only answerable if unrecognised addresses are stored.
--   • ip_address is recorded and never enforced on. Ghanaian mobile
--     carriers put thousands of subscribers behind one address, so a
--     per-IP rate limit could lock out a whole network of nurses.
CREATE TABLE nclex_auth_events (
  event_id     BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type   TEXT        NOT NULL,
  email        TEXT,                                 -- address TRIED, lowercased
  user_id      UUID,                                 -- when known; no FK, on purpose
  user_exists  BOOLEAN,                              -- reset events only
  device_label TEXT,                                 -- 'Android · Chrome'; not a hash
  ip_address   INET,                                 -- logged, never enforced on
  reason       TEXT,                                 -- 'invalid_credentials', …
  -- The future types (CODE_* = slice 3, GOOGLE_FIRST_SIGNIN = slice 5)
  -- are listed now so those slices need no migration. *_BLOCKED is a
  -- distinct type, not a flag, so slice 2c can exclude blocked attempts
  -- from the counts that blocked them.
  CONSTRAINT nclex_auth_events_type_ck CHECK (event_type IN (
    'LOGIN_OK', 'LOGIN_FAIL', 'LOGIN_BLOCKED',
    'REGISTERED',
    'RESET_REQUESTED', 'RESET_COMPLETED', 'RESET_BLOCKED',
    'CODE_REQUESTED', 'CODE_LOGIN_OK', 'CODE_LOGIN_FAIL',
    'INVITE_ACCEPTED', 'GOOGLE_FIRST_SIGNIN'
  ))
);
-- One index per named reader: the slice-2c threshold count, a student's
-- support timeline, and the nightly retention sweep.
CREATE INDEX idx_nclex_auth_events_email_time
  ON nclex_auth_events (email, occurred_at DESC) WHERE email IS NOT NULL;
CREATE INDEX idx_nclex_auth_events_user_time
  ON nclex_auth_events (user_id, occurred_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_nclex_auth_events_occurred
  ON nclex_auth_events (occurred_at);


-- RPC functions are large and tracked by their migration files
-- (mynclex/db/migrations/mynclex_trend_save_rpc_slice_1_12b.sql).
-- The function bodies are NOT mirrored into schema.sql to keep the
-- schema file's focus on tables + indexes + constraints. The
-- migrations folder is the authoritative source for PL/pgSQL
-- definitions; schema.sql is a shape reference.
