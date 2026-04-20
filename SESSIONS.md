# MyNclex Sessions Log

Running log of MyNclex work sessions. Each entry: what was done + what's
queued for next session. Newest on top. Product-local — isolated from
other QAcademy products, per the extraction rule in CLAUDE.md.

---

## Session — 2026-04-20 (Product planning — Claude Web, second long session)

Marathon session. **All 9 MyNclex planning topics now settled.**
Today's work closed the three topics outstanding after the
2026-04-19 session — the bank, curriculum authoring UX, content
sourcing, and the entire student enrolment flow (self-study +
tutored).

### Topics settled today

- **Curriculum Authoring UX** — 14 decisions locked. Programme →
  Week → Module → Activity hierarchy. Six activity block types in
  v1. Weeks view + Calendar view. Up/down arrow reorder. Dual
  publish status (week and module can be Live / Draft
  independently). In-place inline activity picker. Mockups
  produced. See `product-plan/curriculum-authoring-ux.md`.

- **The Bank** — 9 sections covering the full question schema.
  Seven-table structure across QAcademy-owned and tutor-private
  sets. JSONB `content` / `correct` columns. 9 question types in
  v1 (MCQ, TF, SATA, Select N, Matrix, Highlight, Cloze, Drag-drop,
  Bow-tie; Trend deferred). NCSBN-exact scoring via 5 modular
  functions. Case studies with 6 chart tabs and progressive
  unfolding via `visible_from`. Readiness packs as curated
  assessments. 10 filterable classification axes. Per-option
  feedback lives in the `correct` JSONB. See
  `product-plan/bank.md`.

- **Content Sourcing** — reframed as an editorial/business problem,
  out of scope for product build. Bank to be seeded with synthetic
  sample questions for dev/testing. Real editorial work runs off-
  platform led by Sam as a nurse, with vetted nurse educators.
  Two small system decisions taken:
  - No in-platform review workflow — single `is_published`
    boolean.
  - "Report this question" ships in v1 (minimum version). New
    table `nclex_question_reports`.
  Documented in `product-plan/main.md` Content Sourcing section.

- **Self-Study Enrolment** — pay-first model inherited from
  Licensure. Four bank packs (Trial, 30d, 90d, 180d) plus separate
  standalone readiness packs. Dual currency (GHS default, USD
  toggle) via single-row / two-column model on `nclex_products`.
  Currency passed as parameter to a MyNclex-specific payment
  worker. Post-payment: welcome email immediately, cold-start
  dashboard with clear CTAs, "My Payments" page for transaction
  history. Edge cases inherit Licensure behaviour. Documented in
  `product-plan/payments-and-enrolment.md`.

- **Tutored Enrolment** — public programmes list page. Per-
  programme price visibility is a tutor choice via
  `show_price_publicly`. Contact-first flow routes through
  QAcademy as pass-through enquiry (new `nclex_programme_enquiries`
  table). Bundled single-checkout transaction (programme fee +
  subsidised bank), internal split, manual payouts for v1. Auto-
  enrolment on successful payment. No waiting room. Edge cases:
  full/closed programmes visible but not purchasable; soft-stopped
  tutors' programmes hidden; cancellations admin-handled. No
  waitlist in v1. Multiple concurrent enrolments allowed.
  Documented in `product-plan/payments-and-enrolment.md`.

### Revision to earlier decision

- **Programme Structure (2026-04-19) — revised.** Cohort/rolling
  mode distinction removed. Time-gated weekly progress no longer a
  platform behaviour. Content visibility now controlled per-
  activity via Live/Draft status. Rationale: tutors want
  flexibility, not mode-picking. Original decision preserved in
  this session log for audit.

### Schema additions queued for build

- `nclex_products` — full shape locked.
- `nclex_question_reports` — student-reported questions.
- `nclex_programme_enquiries` — contact-first enquiries.
- `nclex_enrolments` — student ↔ programme link.
- `is_published` boolean added to `nclex_bank_items` and
  `nclex_tutor_questions`.
- MyNclex-specific worker: `qacademy-mynclex-payment-worker`
  (dev and prod).

### Planning status — end of day

**9 of 9 topics settled.** Planning phase closed.

### Next session

- Move from planning to build. Suggested order: (1) database
  schema sprint (`nclex_*` tables + RLS), (2) auth setup for
  MyNclex-specific `nclex_users`, (3) public landing page + bank
  products catalogue, (4) self-study pay-first flow (subscribe
  page + payment worker + confirmation page), (5) admin authoring
  flows, (6) tutored flows. Prioritisation to be confirmed in
  next session.

---

## Session — 2026-04-20 (Planning continued — Claude Web + Claude Code)

Three topics settled in one day, with visual reference artefacts for
two of them. Still no code — planning docs only.

### The Bank (Question Bank) — SETTLED

Parallel ownership model (QAcademy-owned + tutor-private, identical
shapes). Seven core tables. All 9 question types ship in v1 (MCQ,
TF, SATA, Select N, Matrix, Highlight, Cloze, Drag-drop, Bow-tie;
Trend deferred to v2). Polymorphic JSONB `content` + `correct`
columns. Per-option feedback in `correct`. Case studies with 6
JSONB chart tabs and `visible_from` unfolding. Readiness packs as a
QAcademy-only product with reserved questions. Five scoring
functions cover all 9 types, NCSBN-exact. 10 classification axes,
all filterable.

