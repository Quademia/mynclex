# MyNclex Build List

The inventory of slices: everything built, everything queued, everything
parked, one line each, grouped by the plan doc that defines it. Rebuilt
to this shape on 2026-09-03 from a 373 KB file that had become a third
copy of the session log.

## Rules for this file

- **One line per slice:** `- <mark> <id> <name> — <date if built>`.
  Under 120 characters. No explanation, no commit hashes, no merge or
  release status (git holds that). What a slice *is* lives in its plan
  doc; what happened when it was built lives in `sessions/`.
- **Marks:** ✅ built (with the date) · ⬜ queued · ⏸ parked or deferred,
  with a one-line reason · ✖ cancelled.
- **A section per plan doc.** The heading links the doc; slice ids are
  the doc's own ids, so a line here joins to its definition there. A new
  plan doc brings its own section.
- **Built means ticked in two places in one commit:** here and in the
  plan doc's ladder. Ticks are facts about the past and do not go stale.
- **There is no "next" marker.** Sam decides each session; the first
  ⬜ in any section is that feature's candidate, and the top of
  `SESSIONS.md` shows where the momentum is.
- **Unplanned work still gets a line** when done, marked `(unplanned)`,
  so a tick always means "logged on this date" and this stays an
  inventory rather than a plan.
- **Found mid-build and out of scope:** add a ⬜ line in the right
  section, or a ⏸ line with its reason. Never a paragraph.

---

## Bank — authoring

### [bank.md](docs/product-plan/bank.md) · [questions-and-wrappers-rebuild-slice-plan.md](docs/product-plan/questions-and-wrappers-rebuild-slice-plan.md)

- ✅ 1.1 Schema + RLS + seed + admin view — 2026-04-21
- ✅ 1.2 MCQ / TF / SATA / Select N authoring — 2026-04-21
- ✅ 1.3 Editor architecture refactor — 2026-04-21
- ✅ 1.4 Filters + two-pane focus mode — 2026-04-21
- ✅ 1.5 Matrix authoring — 2026-04-21
- ✅ 1.6 Bow-tie authoring — 2026-04-22
- ✅ 1.7 `instruction` column — 2026-04-22
- ✅ 1.8 Cloze authoring — 2026-04-22
- ✅ 1.9 Highlight authoring — 2026-04-22
- ✅ 1.10 Drag-drop authoring — 2026-04-22
- ✅ 1.11 Case study wrapper (a shell + tabs, b child questions, c preview + validation) — 2026-04-24
- ✅ 1.12 Trend wrapper (a dataset, b attached questions, c delete flow) — 2026-04-24
- ✅ 2.1 Tutor-side bank authoring / reusability proof — 2026-04-22
- ✅ Rebuild 1–11 Every editor rebuilt on `lib/bank` + dual-mode preview — 2026-04-30
- ✅ Rebuild 12 Case study wrapper v2 (12a–12e) — 2026-05-01
- ✅ Rebuild 13 Trend wrapper v2 (13a–13e + polish) — 2026-05-01
- ✅ Rebuild 14 The swap: old editors deleted, -v2 suffix dropped — 2026-05-01
- ✅ Bank list pages MVP sweep (filters, search, hover-peek) — 2026-06-05
- ✅ Bank surfaces Claude Design redesign + pagination — 2026-06-06
- ✅ Publish-integrity gates (case needs 6 published children; trend question needs its dataset) — 2026-06-05
- ⬜ Move bank-list SORT server-side before the bank passes 500 questions
- ⬜ 1,307 pre-existing multi-select items with no `instruction`
- ⬜ Curator tag allowlist (only allowlisted tags reach the student Builder)

### [questions-and-wrappers-rebuild.md](docs/product-plan/questions-and-wrappers-rebuild.md) — rich content

