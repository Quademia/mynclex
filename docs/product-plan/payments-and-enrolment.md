# MyNclex — Payments & Enrolment

*Living document. Part of the `mynclex/docs/product-plan/` set —
see [main.md](main.md) for the overall product plan.*
Last updated: 2026-05-17 (Self-paced enrolment + Programme access window both settled — new top-level sections added for each. Self-paced: self-serve on-platform only, one access window per programme, same payment strategies as tutored but anchored to enrolment date, instant enrolment no tutor mediation. Access window cross-cutting: Pattern A adopted (tutor-set per programme, contingent on tutor maintaining the monthly sub — industry standard). Earlier in this same day: Programme enrolment model revised — old bundled-bank checkout dropped in favour of decoupled Option C (opt-in bank at 40% off + tutor-mediated enrolment + tutor-configurable payment strategies + on-platform vs off-platform collection toggle). Old "Bundled transaction" / "Auto-enrolment on payment" / "Tutor-added enrolment" subsections marked SUPERSEDED in-place; new "Settled 2026-05-17" subsection inside Tutored enrolment carries the revised model. Auth-model alignment + enrolment-source enum + tutor-sub revisit + waitlist behaviour all noted as Still open in that subsection. Earlier today: readiness packs settled — 5 identical-shape packs (100 Q × 3hr 20min each), one shot per pack, permanent until activated, 21-day window on activation; 3-SKU standalone catalogue (Single / Select 3 / All 5) with prices fixed; bundle-into-bank tier counts settled (0/0/1/2/3/5 across the 6 bank tiers); credits model for bundled packs. Earlier today: bank pricing settled — 6-tier catalogue with GHS + USD prices fixed; readiness packs bundled into longer tiers with a 21-day activation window. Previous touch 2026-05-11: programme length surfaced as "weeks" or "modules" per the programme's `unit_label` (a separate tutor choice, not derived from delivery mode). Both tutor-led and self-paced ship in v1 — self-paced enrolment flow drafted in [curriculum-authoring-ux.md](curriculum-authoring-ux.md) → "Self-paced surface (screen 12+)" with full flow + access-window pricing finalised in build. Programme/cohort split from 2026-05-10 retained.)

---

## What this covers

Everything related to how a student gets and maintains access to
MyNclex — signup, payment, product catalogue, subscription lifecycle,
and the parallel paths for self-study vs tutored students. Future
topics like refunds, upgrades, and discount codes will also live in
this file.

---

## Settled / open status

- **Self-study enrolment — SETTLED 2026-04-20.** Bank pricing
  settled 2026-05-17; readiness pack format + pricing + bundling
  settled 2026-05-17.
- **Tutored enrolment — REVISED 2026-05-17.** Headline model
  decoupled (opt-in bank, tutor-mediated enrolment, flexible
  payment strategies). A handful of sub-topics still open — see
  "Still open" inside *Tutored enrolment → Settled 2026-05-17*.
- **Programme access window — SETTLED 2026-05-17.** Pattern A
  adopted: tutor-set per programme, all access contingent on
  tutor maintaining their monthly platform subscription. Applies
  to both tutored and self-paced.
- **Self-paced enrolment — SETTLED 2026-05-17.** Self-serve
  on-platform only, one access window per programme, same payment
  strategies as tutored but anchored to enrolment date.

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

**Section 1 — Bank Access.** Six cards in a row, left to right:

| Card | Pack | GHS | USD | Action |
|---|---|---|---|---|
| 7-day Trial | free | ₵0 | $0 | "Start Trial" → register flow |
| 30 days | duration pack | ₵120 | $30 | "Buy" → subscribe flow |
| 60 days | duration pack | ₵200 | $50 | "Buy" → subscribe flow |
| 90 days | duration pack | ₵270 | $70 | "Buy" → subscribe flow |
| 180 days | duration pack | ₵450 | $110 | "Buy" → subscribe flow |
| 365 days | duration pack | ₵700 | $160 | "Buy" → subscribe flow |

Settled 2026-05-17 — see *Pricing — Bank* below for the reasoning
and the alternative pricings considered.

**Section 2 — Exam Readiness Assessments.** Three SKU cards in a
row (Single / Select 3 / All 5):

| Card | What it grants | GHS | USD | Action |
|---|---|---|---|---|
| Single Pack | 1 pack — student picks any 1 of the 5 | ₵100 | $20 | "Buy" → subscribe flow |
| Select 3 | 3 packs — student picks any 3 of the 5 | ₵240 | $48 | "Buy" → subscribe flow |
| All 5 | All 5 packs unlocked | ₵350 | $70 | "Buy" → subscribe flow |

Each card carries the same headline copy under the title: *"100
questions · 3 hours 20 minutes · one shot per pack · 21-day window
on activation."* Selection of which specific packs to claim happens
post-purchase (so a returning student isn't blocked from buying by
the SKU shape). See *Pricing — Readiness packs* below for the
reasoning and the bundle-into-bank value table.

Sections 3+ (FAQ, testimonials, sample-question teaser) deferred to
v2 or post-launch marketing iteration.

### Pricing — Bank

**Settled 2026-05-17.** Dual-currency, six tiers, per-day cost
drops with duration.

**Settled prices:**

| Plan | GHS | USD | GHS $/day | USD $/day | % monthly GH salary |
|---|---|---|---|---|---|
| 30 days | ₵120 | $30 | ₵4.00 | $1.00 | ~5% |
| 60 days | ₵200 | $50 | ₵3.33 | $0.83 | ~10% |
| 90 days | ₵270 | $70 | ₵3.00 | $0.78 | ~13% |
| 180 days | ₵450 | $110 | ₵2.50 | $0.61 | ~22% |
| 365 days | ₵700 | $160 | ₵1.92 | $0.44 | ~33% |

(% monthly Ghana salary anchored to ~₵2,000–2,200 entry-level
nursing salary, May 2026.)

**Principles:**
- **GHS anchored to local salary** (~5–33% of monthly entry salary
  across tiers). A Ghanaian nurse can buy 30 days for the cost of
  a meal out; can buy 365 days for ~2 weeks salary.
- **USD anchored to competitors** (Archer-tier — well under UWorld).
  Mid-tier value framing; we're new, so we can't price like UWorld.
- **GHS ≠ USD conversion deliberately.** At FX ~11.44 (May 2026),
  ₵120 = $10.50, but international price is $30. Regional pricing
  pattern (Spotify, Netflix, every major global SaaS). Local market
  stays accessible; diaspora pays a quality-signalling premium.
- **Per-day curve rewards commitment.** ~2.5× drop from 30d to 365d
  in both currencies. Gentler than UWorld's ~7× drop, steeper than
  Bootcamp's flat curve.

**Market reference (2026-05, for context):**

| Platform | 30d | 60d | 90d | 180d | 365d |
|---|---|---|---|---|---|
| UWorld | $139 | $169 | $249 | $329 | $389 |
| Bootcamp | $80 | $160 | $240 | — | — |
| Archer Rapid Combo | — | $89 | $109 | $169 | $199 |
| **MyNclex (USD)** | **$30** | **$50** | **$70** | **$110** | **$160** |

**Alternative pricings considered** (for the record — not adopted):

| Plan | USD (FX conversion) | USD (suggested, ADOPTED) | USD (earlier, higher) |
|---|---|---|---|
| 30 days | $10.50 | **$30** | $50 |
| 60 days | $17.50 | **$50** | $80 |
| 90 days | $23.60 | **$70** | $110 |
| 180 days | $39.30 | **$110** | $170 |
| 365 days | $61.20 | **$160** | $240 |

- **FX conversion** ($10.50 → $61.20): too cheap-looking; signals
  inferior product to a diaspora buyer with a USD card.
- **Earlier, higher** ($50 → $240): originally proposed against
  UWorld's positioning, but our actual USD buyers are mostly
  diaspora (not Americans choosing between Qbanks). At those prices
  the diaspora buyer compares to GHS-converted and feels overcharged.
- **Suggested (adopted)** ($30 → $160): roughly 2.5–3× the FX
  conversion. Signals quality without being prohibitive. Sits at
  Archer's level (we're new, mid-tier value framing) and undercuts
  UWorld by ~40–60% at every tier.

