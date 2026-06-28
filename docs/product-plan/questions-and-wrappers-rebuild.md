# Questions and Wrappers — rebuild plan

*Living document. Started 2026-04-28 after the prior rebuild attempt
was reverted (commit `fde8db3`). Captures the architecture for the
fresh attempt — what's being rebuilt, the principles guiding it, and
the shape of the new code.*

Last updated: 2026-06-27 (added the "Case-study wrapper rebuild —
locked decisions" section: design pass on the rich-content relook,
focused on the case-study wrapper; decisions 1–13 locked [incl. the
unified per-row reveal model, heading as a structural role, narrative
entry headers as free-text chips, bank-wide rich text, custom-tabs-first
build order, rung 4 closed, and the editing toolset reused from the
library], reveal resolved, and the merge-table authoring risk RETIRED by a
Claude Design prototype now adopted as the build basis with refinements,
and a first-pass slice plan (Slices 0–7) appended with Slice 0's three
data-model decisions now settled (constrained-doc+roving-editor cells;
existing-JSONB storage + `v` stamp; staged migration); no build yet)
Previously: 2026-06-15 (added the "Rich-content relook" discussion
capture at the end — a NEW, larger direction that, unlike this 2026-04-28
rebuild, *would* change the content data model; see that section + bank.md)

---

## What this covers

The MyNclex question bank's authoring surface — the UI curators use
to create and edit:

- The **9 question types** (MCQ, TF, SATA, SELECT_N, MATRIX, HIGHLIGHT,
  CLOZE, DRAG_DROP, BOWTIE).
- The **2 wrappers** that group them (Case Study, Trend).

Sibling doc: [bank.md](bank.md) covers the data model that the
authoring surface writes to — schema, JSONB shapes, classification
axes, scoring. **Nothing in this rebuild changes that data model.**
The schema, RLS, scoring functions, and the `parent_case_id` /
`trend_id` linking columns all stay exactly as built today.

---

## 1. Why this rebuild

### What's clunky about today's shape

Today's authoring surface evolved across Slices 1.1 → 1.12c, one
question type at a time. The pieces work, but the layering they
ended up with is awkward in three concrete ways:

1. **Editors are not real components.** Files like
   `lib/bank/editors/mcq-editor.tsx` only render the type-specific
   middle of a form (option list + correct radio). They depend on
   a chain — bank list page → `EditorShell` → `QuestionAuthoringPanel`
   — to supply the form wrapper, the stem, the classification fields,
   the housekeeping fields, the save action. You can't open an MCQ
   editor on its own anywhere.

2. **The bank list page IS the editor host.** There is no separate
   `/admin/bank/items/[item_id]` route. To edit a question, the URL
   becomes `/admin/bank/all?edit=…` and the same page rerenders with
   the editor mounted inline. List and form share one server file,
   one URL. Standalone questions have no surface of their own.

3. **Wrappers re-host the panel via field-prefix gymnastics.** Case
   Study and Trend both embed `QuestionAuthoringPanel` inside their
   own form, six-or-more times, with `fieldPrefix='q1_'`,`'q2_'`, etc.
   so the panels don't clobber each other's `name=` attributes on
   submit. The whole wrapper saves through one transactional RPC
   (`nclex_save_case_with_children`). It works, but it's tightly
   coupled and hard to reason about.

### What the previous rebuild attempt got wrong

The rejected attempt (commits `1148291` → `9f9b87b` → `e88c06d`,
reverted in `fde8db3`) introduced a `StandaloneQuestionModal` — a
shared modal that took a `question_type` prop and dispatched to
the matching editor body. That broke the principle the authoring
surface needs: **each editor type should stand on its own**, not be
summoned through a shared dispatcher. The dispatcher pattern made
the editors not really self-contained — they couldn't be opened
without their dispatcher loading them.

This plan replaces the dispatcher with by-name composition.

---

## 2. Core principles

These are the non-negotiables. Every architectural decision below
flows from them.

1. **No dispatcher.** Nothing in the system takes a `question_type`
   value and decides on its own which editor to render. Hosts (bank
   list, wrapper page) import and use a specific editor by name.

2. **Each editor is a true self-contained component.** Open it from
   anywhere. Delete every other editor and this one still works on
   its own.

3. **Body / host split.** Each editor file exports two things: a
   **body** (the actual edit + preview content, mountable anywhere)
   and a **default host** (the body wrapped in a modal). Different
   surfaces use different hosts of the same body — see §5.

4. **Two-pane editor: edit + pre-submit preview, in one file.** Each
   editor file has a left pane for editing controls and a right pane
   for a live preview that re-renders on every keystroke. Both
   panes live in the same file. Preview shows the **pre-submit**
   student view only — post-submit (correct/wrong/feedback) is out
   of scope for the rebuild and a candidate for a follow-up slice.

5. **Wrappers are pages, not modals.** Case Study and Trend stay at
   their existing URLs (`/admin/bank/cases/[case_id]`,
   `/admin/bank/trends/[trend_id]`). Modals are for focused
   subtasks; wrappers are full authoring environments and want
   page-level real estate plus URL deep-linking.

6. **Editors are modals (or embedded bodies inside wrappers).** When
   opened from the bank list, the editor opens as a modal on top.
   When the user is inside a wrapper page, the active slot's editor
   **body** is mounted directly into the wrapper's bottom-left pane
   — same body, no modal, because the wrapper page is its own host.

7. **Sharing dumb atoms is fine. Sharing a chooser is not.** The
   parts that are word-for-word identical across all 9 editors —
   modal chrome, classification fields, housekeeping fields, etc. —
   are extracted as small reusable components. Each editor *composes*
   them in its own JSX, the same way it composes `<input>` or
   `<button>`. No atom decides what type of editor to render.

---

## 3. Shared atoms inventory

The complete list of pieces shared across all 9 editors. Live under
`lib/authoring/` (see §8 for the namespace decision).

### Components

