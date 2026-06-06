# Tutor Quiz System — Plan

The Mock / Practice Quiz system for tutored programmes. Settled in
the 2026-05-15 planning conversation. Build not yet started.

## 1. Core model

Three layers, kept separate:

- **Tutor quiz** — a reusable quiz *plan*: metadata + an ordered
  list of question *references*. Tutor-owned, reusable across
  programmes and activities.
- **Programme quiz membership** — added 2026-05-16 (see §9). A
  junction layer (`nclex_programme_quizzes`) makes "this quiz is in
  this programme" a first-class concept, fed by activity links
  (auto-mirror) and direct standalone adds. Originally, programme
  visibility was implicit via activity links only.
- **Mock / Practice activity** — a thin pointer. Its payload
  carries `{ quiz_id }`; it owns no quiz content. Saving an
  activity with a `quiz_id` auto-mirrors into the membership
  junction (§9.1).
- **Student attempt** — a frozen *snapshot* of the quiz's
  questions, taken when the student starts.

**The snapshot happens at student attempt creation — never at
quiz creation.** Question edits flow into the quiz right up until
a student starts; once an attempt exists it is frozen and immune
to later edits. The quiz stores references; the attempt stores
the snapshot. (Same model the bank-side `nclex_create_attempt`
already uses.)

The runner is unchanged — a programme-assigned attempt is just an
attempt; the runner consumes it like any other.

## 2. Scope (v1)

- **Standalone questions only.** No cases or trends in v1 quizzes.
  Adding them later is the bank-builder's case/trend selection
  pattern, copied — not a new design.
- **Tutor-authored questions only.** Quiz items reference
  `nclex_tutor_questions`. The shared QAcademy bank is **not** a
  quiz source in v1 — the bank has its own consumption path (the
  self-study Builder); a tutor quiz is the tutor's own material.
- **Both activity types** — Mock and Practice quiz — use the same
  quiz object; `quiz_kind` distinguishes them.

## 3. Schema

### `nclex_tutor_quizzes`

| column | notes |
|---|---|
| `quiz_id` | PK — UUID (`gen_random_uuid()`), matching the structural tables (programmes, units, activities) |
| `tutor_id` | owner; quizzes are tutor-scoped and reusable |
| `title` | |
| `description` | nullable — shown on the quiz list card and (later) the student launch modal |
| `quiz_kind` | `MOCK` \| `PRACTICE` |
| `mode` | one of the **four non-adaptive** runner modes — `UNTIMED_LEARNING`, `UNTIMED_TEST`, `TIMED_FREE_NAV`, `TIMED_SEQUENTIAL`. `CAT` is excluded: it selects each next question adaptively, which is incompatible with a quiz's hand-picked fixed list. The tutor picks the mode; `quiz_kind` sets the editor default |
| `duration_seconds` | nullable — set for timed modes only; the mode↔duration coherence rule is app-layer (the save action), not a DB CHECK |
| `pass_score` | nullable — pass threshold as a `0..1` fraction (same scale as `nclex_attempts.final_score`, so pass/fail is `final_score >= pass_score`); shown as a % in the UI; null = ungraded |
| `max_attempts` | nullable — null = unlimited |
| `status` | `DRAFT` \| `PUBLISHED` \| `ARCHIVED` |
| `created_at`, `updated_at` | |

**`(quiz_kind, mode)` pairing** is a DB CHECK constraint, mirroring
`nclex_attempts_intent_mode_tuple`. `PRACTICE` allows all four modes;
`MOCK` excludes `UNTIMED_LEARNING` (that mode reveals answers live,
which doesn't fit an exam-style mock). Derived from the existing
attempts tuple constraint via `MOCK → EXAM`, `PRACTICE → STUDY`.

**No `intent` column.** `intent` is derived from `quiz_kind`:
`MOCK → EXAM`, `PRACTICE → STUDY`. One source of truth.

### `nclex_tutor_quiz_items`

| column | notes |
|---|---|
| `quiz_item_id` | PK — UUID |
| `quiz_id` | FK → `nclex_tutor_quizzes`, `ON DELETE CASCADE` |
| `position` | order within the quiz (1-based; renumbered by the reorder action) |
| `item_id` | FK → `nclex_tutor_questions`, `ON DELETE CASCADE` (a real FK — tutor-only, so no polymorphism; if a tutor deletes a question it drops out of any quiz referencing it — in-progress/past attempts are unaffected, they hold snapshots) |
| `created_at` | |

`UNIQUE (quiz_id, item_id)` — a question can't be added twice.
The question count is `count(quiz_items)` — not a stored column.

### RLS

Tutor-owned: a tutor CRUDs their own quizzes and items. Students
never SELECT these tables directly — the student read path is the
SECURITY DEFINER launch RPC (§4).

## 4. Attempt creation

New RPC: **`nclex_create_programme_attempt(programme_activity_id)`**.

Unlike the bank's `nclex_create_attempt` (pool selection with
drift), this is a **fixed-list snapshot** — the tutor already
chose the questions. Flow:

1. Read the activity → `payload.quiz_id`.
2. Validate: the activity is OPEN (slice-10.7 `openState`), the
   quiz is `PUBLISHED`, and the student has attempts remaining
   (`max_attempts`).
3. Create the `nclex_attempts` row: `source = PROGRAMME_ASSIGNED`,
   `programme_activity_id` set, `intent` derived from
   `quiz_kind`, `mode` from the quiz, `filters_json = {}` (the
   column is NOT NULL; a fixed-list attempt has no filters).
4. Snapshot the quiz's items — in `position` order — into
   `nclex_attempt_items`. Reuses the existing snapshot machinery.
5. Return `attempt_id`; the student goes to the existing runner.

## 5. Mock / Practice activity

The activity payload stays thin: `{ quiz_id: string | null }`.

- `quiz_id = null` → non-launchable (the current placeholder
  state).
- `quiz_id` set → launchable.

The student-side viewer is a **modal** — it joins the per-type
viewer family from slices 10.2–10.5. It shows the quiz info
(title, question count, timed/untimed, attempts remaining) and a
**Start** button. Start → `nclex_create_programme_attempt` →
navigate to the existing runner.

## 6. Pass mark and attempt limit

Two tutor-set fields:

- **`pass_score`** — threshold for a pass/fail badge on the
  results screen. Nullable (ungraded).
- **`max_attempts`** — how many times a student may attempt the
  quiz; checked at attempt creation (§4). Null = unlimited.

Feedback and review *timing* is not a quiz field — the runner
already governs it by `mode` (UL reveals correctness live;
batched / sequential reveal it at completion; any completed
attempt shows review). A quiz's feedback behaviour *is* its
mode. See §9 for the one case the mode doesn't cover.

## 7. Building a quiz — the tutor editor

The quiz editor (`/tutor/quiz/[id]`) is one page, two side-by-side
columns under a full-width header:

- **Selected questions (left)** — the ordered list that *is* the
  quiz. Reorder with up/down arrows; remove per row.
- **Question picker (right)** — the tutor's own question library,
  *beside* the selected list rather than below it, so the picker
  isn't pushed down the page as the quiz grows. Each column's list
  scrolls on its own. The filter bar covers question type,
  client-needs category, difficulty, and text search. Each row
  shows the stem + type + difficulty + a checkbox; rows already in
  the quiz show as "Added". The tutor filters, checks the
  questions they want, and clicks Add — the picks append to the
  selected list.

The columns stack vertically below a narrow viewport breakpoint.

The picker is scoped to the tutor's **published, standalone**
questions only:
- *Published* — a quiz is built from finished questions. A tutor
  who wants a question in a quiz publishes it first; this avoids
  a "published quiz containing a draft question" inconsistency.
- *Standalone* — `parent_case_id IS NULL AND trend_id IS NULL`.
  Case-children and trend-linked questions are hidden — they need
  the case/trend snapshot machinery, out of v1 scope per §2.

Reuse note: the picker's filter bar reuses the `/tutor/bank/all`
filter vocabulary — the same `.bank-filter-*` styling and the
same classification constants — but as a **4-field subset** (type
/ category / difficulty / search). The bank bar's Status and
Membership selects are omitted: the picker is hard-scoped to
published + standalone, so showing those as forced dropdowns
would mislead. The picker's row list is its own simple checkbox
renderer (the bank list's rows carry *edit* affordances — the
picker needs *add* affordances).

## 8. Build arc

- **Slice 1 — Quiz foundation.** Migration (both tables + RLS).
  The tutor "Quizzes" surface — `/tutor/quizzes` (list) +
  `/tutor/quiz/[id]` (editor) — quiz metadata plus the question
  picker (§7). Removes the stale `/tutor/programme/[id]/mocks`
  placeholder route.
