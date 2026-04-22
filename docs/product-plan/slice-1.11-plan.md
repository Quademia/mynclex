# Slice 1.11 — Case Study authoring — sub-slice plan

*Planning doc. Part of the `mynclex/docs/product-plan/` set — see
[main.md](main.md) and [bank.md](bank.md) for the wider product plan.*

Captured: 2026-04-22 (planning session after second-opinion review).

---

## Why this plan exists

Slice 1.11 (Case Study wrapper) is the last wrapper type before the
student runner is unblocked. Unlike the nine standalone question
types, Case Study has no stem, is not a row in `nclex_bank_items`,
and introduces three new UI surfaces at once (case list, tab
authoring, nested child-question editing). Trying to land it in one
slice means a very large commit with nothing verifiable until the
end. This doc locks the shape into three smaller, independently
shippable sub-slices.

All 11 planning decisions below were settled during the 22 April
session. The schema shape was revised from the 20 April plan after a
second-opinion review pushed back on two earlier leans (the join
table should stay; tabs should not be hardcoded columns).

---

## Decisions locked before build

1. **Authoring flow.** Case-study questions are authored *inside*
   the case, not picked from a pool. Reason: NCLEX case questions
   are inseparable from the specific scenario they test — you can't
   realistically pre-stock standalone items and happen to have six
   that fit a new case.

2. **Join table stays.** `nclex_case_study_items` (and its tutor
   twin) keeps carrying `position` (1–6) and `cjmm_step`. These are
   relationship properties, not item properties, so they belong on
   the join, not on `nclex_bank_items`. Dropping the join would
   leave always-null columns on ~99% of bank items.

3. **Flexible tab schema replaces the 6 hardcoded JSONB columns.**
   New child table `nclex_case_study_tabs` (plus tutor twin) — one
   row per tab per case. Real NCLEX cases have variable tab sets
   (common: Nurses' Notes, Vital Signs, Lab Results, Orders, H&P,
   Diagnostics, Imaging, MAR, Intake/Output, Provider Notes); no
   case uses all of them, and no case uses them in the same order.

4. **Built-in tab types are hardcoded in code, not DB-driven.**
   Registry lives at `lib/bank/case-study/tab-types.ts`. Rationale:
   a new built-in tab needs a structured editor (typed fields per
   entry) and a renderer, both of which require code. A DB registry
   would mark tabs available without giving them editors — partial
   automation that adds a second place to forget. If this becomes a
   frequent operation later, promote to a DB registry in v2.

5. **Custom tabs allowed per case.** Stored in the same
   `nclex_case_study_tabs` table. Flag `is_custom = TRUE`. Uses a
   generic entries shape and a generic editor. Curators can name
   them freely.

6. **Progressive unfold applies to all tabs.** Built-in and custom
   tabs both use `visible_from` (1–6) per entry. The runner filters
   every tab the same way: show entries where
   `visible_from <= current_question_position`. No special-casing.

7. **Dedicated sub-route, reusable editor.** Pages:
   `/admin/bank/cases` (list), `/admin/bank/cases/[case_id]`
   (editor), and tutor twins. The editor itself lives as a shared
   component `lib/bank/case-study/editor.tsx` and takes a `surface`
   prop — same pattern as the Slice 2.1 list-view and editor-shell.
   Zero duplication between admin and tutor.

8. **Case-linked questions remain real `nclex_bank_items` rows.**
   Same schema, same JSONB shapes, same per-type editors, same
   parsers, same scoring. A new nullable FK column
   `parent_case_id` back-points to the owning case (null for
   standalone items). Tutor twin: `parent_case_id` on
   `nclex_tutor_questions` referencing `nclex_tutor_case_studies`.

9. **`is_builder_visible = FALSE`** is set automatically on
   case-linked items so they never appear in the student quiz
   builder. The case runner loads them by the join directly.

10. **Case-linked items may appear in the admin/tutor bank list**
    with a visible "In case · Q2/6 · Analyse cues" badge. Clicking
    the edit action on such a row routes to
    `/admin/bank/cases/[case_id]?focus=[item_id]` rather than
    opening a standalone editor. Editing in isolation is dangerous
    because the question is tied to the chart's specific values.

