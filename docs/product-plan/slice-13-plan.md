# Slice 13 — Trend wrapper-v2 — plan

*Planning doc for slice 13 of the questions-and-wrappers rebuild.
Companion to [questions-and-wrappers-rebuild-slice-plan.md §13](questions-and-wrappers-rebuild-slice-plan.md)
which has the canonical scope; this doc records the structural
decisions and open questions worked through before build starts.*

Captured: 2026-05-01 (initial draft, pre-discussion).

---

## Why this plan exists

Slice 12 (Case Study wrapper-v2) shipped end-to-end + polish + prod
release on 2026-05-01. Slice 13 rebuilds the Trend wrapper using the
same architecture inside `lib/authoring/wrappers/`. Most of the shape
is settled by mirroring slice 12 — but Trend has enough genuine
differences (variable N slots, single data table not chart tabs,
per-question publishing, different create flow) that decisions
need to be locked before build, not figured out mid-implementation.

Schema is **mostly shipped** (slice 1.12 from April). `nclex_trend_datasets`,
`nclex_tutor_trend_datasets`, the nullable `trend_id` FK, and the
three RPCs (`nclex_save_trend_with_children`,
`nclex_detach_and_delete_trend`, `nclex_delete_trend_and_children`)
all exist on dev + prod.

One small additive migration **is** needed in slice 13: adding
`is_free_sample` and `is_builder_visible` columns to both dataset
tables so the trend wrapper can carry the same three-row Visibility
section as the case-study wrapper (decision 16). Pure additive
columns with safe defaults — no rename, no drop, no policy
tightening. Honours the additive-only release rule.

Old `/admin/bank/trends/[trend_id]` (legacy editor) keeps working
untouched until the slice 14 swap, per the rebuild rules.

---

## What changes vs case-study v2

The single most useful framing — exactly which structural
decisions need to differ from slice 12, and which carry over.

