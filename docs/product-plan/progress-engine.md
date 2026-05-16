# Progress Engine — Plan

The student-progress layer for tutored Programmes. Tracks "is this
activity done for this student?", rolls up to unit / programme /
cohort completion, and feeds three downstream surfaces in one shot:
**curriculum guidance** (Start here / Up next / Where I left off),
**tutor analytics** (cohort + per-quiz completion dashboards), and
**programme-side attempt history** (a dedicated surface separate
from bank history).

Settled in the 2026-05-16 planning conversation. Build not yet
started — see §9 for the slice plan.

## Foundational principles (carried in from prior decisions)

- **One progress engine, two access models.** Self-paced and
  tutor-led (cohort) delivery share the same progress table; what
  differs is access gating (lock/open/close, due dates), not the
  completion record. Decision locked Slice 10.1 (2026-05-15).
- **Cohort = pointer to template, not a copy.** Programme owns the
  template; cohort row owns only cohort-specific data. Progress
  rows are written against the *template* activity_id, never
  duplicated per cohort. Decision locked Slice 9.3f (2026-05-14).

## 1. Core model

**Hybrid: store the completion record, derive everything else.**

- **One table — `nclex_student_activity_progress`.** Stores the
  completion record only. One row per (student, activity) when
  **DONE**. Same shape regardless of activity type.
- **NOT_STARTED is implicit** — the absence of a row.
- **IN_PROGRESS is derived** at read time for quiz types — JOIN
  to `nclex_attempts` where `status = 'IN_PROGRESS'`. Not stored
  (avoids the double-write drift between "started" and "completed"
  events).
- **LOCKED / OPEN / CLOSED are orthogonal** — already exist via
  Slices 10.6 + 10.7 (release / due / close dates on the cohort
  checklist row). Progress does not duplicate these.
- **All roll-ups are derived** — unit %, programme %, cohort %
  computed at read time via COUNT queries. No cached aggregates
  (avoids invalidation bugs; COUNT(*) over a per-student/programme
  row count is microseconds).
- **Single write owner per activity type:**
  - Quiz-completion path writes the row for `MOCK` + `PRACTICE_QUIZ`.
  - Manual "Mark as done" button writes the row for everyone else.
  - Both paths land in the same table — uniform read shape.
- **Reset safety:** voiding a quiz attempt removes the matching
  progress row in the same transaction. Single-owner per type
  prevents drift between the completion record and its underlying
  truth.

Why not pure derivation: TEXT / EXTERNAL_LINK / ONLINE_LIVE_SESSION
have no underlying event to derive from — a stored row is
unavoidable for them. Once you store half, store all.

Why not pure storage: caching IN_PROGRESS or roll-up aggregates
invents invalidation bugs that derivation never has.

## 2. Scope (v1)

### What's IN

**One table, one trigger, three policies.** The engine itself is
small — one storage table (§4), one DB trigger that writes from
quiz completion (§5.1), three RLS policies (§5.3), and a folder
of read-side TS helpers (`lib/progress/`).

**All 6 activity types covered.** Two write paths into one shared
table (§3):
- `MOCK` + `PRACTICE_QUIZ` write via the `nclex_attempts` trigger
  on terminal status (COMPLETED / TIMED_OUT).
- `TEXT` + `PDF` + `EXTERNAL_LINK` + `ONLINE_LIVE_SESSION` write
  via student-clicked "Mark as done".

**Two of three downstream surfaces fully served at engine ship.**
The engine's schema is designed for all three downstream surfaces
named below, but only two are unblocked by it alone:
1. **Curriculum guidance** ✅ — Start here / Up next pill,
   "Where I left off" default tab, unit-tab `% done`, per-row
   DONE tick (Slices 1 + 3 of §9).
2. **Programme-side attempt history split** ✅ — dedicated page
   with per-activity filter (Slice 4 of §9).
3. **Tutor analytics** ⏸ — design-complete in §6.2 but
   build-blocked on enrolment. Tutor-quiz Slice 4 + cohort
   dashboards ship when enrolment lands; the engine doesn't wait.

### What's OUT (full list in §10)

Equal-weight progress only; tutor-marked attendance deferred;
engagement events out of scope; IN_PROGRESS derived not stored;
pass-based MOCK rejected; cached aggregates rejected; un-mark
history rejected; tutor-side overrides rejected.

### Foundational principles carried in

- **One engine, two access models** — locked Slice 10.1.
- **Cohort = pointer to template, not a copy** — locked Slice 9.3f.

