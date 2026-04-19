# MyNclex — Product Plan

*Living document. Filled in as decisions get made.*
Last updated: 2026-04-19 (roles settled)

---

## What MyNclex Is

An NCLEX-RN exam prep product inside the QAcademy family. Two layers:

- **The Bank** — a QAcademy-owned NCLEX-RN question bank, available
  standalone for self-study.
- **Tutored Programmes** — vetted tutors run structured NCLEX prep
  curricula (week-by-week schedule, pre/post tutorial tasks, live
  sessions with recordings hosted on-platform) using the shared bank.

Core early audience: Ghanaian nurses pursuing migration to the US / UK /
Canada. Open to anyone internationally.

## In Scope for v1

- NCLEX-RN question bank (QAcademy-owned content, MCQ + SATA)
- Vetted tutors (Sam + approved others, manual onboarding — no public
  self-signup)
- Tutor-owned curriculum: week-by-week schedule, pre-tutorial tasks,
  post-tutorial tasks
- Live tutorials via external video conferencing; recordings hosted
  inside MyNclex after sessions
- Student enrolment into tutor programmes (bundles bank access for
  programme duration)
- Bank-only subscription for self-study students
- International-friendly payments (GHS + card)

## Roles

MyNclex has four roles. A single user can hold more than one role
(e.g. Sam is SUPER_ADMIN and TUTOR).

- **STUDENT** — buys the bank for self-study, or enrols in a tutor's
  programme (which bundles bank access for the programme's duration).

- **TUTOR** — runs programmes on MyNclex. Uses the shared, QAcademy-
  owned bank. Manages their own students and their own programme
  content. Onboarded manually in v1 (no public self-signup).

- **ADMIN** — trusted helpers who assist with running the platform.
  An ADMIN has no default powers — a SUPER_ADMIN grants specific
  permissions per user, so two admins can have non-overlapping
  responsibilities (e.g. Admin A handles payments, Admin B manages
  the bank).

- **SUPER_ADMIN** — Sam (and any future platform owners). Has every
  permission implicitly. Is the only role that can create, remove,
  or change permissions on ADMIN users.

### Notes

- **No platform-level "programmes" category.** Unlike MyNMCLicensure
  (which has RN, RM, RPHN as platform-level programmes), MyNclex is
  NCLEX-RN only. A "programme" in MyNclex always means a tutor's own
  prep offering (e.g. "Dr Mensah's 8-Week NCLEX Bootcamp"), owned by
  the tutor who created it.

- **Multiple tutors per programme is supported.** One programme can
  be co-run by two or more tutors sharing the same cohort.

- **Permission list for ADMIN is deferred.** We will define the exact
  permission buckets once the other topics (pricing, programme
  structure, tutor onboarding, bank, etc.) have surfaced the real
  admin tasks that need permissioning.

## Deferred (v2 or later)

- CAT (Computer Adaptive Testing) adaptive difficulty logic
- NGN item types (case studies, bow-tie, drag-and-drop, extended
  multi-response)
- Public self-serve tutor signup / tutor marketplace UI
- Automated payment splits between QAcademy and tutors
- Migration of MyNMCLicensure or MyTeacher onto this stack

## TBD (Not Yet Decided)

These decisions are open. Fill in as they get made:

- **Pricing** — bank-only tier, programme enrolment tier, currencies,
  trial structure
- **Programme structure details** — length, cohort sizes, session cadence
- **Tutor onboarding flow** — how a new tutor is vetted and activated
- **Content sourcing** — initial NCLEX question bank authoring plan
- **Curriculum authoring UX** — how tutors design pre/post tasks and
  schedule
- **Production build**: using `--webpack` flag as workaround for OpenNext
  incompatibility with Turbopack in Next.js 16. Switch back when OpenNext
  adds Turbopack support.

## Related Files

- `mynclex/CLAUDE.md` — stack, conventions, non-negotiables
- `mynclex/db/` — database schema, RLS, migrations (to be populated)
- `qacademy-gamma/SESSIONS.md` — running log of work across the repo