- ✅ 0 Data model + storage + migration foundation — 2026-06-27
- ✅ 1 Rich-text primitive in the bank — 2026-06-28
- ✅ 2 Custom merge-table editor (2a/2b/2c; multiple tables per tab) — 2026-06-28
- ✅ 3 Student render of the custom table — 2026-06-28
- ✅ 4 Narrative tab: rich body + chips — 2026-06-28
- ✅ 5 Built-in templates to v2 (5.1–5.6 templates, 5.7 legacy convert + delete) — 2026-06-28
- ✅ 6a Rich text: MCQ + TF — 2026-06-29
- ✅ 6b Rich text: SATA + Select-N — 2026-06-29
- ✅ 6c Rich text: Matrix + Bow-tie — 2026-06-29
- ✅ 6d Rich text: Cloze — 2026-06-30
- ✅ 6e Rich text: Highlight — 2026-06-30
- ✅ 6f Rich text: Drag-drop — 2026-06-30
- ✅ 7 Media block in the narrative body; URL cache + lightbox — 2026-07-03
- ✅ 8 Stem images (8a–8d) — 2026-07-03
- ✅ MATRIX_MR new item type — 2026-07-01
- ✅ DRAG_CLOZE + DRAG_ORDER split out of DRAG_DROP; new-type wiring checklist — 2026-06-30
- ✅ Legacy DRAG_DROP decoupled and retired — 2026-07-02
- ✅ Trend 1–3 Trend tab storage, chart-tab engine, tabbed stimulus + snapshot — 2026-07-02
- ✅ Trend 4 Retire the flat grid — 2026-07-02
- ✅ Trend 5 Retire `kind` — 2026-07-02
- ✅ Wrapper harmonisation arc — 2026-07-02
- ✅ Wrapper tags (case + trend); 7 legacy case columns dropped — 2026-07-03
- ✅ Positional 1–3 Insert + reorder: merge table, matrix family, narrative entries — 2026-07-04
- ⏸ Positional 4 Option-list positional insert — parked, low demand
- ⏸ Curator discoverability of formatting affordances — parked
- ⏸ Indent (list nesting + paragraph indent) — parked
- ⏸ Real drag gesture over the click-to-place runners — parked until reopened
- ⏸ Rationale images — parked

### [audit-log.md](docs/product-plan/audit-log.md)

- ✅ 1 Data capture: tables, trigger, RLS, indexes — 2026-06-05
- ✅ 2 The readout: authorship line + history drawer — 2026-06-05
- ⬜ 3 Fold in library notes, quizzes, programmes

### [bank-coverage-gap-analysis.md](docs/product-plan/bank-coverage-gap-analysis.md)

- ✅ Gap analysis + 622-item gap-fill run; taxonomy normalised; marks defect fixed — 2026-07-28
- ⬜ Decision: ship the 622 unreviewed items to prod (`cat_pool` false, no `for_prod` tag)
- ⬜ 15 "Klimek angles" as the brief for the next authoring run
- ⬜ Seed files carry no ON CONFLICT clause; `validate.py` untested (no Python on this machine)

## Bank — student side

### [bank-consumption.html](docs/product-plan/bank-consumption.html) · attempt-creation · runner · marks-and-scoring

- ✅ 2.1 Attempt tables — 2026-05-05
- ✅ 2.1.5 Marking table — 2026-05-06
- ✅ 2.2 Create-attempt RPCs (2.2a pool + create, 2.2b started + discard) — 2026-05-06
- ✅ 2.3 Submit-answer RPC — 2026-05-07
- ✅ 2.4 Complete-attempt RPC — 2026-05-07
- ⬜ 2.4 Timeout sweep + orphan cleanup on pg_cron
- ✅ 2.5 Scoring module + system-managed marks (2.5a–d) — 2026-05-06
- ✅ 2.6 Filter breakdown RPC — 2026-05-06
- ✅ 4.1 Runner shell + MCQ vertical slice (4.1.1–4.1.5) — 2026-05-07
- ✅ 4.2 The other eight question-type runners — 2026-05-09
- ✅ 4.3 Case-block UX — 2026-05-09
- ✅ 4.4 Trend question rendering — 2026-05-09
- ✅ 4.5 Per-mode behaviour (a timer + save-on-tap, b archetypes, c sequential lock) — 2026-05-09
- ✅ 4.6 History page + resume (a, b) — 2026-05-10
- ✅ 4.7 Mark-for-review, built as flag + bookmark (see flag-and-bookmark.md) — 2026-07-30
- ✅ 4.8 Discard / abandon — 2026-07-30
- ✅ 4.9 Review filters via the grid colour key (see scoring-strip.md) — 2026-07-30
- ⬜ 4.9 By-category review filter
- ⬜ 4.9 A skipped question still reads WRONG in the strip
- ✅ 5.1 Builder page (a spine, b honest counts, c entry helpers, d tags/topic/subtopic) — 2026-05-06
- ✅ 5.1e Builder mobile variant + three-tab split — 2026-07-25
- ✅ 5.2 Recent Quizzes — 2026-05-06
- ✅ 5.3 Weak-spots quick-start (v1 heuristic) — 2026-05-06
- ✅ 5.4 Unfinished-session banner — 2026-05-06
- ⬜ 5.6 Source breakdown line + Source filter axis in the Builder
- ⬜ Builder EXAM-intent CAT option
- ✅ 6.1 Preflight screen — 2026-05-07
- ✅ 6.2 Results popup; the breakdown moved to the Session Report — 2026-07-30
- ✅ 6.4 Public Help section: `/help`, `/help/cat`, `/help/readiness-packs` — 2026-07-25
- ⬜ 6.4 `/help/payments` article
- ✅ 7.1 History as a directory (paging, filters, discard, Report + Review) — 2026-07-30
- ⬜ 7.1 History sort options + date-range filter
- ⬜ 7.2 Student analytics page
- ⬜ 7.3 Per-student-per-question state view
- ✅ 7.4 Bank Dashboard (= CAT slice 9) — 2026-07-23
- ⬜ 8.1 Tutor preview into the runner
- ⬜ 8.2 Admin QA into the runner
- ✅ The modes: two tuples cut, renamed, one `modeLabelFor()` — 2026-07-24
- ✅ Engagement clock (per-question time engine, slices 1–3) — 2026-07-12
- ✅ Practice builder + runner three-tab split; exam-mode leaks sealed — 2026-07-25
- ✅ Runtime option shuffle arc (runner slices 1–3b + embed player) — 2026-07-17
- ⏸ §15.1 mode-name proposal — retained as a future alternative
- ⏸ Engagement timeout back-dates `ended_at` — needs an RPC
- ⏸ Shared `<Bulb>` default list style hardening
- ⬜ Review shows then-and-now difficulty (optional)