Both already covered in the principles block at the top of this
doc; both shape the row-attaches-to-template-`activity_id` decision
(§4) that makes the engine work across self-paced and cohort
contexts without forking.

## 3. Activity-type completion rules

| Type | DONE when… | Source |
|---|---|---|
| `TEXT` | Student clicks **Mark as done** | `MANUAL` |
| `PDF` | Student clicks **Mark as done** | `MANUAL` |
| `EXTERNAL_LINK` | Student clicks **Mark as done** | `MANUAL` |
| `ONLINE_LIVE_SESSION` | Student clicks **Mark as done** | `MANUAL` |
| `MOCK` | First attempt reaches a terminal state of `COMPLETED` or `TIMED_OUT` (any score) | `QUIZ_ATTEMPT` |
| `PRACTICE_QUIZ` | Same as MOCK — first `COMPLETED` / `TIMED_OUT` attempt | `QUIZ_ATTEMPT` |

**Excluded from DONE:** `ABANDONED` quiz attempts (student
explicitly bailed) and `IN_PROGRESS` (not terminal).

**Pass-based completion for MOCK was considered and rejected.** The
"did I do this work" question (progress) and the "did I pass this
gate" question (readiness) are different and should stay separate:
- A failed Mock would otherwise show perpetually "not done" until
  passed, overshadowing everything else on the unit.
- Tutor analytics show **% attempted** AND **% passed** as separate
  KPIs — that's the right split.
- An ungraded Mock (`pass_score IS NULL`) has no meaningful
  pass-based rule.

**"Mark as done" reversibility.**
- For the 4 `MANUAL` types — **reversible**. Student can un-mark.
  Mistake-friendly.
- For `MOCK` / `PRACTICE_QUIZ` — **NOT manually overridable**.
  DONE is bound to underlying attempt truth. A "marked done" quiz
  with zero attempts would break tutor analytics and the history
  split. The only way a `QUIZ_ATTEMPT`-sourced row goes away is if
  the underlying attempt is voided (admin action).

## 4. Schema

### `nclex_student_activity_progress`

One row per (student, activity) when **DONE**. Per §1 the table
stores the completion record only — NOT_STARTED is the absence of
a row; IN_PROGRESS for quiz types is derived from
`nclex_attempts`.

```sql
CREATE TABLE nclex_student_activity_progress (
  progress_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  student_id         UUID NOT NULL
                     REFERENCES nclex_users(id)
                     ON DELETE CASCADE,

  -- Row attaches to the TEMPLATE activity, never to a cohort.
  -- Enables "one engine, two access models" — a self-paced student
  -- and a cohort student share the same progress for the same
  -- activity. Cohort / programme are derivable via the
  -- activity -> unit -> programme chain.
  activity_id        UUID NOT NULL
                     REFERENCES nclex_programme_activities(activity_id)
                     ON DELETE CASCADE,

  -- Which write path produced this row.
  -- QUIZ_ATTEMPT → must have attempt_id; row vanishes if attempt voided.
  -- MANUAL       → attempt_id is NULL; reversible by re-clicking "Mark as done".
  completion_source  TEXT NOT NULL
                     CHECK (completion_source IN ('QUIZ_ATTEMPT', 'MANUAL')),

  -- Populated only when completion_source = 'QUIZ_ATTEMPT'.
  -- For traceability + the void cascade (see §5).
  attempt_id         UUID
                     REFERENCES nclex_attempts(attempt_id)
                     ON DELETE CASCADE,

  -- Wall-clock moment the activity first became DONE.
  -- QUIZ_ATTEMPT  → the attempt's ended_at.
  -- MANUAL        → NOW() at click.
  -- NEVER updated on retake — DONE is a one-time state transition.
  completed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Who marked the row done. NULL = self-marked by `student_id`
  -- (the default for v1, since both the quiz path and the manual
  -- button are student-initiated). Reserved for v2 tutor-marked
  -- attendance on ONLINE_LIVE_SESSION (and any future "tutor marks
  -- on behalf of student" path). v1 always writes NULL.
  marked_by          UUID
                     REFERENCES nclex_users(id)
                     ON DELETE SET NULL,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (student_id, activity_id),

  CONSTRAINT nclex_student_activity_progress_source_consistent CHECK (
    (completion_source = 'QUIZ_ATTEMPT' AND attempt_id IS NOT NULL)
    OR (completion_source = 'MANUAL' AND attempt_id IS NULL)
  )
);

-- Composite covering index for the tutor analytics hot path:
-- "for activity X, count DONE rows / list students". The activity_id
-- leading column makes it usable; the trailing student_id makes the
-- query an index-only scan. Strictly stronger than a single-col
-- activity_id index for these reads, so we don't keep both.
CREATE INDEX idx_nclex_student_activity_progress_activity_student
  ON nclex_student_activity_progress(activity_id, student_id);

-- Partial index for the void-cascade lookup
-- (DELETE on nclex_attempts -> cascade to progress rows where
-- attempt_id = $1). Most rows have attempt_id NULL (the 4 MANUAL
-- types), so partial keeps the index tiny.
CREATE INDEX idx_nclex_student_activity_progress_attempt
  ON nclex_student_activity_progress(attempt_id)
  WHERE attempt_id IS NOT NULL;
```

