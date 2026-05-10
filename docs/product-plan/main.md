# MyNclex — Product Plan

*Living document. Filled in as decisions get made.*
Last updated: 2026-05-10 (programme/cohort split — Programme Structure reworked into two layers; Pricing + Roles touched accordingly)

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
  the tutor who created it. A programme is the *reusable design* — a
  specific run of that programme for a specific group of students is
  a **cohort** (see Programme Structure below).

- **Multiple tutors per programme is supported.** One programme can
  be co-run by two or more tutors. In v1 every co-tutor on a
  programme is automatically on every cohort of that programme;
  cohort-level co-tutor restrictions are deferred.

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

> **Revised 2026-05-10.** Programme/cohort split. A programme is now
> the *reusable design* — a syllabus a tutor builds once and runs
> many times. Each specific run for a specific student group is a
> **cohort**. Curriculum (weeks → modules → activities) lives at the
> programme layer; dates, seats, enrolment, and delivery state live
> at the cohort layer. Original 2026-04-19 / 2026-04-20 decisions
> preserved in session log.

A tutor's programme is a paid, tutor-owned NCLEX prep offering that
plugs into Phase 4 of the Journey Tracker. One or more tutors can
co-run the same programme. Students don't enrol in a programme
directly — they enrol in one of its cohorts.

### Two-layer model

```
Tutor
  ↓ owns
Programme           — reusable design (curriculum, brand, price)
  ↓ has many
Cohort              — one run (dates, seats, enrolments, schedule)
  ↓ enrols
Student
```

- **Programme** — the reusable teaching product. Owned by a tutor.
  Holds the curriculum (weeks → modules → activities) and the
  brand-level fields (title, tagline, description, length in weeks,
  prices, public-price toggle).
- **Cohort** — one specific run of a programme for a specific group
  of students. Holds dates, seats, enrolment list, live-session
  schedule, mock due dates, announcements, and a checklist of
  *which* template activities are included in this cohort (in what
  order, with cohort-specific release dates).

A tutor can run many cohorts of the same programme over time
(e.g. *Jan 2027*, *April 2027*, *Weekend Intensive*). They iterate
the programme's curriculum forward; cohorts inherit the improvements
without breaking already-launched ones (see *Curriculum propagation*
below).

### Programme layer

#### Programme fields

| Field | Required | Notes |
|---|---|---|
| Title | ✓ | |
| Tagline | — | One-liner shown on the public card |
| Description | — | Long copy for the public detail page |
| Length in weeks | ✓ | Curriculum buckets |
| Price (GHS) | ✓ | 0 = free |
| Price (USD) | ✓ | 0 = free |
| Show price publicly | toggle, default ON | OFF → "Contact" button publicly |

Pricing is set once per programme and applied to every cohort of
that programme. Cohort-level pricing variation (early-bird, holiday
promo) is deferred to v2.

#### Programme status

`DRAFT / PUBLISHED / ARCHIVED`. Set by tutor actions, not by the
create form.

- `DRAFT` — invisible to the public; the tutor is still building.
- `PUBLISHED` — visible to the public **only if at least one
  open cohort exists**. A published programme with zero open
  cohorts is treated as not-yet-discoverable; the catalogue
  doesn't list it. (Prevents dead-end pages.)
- `ARCHIVED` — retired by the tutor. No new cohorts can be
  launched; existing cohorts run to completion.

#### Curriculum

Curriculum lives at the programme layer. Programmes are
**week-based** — tutor chooses the length (typical 3 / 4 / 6 / 9 /
12 weeks; no platform-fixed length). Hierarchy:

```
Programme  →  Week  →  Module  →  Activity
```

- **Week** — one row of the tutor's plan; pre-slotted for all N
  weeks (empty weeks shown as dashed placeholders so the tutor
  always sees the full programme shape).
- **Module** — groups related activities within a week
  (e.g. a "Cardiac anatomy primer" module containing reading, a
  video, and a practice quiz). Real structural layer, not just a
  heading — modules thread across days in the calendar view.
- **Activity** — a single content or assessment unit. Six types in
  v1 (see Block types below).

See [curriculum-authoring-ux.md](curriculum-authoring-ux.md) for
the editor screens.

#### Block types (v1)

