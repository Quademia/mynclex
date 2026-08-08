# Transactional Email — Trigger Registry

*Status: planning / capture only. No email layer is built yet (a known v1
deferral). This doc is the single source of truth for **every point in the app
that should send an email**, so that when we build the email arc post-MVP
nothing is missed. See [main.md](main.md) and
[payments-and-enrolment.md](payments-and-enrolment.md).*

Last updated: 2026-08-06 (invite moves out of the Supabase-managed section and
into this layer — see the ⚠ note at the bottom; identity templates branded).

---

## Why this exists

Email should have been wired from the start; it wasn't. Rather than retrofit it
feature-by-feature, we will build it **once, as a focused arc, after the core
app is in good shape**. Until then the rule is: **whenever we build something
that ought to send an email, we (1) add a row to the catalog below and (2) drop
a greppable marker at the exact code location.** When the email arc lands, this
registry IS the build checklist and the markers ARE the wiring points.

## Target stack (from CLAUDE.md)

- **Resend** for delivery, via a **dedicated MyNclex email worker**
  (`workers/`), kept separate from the main app.
- Sends are **app-layer** (a server action / route / the email worker) — never
  from a Postgres trigger. For state changes that happen purely in a DB trigger
  (e.g. attendance → progress), the email anchor is the app action that drives
  it, or a future **outbox** row the worker drains.
- **Supabase Auth** already owns a separate set of identity emails (invite,
  email confirmation, password reset, magic link). Those are **not** part of
  this transactional layer — they're configured in Supabase. They're listed in
  the "Supabase-managed" section below only so the full picture is in one place.
  ⚠ **Corrected 2026-08-06:** this line used to end "we don't send them through
  Resend", which stopped being true when custom SMTP went live. They *are*
  delivered by Resend now — the split is about **who composes and triggers**
  the email (Supabase, from a dashboard template, with no access to programme
  or payment data), not about which wire it goes down. Both layers leave the
  building through the same Resend account.

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

`Anchor` = does the code path that should fire this already exist?
✅ exists (needs a marker) · ⬜ not built yet (mark when built).

### Enrolment & access

| Event key | Trigger | Recipient | Purpose | Pri | Anchor |
|---|---|---|---|---|---|
| `enrolment.confirmed` | A paid checkout completes and the enrolment row is created | student | "You're enrolled" — programme/cohort, what's next, link in | P1 | ✅ |
| `enrolment.tutor_added` | Tutor manually adds a student (cohort add / self-paced add / waitlist convert) | student | "Your tutor enrolled you" — set-password/login + link in | P1 | ✅ |
| `waitlist.joined` | Student/lead joins a cohort waitlist | lead | Acknowledge waitlist position | P2 | ✅ |
| `waitlist.converted` | Tutor converts a waitlisted lead to enrolled | student | "A place opened up — you're in" | P2 | ✅ |
| `enrolment.access_expiring` | Access window is N days from expiry (scheduled job) | student | Renew / heads-up before losing access | P2 | ⬜ |
| `enrolment.access_expired` | Access window passes | student | Access ended, how to renew | P2 | ⬜ |

### Payments

| Event key | Trigger | Recipient | Purpose | Pri | Anchor |
|---|---|---|---|---|---|
| `payment.received` | A payment is recorded — Paystack success OR tutor "mark paid" | student | **Receipt**: amount, method, plan, balance remaining | P1 | ✅ |
| `payment.failed` | Paystack reports a failed/declined charge | student | Payment didn't go through, retry link | P1 | ✅ |
| `payment.installment_due` | An installment is approaching its due date (scheduled job) | student | Reminder + pay link | P1 | ⬜ |
| `payment.installment_overdue` | An installment passes its due date unpaid | student | Overdue notice + grace info | P1 | ✅ (state) / ⬜ (job) |
| `payment.grace_set` | Tutor grants a first-payment / installment grace | student | "Your tutor extended your due date to X" | P2 | ✅ |
| `payment.refunded` | A payment is refunded | student | Refund confirmation | P2 | ✅ |
| `payment.tutor_received` | A student payment lands — Paystack success OR tutor "mark paid" | tutor | "Ama paid GHS X for Cohort Y" — payer, amount, plan, cohort. **Required on every payment** (the tutor-side half of the pair below); per-event vs digest is a delivery choice (see open questions) | P1 | ✅ |

> **Every payment notifies BOTH sides.** A received payment is a paired send:
> `payment.received` (the student's receipt) **and** `payment.tutor_received`
> (the tutor's "money's in"). Both are P1 — neither side should be left in the
> dark when money moves. Applies to the same anchor (Paystack success and the
> tutor "mark paid" path); the tutor-side cadence (per-event vs daily digest) is
> the only open delivery question, not whether it's sent.

### Live sessions

| Event key | Trigger | Recipient | Purpose | Pri | Anchor |
|---|---|---|---|---|---|
| `session.scheduled` | Tutor schedules / announces a session date for a cohort | cohort students | "Live session set for <when>" + join details | P1 | ✅ |
| `session.reminder` | T-24h and/or T-1h before a scheduled session (scheduled job) | cohort students | Reminder + join link | P1 | ⬜ |
| `session.rescheduled` | A scheduled session's date/time changes | cohort students | New time | P2 | ✅ |
| `session.cancelled` | A scheduled session is removed | cohort students | It's off | P2 | ✅ |
| `session.recording_available` | A recording URL is added to a held session | cohort students | "Recording's up" | P3 | ✅ |

### Enquiries (Slice 8)

| Event key | Trigger | Recipient | Purpose | Pri | Anchor |
|---|---|---|---|---|---|
| `enquiry.received` | A student/lead submits an enquiry on a programme | tutor | "New enquiry from X" + link to the queue | P1 | ✅ |
| `enquiry.replied` | Tutor replies to an enquiry | lead/student | The tutor's reply (or "you have a reply") | P1 | ✅ |

### Account / onboarding (OUR layer)

| Event key | Trigger | Recipient | Purpose | Pri | Anchor |
|---|---|---|---|---|---|
| `account.welcome` | First successful account setup at `/welcome` | student | Welcome + orientation (distinct from the Supabase invite) | P2 | ✅ |
| `tutor.invited` | Admin vets + invites a tutor to the platform | tutor | "You've been approved as a MyNclex tutor" + setup | P2 | ⬜ |

### Engagement / nudges (P3 — design later)

| Event key | Trigger | Recipient | Purpose | Pri | Anchor |
|---|---|---|---|---|---|
| `progress.inactivity_nudge` | No activity in N days (scheduled job) | student | "Pick up where you left off" | P3 | ⬜ |
| `progress.milestone` | Student completes a unit / the programme | student | Encouragement / certificate hook | P3 | ⬜ |
| `curriculum.content_released` | New activity becomes available (release date passes) | cohort students | "New content unlocked this week" | P3 | ⬜ |

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

## Open questions for the email-arc design (later)

- Per-event **opt-out / preferences**? (Transactional vs marketing — most of the
  above are transactional and shouldn't be opt-out-able; nudges should.)
- **Digest vs per-event** for tutor-facing volume (`payment.tutor_received`,
  `enquiry.received`).
- **Outbox table** vs direct send from the action (reliability / retries /
  idempotency — a real concern for `payment.*`).
- Which sends need the **scheduled-job** runner we don't have yet
  (`*.reminder`, `*.due`, `*.expiring`, nudges) — that infra is its own piece.
- Templating + localisation (GH/UK/CA audiences).
