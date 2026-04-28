# Questions and Wrappers — rebuild slice plan

*Build-order plan for the rebuild described in
[questions-and-wrappers-rebuild.md](questions-and-wrappers-rebuild.md).
That doc is the architecture; this doc is the order we build it in.*

Last updated: 2026-04-28 (initial draft)

---

## How to read this doc

- The architecture and principles are settled in the strategic plan.
  Don't re-debate them here.
- This doc breaks the rebuild into **vertical slices**. Each slice
  ends in a real, browser-testable surface (after slice 1).
- Build order is not the same as priority order — earlier slices
  exist to unblock later ones.
- Each slice has: **goal**, **scope**, **out of scope**,
  **acceptance criteria**. Track status in §13 at the bottom.

---

## Slice principles

1. **Vertical, not horizontal.** A slice ships a working thing
   end-to-end (UI + action + DB write), not a layer-at-a-time.
2. **Real surfaces from slice 2.** Slice 1 alone is a sandbox to
   lock the file shape. Slice 2 onwards lands on `-v2` URLs reachable
   from the nav bar.
3. **Both audiences in lockstep.** Every slice that ships an admin
   surface ships the tutor twin in the same slice (one exception:
   slice 1 sandbox is admin-only since it's a read-only proof).
4. **Nav entries on every slice that adds a URL.** Without them the
   pages aren't browser-testable. Tag transitional entries clearly
   (e.g. "Question Bank (v2)") so it's obvious which is which.
5. **Old code is untouched until the swap.** Production curation
   keeps using the existing `/admin/bank/all`, `/admin/bank/cases/...`,
   `/admin/bank/trends/...` until slice 14 flips the switch.
6. **One slice = one mergeable commit (or two).** If a slice gets
   too fat in practice, split it inline — don't try to ship a
   half-functional one.
7. **Every editor wires the dirty guard.** Each slice 3–10 editor
   adds two lines: `onInput={guard.markDirty}` on its form, and
   `onClose={guard.requestClose}` on its modal frame. The hook
   (`useDirtyGuard`) and confirm panel (`<DiscardConfirm>`) are
   built once in slice 2's foundation and reused as-is.

---

## Build order overview

| # | Slice | Surfaces | Size |
|---|---|---|---|
| 1 | MCQ editor — read-only sandbox | Admin sandbox | M |
| 2 | MCQ editor — end-to-end on bank-list-v2 | Admin + Tutor | **L** (foundation) |
| 3 | TF editor | Admin + Tutor | S |
| 4 | SATA editor | Admin + Tutor | S |
| 5 | SELECT_N editor | Admin + Tutor | S |
| 6 | MATRIX editor | Admin + Tutor | M |
| 7 | BOWTIE editor | Admin + Tutor | M |
| 8 | CLOZE editor | Admin + Tutor | M |
| 9 | HIGHLIGHT editor | Admin + Tutor | M |
| 10 | DRAG_DROP editor | Admin + Tutor | M |
| 11 | Dual-mode preview migration (MCQ/TF/SATA/SELECT_N/MATRIX) | Admin + Tutor | M |
| 12 | Case Study wrapper-v2 | Admin + Tutor | **L** |
| 13 | Trend wrapper-v2 | Admin + Tutor | **L** |
| 14 | Swap — delete old, drop `-v2` suffix | Both | M |

Size key: S = small (one editor file, no new atoms); M = moderate
(new editor with non-trivial structure or first introduction of a
type of work); L = large (foundation infra, or wrappers consuming
all editors).

---

## Slice 1 — MCQ editor, read-only sandbox

**Goal.** Prove the file shape works end-to-end at the component
level. Mount one editor at a sandbox URL with a hardcoded existing
MCQ item. Verify the body+host split, the two-pane layout, and
that all atoms compose cleanly. **Read-only — no save.**

**Scope.**

- `lib/authoring/atoms/`:
  - `modal-frame.tsx`
  - `editor-actions.tsx` (Save / Cancel / Delete row at top — buttons
    are visible but disabled in this slice)
  - `editor-tabs.tsx` (`<EditorTabs>` + `<TabPanel>` — replaces the
    accordion stack with a top-tab strip. Red-dot indicator on
    incomplete required fields, automatic "Next →" button between
    panels.)
  - `section.tsx` (kept for stacked-group needs in wrappers; not
    used by the editor body)
  - `stem-field.tsx`
  - `instruction-field.tsx`
  - `rationale-fields.tsx`
  - `classification-fields.tsx`
  - `housekeeping-fields.tsx`
  - `hidden-item-inputs.tsx`
- `lib/authoring/editors/mcq-editor.tsx` — body + host + private
  `McqOptionList` + private `McqPreview`.
- `app/(app)/admin/sandbox/authoring/page.tsx` — fetches one
  hardcoded MCQ from the DB and mounts `<McqEditor>` against it.
- `styles/authoring.css` — first cut: split layout, modal chrome,
  section accordions, basic typography.
- `lib/nav/admin/sidebar.tsx` — temporary "Authoring sandbox" entry
  so it's reachable from the sidebar.

**Out of scope.**

- Save, update, delete, validation.
- Other question types.
- Type picker.
- Tutor surface.
- Wrappers.
- Real bank-list integration.

**Acceptance.**

- "/admin/sandbox/authoring" opens, shows the MCQ editor as a modal.
- Modal title shows "Edit MCQ question".
- Save / Cancel / Delete buttons render at the top, disabled.
- Tab strip renders three tabs (Content active, Classification +
  Housekeeping inactive). Red dot shows on a tab when its required
  fields are unfilled (clear the stem to see Content's dot;
  clear the Client Needs category to see Classification's).
- Stem / Instruction / OptionList / Rationale visible inside the
  Content panel.
- Classification fields visible after switching tab.
- Housekeeping fields visible after switching tab.
- "Next: Classification →" button at the bottom of Content; "Next:
  Housekeeping →" at the bottom of Classification; no Next on the
  last panel.
- Right pane shows pre-submit MCQ preview.
- Typing into stem updates the preview live.
- Closing the modal returns to the sandbox page underneath.
- No console errors.

---

## Slice 2 — MCQ editor, end-to-end on bank-list-v2

**Goal.** First real surface. Curators can create, edit, and delete
MCQ questions on `-v2` bank lists for both admin and tutor. Lays
down all foundational pieces subsequent editor slices reuse.

**Scope.**

- Complete the atoms inventory (whatever wasn't built in slice 1):
  any missing pieces of `<HousekeepingFields>` mode-awareness,
  any wiring on `<EditorActions>` for the live save-button.
- `lib/authoring/hooks/use-save-action.ts` — flash + error display
  hook used by every editor.
- `lib/authoring/atoms/question-type-picker.tsx` — small modal/menu
  showing all 9 types. **Only MCQ enabled** in this slice; the
  other 8 are visible but disabled with a "coming soon" hint.
- `lib/authoring/actions/save-question.ts` — server action, handles
  create + update for MCQ, branches on `surface` to write to
  `nclex_bank_items` (admin) or `nclex_tutor_questions` (tutor).
- `lib/authoring/actions/delete-question.ts` — server action.
- `app/(app)/admin/bank/all-v2/page.tsx` — bank list + editor modal
  wired up.
- `app/(app)/tutor/bank/all-v2/page.tsx` — tutor twin.
- `lib/nav/admin/sidebar.tsx` — add **"Question Bank (v2)"** entry.
- `lib/nav/tutor/sidebar.tsx` — add **"Question Bank (v2)"** entry.
- `styles/authoring.css` — bank-list-v2 styles, type picker.

**Out of scope.**

- Other 8 question types (still disabled in picker).
- Wrappers (case-linked / trend-linked rows are filtered out of the
  v2 bank list for now — they're wrapper-only until slices 12–13).
- Swap.

**Acceptance.**

- "Question Bank (v2)" visible in both admin and tutor sidebars.
- Both `-v2` bank lists render with existing standalone MCQ rows.
- "+ New question" → type picker opens. Only MCQ is clickable.
- Pick MCQ → empty editor modal opens. Save creates a new row in
  the correct table (admin → `nclex_bank_items`, tutor →
  `nclex_tutor_questions` with the curator's `tutor_id`).
- "Edit" on an existing MCQ row → editor modal opens prefilled.
  Save updates the row in place.
- Delete on edit modal → typed-DELETE confirmation → row deleted.
- All Classification + Housekeeping fields persist correctly.
- Live preview updates on every keystroke.
- The old `/admin/bank/all` and `/tutor/bank/all` continue working
  unchanged.

**Inline-split escape hatch.** If this slice gets too fat in
practice (likely candidate), split:
- **2a** — admin path only (atoms + MCQ + admin bank list + admin
  nav).
- **2b** — tutor twin (tutor bank list + tutor nav + tutor branch
  in save action).

---

## Slice 3 — TF editor

**Goal.** Add True/False as the second editor type. Hardens the
pattern by exercising it on the simplest variant of MCQ.

**Scope.**

- `lib/authoring/editors/tf-editor.tsx` — body + host + private
  TF preview. TF has fixed two options ("True" / "False") and one
  correct id, so the option-list piece is much simpler than MCQ.
- Update `<QuestionTypePicker>` — TF now enabled.
- Update `save-question.ts` — branch for TF (mostly same as MCQ).
- `styles/authoring.css` — any TF-specific overrides.

**Out of scope.** Same as slice 2.

**Acceptance.**

- Type picker shows TF enabled on both bank lists.
- Pick TF → editor opens with True/False options pre-rendered, one
  selected by default.
- Save persists `question_type='TF'` with the correct
  `content` / `correct` JSONB shapes.
- Edit existing TF row works.
- Delete works.
- Preview renders True/False as radio options pre-submit.

---

## Slice 4 — SATA editor

**Goal.** Add Select All That Apply. Similar to MCQ but multi-select
with checkboxes.

**Scope.**

- `lib/authoring/editors/sata-editor.tsx` — body + host + private
  `SataOptionList` (checkbox group instead of radio) + private
  `SataPreview`.
- Update `<QuestionTypePicker>` — SATA enabled.
- Update `save-question.ts` — branch for SATA. `correct.answers` is
  an array (`["A", "C", "E"]`) instead of a scalar.
- `styles/authoring.css` — SATA-specific touches.

**Out of scope.** Same as slice 2.

**Acceptance.**

- Type picker shows SATA enabled.
- Editor allows multi-select of correct answers via checkboxes.
- Save persists `correct.answers` as an array.
- Preview renders checkboxes (not radios) pre-submit.
- All other behaviour matches MCQ.

---

## Slice 5 — SELECT_N editor

**Goal.** Add Select Exactly N — variant of SATA with a
curator-picked count.

**Scope.**

- `lib/authoring/editors/select-n-editor.tsx` — body + host. Reuses
  most of SATA's option-list shape, plus a "Number to select"
  number input.
- Update `<QuestionTypePicker>` — SELECT_N enabled.
- Update `save-question.ts` — branch for SELECT_N (saves
  `select_count`).
- `styles/authoring.css` — minor.

**Out of scope.** Same as slice 2.

**Acceptance.**

- Type picker shows SELECT_N enabled.
- Editor shows a "Number to select" input (default 2).
- Save persists `select_count` and `correct.answers` array.
- Edit prefills both the count and the correct ids.
- Preview renders checkboxes plus an instruction line ("Select N").

---

## Slice 6 — MATRIX editor

**Goal.** First non-list-shape editor. Rows × columns grid with
per-row correct-column.

**Scope.**

- `lib/authoring/editors/matrix-editor.tsx` — body + host + private
  `MatrixGrid` + private `MatrixPreview`. Curator edits row labels,
  column labels, and per-row correct column. Per-row feedback
  textareas.
- Update `<QuestionTypePicker>` — MATRIX enabled.
- Update `save-question.ts` — branch for MATRIX. Writes
  `content.rows`, `content.columns`, `content.row_label`,
  `correct.cells` (rowId → columnId map), `correct.feedback`.
- `styles/authoring.css` — grid-specific styles.

**Out of scope.** Same as slice 2.

**Acceptance.**

- Type picker shows MATRIX enabled.
- Editor lets curator add/remove rows and columns.
- Per-row correct-column selection works (radio per row).
- Per-row feedback textarea persists.
- Save writes the full Matrix shape correctly.
- Edit prefills rows, columns, correct map, feedback.
- Preview renders the grid pre-submit (rows down, columns across,
  no answers shown).

---

## Slice 7 — BOWTIE editor

**Goal.** Three independent token wings (left / centre / right) with
curator-defined labels.

**Scope.**

- `lib/authoring/editors/bowtie-editor.tsx` — body + host + private
  `BowtieWings` (three columns of token-edit rows) + private
  `BowtiePreview` (three columns of selectable tokens). Curator
  picks correct ids per wing (2 / 1 / 2 capacity).
- Update `<QuestionTypePicker>` — BOWTIE enabled.
- Update `save-question.ts` — branch for BOWTIE. Writes
  `content.left/centre/right` token arrays, `correct.left/centre/right`
  arrays of correct ids, `correct.feedback` flat map.
- `styles/authoring.css` — bowtie-specific layout.

**Out of scope.** Same as slice 2.

**Acceptance.**

- Type picker shows BOWTIE enabled.
- Editor renders three labelled columns with token-edit rows.
- Curator can rename wing labels.
- Selecting correct tokens enforces 2/1/2 capacity.
- Save writes content + correct correctly with `lt`/`ct`/`rt`
  prefixed token IDs.
- Preview renders the three-wing layout pre-submit.

---

## Slice 8 — CLOZE editor

**Goal.** Sentence-with-blanks (`{N}` markers in the stem) with
per-blank choice lists.

**Scope.**

- `lib/authoring/editors/cloze-editor.tsx` — body + host + private
  `ClozeBlanks` (one editable choice list per blank) + private
  `ClozePreview`. Reads `{N}` markers from stem (uses the
  `id="bank-stem"` shared atom).
- Marker auto-renumbering on save (`{1} {3}` → `{1} {2}`).
- Update `<QuestionTypePicker>` — CLOZE enabled.
- Update `save-question.ts` — branch for CLOZE. Writes
  `content.blanks` array (with per-blank choices), `correct.answers`
  (blankId → choiceId map), `correct.feedback` (nested blankId →
  choiceId → text).
- `styles/authoring.css`.

**Out of scope.** Paired-scoring Cloze authoring UI (deferred to
v2 per `bank.md`). Same as slice 2.

**Acceptance.**

- Type picker shows CLOZE enabled.
- Stem with `{1}`, `{2}`, `{3}` markers parses into 3 blank panels.
- Each blank has its own editable choice list.
- Per-blank correct selection works.
- Per-choice feedback persists in nested map.
- Marker gaps auto-renumber on save.
- Edit prefills blanks, choices, correct map.
- Preview renders the sentence with `<select>` placeholders inline.
- Preview ships with the dual-mode toggle (Student / Answer key)
  using the shared `<PreviewToggle>` atom from slice 7. Default
  view: student. Answer-key view highlights the correct choice in
  each blank's dropdown.

---

## Slice 9 — HIGHLIGHT editor

**Goal.** Passage with `[[chunk]]` markers — student clicks chunks
to mark findings.

**Scope.**

- `lib/authoring/editors/highlight-editor.tsx` — body + host +
  private `HighlightChunks` (chunk list with per-chunk feedback) +
  private `HighlightPreview` (passage with chunks rendered as
  clickable spans, no clicks active in the preview pane).
- Stem-with-chunks parsing — IDs `h1`, `h2`, … assigned in passage
  order.
- Update `<QuestionTypePicker>` — HIGHLIGHT enabled.
- Update `save-question.ts` — branch for HIGHLIGHT. Writes
  `content.chunks` array (id + text), `correct.correct_ids` array,
  flat `correct.feedback` map.
- `styles/authoring.css`.

**Out of scope.** Same as slice 2.

**Acceptance.**

- Type picker shows HIGHLIGHT enabled.
- Stem with `[[low Hgb]] some text [[high BP]]` parses into 2 chunks
  with stable IDs.
- Per-chunk feedback persists.
- Multi-select correct works.
- Preview renders the passage with chunks visually distinguished
  but not interactive in the preview.
- Preview ships with the dual-mode toggle (Student / Answer key)
  using the shared `<PreviewToggle>` atom from slice 7. Default
  view: student. Answer-key view highlights the correct chunks in
  the passage.

---

## Slice 10 — DRAG_DROP editor

**Goal.** Drag tokens into target slots. Two subtypes (ORDERED,
SENTENCE).

**Scope.**

- `lib/authoring/editors/drag-drop-editor.tsx` — body + host +
  private `DragDropForm` (subtype switch, slots, tokens, target
  text per slot, optional distractors) + private `DragDropPreview`.
  ORDERED renders ranked positions; SENTENCE reads `[N]` markers
  from stem.
- Update `<QuestionTypePicker>` — DRAG_DROP enabled.
- Update `save-question.ts` — branch for DRAG_DROP. Writes
  `content.subtype`, `content.slots`, `content.tokens`,
  `correct.slots` (slotId → tokenId), `correct.feedback`.
- `styles/authoring.css` — drag-and-drop preview styling.

**Out of scope.** Functional drag in the preview (preview is static
pre-submit; no actual dragging required). Same as slice 2.

**Acceptance.**

- Type picker shows DRAG_DROP enabled.
- ORDERED subtype: form shows slots 1..N with target-text labels.
- SENTENCE subtype: form parses `[N]` markers from stem and shows
  one slot per marker.
- Save writes subtype + slots + tokens + correct map correctly.
- Token reuse rejected (one token can't fill two slots).
- Edit prefills subtype, slots, tokens, correct map.
- Preview renders slots and a token pool pre-submit (no drag).
- Preview ships with the dual-mode toggle (Student / Answer key)
  using the shared `<PreviewToggle>` atom from slice 7. Default
  view: student (empty slots + token pool). Answer-key view fills
  each slot with its correct token.

---

## Slice 11 — Dual-mode preview migration

**Goal.** Back-fill the Student / Answer-key preview toggle into the
five editors built before the dual-mode pattern landed: MCQ, TF,
SATA, SELECT_N, MATRIX. Slices 8-10 ship with the toggle from day
one; this slice catches up the older editors so every editor has
the same shape.

**Why a separate slice.** Slice 7 introduced the toggle
infrastructure (`<PreviewToggle>` atom + `auth-preview-card-header`
CSS) and wired it into BOWTIE. Doing the back-fill in its own slice
keeps the diff focused — five editors, all the same mechanical
change, no editor-logic risk.

**Scope.**

For each of MCQ, TF, SATA, SELECT_N, MATRIX:

- Editor body adds `const [viewMode, setViewMode] = useState<PreviewViewMode>('student')`.
- The editor's private `<XPreview>` component:
  - Accepts `viewMode` + `onViewModeChange` props.
  - Renders an `auth-preview-card-header` containing the existing
    tag (label flips between "Pre-submit · student view" and
    "Answer key · curator view") and a `<PreviewToggle>`.
  - Branches its option/cell rendering on `viewMode`.

Per-editor answer-key rendering:

- **MCQ / TF**: the option `<li>` whose id matches `correct_id` gets
  an `auth-preview-option-correct` class — green-tinted background,
  the empty radio is replaced by a filled green radio with a centre
  dot, and a small "✓ Correct" pill on the right.
- **SATA / SELECT_N**: same treatment for every option in the
  `correctIds` set, but with a filled green checkbox (square + ✓)
  instead of a radio.
- **MATRIX**: the cell that matches `correct[rowId]` for each row
  gets `auth-matrix-preview-cell-correct` — green-tinted background
  with a filled green radio inside; other cells stay empty.

CSS additions in `styles/authoring.css`:

- `.auth-preview-option-correct` — green-tinted option row.
- `.auth-preview-radio-correct` — filled radio with centre dot.
- `.auth-preview-checkbox-correct` — filled square with ✓.
- `.auth-preview-correct-pill` — the "✓ Correct" pill.
- `.auth-matrix-preview-cell-correct` — matrix answer-key cell.

**Out of scope.**

- Default view per editor: keep `'student'` for all five (matches
  current pre-submit behaviour and is the most common authoring
  case). BOWTIE's `'answer-key'` default stays as-is.
- BOWTIE — already done in slice 7.
- CLOZE / HIGHLIGHT / DRAG_DROP — already shipped with the toggle
  (slices 8-10), no work here.
- Schema or parser changes — none. View mode is local UI state.
- Wrappers — untouched.

**Acceptance.**

- All six editor types now show the `<PreviewToggle>` at the top-
  right of the preview card.
- For each of MCQ/TF/SATA/SELECT_N/MATRIX:
  - Default view is "Student" (pill highlighted, tag reads
    "Pre-submit · student view").
  - Clicking "Answer key" flips the pill, the tag updates, and
    the correct option(s) / cell(s) become highlighted.
  - Clicking back to "Student" clears the highlights.
- Keyboard arrow-key navigation between pills works (via the
  existing toggle atom).
- BOWTIE behaviour unchanged from slice 7.
- Save / edit / delete flows untouched on every editor.
- `tsc --noEmit`, `eslint`, and `npm run build` all clean.

---

## Slice 12 — Case Study wrapper-v2

**Goal.** Three-pane wrapper page at
`/admin/bank/cases-v2/[case_id]` and `/tutor/bank/cases-v2/[case_id]`,
plus list pages at `/admin/bank/cases-v2/` and the tutor twin.
Reuses every editor body built in slices 2–10.

**Scope.**

- `lib/authoring/wrappers/case-study/`:
  - `case-study-page.tsx` — three-pane layout shell.
  - `wrapper-edit-pane.tsx` — title, scenario, six chart tabs
    (Nurses Notes / Vital Signs / Lab Results / Orders / History /
    Diagnostics), slot rail, "+ Add question" button.
  - `slot-rail.tsx` — Q1..Q6 cards with summary text + cjmm_step
    field per slot. **`cjmm_step` is edited on the slot card here,
    not in the editor body.**
  - `combined-preview.tsx` — chart-tabs render + active question's
    preview, side-by-side.
  - `chart-tab-editors/*.tsx` — six small editors for the chart
    tabs (existing logic, ported from `lib/bank/case-study/`).
  - `actions.ts` — save-case (metadata + slot ordering + cjmm_step
    only), detach-question, delete-case (with the existing two-path
    confirmation).
- `app/(app)/admin/bank/cases-v2/page.tsx` — list of cases.
- `app/(app)/admin/bank/cases-v2/[case_id]/page.tsx` — wrapper page.
- Tutor twins of both.
- Active-slot mounting: the bottom-left pane imports and mounts
  `<McqEditorBody>` / `<SataEditorBody>` / etc. by name based on
  the active slot's `question_type` — same by-name selection as the
  bank list.
- "Discard / save first?" prompt when switching slots with unsaved
  changes.
- Update `lib/authoring/actions/save-question.ts` — when called from
  a case-study context, also write the `parent_case_id` and the
  `nclex_case_study_items` join row in the same action.
- `lib/nav/admin/sidebar.tsx` — add **"Case Studies (v2)"**.
- `lib/nav/tutor/sidebar.tsx` — add **"Case Studies (v2)"**.
- `styles/authoring.css` — wrapper-page styles.

**Out of scope.**

- Trend wrapper.
- Swap.

**Acceptance.**

- "Case Studies (v2)" visible in both sidebars.
- List page shows existing cases.
- Click into a case → three-pane page renders.
- Wrapper-edit pane shows title, scenario, 6 chart tabs, slot rail
  with 6 slots.
- Click slot 1 → bottom-left pane mounts the matching editor body.
- Live preview pane shows chart context + active question preview.
- "Save case study" button saves wrapper metadata + slot ordering +
  cjmm_step; does NOT save the active question.
- "Save question" button (in active editor body) saves the question
  only; does NOT save wrapper-level changes.
- "+ Add question" → type picker → editor in create mode → save
  creates question AND writes case-link row atomically.
- "× Remove" on a slot card detaches the question (clears
  `parent_case_id`, removes join row); question survives in bank
  as standalone.
- Delete case study: zero-attached → typed-DELETE confirm; with
  attached → two-path confirm (detach-and-delete vs delete-everything),
  matching existing behaviour.
- Old `/admin/bank/cases/[case_id]` continues working unchanged.

---

## Slice 13 — Trend wrapper-v2

**Goal.** Three-pane wrapper page for trend datasets at
`/admin/bank/trends-v2/[trend_id]` and tutor twin. Same shape as
case study but with a data table instead of chart tabs and variable
N attached questions.

**Scope.**

- `lib/authoring/wrappers/trend/`:
  - `trend-page.tsx` — three-pane layout shell.
  - `wrapper-edit-pane.tsx` — title, scenario, kind (preset
    dropdown + custom), timepoints, data table (rows × timepoints
    grid with values, flags, optional ref-range column), slot rail.
  - `slot-rail.tsx` — variable N slots (no fixed count).
  - `combined-preview.tsx` — data-table render + active question's
    preview, stacked.
  - `actions.ts` — save-trend (metadata + slot ordering),
    detach-question, the two-path delete RPCs (existing
    `nclex_detach_and_delete_trend`,
    `nclex_delete_trend_and_children`).
  - `validation-panel.tsx` — manual-only Validate button matching
    Slice 1.12c behaviour.
- `app/(app)/admin/bank/trends-v2/page.tsx` — list page.
- `app/(app)/admin/bank/trends-v2/[trend_id]/page.tsx`.
- `app/(app)/admin/bank/trends-v2/new/page.tsx` — kind preset
  picker, then redirect into editor.
- Tutor twins of all three.
- Update `save-question.ts` — when called from a trend context,
  also write `trend_id` on the question row.
- `lib/nav/admin/sidebar.tsx` — add **"Trend datasets (v2)"**.
- `lib/nav/tutor/sidebar.tsx` — add **"Trend datasets (v2)"**.
- `styles/authoring.css` — trend-specific styles.

**Out of scope.**

- Swap.

**Acceptance.**

- "Trend datasets (v2)" visible in both sidebars.
- List page shows existing datasets.
- New trend flow: kind picker → editor opens with seeded rows for
  presets (vitals/labs/io/neuro/assessment).
- Three-pane page renders: data table + slot rail on the left, data
  table render + question preview on the right.
- Slot rail supports variable N slots; "+ Add question" appends.
- Per-question publishing independent of dataset publishing.
- Validate button opens the manual panel (8 errors / 4 warnings).
- Delete dataset honours the two-path confirmation when attached
  questions exist.
- Old `/admin/bank/trends/[trend_id]` continues working unchanged.

---

## Slice 14 — Swap

**Goal.** Replace old surfaces with the new ones, delete the
parallel implementation, drop the `-v2` suffix everywhere.

**Scope.**

### Renames (URL-preserving moves)

- `app/(app)/admin/bank/all-v2/` → `app/(app)/admin/bank/all/`
  (overwriting the existing folder).
- `app/(app)/admin/bank/cases-v2/` → `app/(app)/admin/bank/cases/`.
- `app/(app)/admin/bank/trends-v2/` → `app/(app)/admin/bank/trends/`.
- Tutor twins of all three: `tutor/bank/...-v2/` → `tutor/bank/.../`.

### Deletions (per swap inventory in strategic plan §9)

- `lib/bank/editors/` (folder, 9 files).
- `lib/bank/case-study/` (folder).
- `lib/bank/trend/` (folder).
- `lib/bank/question-authoring-panel.tsx`.
- `app/(app)/admin/bank/editor-shell.tsx`.
- Any old action files no longer imported (audit).
- Old CSS partials in `styles/bank.css` no longer used (audit).

### Nav cleanup

- Remove "(v2)" suffixes from all sidebar entries — one entry per
  page remains, pointing at the now-canonical URL.
- Remove the "Authoring sandbox" entry (slice 1 leftover).

### Verification before commit

- `tsc --noEmit` clean.
- `eslint app components lib` clean.
- `npm run build` (webpack mode per [CLAUDE.md](../../CLAUDE.md)
  "Known Workarounds") succeeds.
- All 9 question types and both wrappers reachable from the nav.
- No imports from deleted folders (`grep -r "lib/bank/editors"
  app lib | wc -l` returns 0; same for case-study, trend, panel,
  editor-shell paths).

**Out of scope.**

- DB-side cleanup (transactional RPCs `nclex_save_case_with_children`
  etc. stay in DB — strategic plan §9 covers this). Future cleanup
  pass.

**Acceptance.**

- All real URLs (`/admin/bank/all`, `/admin/bank/cases/...`,
  `/admin/bank/trends/...` and tutor twins) work the same as before
  the swap, but render new code.
- No `-v2` references remain anywhere in the codebase.
- All paths in the deletions list are gone.
- One sidebar entry per surface (no transitional duplicates).
- Nothing in `db/` changed in this slice.

---

## Slice status tracking

Mark slices complete as we ship them.

- [x] Slice 1 — MCQ read-only sandbox
- [x] Slice 2 — MCQ end-to-end on bank-list-v2
- [x] Slice 3 — TF editor
- [x] Slice 4 — SATA editor
- [x] Slice 5 — SELECT_N editor
- [x] Slice 6 — MATRIX editor
- [x] Slice 7 — BOWTIE editor + dual-mode preview infrastructure
- [ ] Slice 8 — CLOZE editor (with dual-mode preview from day 1)
- [ ] Slice 9 — HIGHLIGHT editor (with dual-mode preview from day 1)
- [ ] Slice 10 — DRAG_DROP editor (with dual-mode preview from day 1)
- [ ] Slice 11 — Dual-mode preview migration (MCQ/TF/SATA/SELECT_N/MATRIX)
- [ ] Slice 12 — Case Study wrapper-v2
- [ ] Slice 13 — Trend wrapper-v2
- [ ] Slice 14 — Swap
