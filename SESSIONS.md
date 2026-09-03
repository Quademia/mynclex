# MyNclex Sessions Log

Index of MyNclex work sessions, newest first. **This file is the index
only.** Detail lives in the period files under `sessions/` (monthly by
default), and that is where it should stay rich. Product-local, per the
extraction rule in CLAUDE.md.

## Rules for this file

- **One line per session:** `- YYYY-MM-DD — short title`. Under 160
  characters. Plain text — no bold, no emoji markers, no commit hashes.
- **Merge and release status do NOT go here.** Status written into an
  index goes stale (six stale flags between 2026-08-21 and 2026-09-03).
  `git log origin/main` and `origin/prod` are the truth; the period
  file records what was true on the day it was written.
- **Everything else goes in the period file** — what was built, why,
  what was rejected, what is open. Do not compress a session into a
  paragraph here; the period file already holds the full entry.
- **Why this shape:** on 2026-09-03 this file was 414 KB — 149 entries
  averaging 3 KB each, a table of contents as long as the book, too big
  to open in one read. Rewritten to this shape the same day.
- When logging a session, ask Sam whether to append to the current
  period file or start a new one.

---

## 2026-09 — [sessions/2026-09.md](sessions/2026-09.md)

- 2026-09-02 — company registration: Ghana first (QUADEMIA LIMITED), UK later, as siblings; payment rails per product. Claude web, logged 09-03
- 2026-09-01 (later) — the tutor plan ladder: Starter/Pro/Academy, seats 10/50/200 + overage, no trial, payments a capability. Design only

## 2026-08 — [sessions/2026-08.md](sessions/2026-08.md)

- 2026-08-27 — the RLS union's third member is the admin: tutor bank scoping; then part two, the tutor plans & billing design
- 2026-08-25 (later) — finishing the RLS sweep: programmes, roster, payments (13 call sites)
- 2026-08-25 — RLS is the floor, not the filter: the tutor Library leak and its student-side mirror
- 2026-08-24 (later still) — the library sweep, student side (mobile)
- 2026-08-24 (later) — the access window stops ending in silence
- 2026-08-23/24 — self-paced students: progress, then the inactivity nudge
- 2026-08-22 (later) — tutor onboarding slice 3 (invite by email); the public site had no mobile nav
- 2026-08-22 — tutor onboarding slice 2: /for-tutors, the application, the admin queue
- 2026-08-21 (evening) — tutor onboarding slice 1d, and the switches that were not switches
- 2026-08-21 (later) — four sub-slices, and three defects no tool could see
- 2026-08-21 — tutor onboarding designed: the tutor nobody can create. Docs only
- 2026-08-20 (evening) — the tutor phone sweep: eleven surfaces
- 2026-08-20 (later still) — the student phone sweep: seven surfaces
- 2026-08-20 (later) — the lint backlog got a number, then a gate (baseline + pre-commit hook)
- 2026-08-20 — the invite swap finished; the live-class reminder email built
- 2026-08-19 (later) — three emails built, three shipped promises found broken
- 2026-08-19 — we own the auth redirect; Google names the company
- 2026-08-18 (later) — the email arc ships to prod
- 2026-08-18 — the email drain, the retry policy that was never running, the sweep that stopped being silent
- 2026-08-12 — email arc: enrolment.tutor_added + waitlist.converted
- 2026-08-11 — email arc slice 1a: the outbox queue
- 2026-08-10 (later) — the email arc planned. Design only
- 2026-08-10 — quademia.com: the parent site, a second repo
- 2026-08-09 (later still) — Google becomes a sign-in method, not a sign-up method
- 2026-08-09 (later) — nclex.quademia.com: the app gets its real address
- 2026-08-09 — Turnstile's testing keys on dev; slice 3: email-code login
- 2026-08-08 — slice 2d: Turnstile
- 2026-08-06 (evening) — slice 2c: login thresholds and the countdown
- 2026-08-06 (later still) — identity arc slices 2a + 2b: auth events
- 2026-08-06 (later) — the four email templates became two. Docs only
- 2026-08-06 — build-order item 1: Resend domain verified. Docs only
- 2026-08-05 (later) — domain, inbox and identity in one sitting. Docs only
- 2026-08-05 — the company got named: domain-and-identity.md. Docs only, cloud session
- 2026-08-03 (later) — two cloud branches come home
- 2026-08-03 — four defects, none of them the one we set out to fix
- 2026-08-01 (later still) — the free weekly Q&A seed becomes a taught year
- 2026-08-01 (later) — 08-maternity.sql seed finished against dev
- 2026-08-01 — the tutor pitch: sample programmes, demo accounts, one real bug
- 2026-08-01 — runner-mobile arc finishes its phone work: slices 6 and 8

