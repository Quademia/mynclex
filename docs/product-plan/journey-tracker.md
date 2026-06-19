# Journey Tracker

*Planning document. Captures the design conversation of 2026-06-19.*
Last updated: 2026-06-19 (**rebuilds the default starter templates from
web research** — full US (Ghana→US, RN + EB-3) pipeline with sub-steps,
plus UK NMC and Canada NNAS outlines; replaces the simplified
tutor-sketch seed. Earlier same-day: **corrects the access model** — admins keep
normal oversight; there is no special admin blind spot, only
relationship-scoped tutor↔student access. Adds **bank-only self-managed
tracker**, **tutor-saved custom templates**. Earlier same-day rounds
added priced services, packages, off-platform collection tooling, and
sub-steps, and established the Journey Tracker as the product's third
pillar. **Revises and supersedes the "Journey Tracker" section in
[main.md](main.md) lines 81–113.** See *Relationship to main.md* at the
foot of this file.)

> **Status: planning / design phase.** No schema or code yet. Table
> names, JSONB shapes, and RLS specifics shown here are illustrative —
> they're finalised in build, not in planning. Several decisions are
> still open (see *Open questions*).

---

## What it is

The Journey Tracker is a **tutor↔student case-management layer** for the
whole international nurse-licensure journey — credential evaluation,
board registration, the exam, and onward. It is the tooling a tutor uses
to tell a student two things:

> *"Here's what I can help you with on your NCLEX journey."*
> *"Here's where you are right now."*

It is not a feature of the bank, and not a feature of a single
programme. It's its own thing — and it's the layer the tutor actually
*works the relationship* through.

## The three-pillar shape

Up to this conversation, MyNclex was two pillars. The Journey Tracker is
the third, and it sits *above* the other two:

> **Bank** (questions) · **Programmes** (structured prep) ·
> **Journey** (the tutor-managed case that contains everything — a
> programme is just one stage inside it).

A programme/cohort enrolment is **not** the parent of the journey. The
journey is the parent; a Phase-4 exam-prep programme plugs into one
*stage* of it. This is the opposite of nesting the journey under a
programme, and it matters for the data model (see *Relationship model*).

## Who owns what

This is the heart of the reframe, and it differs sharply from the old
main.md framing.

- **QAcademy = the platform / tool-maker.** It builds the system and
  ships neutral, per-destination **starter templates** of stages. It is
  **not the migration agent** and does **not run** anyone's journey — it
  provides the rails, the tutor does the work. (This is a *positioning*
  point, not an access-control wall: QAcademy admins retain normal
  platform oversight — see *Access model*.)

- **The tutor = the migration agent / case manager.** In real life,
  MyNclex's tutors already do this work — they help students with CGFNS
  registration, getting the Ghana NMC to send documents across, CGFNS
  biometrics, state-board registration, sitting the NCLEX, and onward.
  The tracker is the tool they manage that work through. The tutor owns
  the relationship and does (or guides) the work.

- **The student = an active participant, not a spectator.** The student
  acts on their own journey too — uploads documents, marks steps they've
  done themselves, asks questions. This two-sided interaction is the
  whole point (see *Both parties act*).

### Why "tutor as agent" rather than "QAcademy as concierge"

QAcademy is a content + tooling company, not a migration agency. It does
not want — legally, operationally, or by positioning — to hold students'
personal migration documents or run their cases. The tutors are the ones
with the real-world relationships and the agent role. So the journey is a
**tutor-delivered service on QAcademy rails**, not a QAcademy-run
service.

## Access model

> **Corrected 2026-06-19.** An earlier draft of this section claimed a
> "privacy wall" blinding even super-admins from journey contents. That
> over-read the intent. **Admins retain normal platform oversight** — as
> they do everywhere else in MyNclex. "QAcademy doesn't get involved in
> student details" is a *positioning* statement (QAcademy isn't the
> migration agent), not a special RLS carve-out against admins.