The UNIQUE on `(student_id, activity_id)` already gives Postgres
a student-leading index, so a separate `(student_id)` index is
redundant and is not created.

### Void-cascade behaviour (Q1)

Voiding a quiz attempt (admin hard-delete on `nclex_attempts`) drops
the matching progress row via `ON DELETE CASCADE`. The activity
**reverts to NOT_STARTED** even if other terminal attempts exist
for the same (student, activity) — we do **not** auto-re-create the
DONE row from the next-most-recent attempt. Voiding is rare and
intentional; if the admin wants a different attempt to carry the
DONE state, they can mark it deliberately. Auto-re-creation would
hide intent.

### RLS

Sketched in §5 — student writes own rows, tutor reads for their
programmes' students.

## 5. Write paths

### 5.1 Quiz completion (`QUIZ_ATTEMPT`) — DB trigger

A trigger on `nclex_attempts` writes the progress row when status
flips to a terminal value. Trigger over application code because
the progress row is a *consequence* of attempt state, not a
separate concern — single owner of the rule means every future
code path (background timeout sweeper, admin tools, retake flow)
gets the right behaviour for free.

```sql
CREATE OR REPLACE FUNCTION nclex_progress_on_attempt_terminal()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when an IN_PROGRESS programme attempt becomes terminal
  -- (COMPLETED or TIMED_OUT). ABANDONED does NOT count (§3).
  IF NEW.status IN ('COMPLETED', 'TIMED_OUT')
     AND OLD.status = 'IN_PROGRESS'
     AND NEW.source = 'PROGRAMME_ASSIGNED'
     AND NEW.programme_activity_id IS NOT NULL THEN

    INSERT INTO nclex_student_activity_progress
      (student_id, activity_id, completion_source, attempt_id, completed_at)
    VALUES
      (NEW.student_id,
       NEW.programme_activity_id::UUID,
       'QUIZ_ATTEMPT',
       NEW.attempt_id,
       COALESCE(NEW.ended_at, NOW()))
    ON CONFLICT (student_id, activity_id) DO NOTHING;
    -- ON CONFLICT DO NOTHING means a second terminal attempt is
    -- a no-op — DONE is a one-time state transition (§4).

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nclex_attempts_progress_writeback
  AFTER UPDATE OF status ON nclex_attempts
  FOR EACH ROW
  EXECUTE FUNCTION nclex_progress_on_attempt_terminal();
```

The trigger runs as the student updating their own attempt, so the
INSERT satisfies the student_own RLS WITH CHECK (§5.3). A
background timeout sweeper, if one exists, runs as service role
and bypasses RLS naturally.

### 5.2 Manual mark / un-mark (`MANUAL`) — server actions

Two server actions, one each:
- `markActivityDone(activityId)` — INSERT a row with
  `completion_source = 'MANUAL'`.
- `unmarkActivityDone(activityId)` — DELETE the matching MANUAL row.
  (DELETE, not soft-delete — per §1, NOT_STARTED = no row.)

**Pre-conditions (both actions):**
- Caller authenticated; `student_id` is the caller's `auth.uid()`.
- Activity type is one of the 4 MANUAL types
  (`TEXT`, `PDF`, `EXTERNAL_LINK`, `ONLINE_LIVE_SESSION`).
  Quiz types reject — DONE is bound to attempt truth (§3).
- Activity is **OPEN** for the caller — not LOCKED, not CLOSED.
  - LOCKED (release date in future) → reject.
  - CLOSED (past close date) → reject. Close date is a real gate;
    "didn't mark before close" = honest "didn't do it" signal.
  - Edge case (did the work, forgot to mark): tutor extends close
    date.
