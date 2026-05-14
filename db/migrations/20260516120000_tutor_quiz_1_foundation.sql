-- =========================================================
-- MyNclex — Tutor Quiz, Slice 1: Quiz foundation
-- File: mynclex/db/migrations/20260516120000_tutor_quiz_1_foundation.sql
-- =========================================================
-- First slice of the central tutor-quiz system. Adds the two
-- tables that hold a reusable tutor quiz:
--
--   nclex_tutor_quizzes       — the quiz plan: metadata + settings.
--                               Tutor-owned, reusable across
--                               programmes and activities.
--   nclex_tutor_quiz_items    — the ordered list of question
--                               references that IS the quiz.
--
-- Source of truth for shape + semantics:
--   docs/product-plan/tutor-quiz-system.md (§3 schema)
--
-- Decisions confirmed in the slice planning conversation
-- (2026-05-16):
--   • The quiz stores REFERENCES, not copies. A student attempt
--     snapshots the questions at attempt-creation time (existing
--     bank-side machinery, slice 3) — so editing a quiz never
--     disturbs an attempt already created.
--   • IDs are UUIDs, matching the structural tables (programmes,
--     units, activities). The bank's TEXT-prefix PK style is for
--     authored bank CONTENT; a quiz is a structural object.
--   • No `intent` column — intent is derived from `quiz_kind`
--     (MOCK → EXAM, PRACTICE → STUDY). One source of truth.
--   • `mode` excludes CAT. CAT selects each next question
--     adaptively; a quiz is a hand-picked fixed list — the two
--     are contradictory. Only the four non-adaptive runner modes
--     are allowed.
--   • The (quiz_kind, mode) pairing is a DB CHECK, mirroring
--     nclex_attempts_intent_mode_tuple. MOCK excludes
--     UNTIMED_LEARNING (that mode reveals answers live — wrong
--     for an exam-style mock).
--   • `pass_score` is a 0..1 fraction — same scale as
--     nclex_attempts.final_score, so pass/fail is a clean
--     `final_score >= pass_score` comparison. NULL = ungraded.
--   • The mode↔duration coherence rule (timed modes carry a
--     duration, untimed modes don't) is enforced in the save
--     action, not as a DB CHECK — matches slice 10.7's app-layer
--     window-ordering validation.
--   • Full CRUD RLS ships in this slice. Students never SELECT
--     these tables directly — the student read path is the
--     SECURITY DEFINER launch RPC built in slice 3.
--
-- Backfill: none. Both tables start empty.


-- =========================================================
-- 1. nclex_tutor_quizzes
-- =========================================================
-- One row per reusable quiz. Tutor-owned (tutor_id), reusable
-- across programmes — a quiz is not scoped to any one programme.
-- Mock/Practice activities point at a quiz by quiz_id (slice 2);
-- they own no quiz content.

CREATE TABLE nclex_tutor_quizzes (
  quiz_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id         UUID NOT NULL
                   REFERENCES nclex_users(id) ON DELETE CASCADE,

  title            TEXT NOT NULL,

  -- Optional one-liner shown on the quiz list card and (slice 3)
  -- the student launch modal.
  description      TEXT,

  -- MOCK vs PRACTICE. Derives `intent` for the attempt
  -- (MOCK → EXAM, PRACTICE → STUDY) — no stored intent column.
  quiz_kind        TEXT NOT NULL
                   CHECK (quiz_kind IN ('MOCK', 'PRACTICE')),

  -- One of the four NON-ADAPTIVE runner modes. CAT is excluded:
  -- it selects each next question adaptively, which is
  -- incompatible with a quiz's hand-picked fixed question list.
  mode             TEXT NOT NULL
                   CHECK (mode IN (
                     'UNTIMED_LEARNING',
                     'UNTIMED_TEST',
                     'TIMED_FREE_NAV',
                     'TIMED_SEQUENTIAL'
                   )),

  -- Set for timed modes only; NULL for untimed modes. The
  -- mode↔duration coherence rule is enforced in the save action,
  -- not here (matches slice 10.7's app-layer validation).
  duration_seconds INTEGER
                   CHECK (duration_seconds IS NULL OR duration_seconds > 0),

  -- Pass threshold as a 0..1 fraction — same scale as
  -- nclex_attempts.final_score, so pass/fail is final_score >=
  -- pass_score. NULL = ungraded (no pass/fail badge). The UI
  -- shows it as a percentage.
  pass_score       NUMERIC
                   CHECK (pass_score IS NULL
                          OR (pass_score >= 0 AND pass_score <= 1)),

  -- How many times a student may attempt the quiz; checked at
  -- attempt creation (slice 3). NULL = unlimited.
  max_attempts     INTEGER
                   CHECK (max_attempts IS NULL OR max_attempts >= 1),

  status           TEXT NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- (quiz_kind, mode) pairing, mirroring
  -- nclex_attempts_intent_mode_tuple via MOCK → EXAM /
  -- PRACTICE → STUDY. PRACTICE allows all four modes; MOCK
  -- excludes UNTIMED_LEARNING (that mode reveals answers live —
  -- wrong for an exam-style mock).
  CONSTRAINT nclex_tutor_quizzes_kind_mode_tuple CHECK (
    (quiz_kind, mode) IN (
      ('PRACTICE', 'UNTIMED_LEARNING'),
      ('PRACTICE', 'UNTIMED_TEST'),
      ('PRACTICE', 'TIMED_FREE_NAV'),
      ('PRACTICE', 'TIMED_SEQUENTIAL'),
      ('MOCK',     'UNTIMED_TEST'),
      ('MOCK',     'TIMED_FREE_NAV'),
      ('MOCK',     'TIMED_SEQUENTIAL')
    )
  )
);

-- Quizzes of a tutor — drives the /tutor/quizzes list query.
CREATE INDEX idx_nclex_tutor_quizzes_tutor
  ON nclex_tutor_quizzes(tutor_id);


-- =========================================================
-- 2. nclex_tutor_quiz_items
-- =========================================================
-- The ordered list of question references that IS the quiz.
-- The question count is count(quiz_items) — not a stored column.

CREATE TABLE nclex_tutor_quiz_items (
  quiz_item_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id          UUID NOT NULL
                   REFERENCES nclex_tutor_quizzes(quiz_id)
                   ON DELETE CASCADE,

  -- Position within the quiz (1-based). Renumbered by the
  -- reorder action; no DB-level contiguity guarantee.
  position         INTEGER NOT NULL CHECK (position >= 1),

  -- A real FK — quiz items reference tutor-authored questions
  -- only (no shared-bank questions, no polymorphism). ON DELETE
  -- CASCADE: if the tutor deletes a question, it drops out of
  -- any quiz that referenced it. In-progress / past attempts are
  -- unaffected — they hold frozen snapshots, not references.
  item_id          TEXT NOT NULL
                   REFERENCES nclex_tutor_questions(item_id)
                   ON DELETE CASCADE,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A question can't appear twice in the same quiz.
  CONSTRAINT nclex_tutor_quiz_items_unique UNIQUE (quiz_id, item_id)
);

-- Items of a quiz — drives the quiz editor's "selected questions"
-- list query (ordered by position).
CREATE INDEX idx_nclex_tutor_quiz_items_quiz
  ON nclex_tutor_quiz_items(quiz_id);


-- =========================================================
-- 3. RLS — quizzes / quiz items
-- =========================================================
-- Tutor-owned, following the nclex_tutor_questions pattern (the
-- closest sibling — tutor-authored content): one FOR ALL "own"
-- policy + one FOR ALL SUPER_ADMIN bypass per table.
--
--   nclex_tutor_quizzes     → ownership is direct (tutor_id).
--   nclex_tutor_quiz_items  → ownership traces through the parent
--                             quiz (no tutor_id column on the row).
--
-- Students never SELECT these tables directly — the student read
-- path is the SECURITY DEFINER launch RPC built in slice 3.

ALTER TABLE nclex_tutor_quizzes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_tutor_quiz_items ENABLE ROW LEVEL SECURITY;


-- ---------- nclex_tutor_quizzes ----------

CREATE POLICY nclex_tutor_quizzes_tutor_own
  ON nclex_tutor_quizzes FOR ALL
  TO authenticated
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_quizzes_superadmin
  ON nclex_tutor_quizzes FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- ---------- nclex_tutor_quiz_items ----------

CREATE POLICY nclex_tutor_quiz_items_tutor_own
  ON nclex_tutor_quiz_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_tutor_quizzes q
      WHERE q.quiz_id = nclex_tutor_quiz_items.quiz_id
        AND q.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_tutor_quizzes q
      WHERE q.quiz_id = nclex_tutor_quiz_items.quiz_id
        AND q.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_tutor_quiz_items_superadmin
  ON nclex_tutor_quiz_items FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));
