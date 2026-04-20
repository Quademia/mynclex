# MyNclex Sessions Log

Running log of MyNclex work sessions. Each entry: what was done + what's
queued for next session. Newest on top. Product-local — isolated from
other QAcademy products, per the extraction rule in CLAUDE.md.

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
