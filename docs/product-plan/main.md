# MyNclex — Product Plan

*Living document. Filled in as decisions get made.*
Last updated: 2026-04-20 (bank settled)

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

- NCLEX-RN question bank (QAcademy-owned content, all 9 question types
  including NGN items — see **The Bank** section)
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

Settled in the Pricing section. In brief: tutors pay a flat monthly
platform subscription; students pay QAcademy directly for a
subsidised, duration-matched bank bundle at enrolment; tutor
programme fees stay off-platform between tutor and student. No
automated payment splits in v1.

### Student progression

- **Progress model:** time-gated. Weeks unlock by date in cohort mode
  or by days-since-enrolment in rolling mode. Past weeks always remain
  accessible for revision.
- **"Done" logic:** mixed. Quiz blocks and mock assessments
  auto-complete from their score. Passive content (text, PDF, external
  video link) is student-ticked. Live session is student-ticked (or
  auto-complete when the tutor posts the recording — refined in build).

### Student dashboard (v1)

Minimum set:
- Current week number and week progress bar
- Overall programme progress %
- Next live session (date + join link)
- Most recent mock assessment score
- Journey tracker snapshot (current phase, % through it)

Accepted as a starting set; may be refined during build.

### Tutor actions (v1)

A tutor can, for each programme they own or co-run:

1. Create and edit the programme (title, description, length in weeks,
   cohort vs rolling mode, start date, max cohort size, late-enrolment
   toggle).
2. Build weeks — add, edit, delete, and reorder blocks in any week.
3. Post live session links and recording URLs.
4. View the list of enrolled students.
5. View a single student's detail (week-by-week completion, mock
   scores, current journey-tracker phase).
6. Message one student, or the whole cohort.
7. Clone an existing programme (to run the next cohort without
   rebuilding).
8. Archive a programme.

### Co-tutors

A programme can have one or more tutors. In v1, all tutors on a
programme have identical powers — no owner/assistant split. If abuse
or coordination issues appear, a permissions split can be introduced
in v2.

### Bank usage inside a programme

Programme question sets can draw from two sources:

1. **QAcademy bank** — shared, QAcademy-owned. Tutors can assign bank
   questions into question-set blocks. Tutors cannot edit bank
   questions or add to the shared bank. (The QAcademy bank is itself
   a standalone product sold to self-study students, so its integrity
   is protected.)
2. **Tutor's own questions** — tutor-authored. Private to the tutor.
   Reusable across that tutor's programmes. Not visible to any other
   tutor, and not added to the shared bank.

### Student access to questions

- **QAcademy bank questions** are visible to a student if the student
  has any active QAcademy bank pack — either purchased standalone
  (self-study) or purchased as the subsidised bundle at programme
  enrolment.
- **Tutor-authored questions** are visible only to students enrolled
  in that tutor's programme, and only inside that programme's
  assignments.

### Open items within programme structure

- Journey-tracker phase content (rich text + checklist per destination
  country) is an admin-authored content task, handled during build,
  not in planning.
- Revenue model is parked in the Pricing topic.

## Tutor Onboarding

MyNclex is a vetted marketplace, not an open tool. No public
self-serve tutor signup in v1 — every tutor account is created by
admin after an off-platform vetting conversation. Students enrolling
in a tutor's programme are trusting QAcademy's vouch for that tutor,
so the bar is deliberately high.

### Application intake

A public "Become a Tutor" page on the MyNclex site serves two
purposes: collecting prospective-tutor applications, and acting as
marketing for the programme model.

- Applications submitted via the public form are stored in a
  `nclex_tutor_applications` table, with status values:
  `NEW`, `CONTACTED`, `APPROVED`, `REJECTED`.
- Admin can view a list of applications with their status — a simple
  funnel view, not a full vetting dashboard.
- No approve-and-auto-provision flow. Approval is recorded as a
  status change; account creation is a separate, explicit admin
  action (below).

### Vetting

Vetting itself happens off-platform — email, WhatsApp, calls,
sometimes a trial session. Criteria (qualification, experience,
teaching style, cultural fit) are judged case-by-case by admin; no
on-platform checklist in v1. If volume increases, a structured
vetting workflow may be introduced in v2.

### Account creation

Once admin decides to approve an applicant:

1. Admin clicks "Create tutor" in the admin area and enters the
   tutor's name and email.
2. The new account is created in a `PENDING_SETUP` state.
3. The tutor receives a setup-link email.
4. The tutor follows the link, sets their own password, and logs in.
5. The account becomes `ACTIVE` on first successful login.

No admin-generated temporary passwords shared over insecure channels.

### Required tutor profile

