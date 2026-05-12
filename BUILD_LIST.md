# MyNclex Build List

Slice-by-slice list of work in the MyNclex product, split by the two
layers MyNclex is built around: the **Bank** (self-study question
bank) and the **Programme** (tutored prep). Each line is one slice.
Not exhaustive — design surprises happen — but the shape is settled
where it's listed.

Status legend: ✅ done · 🔨 in progress · ⏭ next · ⬜ pending

> **Last shipped (2026-05-12):** **Slice 9.3c — Blocks.** Activates
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
> **Next ⏭:** **Slice 9.3d — Remaining five activity types.**
> PDF, External link, Live session, Mock, Practice quiz. Each as
> a single body component with the same shape as `<TextEditor>` —
> takes `values` + `onChange` + `disabled`; the modal shell
> dispatches on `activity.type`. PDF adds a storage bucket
> setup; External link is URL + estimated time (YouTube/Vimeo
> embedding deferred to student side); Live session is
> date/time/duration + join link + recording URL; Mock + Practice
> quiz defer their question-selection UI in this slice (only
> metadata fields here; the bank filter builder for both is its
> own slice tied into bank consumption design).
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
- ⏭ **9.3d** Remaining activity types (5) — PDF (storage bucket
  setup), External link (URL + estimated time; YouTube/Vimeo
  rendering is student-side, deferred), Live session (date/time/
  duration + join link + recording URL), Mock (count, time limit,
  pass score, due date, attempts, release-results timing), Practice
  quiz (count, due date, pass score, release-results timing). Mock
  + Practice quiz **defer the question-selection UI** — they save
  just the metadata fields in this slice; the bank filter builder
  for both is its own slice tied into the bank consumption design.
- ⬜ **9.3e** Publish state + content visibility — per-activity
  Live/Draft pill (`activity.is_published`) + tutor controls; per-
  unit aggregate status; programme-wide Publish action (DRAFT →
  PUBLISHED), Archive action. Draft activities don't surface in
  any cohort's checklist.
- ⬜ **9.3f** Cohort curriculum tab (checklist) — new `Curriculum`
  tab in the cohort detail subtree. Renders the same unit→block→
  activity tree but as a *checklist*. Migration adds
  `nclex_cohort_checklist_items` (one row per template item
  included in this cohort, plus per-cohort `release_date`).
  Default-on for every published template item at cohort create.
  Tutor can **Remove from this cohort** per row and **Add back from
  template** if previously removed. Per-cohort release date defaults
  to `cohort.start_date + (unit_index − 1) × 7 days`; editable per
  row without touching the template.

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