### [bank-consumption-cat.html](docs/product-plan/bank-consumption-cat.html)

- ✅ 1 Schema migration — 2026-07-19
- ✅ 2 Rasch math — 2026-07-19
- ✅ 3 `create_cat_attempt` — 2026-07-19
- ✅ 4 Core loop, standalone-only — 2026-07-19
- ✅ 5 Case + trend handling (hybrid) — 2026-07-19
- ✅ 5h Time limit 4h to 5h — 2026-07-25
- ✅ 6a+6b Preflight, transition, runner shell reuse — 2026-07-19
- ✅ 6c Timed spinner / retry transition — 2026-07-21
- ✅ 7 Results / summary page — 2026-07-20
- ✅ 8 Review wiring + the CAT allowance end to end — 2026-07-22
- ✅ 9 Bank Dashboard + entry points — 2026-07-23
- ✅ 10a Five-band difficulty + curator calibration readout — 2026-07-27
- ✅ 10b1 `cat_pool` reservation flag + editor tick — 2026-07-28
- ✅ 10b2 Admin CAT-pool page — 2026-07-28
- ✅ 10b3 Selection draws only from the pool — 2026-07-29
- ✅ 10c Weekly recalibration job (GitHub Action, targets prod) — 2026-07-29
- ✅ 10d Snapshot carries difficulty; builder filter; student pill — 2026-07-29
- ✅ Timeout defect fixed, and the second defect it was hiding — 2026-07-22
- ⬜ Admin "recalibrate now" button
- ⬜ Calibration history readout
- ⬜ Misfit warnings (questions strong students keep getting wrong)
- ⬜ Reserve drawer takes ~6 s on the ~1,700-row free pool
- ⬜ A live CAT sitting not played end to end since 10b3
- ⬜ Decision: passing standard left at theta 0.0; needs a standard-setting exercise
- ⬜ cat.html still says "4 hours" in ~8 places
- ⏸ Mutual-exclusivity guard on `cat_pool` (boolean, not UNIQUE table) — deferred at 10b3
- ⏸ Audit "Hide all N" button — left out at 10b2

### [readiness-packs.md](docs/product-plan/readiness-packs.md)

- ✅ Planning closed: rules layer, §11.5 results page, band rename — 2026-07-06
- ✅ Admin 1 Link table + seed + packs list — 2026-07-07
- ✅ Admin 2a Pack detail spine — 2026-07-07
- ✅ Admin 2b The picker (case-as-unit, trend per-question) — 2026-07-07
- ✅ Admin 3 Meters + publish gate + reserved-stock lens — 2026-07-07
- ✅ Admin polish + pack audit history drawer — 2026-07-08
- ✅ Student 1 Public `/readiness` page + READINESS products; cedi sign retired product-wide — 2026-07-08
- ✅ Student 2a Credits table + mint-at-activation — 2026-07-08
- ✅ Student 2b.1 Readiness checkout route — 2026-07-08
- ✅ Student 2b.2 Packs surface + claiming + 21-day window — 2026-07-09
- ✅ Student 2b-i…iii One-shot runner: create, begin, sit, quit, re-enter — 2026-07-09
- ✅ Student 2b-iv Completion + USED card + in-window review — 2026-07-11
- ✅ Report 1–6 Readiness results report — 2026-07-11
- ✅ Report 7 Polish + QA — 2026-07-12
- ✅ Lazy-expiry (`expired_at` on next touch) — 2026-07-13
- ✅ Public `/readiness` cinematic redesign — 2026-07-13
- ✅ Location-aware default currency on dual-currency pages — 2026-07-15

### [runner-mobile.md](docs/product-plan/runner-mobile.md)