- **Slice 2 — Link to activity.** The Mock / Practice activity
  editor gains "Choose a quiz" — pick from the tutor's
  `PUBLISHED` quizzes; stores `payload.quiz_id`.
- **Slice 3 — Student launch.** The
  `nclex_create_programme_attempt` RPC; the Mock / Practice
  `<ActivityAction>` goes live as the modal viewer (§5); the
  max-attempts check at launch, and the pass/fail badge on the
  results screen.
- **Slice 4 — Progress / analytics.** Quiz completion → activity
  completion → unit/programme progress → tutor analytics.
  Deferred — depends on the student progress engine.

## 9. Programme-level quiz membership

Settled 2026-05-16, after Slices 1-3a shipped. The original model
(§1-§7) only let a student reach a quiz via a curriculum activity
that linked to it. This section extends the model so a quiz can
also be attached **directly to a programme** as a standalone
practice resource — visible to students on a new Quizzes page,
launchable from there with the existing flow. Both placements
coexist: activity-linked quizzes show in curriculum AND the
Quizzes page; standalone quizzes show in the Quizzes page only.

### 9.1 Mirrored junction (single source of truth)

A new table `nclex_programme_quizzes` becomes the **canonical**
record of "what quizzes are in this programme." Two write paths
feed it:

- **Activity link → auto-mirror.** When the tutor saves an
  activity with a `quiz_id` set (existing flow from Slice 2), the
  same server action upserts into the junction
  (`ON CONFLICT DO NOTHING`). The activity-link IS a placement
  within the programme; the junction records the membership.
- **Standalone add via Quizzes page.** Tutor explicitly picks a
  quiz to attach to the programme without making it an activity.

Either path makes the quiz available standalone via the student
Quizzes page (§9.5). The activity-link path additionally surfaces
it in the curriculum (existing behaviour, unchanged).

### 9.2 Schema

`nclex_programme_quizzes`:

| column | notes |
|---|---|
| `programme_id` | FK → `nclex_programmes`, `ON DELETE CASCADE`; part of composite PK |
| `quiz_id` | FK → `nclex_tutor_quizzes`, `ON DELETE CASCADE`; part of composite PK |
| `added_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` — tutor-side default sort key |
| (PK) | `(programme_id, quiz_id)` — naturally enforces idempotency |

**No `display_order`** in v1 — default order is `added_at DESC`
(or alphabetical by quiz title — pick during build, cheap to
revisit). Reorder lands if a tutor asks.

**No `linked_via_activity_id` column.** Whether a quiz is also
activity-linked in this programme is derived at read time via a
LEFT JOIN to `nclex_programme_activities` (filtered to this
programme + this `quiz_id`). Stays consistent automatically; one
fewer write path. Drives the "Linked to Week N" / "Standalone"
hint on tutor + student row UIs.

### 9.3 Membership rules

**Adding** — two paths into the junction (above). Both idempotent
via `ON CONFLICT DO NOTHING`.

**Removing — block, don't cascade.**
- "Remove from programme" on the Quizzes page **rejects** when the
  quiz is still linked to one or more activities in this programme,
  with a clear error: *"This quiz is linked to N activity/activities
  in this programme. Unlink it from those activities first."* The
  tutor unlinks from activities, then can remove.
- Unlinking from an activity (setting `payload.quiz_id = null`)
  does **NOT** auto-remove from the junction — the quiz might still
  be useful standalone or linked to other activities. The junction
  row stays until the tutor explicitly removes it from the Quizzes
  page.
- Hard-deleting the quiz or programme cascades through the FKs
  (junction row goes away).

This shape keeps the junction as source of truth while preventing
the curriculum side from being silently broken by a programme-side
removal.

### 9.4 Tutor surface

Three tutor-side touch points: the new programme Quizzes page,
the two ways quizzes get added to a programme from there, and a
small back-reference on the global quizzes list.

**The programme Quizzes page** — `/tutor/programme/[id]/quizzes`.
Lists every quiz attached to this programme. Each row: title, kind
(Mock / Practice), mode, question count, status badge (Draft /
Published / Archived), a small **"Linked to Unit N"** /
**"Standalone"** source hint derived from the activity JOIN
(§9.2), per-row "Remove" button subject to the §9.3 block rule.
(Slice 5 build used "Unit N" — matches the curriculum
`nclex_programme_units` schema. Student surface in Slice 6 follows
the same.)