A journey case is operationally a **tutor↔student workspace** — those
are the two parties who *act* on it day to day. Visibility:

- **The student** — reads and acts on their own case.
- **The assigned tutor(s)** — read and act on the cases of *their* own
  students.
- **Other tutors** — **no** access to cases that aren't theirs (a tutor
  never sees another tutor's students' journeys).
- **Admin / super-admin** — full oversight, same as everywhere else in
  the platform. No special blind spot.

So the RLS shape is **relationship-scoped, not admin-blind**: rows are
visible to the owning student and the assigned tutor(s), tutor-to-tutor
isolation holds, and admin roles keep their normal reach. This mirrors
how the rest of MyNclex already gates tutor-private data (cf. the
`nclex_tutor_*` parallel-ownership model in [bank.md](bank.md)) — it is
**not** a new or unusual permission stance.

## Configurable, not hard-coded

The tracker must support tutors using it **many different ways** — that
flexibility is a core requirement, not a nice-to-have. One tutor runs a
full migration case file (credentialing → exam → English test → visa);
another uses it as a light "where are you in exam prep" board; another
mostly tracks documents and deadlines.

So the pipeline is **not** a fixed, platform-imposed set of phases.
Instead:

- QAcademy ships a sensible **starter template** per destination (US,
  UK, Canada — see *The default starter templates* below).
- Each tutor **starts from a template and customises** — rename,
  reorder, add, and remove stages — to match how *they* actually work.
- A tutor can **save their own custom templates** (v1) and reuse them
  across students — not just tweak QAcademy's starter each time. So the
  template pool is: QAcademy's per-destination starters **plus** each
  tutor's own saved templates (private to that tutor).
- A tutor is never staring at a blank page, but is never boxed into
  someone else's pipeline either.

This is a direct revision of the old main.md framing, which hard-coded
phases 0–7 as a fixed platform structure.

## Bank-only students

The journey is a **universal student surface**, not a tutored-only one.
A student with no tutor (bank-only / self-study) gets a **simple,
self-managed tracker**: they see the stages, set their own statuses, keep
their own notes and documents, and move themselves along. No service
menu, no payments, no two-sided back-and-forth — just the student's own
view of where they are. (This is essentially the old self-update model
from main.md, kept as the baseline for the untutored case.)

When a tutor later takes the student on, the journey **upgrades** into
the full tutor-managed case (services, packages, shared workspace). The
exact hand-over mechanics — whether the self-managed history carries
over, and how a tutor "adopts" an existing self-managed journey — are a
build detail.

## Rich stages, not light

**Decided: rich.** A stage is *not* just a status + a free-text note. A
stage is a small structured workspace that can hold:

- A **status** (see status model below).
- A **required-documents checklist** — what this stage needs.
- **Reference numbers** — CGFNS ID, application numbers, etc.
- **Key dates** — submitted-on, biometrics appointment, deadlines.
- **Uploaded documents** (richer; storage + RLS finalised in build).
- The **back-and-forth log** between tutor and student (see below).

The reason to go rich: a tutor's day-to-day question isn't only "what
step are they on" — it's "which specific documents are we still waiting
on, and what's overdue."

## Stages and sub-steps

A stage can contain **sub-steps**. *Credential evaluation* isn't one
action — it's open CGFNS account → request Ghana NMC verification →
submit transcripts → biometrics → receive the CES report. So the tracker
is two levels deep.

This is deliberately the **same shape as the curriculum's optional
`Block` layer** (`Unit → Block → Activity` in [main.md](main.md)) — a
familiar pattern, applied here:

- A stage is **either flat** (its own status, docs, and dates — no
  sub-steps) **or has sub-steps**. Sub-steps are optional, exactly like
  curriculum blocks.
- When a stage has sub-steps, its **status rolls up** from them — "3 of
  5 done · waiting on CGFNS" — rather than being set directly.