**Single-currency stress test.** A USD-only catalogue would price
365d at $160 = ₵1,830 ≈ **83% of a Ghanaian nurse's monthly salary**
(vs 33% under the dual-currency settled plan). Would price out the
core local audience to keep the catalogue simple. Hence dual-currency
is kept.

**Revenue framing note** (rough, lifetime not monthly): at a
blended-mix average revenue per subscriber of ~$63, $1M USD in
bank-only revenue ≈ ~15,900 lifetime subscribers. Programmes and
readiness packs stack on top — bank-only is the volume play.

### Pricing — Readiness packs

**Settled 2026-05-17.** Five identical-shape packs, three standalone
SKUs, bundled credits per bank tier.

**Format (all 5 packs identical shape):**

- **Count in v1:** 5 packs.
- **Length:** 100 questions per pack (fixed, not CAT — predictive
  integrity needs a consistent denominator).
- **Time limit:** 3 hours 20 minutes (200 min = 2 min/Q, matching
  the real NCLEX's 5-hour / 150-Q pace).
- **Naming:** "Readiness Pack 1" → "Readiness Pack 5". Plain.
- **Question reservation:** pack questions carry
  `is_builder_visible = FALSE` so the student custom-quiz builder
  never sees them — kept from the earlier bank plan (see
  [bank.md](bank.md) §"Readiness packs"). Once a pack is taken,
  the questions stay hidden from the builder forever.

**Attempt rules:**

- **One shot per pack.** No retakes, no resets. UWorld follows
  the same rule for the same reason — if a student can retake the
  same 100 questions, the score isn't a real signal anymore.
- **Permanent until activated.** Packs sit dormant in the
  student's account forever once entitled (whether bundled or
  standalone). The clock only starts on "Start."
