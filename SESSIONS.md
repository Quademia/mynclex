# MyNclex Sessions Log

Running log of MyNclex work sessions. Each entry: what was done + what's
queued for next session. Newest on top. Product-local — isolated from
other QAcademy products, per the extraction rule in CLAUDE.md.

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
