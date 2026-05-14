# Tutor Quiz System — Plan

The Mock / Practice Quiz system for tutored programmes. Settled in
the 2026-05-15 planning conversation. Build not yet started.

## 1. Core model

Three layers, kept separate:

- **Tutor quiz** — a reusable quiz *plan*: metadata + an ordered
  list of question *references*. Tutor-owned, reusable across
  programmes and activities.
- **Mock / Practice activity** — a thin pointer. Its payload
  carries `{ quiz_id }`; it owns no quiz content.
- **Student attempt** — a frozen *snapshot* of the quiz's
  questions, taken when the student starts.

**The snapshot happens at student attempt creation — never at
quiz creation.** Question edits flow into the quiz right up until
a student starts; once an attempt exists it is frozen and immune
to later edits. The quiz stores references; the attempt stores
the snapshot. (Same model the bank-side `nclex_create_attempt`
already uses.)

The runner is unchanged — a programme-assigned attempt is just an
attempt; the runner consumes it like any other.

## 2. Scope (v1)

- **Standalone questions only.** No cases or trends in v1 quizzes.
  Adding them later is the bank-builder's case/trend selection
  pattern, copied — not a new design.
- **Tutor-authored questions only.** Quiz items reference
  `nclex_tutor_questions`. The shared QAcademy bank is **not** a
  quiz source in v1 — the bank has its own consumption path (the
  self-study Builder); a tutor quiz is the tutor's own material.
- **Both activity types** — Mock and Practice quiz — use the same
  quiz object; `quiz_kind` distinguishes them.

## 3. Schema

### `nclex_tutor_quizzes`

| column | notes |
|---|---|
| `quiz_id` | PK — UUID (`gen_random_uuid()`), matching the structural tables (programmes, units, activities) |
| `tutor_id` | owner; quizzes are tutor-scoped and reusable |
| `title` | |
| `description` | nullable — shown on the quiz list card and (later) the student launch modal |
| `quiz_kind` | `MOCK` \| `PRACTICE` |
| `mode` | one of the **four non-adaptive** runner modes — `UNTIMED_LEARNING`, `UNTIMED_TEST`, `TIMED_FREE_NAV`, `TIMED_SEQUENTIAL`. `CAT` is excluded: it selects each next question adaptively, which is incompatible with a quiz's hand-picked fixed list. The tutor picks the mode; `quiz_kind` sets the editor default |
| `duration_seconds` | nullable — set for timed modes only; the mode↔duration coherence rule is app-layer (the save action), not a DB CHECK |
| `pass_score` | nullable — pass threshold as a `0..1` fraction (same scale as `nclex_attempts.final_score`, so pass/fail is `final_score >= pass_score`); shown as a % in the UI; null = ungraded |
| `max_attempts` | nullable — null = unlimited |
| `status` | `DRAFT` \| `PUBLISHED` \| `ARCHIVED` |
| `created_at`, `updated_at` | |

**`(quiz_kind, mode)` pairing** is a DB CHECK constraint, mirroring
`nclex_attempts_intent_mode_tuple`. `PRACTICE` allows all four modes;
`MOCK` excludes `UNTIMED_LEARNING` (that mode reveals answers live,
which doesn't fit an exam-style mock). Derived from the existing
attempts tuple constraint via `MOCK → EXAM`, `PRACTICE → STUDY`.

**No `intent` column.** `intent` is derived from `quiz_kind`:
`MOCK → EXAM`, `PRACTICE → STUDY`. One source of truth.

### `nclex_tutor_quiz_items`

| column | notes |
|---|---|
| `quiz_item_id` | PK — UUID |
| `quiz_id` | FK → `nclex_tutor_quizzes`, `ON DELETE CASCADE` |
| `position` | order within the quiz (1-based; renumbered by the reorder action) |
| `item_id` | FK → `nclex_tutor_questions`, `ON DELETE CASCADE` (a real FK — tutor-only, so no polymorphism; if a tutor deletes a question it drops out of any quiz referencing it — in-progress/past attempts are unaffected, they hold snapshots) |
| `created_at` | |

`UNIQUE (quiz_id, item_id)` — a question can't be added twice.
The question count is `count(quiz_items)` — not a stored column.

### RLS

Tutor-owned: a tutor CRUDs their own quizzes and items. Students
never SELECT these tables directly — the student read path is the
SECURITY DEFINER launch RPC (§4).

## 4. Attempt creation

New RPC: **`nclex_create_programme_attempt(programme_activity_id)`**.

Unlike the bank's `nclex_create_attempt` (pool selection with
drift), this is a **fixed-list snapshot** — the tutor already
chose the questions. Flow:

1. Read the activity → `payload.quiz_id`.
2. Validate: the activity is OPEN (slice-10.7 `openState`), the
   quiz is `PUBLISHED`, and the student has attempts remaining
   (`max_attempts`).
3. Create the `nclex_attempts` row: `source = PROGRAMME_ASSIGNED`,
   `programme_activity_id` set, `intent` derived from
   `quiz_kind`, `mode` from the quiz, `filters_json = {}` (the
   column is NOT NULL; a fixed-list attempt has no filters).
4. Snapshot the quiz's items — in `position` order — into
   `nclex_attempt_items`. Reuses the existing snapshot machinery.
5. Return `attempt_id`; the student goes to the existing runner.

## 5. Mock / Practice activity

The activity payload stays thin: `{ quiz_id: string | null }`.

- `quiz_id = null` → non-launchable (the current placeholder
  state).
- `quiz_id` set → launchable.

The student-side viewer is a **modal** — it joins the per-type
viewer family from slices 10.2–10.5. It shows the quiz info
(title, question count, timed/untimed, attempts remaining) and a
**Start** button. Start → `nclex_create_programme_attempt` →
navigate to the existing runner.

## 6. Pass mark and attempt limit

Two tutor-set fields:

- **`pass_score`** — threshold for a pass/fail badge on the
  results screen. Nullable (ungraded).
- **`max_attempts`** — how many times a student may attempt the
  quiz; checked at attempt creation (§4). Null = unlimited.

Feedback and review *timing* is not a quiz field — the runner
already governs it by `mode` (UL reveals correctness live;
batched / sequential reveal it at completion; any completed
attempt shows review). A quiz's feedback behaviour *is* its
mode. See §9 for the one case the mode doesn't cover.

## 7. Building a quiz — the tutor editor

The quiz editor (`/tutor/quiz/[id]`) is one page, two zones:

- **Selected questions** — the ordered list that *is* the quiz.
  Reorder with up/down arrows; remove per row.
- **Question picker** — the tutor's own question library, below
  the selected list. Reuses the existing `/tutor/bank/all` filter
  bar (question type, client-needs category, difficulty, text
  search). Each row shows the stem + type + difficulty + a
  checkbox; rows already in the quiz show as "Added". The tutor
  filters, checks the questions they want, and clicks Add — the
  picks append to the selected list.

The picker is scoped to the tutor's **published, standalone**
questions only:
- *Published* — a quiz is built from finished questions. A tutor
  who wants a question in a quiz publishes it first; this avoids
  a "published quiz containing a draft question" inconsistency.
- *Standalone* — `parent_case_id IS NULL AND trend_id IS NULL`.
  Case-children and trend-linked questions are hidden — they need
  the case/trend snapshot machinery, out of v1 scope per §2.

Reuse note: `<BankFilters>` and the filtered query from
`/tutor/bank/all` are reused as-is; the picker's row list is its
own simple checkbox renderer (the bank list's rows carry *edit*
affordances — the picker needs *add* affordances).

## 8. Build arc

- **Slice 1 — Quiz foundation.** Migration (both tables + RLS).
  The tutor "Quizzes" surface — `/tutor/quizzes` (list) +
  `/tutor/quiz/[id]` (editor) — quiz metadata plus the question
  picker (§7). Removes the stale `/tutor/programme/[id]/mocks`
  placeholder route.
- **Slice 2 — Link to activity.** The Mock / Practice activity
  editor gains "Choose a quiz" — pick from the tutor's
  `PUBLISHED` quizzes; stores `payload.quiz_id`.
- **Slice 3 — Student launch.** The
  `nclex_create_programme_attempt` RPC; the Mock / Practice
  `<ActivityAction>` goes live as the modal viewer (§5); the
  max-attempts check at launch, and the pass/fail badge on the
  results screen.
- **Slice 4 — Progress / analytics.** Quiz completion → activity
  completion → unit/programme progress → tutor analytics.
  Deferred — depends on the student progress engine.

## 9. Not in v1

- Cases and trends as quiz content.
- The shared QAcademy bank as a quiz source.
- **Locking review of a completed attempt until the cohort close
  date** — exam-integrity gating, so a student who finishes early
  can't leak the answer key. The runner's `mode` doesn't cover
  this, but it is *not* a per-quiz setting (a quiz is reusable
  across cohorts). If it ever lands, it belongs on the cohort
  checklist row next to `close_date`, not on the quiz.
- Dynamic / rule-based question selection (e.g. "10 random from
  Pharmacology"). v1 is manual selection only.
- Slice 4 (progress / analytics integration).
