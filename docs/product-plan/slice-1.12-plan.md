# Slice 1.12 — Trend wrapper — plan

*Planning doc. Part of the `mynclex/docs/product-plan/` set — see
[main.md](main.md) and [bank.md](bank.md) for the wider product plan.*

Captured: 2026-04-24 (planning session in Claude Web after
Slice 1.11c shipped and Case Study authoring went production-ready).

---

## Why this plan exists

Trend is the 10th NGN question type. It's a **wrapper around the
existing per-type editors** — one question with a time-series data
panel shown beside the stem. Student reads the pattern, answers
using any existing type (Matrix, Cloze, Highlight, SATA most
commonly, but any of the 9 is allowed except Bow-tie per NCSBN).

Slice 1.11 (Case Study) established the wrapper pattern. Trend
reuses almost all of it: per-type editors, parsers, the
`QuestionAuthoringPanel` extraction, the transactional save RPC
pattern, the admin/tutor surface-param routing. What's genuinely
new in this slice is the dataset schema, the data-table editor,
and the nullable-FK attach mechanism.

All planning decisions below were settled during the 24 April
session. No second-opinion review needed — the patterns are
already proven by 1.11.

---

## Decisions locked before build

1. **Own route.** Trend gets `/admin/trends` (list) and
   `/admin/trends/[trend_id]` (editor). Tutor twins at
   `/tutor/trends/...`. Same pattern as Case Study. Not authored
   inline inside the bank editor.

2. **Nullable FK attach.** `nclex_bank_items` gets a new nullable
   `trend_id` column referencing `nclex_trend_datasets`. 99% of
   items stay NULL. Presence of `trend_id` is what tells the
   renderer to show the trend panel. Parallel FK on
   `nclex_tutor_questions` → `nclex_tutor_trend_datasets`. No join
   table — Trend is one-to-one from the item's perspective and the
   link carries no extra information (unlike Case Study's
   position + CJMM step).

3. **One trend → many questions allowed.** A single dataset can be
   referenced by multiple bank items (same data, different response
   types). This is a core authoring pattern — the curator often
   builds a Matrix + Cloze + SATA against the same vitals panel.

4. **Classification lives on the question, not the dataset.** The
   dataset has NO `client_needs_category`, `client_needs_subcategory`,
   `nursing_subject`, `body_system`, `topic`, `subtopic`,
   `difficulty`, or `tags` columns. Every one of those fields stays
   on `nclex_bank_items` where it already lives. Rationale: avoid
   the Case Study "classification duplicated on wrapper and child"
   problem that became the 1.11b accordion-clash issue. Doing it
   right from day one on Trend.

   Consequence: admin can't filter datasets by classification in
   v1. Workaround: filter by dataset title. Proper dataset filtering
   can come later by joining through the bank-item side.

5. **Dataset has minimal metadata.** Just the fields needed to
   render and manage it: `title`, `scenario`, `kind`, `timepoints`,
   `rows`, `is_published`, timestamps. No `is_free_sample` or
   `is_builder_visible` on the dataset — those flags live on the
   bank item (unit of student consumption). Adding them to the
   dataset would create a sync problem for datasets used by
   multiple items.

6. **`kind` is freeform TEXT, no CHECK constraint.** UI offers 5
   presets (`vitals`, `labs`, `io`, `neuro`, `assessment`) plus
   "Custom" for typed input. Matches Case Study's custom-tab
   pattern — common shape as a head start, custom available.

7. **`kind` doubles as the template picker.** One control, not
   two. Picking a kind at creation seeds the starting rows and
   timepoints; picking Labs additionally enables the ref-range
   column. Everything seeded is editable afterwards. No
   `template` column in the DB — template is pure UI sugar, only
   `kind` persists.

