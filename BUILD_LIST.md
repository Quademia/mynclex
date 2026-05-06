# MyNclex Build List

Bank consumption work, in the order we're likely to build it. Each line
is one slice. Not exhaustive — design surprises happen — but the shape
is settled.

Sources: `docs/product-plan/bank-consumption.html` (parent),
`bank-consumption-attempt-creation.html`, `bank-consumption-runner.html`,
`bank-consumption-cat.html`, `bank-marks-and-scoring.html`.

Status legend: ✅ done · 🔨 in progress · ⏭ next · ⬜ pending

> **Last shipped (2026-05-06):** slice 2.1.5 — `nclex_question_marks` table
> applied to mynclex-dev. Polymorphic single table covering both bank and
> tutor sources at QUESTION + CASE granularity, row-exists toggle
> semantics. See `SESSIONS.md` for details. Next pick: `2.2` create-attempt
> RPCs — the bigger slice that unblocks the runner.

---

## Phase A — Database foundation

- ✅ **2.1** Base attempt tables — `nclex_attempts`, `nclex_attempt_items`, `nclex_attempt_answers`, `nclex_attempt_case_snapshots`, `nclex_attempt_trend_snapshots`. Applied to mynclex-dev 2026-05-05.
- ✅ **2.1.5** Marking table — `nclex_question_marks` applied to mynclex-dev 2026-05-06. Polymorphic single table (`target_kind` ∈ QUESTION/CASE, `target_source` ∈ BANK/TUTOR), row-exists toggle (INSERT/DELETE, no `is_marked` column), partial unique indexes per source to handle nullable `tutor_id`. RLS: students INSERT/SELECT/DELETE own rows, SUPER_ADMIN bypass.
- ⏭ **2.2** Create-attempt RPCs — `nclex_count_eligible_items` (live count + Q-type breakdown), `nclex_create_attempt` (validate, pick units, expand cases, snapshot), `nclex_mark_attempt_started` (preflight Start), `nclex_discard_attempt` (manual ABANDONED).
- ⬜ **2.3** Submit-answer + save-progress — `nclex_submit_answer` RPC (calls the per-type scoring functions already shipped in `lib/scoring/` from slice 2.5), `nclex_save_progress` RPC for STUDY drafts. Scoring math itself lives in `lib/scoring/` and is done; this slice is just the RPC plumbing that calls it.
- ⬜ **2.4** Complete-attempt + cleanup — `nclex_complete_attempt` (sets `final_score` as item-equivalent average, status COMPLETED), `nclex_timeout_sweep` (flip expired EXAM attempts to TIMED_OUT), `nclex_orphan_cleanup` (flip stale started-NULL rows + zero-engagement STUDY rows). Both sweeps on pg_cron.
- ✅ **2.5** Scoring + authoring marks — applied 2026-05-06 in four sub-slices:
  - **2.5a** `lib/scoring/` pure module: 5 scoring functions + `computeMarksFromKey` + `scoreAttempt` + Vitest (40 tests).
  - **2.5b** Marks become system-managed in the editor; backfill migration applied to dev.
  - **2.5c** Live readout in every editor; updates as the curator edits.
  - **2.5d** "Max" column added to admin + tutor `/bank/all` list pages.

  Followed by a hygiene pass: 7 dead case-save / trend-save RPCs dropped, `db/rpcs.sql` retired. See `SESSIONS.md` 2026-05-06 entry.

## Phase B — CAT schema & engine

- ⬜ **3.1** CAT schema package (§12.7 of cat.html) — `difficulty_irt` + `difficulty_source` on bank + tutor tables, 5 CAT cols on `nclex_attempts`, 4 CAT cols on `nclex_attempt_items`, audit table `nclex_bank_item_calibration_history`, RPC stubs (`create_cat_attempt`, `cat_next_item`) raising "not yet implemented." Sam-gated dev → prod.
- ⬜ **3.2** Rasch engine — fill in `create_cat_attempt` and `cat_next_item` bodies with TS Rasch (1PL) math per §4 + §10.2. Selection rule per §7, termination per §9.
- ⬜ **3.3** Recalibration job — weekly batch (Sundays 02:00 UTC), 30-response threshold, 70/30 dampened blend. Runtime location TBD (Supabase pg_cron vs Cloudflare Worker).

## Phase C — Runner (smallest visible loop first)

