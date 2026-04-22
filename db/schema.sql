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
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 5. QAcademy-owned case studies (scenario + 6 chart tabs as JSONB)
CREATE TABLE nclex_case_studies (
  case_id                   TEXT PRIMARY KEY,
  title                     TEXT NOT NULL,
  scenario_summary          TEXT,

  -- Chart tabs (JSONB arrays of entries; each entry carries visible_from)
  nurses_notes              JSONB NOT NULL DEFAULT '[]'::jsonb,
  vital_signs               JSONB NOT NULL DEFAULT '[]'::jsonb,
  lab_results               JSONB NOT NULL DEFAULT '[]'::jsonb,
  orders                    JSONB NOT NULL DEFAULT '[]'::jsonb,
  history                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  diagnostics               JSONB NOT NULL DEFAULT '[]'::jsonb,

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

  nurses_notes              JSONB NOT NULL DEFAULT '[]'::jsonb,
  vital_signs               JSONB NOT NULL DEFAULT '[]'::jsonb,
  lab_results               JSONB NOT NULL DEFAULT '[]'::jsonb,
  orders                    JSONB NOT NULL DEFAULT '[]'::jsonb,
  history                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  diagnostics               JSONB NOT NULL DEFAULT '[]'::jsonb,

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
