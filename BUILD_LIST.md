# MyNclex Build List

Slice-by-slice list of work in the MyNclex product, split by the two
layers MyNclex is built around: the **Bank** (self-study question
bank) and the **Programme** (tutored prep). Each line is one slice.
Not exhaustive — design surprises happen — but the shape is settled
where it's listed.

Status legend: ✅ done · 🔨 in progress · ⏭ next · ⬜ pending

> **Last shipped (2026-05-26):** **Tutor Library Slice 11.3a — shelf
> entity + sidebar lens.** The Shelves lens stops being a placeholder
> — real shelf rows, real counts, an All shelves entry, and full
> create / edit / delete on the entity (hover-revealed kebab on each
> row → menu). New tagline column on `nclex_tutor_library_shelves`
> (separate from the existing description, which 11.4 will use for
> the shelf detail page). The Spotify-style carousel main pane is
> 11.3b; until then, every `?shelf=…` URL lands on a friendly
> placeholder. CD-derived: 8-swatch palette + smart default + live
> preview pill from the prototype's `NewShelfDialog`.
>
> - **Schema.** `db/migrations/20260617120000_slice_11_3a_shelf_tagline.sql`
>   adds `tagline TEXT NULL` (applied to mynclex-dev). Two
>   descriptive fields side-by-side now — `tagline` (short carousel
>   header copy) + `description` (longer copy for the shelf detail
>   page 11.4). Both optional; UI degrades on null.
> - **Server boundary.** `getShelvesForTutor()` joins
>   `nclex_tutor_library_shelf_memberships(count)` for per-shelf note
>   counts — single round trip, mirrors the folder pattern.
>   `page.tsx` runs the folders + shelves fetches in parallel
>   (`Promise.all`); skips the per-folder notes fetch when a shelf
>   scope is active (the main pane is shelves-only there).
> - **Actions.** `createShelfAction` / `editShelfAction` /
>   `deleteShelfAction` in `lib/library/actions.ts`. Validation
>   chain: title 2..60 + dup-check + tagline ≤120 + description ≤600
>   + colour ∈ SHELF_PALETTE. Delete catches FK 23503 (shelf attached
>   to a programme via `_note_attachments`) and surfaces a specific
>   "detach first" error — RESTRICT prevents the cascade today; the
>   detach UI lands with 11.12.
> - **Sidebar lens.** New `<ShelfRows>` wires real rows with the
>   shelf's identity colour as a 9px square dot to the left, the
>   title, the count to the right. Hover → kebab `⋮` opens a popover
>   menu (Edit / Delete with click-outside + Escape close). 11.3a
>   routes every per-shelf URL to `?shelf=all` — the per-shelf
>   detail view ships in 11.4.
> - **New shelf modal.** Discriminated union `{ mode: 'create' | 'edit' }`
>   so the same modal handles both flows. Smart-default colour
>   picks the first SHELF_PALETTE entry not already worn by an
>   existing shelf (falls back to entry 0 above 8 shelves). Title +
>   tagline + description + 8-swatch colour picker + live preview
>   pill ("rail dot · per-note pip · attached-block border" copy
>   explaining where the colour shows up).
> - **Delete confirm.** Simple yes/no `DeleteShelfConfirm` (not
>   type-to-confirm — cascade only drops membership rows; notes are
>   untouched, and the shelf can be recreated trivially).
> - **Main pane placeholder.** `ShelvesComingSoon` renders the 📚
>   glyph + "All shelves" title + a hint explaining the carousel
>   ships in 11.3b. Empty-state copy switches to "No shelves yet"
>   when the tutor has none.
> - **CSS.** New SLICE 11.3a block in `styles/library.css` covers
>   the lens-item-wrap + shelf-dot + kebab + popover menu + swatch
>   grid + preview pill + field hints + the two modal size variants.
>
> **Files new (3):** `lib/library/new-shelf-modal.tsx`,
> `lib/library/shelf-rows.tsx`,
> `db/migrations/20260617120000_slice_11_3a_shelf_tagline.sql`.
>
> **Files modified (5):** `lib/library/types.ts` (SHELF_PALETTE +
> LibraryShelf / WithCount / FormValues), `lib/library/queries.ts`
> (getShelvesForTutor), `lib/library/actions.ts` (create + edit +
> delete shelf actions + validateShelf), `lib/library/home-shell.tsx`
> (mount Shelves lens + + New shelf toolbar button + NewShelfModal +
> ShelvesComingSoon main pane), `app/(app)/tutor/library/page.tsx`
> (parallel folders + shelves fetch, `?shelf=` URL param, scope
> precedence), `styles/library.css` (SLICE 11.3a CSS block).
>
> **Earlier shipped (2026-05-26):** Tutor Library Slice **11.2b** —
> notes CRUD + dedicated editor route. Closes the 11.2 sub-arc; the
> library now round-trips folders AND notes through real UI. The
> Tiptap rich block editor is still 11.5; this slice ships a plain-
> textarea body editor with the full chrome around it (breadcrumb,
> meta row, right rail).
>
> - **+ New note flow.** `+ New note` (was disabled, said "Coming in
>   11.2b") now opens a modal — title + folder dropdown +
>   pillar multi-select (≥1 required, NCLEX domain values). Submit →
>   `createNoteAction` → routes to the editor at
>   `/tutor/library/note/<id>`. The folder dropdown defaults to the
>   currently-selected folder in the home shell if one is open.
> - **Editor route at `/tutor/library/note/[note_id]`.** Server
>   component fetches the note (RLS-gated; 404 on miss) + the tutor's
>   folders in parallel. Renders `<NoteEditor>` inside the existing
>   tutor global chrome (no special layout — global sidebar stays).
> - **Editor layout — CD-faithful three-zone.** Sticky toolbar
>   (breadcrumb left, save badge + Draft pill + disabled Publish +
>   Save right) → grid `1fr 240px` (main + rail) below. Hides the
>   rail at ≤1080px. CD-prototype-derived defaults: 34px serif
>   title, 16px italic serif subtitle, small one-line description,
>   inline meta row of Folder / Pillars / Tags chips between the
>   text headers and the body.
> - **Body as a textarea.** The schema stores body as JSONB blocks;
>   11.2b round-trips a single paragraph block via
>   `bodyToText` / `textToBody` helpers in `note-editor.tsx`. When
>   slice 11.5 ships the Tiptap rich editor it writes the same
>   block shape so the persisted JSON survives the upgrade.
> - **Inline meta row pickers.** New atoms — `pillar-picker.tsx`
>   (popover with 8 NCLEX pillar checkboxes + short-form chip
>   labels), `folder-picker.tsx` (popover folder list reused by the
>   modal + the editor reparent), `tag-input.tsx` (chip row + free-
>   text input; Enter / comma / Tab commits, Backspace pops). All
>   popovers close on ESC + click-outside.
> - **Right rail — 5 sections.** Status (Draft + visibility-coming +
>   last-save timestamp with relative formatter that auto-refreshes
>   every 30s); Outline (best-effort heading detection from textarea
>   text); Embedded questions (count via body-walk for
>   `embedded_questions` blocks — always 0 in 11.2b, lights up with
>   11.15); Used in (real `nclex_tutor_library_note_attachments`
>   count via PostgREST embed — always 0 in 11.2b, lights up with
>   11.11); Guards (live explainer of the current save model).
> - **Breadcrumb in the toolbar** (added during the same session
>   after Sam flagged the inconsistency). Replaces the back arrow
>   with `Library / <folder name> / <note title>` — clickable
>   segments routed through a `attemptLeave(href)` guard that fires
>   the `DiscardConfirm` modal when the editor is dirty. For root
>   notes the middle segment is skipped. Folder-list + all-folders
>   crumbs got the `Library` link too for consistency.
> - **Save model.** Explicit Save button on the toolbar; debounced
>   autosave waits for 11.5. Save badge has three states (saved /
>   saving / dirty) with a coloured blip dot + relative-time copy.
>   `version_id` rotates on every UPDATE (forward-compat scaffolding
>   for the two-tabs guard in 11.5). `beforeunload` browser warning
>   on close-tab when dirty.
> - **Validation** mirrors at three layers: client modal (inline red
>   copy), server action (auth check + length caps + pillar
>   membership + tag length + dup-check), DB (CHECK constraint on
>   `nclex_pillar` domain + ≥1 pillars + RLS).
>
> **Files new (8):** `lib/library/format.ts`,
> `lib/library/pillar-picker.tsx`, `lib/library/folder-picker.tsx`,
> `lib/library/tag-input.tsx`, `lib/library/new-note-modal.tsx`,
> `lib/library/notes-list.tsx`, `lib/library/note-editor.tsx`,
> `app/(app)/tutor/library/note/[note_id]/page.tsx`.
>
> **Files modified (7):** `lib/library/queries.ts` (note-list +
> note-with-attachment-count reads), `lib/library/actions.ts`
> (create + update + pillar / tag validators), `lib/library/types.ts`
> (`NclexPillar` + `LibraryNote` + projections + form-value types),
> `lib/library/home-shell.tsx` (wire `+ New note`, render
> `<NotesList>` for selected folders, `<NewNoteModal>` mount,
> remove the `SelectedFolderEmpty` placeholder),
> `lib/library/all-folders-grid.tsx` + `lib/library/notes-list.tsx`
> (clickable `Library` crumb), `app/(app)/tutor/library/page.tsx`
> (fetch notes when a real folder is selected), `styles/library.css`
> (notes list rows + meta chips + popovers + tag chips + editor
> three-zone shell + breadcrumb).
>
> **Earlier shipped (2026-05-26):** Tutor Library Slice **11.2a** —
> folder CRUD + folder lens data + the All-folders grid. The
> sidebar's Folders lens stopped being a placeholder. Toolbar
> `+ New folder` wired through a name + description modal. New
> files: `lib/library/{types,queries,actions,folder-rows,
> all-folders-grid,new-folder-modal}.tsx`. CD-derived design.
>
> **Earlier shipped (2026-05-25):** Tutor Library **Slice 11.1
> foundation** + the **gap-review fold-back** into the canonical
> planning doc. 11.1a shipped the schema migration (8 tables — the
> 9th `nclex_library_embed_answers` was patched out + deferred to
> 11.15); 11.1b shipped the chrome-only home shell at
> `/tutor/library` with the 5-lens sidebar (Views / Folders /
> Shelves / Pillars / Tags) and a collapse-to-rail control. The
> gap-review pass closed 4 architectural decisions + 20 gap
> resolutions (multi-value pillars, junction-table programme
> visibility, atomic shelf attach, embedded-question caps, merged
> note-state table, etc.). Full write-ups live in the git log
> (`23c23e7`, `763872b`, plus the 7 gap-review commits) and the
> canonical planning doc.
>
> **Next:** Slice **11.3b** — Spotify-style All Shelves carousel
> main pane + add-to-shelf flow (the dashed `+ Add to shelf` tile
> at the end of each carousel row). The shelf entity itself is now
> live (11.3a); 11.3b is the read-and-attach side. Full library
> slice ladder + status flags live in
> [`docs/product-plan/tutor-library.md` → Build order](docs/product-plan/tutor-library.md#build-order-when-this-gets-queued)
> — see Part 3 below.
>
> **Earlier sessions:** the full per-session history lives in
> [`SESSIONS.md`](SESSIONS.md), archived by month under `sessions/`.
> Only the most recent shipped summary is kept here.

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
- ✅ **Access-gating step** — status now CONTROLS access. Two-tier RLS
  (metadata = any enrolment on programmes/cohorts; content = ENROLLED on
  units/blocks/activities/checklist/quizzes) via 4 SECURITY DEFINER
  helpers; the 8 `*_student_select` policies rewritten; active-enrolment
  guard added to both launch RPCs. TS `requireStudent*Access` bounce
  non-ENROLLED to the picker; switcher rows non-clickable unless
  ENROLLED. **Picker rebuilt** to list enrolled programmes inline
  (shared `<ProgrammeList>`; popup now only for in-programme switching).
  Migration `20260526120000`. Commits `0321f0f` (db) + `3ab2219` (feat).
  See SESSIONS 2026-05-20.
- ✅ **Slice 3** Programme deltas + discovery + detail — shipped
  2026-05-20 across three sub-slices:
  - **3a** DB price deltas — `price_currency` / `price_minor` /
    `payment_collection_mode` / `access_window_days` on `nclex_programmes`
    (dropped dual GHS/USD; backfill non-zero-wins/GHS-tiebreak); tutor
    form reworked to currency-picker + single price + "Online checkout:
    On/Off" + access-window. Migration `20260527120000`.
  - **3b** Public-projection layer + discovery — single
    `nclex_public_programmes` view as the one public read path (curated:
    programme + tutor name/avatar only + cohort rollup; gate defined
    once); superseded + removed the 3a base-table public policy. New
    `(public)` route group + shared chrome (`components/public/`,
    `lib/discovery/`, `styles/discovery.css`); `/programmes` discovery
    list with client-side filter chips. Migration `20260528120000`.
  - **3c** Read-only detail page (`/programmes/[id]`) — header / about /
    syllabus / cohorts (status pills, no seat counts) / pricing rail
    (disabled "coming soon" Enrol). Added `nclex_public_units` +
    `nclex_public_cohorts` to the view family. Migration `20260529120000`.
  - **Deferred to the tutor-profile slice below:** the "About {tutor}"
    section on the detail page (no tutor bio fields exist yet).
  - Still unblocks the pg_cron EXPIRED/PAUSED sweep (needs
    `access_window_days`), now present.
- ✅ **Slice 3.5** Tutor public profile (JSONB) — shipped 2026-05-20.
  Column **renamed `public_profile`** (not `profile`) — the `public_`
  prefix encodes the invariant: public-display data only, role-agnostic,
  sits beside `avatar_url`. Shape is the `PublicProfile` TS type in
  `lib/discovery/types.ts` (single source of truth; reshape later at zero
  migration cost). Fields: `headline` / `speciality` / `years_experience`
  / `bio` + `business_name` / `business_logo_url` / `business_bio`.
  **Dropped the `display_mode` switch** (revised with Sam 2026-05-20): for
  transparency, person + business always show **together** when a business
  name is set — never one instead of the other; co-tutor individual bios
  on a programme are future work that the person `bio` future-proofs.
  Exposed as `tutor_profile` in `nclex_public_programmes` (whole bag, so
  field additions need no view change). `/tutor/profile` placeholder →
  real "Public profile" editor (person + business sections, live preview,
  dirty-gated save, success/error toasts, beforeunload + in-app
  discard-overlay guards). Card + detail page render attribution +
  "About {person}" / "About {business}" via shared `tutorAttribution` +
  `yearsTutoringLabel`. Logo = URL field for now; direct upload deferred.
  Migrations `20260530120000` (column) + `130000` (view); dev only, dev
  tutor seeded. The `nclex_tutors` table for private/operational tutor
  data (vetting, $29/mo sub, payouts) still arrives with vetting work.

  **Boundary (branding vs ownership).** The business fields are display
  branding and hold only while **one business = one tutor**. If the same
  brand ever spans multiple tutors / shared billing / shared roster,
  that's the trigger to promote to a real `nclex_organizations` entity
  (org owns programmes, org-level subscription) — the brand fields
  migrate there. Likely arrives with the tutor-subscription / vetting
  work, which is also the trigger for a 1:1 `nclex_tutors` table holding
  tutor-only *operational* data (vetting status, $29/mo sub linkage,
  payout details, quotas) that can't live in the public JSONB.
- ✅ **Slice 4** Student-initiated waitlist (off-platform) — shipped
  2026-05-20. `nclex_cohort_waitlist` (PENDING/CONVERTED/DISMISSED,
  CASCADE) + anon-callable idempotent `nclex_join_waitlist` RPC
  (cohort-joinable gate, `(cohort,lower(email))` dedup). Public
  Join-waitlist form as a 2nd rail button under the kept "coming soon"
  CTA: forename/surname + email + **phone** + **preferred_contact**
  (Call/SMS/WhatsApp/Email, phone required iff a phone-method ticked,
  enforced at form+action+RPC+CHECK) + single-cohort-collapsing picker.
  Tutor **Students** surface reworked to the CD handoff
  (`prototypes/tutor-cohort-workspace.html`, app tokens): Roster|Waitlist
  sub-tabs, summary cells, avatars + relative time, roster table w/
  filter chips + search + Access·payment **placeholder** (Slices 5–7).
  Waitlist tab: contact-badge rows + Convert (shared
  `inviteOrAttachAndEnrol` + confirm dialog) / Dismiss (confirm). Convert/
  dismiss run service-side after RLS-scoped ownership read. Migration
  `20260531120000` (dev only). **Deferred:** "did you mean gmail.com?"
  email typo hint (we verify format only — Convert's invite is the real
  deliverability test).
- ⬜ **Slice 5+6 (combined)** On-platform checkout + subscriptions +
  standalone bank. Slices 5 and 6 were merged 2026-05-21 — the bank
  opt-in card at programme checkout can't activate without
  `nclex_subscriptions`, so building them apart would ship a half-wired
  table. **Decisions locked this session (see SESSIONS 2026-05-21):**
  - **In-app route handlers, NOT a separate Cloudflare Worker.** The
    doc's "payment Worker mirroring Licensure" rationale doesn't carry
    over: Licensure was a static site with no server runtime, so it
    needed a standalone Worker. MyNclex already runs server-side on
    Cloudflare Workers (Next.js via OpenNext), so `init`/`verify` are
    ordinary route handlers / server actions in the app — no separate
    deploy, no CORS, secrets already wired. Paystack is redirect-based
    (no card data touches us), so PCI scope stays minimal.
  - **`nclex_products` is dual-currency** (`price_minor_ghs` +
    `price_minor_usd`), unlike single-currency programmes. Deliberate:
    the bank is QAcademy's own product priced *regionally* (GHS anchored
    to local nurse salary; USD to international competitors; conversion
    intentionally not 1:1) — see payments-and-enrolment.md §282–349,
    §966–981. Programmes are single-currency only because each is run by
    one tutor who shouldn't maintain two prices (Slice 3a).
  - **Readiness packs are products at the schema level, deferred at the
    build level.** `nclex_products` carries `pack_type ∈ BANK_DURATION |
    READINESS | TRIAL` + a nullable `readiness_pack_id` FK →
    `nclex_readiness_packs` (which already exists in `db/schema.sql`).
    We seed only the 5 bank tiers (+ trial) and build only the bank +
    programme flows; the readiness *purchase* path stays a v2 deferral
    (sells via the main readiness page, never at programme checkout —
    doc §803–804). Bank tiers DO carry a `bundled_readiness_credits`
    column (60d→1 … 365d→5 per doc §396), captured now even though
    nothing consumes it until readiness ships — Sam's call 2026-05-21.
  - **Payment = polymorphic single-purpose rows, NOT header + line
    items.** Build the CD proposal's model verbatim (it's the adopted
    build basis): `nclex_payments` is one row per Paystack transaction
    carrying a `purpose` enum (`BANK_PURCHASE` | `READINESS_PURCHASE` |
    `PROGRAMME_INITIAL` | `PROGRAMME_INSTALLMENT` |
    `BANK_OPTIN_AT_PROGRAMME`) + polymorphic FKs (exactly one of
    `product_id` / `programme_id` per row). No `nclex_payment_items`
    child table — that was an early Claude drift, retracted 2026-05-21
    in favour of the CD shape (keeps each txn one row, no join for the
    "my payments" page). The 40% bank-opt-in discount is computed
    client-side from a `BANK_PROGRAMME_OPTIN_DISCOUNT` constant, not a
    duplicate discounted product row. **Divergence (2026-05-21):** the
    CD proposal held this discount as a client-side constant
    (`BANK_PROGRAMME_OPTIN_DISCOUNT`); we instead store it in a new
    `nclex_config` key-value table so it's retunable without a redeploy.
  - **Activation targets differ.** A `PROGRAMME_*` payment → `nclex_enrolments`
    row, `SELF_PAID`, `PENDING_APPROVAL` (tutor still approves). A
    `BANK_*` payment → `nclex_subscriptions` row, **activates immediately
    on payment** (not gated on tutor approval), new duration **stacks**
    as a fresh row (access = `max(end_at)`), not a mutate-existing extend.
  - **`strategy_id` deferred.** `nclex_payments.strategy_id` /
    `nclex_enrolments.strategy_id` FK → `nclex_programme_payment_strategies`,
    but that table is Slice 7. For upfront-full only, the programme price
    already lives on `nclex_programmes.price_minor` (Slice 3a), so
    `strategy_id` stays nullable and the strategies table waits for
    Slice 7.
  - **Open question deferred to 5.4:** programme + bank opt-in is one
    combined "Pay" button in the prototype, but the polymorphic schema
    is one-purpose-per-row with a UNIQUE reference → implies either two
    Paystack charges or a `checkout_group_id` tying two rows to one
    charge. Decided at the checkout-UI sub-slice, not a 5.1 blocker.
  - **Pay-first via Supabase invite, NOT the sibling's setup-token.**
    verify → `inviteUserByEmail` → existing `/welcome` (shipped Slice 1)
    → account + activation. The Licensure custom setup-token /
    `setup-complete` route is not carried over.
  - **Email dup-check fires at email entry, before Paystack** (doc
    §164–175): existing account → checkout pauses with "log in to
    continue," resumes post-login against the existing account.

  Bank opt-in rules (doc §783–822): always offered, no tutor toggle,
  40% off standalone, all 5 tiers, **not pre-selected** (no dark
  pattern), stacks on existing access. Sub-slices, built bottom-up
  (~one per session per the alternate-features rule):
  - ✅ **5.1** Schema + seed (DB only) — a new `nclex_config` key-value
    table (`key`/`value`/`description`/`updated_at`, mirrors gamma's
    `config`; read public, write SUPER_ADMIN; seeded with
    `bank_optin_discount = 0.40`) plus three CD tables verbatim:
    `nclex_products` (dual-currency `price_minor_ghs`/`_usd`, `kind`,
    `pack_type`, `duration_days`, `readiness_pack_count`, `status`
    ACTIVE/ARCHIVED, `sort_order`; seed 6 bank tiers + trial — readiness
    SKUs optional, no purchase path in v1), `nclex_payments` (polymorphic
    `purpose` rows, no line-item child; `strategy_id` nullable), and
    `nclex_subscriptions` (stacking, `pack_type` denormalised, readiness
    fields present but unused in v1). Full RLS + SUPER_ADMIN bypass.
    Applied to mynclex-dev as migration `20260601120000`; mirrored into
    `db/schema.sql` + `db/rls.sql`. Verified: seed (6 products + discount
    config), RLS on all four, polymorphic purpose↔target CHECK, security
    advisor clean (no new warnings).
  - ✅ **5.2** Paystack init + verify (test-mode) + email dup-check.
    Built in-app, NOT as `app/api/.../route.ts` handlers — corrected
    mid-build: `init` is a **server action** (`startPaymentAction`),
    `verify` is a **plain function** called by the **callback page** the
    browser returns to (a server action can't be a redirect target; an
    API route was unnecessary). New `lib/payments/`: `paystack.ts` (the
    only file that calls Paystack — `initialize`+`verify`, reads
    `PAYSTACK_SECRET_KEY`), `dup-check.ts` (email-exists via service-role
    on `nclex_users`), `init.ts` (resolve amount/currency/purpose →
    write `INIT` row → start Paystack → return redirect URL), `verify.ts`
    (confirm + amount tamper-guard → flip `PAID`; stops short of access),
    `types.ts`, `actions.ts` (`'use server'` wrappers). Callback page at
    `/checkout/callback` (minimal; 5.4 makes it the real result screen).
    Throwaway `/paytest` harness (NODE_ENV-guarded; deleted at 5.4).
    Writes via service role (no authenticated write policy on payments).
    Verified on localhost with Paystack test mode: GHS BANK_30D went
    `INIT → PAID` (amount-matched ₵120); abandoned attempt left `INIT`;
    USD failed at Paystack (test account has no USD enabled — account
    setting, not code) and was correctly marked `FAILED`; dup-check
    returns yes/no correctly. **Open for 5.3:** activation (PAID →
    enrolment/subscription + welcome invite). **Reliability note:** v1
    relies on the browser-redirect verify (mirrors Licensure); a Paystack
    webhook would be more robust — revisit later.
  - ✅ **5.3** Activation engine (BANK only; programme enrolment activation
    deferred to 5.4 with the cohort picker). `lib/payments/activate.ts`
    grants an `nclex_subscriptions` row from a PAID bank payment +
    `lib/payments/settle.ts` (verify→activate orchestrator the callback
    page calls). Two identity cases: existing account → grant immediately
    → `ACTIVATED`; pay-first guest → Supabase invite → `SETUP_REQUIRED` →
    `/welcome` (now creates the profile + STUDENT role when missing, then
    `activatePendingForEmail`) → grant. **Email is the canonical identity**
    — `startPaymentAction` no longer stamps the logged-in session id;
    activation resolves the account by the payment's email (the dup-check
    already reconciles an existing email to its account via login before
    payment). **Idempotent**: partial unique index
    `idx_nclex_subscriptions_payment` on `payment_id`
    (migration `20260602120000`) + 23505-as-success on insert — replaced a
    racy `maybeSingle()` pre-check that ran away to duplicate subs under
    concurrent callback hits (caught in testing). Verified on dev across
    both paths: granted to the typed account (not the session), one sub
    per payment, correct durations, pay-first profile+role created.
  - ✅ **5.4a** Programme checkout page (upfront-full, programme-only) —
    shipped 2026-05-21. New public route `app/(public)/checkout/[programmeId]/`
    (server gate re-applies the Enrol button's enable rule + co-located
    client form): cohort picker (collapses for a single cohort; hidden for
    self-paced), email + live dup-check, order summary, **Pay with Paystack**.
    The payment-strategy and bank-opt-in cards render as disabled "coming
    soon" placeholders (Slices 7 + 5.4b) so the page already reads as the
    full prototype. Activation engine (`activate.ts`) extended to
    `PROGRAMME_INITIAL` → an `nclex_enrolments` row: tutor-led →
    `PENDING_APPROVAL`, self-paced → `ENROLLED` immediately, with
    `access_expires_at` frozen from `access_window_days`; same pay-first
    invite + idempotency (existing active enrolment is linked, not
    re-created — never trap a paid buyer behind the unique-active guard).
    New nullable `nclex_payments.cohort_id` (migration `20260603120000`,
    dev only) carries the picked cohort across the Paystack round trip
    (the enrolment doesn't exist until after payment). `init.ts` enforces
    on-platform + published + validates a joinable cohort; `settle.ts` /
    callback page distinguish `PENDING_APPROVAL` from `ACCESS_READY`. Live
    **Enrol** button wired on `/programmes/[id]` (on-platform + public price
    + something joinable); the **detail rail was rebuilt to the CD
    prototype** (price + sub, Enrol + cohort note, bank-opt-in hint box,
    payment-strategies list — placeholders where data isn't live; seat
    counts deliberately omitted per Slice 3c). Verified end-to-end on dev:
    pay-first GHS ₵3,000 → `INIT→PAID→ACTIVATED`, `PENDING_APPROVAL`
    enrolment w/ 365-day window → tutor approve → `ENROLLED`.
    **Deferred to 5.4b:** the live bank opt-in card (the one-charge
    `checkout_group_id` model) + session-aware prefill for an
    already-logged-in buyer (today the dup-check blocks a logged-in buyer
    who types their own email).
  - ✅ **5.4b** Bank opt-in card at programme checkout — shipped 2026-05-22.
    One **combined Paystack charge** covers programme + bank via a new
    `nclex_payments.checkout_group_id` (migration `20260604120000`, dev
    only): rows of one order share the group + one reference (the per-row
    UNIQUE on `paystack_reference` was dropped — a group legitimately shares
    it). `init.ts` rebuilt around a **line-item order** (programme + optional
    bank line, both in the programme's currency; bank price computed
    **server-side** from the product × `nclex_config.bank_optin_discount`,
    never trusting the browser). `verify.ts` + `activate.ts` made
    **group-aware**: verify sums the group and checks that against Paystack's
    charge; activation grants every row (programme → enrolment, bank →
    subscription **immediately**, `source=PROGRAMME_OPTIN`) with the pay-first
    invite firing **once per group**. Live opt-in card (checkbox off by
    default, 5 `BANK_DURATION` tiers w/ discounted + struck prices, 90d
    default-once-ticked, order line + combined total) + **logged-in-buyer
    prefill** (own email pre-filled, skips the dup-block). Verified
    end-to-end on dev: pay-first GHS ₵3,000 + 365d ₵420 = **₵3,420 single
    charge** → both rows ACTIVATED → enrolment `PENDING_APPROVAL` +
    subscription `ACTIVE`. **Deferred to 5.5:** the shared checkout-shell
    extraction + route rename (`/checkout/programme/[id]`) — premature with
    one consumer; do it when standalone bank gives the second case. The
    `checkout_group_id` model also future-proofs any multi-product cart.
  - ✅ **5.5** Standalone bank landing + purchase — shipped 2026-05-22.
    Public **`/bank-access`** landing (`app/(public)/bank-access/`): hero,
    a live **GHS|USD toggle**, the 5 `BANK_DURATION` tiers as cards (real
    catalogue prices, bundled-readiness-credit lines, 90d "Most popular"),
    a "what you get" feature grid (CAT marked coming-soon), trial strip
    (button inert — **trial deferred** to its own slice, needs a free
    self-serve signup we don't have). "Get access" → **`/checkout/bank`**.
    **Shared checkout shell extracted** (`components/checkout/checkout-shell.tsx`
    — email+dup-check+prefill, order rail, Pay, what-happens-next) now
    powering both bank + programme checkout; **programme route renamed**
    `/checkout/[programmeId]` → **`/checkout/programme/[id]`** (Enrol link +
    callback updated; old route 404s). Bank checkout (`/checkout/bank`,
    server-validates the product is an active paid BANK_DURATION, else
    redirects to the landing) reuses the proven BANK engine path (5.2/5.3) —
    no schema change. Nav "Practice bank" wired to `/bank-access`. Verified
    end-to-end on dev: pay-first GHS BANK_365D → payment ACTIVATED →
    `/welcome` → profile+role → `nclex_subscriptions` ACTIVE 365d,
    `SELF_PURCHASE`; programme checkout still works post-refactor. (USD not
    fully testable — Paystack test account has USD disabled — but same code
    path.)
  - ✅ **5.6** Bank entitlement gating — shipped 2026-05-22. Bank practice
    now requires an **active bank subscription** (full-lock on lapse, Sam's
    call: builder, runner, AND history/review). Layered per the
    layered-access rule:
    - **DB (hard backstop):** `nclex_has_active_bank_access(uuid)` (ACTIVE +
      `end_at` null-or-future, pack_type BANK_DURATION/TRIAL — date-compared
      so it's correct before the deferred expiry sweep) + the gate inside
      the SECURITY DEFINER `nclex_create_attempt` RPC. SUPER_ADMIN bypass.
      Migration `20260605120000` (dev only).
    - **TS page guard:** `requireActiveBankSubscription()` in
      `lib/access/student/` (barrel-exported), reading `bankAccessForUser`
      in new `lib/payments/entitlements.ts`. Applied at the **bank layout**
      (covers every `/student/bank/*` page → `/bank-access` on no access).
    - **Source-aware runner:** the shared runner (`/session/[id]`, outside
      the bank layout) gates **only `CUSTOM_BUILT` (bank) attempts** —
      `PROGRAMME_ASSIGNED` tutor-quiz attempts are untouched, so a bank-less
      programme student still runs their quizzes.
    - **Picker UI:** real `getMyBankAccess()` — active → enters bank w/
      "X days left" / "Lifetime access"; none/lapsed → "Get access →" CTA to
      `/bank-access`.
    Helper verified per-student on dev (student w/ 30d & 365d → true;
    no-sub student → false; super-admin bypasses). Full per-user redirect +
    create-RPC-refusal + programme-quiz-still-works = Sam's browser test.
    Trial deferred (will satisfy the same check once built).
- 🔨 **Slice 7** Multi-strategy + installments — payment plans for
  on-platform tutored programmes (7a–7d ✅; 7e ⏭). Pay-in-full already ships (5.x); this
  adds **deposit + balance** and **equal installments**, and makes the
  strategies table the single source of truth for programme amounts.
  Source: design-handoff `index.html` §05 + `payments-and-enrolment.md`
  §658–684 / §1390–1405. Sub-sliced + decisions locked 2026-05-22 (revised
  same day after Sam pushback — see below).

  **Decisions locked 2026-05-22:**
  - **Upfront-full IS a strategy row** (revised — supersedes the first-pass
    "upfront stays off the table"). Sam's point: with upfront implicit, a
    tutor can't turn it *off*, but some only want installments / deposit.
    So upfront is a real, selectable plan — auto-created + pre-selected on
    programme setup, but **deactivatable**. The strategies table becomes the
    **single source of truth for programme amounts**; `nclex_programmes.
    price_minor` is **retired** (the leftover copy → drift risk). Done via
    **Phasing 2** (incremental, below) so no big-bang on the live public
    pages. `price_currency` **stays on the programme** — a programme is one
    currency, every plan inherits it; only the *amount* moves to the plans.
  - **Plan edits don't touch live enrolments** (open-Q §12.2 → freeze). The
    chosen plan is snapshotted onto the enrolment row at checkout; a later
    tutor edit to the plan only affects future students.
  - **Due dates are computed, not tutor-typed** (Decision 4). Tutor sets the
    *pattern* (installment count + interval days; "balance due N days after
    deposit"); the system computes each student's actual due dates from their
    own enrolment / first-payment date. Anchored to enrolment for BOTH
    self-paced and tutored — simplifies the doc's "tutored anchors to cohort
    dates" to one code path (noted divergence). Per-student grace/extend
    stays a manual tutor override (7d).
  - **Student pays later installments from the programme tile** — not the
    My-Payments page (which stays deferred to 5.7). Reuses the checkout
    shell for the single charge.
  - **Deposit + balance is in v1** — same overdue→PAUSE machinery as
    installments, one balance payment instead of N.
  - **No reminder emails in v1** — no transactional email infra yet; the
    nightly job flips status only (drives the dashboard tile). Reminder
    emails land when email ships.

  **Blast radius of retiring `price_minor`** (mapped 2026-05-22; bank's
  dual-currency `nclex_products.price_minor_ghs/usd` are unaffected): 9 code
  spots + the public views — headline display (discovery list card, detail
  page), the charge (checkout page, `lib/payments/init.ts`), the write
  (programme create/edit form + actions), plumbing (`lib/programmes/types.ts`
  + `queries.ts`, `lib/discovery/types.ts`), and the `nclex_public_programmes`
  view family. Phasing 2 cuts these over in the dedicated 7e step, not in 7a.

  - ✅ **7a** Schema + foundation (DB only, dev) — create
    `nclex_programme_payment_strategies` (kind ∈ UPFRONT_FULL /
    DEPOSIT_BALANCE / EQUAL_INSTALLMENTS; label, total/initial
    `*_price_minor`, `installment_count` 2..12, `installment_interval_days`,
    `balance_due_days_after_enrolment`, `is_active`, `sort_order`; index
    `(programme_id, sort_order)` + UNIQUE `(programme_id, kind)`; RLS — read
    = owning tutor + public WHERE programme PUBLISHED, write = owning tutor,
    SUPER_ADMIN bypass). ALTER `nclex_enrolments` ADD `strategy_id`
    (FK RESTRICT) + `strategy_snapshot_json`. ALTER `nclex_payments` to add
    the real FK on its existing bare `strategy_id`. **Backfill**: each
    programme's `price_minor` → one active UPFRONT_FULL strategy row
    (total = initial = price_minor, currency from the programme).
    **`price_minor` LEFT IN PLACE** — still the source for display + charge
    this slice, so nothing visible changes (7a stays invisible/safe). The
    upfront rows sit alongside, kept in step by the create/edit action until
    7e retires the column.
  - ✅ **7b** Tutor payment-plan config UI — per-programme surface to manage
    plans: the auto-created upfront plan (deactivatable), plus add / edit /
    deactivate deposit+balance + installment plans. RLS-gated server actions;
    validation (count 2..12, deposit < total, balance = total − deposit,
    interval days). Hide-not-delete once a strategy has live enrolments. The
    upfront *amount* is still edited via the programme price box (which writes
    both `price_minor` and the upfront row) until 7e — avoids a two-way sync.
  - ✅ **7c** Checkout plan picker — checkout shell shows the active plans;
    student picks one, pays the INITIAL amount (full / deposit /
    installment 1) **read from the chosen strategy row**. On verify/activate:
    enrolment gets `strategy_id` + frozen snapshot; payment row carries
    `strategy_id`. **Correction (7d):** the initial row's `installment_index`
    stays **NULL** (the `installment_index_scope` CHECK only permits it on
    `PROGRAMME_INSTALLMENT` rows) — it's implicitly position 1; later
    installments carry their position. (An earlier "= 1" note was wrong and
    would have broken the INIT insert.)
  - ✅ **7d** Installments lifecycle — shipped 2026-05-22. Pure schedule
    engine (`lib/payments/schedule.ts`, 12 Vitest); `nclex_enrolment_nightly_sweep()`
    on pg_cron (02:00 UTC — ENROLLED→PAUSED on overdue, ENROLLED/PAUSED→EXPIRED
    on window end, ACTIVE subs→EXPIRED past `end_at`; gated by `nclex_config.
    enrolment_sweep_enabled`, default ON); access-window read gate folded into
    `nclex_has_active_*_enrolment`; student **"Pay next installment"**
    (`/checkout/installment/[id]`, amount resolved server-side, auto-unpause
    when caught up); tutor **"Mark paid off-platform"** in the cohort roster.
    Migrations `20260608120000` (sweep) applied to dev. Live-tested + Sam
    browser-tested (real Paystack installment + tutor mark-paid both
    auto-unpaused). **Follow-ups same session:**
    - **Reconciliation columns** (`20260609120000`): `nclex_payments` gains
      `collection_channel` (PAYSTACK / OFF_PLATFORM) + `recorded_by_user_id`;
      mark-paid stamps both — money-collected is now explicit, not inferred
      from a null `paystack_reference`.
    - **Grace / "give more time"** (`20260610120000`): `nclex_enrolments` gains
      `installment_grace_until` (active deadline, sweep-respected) +
      `grace_history_json` (append-only audit). New `giveMoreTimeAction` defers
      the pause WITHOUT recording a payment (installment still owed, on-platform,
      by the later date). Resume/Give-more-time/Mark-paid each now carry a
      consequence-explaining overlay.
    - **Roster payment-column labels:** Paid in full / Off-platform / Granted —
      no more ambiguous bare "—".
  - ✅ **7e** Retire `price_minor` — shipped 2026-05-23. Single migration
    `20260612120000_slice_7e_retire_programme_price_minor.sql`: DROP VIEW
    nclex_public_programmes (column removal needs DROP, not REPLACE);
    recreate it without `p.price_minor`, with two new derived columns
    (`headline_price_minor` — COALESCE of active UPFRONT_FULL's total →
    cheapest active initial → 0; `headline_is_upfront` — boolean for the
    "from " prefix on the card / rail); ALTER DROP COLUMN price_minor.
    `syncUpfrontStrategy` is now the authoritative writer (not a mirror)
    — the programme form's Price box still exists, but writes only to the
    UPFRONT_FULL plan row. `getMyProgrammes` embeds the upfront row via
    `upfront:nclex_programme_payment_strategies(total_price_minor)` so the
    edit modal can pre-fill the Price field; `PaymentPlansContext`
    dropped `programme.price_minor`; the payment-plans panel derives its
    default-Total from `strategies[]`. `init.ts` PROGRAMME branch dropped
    `price_minor` from the SELECT and gained a fallback (when no
    `strategyId` is sent) that resolves the active UPFRONT_FULL plan
    instead. Public surfaces (discovery list, detail rail, checkout
    page) all switched to `headline_price_minor`; cards + rail render
    "from " on the non-upfront case (new `.from` style in
    `styles/discovery.css`). 15 files + 1 migration; typecheck clean;
    both seed programmes still derive identical headlines (₵3000 +
    ₵250) to the pre-cutover values. Commit `<TBD>`.
- ✅ **System Config admin page** — shipped 2026-05-22. The first real
  admin surface (replacing the `/admin/config` placeholder), built off the
  back of the sweep flag. Typed editors over the `nclex_config` key/value
  table — a yes/no switch for `enrolment_sweep_enabled` (inline toggle +
  confirm-on-off) and a percent editor for `bank_optin_discount` (modal).
  Driven by a small per-key definitions list (`config-defs.ts`: label /
  description / type / validation) so a value can't be saved in the wrong
  shape; `SYSTEM_MANAGE`-gated save action (service-role write, since
  `nclex_config` RLS is SUPER_ADMIN-only for writes). Also fixed the
  programme **detail page**'s hardcoded "40% off" add-on blurb — now reads
  the live discount via `getBankOptinDiscountPct()` (and hides at 0%); the
  checkout page was already dynamic. Surfaced when Sam edited the discount to
  20% and the detail page still said 40%.
- ✅ **Slice 8 — Self-paced + enquiry routing.** Shipped 2026-05-23 in
  three sub-slices.
  - ✅ **8a** Schema + public submission. Migration
    `20260613120000_slice_8a_programme_enquiries.sql`: new
    `nclex_programme_enquiries` table (programme-scoped lead capture,
    not cohort-scoped — the tutor decides cohort later in conversation),
    matching the design handoff §09 + the waitlist's
    `preferred_contact TEXT[]` + two CHECK constraints (subset-of-allowed
    + phone-required-when-phone-channel). RLS: anon-only via the
    `nclex_submit_enquiry` SECURITY DEFINER RPC (validates programme is
    enquiry-eligible: `payment_collection_mode = 'OFF_PLATFORM'` OR
    `NOT show_price_publicly`; idempotent on `(programme, email)`),
    tutor SELECT scoped to own programmes, SUPER_ADMIN-ALL bypass.
    `CONTACT_OPTIONS` lifted to `lib/discovery/contact-options.ts` so
    the waitlist + enquiry forms share one source. New
    `app/(public)/programmes/[id]/enquiry-cta.tsx` + the public
    `submitEnquiryAction` (`lib/discovery/enquiry-actions.ts`). Detail
    page CTA branching reshaped: `canEnrol` / `canWaitlist` /
    `canEnquire` are mutually exclusive — the disabled "coming soon"
    stub now only fires for the truly stuck case. Trigger rule landed
    as planned ("off-platform + no online checkout → show contact
    form"), and the rule also catches **tutor-led off-platform with no
    joinable cohort** as a fallback so that case no longer dead-ends.
    Commit `1fd2a53`. See SESSIONS 2026-05-23 (8a).
  - ✅ **8b** Tutor enquiry queue. New `/tutor/programme/<id>/enquiries`
    sibling route + `Enquiries` sidebar entry (placed before Students in
    the funnel order: enquiry → enrolment → student). New
    `lib/enquiries/` feature folder (types / queries / actions / format)
    mirroring `lib/enrolments/`. Tutor-side actions
    (`markContactedAction`, `markClosedAction`, `saveAdminNotesAction`)
    use the established pattern — gate ownership with the authed client
    first, write under service role — because `nclex_programme_enquiries`
    has no tutor UPDATE policy. **UI shape (initial):** shipped as an
    inbox split view (filter chips → scannable list on the left, full
    detail on the right) after a first card-stack attempt didn't read
    well. **Replaced 2026-05-24 by the CD V1 polished inbox** — see
    the "Slice 8 UI rebuild" subsection below. Status `FORWARDED →
    CONTACTED` renamed (tutor-perspective: button records the tutor's
    act of contacting the student, not platform-side "forwarded"
    jargon) via migration `20260614120000_slice_8b_rename_forwarded_to_contacted.sql`
    — loosen CHECK, UPDATE existing rows, re-tighten with new value,
    rename `forwarded_at → contacted_at`, rebuild both partial indexes
    that referenced the old name. Commit `e0b8bf6`. See SESSIONS
    2026-05-23 (8b).
  - ✅ **8c** Auto-convert on enrolment + admin queue. Migration
    `20260615120000_slice_8c_auto_convert_enquiry.sql`: `AFTER INSERT`
    trigger on `nclex_enrolments` (SECURITY DEFINER, runs after the
    row exists so the `converted_enrolment_id` FK target is real) reads
    the new enrolment's email from `nclex_users` and stamps any open
    enquiry (NEW/CONTACTED) for the same programme + lower(email)
    as `CONVERTED` with the new enrolment id linked. Fires for every
    enrolment path (tutor-add, on-platform checkout, future) — no
    "we forgot to call the matcher" risk. Smoke-tested end-to-end on
    mynclex-dev with a synthetic enquiry + matching SELF_PACED
    SELF_PAID enrolment → CONVERTED stamped + linked correctly.
    `/admin/enquiries` placeholder replaced with a real read-only
    cross-programme list (PROGRAMMES_VIEW-gated, SUPER_ADMIN bypass):
    service-role read embeds programme title + tutor name; client
    board renders filter chips (status) + a per-programme dropdown
    that appears only when ≥2 programmes have enquiries; richer card
    layout with status pill + programme · tutor header + lead identity
    + channel pills + message. Status writes intentionally NOT on
    the admin surface — each row has an "Open in tutor view ↗" link
    that hops to the owning tutor's queue, which already has the
    actions (SUPER_ADMIN bypass on the tutor RLS lets the admin land
    there). Commit `319d8f6`. See SESSIONS 2026-05-23 (8c).
  - **Scope refinement (was 2026-05-22, addressed in 8a):** the
    trigger rule "off-platform + no online checkout → show contact
    form" was adopted in 8a, plus the fallback case "tutor-led
    off-platform with no joinable cohort" so that path no longer
    dead-ends.
  - ✅ **Slice 8 UI rebuild (CD-driven, 3 PRs, 2026-05-24).** First
    real test of the [[feedback_cd_prototype_then_implement]] workflow.
    Brief went to Claude Design after Sam pushed back on the initial
    card-stack tutor surface ("the interphase is not nice at all");
    CD returned 3 hi-fi variants per audience. Picked Tutor V1
    (polished inbox) + Admin V1 (operations dashboard); shipped via 3
    serial commits on the same session branch.
    - **PR 1 — data layer** (commit `06c83a3`): `urgencyTier(iso,
      status)` + URGENCY_META in `lib/enquiries/format.ts`;
      `lib/enquiries/aggregations.ts` with `computeTutorStats` +
      `computeAdminStats` (pure functions; sparkline series via
      `bucketCounts` + `bucketSampled` helpers); four quick-reply
      templates + `renderTemplate` helper in
      `lib/enquiries/templates.ts`. No UI consumers yet —
      foundations only.
    - **PR 2 — tutor V1 polished inbox** (commits `8d40dc0` + width
      fix `e7c3b05`): `/tutor/programme/<id>/enquiries` rebuilt.
      Stacked: KPI strip (5 cards) → toolbar (filter chips + search)
      → split (day-grouped list with urgency-coloured left strip per
      row + detail pane). Detail pane: 44px gradient avatar +
      head meta + reply bar + body sections (Message · Quick replies ·
      Notes) + footer (enquiry ID + Close lead). **The killer
      feature** is the reply bar — WhatsApp/Call/Email CTAs open
      the channel deep-link AND call `markContactedAction` in the
      same click. Plus a "Mark contacted only" ghost CTA for the
      off-platform case. Quick-reply templates pre-fill channel-aware
      deep-links (chooseChannel picks the lead's preferred channel
      from their `preferred_contact[]` array, falls back to WhatsApp
      or Email). Notes use 800ms-debounced auto-save with a 3-second
      green "Saved · just now" flash. New `.ti-*` style family.
      **React 19 strict-mode polish** along the way: derived
      `selectedId` via useMemo (no setState-in-effect cascade);
      NotesEditor uses `key=enquiry.enquiry_id` for clean remount on
      switch rather than reset-on-effect; binary `recentlySaved` flag
      replaces `Date.now()`-in-render. **Width fix** (`e7c3b05`):
      the inherited `.pp-page` 720px cap was crushing the layout —
      added a new `.ti-page` wrapper (1480px max) so the page uses
      the available viewport. Other tutor pages still use `.pp-page`
      (the payment-plans form genuinely wants 720px).
    - **PR 3 — admin V1 operations dashboard** (commit `1364b92`):
      `/admin/enquiries` rebuilt. Stacked: KPI strip (4 cards w/
      inline 8-week sparklines + corner "X BREACHES" flag on the
      Volume card when there are NEW leads ≥24h old) → insights row
      (Tutor SLA scoreboard left, sorted by open work then volume so
      tutors needing attention surface first; Channel mix donut
      right, with legend + insight callout) → filterable table
      (status + programme + tutor selects; SLA badges per row —
      green "On track" / amber "Xh waiting" / red "SLA breach" / grey
      "—"; "Open in tutor view ↗" per row). Inline `Sparkline` +
      `Donut` SVG components (Donut uses a reduce-based pre-compute
      pass — React 19 strict-mode forbids mid-render mutation). New
      `.ao-*` style family. Aggregations extended in PR 1's module:
      `weeklySpark` / `hotWaitingSpark` / `avgResponseSpark` /
      `conversionSpark` — four 8-bucket series for the KPI
      sparklines; shared `bucketCounts` + `bucketSampled` helpers.
      Admin's status writes intentionally NOT here — every row's
      "Open ↗" hops to the owning tutor's queue where the actions
      already live.
    - **Scope note** added to `lib/enquiries/types.ts` (per a Sam
      forward-looking call): module is programme-scoped today. If a
      second enquiry type ever appears (general support, institutional
      sales), refactor to `lib/enquiries/{shared,programme,<new>}/`
      with shared status enum + format helpers extracted up. DB
      tables stay put (already correctly prefixed
      `nclex_programme_enquiries`). ~1-2 hrs cost when it happens;
      don't pre-split.
- ⬜ **5.7 (resequenced to last, 2026-05-22)** "My Payments" student page —
  transaction list (date, product, amount, currency, status). Moved out of
  the 5.x block to after Slice 8 so it can display **every** payment type +
  state once installments (Slice 7) and self-paced/enquiry (Slice 8) exist —
  building it earlier would only cover a subset.

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

## Part 3 — Library

The **Tutor Library** is a sibling product surface to the Bank: where
the Bank holds practice (questions), the Library holds teaching
(notes). It lives in the tutor's global nav alongside Bank + Quizzes,
attaches into programmes via Library Note / Shelf activity types,
and is read-only on the student side (visibility-filtered by note,
not by container).

**Full slice ladder + status lives in the planning doc, not here** —
single source of truth, no drift between this file and the
canonical plan:

- **[docs/product-plan/tutor-library.md → Build order](docs/product-plan/tutor-library.md#build-order-when-this-gets-queued)**
  — every slice (currently numbered 11.1a through 11.17) with
  ✅ / 🔨 / ⏭ / ⬜ status flags and per-slice scope.

Slice numbering: **11.x** (the next free top-level slot — Bank
occupies 1.x through 8.x, Programme 9.x and 10.x).

Currently shipped: **11.1a** (schema foundation, ⚠️ committed
unapplied) + **11.1b** (home shell chrome). **Next ⏭ is 11.2** —
folder CRUD + real folder lens data.

Build size estimate: ~6–8 weeks of focused work; markdown-textarea
fallback gate at slice 11.5 (Tiptap editor) shaves ~2 weeks if the
block editor proves painful.

---

## How to use this file

When a slice lands, flip ⬜ → ✅ and link the SESSIONS.md entry. When a
slice gets started, flip → 🔨. The "next" marker (⏭) moves down one row
each time we close a slice. Anything found mid-build that doesn't fit
the current slice goes either into a later slice (add a line) or
"Deferred to v2" (with a one-line reason).

Don't expand this into a project plan. Keep it a list.
