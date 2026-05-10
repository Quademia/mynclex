# MyNclex — Payments & Enrolment

*Living document. Part of the `mynclex/docs/product-plan/` set —
see [main.md](main.md) for the overall product plan.*
Last updated: 2026-05-10 (programme/cohort split — Tutored enrolment rewritten around the cohort layer; students enrol in cohorts, not programmes)

---

## What this covers

Everything related to how a student gets and maintains access to
MyNclex — signup, payment, product catalogue, subscription lifecycle,
and the parallel paths for self-study vs tutored students. Future
topics like refunds, upgrades, and discount codes will also live in
this file.

---

## Settled / open status

- **Self-study enrolment — SETTLED 2026-04-20.**
- **Tutored enrolment — SETTLED 2026-04-20.**

---

## Shared infrastructure

These apply across both self-study and tutored enrolment.

### The `nclex_products` table

The single catalogue of everything a student can purchase:

```
product_id        TEXT PRIMARY KEY
name              TEXT NOT NULL
kind              TEXT NOT NULL DEFAULT 'PAID'
                  -- PAID | TRIAL
pack_type         TEXT NOT NULL
                  -- BANK_DURATION | READINESS | TRIAL
status            TEXT NOT NULL DEFAULT 'active'
                  -- active | archived
duration_days     INTEGER
                  -- nullable; NULL for readiness packs (no expiry)
price_minor_ghs   INTEGER NOT NULL
price_minor_usd   INTEGER NOT NULL
                  -- for TRIAL rows, both are 0
readiness_pack_id TEXT
                  -- nullable FK to nclex_readiness_packs;
                  -- set only when pack_type = 'READINESS'
created_at        TIMESTAMPTZ DEFAULT NOW()
```

**Dropped from the Licensure pattern** (`products` table):

- `courses_included[]` — single programme, no per-course bundling.
- `telegram_group_keys` — not in MyNclex plan.
- `currency` — replaced by dual `price_minor_ghs` + `price_minor_usd`
  columns.

**Dropped `FREE` as a kind value** (Licensure uses PAID / TRIAL /
FREE). MyNclex uses only PAID and TRIAL.

### Dual currency handling

Every paid product carries two prices — one GHS, one USD. The
student picks currency on the landing page (GHS default, toggle to
USD). The frontend passes `currency` as a parameter to the payment
worker alongside `product_id`. The worker reads the matching price
column and charges Paystack in that currency.

### Payment worker

A MyNclex-specific Cloudflare Worker, parallel to the Licensure
payment worker:

- Dev: `qacademy-dev-mynclex-payment-worker`
- Prod: `qacademy-mynclex-payment-worker`

Mirrors the Licensure worker's architecture and routes:

- `POST /payments/init-public` — new student (no account) initiates
  payment.
- `POST /payments/init-upgrade` — logged-in student buys more access.
- `GET /payments/verify` — verify payment with Paystack, activate
  subscription.
- `POST /payments/setup-complete` — create account for student who
  paid before registering.

Payment statuses (same as Licensure):
`INIT` → `PAID` → `ACTIVATED`, with `SETUP_REQUIRED` as a branch
when the student paid before an account existed.

### Parallel tables (MyNclex-prefixed)

- `nclex_products` — catalogue (see schema above).
- `nclex_users` — MyNclex user accounts (schema finalised in build).
- `nclex_subscriptions` — active and historical subscriptions.
- `nclex_payments` — payment audit trail.

Full schemas, RLS, and relationships finalised during build — not
planning. Shape mirrors the Licensure equivalents with the
differences called out above.

### Pay-first principle

No half-made accounts. The `nclex_users` row only exists after
either:

- the student paid AND completed the setup form, OR
- the student signed up for a free trial.

Abandoned payments leave an `INIT` row in `nclex_payments` but no
user record.

---

## Self-study enrolment

**Settled 2026-04-20.**

A student buying standalone bank access, outside any tutored
programme.

### Landing page

Public page at (final path TBD, likely `qacademynurses.com/nclex`
or the MyNclex Cloudflare Worker landing URL).

**Above the fold:**

- Logo + tagline.
- Currency toggle (top-right): **GHS | USD**. GHS is default.

