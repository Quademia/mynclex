# MyNclex Build List

Slice-by-slice list of work in the MyNclex product, split by the two
layers MyNclex is built around: the **Bank** (self-study question
bank) and the **Programme** (tutored prep). Each line is one slice.
Not exhaustive — design surprises happen — but the shape is settled
where it's listed.

Status legend: ✅ done · 🔨 in progress · ⏭ next · ⬜ pending

> **Last shipped (2026-05-20):** **Enrolment — Slice 1 completion +
> Slices 2a + 2b.** Tested the prior session's Slice 1 (off-platform
> tutor-add), fixed a roster bug (three-FK embed ambiguity rendered the
> roster empty), and completed Slice 1 with the **`/welcome`**
> invite-landing page (invited students set a password + land in the
> app; session is read from the invite link only, never an ambient
> browser session). **Slice 2a** = tutor lifecycle state machine: five
> SECURITY DEFINER RPCs (approve/reject/pause/unpause/cancel) + roster
> action buttons + confirm dialogs; direct tutor UPDATE policy dropped
> so transitions are RPC-gated. **Slice 2b** = student enrolment status
> pills in the programme switcher (informational only — access is *not*
> yet gated by status; that's the separate access-gating step). Deferred
> from the proposal's Slice 2: the pg_cron EXPIRED/PAUSED sweep (no data
> until the access-window slice) + admin-grant (no surface yet). Dev
> migration tracker reconciled to match filenames. Commits `6995d46`
> (roster fix) + `2c09173` (`/welcome`) + `e141479` (2a db) + `e91b151`
> (2a feat) + `d704e83` (2b). Unblocks tutor-quiz Slice 4 +
> progress-engine Slice 5. See SESSIONS 2026-05-20.
>
> **Earlier:** **Tutor-quiz Slices 5 + 6 —
> programme-level quiz membership end-to-end.** Closes the
> tutor-quiz arc: a tutor can now attach quizzes directly to a
> programme (separate from the curriculum activity-link path) and
> students see the result on a new Quizzes tab under both delivery
> modes.
>
> **Slice 5 — tutor surface.** New junction `nclex_programme_quizzes`
> (composite PK, programme + quiz + added_at) is the canonical
> record of "what quizzes are in this programme." Two write paths
> feed it: the existing activity-save action auto-mirrors when
> `quiz_id` is set, and a new standalone-add path on
> `/tutor/programme/[id]/quizzes`. The page surfaces an empty state
> + two equal-weight CTAs (Add existing picker for PUBLISHED quizzes
> / New quiz creates DRAFT + auto-attaches + redirects to editor),
> a list of attached quizzes with a derived `Linked to Unit N` vs
> `Standalone` source hint, and a remove flow that **blocks** when
> the quiz is still activity-linked in this programme (§9.3 copy
> verbatim, no per-activity deep links — simpler than the prototype
> proposed). Per-row removes use a simple destructive confirm — no
> type-to-confirm gate (recoverable action, the quiz stays in the
> library). Sidebar item between Curriculum and Live Sessions; new
> "Used in N programmes" chip on `/tutor/quizzes` (forward-compat
> shape).
>
> **Slice 6 — student surface.** New `/student/programme/[id]/quizzes`
> + `/student/cohort/[id]/quizzes` (shared view component; cohort
> resolves to parent programme). Row anatomy = title + kind pill
> + mode/count/duration/attempt-counter/pass-hint + source hint +
> progress-engine state pill (`✓ Done` / `In progress` /
> `Up next` or `Start here` / `Not started`; `Exhausted` drops the
> pill, the disabled button carries the meaning). Filters by kind
> (All / Mock / Practice) + state (All / Not started only) with
> a "Showing N of M" counter. **Launch routing (Option 2 — Sam's
> call):** rows that are also activity-linked route their launch
> through the existing `<QuizLaunchViewer>` with the resolved
> primary activity — one counter per row, matching what the student
> would see in Curriculum. Standalone-only rows use a new
> `<StandaloneQuizLaunchViewer>` + new RPC. Sidebar item between
> Curriculum and Quiz History (icon `book`, distinct from the
> bank-side `target` used by Readiness Packs).
>
> **Schema (Slice 6).** `nclex_attempts` gains nullable
> `programme_id` + `quiz_id` columns, populated only for
> standalone attempts. Relaxed `nclex_attempts_source_refs` CHECK
> + partial index for the per-(student, quiz, programme) cap
> count. New SECURITY DEFINER RPC
> `nclex_create_standalone_quiz_attempt(programme_id, quiz_id)`
> enforces the §9.7-B cap (terminal attempts on standalone rows
> only — activity-linked attempts have their own scope, matching
> the spec's literal reading).
>
> **§9.9 captured.** Cohort-level quiz divergence is a real future
> need (a tutor running multiple cohorts will eventually want to
> vary the quiz set per cohort). Three implementation options
> documented in §9.9 — additive-only / full checklist / hidden
> checklist — with the **design decision deliberately deferred to
> the build slice**, depending on whether per-cohort scheduling or
> subtraction is in scope by then.
>
> **Plan-doc alignment.** §9.7 (attempt-cap for standalone quizzes)
> locked to **B** — per-(student, quiz, programme), cap resets
> across programmes. "Linked to Week N" → "Linked to Unit N"
> everywhere — matches the curriculum `nclex_programme_units`
> schema (the design prototype used "Week" as spec language; code
> uses "Unit").
>
> **Off-script trims (from Claude Design prototypes, locked with
> Sam).** Slice 5: dropped type-to-confirm REMOVE (recoverable) +
> dropped per-activity deep links in the blocked dialog. Slice 6:
> dropped the amber Resume button (accent like every other primary
> CTA), collapsed six prototype states to four (UP_NEXT + START_HERE
> share a label via `hasAnyDone`), reused existing
> `.student-activity-state` classes instead of inventing parallels.
>
> **Hoist.** `.pq-pill-mock` / `.pq-pill-practice` promoted to
> shared `.quiz-pill-kind-mock` / `.quiz-pill-kind-practice` in
> `quiz.css`. Slice 5 callsites updated.
>
> Commits `b6e693e` (Slice 5) + `b58b15c` (docs: §9.9 + §9.7 +
> Week→Unit) + `466141c` (Slice 6). See SESSIONS 2026-05-16
> (tutor-quiz Slices 5 + 6).
>
> **Earlier:** **Progress engine — full 4-slice arc + Slice 4b +
> Quiz History rename.** Big session. Sam asked what the "student
> progress engine" referenced across deferred notes actually was;
> opened a planning conversation, settled the full design into
> `docs/product-plan/progress-engine.md`, then shipped the 4-slice
> build arc end-to-end (plus a small additive Slice 4b mid-build
> for the attempt-count column).
>
> **Hybrid model.** Store the completion record (one table
> `nclex_student_activity_progress`), derive everything else.
> NOT_STARTED is implicit (no row); IN_PROGRESS for quiz types is
> derived from `nclex_attempts` at read time; roll-ups (unit %,
> programme %) computed at read time. DB trigger on
> `nclex_attempts` owns QUIZ_ATTEMPT writes; server actions own
> MANUAL mark/un-mark on the 4 non-quiz types.
>
> **What students see.** Activity rows carry a labelled state pill
> (`✓ Done` / `In progress` / `Up next` or `Start here` / `Not
> started`) in a 4-state cascade. Unit tab strip shows "· NN%"
> per tab; default tab is "Where I left off" (most recent
> IN_PROGRESS quiz attempt's unit → most recent DONE → Unit 1).
> Manual viewers (TEXT / PDF / EXTERNAL_LINK / LIVE) get a "Mark
> as done" button at the foot; the live-session button disables
> until the session ends. Programme attempts split out of bank
> history into dedicated `/student/programme/[id]/history` +
> `/student/cohort/[id]/history` surfaces (sidebar "Quiz History"
> item), with activity filter, DONE badge, pass/fail verdict, and
> an "Attempt N of M" column.
>
> **What did NOT ship.** Slice 5 (tutor analytics + cohort
> dashboards) gates on the enrolment slice — engine schema doesn't
> wait, but the cohort-membership scoping does. Retake-from-history
> deferred (data path complete; pure UX wiring on top). Backfill
> for pre-existing terminal attempts skipped (no real users yet).
> Wider use of the % counting pattern (programme header, picker
> cards, block badges) captured as deferred follow-ons.
>
> Commits `1453726` (Slice 1) + `6bad6c9` (Slice 2) + `c89a3ff`
> (Slice 3) + `2a345f2` (Slice 4) + `fda868d` (Slice 4b) +
> `b890b84` (rename). See SESSIONS 2026-05-16.
>
> **Earlier:** **Slice 10.8 — tabbed student curriculum.** Small
> design improvement: the student curriculum view now shows one
> unit at a time, switched via a horizontal tab strip at the top.
> Reduces scroll on programmes with multiple units. `?unit=N` in
> the URL (Unit 1 omitted for clean default). Single-unit
> programmes hide the tabs entirely. Tutor curriculum + cohort
> checklist deliberately untouched — they're authoring / control
> surfaces that benefit from cross-unit visibility, not the
> launcher pattern. (Slice 10.8's Unit-1-default behaviour was
> later superseded by the progress engine's "Where I left off"
> default in Slice 3 above.) See SESSIONS 2026-05-15 (Slice 10.8).
>
> **Earlier:** **Tutor Quiz Slice 3a — universal
> end-of-quiz results popup + smart exit.** Two threads in one
> session: a dev-data cleanup (option-id normalisation across 23
> tutor + bank questions, after Sam spotted `o1./o2.` rendering),
> then the slice itself.
>
> **Popup.** Auto-shown the moment the runner flips to review mode
> in *this* session (set true right before `router.refresh()` in the
> 4 completion paths; not shown on initial load of an
> already-completed attempt). Reusable via topbar pill click on
> dismiss. Source-aware via `getResultsContext`: bank Builder shows
> "Build another" + exits to `/student/bank/practice`; programme
> shows "Take again" + exits to the curriculum URL; both share the
> same score + verdict + facts chrome. "Take again" hides entirely
> when programme attempts exhausted (no greyed dead-end button).
> Pass/fail verdict suppressed when `pass_score` is null
> (unchanged from Slice 3 behaviour). Primary action "Review
> attempt" jumps to Q1 in review.
>
> **Smart exit (3 fixes surfaced during testing).** Same root cause
> — exit destinations hardcoded to bank's path. New
> `resolveAttemptExitHref()` (cohort first via
> `nclex_cohort_checklist_items`, then self-paced programme URL,
> `/student/picker` fallback) consumed by:
> - the popup's Exit button (on-demand server action),
> - the runner topbar's ← Exit (resolved at page-load, threaded
>   through `RunnerData.exitHref`),
> - the preflight ← Back button.
> Topbar prop became `onExit: () => void` so the runner can decide
> whether to navigate immediately (review) or open a confirm modal
> first (live).
>
> **Exit-confirm modal.** New
> `lib/overlays/practice/exit-attempt-confirm.tsx`, copy varies by
> mode (timed callouts that the clock keeps running; untimed
> reassures progress is saved). Backdrop/Esc → Keep going.
>
> **Preflight smartness.** Source-aware destination + label via
> new `exitBackLabel(source)` helper. No modal — preflight is
> before any work.
>
> **Pre-slice cleanup.** Sam saw tutor questions rendering as
> `o1./o2./true./false.` instead of `A./B.`. Root cause: runner
> renders `opt.id` directly; bank editor enforces A/B/C/D/E ids
> but my dev seed file (`db/seed-tutor-bank-dev.sql`) used raw SQL
> inserts with `o1` ids. Decision against the runner-side defence
> ("don't change code to defend against a hypothetical future bad
> seed when the fix is 'don't seed badly'") — went with seed-only
> fix. Single `DO` block normalised 23 affected rows across both
> tables; 19 dev attempts deleted (cascade); seed file rewritten.
>
> **No schema, no migration.** Slice 3 already added `pass_score`;
> the popup reads existing columns. 3 new files + 6 modified.
>
> See SESSIONS 2026-05-15 (Slice 3a).
>
> **Earlier:** **Tutor Quiz Slice 3 — student
> launch.** Closes the Mock / Practice quiz loop end-to-end: the
> student's Open button on a Mock/Practice activity now mounts a
> launch modal, Start (or Resume) creates an attempt and hands
> off to the existing runner, and review-mode shows a pass/fail
> badge alongside the score.
>
> **Schema.** Migration `20260517120000` adds nullable
> `nclex_attempts.pass_score` (0..1 fraction — general-purpose, so
> bank Builder + future Readiness Packs can populate it later when
> they want a pass mark) and the new RPC
> `nclex_create_programme_attempt(p_programme_activity_id)`. The
> RPC is a fixed-list snapshot (no pool selection / drift) —
> validates activity + quiz + max_attempts, then walks
> `nclex_tutor_quiz_items` in `position` order and snapshots each
> linked tutor question into `nclex_attempt_items`. Source is
> `TUTOR`, intent derived from `quiz_kind` (MOCK→EXAM,
> PRACTICE→STUDY), duration + pass_score pass through. SECURITY
> DEFINER, EXECUTE to `authenticated` only.
>
> **Resume rule.** Resume governs in-flight attempts; max_attempts
> governs terminal ones — two independent rules, no overlap. The
> modal's server-fetch (one round trip via the new
> `getQuizLaunchContext`) returns attempts taken
> (COMPLETED+TIMED_OUT+ABANDONED — IN_PROGRESS excluded) + an
> in-progress lookup scoped to *this* activity. IN_PROGRESS exists
> → Resume button → navigates without RPC; otherwise Start →
> RPC → navigate; exhausted → no button.
>
> **Pass mark on attempts.** The runner's review-mode topbar pill
> grows from `Score · NN%` to `Score · NN% · Pass` / `· Fail` when
> the attempt has a `pass_score`. Ungraded attempts keep the old
> pill unchanged.
>
> **Wiring + visual.** `<ActivityAction>` flips MOCK + PRACTICE_QUIZ
> to `isLaunchable` *only when `payload.quiz_id` is non-null* —
> defence in depth on top of Slice 2's publish gate. New
> `<QuizLaunchViewer>` uses the same `<ViewerModalShell>` + 
> `viewer-modal-*` vocabulary as the per-type viewers (slices
> 10.2–10.5). Stakes communicated by content (attempts line, pass
> mark line, clear button labels), not chrome variation.
>
> **Mid-build bug.** First Start hit
> `nclex_attempt_items_tutor_id_consistent` — the CHECK requires
> `tutor_id NOT NULL` when `item_source = 'TUTOR'`. RPC was leaving
> it null. Fix: read `tq.tutor_id` in the snapshot loop, carry
> through to the insert. Re-tested clean.
>
> **End-of-quiz popup deferred.** Score + pass/fail + action set
> (Review / Exit / Take again) is real value, but ships as **Slice
> 3a** because it's universal — applies to bank Builder + future
> Readiness Packs equally, not programme-only. Designing it once
> source-aware (vs. retrofitting from "programme quiz finished")
> avoids reshape later.
>
> See SESSIONS 2026-05-15.
>
> **Earlier:** **Tutor Quiz Slice 2 — link a
> quiz into Mock/Practice activities** (+ a Slice 1 layout polish).
>
> **Slice 2.** The Mock/Practice curriculum activity editor's
> static placeholder becomes a real "Choose a quiz" selector — a
> dropdown of the tutor's PUBLISHED quizzes of the matching kind
> (Mock activity → Mock quiz, Practice → Practice). The chosen
> `quiz_id` is stored on the activity payload; a since-archived /
> missing link is flagged inline. New `getActivityQuizPickerContext`
> server action; `buildPayload` gates publishing (a Live quiz
> activity must have a quiz; drafts may save without one);
> `validateQuizForActivity` re-checks ownership + kind + published
> status server-side. No schema change. Student launch stays Slice 3.
>
> **Slice 1 polish.** The quiz editor's stacked layout → two
> side-by-side columns (quiz left, picker right) so the picker
> isn't pushed down as the quiz grows; each column's list scrolls
> internally; editor page widened.
>
> Commits `83c214d` (polish) + `670a878` (Slice 2). See SESSIONS
> 2026-05-17.
>
> **Earlier:** **Tutor Quiz Slice 1 — Quiz
> foundation.** The reusable Mock/Practice quiz object + the tutor
> surface to build one.
>
> **Schema.** Migration `20260516120000` adds `nclex_tutor_quizzes`
> (the quiz plan — kind, mode, duration, pass_score, max_attempts,
> status) + `nclex_tutor_quiz_items` (the ordered question
> references). `mode` excludes `CAT` (adaptive selection
> contradicts a hand-picked fixed list); a `(quiz_kind, mode)`
> CHECK mirrors the attempts intent/mode tuple. `pass_score` is a
> 0..1 fraction. Tutor-owned RLS.
>
> **Mirror catch-up.** `db/schema.sql` + `db/rls.sql` had drifted
> from dev since slice 2.1.5 — back-ported the 7 unmirrored tables
> (question_marks, curriculum units/blocks/activities, cohort
> checklist, keepalive, media assets) plus the new quiz tables.
> Verified parity against dev.
>
> **Surface.** `lib/tutor-quiz/` + `/tutor/quizzes` (list) +
> `/tutor/quiz/[id]` (editor — metadata modal + ordered question
> list + question picker). "Mocks" leaves the programme nav;
> "Quizzes" joins the global tutor nav; the stale
> `/tutor/programme/[id]/mocks` route is deleted.
>
> Sam reviewed the surface before approving the merge.
>
> Commit `33729ec`. See SESSIONS 2026-05-16.
>
> **Earlier:** **Slices 10.6–10.7 — Locked
> activity rows + activity window.** Two follow-ons off the
> per-type viewers, both about *when* a tutor-led activity is
> reachable.
>
> **10.6 — Locked rows.** A tutor-led activity behind a future
> release date was filtered out entirely, so its unit read "no
> content yet" (a not-yet-started cohort looked like an empty
> programme). `isVisibleToStudents()` is split: it now only
> handles what genuinely HIDES an activity (draft / excluded). A
> future release date no longer hides — the activity stays in the
> tree as a locked "Opens <date>" row. Draft ≠ locked.
>
> **10.7 — Activity window (due + close dates).** Two nullable
> columns on `nclex_cohort_checklist_items` complete the
> per-activity window: release (opens) → due (soft target) →
> close (hard gate). Sam settled the key distinction — due is soft
> (activity stays open, "overdue" tint), close is a hard gate
> (activity locks). Two separate optional columns, not one
> ambiguous one. Rich due-date *pacing* stays progress-engine
> territory; v1 just shows the date.
>
> **Tutor side.** Three new/updated checklist actions sharing
> `validateWindowOrdering` (release ≤ due ≤ close, app-layer not a
> DB CHECK). The cohort checklist row gains two more date inputs
> via an extracted `<ChecklistDateField>`; the save-safety layer
> extends across all three.
>
> **Student side.** `StudentActivity.openState` is a 3-way (LOCKED
> / OPEN / CLOSED) via the new `activityOpenState()`. Viewer:
> LOCKED → "Opens …"; OPEN → the action + a "Due …" line (overdue
> tint when past); CLOSED → "Closed …".
>
> **Migration** `20260515160000` — two nullable DATE columns, no
> trigger change, no backfill. Validation is app-layer.
>
> **One UX call flagged:** three date inputs per checklist row is
> dense — shipped as a compact inline "window" group; expandable-
> row fallback if it reads as too cramped.
>
> Sam smoke-tested both before approving the merge.
>
> Commit `6db89cf`. See SESSIONS 2026-05-15 (10.6–10.7).
>
> **Earlier:** **Slices 10.2–10.5 — Per-type
> activity viewers.** The student curriculum launcher's "Open"
> button goes live, one activity type at a time: External link
> (10.2), Online live session (10.3), PDF (10.4), and Text reading
> (10.5). Mock + Practice quiz stay disabled — blocked on the
> central tutor-quiz system.
>
> **Architecture settled over several rounds with Sam.** Curriculum
> = launcher, activity = destination; the list views (curriculum,
> future weekly + calendar) stay dumb and just render a shared
> `<ActivityAction>` piece per activity. "Component vs route" is a
> false opposition — the genuinely shared unit is the per-type
> *dispatch*, which lives in `<ActivityAction>` (owns the uniform
> "Open" button + dispatch + any modal's open/close). Destinations
> are *right-sized per type*: External link / Live session / PDF →
> modals; Text reading → a wide modal for now (dedicated route
> deferred to the rich-text-editor era); Mock / PQ → the existing
> runner.
>
> **Shared thin shell.** New `<ViewerModalShell>` owns only the
> modal plumbing (backdrop, Escape / click-outside / close,
> narrow/wide size); each viewer fills it with unique content. Not
> reused from `lib/bank/atoms/modal-frame.tsx` — that atom is
> curator-internal per folder convention #12; this is the
> student-side equivalent in `lib/curriculum/`.
>
> **PDF — on-demand signed URL, not a stored link.** A PDF
> activity's payload carries only an opaque `pdf_asset_id`; the
> file lives in a private bucket. The viewer mints a short-lived
> signed URL on open via a new student-side action
> (`getStudentPdfActivityUrl`), then hands off to the browser's PDF
> viewer in a new tab. Sam asked about storing the link
> permanently — rejected: a stored link can't be both permanent and
> private (long-lived signed URL = leakable bearer token to paid
> content; public URL = file public to the internet). On-demand
> minting means leaked links die in an hour and access is
> re-checked every open.
>
> **Consolidations.** `safeHttpUrl`, `providerLabelFor`,
> `formatFileSize` pulled into `format.ts` as shared helpers (used
> by the viewers AND the tutor editors); `.external-link-viewer-*`
> CSS generalised to the shared `.viewer-modal-*` vocabulary.
> `activityActionLabel` (10.1b) removed — superseded by the uniform
> "Open" label.
>
> **No schema, no migration.** Test data: Sam attached a real PDF
> to both PDF activities; three Text activities given long-form
> NCLEX content to stress-test the wide modal.
>
> Sam smoke-tested each viewer as it shipped before approving the
> batch merge.
>
> Commits `ecbff95` (10.2) + `c0f44cb` (10.3-10.5). See SESSIONS
> 2026-05-15 (10.2–10.5).
>
> **Earlier:** **Slice 10.1b — Curriculum
> launcher conversion + shared activity-type icon.** Restructures
> the 10.1 student curriculum viewer: the curriculum page becomes
> a course map / launcher, not a place where content is consumed
> inline. Each activity is a summary row (type icon, title,
> description, note, estimated time) with one action button;
> content consumption moves to per-type viewer surfaces.
>
> **Core model locked.** Curriculum = map; Activity = destination;
> Progress = tracker; Access = gate. 10.1's inline Text render was
> always scaffold — this slice makes the shape honest. Each
> activity type opens its own surface (reading page, PDF, external
> link, session detail, quiz runner), never inline.
>
> **Structural-only — one pushback.** Sam's plan scoped 10.1b as
> gutting `ActivityBody` + adding action buttons. Flagged: Text
> *currently renders*, so buttons that go nowhere would be a
> half-finished state. Resolution — the launcher shape lands and
> every button ships **disabled** (honest "coming" state, not a
> live-looking dead button); each type's actual launch becomes its
> own small slice, taken one at a time. Sam left every per-activity
> launch (even External link, trivially an `<a>`) for those
> follow-on slices.
>
> **New format helpers.** `activityActionLabel` (per-type button
> copy) + `activityEstimatedMinutes` (normalises the
> `estimated_minutes` vs `duration_minutes` per-type payload
> split).
>
> **Shared activity-type icon.** The type→icon map was duplicated
> 4× (`activity-row`, `cohort-curriculum`, `activity-picker`,
> `quiz-placeholder-editor`). Consolidated into one
> `ACTIVITY_TYPE_ICON` const in `format.ts`; all four call sites +
> the student card read from it. Labels stay per-surface ("Text"
> vs "Reading") — only the icon is shared.
>
> **No migration.** Code + test data only. Both test programmes
> were all-Text; seeded one of each remaining type into Unit 1 of
> each (self-paced + tutor-led), plus cohort-checklist backfill so
> the new tutor-led activities surface in the cohort view.
>
> Sam smoke-tested (launcher reads correctly, buttons disabled
> with right copy, estimated-time shows/hides, tutor surfaces
> unchanged) before approving merge.
>
> Commit `a81b7d0`. See SESSIONS 2026-05-15 (10.1b).
>
> **Earlier:** **Slice 10.1 — Student
> curriculum viewer scaffold.** Opens Phase C. First student-
> facing surface — curriculum viewer at `/student/programme/
> [id]/curriculum` (self-paced) and `/student/cohort/[id]/
> curriculum` (tutor-led). Plus an overlay-based programme
> switcher accessible from the picker card, topbar Programme
> pill, and a "Switch programme" button atop each detail
> sidebar. Permissive v1 — any STUDENT can access any PUBLISHED
> programme.
>
> **Architectural calls locked up-front.** ID-in-URL routes
> (`/student/programme/[id]`, `/student/cohort/[id]`) over
> parameter-free — symmetric with the tutor side, future-proof
> for multi-enrolment. Text-only content rendering in 10.1
> (other five activity types stub "viewer coming") — mirrors
> the 9.3b → 9.3d-a/b/c/d authoring cadence. Single-item
> sidebars (Curriculum) — no empty placeholders.
>
> **Mid-slice shift — page → overlay.** Originally shipped a
> `/student/programmes` list route. Sam asked whether selection
> had to be a page at all. Locked Shape B (component-only,
> overlay opens from any trigger). NCLEX students have 1–3
> programmes; the picker already serves the "where do you want
> to go" role. Route deleted; replaced with
> `<ProgrammeSwitcherOverlay>` (lazy-fetched server action) +
> `<ProgrammeSwitcherTrigger>` generic wrapper. Three trigger
> surfaces — picker card, topbar pill, sidebar button — all
> open the same overlay.
>
> **RLS migration**
> (`20260515120000_slice_10_1_student_curriculum_rls.sql`).
> Six `*_student_select` policies (programmes, units, blocks,
> activities, cohorts, checklist items), all gated on
> `programme.status = 'PUBLISHED'`. RLS = hard wall (only
> PUBLISHED leaks); TS `isVisibleToStudents()` = per-row
> render filter (unit/block/activity `is_published`, plus
> cohort `is_included` + `release_date` for tutor-led). Two
> layers, two responsibilities. Both tighten to enrolment-
> aware in the enrolment slice.
>
> **Access helpers** (`lib/access/student/`).
> `requireStudent()` + `requireStudentProgrammeAccess` +
> `requireStudentCohortAccess`. Each returns the loaded shell
> data so callers don't refetch. Permissive v1 — body adds
> the enrolment lookup later, in parallel with the RLS USING
> clause update.
>
> **Queries + viewer.** `getStudentSelfPacedCurriculum` reads
> the programme template directly; `getStudentCohortCurriculum`
> joins through the cohort checklist. Both produce the same
> `StudentCurriculumTree` shape — the viewer doesn't branch on
> delivery mode. Activity body switches on `type`: Text inline,
> the rest stubbed.
>
> **Routes.** New `/student/programme/[programme_id]/...` +
> `/student/cohort/[cohort_id]/...` trees, each with its own
> shell wrapper. Old parameter-free `/student/programme/
> {overview,weeks,sessions,tasks,profile}` placeholders deleted
> (per `routes_not_fixed` — when architecture moves, rebuild).
>
> **Bug found mid-test.** Topbar Programme pill from Bank
> opened the no-programme upsell modal instead of the switcher
> overlay. Bank layout still had `hasProgrammeEnrolment =
> false`; flipped to true for permissive v1.
>
> Sam smoke-tested end-to-end (picker → overlay → cohort →
> curriculum tree; sidebar "Switch programme" → overlay;
> topbar pill from both Bank and inside a programme; ESC and
> backdrop close; DRAFT URL → 404) before approving merge.
>
> **Earlier:** **Slice 9.3f — Cohort
> curriculum checklist.** Closes Phase B. Adds the cohort
> layer's curation surface — every template activity gets a
> per-cohort row with inclusion + release-date controls. The
> tutor authoring tree (units → blocks → activities) and the
> cohort layer are now connected; the next layer is the
> student-facing surface.
>
> **Architectural rule locked.** Cohort = pointer to template,
> not a copy. Content edits propagate (title, body, PDF
> replacement, recording URL). The ONE structural change that
> doesn't auto-propagate is adding a NEW template activity to
> an existing cohort (deferred "add-from-template" affordance).
> Every other structural operation handles itself: DELETE via
> ON DELETE CASCADE; REORDER + MOVE via live join through the
> activity FK; ADD a new block surfaces when an activity is
> moved into it. Sam's plan listed five "doesn't propagate"
> cases — we refined it down to one before code.
>
> **Schema.** New `nclex_cohort_checklist_items` (checklist_item_id
> / cohort_id / template_activity_id / is_included / release_date
> / source / timestamps). UNIQUE (cohort_id, template_activity_id)
> prevents trigger/backfill races. `release_date DATE` (not
> TIMESTAMPTZ — symmetric with cohort.start_date; day-level
> granularity is enough). `source` column ships ready for future
> COHORT_ONLY adds.
>
> **AFTER INSERT trigger on `nclex_cohorts`** seeds one row per
> current template activity with `release_date = start_date +
> (unit_index - 1) × 7 days`. SECURITY DEFINER + REVOKE FROM
> PUBLIC/anon/authenticated, matching the 9.1d lockdown pattern.
> One-shot backfill for existing cohorts.
>
> **Five product calls locked up-front.** Sam accepted all
> recommendations: (1) re-include affordance ships (toggle is
> symmetric — same row, same flip); (2) click-through opens the
> template editor modal (same `<ActivityModal>` as the curriculum
> tab — one editor everywhere); (3) blocks always render even
> when all children excluded (checklist is a control surface,
> not a student preview); (4) individual badges, no synthesised
> "hidden because X" line; (5) inline date input per row (fast
> bulk editing).
>
> **Save-safety layer added mid-build** after Sam flagged a real
> risk ("if a tutor makes changes to different ones quickly they
> don't get saved"). Four pieces:
> - Per-row save status pill — Saving / Saved (1.5s flash) /
>   Failed (sticky).
> - Page-level "Saving N changes…" banner with spinner.
> - `beforeunload` guard while any row is dirty or saving.
> - `onChange` debounce (600ms) alongside `onBlur` — catches
>   calendar-picker change events.
>
> Visibility predicate `isVisibleToStudents()` extended with
> optional `cohortIncluded` and `releaseDate` inputs (and a
> `today` parameter for testability). Self-paced callers pass
> null/undefined; tutor-led student-facing callers pass real
> values.
>
> Sam smoke-tested end-to-end (tab appears, empty-state, toggle
> Included, edit release-date, three-row bulk edit, click-through
> edit, close-tab guard) before approving merge.
>
> Commit `e621afa`. See SESSIONS 2026-05-14 (9.3f).
>
> **Earlier:** **Slice 9.3e — Publish state +
> content visibility.** Wires publish controls through every
> layer of the curriculum tree and ships the single visibility
> predicate that 9.3f will use to filter the cohort checklist.
> Closes the "everything is built but nothing is student-visible"
> gap that's been latent since 9.3a.
>
> **Activity publish toggle.** Adds the missing piece —
> activities had an `is_published` column and a "· Draft" text
> suffix on the row, but no UI to flip it. Now there's a Status
> checkbox in the activity-modal's common-fields section
> (matching the unit + block modal pattern), and the row pill
> mirrors the unit/block pill aesthetic (shared `unit-pill`
> class).
>
> **Per-unit aggregate display.** Unit cards now show a second
> meta line under the existing counts: "*3 of 5 activities live ·
> 1 of 2 blocks live*". Empty units skip it. The cards still show
> the unit's own intention as the pill (not derived) — the meta
> line is child reality. Query: three parallel reads (totals via
> PostgREST embed + two filtered list queries via inner-join
> through `nclex_programme_units` for programme-scoping).
>
> **Visibility predicate.** New `isVisibleToStudents()` in
> `lib/curriculum/format.ts` — single AND-chain across
> `programme.status='PUBLISHED'`, `unit.is_published`,
> `block.is_published` (loose activities skip this), and
> `activity.is_published`. Ships here as the source of truth;
> 9.3f's cohort-checklist query is the first real caller.
>
> **Programme publish/archive.** Two new server actions on
> `lib/programmes/actions.ts`. One-way lifecycle: DRAFT →
> PUBLISHED → ARCHIVED. Publish stamps `published_at` on first
> transition; archive stamps `archived_at`. No cascade to
> children — the dual-publish design explicitly allows draft
> children inside a Live parent. New
> `<ProgrammeStatusControls>` on the Overview page with
> state-dependent buttons (DRAFT → Publish primary + Archive
> ghost; PUBLISHED → Archive danger; ARCHIVED → none) and
> hint copy per state. Archive opens a type-DELETE confirm
> overlay matching the existing destructive pattern; copy
> varies between "active cohorts continue to their end dates"
> (PUBLISHED) and "draft retired without ever going live"
> (DRAFT).
>
> **Three product calls Sam locked up-front.** Sam accepted all
> three recommendations: (1) no cascade on programme publish
> (planning doc's dual-publish rule); (2) unlinked Mock/PQ
> activities CAN be marked Live — flagged from 9.3d-d (defer
> "Quiz coming soon" student-side render to a later slice);
> (3) archive allowed from any state — DRAFT and PUBLISHED both
> flow to ARCHIVED.
>
> **No migration.** All four `is_published` columns + the three
> programme-lifecycle columns shipped in earlier slices. This
> slice is wiring + UI + helpers.
>
> Sam smoke-tested end-to-end (activity Status toggle round-
> trips, second meta line renders correctly, programme
> Publish flips state, Archive confirm gates on DELETE, copy
> adapts to current state, cohort-empty CTA still works,
> unlinked Mock/PQ can publish) before approving merge.
>
> Commit `1ab5f7e`. See SESSIONS 2026-05-13 (9.3e).
>
> **Earlier the same day:** **Slice 9.3d-d — Mock + Practice
> quiz placeholders.** Closes the activity-picker — the last two
> tiles (Mock assessment + Practice quiz) flip live as curriculum
> placeholders. Tutors can now author all six v1 activity types.
>
> **Architectural turn.** The slice was originally specced as
> "metadata-only forms living inside the activity payload"
> (count / time limit / pass score / due date / attempts /
> release-results). Sam came back from a side discussion with a
> better direction: a Mock/Practice activity shouldn't own a
> miniature quiz system. The reusable quiz object will live in a
> future `nclex_tutor_quizzes` table; the activity just carries
> a thin `quiz_id` pointer. The existing attempt schema already
> supports it — `source = PROGRAMME_ASSIGNED`,
> `programme_activity_id`, runner doesn't care where attempts
> come from.
>
> **Option A — curriculum placeholders only.** The activity
> saves; body is non-interactive; no quiz settings, no question
> selection, no student-launch path. The central tutor-quiz
> system + selector ships in its own later slice.
>
> **Future-link payload shape.** Both types use
> `{ quiz_id: string | null }` — null today, will hold a real id
> when the selector ships. Locked rule: no separate
> `quiz_link_status` column — derivable from `quiz_id`, so
> `isQuizLinked(payload)` is a one-line helper in `format.ts`
> (no second source of truth to keep in sync).
>
> **Single shared editor.** New `<QuizPlaceholderEditor type=>`
> in `lib/curriculum/quiz-placeholder-editor.tsx` covers both
> activity types via a type-keyed copy map. Mock copy emphasises
> timed exam-style readiness; Practice quiz copy emphasises
> learning-focused practice. When the future selector ships,
> one file changes — both activity types pick up the wiring
> together.
>
> **Three product/scope questions answered up-front.** Sam
> accepted all three recommendations: (1) drop `quiz_link_status`
> in favour of derivation; (2) shared editor over two; (3)
> differentiated body copy over identical generic.
>
> **No migration.** JSONB column accepts the new payload shape;
> activity-type CHECK constraint already includes MOCK +
> PRACTICE_QUIZ from 9.3a.
>
> Sam smoke-tested end-to-end (create Mock, create Practice,
> edit both, cancel-with-edits discard guard, save-without-title
> error) before approving merge.
>
> Commit `eafc37f`. See SESSIONS 2026-05-13 (9.3d-d).
>
> **Earlier the same day:** **Slice 9.1d — Programme/unit
> auto-sync (defect fix).** Closes a bug from slice 9.1 (shipped
> 2026-05-10): newly-created programmes had an empty curriculum
> tab because nothing seeded their unit rows. The 9.3a migration
> backfilled the 7 programmes that existed at deploy time; every
> programme created since came up empty. Same hole left
> length-edit broken in both directions.
>
> **DB-layer invariant.** Two triggers on `nclex_programmes`:
> `AFTER INSERT` seeds N unit rows; `AFTER UPDATE OF length_units`
> reconciles (INSERT the new tail on increase, DELETE the surplus
> tail on decrease — existing `ON DELETE CASCADE` handles blocks
> + activities). Both functions `SECURITY DEFINER` and scoped to
> the modified programme. One-time backfill in the migration
> catches programmes created since 9.3a.
>
> **App-layer destructive-decrease gate.** `editProgrammeAction`
> gains a `confirmDestructive` param + a `requiresConfirm`
> result variant carrying the impact summary (units, blocks,
> activities, indices). New `<ProgrammeLengthDecreaseConfirm>`
> type-to-confirm overlay in a new `lib/overlays/programmes/`
> folder. Empty trailing units shorten silently — only fires
> when the doomed tail carries real content.
>
> **Two product decisions** locked up-front. Increase: silent
> auto-add. Decrease with content: type-to-confirm cascade
> (chose B over the three alternatives — block / empty-first /
> silent — because we don't yet have a "delete a single unit"
> feature). Decrease without content: silent.
>
> Sam smoke-tested all four paths (create new programme,
> increase, decrease-empty, decrease-with-content) before
> approving merge.
>
> Commit `51d43c4`. See SESSIONS 2026-05-13 (9.1d).
>
> **Earlier the same day:** **Slice 9.3d-c — PDF activity
> (first consumer of the media foundation).** Lights up the PDF
> tile in the activity picker. Tutors can now author TEXT + PDF
> + EXTERNAL_LINK + ONLINE_LIVE_SESSION; MOCK + PRACTICE_QUIZ
> stay "Coming soon" until 9.3d-d.
>
> **Scope split from the original 9.3d-c.** Original 9.3d-c
> bundled PDF + Mock + Practice quiz. Sam asked for PDF first;
> PDF and the question-list types are structurally different
> enough that bundling would have meant a bigger slice without
> shared work. Mock + PQ become **9.3d-d** (next).
>
> **PDF editor.** `<PdfEditor>` body component in
> `lib/curriculum/pdf-editor.tsx`. Two visual states: upload
> picker when no asset attached; file row (`📄 filename · size ·
> [Preview ↗] [Replace]`) when one is. Preview ↗ opens the signed
> URL in a new tab. Replace clears the asset, brings the picker
> back, and the previous asset row is soft-deleted in the same
> save (`status = 'DELETED'`, file stays in bucket for the
> future sweeper per `media-assets.md` §4.7). Save is blocked
> without an attached PDF — error toast "Please upload a PDF
> before saving."
>
> **Payload shape.** `ActivityPayloadPdf` refined from the
> provisional `{ storage_path }` to
> `{ pdf_asset_id, estimated_minutes }`. JSONB payload, no
> DB-level FK (per 9.3a's locked rule); ownership validity
> enforced at the action layer via `validatePdfAssetForSave`.
> No migration needed.
>
> **Server action additions.** `validatePdfAssetForSave` (RLS-
> gated read confirms asset is owned, READY, purpose
> PDF_ACTIVITY); `readExistingPdfAssetId` + `softDeleteAsset`
> drive the replace flow; new `getOwnedAssetPreviewAction(assetId)`
> returns `{ original_filename, size_bytes, signed_url }` for the
> modal's file-row display (used in both edit-mode initial load
> and fresh-upload preview minting). Signed URL minted via
> `getAssetUrl` (service-role, 1-hour TTL — per the 9.3d-b
> foundation).
>
> **Seven product/scope questions answered up-front** — split
> bundle vs all-three; PDF required to save; replace flow (soft-
> delete old); preview UI (link-only); student rendering (deferred
> with the rest); `estimated_minutes` (yes); `displayed_filename`
> override (no — YAGNI).
>
> **`/admin/media-test` removed.** The temporary smoke-test
> route shipped in 9.3d-b is superseded by the real PDF editor.
> Folder deleted in this slice.
>
> Sam smoke-tested end-to-end (create + edit + replace +
> save-without-PDF blocked + Preview ↗ opens) before approving
> merge.
>
> Commit `5d5e71a`. See SESSIONS 2026-05-13 (9.3d-c).
>
> **Earlier the same day:** **Slice 9.3d-b — Media
> foundation.** Centralised media-asset system. Creates
> `nclex_media_assets` (one control row per uploaded file), the
> first Supabase Storage bucket (`nclex-pdf-activities`, private,
> 25 MB cap, `application/pdf` only), a generic upload server
> action, a generic `getAssetUrl` helper, and a generic
> `<UploadField>` component. **No feature integration yet** —
> PDF activity (9.3d-c), avatars, rationale images, future
> videos all become consumers later, each as a one-slice add.
>
> **RLS shape.** Asset table is owner-only:
> `owner_user_id = auth.uid()` OR SUPER_ADMIN for
> SELECT/UPDATE/DELETE; INSERT pins `uploaded_by` and
> `owner_user_id` to `auth.uid()` so a fresh row can't claim
> someone else as uploader. Bucket denies direct reads —
> service-role-minted signed URLs (1-hour TTL) are the
> legitimate read path. Cross-feature access (students viewing
> PDFs they're enrolled to see) does NOT live on the asset row;
> it's gated at the consumer table's own RLS, and `getAssetUrl`
> is called only after that check passes. Keeps the asset table
> single-purpose: it knows nothing about enrolments, cohorts,
> programmes.
>
> **storage_path shape:** `{purpose}/{uuid}.{ext}` —
> e.g. `pdf_activity/8a3...c2.pdf`. Folder-per-purpose keeps the
> dashboard browsable; UUID kills collisions and prevents PII
> leaks via filename echo. `original_filename` preserved
> separately for display.
>
> **Five product questions answered up-front** — bucket name
> scope (renamed `nclex-pdfs` → `nclex-pdf-activities` to leave
> room for future library + admin PDF buckets); PDF-only vs
> Word/PowerPoint (strict PDF-only — renders consistently,
> inline-viewable, no macro vector); bucket propagation to prod
> (same manual MCP-apply path as tables, by putting the bucket
> creation in the migration SQL); RLS shape; `<UploadField>`
> placement (`components/media/`, visual side; plumbing in
> `lib/media/`).
>
> **Temporary `/admin/media-test` route** (SUPER_ADMIN-gated)
> ships in this slice so the foundation can be smoke-tested
> end-to-end before any consumer feature exists. Removed in
> 9.3d-c. Initial `_media-test` folder name 404'd — Next.js
> treats underscore prefixes as "private folders" excluded from
> routing.
>
> Sam smoke-tested end-to-end on dev (upload PDF → asset row
> READY → fetch signed URL → opens in new tab) before approving
> merge.
>
> Commit `05ffcf0`. See SESSIONS 2026-05-13 (9.3d-b).
>
> **Earlier the same day:** **Planning — media assets
> architecture.** Settled the architectural plan at
> `docs/product-plan/media-assets.md` (eight locked decisions)
> and split slice 9.3d-b in two: the foundation slice (this
> shipment) gets the 9.3d-b slot; PDF + Mock + Practice quiz
> become 9.3d-c. See SESSIONS 2026-05-13 (planning).
>
> **Earlier — 2026-05-12:** **Slice 9.3d-a — External link +
> Online live session.** Lights up two more of the six v1
> activity types and adds a shared `description` column across
> all activities. After this slice the picker enables TEXT +
> EXTERNAL_LINK + ONLINE_LIVE_SESSION; PDF / MOCK /
> PRACTICE_QUIZ remain "Coming soon" until 9.3d-c.
>
> **Schema migration (one file, two changes):** Adds
> `nclex_programme_activities.description TEXT` (nullable) —
> symmetric with units + blocks. Distinct semantic from the
> existing `note` column: description is substantive ("what the
> activity is about"), note is operational ("directive to the
> student"). The modal shell renders Title → Description → Note
> → divider in that order. The same migration also renames
> `LIVE_SESSION` → `ONLINE_LIVE_SESSION` in the type CHECK
> constraint — "live" describes synchronicity, "online" the
> medium; the original name conflated two axes. Zero rows to
> migrate (the picker never enabled LIVE_SESSION before now).
> Future pair `IN_PERSON_LIVE_SESSION` (deferred — see below)
> shares the "live" prefix, leaving room for a future
> `RECORDED_SESSION` async type.
>
> **External link editor.** URL \* with two passive affordances
> under it as the tutor types — auto-derived domain chip
> (strips `www.`) + "Open link in new tab ↗" anchor (renders
> only when URL is parseable + http/https). Estimated time
> (optional, minutes) mirrors Text's pattern. Server gate
> restricts URL scheme to http: / https: only so the future
> student-side runner can render the link as a plain `<a>`
> without an XSS vector.
>
> **Online live session editor.** Four fields: When \*
> (datetime-local), Duration \* (minutes), Join URL \*,
> Recording URL (optional, always visible). When input is in the
> tutor's browser-local time — modal converts to UTC ISO on save
> and back to local on edit. Italic help line under the input
> shows the tutor's TZ + GMT offset explicitly. End-time chip
> auto-derived from When + Duration. Provider chip auto-derived
> from join_url host (Zoom / Google Meet / Microsoft Teams /
> Webex / Whereby / fallback host). Recording URL stays
> day-one-visible (no past-only gate) — tutor controls when to
> fill it.
>
> **Modal refactor.** `<ActivityModal>` body state moves from a
> hardcoded `textBody` to an `EditorBodyState` discriminated
> union over the three editor-enabled types (plus an
> UNSUPPORTED sentinel branch for defensive fallback). Per-type
> initial-body readers handle create + edit; per-type
> validation builds the `ActivityFormValues` discriminated
> union the server actions accept.
>
> **Server-action refactor.** `createActivityAction` /
> `editActivityAction` drop the TEXT-only gate and take a
> discriminated `ActivityFormValues` argument (type folded into
> values.type). New `buildPayload()` helper performs per-type
> validation + JSONB payload assembly. `validateHttpUrl()` +
> `validateScheduledAt()` are the per-field gates. Edit pins
> `.eq('type', values.type)` so a stale client can't switch
> types mid-edit.
>
> **Five product questions answered up-front** (External link)
> and **four more** (Online live session) before code — Sam
> accepted recommendations on all of them. One "Requires
> account" toggle was dropped on Sam's pushback: students are
> already authed into MyNclex, and we have no auth relationship
> with non-QAcademy URLs. Good speculative-metadata catch.
>
> **In-person live session (`IN_PERSON_LIVE_SESSION`) deferred.**
> Sam raised the question; YAGNI — no current tutor demand, and
> the relevant design questions (room number? GPS? attendance?)
> are unanswerable without a real workflow. Naming convention
> already captured so adding it later is a one-sitting slice.
>
> Sam smoke-tested both new editors end-to-end (chip updates,
> datetime round-trip, validation errors) before approving
> merge.
>
> Commit `0710cb6`. See SESSIONS 2026-05-12 (9.3d-a).
>
> **Next ⏭:** **Per-type viewers + the cohort access window are
> done.** Open student-side priorities: the student progress
> engine + soft guidance (which also makes due dates *smart* —
> urgency, "you're behind"); the central tutor-quiz system
> (unlocks Mock + Practice quiz); full enrolment + payments system
> (tightens the permissive access helpers shipped in 10.1). Sam to
> pick.
>
> **Earlier the same day:** **Slice 9.3c — Blocks.** Activates
> `nclex_programme_blocks` (shipped empty in 9.3a) via UI + eight
> new server actions. Tutors can group related activities into
> block cards inside a unit; blocks and loose activities
> interleave in a shared ordinal sequence within the unit body.
>
> **UI shape.** Paired "+ Add activity" / "+ Add block" triggers
> at the bottom of the unit body (side-by-side on desktop,
> stacked on mobile). "+ Add block" reveals an inline title
> input — Enter saves, Esc cancels — matching the activity-
> picker's in-place replacement pattern. Description + Live/Draft
> toggle land in the block-edit modal once the block exists.
> Block card carries header (title + Draft pill + Edit / ↑↓ / ✕
> controls) with an internal activity stack and an indented
> "+ Add activity to block" dashed button. Loose-activity rows
> gain a "Move into block →" button (visible only when ≥1 block
> exists); in-block rows gain a "Move out as loose" button.
>
> **Reorder model.** In-block ↑↓ is a single-table sibling swap.
> Loose ↑↓ swaps in the shared unit-body sequence — neighbours
> can be blocks OR other loose activities (cross-table swap via
> `loadUnitBodyOrdinals()` + `swapUnitBodyOrdinals()` helpers).
> No UNIQUE constraint across tables; `composeUnitBody()` (pure
> helper in `lib/curriculum/unit-body.ts`) carries a stable
> tiebreaker so mid-state during a swap reads back coherently.
>
> **Empty-block prevention.** Deleting the last activity in a
> block shows a two-option prompt — *"Move out as loose"* (rescue
> activity, drop the block) or *"Delete the block too"* (cascade
> both). Block-header ✕ shows a yes/no confirm with the cascade
> activity count visible. Type-to-confirm intentionally skipped
> at single-tutor scale.
>
> **Mid-slice refactor — overlays relocation.** Three destructive
> confirms (delete-activity, delete-block, last-in-block prompt)
> + the move-into-block menu moved out of inline JSX in
> `unit-builder.tsx` into a new `lib/overlays/curriculum/` folder
> per CLAUDE.md folder convention #12. Sam called the convention
> after smoke-testing and the relocation was a pure refactor
> mid-slice. `<DiscardConfirm>` reused from `lib/overlays/bank/`
> for the modals' cancel-with-unsaved guards; its eventual move
> to `overlays/shared/` deferred to a later cleanup.
>
> **Five product questions answered up-front before code.** Sam
> accepted all five recommendations: (1) paired triggers
> side-by-side; (2) inline rename for block create rather than
> modal; (3) defer the mockup's "+ New block" wrap-this-activity
> variant ("+ Add block" then "Move into block" achieves the
> same in two clicks); (4) yes/no with cascade count rather than
> type-to-confirm for block delete; (5) two-button stacked
> prompt for last-in-block with italic help under each option.
>
> Schema unchanged — `nclex_programme_blocks` shipped empty in
> 9.3a; this slice only writes to it.
>
> Sam smoke-tested the full flow end-to-end (create block, add
> activity into it, move loose into block, reorder block past a
> loose row, delete last-in-block activity with the two-option
> prompt, delete block with cascade count) before approving
> merge.
>
> Commit `46e9b8b`. See SESSIONS 2026-05-12 (9.3c).
>
> **Earlier the same day:** **Slice 9.3b — Unit Builder + Text
> activity.** First editing surface in Phase B. Tutors open
> a programme's curriculum tab, click a unit card, and land on a
> Unit Builder page (`/curriculum/unit/<unit_id>`) where they can
> author Text activities — add via inline 3×2 type picker (Text
> enabled; other five "Coming soon"), edit by clicking a row,
> reorder via up/down arrows, delete via simple confirm. Unit
> title + description + Live-Draft toggle editable via an "Edit
> unit" modal.
>
> **Activities-as-components, not pages** — `<ActivityModal>` is a
> reusable modal shell holding shared Title + Note fields + a slot
> for the type-specific body. Dispatches on `activity.type` to the
> right body component (`<TextEditor>` in 9.3b; other five in
> 9.3d). Same shell reuses from the cohort-only-activity flow in
> 9.3f without changes. Sam pushed back twice during planning to
> arrive at this shape — first the slide-in panels in the mockup
> were too cramped for real authoring; then the dedicated-page
> idea (intermediate) couldn't reuse from the cohort surface.
> Component-based modal won.
>
> Body field is a plain `<textarea>` in this slice — real
> rich-text formatting deferred to a Phase B polish slice (DB
> column is text-shaped either way, so swap to a real RTE later
> is a UI change, not a migration). Modal uses a wider variant
> (`.activity-modal` at max-width 720px) for authoring-heavy
> forms. Five server actions in `lib/curriculum/actions.ts` cover
> create / edit / delete / reorder activity + edit unit.
>
> Sam verified the flow end-to-end by authoring two real Text
> activities (Acid-Base Imbalance + NCLEX RN Exam Overview, ~30
> min each) in the 8-Week Bootcamp programme's Unit 1.
>
> Commit `e27ffe3`. See SESSIONS 2026-05-12 (9.3b).
>
> **Earlier the same day:** **Slice 9.3a — Curriculum schema +
> Units Overview (read-only).** Opens Phase B. Three new tables
> (`nclex_programme_units` / `_blocks` / `_activities`) with full
> RLS via the programme ownership chain. Backfill seeds N empty
> unit rows per existing programme (62 across the 10 dev rows).
> New `/tutor/programme/<id>/curriculum` route renders the Units
> Overview grid — dashed cards labelled "Week N" / "Module N" via
> the new `unitLabel(index, label)` helper, status pill, "0 blocks
> · 0 activities" meta. Sidebar entry renamed `weeks` →
> `curriculum`; the old `/weeks` placeholder folder deleted, not
> renamed (Sam established the principle: when architecture moves,
> rebuild routes to fit, don't retrofit names). No editing yet —
> Unit Builder is 9.3b.
>
> **Planning conversation that shaped 9.3a (worth remembering):**
> Sam considered `accessible_from` / `close_at` columns on the
> programme-layer tables. Three workflows on the table; resolution:
> access timing is a cohort-layer concept, not a programme-layer
> one. Tutor builds curriculum once; per-block / per-activity
> timing gets set when a cohort is created (not at curriculum
> authoring time). Different cohorts of the same programme can run
> gradual / all-open / manual schedules. Timing columns land on the
> cohort-checklist row in 9.3f. **9.3a's schema has no access /
> timing columns** — the programme tables hold curriculum content
> only.
>
> Activity `payload` is a generic `JSONB` column at the DB level.
> Per-type shapes ship in `lib/curriculum/types.ts` as a
> discriminated union, marked provisional — refined when each type's
> editor ships (Text in 9.3b, the rest in 9.3d).
>
> Commit `794f56c`. See SESSIONS 2026-05-12 (9.3a) for the schema,
> RLS, backfill, and planning detail.
>
> **Earlier the same day:** **Slice 9.2c — Cohort detail subtree.**
> Closed out the 9.2 architecture rework end-to-end.
> Cohorts now have their own workspace at
> `/tutor/cohort/[id]/...` — sibling of the programme workspace
> per CLAUDE.md folder convention #7 (different chrome, sibling
> routes). Five sidebar tabs (Overview / Students / Sessions /
> Announcements / Settings); Overview + Settings are real
> content; the other three are placeholders until enrolment /
> session scheduling / announcements ship. Cohort cards on the
> Cohorts tab are now clickable overlay-links into the new
> subtree.
>
> **Real tabs:** Overview shows Schedule / Enrolment / Programme
> info cards, derived status pill, cancelled banner when
> applicable. Settings stacks two panels: Edit cohort (opens
> `<CohortFormModal>` in edit mode — discriminated union refactor
> adds the edit branch cleanly) and Cancel cohort (red-bordered
> danger card with a one-click confirm dialog). Cancelled cohorts
> disable both panels with status notes. New server actions:
> `editCohortAction` (UPDATE, never touches programme_id — caller
> can't reparent) and `cancelCohortAction` (soft cancel sets
> `cancelled_at`; the `.is('cancelled_at', null)` guard makes it a
> no-op on already-cancelled rows).
>
> **Back-pill** in the cohort topbar reads `← <programme title>`
> and links to the parent programme's Cohorts tab. One level — the
> cohort identity is already shown in the sidebar header.
>
> **9.2 end-to-end milestone:** tutors can create programmes
> (TUTOR_LED or SELF_PACED, WEEK or MODULE), create cohorts of
> tutor-led programmes, navigate into a specific cohort, edit or
> cancel it. Heavier features (enrolments, session scheduling,
> mock due dates, announcements) queue behind their own schemas.
>
> Commit `b4b859f` (19 files, +1080 / −61). See SESSIONS
> 2026-05-12 (9.2c) for the architecture + decision detail
> (modal-reuse vs inline-form for edit; simple confirm for
> cancel; defensive 404 paths).
>
> **Earlier the same day:** Slices 9.2a + 9.2b shipped — schema
> split + Cohorts tab + cohort form modal. See SESSIONS 2026-05-12
> (9.2a + 9.2b).
>
> **9.2a — schema split.** Migration `20260512100000_slice_9_2a_
> programme_cohort_split.sql` applied to mynclex-dev. New
> `nclex_cohorts` table (FK to programmes, dates, seat cap,
> late-join, `cancelled_at`, audit; RLS via parent-ownership
> subquery). `nclex_programmes` loses `start_date` / `end_date` /
> `cohort_size` / `cancelled_at`; gains `delivery_mode` (TUTOR_LED
> / SELF_PACED) + `unit_label` (WEEK / MODULE); `length_weeks` →
> `length_units`. Status enum tightened to DRAFT / PUBLISHED /
> ARCHIVED (CANCELLED moves to `nclex_cohorts.cancelled_at`).
> 7 existing programmes backfilled into one programme + one
> cohort pair each (March Mini-Bootcamp's CANCELLED state moved
> to its cohort row). **Pricing stayed on programme** per
> planning-doc default — cohort-level variation deferred to v2
> (would break self-paced, which has no cohort layer; access-
> window pricing for self-paced is its own unfinalised design).
> **Cohort status is NOT stored** — UPCOMING / IN_PROGRESS /
> ENDED derive from dates; only CANCELLED is persisted. Minimum
> app rewiring in the same slice so /tutor/programmes still
> loads: programme modal stripped Schedule + gained Shape
> section; card schedule line replaced by cohort-count line;
> `getMyProgrammes()` embeds `nclex_cohorts(count)`. Commit
> `c97f972` (10 files, +599 / −313).
>
> **9.2b — Cohorts tab + cohort form modal + entry-point nudges.**
> New `lib/cohorts/` domain (types / format / queries / actions
> / cohort-form-modal / new-cohort-trigger / cohort-list). New
> route `/tutor/programme/[id]/cohorts/` with header +New cohort
> button + empty-state CTA. `Cohorts` added to
> `TUTOR_PROGRAMME_NAV` (after Overview); filtered out by the
> programme-shell for SELF_PACED programmes — the URL itself
> 404s in that mode too. Status derives via `cohortStatus()`
> from stored dates + cancelled_at. End date in the cohort modal
> is **derived from start + programme.length_units × 7**,
> rendered as a read-only chip (not editable) — tutors who need
> a different timeline edit the programme. Snapshot at save so
> later programme-length edits don't silently shift existing
> cohort end-dates. Entry-point nudges: programme card replaces
> "No cohorts yet" with an inline + Add first cohort button when
> `cohort_count === 0` (TUTOR_LED only); programme overview adds
> an empty-state CTA below the placeholder under the same gate.
> New `styles/cohorts.css`. Commit `ef59c9c` (16 files, +1103 /
> −22).
>
> **Scope reshape vs original 9.2b/c.** Combined `<Programme
> WithFirstCohortModal>` dropped — Sam's call: curriculum lives
> at programme layer, tutors naturally build the curriculum
> before scheduling cohorts. Forcing cohort-on-create inverts
> that workflow. The system already handles cohortless
> programmes — DRAFT is invisible publicly anyway, and PUBLISHED
> with zero open cohorts isn't surfaced in the catalogue per
> main.md. Cohorts tab moved from 9.2c into 9.2b so the slice
> ships testable; 9.2c narrows to the cohort detail subtree
> only.
>
> **Deferred product question:** whether to make cohort end-date
> editable later (revision buffer / bank-access extension use
> cases). Tabled in 9.2b's planning conversation. Not v1.
>
> See SESSIONS 2026-05-12 for the planning + bug-hunting detail.

---

## Part 1 — Bank

Sources: `docs/product-plan/bank-consumption.html` (parent),
`bank-consumption-attempt-creation.html`, `bank-consumption-runner.html`,
`bank-consumption-cat.html`, `bank-marks-and-scoring.html`.

### Phase A — Database foundation

- ✅ **2.1** Base attempt tables — `nclex_attempts`, `nclex_attempt_items`, `nclex_attempt_answers`, `nclex_attempt_case_snapshots`, `nclex_attempt_trend_snapshots`. Applied to mynclex-dev 2026-05-05.
- ✅ **2.1.5** Marking table — `nclex_question_marks` applied to mynclex-dev 2026-05-06. Polymorphic single table (`target_kind` ∈ QUESTION/CASE, `target_source` ∈ BANK/TUTOR), row-exists toggle (INSERT/DELETE, no `is_marked` column), partial unique indexes per source to handle nullable `tutor_id`. RLS: students INSERT/SELECT/DELETE own rows, SUPER_ADMIN bypass.
- ✅ **2.2** Create-attempt RPCs — applied to mynclex-dev 2026-05-06 in two sub-slices:
  - **2.2a** `_nclex_eligible_unit_pool` (internal helper, single source of truth for "eligible"), `nclex_count_eligible_items` (returns total + by-question-type breakdown JSONB), `nclex_create_attempt` (target-with-drift selection, snapshots into 4 attempt tables, returns attempt_id). Bank source only in v1; tutor support deferred until programme enrolment lands.
  - **2.2b** `nclex_mark_attempt_started` (preflight Start, idempotent), `nclex_discard_attempt` (ABANDONED + hard-delete snapshot rows). Both ownership-checked against auth.uid() with SUPER_ADMIN bypass.
- ✅ **2.3** Submit-answer — `nclex_submit_answer` RPC shipped 2026-05-07 with slice 4.1.1. Thin INSERT into `nclex_attempt_answers` with status / ownership / score-bound guards; scoring stays in TS via `lib/scoring/scoreAttempt`. `nclex_save_progress` was originally deferred to 4.6 (STUDY drafts only) but pulled into 4.5 during planning — became universal save-on-tap, not STUDY-only. See slice 4.5 below + runner.html §9.1.
- ⬜ **2.4** Complete-attempt + cleanup — `nclex_complete_attempt` ✅ shipped 2026-05-07 with slice 4.1.1 (item-equivalent average, status COMPLETED, idempotent). The two sweeps `nclex_timeout_sweep` (flip expired EXAM attempts to TIMED_OUT) and `nclex_orphan_cleanup` (flip stale started-NULL rows + zero-engagement STUDY rows) ⬜ remain — both on pg_cron, separate slice.
- ✅ **2.6** Filter breakdown RPC — `nclex_filter_breakdown(filters)` returning per-axis row counts for the Builder's honest signals. For each of 9 content axes plus the special pool axis, drops that axis's filter from the active set, expands cases to children, groups by the bank-items column. Shipped 2026-05-06 as part of slice 5.1b. Migration `20260506170000_slice_5_1b_filter_breakdown.sql`.
- ✅ **2.5** Scoring + authoring marks — applied 2026-05-06 in four sub-slices:
  - **2.5a** `lib/scoring/` pure module: 5 scoring functions + `computeMarksFromKey` + `scoreAttempt` + Vitest (40 tests).
  - **2.5b** Marks become system-managed in the editor; backfill migration applied to dev.
  - **2.5c** Live readout in every editor; updates as the curator edits.
  - **2.5d** "Max" column added to admin + tutor `/bank/all` list pages.

  Followed by a hygiene pass: 7 dead case-save / trend-save RPCs dropped, `db/rpcs.sql` retired. See `SESSIONS.md` 2026-05-06 entry.

### Phase B — CAT schema & engine

- ⬜ **3.1** CAT schema package (§12.7 of cat.html) — `difficulty_irt` + `difficulty_source` on bank + tutor tables, 5 CAT cols on `nclex_attempts`, 4 CAT cols on `nclex_attempt_items`, audit table `nclex_bank_item_calibration_history`, RPC stubs (`create_cat_attempt`, `cat_next_item`) raising "not yet implemented." Sam-gated dev → prod.
- ⬜ **3.2** Rasch engine — fill in `create_cat_attempt` and `cat_next_item` bodies with TS Rasch (1PL) math per §4 + §10.2. Selection rule per §7, termination per §9.
- ⬜ **3.3** Recalibration job — weekly batch (Sundays 02:00 UTC), 30-response threshold, 70/30 dampened blend. Runtime location TBD (Supabase pg_cron vs Cloudflare Worker).

### Phase C — Runner (smallest visible loop first)

- ✅ **4.1** Runner shell + MCQ vertical slice — shipped 2026-05-07. `app/(app)/(focused)/session/[attempt_id]/` route replaced the stub from slice 5.1a wholesale. Pulled slice 2.3 (`nclex_submit_answer`) and the COMPLETED side of 2.4 (`nclex_complete_attempt`) into the same build — designed alongside their only consumer. **Mode policy:** all 5 modes render as Untimed Learning behaviour for now (per-Q submit, immediate feedback, free nav, no timer, no sequential lock); per-mode deltas land in 4.5. Built from the `design_handoff_bank_consumption/` runner-v2 prototype as concept-not-source — three-channel cell encoding (fill / marked border / current ring), CVD-safe palette (light green vs dark red), right-edge sticky 240px grid sidebar. Five sub-slices:
  - **4.1.1** RPCs — `nclex_submit_answer` (thin: validates ownership + status=IN_PROGRESS, INSERTs `nclex_attempt_answers`, bumps `last_activity_at`; scoring stays in TS via `lib/scoring/scoreAttempt` so the 40-test suite remains the single source of truth) and `nclex_complete_attempt` (aggregates `final_score` as item-equivalent average per `bank-marks-and-scoring.html` §7, sets status=COMPLETED + ended_at, idempotent). Migrations applied to mynclex-dev, smoke-tested across 8 paths (happy / wrong / double-submit lock / score-out-of-bounds / status guard / final score / idempotency / cross-student ownership).
  - **4.1.2** Page shell — `page.tsx` does sealed-projection load (omits `correct_answer_snapshot_json` / `rationale_snapshot` / `rationale_img_snapshot` while status=IN_PROGRESS — Pillar 2 enforced at the server boundary, not RLS) + status branch. `runner.tsx` top-level container + `runner-topbar.tsx` + `runner-footer.tsx` + `runner-grid.tsx` (cells with filter toggles `All / Marked / Unanswered / Wrong`; no case bands yet — those land with 4.3). `actions.ts` carries `submitAnswerAction`, `completeAttemptAction`, `markStartedAction`. New `styles/runner.css` ports the `--rn-*` token block from the design (drops `.mn` namespace; relies on existing `styles/tokens.css` for `--accent` / `--primary` / etc.).
  - **4.1.3** Preflight — pre-Q1 confirm screen that calls `nclex_mark_attempt_started`; skipped when `started_at` is already set on mount. Localstorage skip-preflight flag deferred to slice 4.6.
  - **4.1.4** MCQ live — `<McqRunner mode="answering" | "review">` in `lib/bank/runner/types/mcq.tsx`. Per runner.html §16.1.1, the `mode` prop is **per-item** (UL hybrid). Per-option feedback shows for every option in review mode (no prefixes — role conveyed by border + verdict pill). Shared `<RationaleBlock>` in `lib/bank/runner/rationale.tsx` renders verdict pill + score + rationale prose + image (`max-height: 320px`, `object-fit: contain`). MCQ is the structural starting point for the other 8 types in slice 4.2.
  - **4.1.5** Finish + MCQ-review-from-mount — Finish CTA (last Q post-submit) calls `completeAttemptAction` → `router.refresh()` → page re-loads in review mode. Topbar timer pill swaps from `Untimed` to `Score · NN%`. Footer status copy swaps to review-mode message. Old stub `session-stub.tsx` removed.
- ✅ **4.2** Remaining question types — each as a single component with `mode: "answering" | "review"` prop in `lib/bank/runner/types/<type>.tsx`, plus an `isXxxComplete` helper that the `getSubmitGate` dispatch in `runner.tsx` consults to enable/disable Submit. Per-type design rules captured in `bank-consumption-runner.html` §5 (per type) and §10.2 (submit gates).
  - ✅ **TF** — thin wrapper around `McqRunner` (TfContent / TfCorrect are aliases). Submit gate: must pick.
  - ✅ **SATA** — multi-select toggle, 4 review states (right / wrong / missed / dim). Submit gate: zero allowed (NCLEX standard, "none apply" is valid).
  - ✅ **SELECT_N** — SATA + cap. Toggle caps additions at N; deselect always allowed. Progressive count line above the options ("Select N." → "X of N chosen · tap to deselect" → "X of N chosen · tap a selected option to swap"). Submit gate: exactly N picks.
  - ✅ **MATRIX** — rows × columns grid with one-pick-per-row radiogroup. Visual hierarchy refined in mockup review (outer + per-row borders, lighter header divider, 20px ○/● glyphs). Submit gate: every row answered.
  - ✅ **HIGHLIGHT** — passage with `[[bracketed]]` chunks. **Universal no-hint design** (settled with Sam): chunks render as plain passage text, students must search. Persistent orientation line above the passage is the safety net. The runner takes over stem rendering for this type only — `RunnerQuestionArea` skips its `.rn-stem` render and instruction moves above the passage. Submit gate: zero allowed.
  - ✅ **CLOZE** — sentence with `{N}` markers; native `<select>` per blank in answering mode. Persistent superscript number before each blank, surviving into review. Hint above the stem progresses (empty → "X of N filled" → "all filled"). Submit gate: every blank filled. Review settled in mock B′ (`docs/scratch/cloze-review-mock.html`): per-blank "<num> CORRECT/WRONG" verdict header coloured by state, then flowing-prose rationale block listing every option's per-choice feedback inline (`<correct option label in green> — rationale. <wrong label in soft red> — rationale. ...`). Pill row dropped — coloured labels in the prose carry the answer-key signal.
  - ✅ **DRAG_DROP** — both ORDERED + SENTENCE subtypes via internal `subtype` switch. **Click-to-place** interaction (NOT real HTML5 drag-and-drop — audience is phone-first and HTML5 DnD has poor touch support). ORDERED renders numbered slot list with `target_text` labels; SENTENCE takes over stem rendering with `[N]` markers becoming inline drop boxes (third type to do stem-takeover after HIGHLIGHT and CLOZE). Hint progression matches CLOZE pattern. Submit gate: every slot filled. Review for ORDERED: unified canonical-order cards (number + target_text + correct token text + per-slot rationale stacked inside the green card). Review for SENTENCE: per-slot verdict prose (`<num> CORRECT/WRONG/SKIPPED` + rationale). Both subtypes get a distractor strip at the bottom listing tokens that weren't the rubric for any slot.
  - ✅ **BOWTIE** — literal bow-tie shape with **click-to-place** tokens. 5 empty drop slots in a 3-column × 3-row grid (left-top + centre + right-top in row 2; left-bot + right-bot in row 3, centre spanning the middle column). Token pool below mirrors the three wings as 3 separate bordered cards. Tokens can only land in slots of their own wing; matching-wing slots pulse-glow as drop targets while a token of that wing is armed. Slot-position semantics for left/right: schema's `BowtieAnswer.{left,right}` is unordered `string[]`, so removing slot[0] when slot[1] is filled rotates the second pick up to slot[0] (state derivation stays pure). Submit gate: every wing filled (2 + 1 + 2). Review: bow-tie keeps shape with green-✓ / red-✕ tinted slots; pool columns transform into feedback columns where every wing token shows in SATA's 4-state palette + per-token rationale below. Per-column header summary swaps to "X right · Y wrong".
- ✅ **4.3** Case-block UX — shipped 2026-05-09. Wrapper-aware `.rn-split` layout (Layout C: `minmax(380px, 1fr) minmax(520px, 720px)`, max-width 1240) when current item has `parent_case_id`. Sticky `<CasePanel>` on the left renders case head (title + "X of 6 answered" pill) + scenario block + filtered tab row + tab body. **Strict progressive disclosure**: tabs and entries hide entirely until `visible_from <= case_position`, re-hide on backward nav (no stickiness — students reason at the point in time the case is at). All three tab shapes supported in `<ChartTabBody>`: built-in narrative (with optional `extra_fields` + `omit_time`), built-in structured, custom_narrative (free_text), custom_grid (rows_cols). `<CjmmStrip>` renders above the question column via `RunnerQuestionArea`'s new `topSlot` prop. Topbar gains optional `caseMeta` ("Case N of M · CJMM step X of 6 · &lt;label&gt;") for case-childs. Grid renders subtle tinted bands behind clustered case-child cells (no labels, visual grouping only); bands wrap across grid rows when a case straddles a 5-column boundary. **No grid auto-collapse** — Sam's call: layout C protects the wrapper at its 380px floor even with grid open, manual control respects user agency. **Case-entry banner** (`lib/hints/practice/case-entry-banner.tsx`) — non-modal, sits above `.rn-split`, fades after ~4s, dismissable; fires on every case entry (not first-time only). 4 test cases seeded into mynclex-dev covering all 8 chart-tab shapes and all 9 question types across the case-childs. See SESSIONS 2026-05-09 (4.3) for the layout discussion (3-mock comparison at varying viewports → Layout C), the entry-cue refinement (modal overlay → non-modal hint banner; exit warning deferred to 4.5), and the seed-bug fix (hardcoded `marks=1` violated `score_awarded ≤ marks_snapshot` for non-MCQ types). Exit-while-mid-case warning queues for 4.5 (paired with mode-specific behaviour where free-nav vs sequential becomes meaningful).
- ✅ **4.4** Trend question rendering — shipped 2026-05-09. When current item has `trend_id` and a matching `TrendSnapshot`, runner wraps question area in `.rn-split` (reusing Layout C from 4.3) with sticky `<TrendPanel>` on the left: kind label ("Trend data · &lt;Kind&gt;" via `kindDefaultLabel`, keeping curator + student labels in sync) + optional scenario + read-only row × timepoint table. Ref-range column auto-shows when any row has it set. **No flag rendering on cell values** — verified against the real NGN exam (NCSBN provides ref ranges but never pre-flags abnormal/borderline values; curator-side flags are author guidance only). New "⤬ Trend" pill in `.rn-q-meta` (via `trendBadge` prop on `RunnerQuestionArea`). **No CJMM strip, no progressive disclosure, no entry banner, no grid bands** — trends are scattered standalones per attempt-creation §8.3, not chained. 9 published trend questions in mynclex-dev cover all 6 kinds. Single new file (`lib/practice/runner/trend/trend-panel.tsx`) + edits to `runner.tsx` (`currentTrendId` derivation + `inTrend` branch), `runner-question-area.tsx` (`trendBadge` prop), and `styles/runner.css` (new `.rn-trend*` block mirroring case-block CSS, `.rn-trend-pill` in same family as `.rn-cjmm-pill`). See SESSIONS 2026-05-09 (4.4) for the design discussion + the curator UX bug surfaced (publishing a question without the parent dataset blocks it from attempts) + the 5.6 backlog item that came out of testing.
- ✅ **4.5** Per-mode behaviour — shipped 2026-05-09 across three sub-slices, fully specced before code started; see runner.html §8 + §9.1 + §13 + §15 (settled) and attempt-creation.html §6.1.3 (revised).
  - ✅ **4.5a** Timer + save-on-tap + auto-submit (foundation) — new `nclex_save_progress(attempt_item_id, answer_json)` RPC + new `nclex_expire_attempt(attempt_id)` RPC. Client-side debounced (~500ms) save wired into all 9 per-type runners via `runner.tsx`'s `onAnswerChange`. UL backported from "submit creates row directly" to "save-on-tap → status flip on Submit" via the existing RPC's promotion path; `nclex_submit_answer` updated to no longer overwrite `answer_changes_json` on the DRAFT promotion path. Topbar pill becomes a live tick — stopwatch (untimed) or countdown (timed). New `lib/practice/runner/clock.ts` with `formatClock` (`mm:ss` / `h:mm:ss`) + `tierFor` (30 / 15 / 5 / 1 min with duration-conditional firing). Sticky max-tier-fired ref enforces escalates-only tone progression. Hide toggle (eye-icon, per-attempt scope, locks after first warning). Auto-expire via lazy detection in `page.tsx` + client-side `useEffect` when remaining ≤ 0 — flips status to TIMED_OUT, AUTO_SUBMITs DRAFT rows, inserts SKIPPED rows for items without answers, transitions to review. Commit `3d33394`. See SESSIONS 2026-05-09 (4.5a).
  - ✅ **4.5b** Submission archetypes (Free-batched + Sequential) — mode-aware footer + feedback timing. New `getArchetype(mode)` helper collapses 8 (mode, intent) tuples into 3 groups (UL / FREE_BATCHED / SEQUENTIAL). `itemMode` corrected to keep DRAFT rows in 'answering' (latent 4.5a bug fixed: page reload no longer falsely shows "Loading review data..." for UL DRAFTs). `pendingAnswers` seeds from DRAFT rows on mount so reload restores in-progress state. Free-batched (UT, TFN) removes per-Q Submit; footer is just Next / Finish; Finish-with-blanks confirmation modal in `lib/overlays/practice/`. Sequential (TS) gets per-Q `Submit & continue` (4.5b: advances + saves like Next; lock semantics in 4.5c) + Prev disabled + "no Skip" gate (must commit). `_flushDrafts` helper extracted from `expireAttemptAction` and reused in `completeAttemptAction`. Migration fix for slice 2.2a oversight: `BEFORE INSERT` trigger sets `duration_seconds = requested_count × 90` for timed modes (UWorld pace; real NCLEX averages ~84 sec/Q). Commit `f407c21`. See SESSIONS 2026-05-09 (4.5b).
  - ✅ **4.5c** Sequential lock + case-exit warning + correctness gate — closing layer. Sequential's `Submit & continue` now actually fires `submitAnswerAction` per-Q (DRAFT → SUBMITTED) + advances; `Submit & finish` does the same for last Q + `completeAttemptAction`. Grid clicks short-circuited in Sequential live mode — grid becomes a pure progress indicator. Case-exit warning for FREE_BATCHED only (Sequential locks Prev + grid; UL has per-Q rhythm) when student tries to leave a partly-answered case via Prev / Next / grid; modal in `lib/overlays/practice/case-exit-confirm.tsx` with per-attempt suppression. **Hot-fix** surfaced during testing: per-Q submit was leaking correctness via grid green/red mid-quiz (contradicts §15 "Batched submit at the end" + Pillar 2). Added `revealCorrectness` flag to `deriveCellFill` / `gridCounts` / RunnerGrid: false for batched live, true for UL live + any review state. Wrong filter chip + correctness legend rows hide when gated. Commit `d1490e8`. See SESSIONS 2026-05-09 (4.5).
- ✅ **4.6** History page + Resume detection — shipped 2026-05-10 across two sub-slices + two bug fixes that surfaced during testing. Save-progress half already shipped in 4.5a/b; what was missing was the entry point UX. See SESSIONS 2026-05-10 for the slice + bug-hunting session.
  - ✅ **4.6a** History page (MVP) — new `/student/bank/history` route replacing the Placeholder. Table card listing every attempt the student has (newest first, capped at 50, no pagination): When · Session · Source·Mode · Result · State · action. Status maps to action: COMPLETED/TIMED_OUT → Review →; IN_PROGRESS → Resume → (DRAFT restore from 4.5b takes over); ABANDONED → no link (hidden by default, toggleable). Search input + source/mode filter chips render disabled as visible placeholders for slice 7.1 polish. Source pill always says "Custom" in v1 (forward-compat for Packs/Programmes via SOURCE_LABEL map). Session column reuses `summariseRecent()` from launchers so each row reads as e.g. "Pharmacology · Hard · 25 Q." New folder `lib/practice/history/` (queries / types / format / table) + new `styles/history.css`. Commit `6cdc9dc`. **Hot-fix during testing** — UL students returning to an in-progress attempt saw "Loading review data…" for previously-submitted Qs. Cause: `page.tsx` applies sealed projection while `status=IN_PROGRESS` (Pillar 2), and `clientUnseal` (per-Q envelope from `submitAnswerAction`) is React state lost on reload. 4.5b correctly set `itemMode='review'` for finalised UL rows but the data those rows need to render was nowhere on the page. Fix: narrow follow-up query in the live branch fetches unseal columns ONLY for items whose answer row is finalised (SUBMITTED / AUTO_SUBMITTED / SKIPPED — never DRAFT); threads through `LiveData.seededUnseal`, seeds `clientUnseal` on mount. Pillar 2 holds — only items the student already submitted get unsealed. `PerItemUnseal` moved to canonical home in `lib/practice/runner/types`. Commit `16537f5`.
  - ✅ **4.6b** Resume banner surfaces EXAM attempts (non-CAT) — extends the banner shipped in 5.1c. Drops the `intent='STUDY'` filter from `get-resumable-attempt.ts` (5.1c filtered to STUDY based on the original §15 rule; 4.5a's revised attempt-creation §6.1.3 made timed EXAM resumable mid-timer). Adds `mode != 'CAT'` defensively for Phase B. Banner sub-line now mode-aware: timed → "Resume soon — the clock kept running while you were away."; untimed → "Pick up exactly where you left off." Commit `80fdbfa`. **Hot-fix during testing** — Sequential resume was stuck. `current` initialised to 0 always; on Sequential resume Q1 was SUBMITTED but `pendingAnswers` only seeds DRAFT rows so Q1 re-rendered in 'answering' mode with empty state. Sequential locks Prev + grid (4.5c) → student stuck; RPC blocks resubmit. Fix: `current` initialiser walks items, lands on first index whose answer row is missing or DRAFT — the natural "where you left off" position. Universal across archetypes (Sequential breaks; UL + Free-batched are UX-improved). Commit `823a2bd`.
- ⏭ **4.7** Mark-for-review toggle — runner button, writes to marking table, persists across attempts.
- ⬜ **4.8** Discard / abandon — modal with type-DELETE-to-confirm, calls `nclex_discard_attempt`.
- ⬜ **4.9** Review state polish — read-only post-completion view, list + detail with filters (All / Wrong / Right / By category / Marked).

### Phase D — Builder (the entry point)

- ✅ **5.1** Builder page UI — `app/(app)/student/bank/practice/` shipped 2026-05-06 across four sub-slices, plus a tab restructure and a bug fix:
  - **5.1a** Spine — three sections (Pool, Content, Intent+Mode) + sticky summary, wired to `nclex_count_eligible_items` (debounced live count) and `nclex_create_attempt` (Start). Stub `/session/[id]` runner placeholder + Discard button. Smart-link UX for CNC↔Subcategory and Subject↔BodySystem (the Subject↔BodySystem map is hardcoded in `lib/bank/builder/filter-config.ts` — DB doesn't carry it).
  - **5.1b** Per-row counts — every checkbox row + pool chip carries an honest count of "what you'd get if you ticked this, holding other filters constant." Backed by the new `nclex_filter_breakdown` RPC (slice 2.6).
  - **5.1d** Tags + Topic + Subtopic axes — the remaining three of the 8 content axes. Server-side fetch of distinct values from the published bank.
  - **5.1c** Entry helpers — Resume banner, Recent Quizzes shortcut, Practise-my-weak-spots one-tap. Built as shared components in `lib/bank/entry-helpers/` for reuse on the Dashboard later. v1 weak-spots heuristic: `pool=Incorrect`, 25 Q, Study + Untimed Learning. Will be replaced by real weakness analytics in slice 7.x.
  - **Tab restructure** — Intent + Mode moved to its own tab in front of Filters. Prevents the "fill out filters, then pick CAT, watch them collapse" UX trap.
  - **All-pool-chip fix** — `All` chip now correctly sends *no pool filter* instead of accidentally AND-restricting to marked items.
  - Mobile variant **deferred** — desktop-only for now. See 5.1e below.
- ⬜ **5.1e** Mobile variant — accordion sections + sticky bottom action bar (live count + Start) on ≤720px. Per Claude Design's 390px artboard. Important because audience is phone-first; deferred until the runner exists so we polish a complete pipeline rather than a half one.
- ✅ **5.2** Recent Quizzes — shipped as part of 5.1c. Top-3 finished attempts as one-tap chips; click restores the saved configuration into the Builder form via `parseFilterPayload`.
- ✅ **5.3** Weak-spots quick-start — shipped as part of 5.1c. v1 heuristic only (`pool=Incorrect`); replace with real analytics when slice 7.x lands.
- ✅ **5.4** Unfinished-session banner — shipped as part of 5.1c (Resume banner). Latent until the runner fires `nclex_mark_attempt_started` and writes answers — currently no real students would see it because the runner stub doesn't call those.
- ⬜ **5.5** Curator tag allowlist — admin UI + table flag marking which tags are student-facing. Only allowlisted tags appear in the builder Tags filter. Currently every distinct published tag surfaces.
- ⬜ **5.6** Source breakdown + filter axis — three combined fixes for case/trend visibility in the Builder, surfaced 2026-05-09 during slice 4.4 testing:
  - **Honest per-type count**: extend `nclex_count_eligible_items` + `nclex_filter_breakdown` to break the per-type tally into `standalone` / `case-linked` / `trend-linked`. Today picking `Question type = MCQ` silently drops case-children's MCQs from the count without telling the student — they can't tell that 24+ MCQs sit unreachable inside cases. Surface as a sub-line under the type axis: *"6 standalone MCQs · 24 more inside cases (un-filterable by type)."*
  - **Source breakdown line**: above the live count, show a one-line expectation-setter — *"Standalone × N · Case-linked × M · Trend-linked × P."* Cases take ~6× the time per unit, so a 25-Q quiz with 2 cases lands closer to 60 min than the standalone 30 min. Students need that signal before they hit Start.
  - **Source filter axis**: new Pool-tab axis "Source" with options `All / Standalones only / Cases only / Trends only / Standalones + trends (no cases)`. Lives alongside History + Marked, not in Filters — it's about which corner of the bank you draw from rather than what content is in the question. Real student needs that aren't expressible today: "drill cases this week," "skip cases for a quick session," "grind all my trend questions in one go."
  
  Scheduled after Phase D-E core slices so it lands alongside Phase F analytics polish.

### Phase E — Preflight, results, help

- ⬜ **6.1** Preflight screen — between builder Start click and Q1; shows config summary, mode-specific note, "skip preflight next time" checkbox (per-mode localStorage). Calls `nclex_mark_attempt_started`.
- ⬜ **6.2** Results screen (fixed-length) — score, session-scoped breakdown across 6 axes, transition to Review.
- ⬜ **6.3** CAT summary page — verdict copy, items-administered fact line, **trajectory graph** (theta over question number, with passing-standard reference + per-item marker), per-Client-Needs-Category breakdown, "Compared to your previous CATs" panel, "Review answers" CTA.
- ⬜ **6.4** Help routes — `app/help/[slug]/` (top-level, public, audience-neutral). First articles: `/help/cat`, `/help/payments`. Linked from CAT preflight + summary footer + dashboard CAT card.

### Phase F — Dashboard, history, analytics

- ⬜ **7.1** History page polish — analytics + filtering layered on the MVP shipped in slice 4.6a. Per-attempt-card details (avg score, time-per-Q distribution, accuracy by axis), filter chips (mode, status, date range), sort options beyond newest-first. CAT-attempt cards open to the CAT summary page (slice 6.3) instead of the runner. The MVP list shipped earlier in 4.6a (pulled forward from this slice during 4.5 close).
- ⬜ **7.2** Analytics page — `app/(app)/student/bank/analytics/`. All 6 breakdown axes with topic/subtopic drill-downs, peer percentile, answer-change tracking, time-per-question drill-down. Thin-slice gating.
- ⬜ **7.3** Per-student-per-question state — materialised view over `nclex_attempt_answers` + marking table. Drives Unseen/Seen/Correct/Incorrect counts in the builder. Refresh on attempt completion. Promote to physical table only if measurable bottleneck.
- ⬜ **7.4** Dashboard surface — `app/(app)/student/bank/dashboard/`. Readiness card (with cold-start gating), Client Needs Category breakdown card (compact), trend, coverage, recent activity, CAT card, consistency indicator.

### Phase G — Multi-audience runner entries

- ⬜ **8.1** Tutor preview into runner — tutors hit `/session/[attempt_id]` to QA assigned content; renders in review-style mode.
- ⬜ **8.2** Admin QA into runner — same surface for content review.

### Deferred to v2 (Bank)

Per the planning docs — explicit non-goals for v1, captured here so we don't drift back to them:

- Readiness Pack source path (pre-curated quizzes sold separately) — full plan exists, not in v1 build.
- Programme-assigned source path — depends on the Programme product, not yet built.
- Real (calibrated) pass-probability number — needs real NCLEX outcome data.
- 2PL / 3PL IRT models — Rasch only for v1.
- Hard CAT content-blueprint enforcement — soft tiebreaker only for v1.
- Cases / trends in CAT — standalone-only for v1.
- Statistically validated peer-percentile model — placeholder until real cohort data.
- Saved filter presets in builder — Recent Quizzes covers v1 use cases.
- Faculty / cohort dashboards — institutional product.
- Spaced repetition — different product promise, not what we build.

---

## Part 2 — Programme

Programme planning passes:

- **2026-04-19 / 04-20** — programme structure, curriculum authoring
  UX, tutor onboarding, payments + enrolment all settled (Cohort /
  Rolling mode dropped on 04-20; visibility now per-activity via
  Live / Draft).
- **2026-05-08** — tutor library architecturally settled, parked until
  programmes / payments / runner ship.
- **2026-05-10** — Phase A scoped: programme list page + create-
  programme modal. Field list locked, schema sketched (provisional —
  expect revisions during build), modal UX agreed.
- **2026-05-11** — Curriculum architecture rework: modules → blocks
  (workflow groupings, not academic chapters); weeks → units
  (generic layer); activities can live loose under a unit OR inside
  a block; **delivery modes** introduced (tutor-led vs self-paced —
  both v1); **unit label** decoupled from delivery mode as a
  separate tutor choice (Week / Module) with smart defaults. All
  seven planning docs + BUILD_LIST.md updated; curriculum-authoring
  mockup visually rebuilt around loose+blocks Unit Builder + dual-
  picker modal.

Sources: `docs/product-plan/main.md` (programme structure + pricing +
tutor onboarding), `curriculum-authoring-ux.md` (tutor authoring
screens), `payments-and-enrolment.md` (self-paid + tutor-added
enrolment), `tutor-nav.html` (global vs programme nav contexts).

### Phase A — Programme foundation

- ✅ **9.1** Programme list + Create + Edit modal — shipped 2026-05-10
  across three sub-slices (b, c added mid-session). Replaces the
  demo-cards stub at `app/(app)/tutor/programmes/page.tsx` with a
  real DB-backed list, plus a single `<ProgrammeFormModal>` that
  handles both create and edit flows. **Provisional shape** — Sam
  surfaced the course/cohort split at session-end; next session will
  rework these onto a programme (syllabus) + cohort (run) model.
  - ✅ **9.1a** Schema + list page — `nclex_programmes` table + RLS
    (SELECT/INSERT/admin policies); `getMyProgrammes()` query;
    `<ProgrammeCard>` with smart schedule line + status pill;
    *Show archived (N)* toggle; empty-state CTA. Migration
    `20260510120000_slice_9_1a_programmes_table.sql`. Wire-up fix:
    `<TutorProgrammeShell>` switched from hardcoded
    `DEMO_PROGRAMME_TITLES` map to `getProgrammeForShell()` so real
    UUIDs no longer 404.
  - ✅ **9.1b** Modal + create flow — `<ProgrammeFormModal>` (10
    fields across 3 sections: Identity / Schedule / Pricing);
    `createProgrammeAction` server action; end-date auto-fill from
    start + length × 7 (with `endDateTouched` flag for tutor
    overrides); `<DiscardConfirm>` + `<ErrorToast>` reuse from
    `lib/overlays/bank/` and `lib/toast/`.
  - ✅ **9.1c** Edit programme — UPDATE RLS policy
    (`nclex_programmes_self_update`); `editProgrammeAction`;
    `<ProgrammeFormModal>` refactored to discriminated `mode:
    'create' | 'edit'`; per-card pencil-icon trigger; overlay-link
    pattern on `<ProgrammeCard>` so the whole card stays clickable
    around the edit button. Submit gated until form is dirty in
    edit mode. Migration
    `20260510130000_slice_9_1c_programmes_update_rls.sql`.
  - ✅ **9.1d** Programme/unit auto-sync — defect fix shipped
    2026-05-13. Sam spotted that newly-created programmes had an
    empty curriculum tab — the 9.3a backfill seeded unit rows for
    programmes existing at deploy time but nothing kept the
    invariant (`count(units) = programme.length_units`) true
    going forward. Same hole left length-edit broken in both
    directions: increase added no new slots; decrease left
    orphan units + content. Fix installs the invariant at the DB
    layer:
    - `AFTER INSERT` trigger on `nclex_programmes` seeds N unit
      rows whenever a programme is created.
    - `AFTER UPDATE OF length_units` trigger reconciles the unit
      count — INSERTs the new tail on increase; DELETEs the
      surplus tail on decrease (existing `ON DELETE CASCADE` on
      blocks → unit + activities → unit/block cleans up
      atomically).
    - Both trigger functions run `SECURITY DEFINER` (justified:
      they only fire after an RLS-gated insert/update on the
      parent programme and operate scoped to that single row).
    - One-time backfill `INSERT … WHERE NOT EXISTS` catches any
      programme created since 9.3a that's currently missing
      units (no-op for the 7 already-seeded ones).

    Application-layer gate against accidental destruction —
    `editProgrammeAction` gains a `confirmDestructive: boolean`
    param + a new `requiresConfirm` result variant.
    `measureDecreaseImpact()` helper queries the doomed unit
    tail and counts blocks + activities + units with metadata
    (title set, description set, is_published true). Empty
    trailing units shorten silently; touched units trip the
    confirm flow.

    New overlay `lib/overlays/programmes/programme-length-
    decrease-confirm.tsx` (new folder per CLAUDE.md rule #9,
    surfaced + confirmed). Type-to-confirm shell modelled on
    `<DeleteConfirm>`. Lists the impact in human form
    ("Reducing the length will permanently delete Weeks 9–12
    and their content (2 blocks, 5 activities)") with a
    contiguous-range formatter on the indices.

    Migration `20260513200000_slice_9_1d_programme_unit_sync.sql`.
    Commit `51d43c4`. See SESSIONS 2026-05-13 (9.1d).

- ✅ **9.2** Programme/Cohort architecture rework — planning settled
  2026-05-10 across 4 questions; curriculum layer architecture
  refined 2026-05-11. All three sub-slices shipped 2026-05-12.
  The architecture, recapped:
  programme = reusable design (curriculum + identity + pricing);
  cohort = one specific run (dates, seats, enrolment, schedule).
  Curriculum (units → blocks (optional) → activities, Phase B —
  see Curriculum architecture rework below) lives at the programme
  layer so content edits propagate to every live cohort. Cohorts
  hold an *explicit-membership checklist* (one row per template
  activity included in the cohort, plus optional cohort-only adds —
  activities or whole blocks). Structural changes to the template
  don't auto-propagate; cohort-only content overrides are not in
  v1. Naming: "Programme" everywhere (no "Template" suffix). Slice
  9.1's `nclex_programmes` schema gets reshaped — date / size /
  late-join fields move out to a new `nclex_cohorts` table; the
  6 seed rows are migrated to a programme + cohort pair each. Also
  adds `programme.delivery_mode ∈ ('TUTOR_LED', 'SELF_PACED')` and
  `programme.unit_label ∈ ('WEEK', 'MODULE')` — **both modes ship
  in v1**; `unit_label` is decoupled from `delivery_mode` as a
  separate tutor choice with smart defaults (TUTOR_LED → WEEK,
  SELF_PACED → MODULE; tutor can override). Build scope below;
  planning docs reflect resolved architecture — main.md,
  curriculum-authoring-ux.md,
  payments-and-enrolment.md, tutor-nav.html, tutor-library.md,
  curriculum-authoring-ux mockup, tutor-library mockup all
  updated 2026-05-10 (programme/cohort split) and 2026-05-11
  (curriculum architecture rework).

  **Curriculum architecture rework (2026-05-11) — what 9.2 must
  carry forward into the schema (Phase B):**
  - Modules retired; **blocks** are now workflow groupings of
    related activities (often tutorial-anchored), not academic
    chapters. Empty blocks aren't allowed.
  - Weeks abstracted to a generic **units** layer. Programme
    `length` stored as a unit count.
  - **Both delivery modes ship in v1.** `programme.delivery_mode`
    drives presence/absence of the cohort layer + how access is
    gated (cohort release dates vs `is_published` + progression).
  - **Unit label is decoupled from delivery mode.** New column
    `programme.unit_label ∈ ('WEEK', 'MODULE')`. Smart default
    in the create-programme form (TUTOR_LED → WEEK; SELF_PACED →
    MODULE); tutor can override. Editable later (label-only flip,
    no migration). All UI label sites use a `unitLabel(programme)`
    helper rather than hardcoding "Week".
  - Activities can live **loose under a unit** OR inside a block.
    Schema implication: `activity.unit_id NOT NULL`,
    `activity.block_id NULLABLE`. Same shape mirrors into the
    cohort-checklist FK pair (`unit_id` + nullable `block_id`)
    and into the Library Note attachment table when that ships.
  - Provisional table names for Phase B: `nclex_programme_units`,
    `nclex_programme_blocks`, `nclex_programme_activities` (the
    canonical names land with the slice; tutor-library doc
    inherits whatever names ship).
  - Self-paced surface (deltas only — see main.md → Self-paced
    surface): no cohort layer, direct enrolment with access
    window per enrolment, no release dates, no calendar view.
    The new screens (self-paced enrolment flow, self-paced
    student dashboard, tutor view of enrolled self-paced
    students) are queued for the slice that ships self-paced —
    drafted in curriculum-authoring-ux.md → "Self-paced surface
    (screen 12+)".
  - ✅ **9.2a** Schema split — shipped 2026-05-12. Migration
    `20260512100000_slice_9_2a_programme_cohort_split.sql`
    applied to mynclex-dev. Adds `nclex_cohorts` (FK to
    programmes, dates, seat cap, late-join, `cancelled_at`,
    audit) with parent-ownership RLS. Drops `start_date` /
    `end_date` / `cohort_size` / `cancelled_at` from
    `nclex_programmes` after backfilling 7 existing rows into a
    programme + cohort pair each. Adds `delivery_mode`
    (TUTOR_LED / SELF_PACED) + `unit_label` (WEEK / MODULE);
    renames `length_weeks` → `length_units`. Programme status
    tightens to DRAFT / PUBLISHED / ARCHIVED (CANCELLED moves
    to cohort's `cancelled_at`). Cohort status is NOT stored —
    UPCOMING / IN_PROGRESS / ENDED derive from dates; only
    CANCELLED is persisted. Pricing stayed on programme
    (cohort-level variation remains a v2 deferral; see
    SESSIONS 2026-05-12 → 9.2a planning conversation). Minimum
    app rewiring landed same-slice so /tutor/programmes still
    loads: programme modal Schedule section deleted, replaced
    by a Shape section (delivery_mode + unit_label + length);
    card schedule line replaced by cohort-count line;
    `getMyProgrammes()` embeds `nclex_cohorts(count)`. Commit
    `c97f972`.
  - ✅ **9.2b** Cohorts tab + cohort form modal + entry-point
    nudges — shipped 2026-05-12. **Scope reshape**: original
    `<ProgrammeWithFirstCohortModal>` (combined create) was
    dropped — curriculum lives at programme layer, tutors
    build the curriculum first and add cohorts when they're
    ready to enrol. Cohorts tab moved from 9.2c into 9.2b so
    the slice ships a testable end-to-end flow. New
    `lib/cohorts/` domain (types / format / queries / actions
    / cohort-form-modal / new-cohort-trigger / cohort-list).
    New route `/tutor/programme/[id]/cohorts/`. `Cohorts`
    added to `TUTOR_PROGRAMME_NAV` (after Overview); filtered
    out by the programme-shell for SELF_PACED programmes
    (direct nav to the URL 404s too). End date in the cohort
    modal derives from start + `programme.length_units × 7`,
    rendered as a read-only chip — tutors who need a different
    timeline edit the programme; snapshot at save so later
    programme-length edits don't silently shift existing
    cohorts. Entry-point nudges per the (a)+(b) choice: card
    replaces "No cohorts yet" text with an inline + Add first
    cohort button when `cohort_count === 0` (TUTOR_LED only);
    overview adds an empty-state CTA below the placeholder
    under the same gate. New `styles/cohorts.css`. Deferred
    product question: whether to make cohort end-date editable
    later (revision-buffer / bank-access extension). Commit
    `ef59c9c`.
  - ✅ **9.2c** Cohort detail subtree — shipped 2026-05-12.
    Sibling routes under `/tutor/cohort/[cohort_id]/...` per
    CLAUDE.md folder convention #7 (NOT nested under programme).
    Five sidebar tabs: Overview + Settings real, Students +
    Sessions + Announcements placeholders until their schemas
    ship. New chrome (`<TutorCohortShell>` + sidebar + back-pill).
    `getCohortForShell()` embeds the parent programme via
    PostgREST `nclex_programmes!inner(...)` for a single round
    trip. New server actions: `editCohortAction`,
    `cancelCohortAction` (soft cancel — sets `cancelled_at`,
    reversible by admin). `<CohortFormModal>` refactored to
    discriminated union `{ mode: 'create' | 'edit' }`. Cohort
    cards become clickable overlay-links into the subtree.
    Settings tab uses modal-reuse for edit (cheaper than building
    an inline form) and simple confirm dialog for cancel (not
    type-to-confirm — cancellation is reversible). Programme-
    sidebar items conceptually at cohort layer (Live Sessions /
    Mocks / Students / Results) still co-exist on the programme
    workspace; their migration is a separate planning slice.
    Commit `b4b859f`.

### Phase B — Curriculum (units → blocks → activities)

Sub-sliced 2026-05-12. Sources: `docs/product-plan/curriculum-
authoring-ux.md` (screens 1–11), `main.md` → Programme Structure
(delivery modes, unit label, curriculum, propagation rules).

The full Phase B build covers: three new template tables
(`nclex_programme_units`, `nclex_programme_blocks`,
`nclex_programme_activities`), the Units Overview grid, the Unit
Builder (loose + blocked entries with up/down reorder), the 3×2
inline activity-picker, six activity-type editors, programme-level
publish state, and the cohort-side checklist that mirrors the
template tree. Calendar view + cohort-only activities + duplicate-
programme flows are deferred out of Phase B.

**Routing.** Everything lives under `/tutor/programme/<id>/curriculum/...`
— the URL segment is `curriculum` regardless of the programme's
`unit_label`. Sidebar label is dynamic ("Weeks" or "Modules") via
the `unitLabel(programme)` helper. The existing `/weeks` placeholder
is deleted at 9.3a (not renamed) — routes aren't compulsory; we
rebuild to suit.

- ✅ **9.3a** Schema + Units Overview (read-only) — shipped
  2026-05-12. Migration
  `20260512200000_slice_9_3a_curriculum_schema.sql` applied to
  mynclex-dev. Three new tables (`nclex_programme_units` /
  `_blocks` / `_activities`) with full RLS via programme-ownership
  chain (full CRUD policies + SUPER_ADMIN bypass per table).
  Backfill seeded 62 empty unit rows across 10 dev programmes (one
  per `length_units` slot). Routing: `/weeks` route folder deleted
  (not renamed); new `/tutor/programme/<id>/curriculum` renders the
  Units Overview grid. Sidebar entry renamed `weeks` →
  `curriculum`; tab label is **static "Curriculum"** (the Week /
  Module distinction surfaces on the cards via the new
  `unitLabel(unitIndex, label)` helper in `lib/curriculum/format.ts`,
  not on the sidebar). Cards render dashed with "Draft" pill + "0
  blocks · 0 activities" meta. Activity `payload` is generic JSONB
  at the DB level; per-type discriminated union ships in
  `lib/curriculum/types.ts` marked provisional — refined per type
  when each editor lands. **Planning decision** locked here: access
  timing (when an activity opens for students) is a cohort-layer
  concept, not a programme-layer one — the programme tables have
  no `accessible_from` / `close_at` columns; timing columns land on
  the cohort-checklist row in 9.3f. Commit `794f56c`. See SESSIONS
  2026-05-12 (9.3a).
- ✅ **9.3b** Unit Builder + Text activity (first type) — shipped
  2026-05-12. Route `/tutor/programme/<id>/curriculum/unit/<unit_id>`
  with the loose-activity stack. Inline 3×2 type picker (Text
  enabled; other five "Coming soon"). **Activities-as-components,
  not pages** — `<ActivityModal>` is a reusable modal shell holding
  shared Title + Note fields + a slot for the type-specific body
  (`<TextEditor>` in 9.3b; the other five in 9.3d). Same shell
  reuses from the cohort-only-activity flow in 9.3f. Modal uses a
  wider variant (`.activity-modal` at max-width 720px) for
  authoring-heavy forms. Body is a plain textarea in this slice —
  real RTE deferred to Phase B polish. Five server actions in
  `lib/curriculum/actions.ts` cover create / edit / delete /
  reorder activity + edit unit. Up/down reorder arrows; simple
  yes/no delete confirm (not type-to-confirm — low-stakes). Unit
  cards on the curriculum tab became clickable overlay-links into
  the Unit Builder. No blocks yet — flat unit body only. Commit
  `e27ffe3`. See SESSIONS 2026-05-12 (9.3b).
- ✅ **9.3c** Blocks — shipped 2026-05-12. Activates
  `nclex_programme_blocks` (shipped empty in 9.3a) via UI + eight
  new server actions. Paired "+ Add activity" / "+ Add block"
  triggers at the bottom of the unit body (side-by-side desktop,
  stacked mobile). "+ Add block" reveals an inline title input
  (Enter saves, Esc cancels); description + Live/Draft toggle
  edited later via the block-edit modal. Block card carries
  header + internal activity stack + indented "+ Add activity
  to block". Loose-activity rows gain "Move into block →"
  (visible only when ≥1 block exists); in-block rows gain
  "Move out as loose". Reorder is single-table within a block
  and cross-table in the unit body (`loadUnitBodyOrdinals()` +
  `swapUnitBodyOrdinals()` helpers). Empty-block prevention:
  deleting the last activity in a block shows a two-option
  prompt (Move out as loose / Delete the block too); block-
  header ✕ shows a yes/no confirm with cascade activity count.
  Destructive confirms (delete-activity, delete-block, last-
  in-block, move-into-block menu) live in
  `lib/overlays/curriculum/` per folder convention #12 — Sam
  flagged the inline-JSX pattern mid-slice and the relocation
  was a pure refactor. Shared `<ActivityRow>` extracted so
  loose + in-block rows render identically.
  `composeUnitBody()` lives in `lib/curriculum/unit-body.ts`
  as a pure helper — first attempt put it in `queries.ts`
  and webpack flagged the `next/headers` leak into the client
  bundle. Five product questions answered up-front before code
  (Sam accepted all five recommendations). Commit `46e9b8b`.
  See SESSIONS 2026-05-12 (9.3c).
- ✅ **9.3d-a** External link + Online live session + shared
  `description` column — shipped 2026-05-12 (commit `0710cb6`).
  Migration adds `nclex_programme_activities.description TEXT`
  (nullable) symmetric with units + blocks, and renames the
  `LIVE_SESSION` type to `ONLINE_LIVE_SESSION` (no rows to
  migrate — picker had it disabled). Modal shell renders
  Title → Description → Note → divider. New
  `<ExternalLinkEditor>` (URL + estimated time + auto-derived
  domain chip + "Open in new tab" anchor; server gate restricts
  scheme to http:/https: only) and `<OnlineLiveSessionEditor>`
  (datetime-local in tutor-local TZ → UTC ISO; end-time chip
  auto-derived; provider chip from join_url host — Zoom / Meet
  / Teams / Webex / Whereby / fallback; recording URL always
  visible). `<ActivityModal>` body state refactored to a
  discriminated union over the three editor-enabled types.
  Server actions take a discriminated `ActivityFormValues`
  argument, drop the TEXT-only gate, validate per-type.
  Nine product questions answered up-front; Sam accepted all
  recommendations. `IN_PERSON_LIVE_SESSION` deferred (YAGNI
  per CLAUDE.md — naming convention captured; cheap to add
  later). See SESSIONS 2026-05-12 (9.3d-a).
- ✅ **9.3d-b** Media foundation — shipped 2026-05-13. Centralised
  media-asset system. Locked bucket name `nclex-pdf-activities`
  (scoped to tutor PDFs for curriculum only — library / admin PDFs
  each get their own buckets in their own slices). PDF-only MIME
  allow-list (Word / PowerPoint excluded — rendering drift,
  download friction, macro-malware vector). Asset table is
  owner-only RLS; bucket denies direct reads; service-role-minted
  signed URLs (1-hour TTL) are the legitimate read path; consumer
  features verify access at their own layer before calling
  `getAssetUrl`. Temporary `/admin/media-test` route ships in this
  slice as the smoke-test surface (removed in 9.3d-c).
  Commit `05ffcf0`. See SESSIONS 2026-05-13 (9.3d-b).

  **What shipped:**
  - `nclex_media_assets` table with full schema per
    `media-assets.md` §3 (asset_id, media_type, purpose,
    storage_provider, bucket, storage_path, original_filename,
    mime_type, size_bytes, status, uploaded_by, owner_user_id,
    timestamps). `uploaded_by` ON DELETE RESTRICT preserves
    audit; `owner_user_id` ON DELETE SET NULL on owner removal.
    UNIQUE (storage_provider, bucket, storage_path) guards
    against duplicate rows pointing at the same physical file.
  - RLS policies — owner-only SELECT/UPDATE/DELETE
    (`owner_user_id = auth.uid()` OR SUPER_ADMIN); INSERT pins
    `uploaded_by = auth.uid() AND owner_user_id = auth.uid()`.
  - First bucket: `nclex-pdf-activities` — private, 25 MB cap,
    MIME allow-list `application/pdf` only. `storage.objects`
    INSERT policy lets authenticated users upload to this bucket;
    SELECT/UPDATE/DELETE deliberately absent so direct reads fail
    and signed URLs are the only legitimate read path.
  - Generic `uploadAssetAction(file, purpose)` in
    `lib/media/actions.ts` — application-layer MIME + size
    pre-check, asset row insert (status=UPLOADING), storage
    upload, status flip to READY, soft-delete on any failure.
  - Generic `getAssetUrl(asset_id)` in `lib/media/queries.ts` —
    uses service-role client to bypass asset-table RLS (consumer
    layer has already gated access); returns direct URL for
    public buckets, 1-hour signed URL for private.
  - Generic `<UploadField>` in `components/media/upload-field.tsx`
    — auto-uploads on file pick; four-state machine (idle →
    uploading → done / error); reads `PURPOSE_CONFIG` for
    `accept=` + validation messages.
  - `lib/supabase/server.ts` — new `createServiceRoleClient()`
    helper. Per-request, server-only. First named helper for
    service-role in `lib/supabase/`.
  - `styles/media.css` — new domain CSS, wired into
    `app/(app)/layout.tsx`.

  **What does NOT ship here:**
  - No feature wiring yet. PDF activity (9.3d-c), avatars,
    rationale images all become consumers later.
  - No `*_asset_id` columns on other tables. Those land
    per-feature.
  - No sweeper job. Soft-delete only; sweeper deferred per
    `media-assets.md` §4.7.
  - No legacy field migration. `avatar_url` and `rationale_img`
    stay untouched on existing tables until per-feature
    migration slices.

- ✅ **9.3d-c** PDF activity (first consumer of the media
  foundation) — shipped 2026-05-13. Bundle split from the
  original "three remaining types": PDF here; Mock + PQ
  become 9.3d-d. `ActivityPayloadPdf` refined to
  `{ pdf_asset_id, estimated_minutes }`. New `<PdfEditor>` with
  two visual states (upload picker / file-row card). Save
  blocked without a PDF. Replace flow soft-deletes the previous
  asset row (`status = 'DELETED'`) in the same save. Three new
  helpers in `actions.ts` (`validatePdfAssetForSave` ownership
  gate, `readExistingPdfAssetId` for replace, `softDeleteAsset`
  for the cleanup); new exported server action
  `getOwnedAssetPreviewAction(assetId)` returns
  `{ original_filename, size_bytes, signed_url }` for the
  modal's file row in both initial-edit-load and fresh-upload
  cases. PDF added to picker's `ENABLED_TYPES`. Temporary
  `/admin/media-test` route deleted (superseded by the real
  editor). No migration — JSONB payload accepts the new shape;
  ownership integrity at the action layer (per 9.3a's locked
  rule). Commit `5d5e71a`. See SESSIONS 2026-05-13 (9.3d-c).
- ✅ **9.3d-d** Mock + Practice quiz placeholders — shipped
  2026-05-13. Scope reworked from the original "metadata-only
  forms" plan: a Mock/Practice activity won't own its own quiz
  settings. The reusable quiz object lives in a future
  `nclex_tutor_quizzes` table; the activity carries a thin
  `quiz_id` pointer. The existing attempt schema already
  supports it (`source = PROGRAMME_ASSIGNED`,
  `programme_activity_id`). Both types ship as curriculum
  placeholders today — the activity saves, the body is non-
  interactive, no student-launch path. Payload is
  `{ quiz_id: string | null }` (null until the selector ships).
  Single shared `<QuizPlaceholderEditor type=>` with type-keyed
  copy. New `isQuizLinked(payload)` helper in `format.ts`
  (derived, not stored). `ENABLED_TYPES` covers all six types
  now. `buildPayload` switch grows a shared MOCK/PRACTICE_QUIZ
  branch returning `{ quiz_id: null }`. No migration. Commit
  `eafc37f`. See SESSIONS 2026-05-13 (9.3d-d).
- ✅ **9.3e** Publish state + content visibility — shipped
  2026-05-13. Adds the missing activity Status toggle inside the
  activity-modal (matching the unit/block modal pattern);
  replaces the `· Draft` text suffix on activity rows with a
  real `unit-pill`-class pill; adds a second "X of Y live"
  meta line on each unit card via two new filtered queries
  merged into the existing grid. New `isVisibleToStudents()`
  predicate in `format.ts` — AND-chain across the four
  publish flags. Two new server actions in `lib/programmes/`:
  `publishProgrammeAction` (DRAFT → PUBLISHED, stamps
  `published_at`) + `archiveProgrammeAction` (DRAFT or PUBLISHED
  → ARCHIVED, stamps `archived_at`). New
  `<ProgrammeStatusControls>` on the Overview page with
  state-dependent buttons + per-state hint copy; new
  `<ProgrammeArchiveConfirm>` type-DELETE overlay (copy varies
  between "active cohorts continue" and "draft retired"). Three
  product calls locked: no cascade on publish, unlinked Mock/PQ
  CAN go Live, archive allowed from any non-terminal state. No
  migration. Commit `1ab5f7e`. See SESSIONS 2026-05-13 (9.3e).
- ✅ **9.3f** Cohort curriculum tab (checklist) — shipped
  2026-05-14. Closes Phase B. Migration adds
  `nclex_cohort_checklist_items` (one row per template activity
  per cohort, with `is_included` + `release_date DATE` + `source`
  reserved for future COHORT_ONLY adds). AFTER INSERT trigger on
  `nclex_cohorts` seeds rows on creation; one-shot backfill in
  the migration. Cohort = pointer to template — content edits
  propagate; reorder + move + delete propagate via live join
  and CASCADE; only structural change that doesn't propagate is
  adding a NEW template activity (deferred "add-from-template"
  affordance). RLS via 2-hop ownership chain (checklist → cohort
  → programme → tutor); SECURITY DEFINER trigger with REVOKE
  PUBLIC/anon/authenticated. New `getCohortChecklist()` query
  composes the tree in TS (units + blocks + checklist-rows-joined-
  with-activities). Two new actions
  (`setChecklistItemIncludedAction` + `setChecklistItemReleaseDateAction`).
  `<CohortCurriculum>` client component with click-through-to-
  template-editor (reuses `<ActivityModal>`). Five product calls
  locked. **Save-safety layer** added mid-build per Sam's request:
  per-row save status pill (Saving / Saved flash / Failed), page-
  level "Saving N changes…" banner, `beforeunload` guard while
  dirty, onChange debounce + onBlur on date inputs. Visibility
  predicate `isVisibleToStudents()` extended with cohort context
  + `today` test parameter. Commit `e621afa`. See SESSIONS
  2026-05-14 (9.3f).

### Phase C — Student-facing curriculum

The student side of the Programme — the curriculum viewer, the
per-type activity viewers, and access timing. One-liners here;
full write-ups live in the "Last shipped / Earlier" header above
and in SESSIONS.

- ✅ **10.1** Student curriculum viewer scaffold — `/student/programme/[id]/curriculum` + `/student/cohort/[id]/curriculum`, overlay programme switcher, `*_student_select` RLS migration. Commit `b99adb4`. See SESSIONS 2026-05-15 (10.1).
- ✅ **10.1b** Curriculum launcher conversion + shared activity-type icon — the curriculum page becomes a course map / launcher; per-type content moves to its own viewer surface. `ACTIVITY_TYPE_ICON` consolidated. Commit `a81b7d0`. See SESSIONS 2026-05-15 (10.1b).
- ✅ **10.2** External link viewer — first per-type viewer; the shared `<ActivityAction>` dispatch + `<ViewerModalShell>` are built here. Commit `ecbff95`. See SESSIONS 2026-05-15 (10.2–10.5).
- ✅ **10.3** Online live session viewer — modal: session time in the student's zone, provider, Join button, recording link, Upcoming/Happening-now/Ended status. Commit `c0f44cb`.
- ✅ **10.4** PDF viewer — modal; mints a short-lived signed URL on open via the new `getStudentPdfActivityUrl` action (link never stored). Commit `c0f44cb`.
- ✅ **10.5** Text reading viewer — wide variant of `<ViewerModalShell>`; plain-text body (rich-text + a dedicated reading route deferred). Commit `c0f44cb`. See SESSIONS 2026-05-15 (10.2–10.5).
- ✅ **10.6** Locked activity rows — `isVisibleToStudents()` split so a future release date LOCKS the activity (visible "Opens &lt;date&gt;" row) instead of HIDING it. Commit `6db89cf`.
- ✅ **10.7** Activity window (due + close dates) — `due_date` + `close_date` nullable columns on `nclex_cohort_checklist_items`; `StudentActivity.openState` is a 3-way (LOCKED / OPEN / CLOSED); tutor checklist row gains Due + Closes inputs. Migration `20260515160000`. Commit `6db89cf`. See SESSIONS 2026-05-15 (10.6–10.7).
- ✅ **10.8** Tabbed student curriculum — one unit visible at a time via a horizontal tab strip; `?unit=N` URL state; single-unit programmes hide the tabs. Standalone tab strip above a separate body card (Sam's "Interpretation A" pick after three design iterations). No schema, no query changes. Tutor curriculum + cohort checklist deliberately left scroll-based (authoring surfaces benefit from cross-unit visibility). See SESSIONS 2026-05-15 (Slice 10.8).
- ⬜ **Mock + Practice quiz viewers** — the last two per-type viewers. Blocked on the central tutor-quiz system (Follow-on, below): both render disabled "Open" buttons until a quiz can be linked and launched.

### Follow-on: Central tutor-quiz system

The reusable quiz object lives in its own `nclex_tutor_quizzes`
table, not inside the activity payload (decision locked 9.3d-d).
Full plan + settled schema: `docs/product-plan/tutor-quiz-system.md`.
Build arc:

- ✅ **Slice 1** Quiz foundation — `nclex_tutor_quizzes` +
  `nclex_tutor_quiz_items` (migration `20260516120000`), tutor
  RLS, and the `/tutor/quizzes` list + `/tutor/quiz/[id]` editor
  surface (metadata modal + ordered question list + question
  picker). "Mocks" leaves the programme nav; "Quizzes" joins the
  global tutor nav. Also back-ported 7 tables that had drifted
  out of `db/schema.sql` / `db/rls.sql`. Commit `33729ec`. See
  SESSIONS 2026-05-16.
- ✅ **Slice 2** Link to activity — the Mock/Practice activity
  editor's placeholder becomes a "Choose a quiz" selector (picks
  from the tutor's PUBLISHED quizzes of the matching kind); stores
  `payload.quiz_id`. `buildPayload` gates publishing against an
  unlinked quiz; `validateQuizForActivity` re-checks ownership +
  kind + published status. Commit `670a878`. See SESSIONS
  2026-05-17. (The cohort-checklist "needs a quiz" visual cue was
  deferred as polish — the publish gate already prevents the
  breakage.)
- ✅ **Slice 3** Student launch — the
  `nclex_create_programme_attempt` RPC (fixed-list snapshot,
  `source = PROGRAMME_ASSIGNED`, populates the new
  general-purpose `nclex_attempts.pass_score` column); the Mock +
  Practice `<ActivityAction>` goes live as the modal viewer
  (`<QuizLaunchViewer>`, in the per-type viewer family);
  max-attempts check (terminal statuses only — resume handles
  IN_PROGRESS); pass/fail badge on the runner's review-mode
  topbar pill. End-of-quiz popup split out as Slice 3a (universal,
  not programme-only). Migration `20260517120000`. See SESSIONS
  2026-05-15.
- ✅ **Slice 3a** Universal end-of-quiz results popup — score +
  pass/fail + 3-action set (Review attempt jumps to Q1 / Take
  again or Build another / Exit). Source-aware from day one:
  serves Mock + Practice + bank Builder + future Readiness Packs
  equally. Auto-shown on completion-in-this-session, re-openable
  via the topbar Score pill after dismiss. Bundled three exit
  smartness fixes surfaced in testing: new
  `resolveAttemptExitHref()` shared resolver (cohort-first
  per Permissive v1, self-paced programme URL fallback) feeds
  popup / topbar / preflight; topbar prop became
  `onExit: () => void` so the runner can interpose a confirm
  modal in live mode; new `exit-attempt-confirm.tsx` with
  timed-vs-untimed copy; preflight's Back button source-aware
  via `exitBackLabel(source)`. Pre-slice: dev tutor-question
  option ids normalised to A/B/C/D/E across 23 rows + seed file
  rewritten. No schema. See SESSIONS 2026-05-15 (Slice 3a).
- ⬜ **Slice 4** Progress / analytics — quiz completion →
  activity completion → unit/programme progress → tutor
  analytics. Depends on the student progress engine — now rolled
  into the progress-engine Slice 5 (same blocker on enrolment,
  same ship moment).
- ✅ **Slice 5** Programme-level quiz membership (tutor surface) —
  new junction table `nclex_programme_quizzes` (composite PK,
  auto-mirrored from activity-link saves; canonical source of
  truth for "what quizzes are in this programme"). New
  `/tutor/programme/[id]/quizzes` page with two equal-weight add
  paths (Add existing picker for PUBLISHED quizzes / New quiz
  creates DRAFT + auto-attaches + redirects to editor). Per-row
  remove uses a simple destructive confirm (no type-to-confirm —
  recoverable action) and BLOCKS when the quiz is still
  activity-linked in this programme (§9.3 copy verbatim, no
  per-activity deep links — simpler than the prototype proposed).
  Source hint on each row (`Linked to Unit N` / `Standalone`,
  derived from the activity LEFT JOIN). Sidebar item between
  Curriculum and Live Sessions. "Used in N programmes" chip on
  `/tutor/quizzes` (3 tones; forward-compat shape). RLS: tutor
  own + superadmin + student select on the junction; new student
  SELECT policy on `nclex_tutor_quizzes` (PUBLISHED + attached to
  PUBLISHED programme). Migration `20260519120000`. Commit
  `b6e693e`. See SESSIONS 2026-05-16 (tutor-quiz Slices 5 + 6).
- ✅ **Slice 6** Programme-level quiz membership (student surface) —
  new `/student/programme/[id]/quizzes` + `/student/cohort/[id]/quizzes`
  (shared view; cohort resolves to parent programme). Junction-driven
  listing with progress-engine state pill cascade (`✓ Done` /
  `In progress` / `Up next`/`Start here` / `Not started`; exhausted
  rows drop the pill — disabled button carries the meaning).
  Filters by kind + state. **Launch routing (Option 2):**
  activity-linked rows route their launch through the existing
  `<QuizLaunchViewer>` with the resolved primary activity (one
  counter per row, matching what the student would see in
  Curriculum); standalone-only rows use a new
  `<StandaloneQuizLaunchViewer>` + new RPC. Schema:
  `nclex_attempts` gains nullable `programme_id` + `quiz_id`
  (standalone-only), relaxed source_refs CHECK, partial index.
  New SECURITY DEFINER RPC
  `nclex_create_standalone_quiz_attempt(programme_id, quiz_id)`
  enforcing the §9.7-B cap (per-(student, quiz, programme)
  terminal attempts on standalone rows). Sidebar item with icon
  `book` (distinct from bank-side `target` for Readiness Packs).
  `.quiz-pill-kind-*` classes hoisted to `quiz.css` so Slice 5 +
  Slice 6 share. Migration `20260520120000`. Commit `466141c`.
  See SESSIONS 2026-05-16 (tutor-quiz Slices 5 + 6).

**Deferred enhancement — richer question filtering.** The quiz
question picker (and `/tutor/bank/all`, which shares the filter
vocabulary) need a stronger filter system before a tutor can
comfortably build quizzes from a large bank — notably **tags** as
a filter axis, alongside the current type / category / difficulty
/ text search. Surfaced 2026-05-16 while reviewing Slice 1. Slot
when the bank grows enough that the current filter set feels thin.

**Deferred follow-on — add-from-template for cohort checklists.**
A template activity added to the programme *after* a cohort exists
doesn't auto-propagate into that cohort's checklist (Slice 9.3f's
one explicit non-propagation case). Surfaced again during Slice 3
testing — Sam couldn't see the Pharmacology Mock activity in his
cohort because it was added after the cohort was created. The
workaround (link the existing Pharmacology quiz to a *different*
activity that *is* in the cohort) worked, but the affordance is
real and will land when a tutor actually needs it for a real
cohort situation.

**Deferred follow-on — cohort-level quiz divergence (cohort
Quizzes tab).** A tutor running multiple cohorts of the same
programme will eventually want to vary the quiz set per cohort
(cohort-unique additions, possibly subtraction, possibly per-
cohort release dates). Settled now: cohort sidebar gains a
**Quizzes** tab between Curriculum and Sessions; cohort view =
programme's quizzes + cohort-unique extras. **Implementation
shape (additive-only vs full checklist vs hidden-checklist)
deliberately deferred to the build slice** — depends on whether
per-cohort scheduling or subtraction is in scope by then. Three
options compared in §9.9 of `docs/product-plan/tutor-quiz-system.md`.
Build fires when a real tutor asks for cohort-unique quizzes,
subtraction, or per-cohort release dates.

### Follow-on: Progress engine

The student-progress layer for tutored Programmes. Tracks
"is this activity done for this student?", rolls up to unit /
programme / cohort completion, and feeds three downstream
surfaces in one shot. Full plan + settled schema:
`docs/product-plan/progress-engine.md`. Build arc:

- ✅ **Slice 1** Engine foundation (visible) —
  `nclex_student_activity_progress` table + composite + partial
  indexes + `nclex_progress_on_attempt_terminal()` trigger function
  + AFTER UPDATE OF status trigger + three RLS policies (migration
  `20260518120000`); new `lib/progress/` folder with `types.ts` +
  `queries.ts`; `StudentActivity.isDone` flag fetched in parallel
  with the curriculum tree; small green ✓ on the row header when
  done. Commit `1453726`. See SESSIONS 2026-05-16.
- ✅ **Slice 2** Manual completion + state pills —
  `markActivityDone` / `unmarkActivityDone` server actions (quiz
  types reject; un-mark scopes to MANUAL only); shared
  `<MarkDoneButton>` rendered at the foot of all 4 manual viewers;
  live-session viewer disables the button while UPCOMING/LIVE
  (marking attendance only meaningful when ENDED). Mid-slice
  refinement: row state markers upgraded from absence-as-NOT_STARTED
  to symmetric labelled pills (`✓ Done` + `○ Not started`) via a
  shared `.student-activity-state` class. Commit `6bad6c9`.
- ✅ **Slice 3** Soft guidance (cascade, Where I left off, unit %) —
  `getInProgressQuizAttempts()` derives the IN_PROGRESS map from
  `nclex_attempts`; producer wires `upNextActivityId`,
  `whereILeftOffUnitIndex`, `hasAnyDone`, per-unit
  `progressDone/Total/Pct`. Pill cascade (priority): Done > In
  progress (quiz, amber) > Up next / Start here (accent, copy on
  hasAnyDone) > Not started (muted). Tab strip gets `pct?` per-tab
  and `defaultIndex` (resume-first); URL `?unit=N` always wins;
  clean URL when picked matches default. Commit `c89a3ff`.
- ✅ **Slice 4** Programme history split — split
  `PROGRAMME_ASSIGNED` attempts out of `/student/bank/history` into
  dedicated `/student/programme/[id]/history` +
  `/student/cohort/[id]/history` surfaces (cohort variant resolves
  to parent programme — attempts attach to template, not cohort).
  Sidebar gains "Quiz History" item alongside Curriculum. New
  programme-history table with activity dropdown filter, activity
  title + unit label + DONE badge, pass/fail verdict in the Result
  column. Bank history filters out programme-source rows. Commit
  `2a345f2`.
- ✅ **Slice 4b** Attempt count column — new "Attempt" column
  ("N of M" / "N") via attempt_ordinal computed over the full
  filtered-to-programme set (stable when older attempts fall off
  the visible window) + max_attempts via service-role read of
  `nclex_tutor_quizzes`. Honest fallback when ordinal > cap (drops
  "of M" rather than render "3 of 2"). Lays the data groundwork
  for retake-from-history (future). Commit `fda868d`.
- ⬜ **Slice 5** Tutor analytics + cohort dashboards — same engine
  read pattern (§6.2 of the plan), scoped per cohort. Build-blocked
  on enrolment (the "students in this cohort" relation doesn't
  exist yet). Engine schema doesn't wait; this slice does. Will
  ship alongside tutor-quiz Slice 4 when enrolment lands.

**Deferred follow-on — retake-from-history.** A Retake button on
the programme history page that starts a fresh attempt against the
row's activity. Builds on Slice 4b's attempt-count column (knows
"shots remaining"). Data path is complete (cap + ordinal already
on every row); slice is pure UX wiring (per-row "can retake" gate,
reuse of `startProgrammeQuizAction` from Tutor-Quiz Slice 3,
navigate to new attempt). Doc captured under §10 of the plan.

**Deferred follow-on — wider % counting use.** The
`done / total × 100` pattern shipped at the unit-tab scope (§8.3)
extends trivially to programme-level (§7.2 already specced),
block-level, and cohort dashboards. No schema work — same
`isDone` flag, same flatten, different denominator. Sam to return
with specific visual treatments (programme % header? picker cards?
per-block badges?).

**Backfill (deliberate non-ship).** Pre-existing terminal
programme attempts have no progress rows (trigger only fires on
UPDATE → terminal status; attempts taken before the migration
don't get a row). Sam's call: no real users yet, dev only, no need
today. If prod has real users with terminal attempts before the
migration runs there, add a one-line `INSERT … SELECT FROM
nclex_attempts`.

### Follow-on: Payments & enrolment

Slice order from the adopted Claude Design proposal
(`docs/product-plan/design-handoff/payments-and-enrolment/index.html`
§1). Policy source of truth: `docs/product-plan/payments-and-enrolment.md`.

- ✅ **Slice 1** Off-platform tutor-add — `nclex_enrolments` table +
  RLS (`4b49f62`), tutor cohort roster + add-student (`b92e974`),
  roster embed fix (`6995d46`), and the `/welcome` invite-landing page
  (`2c09173`). A tutor types name + email → Supabase invite (new) or
  attach (existing) → ENROLLED row; invited student sets a password on
  `/welcome` and lands in the app. See SESSIONS 2026-05-20.
- ✅ **Slice 2a** Tutor lifecycle state machine — five SECURITY DEFINER
  RPCs (approve/reject/pause/unpause/cancel) + status-aware roster
  buttons + confirm dialogs; direct tutor UPDATE policy dropped
  (RPC-gated). Migration `20260524120000`. Commits `e141479` (db) +
  `e91b151` (feat). See SESSIONS 2026-05-20.
- ✅ **Slice 2b** Student status pills — enrolment status (Enrolled /
  Pending / Paused / Cancelled / Expired) on the programme switcher
  rows; informational only, no access gating. Commit `d704e83`.
- ⏭ **Access-gating step** — make status actually CONTROL access: UX
  lock for non-ENROLLED rows + tighten the `*_student_select` RLS on
  cohorts/programmes/curriculum to enrolled-only. Two layers move
  together. Now safe (real enrolment data exists).
- ⬜ **Slice 3** Programme deltas + discovery + detail — `price_currency`
  / `price_minor` / `payment_collection_mode` / `access_window_days` on
  `nclex_programmes` (drops dual GHS/USD); public discovery list +
  programme detail page (read-only). Also unblocks the pg_cron
  EXPIRED/PAUSED sweep (needs `access_window_days`).
- ⬜ **Slice 4** Student-initiated waitlist (off-platform) —
  `nclex_cohort_waitlist` + "Join waitlist" form + tutor "convert to
  enrolment" one-click.
- ⬜ **Slice 5** On-platform checkout (single-strategy) — payment Worker
  + `nclex_products` + `nclex_payments` + bank opt-in card; upfront-full
  only; email dup-check pause.
- ⬜ **Slice 6** Subscriptions + bank standalone — `nclex_subscriptions`
  + bank-tier purchases + standalone bank landing.
- ⬜ **Slice 7** Multi-strategy + installments —
  `nclex_programme_payment_strategies` + nightly cron PAUSE on overdue +
  manual tutor override.
- ⬜ **Slice 8** Self-paced + enquiry routing — `cohort_id = NULL`
  branch + `show_price_publicly = FALSE` contact path +
  `nclex_programme_enquiries`.

**Deferred from the proposal's Slice 2** — pg_cron EXPIRED/PAUSED nightly
sweep (no data to act on until Slice 3's `access_window_days` /
installments) + admin-grant enrolment path (no admin surface yet).

**Email (locked, not built).** When transactional email lands (with the
Slice 5/6 receipts): React Email components sent directly from server
actions (no separate worker needed on the Workers stack); two channels —
Supabase auth emails (custom SMTP / template, or Send-Email-Hook later)
vs app-triggered transactional via Resend. `/welcome` contract: the
invite-creating flow must create the profile + STUDENT role first.

### Deferred out of Phase B

- **Calendar view** (screen 3 alt — Mon–Sun grid of scheduled
  activities). Needs release dates from 9.3f + its own UI build.
  Slot as 9.3g if needed in v1, else push to Phase B+ polish.
- **Cohort-only activities** (cohort can add an activity / block
  that doesn't exist in the template). v1 of the cohort checklist
  is remove-only overrides; cohort-only adds queue behind the first
  real "tutor needs this for one cohort only" demand.
- **Real rich-text editor** for Text activities — textarea ships in
  9.3b; a proper RTE (H2/H3/B/I/lists/link/image) is a polish slice
  after the curriculum is functionally complete.
- **Duplicate programme / duplicate cohort** flows — listed in
  Programme Structure as tutor capabilities; UI mockup deferred.
- **`IN_PERSON_LIVE_SESSION` activity type** — surfaced during
  9.3d-a planning. Names paired (`ONLINE_LIVE_SESSION` already
  shipped; `IN_PERSON_LIVE_SESSION` reserved with shared "LIVE"
  prefix so a future `RECORDED_SESSION` async type fits the
  family without renames). One-sitting slice when a tutor
  actually asks — adds a value to the type CHECK constraint,
  one new body editor, one picker tile flip. Deferred on YAGNI
  grounds because no current demand and the design questions
  (room number? GPS? attendance tracking?) are unanswerable
  in the abstract.

### Deferred to v2 (Programme)

- Public self-serve tutor signup (tutors are manually vetted in v1).
- Payment splits / marketplace billing between QAcademy and tutors.

---

## How to use this file

When a slice lands, flip ⬜ → ✅ and link the SESSIONS.md entry. When a
slice gets started, flip → 🔨. The "next" marker (⏭) moves down one row
each time we close a slice. Anything found mid-build that doesn't fit
the current slice goes either into a later slice (add a line) or
"Deferred to v2" (with a one-line reason).

Don't expand this into a project plan. Keep it a list.
