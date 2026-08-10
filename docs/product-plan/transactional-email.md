# Transactional Email — Trigger Registry

*Status: **architecture settled, nothing built**. This doc is the single
source of truth for **every point in the app that should send an email**, and
now also for **how a send works**. See [main.md](main.md) and
[payments-and-enrolment.md](payments-and-enrolment.md).*

Last updated: 2026-08-10 (design session, no code — the two classes;
outbox + no email Worker; the fingerprint; the receipt is per **checkout**;
`enrolment.confirmed` folded into `payment.received`; first pair chosen;
templates as `.ts` files carrying a frozen snapshot; monitoring = a "stuck"
admin page **plus** an out-of-band alert).

---

## Why this exists

Email should have been wired from the start; it wasn't. Rather than retrofit it
feature-by-feature, we will build it **once, as a focused arc, after the core
app is in good shape**. Until then the rule is: **whenever we build something
that ought to send an email, we (1) add a row to the catalog below and (2) drop
a greppable marker at the exact code location.** When the email arc lands, this
registry IS the build checklist and the markers ARE the wiring points.

## How a send works — settled 2026-08-10

Read this first; it is the shape everything below assumes.

**Nothing sends an email directly. Everything writes a row.**

1. Something decides an email is owed — either **an event** (a payment landed)
   or **the clock** (a due date is three days away).
2. That writes one row into a queue table, `nclex_email_outbox`.
3. A sender picks the row up, renders the template, hands it to Resend, and
   marks the row sent — or records the error and leaves it to be retried.

The queue is the whole design. It is why *"did Ama get her receipt?"* has an
answer, why a retry is possible at all, and why the clock and the event paths
can share one sender. **Every send is recorded, instant ones included**
(Sam, 2026-08-10) — once the table exists, recording costs nothing extra.

### No email Worker — send from the app

⚠ **This supersedes the old "Resend via a dedicated MyNclex email worker
(`workers/`)" line**, which came from CLAUDE.md and was copied from gamma's
shape. `workers/` in this repo holds nothing but a `.gitkeep`, and should
stay that way. ⓘ **CLAUDE.md's "Stack (Target)" still carries the old line
and needs a one-line correction.**

**Sam's call, 2026-08-10:** gamma needed a Worker because a static site on
Cloudflare Pages has nowhere to run server code. We are Next.js on Workers —
every Server Action *is* server code — so the second hop buys nothing.

⭐ **And gamma's Worker never did the job it exists for.** Its purpose is to
keep the Resend key out of the browser, but the secret needed to *reach* it
(`EMAIL_SECRET`) sits in `mynmclicensure/js/config.js`, which ships to every
visitor, dev and prod values both. Its `if (body.secret !== env.EMAIL_SECRET)`
check is therefore not an auth check, and the whole hop is decoration. From a
read-only survey of gamma on 2026-08-10; flagged to Sam as a **live
gamma-prod issue** (arbitrary branded mail from a verified domain → sending
reputation), out of scope for this repo.

### Sends stay app-layer, never from a Postgres trigger

Unchanged from the original rule, with one clarification: **a pg_cron job
writing an outbox row is not a send — it is an enqueue**, and that is allowed.
The send itself always happens in app code.

## The two classes — event-driven ⚡ and time-driven ⏰

⭐ **Settled 2026-08-10 (Sam).** The catalog below reads as one flat list,
which hid the fact that it contains **two different builds**. Sam's framing:
*"if I paid for a product the email I get is different from the first reminder
for my subscription which is about to expire in 7 days."*

- **⚡ Event-driven (17)** — something happened; the email is its consequence.
  The code that should send it already runs, and the data is already in hand.
- **⏰ Time-driven (7)** — nothing happened. A date approached, or passed, or
  nothing happened *for long enough*. No code is running; something has to go
  looking.

They differ in more than timing:

| | ⚡ event-driven | ⏰ time-driven |
|---|---|---|
| Who starts it | a line of code that already runs | a clock, **plus a query that finds who qualifies** |
| "Late" means | broken — a receipt 10 min late is wrong | fine at 9am or 11am, wrong by a *day* |
| Double-send risk | retries of one path | a table scan — run it twice, everybody gets two |
| A missed run | cannot happen | needs a policy: send late, or skip? |
| Shape | usually one email | usually a **series** (T-3 → due today → overdue) |
| Load | one at a time | a burst |

