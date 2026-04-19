# MyNclex — Product Plan

*Living document. Filled in as decisions get made.*
Last updated: 2026-04-19 (initial skeleton)

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
- **Roles** — exact role set (STUDENT, TUTOR, ADMIN assumed but not
  finalised)
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