- The **rich detail** (documents checklist, reference numbers, dates,
  waiting-status) lives at whichever level is the **leaf**: the sub-step
  if the stage has any, otherwise the stage itself.
- **Two levels only in v1** (Stage → Sub-step). No deeper nesting.

The hierarchy:

```
Journey / Case
  ↓ has many
Stage                 — the sellable / serviceable unit (see priced services)
  ↓ has many (optional)
Sub-step              — the actionable leaf; carries the rich detail
```

## Stages are mostly "waiting on someone else"

A key realisation from the real-world example: most stages aren't work
the tutor *finishes* and ticks off. They're **handoffs to an external
body**, after which everyone waits. "Get the Ghana NMC to send documents
to CGFNS" isn't done/not-done — it moves through
*submitted → waiting on CGFNS → received*.

So a stage status is **not** a binary. It's a small lifecycle, roughly:

`NOT_STARTED → IN_PROGRESS → SUBMITTED / WAITING (on external body) →
COMPLETE` (with a `BLOCKED` / `NEEDS_ACTION` state for stuck items).

(Exact status set finalised in build.) The tracker's headline value is
surfacing **what you're stuck waiting on, and what's overdue** — not just
a row of green ticks.

## Both parties act (shared workspace)

**Decided: both the tutor and the student can act on the tracker.** It
is a shared two-party workspace, not a board the tutor edits and the
student only watches. This is what "paves the way" for the back-and-forth,
uploads, and hand-offs. Each stage becomes a small collaborative space:

- The **tutor** can *request* something — "upload your Ghana NMC
  license", "I need your passport bio page" — and set what's outstanding
  for the stage.
- The **student** can *respond* — upload the file, mark "biometrics
  booked for 12 July", leave a question.
- Every action carries **who did it and when**, so both sides see the
  trail. That audit log is what makes the uploads and hand-offs
  trustworthy.

The tutor and the student are the two parties who *act* on a case — which
is why the *Access model* above scopes the working relationship to them
(with admin oversight intact, and other tutors excluded).

## Stages as priced services

Tutors don't just *track* these stages — they **sell them**. In the
tutor's own words, the stages are "services they provide and charge
for." This is the commercial half of the *"here's what I can help you
with"* menu: each offered stage carries *"…and here's my charge."* So
the service menu and the stage list are one object, with a price hanging
off each stage.

### The service menu

- A stage can be flagged **"I offer this as a service"** (a toggle), with
  a **price**, the **currency** (the tutor's own — see *Money* below),
  and a short **what's-included** note.
- **Per relationship, each stage is one of two things:**
  - **Self-handled** — the student does it themselves; no charge; the
    tracker just follows along.
  - **Tutor-serviced** — the tutor does/guides it for the agreed price.

  This resolves the earlier open question about per-tutor vs
  per-relationship service scope: the menu of *offerable* services is the
  tutor's, but **which stages a given student takes** is decided per
  relationship.
- **Pricing sits at the stage level** — the stage is the sellable unit.
  Per-sub-step pricing is deferred to v2.

### Packages (v1)

A tutor can bundle several stages into a named **package** at a package
price — e.g. *"Full US migration support."* The student can buy the
**package** or pick services **à la carte**. Per-stage prices still exist
underneath; a package is just a named bundle with its own price. (Full
package payment was explicitly confirmed for v1.)

### Money — off-platform, platform-tracked

**QAcademy never touches the money and takes no cut.** The tutor
collects; QAcademy is not a party to the transaction. This matches the
settled revenue model — tutor fees stay off-platform, in the tutor's own
currency, with no payment splits and QAcademy not acting as a middleman
([main.md](main.md) → Pricing). It also keeps the marketplace-billing
machinery (connected accounts, splits) firmly in v2, where CLAUDE.md
parks it.

But the platform **does** give tutors a *system to collect through* — it
just isn't a till:

- The tutor raises a **structured payment request / invoice** against a
  stage or a package — amount, currency, what's-included.
- The case carries a **paid / unpaid status** the tutor (or student)
  sets, recorded in the case like everything else.
- The actual money moves by **the tutor's own means** (bank, mobile
  money, their own payment link). The platform records the agreement and
  the trail; it does not process the charge.