- **21-day window on activation.** Same for bundled and
  standalone. Chosen over UWorld's 14-day window — more generous,
  mild differentiation, still tight enough to feel focused rather
  than "a second bank subscription."
- **Window is independent of the bank subscription.** Unactivated
  packs survive bank expiry. Students can return weeks or months
  later, activate, get their 21 days.

**Standalone catalogue (3 SKUs):**

| SKU | What it grants | GHS | USD | USD per pack |
|---|---|---|---|---|
| Single Pack | 1 pack | ₵100 | $20 | $20 |
| Select 3 | 3 packs (any 3 of 5) | ₵240 | $48 | $16 (20% off) |
| All 5 | All 5 packs | ₵350 | $70 | $14 (30% off) |

**Bundled credits per bank tier:**

| Bank tier | Pack credits |
|---|---|
| Trial | 0 |
| 30 days | 0 |
| 60 days | 1 |
| 90 days | 2 |
| 180 days | 3 |
| 365 days | 5 (all) |

Readiness packs only kick in on serious commitment — 30d is pure
bank, no readiness sweetener.

**Bundle vs standalone value:**

| Tier | Bank price (USD) | Packs | Standalone pack value | Combo worth | Bundle saves |
|---|---|---|---|---|---|
| 30 days | $30 | 0 | — | $30 | — |
| 60 days | $50 | 1 | $20 | $70 | **$20** |
| 90 days | $70 | 2 | $40 (2× Single) | $110 | **$40** |
| 180 days | $110 | 3 | $48 (Select 3) | $158 | **$48** |
| 365 days | $160 | 5 | $70 (All 5) | $230 | **$70** |

(2-pack rows use 2× Single — there's no "Select 2" SKU; Select 3
would be more expensive for fewer packs of value.) GHS savings
scale the same way: GHS 100 / 200 / 240 / 350 across 60d / 90d /
180d / 365d.

**Interaction rules (bundle + standalone coexist):**

- Bundled packs are granted as **credits**, not pre-assigned
  packs. A 90d bank gives "2 credits" — the student picks which 2
  of the 5 packs to claim. Standalone purchases grant a specific
  pack directly.
- A student can buy standalone packs on top of a bundle.
- During standalone selection, the system **disables packs the
  student already owns** (whether owned via bundle-claim or prior
  standalone purchase). Prevents double-purchase, prevents wasted
  credits.

**Principles (echoing the bank plan):**

- **Single pack = $20 anchored to UWorld's standalone price.**
  Same anchor we used to set the per-pack market floor.
