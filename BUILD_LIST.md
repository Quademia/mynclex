# MyNclex Build List

Bank consumption work, in the order we're likely to build it. Each line
is one slice. Not exhaustive — design surprises happen — but the shape
is settled.

Sources: `docs/product-plan/bank-consumption.html` (parent),
`bank-consumption-attempt-creation.html`, `bank-consumption-runner.html`,
`bank-consumption-cat.html`, `bank-marks-and-scoring.html`.

Status legend: ✅ done · 🔨 in progress · ⏭ next · ⬜ pending

> **Last shipped (2026-05-06):** the entire Builder UI — slice 5.1
> shipped end-to-end across four sub-slices (a/b/c/d), a tab restructure
> that moves Intent + Mode in front of Filters, an All-pool-chip
> semantics fix, and one new RPC `nclex_filter_breakdown` that powers
> the per-row honest counts on every checkbox + pool chip. Builder is
> verified end-to-end on standalone-question paths against mynclex-dev:
> filter → live count → Start → snapshot rows materialise → discard
> works. Cases + trends will surface naturally once curators publish
> real content (the helper logic handles them; dev DB has none
> published yet).
>
> **Next pick:** `4.1` runner shell + MCQ vertical slice. Closes the
> take-the-quiz loop; pulls slices 2.3 (submit-answer) and 2.4
> (complete-attempt) into the same session — they're best designed
> alongside their only consumer.

---

## Phase A — Database foundation

- ✅ **2.1** Base attempt tables — `nclex_attempts`, `nclex_attempt_items`, `nclex_attempt_answers`, `nclex_attempt_case_snapshots`, `nclex_attempt_trend_snapshots`. Applied to mynclex-dev 2026-05-05.
- ✅ **2.1.5** Marking table — `nclex_question_marks` applied to mynclex-dev 2026-05-06. Polymorphic single table (`target_kind` ∈ QUESTION/CASE, `target_source` ∈ BANK/TUTOR), row-exists toggle (INSERT/DELETE, no `is_marked` column), partial unique indexes per source to handle nullable `tutor_id`. RLS: students INSERT/SELECT/DELETE own rows, SUPER_ADMIN bypass.
- ✅ **2.2** Create-attempt RPCs — applied to mynclex-dev 2026-05-06 in two sub-slices:
  - **2.2a** `_nclex_eligible_unit_pool` (internal helper, single source of truth for "eligible"), `nclex_count_eligible_items` (returns total + by-question-type breakdown JSONB), `nclex_create_attempt` (target-with-drift selection, snapshots into 4 attempt tables, returns attempt_id). Bank source only in v1; tutor support deferred until programme enrolment lands.
  - **2.2b** `nclex_mark_attempt_started` (preflight Start, idempotent), `nclex_discard_attempt` (ABANDONED + hard-delete snapshot rows). Both ownership-checked against auth.uid() with SUPER_ADMIN bypass.
- ⬜ **2.3** Submit-answer + save-progress — `nclex_submit_answer` RPC (calls the per-type scoring functions already shipped in `lib/scoring/` from slice 2.5), `nclex_save_progress` RPC for STUDY drafts. Scoring math itself lives in `lib/scoring/` and is done; this slice is just the RPC plumbing that calls it. **Bundled with 4.1** — designed alongside the runner that calls it, not in isolation.
- ⬜ **2.4** Complete-attempt + cleanup — `nclex_complete_attempt` (sets `final_score` as item-equivalent average, status COMPLETED), `nclex_timeout_sweep` (flip expired EXAM attempts to TIMED_OUT), `nclex_orphan_cleanup` (flip stale started-NULL rows + zero-engagement STUDY rows). Both sweeps on pg_cron. **`nclex_complete_attempt` bundled with 4.1**; the two sweeps come later as their own small slice.
- ✅ **2.6** Filter breakdown RPC — `nclex_filter_breakdown(filters)` returning per-axis row counts for the Builder's honest signals. For each of 9 content axes plus the special pool axis, drops that axis's filter from the active set, expands cases to children, groups by the bank-items column. Shipped 2026-05-06 as part of slice 5.1b. Migration `20260506170000_slice_5_1b_filter_breakdown.sql`.
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

- ⏭ **4.1** Runner shell + MCQ vertical slice — `app/(app)/(focused)/session/[attempt_id]/` route (currently a stub from slice 5.1a — replace wholesale), page container, minimal chrome, MCQ component reading from snapshot tables. End-to-end: filter on Builder → Start → preflight → render Q1 → submit → see right/wrong → next. Includes slice 2.3 (`nclex_submit_answer`) and the COMPLETED side of 2.4 (`nclex_complete_attempt`) — those RPCs are designed alongside their consumer here.
- ⬜ **4.2** Remaining 8 question types — TF, SATA, Select-N, Matrix, Highlight, Cloze, Drag-drop, Bow-tie. Each as a single component with `mode: "answering" | "review"` prop. Reuse the existing authoring-editor previews as the structural starting point.
- ⬜ **4.3** Case-block UX — case panel (scenario + chart tabs), CJMM step labels, mount/unmount at block boundaries, "Case complete. Continuing…" transition.
- ⬜ **4.4** Trend question rendering — trend panel (dataset display) alongside each trend question, kind-specific rendering.
- ⬜ **4.5** Per-mode behaviour — timer (wall-clock for EXAM, engagement-clock for STUDY-timed), navigation (sequential vs free-nav), feedback timing (per-Q vs end-of-quiz), warning thresholds.
- ⬜ **4.6** Save-progress + Resume — periodic save of in-progress answers (STUDY only), Resume detection on mount, restore to last-viewed Q.
- ⬜ **4.7** Mark-for-review toggle — runner button, writes to marking table, persists across attempts.
- ⬜ **4.8** Discard / abandon — modal with type-DELETE-to-confirm, calls `nclex_discard_attempt`.
- ⬜ **4.9** Review state polish — read-only post-completion view, list + detail with filters (All / Wrong / Right / By category / Marked).

## Phase D — Builder (the entry point)

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