- **Already-DONE rows survive a later window-state change.** A row
  marked while OPEN stays DONE if the activity later CLOSES —
  closing the window prevents *further* access, not retroactive
  un-completion.

**Un-mark targets MANUAL rows only.** If the matching row exists
but is `QUIZ_ATTEMPT`-sourced, the un-mark action rejects. The only
way a quiz-sourced row goes away is the void cascade (§4 / §5.4).

### 5.3 RLS

```sql
ALTER TABLE nclex_student_activity_progress ENABLE ROW LEVEL SECURITY;

-- Students read+write their own progress only.
CREATE POLICY nclex_progress_student_own
  ON nclex_student_activity_progress
  FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Tutors read progress for activities in their own programmes.
CREATE POLICY nclex_progress_tutor_read
  ON nclex_student_activity_progress
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_activities pa
      JOIN nclex_programme_units pu ON pu.unit_id = pa.unit_id
      JOIN nclex_programmes p ON p.programme_id = pu.programme_id
      WHERE pa.activity_id = nclex_student_activity_progress.activity_id
        AND p.tutor_id = auth.uid()
    )
  );

-- SUPER_ADMIN bypass — matches the intentional v1 pattern on other
-- nclex_* tutor tables (see project memory).
CREATE POLICY nclex_progress_admin_all
  ON nclex_student_activity_progress
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_user_roles
      WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN'
    )
  );
```

### 5.4 Void cascade (recap from §4)

Hard-deleting a row in `nclex_attempts` cascades through the
`attempt_id` FK and removes the matching progress row. The
activity reverts to NOT_STARTED even if other terminal attempts
exist — auto-re-creation from a fallback attempt would hide intent.

## 6. Read patterns

Three downstream surfaces, three query shapes. §1–§5 settle the
storage and write paths; §6 is the read contract.

### 6.1 Curriculum guidance (per student, per programme)

The dominant student-side read. Drives row state in the curriculum
viewer + the two soft-guidance signals.

**Per-activity flag query** — feeds the row state:

```sql
SELECT
  pa.activity_id, pa.title, pa.type, pa.ordinal,
  pa.unit_id, pa.block_id,
  (sap.progress_id IS NOT NULL) AS is_done,
  sap.completed_at,
  sap.completion_source
FROM nclex_programme_activities pa
LEFT JOIN nclex_student_activity_progress sap
  ON sap.activity_id = pa.activity_id
  AND sap.student_id = auth.uid()
WHERE pa.unit_id IN (
  SELECT unit_id FROM nclex_programme_units WHERE programme_id = $1
);
```

**"Up next" finder** — first NOT_STARTED activity in curriculum
order (drives the §8 label on a specific activity row):

```sql
SELECT pa.activity_id, pa.unit_id
FROM nclex_programme_activities pa
JOIN nclex_programme_units pu ON pu.unit_id = pa.unit_id
LEFT JOIN nclex_programme_blocks pb ON pb.block_id = pa.block_id
LEFT JOIN nclex_student_activity_progress sap
  ON sap.activity_id = pa.activity_id AND sap.student_id = auth.uid()
WHERE pu.programme_id = $1
  AND pa.is_published = TRUE
  AND sap.progress_id IS NULL
ORDER BY pu.unit_index,
         COALESCE(pb.ordinal, pa.ordinal),  -- block at this slot, OR loose activity at this slot
         pa.ordinal
LIMIT 1;
```

(Blocks and loose activities share a numeric ordinal space within
a unit; the COALESCE captures that. v1 doesn't need to also gate
on window state — a LOCKED but next-in-order activity is still the
"up next" — Sam can refine if needed.)

**"Where I left off" finder** — Q7's resume-first rule, drives the
default unit tab:

```sql
-- Primary: most recent IN_PROGRESS programme quiz attempt's unit.
SELECT pa.unit_id
FROM nclex_attempts a
JOIN nclex_programme_activities pa
  ON pa.activity_id = a.programme_activity_id::UUID
JOIN nclex_programme_units pu ON pu.unit_id = pa.unit_id
WHERE a.student_id = auth.uid()
  AND a.status = 'IN_PROGRESS'
  AND a.source = 'PROGRAMME_ASSIGNED'
  AND pu.programme_id = $1
ORDER BY a.last_activity_at DESC
LIMIT 1;

-- Fallback if no IN_PROGRESS attempt: most recent DONE activity's unit.
SELECT pa.unit_id
FROM nclex_student_activity_progress sap
JOIN nclex_programme_activities pa ON pa.activity_id = sap.activity_id
JOIN nclex_programme_units pu ON pu.unit_id = pa.unit_id
WHERE sap.student_id = auth.uid() AND pu.programme_id = $1
ORDER BY sap.completed_at DESC
LIMIT 1;

-- Final fallback: Unit 1 (current Slice 10.8 behaviour).
```