- **30% off at the All-5 tier.** Smooth discount curve — gentle,
  matches the bank's "reward commitment" pattern.
- **GHS regionally priced.** Single pack at ₵100 ≈ 5% of monthly
  Ghanaian entry-nursing salary. All 5 at ₵350 ≈ 16% of monthly
  salary — meaningful but accessible.
- **Bundle value is real, not cosmetic.** A 365d bank saves $70
  on the readiness side (44% of the bank price) — gives the bundle
  a genuine marketing line: *"a year of bank + all 5 readiness
  packs, $70 cheaper than buying separately."*

**Alternative pricings considered** (for the record — not adopted):

| SKU | GHS (lower, rejected) | GHS adopted | USD (lower, rejected) | USD adopted | USD (higher, rejected) |
|---|---|---|---|---|---|
| Single | ₵60 | **₵100** | $15 | **$20** | $25 |
| Select 3 | ₵150 | **₵240** | $35 | **$48** | $60 |
| All 5 | ₵220 | **₵350** | $50 | **$70** | $90 |

- **Lower (rejected):** undercut UWorld and felt too cheap —
  signals an inferior product, also weakens the bundled-into-bank
  value (5 packs "worth" $50 would make the 365d bundle feel like
  nothing extra).
- **Adopted ($20 / $48 / $70):** matches UWorld's anchor on the
  single, adds a smooth bulk discount, makes the bundle materially
  valuable.
- **Higher (rejected):** premium positioning, but the standalone
  All 5 at $90 starts encroaching on the 180d bank ($110) which
  blurs the product line.

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
- Tutored programme enrolment — covered below (revised 2026-05-17;
  a few sub-topics still open, see "Still open" in that section).

---

## Tutored enrolment

**Settled 2026-04-20. Reframed for the programme/cohort split
2026-05-10. Reframed again 2026-05-17** — the bundled-bank model
dropped in favour of an opt-in bank model (Option C): the tutor's
programme fee and QAcademy's bank pack are now decoupled.
Enrolment is tutor-mediated regardless of payment path. Multiple
payment strategies per programme. See the "Settled 2026-05-17"
subsection below for the full revised model; pre-revision body
preserved below it for discovery + detail-page sections that
didn't change.

A student joining a specific tutor's programme, outside or alongside
self-study bank access. Students enrol in **cohorts**, not programmes
directly — programme is the shop window, cohort is the ticket.

### Settled 2026-05-17 — revised model (opt-in bank + tutor-mediated enrolment + flexible payment strategies)

**Headline shift.** The 2026-04-20 plan bundled QAcademy's bank
pack into the programme checkout (50% subsidy, tutor picks bank
tier matching the cohort length, single Paystack checkout). The
2026-05-17 revision drops that. Tutor's programme fee and
QAcademy's bank pack are now **decoupled products**. Bank becomes
an opt-in recommendation at programme checkout (40% off standalone
prices). Reasons in §"Why decoupled" below.

#### Two payment-collection modes — tutor's choice per programme

Each programme carries a setting for how the **tutor's programme
fee** is collected. (QAcademy's bank line, if the student opts in,
is always collected by QAcademy regardless of this setting.)

- **Off-platform collection** (default) — tutor handles their own
  programme-fee collection however they want (mobile money, bank
  transfer, Stripe, off-platform invoicing). QAcademy never sees
  this money.
- **On-platform collection** (opt-in by tutor) — QAcademy collects
  the programme fee via Paystack and remits to the tutor (see
  *Remittance* below). Useful for tutors without their own payment
  infrastructure or those who want single-checkout convenience for
  students.

QAcademy does **not** take a cut of the programme fee in either
mode. The tutor's value to QAcademy is captured via the flat
monthly subscription (per main.md Pricing) and via the bank
opt-in revenue at checkout. Double-charging the tutor would
contradict the platform-not-parasite framing.

#### Enrolment — always tutor-mediated in v1

Regardless of payment-collection mode, **enrolment is mediated by
the tutor**. The tutor decides who gets in. Two entry paths
collapse to the same destination:

- **Student-initiated.** Student finds the programme on the public
  list, picks a cohort, joins the cohort's **waitlist** with their
  email (and an optional message). Tutor sees the request in the
  cohort workspace and approves once payment + readiness are
  confirmed.