- ✅ 1 Shell + sheet shell + session menu — 2026-07-31
- ✅ 2 Grid sheet — 2026-07-31
- ✅ 3 Answers — 2026-07-31
- ✅ 4 Case + trend wrappers — 2026-07-31
- ✅ 5 Matrix + bow-tie reflows — 2026-07-31
- ✅ 6 Calculator docked — 2026-08-01
- ✖ 7 Landscape layer — cancelled 2026-08-03
- ✅ 8 Runner tutorial pass — 2026-08-01
- ✅ Tablet-landscape band 900–1300px; four runner defects — 2026-08-03

### [runner-tutorial.md](docs/product-plan/runner-tutorial.md)

- ✅ 1 Sandbox runner mode — 2026-07-26
- ✅ 2 Coach layer + flow — 2026-07-26
- ✅ 3 Entry points + done memory (3a tables, 3b route, 3c four doors) — 2026-07-26

### [calculator.md](docs/product-plan/calculator.md)

- ✅ On-screen calculator, app-wide, runner topbar toggle — 2026-07-25

### [flag-and-bookmark.md](docs/product-plan/flag-and-bookmark.md)

- ✅ 1 Bookmark end to end — 2026-07-30
- ✅ 2 Flag storage — 2026-07-30
- ✅ 3 Flag in runner and grid — 2026-07-30
- ✅ 4 Session report study-list reading — 2026-07-30
- ✅ 5 Tutorial + vocabulary sweep — 2026-07-30
- ⬜ "My bookmarks" surface
- ⬜ Bookmarked filter on the case bank; topbar overflow menu
- ⏸ Case-level bookmarking; mark history — deferred

### [session-report.md](docs/product-plan/session-report.md) · [scoring-strip.md](docs/product-plan/scoring-strip.md) · [case-bank.md](docs/product-plan/case-bank.md)

- ✅ Session Report + History as directory — 2026-07-30
- ✅ Review scoring strip — 2026-07-30
- ✅ Student Case Study bank — 2026-07-30
- ⬜ "Re-quiz what you got wrong" (Builder INCORRECT-pool deep link)
- ⬜ Per-question deep links in Review; deep-link Review to a case's first question
- ⬜ Case bank coverage signal ("8 of 22 done"); case-scoped review surface
- ⬜ Scoring strip: tap-to-reveal on phones; multi-select filtering
- ⬜ Curator "hardest questions" view
- ⬜ Case content supply: CAT reservations compete for the same shelf

## Programme

### [main.md](docs/product-plan/main.md) — programme structure

- ✅ 9.1 Programme list + create + edit (a, b, c) — 2026-05-10
- ✅ 9.1d Programme/unit auto-sync — 2026-05-13
- ✅ 9.2 Programme/cohort split (a schema, b cohorts tab, c cohort subtree) — 2026-05-12
- ✅ Cohort workspace folds into the Cohorts tab (steps 1–4) — 2026-06-12
- ✅ Programme sidebar identity + Delivery section — 2026-06-12
- ✅ Tutor programme Overview page (1 + 2) — 2026-06-24
- ✅ Tutor Home dashboard + Programmes list uplift (tutor-home.md) — 2026-06-04
- ✅ Student Overview home (1 + 2) — 2026-06-22
- ⏸ Duplicate programme / duplicate cohort — deferred, no demand yet
- ⏸ Calendar (Mon–Sun) view — superseded by the Month view below

### [curriculum-authoring-ux.md](docs/product-plan/curriculum-authoring-ux.md) · [media-assets.md](docs/product-plan/media-assets.md)

- ✅ 9.3a Schema + Units Overview — 2026-05-12
- ✅ 9.3b Unit Builder + Text activity — 2026-05-12
- ✅ 9.3c Blocks — 2026-05-12
- ✅ 9.3d-a External link + Online live session — 2026-05-12
- ✅ 9.3d-b Media foundation (asset table, bucket, upload action) — 2026-05-13
- ✅ 9.3d-c PDF activity — 2026-05-13
- ✅ 9.3d-d Mock + Practice quiz placeholders — 2026-05-13
- ✅ 9.3e Publish state + content visibility — 2026-05-13
- ✅ 9.3f Cohort curriculum checklist — 2026-05-14
- ✅ Curriculum workspace master-detail rework + CD-diff close-out — 2026-06-08
- ✅ Text activity: rich authoring, formatted rendering, reading route — 2026-06
- ✅ Curriculum two-pane redesign (student + tutor cohort) — 2026-06-21
- ⏸ `IN_PERSON_LIVE_SESSION` activity type — deferred, no demand
- ⏸ Add-from-template for cohort checklists — deferred until a real cohort needs it
- ⏸ Avatar uploads; video upload — media consumers not built
- ⏸ Media sweeper job — soft-delete only

### Student curriculum (main.md → Student surface)