> **Decided (v1): invoicing + paid-tracking only.** No in-app card
> payment via the tutor's own connected processor — per-tutor processor
> onboarding is substantial and edges into the marketplace-billing
> machinery CLAUDE.md defers to v2. Revisit then.

### The v2 monetisation seam

This priced-services structure is exactly where an on-platform
commission / escrow model would bolt on later, **if** QAcademy ever
chose to monetise the journey. Not built in v1 — the "platform tutors
rent, not a commission-taking middleman" positioning holds — but worth
naming so the v1 shape doesn't foreclose it.

## Relationship model

The journey is a **tutor↔student relationship (the "case")** that exists
in its own right — broader than, and containing, any programme.

```
Tutor
  ↓ takes on
Journey / Case            — the tutor↔student relationship
  ↓ has many
Stage                     — configurable from a template; the sellable unit
  ↓ has many (optional)
Sub-step                  — the actionable leaf; carries the rich detail
                            (the exam-prep stage instead plugs in ↓)
Programme / Cohort enrolment   — plugs into ONE stage, doesn't own the case
```

Why this shape (vs. tying the journey to a programme enrolment):

- A tutor can manage a student's **credentialing before any course
  exists.**
- A student can have a journey-managing tutor **and separately** be in a
  cohort.
- A student can **finish exam prep but keep the tutor for the visa
  stage.**

So the programme/cohort is a child of the exam-prep stage, not the root.

## Tutor's working surface

The tutor works the journey **one student at a time** — an **individual
case file** is the primary surface. Open a student, see and manage their
whole journey: every stage and sub-step, statuses, the documents
checklist, the back-and-forth, and the service/payment state for that
relationship.

To get *into* a case, v1 needs only a **simple list/index** of the
tutor's students (a way to pick whose file to open) — not a dense
dashboard.

A **board-style grid** showing every student's stage at once (pipeline
view across the whole caseload) is a natural later view, but it's **v2**.
v1 = list → case file.

## The default starter templates

> **Researched 2026-06-19.** The first draft seeded the Ghana→US
> template from one tutor's (simplified) account. It's since been
> rebuilt against published guidance from CGFNS/TruMerit, NCSBN/NCLEX,
> USCIS, the UK NMC, and Canada's NNAS (sources at the foot of this
> section). Sam (a nurse) should still sanity-check the specifics —
> regulatory detail shifts and varies by state/province.

These are **starters** a tutor customises — not fixed pipelines. The
shape (stages → sub-steps) is identical across destinations; the
contents differ. **US is the v1 default** (the core Ghana→US audience);
UK and Canada outlines are captured here too.

### USA (Ghana → US, RN by licensure + EB-3) — v1 default

The realistic end-to-end pipeline. The exam-prep stage is where a
MyNclex programme/cohort plugs in.

0. **Plan & destination** — confirm US; **choose the licensure state**
   (matters a lot for IENs: some states waive the SSN requirement —
   e.g. NY, IL, MN — and ~⅔ of states require CGFNS Certification before
   the NCLEX).
1. **Credential evaluation (CGFNS CES)** — recommended *before* NCLEX.
   - Open a CGFNS/TruMerit account; request the **CES Professional
     Report**.
   - Nursing school sends **transcripts / proof of education** to CGFNS.
   - **Ghana Nursing & Midwifery Council** validates the
     licence/registration directly to CGFNS.
   - (State-dependent) **CGFNS Certification Program / Qualifying Exam**.
   - Receive the CES report.