- **Tutor-initiated.** Tutor invites a student directly from inside
  the cohort workspace (by email / invite link). Student accepts.
  No waitlist hop.

Both paths land at the same gate: a tutor click that flips the
student from "waitlisted / invited" to "enrolled." Only at that
moment does the `nclex_enrolments` row become active.

**Why tutor-mediated for v1.** The tutor is the business owner;
QAcademy is the platform. Letting the tutor decide who gets into
their cohort matches that mental model and avoids forcing the
platform to mediate payment-completion edge cases (off-platform
"did they actually pay me?" verification, refund disputes, etc.)
in v1.

#### Payment strategies — tutor configures, student picks

For on-platform collection, the tutor configures one or more
**allowed payment strategies** per programme. Each strategy can
have its own total price (a marketing lever: tutors often charge
more for installments to reward upfront payment).

v1 strategies:

- **Upfront full** — single payment.
- **Deposit + balance** — e.g. 50% to secure seat, 50% before
  cohort starts (or by a configured cut-off).
- **Equal installments** — N monthly payments (N configured by
  tutor).
- **Per-module** — pay as student progresses through units.
  **Deferred to v2** (more state, more access-cutoff edges).

The student sees all configured strategies at checkout and picks
one. Different strategies may show different total prices.

**Missed installment behaviour** (default; tutor can override
per-student):
- A few days before the due date, system sends a payment reminder.
- On the due date, if the installment hasn't been paid, **access
  to the cohort is paused** until paid.
- Tutor can manually mark paid (e.g. student paid off-platform) or
  extend the grace window.

#### On-platform money flow

When a student pays via QAcademy:

1. Student picks a cohort on the public list → joins waitlist
   → picks a payment strategy → Paystack checkout.
2. Money lands in QAcademy's account (Paystack settlement).
3. Tutor sees the paid waitlist entry in the cohort workspace.
4. Tutor approves the enrolment.
5. Student is enrolled; cohort appears on their dashboard.