- ✅ 10.1 Curriculum viewer scaffold — 2026-05-15
- ✅ 10.1b Launcher conversion + shared activity-type icon — 2026-05-15
- ✅ 10.2–10.5 Per-type viewers: link, live session, PDF, text — 2026-05-15
- ✅ 10.6 Locked activity rows — 2026-05-15
- ✅ 10.7 Activity window (due + close) — 2026-05-15
- ✅ 10.8 Tabbed student curriculum — 2026-05-15
- ✅ Mock + Practice quiz viewers (via tutor-quiz slice 3) — 2026-05-15

### [curriculum-month-view.md](docs/product-plan/curriculum-month-view.md)

- ✅ 1 Tutor Month view — 2026-06-27
- ✅ 2 Student Month view — 2026-06-27

### [cohort-specific-activities.md](docs/product-plan/cohort-specific-activities.md)

- ✅ 1 Schema + cohort-only loose activities — 2026-06-14
- ✅ 2 Cohort-only blocks — 2026-06-14
- ✅ 3 Reference types (3a quizzes, 3b note / shelf) — 2026-06-14
- ✅ 4 Ordering / placement — 2026-06-14
- ✅ 5 Polish — 2026-06-14

### [live-session-planner.md](docs/product-plan/live-session-planner.md)

- ✅ 1 Marker/planner split + schedule (1a + 1b) — 2026-06-15
- ✅ 2 Integrity + one-offs — 2026-06-15
- ✅ 3 Attendance to derived completion (tutor) — 2026-06-16
- ✅ 3b Student Sessions page + streak + curriculum badge — 2026-06-16
- ✅ 4 Attendance into the completion % — 2026-06-16
- ⬜ 5 V2 managed sessions system

### [tutor-quiz-system.md](docs/product-plan/tutor-quiz-system.md)

- ✅ 1 Quiz foundation — 2026-05-16
- ✅ 2 Link to activity — 2026-05-17
- ✅ 3 Student launch — 2026-05-15
- ✅ 3a Universal end-of-quiz results popup — 2026-05-15
- ⏸ 4 Progress / analytics integration — folded into progress-engine analytics
- ✅ 5 Programme-level quiz membership, tutor — 2026-05-16
- ✅ 6 Student Quizzes page — 2026-05-16
- ✅ §11 Creation-flow hardening + rich picker — 2026-06-06
- ✅ §12 UI uplift (Claude Design list + editor) — 2026-06-06
- ✅ §13 Quiz tags + context badges — 2026-06-09
- ✅ §14 Programme quiz list grouped rows — 2026-06-09
- ✅ Picker bulk Select-all + Tags filter — 2026-07-09
- ⏸ §9.9 Cohort-level quiz divergence — trigger: a real tutor asks for per-cohort quizzes

### [progress-engine.md](docs/product-plan/progress-engine.md)

- ✅ 1 Engine foundation — 2026-05-16
- ✅ 2 Manual completion + state pills — 2026-05-16
- ✅ 3 Soft guidance — 2026-05-16
- ✅ 4 Programme history split — 2026-05-16
- ✅ 4b Attempt count column — 2026-05-16
- ✅ Analytics 1 Cohort completion dashboard — 2026-06-03
- ✅ Analytics 2 Per-quiz pass rate + score chips — 2026-06-03
- ✅ Analytics 2b Per-question miss-rate — 2026-06-03
- ✅ Cohort Overview + Analytics merged — 2026-06-25
- ✅ §6.4 Programme-level / self-paced Progress tab — 2026-08-23
- ✅ `progress.inactivity_nudge` (self-paced) — 2026-08-24
- ⬜ Cohort-student extension of the inactivity nudge
- ⬜ Cross-cohort roll-up
- ⬜ Per-student 360 view
- ⬜ `/tutor/students` (placeholder today)
- ⏸ Retake-from-history — pure UX wiring, when asked for
- ⏸ Wider % counting (programme-level, block, cohort) — Sam to pick visual treatments

### [payments-and-enrolment.md](docs/product-plan/payments-and-enrolment.md)