11. **Tutor case studies only link tutor questions.**
    `nclex_tutor_case_study_items.item_id` references
    `nclex_tutor_questions` only. Same ownership boundary as every
    other tutor-private table. No cross-linking in either
    direction.

---

## Three sub-slices

### Slice 1.11a — Schema + case shell + tab authoring

**Goal.** A curator can create a named case study, add tabs
(built-in or custom), fill in chart entries with `visible_from`,
save, and see the case in a list. Questions are not in scope for
this slice.

**Layout principle — anticipate the split.** The chart area is
designed to work at ~half of the desktop viewport (reserve the
right half for the 1.11b question pane). In 1.11a the right half
shows a "Questions — Slice 1.11b" placeholder. This avoids a
layout rework when 1.11b lands. Below 900px the layout is
single-column as normal.

**Scope.**

- Migration: drop the six hardcoded JSONB tab columns from
  `nclex_case_studies` and `nclex_tutor_case_studies`. Add new
  child tables `nclex_case_study_tabs` and
  `nclex_tutor_case_study_tabs` (case FK, tab_key, title,
  display_order, is_custom, entries JSONB, timestamps).
- Hardcoded built-in tab-type registry at
  `lib/bank/case-study/tab-types.ts`. Each entry carries a stable
  `tab_key`, default label, and a structured field schema used by
  the built-in editor for that tab type. Six entries to start
  (Nurses' Notes, Vital Signs, Lab Results, Orders, History,
  Diagnostics).
- New sub-route pages:
  - `/admin/bank/cases/page.tsx` — list view of all cases.
  - `/admin/bank/cases/[case_id]/page.tsx` — case editor.
  - Tutor twins under `/tutor/bank/cases/...`.
- Shared reusable editor at `lib/bank/case-study/editor.tsx`.
  Takes a `surface` prop. Both pages mount this component.
- Shared actions in `lib/bank/case-study/actions.ts` with
  `surface`-aware writes, mirroring the Slice 2.1 pattern.
- Add-tab picker UI: dropdown of built-in types plus a "Custom
  tab" option.
- Per-tab editors: typed row entries for built-ins, generic
  free-text entries for custom. `visible_from` dropdown on every
  entry.
- RLS on both new tab tables.
- Navigation: a "Case Studies" entry card on `/admin/bank` header
  linking to `/admin/bank/cases`.
- Seed: one demo case with two or three tab types and realistic
  entries — no child questions attached.

**End state.** Curator can fully author a case's scenario and
chart tabs end-to-end. Save and list work. The question slots are
a stub, flagged "not yet buildable — Slice 1.11b."

**Risk.** This is the largest of the three sub-slices. Tab
authoring is real UX surface — picker, structured vs generic
editors, per-entry `visible_from`, overall layout. Mockup first.

---

### Slice 1.11b — Child questions inside the case

**Goal.** A curator can add up to 6 questions to a case, each with
a CJMM step, reusing the nine existing per-type editors.

**Layout principle — split screen on desktop.** The case editor
becomes a two-pane layout when the viewport is wide enough
(≥900px). Left half retains everything 1.11a built — metadata
accordions, chart tabs with left rail + entries pane. Right half
hosts the question authoring — a pill-strip navigator at the top
(`Q1 · Recognise · SATA`, `Q2 · Analyse · Matrix`, …, `+` for empty
slots) and the active question's editor below it. The split has a
draggable divider; default 50/50, last position persists in
localStorage. Below 900px the layout stacks vertically: chart on
top, questions below. Rationale: the student runner shows the
same chart-left / question-right split, so authoring mirrors the
consumption view — curator sees the chart they built while
writing the question that tests it.

**Scope.**

- New column: `parent_case_id` on both `nclex_bank_items` and
  `nclex_tutor_questions` (nullable TEXT FK, no cascade).
- `nclex_case_study_items` and `nclex_tutor_case_study_items`
  already exist in the schema — this slice wires them up and adds
  RLS.