The two named queries can be a single UNION-with-priority or two
separate calls — implementation choice for the slice.

### 6.2 Tutor analytics (per cohort)

The hot tutor query is "for cohort X, per-activity DONE count" plus
its companion "per-quiz pass rate".

```sql
-- Per-activity DONE counts within a cohort.
SELECT
  pa.activity_id, pa.title, pa.type,
  COUNT(sap.progress_id) AS done_count,
  COUNT(DISTINCT $cohort_members) AS enrolled_count  -- ↓ see below
FROM nclex_cohort_checklist_items cci
JOIN nclex_programme_activities pa
  ON pa.activity_id = cci.template_activity_id
LEFT JOIN nclex_student_activity_progress sap
  ON sap.activity_id = pa.activity_id
  -- AND sap.student_id IN (cohort members)  ← gated on enrolment
WHERE cci.cohort_id = $1 AND cci.is_included = TRUE
GROUP BY pa.activity_id, pa.title, pa.type;
```

**Build-blocker (honest flag).** Both the `enrolled_count`
denominator and the "scope progress to cohort members only"
filter require an enrolment relation that doesn't exist yet. Per
project memory: enrolment-aware access (RLS + TS helpers) is the
deferred slice that everything tightens to in one go. The
**progress engine schema itself does not need to wait for
enrolment** — it can ship and the curriculum guidance + history
split surfaces work on it. But **tutor-quiz Slice 4 (analytics)
sits behind both the progress engine AND enrolment** — it's the
intersection that ships last.

### 6.3 Programme history split (per student)

Largely independent of the progress engine. Reads `nclex_attempts`
directly with programme-aware row rendering. The engine adds an
optional "Activity DONE" badge, but the page works without
progress data.

```sql
SELECT
  a.attempt_id, a.programme_activity_id,
  a.status, a.final_score, a.ended_at, a.created_at,
  pa.title AS activity_title,
  p.title AS programme_title,
  (sap.progress_id IS NOT NULL) AS activity_is_done
FROM nclex_attempts a
JOIN nclex_programme_activities pa
  ON pa.activity_id = a.programme_activity_id::UUID
JOIN nclex_programme_units pu ON pu.unit_id = pa.unit_id
JOIN nclex_programmes p ON p.programme_id = pu.programme_id
LEFT JOIN nclex_student_activity_progress sap
  ON sap.activity_id = a.programme_activity_id::UUID
  AND sap.student_id = a.student_id
WHERE a.student_id = auth.uid()
  AND a.source = 'PROGRAMME_ASSIGNED'
ORDER BY a.created_at DESC;
```

The per-activity filter (deferred follow-on from BUILD_LIST) adds
one `AND a.programme_activity_id = $2` clause.

## 7. Roll-up derivation

All roll-ups are computed at read time. No cached aggregates — per
§1, COUNT over a per-(student, programme) row count is microseconds
and avoids invalidation bugs.

**"Visible" = published + (in cohort-included if cohort context).**
LOCKED and CLOSED activities still count toward the denominator —
they're part of the curriculum, just inaccessible right now.
Equal-weight per activity in v1 (weighted progress deferred — §10).

### 7.1 Unit % done (per student)

```sql
SELECT
  COUNT(sap.progress_id)::numeric / NULLIF(COUNT(pa.activity_id), 0) AS unit_pct,
  COUNT(sap.progress_id) AS done_count,
  COUNT(pa.activity_id) AS total_count
FROM nclex_programme_activities pa
LEFT JOIN nclex_student_activity_progress sap
  ON sap.activity_id = pa.activity_id AND sap.student_id = auth.uid()
WHERE pa.unit_id = $1
  AND pa.is_published = TRUE;
```

Cohort variant adds an `EXISTS` clause against
`nclex_cohort_checklist_items` filtered by `is_included = TRUE` —
respects per-cohort curation.

### 7.2 Programme % done (per student)

Same shape, scoped by `pu.programme_id` instead of `pa.unit_id`.