- ✅ 1 Off-platform tutor-add + `/welcome` — 2026-05-20
- ✅ 2a Tutor lifecycle RPCs — 2026-05-20
- ✅ 2b Student status pills — 2026-05-20
- ✅ Access-gating step; picker rebuilt — 2026-05-20
- ✅ 3 Programme deltas + discovery + detail (a, b, c) — 2026-05-20
- ✅ 3.5 Tutor public profile JSONB — 2026-05-20
- ✅ 4 Student-initiated waitlist — 2026-05-20
- ✅ 5.1 Schema + seed: products, payments, subscriptions, config — 2026-05-21
- ✅ 5.2 Paystack init + verify + dup-check — 2026-05-21
- ✅ 5.3 Activation engine (bank) — 2026-05-21
- ✅ 5.4a Programme checkout page — 2026-05-21
- ✅ 5.4b Bank opt-in card, one combined charge — 2026-05-22
- ✅ 5.5 Standalone bank landing + purchase; shared checkout shell — 2026-05-22
- ✅ 5.6 Bank entitlement gating — 2026-05-22
- ⬜ 5.7 "My Payments" student page
- ✅ 7a Strategies schema — 2026-05-22
- ✅ 7b Tutor payment-plan config UI — 2026-05-22
- ✅ 7c Checkout plan picker — 2026-05-22
- ✅ 7d Installments lifecycle + nightly sweep + grace + mark-paid — 2026-05-22
- ✅ 7e Retire `price_minor` — 2026-05-23
- ✅ System Config admin page — 2026-05-22
- ✅ 8a Enquiries schema + public submission — 2026-05-23
- ✅ 8b Tutor enquiry queue — 2026-05-23
- ✅ 8c Auto-convert on enrolment + admin queue — 2026-05-23
- ✅ 8 UI rebuild, CD-driven (3 PRs) — 2026-05-24
- ✅ Enrolments tab moved to programme level; self-paced Enrolments + access-window freeze — 2026-06-12
- ✅ Tutor-add with a payment plan (convert-with-plan) — 2026-06-12
- ✅ Global `/tutor/payments` ledger — 2026-06-22
- ✅ Cohort plans 1–3: cohort_id, Pricing tab clone-and-edit, cohort-aware checkout, pickers — 2026-06-22
- ✅ Payments E2E track A + track B; pay-first fix; checkout step-wizard — 2026-06-24
- ✅ Payment result screen + approve-confirm + `payment_gates_access` toggle — 2026-06-24
- ✅ Global `/tutor/enquiries`; universal "Contact the tutor" — 2026-06-25
- ✅ Access window speaks + tutor Extend access + roster Access column — 2026-08-24
- ✅ 7-day bank trial: zero-cost BANK_TRIAL order, guest + signed-in grant, two guards — 2026-09-04
- ⬜ Student buying more access (needs a price)
- ⬜ Admin-grant enrolment path
- ⬜ Trial-expiry email (a trial ending in silence is a wasted conversion)
- ⬜ Retry path for any order stranded by a failed `/welcome` activation (trials have one; other purposes do not)
- ⏸ Per-student schedule control (due-date editing) — parked 2026-06-12

## Library

### [tutor-library.md](docs/product-plan/tutor-library.md)

- ✅ 11.1a Schema + RLS — 2026-05-26
- ✅ 11.1b Library home shell — 2026-05-26
- ✅ 11.2a Folder CRUD — 2026-05-26
- ✅ 11.2b Note CRUD + editor route — 2026-05-26
- ✅ 11.3a Shelf entity + sidebar lens — 2026-05-26
- ✅ 11.3b All Shelves carousel + add-to-shelf — 2026-05-26
- ✅ 11.4 Shelf detail view; folder kebab; editor edit-cue — 2026-05-26
- ✅ 11.5 Tiptap editor scaffold (11.5a + 11.5b) + full build-out — 2026-05-27
- ✅ Library Overview + system Views + sidebar polish; note-card consistency + On-shelves rail — 2026-05-27
- ✅ 11.6a Image block (+ the Server Action attrs fix) — 2026-05-29
- ✅ 11.6b/c PDF, Video, Table blocks — 2026-05-30
- ✅ 11.7 Callout block — 2026-05-30
- ✅ 11.8 Drug card block — 2026-05-30
- ✅ 11.9 Lab values block — 2026-05-30
- ✅ 11.10 Publish flow + visibility + status pills + alt-text preflight — 2026-05-30
- ✅ 11.15 Embedded questions, tutor authoring — 2026-05-30
- ✅ 11.16a Content search — 2026-05-31
- ✅ 11.16b Tags lens + manage-tags modal — 2026-05-31
- ✅ 11.16c Custom views + scroll-cap — 2026-05-31
- ✅ 11.13a Student read-mode renderer — 2026-05-31
- ✅ 11.13b Embedded-questions player + attempt history — 2026-06-01
- ✅ 11.14a/b Student library, read-only lensed mirror — 2026-05-31
- ✅ 11.14c Student Study Home — 2026-06-01
- ✅ 11.11a Library Note activity: authoring + render — 2026-06-01
- ✅ 11.11b Library Note activity: progress fold-in — 2026-06-01
- ✅ 11.11c Tutor Question analytics; student My practice — 2026-06-26
- ✅ 11.12a Shelf activity: tutor authoring — 2026-06-01
- ✅ 11.12b Shelf activity: student render + completion rollup — 2026-06-01
- ✅ 11.12c "Your tutor updated this shelf" hint — 2026-06-01
- ✅ Programme Library tab (tutor student-preview) — 2026-06-09
- ⬜ 11.17 Polish: used-in click-through, save dialogs, smaller affordances
- ⬜ "Recent" view visit tracking
- ⏸ Quademia-side (admin) library — not v1; the schema allows an admin twin later