**Remittance.** Money sits in QAcademy's account until the tutor
requests withdrawal. Admin processes payouts manually for v1
(mobile money / bank transfer / Wise / etc., depending on the
tutor's preferred destination). Auto-payouts via Paystack split
accounts are a v2 candidate.

**Refunds** (when the tutor rejects a waitlist entry, or under
exceptional circumstances post-enrolment): manual. Admin
processes case-by-case. Auto-refund on tutor rejection deferred
to v2 once the volume justifies the automation.

#### Off-platform money flow

When the tutor collects programme fees directly:

1. Student picks a cohort → joins waitlist with email + message
   (no payment on QAcademy at this step).
2. Tutor receives notification; arranges payment with student
   off-platform (mobile money, bank transfer, etc.).
3. Tutor verifies payment, approves the enrolment in the cohort
   workspace.
4. Student is enrolled; cohort appears on their dashboard.

Off-platform mode never touches QAcademy's payment infrastructure
for the programme fee. The bank opt-in at checkout (below) is the
only QAcademy-collected line in this mode.

#### Bank opt-in at programme checkout (Option C — decoupled)

The 2026-04-20 plan bundled bank into the programme checkout
(forced, subsidised at 50%). The 2026-05-17 revision drops this.
Bank becomes a **separate opt-in line** at checkout, with the
following rules:

- **Always offered.** Every programme checkout (on-platform and
  off-platform alike, for new students) shows the bank opt-in
  card. Tutor has no toggle to disable it. Reason: tutor-toggle
  would let some tutors zero-out QAcademy's per-enrolment revenue
  while still using the platform.
- **40% off standalone prices.** Global discount, admin-set. Not
  tutor-adjustable in v1 (avoids race-to-the-bottom on bank
  discount as a marketing lever).
- **All 5 tiers offered** (30 / 60 / 90 / 180 / 365 days). Since
  it's opt-in, no tier-match constraint to programme length.
  Student picks freely. (The 2026-04-20 constraint of bank tier ≥
  programme length was a bundled-model artefact — irrelevant once
  bank is decoupled.)
- **Readiness packs NOT shown at programme checkout.** Kept simple.
  Readiness packs continue to sell through the main readiness page.
- **Presentation:** emphasised recommendation card ("Recommended —
  add NCLEX Bank Access · save GHS X"), but **not pre-selected**.
  Student actively opts in. Pre-selected opt-out is a dark
  pattern; we avoid it.
- **Pricing table** (40% off standalone):

  | Tier | Standalone GHS | Programme price GHS | Standalone USD | Programme price USD | Saves |
  |---|---|---|---|---|---|
  | 30 days | 120 | 72 | $30 | $18 | $12 |
  | 60 days | 200 | 120 | $50 | $30 | $20 |
  | 90 days | 270 | 162 | $70 | $42 | $28 |
  | 180 days | 450 | 270 | $110 | $66 | $44 |
  | 365 days | 700 | 420 | $160 | $96 | $64 |

- **Existing bank access.** If the student already has bank access
  when they enrol, the opt-in still appears; if they buy, the new
  duration **stacks** on top of existing access (no overlap
  penalty). Same rule that holds for self-study bank purchases.

#### Why decoupled (vs the old bundled model)

The 2026-04-20 bundled model had complexity (tier-vs-programme
length validation, what-if-student-already-has-bank stacking
logic, readiness-pack credit carry-through, refund split logic)
and an implicit "force bank on programme students" stance that
sat awkwardly with the tutor-as-business-owner framing.

The 2026-05-17 decoupled model:

- Treats the programme as the tutor's pure product (tutor decides
  price, payment strategies, collection method) and the bank as
  QAcademy's pure product offered at programme checkout.
- Lower upfront price for the student (programme alone, no forced
  bank line).
- Cleaner mental model for everyone (tutor, student, QAcademy).
- Simpler implementation — fewer edge cases, fewer schema knobs.
- Per-enrolment revenue for QAcademy comes from voluntary bank
  opt-ins; if opt-in rate hits ~50% the expected revenue is
  comparable to the old 50%-subsidised forced bundle (~$25 vs
  ~$35 per enrolment), and the willing buyers tend to engage more.

#### Alternatives considered (documented for v2+)

Three alternative monetisation shapes were laid out and
deliberately not adopted:

- **Option A — current/old bundled-bank model.** Forced bank with
  50% subsidy bundled into checkout. Predictable per-enrolment
  revenue ($25–$80 depending on tier) but high complexity, lower
  trust, awkward forcing.
- **Option E (student-paid platform fee, no bank coupling).**
  Tutor pays monthly sub; student pays a separate per-enrolment
  platform fee (e.g. $5–10) at checkout; bank stays self-serve.
  Rejected: students don't see what the platform fee buys them
  (tax-like feel); bank is a more tangible value-add to charge for.
- **Option E-flipped (per-enrolment fee only, no sub).** No
  monthly fee; tutor pays $15/enrolment only when they actually
  enrol. Aligns revenue tightly with tutor success but loses the
  stable sub floor.

Slot if real-world signal pushes us to revisit:
- If opt-in rates underperform expectations and revenue per
  enrolment lags badly → consider Option A or E.
- If tutors complain that "students don't pay through QAcademy
  because they're paying directly anyway, so I get bank
  discount-conversion without the platform doing much" → consider
  raising the monthly sub or adding a small platform fee.

#### Still open (deferred from this revision)

These were flagged during the 2026-05-17 discussion but not
settled in this pass. They need revisiting before build:

- **Tutor monthly sub** — still $29/mo from main.md, or revisit
  in light of the decoupled revenue model?
- **Enrolment-source values** — the old `enrolment_source`
  enum was `SELF_PAID | TUTOR_ADDED`. Decoupling may introduce
  more (`TUTOR_ADDED_OFFLINE_PAID`, `TUTOR_COMPED`, `TRIAL_CONVERTED`,
  `ADMIN_GRANT` etc.). Finalise during build alongside the
  enrolments table.
- **Cohort full / waitlist behaviour** — old plan deferred
  waitlists; with tutor-mediated enrolment, the waitlist is now
  the entry point regardless. May need to revisit how "full
  cohort" interacts with the waitlist (does it block new
  entries, or queue them?).