```sql
SELECT
  COUNT(sap.progress_id)::numeric / NULLIF(COUNT(pa.activity_id), 0) AS programme_pct
FROM nclex_programme_activities pa
JOIN nclex_programme_units pu ON pu.unit_id = pa.unit_id
LEFT JOIN nclex_student_activity_progress sap
  ON sap.activity_id = pa.activity_id AND sap.student_id = auth.uid()
WHERE pu.programme_id = $1
  AND pa.is_published = TRUE;
```

### 7.3 Cohort % done (aggregate, tutor side)

Mean per-student programme % across all enrolled students. Same
build-blocker as §6.2 — needs enrolment.

### 7.4 Implementation note

No views or SQL functions in v1. Queries live as TS helpers in
`lib/progress/` (new folder, mirrors `lib/practice/` for
student-side consumption). Add SQL functions only if a hot path
needs inline use (e.g., in an RLS USING clause) — none anticipated
in v1.

## 8. Soft guidance UX

What the curriculum viewer renders on top of the engine. Five
signals — three labelled, two visual.

### 8.1 First-NOT_STARTED activity — "Start here" / "Up next" pill

A small pill-badge on the activity row itself (not a callout above
the list — keeps chrome minimal). Two variants by student state:

- **"Start here"** — student has zero progress in this programme
  (no rows in `nclex_student_activity_progress` for any of this
  programme's activities).
- **"Up next"** — student has at least one DONE row in this
  programme.

Same target — the row pointed at by the §6.1 "Up next finder"
query. Only the copy changes. (Sam's call: two labels are worth
the small branching cost for first-impression UX on a brand-new
student.)

### 8.2 "Where I left off" default unit tab — implicit

Q7 logic picks the default tab. No banner, no "Resumed" pill,
no explanation chrome. Behaviour speaks for itself; if a user
wonders why, they can switch tabs.

### 8.3 Per-unit % done — tab-strip indicator (Q10 — ship in v1)

The unit tab strip from Slice 10.8 gains a `% done` suffix:

```
Unit 1 · 80%    Unit 2 · 40%    Unit 3      Unit 4
```

- Hidden for units with zero activities (no denominator).
- Hidden on tabs of single-unit programmes (no tab strip exists).
- Cohort context respects `is_included = TRUE` per §7.

Cheap to add — the §7.1 query already exists and the tab strip
already renders. The deferred lock/due/overdue dots from 10.8 can
land later without conflict (different visual slot — lock dot left
of label, % right of label).

### 8.4 Activity DONE tick (✓) on completed rows

Small ✓ on any row with a progress entry, regardless of source
(`MANUAL` vs `QUIZ_ATTEMPT` look the same). Visual feedback that
marking-as-done / completing-a-quiz actually did something. Same
tick used on both the curriculum viewer and the cohort checklist.

### 8.5 "Mark as done" / "Mark as not done" button

Lives on the per-type viewer for the 4 `MANUAL` types
(`TEXT`, `PDF`, `EXTERNAL_LINK`, `ONLINE_LIVE_SESSION`). Required
by §5.2 and §3. Toggles label based on current row state:

- NOT_STARTED + window OPEN → "Mark as done" button enabled.
- DONE + window OPEN → "Mark as not done" button enabled.
- Window LOCKED or CLOSED → button disabled (already-DONE rows
  show a passive "Done ✓" indicator instead of an active button).

## 9. Build arc

Four shippable slices for the engine + history split. A fifth
slice (tutor analytics) sits behind enrolment and is not part of
this arc — it gates on a separate dependency.

### Slice 1 — Engine foundation (visible)

The table, the trigger, the RLS, and one user-visible signal so the
slice is testable end-to-end.

- Migration: `nclex_student_activity_progress` table per §4
  (UUID PK, FKs, CHECK, UNIQUE, two indexes).
- Migration: `nclex_progress_on_attempt_terminal()` function +
  `nclex_attempts_progress_writeback` AFTER UPDATE trigger per §5.1.
- Migration: three RLS policies per §5.3 (student_own, tutor_read,
  admin_all).
- New `lib/progress/` folder. Initial helpers:
  - `getActivityProgressMap(programmeId, studentId)` → `Map<activityId, ProgressRow | null>`
    feeds the curriculum viewer's per-row state (§6.1 query).
- Curriculum viewer renders a small **DONE tick (✓)** on any
  activity row whose map entry is non-null (§8.4). Same tick on
  both `/student/programme/[id]/curriculum` and
  `/student/cohort/[id]/curriculum`.
- Cohort checklist (tutor side) is read-only of the engine in this
  slice — no tutor-side rendering yet (saved for the analytics
  slice).

**Tested end-to-end by:** complete a programme Mock or Practice
quiz → curriculum view shows ✓ on that activity row.

### Slice 2 — Manual completion

Lights up `MANUAL` source for the 4 non-quiz activity types.

- Two server actions: `markActivityDone(activityId)` and
  `unmarkActivityDone(activityId)` per §5.2. Each enforces:
  caller-is-student, activity-type-is-MANUAL, window-is-OPEN,
  un-mark-targets-MANUAL-only.
- "Mark as done" / "Mark as not done" button added to each of the
  4 MANUAL per-type viewers
  (TEXT, PDF, EXTERNAL_LINK, ONLINE_LIVE_SESSION).
- Disabled-state styling for LOCKED / CLOSED windows (passive
  "Done ✓" indicator when DONE + window closed).
- Curriculum-viewer ticks (from Slice 1) now light up for these
  types after the button is clicked.

**Tested end-to-end by:** open a Text / PDF / External link / Live
session viewer → click Mark as done → curriculum row gains a ✓ →
re-open viewer → button reads "Mark as not done" → click → ✓
disappears.

### Slice 3 — Soft guidance

The three labelled / visual signals from §8.

- `findUpNextActivity(programmeId, studentId)` helper (§6.1 query).
- `findWhereILeftOffUnit(programmeId, studentId)` helper (§6.1
  two-tier query — IN_PROGRESS attempt → DONE activity → Unit 1).
- `getUnitProgressPct(unitId, studentId)` helper (§7.1).
- Curriculum viewer:
  - **"Start here" / "Up next" pill** on the row returned by the
    finder — copy varies on zero-progress vs some-progress (§8.1).
  - **Default unit-tab** flips from hardcoded Unit 1 (the Slice
    10.8 placeholder) to the resume-first rule. `?unit=N` URL
    state continues to override (§8.2).
  - **Unit-tab `% done` suffix** on each tab when the unit has
    activities (§8.3).

**Tested end-to-end by:** new student → "Start here" pill on first
activity; complete one → pill flips to "Up next" on the next; start
a quiz attempt mid-flow → refresh curriculum → default tab is the
unit containing that attempt; complete activities across a unit →
the tab `%` rises.

### Slice 4 — Programme history split

Splits programme attempts out of `/student/bank/history` into a
dedicated programme-side surface.

- New page (route TBD during the slice — naturally lives under
  `/student/programme/...` or `/student/cohort/...`).
- Per-activity filter (the deferred-follow-on noted in BUILD_LIST).
- Optional **Activity DONE badge** on rows, sourced from the
  engine — separate from per-attempt status (an attempt can be
  COMPLETED without the activity having been "DONE" if voided,
  etc.).
- `/student/bank/history` filters out `source = 'PROGRAMME_ASSIGNED'`
  rows once the split lands.

**Tested end-to-end by:** complete a programme quiz → row appears
in the programme history surface, not bank history; per-activity
filter narrows the list.

### Slice 4b — Attempt count column

Small additive slice on top of Slice 4 (settled mid-build). Adds
an **Attempt** column between Activity and Mode showing the
chronological attempt number for that activity, with the cap when
the linked quiz sets `max_attempts` ("Attempt 2 of 4") or just the
ordinal when uncapped ("Attempt 2"). Useful before retake exists
(progression tracking, pacing) and lays the groundwork for the
retake feature (§10 future).

- Ordinals computed client-side over the **full** filtered-to-
  programme set per activity (group → sort ascending by
  `created_at` → assign 1..N) **before** the 50-row display cap, so
  numbering stays stable when older attempts fall off the visible
  window.
- Cap fetched via service-role read of `nclex_tutor_quizzes`
  (`max_attempts`) — student RLS on that table doesn't expose it
  directly. `max_attempts` isn't sensitive (the launch modal
  already surfaces it). Pragmatic v1 fix vs. adding a focused
  student-read policy.