**Sidebar item** — programme-detail nav gains **Quizzes** between
Curriculum and (when it lands) Analytics. One-line edit in
`lib/nav/tutor.ts`.

#### 9.4.1 Two ways to add a quiz

The page surfaces both creation paths side-by-side (e.g., one
"Add existing" button + one "New quiz" button at the top of the
list).

- **Add existing** — modal or inline dropdown listing the tutor's
  own PUBLISHED quizzes not already in this programme. Optional
  kind filter (All / Mock / Practice). Multi-select with an Add
  button; idempotent inserts into the junction.
- **New quiz** — opens the existing quiz editor (`/tutor/quiz/[id]`,
  Slice 1) for a fresh quiz. The quiz lives in the global
  `nclex_tutor_quizzes` table the same as any other tutor quiz
  (appears on `/tutor/quizzes` immediately), AND is auto-inserted
  into the current programme's junction in the same transaction
  as the create. The tutor lands in the editor with the quiz
  already "in this programme" — when they finish authoring and
  publish, it's launchable for students.

The two paths cover the two natural tutor mindsets: *"I have a
quiz, put it in this programme"* and *"I'm building a quiz for
this programme."* Either way the junction is the source of truth;
the global quiz list and the programme membership stay in sync.

(Why the picker stays PUBLISHED-only while New-quiz creates a
DRAFT: the picker is for adding **already-finished** quizzes —
DRAFT quizzes are mid-authoring and pulling one into a programme
mid-edit risks accidental student exposure. New-quiz creates the
DRAFT *for* this programme — intent is explicit, the tutor stays
in the editor to finish it.)

#### 9.4.2 Global Quizzes list — programme membership badge

`/tutor/quizzes` (the existing global list) gets a small
**"Used in N programmes"** chip per row, derived from
`COUNT(*) FROM nclex_programme_quizzes WHERE quiz_id = X`.
Counts zero quizzes that aren't attached anywhere ("Not in any
programme yet"); count-only in v1, click-to-expand for the
programme names lands when a tutor asks. Lets the tutor see at a
glance which quizzes are reused and which are orphans.

(Forward-compat: when bank quizzes / cross-product quiz reuse
ship, the same chip extends naturally — `"Used in 2 programmes,
1 readiness pack"`.)

### 9.5 Student surface

- **New page** — `/student/programme/[id]/quizzes` +
  `/student/cohort/[id]/quizzes`. Lists every quiz in the
  programme's junction (single query — junction IS the source of
  truth; activity-linked quizzes are already in there per §9.1).
- **Row content** — title, kind pill (Mock / Practice), state
  pill from the progress-engine cascade (Done / In progress /
  Up next / Not started), "Attempt N of M" (reusing the data
  from progress-engine Slice 4b), pass mark hint when set,
  primary action (Start / Resume / Take again / disabled when
  exhausted). Optional small **"Linked to Unit 3"** /
  **"Standalone practice"** hint derived from the activity JOIN.
- **Filters** — by kind (All / Mock / Practice), by state (default
  All; "Not started only" is the most useful narrow). Activity-
  filter dropdown can land later if multi-programme demand grows.
- **Launch flow** — reuses the existing `<QuizLaunchViewer>`
  modal + `nclex_create_programme_attempt` RPC. **No new launch
  surface.** The RPC currently takes a `programme_activity_id`;
  for standalone quizzes that's `null` (or the RPC gets a sibling
  for direct-quiz attempts — build-time call).
- **Sidebar item** — student programme + cohort detail navs gain
  **Quizzes** between Curriculum and Quiz History. One-line edits
  in `lib/nav/student.ts`.

### 9.6 RLS

`nclex_programme_quizzes`:
- **Tutor own** (FOR ALL) — `EXISTS (SELECT 1 FROM nclex_programmes
  WHERE programme_id = junction.programme_id AND tutor_id = auth.uid())`.
- **Student select** (FOR SELECT) — readable when the parent
  programme is PUBLISHED. Permissive v1; tightens to enrolled
  students when the enrolment slice ships.
- **SUPER_ADMIN bypass** — the intentional v1 pattern.