⚠ **Time-driven is the half that does not get built.** Gamma designed exactly
this: an `expiry_reminded` column on its subscriptions table. It is written
`false` in **seven** places and set `true` in **zero**. There is no cron, no
scheduled handler, anywhere in that repo, and its email Worker carries
`{{expiryDate}}` / `{{renewUrl}}` placeholders that **no template uses**. It
did not fail because it was conceptually hard — that stack had **nowhere to
run a clock**. We do: pg_cron already runs three jobs here.

⚠ **Two of the seven are P1** (`payment.installment_due`, `session.reminder`).
"Do the scheduled ones later" contradicts the P1 definition — *needed for a
credible paid v1*.

⚠ **Two more are blocked** (`enrolment.access_expiring` / `access_expired`) —
they need access windows, and that discussion is parked with the
programme-level default duration still missing.

## The fingerprint — what makes two emails "the same email"

Every outbox row carries a fingerprint, and the **database** refuses the
duplicate. Not the code: "check whether it exists, then insert" loses the race
when two Paystack retries land at the same moment, which is the exact
situation it exists for.

Fingerprint = **which email · what it is about · which stage**.

| Email | What it is about | Stage |
|---|---|---|
| `payment.received` | the **checkout group** | — |
| `payment.installment_due` | the enrolment + installment number | `T-3` |
| `payment.installment_due` | the enrolment + installment number | `due-today` |

**Stage is never blank** — a dash or a word, never empty. Postgres treats two
blanks in a uniqueness rule as *not equal to each other*, so two "no stage"
rows would both be admitted and the protection would silently fail to apply to
exactly the instant emails that most need it.

⚠ **Too tight is more dangerous than too loose.** Too loose sends duplicates —
annoying, someone complains, you find out. Too tight sends **nothing**, and
nobody ever reports an email they did not know was coming. If the due reminder
were fingerprinted on just "this enrolment", installment #2's warning would be
suppressed by #1's, and the first thing the student would hear is her access
being paused.

⭐ **The consequence worth stating out loud:** enqueuing becomes safe to
attempt repeatedly. Any path may say "there should be a receipt for this
checkout" as often as it likes — the first wins, the rest are no-ops. That is
what lets Paystack's callback and the tutor's "mark paid" button both point at
the same email without either knowing about the other.

### ⚠ The receipt is per CHECKOUT, not per payment row

Found 2026-08-10, from Sam's question — *"we have several types of payments
that will be received."* [`nclex_payments`](../../db/schema.sql) carries
`checkout_group_id` ("rows of one combined charge share it"), and
`paystack_reference` is **shared across those rows, not unique per row**. A
student who buys a programme place and ticks bank access at the same checkout
produces **two payment rows from one card debit**.

Fingerprinted on `payment_id` she receives **two receipts for one charge** —
the "have I been charged twice?" alarm the fingerprint exists to prevent. The
receipt is about the **checkout**.

### The five purposes are line items, not five emails

`BANK_PURCHASE` · `READINESS_PURCHASE` · `PROGRAMME_INITIAL` ·
`PROGRAMME_INSTALLMENT` · `BANK_OPTIN_AT_PROGRAMME`

A receipt has a money half that is identical for all of them (amount, date,
method, reference) and a "what you now have" half that is not:

| Line item | What you now have |
|---|---|
| `BANK_PURCHASE` | Bank access until 12 Nov |
| `READINESS_PURCHASE` | 3 readiness packs |
| `PROGRAMME_INITIAL` | Enrolled in Cohort 3 · GHS 150 remaining, next due 5 Sep |
| `PROGRAMME_INSTALLMENT` | GHS 50 remaining, next due 5 Oct |
| `BANK_OPTIN_AT_PROGRAMME` | Bank access alongside your programme |

One email, one money block, a repeating "what this gets you" section. One
charge → one receipt, the way a receipt actually works. Money renders through
`formatMinor()` — `GHS 350`, never `₵350`.

