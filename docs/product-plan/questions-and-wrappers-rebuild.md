# Questions and Wrappers — rebuild plan

*Living document. Started 2026-04-28 after the prior rebuild attempt
was reverted (commit `fde8db3`). Captures the architecture for the
fresh attempt — what's being rebuilt, the principles guiding it, and
the shape of the new code.*

Last updated: 2026-04-28 (initial draft)

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

- `lib/bank/editors/` — 9 old type-specific editor files.
- `lib/bank/case-study/` — old case-study wrapper code (8 files).
- `lib/bank/trend/` — old trend wrapper code (12 files).

### Files to delete

- `lib/bank/question-authoring-panel.tsx` — the old shared panel.
- `app/(app)/admin/bank/editor-shell.tsx` — old standalone shell.
- Any old action files only the old editors used (audit at swap
  time — some may still be needed for historical linking).
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
