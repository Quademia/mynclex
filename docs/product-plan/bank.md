# MyNclex — The Bank (Question Bank)

*Living document. Extracted on 2026-04-20 when the overall product
plan grew too heavy. Part of the `mynclex/docs/product-plan/` set —
see [main.md](main.md) for the overall product plan.*
Last updated: 2026-04-20 (bank settled)

> **Authoring UI rebuild — April 2026.** The authoring layer (curator
> editors, modal vs page hosts, save/publish flows, where editor code
> lives) is being rebuilt — see
> [questions-and-wrappers-rebuild.html](questions-and-wrappers-rebuild.html)
> for the new direction. **Schema, JSONB shapes, scoring,
> classification, chart-tab structure, and trend dataset shape in this
> doc remain authoritative.** Paragraphs that mention specific URLs
> (`/admin/bank/cases/[case_id]`, `/admin/trends/[trend_id]`),
> components (`QuestionAuthoringPanel`, `lib/bank/...`), or "Where the
> code lives" describe the *current* shipped system that the rebuild
> will replace beside, then swap. Treat those as historical until the
> swap lands.

---

## What this covers

The NCLEX-RN question bank — the content layer that feeds both
self-study students (buying standalone access) and tutored programmes
(assigning questions into Practice quiz and Mock activities).

With the bank settled, only **Content sourcing** and **Student
enrolment flow** remain open in MyNclex planning.

---

## Parallel ownership model

The bank lives in two parallel sets of tables with identical shapes:

- **QAcademy-owned** (prefix `nclex_bank_*`, `nclex_case_studies`,
  `nclex_readiness_packs`) — admin-authored, shared across all tutors
  and students. The product self-study students buy access to, and
  that tutors draw from into their programmes.
- **Tutor-private** (prefix `nclex_tutor_*`) — tutor-authored, private
  to each tutor. Only visible inside that tutor's programmes.
  Distinguished from QAcademy tables by a `tutor_id` owner column.

Why identical shapes:

- Shared rendering code — same question viewer handles both.
- Shared authoring UI — same editor form works for both.
- If a tutor later contributes a question to the main bank, it's a
  straight row copy with ownership cleared.
- No schema drift to maintain.

---

## Seven core tables

```
QAcademy-owned:
  nclex_bank_items              -- questions (all 9 types)
  nclex_case_studies            -- case-study scenarios + chart data
  nclex_case_study_items        -- join: case <-> questions (ordered)
  nclex_readiness_packs         -- curated readiness assessment packs

Tutor-private:
  nclex_tutor_questions         -- tutor's private questions
  nclex_tutor_case_studies      -- tutor's private case studies
  nclex_tutor_case_study_items  -- tutor's private join table
```

No `nclex_tutor_readiness_packs` — readiness packs are a QAcademy
product only. Tutors use Mock activities within their programmes
instead.

---

## Question item schema (`nclex_bank_items`)

```
item_id                     TEXT PK
question_type               TEXT     -- see Question types below

-- Common content shell
stem                        TEXT
rationale                   TEXT
rationale_img               TEXT

-- Polymorphic content (JSONB, shape varies by question_type)
content                     JSONB    -- the question's structure
correct                     JSONB    -- the correct-answer shape

-- Classification axes (all optional except the two NCLEX ones)
client_needs_category       TEXT *
client_needs_subcategory    TEXT *
nursing_subject             TEXT
body_system                 TEXT
topic                       TEXT
subtopic                    TEXT
difficulty                  TEXT     -- Easy | Medium | Hard
bloom_level                 TEXT     -- Remember through Create
tags                        TEXT[]

-- Visibility and packaging
is_free_sample              BOOLEAN  DEFAULT FALSE
is_builder_visible          BOOLEAN  DEFAULT TRUE
is_published                BOOLEAN  DEFAULT FALSE   -- draft vs live

-- Housekeeping
marks                       NUMERIC
shuffle_options             BOOLEAN
question_ref                TEXT
batch_id                    TEXT
created_at, updated_at
```

`nclex_tutor_questions` has the same columns plus a `tutor_id` FK.

Dropped from Licensure/MyTeacher: inline `option_a..f` columns
(replaced by JSONB `content`), `subject` (redundant for NCLEX), and
`year_level` (not meaningful for NCLEX).

### The two JSONB columns explained

