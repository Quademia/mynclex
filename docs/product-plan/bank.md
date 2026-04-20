# MyNclex — The Bank (Question Bank)

*Living document. Extracted from `product-plan.md` on 2026-04-20 when
that file grew too heavy. Section headings here correspond 1:1 with
the Bank subsections originally planned.*
Last updated: 2026-04-20 (bank settled)

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
- **Matrix:** `{ "rows": [...], "columns": [...] }`
- **Bow-tie:** `{ "tokens": [...], "slots": { "actions": 2, "condition": 1, "parameters": 2 } }`
- **Highlight:** `{ "passage": "...", "selectable_chunks": [...] }`
- **Cloze:** `{ "template": "Most likely {0} due to {1}", "blanks": [{ "options": [...] }, ...] }`

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
    "cells": { "0": 0, "1": 1, "2": 2 },   -- row -> correct column index
    "feedback": { "0": "Row 0 explanation...", "1": "...", "2": "..." }
  }
  ```
- **Highlight:**
  ```
  {
    "correct_chunks": ["severe chest pain", "BP 88/52"],
    "feedback": {
      "severe chest pain": "Indicates possible MI",
      "clear lungs": "Not concerning — no action needed"
    }
  }
  ```
- **Bow-tie:**
  ```
  {
    "condition": "Inferior wall MI",
    "actions": ["Give aspirin", "Apply oxygen"],
    "parameters": ["Cardiac rhythm", "Pain level"],
    "feedback": {
      "Give aspirin": "Antiplatelet reduces clot extension",
      "Start NG tube": "Not indicated for MI"
    }
  }
  ```

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

`TREND` deferred to v2 — trend items are a variant-of-other-types
pattern (a trend question uses matrix, cloze, or highlight for
response) rather than a distinct type.

### Build order

For when implementation starts:

1. MCQ, TF, SATA (simplest, already known from Licensure/MyTeacher)
2. Select N (small variant of SATA)
3. Bow-tie (signature NGN item, relatively bounded)
4. Matrix (structured grid)
5. Cloze (sentence with drop-downs)
6. Highlight (text-with-selectable-chunks)
7. Drag-drop (most interactive)
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

## Decisions not yet settled

- `computed_difficulty` column (v2 — difficulty computed from
  student performance).
- Trend items (v2).
- Paired-scoring Cloze authoring UI details.
- Exact readiness-pack purchase flow and pricing tiers (connects to
  student enrolment flow topic).