ⓘ `payment.tutor_received` stays genuinely separate: the tutor's half concerns
**programme money only**, since bank and readiness are QAcademy's money.

## Templates — one file per email, living in the repo

⭐ **Settled 2026-08-10 (Sam):** emulate gamma's shape — one template per
event, `{{placeholder}}` substitution, a shared footer — but **in our app**,
not in a Worker and not in a dashboard. *"Based on what happened, that
template is sent."*

ⓘ **This is strictly better than the auth templates, not merely equivalent.**
Those live in two Supabase dashboards with a *copy* in `docs/email/`, which is
why that folder carries the rule *repo is the source, dashboard is a copy* —
two places to keep in step. These live **only** in the repo. There is no
second copy to drift.

### Each template file holds three things

1. **The subject line.**
2. **The HTML body**, with `{{placeholders}}`.
3. **The list of values it requires** — so rendering one without a value it
   needs is an error, not a silent blank.

### Format: `.ts` files, not `.html` files

Gamma imports `.html` as text modules. The decision here went the other way,
on balance of risk:

- **`.html` files** would be nicer to open — no code visible at all. But
  importing HTML as text needs **bundler configuration in two bundlers**
  (Turbopack in dev, webpack in prod), and this repo's scar tissue is exactly
  there: the Turbopack chunk-layout failure that forced `--webpack`, the
  lightningcss break, the `proxy.ts` revert.
- **`.ts` files** need no configuration and behave identically in both. The
  text still reads as HTML, merely quoted.

⚠ **The thing traded away is real** — Sam writes the copy, and a `.ts` file is
more intimidating to open than an `.html` one. Revisit if editing the wording
ever starts to feel like touching code.

### ⭐ The payload is a SNAPSHOT, not a lookup

The outbox row stores **the facts**, not the id of the thing they came from.

Sam's example: *"if a tutor enrolled someone, the template should say what
teacher, what programme, from when to when, then some instructions."* Those
facts are gathered the moment the tutor clicks Add, and frozen into the row.

If the row held only `enrolment_id` and the sender looked things up at send
time:

- the tutor edits the dates a minute later → the email describes something
  that never happened
- the enrolment is deleted → the send breaks, or goes out blank
- a retry fires three days later → it reads the world as of three days later

**The product already does this for money.** `strategy_snapshot_json` freezes
the chosen payment plan onto the enrolment so later price edits cannot rewrite
what somebody agreed to. Same idea, same reason: **an email is a record of a
moment**, so the moment is frozen into the row.

### ⚠ Four things to fix from gamma's version

From a read of `mynmclicensure/workers/email-worker/index.js`, 2026-08-10:

1. **Escape the substitutions.** Gamma drops `{{name}}` into HTML raw. A value
   containing a quote or a `<` breaks the layout; a hostile one injects markup
   into mail sent from a verified domain.
2. **Missing values ship blank, silently.** The filler is `data.name || ''`,
   so a forgotten value sends "Hi ," and nobody notices. ⚠ **Sam's own example
   contains this trap** — *"from when to when"* — because an enrolment's end
   date can legitimately be absent. A template must state what to render when
   a value is missing.
3. **One shared filler for every template.** Gamma has a single
   `fillTemplate()` with 13 hardcoded placeholders serving all four emails, so
   a typo'd `{{teachr}}` simply ships as literal text. Per-template
   required-value lists replace it.
4. **No plain-text alternative.** Gamma sends HTML only; some clients and spam
   filters want both.

ⓘ **Worth keeping from gamma:** the shared `footer.html` injected into every
body (social links in one place), and `{{placeholder}}` substitution itself —
simple, and legible to a non-coder.

### Who writes the words

**Sam does.** Claude builds the skeleton with placeholder wording; Sam
rewrites it — the same way all seven scoring rules were reworded before they
shipped.

## Monitoring — where Sam sees the queue

⭐ Sam raised this **first**, ahead of every other design question: *"we will
need some sort of way to monitor the scheduled emails."* A queue nobody looks
at is precisely how "it silently stopped sending" happens — which is gamma's
state today.

### ⚠ Resend's dashboard cannot answer it