| Atom | What it is |
|---|---|
| `<ModalFrame>` | Modal chrome — header (title + actions slot), scrollable body slot. Used as the default host for each editor. |
| `<EditorActions>` | Save / Cancel / Delete button row. Lives at the **top** of the modal (in `<ModalFrame>`'s actions slot), not the footer. Reachable without scrolling on tall forms. |
| `<EditorTabs>` + `<TabPanel>` | Tab strip + panel switcher used inside an editor's left pane to break Content / Classification / Housekeeping into three side-by-side tabs instead of one long vertical scroll. Hidden panels stay in the DOM (HTML `hidden` attribute) so form fields still submit. Tabs carry an `incomplete` flag for the red-dot indicator on missing required fields. An automatic "Next: <label> →" button at the bottom of each non-final panel guides first-time curators through the sequence. |
| `<Section>` | Accordion container chrome — `<details>` + summary + body. Not used by the editor body anymore (the editor uses `<EditorTabs>`); reserved for stacked-group needs in wrappers (e.g. case-study chart-tab editors). |
| `<StemField>` | The "Stem *" textarea. Same id, same label, same hint on every type. The cloze editor reads from it by id, so the atom emits `id="bank-stem"` once. |
| `<InstructionField>` | Optional 2-row instruction textarea above the stem. |
| `<RationaleFields>` | Overall rationale textarea + rationale image URL input. Always paired. |
| `<ClassificationFields>` | The 8 metadata fields — Client Needs category/subcategory cascade, nursing subject, body system, difficulty, topic, subtopic, Bloom level, tags. |
| `<HousekeepingFields>` | Marks, question ref, batch ID, plus checkboxes (`is_published`, `is_free_sample`, `is_builder_visible`, `shuffle_options`). Mode-aware: standalone shows all four checkboxes; case-child / trend-child contexts hide `is_published` and `is_builder_visible`. |
| `<HiddenItemInputs>` | The boring hidden inputs — `question_type`, `item_id` (in edit mode), `surface` (admin / tutor). |
| `<DiscardConfirm>` | Inline confirmation panel rendered at the top of an editor's modal body when the curator tries to close with unsaved edits. Three buttons — Keep editing, Discard changes, Save and close. Driven by `useDirtyGuard`. |

### Hook

| Atom | What it is |
|---|---|
| `useSaveAction()` | Receives the server-action result, displays flash on success, surfaces validation errors. One hook so 9 editors don't each reinvent flash/error handling. |
| `useDirtyGuard()` | Tracks whether the editor's form has unsaved edits and intercepts close attempts (backdrop click, Escape, ✕ button, Cancel button) so the curator is asked to save / discard / keep editing before losing work. Pairs with `<DiscardConfirm>`. Each editor wires it in with two lines: `onInput={guard.markDirty}` on the form, and `<ModalFrame onClose={guard.requestClose}>`. |

### Things deliberately NOT shared

These look shareable but stay per-editor because the parents
diverge enough to make abstraction cost more than it saves:

- Per-option / per-cell / per-token edit rows (MCQ has radio,
  SATA has checkbox, Matrix has rows-and-columns, Bowtie has three
  wings — same concept, different shapes).
- Per-element feedback inputs (same parent-shape divergence).
- The preview body itself (each type renders different markup).

The split-layout container (edit pane / preview pane) is a small
enough piece that we'll defer the call on extracting it until we've
written one editor and seen how it looks.

---

## 4. Editor file shape

Each editor lives in one file: `lib/authoring/editors/<type>-editor.tsx`.

The file exports three things:

- A type-specific **option/cell/slot list** component (private to
  the file, mounted by the body).
- A **preview** component (private to the file, also mounted by the
  body — this is the right-pane live render).
- A **body** component — the two-pane edit + preview content,
  mountable anywhere.
- A **default host** — the body wrapped in `<ModalFrame>`. This is
  what the bank list opens.

### Canonical pseudo-code

```tsx
// lib/authoring/editors/mcq-editor.tsx

// ── Type-specific bits, private to this file ─────────────────
function McqOptionList({ options, correctId, onChange }) { ... }
function McqPreview({ stem, instruction, options }) { ... }

// ── The editor body — mountable anywhere ─────────────────────
export function McqEditorBody({ initial, onSave }) {
  const [stem, setStem]               = useState(initial.stem);
  const [instruction, setInstruction] = useState(initial.instruction);
  const [options, setOptions]         = useState(initial.options);
  const [correctId, setCorrectId]     = useState(initial.correctId);
  const { error, flash, action }      = useSaveAction(onSave);

  return (
    <form action={action}>
      <HiddenItemInputs type="MCQ" itemId={initial.itemId} surface={initial.surface} />

      <div className="auth-split">
        <div className="auth-edit">
          <EditorTabs
            tabs={[
              { id: 'content',        label: 'Content',        incomplete: contentIncomplete },
              { id: 'classification', label: 'Classification', incomplete: !category },
              { id: 'housekeeping',   label: 'Housekeeping' },
            ]}
            active={tab}
            onChange={setTab}
          >
            <TabPanel id="content">
              <InstructionField     value={instruction} onChange={setInstruction} />
              <StemField            value={stem}        onChange={setStem} />
              <McqOptionList        options={options}   correctId={correctId}
                                    onChange={(o, id) => { setOptions(o); setCorrectId(id); }} />
              <RationaleFields      defaults={initial} />
            </TabPanel>

            <TabPanel id="classification">
              <ClassificationFields category={category} onCategoryChange={setCategory}
                                    defaults={initial} />
            </TabPanel>

            <TabPanel id="housekeeping">
              <HousekeepingFields   mode={initial.mode} defaults={initial} />
            </TabPanel>
          </EditorTabs>
        </div>

        <div className="auth-preview">
          <McqPreview stem={stem} instruction={instruction} options={options} />
        </div>
      </div>

      {error && <ErrorBanner ... />}
      {flash && <FlashBanner ... />}
    </form>
  );
}

// ── The default modal host ───────────────────────────────────
export function McqEditor({ initial, onSave, onClose }) {
  return (
    <ModalFrame
      title={initial.itemId ? 'Edit MCQ question' : 'New MCQ question'}
      actions={<EditorActions onClose={onClose} canDelete={!!initial.itemId} />}
      onClose={onClose}
    >
      <McqEditorBody initial={initial} onSave={onSave} />
    </ModalFrame>
  );
}
```

### What this means in plain English

- Stem, instruction, options, correct-id, and the active tab are
  **controlled state** (`useState`) because the live preview re-renders
  on every keystroke and the tab strip needs to know which panel to
  show. The Client Needs **category** is also lifted up so the tab
  strip can show a red-dot indicator when it's empty. Other
  classification fields and housekeeping fields stay uncontrolled
  (form-data) — they're optional and don't appear in the preview.
- The body owns the form. The host (`<McqEditor>`) is just modal
  chrome around the body.
- Bank list mounts `<McqEditor>`. Wrappers mount `<McqEditorBody>`
  directly into a wrapper-pane slot — same body, no modal.
- Same shape repeats for the other 8 types. Each file is structured
  identically; only the type-specific list and preview change.

---

## 5. Wrapper page shape

Wrappers stay at their existing routes:

- `/admin/bank/cases/[case_id]` (and `/tutor/bank/cases/[case_id]`)
- `/admin/bank/trends/[trend_id]` (and `/tutor/bank/trends/[trend_id]`)

The **inside** of those pages becomes a three-pane layout.

### Layout

```
┌─────────────────────┬───────────────────────────┐
│ WRAPPER EDIT        │                           │
│   title             │                           │
│   scenario          │  COMBINED PREVIEW         │
│   chart tabs (case) │   = what the student sees │
│   data table (trend)│   = wrapper context shown │
│   slot rail         │     next to the active    │
├─────────────────────┤     question's preview    │
│ QUESTION EDIT       │                           │
│   active slot's     │                           │
│   editor body       │                           │
│   (no modal)        │                           │
└─────────────────────┴───────────────────────────┘
```

- **Top-left — wrapper edit.** Wrapper-level metadata (title,
  scenario), the wrapper's structured data (case study chart tabs;
  trend dataset's data table), and the slot rail (Q1 / Q2 / Q3 / …)
  for picking which slot is active.
- **Bottom-left — question edit.** The active slot's editor body
  (`<McqEditorBody>`, `<SataEditorBody>`, etc.), mounted directly
  with no modal chrome — the wrapper page IS the host.
- **Right column — combined preview.** The student-visible state:
  wrapper context (chart pane / data table) on top, the active
  question's preview directly below. There is **no separate
  wrapper-only preview** — wrappers have no standalone student view,
  so the only honest preview is the combined one.

### Why three panes, not four

The student never sees a wrapper alone — the chart tabs (case study)
or data table (trend) are always shown next to a question. So a
"wrapper preview" pane in isolation would represent a state that
doesn't exist for students. Collapsing to three panes (wrapper edit,
question edit, combined preview) buys back ~40% horizontal real
estate and shows what the student actually experiences.