- **Current cap, not historical.** Cap shown is whatever the
  activity's currently-linked quiz says today. No schema change.
  Honest fallback when `attempt_ordinal > max_attempts` (cap
  dropped post-hoc): drop the "of M", show just the ordinal —
  avoids rendering the contradictory "3 of 2".

### Future — Tutor analytics (blocked on enrolment)

Not part of this arc. Tutor-quiz Slice 4 + cohort progress
dashboards read from the engine, but the cohort-membership scoping
(§6.2) requires the enrolment slice. Both ship together when
enrolment lands.

## 10. Not in v1

Explicit deferrals — each was considered and rejected for the v1
engine, with the reason in case it ever re-opens.

- **Weighted progress** (different activity types contribute
  different weight to roll-ups — e.g., a Mock = 5, a Text = 1).
  Equal weight in v1; weighted is a v2+ design question.
- **Tutor-marked attendance for `ONLINE_LIVE_SESSION`.** The
  `marked_by` column is reserved (§4) but only the student
  themselves writes in v1. Tutor-side attendance is a separate
  feature with its own UI + analytics; ship when a tutor asks.
- **Engagement / interaction events** ("opened PDF", "watched
  video to 70%", "scrolled to end of text"). Different table,
  different purpose (analytics on usage, not completion). The
  engine is binary done/not-done by design.
- **Stored `IN_PROGRESS`** — rejected (§1). Derived from
  `nclex_attempts` at read time; storing it would create the
  double-write drift the design avoids.
- **Pass-based completion for `MOCK`** — rejected (§3). The
  "did I do this work" and "did I pass this gate" questions stay
  separate.
- **Cached roll-up aggregates** (unit %, programme %) — rejected
  (§1, §7). COUNT(*) at read is microseconds; caching invents
  invalidation bugs.
- **Soft-delete / un-mark history** — rejected (§4). NOT_STARTED
  is implicit (no row); re-marking is a fresh INSERT. A history
  table would be over-engineered for a low-stakes student
  affordance.
- **Tutor-side override** (tutor manually marks a Mock done on a
  student's behalf without an attempt). Rejected — would create a
  `QUIZ_ATTEMPT`-source row with no attempt, breaking analytics
  and history. If tutors need to credit students retroactively,
  the right shape is an admin-tool attempt-fabrication flow, not
  a progress override.
- **Cohort-tab indicators on the unit tab strip**
  (lock / due / overdue dots). Separately deferred from Slice
  10.8 — orthogonal to the engine. Lands later if a tester
  struggles to find which unit needs attention.
- **Stale-DONE flags** ("you completed this 3 months ago, retake?").
  Curriculum-recommendation territory; well beyond v1.

## Deferred follow-ons unblocked by this engine

For traceability — items already deferred elsewhere in the project
that this engine completes the dependency for:

- **"Where I left off" smart default** on the curriculum tabs
  (deferred from Slice 10.8) — lands in Slice 3.
- **Programme-side attempt history split** (deferred follow-on in
  BUILD_LIST) — lands in Slice 4.
- **Per-activity filter on programme history** (deferred follow-on
  in BUILD_LIST) — lands in Slice 4.

### Wider use of the % counting pattern (deferred — Sam's future shapes)

The `pct = done / total × 100` pattern Slice 3 ships at the **unit
tab** scope (per §8.3) extends trivially to any other scope of the
curriculum tree — same `isDone` flag, same flatten, different
denominator. The counting logic is reusable.

Surfaces a future slice could consume it on (not yet shaped — Sam
to return with specifics):

- **Programme % done** — already specced in §7.2; a single visible
  "how far along am I" summary on the curriculum header, and a
  natural fit for **picker cards** when a student has multiple
  programmes (helps them pick which to work on next).
- **Block % done** — per-block badge on the block header. Lower
  intrinsic value when the block's own activity rows are right
  there with their state pills, but real for blocks with many
  activities.
- **Cohort dashboard surfaces** — the same pattern under tutor
  RLS scopes naturally to the cohort-level analytics (§6.2).
  Already build-blocked on enrolment.

Deliberately left unscoped — when Sam returns with the visual
treatments he wants, each is a small additive slice on top of the
existing decoration helpers in `lib/curriculum/student-queries.ts`.
No schema work needed.

### Retake-from-history (deferred — Sam's planned next move)

A **Retake** button on the programme history page that starts a
fresh attempt against the row's activity. Builds on Slice 4b's
attempt-count column (which already surfaces "Attempt N of M" so
the student knows whether they have shots remaining). When
shipped:

- Per-row "can retake" logic — most recent attempt for that
  activity, not exhausted (`attempt_ordinal < max_attempts`),
  activity still OPEN.
- Action button → reuses the existing
  `startProgrammeQuizAction` from Tutor-Quiz Slice 3 → navigates
  to `/session/[newAttemptId]`.
- UX choices to settle when picked up: confirm-before-retake
  (modal), or single-click? Land on attempt or preflight?

The data path is complete (cap + ordinal are already on every
row); this slice is pure UX wiring.