`content` holds what the student sees **before** submitting. It never
contains correct-answer information or feedback — `content` is safe
to send to the browser; the browser should not learn the answer
until after submission.

Example `content` shapes:

- **MCQ:** `{ "options": [{ "id": "A", "text": "..." }, ...] }`
- **Matrix:**
  ```
  {
    "row_label": "Finding",
    "rows":    [{ "id": "r1", "text": "..." }, ...],
    "columns": [{ "id": "c1", "text": "..." }, ...]
  }
  ```
- **Bow-tie:**
  ```
  {
    "left":   { "label": "Actions to take",       "tokens": [{"id":"lt1","text":"Give aspirin"}, ...] },
    "centre": { "label": "Condition",             "tokens": [{"id":"ct1","text":"Inferior wall MI"}, ...] },
    "right":  { "label": "Parameters to monitor", "tokens": [{"id":"rt1","text":"Cardiac rhythm"}, ...] }
  }
  ```
- **Highlight:**
  ```
  {
    "chunks": [
      { "id": "h1", "text": "93%" },
      { "id": "h2", "text": "184/96" },
      { "id": "h3", "text": "118" }
    ]
  }
  ```
  The passage lives on `stem` with `[[chunk text]]` double-bracket
  syntax intact — single brackets like `[K⁺] = 3.2` are literal
  passage text (medical notation safe). Inner single brackets are
  permitted inside chunks (`[[low Hgb [<10 g/dL]]]`); the parser uses
  the non-greedy pattern `/\[\[(.+?)\]\]/g`. Chunk IDs `h1`, `h2`, …
  are stable positional, assigned in passage order at save time.
- **Cloze:**
  ```
  {
    "blanks": [
      { "id": "b1", "choices": [{ "id": "c1", "text": "heart failure" }, ...] },
      { "id": "b2", "choices": [{ "id": "c1", "text": "elevated BNP" },   ...] }
    ]
  }
  ```
  The sentence lives on `stem` with inline `{N}` markers (e.g.
  `"The client is most likely experiencing {1} as evidenced by {2}."`).
  Blank IDs `b1`, `b2`, … are stable across reorders; choice IDs `c1`,
  `c2`, … restart per blank — the nested `correct.feedback` map
  disambiguates by nesting under the blank ID. Markers are auto-renumbered
  on save when gaps are detected (`{1} {3}` → `{1} {2}`), with blank IDs
  remapped in lockstep.
- **Drag-drop:**
  ```
  {
    "subtype": "ORDERED" | "SENTENCE",
    "slots":  [{ "id": "s1", "target_text": "1st action" }, ...],
    "tokens": [{ "id": "t1", "text": "Apply O₂" }, ...]
  }
  ```
  One shape, two subtypes via the `subtype` discriminator. **ORDERED**
  has all form slots active (ranked positions like "1st", "2nd"); the
  slot card's `target_text` is the position label. **SENTENCE** has
  inline `[N]` markers in `stem` (single-bracket positive integers);
  a slot `sN` is active iff `[N]` appears in the stem, and
  `target_text` is an optional hint ("most likely condition"). The
  token pool may contain distractors (`tokens.length >=
  slots.length`, capped at `min(slots + 4, 12)`). Each token can
  fill at most one slot — no reuse. Unlike Cloze, `stem` is preserved
  byte-identically (no silent renumber); v1 bounds (3–8 slots, unique
  markers) make renumbering unnecessary. Reference mockup:
  `mockups/drag-drop-editor-mockup.html`.

`correct` holds the correct-answer shape **and** per-option /
per-cell / per-slot feedback. Everything the student sees **after**
submitting lives here. Delivered to the browser only after submit.

Example `correct` shapes (with feedback):

- **MCQ:**
  ```
  {
    "answer": "C",
    "feedback": {
      "A": "Incorrect. Option A explanation...",
      "B": "Incorrect. Option B explanation...",
      "C": "Correct. Why C is right...",
      "D": "Incorrect. Option D explanation..."
    }
  }
  ```
- **SATA:**
  ```
  { "answers": ["A", "C", "E"], "feedback": { "A": "...", "B": "...", ... } }
  ```
- **Matrix:**
  ```
  {
    "cells": { "r1": "c1", "r2": "c2", "r3": "c3" },   -- rowId -> correct columnId
    "feedback": { "r1": "Row 1 explanation...", "r2": "...", "r3": "..." }
  }
  ```

  Matrix uses string IDs (`r1`/`c1` style) rather than positional
  indices. This keeps correct-answer references stable when rows or
  columns are reordered or shuffled — consistent with Family A option
  IDs (A/B/C).