`nclex_tutor_quizzes` gains a **new student-read policy**:
- **Student select** (FOR SELECT) — readable when the quiz is
  PUBLISHED AND attached (via the junction) to a PUBLISHED
  programme. The student Quizzes page reads quiz metadata
  (title, kind, mode, pass_score, max_attempts) directly from
  this table; the policy makes that legal without funnelling
  through a SECURITY DEFINER RPC.

### 9.7 Attempt semantics for standalone quizzes (settled — B)

The existing `nclex_create_programme_attempt` RPC keys attempts
to a `programme_activity_id` — that's how `max_attempts` is
enforced (per-(student, activity), counting attempts on that
activity). For a **standalone** quiz with no activity, the natural
question: how is the cap counted?

Three plausible shapes:
- **A — per-(student, quiz) globally** across all standalone
  attempts of this quiz (and across all programmes that include
  it). Simplest interpretation of "max_attempts" as a quiz-level
  property.
- **B — per-(student, quiz, programme)** so the cap resets when a
  quiz is added to a different programme. Most flexible; matches
  the "the programme owns the relationship" framing.
- **C — uncapped** for standalone, capped only for activity-linked.

**Settled 2026-05-16: B** — per-(student, quiz, programme). Cap
resets when a quiz is added to a different programme. Keeps the
quiz reusable across programmes without surprising the student
(taking it in Programme A doesn't burn their attempts in
Programme B). Requires the RPC sibling to take a `programme_id`
arg. Ships in Slice 6 (student surface); Slice 5's tutor-side
build doesn't depend on this.

### 9.8 Build arc (extends §8)

- **Slice 5 — Programme-level quiz membership (tutor surface).**
  Migration (junction table + RLS policies on both junction and
  `nclex_tutor_quizzes`). Auto-mirror added to the existing
  activity-save server action. New `/tutor/programme/[id]/quizzes`
  page with two add paths — picker for existing PUBLISHED quizzes,
  "New quiz" creation that auto-attaches (§9.4.1) — plus
  per-row remove (block-remove rule). Sidebar item.
  `/tutor/quizzes` gets the "Used in N programmes" chip per row
  (§9.4.2).
- **Slice 6 — Student Quizzes page.** Junction-driven listing on
  `/student/programme/[id]/quizzes` + `/student/cohort/[id]/quizzes`.
  Sidebar items. Reuses the existing `<QuizLaunchViewer>` modal +
  launch RPC (with the §9.7 sibling RPC if standalone attempts
  ship in this slice — otherwise defer standalone attempts to a
  follow-up).

(Tutor analytics — the original §8 Slice 4 — still gates on
enrolment; unaffected by this arc.)

### 9.9 Cohort-level quiz divergence (future, captured 2026-05-16)

Settled 2026-05-16 while building Slice 5: a tutor running two
cohorts of the same programme will eventually want to vary the
quiz set per cohort — different mock for Cohort B than Cohort A,
or a cohort-unique practice quiz that doesn't belong in the
programme template. This section captures the trajectory and the
three implementation options; the **specific shape is chosen at
build time**, not now.

**Settled now:**
- Cohort sidebar gains a **Quizzes** tab between Curriculum and
  Sessions (symmetric with the programme sidebar).
- The cohort Quizzes view at `/tutor/cohort/[id]/quizzes` shows
  the parent programme's quizzes + any cohort-unique additions.
- Student cohort Quizzes page reads the same cohort-effective
  list; self-paced (no-cohort) student programme quizzes keeps
  reading `nclex_programme_quizzes` directly.

**Open at build time — three options compared.**

The choice turns on whether per-cohort quiz **scheduling**
(`release_date`) or per-cohort **include/exclude** will ever
land. The 9.3f activity checklist exists because both genuinely
vary for activities. For quizzes, neither is settled.

**Option A — Additive-only.** `nclex_cohort_quizzes` holds ONLY
cohort-unique adds (no row per programme-inherited quiz). Cohort
view = `nclex_programme_quizzes` (parent programme) UNION
`nclex_cohort_quizzes` (cohort-unique). Subtraction not
supported. Per-cohort scheduling requires re-architecture.
Cheapest to build; closes off both future paths.

**Option B — Full checklist.** Mirrors `nclex_cohort_checklist_items`.
One row per (cohort × parent-programme-quiz), seeded by AFTER
INSERT triggers on `nclex_cohorts` and `nclex_programme_quizzes`,
plus rows for cohort-unique adds. Source-discriminated (PROGRAMME
vs COHORT_ONLY). `is_included BOOLEAN` toggle exposed in UI from
day one. Per-cohort scheduling = one nullable `release_date`
column away. Most upfront work; most extensible.

