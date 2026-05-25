-- =========================================================
-- MyNclex — Slice 11.1: tutor library schema foundation
-- File: mynclex/db/migrations/20260616120000_slice_11_1_tutor_library_schema.sql
-- =========================================================
-- First slice of the Tutor Library build. Lands the entire DB
-- foundation: domain type, 9 tables, 2 helper functions
-- (`nclex_extract_body_text` IMMUTABLE + `nclex_student_can_see_note`
-- STABLE SECURITY DEFINER), the search `body_tsv` generated column,
-- 2 GIN indexes, the same-tutor-invariant trigger on the visibility
-- junction, the deferred ≥-1-row constraint trigger on visibility,
-- and full RLS policies for every table.
--
-- Source of truth: docs/product-plan/tutor-library.md (single
-- canonical planning doc — the gap-review working doc has been
-- folded back in).
--
-- Decisions confirmed during planning:
--   • Tutor-owned tables use the `nclex_tutor_*` prefix; student-
--     owned tables use `nclex_library_*` (matching the existing
--     `nclex_library_embed_answers` naming).
--   • PKs are UUID with `gen_random_uuid()` (matches the rest of
--     this product's schema; the planning doc's "TEXT PK" was
--     illustrative).
--   • `pillars` is multi-value from day 1 (`nclex_pillar[]`, length
--     ≥ 1). No "primary pillar" concept; promote later via a
--     separate column if ever needed.
--   • PROGRAMME_SCOPED notes carry their scope in a junction table
--     (`_note_visibility`); empty for TUTOR_WIDE. Same-tutor
--     invariant enforced via trigger; ≥-1-row rule enforced via
--     deferred constraint trigger (matches CLAUDE.md rule #4 — TS
--     for UX-friendly errors, SQL for the security floor).
--   • Shelf attaches as ONE atomic activity row, not a fan-out.
--     A CHECK constraint enforces `note_id` XOR `shelf_id` per row.
--     `skipped_note_ids JSONB` on the shelf attachment row carries
--     per-unit hides.
--   • Per-(student, note) state is one merged row (bookmarks +
--     resume position + completion). Collapses three originally-
--     separate concerns into `nclex_library_note_state`.
--   • Embed answers keyed `(student_id, note_id, block_id,
--     question_index)` so a multi-question block produces N rows.
--   • Body text search via Postgres FTS — `body_tsv` is a STORED
--     generated column over (title=A, subtitle=B, description=C,
--     body=D); GIN index on `body_tsv` + GIN on `tags` for the tag
--     manager's distinct-tag query.
--
-- This migration is foundation only — no UI consumers yet. The
-- library home shell (slice 11.1 part 2) plugs in next; folders +
-- notes-as-rows + the note editor follow in subsequent slices per
-- the build order in the planning doc.
--
-- No backfill — every table starts empty. Existing tutors get an
-- empty library on first visit.


BEGIN;


-- =========================================================
-- 1. nclex_pillar — domain type for NCLEX Client Needs sub-cats
-- =========================================================
-- Full NCSBN 2023 NCLEX-RN Test Plan names, no abbreviation codes.
-- The bank's `client_needs_subcategory TEXT` already stores these
-- same values (sourced from lib/bank/classifications.ts); the
-- library validates at the DB layer via this domain. Optional
-- future follow-up: the bank could adopt the same domain for free
-- DB-level validation. Independent of library work.

CREATE DOMAIN nclex_pillar AS TEXT
  CHECK (VALUE IN (
    'Management of Care',
    'Safety and Infection Control',
    'Health Promotion and Maintenance',
    'Psychosocial Integrity',
    'Basic Care and Comfort',
    'Pharmacological and Parenteral Therapies',
    'Reduction of Risk Potential',
    'Physiological Adaptation'
  ));


-- =========================================================
-- 2. nclex_extract_body_text — IMMUTABLE helper for body_tsv
-- =========================================================
-- Walks a note's `body` JSONB block array and concatenates the
-- plain text from textual block types. Skips image / pdf / video /
-- embedded_questions (no text to index). Used by the `body_tsv`
-- generated column on `nclex_tutor_library_notes` below; must
-- exist BEFORE the table is created.
--
-- IMMUTABLE + PARALLEL SAFE so it can back a GENERATED ALWAYS AS
-- STORED column. PostgreSQL trusts the IMMUTABLE label — if the
-- block schema changes such that this function's output for the
-- same input would change, callers must call REFRESH (or drop +
-- recreate the generated column).

