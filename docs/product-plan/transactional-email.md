# Transactional Email — Trigger Registry

*Status: **the spine is built, the drain runs, the ⏰ half has opened, and
Supabase no longer writes any email of ours.**
**15 of 29 emails wired; all 15 on prod.**
⭐ **29, not 23 — the TUTOR family joined the catalog on 2026-08-21**
with the tutor-onboarding arc; see *Tutor lifecycle* below. ⓘ It was
listed as 6, then 7: `tutor.reinstated` was added while 1d was being
built, when Sam noticed the catalog had an email for taking someone's
standing away and none for giving it back. ⓘ **And the total dropped
from 30 to 29 on 2026-08-22**, when slice 3 retired the planned
`tutor.invited` — the invite turned out to be a *dial* on
`tutor.added_by_admin`, not an email of its own.
**All seven tutor emails are built and on `prod`** — three
(`added_by_admin`, `suspended`, `reinstated`) with slice 1, the four
application emails with slice 2 (`de88294`). ⓘ Seven keys but **eight
emails**: `added_by_admin` renders two, one per door.
ⓘ The 23 it grew from was itself 23 and not 24, because `session.scheduled`
was dropped on 2026-08-20 rather than built. ✅ **On prod** (2026-08-18, PR
#53 — proven by a real test-mode purchase whose receipt sent in 218 ms
through prod's own key): `payment.received`, `enrolment.tutor_added`,
`waitlist.converted`, `payment.installment_due`,
`payment.installment_overdue` — the last two **the first time-driven emails
the product has ever sent**. 🔨 **On `main`, not yet released**: from
2026-08-19, `payment.tutor_received`, `enrolment.approved`,
`enrolment.rejected`, plus the **pay-first invite swap**, which is not a new
email but changes a shipped one — `payment.received` now carries the setup
link, so a guest purchase sends **one** email where it sent two; and from
2026-08-20, **`session.reminder`**, the product's **first fan-out and first
attachment**, on its own nightly cron. A pg_cron job knocks on the drain
every five minutes. This
doc is the single source of truth for **every point in the app that should
send an email**, and for **how a send works**. See [main.md](main.md) and
[payments-and-enrolment.md](payments-and-enrolment.md).*

> ⚠ **The status line above went stale for a week and this doc warns about
> exactly that trap two screens down.** It read *"on the session branch, not on
> `main`"* until 2026-08-18, having been true only on the day it was written.
> A dated claim needs a date on it or a reader will take it as current — the
> same failure as the session-log entries that say "not on prod". If you are
> reading this line, check `git log origin/main` rather than trusting it.

Last updated: 2026-08-18, later session (**RELEASED TO PROD** — PR #53, four migrations; the three hand-set values in place, the doorbell answering 200, and the first prod email sent in 218 ms by a real test-mode purchase. Same day, earlier: **the drain built** — see *The drain* below: pg_cron
knocks on a private app URL every five minutes; chosen over GitHub Actions
because the retry delays demand minutes and Actions bills whole minutes;
⚠ **the retry policy agreed on 08-11 was designed and never running**, and
this repairs it; the listener considered and parked; a quota/attempts gap
found in the existing sender).

Previously: 2026-08-11 (**slice 1a built** — inline send via `waitUntil`; the
reason decides the retry, not a count; a short automatic window then a human;
three framings, because the pay-first branch grants nothing at payment time;
`noreply@` + Reply-To; dev sends for real except `@example.com`; the catalog
is a **capture list, not a build plan**; rolling windows for every ⏰ email.
Three defects found by reading rendered output rather than by tsc or lint).

Previously: 2026-08-10 (design session, no code — the two classes; outbox +
no email Worker; the fingerprint; the receipt is per **checkout**;
`enrolment.confirmed` folded into `payment.received`; first pair chosen;
templates as `.ts` files carrying a frozen snapshot; monitoring = a "stuck"
admin page **plus** an out-of-band alert).

---

## Why this exists

Email should have been wired from the start; it wasn't. Rather than retrofit it
feature-by-feature, we will build it **once, as a focused arc, after the core
app is in good shape**. Until then the rule is: **whenever we build something
that ought to send an email, we (1) add a row to the catalog below and (2) drop
a greppable marker at the exact code location.**

> ### ⚠ The catalog is a CAPTURE LIST, not a build plan (Sam, 2026-08-11)
>
> This section used to end *"this registry IS the build checklist and the
> markers ARE the wiring points."* Both halves of that were too strong, and
> Sam's correction is the more useful frame:
>
> **Some catalogued emails will never be built, and emails will be built that
> were never catalogued.** So the catalog records what we noticed we might
> owe someone — it does not commit us to 24 emails, and it does not bound us
> to those 24.
>
> Two consequences that shaped slice 1a:
>
> - **Per-email decisions stay per-email.** Whether a late reminder should
>   still go out is an editorial judgement about *that* email; deciding it
>   globally, in advance, for emails that may never exist is designing around
>   guesses. The machinery only has to be *able* to express either answer.
> - **`EmailEventKey` in `lib/email/types.ts` lists only what is WIRED**, and
>   grows one entry at a time. Seeding it from the catalog would put keys in
>   the code for emails nobody built — which is exactly how gamma ended up
>   with `{{expiryDate}}` placeholders no template ever used.

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
stay that way. ✅ CLAUDE.md's "Stack (Target)" was corrected the same day
(2026-08-10) and now reads *"sent from the app itself"*.

> ⚠ **A note about another file's state is only true on the day it is
> written.** This paragraph carried "CLAUDE.md still needs a one-line
> correction" for a day after CLAUDE.md had already been corrected, and on
> 2026-08-11 Claude repeated it as fact four or five times in one session
> without opening the file. Same trap as the session-log entries that say
> "not on prod" — the claim is dated, the reader is not. If you find
> yourself citing this doc about the *contents of another file*, go and
> look.

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
**programme money only**, since bank and readiness are ours. ⚠ Its total is
therefore **not** the receipt's total for the same checkout, and the two
disagreeing is correct.

> ### ⚠⚠ "Enrolled in" was a FALSE STATEMENT for a paused student
>
> Found 2026-08-19, on prod since the receipt shipped. The `PROGRAMME_*` rows
> above branch on `PENDING_APPROVAL` and then fall through to
> `Enrolled in <place>` for **every other status** — including `PAUSED`. So a
> student behind on her plan, who paid, was told she was enrolled while she
> was locked out. Not an omission: a false statement, to the one person who
> had just handed over money and would find the door shut.
>
> ⭐ **The behaviour underneath is right and unchanged** (Sam): the access gate
> asks *"are you current?"*, not *"did you just pay"*, so **one instalment
> against two missed leaves the door shut**. Only the wording was wrong.
>
> ⭐ **It needs ONE day of pause, not the seventy-four the test row had.** Sam's
> read — *"this probably occurred because we use test data"* — is right about
> the extremity and not about the state: the three paused dev enrolments were
> paused by the **live nightly sweep** (02:00 on 25 Jun, 22 Jul, 28 Jul), the
> same code prod runs every night, and paying what you can afford is the most
> ordinary thing an overdue student does.
>
> Now: `PAUSED` + `INSTALLMENT_OVERDUE` → *"Access to X is paused until the
> plan is up to date"*; `PAUSED` for any other reason → *"Your place in X is
> currently paused — your tutor can tell you more"*. ⚠ **Branch on
> `paused_reason`, not on `PAUSED` alone** — a `TUTOR_MANUAL` pause has nothing
> to do with arrears, and explaining it as money sends her to fix a bill that
> is not the problem.
>
> ⚠ **Tense, both sides.** *"next due 6 June"* printed in August is the wrong
> word for a date that has gone. Sam's phrasing, no jargon needed: **"the next
> payment was due 6 June 2026."** The tutor's copy also gains *"Her access is
> still paused — this payment did not clear the arrears"*, which is the line
> that changes what a tutor does: **"money's in" alone reads as "she's fine"**
> to the only person who can grant her grace.
>
> ⭐ **Both facts are computed at ENQUEUE and frozen**, never asked at render.
> The template renders from the payload alone and may run on a retry hours
> later, so *"is this date past?"* there would answer against a different
> `now` than the payment did — one email making two claims about one moment.

> ### ⚠ No subject may bolt a clause onto a name somebody typed
>
> Three instances, one session (2026-08-19), the third already on prod.
> `enrolment.tutor_added` rendered *"You have been enrolled — NCLEX-RN Live —
> The 8-Week Pass Plan"*. ⚠⚠ **Its guard comment already claimed to have
> solved this** — *"ONE em-dash, and the programme name last"* — but it counted
> only the dashes **we** write, while the title supplies its own. A guard aimed
> at the wrong thing reads as a solved problem, which is why it survived and
> why the same trap was then sprung twice more the same day.
>
> ⭐ **The rule: a subject interpolating a name somebody typed must READ AS ONE
> SENTENCE AROUND IT.** Not "one separator" — the title is arbitrary text with
> arbitrary punctuation, so the only safe count of *our* separators is **zero**.
> A colon was tried and reverted in the same sitting: still ours.
>
> ```
> You have been enrolled in <title>     A place has opened up in <title>
> Your place in <title> is confirmed    About your place in <title>
> <student> paid <amount> for <title>
> ```

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
body (social links in one place).

### ⚠ Built without `{{placeholder}}` substitution (2026-08-11)

The section above assumes gamma's mechanism — a template string with
`{{name}}` holes, filled at send time. **Slice 1a did not use it**, and the
reason is that the doc's own requirement rules it out.

This doc asks each template to declare *"the list of values it requires, so
rendering one without a value it needs is caught"*. With `.ts` files and a
typed payload, **the type IS that list**, and it is checked when the code is
built rather than discovered in somebody's inbox. Placeholders would give us
gamma's problem back: a typo'd `{{teachr}}` ships as literal text.

So a template is a function of a typed payload, and interpolation is
ordinary. Points 1–4 above still all apply and are all addressed —
`esc()` in `templates/wrapper.ts` escapes every non-literal value, a missing
value is a build error rather than a blank, there is no shared filler, and
`render.ts` produces a plain-text twin of every message.

⚠ The trade named above is unchanged and still real: Sam writes the copy, and
a `.ts` file is more intimidating to open than an `.html` one. `/admin/emails/preview`
exists partly to soften that — every variant is visible without reading code.

### Who writes the words

**Sam does.** Claude builds the skeleton with placeholder wording; Sam
rewrites it — the same way all seven scoring rules were reworded before they
shipped.

## The sending identity — AGREED 2026-08-12, NOT YET DONE

⚠ **A decision, not a state.** Everything still sends from
`noreply@quademia.com`. This section is what to change and why; nothing below
is live.

Prompted by two advisories Resend raises on the dashboard: **don't send from
the root domain**, and **don't send from `noreply@`**.

| | Today | Agreed |
|---|---|---|
| Domain | `quademia.com` (root) | **`mail.quademia.com`** |
| From | `MyNclex <noreply@quademia.com>` | **`MyNclex <hello@mail.quademia.com>`** |
| Reply-To | `support@quademia.com` | unchanged |
| Supabase auth SMTP | root | move to the same subdomain |

### Why a subdomain

Mailbox providers score reputation **per domain**. The root is where
`support@quademia.com` lives — the address that actually has to reach a stuck
student. Automated mail damaging the root would push our human replies into
spam, and the likeliest cause is already scheduled: the ⏰ emails go to the
**stalest addresses in the product**, where a bounce spike is most probable.

⭐ **And now is the cheapest it will ever be.** Reputation is earned by volume
over time; we have almost none. Moving after ten thousand receipts means
abandoning standing we had built.

### ⭐⭐ ONE subdomain for every product — split by RISK, not by product

An earlier version of this recommended a subdomain per product
(`mail.nclex.quademia.com`). **Sam pushed back and was right.** Two reasons,
both decisive:

- **All three apps send the same KIND of mail** — receipts, reminders,
  enrolment notices. Transactional, expected, low-complaint. Separating by
  product splits the *reputation* without splitting the *risk*, which is the
  worst of both.
- **Volume pools.** At hundreds-to-low-thousands, three subdomains means three
  weak reputations warming independently, each below the threshold where
  providers form a confident opinion. Pooled, the same volume builds one
  domain that is genuinely trusted. Isolation only starts paying when each
  stream can stand on its own volume, which is far off.

Plus the operational point: one set of DNS records, one warmup, one DMARC
report — which matters for a solo operator.

**The product goes in the DISPLAY NAME, not the domain** (`MyNclex <hello@…>`),
so the recipient sees the product while every app builds one reputation.

⭐ **Where the split genuinely belongs, later:** the **engagement nudges** (P3)
have a different risk profile — unsolicited, opt-out-able, complaint-prone.
That is the moment to split, onto something like `news.quademia.com`, so a
nudge campaign that annoys people cannot take the receipts down with it.
Split by risk, when the risk actually differs.

### Why not `noreply@`

Three costs, only one about reputation: replies are a positive **engagement
signal** we forfeit · replies into a black hole are a product failure · and
someone with no way to reply hits **"report spam"** instead, which is the
fastest way to wreck a domain.

⚠ **We are currently in the worst of the three positions.** The 08-11 fix added
a Reply-To header, so replies *do* reach `support@`. But the visible address
still says *noreply*, discouraging the very replies the plumbing now handles —
paying the trust cost and collecting none of the benefit.

ⓘ `team@` works equally. Avoid `notifications@`, which reads as cold as
`noreply@`.

### ⚠ What has to change, and where — BOTH the address and the keys

⭐ **The new keys are part of the switch, not a follow-up.** A full-access key
is a **new key string**, so `RESEND_API_KEY` changes everywhere at the same
time as `EMAIL_FROM`. Doing one without the other is how you get a switch that
half-works.

| What | Where | Kind |
|---|---|---|
| `EMAIL_FROM` | `.env.local` · `wrangler.jsonc` vars (dev **and** `env.prod`) | var |
| `RESEND_API_KEY` | `.env.local` · `wrangler secret put` on **both** Workers | secret |
| SMTP sender address | Supabase Auth settings, **both projects** (dashboard, not the repo) | — |

⚠ **`.env.local` is the main checkout's copy.** Worktrees copy parent→child
only, so a key written inside a worktree dies with it — exactly how localhost
auth sat broken for a day in August.

⚠ **`RESEND_API_KEY` is a SECRET, not a var** — it never goes in
`wrangler.jsonc`, and the deploy workflows do not inject runtime secrets, so it
must be set per-Worker with `wrangler secret put`. Both Workers, because dev
sends for real too.

⚠ **A Resend key can be scoped to a specific domain.** If the current keys are
scoped to `quademia.com`, they will **refuse** the new subdomain — the first
send from `mail.quademia.com` fails for a reason that looks nothing like a
domain problem. Check the scope when creating the replacements, or scope them
to the new domain deliberately.

ⓘ Same shape as the Turnstile trap in `CLAUDE.md`: several places, one truth,
and a mismatch is an outage at the front door. Change them together, then send
one test **per environment** before assuming it worked.

⚠ **And one copy inversion.** `lib/email/templates/footer.ts` carries an
explicit comment forbidding *"Reply to this email"* **because** we send from
`noreply@`. Once the From is repliable that reasoning inverts, and the footer
should simply say reply — the friendliest support channel there is, and the one
that produces the engagement signal above.

### ⚠ Two things this does NOT do

- **Keys do not separate reputation.** The 08-11 decision — one domain, dev and
  prod told apart by keys — separates *attribution inside Resend* and the blast
  radius of a leaked key. Providers score the **domain**, so a bad run on dev
  lands on the reputation prod depends on.
- **⚠ 1b invalidates the assumption that made that acceptable.** A nightly
  sweep that scans and mails whoever is due turns dev from a handful of manual
  sends into **automated volume against real addresses**, aimed at the stalest
  data we hold. Keep one domain for now — dev volume is small and
  `@example.com` is suppressed — but **revisit a `dev.` child when 1b's sweep is
  about to be switched on**, not before.

### ⭐ The full-access key is part of this change

Not an optional extra in the same visit — **the switch is the moment to mint
the replacements**, because new keys are needed anyway (see the table above)
and there is no reason to mint send-only ones twice.

Today's key is send-only, so `fetchDeliveryStatus` cannot read `last_event` and
**a bounce is invisible forever** — and there is no Resend error for a bad
recipient, so nothing else will ever tell us. A brand-new sending domain has no
standing, which makes its first weeks precisely when bounces matter most and
precisely when we currently cannot see them.

ⓘ **Check whether gamma sends from its own domain.** If it does it is isolated
by accident and needs nothing. If it is on `quademia.com`, fold it in *after*
its email worker is dealt with — its `EMAIL_SECRET` ships to every browser, so
anyone can send through it, and that is not history to attach to a domain the
receipts depend on.

---

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

#### ⭐ But the two halves are complementary, not rivals (settled 2026-08-11)

Sam asked the sharp version of this: *could we skip the outbox table entirely
and build the admin page from Resend's data?* Their read API is better than
assumed — a list endpoint, a per-email retrieve, `last_event`, and the body
retained — so it deserved a real answer rather than a reflex. Four things
rule it out, each fatal alone:

1. **It only knows what it ACCEPTED.** A rejected call, a wrong key, a job
   that never ran — none create a record there. The list just comes back
   shorter.
2. **Duplicate protection must happen BEFORE the network call.** Two Paystack
   retries in the same second are refused by our unique index; asking Resend
   "did I send this already?" is check-then-act across a network.
3. **"Who have I already warned?" has to run at scan speed.** One indexed
   query here versus an HTTP call per student there.
4. **A failed send left nothing at Resend to retry FROM** — no payload, no
   recipient, no snapshot.

**The division: our table owns INTENT and ATTEMPT; Resend owns OUTCOME**, and
`provider_message_id` is the join. That is what let the bounce webhook be
deferred — the page *pulls* `last_event` per row instead of being *pushed* it,
with no public endpoint and no signature verification to build.

⚠ **The pull needs a full-access Resend key.** A send-only key sends
perfectly and returns `restricted_api_key` on every read, which on 2026-08-11
made every row read "Handed over" for ever with no hint why. `fetchDeliveryStatus`
now reports *why* it came back empty and the page says so above the table —
a monitoring column that quietly stops answering is the very failure this
layer exists to catch, reproduced inside the monitor. Sam widened the key.
ⓘ When the bounce webhook is eventually built, Resend pushes and needs no
read permission, so the keys should go back to send-only then.

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

> ⚠ **It did not reconcile, and never had (checked 2026-08-10).** There was
> exactly **one** `EMAIL-TRIGGER` marker in the whole codebase —
> [`app/(public)/checkout/callback/page.tsx`](../../app/(public)/checkout/callback/page.tsx)
> — and its key, `payment.setup_link_resend`, **was not in the catalog at
> all**. Half of the convention was never practised.
>
> The consequence for the build: *"the markers ARE the wiring points"* is a
> promise this repo could not keep. Each slice must **find** its call sites by
> reading the code, using the `Anchor` column below as the guide (that column
> does appear accurate). Drop the marker as you wire each one, so the second
> half of the arc gets the benefit the first half didn't.
>
> ✅ **Started, 2026-08-11.** Slice 1a added three real markers, all
> `payment.received`, all catalogued — two in `lib/payments/activate.ts`
> (the pay-first branch and the granted branch) and one in
> `lib/enrolments/actions.ts` (tutor mark-paid). Five of the six markers now
> in the repo reconcile. The odd one out is still
> `payment.setup_link_resend`, which remains uncatalogued because it marks an
> email we have chosen not to build — the receipt covers that reader instead.

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
| `enrolment.tutor_added` | ⚡ | Tutor manually adds a student (cohort add / self-paced add) | student | **✅ BUILT 2026-08-12.** "Your tutor enrolled you" — what she was given, who gave it, and the way in. Carries the **invite swap**: for a new account we mint the link ourselves and Supabase sends nothing | P1 | ✅ |
| `waitlist.joined` | ⚡ | Student/lead joins a cohort waitlist | lead | Acknowledge waitlist position | P2 | ✅ |
| `waitlist.converted` | ⚡ | Tutor converts a waitlisted lead to enrolled | student | **✅ BUILT 2026-08-12.** "A place has opened up." Its **own key, sharing `enrolment.tutor_added`'s template** — one dial turned. See below | P2 | ✅ |
| `enrolment.approved` | ⚡ | Tutor approves a place a student PAID for | student | **✅ BUILT 2026-08-19.** "Your place is confirmed" — programme, cohort, start date, access window, button into the cohort. **Carries no money at all** (see below) | P1 | ✅ |
| `enrolment.rejected` | ⚡ | Tutor refuses a place a student PAID for | student | **✅ BUILT 2026-08-19.** "About your place in X" — the tutor's own email and phone, so she can reach a person. **Promises nothing about a refund**, because nothing refunds her | P1 | ✅ |
| `enrolment.access_expiring` | ⏰ | Access window is N days from expiry | student | Renew / heads-up before losing access | P2 | ⬜ ⚠ blocked |
| `enrolment.access_expired` | ⏰ | Access window passes | student | Access ended, how to renew | P2 | ⬜ ⚠ blocked |

> ### ⚠⚠ The 08-10 fold left the human half uncovered — and we PROMISED it
>
> Read the `enrolment.confirmed` note below first; this is its correction,
> found 2026-08-19.
>
> Folding `enrolment.confirmed` into `payment.received` was right **on the
> ACTIVATED path**, where the money and the place land in one instant for one
> person. It does not hold on **`PENDING_APPROVAL`**, where the place is
> confirmed **later, by a human**. That second moment is a different trigger,
> a different sender and a different day — and it left the catalog with the
> row that was deleted.
>
> ⭐ **Meanwhile the receipt had already promised it.** Its `PENDING_APPROVAL`
> variant has told buyers, on prod since 2026-08-18: *"You will get another
> email as soon as your tutor approves your place."* Nothing ever sent one.
> Five dev enrolments were sitting in that state having been told so — one of
> them from a test run an hour before this was found.
>
> ⚠ **The generalisable lesson: when an email's copy promises another email,
> that promise is a catalog entry.** Nothing checked it, and nothing checks it
> now — worth a pass over every template asking *"what does this sentence
> commit us to sending?"* before the catalog is next declared complete.
>
> ⓘ A tutor-added enrolment is created `ENROLLED` and never passes through
> `PENDING_APPROVAL`, so these two only ever reach the audience the receipt
> made the promise to.

> ### ⚠ The refusal cannot promise money back — nothing gives it back
>
> `nclex_reject_enrolment` sets `status`, `terminal_at` and `tutor_note`.
> **That is all.** Her payment row stays `ACTIVATED`, `payment.refunded` is
> unbuilt, and no process exists. So the email says nothing about a refund —
> settled with Sam 2026-08-19 — and points her at the tutor for the
> conversation instead, with support in the footer as the second route.
>
> ⭐⭐ **It carries the tutor's real email and phone, and that replaced a
> safer-looking idea.** The first build linked the programme page's
> *Contact the tutor* form: private, and landing in a queue the tutor already
> reads. But `nclex_submit_enquiry` is **idempotent on (programme, email)** —
> where an open lead exists it returns that lead and **never inserts the new
> message**, while still showing her a success tick. A refused student is
> *more* likely than average to have enquired before buying, so the one
> message that most needed to arrive was the one most likely to vanish,
> invisibly to both sides. Sam's call: *"we have to ensure communication is
> easy."* A `mailto:` cannot fail quietly.
>
> ⚠ **That swallow is a live defect for every repeat enquirer**, not just
> rejected students — anyone messaging a tutor twice while the first lead is
> open. Shipped public path; wants its own slice.
>
> ⚠ **`phone_number` is empty for every tutor** (checked 2026-08-19) and no
> screen collects it — `tutor/profile` calls contact fields "separate future
> work". The row is built conditional and renders for nobody today. **Capturing
> a tutor phone is the open follow-on**, and it matters more than it looks: the
> core audience reaches for WhatsApp before email.
>
> ⚠ **The tutor's rejection note is NOT sent.** The RPC stores `p_note` in
> `tutor_note` and nothing in the app has ever displayed it, so no tutor has
> been given any reason to think a student reads it. A tutor who typed
> *"didn't pay last time, avoid"* into what reads as an internal box must not
> have it mailed to the person it is about. **To include it, relabel that box
> in the roster first.**

> ### ⭐ Why approved/rejected are TWO templates, not one with a dial
>
> `enrolment.tutor_added` and `waitlist.converted` share one file because they
> are the same event with a different backstory — one dial turned. These are
> **opposite outcomes**: different words, different destination, different
> footer context. Sharing would mean branching on everything. They do share
> one *reader* (`lib/enrolments/verdict-email.ts`), because the five facts
> they need are identical and always change together.
>
> ⓘ **The approval deliberately carries no money.** She has the receipt for
> the amount and the plan, and `payment.installment_due` handles what is owed
> next. A third voice on one plan is how three emails start disagreeing.

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
| `payment.received` | ⚡ | A **checkout** is paid — Paystack success OR tutor "mark paid" | student | **✅ BUILT 2026-08-11.** Receipt: amount, method, reference + one "what you now have" line per purpose in the checkout (incl. *you're enrolled*, folded in above), in three framings. Fingerprint = `checkout_group_id` | P1 | ✅ |
| `payment.failed` | ⚡ | Paystack reports a failed/declined charge | student | Payment didn't go through, retry link | P1 | ✅ |
| `payment.installment_due` | ⏰ | An installment is approaching its due date | student | **✅ BUILT 2026-08-18.** TWO reminders — `<n>:T-7` and `<n>:T-3` — enqueued by the nightly sweep. Names the tutor; the consequence line only appears on gated programmes | P1 | ✅ |
| `payment.installment_overdue` | ⏰ | An installment passes its due date unpaid | student | **✅ BUILT 2026-08-18.** Sent the night the sweep acts, captured BEFORE the pause. Past tense — the pause has already happened. `paused` switches it between "access is paused" and "access is unaffected" | P1 | ✅ |
| `payment.grace_set` | ⚡ | Tutor grants a first-payment / installment grace | student | "Your tutor extended your due date to X" | P2 | ✅ |
| `payment.refunded` | ⚡ | A payment is refunded | student | Refund confirmation | P2 | ✅ |
| `payment.tutor_received` | ⚡ | A student payment lands — **unless the tutor recorded it themselves** | tutor | **✅ BUILT 2026-08-19.** "Ama paid GHS X for Cohort Y" — payer, amount, plan position, cohort, where the plan stands. **Programme money only** (bank/readiness is ours). **Per-event**, settled | P1 | ✅ |

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
>
> #### ⭐ Stages are ROLLING WINDOWS, never calendar dates (settled 2026-08-11)
>
> This is the general rule for all **seven** ⏰ emails, not just this one, and
> getting it wrong reintroduces the exact failure above.
>
> The obvious definition of the last warning is *"due today"*. It is broken,
> because the sweep only looks **once a day, at 02:00**. Take a payment due at
> 01:00 on Friday:
>
> | Run | What it sees | What it does |
> |---|---|---|
> | Thursday 02:00 | due Friday — not "today" | nothing |
> | Friday 02:00 | overdue by an hour | **pauses her** |
>
> She is locked out having heard nothing, and this happens to *everyone* whose
> due time falls in the early hours.
>
> Ask instead **"is it due within the next 24 hours?"** — Thursday's run sees
> 23 hours and warns; Friday's pauses. A full day's notice.
>
> ⭐ **And it is a guarantee, not an improvement.** The job runs every 24
> hours and the window asks about the next 24 hours, so the windows tile end
> to end with no gaps and no overlaps. Every due date falls inside exactly
> one. Nobody slips between two runs; nobody is caught by two. `T-3` is the
> same shape — *"due between 72 and 96 hours away"*, also exactly one run
> wide, so also exactly one send.
>
> ⚠ **The guarantee assumes the runs actually happen.** Miss one night and
> whoever's window fell inside it is never warned, and is paused the next
> night. That is what makes the catch-up question load-bearing rather than
> housekeeping — see *Still to settle*, item 2.
>
> ⓘ **Where the enqueue lives: inside `nclex_enrolment_nightly_sweep()`
> itself, before the pause step** — so the warning and the pause come from
> one expression in one function and structurally cannot drift. That
> migration's header already warns its arithmetic mirrors
> `lib/payments/schedule.ts` and the two must stay in lockstep; a third copy
> is how that eventually goes wrong.
>
> ⓘ **No interlock.** Blocking the pause when the warning did not send was
> considered and rejected: it ties access enforcement to a third-party mail
> provider's uptime, so a bad week at Resend would quietly leave non-payers
> with full access. The guarantee depends on the row being *written* — same
> transaction as the sweep — not on Resend having delivered it.

> **Every payment notifies BOTH sides.** A received payment is a paired send:
> `payment.received` (the student's receipt) **and** `payment.tutor_received`
> (the tutor's "money's in"). Both are P1 — neither side should be left in the
> dark when money moves.
>
> ### ⭐⭐ CORRECTED 2026-08-19 — the recipient must not be the actor
>
> This used to say the trigger was *"Paystack success **OR** tutor 'mark
> paid'"*, both anchors. Read against the code that is wrong twice: a tutor who
> hits **Mark paid**, and a tutor who records *"payments already received"*
> while adding a student, would be emailed a fact they typed in thirty seconds
> ago. **The first noisy transactional email is how people start ignoring the
> rest.**
>
> ⭐ But it is **not** "skip the mark-paid anchor". A **SUPER_ADMIN** may
> record a payment on a tutor's programme, and there it *is* news. So the test
> is **who recorded it**, not which door it came through:
> `recorded_by_user_id === programme.tutor_id` → stay silent. Verified against
> dev: 16 groups send (Paystack, no recorder), 1 sends (an admin recorded it),
> 2 suppress.
>
> ⭐ The rule reads `recorded_by_user_id` **off the payment row** rather than
> taking it as an argument, so it lives in one place and no anchor can get it
> wrong by forgetting to pass it. Paystack leaves the column null, so an online
> payment always sends. All three anchors call in unconditionally.
>
> ⚠ **Consequence, intended:** a tutor on an **OFF_PLATFORM** programme — they
> collect the cash by hand and add the students — receives **none** of these.
> Correct. They are holding the money.
>
> ⓘ **Cadence settled: per-event, not a digest.** A digest needs its own
> scheduled job and a "since last digest" ledger — a slice, not a variation —
> and there is no volume to protect anyone from yet. Layerable later without
> touching the anchor.
>
> ⓘ **Fingerprint is the checkout group with no stage**, safe *only* because
> `lib/payments/init.ts` builds items from one target and refuses any
> non-`ON_PLATFORM` programme, so one charge can never owe two tutors an email.
> ⚠ **If a multi-programme cart is ever built, this fingerprint must gain the
> tutor id as its stage or the second tutor is silently dropped.**
>
> ⚠ **A pay-first purchase sends `SETUP_REQUIRED` and nothing else** — the
> later `ACTIVATED` enqueue is refused by the fingerprint. Told early on
> purpose (activation may be days away, or never), so that wording explains the
> roster gap on its own rather than promising a follow-up.
>
> ⚠ **Three method values, not two.** `CARD` · `ADMIN_RECORDED` ·
> `OFF_PLATFORM`. The third is not padding: six settled dev rows carry
> `collection_channel = 'OFF_PLATFORM'` with **no recorder**, from before that
> column was populated. Captioning those "recorded by a Quademia admin" would
> name a party nobody can evidence, **about money**. They read "Collected
> off-platform" instead.

### Live sessions

⚠ Every row here is a **fan-out** — one trigger, a whole cohort of recipients.
That shape is not exercised by the first pair and needs its own thought
(volume against Resend's daily cap, and whether one row per student or one row
per cohort goes in the outbox).

> ✅ **Both answered on 2026-08-20 by building `session.reminder`.** One row
> **per student**; volume ~1 per student per week. Fan-out is no longer an
> unproven shape — see the build note below.

> ## ⭐⭐ DESIGN SETTLED 2026-08-19 — the schedule follows the student
>
> Not built. Worked out with Sam across four revisions, and the shape moved
> materially each time — the reasoning matters more than the conclusion,
> because three of the four earlier versions looked fine and were not.
>
> ### The rule
>
> **One nightly pass asks one question:** *which sessions fall in the next
> **7 days**, and which students in those cohorts have not been told about
> them yet?* Each match gets one email — *"your class is this Tuesday"* —
> **carrying a calendar attachment (`.ics`)**.
>
> That is the whole mechanism.
>
> ### ⚠ Why NOT "send it when the tutor schedules it" — the version we nearly built
>
> Sam's question killed it: *"a student that joined 2 weeks after the tutor
> finished setting up the cohort session times — will they receive the
> emails?"* **No.** And it is not an edge case, it is the **normal** case: a
> tutor sets up the cohort and its class times **when creating the cohort**,
> before anyone has enrolled. An email anchored to that moment fans out to an
> **empty cohort**. It would have shipped and reached almost nobody.
>
> ⭐ The first repair was *"whichever happens second fires it"* — she needs to
> be in the cohort **and** the session needs a date, so whichever completes the
> pair sends. Correct, but it needs **five** trigger points: the four doors
> into a cohort (paid+activated · paid+approved · tutor-added ·
> waitlist-converted) plus the scheduling action. **Five places to keep in
> step is how a door quietly stops sending** — precisely the failure this
> session found in the approval email, where the reasoning was walked down one
> branch and not the others.
>
> ⭐⭐ **The nightly pass does not ADD to those five. It replaces all of them.**
> It never asks how she got into the cohort, so there is no door to forget.
> That is why the cron version is *simpler* than the event version, not more
> complex — the opposite of the usual trade.
>
> ### It is not new infrastructure
>
> `nclex_enrolment_nightly_sweep()` already runs on pg_cron at 02:00 and
> **already enqueues email** — the instalment reminders come from it. This is
> a few more lines inside a job that already runs and is already watched.
>
> ⚠ Claude twice described the clock as missing during this discussion. It is
> not. Only a **T-1h** reminder would need something genuinely new, and that
> is deliberately dropped: it is the most infrastructure for the least
> behaviour change, and it mostly reaches people who already knew.
>
> ### ⭐ The fingerprint does the bookkeeping, so the window is forgiving
>
> "Has this student been told about this session?" needs no new table —
> **asking the outbox is the answer**, and the unique index refuses the
> duplicate.
>
> ⭐ This makes the sessions job **fundamentally more forgiving than the
> instalment reminders**, and the difference is worth understanding before
> anyone copies one pattern to the other. Those had to tile their windows
> exactly (*"due in the next 24h"*, never *"due today"*) because a missed
> night meant somebody was **never** warned and then paused. Here a wide
> window, an overlapping window or a missed night all self-correct: the next
> run simply picks up whoever has not been told. **Nothing slips.**
>
> Hence **7 days** rather than 3 — a week is long enough to swap a shift or
> arrange childcare, which is the actual point of notice, and the width costs
> nothing.
>
> ### ⭐ Why a calendar attachment, and not just words
>
> She taps it once and **her own phone reminds her**, at whatever notice she
> already uses for everything else, for every future occurrence. That is more
> reliable than anything we can send: it survives a full inbox, and it lives
> where she looks to see what she is doing tonight.
>
> For a recurring cohort (*"Evenings — Tuesdays 19:00"*) one repeating event
> can cover the whole run. ⓘ `.ics` is plain text and Resend accepts
> attachments — genuinely small.
>
> ### The volume, which is the reason any of this is affordable
>
> Roughly **one email per student per week**: a cohort of 25 costs ~25 a week,
> comfortably inside Resend's free **100/day**. ⚠ Compare the version this
> replaced — per-session T-24h **and** T-1h for 25 students is **50 emails per
> class**, half a day's allowance on one class. **Sessions is still what
> forces the Pro decision**, but this shape delays it by an order of
> magnitude.
>
> ### The tutor's button stays
>
> One case the nightly pass cannot reach: a student who joins on the
> **morning** of a class — last night's run has already been. That is what a
> manual **Send reminder** button on the session is for, and it also covers
> what no schedule can: *"we start in 30 minutes, the link has changed."*
>
> ⚠ **Its fingerprint must permit a deliberate second send.** With
> `subject_ref = session_id` and a blank stage, the tutor's second reminder is
> **silently swallowed** — they press send, see success, and nothing goes.
> This exact shape has now bitten twice (the enquiry form; the pay-first
> receipt). Proposal: **stage = the hour bucket of the send**
> (`2026-08-19T14`), so a double-click dedupes and a genuine
> day-before-then-hour-before send is two stages, with no counter to maintain.
>
> ### ⚠ One thing to get right on the first day
>
> The button and the nightly pass must call **the same send**. If the button
> is wired straight to the email, the automatic path is later built twice and
> the two drift. Manual-vs-automatic is a **trigger** decision; it must not
> become an architecture decision. (Same rule the payment anchors follow:
> three callers, one builder.)
>
> ### ✅ BUILT 2026-08-20 — and the four open questions answered
>
> Migration `20260912120000_session_reminders.sql`, on `main`. The design
> above survived contact intact; what follows is what building it decided,
> and the two things it got wrong first.
>
> **The four questions, all settled with Sam before a line was written:**
>
> | Question | Answer |
> |---|---|
> | Row shape | **One per student.** A bad address fails alone, and the outbox answers "who was told" |
> | Rescheduling | **The time goes IN the fingerprint** — `<session_id>@<epoch>` — so a moved class re-sends by itself |
> | `session.scheduled` | **Dropped.** She is told when the class nears; an announcement six weeks out duplicates the Sessions page |
> | Scope | Nightly + `.ics` + the tutor's button, together |
>
> ⭐⭐ **The tutor's button is limited to ONE per class OCCURRENCE** (Sam's
> call, and he was right to ask for it: an open button is a tutor emailing
> twenty-five nurses four times about one lesson). The limit needs no
> counter and no new state — **it IS the fingerprint the nightly pass
> already uses**, so a second press inserts nothing.
>
> ⭐ And it **refills when the class moves**, because the fingerprint carries
> the time. "Once per session id" would have gagged the one person who most
> needs to speak after a reschedule. Ceiling: two emails per student per
> occurrence — the nightly one and one deliberate.
>
> ⚠ **It returns the count, and the UI shows it.** A live control that
> silently does nothing is a bug this repo has now shipped twice —
> `nclex_submit_enquiry` tells a repeat enquirer it worked while dropping
> the message, and the pay-first receipt was refused by the fingerprint with
> nobody told. Pressing a spent button says so; a send that reaches nobody
> new says *that*, rather than nothing.
>
> ### ⚠ ITS OWN CRON JOB — the one place this doc was wrong
>
> The design above says "a few more lines inside a job that already runs".
> That reads well until you notice `nclex_enrolment_nightly_sweep()` is ONE
> TRANSACTION which also **pauses students for arrears**. An exception
> raised while building a calendar attachment would roll those pauses back
> — a bug in a nicety silently disabling the money rule.
>
> ⭐ Sam, on being told: *"its a different job from the enrolment."* The four
> existing pg_cron jobs are already one-per-concern; this is the fifth, at
> **07:00**, and the isolation costs nothing. The claim the doc was really
> making — *this needs no new infrastructure* — still holds: pg_cron was
> already running.
>
> ⭐ **And it runs at 07:00, not overnight with the others** (Sam,
> 2026-08-20). The first draft sat at 02:15, a quarter hour behind the
> enrolment sweep, on the reasoning that the nightly jobs should be done
> before anyone is awake. That is right for the others and wrong for this
> one: they change **state** — pausing an enrolment, expiring a pass — and
> nobody needs to witness the moment. This job's entire output is a
> notification on somebody's phone, and Ghana is GMT, so 02:15 buzzes a
> nurse at two in the morning about a class a week away.
>
> ⓘ The reminder actually leaves around 07:05, on the next drain knock. That
> gap belongs to the queue, not the schedule — which is precisely why the
> hour can be chosen for the reader instead of for the machine. **A job that
> only enqueues is free to run whenever suits the person reading it.**
>
> ### Two defects, both found by reading real output
>
> Neither was caught by tsc, eslint, or a passing render.
>
> - **The subject was 84 characters.** "Your `<programme>` class is on
>   Tuesday 25 August at 19:00 GMT" pushes the time — the only fact she
>   needs — past where a phone truncates. Now **47**, with **nothing
>   interpolated**: which also makes the double-em-dash defect of 2026-08-19
>   structurally impossible here rather than merely avoided. ⓘ The cost,
>   accepted: a student in two programmes cannot tell them apart from the
>   subject line alone.
> - **`platform` is an ENUM.** The email said *"Where: ZOOM"*. ⭐ The reason
>   it survived review is worth keeping: the sample fixture had been written
>   with `'Zoom'` already humanised, **so the fixture hid the exact thing it
>   existed to test**. It now holds the enum, like the database does.
>
> ### What was verified on dev, and how
>
> 3 nightly + 2 manual + 1 rescheduled, all SENT with provider ids and an
> `.ics` Resend accepted. A second sweep adds nothing; a second manual press
> returns 0; the ownership gate refuses a non-owner. **The reschedule proof
> is the one worth repeating**: moving a class produced a new fingerprint,
> a new email, the same `UID` and a **higher `SEQUENCE`** — which is the
> combination that makes a phone calendar *update* rather than show two
> classes. Restoring the original time then correctly added nothing, because
> that fingerprint had already been used.
>
> ⓘ 13 students enrolled, 3 emailed: the other 11 are `@example.com` and
> were skipped by the guard duplicated into the migration.
>
> ⚠ **`session_reminders_enabled` ships OFF in a new environment.** The
> pg_cron knock calls the DEPLOYED Worker, so until the `session.reminder`
> template is live there, a nightly pass would enqueue rows that environment
> can only mark DEAD. Turn it on after the deploy, not before. ⓘ It is on
> `/admin/config` — **a `nclex_config` row alone is invisible**, because that
> page renders `CONFIG_DEFS` and not the table. `email_drain_enabled` was
> missed the same way; this one was too, until Sam asked.
>
> ⭐⭐ **The switch governs the tutor's button as well, and the first version
> did not.** Exempting it looked right — the switch means *stop the
> AUTOMATIC reminders*, and a person pressing a button is not automation.
> That holds for one of the switch's two jobs and fails for the other:
>
> | The switch means | Exempting the button is |
> |---|---|
> | editorial — *stop sending automatic reminders* | fine |
> | operational — *this environment cannot render this yet* | **a lie** |
>
> The operational meaning is not hypothetical: it is how a new environment
> is brought up, and the state dev sat in throughout this build. There, an
> exempt button queues rows the Worker can only mark DEAD **while telling
> the tutor "Reminder sent to 12 students"** — the same failure this slice
> had already fixed twice (the enquiry form's success tick over a dropped
> message; the "queued 0" that could not tell *all done* from *nobody
> there*), re-entering through the one door left open.
>
> ⓘ Order matters: ownership is checked BEFORE the switch, so a tutor
> probing someone else's session learns nothing about site configuration.
> The cost of the change, accepted: an admin pausing the automation also
> silences tutors — rarer than a botched deploy, and it fails as *"the
> button says no"* rather than *"the button lies"*.
>
> ### Still open after the build
>
> - **The ⚡ change family is untouched** — `session.rescheduled`,
>   `session.cancelled`, `session.recording_available`. ⚠ Cancellation
>   genuinely cannot wait for a window, so it stays event-driven and is NOT
>   replaced by the nightly pass. ⓘ A *reschedule* is now partly covered:
>   the reminder re-sends by itself, so what `session.rescheduled` adds is
>   the word "moved" for someone already told.
> - **The tutor's button is untested in the browser** — the SQL gate and the
>   count are proven; the control itself needs a tutor session.
>
> ### The questions as they stood before the build
>
> - **Outbox row shape.** One row per student (retry a single failed
>   recipient, but 25 rows per session) or one per cohort (tidy, but one bad
>   address takes the send and you cannot tell who missed it). Per-student is
>   the likely answer, which makes the fingerprint
>   `session_id` + the student — decide which is `subject_ref` and which is
>   `stage`.
> - **Rescheduling.** A moved class must re-send, so the fingerprint cannot be
>   the bare session id, or the correction is refused as a duplicate. `.ics`
>   has its own update semantics (`SEQUENCE`/`UID`) worth using rather than
>   inventing.
> - **`session.cancelled` cannot wait for a window.** "It's off" must go
>   immediately regardless of how far away it was — so the ⚡ change family
>   (`scheduled` / `rescheduled` / `cancelled`) stays event-driven and is NOT
>   replaced by the nightly pass.
> - **Does `session.scheduled` still earn P1?** Under this design a student is
>   told when the class enters the 7-day window, so an announcement 6 weeks
>   out mostly duplicates the in-app **Sessions page**. Re-examine its
>   priority against the nightly pass rather than assuming.
> - ⓘ A late joiner is not stranded today: `/student/cohort/<id>/sessions`
>   already shows the schedule. A floor, not the answer — "go and look" is
>   what a reminder exists to replace.

| Event key | Kind | Trigger | Recipient | Purpose | Pri | Anchor |
|---|---|---|---|---|---|---|
| ~~`session.scheduled`~~ | ⚡ | Tutor schedules / announces a session date for a cohort | cohort students | **DROPPED 2026-08-20 (Sam).** The nightly pass tells her when the class nears, so an announcement six weeks out mostly duplicates the in-app Sessions page — and since tutors set the timetable when they CREATE the cohort, it would usually fire at an empty one. Struck through rather than deleted so the reasoning survives the next person who wonders where it went | ~~P1~~ | — |
| `session.reminder` | ⏰ | **Nightly: sessions falling in the next 7 days, to students not yet told** — plus a tutor's manual "Send reminder" button, capped at ONE per class occurrence | cohort students | ✅ **BUILT 2026-08-20** (`20260912120000`, own cron job at 07:00 GMT). "Your class is on Tuesday" + join details + an **`.ics` attachment**, so her own phone reminds her thereafter. ~1 email/student/week. ⚠ NOT triggered by scheduling — see above. **The product's first fan-out, and its first attachment** | P1 | ✅ |
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
| ~~`tutor.invited`~~ | ⚡ | Admin vets + invites a tutor to the platform | tutor | ❌ **NEVER BUILT — deliberately retired 2026-08-22 (slice 3).** The invite sends `tutor.added_by_admin` with its `entry` dial on `SET_UP` instead. A separate key failed §10's own test for splitting one: *"shared facts, nothing else in common"* — here the facts **and** the intent are identical (an admin chose you, you are a tutor, write your profile) and only the DOOR differs, which is what a dial is for. Left struck through rather than deleted, so a planned key that turned out to be one email reads as a decision instead of an omission | — | ❌ |

### Tutor lifecycle (tutor-onboarding, 2026-08-21)

Seven triggers — **eight emails**, since `tutor.added_by_admin` carries
two — added with the arc that needed them, per the standing rule that an
email is written **when a feature needs one**, inline with that feature,
rather than as an arc of its own. Plan:
[tutor-onboarding.md](tutor-onboarding.md) §10. ✅ **All seven built,
and the arc closed 2026-08-22.**

⭐ **The first emails about someone’s STANDING** rather than their money
or their place in a class. `tutor.added_by_admin` is also the first that
is *the entire onboarding*: there is no welcome screen behind it and
nobody walks a new tutor in — ⓘ except on its `SET_UP` branch, where
`/welcome` is exactly that screen.

| Event key | Kind | Trigger | Recipient | Purpose | Pri | Anchor |
|---|---|---|---|---|---|---|
| `tutor.added_by_admin` | ⚡ | Admin promotes an existing user, **or invites one by email** | new tutor | **✅ BUILT 2026-08-21** (`fca499e`), **✅ ON PROD** (`ce10dfa`). "You are now a tutor" — what happened, that their student account is untouched, and the ONE thing worth doing first: writing the public profile. **Names no admin** and **promises nothing about tiers**. ⭐ **ONE KEY, TWO EMAILS since slice 3** (`282c2e9`): the `entry` dial (`LOG_IN` \| `SET_UP`) picks the door, exactly as `enrolment.tutor_added` does. A promoted tutor has a password so the profile earns the button; an **invited** one has an account with NONE, so profile and workspace links point behind a door they cannot open — that branch shows exactly one control, the setup link, and the profile drops to a sentence. ⚠⚠ **Absence of the dial means `LOG_IN`, and that is a COMPATIBILITY rule, not a default** — `renderOutboxRow` renders from the FROZEN payload, so rows already sent (prod included) carry no `entry` and must keep rendering what they sent. *Adding a field to a payload is adding it to history you have already sent.* ⚠ It also **degrades rather than trusts**: `payload` is `Record<string, unknown>` at the enqueue boundary, so nothing type-checks "SET_UP carries a link" — with none it prints the sign-in-code route instead of a dead button | P1 | ✅ |
| `tutor.application_submitted_admin` | ⚡ | Someone applies to be a tutor | **admin** | **✅ BUILT 2026-08-22** (2a-i), **✅ ON PROD** (`de88294`). A queue nobody knows filled up is a queue nobody works. ⚠ recipient ≠ actor. ⭐ **The first email this product sends to ITSELF**, and its disclosure rules are the INVERSE of every other template here: it carries the applicant's name, address and own words, because the reader is the person deciding. Still carries **no decision link** — nothing in an inbox approves anybody. Goes to the `SUPPORT_EMAIL` constant, not a fan-out to `TUTORS_MANAGE` holders | P1 | ✅ |
| `tutor.application_received` | ⚡ | Someone applies to be a tutor | applicant | **✅ BUILT 2026-08-22** (2a-i), **✅ ON PROD** (`de88294`). "We have it" — carries **Request #N**, so a resubmission is acknowledged as one, with different opening copy: thanking somebody for applying when they are RE-applying reads as though we lost the first one. ⚠ Promises no timescale — there is no SLA in the product | P2 | ✅ |
| `tutor.application_approved` | ⚡ | Admin approves an application | applicant | **✅ BUILT 2026-08-22** (2b), **✅ ON PROD** (`de88294`). ⚠ Deliberately **not an alias** of `tutor.added_by_admin`, though both end at the same row: that one greets somebody an admin CHOSE, this answers somebody who ASKED. Same split, same reason, as `enrolment.approved` | P1 | ✅ |
| `tutor.application_rejected` | ⚡ | Admin rejects an application | applicant | **✅ BUILT 2026-08-22** (2b), **✅ ON PROD** (`de88294`). Carries `decision_reason` and leads with **"this is not final"** — §6 makes REJECTED non-terminal and an email that closed the door would contradict the schema. ⓘ The conversion-to-student offer lives on the application PAGE, not here: an email cannot grant a role | P1 | ✅ |
| `tutor.suspended` | ⚡ | Admin suspends a tutor | tutor | **✅ BUILT 2026-08-21** (1d-iv), **✅ ON PROD** (`70502a1`). Their workspace is closed and their programmes have left the catalogue — **while their existing students keep their materials** (tutor-onboarding §7). Says which switches fired | P1 | ✅ |
| `tutor.reinstated` | ⚡ | Admin lifts a suspension | tutor | **✅ BUILT 2026-08-21** (1d), **✅ ON PROD** (`70502a1`). ⭐ Not in the original catalog — Sam spotted that we emailed on taking a standing away and went silent on giving it back, which reads as punitive. Deliberate opposite of the suspension notice: no reason field, all button, and it **does not apologise or explain** | P1 | ✅ |

> #### ⚠⚠ `stage` — the field that made a second email vanish <span>2026-08-22</span>
>
> The outbox de-duplicates on `(event_key, subject_ref, stage)` and reads
> a unique violation as **success** — which is what makes Paystack's
> webhook retries harmless. `stage` defaults to `'-'`, documented in
> `outbox.ts` as *"a one-off"*.
>
> ⭐ **That default is right when a subject can experience an event only
> once, and WRONG whenever `subject_ref` is a PERSON.** An enrolment is
> approved once; a checkout gets one receipt. A person can be suspended,
> reinstated and suspended again — and every tutor email used
> `subject_ref = user_id` with the default, so the **second one silently
> sent nothing**: refused insert, refusal read as success, action
> reporting that it had emailed somebody it had not.
>
> Found when Sam suspended a tutor twice. It had been true since 1d
> shipped and **is on prod**. Fixed on the branch: decision emails take
> the decision's own timestamp from `decision_history`; submission emails
> take `s<submission_count>`.
>
> **The rule for any future email:** if `subject_ref` names a person
> rather than a thing that happens once, `stage` must say *which
> occurrence*.

> #### ⭐ These send INSTANTLY — and that is a rule, not a preference
>
> Settled with Sam 2026-08-21, and it turned out the code already carried
> it: `enqueueAndSend` enqueues the row **first**, so the drain can retry
> (`claimDueEmails` takes `QUEUED` *and* `FAILED`), then attempts delivery
> immediately under `waitUntil`. Measured **0.5s** from enqueue to `SENT`
> on dev.
>
> **The rule that generalises:** send instantly when a human is standing
> there who could fix a failure; queue plainly when nobody is. A payment
> receipt fires after the money has moved and there is nobody to tell — a
> plain `enqueueEmail`. An admin promoting a tutor is looking at the
> screen, and is the one person who could act on a failure.
>
> ⚠ **It still returns `queued`, never `delivered`.** The send runs after
> the response, so a toast that says "sent" is guessing. Ours says
> **queued**, and reports separately when the *enqueue itself* failed —
> the one case where no row exists and no drain will ever retry.

> #### ⓘ The welcome email names no admin — a disclosure decision
>
> Sam, 2026-08-21. Which admin promoted someone is **our** provenance: it
> lives on `nclex_tutors.approved_by` and shows in the admin directory. In
> an outward email it is a staff member’s personal name reaching someone
> with no reason to need it — harmless while there is one admin, and an
> accidental disclosure the first time `TUTORS_MANAGE` is delegated.
>
> Compare `enrolment.rejected`, which **does** disclose the tutor’s real
> address. That was argued through and accepted knowingly, because a
> student who paid them needs to reach a person. There is no equivalent
> need here — and the difference between the two is the test to apply to
> the next one.

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

## ✅ Slice 1a — BUILT 2026-08-11

The ⚡ half of the pair below. On the session branch, dev-tested, **not on
`main`**. Migration `20260908120000_email_outbox.sql`; new `lib/email/` and
`app/(app)/admin/emails/`; the receipt wired into `lib/payments/activate.ts`
(Paystack) and `lib/enrolments/actions.ts` (tutor mark-paid).

**⭐ The slice was split, and 1b must not drift.** 1a needs no scheduling at
all, because the receipt sends inline; the flusher's *mechanism* is still
undecided and blocks only 1b. Splitting let the decided half ship — but the
⏰ half is the one that historically never gets built, so it is **next, not
later**.

### What 1a settled

- **Instant sends go out inline, via `waitUntil`.** A receipt arriving 5–15
  minutes late is a worse product than one arriving in three seconds, and a
  scheduled flusher cannot beat that — GitHub's schedules run late under
  load. `getCloudflareContext().ctx.waitUntil` returns the buyer's page at
  once and keeps the send alive after the response; `initOpenNextCloudflareForDev()`
  was already wired, so it behaves the same on localhost. The queue is the
  safety net beneath the happy path, not the route it takes.
- **⭐ The reason decides the retry, not a count.** Resend names every
  rejection. Can-never-work → DEAD on the *first* failure (no point waiting
  a day to learn what Resend already said, and a stuck page full of
  never-going-to-work rows is a stuck page nobody reads). Hiccup → back off.
  Quota → tomorrow, not ten minutes. Bad key → retry forever *and* alarm,
  because that one is not about this email.
  ⚠ **There is no Resend error for a bad recipient.** A typo'd address is
  ACCEPTED and bounces afterwards, so it never enters the retry loop at all;
  it leaves as `SENT`. Do not write retry rules for it — that gap is covered
  by reading `last_event`.
- **⭐ Short automatic window, then a human (Sam).** Four attempts across
  roughly an hour, then it stops and waits for the Retry button. His
  argument, which killed a longer schedule: *a system that quietly succeeds
  on attempt four has hidden a day-long problem from you.* The window is
  deliberately too short to conceal anything real.
- **Dev and prod share one domain; the KEYS separate them** (`mynclex-dev-app`
  / `mynclex-prod-app`, mirroring the existing `mynclex-*-smtp` pair). Sam
  overruled a proposed dev subdomain, with the SMTP setup as precedent.
- **Dev sends real email.** ⭐ And the stronger argument is Sam's own: for a
  *mailer*, suppressing sends in dev is self-defeating — "I tested it and it
  worked" stops meaning anything. ⚠ One exception, in `outbox.ts`:
  `@example.com` is declined unqueued. Dev holds 18 such seeded addresses, on
  a domain reserved by standard never to accept mail, so a table scan would
  post a ~90% hard-bounce rate on a new Resend account. An address that
  cannot receive is not a test of anything.
- **`noreply@quademia.com` as the sender, `support@quademia.com` as Reply-To.**
  Sam's call; these are auto-generated. ⚠ It also made shipped copy wrong —
  the footer said *"Reply to this email"*, which with a noreply sender is
  false. Fixed in both directions: the words point at support, and a Reply-To
  header catches everyone who hits Reply without reading.

### ⭐ The three framings — what reading the pay-first branch found

The doc folded `enrolment.confirmed` into `payment.received` on the grounds
that they are *"the same moment, same person, same checkout"*. For an
account-holder, true. **For a pay-first guest, false**, and the receipt would
have stated something that had not happened.

`activateGroup` in `lib/payments/activate.ts`: when no profile is found it
mints ONE setup link for the whole group, marks it `SETUP_REQUIRED`, and
creates **no enrolment, no subscription, no credits**. The grants happen at
`/welcome`, possibly days later. (Until 2026-08-19 it *sent* one invite, via
Supabase; since the swap it mints the link and this receipt carries it —
which is also why the receipt is queued before the status flips.)

So the money half is constant and the *"what you now have"* half is
**state-aware** — `ACTIVATED`, `PENDING_APPROVAL`, `SETUP_REQUIRED`. Under the
last of these every grants line is null, and legitimately so: a bank pass has
no end date to quote because `end_at` is computed **at** activation.

⭐ **The fold's conclusion survives, for a different reason than the doc
gives.** No second email is needed when she finishes `/welcome`, because at
that instant she is sitting in the app and can see she is in. One email —
because of where she *is*, not because the two moments coincide.

⭐ **And that framing is the only message that reaches her if the invite
itself failed** (`activate.ts` logs it and tells the screen to say "contact
support"). She has paid, has no account, and nothing else arrives on its own.

### Three defects found by reading OUTPUT, not by the tools

None were caught by tsc, eslint, or the type system:

1. An instalment's grants line read **"Enrolled in Payment 2 of 4"** — the
   place name was taken from the receipt line, but a `PROGRAMME_INSTALLMENT`
   row carries `cohort_id = NULL` by the `cohort_scope` CHECK. The cohort
   lives on the **enrolment**.
2. A subject read **"Payment received — one step left — GHS 350"**, two
   em-dashes in one line.
3. `ACTIVATED` payments exist on dev with no enrolment or subscription link,
   which silently dropped the whole *"what you now have"* section. Fallbacks
   added — that section is what makes it a receipt rather than a bank
   statement.

ⓘ This is why `/admin/emails/preview` exists: the receipt branches five ways
by line item and three by framing, so on any given day most branches are
untested and the first person to meet a broken one would be a customer.

### ✅ The preview became a list — BUILT 2026-08-12

Built as designed below, as a `?template=` parameter on the existing route.
One addition the design did not anticipate: **aliases are hidden from the
list**. `waitlist.converted` and `enrolment.tutor_added` share one template,
and listing both would show the same email twice under two names with
identical variants beneath each. A registry key that differs from the
template's own `key` marks the alias; it still renders, it just does not get
its own row. `templateIndex()` and `allPreviews()` in `lib/email/render.ts`.

⭐ It also grew a `name` on `EmailTemplate` — "Payment receipt", not "Payment
received". Deliberately not derived from the event key, which sits beside it
in the row: a name that re-spells the trigger prints the same words twice in
a list whose only job is to be scannable at twenty-four rows.

The original design, for the record:

`/admin/emails/preview` rendered **every variant of every template at once**.
That is fine at one template and unusable at twenty-four: the receipt alone
is seven frames and a ~4,400px scroll.

Sam's shape, which is better than the one proposed to him (that version made
you pick a template *and then* a variant — but within one template you want
all its variants together, since comparing them is the entire point):

- **The list** — one row per template: name, event key, variant count.
- **Click one** — that template's variants, all of them, exactly as the page
  renders today. One screen for a simple email; seven frames for the receipt.

An email with a single variant then costs no wasted click, and adding an
email later adds a row to a list instead of making a page longer.

ⓘ **A query parameter (`?template=payment.received`), not a new route** — no
new folder, one file changed, and it matches the cohort fold's `?cohort=`
precedent where a selection is a context rather than a place. `allPreviews()`
already returns each variant with its event key, so this is grouping what
exists, not fetching anything new.

⚠ **The samples are invented fixtures inside each template file** — `Ama`,
`Cohort 3`, `GHS 350`. Nothing is seeded, nothing is written, no cleanup. Sam
asked; worth stating so nobody later goes looking for preview data to prune.

### Deliberately NOT in 1a

The clock and the reminder (1b) · the bounce webhook (the page pulls
`last_event` instead) · the stuck-queue alarm (needs a non-email channel,
and needs the queue to have been run in anger first) · fan-out · the invite
swap · opt-out preferences.

ⓘ **Also deliberately not wired: the "payments already received" backfill**
in `addStudentWithPlan` (`lib/enrolments/actions.ts`). It writes synthetic
`OFF_PLATFORM` rows for money the tutor took *before* the student was added.
That is bookkeeping, not a payment event — emailing a receipt for it, at a
moment she did not act, would confuse rather than reassure.

---

## ✅ Enrolment emails — BUILT 2026-08-12

⚠ **Out of sequence, and deliberately.** The plan below picks
`payment.installment_due` as the second build. Sam took the tutor-enrolment
email first instead. **1b is still next and still must not drift** — nothing
here weakens the reason it was flagged: it is the half that historically
never gets built, and no other feature will ever drag the clock in.

`enrolment.tutor_added` + `waitlist.converted`. New
`lib/email/templates/enrolment-added.ts` and `lib/enrolments/enrol-email.ts`;
the send wired into `inviteOrAttachAndEnrol`. **No migration** — the outbox
from 1a took two new keys without a schema change, which is the first
evidence that the queue generalises.

### What was silent before

- **A tutor adding a student who already had an account sent NOTHING.** She
  found out by logging in and noticing a new programme in her sidebar. The
  code said so in a comment — *"Notification email to existing users is
  deferred (no email worker yet)"* — and it had been true for months.
- **A brand-new student got Supabase's default invite**, which says *you have
  an account* and structurally cannot say what for. Supabase sees an address
  and a link; that is the whole reason this layer exists.

### ⭐ Two dials, not four emails

It presents as four emails and is not:

| | She has an account | She is brand new |
|---|---|---|
| **Tutor added her** | "You've been enrolled" · Log in | + Set up your account |
| **She was waiting** | "A place has opened up" · Log in | + Set up your account |

**Dial 1 (`reason`) is wording. Dial 2 (`entry`) is the way in, and is the
only one carrying risk.** Neither is guessed: the caller knows why it was
called, and `inviteOrAttachAndEnrol` already returns `invited` because that
is the branch it just took.

### Two keys, one template

In the system the two events are **indistinguishable** — same function, same
row, same guards. The difference is only what the student remembers: one is
news, the other answers a question she asked weeks ago. So they share a
template and keep separate keys, because the queue should report which
actually happened, and changing the wording of one must not silently change
the other.

### ⭐ The invite swap — and what it cost

`inviteUserByEmail` → `generateLink({ type: 'invite' })`. Same account, same
link, same `/welcome` landing; the only change is who writes the email that
carries it. **One email, and the rich one wins** — the third application of
that rule (the invite on 08-06, `enrolment.confirmed` on 08-10, this).

⚠ **It makes our email load-bearing.** Under the invited branch the link
inside it is the only way into the account. That is why the queue-failure
path stops being cosmetic — see below.

### ⭐ A queue failure reaches the tutor

The receipt swallows send failures on purpose: by the time it fires, the
money has moved and there is nobody standing there to tell. **Enrolment is
the opposite** — the tutor is looking at the screen, and is the only person
who can act. So `enqueueAndSend` now reports whether the row reached the
queue, and the roster toast turns to an **error tone on a successful
action**: the student IS enrolled and nothing rolls back, but nothing was
sent, and for a new account that means she has no way in.

⚠ `queued: true` means queued, **not delivered**. Delivery still surfaces
only on `/admin/emails`.

### ⚠ The send is the LAST line of `inviteOrAttachAndEnrol`

Thirty lines above it, the "payments already received" backfill **deletes
the enrolment** if its insert fails (`lib/enrolments/actions.ts`, the
add-with-plan rollback). Queued any earlier, we would tell a student she is
enrolled in something that no longer exists. Found by reading to the bottom
of the function, not by any tool.

### ⭐ The money line is disclosure, not chasing

When the tutor attaches a plan, the email states the next amount and its due
date and stops. Without it, **the first thing she ever hears about owing
money is her access being paused** by the nightly sweep. The chasing belongs
to `payment.installment_due`; this is only the disclosure that a plan exists.
Position comes from the same schedule engine the sweep uses, so "2 of 4" is
the sweep's own arithmetic rather than a second opinion.

### ⭐⭐ The resend action we thought we owed — not needed

The obvious hole: her link expires, or she clicks it and abandons setup, and
she is enrolled and locked out at once. There is **no resend anywhere**, and
⚠ **the admin Retry button cannot be it** — it re-sends the stored row, and
the payload is a frozen snapshot by design, so it would re-send the **same
expired link**, report success, and change nothing.

But the way back in already existed. `generateLink` creates the account the
instant the tutor clicks, and `/login`'s **"Email me a sign-in code"** asks
only that the account exist. **Verified live on 2026-08-12** against exactly
that state — invited, never confirmed, no password. She gets in, and
`/welcome` turns out not to be load-bearing for a tutor-added student at all:
it only sets a password and a name, while her profile and enrolment already
exist.

⚠ **And the app had been telling her to do the one thing it forbids.**
`/welcome` said *"Ask your tutor to add you again"* in two places — which the
duplicate-enrolment guard refuses, since she is already enrolled. Wrong since
it was written; the swap only made it reachable more often. Corrected in
three places (the email's expired-link note, `app/welcome/actions.ts`,
`app/welcome/page.tsx`), all naming the button exactly as `/login` labels it.

ⓘ The welcome card deliberately reassures about the **account** and not the
enrolment: it is a convergence point, and the pay-first buyer who lands there
has an account but no enrolment, subscription or credits until she finishes.

**So a resend action is still unbuilt and is no longer urgent.** When it is
built, two constraints already known: it must **mint a new link** (never
re-send a stored one), and it must use `stage` so the fingerprint admits a
genuine re-issue while still refusing duplicates. It would also close the
payments-side `EMAIL-TRIGGER[payment.setup_link_resend]` hole, open since
2026-06-24.

### ⚠ An `@example.com` recipient makes the toast lie

`enqueueEmail` declines those addresses unqueued — correctly; they are
guaranteed hard bounces. But it reports success, so the tutor is told *"emailed
them a link"* when no row was written and nothing was sent. **Dev-only**
(prod has no such addresses), and all three seeded waitlist leads are
`@example.com`, so it is easy to hit while testing and easy to mistake for a
real failure.

### Tested on dev — 4 of 6 variants, live

Eight outbox rows, **every one SENT on the first attempt**, all with a
provider id. Nothing stuck, nothing dead, no retry exercised.

Run live: tutor-added existing-account into a cohort · tutor-added **new**
account (the swap) · tutor-added **self-paced**, no cohort and lifetime
access (both null cases) · **waitlist convert, new account, part-paid plan**
(which also proves the backfill ordering).

Skipped: tutor-added-new-with-plan and waitlist-convert-existing-account —
both are **recombinations of halves already proven**, not untested mechanisms.

⚠ One test run was lost to a false alarm: the first attempt was made against
the **deployed dev Worker**, which runs `main` and has none of this. The whole
feature exists only on the session branch, so every variant has to be tested
on `localhost`.

### Two silences fixed in my own code while diagnosing that

Both were the exact fault this layer exists to prevent, reproduced inside it:

- `sendEnrolmentAddedEmail` returned `{ queued: false }` from the name-lookup
  path **saying nothing at all**.
- `readNames` read `.data?.title` without inspecting `.error`, collapsing *the
  query failed* and *the programme has no title* into one null — the same
  shape as the receipt's delivery column on 08-11, where *"Resend hasn't
  said"* and *"we couldn't ask"* rendered identically.

---


## ✅ 1b — BUILT 2026-08-18

The sweep stops being silent. Migration `20260911120000_installment_reminders.sql`,
two new templates, two new event keys. **Nothing student-visible outside email.**

| When | Event | Stage |
|---|---|---|
| due in 7–8 days | `payment.installment_due` | `<n>:T-7` |
| due in 3–4 days | `payment.installment_due` | `<n>:T-3` |
| the night she is paused | `payment.installment_overdue` | `<n>:overdue` |

### ⭐ The sum is now written ONCE — this REMOVED copies, it did not add one

`nclex_enrolment_next_payment()` answers *when is her next payment due, how
much, which position, and does this programme gate access* — and the pause
step, both reminders and the overdue notice all read it. It replaces two
inline copies inside the sweep; `lib/payments/schedule.ts` remains the TS
half. The reminders would otherwise have been a fourth copy of the date the
warning **quotes** and the pause **enforces**.

ⓘ **The money was cheaper than feared.** Reminders only ever concern positions
2..N, whose amount is a plain `total ÷ count`; `installmentSplit`'s rounding
remainder lands on position 1, which is paid at checkout and never reminded
about.

⚠ **Verified before switching, and again with real overdue data.** The shared
function and the old inline expression select the same enrolments with the
same due dates — 0 disagreements. ⓘ The first comparison was **vacuous** (no
enrolment on dev was both `ENROLLED` and owing) and said so; the second, after
seeding, had a row that genuinely qualified.

### The copy decisions, none of them incidental

- **⭐ Past tense, not future.** Detecting overdue and pausing are the same
  instant — the sweep never notices somebody is late and leaves them enrolled
  — so *"you will be paused"* is never a true sentence.
- **⭐ "Paying puts it back immediately — you do not need to ask anyone."**
  Verified true in `activate.ts`, which recomputes the schedule after a
  payment and clears the pause itself. The worst version of this email leaves
  her thinking she must write to somebody and wait.
- **⭐ The tutor is named** in all three. *"A system took your access"* becomes
  *"there is a person here who knows you"* — which matters most for exactly
  the student most likely to go quiet.
- **⚠ The consequence line is CONDITIONAL.** On a programme with
  `payment_gates_access = FALSE` nothing pauses; a blanket *"your access will
  pause"* is a threat we do not carry out. Same for the overdue notice, whose
  `paused` flag switches it between *"your access is paused"* and *"your
  access is unaffected"*.
- **No threat at T-7.** The consequence appears at T-3. The first thing she
  ever hears about this money should not be what we will take away.
- **Grace is offered at T-3 and at overdue, never at T-7.** Offering an
  extension before anything has gone wrong invites delay; offering it once she
  is struggling is kindness. The tutor really can do both — `resumeEnrolmentAction`
  restores access and `installment_grace_until` moves the date.
- **⭐ The paused subject leads with a label** (Sam): `Access paused: <programme>`.
  ⚠ The fuller sentence was cut deliberately — after the label *"your access
  to X is paused"* repeats itself and costs ~25 characters, enough to push the
  programme name past a phone's ~45-character truncation. Measured on real
  titles: 82 chars → 57. **Do not restore it.**

### Who is deliberately left out

**Grace-covered students get no overdue email at all.** Their tutor has just
explicitly given them more time, and telling them they are overdue contradicts
the thing the tutor did. If grace lapses unpaid they fall into the same select
on a later night.

⚠ **Students on non-gated programmes DO get all three** — they genuinely owe
money — but every line about access is suppressed.

### ⚠ The SQL path bypasses `enqueueEmail`, and one guard had to be copied

These are the only two events enqueued from SQL rather than app code. That
means they also skip the `@example.com` suppression in `outbox.ts`, so the
guard is repeated in the migration. Dev holds **18** such addresses; without
it a single sweep posts a wall of guaranteed hard bounces on a low-volume
Resend account. ⓘ The payload contract is likewise unchecked — see the warning
on `InstallmentDuePayload` in `types.ts`.

### Tested on dev, against a seeded fixture

Fixture removed afterwards; the two sent rows kept as evidence.

- **T-7 sent** — *"Payment due 26 August 2026 — GHS 1,000"*, first attempt.
- **Overdue sent**, with the enrolment going `PAUSED / INSTALLMENT_OVERDUE`
  **in the same run** — which proves the notice is captured while she is still
  `ENROLLED`, the ordering the whole step depends on.
- **T-3 window verified to select correctly** and then deleted unsent; it is
  the same template with a different literal.
- **Three further sweep runs produced no duplicates.** The fingerprint holds.
- Only **one** row came out of a table full of students: 18 `@example.com`
  addresses and every already-paused enrolment correctly skipped.

### ⚠⚠ Two process findings worth more than the feature

- **The migration file was not what was tested.** A condensed version went to
  dev; the commented one went to the file. Hash-comparing them (comments and
  whitespace stripped) showed a difference, chased down to cosmetic spaces and
  confirmed identical at 3,250 characters. **Harmless this time.** The file is
  what ships to prod, and "resembles what I tested" is not "is" — do this
  comparison whenever the two are typed separately.
- **⭐ `tsc` reports nothing useful while `next dev` is running.** Half-written
  files under `.next/dev/types` produce *syntax* errors, and tsc then skips
  semantic checking entirely — hiding two genuine type errors in these
  templates (`formatMinor`'s arguments reversed, four call sites). A green tsc
  with the dev server up is **not evidence**. Stop the server and clear that
  directory first.

### Still open after 1b

- **`enrolment.access_expiring` / `access_expired`** — the other half of the
  pair rule, still blocked on the access-window discussion.
- **`payment.installment_overdue` on non-gated programmes fires once per
  position**, forever, until paid. That is intended, but nobody has watched it
  run for months.
- ⚠ **The `validation_error` misclassification matters more now.** Three
  scheduled emails feed the queue, so a bad key means the drain marches
  through and kills each one instead of holding them — and fixing the key
  drains nothing.
## 1b — the shape, settled in discussion 2026-08-12 — ✅ BUILT 2026-08-18

ⓘ Kept as the design record. What was actually built is the section above;
this is what was reasoned out beforehand, and it held.

Sam's framing, and it generalises further than he pitched it.

### What the sweep actually is

Not a payments job. `nclex_enrolment_nightly_sweep()` is the **"enforce time on
enrolments and subscriptions"** job, running 02:00 daily under pg_cron, and it
makes three state changes:

| | |
|---|---|
| **4a** | `ENROLLED → PAUSED` when the next unpaid position is overdue — *unless* `installment_grace_until` is in the future, or the programme has `payment_gates_access = FALSE` |
| **4b** | `ENROLLED`/`PAUSED` → `EXPIRED` when `access_expires_at` has passed |
| **4c** | subscriptions `ACTIVE → EXPIRED` past `end_at` (bank + readiness) |

⚠ **The live definition is not the one you find first.** The sweep has been
redefined three times — `20260608` (original), `20260610` (grace), `20260706`
(payment gating). Read the newest.

### ⭐⭐ THE RULE — a scheduled email is a state change, warned or recorded

Every transition the sweep makes wants a **pair**: a warning before it, a
record at it. Same select, two boundaries — `< NOW() + N` and `< NOW()`.

| Sweep step | Warning (due in N) | Notification (it happened) |
|---|---|---|
| 4a | `payment.installment_due` | `payment.installment_overdue` |
| 4b | `enrolment.access_expiring` | `enrolment.access_expired` |

**Four of the seven ⏰ emails out of one function**, and it is the answer to
Sam's reason for picking 1b next (*"it will teach us how to handle the other
time-controlled emails"*). It also makes the doc's stated risk —
*"access paused" reaching somebody never warned* — **structurally impossible**,
since warning and pause come from one pass over one expression.

ⓘ **4c has no catalog entry.** A bank or readiness pass expiring notifies
nobody. Probably wants the same pair; not listed, so not promised.

### The trigger lives WITH the sweep — no second mechanism

Sam's call, and right: a separate scheduler would be a second thing to keep in
step, which is the failure this pairing exists to remove.

⚠ **Correcting an objection raised and withdrawn the same day:** enqueueing
from SQL does *not* put copy decisions in Postgres. The payload carries **raw**
values — minor units, ISO dates, ids, names — and the `.ts` template does all
formatting and wording, exactly as `payment.received` already does. The real
cost is narrower: **the payload shape becomes a contract with no type-checking
on the SQL side**, so a missing key renders as nothing in somebody's inbox.
That is gamma's `{{expiryDate}}` failure precisely. Mitigate with a
deliberately thin payload and a smoke test — not with a different architecture.

### Why the window is forgiving, whatever N you pick

`stage` = the installment position, so the outbox's unique index means *"this
enrolment has been warned about payment 3"* — once, permanently, enforced by
the database. Pick "within 3 days" on a nightly job and she matches on the
first night; the next two inserts are refused. **The hard part — not warning
her four times — is already built and already exercised by the receipt.**

ⓘ Which is why the rolling-window rule below still matters but is no longer
load-bearing on its own: the fingerprint is the backstop, the window is the
timing.

### ⚠ Two things this does NOT solve

- ~~**The drain.**~~ ✅ **SOLVED AND BUILT 2026-08-18 — see *The drain* below.**
  Something outside Postgres still has to send what the sweep queued; it is now
  `app/cron/email-drain`, knocked on every five minutes by a fourth pg_cron
  job. The original wording, for the record: *"This is the one genuinely open
  decision before code. Precedent: `recalibrate.yml`, a GitHub Actions schedule
  that calls in. ⓘ This repo has no `app/api/` — route handlers sit top-level."*
  ⚠ The Actions precedent was examined and **rejected** on cost and cadence.

  ⚠ **Corrected 2026-08-18 — an earlier version of this bullet said pg_cron
  "cannot call Resend". That is wrong, and the real wall is elsewhere.**
  `pg_net` (async HTTP from SQL) is **available on the MyNclex projects**,
  merely not enabled — `installed_version` is null, `default_version` 0.20.0.
  So the database *can* make an outbound call. What it cannot do is **render**:
  the templates are 300–400-line `.ts` files, and nothing inside Postgres can
  execute them. ⭐ The distinction matters because it changes the menu — the
  database is able to **ring a doorbell**, so "the trigger lives with the
  sweep" can be satisfied literally (sweep's last act rings a private app URL)
  rather than approximately. The app-layer rule survives untouched: ringing is
  not sending.
- **A sweep run is a burst.** Every send so far is one row, inline, under
  `waitUntil`, on somebody's request. A sweep queueing fifty rows at 02:00 has
  no request in flight, so for the **whole ⏰ half the drain is not the safety
  net — it is the only delivery path.**

### ⭐ The listener — Sam's alternative, considered 2026-08-18, PARKED

Sam: *"there can be something like a listener — when it hears a new row
created, it does an activity. That's different from a sweeper, is that right?"*

Right, and it has a name in this stack: **Supabase Database Webhooks**, which
is a Postgres `AFTER INSERT` trigger plus `pg_net` calling a URL. Genuinely a
different mechanism, not a rewording of the sweeper:

| | **Listener** | **Sweeper** |
|---|---|---|
| Wakes on | a row being **written** | **time** passing |
| Style | push — the queue taps you | pull — you go and look |
| Latency | ~1 second | up to the poll interval |

**⭐ It is stronger than it was pitched, and it legitimately reopens a closed
decision.** Slice 1a rejected queue-and-flush for the receipt because *"a
receipt arriving 5–15 minutes after payment is a worse product than one
arriving in three seconds, and a scheduled flusher cannot beat that."* That
reasoning kills **polling**. It does not touch a **listener**, which is about
as fast as the inline path. So a listener could retire `waitUntil` entirely and
give the product **one delivery path for ⚡ and ⏰ alike**, which is cleaner
than the two we have.

**⚠ But it cannot be the only mechanism — three things it structurally cannot
hear.**

- **Retries.** Decisive. On failure `deliverOutboxRow` **UPDATEs the existing
  row** (`send.ts` — status `FAILED`, `send_after` pushed forward). Nothing is
  inserted, so an insert-listener is deaf to every second attempt.
- **Rows queued ahead of their time.** `send_after` exists precisely so a row
  can be written now and sent later (`session.reminder` at T-1h is queued when
  the session is scheduled, possibly days early). The listener fires at
  creation — the wrong moment — and something must still come back at the right
  one. ⓘ The 1a schema already assumes this: the outbox's index is
  `(status, send_after)`, an index built for polling.
- **A ring that does not land.** `pg_net` is fire-and-forget. Mid-deploy, or on
  a failed call, the moment is simply gone. A sweeper's next run collects
  whatever the last one dropped, for free.

**⚠ And it makes the burst worse.** A webhook fires **per row**: fifty warnings
at 02:00 become fifty simultaneous calls into the app and fifty at Resend. The
sweeper takes 25 at a time in `send_after` order. ⓘ Check Resend's rate limit
before ever choosing per-row fan-out.

**⭐⭐ What settles it for 1b: the listener's only edge is latency, and ⏰ is
the one class where latency is worthless.** A payment-due warning fires at
02:00 while she is asleep; this doc's own rule is that a time-driven email is
*"fine at 9am or 11am, wrong by a day."* So for the emails 1b actually sends,
the single benefit buys nothing and all three blind spots apply.

**Verdict: a listener is an accelerator, not a floor.** The periodic drain is
needed regardless — for retries, for future-dated rows, and to catch a dropped
ring. Once that floor exists the listener is optional, and its payoff is
confined to the ⚡ half, which already goes out in three seconds by a route
that works.

ⓘ **Revisit when** either is true: receipts start feeling slow, or we want to
retire the `waitUntil` path in favour of one route for everything. Neither is
true today.

ⓘ Like the pg_net doorbell above, this does **not** breach the app-layer rule
carried in the outbox migration (*"SENDS STAY APP-LAYER, NEVER FROM A POSTGRES
TRIGGER"*) — a trigger that rings our URL is not sending.

### ⚠⚠ Found while weighing it: there is no automatic retry today

The retry policy settled on 08-11 — reason-decides-not-count, ~1 hour of
attempts, then stop and wait for a human — is **fully designed and not
running**. `deliverOutboxRow` sets `FAILED` with a future `send_after` and
returns; nothing ever reads that row again. The only second attempt in the
product is a person clicking **Retry** on `/admin/emails`.

⭐ **So the drain is not only 1b's delivery path — it is the missing half of a
policy already agreed.** That raises its priority: it repairs the ⚡ emails
that are live on `main` today, independently of anything scheduled.

ⓘ Why this has been invisible: every send so far has succeeded on the first
attempt (eight rows over two sessions, all `SENT`, all with a provider id), so
the retry machinery has never been asked to run.

### ⚠ Adjacent, and worth doing before the ⏰ emails ship

The Resend key is **send-only**, so `fetchDeliveryStatus` cannot read
`last_event` and **a bounce is invisible forever** (there is no Resend error
for a bad recipient — the address is accepted and bounces later, leaving the
row `SENT`). The ⏰ emails go to addresses nobody has typed in months; an
access-expiry warning may be the first mail a student has had in a year, and
those are the most likely to bounce silently. Needs a full-access key in
`.env.local` (⚠ the **main checkout's** copy — worktrees copy parent→child
only), `wrangler.jsonc`, and the prod Worker secret.

---

## ✅ The drain — BUILT 2026-08-18

The postman. Four commits on `main`; **no student-visible change**.

| | |
|---|---|
| `lib/email/drain.ts` | claims what is due and sends it through the **existing** sender |
| `app/cron/email-drain/route.ts` | the private door, Bearer-guarded |
| `db/migrations/20260909120000_email_drain_cron.sql` | pg_net + `nclex_email_drain_knock()` + the job |
| `app/(app)/admin/config/config-defs.ts` | the off switch |

### ⭐⭐ It repairs something already broken — that is the headline, not 1b

The drain was picked up as 1b's blocker, and it is. But reading the sender to
build it found that **the retry policy settled on 2026-08-11 was designed and
had never run once.** `deliverOutboxRow` UPDATEs a failed row — status
`FAILED`, `send_after` pushed forward — and returns. **Nothing had ever re-read
that row.** The only second attempt the product had was a person pressing Retry
on `/admin/emails`.

So the drain is not only the ⏰ delivery path; it is the missing half of a
decision already taken, and it repairs the ⚡ emails **already live on `main`**
independently of anything scheduled. ⓘ It stayed invisible because every send
so far has succeeded first time — 13 rows across three sessions — so the retry
machinery was never asked to run.

⭐ **One word carries both jobs: "due."** `claimDueEmails` asks for rows whose
`send_after` has passed, which is true of a newly queued reminder *and* of a
failure waiting for its next go. The drain never needs to know which it has.

### ⭐ Why pg_cron, and why NOT GitHub Actions

The retry delays are **1 / 5 / 15 / 30 minutes**, so the knock must come every
few minutes or the window stops being an hour. That priced the options:

| | Fast enough | Cost | Verdict |
|---|---|---|---|
| GitHub Actions | 5-min floor | **~8,600 min/month against a 2,000 allowance** (private repo, billed rounded up per run) | ✗ |
| Cloudflare cron on the app Worker | yes | free | ✗ **`@opennextjs/cloudflare` 1.19.6 emits no scheduled handler** |
| A separate tiny Worker | yes | free | ✗ breaches the `workers/` stays-empty line for a schedule |
| **pg_cron + pg_net** | per-minute | free | ✅ |

⚠ **An hourly Actions schedule was very nearly shipped**, and would have
quietly stretched "five attempts inside an hour" to four hours — the exact
concealment Sam killed the long retry schedule to prevent. The plan was right
and the reasoning under it was wrong; the delays are what caught it.

⭐ It is also Sam's own "no second mechanism" instinct satisfied **at the level
that matters** — the same scheduler the sweep already runs on, now a fourth job
beside three.

### The design choices worth knowing

- **One pass per knock, not a loop that empties the tray.** A Worker is capped
  on subrequests per invocation and the burst case is what would hit it. A
  backlog drains across successive knocks, oldest `send_after` first.
- **Sequential, not parallel.** Fifty concurrent sends is how a low-volume
  Resend account gets rate-limited, and a burst is exactly the ⏰ shape.
- **⚠ Overlapping knocks are NOT guarded.** `claimDueEmails` selects, it does
  not lock, so two simultaneous drains would attempt one batch twice. Resend's
  idempotency key (already sent, built from the fingerprint) collapses the
  duplicate, so the cost is a wasted attempt rather than a second email. A
  concurrency guard on the knocker is the real fix and is not built.
- **No run-log table.** pg_net already records every call with its status and
  the app's reply in `net._http_response`. ⚠ Supabase prunes it within hours,
  so it is a live view, not history — the outbox row remains the durable record.

### ⚠ Two values per project, and a deliberately loud refusal

Neither is in the migration, and the function **refuses and warns** without
either rather than knocking at nothing:

| | Where | Why not in the file |
|---|---|---|
| `email_drain_url` | `nclex_config`, seeded **blank** | one migration runs on both projects; dev calling prod's Worker would drain the live queue |
| the bearer secret | **Supabase Vault**, `nclex_email_drain_cron_secret` | a migration in the repo must never carry a credential |

The same secret must be set on that project's Worker as a Cloudflare secret.
**The door and the postman need the same key**; a mismatch is a 401 every five
minutes.

### The off switch, and the one setting deliberately not on it

`email_drain_enabled` joins the three job switches on `/admin/config`. ⚠ It was
**missed on the first pass and caught by Sam** — the page renders `CONFIG_DEFS`,
not the table, so an undeclared key does not exist as far as it is concerned,
and stopping a five-minute job would have meant editing the database by hand.
`recalibrate.yml`'s header already states the rule: stopping a scheduled job is
an admin action, not a deploy.

⭐ **`email_drain_url` is deliberately NOT on that page.** There is no text type,
and it is not a setting — it is per-environment plumbing, like a Worker secret.
An editable box invites the one typo that silently stops all scheduled email.
⚠ The cost, stated so nobody "fixes" it: **one row in `nclex_config` the admin
page never shows.**

### Proven on dev, unattended

- Door: `GET` 405 · unauthenticated 401 · wrong secret 401 · correct 200.
- **A real email sent by the drain with no request in flight** — the claim that
  mattered.
- The doorbell reached the deployed dev Worker: 404 before deploy (which itself
  proved reachability), **200 after**.
- ⭐ **The unattended proof**: a row queued at 11:31:38 — after the 11:30 tick,
  before 11:35. The 11:30 knock reported `claimed 0`; the **11:35 knock reported
  `claimed 1, sent 1`** and the row went `SENT` at 11:35:01. Nothing was touched.

### ✅ Two counters — FIXED 2026-08-18 (migration `20260910120000`)

`send.ts` and the outbox migration both said a quota failure *"must NOT count
toward the death limit — five quota failures could be five days apart"* and
that the attempt count is a backstop *"here, and only here."* **Neither was
true.** All four failure classes shared one `attempts` counter and only the
TRANSIENT branch read it, so a row that hit the daily ceiling five nights
running was killed by its **first** ordinary hiccup, having never once retried.

⭐ **The one-line fix does not work, and that is why this is a column.** The
CONFIG branch **needs** `attempts` to grow, since it indexes its back-off by it
— freeze it and it sends `RETRY_DELAYS_MS[-1]`, i.e. `undefined`, into a
`Date`. One class needs the number rising and another needs it still.

So: `attempts` = **times tried** (honest total; the admin page and the CONFIG
back-off), `transient_attempts` = **strikes** (hiccups only; the give-up rule
reads this and nothing else). ⚠ `requeueEmail` resets **both** — resetting the
total while leaving strikes at the limit gives a Retry button that looks like
it worked and kills the row on its next hiccup.

**Exercised, not reasoned about:** with the key swapped out on localhost, a row
at `attempts=7 / strikes=0` took a CONFIG failure and came back `FAILED` (not
`DEAD`), attempts 8, **strikes still 0**, next try +30 min as a valid date —
the Invalid-Date landmine proven safe.

ⓘ Also corrected: the comment said "four tries"; four delays schedule **five**
attempts (2–5).

### ✅ A bad API key read as PERMANENT — FIXED 2026-08-18

Found 2026-08-18 while forcing the failure above. Setting an invalid key,
Resend did **not** answer with a key error. It returned:

```
code: validation_error    message: "API key is invalid"
```

`validation_error` maps to **PERMANENT**, so the row went **DEAD on the first
failure**. The `missing_/invalid_/restricted_api_key → CONFIG` mapping never
fired, because Resend does not appear to send those codes — at least not for a
malformed key.

⚠ **This defeats the entire reason the CONFIG class exists.** The migration
states the intent: *"this is not about one email, EVERY email is failing, and
it drains by itself the moment the key is fixed."* What would actually happen:

- the drain wakes every five minutes and works through the queue
- **every row it touches goes DEAD** rather than being held
- fixing the key **drains nothing** — each row needs a manual Retry, one by one

⭐ **And the drain is what makes it bite.** Before 2026-08-18 nothing re-read a
failed row, so a bad key merely left the queue sitting. Now there is a machine
that will methodically kill it. **Building the drain turned a dormant
misclassification into an active one** — worth noting as a general shape: work
that makes a system actually run promotes its latent bugs.

**✅ FIXED 2026-08-18.** `postToResend` now checks **HTTP 401 before the code
table** and classifies it CONFIG. Probed against the live API first, and the
answer was better than hoped: a **malformed** key, a **well-formed but wrong**
key and an **empty** key all return the identical `401 / validation_error /
"API key is invalid"`. Resend does not distinguish them, so there was no
revoked-key case left to check.

⚠ **The fix is deliberately narrow.** `validation_error` KEEPS its PERMANENT
mapping everywhere else, because it is also Resend's genuine code for a
genuinely broken request (bad from-address, missing field). Reclassifying the
name wholesale would fill the queue with rows that can never succeed and
retry forever — the opposite failure, and the reason PERMANENT exists. The
HTTP status is what separates "our credentials were rejected" from "this
email is malformed".

**Proven, not just compiled**: with a wrong key in `.env.local`, a queued row
came back `FAILED` with a retry a minute out — where before it went `DEAD` on
attempt one. ⭐ And it composes with the strike counter: a key outage spends
no strikes, so a long one cannot quietly exhaust an email's retry budget.

### ✅ Released to prod 2026-08-18 — and the three values are set

(This section read "⚠ Prod has NONE of this" until the release that same
evening — kept because the requirement it states is permanent, not
historical.) Three things must be set per project or the doorbell refuses
(loudly, by design): `CRON_SECRET` on the Worker · the Vault secret
(`nclex_email_drain_cron_secret`) · `email_drain_url` in `nclex_config`.
**Each project's secret is a DIFFERENT value** — same reasoning as the
Resend keys: dev must be revocable without touching prod.

All three were set on prod on release night. ⚠ **The Cloudflare one fought
back**: the first `CRON_SECRET` add never reached the live Worker and the
door answered 503 for half an hour — likely the dashboard's
save-without-deploy draft trap. ⭐ **The 503-vs-401 split earned its keep**:
"no secret configured" vs "wrong key" could be told apart from outside with
`curl` alone, which is the whole reason the two codes were separated.
Delete + re-add fixed it. Proof, from pg_net's own log: knocks 19:45–20:00
all 503; the 20:05 knock **200 `{claimed 0}`**, unattended. Then a real
test-mode purchase sent `payment.received` in **218 ms** through the ⚡
path — the first email ever through prod's Resend key.

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
sessions — ✅ **proven 2026-08-20**, one row per student) · the **invite swap**
(`inviteUserByEmail` → `generateLink`, below) —
the one change that can leave an invited student with *nothing*, so it does not
belong in the slice still finding bugs in the pipe · opt-out preferences,
since neither of these is opt-out-able.

> ⓘ **The deferral held, and both halves have since landed** — tutor-add
> 2026-08-12, pay-first 2026-08-19. Waiting was right: the pay-first half
> turned out to hinge on the queue reporting whether it accepted the row,
> a signal that did not exist until 08-12 and would have had to be
> invented mid-slice here. See *Invite* below.

### Folders this arc needs (agreed 2026-08-10, ✅ all created 2026-08-11)

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

### ⏭ Still to settle before any code — three of four closed 2026-08-11

1. ✅ **The outbox row itself** — settled and built. Eighteen columns; see
   `db/migrations/20260908120000_email_outbox.sql`, whose comments carry the
   reasoning per column.
2. ✅ **The catch-up policy** — settled as **per-email, not global**. Sam's
   framing: *"send late or skip"* is an editorial judgement about what a
   particular email should say and when it stops being worth saying, so
   answering it now for emails that may never be built is designing around
   guesses. The TABLE carries the capability (`expires_at`, empty for
   everything in 1a); each email fills in a value when its turn comes.
3. ⬜ **The alarm's own channel** — still open, deliberately. It cannot be
   designed before the queue has been run in anger, and it cannot be email.
   This is now the only unsettled item in the arc.
4. ✅ **Reading the pay-first branch** — done, and it found a real defect in
   this doc's own design. See *The three framings* below.

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
[`lib/payments/activate.ts`](../../lib/payments/activate.ts)) used
`admin.auth.admin.inviteUserByEmail`, which sends Supabase's generic body
as a side effect. Both now call `admin.auth.admin.generateLink({ type:
'invite' })`, which mints the **same** set-password link and sends nothing
— and our own email carries it.

#### ✅ Both halves done — tutor-add 2026-08-12, pay-first 2026-08-19

⭐⭐ **The gap between those dates is the lesson, not the delay.** The
tutor-add swap shipped the same day its rich email was written, so that
path went from *only Supabase's invite* to *only ours* with no moment in
between. The pay-first receipt had shipped a day earlier, on 08-11, **and
its swap did not follow** — so from 08-11 to 08-19 every guest purchase
sent **two** emails: Supabase's *"you have an account"*, which arrived
first and did not mention the payment, and our receipt beside it, whose
note then told her to go and look for the thin one.

⭐ **The duplication had a birthday, and it was the arrival of the GOOD
email.** Before 08-11 Supabase's invite was the only thing a pay-first
buyer received — thin, but not redundant. Adding the receipt is what made
two. Worth remembering when the next rich email is written beside a
generic one: shipping the better half first *creates* the problem it is
meant to solve, and nothing fails or warns.

**What the pay-first half changed** (all in `activateGroup`):

- The receipt's **CTA slot, previously left null on purpose**, now carries
  the link. The old comment — *"no call to action while setup is
  outstanding: every in-app destination would bounce her to a login she
  cannot complete yet"* — was right about app pages, which is precisely
  why the one reader who most needed a button had none. A setup link is
  not an app page; it mints her session on the way in. Reusing the slot
  rather than adding a field also means a receipt queued **before** the
  swap renders exactly as it did before.
- ⚠ **The failure mode inverted.** `sendPaymentReceipt` swallowed every
  failure by design — the money outranks the receipt, and the way in was
  sent by Supabase regardless. Now this email **is** the way in, so it
  reports whether it queued, and the callback page has a state for
  `false`. She is not locked out: `generateLink` creates the account
  before the send is attempted, so `/login` → *"Email me a sign-in code"*
  reaches it. Saying *"check your email"* there would be a falsehood.
- ⚠ **Order matters more than it looks.** The receipt is queued **before**
  the status flips to `SETUP_REQUIRED`, because that status is what
  selects the retry branch — and the retry branch mints no link. Queuing
  second left a window in which a concurrent pass (pending-recheck
  re-runs settle every few seconds) could queue a **linkless** receipt and
  win the fingerprint. Enqueuing first removes the window: a concurrent
  pass still reads `PAID`, takes the same branch, and also carries a link.
- The template therefore carries **two** setup wordings, because two real
  cases still produce a buttonless receipt: a row queued before the swap
  deployed, and the retry branch after a failed first enqueue.

⭐ **Proven on dev 2026-08-19** across all three guest purchases —
programme (with bank opt-in), bank alone, readiness alone. The decisive
evidence was `auth.users.confirmation_sent_at`: **null** on every account
created by the new path, because Supabase sent nothing. A fourth purchase
run against the deployed Worker, still on the old code, carried a
timestamp there and produced the old two-email pair — an accidental but
exact control.

⚠ **Only now may the Supabase invite template be disabled — and not until
this is on prod**, where it is still the live way in. Removing it early
makes pay-first silently send nothing.

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

- ~~**Digest vs per-event** for tutor-facing volume (`payment.tutor_received`,
  `enquiry.received`).~~ **Settled per-event 2026-08-19** for
  `payment.tutor_received` — see the Payments note. A digest is its own slice
  and there is no volume to protect anyone from yet. `enquiry.received` is
  still unbuilt and inherits the same reasoning by default.
- ~~**Live sessions**~~ — ✅ **`session.reminder` BUILT 2026-08-20.** All four
  unknowns answered: one outbox row **per student**; rescheduling handled by
  putting the time **in the fingerprint** (same `UID`, higher `.ics`
  `SEQUENCE`, so calendars update rather than duplicate); `session.scheduled`
  **dropped**; and the tutor's button shipped alongside, capped at one per
  class occurrence. ⚠ What remains is the **⚡ change family** —
  `session.rescheduled`, `session.cancelled`, `session.recording_available`.
  Cancellation cannot wait for a window, so it stays event-driven.
- **Capture a tutor phone number.** `nclex_users.phone_number` exists, is
  **empty for every tutor**, and no screen collects it (`tutor/profile` calls
  contact fields "separate future work"). `enrolment.rejected` already renders
  the row conditionally, so the email is ready and the input is not. ⭐ Matters
  more than it looks: the core audience reaches for WhatsApp before email.
- ⚠ **The enquiry-form swallow.** `nclex_submit_enquiry` is idempotent on
  (programme, email) — where an open lead exists it returns that lead and
  **never inserts the new message**, while showing a success tick. Affects
  **every repeat enquirer**, not just the rejected students who surfaced it.
  Shipped public path; own slice.
- ⚠ **"QAcademy" still reaches readers in 16 places** (home, programmes,
  checkout, bank-access, `<title>`/meta, both footers, the payment-history
  drawer) while the company is **Quademia**. Cosmetic, not misinforming, so
  not urgent — but it undercuts the identity arc's one-name goal. ⓘ **Two of
  the sixteen are the copyright line** ("QAcademy Educational Consult"), which
  is a **legal-name** question, not a branding one — do not sweep those with
  the rest.
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
