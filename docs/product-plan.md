# MyNclex — Product Plan

*Living document. Filled in as decisions get made.*
Last updated: 2026-04-19 (roles + programme structure settled)

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

## Journey Tracker

Every MyNclex student gets a Journey Tracker — a built-in,
always-on view of where they are in the international nurse licensure
process. QAcademy provides the structure and guidance content.
Students self-update their progress. QAcademy does not act as a
migration service provider; students do the paperwork themselves.

### Phases (v1 builds 0–6; Phase 7 deferred to v2)

0. **Destination & plan** — pick country and state/region; everything
   downstream branches on this choice.
1. **Credential evaluation** — CGFNS (US), NMC verification (UK),
   NNAS (Canada), or country equivalent.
2. **English proficiency** — conditional phase; skippable for nurses
   educated in English.
3. **State Board / Regulator application** — apply to chosen
   jurisdiction's nursing authority.
4. **Exam prep** — the core study phase. Self-study with the bank, or
   enrol in a tutor's programme. Tutor programmes plug in here.
5. **ATT & exam booking** — receive Authorization to Test, register
   with Pearson VUE, sit NCLEX-RN.
6. **Licensure** — receive state/regulator licence.
7. **Migration** *(v2)* — VisaScreen, visa application, relocation.
   Deferred; this is where higher-margin optional services may sit.

### Tracker ↔ tutor programme link

Tutor programmes plug into Phase 4 (Exam prep). Enrolling in a
programme updates the tracker's Phase 4 state. Tutors can see their
enrolled students' wider journey status (e.g. whether a student is
still waiting on credential verification), so coaching accounts for
the full picture.

## Programme Structure

A tutor's programme is a paid, tutor-owned NCLEX prep offering that
plugs into Phase 4 of the Journey Tracker. One or more tutors can
co-run the same programme.

### Scheduling unit

Programmes are **week-based**. Tutor chooses the length (typical:
3 / 4 / 6 / 9 / 12 weeks). No platform-fixed length. Date-based
calendars are deferred to v2.

### Weekly structure

Each week is **tutor-defined with a default template**. When a tutor
creates a new week, the platform pre-fills a default shape
(pre-session reading → live session → post-session tasks). The tutor
can delete, reorder, or add any blocks — the default is a starting
suggestion, not a constraint.

### Block types (v1)

- Text content (rich-text notes)
- PDF upload
- External video link (YouTube, Vimeo, recorded-session URL, etc.)
- Bank question set (assigned questions from the shared NCLEX bank)
- Live session (external video-call link; recording URL added after)
- Mock assessment

### Block types deferred to v2

- Uploaded video files (storage and bandwidth cost)
- Written assignments with tutor grading (requires submission and
  feedback workflow)

### Cohort model

Both supported — tutor picks per programme:

- **Cohort mode** — fixed start/end dates; students progress through
  the weeks together. Enables live sessions at shared times.
- **Rolling mode** — students enrol any time; each student's Week 1
  begins on their own enrolment date.

### Cohort size

Tutor sets the maximum. No platform-imposed cap in v1. Platform-wide
quality caps may be introduced later if needed.

### Late enrolment

Tutor decides per programme. Platform default (to be refined in build):
late enrolment off; tutor toggles it on with a cut-off if desired.

### Revenue model

**Deferred to the Pricing topic.** How QAcademy earns from a tutor's
programme (per-enrolment commission, flat cohort fee, per-seat fee,
tutor subscription) has significant product and technical
implications and is parked here until the Pricing discussion.
Existing v1 deferral stands: no automated payment splits in v1.

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
- **Tutor onboarding flow** — how a new tutor is vetted and activated
- **Content sourcing** — initial NCLEX question bank authoring plan
- **Curriculum authoring UX** — how tutors design pre/post tasks and
  schedule

## Related Files

- `mynclex/CLAUDE.md` — stack, conventions, non-negotiables
- `mynclex/db/` — database schema, RLS, migrations (to be populated)
- `qacademy-gamma/SESSIONS.md` — running log of work across the repo