**Section 1 — Bank Access.** Four cards in a row, left to right:

| Card | Pack | Price | Action |
|---|---|---|---|
| 7-day Trial | free | `₵0 / $0` | "Start Trial" → register flow |
| 30 days | duration pack | live | "Buy" → subscribe flow |
| 90 days | duration pack | live | "Buy" → subscribe flow |
| 180 days | duration pack | live | "Buy" → subscribe flow |

**Section 2 — Exam Readiness Assessments.** One card per readiness
pack from `nclex_readiness_packs` joined with `nclex_products`.
Each card shows pack name, question count, price, "Buy" button.

Sections 3+ (FAQ, testimonials, sample-question teaser) deferred to
v2 or post-launch marketing iteration.

### Two paths on card click

**Paid card → pay-first flow:**

1. Student lands on the subscribe page (MyNclex equivalent of
   Licensure's `subscribe.html`).
2. Enters email, selects currency (inherited from landing-page
   toggle, changeable here), confirms product.
3. Clicks Pay. Frontend posts `{ email, product_id, currency }` to
   `POST /payments/init-public`.
4. Worker creates an `INIT` row in `nclex_payments`, calls Paystack
   with the correct currency and price, redirects student to
   Paystack checkout.
5. Student pays. Paystack redirects back to the payment
   confirmation page with a reference.
6. Confirmation page calls `GET /payments/verify` with the
   reference. Worker verifies with Paystack.
7. If an `nclex_users` account already exists for that email →
   activate subscription immediately → status `ACTIVATED`.
8. If no account yet → status `SETUP_REQUIRED` → show setup form
   (name, password). Student completes form → account created →
   subscription activated → logged in → dashboard.

Setup token mechanism (48-hour expiry; admin can refresh by
issuing a new link) inherited from Licensure.

**Trial card → sign-up-first flow:**

1. Student lands on the register page (MyNclex equivalent of
   Licensure's `register.html`).
2. Enters email, password, name.
3. Account created in `nclex_users`. Trial product
   (`NCLEX_TRIAL` or equivalent) auto-assigned as a subscription
   with `source = 'SELF_TRIAL_SIGNUP'` (matching Licensure's
   convention).
4. Logged in. Dashboard.

### Post-payment experience (paid path)

**1. Welcome email.** Sent immediately on activation via a MyNclex
email worker. Includes: confirmation of purchase, product name,
expiry date, amount paid, login link. Reuses the Licensure email
worker architecture (own MyNclex instance, separate Resend sender).

**2. First login → dashboard.** No forced onboarding. The dashboard
cold-starts with visible calls-to-action:

- "Start practising" → primary button to the bank / quiz builder.
- "Plan your path" → secondary link to the Journey Tracker.

Diagnostic quizzes, onboarding carousels, and forced first-action
flows are all **deferred** to v2+.

**3. "My Payments" page.** A dedicated student page listing their
transactions. One row per payment: date, product, amount, currency,
status. Low-frills, reference-and-trust-building.

### Edge cases (inherit Licensure behaviour)

- **Payment abandoned mid-flow.** Paystack stays pending. MyNclex
  has an `INIT` row in `nclex_payments`. No user account created.
  No follow-up action needed.
- **Duplicate email at setup.** If an `nclex_users` account already
  exists for the email, the subscription activates against the
  existing account — no new account created, no duplicate.
- **Setup token expiry (48 hours).** Student contacts admin.
  Admin issues a fresh setup link.
- **Refunds.** Manual, admin-handled. Not a build concern for v1.

### Out of scope for this section

- Journey Tracker state at signup — the Journey Tracker is its
  own feature area with its own initialisation logic, not an
  enrolment concern.
- Tutored programme enrolment — covered below (open topic).

---

## Tutored enrolment

**Settled 2026-04-20. Reframed for the programme/cohort split
2026-05-10** — students enrol in cohorts, not programmes. Programme
is the shop window; cohort is the ticket.

A student joining a specific tutor's programme, outside or alongside
self-study bank access.

### Discovery — public programmes list

A single public page lists all *discoverable* tutored programmes —
no marketplace bells, just a directory.

- Card per programme: title, tutor name, brief description, price
  (or *Contact* button — see below), key details (length in weeks,
  next available cohort's start date if any).
- Only programmes from vetted, active tutors appear.
- **A programme is publicly discoverable only when it has at least
  one open cohort** (UPCOMING, or IN_PROGRESS with late-join
  allowed). PUBLISHED programmes with zero open cohorts are
  treated as not-yet-launched — they don't appear on the list.
  This prevents dead-end discovery pages.

### Programme detail page

Clicking a card opens the programme detail page with the full
description, syllabus shape, tutor bio, pricing, and a **list of
available cohorts**. Each cohort row shows:

- Cohort name (auto from dates or tutor-named)
- Start date → end date
- Seats remaining (or *Open* if uncapped)
- Status pill (Upcoming / In progress + late-join open)
- **Enrol** button per row (or *Contact* if the programme is
  contact-first — see below)

A student picks one cohort and clicks Enrol. Multiple cohorts of
the same programme can run in parallel (e.g. weekday + weekend
intensive); the student picks the one that fits their schedule.

### Price visibility — tutor choice

Each programme carries a boolean `show_price_publicly` (default
`TRUE`). It's a programme-level field — all cohorts of a
programme share the same visibility setting.

- `TRUE` — programme card and cohort rows show the price; cohort
  rows have *Enrol* buttons leading to the bundled checkout.
- `FALSE` — programme card and detail page show a *Contact*
  button leading to the enquiry form (below). No price visible
  on any cohort row.

### Contact-first flow — pass-through enquiry

When `show_price_publicly = FALSE`, students don't contact the
tutor directly. Enquiries route through QAcademy.

**Student experience:**

1. Click *Contact* → simple enquiry form (name, email, phone,
   message). The enquiry is about the programme; cohort isn't
   chosen yet (tutor figures that out during the conversation).
2. Submit → stored in `nclex_programme_enquiries` → "Thanks,
   we'll be in touch" confirmation.
3. No account creation required.

**Platform experience:**

- Enquiry logged with status `NEW`.
- Auto-forwarded to the tutor via email (platform pass-through).
- Status transitions to `FORWARDED`.
- If the student later enrols in any cohort of that programme
  (matched by email), status becomes `CONVERTED`.
- Admin can view all enquiries in a lightweight queue; can mark
  stale ones `CLOSED`.

**`nclex_programme_enquiries` schema (planning shape; finalised in
build):**

```
enquiry_id    TEXT PRIMARY KEY
programme_id  TEXT FK -> nclex_programmes
name          TEXT
email         TEXT
phone         TEXT   -- nullable
message       TEXT
status        TEXT   -- NEW | FORWARDED | CONVERTED | CLOSED
created_at    TIMESTAMPTZ DEFAULT NOW()
forwarded_at  TIMESTAMPTZ   -- nullable
notes         TEXT          -- admin notes, nullable
```

Enquiry is programme-scoped, not cohort-scoped — the student
hasn't picked a cohort yet at enquiry time, and the tutor often
slots the converted student into whichever cohort fits their
timing best.

### Bundled transaction — single Paystack checkout

When a student pays to join a cohort, they pay **one bundled
price** covering:

- Tutor's programme fee (set by tutor; same price for every cohort
  of the same programme in v1 — cohort-level pricing variation is
  deferred).
- QAcademy's subsidised bank access (50% of the standalone bank
  price for the closest match to the cohort's duration — per the
  Pricing commercials in [main.md](main.md)).

**Student sees one total price. Student pays once.** The split is
internal:

- Paystack charges the full amount to QAcademy.
- Internal accounting records the tutor's share and QAcademy's
  share separately.
- Tutor payouts are manual for v1 (per Pricing — automated splits
  deferred).

This keeps the checkout simple and avoids the dropoff risk of
two-step payment flows.

### Auto-enrolment on successful payment

When the bundled payment activates, the system creates:

- A new row in `nclex_enrolments` linking the student to the
  **cohort** (programme is inferrable via `cohort.programme_id`).
- A new row in `nclex_subscriptions` for the bundled bank access
  (matching the cohort's duration).
- An `ACTIVATED` entry in `nclex_payments`.

All three in one atomic step. Student is immediately enrolled and
lands on dashboard.

### Tutor-added enrolment

A second path: a tutor adds a student directly to a specific
**cohort** from inside the cohort workspace, at any point in the
cohort's lifecycle. No payment row is created — QAcademy absorbs
the bank-pack cost (the tutor "comps" the access for that
student).

- **Self-paid path** sets `enrolment_source = 'SELF_PAID'` on the
  `nclex_enrolments` row.
- **Tutor-added path** sets `enrolment_source = 'TUTOR_ADDED'`.

The bundled bank-pack subscription is created either way;
bank-access dates match the cohort's `start_date → end_date`.

Per-tutor quota mechanics (limiting how many tutor-added enrolments
a tutor can comp based on their subscription tier) are deferred to a
later slice.

### No waiting room

Regardless of the cohort's start date, an enrolled student's
dashboard goes live immediately after payment. The cohort appears
on their dashboard from moment one. What content is visible
*inside* the cohort is governed by per-cohort release dates on the
checklist activities — see *Programme Structure → Content
visibility* in [main.md](main.md).

There is no dedicated "waiting room" page.

### Edge cases

| Scenario | System behaviour |
|---|---|
| Cohort full (cohort_size cap reached) | Cohort row shows "Fully subscribed" pill. Not purchasable. Other cohorts of the same programme stay purchasable. No waitlist in v1. |
| Cohort started + late-join is OFF | Cohort row shows "Enrolment closed" pill. Not purchasable. |
| Cohort started + late-join is ON | Cohort row stays purchasable; bank-access duration still matches the cohort end-date already on file. |
| Programme PUBLISHED but zero open cohorts | Programme hidden from the public list (see Discovery above). |
| Tutor soft-stopped (per Tutor Onboarding) | All of the tutor's programmes hidden from the public list. Existing enrolled students retain cohort + bank access until each cohort's end_date. |
| Cohort cancelled (admin or tutor) | Cohort flips to CANCELLED. Cohort hidden. Refunds handled manually, off-platform. Other cohorts of the same programme unaffected. |
| Programme cancelled (admin) | All of its cohorts cascade to CANCELLED. |
| Student already enrolled in this cohort | Detection on enrolment attempt → "You're already enrolled — open the cohort." |
| Student enrolled in multiple cohorts (same or different programmes) | Allowed. Each is a separate enrolment row with its own payment and own bundled bank subscription. |

### Parallel tables (MyNclex-prefixed)

New tables needed for tutored enrolment:

- `nclex_cohorts` — one row per cohort. Holds the cohort-level
  fields (dates, size, late-join, status, name override) and a FK
  to `nclex_programmes`. Schema finalised in build.
- `nclex_enrolments` — student ↔ cohort link, with status and
  timestamps. Programme is inferrable via the cohort. Schema
  finalised in build.
- `nclex_programme_enquiries` — contact-first enquiry audit trail
  (stays programme-scoped, not cohort-scoped — see above).

### Out of scope for this section

- Per-cohort content release / drip rules (handled via per-cohort
  release dates on the checklist — see Programme Structure in
  [main.md](main.md)).
- Automated tutor payout splits (deferred — see Pricing).
- Cohort-level pricing variation (deferred — programme price
  applies to every cohort in v1).
- Waitlists when a cohort is full (deferred).
- Refund workflow in admin (manual for v1).
- Student-initiated cancellation or cohort transfer between
  cohorts of the same programme (deferred).

---

## Deferred (v2+)

- Payment methods beyond Paystack.
- Group / institutional licences.
- 365-day bank packs.
- Discount codes and promotions.
- Refund workflow in admin (currently manual / off-platform).
- Subscription auto-renewal.
- Gift subscriptions.

---

## Related

- [main.md](main.md) — overall product plan (Pricing section
  covers commercial numbers; Roles covers who can pay for what).
- [bank.md](bank.md) — the product that bank-pack subscriptions
  unlock access to.
- [tutor-library.md](tutor-library.md) — parked feature; library
  visibility for tutored students depends on the enrolment flow
  defined here.
- `mynclex/CLAUDE.md` — stack, conventions, extraction rule.