**Option C — Hidden checklist (Option B architecture, Option A
UI).** Same DB shape as B (one row per cohort × quiz, seeded by
triggers), but v1 UI is additive-only — no inclusion toggle, no
scheduling. The row exists silently. When subtraction or
scheduling lands, the UI surfaces the existing column;
zero re-architecture. Middle cost; preserves both future paths.

Trade-off summary:

| Option | v1 surface | v1 cost | Future subtraction | Future per-cohort dates |
|---|---|---|---|---|
| A | Simple | Lowest | Re-architect | Re-architect |
| B | Toggle visible | Highest | Already there | Add one column |
| C | Same as A | Medium | Surface existing toggle | Add one column |

**Decision deferred.** The build slice picks A / B / C based on
how confident we are that per-cohort scheduling or subtraction
will land. If neither feels likely → A. If either feels likely →
C is the cheapest insurance. B only if we want to surface
include/exclude on day one.

**Build trigger.** Slice fires when a real tutor asks for one of:
- A cohort-unique quiz that shouldn't be in the programme
  template.
- A quiz the tutor wants to skip for a specific cohort.
- A quiz that should release on different dates for different
  cohorts of the same programme.

### 9.10 Not in v1 (this section)

- **Reordering** the programme's quiz list (no `display_order`
  column).
- **Per-programme override of quiz settings** (e.g., a quiz could
  have different `max_attempts` in different programmes). v1 uses
  the quiz's own settings everywhere except the per-programme
  attempt-cap scope from §9.7.
- **Per-programme scheduling for standalone quizzes** (release /
  close dates like activities have). Always-available once the
  programme is published / the cohort starts. Can add later as
  columns on the junction.
- **Tutor adding shared QAcademy bank quizzes to a programme** —
  for now, only the tutor's own quizzes. The bank stays its own
  consumption path (§2).