| Aspect | Case Study (slice 12) | Trend (slice 13) |
|---|---|---|
| Slot count | Fixed 6 | **Variable N** — `+ Add` appends, no upper bound |
| Per-slot metadata | `cjmm_step` edited on slot card | **None** — slot rail is just a navigator |
| Chart context | 6 chart tabs (Notes/Vitals/Labs/Orders/H&P/Diagnostics) | **One data table** (rows × timepoints) |
| Question visibility gate | `visible_from` per chart entry (1–6) | **None** — whole table always visible |
| Wrapper-level visibility flags | 3 flags on case row: `is_published`, `is_free_sample`, `is_builder_visible` | **Same 3 flags on dataset row** (decision 16 adds the two missing columns) |
| Per-question publishing | Hidden — children inherit from case row | **Independent per question** — each attached question keeps its own three flags, editable in the editor body's housekeeping |
| Child default `is_builder_visible` | FALSE (CS children are case-only, forced) | **TRUE** (trend questions are pickable standalone, dataset's flag seeds the default) |
| Create flow | Insert "Untitled" → straight into editor | **Kind preset picker first** → seed rows + timepoints → redirect into editor |
| Two-path delete | Direct CRUD in v2 actions | **Direct CRUD** (mirrors CS v2 — RPCs exist but unused) |
| Sandbox route | `cases-v2/sandbox` (visual scratchpad) | TBD — see open question 6 |

Everything else carries over: two-mode wrapper page (Wrapper / Editor),
HelpBulb on toolbars, dirty-guard hook, ErrorToast, DiscardConfirm,
DeleteConfirm, type picker, by-name editor mounting, Save question
button calling the same `saveQuestionAction`.

---

## Decisions locked before build

These are the structural choices we'll commit to unless something
in discussion forces a change. Numbered for easy reference during
review.

1. **File layout parallels case-study v2.** New tree at
   `lib/authoring/wrappers/trend/` mirroring
   `lib/authoring/wrappers/case-study/`:

   ```
   lib/authoring/wrappers/trend/
     types.ts                 — TrendDatasetRow, TrendRow, SlotRow, WrapperData
     load-trend.ts            — server loader, surface-aware
     actions.ts               — create / saveMetadata / detach / delete / addSlot
     data-table.tsx           — vendored from lib/bank/trend/data-table.tsx
     kind-templates.ts        — vendored from lib/bank/trend/kind-templates.ts
     validation.ts            — adapted (subset; see decision 9)
     validation-panel.tsx     — same shell as CS
     delete-trend-confirm.tsx — two-path typed-confirm dialog
     wrapper-page.tsx         — two-mode (Wrapper / Editor) client page
   ```

2. **Routes parallel cases-v2.**

   ```
   app/(app)/admin/bank/trends-v2/
     page.tsx                — list
     new/page.tsx            — kind preset picker
     [trend_id]/page.tsx     — loadTrend + <TrendWrapperPage>
   app/(app)/tutor/bank/trends-v2/  — three twins of the above
   ```

3. **Vendoring rule still active.** No imports from `lib/bank/trend/`
   into the new tree. Copy `data-table.tsx`, `kind-templates.ts`,
   and the bits of `validation.ts` we need. Slice 14 collapses the
   duplication.

4. **Direct CRUD for save + delete.** Case-study v2 didn't use the
   legacy atomic RPC for save and didn't use its delete RPCs either —
   it does direct table updates. We follow the same pattern for
   parity. The trend RPCs (`nclex_save_trend_with_children` etc.)
   stay in the DB, unused by v2 code, deleted in a future cleanup
   pass after slice 14.

   Rationale: simpler action code, easier to reason about, no RPC
   plumbing for fields that already round-trip through plain table
   columns. The atomic-save guarantee was useful in the legacy
   editor where one Save button updated dataset + N children at
   once; in v2 the wrapper Save and the per-question Save are
   separate buttons (matching CS v2), so atomicity across both
   isn't needed.

5. **Tab-style left-pane navigation via persistent pill strip.**
   *Confirmed 2026-05-01.* Departs from CS's explicit
   `mode: 'wrapper' | 'editor'` state — see decision 7 for the
   placement that drove this.

   Top-level state is `activePill: 'dataset' | <question_index>`:
   - `'dataset'` → left pane shows wrapper-edit content (title,
     scenario, kind, visibility, data table — Wrapper mode in
     CS terms).
   - integer index → left pane shows the editor body for that
     attached question (Editor mode in CS terms).

   The CS `← Wrapper view` back-button maps to clicking the
   `Dataset` pill. The CS Slot click maps to clicking a
   question pill. Same UX, lighter code shape — the pill strip
   doubles as the navigator and the mode indicator.

6. **Two-pane layout — left switches modes, right is combined
   preview.** *Confirmed 2026-05-01. Same shape as case-study v2.*

   ```
   ┌─────────────────── sticky topbar ────────────────────┐
   │  ← Back · Trend datasets (v2) / NCLEX_TRD_xx         │
   │  Save trend · Cancel · Delete · Help                 │
   ├──────────────────────────────┬───────────────────────┤
   │ Left pane                    │ Right pane            │
   │                              │ (combined preview)    │
   │ ┌─ pill strip ────────────┐  │                       │
   │ │ [Dataset] [Q1·MCQ ●]    │  │ Always on:            │
   │ │ [Q2·SATA ○] [+]         │  │  ├─ Scenario          │
   │ └─────────────────────────┘  │  ├─ Data-table        │
   │                              │  │   render (read-    │
   │ Active = Dataset:            │  │   only, with       │
   │  ├─ Title/Scenario           │  │   ref-ranges,      │
   │  ├─ Kind picker              │  │   no flags)        │
   │  ├─ Visibility (3)           │  └─ Active question   │
   │  └─ Data table (editable)    │      preview          │
   │                              │                       │
   │ Active = Q1..Qn:             │                       │
   │  └─ Active editor body       │                       │
   └──────────────────────────────┴───────────────────────┘
   ```

   Two panes, draggable divider with `localStorage` persist
   (mirrors the CS v2 split). Left pane has a persistent pill
   strip on top (decision 7) acting as both navigator and mode
   indicator (decision 5); content below the strip swaps based
   on which pill is active. Right pane is **always on**, same
   structure regardless of which pill is active — matches CS
   behaviour ([wrapper-page.tsx:994–1051](../../lib/authoring/wrappers/case-study/wrapper-page.tsx)
   renders the preview pane outside the mode conditional).
   Data-table render stacked above the active question's
   preview. When active pill = Dataset, the question-preview
   slot shows a small empty-state ("Pick a question pill to
   preview"). When active pill = a question, the preview slot
   shows the live render of the active editor body's current
   draft. The data-table's own `overflow-x: auto` handles wide
   tables.

   **No tab strip inside the Dataset view** (unlike CS, which
   had Content / Chart tabs to switch between scenario editing
   and chart-tab editing). Trend has one data table instead of
   six chart tabs, so the Dataset view is a single linear
   scroll: title → scenario → kind → visibility → data table.
   The pill strip handles all the question navigation.

7. **Slot rail — horizontal pill strip, persistent at top of
   left pane.** *Confirmed 2026-05-01.*

   Departs from CS's vertical-card-rail-inside-wrapper-edit
   pattern. The pill strip is the navigator AND the mode
   indicator (decision 5). One pill per attached question plus
   a leading `Dataset` pill (always present) and a trailing
   `+ Add question` pill.

   Each question pill carries:
   - Position number (1, 2, 3, …) — derived from creation
     order, no DB column.
   - Question-type chip (MCQ / SATA / etc.).
   - Status dot (filled = published, hollow = draft).

   Stem preview text and `× Remove` action live in the
   editor's toolbar / housekeeping inside the active pill's
   editor body, not on the pill itself (pills stay slim).

   Strip overflow: `overflow-x: auto` + `flex-nowrap`. Pills
   keep min-width; horizontal scroll if many pills. Practical N
   range: 1–10 (typical), up to ~20 (extreme).

   Drag-to-reorder not in v1 — pill order = creation order.

8. **Kind preset picker is its own route.** `trends-v2/new/page.tsx`
   shows the 6 options (5 presets + Custom) as cards. Clicking a
   card calls `createTrendAction(formData)` which seeds the
   dataset row with rows + timepoints from `kindSeedData(kind)`,
   sets `kind`, inserts, redirects to `/admin/bank/trends-v2/<id>`.
   Custom path: card click expands an inline kind-name input +
   "Create" button (mirrors the slice-12 polish "+ Create custom
   tab" pattern).

9. **Validation: defer to a polish pass.** *Confirmed 2026-05-01.*
   Slice 12 shipped the wrapper-v2 with no validation panel and
   added it during the polish bundle. Same here. Build the
   editor first; validate the shape with real curator use; then
   port the legacy 8 errors / 4 warnings (currently in
   [lib/bank/trend/validation.ts](../../lib/bank/trend/validation.ts))
   as a polish slice. Reduces 13's risk.

10. **`saveQuestionAction` extended to write `trend_id`.** *Confirmed
    2026-05-01.* The current action ([lib/authoring/actions/save-question.ts:432–484](../../lib/authoring/actions/save-question.ts))
    handles the case-study path: reads `parent_case_id` from form
    data, sets it on the new bank-item row at create time, then
    writes the `nclex_case_study_items` join row.

    For trend, slice 13d adds a parallel block in the CREATE branch
    only. No join row — the link is one column on `nclex_bank_items`.
    UPDATE path stays untouched; the column already survives because
    the action only writes parsed editor fields on update, not
    `trend_id`.

    Concrete addition next to the existing `parentCaseId` block:

    ```ts
    const trendId = String(formData.get('trend_id') ?? '').trim();
    if (trendId) {
      row.trend_id = trendId;
    }
    // …after the insert succeeds…
    if (trendId) {
      const wrapperBaseUrl =
        surface === 'tutor' ? '/tutor/bank/trends-v2' : '/admin/bank/trends-v2';
      revalidatePath(`${wrapperBaseUrl}/${trendId}`);
    }
    ```

    Roughly 5 lines added. No new validation needed — `trend_id` is
    a foreign key with `ON DELETE RESTRICT`, so a bad value fails at
    the DB layer and bubbles up as the same error any other insert
    would produce.

11. **Three-flag visibility on the dataset; per-question flags
    seeded from dataset defaults.** *Confirmed 2026-05-01.*
    Trend wrapper carries the same three-row Visibility
    section as CS:

    - **Published** → dataset's `is_published`. Drives whether
      the dataset itself is visible/usable.
    - **Free sample** → dataset's `is_free_sample`.
    - **Visible in builder** → dataset's `is_builder_visible`,
      defaulting TRUE in the schema (per decision 16).

    Each attached question **also** carries its own three flags
    on the bank-item row, **genuinely owned** — the editor body
    mounts in `'standalone'` mode (decision 12) so all three
    checkboxes render and the curator edits each question's
    flags directly. No hidden / force-cleared fields.

    Behaviour:

    - On `+ Add question`, the new question's three flag
      checkboxes seed their initial values from the dataset's
      current flag values, as a UX convenience. (Schema
      defaults still apply if the dataset was just created
      and no curator interaction has happened: FALSE / FALSE /
      TRUE per decision 16.) After the seed, the curator can
      tick / untick each flag freely.
    - Per-question values always win — the dataset's flag
      changes do not retroactively re-seed attached questions.
      Saving the dataset's flags only updates the dataset row.
    - This preserves the trend reuse pattern: a dataset
      referenced by multiple questions can have one published
      and another draft, without needing to clone the dataset
      or otherwise work around a wrapper-owns-everything
      model.

    **Contrast with CS**: CS children's `is_published` and
    `is_builder_visible` are silently force-written to FALSE
    by the editor (decision 12 side note). Slice 13 deliberately
    avoids that pattern — questions own their flags genuinely.

12. **Editor housekeeping mode: reuse `'standalone'`.**
    *Confirmed 2026-05-01.* Trend-attached questions mount
    their editor body in `mode: 'standalone'`. The full
    housekeeping section renders (all three flags shown +
    editable). The wrapper passes a hidden `trend_id` form
    field so the save action writes the FK (decision 10);
    the editor body itself doesn't need to know it's inside
    a trend.

    Why not a new `'trend-child'` mode value: it would touch
    nine editor bodies × two places each (row mapper + the
    housekeeping conditional in [housekeeping-fields.tsx](../../lib/authoring/atoms/housekeeping-fields.tsx))
    for **identical visible behaviour** to standalone. Pure
    ceremony with no payoff. If a future trend-specific UI
    tweak ever needs to differ from standalone, we can
    introduce the third mode value then; today there's no
    such tweak.

    **Side note — CS has the converse issue.** CS uses
    `'wrapper-child'` mode, which means `is_published` and
    `is_builder_visible` aren't rendered on the form. As a
    result, on every Save question for a CS child, the
    save-question action force-writes those two fields to
    FALSE on the question row (the form fields are absent
    so the parser reads `null`, which falsifies the
    boolean expressions in
    [save-question.ts:374,380](../../lib/authoring/actions/save-question.ts)).
    The case row's flags are independent — there's no
    inheritance, no propagation, just a hidden default that
    happens to lock CS children's per-question visibility
    to FALSE / FALSE. That's a brittle design. **Slice 13
    explicitly does NOT repeat this for trend** — questions
    own their flags genuinely. CS retrofit deferred to a
    future task; not in slice 13's scope.

13. **Detach question = clear `trend_id`, leave question
    standalone.** No join table, so detach is one update:
    `UPDATE nclex_bank_items SET trend_id = NULL WHERE
    item_id = ?`. Question survives in the bank's standalone
    list. No CASCADE concerns.

14. **Two-path delete — same UX as CS.** Delete dataset
    button on wrapper toolbar opens `<DeleteTrendConfirm>`:
    - Zero attached questions → simple typed-DELETE confirm,
      drops dataset row.
    - Some attached → two-path typed-confirm:
      - **Detach and delete dataset** — clears `trend_id` on
        each attached question, then drops dataset.
      - **Delete everything** — drops all attached questions
        and the dataset.

15. **Per-question publishing surfaces in the slot rail.**
    Each slot card shows a "Published" or "Draft" pill next
    to the question type chip. Dataset-level published flag
    sits in the wrapper-edit pane next to `is_free_sample` /
    `is_builder_visible`. Both default FALSE on create.

16. **Schema migration: add `is_free_sample` +
    `is_builder_visible` to both dataset tables.** *Confirmed
    2026-05-01 (consequence of decision 11).*

    ```sql
    ALTER TABLE nclex_trend_datasets
      ADD COLUMN is_free_sample     BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN is_builder_visible BOOLEAN NOT NULL DEFAULT TRUE;

    ALTER TABLE nclex_tutor_trend_datasets
      ADD COLUMN is_free_sample     BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN is_builder_visible BOOLEAN NOT NULL DEFAULT TRUE;
    ```

    Defaults match `nclex_bank_items` so existing rows pick up
    sensible values without backfill. New file in `db/migrations/`
    (next available timestamp) plus the same edit back-ported
    into `db/schema.sql` per the convention that `schema.sql`
    represents the authoritative final shape.

    No RLS policy changes — `is_free_sample` and
    `is_builder_visible` are read by the same SELECT policies
    that already key on `is_published`. No view or function
    rewrite either; nothing existing references these columns
    on the dataset tables.

    Lands in slice 13a alongside the list page so subsequent
    sub-slices can rely on the schema being current.

17. **No sandbox route for trend.** *Confirmed 2026-05-01.*
    CS slice 12 shipped a sandbox at
    `/admin/bank/cases-v2/sandbox` for visual iteration on
    the chart-tab editors (six different shapes) before the
    real loader was wired. Trend has just one data table —
    the legacy `data-table.tsx` is a known shape we're
    vendoring, and the wrapper page CSS is structurally
    inherited from CS — so the marginal value is low. Develop
    13b's wrapper page directly against a real dev-DB
    dataset (legacy seed `NCLEX_TRD_00001` or similar — verify
    in 13a). Saves ~80 lines of throwaway code that would
    just get deleted in slice 14.

---

## Sub-slice order

Following slice 12's pattern: one push per bucket, polish
bundled at end. Slice 12 landed 12a–12e in commit `8392fdc`
then polish in `ffa78ea`; slice 13 follows the same shape.

| # | Bucket | Surfaces | Risk |
|---|---|---|---|
| 13a | List page + create flow (kind picker → seed → redirect) | Admin + tutor list, both `new/` pages | Low |
| 13b | Read-only wrapper shell (load + render) | Both detail pages (read-only) | Low |
| 13c | Wrapper-edit writable (title/scenario/kind/visibility/data table) + saveTrendMetadata | Both detail pages | Med |
| 13d | Editor-mode question mounting (mount editor body, save question, dirty-guard, type picker on add) | Both detail pages | Med |
| 13e | Detach + two-path delete | Both detail pages | Low |
| 13-polish | HelpBulb / popovers / preview tweaks / validation panel | Both detail pages | Low |

13a is independently verifiable (list + create flow can be
clicked through without the wrapper page being functional —
landing on a stub at `[trend_id]/page.tsx` is fine until 13b).

13d depends on decisions 11, 12, 13 being settled.

13e depends on `<DeleteTrendConfirm>` mirror of CS.

---

## Open questions for discussion

These are the things to settle before I start coding 13a.

### Q1. `saveQuestionAction` — confirm the trend_id wiring  ✅ Resolved 2026-05-01

Action audited. CREATE path needs a `trend_id` block parallel to
the existing `parent_case_id` block. UPDATE path needs no change.
See decision 10 for the concrete snippet.

### Q2. `is_builder_visible` default + visibility section parity  ✅ Resolved 2026-05-01

Original question was just about the per-question default. In
discussion Sam asked for the trend wrapper to carry the same
three-row Visibility section as CS. That required choosing
between (A) adding two columns to the dataset tables, (B) keeping
a single-flag Visibility section, or (C) mixing persisted +
ephemeral defaults.

**Option A picked.** Schema migration adds `is_free_sample` and
`is_builder_visible` to both dataset tables (decision 16). Dataset
flags drive the wrapper Visibility section; same flags also seed
defaults for newly-added attached questions. Per-question flags
remain editable in the editor body's housekeeping section and
always win over the dataset's defaults. See decisions 11 + 16.

This decision touches Q7 (editor housekeeping mode) — keeping
per-question flag editing on for trend means the editor body's
housekeeping section needs to **show** all three flags for
trend-attached questions, unlike CS's `wrapper-child` mode
which hides them. Resolution of Q7 deferred until that question
is up.

### Q3. Slot rail layout  ✅ Resolved 2026-05-01

Discussion surfaced that slot rail layout was downstream of
the page-level shape (which I'd muddled in the original
draft). After locking decision 6 (two panes), Q3 picked
**horizontal pill strip persistent at top of left pane**
(decision 7), which carries with it a small reframe of the
mode state from `'wrapper' | 'editor'` to
`activePill: 'dataset' | <index>` (decision 5).

### Q4. Right pane behaviour when active = Dataset  ✅ Resolved 2026-05-01

(Original Q4 about data-table position was settled by
decision 6 — table sits inside the Dataset view in the left
pane. The harder question that surfaced during discussion
was what the right pane shows when the curator is on the
Dataset pill, since the left pane is then editing the data
table that the right pane also renders.)

**Picked option (a): right pane always on, same structure
regardless of active pill** — matches CS, where the preview
pane is rendered unconditionally outside the mode
conditional. The redundancy on the Dataset pill is
informative: the rendered version shows the curator how the
table actually presents (ref-range column visible/hidden,
`pre-wrap` newlines respected, etc.) which the editor's
input grid can't. When active = Dataset, the question-
preview slot in the right pane shows a small empty-state.

### Q5. Validation timing  ✅ Resolved 2026-05-01

Defer the validation panel to a polish pass, matching CS.
See decision 9.

### Q6. Sandbox route — yes or skip  ✅ Resolved 2026-05-01

Skip the sandbox for trend. See decision 17.

### Q7. Editor housekeeping mode for trend-attached questions  ✅ Resolved 2026-05-01

Picked: reuse `'standalone'` mode (decision 12). Each
trend-attached question keeps its own three flags
genuinely, edited via the editor body's standard
housekeeping section. The wrapper passes a hidden
`trend_id` so the save action writes the FK without the
editor needing to know about the wrapper context.

Discussion surfaced an existing brittleness in CS — its
`'wrapper-child'` mode silently force-writes children's
`is_published` and `is_builder_visible` to FALSE on every
save (because the form fields aren't rendered). Sam's call:
**leave CS as-is for now, fix trend the right way.** A CS
retrofit can be its own task post-slice-13.

---

## Out of scope (slice 13)

- Drag-to-reorder rows / timepoints inside the data table
  (legacy uses up/down arrows; v1 keeps that pattern).
- Drag-to-reorder of slots in the slot rail.
- Image / waveform / rhythm-strip trend data (table-only,
  per legacy 1.12 deferral).
- Per-cell image attachments.
- Student-side rendering of cell flags (author-side only,
  per legacy decision 9).
- Bank-list "filter by trend kind" surface.
- Slice 14 swap (separate slice).
- Removal of legacy `lib/bank/trend/` (slice 14).
- Removal of unused legacy trend RPCs (post-slice-14
  cleanup).

---

## Known drift points to watch

- **`saveQuestionAction` form contract.** Trend wrapper's
  Save question must post `trend_id` in form data; CS posts
  `case_id` + `position` + `cjmm_step`. The action needs to
  branch correctly. Confirm in 13d Phase 1.

- **`is_builder_visible` default.** Forced FALSE for CS
  children, must be TRUE for trend children. The
  `+ Add question` create flow needs to seed the right
  default per wrapper context.

- **Per-question publish independent of dataset publish.**
  Curator can publish individual questions while dataset is
  draft, and vice versa. Slot rail UI must show both
  states clearly so this isn't confusing.

- **Tutor / admin visibility boundary.** Mirrors all other
  bank tables: admin trends only attach admin items; tutor
  trends only attach tutor questions. RLS already enforces;
  the UI must not present cross-surface options in any
  picker.

- **Empty dataset.** A new trend with no rows and no
  timepoints should not break the data-table render or the
  preview pane. Curator picking `assessment` or `custom`
  starts with both arrays empty.

- **CS visibility-flag retrofit deferred.** CS slice 12
  uses `'wrapper-child'` mode which silently force-writes
  child question rows' `is_published` and
  `is_builder_visible` to FALSE on every save (the form
  fields aren't rendered, so the parser reads `null` and
  the boolean expressions evaluate false). That's brittle
  and the converse of slice 13's approach. **Out of scope
  for slice 13.** Worth a separate task post-13 to make
  CS questions own their flags genuinely too — likely just
  swapping `wrapper-child` → `standalone` on each
  case-study editor mount, with a small Visibility-section
  rename on the case wrapper to clarify it's the case row's
  flags. Track separately so it doesn't bloat slice 13.

---

## Related

- [questions-and-wrappers-rebuild.md](questions-and-wrappers-rebuild.md)
  — strategic rebuild plan (architecture + principles).
- [questions-and-wrappers-rebuild-slice-plan.md](questions-and-wrappers-rebuild-slice-plan.md)
  — canonical slice list; §13 has the spec this doc plans
  against.
- [slice-1.12-plan.md](slice-1.12-plan.md) — original Trend
  v1 planning doc from April. Schema and RPC decisions
  there are still load-bearing for v2 (we just rebuild the
  UI on top).
- `lib/authoring/wrappers/case-study/` — slice 12's tree,
  the structural template for slice 13.
- `lib/bank/trend/` — legacy implementation. Source for
  vendoring `data-table.tsx` and `kind-templates.ts`. Stays
  intact and importable from the legacy `/admin/bank/trends`
  route until slice 14.

---

## Status

- 2026-05-01 — initial draft written.
- 2026-05-01 — Q1 resolved (decision 10 locked).
- 2026-05-01 — Q2 resolved (decisions 11 + 16 locked; schema
  migration added to slice 13a).
- 2026-05-01 — Q3 resolved (decision 7 + decision 5 reframe).
  Layout diagram in decision 6 updated to reflect the
  persistent pill strip.
- 2026-05-01 — Q4 resolved (right pane always on, matches CS;
  decision 6 clarified with empty-state behaviour for the
  question-preview slot when active = Dataset).
- 2026-05-01 — Q5 resolved (validation deferred to a polish
  pass, matching CS).
- 2026-05-01 — Q6 resolved (no sandbox; decision 17 locked).
- 2026-05-01 — Q7 resolved (decision 12 locked: reuse
  `'standalone'` mode; decision 11 expanded to clarify
  questions own their flags genuinely; CS retrofit explicitly
  deferred to a future task and noted in drift section).
  **All seven questions resolved. Plan ready for build.**