Before a tutor can publish their first programme, the following
profile fields must be filled in:

1. Display name (shown on programme listing)
2. Photo / avatar
3. Short bio (1–2 paragraphs, shown on programme listing)
4. Credentials (e.g. "BSN, RN, 8 years ICU experience")
5. Country / region

Optional fields (not required to publish):
- Longer "about me" page
- External links (LinkedIn, personal site)
- Languages spoken

### Tutor dashboard (v1 first view)

When a tutor logs in, the default view shows:
- Programmes they own or co-run (cards: title, status, student count,
  next live session)
- Quick actions: Create programme, Create question, Message cohort
- Platform announcements from admin

### Deactivation

An active tutor may be deactivated by admin (e.g. they quit,
underperform, or are removed). Deactivation is a **soft stop**:

- The tutor is hidden from the public tutor list and programme
  listings — no new enrolments accepted for their programmes.
- Existing active cohorts continue to their scheduled end date;
  students who paid for a cohort finish it.
- Urgent reassignments (e.g. tutor vanishes mid-cohort) are handled
  off-platform in v1 — admin coordinates with the co-tutor, or
  issues refunds manually.
- A cohort-reassign flow may be added in v2 if this becomes common.

### Self-deletion

Tutors cannot delete their own accounts in v1. Tutors are a curated
group; removal requires a conversation about data retention and
cohort handover. A tutor wishing to leave contacts admin by email;
admin then follows the deactivation flow above.

## Pricing

QAcademy is a content company with a tutor marketplace attached. The
bank is the main revenue product; tutor subscriptions are a low-cost
supply-side loss leader; bundled bank access to tutored students
scales with tutor success.

### Currency

- Dual currency in v1.
- Users registering from Ghana see and pay in **GHS**.
- All other users see and pay in **USD**.
- Region is captured via a "Where are you registering from?" question
  at signup, stored on the user profile. No IP-based detection
  (unreliable: VPNs, diaspora, mobile carrier routing).
- Every product has two price fields: `price_ghs` and `price_usd`.
  Both are required at product creation — neither is derived from
  the other. This preserves price psychology (round numbers in each
  currency) and avoids FX drift changing prices silently.
- Paystack is the processor for both currencies; settlement to the
  QAcademy bank account is in GHS regardless of charge currency.

### Bank (QAcademy-owned)

- Sold as duration-tier packs: **30 / 90 / 180 days**.
- A short free trial (duration TBD in build) is offered as a marketing
  taster, not a paid tier.
- 365-day packs and freemium-tier-style unlimited access are deferred
  to v2.

### Readiness packs

- Separate QAcademy-owned product, distinct from the bank subscription.
- Full-length, exam-simulating mock tests (provisionally 5 in v1).
- Sold as: single pack, three-pack bundle, all-packs bundle.
- Independent of bank access — can be purchased with or without the
  bank.

### Tutor revenue model

Tutors pay QAcademy a **flat monthly subscription** to use the
platform. They run unlimited cohorts and keep 100% of their student
revenue, which they collect and manage off-platform.

- No per-enrolment commission.
- No automated payment splits between QAcademy and tutors (matches
  the v1 deferral in CLAUDE.md).
- No per-seat fees.
- Single subscription tier in v1. Tiered subscriptions are a v2
  candidate.

This model matches the dominant industry pattern (Teachable,
Thinkific, Kajabi, Podia, FreshLearn) and positions QAcademy as a
platform tutors rent, not a commission-taking middleman.

### Tutored students and the bank

Programme enrolment **bundles** bank access for the programme's
duration — but at a subsidised price, not free.

- When a student enrols in a tutor's programme, they pay QAcademy
  directly for a programme-matched bank pack, at a discounted rate.
- The discount is QAcademy's contribution to the programme's value.
- Tutor has no variable cost tied to their cohort size — their
  subscription stays flat.
