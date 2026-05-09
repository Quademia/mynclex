# MyNclex Build List

Bank consumption work, in the order we're likely to build it. Each line
is one slice. Not exhaustive — design surprises happen — but the shape
is settled.

Sources: `docs/product-plan/bank-consumption.html` (parent),
`bank-consumption-attempt-creation.html`, `bank-consumption-runner.html`,
`bank-consumption-cat.html`, `bank-marks-and-scoring.html`.

Status legend: ✅ done · 🔨 in progress · ⏭ next · ⬜ pending

> **Last shipped (2026-05-09):** **Slice 4.5 — Per-mode behaviour.**
> Three sub-slices closing the runner phase. Modes finally feel like
> modes:
>
> **4.5a — Timer + save-on-tap + auto-submit (foundation).** Unified
> clock pill in the topbar — stopwatch (count-up, neutral) for untimed
> / countdown (count-down, escalating tone) for timed. `mm:ss` under
> 1 hr, `h:mm:ss` over. Hide toggle (eye-icon, per-attempt scope,
> locks at first warning fired). Warning tiers 30 / 15 / 5 / 1 min
> with duration-conditional firing (30 needs ≥60 min, 15 ≥30, 5 ≥10,
> 1 always). Tone escalates only — never reverts. Universal save-on-
> tap: every material change writes a DRAFT row + appends to
> `answer_changes_json` via new `nclex_save_progress` RPC, debounced
> ~500ms client-side. UL backported from "submit creates row" to
> "save-on-tap → status flip on Submit" for consistency. Auto-
> submit on expiry: lazy detection in `page.tsx` flips status to
> TIMED_OUT + AUTO_SUBMITs DRAFT rows + inserts SKIPPED rows for
> items with no answer. EXAM re-entry handled via 60s
> `last_activity_at` heuristic (timed exams resumable mid-timer;
> untimed EXAM also resumable; CAT keeps its exception per §6.1.2).
>
> **4.5b — Submission archetypes.** Collapses 8 (mode, intent)
> tuples into 3 behavioural groups: UL (per-Q + immediate rationale
> + free nav, unchanged from 4.1), Free-batched (UT, TFN — Prev/Next
> only, Finish-with-blanks confirm modal), Sequential (TS — per-Q
> Submit & continue, Prev disabled, no Skip — must commit). New
> `getArchetype` helper, `itemMode` corrected to keep DRAFT rows in
> 'answering' (4.5a latent bug fixed: page reload no longer falsely
> shows "Loading review data..." for UL DRAFTs). `pendingAnswers`
> seeds from DRAFT rows on mount so reload restores in-progress
> state. `_flushDrafts` helper extracted from `expireAttemptAction`
> to also be used by `completeAttemptAction` (Free-batched +
> Sequential have DRAFTs to flush at Finish). New
> `lib/overlays/practice/finish-with-blanks-confirm.tsx`. Migration
> fix for slice 2.2a oversight: `BEFORE INSERT` trigger sets
> `duration_seconds = requested_count × 90` for timed modes
> (matches UWorld's industry-standard pace; real NCLEX averages
> ~84 sec/Q in CAT).
>
> **4.5c — Sequential lock + case-exit warning + correctness gate.**
> Sequential's `Submit & continue` actually fires `submitAnswerAction`
> per-Q now (DRAFT → SUBMITTED). Grid clicks short-circuited in
> Sequential live mode — grid becomes a pure progress indicator.
> Case-exit warning for FREE_BATCHED only (Sequential locks Prev +
> grid; UL has per-Q rhythm) when student tries to leave a
> partly-answered case via Prev / Next / grid. Modal
> `lib/overlays/practice/case-exit-confirm.tsx` with per-attempt
> suppression. Hot-fix surfaced during testing: the per-Q submit in
> Sequential was leaking correctness via grid green/red mid-quiz —
> contradicts §15 "Batched submit at the end" + Pillar 2 (real
> NCLEX never shows per-Q correctness). Added `revealCorrectness`
> gate to `deriveCellFill` / `gridCounts` / RunnerGrid: false for
> Free-batched + Sequential live, true for UL live + any review
> state. Wrong filter chip + correctness legend rows hide when
> gated. SUBMITTED rows render as 'answered' (neutral blue) until
> review.
>
> See SESSIONS 2026-05-09 (4.5 planning) for the spec settled in
> writing across `runner.html §8 / §9.1 / §13` and
> `attempt-creation §6.1.3` (revised); SESSIONS 2026-05-09 (4.5)
> for the build phase + bugs surfaced + hot-fixes.
>
> **Next pick:** **4.6 History page + Resume detection** — reframed
> 2026-05-09 during 4.5 close. The History page is the natural home
> for "your past quizzes" including in-progress ones, and the Resume
> banner becomes a one-line shortcut to the most-recent in-progress
> entry rather than a separate feature. Pulls slice 7.1's MVP
> forward; 7.1 stays in Phase F as "History polish" (analytics +
> filtering on the cards). Splits into **4.6a History page (MVP)**
> + **4.6b Resume banner on Builder dashboard**.

---

## Phase A — Database foundation

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

## Phase B — CAT schema & engine