- Text content (rich-text notes)
- PDF upload
- External video link (YouTube, Vimeo, recorded-session URL, etc.)
- Practice quiz (assigned questions from the shared NCLEX bank or
  the tutor's private bank)
- Live session (external video-call link; recording URL added after)
- Mock assessment

#### Block types deferred to v2

- Uploaded video files (storage and bandwidth cost)
- Written assignments with tutor grading (requires submission and
  feedback workflow)
- Library Note (the 7th activity type, sourced from the tutor's
  reusable notes library — see [tutor-library.md](tutor-library.md))

### Cohort layer

#### Cohort fields

| Field | Required | Notes |
|---|---|---|
| Cohort name | — | Auto-generated from dates (*"5 Jan – 27 Mar 2027"*); tutor can override (e.g. *"Weekend Intensive"*). |
| Start date | ✓ | Anchors week 1; the cohort's week N runs from `start + (N-1)*7` days. |
| End date | ✓ | Auto-fills from start + length × 7; tutor-editable to extend bank access beyond the curriculum. |
| Cohort size (max students) | — | Blank = no cap. |
| Allow late join | toggle, default OFF | When OFF, enrolment closes at `start_date`. When ON, allows enrolment past start (tutor's discretion, no platform-enforced cutoff). |

#### Cohort status

`UPCOMING / IN_PROGRESS / ENDED / CANCELLED`. Mostly derived from
dates; CANCELLED is an explicit tutor/admin action.

- `UPCOMING` — `today < start_date`. Enrolment open.
- `IN_PROGRESS` — `start_date ≤ today ≤ end_date`. Enrolment open
  only if *allow late join* is ON.
- `ENDED` — `today > end_date`. No new enrolments; existing
  students retain bank access until the end_date already paid for.
- `CANCELLED` — explicit cancel. Hidden from public; refunds
  handled manually off-platform.

#### What a cohort owns

- The enrolled students for this run.
- The schedule: live session times, mock due dates, weekly release
  dates.
- The activity checklist — which template activities are included
  in this cohort, in what order, plus any cohort-only additions.
- Announcements posted to this cohort's students.
- Per-cohort completion data (student progress is scoped to the
  cohort they're enrolled in).

### Curriculum propagation

The programme layer owns the curriculum *content*. The cohort layer
owns the cohort's *checklist* of which activities are in. Two
propagation rules:

- **Content edits propagate automatically.** When the tutor fixes a
  typo, swaps a video link, improves an explanation, or adjusts a
  quiz key — every live cohort sees the update on the next student
  view. Single source of truth.
- **Structural changes do not propagate.** When the tutor adds a
  new activity to the programme, removes one, or reorders the
  curriculum — already-launched cohorts are unaffected. The tutor
  opts in per cohort: "add this new template activity to cohort
  X?" or "remove this from cohort X only?".

A cohort can also add **cohort-only activities** that don't exist
in the programme template — useful for a workshop the tutor decides
to add for one specific intake. Cohort-only activities live only in
that cohort and do not flow back to the template.

Template "deletes" are soft-deletes — cohorts that already
included the activity keep working; only new cohorts and not-yet-
added activity slots stop seeing it.

### Enrolment paths

Two paths in v1, both at the cohort layer:

- **Self-paid** — student finds the programme on the public listing,
  picks an open cohort, and pays via the bundled checkout. See
  [payments-and-enrolment.md](payments-and-enrolment.md).
- **Tutor-added** — tutor adds a student directly to a specific
  cohort from inside the cohort workspace, at any point in the
  cohort's lifecycle. No platform-enforced enrolment window or
  cut-off date.

Tutor-added enrolments comp the bundled bank-pack subscription for
the cohort's duration; QAcademy absorbs the cost. Tracked via
`enrolment_source ∈ ('SELF_PAID', 'TUTOR_ADDED')` on
`nclex_enrolments`. Per-tutor quota (capping how many tutor-added
enrolments a tutor can comp based on their subscription tier) is
deferred to a later slice.

### Revenue model

Settled in the Pricing section. In brief: tutors pay a flat monthly
platform subscription; students pay QAcademy directly for a
subsidised bank bundle matched to **the cohort's duration** at
enrolment; tutor programme fees stay off-platform between tutor and
student. No automated payment splits in v1.

### Content visibility

- **Programme-level visibility**: activities carry a Live / Draft
  pill in the curriculum editor (`activity.is_published`). Draft
  activities don't appear in any cohort's checklist until the
  tutor publishes them.
- **Cohort-level release**: each cohort activity has a release date
  (defaulted from the cohort's start date + the activity's week
  number). Students see an activity once its release date passes.
- **"Done" logic:** mixed. Quiz blocks and mock assessments
  auto-complete from their score. Passive content (text, PDF, external
  video link) is student-ticked. Live session is student-ticked (or
  auto-complete when the tutor posts the recording — refined in
  build).

### Student dashboard (v1)

Scoped to the student's current cohort. Minimum set:
- Current week number and week progress bar (relative to the
  cohort's calendar)
- Overall cohort progress %
- Next live session (date + join link)
- Most recent mock assessment score
- Journey tracker snapshot (current phase, % through it)

A student enrolled in multiple cohorts sees a cohort switcher; one
dashboard per cohort.

### Tutor actions (v1)

Tutor actions split between programme-level and cohort-level.

**Programme-level (the reusable design):**

1. Create and edit a programme (title, tagline, description, length
   in weeks, dual GHS+USD price, public-price toggle). Created via
   a modal triggered from My Programmes — see
   [curriculum-authoring-ux.md](curriculum-authoring-ux.md). The
   first cohort can be created in the same modal.
2. Build the curriculum — weeks, modules, activities. Add / edit /
   delete / reorder. Edits propagate to live cohorts.
3. Publish / unpublish / archive the programme.
4. Duplicate a programme (start from an existing curriculum
   instead of an empty one).

**Cohort-level (the specific run):**

5. Launch a new cohort of a programme (sets start_date, end_date,
   size, late-join toggle, optional name override).
6. Manage the cohort's checklist — add / remove template
   activities for this cohort only, reorder, add cohort-only
   activities.
7. Schedule live sessions, post recording URLs after each session.
8. View the list of enrolled students in this cohort.
9. View a single student's detail (week-by-week completion, mock
   scores, current journey-tracker phase).
10. Message one student in a cohort, or the whole cohort.
11. Post announcements to a cohort.
12. Add a student manually (tutor-added enrolment).
13. Archive or cancel a cohort.

### Co-tutors

A programme can have one or more tutors. In v1, all tutors on a
programme have identical powers — no owner/assistant split, and
every co-tutor is automatically on every cohort of that programme.
Cohort-level co-tutor restrictions (e.g. one cohort run solely by a
co-tutor, another by the owner) are deferred to v2.

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
  (self-study) or purchased as the subsidised bundle at cohort
  enrolment.
- **Tutor-authored questions** are visible only to students enrolled
  in one of that tutor's cohorts, and only inside that cohort's
  assignments.

### Open items within programme structure

- Journey-tracker phase content (rich text + checklist per destination
  country) is an admin-authored content task, handled during build,
  not in planning.
- Revenue model is parked in the Pricing topic.
- Cohort-only *content overrides* (a cohort changes the body of a
  template activity for itself only) are deliberately not in v1 —
  cohorts can add and remove, but not override content. Revisit if
  real tutor demand surfaces.

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

Cohort enrolment **bundles** bank access for the cohort's
duration — but at a subsidised price, not free.

- When a student enrols in a tutor's cohort, they pay QAcademy
  directly for a cohort-duration-matched bank pack, at a discounted
  rate.
- The discount is QAcademy's contribution to the programme's value.
- Tutor has no variable cost tied to a cohort's size — their
  subscription stays flat.
- Student sees a clean enrolment flow: tutor fee paid to the tutor
  (off-platform, in the tutor's currency), bank access paid to
  QAcademy (on-platform, in the student's registered currency).
- Subsidy level: **50% of the standalone bank price** for the closest
  matching duration, rounded up so no student is ever mid-week with
  expired bank access.
- Subsidy price is set globally by admin. Tutors do not control it.
- Cohort-level pricing variation (early-bird, holiday promo, foundation-
  vs polished-cohort tiers) is deferred to v2 — for now, the
  programme's price is the price for every cohort of that programme.

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
placeholders and were settled the same day
(see [curriculum-authoring-ux.md](curriculum-authoring-ux.md) and
mockups at
[mockups/curriculum-authoring-ux.html](mockups/curriculum-authoring-ux.html)).

## Content Sourcing

**Settled 2026-04-20.**

Content sourcing — producing the actual NCLEX-quality questions
that fill the bank — is an **editorial and business problem, not a
product-build problem**. It is explicitly out of scope for the
product-build plan.

### For development and testing

The bank will be seeded with synthetic sample questions covering
every question type, every chart structure, and a representative
spread of classification axes. These sample questions exist only to
exercise the schema, scoring functions, renderers, and admin/tutor/
student UIs end-to-end. They are not publication-quality NCLEX
items and are not intended for paying students.

### For launch

Sam (a nurse himself) will run a separate editorial process off-
platform with vetted nurse educators to produce the real bank. The
working model:

- **Authoring** happens wherever is most comfortable for the
  educators — Google Docs, Word, shared spreadsheets, WhatsApp.
- **Sam reviews and restructures** draft content as a nurse, in
  collaboration with the educators.
- **Final questions are typed into the admin** by Sam or a small
  internal team. By the time a question reaches the admin, it has
  already passed editorial review.
- **The admin is the publishing step, not the reviewing step.** No
  in-platform review workflow is built (see Decision A below).

This process runs on Sam's timeline, independently of product
development.

### Two small system decisions taken during this planning

**Decision A — No in-platform review workflow.**
Reviewing happens off-platform. The admin exposes a single
`is_published` boolean on every question. Draft questions
(`is_published = false`) are visible in the admin only. Published
questions (`is_published = true`) are visible to students and
tutors. No reviewer role, no approval queue. If a richer workflow
is ever needed, it is a small addition (two columns: `reviewed_by`,
`reviewed_at`) — easy to bolt on.

**Decision B — "Report this question" feature ships in v1
(minimum version).**
Students can flag any question they think is wrong. This is the
single best mechanism for improving bank quality over time and is
industry-standard for NCLEX prep (UWorld, Kaplan, Archer all have
it). Minimum version only:

- New table `nclex_question_reports` — columns: `id`, `item_id`,
  `student_id`, `reason` (free text), `status`, `created_at`.
- One button on the post-submission view of any question: "Report
  this question" → small text box → submits.
- One admin page: list of reports with question preview and two
  actions — "Dismiss" and "Mark for fix."

Explicitly **not** in v1: report categories (free text only, to
learn what matters), response-to-student flow (reports are one-way),
automatic retirement (admin decides), separate fix workflow (admin
edits in-place; reports stay for audit).

Both students in tutored programmes and self-study students can
report.

### Schema consequences (for the Bank build)

- `nclex_bank_items` gains a column: `is_published BOOLEAN DEFAULT FALSE`.
- `nclex_tutor_questions` gains the same column (parallel ownership
  model — see [bank.md](bank.md)).
- New table: `nclex_question_reports` (covers both QAcademy-owned
  and tutor questions via `item_id` + a source indicator, or via
  two separate tables if that is cleaner when building). Shape
  finalised in build, not planning.

### Deferred

- Reviewer workflow in admin (draft → reviewed → published).
- Report categories, auto-retirement thresholds, response-to-student
  notifications — all v2+ if they turn out to matter.
- Tutors contributing questions up into the main bank (mentioned in
  `bank.md` parallel ownership model — no UI for this in v1).

## Deferred (v2 or later)

- Public self-serve tutor signup / tutor marketplace UI
- Automated payment splits between QAcademy and tutors
- Migration of MyNMCLicensure or MyTeacher onto this stack

## TBD (Not Yet Decided)

All planning topics settled as of 2026-04-20. Future topics will be
added here as they emerge.

## Related Files

- `mynclex/CLAUDE.md` — stack, conventions, non-negotiables
- `mynclex/docs/product-plan/` — all product-plan docs live here:
  - `main.md` — this file, the overall product plan and index
  - `bank.md` — full question-bank schema and scoring
  - `curriculum-authoring-ux.md` — tutor-side authoring screens and
    editors
  - `payments-and-enrolment.md` — student payment flows, product
    catalogue, and enrolment (both self-study and tutored)
  - `tutor-library.md` — tutor's reusable teaching notes (parked
    feature; will add Library Note as the 7th activity type when
    queued for build)
  - `mockups/` — visual mockups (HTML reference files)
  - (future) `payments.md`, `registration.md`, etc.
- `mynclex/db/` — database schema, RLS, migrations (to be populated)
- `qacademy-gamma/SESSIONS.md` — running log of work across the repo
