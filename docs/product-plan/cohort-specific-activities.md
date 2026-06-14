# Cohort-specific activities — the cohort-only escape valve

*Design agreed with Sam 2026-06-14. Status: **DESIGN AGREED, NOT YET
BUILT.** Point 1 (where content lives) is accepted but Sam flagged he
may revisit. Live sessions are explicitly **out of scope** here — they
get their own treatment (the Live Session Planner), discussed
separately.*

Part of the `mynclex/docs/product-plan/` set. The cohort-curriculum UX
this plugs into lives in
[curriculum-authoring-ux.md → screen 11](curriculum-authoring-ux.md);
the propagation rules it obeys live in
[main.md → Curriculum propagation](main.md).

---

## What this is — and the gap it closes

A tutor running a specific cohort sometimes wants to add an activity
that exists **only for that intake** — a one-off handout, an extra
reading, an extra mock — without it polluting the shared programme
template that every other cohort uses. The plan docs have always
called this the **cohort-only escape valve** (main.md design principle:
*"Cohort-only adds are a real escape valve"*).

**It is designed but unbuilt.** The 2026-06-01 three-state checklist
rebuild explicitly deferred it (*"the '+ Add cohort-only' affordances
are not built; cohort-only remains future"*). The scaffolding exists:
`nclex_cohort_checklist_items.source` is already a
`'TEMPLATE' | 'COHORT_ONLY'` enum ([lib/cohorts/types.ts](../../lib/cohorts/types.ts))
— v1 only ever writes `'TEMPLATE'`. Nothing else is wired.

Today a cohort can only **include / exclude** and **re-schedule**
activities that exist on the programme template. It cannot add an
activity that lives only in that cohort. This feature closes that.

---

## The mental model (the handbook analogy)

The programme is a **printed course handbook** — every cohort gets the
same one; the **weeks** are its fixed chapters. A cohort-only activity
is a **handout the tutor slips into a chapter for one class only**. It
never changes the printed handbook the other classes use.

- You can add a **single handout** (a loose activity) or a **stapled
  packet** (a cohort-only block of activities).
- Your handouts stay in their own lane — loose in the chapter, or in
  your own packet. They never get stapled into the handbook's printed
  sections, and you never tear printed pages into your packet.
- Students just see one combined chapter; they can't tell printed
  pages from your handouts, and don't need to.

---

## Settled design

### Point 1 — where the content lives *(accepted; Sam may revisit)*

**Option A: cohort-only activities are ordinary
`nclex_programme_activities` rows, tagged with a `cohort_id`.**
`cohort_id IS NULL` = template (shared); `cohort_id` set = cohort-only
(belongs to that one run). Blocks get the same tag on
`nclex_programme_blocks`.

Chosen over the two alternatives (store content on the checklist row;
a separate parallel `nclex_cohort_activities` table) because the whole
system already treats "activity content" as one thing rendered by one
set of editors + one tutor render + one student render. A cohort-only
activity **is** that same thing, just scoped to one run and never
propagating. One table + a scope tag reuses every existing editor and
render path and makes all 7 supported types work for free; the
alternatives duplicate the entire content model (two editors, two
render paths, divergence risk).

**Cost:** every query that means "the template" must add
`cohort_id IS NULL`, or cohort-only rows leak into the shared template
editor. This is small and greppable — see *The discipline cost* below.

### Point 2 — which activity types

**7 types supported:** `TEXT`, `PDF`, `EXTERNAL_LINK`, `MOCK`,
`PRACTICE_QUIZ`, `LIBRARY_NOTE`, `SHELF`.

They split by entanglement:
- **Self-contained** (`TEXT`, `PDF`, `EXTERNAL_LINK`) — content lives
  entirely on the activity row. Trivial under Option A. Build first.
- **Reference types** (`MOCK`, `PRACTICE_QUIZ` → a tutor quiz;
  `LIBRARY_NOTE`, `SHELF` → a library object) — work the same, but each
  reuses its own existing picker / attach modal. Build second.

**`ONLINE_LIVE_SESSION` is excluded.** A live session's
date/link/recording is inherently cohort-specific *even for template
sessions* — that is the separate Live Session Planner problem and is
better solved there than bolted onto the generic cohort-only path.

### Point 3 — blocks *and* loose activities, in their own lane

Both ship. The cohort tag goes on **two** tables: activities and
blocks.

**The nesting rule (the one simplification that removes all edge
cases):**
- ✅ A cohort-only **loose activity** sits directly under a template
  unit.
- ✅ A cohort-only **block** sits under a template unit and contains
  **only** cohort-only activities.
- ❌ A cohort-only activity may **not** go inside a *template* block
  (that would make a shared block render different children per
  cohort).
- ❌ A template activity may **not** go inside a cohort-only block
  (template activities are shared; they can't be scoped to one cohort).

In short: **cohort-only content is either loose or in its own
cohort-only block; template structure stays byte-identical across every
cohort.**

**Units are never cohort-only.** The programme owns the unit
shape/count. Cohort-only content always lands inside an *existing*
template unit. A whole extra unit for one cohort is out of scope.

### Point 4 — Draft/Live is the editor's existing Status tick; a soft-warn when it lands Draft

*Refined 2026-06-14 at build kickoff: the earlier "born Draft (forced)"
framing was wrong. Draft/Live is governed entirely by the activity
editor's existing Status checkbox — there is no new control, no inline
toggle, and we never override what the tutor ticked.*

For a **template** activity, two independent switches gate student
visibility: **Draft/Live** (`is_published`, a template-level "is this
content ready", shared by all cohorts) and **Include/Exclude**
(`is_included`, per-cohort "is this in this run", the three-state
model).

**For a cohort-only item those two collapse into one** — there is no
"shared across cohorts" dimension, so "is it ready" and "is it in this
cohort" are the same question. Therefore:

- **No three-state Include/Exclude segment** on cohort-only rows. They
  are "included" by the fact that they exist (`is_included = true`,
  always).
- **Draft/Live is the activity editor's existing Status checkbox** —
  *not* a new control and *not* an inline toggle. Every activity editor
  already carries "☐ Live — student-visible in cohorts" in its shell
  (`activity-modal.tsx`); a cohort-only activity uses the same editor,
  so the same tick governs it. The checklist row shows a Draft/Live
  **status pill** (display only, already rendered from `is_published`);
  to flip it, the tutor reopens the editor and ticks the box — exactly
  the gesture used for any template activity.
- **We don't force Draft or Live.** The editor's Status tick *defaults*
  to unticked, so an activity the tutor doesn't touch lands as Draft —
  but if they tick Live while creating it, it's born Live. The publish
  state is always whatever the tutor left; we never override the editor.
- **A soft-warn when it lands Draft.** Keyed off that resulting state:
  if the saved activity is Draft, nudge — *"Saved — not visible to
  students yet. Tick Live when ready"* — plus the persistent **Draft**
  pill on the checklist row so the hidden state stays obvious. If the
  tutor saved it Live, no nudge. The warning reflects the checkbox; it
  isn't a separate rule.
- **Fix the editor's stale help text along the way.** The Status field
  currently reads *"Off → Draft. Draft activities don't surface in any
  cohort's checklist."* — wrong since the 9.3f control-surface model:
  drafts **do** appear in the tutor's checklist (so they can be
  managed); students just don't see them. Correct it to something like
  *"Draft activities still appear in your cohort checklists so you can
  manage them — but students don't see them until you set them Live."*
  Pure copy, no logic; folds into Slice 1.
- **Delete** removes it for good (it only exists here).
- **Dates** behave exactly like template items: born with a default
  release date (cohort start + the unit's week index); a future release
  date *locks* rather than *hides* (matching the existing
  visible-but-unreleased behaviour).

This keeps faith with Sam's "don't make me re-configure" instinct — the
*only* deliberate step is the one he wants to be deliberate: choosing
when it goes live, by the same tick he already knows.

---

## Data model

A cohort-only activity is represented by **two rows**, created
atomically:

1. **The activity row** — `nclex_programme_activities` with
   `cohort_id` set, `unit_id` → a template unit, `block_id` either
   NULL (loose) or → a cohort-only block, `is_published` = false
   (born Draft), `ordinal` for positioning, plus the usual
   type/title/payload the shared editor writes.
2. **The checklist row** — `nclex_cohort_checklist_items` with
   `source = 'COHORT_ONLY'`, `template_activity_id` → the activity
   above, `is_included = true`, `release_date` = the week-pacing
   default, `due_date` / `close_date` NULL.

> Naming note: `template_activity_id` points at a *cohort-only*
> activity here despite the name — `source = 'COHORT_ONLY'`
> disambiguates. An optional rename to `activity_id` is cosmetic and
> not required.

A cohort-only **block** is one `nclex_programme_blocks` row with
`cohort_id` set and `unit_id` → a template unit. It has no checklist
row of its own (the checklist is per-activity); its visibility rides on
its own `is_published` and the visibility of its child activities.

**The checklist table still stores no ordering** — for template *or*
cohort-only items. It answers only "is it on, and when". Position is a
property of the activity/block row (`ordinal`) — see below.

---

## Ordering — spaced position numbers on the items' own rows

Each unit's blocks + loose activities share **one integer position
number line** (`ordinal`, currently `INTEGER NOT NULL CHECK >= 1`,
**no UNIQUE constraint**; the render breaks ties via
[composeUnitBody](../../lib/curriculum/unit-body.ts): blocks first,
then `created_at`).

- **Template items keep fixed numbers; they are never rewritten from
  inside a cohort.** This is what guarantees other cohorts are
  unaffected.
- A cohort-only item carries its **own** number on its own row.
  Reordering it rewrites only that number.
- The render merges *this unit's template items* + *this cohort's
  cohort-only items* and sorts by number. A cohort-only item can take a
  number that drops it at the top, bottom, or wedged between two
  template items.

**Insertion mechanics (build decision to finalise).** The current
template numbering is tight (1, 2, 3 …), which leaves no integer gap to
slot a cohort-only item *between* two template items. Two robust
options, pick at build:
- **Gap the numbers** — store/treat template ordinals as spaced (e.g.
  10, 20, 30) so cohort-only items land in the gaps (5, 25). A one-time
  re-space preserves order, so it changes nothing any cohort sees.
- **On-demand local renumber** — when no integer gap exists, renumber
  the surrounding items to open one. Must only ever renumber
  *cohort-only* rows, never template rows.

Either keeps the invariant: **template numbers never change relative to
each other for any cohort.** (The existing tie-tolerance + blocks-first
tiebreaker already covers the common cases — top, bottom, between a
block and a loose item — so the gap strategy is the belt-and-braces for
arbitrary placement.)

---

## Rendering

### Tutor — the cohort Curriculum checklist

[`<CohortCurriculum>`](../../lib/cohorts/cohort-curriculum.tsx) renders
template items as today (Unconfigured / Include / Exclude + dates),
now **interleaved with this cohort's cohort-only items**. Differences:

- Each row/block carries a **source pill**: *Template* vs
  *Cohort-only*.
- Template rows keep the **Include / Exclude** segment.
- Cohort-only rows show a **Draft / Live** pill + **Delete** instead.
- Per-unit entry points: **+ Add cohort-only activity** and **+ Add
  cohort-only block** (mirroring the programme-layer Unit Builder's two
  entry points). Cohort-only blocks support **+ Add activity to block**,
  edit, delete, and the usual "a block needs ≥1 activity" rule.

### Student — delivery is nearly free

The student cohort curriculum
([getProgrammeCohortCurriculum](../../lib/curriculum/student-queries.ts))
reads activities **through the checklist** — it shows only activities
with an included checklist row. A cohort-only activity is *born with*
an included checklist row, so it flows through automatically; **loose
cohort-only activities need no student-side change.**

The only student-side change is the **blocks** fetch: it currently
pulls all the programme's (template) blocks; it must widen to also
include this cohort's cohort-only blocks (`cohort_id IS NULL OR
cohort_id = <thisCohort>`). Units: unchanged. To the student, none of
this reads as "cohort-only" — it's just their curriculum, gated by the
exact same existing visibility logic (publish + include + unit/block
published + release).

---

## The discipline cost — queries that must filter by scope

Because a cohort-only activity hangs off a template unit, any query
that selects activities/blocks by `programme_id` *via the unit join*
will pick them up unless scoped. Audit + fix:

- **Programme-layer template editor — must add `cohort_id IS NULL`** so
  cohort-only content never leaks into the shared template editor or its
  counts:
  - [getUnitsForProgramme](../../lib/curriculum/queries.ts) (Units
    Overview counts)
  - [getUnitDetail](../../lib/curriculum/queries.ts) (Unit Builder)
- **Cohort checklist — must scope to `cohort_id IS NULL OR cohort_id =
  <thisCohort>`** on its activities *and* blocks reads, else a
  cohort-only item leaks into **every** cohort's checklist:
  - [getCohortChecklist](../../lib/cohorts/queries.ts) (Wave-2
    activities + blocks reads)
- **Student delivery — widen the blocks read** the same way (above).
- **Any other `nclex_programme_activities` / `_blocks` read** scoped by
  programme: grep-audit at build (e.g. the bank/quiz "used in"
  scans, analytics rollups) and decide per call whether cohort-only
  rows belong.

RLS: cohort-only rows sit under a template unit owned by the tutor, so
the existing owner-scoped write policies should cover tutor CRUD via the
unit→programme chain — **confirm at build**, and confirm the
student-read policy admits cohort-tagged rows for the student's enrolled
cohort.

---

## Out of scope (unchanged deferrals)

- **Live sessions** — own treatment (Live Session Planner).
- **Cohort-only *content overrides*** — editing a *template* activity's
  body for one cohort only. Still explicitly not v1 (main.md). A cohort
  adds and removes; it does not fork template content.
- **Cohort-only units** — the programme owns unit shape.

---

## Build inventory (expected touch-points — confirm at build)

**Migration (one):**
- `cohort_id UUID NULL REFERENCES nclex_cohorts(cohort_id) ON DELETE
  CASCADE` on `nclex_programme_activities` **and**
  `nclex_programme_blocks` (+ supporting indexes; RLS review).

**Server (lib/cohorts/):**
- `actions.ts` — new create / edit / delete actions for cohort-only
  activities + blocks (activity create writes the activity row **and**
  its `COHORT_ONLY` checklist row atomically; born Draft).
- `queries.ts` — `getCohortChecklist` scopes its activities + blocks
  reads and merges cohort-only items into the unit bodies.
- `types.ts` — already has `source`; add the cohort-only row/state
  shapes as needed.

**Server (lib/curriculum/):**
- `queries.ts` — `getUnitsForProgramme` + `getUnitDetail` add
  `cohort_id IS NULL`.
- `student-queries.ts` — widen the blocks read for cohort-only blocks.
- The existing **activity editors are reused as-is**, invoked from the
  cohort surface (point 1's whole payoff).

**UI:**
- `lib/cohorts/cohort-curriculum.tsx` — entry points, source pills,
  Draft/Live + Delete controls, the "not visible yet" nudge.
- `styles/cohorts.css` (or `curriculum.css`) — pill + control styling.

**Untouched:** student routes/experience shape, the programme-layer
Unit Builder UI, admin surfaces.

---

## Slice breakdown (proposed)

1. **Slice 1 — schema + cohort-only loose activities (self-contained
   types).** Migration (`cohort_id` on activities + blocks); RLS review;
   the `cohort_id IS NULL` filter on the programme-layer queries;
   `getCohortChecklist` scoped to this cohort + cohort-only rows merged
   into the unit bodies; create / edit / delete for **Text / PDF /
   External link** loose activities on the cohort Curriculum tab,
   **reusing the existing activity editor** (publish via its existing
   Status tick — default Draft, no forced state, no inline toggle); the
   **soft-warn** when an activity is saved Draft; the editor's **stale
   Draft help-text fix**; new cohort-only activities **append at the
   bottom of their week** (free in-between placement deferred to Slice
   2); student loose-activity delivery verified. (No blocks yet.)
2. **Slice 2 — cohort-only blocks.** "+ Add cohort-only block",
   add-activity-into-block, block edit/delete, ≥1-activity rule;
   student blocks read widened; ordering across blocks + loose for
   cohort-only items (finalise the gap/renumber strategy here).
3. **Slice 3 — reference types.** Extend creation to **Mock +
   Practice quiz** (reuse the quiz picker), then **Library Note +
   Shelf** (reuse their attach modals).
4. **Slice 4 — polish.** Ordering edge cases, nudge/reminder
   refinements, empty/▸states, any analytics rollup that should count
   cohort-only completions.

---

## Related

- [curriculum-authoring-ux.md](curriculum-authoring-ux.md) — screen 11
  (cohort curriculum checklist) is the host surface; its "not built"
  note points here.
- [main.md](main.md) — Curriculum propagation (content propagates,
  structure doesn't; cohort-only is the escape valve).
- [cohort-workspace-fold.md](cohort-workspace-fold.md) — why the cohort
  Curriculum tab now lives inside the programme's Cohorts tab
  (`?cohort=&tab=curriculum`).
- [live-session-planner.md](live-session-planner.md) — the excluded
  `ONLINE_LIVE_SESSION` case; the one-off planner flow reuses the
  cohort-only marker rows designed here.