## 2026-07 — [sessions/2026-07.md](sessions/2026-07.md)

- 2026-07-31 — the runner learns the phone; a redesign deliberately stopped
- 2026-07-30/31 (later still) — the review scoring strip
- 2026-07-30 (later) — marking, built as two features: flag + bookmark
- 2026-07-30 — History becomes a directory; practice gets a Session Report
- 2026-07-29/30 — the student Case Study bank
- 2026-07-29 (later still) — CAT slice 10d + the reservation guard
- 2026-07-29 (later) — CAT slice 10c: difficulty stops being an opinion
- 2026-07-29 — CAT pool: 10b2 corrections, the regrain, 10b3 reservation enforced
- 2026-07-28 (later still) — CAT slice 10b2: the admin CAT-pool page
- 2026-07-28 (later) — cloud-branch reconciliation + the marks defect
- 2026-07-28 — CAT slice 10a + the calibration readout + 10b1
- 2026-07-28 — bank coverage gap analysis + the 622-item gap-fill run
- 2026-07-26 (later) — two fixes + the CAT recalibration design arc
- 2026-07-26 — runner tutorial slice 3: the entry points (arc complete)
- 2026-07-26 — runner tutorial slices 1 + 2 built
- 2026-07-25 — calculator · help · CAT 5h · tutorial design
- 2026-07-25 (later) — practice builder + runner: three-tab split, exam-mode leaks stripped
- 2026-07-25 — the engagement clock, the mode-name decision, the resume rule
- 2026-07-24 (later) — the modes: investigated, two cut, renamed
- 2026-07-24 — the custom quiz builder made mobile-compatible
- 2026-07-23 — CAT slice 9: the student Bank Dashboard
- 2026-07-22 (later) — CAT slice 8 + the CAT allowance wired end to end
- 2026-07-22 — CAT: the timeout defect fixed, and the second defect it was hiding
- 2026-07-21 — CAT: the termination popup re-pointed at the report; the timeout defect found
- 2026-07-20 — CAT slice 7: the results page; two settled decisions reopened
- 2026-07-19 — THE CAT BUILD: slices 1–5 + 6a/6b; the first full CAT sat end to end
- 2026-07-18 — CAT plan deep-read + the case-scoring HYBRID decision. Docs only
- 2026-07-17 — CAT phase-2 reconcile · the runtime option-shuffle arc · main → prod release
- 2026-07-15 — CAT phase-1 merge · location-aware currency · Bank + Programmes cinematic redesigns
- 2026-07-13 (third) — public /readiness cinematic redesign
- 2026-07-13 — readiness lazy-expiry
- 2026-07-12 (later) — readiness report ⑦: polish + QA
- 2026-07-12 — per-question time engine (slices 1–3) + readiness report improvements
- 2026-07-11 — readiness results report: slices ①–⑥
- 2026-07-10 — Maryland transcription: Community + Family folders done; multi-agent batch mode proven
- 2026-07-09 (third) — readiness step 2b: the one-shot runner
- 2026-07-09 (second) — dev bank fill to ~500; picker bulk-select + Tags filter; the marks=1 fix
- 2026-07-09 — readiness ②b.1 checkout + ②b.2 packs surface + a reason-aware access wall
- 2026-07-08 (third) — readiness student slice ②a: the credits table + mint-at-activation
- 2026-07-08 (second) — readiness student slice ①: the public /readiness page; the cedi sign retired
- 2026-07-07/08 — readiness admin side complete: the picker, meters, publish gate
- 2026-07-07 — readiness-packs build opened: slice ① + ②a
- 2026-07-06 — readiness planning closed: §11.5 results page settled, band rename
- 2026-07-04 (second) — readiness packs: canonical doc created + the rules layer settled
- 2026-07-04 — positional insert & reorder across the authoring surfaces (slices 1–3)
- 2026-07-03 (third) — builder case-eligibility fix + wrapper tags; 7 legacy case columns dropped
- 2026-07-03 (second) — slice 8 stem-image arc (8a–8d)
- 2026-07-03 — slice 7 media block; URL cache + lightbox
- 2026-07-02 (second) — trend slice 5 (retire `kind`) + DRAG_DROP decouple; media-block design
- 2026-07-02 — trend slice 4 (retire flat grid) + the wrapper-harmonisation arc
- 2026-07-01 (second) — trend rich multi-chart: plan + slices 1–3
- 2026-07-01 — MATRIX_MR: a new self-contained question type