CREATE OR REPLACE FUNCTION nclex_extract_body_text(p_body JSONB)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE
  block        JSONB;
  block_type   TEXT;
  inline       JSONB;
  item         JSONB;
  row_item     JSONB;
  col_item     JSONB;
  field        JSONB;
  buf          TEXT := '';
BEGIN
  IF p_body IS NULL OR jsonb_typeof(p_body) <> 'array' THEN
    RETURN '';
  END IF;

  FOR block IN SELECT * FROM jsonb_array_elements(p_body) LOOP
    block_type := block->>'type';

    -- Non-text block types contribute nothing to the searchable corpus.
    IF block_type IN ('image', 'pdf', 'video', 'embedded_questions') THEN
      CONTINUE;
    END IF;

    IF block_type = 'heading' THEN
      buf := buf || ' ' || COALESCE(block->>'text', '');

    ELSIF block_type IN ('paragraph', 'quote', 'callout') THEN
      -- Rich-text content: array of { text, marks? } inline spans.
      IF jsonb_typeof(block->'content') = 'array' THEN
        FOR inline IN SELECT * FROM jsonb_array_elements(block->'content') LOOP
          buf := buf || ' ' || COALESCE(inline->>'text', '');
        END LOOP;
      END IF;
      -- Quote blocks may carry a citation line.
      buf := buf || ' ' || COALESCE(block->>'citation', '');

    ELSIF block_type = 'list' THEN
      -- items: each may be a plain string OR { content: [...] }.
      IF jsonb_typeof(block->'items') = 'array' THEN
        FOR item IN SELECT * FROM jsonb_array_elements(block->'items') LOOP
          IF jsonb_typeof(item) = 'string' THEN
            buf := buf || ' ' || (item #>> '{}');
          ELSIF jsonb_typeof(item->'content') = 'array' THEN
            FOR inline IN SELECT * FROM jsonb_array_elements(item->'content') LOOP
              buf := buf || ' ' || COALESCE(inline->>'text', '');
            END LOOP;
          END IF;
        END LOOP;
      END IF;

    ELSIF block_type = 'table' THEN
      -- cells: 2D array. Cell content may be rich-text inline-array
      -- or a plain string.
      IF jsonb_typeof(block->'cells') = 'array' THEN
        FOR row_item IN SELECT * FROM jsonb_array_elements(block->'cells') LOOP
          IF jsonb_typeof(row_item) = 'array' THEN
            FOR col_item IN SELECT * FROM jsonb_array_elements(row_item) LOOP
              IF jsonb_typeof(col_item->'content') = 'array' THEN
                FOR inline IN SELECT * FROM jsonb_array_elements(col_item->'content') LOOP
                  buf := buf || ' ' || COALESCE(inline->>'text', '');
                END LOOP;
              ELSE
                buf := buf || ' ' || COALESCE(col_item #>> '{}', '');
              END IF;
            END LOOP;
          END IF;
        END LOOP;
      END IF;

    ELSIF block_type = 'drug_card' THEN
      buf := buf || ' ' || COALESCE(block->>'name', '');
      buf := buf || ' ' || COALESCE(block->>'drug_class', '');
      IF jsonb_typeof(block->'fields') = 'array' THEN
        FOR field IN SELECT * FROM jsonb_array_elements(block->'fields') LOOP
          buf := buf || ' ' || COALESCE(field->>'label', '');
          buf := buf || ' ' || COALESCE(field->>'value', '');
        END LOOP;
      END IF;

    ELSIF block_type = 'lab_values' THEN
      buf := buf || ' ' || COALESCE(block->>'title', '');
      IF jsonb_typeof(block->'columns') = 'array' THEN
        FOR col_item IN SELECT * FROM jsonb_array_elements(block->'columns') LOOP
          buf := buf || ' ' || COALESCE(col_item->>'label', '');
        END LOOP;
      END IF;
      IF jsonb_typeof(block->'rows') = 'array' THEN
        FOR row_item IN SELECT * FROM jsonb_array_elements(block->'rows') LOOP
          IF jsonb_typeof(row_item) = 'array' THEN
            FOR col_item IN SELECT * FROM jsonb_array_elements(row_item) LOOP
              buf := buf || ' ' || COALESCE(col_item #>> '{}', '');
            END LOOP;
          END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  RETURN buf;
END;
$$;


-- =========================================================
-- 3. nclex_tutor_library_folders
-- =========================================================
-- Tutor's primary filing bin. Flat two-level (Folder → Note); no
-- nesting in v1. A note can sit at the root (folder_id NULL on
-- the note row).

CREATE TABLE nclex_tutor_library_folders (
  folder_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id      UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,

  name          TEXT NOT NULL,
  -- One-liner shown on the All-folders card + sub-head on the
  -- folder scope page.
  description   TEXT,

  position      INTEGER NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nclex_tutor_library_folders_tutor
  ON nclex_tutor_library_folders(tutor_id);


-- =========================================================
-- 4. nclex_tutor_library_shelves
-- =========================================================
-- Curated cross-cutting packs. M:N with notes via
-- _shelf_memberships. No `visibility_mode` on the shelf — shelf
-- visibility is implicit from membership (a shelf is visible to a
-- student if any of its notes are).

CREATE TABLE nclex_tutor_library_shelves (
  shelf_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id      UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,

  title         TEXT NOT NULL,
  description   TEXT,
  -- Hex string; used for rail dot, per-note pip, grouped-block
  -- border when attached.
  color         TEXT NOT NULL,

  position      INTEGER NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nclex_tutor_library_shelves_tutor
  ON nclex_tutor_library_shelves(tutor_id);


-- =========================================================
-- 5. nclex_tutor_library_notes
-- =========================================================
-- The main entity. body_tsv is a STORED generated column over
-- title + subtitle + description + body plain-text (with weights
-- A/B/C/D so `ts_rank` orders title hits above body hits). The
-- column is materialised eagerly (STORED) so the GIN index reads
-- straight from disk.

CREATE TABLE nclex_tutor_library_notes (
  note_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id           UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,

  -- Nullable: NULL = root-level note (no folder).
  folder_id          UUID REFERENCES nclex_tutor_library_folders(folder_id) ON DELETE SET NULL,

  title              TEXT NOT NULL,
  subtitle           TEXT,
  description        TEXT,

  -- Array of typed blocks. Shape per `lib/library/types.ts` (TS).
  body               JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Generated FTS column. See nclex_extract_body_text above.
  body_tsv           TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')),                    'A') ||
    setweight(to_tsvector('english', coalesce(subtitle, '')),                 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')),              'C') ||
    setweight(to_tsvector('english', nclex_extract_body_text(body)),          'D')
  ) STORED,

  tags               TEXT[] NOT NULL DEFAULT '{}',

  -- Multi-pillar from day 1. At least one entry required.
  pillars            nclex_pillar[] NOT NULL,

  -- Save-time guard against same-user-two-tabs overwrites. The
  -- editor records the version it loaded with and sends it on save;
  -- the server rejects mismatches. Regenerated on every save by the
  -- saveLibraryNote action (NOT by a DB trigger — keeps the guard
  -- visible at the application layer where the UX-friendly error
  -- gets surfaced). Reused for co-tutor co-editing in v2.
  version_id         UUID NOT NULL DEFAULT gen_random_uuid(),

  position           INTEGER NOT NULL DEFAULT 0,
  is_published       BOOLEAN NOT NULL DEFAULT FALSE,

  -- One of two modes. TUTOR_WIDE → junction is empty.
  -- PROGRAMME_SCOPED → junction has ≥ 1 row (enforced by the
  -- deferred constraint trigger below).
  visibility_mode    TEXT NOT NULL DEFAULT 'TUTOR_WIDE'
                     CHECK (visibility_mode IN ('TUTOR_WIDE', 'PROGRAMME_SCOPED')),

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT nclex_tutor_library_notes_pillars_non_empty
    CHECK (array_length(pillars, 1) >= 1)
);

CREATE INDEX idx_nclex_tutor_library_notes_tutor
  ON nclex_tutor_library_notes(tutor_id);

CREATE INDEX idx_nclex_tutor_library_notes_folder
  ON nclex_tutor_library_notes(folder_id)
  WHERE folder_id IS NOT NULL;

-- Search index (point 11 in the planning doc).
CREATE INDEX idx_nclex_tutor_library_notes_body_tsv
  ON nclex_tutor_library_notes USING GIN (body_tsv);

-- Tag manager's distinct-tag query + chip filter (point 10).
CREATE INDEX idx_nclex_tutor_library_notes_tags
  ON nclex_tutor_library_notes USING GIN (tags);


-- =========================================================
-- 6. nclex_tutor_library_shelf_memberships
-- =========================================================
-- M:N join. Position is per-shelf so the same note can have
-- different ordinals in different shelves.

CREATE TABLE nclex_tutor_library_shelf_memberships (
  shelf_id      UUID NOT NULL REFERENCES nclex_tutor_library_shelves(shelf_id) ON DELETE CASCADE,
  note_id       UUID NOT NULL REFERENCES nclex_tutor_library_notes(note_id) ON DELETE CASCADE,

  position      INTEGER NOT NULL DEFAULT 0,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (shelf_id, note_id)
);

CREATE INDEX idx_nclex_tutor_library_shelf_memberships_note
  ON nclex_tutor_library_shelf_memberships(note_id);


-- =========================================================
-- 7. nclex_tutor_library_note_visibility — junction
-- =========================================================
-- TUTOR_WIDE notes have zero rows; PROGRAMME_SCOPED notes have ≥ 1.
-- Same-tutor invariant + deferred ≥-1 constraint enforced by the
-- triggers further down.

CREATE TABLE nclex_tutor_library_note_visibility (
  note_id       UUID NOT NULL REFERENCES nclex_tutor_library_notes(note_id) ON DELETE CASCADE,
  programme_id  UUID NOT NULL REFERENCES nclex_programmes(programme_id) ON DELETE CASCADE,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (note_id, programme_id)
);

CREATE INDEX idx_nclex_tutor_library_note_visibility_programme
  ON nclex_tutor_library_note_visibility(programme_id);


-- =========================================================
-- 8. nclex_tutor_library_note_attachments
-- =========================================================
-- One row per attachment to a programme unit. Row shape diverges
-- by kind (atomic-activity model — Option D):
--   • Loose Library Note attach: note_id set, shelf_id NULL.
--   • Shelf attach (atomic):     shelf_id set, note_id NULL —
--     one row, not a fan-out. Member notes derive at render time
--     from `nclex_tutor_library_shelf_memberships`.
-- The CHECK constraint enforces the XOR. `skipped_note_ids` is
-- only meaningful on shelf rows.

CREATE TABLE nclex_tutor_library_note_attachments (
  attachment_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Exactly one of these two FKs is set (enforced by the CHECK
  -- below). Loose attachments RESTRICT delete on the master note
  -- so a published note can't vanish from a curriculum without an
  -- explicit detach. Shelf attachments RESTRICT delete on the
  -- shelf for the same reason.
  note_id           UUID REFERENCES nclex_tutor_library_notes(note_id) ON DELETE RESTRICT,
  shelf_id          UUID REFERENCES nclex_tutor_library_shelves(shelf_id) ON DELETE RESTRICT,

  programme_id      UUID NOT NULL REFERENCES nclex_programmes(programme_id) ON DELETE CASCADE,
  unit_id           UUID NOT NULL REFERENCES nclex_programme_units(unit_id) ON DELETE CASCADE,
  -- Nullable: NULL = loose under unit; NOT NULL = inside a curriculum block.
  block_id          UUID REFERENCES nclex_programme_blocks(block_id) ON DELETE CASCADE,

  position          INTEGER NOT NULL DEFAULT 0,
  caption           TEXT,

  -- For shelf attachments only — note_ids hidden in this unit's
  -- render. The atomic-activity model doesn't break the
  -- shelf-link to drop a note; "Hide in this unit" appends the
  -- id here instead. Skipped notes don't render to students and
  -- don't count toward the shelf-activity's completion rollup.
  skipped_note_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Row shape diverges by kind.
  CONSTRAINT nclex_tutor_library_note_attachments_kind_xor CHECK (
    (note_id IS NOT NULL AND shelf_id IS NULL)
    OR (note_id IS NULL AND shelf_id IS NOT NULL)
  )
);

CREATE INDEX idx_nclex_tutor_library_note_attachments_note
  ON nclex_tutor_library_note_attachments(note_id)
  WHERE note_id IS NOT NULL;

CREATE INDEX idx_nclex_tutor_library_note_attachments_shelf
  ON nclex_tutor_library_note_attachments(shelf_id)
  WHERE shelf_id IS NOT NULL;

CREATE INDEX idx_nclex_tutor_library_note_attachments_unit
  ON nclex_tutor_library_note_attachments(unit_id);


-- =========================================================
-- 9. nclex_library_note_state — merged per-(student, note) state
-- =========================================================
-- Collapses three originally-separate concerns into one row:
--   1. Bookmarks         (was nclex_library_note_bookmarks)
--   2. Reading position  (was nclex_library_note_progress)
--   3. Per-note completion (was a JSONB column on the progress
--      engine's completion row; retired so completion has one
--      source of truth).
-- Shelf-activity completion derives at query time from this
-- table: every member note minus skipped_note_ids has
-- marked_done_at IS NOT NULL.

CREATE TABLE nclex_library_note_state (
  student_id        UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  note_id           UUID NOT NULL REFERENCES nclex_tutor_library_notes(note_id) ON DELETE CASCADE,

  -- ID of the deepest H2/H3 heading the student has scrolled past.
  -- Drives the "section N of M" progress meter + the resume-scroll
  -- on re-open. NULL = student has never reached a heading
  -- (renders top-of-note on resume).
  last_heading_id   TEXT,

  -- Set when the student taps "Mark as done"; cleared if they
  -- toggle it off. Also write-through to the progress engine
  -- when the read came from a Library Note activity.
  marked_done_at    TIMESTAMPTZ,

  -- Set when the student taps the bookmark toggle; cleared when
  -- they toggle it off. Powers the student "Bookmarked" view.
  bookmarked_at     TIMESTAMPTZ,

  -- Touched on any interaction. Drives the student "Recent" view.
  last_visited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (student_id, note_id)
);

CREATE INDEX idx_nclex_library_note_state_student_bookmarked
  ON nclex_library_note_state(student_id, bookmarked_at)
  WHERE bookmarked_at IS NOT NULL;

CREATE INDEX idx_nclex_library_note_state_student_done
  ON nclex_library_note_state(student_id, marked_done_at)
  WHERE marked_done_at IS NOT NULL;


-- =========================================================
-- 10. nclex_tutor_library_views — saved tutor filter combos
-- =========================================================
-- v1 shipping (the original plan deferred to v1.5; the gap review
-- promoted to v1). Tutor-side only — students get hard-coded
-- system views.

CREATE TABLE nclex_tutor_library_views (
  view_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id      UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,

  name          TEXT NOT NULL,
  -- The saved filter set (pillars, tags, folder, shelf, status,
  -- search). Replayed into the toolbar chip state when the view
  -- is opened. Shape per lib/library/views/types.ts.
  filters_json  JSONB NOT NULL DEFAULT '{}'::jsonb,

  position      INTEGER NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nclex_tutor_library_views_tutor
  ON nclex_tutor_library_views(tutor_id);


-- =========================================================
-- 11. nclex_library_embed_answers — per-question embed answers
-- =========================================================
-- Locked 2026-05-16: embed answers live in their own table, NOT
-- in nclex_attempts. See planning doc § Attempt-tracking. Keyed
-- per question slot so a multi-question block produces N rows.

CREATE TABLE nclex_library_embed_answers (
  answer_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  student_id       UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  note_id          UUID NOT NULL REFERENCES nclex_tutor_library_notes(note_id) ON DELETE CASCADE,
  -- The embedded_questions block's UUID within the note body.
  -- Stored as TEXT because the block id lives in JSONB, not as a
  -- referenced row.
  block_id         TEXT NOT NULL,
  -- 0-based index into the block's item_ids[] array.
  question_index   INTEGER NOT NULL CHECK (question_index >= 0),
  -- Prevents deletion of a bank question while embed answers exist.
  item_id          UUID NOT NULL REFERENCES nclex_bank_items(item_id) ON DELETE RESTRICT,

  -- The student's submitted answer (per question type).
  answer_json      JSONB NOT NULL,
  is_correct       BOOLEAN NOT NULL,
  -- Content + correct + rationale at submit time — preserves
  -- attempt integrity if the tutor edits the question later.
  snapshot_json    JSONB NOT NULL,

  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per (student, embed-block, question slot).
  CONSTRAINT nclex_library_embed_answers_unique
    UNIQUE (student_id, note_id, block_id, question_index)
);

CREATE INDEX idx_nclex_library_embed_answers_student
  ON nclex_library_embed_answers(student_id);

CREATE INDEX idx_nclex_library_embed_answers_item
  ON nclex_library_embed_answers(item_id);


-- =========================================================
-- 12. Same-tutor invariant — trigger on note_visibility
-- =========================================================
-- Every programme_id added to a note's visibility set must belong
-- to that note's tutor. Cross-tutor visibility additions raise.
-- App-layer check ALSO runs in saveLibraryNote for a UX-friendly
-- error; this trigger is the security floor.

CREATE OR REPLACE FUNCTION nclex_note_visibility_same_tutor()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_note_tutor       UUID;
  v_programme_tutor  UUID;
BEGIN
  SELECT tutor_id INTO v_note_tutor
  FROM nclex_tutor_library_notes
  WHERE note_id = NEW.note_id;

  SELECT tutor_id INTO v_programme_tutor
  FROM nclex_programmes
  WHERE programme_id = NEW.programme_id;

  IF v_note_tutor IS NULL THEN
    RAISE EXCEPTION 'note % not found', NEW.note_id;
  END IF;
  IF v_programme_tutor IS NULL THEN
    RAISE EXCEPTION 'programme % not found', NEW.programme_id;
  END IF;
  IF v_note_tutor <> v_programme_tutor THEN
    RAISE EXCEPTION 'note % belongs to tutor %; programme % belongs to tutor % — cross-tutor visibility is not allowed',
      NEW.note_id, v_note_tutor, NEW.programme_id, v_programme_tutor;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER nclex_note_visibility_same_tutor_check
  BEFORE INSERT OR UPDATE ON nclex_tutor_library_note_visibility
  FOR EACH ROW EXECUTE FUNCTION nclex_note_visibility_same_tutor();


-- =========================================================
-- 13. Deferred ≥-1-row constraint — PROGRAMME_SCOPED notes
-- =========================================================
-- A PROGRAMME_SCOPED note must end every transaction with at
-- least one junction row. Two constraint triggers cover the two
-- paths that can violate the invariant:
--   • UPDATE on _notes (visibility_mode flipped to
--     PROGRAMME_SCOPED with no junction rows present)
--   • INSERT/UPDATE/DELETE on _note_visibility (last row removed)
-- Both DEFERRABLE INITIALLY DEFERRED so a save action can do the
-- DELETE-old + INSERT-new in any order within one transaction.

CREATE OR REPLACE FUNCTION nclex_check_scoped_has_visibility()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_note_id      UUID;
  v_mode         TEXT;
  v_count        INTEGER;
BEGIN
  -- Which note triggered the check?
  IF TG_TABLE_NAME = 'nclex_tutor_library_notes' THEN
    v_note_id := NEW.note_id;
  ELSE
    v_note_id := COALESCE(NEW.note_id, OLD.note_id);
  END IF;

  SELECT visibility_mode INTO v_mode
  FROM nclex_tutor_library_notes
  WHERE note_id = v_note_id;

  -- If the note was deleted in the same transaction, no rule to check.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_mode = 'PROGRAMME_SCOPED' THEN
    SELECT COUNT(*) INTO v_count
    FROM nclex_tutor_library_note_visibility
    WHERE note_id = v_note_id;

    IF v_count < 1 THEN
      RAISE EXCEPTION 'note % is PROGRAMME_SCOPED but its visibility set is empty', v_note_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER nclex_notes_scoped_must_have_visibility
  AFTER INSERT OR UPDATE OF visibility_mode ON nclex_tutor_library_notes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION nclex_check_scoped_has_visibility();

CREATE CONSTRAINT TRIGGER nclex_note_vis_scoped_must_have_visibility
  AFTER INSERT OR UPDATE OR DELETE ON nclex_tutor_library_note_visibility
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION nclex_check_scoped_has_visibility();


-- =========================================================
-- 14. nclex_student_can_see_note — student visibility helper
-- =========================================================
-- Single source of truth for "can this student see this note?".
-- Called by RLS policies and by query helpers. SECURITY DEFINER
-- so it can read the visibility junction + enrolments without
-- being trapped by the SELECT policies (which would recurse).

CREATE OR REPLACE FUNCTION nclex_student_can_see_note(p_note_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid              UUID := auth.uid();
  v_tutor_id         UUID;
  v_visibility_mode  TEXT;
  v_is_published     BOOLEAN;
  v_match            BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT tutor_id, visibility_mode, is_published
  INTO   v_tutor_id, v_visibility_mode, v_is_published
  FROM   nclex_tutor_library_notes
  WHERE  note_id = p_note_id;

  IF NOT FOUND OR NOT v_is_published THEN
    RETURN FALSE;
  END IF;

  IF v_visibility_mode = 'TUTOR_WIDE' THEN
    -- Student is enrolled (active) in ANY programme this tutor runs.
    SELECT EXISTS (
      SELECT 1
      FROM   nclex_enrolments e
      JOIN   nclex_programmes p ON p.programme_id = e.programme_id
      WHERE  e.user_id    = v_uid
        AND  e.status     = 'ENROLLED'
        AND  p.tutor_id   = v_tutor_id
    ) INTO v_match;
    RETURN v_match;
  ELSIF v_visibility_mode = 'PROGRAMME_SCOPED' THEN
    -- Student is enrolled (active) in at least one programme in the
    -- note's visibility junction.
    SELECT EXISTS (
      SELECT 1
      FROM   nclex_enrolments e
      JOIN   nclex_tutor_library_note_visibility v ON v.programme_id = e.programme_id
      WHERE  e.user_id  = v_uid
        AND  e.status   = 'ENROLLED'
        AND  v.note_id  = p_note_id
    ) INTO v_match;
    RETURN v_match;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION nclex_student_can_see_note(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION nclex_student_can_see_note(UUID) TO authenticated;


-- =========================================================
-- 15. RLS — enable on all 9 tables
-- =========================================================

ALTER TABLE nclex_tutor_library_folders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_tutor_library_shelves             ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_tutor_library_shelf_memberships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_tutor_library_notes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_tutor_library_note_visibility     ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_tutor_library_note_attachments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_library_note_state                ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_tutor_library_views               ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_library_embed_answers             ENABLE ROW LEVEL SECURITY;


-- =========================================================
-- 16. Policies — nclex_tutor_library_folders
-- =========================================================

CREATE POLICY nclex_tutor_library_folders_self_select
  ON nclex_tutor_library_folders FOR SELECT
  TO authenticated
  USING (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_library_folders_self_insert
  ON nclex_tutor_library_folders FOR INSERT
  TO authenticated
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_library_folders_self_update
  ON nclex_tutor_library_folders FOR UPDATE
  TO authenticated
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_library_folders_self_delete
  ON nclex_tutor_library_folders FOR DELETE
  TO authenticated
  USING (tutor_id = auth.uid());

-- Enrolled students see folders whose tutor's library they have
-- access to (any programme the student is enrolled in). Empty
-- folders are hidden in the application query, not here.
CREATE POLICY nclex_tutor_library_folders_student_select
  ON nclex_tutor_library_folders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   nclex_enrolments e
      JOIN   nclex_programmes p ON p.programme_id = e.programme_id
      WHERE  e.user_id  = auth.uid()
        AND  e.status   = 'ENROLLED'
        AND  p.tutor_id = nclex_tutor_library_folders.tutor_id
    )
  );

CREATE POLICY nclex_tutor_library_folders_admin_all
  ON nclex_tutor_library_folders FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- 17. Policies — nclex_tutor_library_shelves
-- =========================================================

CREATE POLICY nclex_tutor_library_shelves_self_select
  ON nclex_tutor_library_shelves FOR SELECT
  TO authenticated
  USING (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_library_shelves_self_insert
  ON nclex_tutor_library_shelves FOR INSERT
  TO authenticated
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_library_shelves_self_update
  ON nclex_tutor_library_shelves FOR UPDATE
  TO authenticated
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_library_shelves_self_delete
  ON nclex_tutor_library_shelves FOR DELETE
  TO authenticated
  USING (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_library_shelves_student_select
  ON nclex_tutor_library_shelves FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   nclex_enrolments e
      JOIN   nclex_programmes p ON p.programme_id = e.programme_id
      WHERE  e.user_id  = auth.uid()
        AND  e.status   = 'ENROLLED'
        AND  p.tutor_id = nclex_tutor_library_shelves.tutor_id
    )
  );

CREATE POLICY nclex_tutor_library_shelves_admin_all
  ON nclex_tutor_library_shelves FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- 18. Policies — nclex_tutor_library_shelf_memberships
-- =========================================================
-- Tutor sees own (rows on their shelves); students see rows on
-- shelves they can see AND for notes they can see. The join via
-- _shelves carries tutor ownership; the visibility helper does
-- the per-note gating for students.

CREATE POLICY nclex_tutor_library_shelf_memberships_self_all
  ON nclex_tutor_library_shelf_memberships FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_tutor_library_shelves s
      WHERE s.shelf_id = nclex_tutor_library_shelf_memberships.shelf_id
        AND s.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_tutor_library_shelves s
      WHERE s.shelf_id = nclex_tutor_library_shelf_memberships.shelf_id
        AND s.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_tutor_library_shelf_memberships_student_select
  ON nclex_tutor_library_shelf_memberships FOR SELECT
  TO authenticated
  USING (
    nclex_student_can_see_note(nclex_tutor_library_shelf_memberships.note_id)
  );

CREATE POLICY nclex_tutor_library_shelf_memberships_admin_all
  ON nclex_tutor_library_shelf_memberships FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- 19. Policies — nclex_tutor_library_notes
-- =========================================================

CREATE POLICY nclex_tutor_library_notes_self_select
  ON nclex_tutor_library_notes FOR SELECT
  TO authenticated
  USING (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_library_notes_self_insert
  ON nclex_tutor_library_notes FOR INSERT
  TO authenticated
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_library_notes_self_update
  ON nclex_tutor_library_notes FOR UPDATE
  TO authenticated
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_library_notes_self_delete
  ON nclex_tutor_library_notes FOR DELETE
  TO authenticated
  USING (tutor_id = auth.uid());

-- Student visibility — load-bearing rule, delegated to the helper.
CREATE POLICY nclex_tutor_library_notes_student_select
  ON nclex_tutor_library_notes FOR SELECT
  TO authenticated
  USING (nclex_student_can_see_note(note_id));

CREATE POLICY nclex_tutor_library_notes_admin_all
  ON nclex_tutor_library_notes FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- 20. Policies — nclex_tutor_library_note_visibility
-- =========================================================
-- Tutor sees + writes own. Students don't read this directly —
-- they go through nclex_student_can_see_note (SECURITY DEFINER).

CREATE POLICY nclex_tutor_library_note_visibility_self_all
  ON nclex_tutor_library_note_visibility FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_tutor_library_notes n
      WHERE n.note_id = nclex_tutor_library_note_visibility.note_id
        AND n.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_tutor_library_notes n
      WHERE n.note_id = nclex_tutor_library_note_visibility.note_id
        AND n.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_tutor_library_note_visibility_admin_all
  ON nclex_tutor_library_note_visibility FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- 21. Policies — nclex_tutor_library_note_attachments
-- =========================================================
-- Tutor reads + writes own (ownership traces via programme_id →
-- programmes.tutor_id). Students read attachments for their
-- programmes AND for content they can see.

CREATE POLICY nclex_tutor_library_note_attachments_self_all
  ON nclex_tutor_library_note_attachments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_tutor_library_note_attachments.programme_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_tutor_library_note_attachments.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_tutor_library_note_attachments_student_select
  ON nclex_tutor_library_note_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   nclex_enrolments e
      WHERE  e.user_id      = auth.uid()
        AND  e.status       = 'ENROLLED'
        AND  e.programme_id = nclex_tutor_library_note_attachments.programme_id
    )
    AND (
      -- Loose Library Note attach: student must be able to see the note.
      (nclex_tutor_library_note_attachments.note_id IS NOT NULL
        AND nclex_student_can_see_note(nclex_tutor_library_note_attachments.note_id))
      -- Shelf attach: row is visible; member-note visibility is enforced
      -- at the membership / note row level when the unit view renders.
      OR nclex_tutor_library_note_attachments.shelf_id IS NOT NULL
    )
  );

CREATE POLICY nclex_tutor_library_note_attachments_admin_all
  ON nclex_tutor_library_note_attachments FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- 22. Policies — nclex_library_note_state (student-owned)
-- =========================================================
-- Students see + write their own rows only. Tutor has no read
-- access in v1 (per-note state is private student reading
-- behaviour; tutor analytics is v2+).

CREATE POLICY nclex_library_note_state_self_select
  ON nclex_library_note_state FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY nclex_library_note_state_self_insert
  ON nclex_library_note_state FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY nclex_library_note_state_self_update
  ON nclex_library_note_state FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY nclex_library_note_state_self_delete
  ON nclex_library_note_state FOR DELETE
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY nclex_library_note_state_admin_all
  ON nclex_library_note_state FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- 23. Policies — nclex_tutor_library_views (tutor authoring)
-- =========================================================
-- Tutor-only. Students don't see this table at all (they have
-- hard-coded system views).

CREATE POLICY nclex_tutor_library_views_self_all
  ON nclex_tutor_library_views FOR ALL
  TO authenticated
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_library_views_admin_all
  ON nclex_tutor_library_views FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- 24. Policies — nclex_library_embed_answers
-- =========================================================
-- Student sees own rows. Tutor sees rows for embeds of their own
-- bank questions (for future v2+ analytics). INSERT is restricted
-- to the student-side submit action; UPDATE is disallowed (the
-- snapshot is captured once and frozen).

CREATE POLICY nclex_library_embed_answers_student_select
  ON nclex_library_embed_answers FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY nclex_library_embed_answers_student_insert
  ON nclex_library_embed_answers FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Tutor read access for v2+ analytics — scoped to rows where the
-- embedded bank item belongs to this tutor.
CREATE POLICY nclex_library_embed_answers_tutor_select
  ON nclex_library_embed_answers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_bank_items i
      WHERE i.item_id = nclex_library_embed_answers.item_id
        AND i.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_library_embed_answers_admin_all
  ON nclex_library_embed_answers FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


COMMIT;
