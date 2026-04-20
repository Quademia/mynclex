# MyNclex — Payments & Enrolment

*Living document. Part of the `mynclex/docs/product-plan/` set —
see [main.md](main.md) for the overall product plan.*
Last updated: 2026-04-20 (self-study enrolment settled)

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
- **Tutored enrolment** — open. Covers how a student joins a
  specific tutor's programme, the subsidised-bank bundling, and
  cohort-start mechanics. Pricing commercials already settled
  (see [main.md](main.md) Pricing section).

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

**Open topic.** To be settled in a follow-up planning session.

Scope will cover:

- Student discovery of tutored programmes (how they find a specific
  tutor's programme).
- The bundled transaction — programme fee + subsidised bank access
  (50% per Pricing) as one payment.
- Cohort-start waiting room (students enrolled before cohort start
  date).
- Rolling-mode immediate start.
- Late enrolment handling (tutor-configurable per programme).
- Programme-specific onboarding if any.

Pricing commercials already settled (see
[main.md](main.md) Pricing section): dual currency, tutored
students pay tutor fee + 50% bank to QAcademy directly, no payment
splits.

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
- `mynclex/CLAUDE.md` — stack, conventions, extraction rule.