- Student sees a clean enrolment flow: tutor fee paid to the tutor
  (off-platform, in the tutor's currency), bank access paid to
  QAcademy (on-platform, in the student's registered currency).
- Subsidy level: **50% of the standalone bank price** for the closest
  matching duration, rounded up so no student is ever mid-week with
  expired bank access.
- Subsidy price is set globally by admin. Tutors do not control it.

### Provisional numbers

These numbers are anchors for planning only. All must be
market-validated before public launch.

| Product | Price (USD) | Price (GHS) |
|--|--|--|
| Tutor monthly subscription | $29 | ~350 |
| Self-study bank, 30-day | TBD | TBD |
| Self-study bank, 90-day | $40 | ~480 |
| Self-study bank, 180-day | TBD | TBD |
| Tutored-student bank bundle (matched duration) | ~$20 (50% of 90-day) | ~240 |
| Readiness pack, single | TBD | TBD |
| Readiness pack, three | TBD | TBD |
| Readiness pack, all | TBD | TBD |
| Tutor's programme price to students | tutor's own choice; 3,000 GHS / ~£200 / ~$250 is a sensible anchor for a 12-week programme |  |

### Revenue model strategic read

Based on rough scenario modelling:

- In year 1 (pilot), QAcademy revenue is small and roughly split
  across tutor subs, self-study bank sales, and tutored bundles.
- By year 2–3, **self-study bank sales dominate** revenue, followed
  by tutored bundles, with tutor subscriptions the smallest slice.
- **Revenue scales with student volume, not tutor count.** Marketing
  the bank directly to self-study students is the bigger revenue
  lever than growing the tutor base.
- Tutors remain valuable as (a) a vetted-marketplace brand signal
  that helps sell the bank, and (b) a customer-acquisition channel.
- This reinforces the vetted-marketplace choice: a diluted tutor
  brand would damage bank sales, which are the largest revenue
  source.

### Pricing-related items deferred to v2+

- Tiered tutor subscriptions (basic / pro with different feature sets)
- Annual discounts on tutor subscription
- Group / institutional licences for the bank
- Automated payment splits between QAcademy and tutors
- 365-day bank packs

## The Bank (Question Bank)

The NCLEX-RN question bank is the content layer that feeds both
self-study students (standalone access) and tutored programmes
(assigned inside Practice quiz and Mock activities). **Settled
2026-04-20.** Full schema, JSONB shapes, scoring functions, and
case-study details live in [bank.md](bank.md).

Headline decisions:

- **Parallel ownership model.** Identical-shape tables in two sets:
  QAcademy-owned (`nclex_bank_*`, `nclex_case_studies`,
  `nclex_readiness_packs`) — shared across all tutors and students.
  Tutor-private (`nclex_tutor_*`) — owned by each tutor, visible
  only in their programmes.
- **Seven core tables** — 4 QAcademy-owned + 3 tutor-private. No
  `nclex_tutor_readiness_packs` (readiness packs are a QAcademy-only
  product; tutors use Mock activities instead).
- **All 9 question types ship in v1** — MCQ, TF, SATA, Select N,
  Matrix, Highlight, Cloze, Drag-drop, Bow-tie. Trend items deferred
  to v2.
- **JSONB `content` + `correct` columns** on every question. `content`
  (pre-submit, safe for browser) holds the question structure.
  `correct` (post-submit only) holds the answer key **and**
  per-option / per-cell / per-slot feedback.
- **Five scoring functions** cover all 9 types, dispatched by
  `question_type`. NCSBN-exact logic, versioned separately from
  schema.
- **Case studies** = one row per scenario with 6 JSONB chart tabs
  (nurses' notes, vitals, labs, orders, history, diagnostics). Each
  entry has `visible_from` (1–6) for progressive chart unfolding as
  the student moves through the 6 CJMM questions.
- **Readiness packs** = curated QAcademy assessments with reserved
  questions. `is_builder_visible = FALSE` hides pack questions from
  the custom quiz builder; the pack runner loads them by ID directly.
- **10 classification axes** are all filterable at student build
  time (`question_type`, two client-needs fields, subject, system,
  topic, subtopic, difficulty, bloom level, tags).

Cross-topic effect: **Curriculum authoring UX is now unblocked** —
Practice quiz and Mock activity editors had "blocked on bank"
placeholders and can now proceed.

## Deferred (v2 or later)

- CAT (Computer Adaptive Testing) adaptive difficulty logic
- Trend items (NGN variant of matrix/cloze/highlight)
- Public self-serve tutor signup / tutor marketplace UI
- Automated payment splits between QAcademy and tutors
- Migration of MyNMCLicensure or MyTeacher onto this stack

## TBD (Not Yet Decided)

These decisions are open. Fill in as they get made:

- **Content sourcing** — initial NCLEX question bank authoring plan
- **Student enrolment flow** — signup, programme enrolment, bundled
  bank purchase, and Journey Tracker handoff

## Related Files

- `mynclex/CLAUDE.md` — stack, conventions, non-negotiables
- `mynclex/docs/product-plan/` — all product-plan docs live here:
  - `main.md` — this file, the overall product plan and index
  - `bank.md` — full question-bank schema and scoring
  - (future) `payments.md`, `registration.md`, etc.
- `mynclex/db/` — database schema, RLS, migrations (to be populated)
- `qacademy-gamma/SESSIONS.md` — running log of work across the repo