- **Auth model alignment** — the parallel-tables section below
  still references `nclex_users` from the Licensure-era plan,
  but the live codebase uses Supabase Auth directly. Tables /
  schema need to be re-aligned during build.

*(Self-paced enrolment — resolved 2026-05-17 — see the new
top-level "Self-paced enrolment" section below.)*

---

### Discovery — public programmes list

A single public page lists all *discoverable* tutored programmes —
no marketplace bells, just a directory.

- Card per programme: title, tutor name, brief description, price
  (or *Contact* button — see below), key details (length — shown
  as "N weeks" or "N modules" per the programme's `unit_label`,
  e.g. "8 weeks" or "8 modules" — and next available cohort's
  start date for tutor-led, or "self-paced" for self-paced).
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

### Bundled transaction — single Paystack checkout *(SUPERSEDED 2026-05-17)*

> ⚠️ **Superseded by the 2026-05-17 revision above.** The bundled-
> bank model below was the 2026-04-20 plan; it has been replaced by
> the decoupled opt-in model (Option C). Kept in the doc for
> historical context only — do not implement.

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

### Auto-enrolment on successful payment *(SUPERSEDED 2026-05-17)*

> ⚠️ **Superseded.** Enrolment is tutor-mediated in the revised
> model — no auto-enrolment on payment. See the 2026-05-17 section
> above.

When the bundled payment activates, the system creates:

- A new row in `nclex_enrolments` linking the student to the
  **cohort** (programme is inferrable via `cohort.programme_id`).
