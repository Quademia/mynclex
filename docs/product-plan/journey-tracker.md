# Journey Tracker

*Planning document. Captures the design conversation of 2026-06-19.*
Last updated: 2026-06-19 (initial draft — establishes the Journey
Tracker as the product's third pillar; **revises and supersedes the
"Journey Tracker" section in [main.md](main.md) lines 81–113**, which
described an earlier, different framing. See *Relationship to main.md*
at the foot of this file.)

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
  ships a neutral, per-destination **starter template** of stages (which
  contains *no student data*). QAcademy does **not** run anyone's
  journey and **does not see any individual student's journey details or
  documents.** It is deliberately blind to the case contents.

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

## The privacy wall (non-negotiable)

"QAcademy doesn't see student details" is an **engineering constraint**,
not just a value statement — and it's unusual enough to call out loudly
because it inverts the app's normal posture.

Everywhere else in MyNclex, a SUPER_ADMIN can ultimately read
everything. **The journey tables are the exception.** A student's
journey contents — stage statuses, notes, the back-and-forth, and
(later) uploaded documents — are visible to **exactly two parties: the
student, and their assigned tutor.** Not other tutors. Not admins. Not
super-admin.

Implications to bake in from the very first table (cheaper now than
retrofitting):

- RLS on the journey tables grants read/write to the student who owns
  the case and the tutor(s) assigned to it — and to **no admin role**.
- Any platform-level analytics or admin views must operate on
  **non-identifying aggregates at most** (e.g. counts), never on case
  contents. Whether even aggregates are exposed is an open question.
- Uploaded documents land in a storage bucket with the same two-party
  policy, not the general `nclex_` asset buckets.

This is a deliberate, slightly unusual permission stance. It's the one
rule most likely to be violated by habit ("admins can see everything"),
so it's written first.

## Configurable, not hard-coded

The tracker must support tutors using it **many different ways** — that
flexibility is a core requirement, not a nice-to-have. One tutor runs a
full migration case file (credentialing → exam → English test → visa);
another uses it as a light "where are you in exam prep" board; another
mostly tracks documents and deadlines.

So the pipeline is **not** a fixed, platform-imposed set of phases.
Instead:

- QAcademy ships a sensible **starter template** per destination (the
  Ghana→US template seeded from the real tutor example below).
- Each tutor **starts from the template and customises** — rename,
  reorder, add, and remove stages — to match how *they* actually work.
- A tutor is never staring at a blank page, but is never boxed into
  someone else's pipeline either.

This is a direct revision of the old main.md framing, which hard-coded
phases 0–7 as a fixed platform structure.

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

This shared, two-party model is exactly why the privacy wall above is
scoped to *student + assigned tutor*: those are the only two actors.

## Relationship model

The journey is a **tutor↔student relationship (the "case")** that exists
in its own right — broader than, and containing, any programme.

```
Tutor
  ↓ takes on
Journey / Case            — the tutor↔student relationship
  ↓ has many
Stage                     — configurable; tutor-customised from a template
  ↓ (the exam-prep stage)
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

## The default template (Ghana → US, v1 seed)

Seeded directly from a practising tutor's real workflow. This is the
*starter* a tutor customises — not a fixed pipeline:

1. **CGFNS application** — open the account, start the credentials
   evaluation.
2. **Ghana NMC → CGFNS verification** — get the Ghana Nursing &
   Midwifery Council to send the required license/education documents to
   CGFNS.
3. **CGFNS biometrics** — identity verification.
4. **State board registration** — apply to the chosen US state board of
   nursing (path to the Authorization to Test).
5. **Sit the NCLEX** — schedule and write the exam. *(The exam-prep
   programme/cohort plugs in around here.)*
6. **…and onward** — VisaScreen, visa / retrogression, endorsement, etc.

Other destination templates (UK NMC, Canada NNAS) are future seeds;
shape is identical, contents differ.

## Open questions

Not yet decided — flagged so they're not silently assumed:

1. **Tutor's primary view: case file vs. board.** When a tutor opens
   this, do they see **one student's journey at a time** (a case file you
   open per person), or a **board of all their students** at once (every
   student's stage in a grid)? Both probably exist eventually; the
   question is which to design first. *(Raised, not yet answered.)*

2. **The no-tutor / bank-only student.** Does a student with no tutor get
   a basic **self-service view** of the stages (the old self-update
   model, as a baseline), or does the journey only light up once a tutor
   takes them on? *(Parked.)*

3. **Service-scope configuration — per-tutor vs per-relationship.** Is
   "what I can help you with" a standing **per-tutor** menu, or
   customised **per student** (tutor helps student A with everything but
   student B with only exam prep)? Leaning per-relationship with a
   per-tutor default. *(Open.)*

4. **Template authorship.** Confirmed QAcademy ships the neutral
   per-destination starter templates (no student data). Whether tutors
   can also save *their own* reusable templates is open.

5. **Aggregate visibility to QAcademy.** The privacy wall blocks case
   contents from admins. Whether *non-identifying aggregates* (counts,
   stage distributions) are surfaced to QAcademy at all is undecided —
   default to nothing until there's a reason.

6. **Document storage + RLS specifics.** Rich stages include uploads;
   the exact bucket layout and two-party storage policy are a build
   decision.

## Deferred (not v1, unless re-opened)

- Multi-destination template library beyond the first Ghana→US seed.
- Tutor-authored reusable templates (vs. only customising the
  QAcademy starter).
- Any automated integration with external bodies (CGFNS, boards) —
  everything is manually tracked in v1.
- Document review/approval workflows beyond upload + the two-party
  back-and-forth.

## Relationship to main.md

The existing **"Journey Tracker" section in [main.md](main.md)
(lines 81–113)** predates this conversation and describes a materially
different design:

| Topic | Old main.md framing | This document |
|---|---|---|
| Who runs it | QAcademy provides structure; students self-update | Tutor is the case manager; both tutor + student act |
| QAcademy's role | Provides guidance content, *can* be involved | Platform only; **blind to case contents** |
| Pipeline | Fixed phases 0–7 (hard-coded) | Configurable; template + tutor customisation |
| Stage depth | Phase state + checklist | Rich (docs, refs, dates, uploads, back-and-forth) |
| Tutor's role | Can *view* enrolled students' journey | *Owns* and *manages* the journey |
| Relationship to programme | Programme plugs into Phase 4 (retained ✓) | Same — programme is a child of the exam stage |

The one piece that carries over unchanged: **the programme plugs into
the exam-prep stage.** Everything else here supersedes the old section.

**Action needed (not yet done):** reconcile `main.md` — either trim its
Journey Tracker section to a pointer at this file, or rewrite it to
match. That's a larger edit to a settled doc and is left for Sam's
explicit go-ahead.

## Related files

- [main.md](main.md) — overall product plan (its Journey Tracker section
  is superseded by this file; see above).
- [payments-and-enrolment.md](payments-and-enrolment.md) — enrolment, the
  mechanism behind the exam-prep stage.
- `mynclex/CLAUDE.md` — non-negotiables, incl. the `nclex_` table prefix
  and server-side auth rules the journey tables must follow.