8. **Data table shape.** `timepoints` JSONB = array of column
   headers (strings). `rows` JSONB = array of row objects:
   ```json
   {
     "metric": "K⁺ (mmol/L)",
     "values": ["3.8", "3.4", "2.9"],
     "flags": [null, null, "abnormal"],
     "ref_range": "3.5–5.0"
   }
   ```
   `ref_range` optional per row — if any row has one, the
   ref-range column renders. `flags` = `null | "abnormal" |
   "borderline"` per cell.

9. **Flags are author-side only.** Student pre-submit view does
   NOT show colour-coded cells. Matches real NCLEX — students see
   raw values and ref-ranges, must interpret themselves. Flags
   surface in two places: (a) curator authoring view so they can
   verify which cells are the "red flags" they're testing;
   (b) post-submit rationale panel (future runner slice) to
   highlight what the student should have spotted.

10. **Ref-ranges ARE shown to student pre-submit.** Matches
    NCSBN's real-exam behaviour — "items that contain a numeric
    laboratory value include the corresponding normal reference
    range." Not an answer-give-away; students still interpret.

11. **Reusable editor component.** Dataset editor lives at
    `lib/bank/trend/editor.tsx` with `surface: 'admin' | 'tutor'`
    prop. Same Slice 2.1 pattern as Case Study's editor.

12. **Questions authored inside the trend editor (primary path).**
    The trend editor hosts the attached-question authoring.
    Curator builds the data panel, then adds one or more question
    slots against it without leaving the page. Mirrors Case
    Study's "authored inside, not picked from a pool" decision —
    the stem references the data; writing one without the other
    in front of you doesn't work.

13. **Bank editor also supports attach (secondary path).** A
    curator editing a standalone bank item can set its `trend_id`
    via an "Attach trend" dropdown in the Content accordion.
    Covers the case of attaching an existing dataset to a
    previously-standalone question. Both paths write the same
    column — the DB doesn't care which route created the link.

14. **Transactional save.** New RPC `nclex_save_trend_with_children`
    writes the dataset row + all attached question rows in one
    atomic operation. If any part fails, the whole save rolls
    back. Same pattern as Case Study's
    `nclex_save_case_with_children` from 1.11b.

15. **Delete semantics.** `ON DELETE RESTRICT` on the FK prevents
    bare deletes of datasets with attached questions. UI offers
    two explicit paths when a curator tries to delete a linked
    dataset: (a) "Detach and delete dataset" — sets every attached
    item's `trend_id` to NULL, then deletes the dataset, questions
    survive as standalone items; (b) "Delete everything" — deletes
    all attached items and the dataset in one transaction. Both
    require typed-confirmation safeguard. Deleting a single
    question leaves the dataset untouched.

