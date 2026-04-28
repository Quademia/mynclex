# Questions and wrappers rebuild — slice plan

**Last updated:** 2026-04-28
**Operationalises:** [`questions-and-wrappers-rebuild.html`](./questions-and-wrappers-rebuild.html)

## What this is

The rebuild plan captured the *strategic* shape: three editors, two-view
layout, separate Save / Publish / Session-Integrity, additive schema,
build-beside-then-swap. It deliberately stopped before sequencing.

This doc is the *sequence*: the slices that operationalise the rebuild,
in build order, with locked decisions on the things the rebuild plan
left open.

Per-slice build-handoff documents (`slice-N-plan.md`) get drafted
individually before each slice begins. This doc is the overview that
lists what slices exist and in what order.

## Locked decisions (this session, 2026-04-28)

These supersede or settle the open questions in the rebuild plan:

1. **The "three editors" line is wrong — it's eleven.** Nine
   self-contained question editors (`McqEditor`, `TfEditor`,
   `SataEditor`, `SelectNEditor`, `MatrixEditor`, `HighlightEditor`,
   `ClozeEditor`, `DragDropEditor`, `BowtieEditor`) plus
   `CaseStudyEditor` and `TrendEditor`. Each editor owns its own
   shell, tabs, preview, save/publish buttons, state shape. There is
   *no* outer `QuestionEditor` that switches between types — that
   structure is what the current build has, and the rebuild rejects
   it. The wrapper modals mount whichever question editor matches
   the active question's type.

2. **Shared primitives via composition.** The genuinely-identical
   bits (Classification fields, Housekeeping fields, modal chrome,
   dirty-warning, save-button styling) are extracted as small shared
   primitives. Each editor *imports and composes* them on its own
   terms, rather than reimplementing them. This keeps editors
   genuinely self-contained without forcing the same nine-dropdown
   grid to be written nine times.

3. **Folder name: `lib/authoring/`.** Domain components live with
   domain logic (existing convention: `lib/bank/editors/` are React
   components, not in `components/`). All new code — editors,
   primitives, modal hosts, parsers, types — goes in
   `lib/authoring/`. No separate `components/authoring/`.

4. **Modal opening pattern: URL-driven `?edit=<id>`.** The modal
   reads the ID from the URL on mount; closing it removes the
   query param. Deep-linking, back-button, and bookmarkability
   all work for free. Pasting a URL opens exactly that question.
   Matches the existing convention shown in the rebuild plan's
   mockups.

## Slice sequence

| # | Slice | Output | Notes |
|---|---|---|---|
| 1 | **McqEditor end-to-end (no save)** | `lib/authoring/` skeleton; full `McqEditor` (all 3 tabs functional, shared primitives `ClassificationFields` + `HousekeepingFields` built); `StandaloneQuestionModal` host; sandbox route `/admin/sandbox/question-editor?edit=<id>`; read-side parser for MCQ. | The architectural template. Save/Publish rendered but disabled. Existing `/admin/bank` and `lib/bank/` untouched. |
| 2 | **Save flow for McqEditor** | Per-question save server action; Save button wired; round-trips to existing `nclex_bank_items`. | First write path. Confirms the controlled-component shape persists correctly. |
| 3 | **TfEditor** | Self-contained TF editor cloned from McqEditor pattern; locked True/False option labels; same shared primitives. | Tests that the template clones cheaply. |
| 4 | **SataEditor** | Multi-correct option-list editor. | |
| 5 | **SelectNEditor** | Exactly-N option-list editor with curator-set count. | |
| 6 | **MatrixEditor** | First bespoke type — rows × columns grid. | De-risks bespoke shapes. |
| 7 | **HighlightEditor** | Passage with `[[bracketed]]` clickable chunks. | Bespoke. |
| 8 | **ClozeEditor** | Sentence with `{N}` inline blanks; per-blank choice lists. | Bespoke. |
| 9 | **DragDropEditor** | Ordered list / sentence-slot subtypes. | Bespoke. |
| 10 | **BowtieEditor** | Three-wing NGN bow-tie (2 left + 1 centre + 2 right). | Bespoke. |
| 11 | **Publish flow + session-integrity stub** | Publish topbar action across all 9 editors; `is_published` flag flipping with validity check; session-snapshot scaffolding (write-side only — runner is separate). | Saving and publishing are now genuinely separate. |
| 12 | **CaseStudyEditor + CaseStudyModal** | Self-contained case-study editor (top half of wrapper modal); reuses unchanged question editors for the bottom half. New modal host. | First wrapper. May add nullable columns to `nclex_case_studies` if new wrapper-level fields emerge — additive only, never breaking. |
| 13 | **TrendEditor + TrendModal** | Same pattern as CaseStudyEditor. | Second wrapper. |
| 14 | **Cutover** | Flip the existing routes (`/admin/bank?edit=…`, `/admin/bank/cases/[id]`, `/admin/trends/[id]`) to launch the new modals. The old `lib/bank/` code remains in place as insurance for a confidence period. | The new system becomes the only path curators see. Old code still in the tree but no longer reachable from the UI. |
| 15 | **Cleanup** | Delete `lib/bank/`, `app/(app)/admin/bank/cases/[case_id]/`, `app/(app)/admin/bank/trends/[trend_id]/`, etc. — every file that was the old authoring path. | Final slice. Triggered when curators have used the new system without issue for the agreed confidence period. |