### Save semantics

Two clearly-labelled save buttons, two independent saves:

- **"Save case study"** (top of wrapper-edit pane) — saves wrapper
  metadata, chart tabs, slot ordering, slot add/remove. Does NOT
  save the active question.
- **"Save question"** (top of the editor body, like the standalone
  modal) — saves the active question. Does NOT save wrapper-level
  state.

The transactional `nclex_save_case_with_children` RPC stops being
used for editing — it becomes wrapper-metadata-only on the new path.
(The RPC stays in the DB until swap; old wrapper code keeps using
it until then.)

### Slot rail mechanics

Clicking Q3 in the slot rail makes slot 3 active. The wrapper page
re-renders the bottom-left pane: it imports and mounts the editor
body matching slot 3's `question_type`. Same code-path the bank
list uses to pick the right editor — by-name selection, no
dispatcher.

If the curator has unsaved changes in the active editor body,
switching slots prompts a "discard / save first?" confirmation.

### Add / remove slot

- **"+ Add question"** (in the slot rail) opens a small **type
  picker** (MCQ / TF / SATA / …). Choosing a type opens that editor
  in create mode, embedded in the bottom-left pane (or as a modal
  if the curator is on the wrapper page but hasn't picked a slot
  yet — UX detail to settle in slice planning). On save, the editor
  creates the question AND writes the wrapper-link row in one
  action.
- **"× Remove"** on a slot card removes the link row but does NOT
  delete the question — it stays in the bank as an unattached row.
  Mirrors today's "detach" semantics for trends.

---

## 6. Add-question flow

Same flow whether launched from the bank list or from inside a
wrapper:

1. User clicks **"+ New question"** (bank list) or
   **"+ Add question"** (wrapper slot rail).
2. A **type picker** appears — a small list/grid of the 9 types
   (MCQ / TF / SATA / SELECT_N / MATRIX / BOWTIE / CLOZE / HIGHLIGHT
   / DRAG_DROP).
3. Picking a type imports and renders the matching editor by name —
   `<McqEditor>` if MCQ was picked, `<SataEditor>` if SATA, etc.
4. The editor's save action handles two contexts:
   - **Standalone** — creates a row in `nclex_bank_items` (or
     `nclex_tutor_questions`) with `parent_case_id = NULL` and
     `trend_id = NULL`.
   - **Wrapper** — creates the row AND writes the link
     (`parent_case_id` for case studies, `trend_id` for trends, plus
     the `nclex_case_study_items` join row for case studies).

The type picker is a small shared component
(`<QuestionTypePicker>`) under `lib/authoring/`.

---

## 7. What's not changing

Scope discipline. The rebuild touches the authoring **UI layer
only**. Everything below stays as built:

- **Database schema** — `nclex_bank_items`, `nclex_tutor_questions`,
  `nclex_case_studies`, `nclex_case_study_items`,
  `nclex_trend_datasets`, all chart-tab JSONB columns, all
  classification columns. No migrations.
- **RLS policies** — every existing policy stays.
- **Scoring functions** — the five scoring functions (allOrNothing,
  plusMinus, perRow, perBlank, perSlot) and their per-type dispatch
  are unchanged.
- **Linking columns** — `parent_case_id` and `trend_id` keep doing
  exactly what they do now.
- **Content shapes** — the JSONB structures for `content` and
  `correct` per type are unchanged. The new editors read and write
  the same shapes the old editors did.
- **Filtering, search, list views** — the bank list's filter bar and
  query logic stay. The list itself is rebuilt only insofar as it
  needs to call new editor components instead of the old
  `EditorShell`.
- **Server-rendering / RLS / auth model** — every rule in
  [CLAUDE.md](../../CLAUDE.md) §"Server-side auth rules" still
  applies. Nothing about cookies, `getClaims()`, per-request
  Supabase clients changes.

### Vendoring (added in slice 3)

The rebuild's data-layer code (classifications, JSONB shape types,
per-type parsers) is duplicated into `lib/authoring/` rather than
imported from `lib/bank/`. The new tree must not depend on the
legacy tree, so that at swap time (slice 13) the legacy folders
delete cleanly without breaking the new tree.

Vendored copies live at:

- `lib/authoring/classifications.ts` (mirrors `lib/bank/classifications.ts`)
- `lib/authoring/types.ts` (mirrors `lib/bank/types.ts`)
- `lib/authoring/parsers/<type>.ts` (mirrors `lib/bank/parsers/<type>.ts`)

Slice 3 vendored only what slices 2 + 3 needed (classifications,
types, parsers/mcq.ts, parsers/tf.ts). Each subsequent editor slice
(4–10) vendors its own parser as part of the slice.

While both copies exist (slices 3–12), the data-layer files don't
change in either copy. If anything genuinely needs to change
(unlikely per scope above), update both copies in the same commit.

---

## 8. Build strategy

### Parallel build, real surfaces, swap at end

We build the new authoring surface **alongside** the working code.
The old `lib/bank/editors/`, `lib/bank/case-study/`,
`lib/bank/trend/`, `lib/bank/question-authoring-panel.tsx`, and the
old wrapper pages all stay live and untouched until the rebuild is
fully integrated. At that point — and not before — they get deleted
in a single swap slice.

### Real surfaces during the transition