It shows what we **handed over** — delivered, bounced, opened. It cannot show
emails that were never handed over, which is the exact failure being guarded
against. If our sender stops running, Resend does not go red; it shows fewer
emails, and that is indistinguishable from a quiet week.

So the view has to be ours.

### Two halves, both needed

- **Pull — a small admin page.** One table read, so nearly free once the
  outbox exists. The useful view is **"stuck"**, not "everything ever": rows
  that should have gone and have not, with the last error and the attempt
  count. An all-rows list is noise nobody opens.
- **Push — an alert when rows get stuck.** This is the half that catches
  silence, because nobody opens a page they have no reason to suspect. The
  page on its own is gamma's failure restated.

### ⚠ The alarm shares the failure it is alarming about

If the alert is an email and the mailer is broken, the alert cannot send
either. So it needs either a different channel, or to be a check that runs
**elsewhere** and complains about *absence* — e.g. a scheduled GitHub Action
(the `recalibrate.yml` pattern already exists) that fails loudly when the queue
has been stuck for N hours. **Decide this rather than assume it.**

**Recommendation:** build the page alongside the first pair, and the alert
immediately after as its own small piece, with the alarm's own failure mode
settled first.

## Two layers, and what actually separates them

**Supabase Auth** already sends a set of identity emails — invite, email
confirmation, password reset, magic link. Those are **not** part of this
layer; they are configured in Supabase, and are listed in the
"Supabase-managed" section near the bottom only so the full picture sits in
one place.

⚠ **Corrected 2026-08-06:** this used to say "we don't send them through
Resend", which stopped being true when custom SMTP went live. They *are*
delivered by Resend now. **The split is about who composes and triggers the
email, not about which wire it goes down** — both layers leave the building
through the same Resend account.

What that means in practice: Supabase composes from a dashboard template and
can see an email address and a link, and **nothing else** — no programme, no
cohort, no amount, no tutor. That single limitation is the whole reason the
invite is being moved into this layer (see the bottom of this doc): an email
that can only say *you have an account* leaves the reader asking *for what?*

---

## The code-marker convention

At the exact spot an email should fire, drop a single-line comment:

```ts
// EMAIL-TRIGGER[event.key]: <recipient> — <what + why>
```

- `event.key` is dot.case and **matches a row** in the catalog below
  (e.g. `payment.received`).
- `<recipient>` is who gets it: `student`, `tutor`, `lead`, `admin`.
- Keep it one line. Put it immediately before/after the line that commits the
  state change the email is about (the enrolment insert, the mark-paid update,
  the schedule write, …).

**Find every wired trigger point:**

```bash
grep -rn "EMAIL-TRIGGER" --include=*.ts --include=*.tsx
```

That list should always reconcile with the catalog. When you add a marker, add
(or tick) the matching catalog row in the same change.

> ⚠ **It does not reconcile, and never has (checked 2026-08-10).** There is
> exactly **one** `EMAIL-TRIGGER` marker in the whole codebase —
> [`app/(public)/checkout/callback/page.tsx`](../../app/(public)/checkout/callback/page.tsx)
> — and its key, `payment.setup_link_resend`, **is not in the catalog at all**.
> Half of the convention was never practised.
>
> The consequence for the build: *"the markers ARE the wiring points"* is a
> promise this repo cannot keep. Each slice must **find** its call sites by
> reading the code, using the `Anchor` column below as the guide (that column
> does appear accurate). Drop the marker as you wire each one, so the second
> half of the arc gets the benefit the first half didn't.

### Going-forward checklist (per feature)

When building anything that touches enrolment, money, sessions, enquiries,
content release, or account state, ask "should this notify someone?" — if yes:

1. Add a row to the catalog (event key · trigger · recipient · purpose · priority).
2. Drop the `EMAIL-TRIGGER[...]` marker at the code location.
3. Leave the actual send for the email arc (don't build a one-off send).

---

## Priority tiers

- **P1** — needed for a credible paid v1 launch (money + access + live classes
  go silent without these).
- **P2** — important, expected soon after launch.
- **P3** — engagement / nudges / nice-to-have.

---

## Catalog

`Kind` = ⚡ event-driven · ⏰ time-driven (see *The two classes* above).
`Anchor` = does the code path that should fire this already exist?
✅ exists (needs a marker) · ⬜ not built yet (mark when built).

### Enrolment & access

| Event key | Kind | Trigger | Recipient | Purpose | Pri | Anchor |
|---|---|---|---|---|---|---|
| `enrolment.tutor_added` | ⚡ | Tutor manually adds a student (cohort add / self-paced add / waitlist convert) | student | "Your tutor enrolled you" — set-password/login + link in | P1 | ✅ |
| `waitlist.joined` | ⚡ | Student/lead joins a cohort waitlist | lead | Acknowledge waitlist position | P2 | ✅ |
| `waitlist.converted` | ⚡ | Tutor converts a waitlisted lead to enrolled | student | "A place opened up — you're in" | P2 | ✅ |
| `enrolment.access_expiring` | ⏰ | Access window is N days from expiry | student | Renew / heads-up before losing access | P2 | ⬜ ⚠ blocked |
| `enrolment.access_expired` | ⏰ | Access window passes | student | Access ended, how to renew | P2 | ⬜ ⚠ blocked |

> ### ⭐ `enrolment.confirmed` was FOLDED INTO `payment.received` (2026-08-10)
>
> It used to sit here, triggered by *"a paid checkout completes and the
> enrolment row is created"* — **the same moment, the same person and the same
> checkout** as `payment.received`. Two emails for one action, and nobody had
> put the two rows side by side.
>
> **This is the same duplication Sam caught on 2026-08-06 with the invite**,
> where a thin Supabase "you have an account" would have arrived alongside our
> rich "here's what for". His rule then was *it should be one email, and the
> rich one wins*, and it applies here unchanged: a receipt reading "GHS 350
> received" with no statement of what you now have is a bank statement, and
> "you're enrolled" with no amount sends the student hunting for whether the
> money landed.
>
> So "You're enrolled in Cohort 3" **is the programme line item's
> "what you now have" block** inside the receipt — not a second email.
> Decided by Sam 2026-08-10.
>
> ⚠ **One branch still to be read before this is safe to build:** the
> **pay-first** path, where someone pays before an account exists and lands on
> `SETUP_REQUIRED` / `INVITE_SENT`. There the money is in but the enrolment is
> not live, so the block must read *"one step left"* rather than *"you're
> in."* That is a branch **inside** the one email, not an argument for two —
> but the path has not been read yet.

### Payments

| Event key | Kind | Trigger | Recipient | Purpose | Pri | Anchor |
|---|---|---|---|---|---|---|
| `payment.received` | ⚡ | A **checkout** is paid — Paystack success OR tutor "mark paid" | student | **Receipt**: amount, method, reference + one "what you now have" line per purpose in the checkout (incl. *you're enrolled*, folded in above). Fingerprint = `checkout_group_id` | P1 | ✅ |
| `payment.failed` | ⚡ | Paystack reports a failed/declined charge | student | Payment didn't go through, retry link | P1 | ✅ |
| `payment.installment_due` | ⏰ | An installment is approaching its due date | student | Reminder + pay link | P1 | ⬜ (clock ✅ — see below) |
| `payment.installment_overdue` | ⏰ | An installment passes its due date unpaid | student | Overdue notice + grace info | P1 | ✅ (state) / ⬜ (job) |
| `payment.grace_set` | ⚡ | Tutor grants a first-payment / installment grace | student | "Your tutor extended your due date to X" | P2 | ✅ |
| `payment.refunded` | ⚡ | A payment is refunded | student | Refund confirmation | P2 | ✅ |
| `payment.tutor_received` | ⚡ | A student payment lands — Paystack success OR tutor "mark paid" | tutor | "Ama paid GHS X for Cohort Y" — payer, amount, plan, cohort. **Programme money only** (bank/readiness is QAcademy's). **Required on every payment**; per-event vs digest is a delivery choice (see open questions) | P1 | ✅ |

> ### ⭐ The due-date maths already exists — and must be SHARED, not re-derived
>
> [`nclex_enrolment_nightly_sweep()`](../../db/migrations/20260608120000_slice_7d_installment_lifecycle.sql)
> runs on pg_cron at **02:00 UTC** and already computes the next unpaid
> installment's due date, branching on `DEPOSIT_BALANCE` vs
> `EQUAL_INSTALLMENTS`. The clock exists and already walks exactly these rows.
>
> That is not just convenient — it is **correctness**. The same expression is
> what decides to **pause a student's access** for being overdue. If the
> reminder computes its own due date separately, the two can drift, and the
> failure mode is the bad one: *"your access is paused, payment overdue"*
> arriving to somebody who was **never warned**.

> **Every payment notifies BOTH sides.** A received payment is a paired send:
> `payment.received` (the student's receipt) **and** `payment.tutor_received`
> (the tutor's "money's in"). Both are P1 — neither side should be left in the
> dark when money moves. Applies to the same anchor (Paystack success and the
> tutor "mark paid" path); the tutor-side cadence (per-event vs daily digest) is
> the only open delivery question, not whether it's sent.

### Live sessions

⚠ Every row here is a **fan-out** — one trigger, a whole cohort of recipients.
That shape is not exercised by the first pair and needs its own thought
(volume against Resend's daily cap, and whether one row per student or one row
per cohort goes in the outbox).

| Event key | Kind | Trigger | Recipient | Purpose | Pri | Anchor |
|---|---|---|---|---|---|---|
| `session.scheduled` | ⚡ | Tutor schedules / announces a session date for a cohort | cohort students | "Live session set for <when>" + join details | P1 | ✅ |
| `session.reminder` | ⏰ | T-24h and/or T-1h before a scheduled session | cohort students | Reminder + join link | P1 | ⬜ |
| `session.rescheduled` | ⚡ | A scheduled session's date/time changes | cohort students | New time | P2 | ✅ |
| `session.cancelled` | ⚡ | A scheduled session is removed | cohort students | It's off | P2 | ✅ |
| `session.recording_available` | ⚡ | A recording URL is added to a held session | cohort students | "Recording's up" | P3 | ✅ |

### Enquiries (Slice 8)

| Event key | Kind | Trigger | Recipient | Purpose | Pri | Anchor |
|---|---|---|---|---|---|---|
| `enquiry.received` | ⚡ | A student/lead submits an enquiry on a programme | tutor | "New enquiry from X" + link to the queue | P1 | ✅ |
| `enquiry.replied` | ⚡ | Tutor replies to an enquiry | lead/student | The tutor's reply (or "you have a reply") | P1 | ✅ |

### Account / onboarding (OUR layer)

| Event key | Kind | Trigger | Recipient | Purpose | Pri | Anchor |
|---|---|---|---|---|---|---|
| `account.welcome` | ⚡ | First successful account setup at `/welcome` | student | Welcome + orientation (distinct from the Supabase invite) | P2 | ✅ |
| `tutor.invited` | ⚡ | Admin vets + invites a tutor to the platform | tutor | "You've been approved as a MyNclex tutor" + setup | P2 | ⬜ |

### Engagement / nudges (P3 — design later)

⚠ **These are NOT transactional, despite sharing this table.** Nobody is
expecting "pick up where you left off" — we decided to send it. Transactional
mail must not be opt-out-able (you cannot unsubscribe from your own receipt);
nudges **must** be, and in most jurisdictions that is a legal line, not a
courtesy. Same plumbing and same registry, but a separate **tier** carrying an
unsubscribe link and a stored preference. Build last — but the outbox needs an
"is this opt-out-able?" flag from the start rather than bolted on later.

| Event key | Kind | Trigger | Recipient | Purpose | Pri | Anchor |
|---|---|---|---|---|---|---|
| `progress.inactivity_nudge` | ⏰ | No activity in N days | student | "Pick up where you left off" | P3 | ⬜ |
| `progress.milestone` | ⚡ | Student completes a unit / the programme | student | Encouragement / certificate hook | P3 | ⬜ |
| `curriculum.content_released` | ⏰ | New activity becomes available (release date passes) | cohort students | "New content unlocked this week" | P3 | ⬜ |

---

## First build — the chosen pair (settled 2026-08-10)

**One instant, one scheduled. Sam's call:** *"lets pick one instance that
needs an instant email and one instance that needs a scheduled — when we do
those two the others then fall in place nicely."*

| | Event | Why this one |
|---|---|---|
| ⚡ instant | **`payment.received`** | The loudest silence in the product — someone pays and hears nothing. Two anchors (Paystack success + tutor "mark paid") and **Paystack retries its webhooks**, so the fingerprint has to be real on day one rather than retrofitted. Carries real money data, so it exercises `formatMinor()` and the `GHS` voice. |
| ⏰ scheduled | **`payment.installment_due`** | P1, and the **clock already exists** (the 02:00 nightly sweep) and already computes the due date — which the reminder must *share*, not re-derive. It is a **series**, so it forces the per-stage "already sent" ledger to be designed properly in slice 1. One recipient per row, so it isolates scheduling from fan-out. |

**Why this pair:** same student, same money, opposite triggers — the clock says
*you owe* → they pay → the event says *received*. One coherent thread, one set
of tone and template decisions, and the whole loop is watchable on dev.

Then the rest genuinely do fall out: `payment.tutor_received` is the same
anchor with a different recipient · `payment.installment_overdue` is the same
cron with a different window and the same ledger · `payment.failed` /
`refunded` / `grace_set` are the same anchor family · `session.reminder` is the
same ledger **plus fan-out** · `enrolment.*` and `enquiry.*` are plain event
sends.

⚠ **What the pair deliberately does NOT prove:** fan-out (stays unproven until
sessions) · the **invite swap** (`inviteUserByEmail` → `generateLink`, below) —
the one change that can leave an invited student with *nothing*, so it does not
belong in the slice still finding bugs in the pipe · opt-out preferences,
since neither of these is opt-out-able.

### Folders this arc needs (agreed 2026-08-10, none created yet)

**New folders — two certain, one likely:**

| Folder | Holds |
|---|---|
| `lib/email/` | the logic — the enqueue helper, the sender, the blank-filling, and the read the admin page uses. Sits alongside `lib/payments/`, `lib/auth/`. |
| `lib/email/templates/` | the wording — one file per email, plus the shared footer and the outer wrapper so every email reads as one family. |
| `app/(app)/admin/emails/` | the "what's stuck" page. Joins the 18 route folders admin already has. |

**Deliberately unnamed:** the retry sweep may need a URL an outside caller can
hit to say "send anything waiting." That is one small folder, but its name
depends on **how the sweep is triggered**, which is undecided. ⓘ This repo has
no `app/api/` — route handlers sit at the top level (`app/logout/route.ts`,
`app/auth/callback/route.ts`).

**Not folders — files in places that already exist:** the migration →
`db/migrations/` · the page's CSS → `styles/` · the alarm, if it becomes a
scheduled check → `.github/workflows/`.

⚠ **`docs/email/` already exists and is NOT this.** It holds a **copy** of the
four Supabase auth templates — the ones pasted into a dashboard, kept in the
repo so they can be reviewed and diffed. Ours are live code and belong in
`lib/`. Two folders with "email" in the name is a trap for a future session:
**dashboard copy → `docs/email/` · app templates → `lib/email/templates/`.**

**Templates folder stays flat**, named by event (`payment-received.ts`,
`payment-installment-due.ts`, `footer.ts`). Names beginning `payment-` cluster
on their own, so subfolders would be structure for its own sake —
`lib/toast/` is deliberately flat for the same reason. Group later if 24 files
starts to hurt.

### ⏭ Still to settle before any code

1. **The outbox row itself** — the remaining columns beyond the fingerprint
   and the snapshot payload (status, attempts, last error, not-before).
2. **The catch-up policy** for a missed cron run: send late, or skip? A
   `T-3` reminder that runs a day late is arguably a `T-2` reminder, and
   arguably nothing at all.
3. **The alarm's own channel** — see *Monitoring*; the alert cannot be an
   email if the thing being watched is the mailer.
4. **Reading the pay-first branch** before the `enrolment.confirmed` fold is
   built (see the note under *Enrolment & access*).

---

## Supabase-managed identity emails (NOT this layer — for reference)

Configured in Supabase Auth, not sent via Resend. **Branding pass done
2026-08-06** — copy lives in [`../email/auth-templates.md`](../email/auth-templates.md);
the delivery plumbing (custom SMTP, DKIM, DMARC) is in `domain-and-identity.md`.

- **Password reset / recovery** — "forgot password" flow. ✅ Branded.
  (The flow itself is build-order item 2 and isn't built yet; the
  template was written ahead of it deliberately.)
- **Email confirmation** — on sign-up. ✅ Branded, but **the setting is
  OFF** — see the launch-gate list in `domain-and-identity.md`.
- **Magic link** — deliberately unbranded; build-order item 3 rewrites it
  as a code-only email in code.
- **Reauthentication** / **Change email** — unbranded, unused. Nothing
  calls `updateUser({ email })` today.

### ⚠ Invite is being moved OUT of this section

Corrected 2026-08-06. This section used to list **Invite** as "the
pre-`/welcome` step", while the Enrolment catalog above independently
listed `enrolment.confirmed` and `enrolment.tutor_added` doing the same
job with real context. **Both were true at once, and nobody had put them
side by side** — as written, an invited student would receive two emails:
a thin Supabase invite carrying the password link, and our rich email
carrying the reason.

It should be one email, and the rich one wins. **Sam's reasoning
(2026-08-06):** an invite is never just an invite — it always arrives
attached to a programme or to bank access, so an email that only says
*you have an account* leaves the reader asking *for what?*. The context
IS the email; the password link is a detail inside it.

**How** — the two invite call sites
([`lib/enrolments/actions.ts`](../../lib/enrolments/actions.ts),
[`lib/payments/activate.ts`](../../lib/payments/activate.ts)) currently use
`admin.auth.admin.inviteUserByEmail`, which sends Supabase's generic body
as a side effect. Swap to `admin.auth.admin.generateLink({ type: 'invite' })`,
which mints the **same** set-password link and sends nothing — then our
worker sends one branded email carrying both.

⚠ **Do not delete or disable the Supabase invite template before that
lands.** Until this arc is built it is the only email an invited student
receives; removing it early makes tutor-add and pay-first silently send
nothing. It stays deliberately unbranded in the meantime — and since the
SMTP switch it already sends **from** Quademia, so it reads unstyled
rather than untrustworthy.

---

## Open questions — three of five closed 2026-08-10

**✅ Closed:**

- ~~**Outbox table** vs direct send from the action.~~ **Outbox** (Sam). Gamma
  is the evidence: its sends are fire-and-forget from a browser tab, with a
  `catch` that only writes to the console, and **no record anywhere that any
  email was ever sent**. If a student says "I never got my receipt", gamma
  cannot answer whether it was sent, bounced, or never attempted. Sam's
  addition: record the **instant** ones too, not just the scheduled.
- ~~Which sends need the **scheduled-job runner we don't have yet**.~~ We do
  have one — **pg_cron**, already running three jobs. A cron job *enqueues*;
  it never sends. The 7 ⏰ rows are the list.
- ~~Per-event **opt-out / preferences**?~~ Settled in principle: transactional
  never, nudges always — see the ⚠ note on the Engagement table. The outbox
  carries the flag from the start; the preference UI is built with the nudges.

**Still open:**

- **Digest vs per-event** for tutor-facing volume (`payment.tutor_received`,
  `enquiry.received`). Not *whether* — only cadence.
- **Templating + localisation** (GH/UK/CA audiences). ⓘ Gamma's approach is
  worth borrowing in shape but not in code: HTML files with `{{placeholder}}`
  substitution plus one shared `footer.html`, readable and editable by Sam. Two
  things to fix in the copy — **escape the substitutions** (gamma injects
  `{{name}}` into HTML raw) and keep the templates **in the repo**, per the
  standing rule already set for the auth templates: *repo is the source, the
  dashboard is a copy*.
- **Volume ceiling.** Resend's free plan is **100/day**, and the auth-email
  rate limit was set to 100/hr to match. Fan-out to a whole cohort can spend
  that in one send. The Pro upgrade (~$20/mo, 50k/month) is already an accepted
  trigger "before real signup volume" — a cohort-wide `session.*` may reach it
  first.