- **Reordering rules between activity-linked and standalone** on
  the student page (e.g., "activity-linked first, then
  standalone"). Single sort axis in v1; group/section the list
  if a tester struggles to scan it.

## 10. Not in v1

- Cases and trends as quiz content.
- The shared QAcademy bank as a quiz source.
- **Locking review of a completed attempt until the cohort close
  date** — exam-integrity gating, so a student who finishes early
  can't leak the answer key. The runner's `mode` doesn't cover
  this, but it is *not* a per-quiz setting (a quiz is reusable
  across cohorts). If it ever lands, it belongs on the cohort
  checklist row next to `close_date`, not on the quiz.
- Dynamic / rule-based question selection (e.g. "10 random from
  Pharmacology"). v1 is manual selection only.
- Slice 4 (progress / analytics integration).

## 11. Creation-flow hardening (2026-06-06)

A review-and-polish pass over the quiz **creation flow** itself (list
page · editor · lifecycle), after Slices 1–6 shipped. All app-layer —
**no migration, no schema change**. Merged to `main`. Lives in
`lib/tutor-quiz/`.

- **Publish gate (≥1 question).** A `PUBLISHED` quiz must always hold at
  least one question. Enforced server-side in `updateQuizAction` /
  `setQuizStatusAction` (block publishing an empty quiz) AND
  `removeQuizItemAction` (block removing the last question from a
  published quiz). Mirrors the bank's publish-integrity gates.
- **Lifecycle controls on the editor header.** The buried 3-way Status
  dropdown is replaced by explicit controls: **Publish** (Draft, gated on
  ≥1 question) · **Unpublish** + **Archive** (Published) · **Restore to
  draft** (Archived). New `setQuizStatusAction` (focused setter) +
  `quizUsageAction` (programme count + activity links). Leaving Published
  — Unpublish, or Archive while published — for a quiz that's **in use**
  (live in programmes / linked to activities) **warns first** (students
  lose launch access) then proceeds; never blocks. The meta modal's
  Status field is gone (one source of truth per action).
- **Delete a quiz (block, don't cascade).** New `deleteQuizAction` +
  `quizDeletePreflightAction`. Deletion is **blocked** while the quiz is
  linked to any curriculum activity (the §9.3 rule applied quiz-wide) —
  the blocked dialog lists each programme · unit · activity. When clear,
  a type-to-confirm dialog shows a "student results are kept" reassurance
  (standalone attempt count). On delete: quiz-item refs + standalone
  programme memberships cascade away; **student attempts survive** (their
  snapshots are inlined; the `nclex_attempts.quiz_id` back-pointer nulls
  via `ON DELETE SET NULL`). Reachable from a danger zone in the shared
  edit modal — so from both the card pencil and the editor.
- **Kind-switch block.** A Mock activity must link a Mock quiz
  (Practice↔Practice). Switching a linked quiz's **Kind** is blocked
  (only when the Kind actually changes) while it's linked to activities
  of the other type — the same blocked-activities dialog. Closes the
  one hole the link-time picker can't (it only checks at link time).
- **"Needs questions" readiness cue.** A small amber tag on
  `/tutor/quizzes` cards for a Draft with 0 questions — the one quiz
  state that's a genuine "not usable yet" signal.
- **Quick-edit pencil on quiz cards.** Edit a quiz's metadata from the
  list (opens the shared `QuizFormModal`) without entering the editor.
- **Rich question-picker filter.** The editor's "Add questions" picker
  filter was upgraded from a 4-field GET-form to a **live-apply, faceted
  toolbar** modelled on the bank list (NOT shared — a tailored copy in
  `lib/tutor-quiz/quiz-picker-query.ts` + `quiz-picker-filters.tsx`):
  multi-select facets (Type · Category · Subcategory · Nursing subject ·
  Body system · Difficulty · Bloom · Tag — OR within, AND across) + a
  **scoped search** (one term across chosen content columns: Stem ·
  Instruction · Rationale · Topic · Subtopic) + active chips. Still
  hard-scoped to the tutor's published, standalone questions (so no
  Status / Membership facet). The shared blocking-activities dialog
  (`ActivityBlockedDialog`) backs both delete + kind-switch.

**Next:** a Claude-Design visual pass over the quiz **list page** and the
**editor** surfaces — built as §12 below.

## 12. UI uplift — Claude Design (2026-06-06)

A visual redesign of the quiz **list** (`/tutor/quizzes`) and **editor**
(`/tutor/quiz/[id]`) from Sam's Claude Design "Quiz UI Uplift" handoff —
**Option A** (List A refined card grid + Editor A refined two-column
workbench), concept-not-source. **All app-layer, no migration. Merged to
`main`.** New `lib/tutor-quiz/quiz-icons.tsx` (inline line-icon set);
CSS appended to `styles/quiz.css` as an uplift block (tokens only, no new
hues).

- **List — cards.** Kind-coloured left edge (Mock=amber / Practice=indigo),
  a kind tag + status dot-pill, a "Needs questions" flag, a bordered
  footer tray with icon meta (questions · mode·duration) + the
  used-in-programmes chip, elevation + hover lift.
- **List — page header + stat strip + toolbar.** Eyebrow + larger title;
  a 4-cell summary strip (Total · Published · In-progress · Questions
  used); a toolbar (search · All/Published/Drafts segments · Kind filter ·
  Sort) — all client-side over the existing `QuizListRow[]`, search
  reaches archived too.
- **List — card ⋯ menu.** Replaces the edit pencil with a full-lifecycle
  dropdown (Edit details · Publish/Unpublish · Archive/Restore · Delete) —
  pure composition over the existing actions + dialogs, so a tutor manages
  a quiz without entering the editor. The in-use `LeavePublishedWarning`
  was extracted to a shared module (editor header + card menu).
- **Editor.** Header card with kind tag + labelled stat chips (Mode /
  Duration / Pass / Attempts); rounded/elevated zones with separated
  headers + a "N programmes" badge; item rows gain a visual drag grip
  (reordering stays ↑/↓) + difficulty dots + SVG icon buttons; picker rows
  show a teal `is-checked` selection state.
- **Picker hover-peek.** Hovering a picker question's (still 2-line-clamped)
  stem opens a body-portaled, viewport-aware popover with the **full stem +
  classification** (Category · Subcategory · Subject · Body system · Topic ·
  tags) — vet a question without opening it. Reuses the bank's generic
  `HoverPeek` primitive; `getPickerQuestions` fetches the extra
  classification columns.

**Deliberately deferred:** the grid/table view toggle (List B table view)
and real drag-and-drop reordering (the grip is visual-only) — both noted
in the handoff, neither built.