New surfaces live at versioned URLs alongside the originals:

- `/admin/bank/all-v2` — new bank list with new editor modal.
- `/admin/bank/cases-v2/[case_id]` — new case-study wrapper page.
- `/admin/bank/trends-v2/[trend_id]` — new trend wrapper page.
- (Tutor twins under `/tutor/bank/...-v2` mirror the same shape.)

Every slice from slice 2 onwards lands on a real, reachable URL.
Slice 1 alone is read-only / sandbox-style — just to lock the file
shape of one editor — and does not go through `-v2`.

### `lib/authoring/` namespace

All new code lives under `lib/authoring/`:

```
lib/authoring/
  atoms/
    modal-frame.tsx
    editor-actions.tsx
    section.tsx
    stem-field.tsx
    instruction-field.tsx
    rationale-fields.tsx
    classification-fields.tsx
    housekeeping-fields.tsx
    hidden-item-inputs.tsx
    question-type-picker.tsx
  hooks/
    use-save-action.ts
  editors/
    mcq-editor.tsx
    tf-editor.tsx
    sata-editor.tsx
    select-n-editor.tsx
    matrix-editor.tsx
    bowtie-editor.tsx
    cloze-editor.tsx
    highlight-editor.tsx
    drag-drop-editor.tsx
  wrappers/
    case-study-page.tsx
    trend-page.tsx
  actions/
    save-question.ts
    save-case-study.ts
    save-trend.ts
```

CSS goes to `styles/authoring.css` (a fresh file, sibling of the
existing `styles/bank.css`).

### Why this strategy fits

- **No schema changes** means there's no DB-level coordination cost
  to running both surfaces.
- **Sam is the only curator**, so two surfaces existing temporarily
  doesn't confuse anyone.
- **Cheap rollback** — if a slice doesn't fit, delete the new files,
  keep the old ones working. The revert just proved this.
- **Real-surface integration from slice 2** means we find URL state
  / save-action / DB-row issues as we build, not at the end.

---

## 9. Swap inventory

The list of folders and files that get deleted in the final swap
slice. Captured here so future-us doesn't have to hunt:

### Folders to delete

The new tree is fully self-contained (per §7 Vendoring), so the
entire `lib/bank/` folder can be deleted at swap time. Listed here
explicitly so the audit isn't open-ended:

- `lib/bank/editors/` — 9 old type-specific editor files.
- `lib/bank/parsers/` — 9 old per-type parsers. The new tree owns
  vendored copies in `lib/authoring/parsers/`.
- `lib/bank/case-study/` — old case-study wrapper code (8 files).
- `lib/bank/trend/` — old trend wrapper code (12 files).

### Files to delete

- `lib/bank/classifications.ts` — the new tree owns
  `lib/authoring/classifications.ts`.
- `lib/bank/types.ts` — the new tree owns `lib/authoring/types.ts`.
- `lib/bank/question-authoring-panel.tsx` — the old shared panel.
- `lib/bank/list-view.tsx`, `filters.tsx`, `navigator.tsx`,
  `field-prefix.ts`, `form-shape.ts` — legacy list/UI helpers and
  combined initial type. The new tree replaces them.
- `app/(app)/admin/bank/actions.ts` — legacy server actions
  (the new tree has `lib/authoring/actions/`).
- `app/(app)/admin/bank/editor-shell.tsx` — old standalone shell.
- Old CSS — `styles/bank.css` partials specific to the old
  authoring surface (audit at swap time; bank-list CSS likely
  stays).

### Files to rename / merge at swap

- `app/(app)/admin/bank/all-v2/page.tsx` → `app/(app)/admin/bank/all/page.tsx`
  (replacing the old one).
- `app/(app)/admin/bank/cases-v2/[case_id]/page.tsx` →
  `app/(app)/admin/bank/cases/[case_id]/page.tsx`.
- `app/(app)/admin/bank/trends-v2/[trend_id]/page.tsx` →
  `app/(app)/admin/bank/trends/[trend_id]/page.tsx`.
- Tutor twins of all of the above.

### Things to LEAVE alone at swap

- All `nclex_*` database objects (tables, RLS, RPCs). The
  transactional RPCs (`nclex_save_case_with_children`, the trend
  detach/delete pair) stop being **called** but stay in the
  database — orphaning RPCs is cheaper than a migration to drop
  them, and they don't cost anything sitting unused. Future
  cleanup pass can audit.
- All `nclex_*_idx` indexes.
- Anything in `db/` — schema, RLS, RPCs, migrations.

---

## Open questions for slice planning

These don't change the architecture but need answering before / during
the slice plan:

- **Type picker UI exact form** — small grid of 9 buttons? Dropdown?
  Slide-out menu? (Slice planning detail.)
- **Slot-rail unsaved-changes prompt UX** — exact dialog shape and
  copy when switching slots with unsaved edits.
- **Per-slot metadata for case studies (`cjmm_step`)** — lives on
  the slot card in the wrapper edit pane, OR inside the editor body
  as a "Role in this case" field that appears only when opened from
  a case-study context. Leaning toward slot card (keeps editor
  identical in both contexts), but worth re-confirming during the
  case-study slice.
- **Save-button placement when the editor body is embedded in a
  wrapper page** — the editor body's "Save question" button stays
  at the top of the body, even when there's no `<ModalFrame>` around
  it. Confirm during the wrapper slice.

---

## Next document

The slice plan — `docs/product-plan/questions-and-wrappers-rebuild-slice-plan.md`
— breaks this architecture into a build order. To be drafted after
this strategic plan settles.

---

## Rich-content relook — discussion capture (2026-06-15)