## Platform

### [nav-scaffold-kickoff.md](docs/product-plan/nav-scaffold-kickoff.md) · [student-nav.md](docs/product-plan/student-nav.md) · app-shell

- ✅ Auth schema; auth flow 1 + 2 (role-specific dashboards) — 2026-04-21
- ✅ 2.5 App shell — 2026-04-21
- ✅ UI 1 Light theme migration — 2026-04-21
- ✅ 2.6 Student nav scaffold + folder convention — 2026-04-25
- ✅ 2.7 Tutor nav scaffold (+ programme route split fix) — 2026-04-26
- ✅ 2.8 Admin nav scaffold — 2026-04-26
- ✅ 2.9 `lib/access` foundation + initial migration; 2.9b rename — 2026-04-26
- ✅ 2.9 Locked shell + railed sidebars + sidebar user bar — 2026-05-27
- ✅ 2.10 CSS leak fix — 2026-04-26
- ✅ Repo decoupled from gamma; own Supabase project; prod pipeline — 2026-04-28
- ✅ Homepage rebuild — 2026-05-22
- ✅ Bank + Programmes public cinematic redesigns — 2026-07-15

### [mobile-responsive.md](docs/product-plan/mobile-responsive.md)

- ✅ 1 Mobile drawer + account sheet, all audiences — 2026-06-21
- ✅ 2 Student bottom tabs — 2026-06-21
- ✅ 3 Polish: scroll-lock, resize-close, focus-on-open — 2026-06-21
- ✅ Custom quiz builder mobile-compatible — 2026-07-24
- ✅ Student content sweep, seven surfaces — 2026-08-20
- ✅ Tutor content sweep, eleven surfaces — 2026-08-20
- ✅ Public site mobile nav — 2026-08-22
- ✅ Library sweep (student reader, list shell, tutor preview) — 2026-08-24
- ⬜ Library: embed player mobile layer
- ⬜ Library: PDF blocks mobile layer
- ⬜ Library: Tags lens grouping threshold + rail cap (designed, not built)
- ⬜ Library: tutor preview reading column width
- ⬜ Bank / curator area sweep
- ⬜ Admin surfaces sweep
- ⬜ Picker mobile treatment
- ⬜ `.ti-stats` KPI block on tutor enquiries
- ⬜ `/privacy` and `/terms` (parent-site repo)
- ⏸ Tutor/admin bottom tabs — parked
- ⏸ Full focus-trap in drawer/sheet; `.shell-root` 100dvh inner scroll — deferred

### [domain-and-identity.md](docs/product-plan/domain-and-identity.md) · [company-registration.md](docs/product-plan/company-registration.md)

- ✅ Company named: quademia.com, inbox, identity — 2026-08-05
- ✅ 1 Resend domain verify + custom SMTP + branded auth templates — 2026-08-06
- ✅ 2a `nclex_auth_events` logbook — 2026-08-06
- ✅ 2b `/forgot-password`, `/reset-password` — 2026-08-06
- ✅ 2c Per-email thresholds — 2026-08-06
- ✅ 2d Turnstile on the public forms — 2026-08-08
- ✅ 3 Email-code login (3a–3f) — 2026-08-09
- ✅ 4 `nclex.quademia.com` attached — 2026-08-09
- ✅ 5 Google sign-in — 2026-08-09
- ✅ 6 Transactional email arc (see transactional-email.md) — 2026-08-18
- ✅ Parent site `quademia.com`, a second repo — 2026-08-10
- ✅ Brand sweep: QAcademy never reaches a reader; `metadataBase` — 2026-08-22
- ⬜ Company registration: QUADEMIA LIMITED filed (off-platform; target within a month of 2026-09-02)
- ⬜ Which Paystack account MyNclex prod uses; live `PAYSTACK_SECRET_KEY` on the prod Worker
- ⬜ Legal pages in force once the company exists
- ⬜ Brand logo on the Google consent screen, auth templates, Workspace avatar
- ⏸ 7 Cross-product SSO — parked

### [transactional-email.md](docs/product-plan/transactional-email.md)