Full spec in `product-plan/bank.md`. NGN visual primer saved at
`product-plan/mockups/ngn-primer.html`.

### Curriculum Authoring UX — SETTLED

Unblocked by the bank settlement the same day. Structure hierarchy:
Programme → Week → Module → Activity. Screens: My Programmes
landing, single-screen New Programme form (7 fields), Weeks
Overview with Weeks-view + Calendar-view toggle, Week Builder with
module cards and activity rows, inline 3×2 add-activity picker, six
activity editors (Text, PDF, External link, Live session, Mock,
Practice quiz). Reorder via up/down arrows (drag-and-drop deferred
to v2). Dual publish status (module + week both carry Live/Draft
pills).

Full spec in `product-plan/curriculum-authoring-ux.md`; mockups at
`product-plan/mockups/curriculum-authoring-ux.html`.

### Repo reshuffle

`mynclex/docs/product-plan.md` rebuilt into a `product-plan/`
folder: `main.md` (overview + index), `bank.md`, and
`curriculum-authoring-ux.md` as siblings. Visual HTML references
live in `product-plan/mockups/`. Future topic docs (payments,
registration, etc) slot in as siblings.

### Also settled this session — Content sourcing

Late addition to the planning day. Content sourcing reframed as an
**editorial/business problem, out of scope for product build**. The
bank will be seeded with synthetic sample questions for development
and testing; real content comes later via off-platform editorial
work with vetted nurse educators, led by Sam as a nurse himself.

Two small system decisions taken:
- **No in-platform review workflow.** Single `is_published` boolean
  on questions; reviewing happens off-platform.
- **"Report this question" ships in v1** (minimum version). New
  table `nclex_question_reports`; simple "Dismiss" / "Mark for fix"
  admin queue.

Schema consequences: `is_published` column added to
`nclex_bank_items` and `nclex_tutor_questions`;
`nclex_question_reports` table added.

Documented in `product-plan/main.md` (new "Content Sourcing"
section). `bank.md` cross-references this section.

### MyNclex planning status — end of day

- **8 of 9 topics settled.** Only **Student enrolment flow** remains
  open.

### Next session

- Settle **Student enrolment flow** (signup → programme enrolment →
  bundled bank purchase → Journey Tracker handoff).
- Once that lands, planning is complete and build can begin.

---

## Session — 2026-04-19 (Product planning — Claude Web)

Long planning session to flesh out `docs/product-plan.md` from
skeleton to a usable spec. No code written. Five of the nine planned
topics settled in one sitting.

### Topics settled

- **Roles** — STUDENT, TUTOR, ADMIN, SUPER_ADMIN. Users can hold
  multiple roles. No platform-level "programmes" category — NCLEX-RN
  is the only exam. Permission list for ADMIN deferred until real
  admin tasks surface.
- **Journey Tracker** — 7 phases (destination & plan → credential
  evaluation → English proficiency → state board app → exam prep →
  ATT & exam booking → licensure). Phase 7 (migration) deferred to
  v2. Tutor programmes plug into Phase 4.
- **Programme Structure** — week-based, tutor-defined weekly template
  with a default shape, 6 block types in v1, both cohort and rolling
  modes, time-gated progress, mixed auto/tick completion, tutor-
  authored questions private to tutor, co-tutors have identical
  powers.
- **Tutor Onboarding** — Shape 1 vetted marketplace, no public self-
  signup. Public "Become a Tutor" application form storing to
  `nclex_tutor_applications` with status. Vetting off-platform.
  Account creation via admin-triggered setup-link email. Soft-stop
  deactivation. Admin-only deletion.
- **Pricing** — Dual currency (GHS + USD, manual dual pricing, no IP
  detection). Bank as duration packs (30/90/180 days). Readiness
  packs as separate product. Tutor SaaS subscription model (Camp 2),
  flat monthly fee, no payment splits. Tutored students get bundled
  bank access at 50% subsidy, paid to QAcademy directly. Provisional
  numbers anchored (validate before launch).

### Topics still open (from the original nine)

- **The bank** — content structure, question types in v1,
  organisation (topics, difficulty, NCLEX test plan categories)
- **Curriculum authoring UX** — how tutors physically build a week
- **Student enrolment flow** — discovery → payment → start
- **What a tutorial session looks like** on the platform
- **Content sourcing** — where do the initial NCLEX questions come from

### Repo hygiene

- This file created — MyNclex now has its own product-local
  SESSIONS.md, matching MyNMCLicensure and MyTeacher.
- The root `SESSIONS.md` is being retained as a repo-wide milestone
  log only; detailed product work moves to product-local session
  logs.

### Next session

- Pick up one of the five remaining topics. Recommended next: **The
  bank** (content structure + sourcing), as everything else
  (authoring UX, enrolment flow, session UX) depends on the bank
  being understood first.
- Still no code. Design + plan phase continues.