- **Highlight:**
  ```
  {
    "correct_ids": ["h2", "h3", "h5"],
    "feedback": {
      "h1": "SpO₂ 93% on 4L is acceptable.",
      "h2": "BP 184/96 is hypertensive crisis range — escalate immediately.",
      "h3": "HR 118 with chest pressure is a red flag."
    }
  }
  ```

  Flat feedback map keyed by chunk ID (unlike Cloze's nested per-blank
  map). Chunk IDs are stable positional — `h1`, `h2`, … assigned in
  passage order — so a curator can edit the text inside `[[...]]`
  without breaking the existing feedback reference. Scoring is
  plus-minus per chunk with `HIGHLIGHT_MIN_CORRECT=1` and
  `HIGHLIGHT_MIN_WRONG=1` enforced so students can't "click everything
  = 100%".
- **Bow-tie:**
  ```
  {
    "left":     ["lt1", "lt2"],
    "centre":   "ct1",
    "right":    ["rt1", "rt2"],
    "feedback": { "lt1": "...", "ct1": "...", "rt1": "..." }
  }
  ```

  Bow-tie uses three self-contained wings with curator-defined labels
  (preset dropdown + typeable custom). Wing-scoped correctness: 2 / 1 /
  2. Token IDs prefixed `lt` / `ct` / `rt` so the flat feedback map
  works across all three wings without collisions.
- **Cloze:**
  ```
  {
    "answers":  { "b1": "c1", "b2": "c1" },
    "feedback": {
      "b1": { "c1": "...", "c2": "..." },
      "b2": { "c1": "..." }
    }
  }
  ```

  Cloze feedback is nested — keyed first by blank ID, then by choice
  ID. Choice IDs (`c1`, `c2`) restart per blank; nesting avoids the
  collision that a flat map would produce. Feedback for any choice is
  optional.
- **Drag-drop:**
  ```
  {
    "slots": { "s1": "t2", "s2": "t5", "s3": "t1" },   -- slotId -> correct tokenId
    "feedback": { "s1": "Oxygen first — airway before circulation." }
  }
  ```
  Flat `slots` map covers only active slots (ORDERED: every form
  slot; SENTENCE: every slot whose `[N]` is in the stem — orphans
  are dropped at save). `feedback` is sparse — only non-empty
  per-slot feedback survives. Token IDs in the rubric must all be
  present in `content.tokens`; no token may appear as correct for
  more than one slot (the parser rejects reuse).

### Per-option feedback

- Every question type supports per-option (or per-cell / per-chunk /
  per-slot) feedback inside `correct.feedback`.
- The feedback dictionary is keyed by the identifier from `content`
  (option id, row index, chunk text, or token text).
- Not every key must be populated — authors write feedback where it
  adds learning value; skipped keys fall back to the overall
  `rationale` field.
- For **MCQ / TF / SATA / Select N**, feedback is expected for every
  option (matches Licensure/MyTeacher practice).
- For **Matrix / Highlight / Cloze / Drag-drop / Bow-tie**, feedback
  is optional per element.

### Why feedback lives in `correct`, not `content`

- **Security:** if feedback lived in `content`, a student could
  inspect page source and see "Option A — Correct" before answering.
  Putting feedback in `correct` means the browser never receives it
  until after submission.
- **Semantic fit:** feedback explains why each answer is right or
  wrong — that's part of the answer key, not the question display.
- **Keeps `content` focused:** `content` is the bare question;
  `correct` is the full answer package.

### Why JSONB (not child tables)

One storage pattern across all 9 question types. Adding a new type
later = no migration, just new authoring form + renderer + scoring
function. No DB-level validation of JSON shape — application layer
validates. Standard trade-off for polymorphic content in Postgres.

---

## Question types (9 total, all ship in v1)

| Code | Name | Scoring function |
|---|---|---|
| `MCQ` | Multiple choice | All-or-nothing |
| `TF` | True/false | All-or-nothing |
| `SATA` | Select all that apply | Plus-minus with floor |
| `SELECT_N` | Select exactly N | Plus-minus with floor |
| `MATRIX` | Matrix / grid | Per-row, summed |
| `HIGHLIGHT` | Highlight findings in passage | Plus-minus per chunk |
| `CLOZE` | Drop-down fill-in-the-blank | Per-blank (with paired variant) |
| `DRAG_DROP` | Drag tokens into target slots | Per-slot, summed |
| `BOWTIE` | 5-slot bow-tie (stand-alone structural) | Per-slot (5), summed |