16. **Two-pane editor layout.** Dataset on the left, active
    question editor on the right. Pill strip along the top of the
    right pane lists all attached questions + an `+` add button.
    Clicking a pill focuses that question in the right pane.
    Variable pill count (unlike Case Study's fixed 6). Horizontal
    scroll if pills overflow. 50/50 default split, draggable
    divider with localStorage persist. Mobile stacks vertically
    below 900px — dataset on top, question below.

17. **Reuse, not rebuild.** Every per-type editor in
    `lib/bank/editors/`, every parser in `lib/bank/parsers/`, and
    `QuestionAuthoringPanel` mount verbatim inside the trend
    editor's right pane. No new type-specific code. Trend's new
    code is: dataset schema, dataset editor (data-table authoring),
    template picker, attached-question pill strip, save RPC,
    delete RPCs.

---

## Schema

### New table

```sql
CREATE TABLE nclex_trend_datasets (
  trend_id      TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  scenario      TEXT,
  kind          TEXT NOT NULL,
  timepoints    JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows          JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE nclex_tutor_trend_datasets (
  trend_id      TEXT PRIMARY KEY,
  tutor_id      UUID NOT NULL REFERENCES auth.users(id),
  title         TEXT NOT NULL,
  scenario      TEXT,
  kind          TEXT NOT NULL,
  timepoints    JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows          JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### New column on existing tables

```sql
ALTER TABLE nclex_bank_items
  ADD COLUMN trend_id TEXT
  REFERENCES nclex_trend_datasets(trend_id) ON DELETE RESTRICT;

ALTER TABLE nclex_tutor_questions
  ADD COLUMN trend_id TEXT
  REFERENCES nclex_tutor_trend_datasets(trend_id) ON DELETE RESTRICT;
```

### RLS (mirrors Case Study)

- **Admin dataset:** `BANK_CURATE` permission or `SUPER_ADMIN` role
  for full CRUD. Authenticated readers can SELECT published rows.
- **Tutor dataset:** owning tutor (`tutor_id = auth.uid()`) gets
  full CRUD. `SUPER_ADMIN` bypass for moderation. No public-read
  policy until runner lands enrolment-scoped visibility.

### RPC surface

- `nclex_save_trend_with_children(payload jsonb)` — atomic save.
- `nclex_detach_and_delete_trend(trend_id text)` — NULLs out all
  FKs on linked items, then deletes the dataset.
- `nclex_delete_trend_and_children(trend_id text)` — deletes all
  linked items, then deletes the dataset.

Parallel tutor RPCs with `nclex_tutor_` prefix.

---

## Three sub-slices

### Slice 1.12a — Schema + dataset editor

**Goal.** Curator can create a trend dataset end-to-end: pick a
kind, edit title/scenario, build the data table (rows, timepoints,
cells, flags, optional ref-ranges), save, and see it in a list.
**No attached questions yet** — that's 1.12b.

**Scope.**

- Migration: create `nclex_trend_datasets` + `nclex_tutor_trend_datasets`.
- Nullable `trend_id` column on `nclex_bank_items` + `nclex_tutor_questions`.
- RLS on both new tables.
- Kind-template registry at `lib/bank/trend/kind-templates.ts`.
  Seeds rows + timepoints (+ ref-range column for Labs).
- New routes: `/admin/trends/page.tsx`, `/admin/trends/[trend_id]/page.tsx`,
  tutor twins.
- Shared reusable editor at `lib/bank/trend/editor.tsx` with
  `surface` prop.
- Data-table authoring UI: add/remove rows, add/remove timepoints,
  rename cells, flag cells (author-side), toggle ref-range column.
- Nav: "Trend datasets" entry card on `/admin/bank` header linking
  to `/admin/trends`.
- Seed: one demo dataset (post-op vitals) so the editor has
  something to load during dev testing.

**End state.** Curator can fully author a trend dataset. The
right pane is a "Questions — Slice 1.12b" placeholder.

**Risk.** Data-table UX is real surface — add/remove rows and
timepoints, cell-level flags, ref-range toggle. Mockup first.

### Slice 1.12b — Attached questions

**Goal.** Curator can add one or more questions to a trend
dataset, each with a type picker. Reuses the existing 9 per-type
editors verbatim.

**Scope.**

- Two-pane split-screen layout in the trend editor. Data panel
  left, active question right, pill strip along the top of the
  right pane.
- Variable N question slots (no fixed count like Case Study's 6).
  `+ Add question` pill appends a new slot.
- Each attached question is a real `nclex_bank_items` row with
  `trend_id` set. `is_builder_visible` defaults TRUE (unlike
  case-study children — trend questions ARE pickable standalone
  items in the student builder).
- `QuestionAuthoringPanel` mounts in the right pane, probably in
  a new `trend-child` mode — shows `is_builder_visible` and
  `is_published` per question (unlike case-child mode which hides
  them).
- Transactional save RPC `nclex_save_trend_with_children`.
- Delete-single-question action in the active pane's toolbar.
- Bank editor "Attach trend" dropdown in the Content accordion
  (secondary path). Shows all published datasets; "Create new"
  link opens `/admin/trends/new` in a new tab.
- Bank list badges: trend-linked rows show "Trend · Post-op
  vitals" (dataset title) in the type column.

**End state.** Trend authoring fully end-to-end. Curator can
build a dataset, attach N questions of varying types, save
atomically, and edit or add more later.

**Risk.** Transactional save is proven from 1.11b. Main new
complexity is the variable pill count + overflow scroll + new
`trend-child` panel mode.

### Slice 1.12c — Delete semantics + polish

**Goal.** Curator has safe, clear paths for deleting a dataset
with attached questions. Authoring is production-ready.

**Scope.**

- Delete button on dataset editor opens confirmation dialog.
- If linked questions exist: dialog shows list of them + two
  options (Detach and delete / Delete everything) + typed-confirm.
- Two new RPCs for the two paths (both transactional).
- Validation panel pattern from 1.11c applied to trend: "dataset
  has no rows", "row has no ref-range but is flagged Labs",
  "question N has no stem", etc. Errors block publish, warnings
  are advisory.
- Polish passes on 1.12a/1.12b based on use during browser
  verification.

**End state.** Trend authoring is production-ready. Student
runner is unblocked on the Trend family (separate track).

**Risk.** Low. Pure refinement + delete-confirmation UX.

---

## Dependency chain

- 1.12a ships first. Independently verifiable without questions.
- 1.12b depends on 1.12a (needs the dataset editor to mount
  attached-question authoring inside).
- 1.12c depends on both.
- Student runner depends on 1.12a + 1.12b (not 1.12c).

---

## What's out of scope for all three sub-slices

- Student runner (separate track; consumes this data).
- Graph/image trend data — table-only in v1. Rhythm strips, wound
  photos, waveform trends deferred.
- Per-cell image attachments (same reason).
- Drag-to-reorder of rows/timepoints within the data table — v1
  uses up/down arrows. Drag-to-reorder deferred.
- Drag-to-reorder of attached questions (pill strip order = creation
  order, no shuffle in v1).
- Classification filtering on datasets (admin uses title search).
- Student filter surface "filter by trend kind" — wait until `kind`
  values stabilise in practice.

---

## Known drift points to watch

- **`is_builder_visible` default on trend-attached questions.**
  Case Study forces FALSE; Trend wants TRUE. The save RPC must
  not blindly copy Case Study's behaviour. Document this in the
  1.12b handoff.

- **`QuestionAuthoringPanel` mode.** Likely needs a new
  `trend-child` mode (shows `is_published` + `is_builder_visible`,
  unlike `case-child` which hides both). Confirm in 1.12b Phase 1.

- **`VALID_TYPES` set.** `actions.ts` in `lib/bank/` has a valid
  types set that every new question type must be added to. Trend
  is a wrapper, not a new type — but the bank editor's "Attach
  trend" dropdown and the trend editor's question-type picker
  both need to enumerate the valid host types. Keep the list in
  one place (`lib/bank/types.ts` probably) and reuse.

- **Tutor / admin visibility boundary.** A tutor creating a trend
  dataset can only attach tutor-private questions. An admin
  dataset can only be attached to admin bank items. No
  cross-linking in either direction. Mirrors every other
  tutor/admin table in the bank.

---

## Related

- [bank.md](bank.md) — trend section will be revised when 1.12a
  lands; current bank.md reflects the pre-revision "classification
  on dataset" shape.
- [main.md](main.md) — product plan overview.
- [mockups/trend-visualisation.html](mockups/trend-visualisation.html)
  — student-side visual reference. Four examples pairing trend
  panels with Matrix / Cloze / Highlight / SATA.
- `mynclex/SESSIONS.md` — running session log; 1.12 planning
  entry will be appended when this doc lands.
- `mynclex/lib/bank/case-study/editor.tsx`,
  `mynclex/lib/bank/case-study/actions.ts`,
  `mynclex/lib/bank/question-authoring-panel.tsx` —
  the Case Study machinery this slice mirrors.

---

End of plan.