- Split-screen shell in `CaseStudyEditor` with draggable divider
  and mobile-stacked fallback.
- Question navigator pill strip (Q1–Q6 + empty `+` pills).
- In `CaseStudyEditor`: 6 question slots (position 1–6), each
  with a CJMM step dropdown and a question-type picker. Selecting
  a type mounts the existing `EditorShell` for that type in a
  nested mode (no stem-level wrapper, inherits the case's
  classification context).
- Automatic side-effects on save: `is_builder_visible = FALSE`
  and `parent_case_id = <case_id>` are set on every child item.
- Transactional save semantics: if case header or any child save
  fails, the whole operation rolls back (database transaction in
  the server action).
- Bank list badges: case-linked rows show "In case · Q2/6 ·
  Analyse cues" in the type column, with the "Edit" action
  routing to `/admin/bank/cases/[case_id]?focus=[item_id]`.
- Draft cases may have fewer than 6 questions or questions with
  incomplete stems. `is_published = TRUE` requires all 6 slots
  filled with valid questions (server-side check).

**End state.** Case studies fully authored end-to-end. The
student runner is unblocked for data; runner build is a separate
track.

**Risk.** Transactional save is the main complexity. Lower than
1.11a's UX risk because the question editors themselves are
already proven by the previous nine slices.

---

### Slice 1.11c — Preview + polish

**Goal.** Curator can preview the unfolding chart as the student
will see it at each question position. Catch unfold errors before
publishing.

**Scope.**

- "Preview as position: [1][2][3][4][5][6]" toggle in the case
  editor. Applies the `visible_from <= N` filter to every tab's
  entries at the chosen position.
- Validation summary button: "This case has 4/6 questions; 2
  questions have empty stems; tab 'Lab Results' has no entries
  with `visible_from = 1`." Optional — can defer if 1.11a and
  1.11b ship clean.
- Polish passes on the 1.11a tab editors based on real-use pain
  points surfaced during 1.11a verification.
- Any small UX gaps from earlier sub-slices that didn't warrant
  blocking those commits.

**End state.** Case Study authoring is production-ready. Curator
has confidence in what students will experience.

**Risk.** Low. Pure refinement.

---

## Dependency chain

- 1.11a ships first. Independently verifiable without questions.
- 1.11b depends on 1.11a (needs the editor shell to mount nested
  question editors inside).
- 1.11c depends on both (polish pass over the full surface).
- Student runner depends on 1.11a + 1.11b (not 1.11c).
- Slice 1.12 (Trend wrapper) depends on 1.11a + 1.11b for the
  wrapper pattern it reuses.

---

## What's out of scope for all three sub-slices

- Student runner (separate track; consumes this data).
- Case-linked item scoring logic (inherited from per-type scoring
  functions; no new scoring behaviour).
- Readiness-pack-style reserved case studies (future — the
  `is_builder_visible` flag is all that's needed at the data layer).
- Image attachments on chart entries (defer until image upload is
  wired for bank items — current blocker).
- Tab reordering via drag-and-drop (use up/down arrows like the
  curriculum editor — drag-and-drop deferred).
- Multi-language support on tab labels.

---

## Open items to settle during 1.11a mockup

- Visual layout of the tab editor — tabs across the top vs tabs in
  a left rail.
- How the built-in structured editors render their typed fields
  (one row per entry in a table, vs stacked cards per entry).
- `visible_from` control shape — numeric dropdown vs segmented
  button group vs column in a table.
- Where the "Preview as position" toggle lives (deferred target is
  1.11c but the hook for it should be reserved in the 1.11a layout).

---

## Related

- [bank.md](bank.md) — Case Study schema section (will be revised
  when 1.11a lands; current bank.md reflects the pre-revision
  6-column shape).
- [main.md](main.md) — product plan overview.
- `mynclex/SESSIONS.md` — running session log; 1.11 planning
  entry will be appended when this doc lands in the repo.
- `mynclex/lib/bank/list-view.tsx`, `editor-shell.tsx`,
  `actions.ts` — the Slice 2.1 shared-surface pattern that 1.11
  extends.