## 2026-06 — [sessions/2026-06.md](sessions/2026-06.md)

- 2026-06-30 (third) — drag-drop split into DRAG_CLOZE + DRAG_ORDER; the new-type wiring checklist
- 2026-06-30 (second) — rich-content 6e Highlight + 6f Drag-drop; validation relax started
- 2026-06-30 — rich-content 6d Cloze
- 2026-06-29 (second) — rich-content 6c Matrix + Bow-tie
- 2026-06-29 — rich-content slice 6: rich text across the question fields; 6a + 6b
- 2026-06-28 (second) — rich-content slice 5: built-in templates → v2
- 2026-06-28 — rich-content relook build: slices 1–4
- 2026-06-27 — rich-content relook: design pass (case-study wrapper)
- 2026-06-26 (second) — main → prod release + Library student "My practice"
- 2026-06-26 — Library 11.11c: tutor question analytics + the embed-block title
- 2026-06-25 — checkout fixes · cohort Overview+Analytics merge · /tutor/enquiries · "Contact the tutor"
- 2026-06-24 (third) — tutor programme Overview page (slices 1 + 2)
- 2026-06-24 (second) — payment result screen + approve-confirm + the payment-gated-access toggle
- 2026-06-24 — payments E2E track B + the pay-first fix + checkout step-wizard
- 2026-06-23 — bank for_prod export to prod + payments E2E track A
- 2026-06-22 — cohort-level payment plans (slices 1–3)
- 2026-06-22 — global /tutor/payments page
- 2026-06-22 — student Overview home (slices 1 + 2)
- 2026-06-21 — curriculum two-pane redesign (student + tutor cohort)
- 2026-06-21 — mobile navigation (slices 1–3) + the mobile-friendly convention
- 2026-06-16 — live sessions: the attendance arc (slices 3 + 3b + 4)
- 2026-06-15 — live sessions: the marker/planner split (slices 1 + 2)
- 2026-06-14 (build) — cohort-specific activities: slices 1–5, complete
- 2026-06-14 — design: cohort-specific activities + the live-session conflict
- 2026-06-12 (third) — programme sidebar identity + Delivery section; cohort workspace folds into Cohorts
- 2026-06-12 (later) — enrolments move to programme level + zoom + width fix + convert-with-plan
- 2026-06-12 — self-paced Enrolments tab + access-window freeze on tutor-add
- 2026-06-09 — programme Library tab (the tutor's student preview)
- 2026-06-09 — quiz tags end to end + programme quiz list grouped rows
- 2026-06-08 — curriculum workspace: CD-diff close-out
- 2026-06-06 — tutor-quiz UI uplift (Claude Design option A)
- 2026-06-06 — tutor-quiz creation flow: lifecycle hardening + rich picker
- 2026-06-06 — bank surfaces: the Claude Design redesign + pagination
- 2026-06-05 — bank list pages MVP sweep: filters, search, hover-peek
- 2026-06-05 — authorship / audit-log step 2: the readout
- 2026-06-05 — bank publish-integrity gates + the audit-log foundation
- 2026-06-04 — top-down MVP sweep begins: tutor Home + Programmes list uplift
- 2026-06-01 — shelf as a curriculum activity (11.12 a/b/c)

## 2026-05 — [sessions/2026-05.md](sessions/2026-05.md)

Covers 2026-05-01 to 2026-06-01. Order follows the file.

- 2026-06-01 (later) — Study Home 11.14c + Library note as activity 11.11a/b + cohort checklist three-state
- 2026-06-01 — the student reading side of the library: 11.14a/b + 11.13a + 11.13b embed player
- 2026-05-31 — Library 11.16c custom views + scroll-cap + pane edit/delete
- 2026-05-31 — Library 11.16a search + 11.16b tags
- 2026-05-30 — Library 11.10 publish flow; 11.15 embedded questions half built
- 2026-05-30 — Library 11.7 + 11.8 + 11.9: Callout, Drug card, Lab values blocks
- 2026-05-30 — Library 11.6b + 11.6c: PDF, Video, Table blocks; note recovery
- 2026-05-29 — Library 11.6a image block + the Server Action attrs serialisation fix
- 2026-05-27 — Library 11.5 follow-on: editor full build-out
- 2026-05-27 — Library 11.5 Tiptap editor scaffold (11.5a + 11.5b)
- 2026-05-27 — slice 2.9: locked shell + railed sidebars + sidebar user bar
- 2026-05-27 — Library Overview + system Views + sidebar polish
- 2026-05-27 — Library shared NoteLensRow + editor On-shelves rail
- 2026-05-26 — post-11.4 polish + 3-slice design lock
- 2026-05-26 — Library 11.4 shelf detail view
- 2026-05-26 — deploy regression revert + Library 11.3a
- 2026-05-26 — Library 11.1a applied + 11.2a + 11.2b; dev-server warnings cleared
- 2026-05-24 — slice 8 UI rebuild, CD-driven (3 PRs)
- 2026-05-23 — payments slice 8: programme enquiries
- 2026-05-23 — payments 7e: retire price_minor
- 2026-05-22 — payments 7d: installments lifecycle + reconciliation + grace + System Config
- 2026-05-22 — homepage rebuild + BUILD_LIST reorder
- 2026-05-22 — payments 5.6: bank entitlement gating
- 2026-05-22 — payments 5.5: standalone bank landing + purchase
- 2026-05-22 — payments 5.4b: bank opt-in at programme checkout
- 2026-05-21 — payments 5.4a: programme-only on-platform checkout
- 2026-05-20 — payments slice 4: student-initiated waitlist + cohort-workspace redesign
- 2026-05-20 — payments 3.5: tutor public profile (JSONB)
- 2026-05-20 — payments slice 3: price deltas + public discovery + detail
- 2026-05-20 — enrolment: the access-gating step + picker inline list
- 2026-05-20 — enrolment: slice 1 completion + 2a + 2b
- 2026-05-16 — tutor-quiz slices 5 + 6: programme-level quiz membership
- 2026-05-16 — progress engine: planning + the 4-slice arc + 4b
- 2026-05-15 — 10.8 tabbed student curriculum
- 2026-05-15 — tutor quiz 3a: results popup + smart exit
- 2026-05-15 — tutor quiz slice 3: student launch
- 2026-05-17 — tutor quiz slice 1 polish + slice 2
- 2026-05-16 — tutor quiz slice 1: the quiz foundation
- 2026-05-15 — 10.6–10.7 locked activity rows + activity window
- 2026-05-15 — 10.2–10.5 per-type activity viewers
- 2026-05-15 — 10.1b curriculum launcher conversion + shared activity-type icon
- 2026-05-15 — 10.1 student curriculum viewer scaffold
- 2026-05-14 — 9.3f cohort curriculum checklist
- 2026-05-13 — 9.3e publish state + content visibility
- 2026-05-13 — 9.3d-d mock + practice quiz placeholders
- 2026-05-13 — 9.1d programme/unit auto-sync
- 2026-05-13 — 9.3d-c PDF activity
- 2026-05-13 — 9.3d-b media foundation
- 2026-05-13 — planning: media assets architecture
- 2026-05-12 — 9.3d-a external link + online live session
- 2026-05-12 — 9.3c blocks
- 2026-05-12 — 9.3b unit builder + text activity
- 2026-05-12 — 9.3a curriculum schema + units overview
- 2026-05-12 — 9.2c cohort detail subtree
- 2026-05-12 — 9.2a + 9.2b: the programme/cohort split lands end to end
- 2026-05-10 — 9.1 programme list + create + edit; the cohort architecture pivot surfaced
- 2026-05-10 — 4.6 History page + resume banner; build list split into Bank + Programme
- 2026-05-09 — 4.5 per-mode behaviour: timer, save-on-tap, archetypes, sequential lock
- 2026-05-09 — 4.5 planning: timer + submission archetypes + EXAM re-entry
- 2026-05-09 — 4.4 trend question rendering in the runner
- 2026-05-09 — 4.3 case-block UX in the runner
- 2026-05-09 — lib/ restructure: curator vs student side; overlays/toast/hints
- 2026-05-09 — 4.2 closed: CLOZE + DRAG_DROP + BOWTIE runners (all 8 shipped)
- 2026-05-08 — 4.2: TF, SATA, SELECT_N, MATRIX, HIGHLIGHT runners + per-type submit gates
- 2026-05-07 — 4.1 runner shell + the MCQ vertical slice
- 2026-05-06 (late) — planning: question grid settled, runner doc rewritten
- 2026-05-06 — builder UI shipped end to end
- 2026-05-06 — 2.2 attempt-creation RPCs
- 2026-05-06 — 2.1.5 mark-for-review table
- 2026-05-06 — 2.5 scoring + marks-in-authoring + dead-RPC cleanup
- 2026-05-05 — 2.1 attempt tables applied to dev
- 2026-05-05 — CAT schema build-handoff added
- 2026-05-05 — CAT plan §10 architecture settled
- 2026-05-04 — attempt_answers, the scoring sub-plan, runner §1/§2
- 2026-05-04 — bank consumption: the CAT planning doc
- 2026-05-04 — bank-consumption planning: attempt-creation sub-plan + runner skeleton
- 2026-05-01 — slice 14: the swap
- 2026-05-01 — trend wrapper testing: dataset landing, row-axis label, nextTrendId fix
- 2026-05-01 — post-slice-13 cleanup + slice 14 plan stub
- 2026-05-01 — slice 13: trend wrapper v2
- 2026-05-01 — slice 12 polish + prod release
- 2026-05-01 — slice 12: case-study wrapper v2 (12a → 12e)

## 2026-04 — [sessions/2026-04.md](sessions/2026-04.md)

- 2026-04-30 — Family B continued: slices 8 CLOZE + 9 HIGHLIGHT
- 2026-04-29 (later) — prod deploy cleanup + GHA-based CD migration
- 2026-04-29 — questions-and-wrappers rebuild: slices 4–7 + dual-mode preview infrastructure
- 2026-04-28 — questions-and-wrappers rebuild: slices 1–3 + foundations + lib/bank decouple
- 2026-04-27/28 — prod environment + the automated migration pipeline
- 2026-04-26/27 — database split: MyNclex onto its own Supabase project
- 2026-04-26 — repo decoupled from qacademy-gamma
- 2026-04-26 — 2.10 CSS leak fix: faded text on workspace pages
- 2026-04-26 — 2.9b rename lib/auth to lib/access
- 2026-04-26 — 2.9 lib/access foundation + initial migration
- 2026-04-26 — 2.8 admin nav scaffold
- 2026-04-26 — 2.7 fix: programme route split
- 2026-04-25 — 2.7 tutor nav scaffold
- 2026-04-25 — 2.6 student nav scaffold + the folder convention
- 2026-04-24 — 1.12 wrap + bank-list polish
- 2026-04-24 — bank-list polish: wrapper visibility + context edit + membership filter
- 2026-04-24 — 1.12c trend delete flow + validation + bank.md revision
- 2026-04-24 — 1.12b trend attached questions + save RPC
- 2026-04-24 — 1.12a trend dataset schema + editor
- 2026-04-24 — 1.12 planning
- 2026-04-24 — 1.11c preview-as-position + validation panel
- 2026-04-24 — 1.11b case study child-question authoring
- 2026-04-23 — 1.11a fix: reorder CHECK constraint; loose ends deferred from 1.11b
- 2026-04-22 — 1.11a case study shell + tab authoring
- 2026-04-22 — planning: Trend promoted to v1
- 2026-04-22 — 1.10 drag-drop authoring
- 2026-04-22 — 2.1 tutor-side bank authoring / reusability proof
- 2026-04-22 — planning: Trend items v2 + drag-drop parked
- 2026-04-22 — 1.9 Highlight authoring
- 2026-04-22 — 1.8 Cloze authoring + instruction wiring
- 2026-04-22 — 1.7 add the `instruction` column
- 2026-04-22 — 1.6 Bow-tie authoring
- 2026-04-21 — 1.5 Matrix authoring
- 2026-04-21 — 1.4 filters + two-pane focus mode
- 2026-04-21 — 1.3 editor architecture refactor
- 2026-04-21 — UI slice 1: light theme migration
- 2026-04-21 — 1.2 MCQ / TF / SATA / Select N authoring
- 2026-04-21 — bank slice 1: schema + RLS + seed + admin view
- 2026-04-21 — 2.5 app shell
- 2026-04-21 — auth flow slice 2: role-specific dashboards
- 2026-04-21 — auth flow slice 1
- 2026-04-21 — first build: the auth schema
- 2026-04-20 — product planning, second long session (Claude web)
- 2026-04-20 — planning continued
- 2026-04-19 — product planning (Claude web)