**TREND is a wrapper, not a standalone type.** Trend items attach a
time-series panel (vitals, labs, I&O, assessments across timepoints)
to an existing bank item via a nullable FK. The host item remains
one of the 9 question types above; the trend panel renders alongside
the stem. Same mechanism idea as Case Study, but with a one-to-one
FK instead of a join table. Promoted from v2 to v1 on 2026-04-22.

### Build order

For when implementation starts:

1. MCQ, TF, SATA (simplest, already known from Licensure/MyTeacher)
2. Select N (small variant of SATA)
3. Bow-tie (signature NGN item, relatively bounded)
4. Matrix (structured grid)
5. Cloze (sentence with drop-downs)
6. Highlight (text-with-selectable-chunks)
7. Drag-drop (most interactive) — shipped 2026-04-22 (Slice 1.10)
8. Case studies wrapper (groups existing types + chart tabs)

---

## Classification axes (student filter surface)

All 10 fields are filterable:

1. `question_type`
2. `client_needs_category` *
3. `client_needs_subcategory` *
4. `nursing_subject`
5. `body_system`
6. `topic`
7. `subtopic`
8. `difficulty`
9. `bloom_level`
10. `tags`

The two starred fields are effectively required at authoring time;
everything else is optional. Students filter on any combination.

---

## Case studies

### `nclex_case_studies`

```
case_id                  TEXT PK
title                    TEXT
scenario_summary         TEXT

-- Chart tabs (each a JSONB array of entries; see Chart tab structure)
nurses_notes             JSONB
vital_signs              JSONB
lab_results              JSONB
orders                   JSONB
history                  JSONB     -- optional
diagnostics              JSONB     -- optional

-- Classification + visibility (mirrors bank_items)
client_needs_category    TEXT
client_needs_subcategory TEXT
nursing_subject          TEXT
body_system              TEXT
topic                    TEXT
subtopic                 TEXT
difficulty               TEXT
tags                     TEXT[]

is_free_sample           BOOLEAN  DEFAULT FALSE
is_builder_visible       BOOLEAN  DEFAULT TRUE

created_at, updated_at
```

### `nclex_case_study_items` (join table)

Connects a case study to its 6 questions in CJMM order:

```
id                TEXT PK
case_id           TEXT FK -> nclex_case_studies
item_id           TEXT FK -> nclex_bank_items
position          INTEGER  -- 1 through 6
cjmm_step         TEXT     -- Recognise cues | Analyse cues |
                           -- Prioritise | Generate solutions |
                           -- Take action | Evaluate outcomes
created_at
```

### Chart tab structure (fixed tab schema)

Each tab column holds a list of structured entries. Every entry has
a `visible_from` number (1–6) that controls unfolding:

- **Nurses' Notes:** `{ time, text, visible_from }`
- **Vital Signs:** `{ time, bp, hr, rr, spo2, temp, weight, pain, visible_from }`
- **Lab Results:** `{ time, test_name, value, unit, reference_range, flag, visible_from }`
- **Orders:** `{ time, order_text, status, visible_from }`
- **History (optional):** `{ section, text }` (no unfolding)
- **Diagnostics (optional):** `{ time, test_type, findings, visible_from }`

**Unfolding:** when the student is on question N, each tab filters
to entries where `visible_from <= N`. Same row in the DB, different
filter per question.

### Why not child tables for the chart

Every case study's chart is only ever read as a unit together with
its questions. There's no cross-case-study query that makes child
tables (e.g. `case_study_notes`, `case_study_vitals`) worth the
overhead. One row per case study, one JSONB column per tab.

---

## Readiness packs

A QAcademy product — curated assessments sold separately from the
main bank. Questions in readiness packs are **reserved**: they don't
appear in the custom quiz builder.

### `nclex_readiness_packs`

Same shape as Licensure's `quizzes` table:

```
pack_id          TEXT PK
title            TEXT
description      TEXT
item_ids         TEXT[]     -- array of nclex_bank_items IDs
n                INTEGER
time_limit_sec   INTEGER
price_cents      INTEGER    -- sold separately
published        BOOLEAN
publish_at       TIMESTAMPTZ
unpublish_at     TIMESTAMPTZ
status           TEXT       -- draft | active | archived
created_at, updated_at
```

