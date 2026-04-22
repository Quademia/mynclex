# Slice 1.11a handoff — Case Study case shell + tab authoring

**Intended reader.** Claude Desktop with filesystem MCP on
`C:\Users\confi\qacademy-gamma`. Sam is driving. Plan was settled
in Claude Web on 2026-04-22 across two planning sessions (schema
revision + mockup).

**Prerequisites before starting.**
1. Confirm these two files are in the repo — Sam will paste them
   in if not already there:
   - `mynclex/docs/product-plan/slice-1.11-plan.md` (three-sub-slice
     plan doc)
   - `mynclex/docs/product-plan/mockups/case-study-editor-mockup.html`
     (visual reference — **read this end-to-end** before writing any
     code; it's the authoritative spec for the UI shape)
2. Read the last two `mynclex/SESSIONS.md` entries (Slice 2.1 and
   Slice 1.10) so the shell + per-type editor + surface-parameter
   patterns are fresh.
3. Read `mynclex/db/schema.sql` lines covering `nclex_case_studies`
   and `nclex_case_study_items` — they already exist from Slice 1
   and will be partially dropped/rebuilt this slice.

---

## What this slice ships

A curator can create a named case study, add tabs (built-in or
custom), fill in chart entries with `visible_from`, save, and see
the case in a list. **No question slots yet** — those land in
Slice 1.11b. The right half of the desktop split is a 1.11b
placeholder.

### What does NOT ship in 1.11a

- The 6 question slots on the right half (placeholder only).
- Preview-as-position toggle (lives in 1.11c).
- The `parent_case_id` column on `nclex_bank_items` (that's 1.11b).
- Student runner (separate track).

---

## Decisions already locked — do not re-litigate

From `slice-1.11-plan.md`, all 11 decisions locked. Quick recap
for the ones that shape this slice directly:

1. **Case Study is its own route** — `/admin/bank/cases` (list)
   and `/admin/bank/cases/[case_id]` (editor). Tutor twins under
   `/tutor/bank/cases/...`.
2. **Reusable editor component** — `lib/bank/case-study/editor.tsx`
   mounts from both surfaces, takes a `surface: 'admin' | 'tutor'`
   prop. Same pattern as `EditorShell` and `BankListView`.
3. **Flexible tab schema** — drop the 6 hardcoded JSONB tab columns
   from `nclex_case_studies` and `nclex_tutor_case_studies`. Add
   new child tables `nclex_case_study_tabs` and
   `nclex_tutor_case_study_tabs`.
4. **Built-in tab types are hardcoded** in
   `lib/bank/case-study/tab-types.ts`. Do NOT build a DB registry.
5. **Custom tabs come in two shapes** — Free text (stacked cards)
   and Rows & columns (curator-defined columns). Picked at tab
   creation and locked thereafter.
6. **All tabs support progressive unfold** — `visible_from` 1–6 on
   every entry, default 1. History & Physical entries can be
   unfolded mid-case even though they typically stay at 1.
7. **Split-pane layout on desktop** (≥ 900px) — chart left,
   questions right. This slice reserves the right half as a
   placeholder (Slice 1.11b fills it). Draggable divider with 50/50
   default and localStorage persist. Below 900px the panes stack
   vertically.
8. **Use the full desktop width.** Modern laptops are 1440–1920px.
   Do not cap `max-width` at 1180px the way `EditorShell` does.
   The editor should fill the available viewport so both panes
   get real room. Use something like `max-width: none` on the
   wrapper or a much higher cap (~1800px).

---

## Phased execution

Six phases. Do them in order. Verify at the end of each before
moving on.

### Phase 0 — Read and reconcile

1. `view` the mockup end-to-end. Internalise: the split layout,
   the six built-in shape cards in Section 3.0, the structured
   table pattern (3.1), the narrative card pattern (3.2–3.4), the
   Rows & columns custom pattern (3.6), the add-tab popover
   (Section 4), the empty state (5), the edge cases (6).
2. Check the existing schema. Specifically note that
   `nclex_case_studies` currently has columns `nurses_notes`,
   `vital_signs`, `lab_results`, `orders`, `history`,
   `diagnostics` — these get dropped. The tutor twin has the same
   columns.
3. Confirm `nclex_case_study_items` and
   `nclex_tutor_case_study_items` already exist — these stay as-is
   this slice; they get wired up in 1.11b.
4. Flag any discrepancy between this handoff and what's in the
   repo before writing code. Do not silently work around
   inconsistencies — surface them and ask.

### Phase 1 — Schema migration

Write one migration at `mynclex/db/migrations/mynclex_case_study_tabs_slice_1_11a.sql`.

The migration:

1. `ALTER TABLE nclex_case_studies DROP COLUMN nurses_notes,
   DROP COLUMN vital_signs, DROP COLUMN lab_results, DROP COLUMN
   orders, DROP COLUMN history, DROP COLUMN diagnostics;`
   Same six `DROP COLUMN`s for `nclex_tutor_case_studies`.
2. `CREATE TABLE nclex_case_study_tabs` with columns:

   ```
   tab_id            TEXT PRIMARY KEY
   case_id           TEXT NOT NULL REFERENCES nclex_case_studies(case_id) ON DELETE CASCADE
   tab_key           TEXT NOT NULL   -- e.g. 'nurses_notes', 'vital_signs',
                                     -- 'custom_narrative', 'custom_grid'
   title             TEXT NOT NULL   -- display label, curator-editable
   display_order     INTEGER NOT NULL
   is_custom         BOOLEAN NOT NULL DEFAULT FALSE
   custom_shape      TEXT            -- 'free_text' | 'rows_cols' | NULL for built-ins
                                     -- CHECK (is_custom = TRUE) OR (custom_shape IS NULL)
   columns_def       JSONB NOT NULL DEFAULT '[]'::jsonb
                                     -- Only populated for custom rows_cols tabs.
                                     -- Shape: [{id: string, label: string}, ...]
                                     -- Built-in structured tabs don't store columns here;
                                     -- those are known by tab_key and live in tab-types.ts.
   entries           JSONB NOT NULL DEFAULT '[]'::jsonb
                                     -- Array of entry objects. Each entry has:
                                     --   visible_from: 1-6
                                     --   plus tab-shape-specific fields
   created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
   updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
   UNIQUE (case_id, display_order)
   CHECK (tab_key <> '')
   CHECK (display_order >= 0)
   ```

   Identical shape for `nclex_tutor_case_study_tabs`, swapping the
   FK to `nclex_tutor_case_studies`.
3. Index: `CREATE INDEX idx_nclex_case_study_tabs_case ON
   nclex_case_study_tabs(case_id);` and tutor twin.
4. **Also add `is_published BOOLEAN NOT NULL DEFAULT FALSE`** to
   both case-study tables if not already present. (Slice 1 noted
   this was added as a judgment call — confirm it's there; if
   not, this migration adds it.)

**Back-port** the same changes into `mynclex/db/schema.sql` — drop
the 6 tab columns from both case-study tables, add the two new
`*_tabs` tables, add both indexes.

### Phase 2 — Built-in tab registry

Create `mynclex/lib/bank/case-study/tab-types.ts`. Export a typed
registry of the 6 built-in tab types, matching the mockup's
Section 3.0 shape overview exactly.

Shape:

```typescript
export type TabShape = 'narrative' | 'structured';

export interface BuiltInTabType {
  tab_key: string;              // stable machine name, e.g. 'vital_signs'
  default_title: string;        // e.g. 'Vital Signs'
  shape: TabShape;              // drives editor rendering
  // For structured tabs only:
  columns?: { id: string; label: string }[];
  // For narrative tabs: the fields each entry carries beyond time + body
  // (e.g. H&P has 'section'; Orders has 'status')
  extra_fields?: {
    id: string;
    label: string;
    kind: 'select' | 'text';
    options?: string[];         // for select kind
  }[];
}

export const BUILT_IN_TABS: readonly BuiltInTabType[] = [
  // nurses_notes — narrative, Time + Body + VF (no extras)
  // vital_signs — structured, columns = Time, BP, HR, RR, SpO₂, Temp, Pain
  // lab_results — structured, columns = Time, Test, Value, Unit, Reference, Flag
  // orders — narrative, extras = status (select: Active / Completed / Discontinued / Held)
  // history — narrative, extras = section (select: Past medical / Past surgical / Social / Family / Allergies / Medications / Review of systems)
  // diagnostics — narrative, extras = test_type (text)
] as const;

// Helpers
export function getTabType(tab_key: string): BuiltInTabType | null;
export function isBuiltIn(tab_key: string): boolean;
```

**Do not speculate on shape — mirror the mockup exactly.** The
six entries and their fields were settled in the planning sessions.

### Phase 3 — Server actions + types

Create `mynclex/lib/bank/case-study/types.ts`:

- `CaseStudyRow` — mirrors the `nclex_case_studies` row shape.
- `CaseStudyTabRow` — mirrors `nclex_case_study_tabs`.
- `CaseStudyEntry` — JSONB entry shape (pass-through generic, keyed
  by fields the tab type supplies; `visible_from: number` is
  always present).

Create `mynclex/lib/bank/case-study/actions.ts` following the
pattern in `app/(app)/admin/bank/actions.ts`:

- `Surface = 'admin' | 'tutor'` (imported from the existing type
  or duplicated — small enough to duplicate).
- `surfaceConfig(surface)` returns:
  - `caseTable` — `nclex_case_studies` or `nclex_tutor_case_studies`
  - `tabTable` — `nclex_case_study_tabs` or `nclex_tutor_case_study_tabs`
  - `baseUrl` — `/admin/bank/cases` or `/tutor/bank/cases`
  - `idPrefix` — `NCLEX_CS_` or `NCLEX_TUT_CS_` (add to
    `classifications.ts` under a new `CASE_ID_PREFIX` /
    `TUTOR_CASE_ID_PREFIX` pair; follow the same pattern as the
    question-type prefixes).
- `requireCaseCurator(surface)` — admin path requires
  `BANK_CURATE` or `SUPER_ADMIN` (same gate as bank item curation);
  tutor path requires `TUTOR` role; mirror the `requireSurfaceAuth`
  pattern exactly.
- `nextCaseId(supabase, surface)` — scans existing case IDs,
  returns the next 5-digit padded ID. Same logic as `nextItemId`
  in the bank actions file, just targeting the case table.
- `createCaseAction(formData)` — reads surface, gate, computes ID,
  inserts the case row (no tabs yet), redirects to
  `{baseUrl}/{case_id}`.
- `updateCaseAction(formData)` — reads case_id + surface, gate,
  updates title / scenario_summary / classification /
  is_published / flags. `case_id` is immutable.
- `deleteCaseAction(formData)` — reads case_id + surface, gate,
  deletes. CASCADE on the tabs FK handles tab cleanup.
- `upsertTabAction(formData)` — create or update one tab row.
  `tab_id` present = update; absent = insert (action mints the ID
  as `{case_id}_TAB_{N}`).
- `deleteTabAction(formData)` — delete one tab row.
- `reorderTabsAction(formData)` — batch update of `display_order`
  across tabs for a case.

Transaction semantics: all tab mutations within a save use a
single Supabase call where possible. For full-case saves
(header + tabs in one go), use a single `upsert` batch.

### Phase 4 — The CaseStudyEditor component

Create `mynclex/lib/bank/case-study/editor.tsx`. This is the large
piece. Structure it as:

- **Top-level component** `CaseStudyEditor` — takes `initial` (the
  case row + its tabs) and `surface`. Manages two halves via
  React state.
- **Left half** — metadata accordions + chart tabs:
  - Three `<details>` accordions: Content (open by default),
    Classification, Housekeeping. Match `EditorShell`'s accordion
    structure for visual consistency.
  - Chart section below: header row with "Patient chart" title +
    future "Preview as student" button (non-functional stub in
    1.11a — the button is there but does nothing on click yet).
  - Left rail component `<TabRail>` — lists all tabs for the case
    with up/down arrows, entry count, Custom badge, active state,
    and a `+ Add chart tab` footer button that opens the popover.
  - Right entries pane — renders the active tab's editor:
    - If built-in structured → `<StructuredTabEditor>` with
      columns from the registry.
    - If built-in narrative → `<NarrativeTabEditor>` with
      `extra_fields` from the registry.
    - If custom free_text → `<NarrativeTabEditor>` with no extras.
    - If custom rows_cols → `<StructuredTabEditor>` with columns
      read from the tab row's `columns_def`, plus the pinned
      column-builder row.
- **Right half** — 1.11b placeholder:
  - `<QuestionNavigator>` — pill strip with Q1–Q6. Active +
    filled pills show CJMM step + question type (from the mockup;
    here all pills are empty/placeholder since no questions exist
    yet).
  - `<QuestionPlaceholder>` body — the dashed-border "Slice 1.11b
    placeholder" pane exactly as the mockup shows.
- **Split container** — a `<div className="cs-split">` with CSS
  grid `grid-template-columns: 1fr 6px 1fr`, a draggable divider
  between, and a media query collapsing to `1fr` below 900px.
  Persist the drag position in `localStorage` under a stable key
  like `mynclex:cs-split:left-pct`.

Sub-components to build inside this file (or as siblings in the
same folder):

- `<StructuredTabEditor>` — table with editable cells, delete
  column, `<VisibleFromSegmented>` per row, `+ Add row` footer.
  For Rows & columns custom tabs, also renders the
  `<ColumnBuilder>` above the table.
- `<NarrativeTabEditor>` — stacked cards, each with Time input,
  `extra_fields` controls, Body textarea, VF segmented control.
  `+ Add entry` footer. For H&P specifically, the Time field is
  replaced by the Section dropdown (drive this from
  `extra_fields`).
- `<VisibleFromSegmented>` — the 1–6 segmented button control
  from the mockup. Defaults to 1. Returns a `number` 1–6.
- `<ColumnBuilder>` — the pinned pill-row for Rows & columns
  tabs. Columns are draggable (arrows for v1, not DnD). 2–10
  bounds. Visible from shows as a locked pill at the end.
- `<AddTabPopover>` — the add-tab dropdown. Lists built-ins with
  "Already added" disabled state, + custom input at the bottom
  that steps into a shape-picker (Free text / Rows & columns)
  before inserting.

**Form submission** — follow the bank editor convention: inputs
have `name=` attributes so values flow straight into FormData.
The outer form posts to `updateCaseAction`. Tab edits fire
individual `upsertTabAction` / `deleteTabAction` calls (not
batched with the case header save) to keep the UX snappy — each
tab save is independent of case header dirty state.

**Dirty tracking** — sticky top bar shows "Unsaved changes" pill
when any field diverges from the loaded `initial`. Native
`beforeunload` guard, same pattern as the bank editor.

### Phase 5 — Route pages

Create `mynclex/app/(app)/admin/bank/cases/page.tsx` — server
component that lists all cases for the admin surface. Simple
table: case_id, title, published badge, updated_at, link to
editor. Role gate: `BANK_CURATE` or `SUPER_ADMIN`. `+ New case`
button posts to `createCaseAction` with surface='admin'.

Create `mynclex/app/(app)/admin/bank/cases/[case_id]/page.tsx` —
server component that fetches the case row + its tabs, builds the
`initial` prop, mounts `<CaseStudyEditor surface="admin"
initial={...} />`. Role gate same as the list page.

Create tutor twins:
- `mynclex/app/(app)/tutor/bank/cases/page.tsx`
- `mynclex/app/(app)/tutor/bank/cases/[case_id]/page.tsx`

The tutor pages filter by `tutor_id = user.id` in the fetch
(belt-and-braces; RLS enforces this at the DB layer too, which
comes in Phase 6).

Wire navigation:
- Add a "Case Studies" card to `/admin/bank` header so curators
  can jump from the question-bank list to the cases list. Match
  the section-card pattern already used on `/admin` and
  `/admin/bank`.
- Add the same card to `/tutor/bank` for tutors.

### Phase 6 — RLS

Update `mynclex/db/rls.sql` with policies for the two new tab
tables.

Admin tab table (`nclex_case_study_tabs`):
- Any authenticated user can SELECT where the parent case has
  `is_published = TRUE` (students will need this once the runner
  lands).
- `BANK_CURATE` / `SUPER_ADMIN` — full access (read drafts +
  INSERT / UPDATE / DELETE).

Tutor tab table (`nclex_tutor_case_study_tabs`):
- Tutor can do anything where the parent case's `tutor_id =
  auth.uid()`.
- `SUPER_ADMIN` — full access.

Also enable RLS on `nclex_case_studies` and
`nclex_tutor_case_studies` if not already enabled. Same policy
shape as the tabs: published visibility for students, curator
full access, tutor-owned full access.

Back-port into `mynclex/db/rls.sql`.

### Phase 7 — Seed

Add to `mynclex/db/seed-bank-dev.sql` (or new file if cleaner):

- One demo case study: `NCLEX_CS_00001`, title "72-year-old post-op
  day 1, deteriorating", `is_published = FALSE`.
- Three tab rows on that case: one built-in `nurses_notes` (2
  entries), one built-in `vital_signs` (3 entries), one custom
  `rows_cols` titled "Intake & Output" (2 entries) with sensible
  `columns_def`.
- No child questions yet — that's 1.11b.

### Phase 8 — Verify

1. `cd mynclex && npx tsc --noEmit` — must be clean.
2. `npx eslint app lib` — must be clean.
3. `npm run build` — webpack build must succeed end-to-end. Every
   existing route still compiles (no regressions on `/admin/bank`,
   `/tutor/bank`, etc.). New routes present:
   `/admin/bank/cases`, `/admin/bank/cases/[case_id]`, tutor twins.
4. Apply the migration to dev Supabase via MCP. Verify the 6
   `DROP COLUMN`s executed cleanly, the two new tables exist with
   the right columns, the indexes are present.
5. Apply the seed. Verify via `SELECT` that the demo case + 3 tabs
   exist and the `entries` JSONB shapes match what the editor
   expects.
6. Do NOT browser-test end-to-end in this session. Sam will run
   the dev worker and verify the UI himself.

---

## Files summary (expected)

### Created

- `mynclex/db/migrations/mynclex_case_study_tabs_slice_1_11a.sql`
- `mynclex/lib/bank/case-study/tab-types.ts`
- `mynclex/lib/bank/case-study/types.ts`
- `mynclex/lib/bank/case-study/actions.ts`
- `mynclex/lib/bank/case-study/editor.tsx`
- (possibly) sub-component files alongside editor.tsx if it grows
  long — split is fine, just keep them in the same folder
- `mynclex/app/(app)/admin/bank/cases/page.tsx`
- `mynclex/app/(app)/admin/bank/cases/[case_id]/page.tsx`
- `mynclex/app/(app)/tutor/bank/cases/page.tsx`
- `mynclex/app/(app)/tutor/bank/cases/[case_id]/page.tsx`

### Modified

- `mynclex/db/schema.sql` — drop 6 tab columns from both case
  tables, add two new tab tables + indexes.
- `mynclex/db/rls.sql` — enable RLS on 4 case-related tables
  (2 case tables + 2 tab tables) + policies.
- `mynclex/db/seed-bank-dev.sql` — one case + 3 tabs.
- `mynclex/lib/bank/classifications.ts` — add `CASE_ID_PREFIX`
  and `TUTOR_CASE_ID_PREFIX` constants.
- `mynclex/app/(app)/admin/bank/page.tsx` — add "Case Studies"
  section card linking to `/admin/bank/cases`.
- `mynclex/app/(app)/tutor/bank/page.tsx` — add the same card
  linking to `/tutor/bank/cases`.
- `mynclex/app/dashboards.css` — append `.cs-*` block for all
  case-study authoring styles (split frame, tab rail, structured
  table, narrative cards, VF segmented control, column builder,
  add-tab popover, question placeholder). Use the project's
  existing CSS variables from `tokens.css` (`--primary`,
  `--accent`, `--border`, `--white`, `--bg`, `--text-muted`, etc.)
  plus inline hex for state colours. Do **not** copy the mockup
  file's `:root` tokens wholesale — they're named differently.
  Match the convention used by `.bank-dd-*`, `.bank-cz-*`,
  `.bank-hl-*`.
- `mynclex/SESSIONS.md` — append a new entry logging this slice.

### NOT modified (explicitly)

- Every file under `mynclex/lib/bank/editors/` — the 9 per-type
  editors are untouched. Case Study wraps them in 1.11b, not 1.11a.
- Every file under `mynclex/lib/bank/parsers/` — same reason.
- `mynclex/lib/bank/types.ts` — case-study-specific types live in
  `lib/bank/case-study/types.ts`; don't pollute the item types file.
- `mynclex/lib/bank/form-shape.ts` — that's the bank-item form
  shape, not the case shape.
- `mynclex/app/(app)/admin/bank/editor-shell.tsx` and `actions.ts`
  — unchanged. Case Study does NOT mount through the bank's
  editor-shell; it has its own shell in `lib/bank/case-study/editor.tsx`.
- `mynclex/app/landing.css` — landing page untouched.

---

## Known drift points to watch

- **Nothing currently references `nclex_case_studies` in TS code**
  because the editor hasn't existed until now. Dropping columns is
  safe. But double-check with a `grep -r "nurses_notes\|vital_signs\|lab_results\|orders\|history\|diagnostics" mynclex` scoped to `.ts` / `.tsx` / `.sql` files before applying the migration — if anything surprising turns up, flag it.
- **The `is_published` column on case tables.** Slice 1 added it
  as a judgment call; confirm it's present. If missing, this
  migration adds it to both tables.
- **`classifications.ts` currently only has question-type prefix
  maps.** Adding case-study prefixes alongside them is a natural
  extension — keep them in separate constants so the question-type
  maps stay untouched.

---

## After this slice

- Sam tests the flow on dev. Expect to find things to polish.
- **Slice 1.11b** lands the 6 question slots on the right half of
  the split. The right pane shifts from placeholder to real
  navigator + nested editor. The left half's chart authoring is
  untouched.
- **Slice 1.11c** lands preview-as-position + validation polish.
- **`parent_case_id` column on `nclex_bank_items`** lands in 1.11b,
  not 1.11a — tabs are the only schema change this slice.

---

End of handoff. Work through the 8 phases in order. Flag anything
in the mockup or this doc that doesn't match what you find in the
repo — don't silently work around.