> **STATUS: DISCUSSION ONLY — not a build plan, not approved.** Captured
> from a working session with Sam so we can resume later. This is a
> *new, larger direction* than the 2026-04-28 rebuild above: that
> rebuild deliberately preserved the data model ("Nothing in this
> rebuild changes that data model"). **This direction would change the
> content format** — so its data-model half belongs in
> [bank.md](bank.md), cross-referenced below.

### What triggered it

Sam brought in two real NGN content corpora to test our editors against:

- The **University of Maryland "Next Gen NCLEX Test Bank Project"** —
  ~60 authored case studies across 5 clinical categories (`.docx`), each
  a uniform template: case summary + 6 questions walking the Clinical
  Judgment Measurement Model (Recognize → Analyze → Prioritize →
  Generate → Take action → Evaluate) + a stand-alone **Trend** or
  **Bowtie** item. (Local only: `F:\Mynclex\Maryland`.)
- The **official NCSBN NGN sample test packet** (`NGNTestPacket_121324.pdf`).

Reading the source against our editors surfaced a structural mismatch
that is **bank-wide**, not trend-specific.

### Finding 1 — Trend is modelled as a single flat grid

`nclex_trend_datasets` stores **one** rectangular table (`timepoints[]` ×
`rows[]` of `metric / values[] / flags[] / ref_range?`). There is **no
trend-charts child table** — contrast case studies, which have
`nclex_case_study_tabs`. The editor
([lib/bank/wrappers/trend/data-table.tsx](../../lib/bank/wrappers/trend/data-table.tsx))
already does add/remove column + row, rename headers, per-cell flag,
ref-range toggle — but only for that *one* grid.

Real NGN trends are **multi-chart**: the stimulus is an arbitrary set of
heterogeneous chart tabs over time — e.g. TB trend = Nurses' Notes
(narrative, 2 dates) + Labs (table) + Orders (list); Dehydration trend =
Phase Sheet (key/value card) + Nurses' Notes (narrative) + Vital Signs
(5-column time grid) + Labs. Gestational diabetes = a single Lab table
with `26 weeks / 30 weeks` **time-as-columns**. Today these get
**flattened into one synthetic grid** — losing the narrative notes,
reference ranges, orders, and per-chart timelines. Per-cell `flags`
(abnormal/borderline) are **author-side only** — the student does not
see them pre-submit ([types.ts:24](../../lib/bank/wrappers/trend/types.ts)).

**A Trend's stimulus is structurally identical to a Case Study's
stimulus** — N tabs of mixed shapes — differing only in (a) time lives
*inside* the charts (columns / dated narrative) rather than via
progressive disclosure, and (b) it's followed by ≥1 question, not the
6-step CJMM. So the right model unifies them onto one chart engine.

### Finding 2 — Case study is multi-tab, but every tab is single-shape

Case studies *do* have the multi-tab model trends lack
([tab-types.ts](../../lib/bank/wrappers/case-study/chart-tabs/tab-types.ts)),
but each tab is locked to **one** shape: `narrative` (stacked cards =
Time + optional dropdown + a plain `<textarea>` body) **or** `structured`
(a **flat** table; built-ins fixed-column, `custom_grid` curator-column).
So:

- **A tab cannot mix prose + a table** — yet the source does this
  constantly (a heading + a paragraph + a flowsheet in one chart;
  NCSBN "Flow Sheet" + "Nurses' Notes" on one screen).
- **Tables are flat** — no merged cells, no `Urinalysis:` sub-headers,
  no Phase-Sheet key/value layout.
- **No rich text anywhere** — the narrative body is a bare textarea.

### Finding 3 — Root cause is bank-wide: raw `<input>` / `<textarea>`

Every authoring surface is built on plain HTML fields, so there is
**zero rich text across the entire bank**, and the densest surfaces
can't even hold a second line:

- **Single-line `<input>` (no line breaks):** every structured
  chart-table cell (case + trend); every answer **option** and its
  **per-option feedback** ([sata-editor.tsx:148](../../lib/bank/editors/sata-editor.tsx) —
  MCQ/matrix/cloze share the pattern).
- **Plain `<textarea>` (line breaks, but no formatting):** stem,
  rationale, narrative body.

### What the source needs that we cannot capture today

Verified by re-parsing the `.docx` runs (bold/italic/underline/highlight):

- **Bold / italic / underline** — section labels, timestamps, emphasis,
  citations.
- **Highlight (yellow)** — and it is **not cosmetic**: in Highlight-type
  items the yellow *is the answer key* woven into the passage, and on
  flowsheets it marks the significant/changing values. Our `HIGHLIGHT`
  editor lives in a *separate box* from the chart it should highlight.
- **In-note structure / patient location** — bolded setting/transition
  labels ("ED → now on the ward", "Admission Note", "Weekly Visit 1",
  "Day 1 1100:"), section sub-headers, anatomical locations. Today we
  capture only a Time field; these want to live *as part of a paragraph
  in the same cell*.
- **Lists** (Orders are bulleted) and **paragraph / newline** support
  inside cells.

### Conclusion — the whole bank authoring area needs a relook

One root cause (plain HTML fields) produces every gap. The fix is to
**swap the content primitive (plain text → rich content), not rewrite
the bank** — keep classification, housekeeping, lifecycle, audit, the
dual preview, and the save pipeline. The rich editor already exists one
folder over: the **tutor library's Tiptap editor** (`lib/library/`) —
headings, lists, marks, merge-capable tables, the lab-values grid — does
most of this already.

**The ladder (cheapest → deepest):**

1. **Stop the bleeding** — make chart-table cells multi-line.
2. **Rich-text fields** — bold / italic / lists / **highlight** on
   stems, options, narrative bodies (reuse the library marks).
3. **Chart = document** — each case/trend tab becomes a rich document
   (prose **+** flexible tables, mixed); trends gain the multi-chart
   model. Point the library editor at the bank.
4. **Answer-bound highlight** — the genuinely *new* architecture:
   highlight that *is* the answer key, living inside the chart. Fuses
   stimulus and question, which the current design keeps strictly apart.

**Cautions before this becomes a build:**

- It's not just editors — it touches a storage **format**, a
  student-facing **read renderer** (library has one; the bank runner
  would need it), and a **migration** of existing plain-text rows.
- **Now is the cheapest moment** — prod holds only ~71 questions, 7
  case studies, 2 trend datasets (checked 2026-06-15). Cost rises every
  week.
- It's its own arc and **competes with live threads** (live-session
  Slice 3, the global payments page). Deserves a dedicated design pass
  (and likely a Claude Design prototype) before any slice.

### Cross-reference — data-model half lives in bank.md

The format decision (rich-content storage shape — e.g. Tiptap/portable
JSON — for chart bodies + stems/options; a trend **charts** child table
mirroring `nclex_case_study_tabs`; how answer-bound highlight is stored)
is a **data-model** change and should be written up in
[bank.md](bank.md) when this direction is picked up. This section is the
authoring-surface (UX) half.

### To continue

Sam's issue list isn't exhausted — trend multi-chart and the
formatting/line-break gaps are the items discussed so far. Resume by
finishing the catalogue, then deciding whether to promote this into a
real design doc + slice plan.

---

## Case-study wrapper rebuild — locked decisions (2026-06-27)

> **STATUS: DESIGN PASS — decisions 1–6 LOCKED with Sam, nothing built.**
> Picks up the relook above and turns it into a foundation. Sam's framing:
> this is effectively *rebuilding the curating code — take the time, get
> it right.* We work the open list (below) against these fixed decisions
> rather than re-litigating them.

### Evidence base (analysed this session)

Five real specimens, read in full against the live editors + the student
runner:

- **Maryland case studies:** Home-Safety-I, Home-Safety-II, Acute-Asthma,
  Acute-Respiratory-Distress (`.docx`, local `F:\Mynclex\Maryland`).