- ✅ Design: two builds wearing one list — 2026-08-10
- ✅ 1a Outbox queue + receipt (`payment.received`) — 2026-08-11
- ✅ `enrolment.tutor_added`, `waitlist.converted` — 2026-08-12
- ✅ 1b Drain + retry policy; `payment.installment_due` / `_overdue` — 2026-08-18
- ✅ `payment.tutor_received`, `enrolment.approved`, `enrolment.rejected` — 2026-08-19
- ✅ `session.reminder` fan-out with `.ics` — 2026-08-20
- ✅ `tutor.added_by_admin`, `tutor.suspended`, `tutor.reinstated` — 2026-08-21
- ✅ `tutor.application_*` (submitted_admin, received, approved, rejected) — 2026-08-22
- ✅ `enrolment.access_expiring` / `_expired` / `_extended` — 2026-08-24
- ✅ `progress.inactivity_nudge` — 2026-08-24
- ⬜ `payment.failed`
- ⬜ `enrolment.paused` / `resumed` / `cancelled` (the fourth condition, 2026-09-01)
- ⬜ 2e Bank / readiness subscription expiry email
- ⬜ `waitlist.joined`, `payment.grace_set`, `payment.refunded`
- ⬜ `session.rescheduled`, `session.cancelled`, `session.recording_available`
- ⬜ `enquiry.received`, `enquiry.replied`
- ⬜ `account.welcome`, `progress.milestone`, `curriculum.content_released`
- ✖ `enrolment.confirmed` — folded into `payment.received`
- ✖ `tutor.invited` — retired for the `SET_UP` dial

### [tutor-onboarding.md](docs/product-plan/tutor-onboarding.md)

- ✅ Design: the tutor nobody can create — 2026-08-21
- ✅ 1a `nclex_tutors` table + the lift — 2026-08-21
- ✅ 1b Admin tutor directory — 2026-08-21
- ✅ 1c Add a tutor — 2026-08-21
- ✅ 1d Suspend and reinstate — 2026-08-21
- ✅ 2a-i Application form, signed-in — 2026-08-22
- ✅ 2a-ii Logged-out application branch — 2026-08-22
- ✅ 2b `/admin/applications` — 2026-08-22
- ✅ 2c Rejection, resubmission, the way back in — 2026-08-22
- ✅ 3 Invite a tutor by email — 2026-08-22
- ⬜ Student-facing suspension notice
- ⬜ Account settings (edit an invited tutor's name after `/welcome`)
- ⬜ One place answering "is this programme publicly live?"
- ⬜ The `1a-drop` migration
- ⬜ `private, no-store` gap repo-wide

### [tutor-plans-and-billing.md](docs/product-plan/tutor-plans-and-billing.md) — PROPOSAL, every price open

- ✅ Design: seats, the ladder, payments as a capability — 2026-09-01
- ⬜ §5 `ENROLMENT_LOCKED_REASON` paused-copy defect (on prod; small, separable)
- ⬜ §5 Access window required, not pre-filled; 24-month max; the helper text
- ⬜ §12/1 Subscription record + seat grant + the one enrolment gate
- ⬜ §12/2 Seat display + upgrade flow
- ⬜ §12/3 Setup-credit ledger + balance + request form
- ⬜ §12/4 On-platform capability + seat check in `startPayment`
- ⬜ §7 On-platform payments capability: subaccounts, approval surface
- ✖ Tutor 30-day trial — removed by design 2026-09-01 (Starter's 10 seats replace it)
- ⏸ Partner tier — trigger: three or more tutors holding the capability at Academy's band
- ⏸ Payment splits / marketplace billing — deferred; we stay merchant of record otherwise

### [tutor-public-page.md](docs/product-plan/tutor-public-page.md)

- ⬜ 1 Public identity and route
- ⬜ 2 Services and enquiries
- ⬜ 3 Contact, credentials, moderation
- ⬜ 4 Discovery and optimisation

### [admin-management.md](docs/product-plan/admin-management.md)

- ✅ Admin System Config page — 2026-05-22
- ✅ Admin enquiries operations dashboard — 2026-05-24
- ⬜ `/admin/permissions` v1

### RLS ownership sweep (CLAUDE.md → Known Workarounds; `lib/*/tutor-scope.ts`)

- ✅ Tutor Library leak + the mirrored student-side leak — 2026-08-25
- ✅ Programmes, roster, payments: 13 call sites — 2026-08-25
- ✅ The admin `FOR ALL` member: tutor bank scoping — 2026-08-27
- ⬜ The ~50 other tables carrying an admin `FOR ALL` policy, not yet walked
- ⬜ Preview-as-a-student outside the Library

### Lint + tooling

- ✅ Lint baseline + staged-only pre-commit hook — 2026-08-20
- ⬜ 30 react-hooks errors carried in the baseline

### [journey-tracker.md](docs/product-plan/journey-tracker.md)

- ⏸ Planned only, no schema or code; `journey_*` prefix reserved — not started

## Deferred to v2

- NGN item types beyond what the bank has (per CLAUDE.md)
- Calibrated pass-probability number; 2PL / 3PL IRT; hard CAT blueprint enforcement; cases / trends in CAT
- Validated peer-percentile model
- Saved filter presets in the Builder
- Faculty / cohort dashboards (institutional product)
- Spaced repetition
- Migration of MyNMCLicensure or MyTeacher onto this stack