- A new row in `nclex_subscriptions` for the bundled bank access
  (matching the cohort's duration).
- An `ACTIVATED` entry in `nclex_payments`.

All three in one atomic step. Student is immediately enrolled and
lands on dashboard.

### Tutor-added enrolment *(SUPERSEDED 2026-05-17)*

> ⚠️ **Superseded.** Tutor-added is now one of two entry paths
> within the unified tutor-mediated enrolment model (see 2026-05-17
> section above). The "QAcademy absorbs the bank-pack cost" framing
> no longer applies because bank is decoupled — if the student
> wants bank, they opt in at checkout and pay (40% off) just like
> any other student.

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

## Programme access window (cross-cutting — tutored + self-paced)

**Settled 2026-05-17. Applies to both tutored and self-paced
programmes equally.**

Tension to resolve: tutor owns the programme content, but
QAcademy owns the platform that hosts and delivers it. Access
policy has to honour both.

**Pattern A — tutor-controlled with platform dependency (adopted).**

- The tutor picks an **access window** per programme: e.g.
  lifetime, 24 months, 12 months, 6 months, 3 months from
  enrolment date. One window per programme.
- All student access is **contingent on the tutor maintaining
  their monthly platform subscription**. If the tutor cancels
  or lapses, students enter a transition period (length TBD in
  build, e.g. 90 days) during which they retain access and
  can download materials, then access locks.
- "Lifetime" is therefore honestly described to students as
  "lifetime of the tutor's subscription on QAcademy" — not
  "lifetime regardless of platform status." Matches industry
  standard (Teachable, Thinkific, Kajabi all work this way).
- The access window covers **programme content only**. Bank pack
  access is governed by the student's bank subscription
  separately (see *Self-study enrolment → Pricing — Bank*).

**Patterns considered and rejected:**

- **Pattern B — fixed window QAcademy-set.** QAcademy decides one
  global rule (e.g. "all programmes give 12 months access"),
  tutor has no say. Rejected: kills the tutor's ability to offer
  premium "lifetime" or short-burst "3 months" as a sales lever.
- **Pattern C — full lifetime regardless of tutor sub.** QAcademy
  hosts content forever even if tutor leaves. Rejected: turns into
  permanent platform obligation with no offsetting revenue once
  the tutor leaves; not financially sustainable.

**Interaction with payment strategies.** Access window is a
**post-enrolment** duration — counts forward from the enrolment
date. Payment strategies (upfront / deposit + balance /
installments) govern *how the programme fee is collected*; missed
installments pause access (per *Tutored enrolment* and *Self-paced
enrolment*) but don't shrink the window once paid.

---

## Self-paced enrolment

**Settled 2026-05-17.** Self-paced programmes share the
content structure of tutored programmes (Programme → Unit →
Block → Activity, per
[curriculum-authoring-ux.md](curriculum-authoring-ux.md)) but
differ on shape:

- **No cohorts.** Student enrols directly into the programme —
  no cohort row, no waitlist hop.
- **No live sessions.** Pure async content.
- **Self-serve enrolment.** Instant access on successful payment,
  no tutor approval gate.

### Pricing shape — one window, one price (v1)

Tutor picks **one access window** for the programme (e.g.
lifetime, 12 months, 6 months — see *Programme access window*
above) and **one programme price**. No access-tier laddering in
v1.

Considered: tiered access (e.g. "90d for $X, 180d for $Y,
lifetime for $Z") as in Udemy / Coursera. Deferred to v2 —
real demand from tutors hasn't surfaced yet, and shipping with
one price-per-programme keeps the model symmetric with
tutored.

### Payment-collection mode — on-platform only

Self-paced is **on-platform only** in v1 — QAcademy collects via
Paystack. No off-platform option. Reasons:

- The self-serve / instant-access experience is the whole
  point of self-paced; mediating it through manual tutor
  payment-verification defeats the model.
- Tutors who want off-platform collection should run tutored
  cohorts, where the waitlist + approval gate already supports
  off-platform verification.

If a tutor without on-platform payment infrastructure wants to
offer a self-paced programme in v1, the workaround is to run it
as a long-running "always-open" tutored cohort with off-platform
collection — minor UX impedance but no model change required.

### Payment strategies — same as tutored, anchored to enrolment date

Tutor configures one or more allowed payment strategies per
self-paced programme (same v1 set as tutored: upfront full /
deposit + balance / equal installments; per-module deferred to
v2). Each strategy can carry its own price (e.g. installments at
a slight premium).

**Anchor difference:** tutored strategies anchor to cohort dates
(deposit before cohort start, installments through cohort active
period). Self-paced strategies anchor to **enrolment date** (deposit
at enrolment, balance N days later, installments monthly from
enrolment). The strategy code path is the same; only the anchor
date differs.

**Missed installment** behaviour identical to tutored: reminder
before due date, programme access pauses on due date, tutor can
manually override per student (extend grace, mark paid).

### Enrolment flow

1. Student finds the programme on the public list.
2. Picks a payment strategy (if multiple offered).
3. Pays via Paystack.
4. On Paystack confirmation: enrolment row created immediately;
   programme accessible on dashboard.

No waitlist, no tutor approval gate. The tutor sees the
enrolment after the fact in their cohort/programme workspace.

### Bank opt-in at checkout

Self-paced checkout shows the same bank opt-in card as tutored
(see *Tutored enrolment → Bank opt-in at programme checkout
(Option C — decoupled)*). Same 40% discount, same 5-tier offering,
same emphasised-recommendation-but-not-pre-selected UX. Readiness
packs not shown.

### Edge cases

| Scenario | System behaviour |
|---|---|
| Student already has bank access | Bank opt-in still shown; if bought, new duration stacks on existing (same rule as bank standalone purchases). |
| Tutor cancels platform subscription | Student's programme access enters transition period (see *Programme access window*), then locks. |
| Tutor archives the programme post-enrolment | Existing enrolled students retain access until their access window expires. Programme hidden from the public list. |
| Refund for self-paced | Manual, admin-handled — same policy as tutored. |

### Out of scope for self-paced v1

- Tiered access-window pricing (90d / 180d / 365d / lifetime
  laddered). Deferred to v2.
- Per-module pay-as-you-go (the strategy that fits self-paced
  best, but deferred across both programme types in v1).
- Self-paced cohorts (cohorts of self-paced enrollees with a
  shared start date but async progression) — a hybrid pattern
  worth considering in v2 if real tutor demand surfaces.

---

## Deferred (v2+)

- Payment methods beyond Paystack.
- Group / institutional licences.
- Discount codes and promotions.
- Refund workflow in admin (currently manual / off-platform).
- Subscription auto-renewal.
- Gift subscriptions.
- **Time Reset option** — let a student wipe their answer history
  mid-subscription and start fresh. Mirrors UWorld's reset feature
  (offered on 180d+ tiers). Parked; revisit once we see whether
  real students ask for it.

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