- **Official NCSBN packet:** `NGNTestPacket_121324.pdf`.

Key confirmations from the source markup itself:

- **The amber (`FFC000`) cell shading in the Word files marks the tabs.**
  What reads as "stacked sections" in a flat text dump is really separate,
  colour-coded tab regions — Asthma = `Nurses' Notes · Vital Signs ·
  Laboratory Report · Diagnostic Reports · Orders`; ARDS = `Nurses' Notes ·
  Laboratory Report · Orders`. This is the NCSBN tabbed rendering. → our
  tab model is the right target, and **one tab = one shape** is how the
  authors themselves segmented.
- **All nine of our question types appear** across the corpus (SATA,
  Matrix 2-/3-col, MCQ, Cloze dropdown, Drag-drop, Bowtie, Highlight). The
  gap is **not** the answer types — it is the **stimulus (wrappers) + the
  absence of rich text**.
- A "trend" Maryland files (ARDS, HS-II) is a **narrative Nurses' Notes
  over dated visits**, not a numeric grid — our flat-grid trend model
  cannot hold it. Confirms a trend's stimulus *is* a case's stimulus.
- The case is **6 questions** — the Maryland files just ship an *extra
  standalone* bow-tie/trend alongside; it is not a 7th case slot.

### The locked decisions

1. **Scope = the case-study wrapper first.** Trend is **not** designed
   separately. Once a tab can hold rich narrative *or* a do-anything
   table, a trend's stimulus is a case stimulus with such a tab, so the
   trend wrapper is later rebuilt to **reuse the same tab/stimulus
   engine** rather than designed afresh.

2. **Two gaps drive everything:** (A) the content primitive is plain text
   → make it **rich** (reuse the library Tiptap primitive); (B) there is
   no flexible table → add **one**.

3. **Enrich, don't replace.** Keep the existing **entry/row structure**
   (so the reveal mechanism and answer-target addresses survive); **keep
   the built-in templates** (Vital Signs, Labs, Nurses' Notes, Orders,
   H&P, Diagnostics) **but make them fully editable** (today only
   `custom_grid` can add/rename/remove columns); the **custom table is the
   gold** (the flexible workhorse).

4. **One tab = one shape — no mixing prose + table in a single tab.**
   Confirmed by the amber tab-markers (the authors split sections into
   separate tabs) and the NCSBN tabbed rendering. A tab is either rich
   **narrative cards** or **one table**. (A sentence above a table = a
   small tab-level intro field, not a mixed document.)