- ⬜ **3.1** CAT schema package (§12.7 of cat.html) — `difficulty_irt` + `difficulty_source` on bank + tutor tables, 5 CAT cols on `nclex_attempts`, 4 CAT cols on `nclex_attempt_items`, audit table `nclex_bank_item_calibration_history`, RPC stubs (`create_cat_attempt`, `cat_next_item`) raising "not yet implemented." Sam-gated dev → prod.
- ⬜ **3.2** Rasch engine — fill in `create_cat_attempt` and `cat_next_item` bodies with TS Rasch (1PL) math per §4 + §10.2. Selection rule per §7, termination per §9.
- ⬜ **3.3** Recalibration job — weekly batch (Sundays 02:00 UTC), 30-response threshold, 70/30 dampened blend. Runtime location TBD (Supabase pg_cron vs Cloudflare Worker).

## Phase C — Runner (smallest visible loop first)

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
- ⏭ **4.6** History page + Resume detection — reframed 2026-05-09 during 4.5 close: the History page is the natural home for "your past quizzes" including in-progress ones, and the Resume banner becomes a one-line shortcut to the most-recent in-progress entry rather than a feature in its own right. **Save-progress half already shipped in 4.5a/b** (universal save-on-tap; pendingAnswers DRAFT restore on mount). What's left for the runner-side resume is the *entry point* — students need to be able to find their in-progress quizzes from the dashboard. The History page is that entry point. Pulls slice 7.1's MVP forward; 7.1 stays in Phase F as "History polish" (analytics + filtering on the cards):
  - ⏭ **4.6a** History page (MVP) — list of attempts at `/student/bank/history/`. Card per attempt with date · mode · intent · question count · status · score (if terminal) · duration. Click routing by status: IN_PROGRESS → runner (resumes via DRAFT-on-mount, already wired in 4.5b); COMPLETED / TIMED_OUT → review; ABANDONED not clickable (discarded — nothing to open). Sort newest-first. ABANDONED hidden by default with an optional toggle. No pagination in v1 (≤50 attempts visible — paginate later if needed). Touches: new route, server query against `nclex_attempts`, new card component.
  - ⬜ **4.6b** Resume banner on Builder dashboard — derives from the same query as 4.6a (filter `status='IN_PROGRESS'`, take most recent), surfaced as a callout above the Builder so students see in-flight attempts before they navigate elsewhere. One-click resume into the runner. Per attempt-creation §6.1.3, EXAM is also resumable mid-timer (wall-clock continues); same callout applies regardless of intent — the runner shell handles the EXAM-vs-STUDY framing.
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
- ⬜ **5.6** Source breakdown + filter axis — three combined fixes for case/trend visibility in the Builder, surfaced 2026-05-09 during slice 4.4 testing:
  - **Honest per-type count**: extend `nclex_count_eligible_items` + `nclex_filter_breakdown` to break the per-type tally into `standalone` / `case-linked` / `trend-linked`. Today picking `Question type = MCQ` silently drops case-children's MCQs from the count without telling the student — they can't tell that 24+ MCQs sit unreachable inside cases. Surface as a sub-line under the type axis: *"6 standalone MCQs · 24 more inside cases (un-filterable by type)."*
  - **Source breakdown line**: above the live count, show a one-line expectation-setter — *"Standalone × N · Case-linked × M · Trend-linked × P."* Cases take ~6× the time per unit, so a 25-Q quiz with 2 cases lands closer to 60 min than the standalone 30 min. Students need that signal before they hit Start.
  - **Source filter axis**: new Pool-tab axis "Source" with options `All / Standalones only / Cases only / Trends only / Standalones + trends (no cases)`. Lives alongside History + Marked, not in Filters — it's about which corner of the bank you draw from rather than what content is in the question. Real student needs that aren't expressible today: "drill cases this week," "skip cases for a quick session," "grind all my trend questions in one go."
  
  Scheduled after Phase D-E core slices so it lands alongside Phase F analytics polish.

## Phase E — Preflight, results, help

- ⬜ **6.1** Preflight screen — between builder Start click and Q1; shows config summary, mode-specific note, "skip preflight next time" checkbox (per-mode localStorage). Calls `nclex_mark_attempt_started`.
- ⬜ **6.2** Results screen (fixed-length) — score, session-scoped breakdown across 6 axes, transition to Review.
- ⬜ **6.3** CAT summary page — verdict copy, items-administered fact line, **trajectory graph** (theta over question number, with passing-standard reference + per-item marker), per-Client-Needs-Category breakdown, "Compared to your previous CATs" panel, "Review answers" CTA.
- ⬜ **6.4** Help routes — `app/help/[slug]/` (top-level, public, audience-neutral). First articles: `/help/cat`, `/help/payments`. Linked from CAT preflight + summary footer + dashboard CAT card.

## Phase F — Dashboard, history, analytics

- ⬜ **7.1** History page polish — analytics + filtering layered on the MVP shipped in slice 4.6a. Per-attempt-card details (avg score, time-per-Q distribution, accuracy by axis), filter chips (mode, status, date range), sort options beyond newest-first. CAT-attempt cards open to the CAT summary page (slice 6.3) instead of the runner. The MVP list shipped earlier in 4.6a (pulled forward from this slice during 4.5 close).
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