2. **English proficiency** — *conditional* (often skippable for
   Ghana-educated nurses, as Ghana is English-medium, but state/CGFNS
   rules vary). TOEFL / IELTS / OET / PTE; send scores onward.
3. **State board of nursing application** — apply to the chosen state
   board, declare intent to be licensed by examination, submit the CES
   report, English scores, and identity documents.
4. **Prepare for the NCLEX-RN** — the study phase. *(A MyNclex
   self-study bank subscription or a tutor's programme/cohort plugs in
   here.)*
5. **Register & sit the NCLEX-RN** — two coordinated registrations.
   - Register with **Pearson VUE** and pay the exam fee (US $200).
   - The board makes the candidate **eligible** in Pearson VUE.
   - Receive the **Authorization to Test (ATT)** (≈90-day validity).
   - **Schedule** at a Pearson VUE centre and **sit** the exam.
   - Receive results.
6. **RN licensure issued** — the state board issues the RN licence.
7. **VisaScreen certificate (CGFNS)** — required by US federal law for an
   occupational visa; bundles credential review + English + proof of
   NCLEX (or CGFNS Qualifying Exam) pass.
8. **Immigration — EB-3 (Schedule A)** — the longest, most uncertain leg.
   - Secure a **US employer job offer / sponsor**.
   - Employer files **Form I-140** (nurses use **Schedule A**, skipping
     PERM labour certification).
   - **Priority date / Visa Bulletin** wait — **retrogression** can add
     years depending on country.
   - **National Visa Center (NVC)** processing — fees + civil documents.
   - **Consular interview + medical exam** at the US embassy.
   - **Immigrant visa issued** → relocate / port-of-entry → green card.
   - **Begin employment.**

### UK (NMC registration) — outline

0. **Plan & destination** — confirm UK route.
1. **NMC account & eligibility** — create the NMC online account, start
   the application.
2. **English proficiency** — IELTS Academic (7.0, no band < 6.5) or OET
   (B), unless trained in a recognised English-majority country.
3. **Test of Competence Part 1 — CBT** — computer-based test at Pearson
   VUE worldwide (pass valid 2 years).
4. **Qualification & identity verification** — document checks, Ghana
   N&MC registration verification.
5. **Test of Competence Part 2 — OSCE** — hands-on clinical exam, taken
   **in the UK** at an approved centre.
6. **Registration & PIN** — final application; NMC issues the PIN.
7. **Visa** — Health and Care Worker visa via an employer Certificate of
   Sponsorship (separate immigration leg).

### Canada (NNAS → provincial regulator) — outline

0. **Plan & destination** — confirm Canada; choose target province.
1. **NNAS application** — create the NNAS account (IENs cannot apply to a
   regulator directly); submit documents.
2. **Credential evaluation** — NNAS assesses education/clinical hours
   (≈12–16 weeks); issues the **NNAS Advisory Report**.
3. **Apply to the provincial/territorial regulator** — the regulator
   re-assesses using the NNAS report.
4. **English proficiency** — IELTS / CELBAN, if required.
5. **NCLEX-RN** — most provinces require it (same NCLEX as the US).
6. **Jurisprudence exam** — province-specific, where required.
7. **Provincial registration** — licence to practise.
8. **Immigration** — Express Entry / Provincial Nominee / work permit
   (separate leg).

### Sources

CGFNS/TruMerit (steps to working in the US; CES; VisaScreen;
certification), NCSBN/NCLEX (the 8-step NCLEX process; Pearson VUE; ATT),
USCIS / EB-3 Schedule A guidance, UK NMC / RCN (CBT, OSCE, English),
Canada NNAS / provincial regulators, plus practitioner guides
(registerednursing.org, Connetics USA, NEAC). Compiled via web research
2026-06-19; treat regulatory specifics as living, not authoritative.

## Open questions

Not yet decided — flagged so they're not silently assumed:

1. **Document storage + RLS specifics.** Rich stages include uploads;
   the exact bucket layout and relationship-scoped storage policy are a
   build decision.

(Everything raised in this planning conversation is otherwise resolved —
see below.)

**Resolved this session:**

- **Service scope is per-relationship** — the tutor's menu of offerable
  services is standing; *which* a given student takes is decided per
  relationship. See *Stages as priced services*.
- **Collection depth: invoice + paid-tracking only in v1.** No in-app
  card payment via a connected processor — deferred (see *Deferred*).
- **Tutor's primary surface is the individual case file** — see *Tutor's
  working surface*. A board-style grid of all students is a v2 idea.
- **Bank-only (no-tutor) students get a simple self-managed tracker** —
  the journey is a universal student surface, not tutor-only. See
  *Bank-only students* below.
- **Tutors can save their own custom templates** — not just customise
  QAcademy's starter per student. See *Configurable, not hard-coded*.
- **No special admin blind spot.** Admins keep normal platform oversight;
  the access model is relationship-scoped, not admin-blind. See *Access
  model*.

## Deferred (not v1, unless re-opened)

- Starter templates for destinations **beyond US / UK / Canada** (the
  three are now researched — see *The default starter templates*).
  Whether UK and Canada **ship in v1** or follow the US default is a
  scope call for build. *(Tutor-authored custom templates ARE in v1 —
  see Configurable.)*
- Any automated integration with external bodies (CGFNS, boards) —
  everything is manually tracked in v1.
- Document review/approval workflows beyond upload + the tutor↔student
  back-and-forth.
- **In-app card collection** via the tutor's own connected processor
  (v1 is invoice + paid-tracking only).
- **Per-sub-step pricing** (v1 prices at the stage level only).
- **On-platform commission / escrow** — the v2 monetisation seam; the
  v1 shape leaves room for it but does not build it.
- **Deeper nesting** below sub-steps (v1 is two levels: stage → sub-step).
- **Board / pipeline grid** of all students at once (v1 is a simple
  list → individual case file — see *Tutor's working surface*).

## Relationship to main.md

The existing **"Journey Tracker" section in [main.md](main.md)
(lines 81–113)** predates this conversation and describes a materially
different design:

| Topic | Old main.md framing | This document |
|---|---|---|
| Who runs it | QAcademy provides structure; students self-update | Tutored: tutor is case manager (both act). Bank-only: student self-manages |
| QAcademy's role | Provides guidance content, *can* be involved | Platform / tool-maker; not the migration agent (admins keep normal oversight) |
| Pipeline | Fixed phases 0–7 (hard-coded) | Configurable; QAcademy starter templates + tutor customisation + tutor-saved custom templates |
| Stage depth | Phase state + checklist | Rich (docs, refs, dates, uploads, back-and-forth) |
| Tutor's role | Can *view* enrolled students' journey | *Owns* and *manages* the journey |
| Charging | Not addressed | Stages are priced services + packages; off-platform collection, platform-tracked |
| Structure depth | Flat phases | Stage → optional sub-step (two levels) |
| Relationship to programme | Programme plugs into Phase 4 (retained ✓) | Same — programme is a child of the exam stage |

The one piece that carries over unchanged: **the programme plugs into
the exam-prep stage.** Everything else here supersedes the old section.

**Reconciled 2026-06-19.** `main.md`'s Journey Tracker section was
rewritten to a concise overview matching this design and pointing here;
its dashboard wording (phase → stage) and the "admin-authored phase
content" open item were updated to the template model, and this file was
added to its Related Files list.

## Related files

- [main.md](main.md) — overall product plan (its Journey Tracker section
  is superseded by this file; see above).
- [payments-and-enrolment.md](payments-and-enrolment.md) — enrolment, the
  mechanism behind the exam-prep stage.
- `mynclex/CLAUDE.md` — non-negotiables, incl. the `nclex_` table prefix
  and server-side auth rules the journey tables must follow.