- ⬜ **4.1** Runner shell + MCQ vertical slice — `app/(app)/(focused)/session/[attempt_id]/` route, page container, minimal chrome, MCQ component reading from snapshot tables. End-to-end: seed an attempt manually, render Q1, submit, see right/wrong. **First student-visible thing.**
- ⬜ **4.2** Remaining 8 question types — TF, SATA, Select-N, Matrix, Highlight, Cloze, Drag-drop, Bow-tie. Each as a single component with `mode: "answering" | "review"` prop. Reuse the existing authoring-editor previews as the structural starting point.
- ⬜ **4.3** Case-block UX — case panel (scenario + chart tabs), CJMM step labels, mount/unmount at block boundaries, "Case complete. Continuing…" transition.
- ⬜ **4.4** Trend question rendering — trend panel (dataset display) alongside each trend question, kind-specific rendering.
- ⬜ **4.5** Per-mode behaviour — timer (wall-clock for EXAM, engagement-clock for STUDY-timed), navigation (sequential vs free-nav), feedback timing (per-Q vs end-of-quiz), warning thresholds.
- ⬜ **4.6** Save-progress + Resume — periodic save of in-progress answers (STUDY only), Resume detection on mount, restore to last-viewed Q.
- ⬜ **4.7** Mark-for-review toggle — runner button, writes to marking table, persists across attempts.
- ⬜ **4.8** Discard / abandon — modal with type-DELETE-to-confirm, calls `nclex_discard_attempt`.
- ⬜ **4.9** Review state polish — read-only post-completion view, list + detail with filters (All / Wrong / Right / By category / Marked).

## Phase D — Builder (the entry point)

- ⬜ **5.1** Builder page UI — `app/(app)/student/bank/practice/`. Intent picker (Study/Exam) → filtered Mode cards, content filters (8 axes, checkboxes), pool filters (6 chips), sticky summary panel with live count + breakdown preview + Start button.
- ⬜ **5.2** Recent Quizzes — last 3 configurations as one-tap chips above the form.
- ⬜ **5.3** Weak-spots quick-start — one-tap button that auto-configures + starts a quiz on the student's weakest slices (gated on cold-start threshold).
- ⬜ **5.4** Unfinished-session banner — "You have an unfinished quiz from [timestamp] — 14 of 25 done" with Resume / Start fresh actions.
- ⬜ **5.5** Curator tag allowlist — admin UI + table flag marking which tags are student-facing. Only allowlisted tags appear in the builder Tags filter.

## Phase E — Preflight, results, help

- ⬜ **6.1** Preflight screen — between builder Start click and Q1; shows config summary, mode-specific note, "skip preflight next time" checkbox (per-mode localStorage). Calls `nclex_mark_attempt_started`.
- ⬜ **6.2** Results screen (fixed-length) — score, session-scoped breakdown across 6 axes, transition to Review.
- ⬜ **6.3** CAT summary page — verdict copy, items-administered fact line, **trajectory graph** (theta over question number, with passing-standard reference + per-item marker), per-Client-Needs-Category breakdown, "Compared to your previous CATs" panel, "Review answers" CTA.
- ⬜ **6.4** Help routes — `app/help/[slug]/` (top-level, public, audience-neutral). First articles: `/help/cat`, `/help/payments`. Linked from CAT preflight + summary footer + dashboard CAT card.

## Phase F — Dashboard, history, analytics

- ⬜ **7.1** History page — `app/(app)/student/bank/history/`. List of attempts; opens to Review for fixed-length, to CAT summary page for CAT.
- ⬜ **7.2** Analytics page — `app/(app)/student/bank/analytics/`. All 6 breakdown axes with topic/subtopic drill-downs, peer percentile, answer-change tracking, time-per-question drill-down. Thin-slice gating.
- ⬜ **7.3** Per-student-per-question state — materialised view over `nclex_attempt_answers` + marking table. Drives Unseen/Seen/Correct/Incorrect counts in the builder. Refresh on attempt completion. Promote to physical table only if measurable bottleneck.
- ⬜ **7.4** Dashboard surface — `app/(app)/student/bank/dashboard/`. Readiness card (with cold-start gating), Client Needs Category breakdown card (compact), trend, coverage, recent activity, CAT card, consistency indicator.

## Phase G — Multi-audience runner entries

- ⬜ **8.1** Tutor preview into runner — tutors hit `/session/[attempt_id]` to QA assigned content; renders in review-style mode.
- ⬜ **8.2** Admin QA into runner — same surface for content review.

## Deferred to v2 (or later)

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

## How to use this file

When a slice lands, flip ⬜ → ✅ and link the SESSIONS.md entry. When a
slice gets started, flip → 🔨. The "next" marker (⏭) moves down one row
each time we close a slice. Anything found mid-build that doesn't fit
the current slice goes either into a later slice (add a line) or
"Deferred to v2" (with a one-line reason).

Don't expand this into a project plan. Keep it a list.