### How `is_builder_visible` works

- Admin authoring a readiness-pack question sets `is_builder_visible = FALSE`.
- Admin adds the question to the pack's `item_ids` array.
- Student-builder queries use `WHERE is_builder_visible = TRUE` as
  baseline filter — readiness-pack questions are invisible to the
  builder.
- Readiness pack runner loads `item_ids` directly, bypassing the flag.
- Once a student has completed a readiness pack, the questions stay
  hidden from the builder forever (no per-student unlock state).

---

## Scoring model (NCSBN-exact)

Scoring is application code (not database structure), organised as
small modular functions dispatched by `question_type`. Five
functions cover all nine types:

| Function | Logic | Used by |
|---|---|---|
| `scoreAllOrNothing` | Full marks if exactly correct, else 0 | MCQ, TF |
| `scorePlusMinus` | +1 per right, -1 per wrong, floor at 0 | SATA, Select N, Highlight |
| `scorePerRow` | Apply 0/1 or +/- per row, sum | Matrix |
| `scorePerBlank` | Apply 0/1 or paired per blank, sum | Cloze |
| `scorePerSlot` | Apply +/- per slot, sum with floor | Drag-drop, Bow-tie |

**Paired scoring** (Cloze cause-effect): both halves must be right
together — first right + second wrong = 0.

Each scoring function is implemented against NCSBN's official rules,
tested in isolation against real NCLEX-released sample questions,
and versioned separately from schema.

Database stores: student's submitted answer, correct answer (from
`correct` JSONB), and max marks (`marks` column). Scoring function
per type does the math.

---

## Question-selection UI (design principles only)

Two separate UIs use the same underlying bank:

**Admin question picker** (readiness packs, fixed content):

- Reuses the pattern from Licensure's `admin/fixed-quizzes.html`.
- Multi-step: filter narrow → tick specific questions → add to list.
- Preview of each question.

**Student/tutor filter builder** (custom practice, Practice quiz
activity, Mock activity):

- Reuses the pattern from Licensure's student quiz builder.
- Filter chips (subject, system, topic, difficulty, question type)
  + count; system picks at runtime.

New for MyNclex: filters include NGN-specific axes —
`question_type` (SATA, Matrix, Bow-tie, etc.), `cjmm_step` (for
case-study questions), `client_needs_category`, plus the other
classifications.

Full mockups deferred to when each feature is built.

---

## Related topics

- **Curriculum authoring UX — SETTLED.** Practice quiz and Mock
  activity editors had placeholder "blocked on bank" notes. Now
  unblocked.
- **Content sourcing** (still open) — with the bank schema settled,
  this is the next topic.
- **Student enrolment flow** (still open) — independent of the bank,
  but the bank pricing (30/90/180-day packs) connects to enrolment.

---

## Related topics — content sourcing