5. **The custom table = a single enhanced grid** with:
   - **merged cells (colspan + rowspan)** — required for the Phase Sheet
     (`Name | Paul | Gender | Male`, language spanning) and richer stacked
     layouts;
   - an **optional header column** (left-side labels — H&P
     `Body System → Findings`, Orders `Category → list`);
   - **rich, multi-line cells** (lists inside a cell, two-line refs,
     bold/emphasis);
   - **relaxed column bounds** (drop the 2–10 cap).

   One powerful grid — **not** a zoo of purpose-built preset modes (that
   is how we got the six rigid built-ins we are escaping). **Framed to
   curators as a "custom table"** (merge cells + make them rich), not a
   rigid "rows × columns" grid — but it keeps an **underlying row
   structure**, because reveal pins to rows (decision 7). Merging doesn't
   abolish rows; it lets a cell *span* them.

   The narrative/free-text tab + rich text covers the prose shapes
   (Nurses' Notes); the existing rows/cols grid + rich cells still works
   unchanged; the custom (merge + rich) table is the new superset for
   irregular layouts (Phase Sheet).

6. **Progressive reveal stays ROWS-ONLY.** The "visible at" control
   belongs to a **row**; columns are always shown. If a source draws time
   across the top (columns), the curator **transposes** it so each moment
   is a row. Column-level reveal was considered and rejected: it roughly
   doubles the reveal + answer-binding complexity for a benefit the
   transpose convention already provides.
   - **Merge × reveal rule:** a row's "visible at" governs the whole row;
     if cells span rows, those rows share one "visible at." No collision
     in practice — row-spanning is used on **static** panels (Phase Sheet,
     H&P, Orders) where every row is visible at once, while progressive
     reveal is used on time-series tables that don't span rows.

7. **One reveal model for every tab type — "visible at" per row.** The
   same mechanism drives all stimulus: a **narrative card**, a **simple
   grid row**, and a **custom/merge table row** each reveal at their own
   "visible at." Two real cases fall out for free: **static panels** leave
   every row at "from Q1" (the table appears whole, zero curator effort);
   **time-series** tables set "visible at" per row as the case advances.
   This is a *simplification* — one concept, not three.

8. **"Heading" is a structural ROLE, not just bold text — and header rows
   get DERIVED reveal.** Rich text lets a curator mark a cell as a
   heading, and headings are not only the top row (Phase Sheet left labels
   `Name`/`Gender`; H&P `Cardiac`/`Neurologic`). Two cases:
   - **Heading *cells* inside a data row** (left labels) → reveal **with
     their row**; no special treatment, "visible at" belongs to the row.
   - **A whole heading *row*** (a column-header `Time | BP | HR`, or a
     section divider) → **exempt from independent "visible at."** Its
     visibility is **derived** from the data rows it heads (a column
     header appears when the table's first data row appears), so the
     header never shows without its data or hides while data shows.

   Why it must be a role, not a font weight: today the column header is
   *implicit* (the column labels), never a data row, so reveal never
   touched it. The moment the table goes freeform ("any cell can be a
   heading"), the header *becomes* a row — and reveal would wrongly gate
   it unless we mark it as a heading and treat it specially. This is the
   seam where "freeform table" meets "progressive reveal."

9. **A narrative entry's header = free-text label CHIPS (0..N), not a
   typed-field schema.** Today an entry has a single hardcoded **Time**
   field. Real notes anchor on time *and/or* date, location, day, setting
   ("Emergency Department / Day 1 / 0900"). The generalisation: the
   curator adds **any number of small free-text labels**, rendered as a
   chip row above the body. **The current "Time" is just one such chip,
   pre-labelled** (a sensible default). A chip is plain free text — if the
   curator wants "Status: Active" they type it; no label/value schema, no
   predefined field taxonomy (that would re-introduce the rigidity we are
   escaping; the corpus has no consistent field set). Rich text owns the
   **body** (inline emphasis, transitions like "ED → ward", sub-headers);
   chips own the **scannable anchor** (what rich-text-inline can't do —
   lift the when/where out into a chip for timeline scanning).
   - The built-in typed extras (`orders.status`, `history.section`,
     `diagnostics.test_type`) become **suggested default chips**, not
     hardcoded fields — unifying built-in + custom narrative under one
     chip mechanism.

10. **Rich text is BANK-WIDE — every text field gets it.** Not just the
    wrapper. The blanket rule covers the **stimulus** (narrative bodies,
    table cells, header chips, scenario summary) **and the questions
    themselves** (stems, every answer **option**, per-option **feedback**,
    **rationale**). The tutor wants to bold/emphasise in the scenario and
    the main stem too. One primitive (the library Tiptap field), applied
    everywhere a plain `<input>`/`<textarea>` is today.

11. **Build order: CUSTOM tabs first, then revisit the templates.** New
    tabs are added as **custom tabs** — a custom **narrative** tab or a
    custom **table** (simple or merge). We build and prove those first;
    **once they work**, we do a second pass on the six built-in templates
    to bring them up to the same capability (decision 3 — fully editable).
    So the tab-shape "choice" surfaces as *which kind of custom tab you
    add*, and template polish is a later, separate slice — not a blocker.

12. **Rung 4 (answer-bound highlight) needs NOTHING special — CLOSED.**
    We do **not** fuse the stimulus and the question, and we build **no**
    mechanism. Our existing `HIGHLIGHT` type already works on its own
    passage; the stimulus/question separation stays. If a curator wants a
    highlight question based on a tab's content, **they simply author it
    that way themselves** (put the content in the highlight question) — a
    rare case and ordinary curator practice, not a feature. The NCSBN
    "highlight the priority orders" examples are real but few; we do not
    complicate the design for them. This removes rung 4 as a risk and as a
    "new architecture."

13. **The editing toolset — reuse the library's, scope it per surface.**
    The library Tiptap editor already ships the full inline set
    ([note-body-editor.tsx](../../lib/library/note-body-editor.tsx)); we do
    not build new tools, we choose which to expose. The prototype's three
    (Bold/Italic/List) were just a concept.
    - **Core inline (table cells + narrative bodies):** Bold, Italic,
      Underline, Strikethrough, Superscript, Subscript, Bullet list,
      Numbered list, **Highlight** (cosmetic emphasis — marking an abnormal
      value; distinct from rung-4 answer-highlight).
    - **Plus (agreed):** Text colour, Blockquote, Text-align.
    - **Media block (image / ECG / wound photo) in the NARRATIVE body** —
      agreed (the library already supports it), built as the **final piece
      of the wrapper arc**.
    - **Table-structure tools:** Merge, Split (subdivide *and* un-merge),
      Heading, +Row / +Col, Delete row / col.
    - **Not in a table cell:** block nodes (media, nested tables, callouts,
      drug cards, block-headings) — media lives only in the narrative body;
      a cell's "heading" is the structural role (decision 8), not a
      block-heading.
    - **Impl note — text colour:** use a small **dark-mode-safe swatch
      palette** (like the library's highlight swatches), not a free hex
      picker, so coloured text stays legible in both themes.

### Reveal — RESOLVED (decisions 6–8)

The progressive-reveal mechanics for the merge table — the part that
worried us — are now settled: one reveal model (per-row), header rows
exempt (derived). Reveal is no longer an open risk.

### The merge-table authoring risk — RETIRED by the CD prototype (2026-06-27)

The remaining risk was: can a non-coding tutor build the Phase Sheet
without it feeling like wrestling Excel? A Claude Design prototype
("Case Study Merge Table") answered it — **yes**. It realises the custom
merge-table editor (drag-select → Merge / Split, Heading toggle, rich
contenteditable cells, a per-row "Appears" gutter) **and** the student
render (device toggle + a "viewing at Q1–6" stepper that reveals rows
progressively). The interaction is the Word/Google-Docs table model
(drag-select to merge), not a raw spreadsheet — learnable. It maps 1:1 to
decisions 3–10; notably the gutter shows **"auto"** on header rows
(decision 8's derived reveal, realised). **Adopted as the build basis
(concept-not-source).**

**Refinements agreed on the prototype (fold into the build):**

- **Header column folds into heading cells (refines decision 5).** There
  is no separate "header column" toggle — a left-label column is just
  *heading cells*, and a header *row* is auto-detected when every cell in
  the row is a heading. Cleaner than the original "optional header column"
  wording; this is the model.
- **Split must SUBDIVIDE a plain cell, not only un-merge.** The prototype's
  Split only un-merges an already-merged cell, so "4 columns on top, 2
  below" needs a clunky workaround (build 4 cols, merge the bottom pairs).
  Fix: **Split = subdivide a 1×1 cell into N columns/rows** (Word/Docs
  model) *as well as* un-merge a merged cell. Under the hood it stays a
  **uniform grid** — subdividing one cell inserts a fine sub-column and the
  other rows' cells auto-bump colspan +1 to keep their look; the curator
  only ever sees "1 cell → 2."
- **Rich cells = the library Tiptap field, not `execCommand`** (the
  prototype fakes rich text with `contenteditable`+`execCommand`; the real
  build uses decision 10's primitive). A Tiptap instance *per cell* may be
  heavy → consider a lightweight rich field. Build concern, not design.
- **Mobile = horizontal scroll for now** (the prototype shows "‹ swipe
  sideways ›"); consider key-value reflow later for phone-first students.

### Still open (execution detail, after the risk)

- **Gap A detail** — exactly which fields become rich (stems, answer
  options + per-option feedback, rationale, narrative bodies, table cells,
  scenario) and the **blast radius** of pointing the library Tiptap
  primitive at the bank.
- **The grid spec** — header-row/cell behaviour, merge mechanics,
  rich-cell scope, bounds.
- **Storage / data-model + snapshot** — the rich-content storage shape and
  the attempt-snapshot changes (the **bank.md** half; see cross-reference
  above) + a **migration** of existing plain-text rows + a rich renderer
  in the runner.
- **Standalone bow-tie / trend** handling (after the case-study wrapper).
- **The slice plan** + the Claude Design prototype.

---

## Slice plan — case-study wrapper rich-content rebuild (2026-06-27)

> **STATUS: PLAN — nothing built.** First-pass build sequence off the 13
> locked decisions + the adopted prototype (v2). Order follows decision 11
> (custom tabs first, templates later, media last). Slice 0 is the
> foundation; its internal data-model choices are a **proposal to settle**
> before any code. Each slice is Sam-tested on dev and merged to `main`
> individually, per the usual loop.

### Slice 0 — data model + storage + migration (FOUNDATION, design-first)

Everything hangs on this. **The three internal decisions are SETTLED
(2026-06-27):**

**Decision 1 — cell content = a constrained rich doc + a roving editor.**
A cell needs **paragraphs + lists + inline marks** (the Orders cell has a
bulleted list; lab cells have two lines), so its *storage format* is a
**small, constrained Tiptap doc** — block-capable but **no heavy blocks**
(no images / nested tables / block-headings in a cell). For performance the
editor uses **one roving Tiptap instance** that mounts into the focused
cell while the others render as static formatted text — never dozens of
live editors on one big table. (Same rich format is reused everywhere a
plain `<input>`/`<textarea>` is today: cells, narrative bodies, stems,
options, feedback, rationale, scenario.)

**Decision 2 — store the new shape in the existing JSONB; no structural DB
change.** `nclex_case_study_tabs` keeps its columns; only the **shape inside
`entries` / `columns_def` evolves** — no new columns, no new tables, no
`ALTER TABLE`. The migration is a **data transform**, not a table rebuild.
A small **`v` version stamp inside the blob** (`v: 2`) marks new-shape rows
so old (`v: 1`) and new can coexist (see Decision 3) and future format
changes stay clean. The shapes:
  - **Table tab** → `{ v, rows[] (each { id, visibleFrom }), grid[][] of
    cells { id, content(JSON), heading, colspan, rowspan, covered } }`.
    Header-row = derived (all non-covered cells in the row are `heading`).
    Mirrors prototype v2 exactly.
  - **Narrative tab** → `{ v, entries[] of { id, visibleFrom,
    chips: string[], body(JSON) } }` (chips generalise today's `time`).
  - **Snapshot:** the attempt snapshot already copies the tabs JSONB, so it
    carries the new shape for free; the runner renderer reads it.
  - **Questions** (stems / options / per-option feedback / rationale) live
    on `nclex_bank_items` / `nclex_tutor_questions`; those text columns move
    string → Tiptap JSON in **Slice 5** (bank-wide blast radius).

**Decision 3 — STAGED migration, matched to the build order.** Migrate
**custom tabs now** (Slice 0) to `v: 2`; **leave the built-in templates in
their old shape** (`v: 1`) until **Slice 6** rebuilds them, then migrate
those. The `v` stamp is what lets old templates and new custom tabs coexist
during the build — this is where it earns its keep. The mapping (applied
when each type migrates):
  - **Notes-style** (Nurses' Notes, Orders, H&P, Diagnostics, custom
    free-text) → narrative: `time` → first chip; each extra field →
    `"label: value"` chip; `body` string → rich paragraphs.
  - **Table-style** (Vital Signs, Labs, custom grid) → table: column titles
    → a **heading row**; each cell string → Tiptap; `visible_from` → the
    row's `visibleFrom`.
  - **HS2-style exception** — `custom_narrative` blobs that are really
    tables (the Phase Sheet) can't be auto-detected → migrate to a rich
    paragraph, then **manually re-author** the few affected cases as merge
    tables.

(Since prod has no real users and only a handful of cases, even the
manual re-authoring is small and low-stakes.)

### Slice 1 — the rich-text primitive in the bank (de-risk the round-trip)

Bring the library Tiptap field in as a **reusable bank rich field +
read renderer**. Prove it on **one simple field first** (the scenario, or a
single stem): editor → Server Action save → snapshot → student render,
end-to-end, including the ProseMirror-attrs deep-clone gotcha
(CLAUDE.md "Known Workarounds"). This validates Tiptap-in-bank before the
hard table.

### Slice 2 — the custom merge-table editor (authoring)

Build the editor from prototype v2: type-in-cell, **drag-select → Merge**,
**Split (subdivide *and* un-merge)**, **Heading** (role), **+Row / +Col**,
**Delete row / col**, rich cells (the Slice-1 field), and the **per-row
"Appears" gutter** (header rows show "auto"). One tab = one table.

### Slice 3 — the student render of the custom table

Read-only renderer inside the case stimulus panel: colspan/rowspan, covered
cells, heading styling, and **per-row progressive reveal** (`visibleFrom ≤
currentQuestion`, header rows derived). Mobile = horizontal scroll for now.

### Slice 4 — the narrative tab (rich body + chips)

Rebuild the narrative tab editor + render: a rich **body** + **free-text
chips** (generalising "Time"), per-row "visible at". Built-in narrative tab
extras become suggested default chips.

### Slice 5 — rich text across the questions

Point the Slice-1 primitive at the **question** fields — stems, every
answer **option**, per-option **feedback**, **rationale** — across all 9
item types, plus the **scenario**. The bank-wide migration of those columns
(string → Tiptap JSON) lands here.

### Slice 6 — upgrade the built-in templates

Bring the six built-in tab templates (Vital Signs, Labs, Nurses' Notes,
Orders, H&P, Diagnostics) up to the custom-table/narrative capability —
**fully editable** (add/rename/remove columns; merge; rich cells), keeping
them as convenient presets.

### Slice 7 (LAST) — media block in the narrative body

Add an image / ECG / wound-photo block to the **narrative body** only
(reuse the library's media block). Closes the arc.

### Cross-cutting (every slice)

Classification / housekeeping / lifecycle / audit / publish-eligibility /
dual preview / save pipeline are **kept** (decision 3 — enrich, not
rewrite). Trend is **not** touched here; it reuses this engine in a later
arc once the case-study wrapper is proven.

### Deferred candidate — multiple tables per custom tab (2026-06-28)

> **STATUS: NOTED, not scheduled. Revisit only once the single-table custom
> table (Slices 2a/2b/3) is proven.** Captured from a working session with
> Sam after he saw the merge-table editor.

The idea: let a custom-table tab hold a **list of tables** (an "+ Add table"
affordance), the way a free-text tab holds a list of entry cards — so one
tab could stack, e.g., two distinct tables.

- **Why it's clean, not a hack.** It's *symmetric to free text*, which
  already stores its entries as a list. A multi-table tab would just store
  a **list of MergeTableData** instead of one — an **additive** change to
  the v2 shape (`entries` becomes an array of tables), so it needs no
  rework of what Slice 2 builds. Reveal is unaffected: each row keeps its
  own `visibleFrom` regardless of how many tables sit in the tab.
- **Why it's deferred.** It reopens **decisions 4 + 5** ("one tab = one
  shape", "the custom table = a single grid"), which we chose for
  simplicity and which the corpus supported (the amber tab-markers showed
  NCSBN authors split each section into a **separate tab**). And much of the
  need is already covered two ways: **(a)** two tabs (the NCSBN-native
  split), and **(b)** the merge table's own irregularity (merge/subdivide
  can already make one grid *look* like two — the Phase Sheet is one
  irregular table, not two).
- **The gate before building it.** Find a real Maryland/NCSBN specimen where
  a single tab genuinely needs two distinct tables that neither two-tabs nor
  one merge table expresses well. Best moment to look: Slice 4 (narrative
  tab) / Slice 6 (templates), staring at the real content again. If such a
  case shows up → generalise `entries` to a list of tables + an "+ Add
  table" button + per-table toolbar focus. If not → the single-table model
  holds.
