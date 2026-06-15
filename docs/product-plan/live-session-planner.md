# Live sessions — template marker + cohort planner

*Design agreed with Sam 2026-06-06, deepened + open decisions resolved
2026-06-14, completion model + curriculum-placement finalised 2026-06-15.
Status: **Slices 1 + 2 BUILT + MERGED to `main` 2026-06-15** (Sam-tested on
dev) — the marker/planner split, the integrity "needs scheduling" cue, and
the one-off "+ Add session" flow. **NOT yet released to prod** (carries
migration `20260703120000`). **Slice 3 — attendance → derived completion —
is the confirmed next slice.** Timing (Sam, 2026-06-08): it lives mostly on
the cohort side.*

Part of the `mynclex/docs/product-plan/` set. Hosts on the cohort
**Sessions** tab (kept as a placeholder by the cohort-workspace fold for
exactly this — see
[cohort-workspace-fold.md](cohort-workspace-fold.md)). Sibling to
[cohort-specific-activities.md](cohort-specific-activities.md) — the two
mechanisms are complementary (one-off *lesson* → cohort-only activity;
one-off *live session* → planner).

---

## The conflict

A live session is the **one activity type whose data isn't shareable
content.** Every other type (Text, PDF, External link, Mock, Practice
quiz, Library Note, Shelf) is genuine authored content — identical for
every cohort. A live session's **date, join link, and recording are
per-run**: each intake meets at its own time, on its own link, with its
own recording.

Today all of that is stored on the **programme-template** activity
payload (`ActivityPayloadOnlineLiveSession` in
[lib/curriculum/types.ts](../../lib/curriculum/types.ts) —
`scheduled_at` / `duration_minutes` / `join_url` / `recording_url`). So
every cohort shares one time/link/recording, which is wrong: a template
authored months ago shows a stale time, the tutor Home "This week" block
([getUpcomingSessions](../../lib/home/tutor/home-queries.ts)) reads
wrong, and the student viewer
([online-live-session-viewer.tsx](../../lib/curriculum/online-live-session-viewer.tsx))
shows the stale time. It's the single exception to "template = shared
content."

## Why it happens — a live session is an *event*, not content

Modelling it as an activity was a category mismatch. A live session is
three things wearing one coat:

- **Before** → a *calendar event* ("be here Thursday 7pm, here's the
  link").
- **During** → happens entirely outside the app (Zoom / Meet).
- **After** → the *recording*, which **is** content (an async video).

It legitimately has an activity-like **position** in the curriculum (a
block anchors around it: pre-read → live call → post-quiz), but its
**nature** was never "content." The fix separates the two: keep its
curriculum position as a marker; move its event nature to a per-cohort
planner.

---

## The design (three levels)

### 1. Programme / template — the live session as a MARKER

The live session stays an activity **type**, but holds only:
- **title / topic**
- its **position** in the curriculum (which unit/week, which block)
- an optional **typical duration** hint ("our tutorials run ~90 min" —
  a *design* property, shared across cohorts)

**No date, no link, no recording.** The tutor authors the *rhythm*
once; students see "Week 3 has a live call"; build-once is preserved.

### 2. Cohort — the Live Session Planner

A per-cohort surface (the cohort **Sessions** tab) that holds the per-run
reality: **date/time · join details · recording (after).** One schedule
per marker. The tutor Home "This week" block and the student viewer read
from the **planner**, never the template.

### 3. V2 — a managed sessions system (add-on)

A future, larger feature: cross-cohort **calendar**, automated
**reminders/emails**, **Zoom/Meet API integration** (auto-create
meetings, auto-pull recordings), **attendance** tracking, a searchable
**recordings library**, reschedule/cancel notices. Built so it *extends*
the thin planner's data (same rows, enriched) rather than replacing it.
**Attendance is pulled forward as a near-term follow-on — see below.**

---

## How the planner links to the marker

A small cohort-keyed table, the same shape as the cohort checklist's
`(cohort, activity) → dates`:

```
nclex_cohort_live_sessions            (name TBD)
  cohort_id           → nclex_cohorts
  marker_activity_id  → nclex_programme_activities  (the live-session marker)
  scheduled_at, duration_minutes(optional override), recording_url
  + connection fields (see "Session editor rework" below)
  created_at, updated_at
  UNIQUE (cohort_id, marker_activity_id)
```

Keyed on **(cohort_id, marker_activity_id)**. The planner reads all
live-session markers in the curriculum (from the template) and joins each
to its schedule (by activity id). **A marker with no planner row =
"unscheduled" for that cohort.**

The title/topic + typical duration always come from the **marker**; the
planner row only adds the per-run *when / where / recording*.

---

## One-off (cohort-specific) sessions — Option B

A bonus session for just one intake is added **directly in the planner**
("+ Add session"), in **one step** — title + which week + date/link.
Behind the scenes that **auto-creates a cohort-only marker** (the
mechanism from [cohort-specific-activities.md](cohort-specific-activities.md):
a `cohort_id`-tagged `nclex_programme_activities` row of type
`ONLINE_LIVE_SESSION`, no schedule payload) **plus** the planner schedule
row — so the session appears in that week's curriculum *in context* and
on the sessions list, exactly like a designed session.

**The tutor never does double entry.** Marker creation is invisible.
And note: tutors do **not** pick "live session" in the cohort-only
*activity picker* — the planner owns live-session creation end to end;
the cohort-only *row* is an implementation detail.

**Symmetry (the two directions of one rule):**
- *Designed session:* marker exists (template, inherited) → tutor fills
  the schedule per cohort.
- *One-off session:* tutor creates the schedule → system fills the
  (cohort-only) marker.

Either way you end with **marker + schedule = a complete session.**

---

## Integrity rule — an included marker needs a schedule

A live session is two halves; neither alone is deliverable. So:

**If a session marker is included (and visible) for a cohort but has no
scheduled planner row, that's an incomplete state** — students would be
told a call exists with no date or link.

- **Soft-warn, never hard-block.** The tutor may include now and
  schedule later, but it's flagged: a **"needs scheduling →"** cue on the
  checklist row (links to the Sessions tab) and the marker shown as
  **unscheduled** in the planner. (Same philosophy as the cohort-only
  "not visible yet" nudge and the bank publish-integrity gates.)
- **"Scheduled / done" = has a date + join details.** The **recording**
  is *not* required — it's filled after the session airs.
- **Student fallback:** an included-but-unscheduled session shows as
  **"Date to be announced,"** never broken.

Bidirectional: the **checklist** warns "needs a time"; the **planner**
is where you resolve it.

---

## Completion — only *verified* completion counts (the governing rule)

*Finalised with Sam 2026-06-15.* The earlier framing ("a live session
doesn't count toward progress") was really a special case of one constant
rule:

> **Only *verified* completion counts toward a student's progress.**

That same rule already governs every existing activity type — it's just
applied to whatever trustworthy signal each type has:

- **Quizzes** → verified by a submitted attempt. A DB trigger writes the
  progress row, and the manual "mark done" action is *rejected* for quiz
  types, so a done-with-zero-attempts quiz can't exist.
  `completion_source = 'QUIZ_ATTEMPT'`.
- **Readings / PDFs / links** → low-stakes, nothing to game, so the
  student's own tick is accepted. `completion_source = 'MANUAL'`.
- **Live sessions** → the only signal available *in v1* is student
  self-report of attendance, which is **not verifiable** → so a live
  session **does not count toward progress in v1**, and renders **without
  a done-checkbox** (it's an event, not a task).

**This is not a position we later reverse — the evidence arrives in
stages.** A live session is excluded today because there is *nothing to
verify yet*, not because a live session is philosophically "not progress."
The moment a verifiable signal exists (tutor-marked attendance — below),
the *same* rule pulls live sessions *into* the progress picture.

**What we deliberately do NOT build:** a student self-mark for live
sessions (the optional "I attended" bookmark was considered and dropped).
It's the one *fake* signal, and deriving completion from real attendance
supersedes it. Concretely, this build **removes `ONLINE_LIVE_SESSION` from
`MANUAL_TYPES`** in [lib/progress/actions.ts](../../lib/progress/actions.ts)
(today it is incorrectly there) — and we never add it back; attendance
arrives as a *derived* source instead.

### Attendance → derived completion (CONFIRMED: the NEXT slice)

*Confirmed by Sam 2026-06-15 — attendance is the next slice after the
marker/planner split.* Live-session completion will be **derived from
tutor-marked attendance**, exactly the way quiz completion is derived from
a submitted attempt:

- A new `completion_source = 'ATTENDANCE'` on
  `nclex_student_activity_progress`. The table already carries the
  `marked_by` + `attempt_id` columns, built in anticipation of
  non-self-marked completion (*"v1 always self-marked"*) — so the seam
  exists.
- When the tutor marks a student **present**, a derived progress row is
  written for that `(student, live-session activity_id)`. Like quizzes,
  the manual action stays rejected, so **fake self-marking is impossible**.
- This is *why we keep the marker in the curriculum* (see the next
  section): deriving completion into the progress engine needs the
  `activity_id` bridge, which only exists because the live session stays
  an activity. The two decisions reinforce each other.

**Bonus the verified signal unlocks — the *incomplete* state also becomes
meaningful.** With self-report, an unticked session is noise ("they
forgot"). With tutor-marked attendance, an **absent** student genuinely
shows the session incomplete — *"missed the Week 3 tutorial"* — a real
engagement signal the tutor wants. So deriving from attendance makes both
the done **and** the not-done state honest.

**Parked for the attendance slice (decide at build, not now):**

- *Missed-live-but-watched-the-recording* — does the recording count as
  completion? Lean **no** for the first attendance pass (only verifiable
  live presence counts; the recording is a catch-up resource). Revisit
  only if/when we track video plays (the V2 recordings library).
- *Denominator timing for an un-held session* — an upcoming session that
  hasn't happened yet shouldn't drag a student's % down before it occurs
  (it isn't completable yet). Settle the exact treatment (akin to a
  not-yet-due item) when building attendance.
- *How attendance is captured* — tutor-marked (manual, ships with no
  integration) first; integration-pulled (Zoom API) is later V2.

---

## Session editor rework

> **▶ CAPTURE (Sam, 2026-06-14): the session editor needs reworking.**

- **The marker editor is fine** — title + week position (+ typical
  duration) is all it needs.
- **The schedule/planner editor must be reworked.** The current single
  `join_url` field is insufficient: real meetings often use a **meeting
  ID + passcode**, not just a click-through link (Zoom in particular;
  Meet/Teams use a bare link). The planner schedule should capture
  richer **connection details**, proposed:
  - **platform** (Zoom / Google Meet / Microsoft Teams / Other)
  - **join URL** (click-to-join link)
  - **meeting ID** (optional)
  - **passcode** (optional)
  - optional free-text **joining instructions** (catch-all: dial-in,
    waiting-room notes, etc.)

  Exact field set finalised at build; the student viewer + tutor Home
  "This week" render from these.

---

## Touch-points (expected — confirm at build)

**Migration:**
- New `nclex_cohort_live_sessions` table (+ RLS scoped to the cohort's
  owning tutor for writes; student-read scoped to enrolled cohort).
- **Gut** `ActivityPayloadOnlineLiveSession` down to the marker
  (drop `scheduled_at`/`join_url`/`recording_url` from the template
  payload; keep/relocate `typical_duration`). Migrate any existing dev
  live-session schedules into planner rows, or accept dev-data reset.

**Server:**
- New planner queries + actions (`lib/cohorts/` — set/clear schedule,
  add one-off → creates cohort-only marker + planner row atomically).
- `getCohortChecklist` — surface the "needs scheduling" state for
  included-but-unscheduled markers.
- `lib/home/tutor/home-queries.ts` `getUpcomingSessions` — read from the
  planner; `HomeSession` gains `cohortId`; re-point the tutor Home "This
  week" link to `/tutor/programme/[id]/cohorts?cohort=&tab=sessions`
  (a TODO already marks the link site).
- `lib/curriculum/student-queries.ts` + viewer — read schedule from the
  planner; "Date TBA" fallback; render as an event (no done pip; not in
  completion denominator).

**UI:**
- The cohort **Sessions** tab (currently a placeholder) becomes the
  planner: list of markers with schedule/unscheduled state, the reworked
  schedule editor, "+ Add session" for one-offs.
- The template marker editor trimmed to title + week (+ typical
  duration).

**Untouched:** the shared-activity bridge (progress / quiz attempts /
library attachments) — small blast radius by design.

---

## Slice breakdown

1. **Slice 1 — marker/planner split + schedule. ✅ BUILT (1a + 1b).**
   *1a* — live sessions treated as events: removed from the completion
   denominator + the "Up next" pointer + the manual-mark types, no done
   pill (a neutral 📅 Event chip instead), matched in the tutor cohort
   analytics. *1b* — migration `20260703120000` (new `nclex_cohort_live_sessions`
   table + RLS; gut the payload to a `typical_duration_minutes` marker;
   self-paced live sessions removed — tutor-led only, blurred in the
   picker); the Sessions tab planner + reworked schedule editor (platform /
   join URL / meeting ID / passcode / instructions); student viewer + tutor
   Home read from the planner with "Date to be announced" fallback.
2. **Slice 2 — integrity + one-offs. ✅ BUILT.** "Needs scheduling →" cue on
   the cohort checklist (links to the Sessions tab; advisory). "+ Add
   session" one-off flow (Option B — atomic: cohort-only marker + schedule
   in one validated step) + "Remove" for cohort-only sessions. Live sessions
   also added to the **cohort-only curriculum picker** as a marker (the
   symmetric second entry point — add now, schedule later via the cue).
   Forgiving URLs (auto-`https://`).
3. **Slice 3 — attendance → derived completion (CONFIRMED next, 2026-06-15).**
   Tutor-marked attendance (manual, no integration) writes a derived
   `ATTENDANCE` completion row for present students; live sessions
   re-enter the progress picture under the "only verified completion
   counts" rule, and an absence reads as a real "missed it" signal. Settle
   the parked questions here (recording-watched, un-held-session
   denominator timing).
4. **V2 — managed sessions system.** Calendar, reminders, integrations,
   recordings library, attendance via API.

> **▶ CAPTURE (Sam, 2026-06-15): the STUDENT side needs a dedicated Sessions
> (+ attendance) page.** Today a student only meets live sessions scattered
> through the curriculum weeks (the 📅 Event rows). They need a single
> student-facing **Sessions** surface — a list / calendar of *their* live
> sessions across the whole programme: **upcoming** (date + join details) and
> **past** (recording), read from the per-cohort planner. Once attendance
> (Slice 3) exists, the same page shows the student their own **attendance
> record** per session. It's the read-only, personalised mirror of the tutor
> Sessions tab. Build as its own slice — likely **alongside or just after
> Slice 3** (attendance), since the two share the surface. NOT yet built.

---

## Sibling — pricing is the same pattern (separate, later)

Sam spotted that **price is also per-run data stuck on the template**:
currency on `nclex_programmes.price_currency`, amounts/plans on
`nclex_programme_payment_strategies` (keyed `programme_id`, no
`cohort_id`); **a cohort has no price**. So a tutor can't price two
concurrent cohorts differently or run early-bird/price-rises — a real,
common need. Less urgent (past payments are snapshotted in
`nclex_payments`, so no corruption; sequential intakes work by editing
the programme price between them). Resolve later as a **cohort-level
price override of the programme default** — same philosophy, separate
work. Canonical home:
[payments-and-enrolment.md](payments-and-enrolment.md).

---

## Why NOT move live sessions out of the curriculum entirely (settled 2026-06-15)

Considered: drop the marker too, so live sessions touch the curriculum
**not at all** — they'd live wholly on the Sessions tab as a standalone
calendar. Tempting (total separation; the progress question vanishes by
construction; less to build). **Rejected** because a MyNclex tutored
programme is built around *"pre/post tutorial tasks"* — the live tutorial
is the **anchor of the week**, with pre-work and post-work arranged around
it (pre-read → live call → post-quiz). Ripping it out of the curriculum:

- leaves a **hole in the week** — the student opens Week 3, sees a
  pre-read and a post-quiz with the call missing, and must mentally stitch
  the Thursday call from another tab into the sequence;
- **hurts discoverability** — students live in the curriculum; a separate
  tab is easy to ignore;
- **loses the template backbone** — the tutor can no longer author the
  rhythm once ("every Week 3 has a live tutorial") and just schedule it
  per cohort; each intake's sessions become ad-hoc re-entries.

The marker model already moves *all the per-run data* out (to the Sessions
tab) while keeping a lightweight pointer in the curriculum — so the student
sees the call **both** inline in the week **and** in the consolidated
Sessions list. Moving out completely keeps only the second. It also keeps
the `activity_id` bridge that derived attendance-completion depends on (see
the Completion section). **Caveat:** this holds because MyNclex tutorials
are scheduled, syllabus-woven sessions. If a tutor's live sessions were
instead incidental drop-in / office-hours calls with no curriculum
position, a standalone calendar would be the better fit — not the v1
assumption.

## Why NOT full copy-per-cohort (settled 2026-06-06)

Blast-radius scan: `activity_id` is the single shared bridge (progress
keyed `(student, activity_id)`, no cohort_id; quiz attempts via
`programme_activity_id`; library/shelf attachments; all RLS traces
activity → unit → programme → tutor). A full per-cohort copy would mean
rewriting progress + attempt identity + every RLS policy + a deep-copy
engine (none exists), plus new regressions (cross-cohort quiz-history
fragmentation, progress orphaning on re-enrolment). The current model
(one template + thin per-cohort overrides) is the sound "Option B" that
Canvas Blueprint / Thinkific converged on. **Do not switch to copy.**

---

## Related

- [cohort-specific-activities.md](cohort-specific-activities.md) — the
  complementary cohort-only mechanism; the one-off planner flow reuses
  its cohort-only marker rows.
- [curriculum-authoring-ux.md](curriculum-authoring-ux.md) — activity
  types; the cohort checklist that hosts the "needs scheduling" cue.
- [cohort-workspace-fold.md](cohort-workspace-fold.md) — why the planner
  lives on the cohort Sessions tab.
- [payments-and-enrolment.md](payments-and-enrolment.md) — the sibling
  per-cohort pricing override.