Content sourcing (authoring strategy, editorial process, QA) is
settled. See [main.md — Content Sourcing](main.md#content-sourcing).
Two small schema additions result from that topic:

- `is_published` boolean on `nclex_bank_items` and
  `nclex_tutor_questions`.
- New table `nclex_question_reports` (student-reported questions).

## Decisions not yet settled

- `computed_difficulty` column (v2 — difficulty computed from
  student performance).
- Paired-scoring Cloze authoring UI details.
- Exact readiness-pack purchase flow and pricing tiers (connects to
  student enrolment flow topic).

See `## Trend items — planned shape` below for the Trend decisions
that are now settled and queued for build.

---

## Trend items — as built

Shipped across Slices 1.12a / 1.12b / 1.12c (April 2026). This
section describes the shape that was actually built, superseding
the pre-build "planned shape" text. The mockup at
`mockups/trend-visualisation.html` is still the authoritative
student-side reference for panel layout.

### What a Trend item is

One question item with a **time-series data panel** shown alongside
the stem. The "trend" is data across timepoints — vitals over 3 hours,
labs over 3 days, I&O across shifts, assessments at 0800/1000/1200.
The student reads the pattern and answers using one of the existing
question types. Matrix / Cloze / Highlight / SATA are the best-fitting
hosts; the schema doesn't restrict the set.

### Relationship to Case Study

Trend and Case Study are **structurally the same family** but at
different scales:

|                         | Trend                                | Case Study                             |
|-------------------------|--------------------------------------|----------------------------------------|
| Question items          | Variable N (0..)                     | 6 (fixed)                              |
| Question types used     | Any existing, mixed                  | Up to 6 (one per item, can all differ) |
| Shared context          | Time-series data table               | Multi-tab patient chart                |
| Progression             | None (one snapshot)                  | Chart unfolds across the 6 items       |
| Schema home             | Own table + nullable FK on bank item | Own table + join table                 |
| Curator UI              | `/admin/trends/[trend_id]` split     | `/admin/bank/cases/[case_id]` split    |

The shared principle: **clinical context data is separate from the
question item itself, and joined to it.** Neither type stuffs the
context into the stem text.

### Schema — as built

Two dataset tables, one nullable FK column on each question table, no
join table (the 1:N link is cheap enough on the item side alone).

```sql
-- Slice 1.12a — admin-owned dataset table
CREATE TABLE nclex_trend_datasets (
  trend_id      TEXT PRIMARY KEY,      -- NCLEX_TRD_NNNNN
  title         TEXT NOT NULL,
  scenario      TEXT,
  kind          TEXT NOT NULL,         -- freeform; no CHECK constraint
  timepoints    JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows          JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Slice 1.12a — tutor-private twin (NCLEX_TUT_TRD_NNNNN)
-- Identical columns + tutor_id UUID REFERENCES nclex_users(id) ON DELETE CASCADE.

-- Slice 1.12b — nullable FK on the two question tables
ALTER TABLE nclex_bank_items
  ADD COLUMN trend_id TEXT REFERENCES nclex_trend_datasets(trend_id)
  ON DELETE RESTRICT;
ALTER TABLE nclex_tutor_questions
  ADD COLUMN trend_id TEXT REFERENCES nclex_tutor_trend_datasets(trend_id)
  ON DELETE RESTRICT;

-- Partial indexes — 99% of items have trend_id = NULL; only linked
-- rows carry the index cost.
CREATE INDEX nclex_bank_items_trend_id_idx
  ON nclex_bank_items(trend_id) WHERE trend_id IS NOT NULL;
CREATE INDEX nclex_tutor_questions_trend_id_idx
  ON nclex_tutor_questions(trend_id) WHERE trend_id IS NOT NULL;
```

**No classification columns on the dataset.** Client-needs category,
subcategory, nursing subject, body system, topic, subtopic,
difficulty, Bloom level, and tags all live on the attached question
rows — `nclex_bank_items` has them, datasets don't. Rationale: one
dataset can legitimately host questions of different difficulties or
subcategories (same trend data, different reasoning target), and
duplicating classification on the wrapper would re-create the
wrapper-vs-child-drift problem that tripped Case Study in 1.11b.

### `kind` — freeform with UI template sugar

`kind` is `TEXT NOT NULL` with no CHECK constraint. The UI offers five
presets (`vitals`, `labs`, `io`, `neuro`, `assessment`) plus a
"Custom…" option that accepts any string. Picking a preset at
creation seeds starter rows (and, for `labs`, pre-populates reference
ranges + defaults the ref-range column on). **The template is pure UI
sugar** — only `kind` persists on the DB row; the "template" itself is
the seed rows the editor inserted on create.

### `rows` shape

```
{
  "metric":    "K⁺ (mmol/L)",
  "values":    ["3.8", "3.4", "2.9"],
  "flags":     [null, null, "abnormal"],
  "ref_range": "3.5–5.0"
}
```

- `values[]` and `flags[]` are aligned with the parent dataset's
  `timepoints[]` (same length; index i lines up). Mis-aligned rows are
  rejected by the server action.
- `flags[i]` ∈ `null | "abnormal" | "borderline"`.
  **Author-side only** — the student runner does NOT render flag
  colouring on the pre-submit view. Flags surface (a) in the authoring
  UI so curators can see which cells they're testing, and (b) in the
  post-submit rationale panel (future runner slice).
- `ref_range` is optional per row. The column renders in the authoring
  UI (and in the student runner) if ANY row in the dataset has a
  `ref_range`. Curator can toggle the column on for any dataset via the
  data-table header; `labs` defaults it on. Ref-ranges ARE shown to
  students pre-submit (NCSBN convention for numeric labs).

### Attachment — nullable FK, one-to-many

- `nclex_bank_items.trend_id` (and the tutor twin) is nullable.
  99% of items stay NULL.
- **One-to-many** from the dataset perspective — a single dataset can
  be referenced by many questions (same data, Matrix + Cloze + SATA
  variants against one vitals panel). Core authoring pattern.
- `ON DELETE RESTRICT` at the DB level. The UI never triggers a bare
  FK-violating delete because the two-path confirmation dialog (see
  Delete semantics below) handles the real user flow; RESTRICT is the
  belt-and-braces safety net.
- **Per-question publishing is independent** of dataset publishing.
  Legal states include: published dataset + draft question (hidden
  from students); published dataset + published question + builder-
  invisible question (reachable only via direct link / readiness pack
  in future slices); draft dataset + any question state (curator-only
  regardless). The save RPC does NOT enforce consistency between these
  flags — the curator has full control.

### Delete semantics

Attached questions mean deleting the dataset is no longer trivial.
Shipped shape (Slice 1.12c):

- Bare `deleteTrendAction` server-action refuses when the dataset has
  ≥1 attached questions. Defence-in-depth against direct-API calls.
- The editor's Delete button opens a **confirmation dialog** with two
  explicit paths when attached items exist:
  - **Detach and delete dataset** — sets every attached item's
    `trend_id = NULL`, then deletes the dataset. Questions survive as
    standalone items. Transactional via
    `nclex_detach_and_delete_trend()` RPC.
  - **Delete everything** — deletes all attached items AND the dataset
    atomically. Transactional via `nclex_delete_trend_and_children()`
    RPC.
- Both destructive paths require the curator to type `DELETE` before
  the confirm button enables. Zero-attached datasets get a simpler
  single-path confirmation (still typed DELETE).
- Tutor twin RPCs (`nclex_tutor_detach_and_delete_trend`,
  `nclex_tutor_delete_trend_and_children`) operate against the
  tutor-private tables with the same shape.

### Authoring — primary path only

Authoring happens at `/admin/trends/[trend_id]` (and tutor twin).
Split-pane editor: dataset on the left (metadata accordions +
data-table), attached questions on the right (pill strip +
`QuestionAuthoringPanel` in `standalone` mode). Pattern matches Case
Study's `/admin/bank/cases/[case_id]`.

**Bank-editor "Attach trend" dropdown is NOT built.** Deferred
indefinitely — the same call the Case Study family made. The editor
is the canonical authoring surface; no secondary path.

### Validation — client-side, manual

Slice 1.12c ships a Validate button in the trend-editor topbar that
opens a dismissible panel with:

- **8 errors** (block publish when `is_published = TRUE`):
  missing title, zero rows, zero timepoints, values/timepoints length
  mismatch, zero attached questions on publish, slot stem missing,
  slot type missing, slot content fails `parseByType()`.
- **4 warnings** (advisory, don't block): scenario missing, zero
  attached on draft, low question-type diversity (3+ sharing the same
  type), no flags set on any cell.

The panel is **manual-only** — it never auto-runs on Save. The save
RPC retains its own publish-gate (every attached question must have a
type + non-empty stem if the dataset is being published).

### Scoring + filter surface

- **Scoring** — inherited from each attached question's host type.
  Trend adds no new scoring logic. A Matrix question attached to a
  trend dataset scores exactly as a standalone Matrix question would;
  the panel is context, not a scored element.
- **Filter surface** — the admin bank list shows a `Trend · {title}`
  badge on trend-linked rows via an FK-join. Admin filtering by `kind`
  isn't wired yet (pending `kind` values stabilising in practice);
  for now admin filters datasets by title. Student-side `kind` filter
  on the custom-quiz builder is deferred to a later slice for the same
  reason.

### Where the code lives

- `mynclex/lib/bank/trend/` — types, `kind-templates.ts`,
  `actions.ts`, `editor.tsx`, `data-table.tsx`,
  `metadata-accordions.tsx`, `question-nav.tsx`, `child-draft.ts`,
  `validation.ts`, `validation-panel.tsx`, `delete-dialog.tsx`.
- `mynclex/app/(app)/admin/trends/` + `mynclex/app/(app)/tutor/trends/`
  — routes (list / new / `[trend_id]` editor).
- `mynclex/db/migrations/mynclex_trend_*_slice_1_12*.sql` — the four
  migration files across the three sub-slices (schema,
  `trend_id` column, save RPC, delete RPCs).