### Slice-shape principles

- Each slice ships independently and leaves the codebase in a working
  state. Old `lib/bank/` keeps working through Slice 14.
- Slices 3–5 are pattern-clones of MCQ with different correct-answer
  semantics; slices 6–10 each add one bespoke type and may take
  longer. Wrappers (12–13) are larger again because they integrate
  with the question editors built earlier.
- Per-slice build-handoff docs (`slice-N-plan.md`) are drafted
  immediately before each slice starts and capture per-slice scope,
  acceptance, and any one-off decisions. They live alongside this
  doc in `docs/product-plan/`.

## What stays out of scope

- **The student runner.** Authoring and answering are separate code,
  separate state model, separate persistence flow. Whatever visual
  primitives end up shared between authoring previews and the runner
  get extracted retroactively when the runner is built — not designed
  for in advance.
- **In-place migration of `lib/bank/`.** Build beside, swap routes,
  delete the old. No partial conversions.
- **NGN item types beyond the existing nine.** Case studies and
  trends are wrappers, not new item types. New item types are a
  separate scope question.
- **Schema changes to existing columns.** Only additive nullable
  columns if a new wrapper-level field genuinely needs one. Old code
  keeps reading its columns; new code reads its mix.

## Cutover and cleanup

Slice 14 (cutover) flips the existing routes to launch the new
modals. The old code stays in the tree, unreferenced, as insurance.

The confidence period before Slice 15 (cleanup) is decided when
cutover lands, not now — it depends on how curators experience the
swap. Default expectation: a couple of weeks of normal authoring use
with no rollback needed.

After cleanup, the rebuild is complete. The session log captures
what was deleted, and `docs/product-plan/bank.md` is updated to drop
the "current build" paragraphs in favour of the new system.

## Still-open questions (deferred from the rebuild plan)

These three remain deliberately open. They get settled in the slice
that forces the answer:

1. **What visual primitives, if any, are extracted for sharing
   between authoring previews and the future runner.** Decided
   retroactively, after the runner is built.

2. **What new wrapper-level sections (if any) replace Classification
   and Housekeeping at the wrapper level.** Decided in Slice 12 when
   `CaseStudyEditor`'s tabs are designed against real case-authoring
   needs, and revisited in Slice 13 for trends.

3. **Whether to keep the atomic `save_with_children` RPCs as a
   convenience or retire them.** Decided after Slice 11 — once the
   per-thing save flow has been used for a while and we know whether
   any callers still benefit from the atomic version.

## Cross-doc pointers

- Strategic plan: [`questions-and-wrappers-rebuild.html`](./questions-and-wrappers-rebuild.html)
- McqEditor field audit (interactive mockup): [`mockups/mcq-editor-mockup.html`](./mockups/mcq-editor-mockup.html)
- Bank schema and JSONB shapes (still authoritative): [`bank.md`](./bank.md)
