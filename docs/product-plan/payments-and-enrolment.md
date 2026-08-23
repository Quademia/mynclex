# MyNclex — Payments & Enrolment

*Living document. Part of the `mynclex/docs/product-plan/` set —
see [main.md](main.md) for the overall product plan.*
Last updated: 2026-07-15 (**Location-aware default currency BUILT** (`bf4aff7`, on `main`, deployed to dev; not prod; app-layer, no schema change). Fixes GHS being the *universal* default on the dual-currency public pages: the server now reads Cloudflare's `CF-IPCountry` and pre-selects the currency — Ghana → GHS, elsewhere → USD, unknown → GHS (never strand a local on USD); the manual toggle still overrides. New pure `defaultCurrencyForCountry()` in `lib/products/money.ts` (+5 tests); both `force-dynamic` pages (`/bank-access`, `/readiness`) seed the toggle from it. The feared CDN-caching problem was a non-issue (pages are already `force-dynamic` = per-request). Verified by simulating `CF-IPCountry` per country + a live UK dev-deploy check (saw USD). **Programmes confirmed out of scope by design** — single-currency per the tutor's choice, nothing to default between; the only geo-adjacent idea there is the parked FX-hint. Deferred follow-up: persist the manual override via cookie. See *Dual currency handling → location-aware default currency*. Previously 2026-06-22: **Global `/tutor/payments` page BUILT** — the 2026-06-12 IA item, a money-in ledger across all a tutor's programmes (app-layer, no migration; see *tutor money surfaces (IA) → BUILD NOTE*). **Cohort-level payment plans BUILT 2026-06-22 (Slices 1–3, on session branch; app-layer + migration `20260705120000`)** — a cohort can carry its OWN plan set (clone-and-edit) via a nullable `cohort_id` on `nclex_programme_payment_strategies` + a **Programme-pricing ↔ Custom** toggle on the new cohort **Pricing** tab; checkout reads the cohort's effective plans (custom else programme) and still freezes the snapshot onto the enrolment; discovery shows the programme default. Build-time refinement: "custom" = the cohort has ACTIVE plan rows, revert = deactivate (FK-safe, no delete). See the *Cohort-level payment plans → BUILD NOTE* subsection. Earlier — 2026-06-12: **Tutor-add with a payment plan — DESIGNED, not yet built** — see the new *Settled 2026-06-12* subsection under Tutored enrolment. Headline correction from Sam: **tutor-added ≠ off-platform money** — enrolment and collection are separate axes; a hand-added student inherits the programme's `payment_collection_mode`. Add form gains an optional plan picker (configured plans only) + "payments already received 0..N" (recorded as synthetic OFF_PLATFORM rows) + a tutor-set first-payment grace (reuses `installment_grace_until`); snapshot frozen identically to checkout so the whole schedule/sweep/tile/Mark-paid machinery applies; QAcademy-collection students can pay position 1 from the tile, tutor-collection is tracking-only (needs a new collection-mode guard on the installment checkout). Access immediate on add. Same session: the self-paced programme-level **Enrolments tab** shipped + ALL tutor-add paths now freeze `access_expires_at` from the programme's access window — the old always-lifetime was a Slice-1b leftover, not policy. Previously 2026-05-22: Slice 7 — multi-strategy + installments — sub-sliced for build (7a–7e) and decisions locked; see *Tutored enrolment → Settled 2026-05-22*: (1) **upfront-full IS a strategy row** (auto-created + pre-selected, but deactivatable — reversed from a first-pass "keep it off the table" proposal after Sam noted a tutor must be able to turn upfront *off*); the strategies table therefore becomes the single source of truth for programme amounts and `nclex_programmes.price_minor` is **retired incrementally** (Phasing 2: backfill upfront rows in 7a, keep `price_minor` as display/charge source through 7b–7d, cut views+charge+display over to the plans and drop the column in 7e — no big-bang on live public pages), while `price_currency` **stays on the programme** (one currency per programme, plans inherit); (2) **the chosen plan is frozen onto the enrolment row** (`strategy_snapshot_json`) so a later tutor edit only affects future students (resolves handoff open-Q §12.2); (3) **due dates are computed from a tutor-set pattern**, not typed calendar dates — installments use count (2–12) + interval days, deposit+balance uses "balance due N days after deposit", anchored to the enrolment date for **both** self-paced and tutored (collapses the old "tutored anchors to cohort dates" note onto one code path); (4) **later installments are paid from the programme tile**, with the "My Payments" history page deferred to Slice 5.7. Deposit+balance is in v1; the pre-due-date reminder email is deferred (no transactional email infra yet — the nightly job flips status only). Previously 2026-05-20: Two Slice-3a build-time clarifications, from a tutor-form review with Sam — (1) **Self-paced no longer forced on-platform.** The "self-paced = on-platform only" rule (§"Payment-collection mode — on-platform only") is downgraded from a hard constraint to a *smart default*: off-platform self-paced works mechanically via the always-available manual tutor-add path (enrolment row with `cohort_id = NULL`), so forcing it only removed tutor flexibility for no technical gain. (2) **Collection mode reframed — not two exclusive methods.** Manual tutor-add is *always* available regardless of the setting; `payment_collection_mode` really only governs whether the public programme page shows an online Paystack "Pay & enrol" button. So "both" already happens when on-platform is on (online button for self-serve buyers + manual add still works for offline payers). The tutor form was relabelled accordingly ("Online checkout: On / Off"). No schema change — the enum already carries this meaning. Context: Slice 3a (this session) shipped the price-delta migration — `price_currency` / `price_minor` / `payment_collection_mode` / `access_window_days` added, dual `price_minor_ghs/usd` dropped, public-read RLS added. Previously 2026-05-19: Four planning gaps resolved in one pass — (1) **Self-paced discoverability**: gate is now delivery-mode-specific — tutor-led still needs ≥1 open cohort, self-paced is discoverable on PUBLISHED + active tutor alone (no cohort layer to gate on). (2) **Duplicate-email check timing**: the `auth.users` existence check fires at email entry, *before* Paystack — pause-and-login up front; the post-payment check is demoted to a defensive race-guard. (3) **Status-flip jobs**: `EXPIRED` / `PAUSED` transitions run as a Supabase `pg_cron` nightly SQL function (pure date comparisons, kept next to the data), not a Worker/GHA; reminder emails stay deferred to build. (4) **Programme price is single-currency**: tutor picks GHS *or* USD and sets one price (vs the bank's deliberate dual-currency); flagged that the live `nclex_programmes` dual `price_minor_ghs/usd` columns must migrate to `price_currency` + `price_minor` in build. Also reconciled two stale pre-revision sections that still contradicted settled policy: **"No waiting room"** now reflects the `PENDING_APPROVAL` gate (tile appears immediately but state depends on enrolment status; only off-platform + self-paced go live instantly) instead of "live immediately after payment for everyone"; the **Tutored "Edge cases" table** now reflects Pattern-C waitlist (soft cap, never "not purchasable", waitlist always open, tutor approval is the only gate) and the decoupled-bank model (no per-cohort bundled bank subscription, bank duration no longer tied to cohort end-date), and qualifies the zero-cohort hide rule to tutor-led only. The `nclex_enrolments` parallel-tables note updated to a programme link with optional `cohort_id` (NULL for self-paced). Context note from the session: most of the not-yet-built money/enrolment tables — `nclex_enrolments`, `nclex_subscriptions`, `nclex_payments`, `nclex_products`, `nclex_programme_enquiries`, payment-strategies — are treated as **greenfield**; the doc's older table sketches are illustrative, not binding, and will be re-planned to fit settled policy at build time. Previously 2026-05-18: Notification touchpoints explicitly deferred to build — every flow triggers notifications (paid → tutor notified, approve → student notified, installment reminders, etc.) but the full event catalogue, copy, and trigger wiring are intentionally not enumerated in planning. New "Finalised in build (not in planning)" section captures this so the gap isn't forgotten. Earlier today: Duplicate-email handling settled — cross-cutting rule for every purchase / enrolment flow. New "Duplicate-email handling" subsection added under *Shared infrastructure*. **On-platform student-initiated flows:** if the supplied email already has an `auth.users` row, checkout pauses with "log in to continue"; after login, the purchase / enrolment attaches to the existing account (bank stacks on existing access; programme enrolment row created normally). **Off-platform tutor-add:** existing user → no Supabase invite sent, enrolment row created immediately, notification email goes out ("You've been enrolled in X by Y. Log in to access"). Non-student roles (tutor / admin) don't block; STUDENT role auto-added if missing. **Self-collision guards:** tutor can't enrol themselves; can't double-enrol a student in the same cohort (other cohorts allowed). Notification-not-confirmation chosen because the tutor's action authorises the enrolment and Supabase already verified email ownership at signup. Earlier today: Programme listing price display settled — public card and detail page show the tutor's **upfront-full programme fee** as the canonical headline price (one number, in the tutor's configured currency). Multiple payment strategies (deposit, installments with surcharges) only appear at checkout, never on the listing. Small optional bank hint *"💡 Add NCLEX Bank Access from $18 at checkout (optional)"* sits beneath the headline. FX-converted hint based on student's currency toggle deferred as polish. Contact-first programmes (`show_price_publicly = FALSE`) unchanged. "Bundled checkout" wording removed from price-visibility section to match the decoupled model. Earlier today: Enrolment row lifecycle settled — six mutually-exclusive status values for `nclex_enrolments`: `PENDING_APPROVAL`, `ENROLLED`, `PAUSED`, `REJECTED`, `CANCELLED`, `EXPIRED`. New cross-cutting section added between Tutored / Self-paced enrolment sections and the access-window section, with status table, allowed transitions, and entry-point rules per flow. `COMPLETED` deliberately excluded — it's a progress-engine concept, not an enrolment-row concept. Tutor-sub-lapsed transition handled at read time, not as a status. Earlier today: Self-paced enrolment flow fleshed out end-to-end — now matches the rigour of the tutored on-platform flow. Explicit Supabase invite step for new accounts, status `ENROLLED` from moment of payment (no `PENDING_APPROVAL` — no tutor-approval gate), `cohort_id = NULL`, `enrolment_source = 'SELF_PAID'`. Access-window clock starts at enrolment moment. Bank opt-in (if ticked) activates as a separate subscription, independent of programme access. Earlier today: Programme enrolment flows fleshed out end-to-end — two concrete flows now documented step-by-step inside Tutored enrolment → Settled 2026-05-17. **On-platform flow:** student pays initial payment via Paystack → Supabase invite → student sets up account at `/welcome` → enrolment row created with status `PENDING_APPROVAL` and `enrolment_source = 'SELF_PAID'` → student sees "Pending tutor approval" on dashboard → tutor clicks Approve in cohort workspace → status flips to `ENROLLED`. Bank opt-in (if ticked) activates immediately and is not gated on tutor approval — it's QAcademy's product. **Off-platform flow:** tutor adds student from cohort workspace (typing name + email, or one-click-converting a waitlist entry the student created via the discovery page) → Supabase invite → student sets up account at `/welcome` → enrolment row created immediately with status `ENROLLED` and `enrolment_source = 'TUTOR_ADDED'`, no pending state (tutor is both approver and actor). Account-creation mechanism is Supabase `inviteUserByEmail` for both flows — same as standalone bank — no temp-password / WhatsApp credentials pattern. Bank opt-in card only shown in on-platform flow (off-platform students who want bank access buy it through the standalone self-study landing). New "Enrolment-source mapping" table added. Earlier today: Auth model alignment settled — MyNclex uses Supabase Auth as the source of identity: `auth.users` (Supabase-managed identity, holds email + hashed password + verification state) + `nclex_users` (our profile mirror, PK = `auth.users.id`, already in `db/schema.sql`). The Licensure-era custom user-table pattern is superseded. Pay-first flow updated to use Supabase's `inviteUserByEmail` (Option C) instead of a custom setup-token mechanism — Supabase ships token generation, email sending, link expiry, and resend out of the box; we only build the `/welcome` page. Trial signup uses `supabase.auth.signUp()` directly. Edge-cases section updated (no more "setup token expiry"; now "invite-link expiry" using the Supabase project setting). New "Identity model" subsection added under Shared infrastructure. Earlier today: Enrolment-source enum settled — three values for v1: `SELF_PAID` | `TUTOR_ADDED` | `ADMIN_GRANT`. Mutually exclusive; offline-paid folded into `TUTOR_ADDED` since we can't reliably know whether the tutor actually collected money. `TRIAL_CONVERTED` dropped (trials are for the bank, not programmes). Audit fields like `enrolled_by_user_id` live in separate columns, not encoded in the enum name. main.md updated in two places to match. Earlier today: Tutor monthly sub revisit closed — stays at $29/mo flat, single tier, USD only for v1; sits at the low end of the SaaS-tutor-platform market which suits a new vetted niche platform. Tiering (library/programme/quiz limits) stays deferred to v2. Previous touch 2026-05-17: Cohort full / waitlist behaviour settled — Pattern C: soft cap, `cohort_size` is a tutor-set planning target only, waitlist always open, tutor approval is the only hard gate. Earlier in this same day: Self-paced enrolment + Programme access window both settled — new top-level sections added for each. Self-paced: self-serve on-platform only, one access window per programme, same payment strategies as tutored but anchored to enrolment date, instant enrolment no tutor mediation. Access window cross-cutting: Pattern A adopted (tutor-set per programme, contingent on tutor maintaining the monthly sub — industry standard). Earlier in this same day: Programme enrolment model revised — old bundled-bank checkout dropped in favour of decoupled Option C (opt-in bank at 40% off + tutor-mediated enrolment + tutor-configurable payment strategies + on-platform vs off-platform collection toggle). Old "Bundled transaction" / "Auto-enrolment on payment" / "Tutor-added enrolment" subsections marked SUPERSEDED in-place; new "Settled 2026-05-17" subsection inside Tutored enrolment carries the revised model. Auth-model alignment + enrolment-source enum + tutor-sub revisit + waitlist behaviour all noted as Still open in that subsection. Earlier today: readiness packs settled — 5 identical-shape packs (100 Q × 3hr 20min each), one shot per pack, permanent until activated, 21-day window on activation; 3-SKU standalone catalogue (Single / Select 3 / All 5) with prices fixed; bundle-into-bank tier counts settled (0/0/1/2/3/5 across the 6 bank tiers); credits model for bundled packs. Earlier today: bank pricing settled — 6-tier catalogue with GHS + USD prices fixed; readiness packs bundled into longer tiers with a 21-day activation window. Previous touch 2026-05-11: programme length surfaced as "weeks" or "modules" per the programme's `unit_label` (a separate tutor choice, not derived from delivery mode). Both tutor-led and self-paced ship in v1 — self-paced enrolment flow drafted in [curriculum-authoring-ux.md](curriculum-authoring-ux.md) → "Self-paced surface (screen 12+)" with full flow + access-window pricing finalised in build. Programme/cohort split from 2026-05-10 retained.)

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
- **Cohort full / waitlist behaviour — SETTLED 2026-05-17.**
  Pattern C: soft cap, `cohort_size` is a tutor-set planning
  target only, waitlist always open, tutor approval is the only
  hard gate.
- **Payment strategies (multi-strategy + installments) — SETTLED
  2026-05-22 for build.** Sub-sliced 7a–7e (see *Tutored enrolment →
  Settled 2026-05-22*): upfront-full IS a strategy row (auto-created +
  pre-selected, deactivatable), so the strategies table is the single
  source of truth for amounts and `price_minor` is retired
  incrementally (Phasing 2) while `price_currency` stays on the
  programme; the chosen plan is frozen onto the enrolment; due dates
  are computed from a tutor-set pattern anchored to the enrolment date
  for both modes; later installments are paid from the programme tile.
- **Tutor-add with a payment plan — DESIGNED 2026-06-12, not yet
  built.** Hand-added students can carry a frozen plan + already-received
  count + tutor-set first-payment grace; collection follows the
  programme's `payment_collection_mode`. See *Tutored enrolment →
  Settled 2026-06-12*.
- **Global `/tutor/payments` — BUILT 2026-06-22** (on `main`, not yet
  prod; app-layer, no migration). The cross-programme money-in ledger.
  See *Tutored enrolment → tutor money surfaces (IA) → BUILD NOTE*.
- **Cohort-level payment plans (per-cohort override) — BUILT 2026-06-22
  (Slices 1–3, on session branch; app-layer + migration
  `20260705120000`).** A cohort can carry its own plan set
  (clone-and-edit) via a nullable `cohort_id` on the strategies table +
  a **Programme-pricing ↔ Custom** toggle on the new cohort **Pricing**
  tab; checkout reads cohort-effective plans (custom else programme,
  still frozen onto the enrolment); discovery shows the programme
  default. "Custom" = the cohort has active plan rows; revert =
  deactivate (no delete, FK-safe). See *Tutored enrolment →
  Cohort-level payment plans → BUILD NOTE*.
- **Payment-gated access is now a tutor choice — DESIGNED 2026-06-24, not
  yet built.** A per-programme `payment_gates_access` toggle (default on =
  today's behaviour): off → the nightly sweep stops auto-pausing that
  programme's students for late payment (money is still tracked, just not
  enforced), and currently payment-paused students are auto-resumed (manual
  pauses untouched), behind a consequence-explaining confirm modal. Targets
  the single chokepoint (sweep step 4a); the access gate is unchanged. See
  *Tutored enrolment → Settled 2026-06-24*.
- **Tutor monthly sub revisit, enrolment-source enum, auth model
  alignment — still open.**

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
cat_allowance     INTEGER
                  -- nullable; NULL = unlimited, 0 = none, N = N per window
created_at        TIMESTAMPTZ DEFAULT NOW()
```

> ⚠️ This sketch is illustrative, not a live schema dump (see the
> 2026-05-19 note in the header). It predates several shipped columns —
> `readiness_credits` and the `full_price_minor_*` pair among them. Treat
> `db/migrations/` as the source of truth.

### `cat_allowance` — how many CATs a product grants

Added 2026-07-19 by the CAT Slice 1 migration (`20260808120000`). It sits
on **both** `nclex_products` and `nclex_subscriptions`: the product
declares the grant, and it is **snapshotted onto the subscription at
activation** inside the existing `grantProductEntitlement` path — so a
later admin edit to the SKU does not retroactively change what an existing
buyer paid for, the same reasoning that snapshots price.

- `NULL` = unlimited (today's behaviour, so existing rows are unaffected)
- `0` = no CAT access
- `N` = N CATs per entitlement window

It is a **ceiling, not a balance** — consumption is derived by counting CAT
attempts inside the window, so there is nothing to decrement and no
double-spend to guard against. This is deliberately *not* the readiness
credits model, which needs real rows because a credit is an object the
student owns.

Where stacked subscriptions overlap, **most-generous-wins**: a student may
start a CAT if any active row still has headroom, and `NULL` on any active
row means unlimited. This matches the table's existing `max(end_at)`
stacking rule, which already resolves overlaps in the student's favour.

Enforced by one guard in `create_cat_attempt` (CAT Slice 3). The admin UI
for editing the value, and any student-facing "N CATs left" copy, are
**deliberately deferred** — the mechanism ships first, the readout when it
is wanted. Full rationale: `bank-consumption-cat.html` §15.5.

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

#### location-aware default currency — BUILT 2026-07-15 (raised + built same day, Sam)

**Problem.** Today GHS is the *universal* default on every public
surface (landing page, `/readiness`) — an international visitor (US /
UK / Canada) lands on a cedi price and has to notice and click the
toggle to see the price meant for them. Sam: **GHS-as-universal-default
is wrong.** The dual-currency scheme is deliberately PPP-priced (GHS
low for the local audience, USD for international — *not* an FX
conversion), so the *right* default is "show each visitor the price
priced for their region," not "always GHS."

**Direction (not yet designed in full).** Pre-select the currency from
the visitor's location, keep the manual toggle as the override. GHS for
Ghana (and possibly the wider GHS-appropriate region — TBD which
countries), USD for everyone else, **GHS as the fallback when location
is unknown** (never leave a local visitor on a USD price).

**Cheap mechanism available.** The app runs on Cloudflare Workers, so
the incoming request already carries `request.cf.country` (an ISO
country code) for free — no third-party IP-geolocation service, no
added latency, no PII beyond country. The default is chosen server-side
from that; the client toggle still wins after.

**Design points to settle at build time:**
- **Country → currency map** — just `GH` → GHS, or a set of West
  African / other countries? Keep it a small, explicit allowlist.
- **Where detection runs vs caching.** The public pages are
  CDN-cacheable; a location-varied default must not let one country's
  cached HTML serve another's currency. Options: decide the default at
  the edge (Worker) before the page renders, or render currency-neutral
  and set the toggle client-side from a geo signal. Resolve against the
  OpenNext/Workers caching model — this is the main implementation
  question, not the country map.
- **Persist the visitor's manual override** (cookie / localStorage) so
  a toggle isn't undone on the next page.
- **Scope** — is this landing-page + `/readiness` only, or every
  currency-bearing public surface? (Programmes are single-currency per
  the tutor's choice, so this is a *bank/readiness* concern.)

**BUILT 2026-07-15** (`bf4aff7`, on `main`, deployed to dev; NOT prod;
app-layer, no schema change). The two design points above resolved
cleanly at build:
- **Caching was a non-issue** — every public page is already
  `export const dynamic = 'force-dynamic'`, so they render per-request
  on the server; there is no cached HTML to serve the wrong country's
  currency. The feared caching problem never arose.
- **Country map = Ghana only** for v1 (`GHS_DEFAULT_COUNTRIES` in
  `lib/products/money.ts`, an explicit set — extend it there if the
  wider region should default to cedis). Everyone else → USD.

New pure `defaultCurrencyForCountry(country)` in `lib/products/money.ts`
(GH → GHS · else → USD · null / `''` / Cloudflare's `XX` / `T1`
sentinels → GHS fallback; +5 vitest). Both server pages
(`/bank-access`, `/readiness`) read `headers().get('cf-ipcountry')` and
pass an `initialCurrency` seed into their client toggle components; the
manual toggle still overrides, and prices / links / checkout are
unchanged. Verified server-side by simulating `CF-IPCountry` per country
(GH → GHS; US/GB/NG/CA/IN → USD; XX/T1/none → GHS), then confirmed live
on the dev deploy (Sam, from the UK, saw USD). The header only exists
behind Cloudflare's real edge — localhost always shows the GHS fallback,
which is correct.

**Still deferred (not built):** persist the visitor's manual override
(cookie / localStorage) so a toggle survives navigation — a small
follow-up, not required for the core win.

**Programmes are out of scope — by design, not omission (investigated
2026-07-15).** The geo-default only applies to the *dual-currency*
surfaces (bank + readiness), which store both a GHS and a USD price. A
**programme is single-currency** (*Settled 2026-05-19* — the tutor picks
GHS *or* USD and is paid in it; `price_currency` + one `price_minor`,
no pair, no toggle anywhere on the programmes pages — see
`lib/discovery/format.ts`). So there is nothing to default *between*: a
UK visitor sees a GHS-priced programme in GHS because that is the only
price it has. Geo-defaulting is a no-op there and would misrepresent
what the tutor charges. The one adjacent idea that *could* consume the
geo signal is the **parked FX-converted hint** (*"≈ $X"* beside a
tutor's real price for international visitors) — but that is a separate,
genuinely-new feature (needs a live FX rate + an "approximate, you'll be
charged GHS X" disclaimer), not a reuse of this build.

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

### Identity model — Supabase Auth + profile mirror

**Settled 2026-05-18.** MyNclex uses **Supabase Auth** as the source
of identity, not a custom user table. Two tables, 1-to-1:

- **`auth.users`** — Supabase's built-in identity table. Holds email,
  hashed password, email-verification state, login sessions.
  Supabase manages it. We don't define its schema or write to it
  directly (always go through `supabase.auth.*` APIs).
- **`nclex_users`** — *our* profile mirror, prefixed per the
  extraction rule. PK = `auth.users.id` via FK. Holds the
  MyNclex-specific profile fields (forename, surname, name, phone,
  avatar, signup_source, is_active, must_change_password, timestamps,
  etc.). Already exists in `db/schema.sql`.

Wherever older planning text said "`nclex_users` is the account",
read it as "`auth.users` is the account, with an `nclex_users`
profile row alongside it."

The Licensure-era custom `users` table pattern (own password column,
own setup-token mechanism, own email verification) is **superseded**
by Supabase Auth across all MyNclex flows.

### Parallel tables (MyNclex-prefixed)

- `nclex_products` — catalogue (see schema above).
- `nclex_users` — profile mirror of `auth.users` (already in
  `db/schema.sql`).
- `nclex_subscriptions` — active and historical subscriptions.
- `nclex_payments` — payment audit trail.

Full schemas, RLS, and relationships for the subscription /
payment tables finalised during build — not planning.

### Pay-first principle

No half-made accounts. Neither an `auth.users` row nor an
`nclex_users` row exists until either:

- the student paid AND clicked the post-payment invite link AND
  completed the welcome form (see "Pay-first flow" below), OR
- the student signed up for a free trial directly.

Abandoned payments leave an `INIT` row in `nclex_payments` but no
identity record in `auth.users` and no profile row in `nclex_users`.

### Duplicate-email handling (Settled 2026-05-18)

Cross-cutting rule for every purchase or enrolment flow. The system
always checks whether an `auth.users` row exists for the supplied
email before deciding what to do next.

**When the check fires (Settled 2026-05-19).** The existence check
runs **at email entry, before the student is sent to Paystack** — not
after payment. If the account exists, checkout pauses immediately with
"log in to continue" (below); after login the same checkout resumes
for the now-authenticated student and the purchase attaches to the
existing account. Checking only post-payment would mean a returning
student pays as a guest and only then discovers they should have
logged in — bad UX and an awkward mid-flow login. The post-payment
existence check described in the pay-first sequence is therefore kept
**only as a defensive race-guard** (account created in another tab
between email entry and payment confirmation), not as the primary
branch point.

**On-platform student-initiated flows** (paying as guest — standalone
bank, tutored on-platform programme, self-paced programme):

- If the email **doesn't exist** → continue as drafted (pay →
  Supabase invite → `/welcome`).
- If the email **exists** → checkout pauses with a message:
  *"This email already has a MyNclex account. Log in to continue."*
  Student logs in with their existing password (or "forgot
  password"). After login, the same checkout resumes for the
  now-authenticated student. On payment success:
  - **Bank** → new `nclex_subscriptions` row stacks on top of any
    existing bank access (same rule as bank standalone purchases).
  - **Programme (tutored on-platform)** → enrolment row created
    with `PENDING_APPROVAL` against the existing account.
  - **Programme (self-paced)** → enrolment row created with
    `ENROLLED` against the existing account.

**Off-platform tutor-add flow** (tutor types name + email in cohort
workspace):

- If the email **doesn't exist** → continue as drafted (Supabase
  `inviteUserByEmail` → student sets up account → enrolled).
- If the email **exists** → **no invite sent.** System creates the
  enrolment row immediately with `enrolment_source = 'TUTOR_ADDED'`,
  status `ENROLLED`, linked to the existing user. The existing
  user gets a notification email: *"You've been enrolled in
  [Programme] by [Tutor]. Log in to access."*
- If the existing user holds only a **non-student role** (e.g.
  they're a tutor or admin) → still works. A `STUDENT` role is
  added to `nclex_user_roles` if not already present. Tutors can
  be students in other tutors' programmes (continued learning) —
  we don't block.

**Self-collision guards:**

- Tutor types in **their own** email → blocked: *"You can't enrol
  yourself in your own cohort."*
- Email matches a student **already enrolled in this cohort** →
  blocked: *"This student is already enrolled in this cohort."*
  (Same email may legitimately be enrolled in **other** cohorts —
  that's allowed, see the *Edge cases* table under Tutored
  enrolment.)

**Why a notification (not a confirmation) on tutor-add.** The
tutor's action authorises the enrolment; the existing user owns
the email (verified by Supabase at signup). Requiring the existing
user to "accept" before the row activates would slow tutor
onboarding without adding meaningful safety — if the tutor added
the wrong person, the student can decline from their dashboard
(creates a `CANCELLED` row) or contact admin.

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

> **Note (2026-07-04):** the canonical home for everything
> readiness-pack (format, pricing, reservation, storage, build plan)
> is now [readiness-packs.md](readiness-packs.md). This section is
> kept for the pricing history (adopted + rejected alternatives);
> the new doc carries the settled tables forward.

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

**Paid card → pay-first flow (Settled 2026-05-18 — uses Supabase
invite, not a custom setup-token mechanism):**

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
7. If an `auth.users` row already exists for that email →
   activate subscription immediately against the existing account
   → status `ACTIVATED`.
8. If no account yet → server calls Supabase's
   `auth.admin.inviteUserByEmail(email)`. This creates the
   `auth.users` row (no password yet) and emails the student a
   secure one-time invite link. Payment status: `SETUP_REQUIRED`.
9. Student clicks the link → lands on `/welcome` → fills name +
   chooses password → server writes the password to `auth.users`
   (via `supabase.auth.updateUser`) and inserts the matching
   profile row in `nclex_users` → subscription activated → student
   logged in → dashboard.

**Why Supabase invite (Option C) over a custom token (Licensure
pattern):** Supabase ships the token generation, the email-sending,
the link-expiry, the resend-invite endpoint, and the email template
out of the box. We only build the `/welcome` page and a small server
action that saves the name + password. The Licensure-era custom
setup-token mechanism is *not* carried over.

**Link expiry / resend:** invite-link expiry follows the Supabase
project setting (default 24 hours; configurable). If the student
misses the window, an admin re-sends the invite from the admin
queue using Supabase's built-in resend — no custom token-refresh
endpoint needed.

**Trial card → sign-up-first flow:**

1. Student lands on the register page (MyNclex equivalent of
   Licensure's `register.html`).
2. Enters email, password, name.
3. Server calls `supabase.auth.signUp()` — creates the `auth.users`
   row directly (no invite needed; the student is in front of us
   with a password in hand). Then inserts the matching `nclex_users`
   profile row.
4. Trial product (`NCLEX_TRIAL` or equivalent) auto-assigned as a
   subscription with `source = 'SELF_TRIAL_SIGNUP'` (matching
   Licensure's convention).
5. Logged in. Dashboard.

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

### Edge cases

- **Payment abandoned mid-flow.** Paystack stays pending. MyNclex
  has an `INIT` row in `nclex_payments`. Neither `auth.users` nor
  `nclex_users` row created. No follow-up action needed.
- **Duplicate email at setup.** If an `auth.users` row already
  exists for the email, the subscription activates against the
  existing account — no invite sent, no duplicate identity created.
- **Invite-link expiry.** Follows the Supabase project setting
  (default 24h; configurable). Student contacts admin → admin
  re-sends the invite from the admin queue using Supabase's
  built-in resend.
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

> **Clarification (2026-05-20).** These aren't two *mutually
> exclusive* collection methods. Manual tutor-add (off-platform) is
> **always available** regardless of the setting — it's the roster
> "add student" path, ungated by `payment_collection_mode`. What the
> flag actually controls is narrower: **does the public programme
> page show an online Paystack "Pay & enrol" button?** So on-platform
> = "online button shown, *and* the tutor can still add people by
> hand"; off-platform = "no online button, enrol manually / via
> waitlist." "Both" is simply the on-platform state. The tutor form
> is labelled "Online checkout: On / Off" to reflect this. No schema
> change — the existing enum carries the meaning.

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

#### Settled 2026-05-22 — Slice 7 build decisions (multi-strategy + installments)

When payment strategies were sub-sliced for build (BUILD_LIST Slice 7,
sub-slices 7a–7e), the decisions below were locked. They follow the
2026-05-19 design-handoff schema (`design-handoff/payments-and-enrolment/
index.html` §05), with the due-date model (3) made explicit.

1. **Upfront-full IS a stored strategy row** (matches handoff §05; settled
   after a first-pass proposal to keep it off the table was reversed on
   Sam's pushback). A first cut proposed leaving pay-in-full implicit
   (priced from `nclex_programmes.price_minor`, no strategy row) to avoid
   touching shipped code — but that quietly removed a real tutor choice:
   with upfront always implicitly present, a tutor could never turn it
   *off*, yet some will want installments-only or deposit-only. So upfront
   is a real, selectable plan — **auto-created and pre-selected** when a
   programme is set up, but **deactivatable**. Consequently the strategies
   table becomes the **single source of truth for programme amounts**, and
   the leftover `nclex_programmes.price_minor` column is **retired** (two
   copies of the full price = drift risk). Retirement is done incrementally
   (BUILD_LIST "Phasing 2": backfill upfront rows in 7a, keep `price_minor`
   live as the display/charge source through 7b–7d, cut the public views +
   charge + display over to the plans and drop the column in 7e) so the
   live discovery / checkout pages aren't reworked in one big-bang.
   **`price_currency` stays on the programme** — a programme is one
   currency and every plan inherits it; only the *amount* moves to the
   plans.

2. **A chosen plan is frozen onto the enrolment (resolves design-handoff
   open-Q §12.2).** At checkout, the selected plan is snapshotted onto the
   `nclex_enrolments` row (`strategy_snapshot_json`). A tutor editing the
   plan later — changing the installment count, the interval, the price —
   only affects students who enrol *after* the edit; existing students keep
   the schedule they signed up to. Without the freeze, a plan edit would
   retroactively rewrite live students' due-dates.

3. **Due dates are computed from a pattern, not typed as calendar dates.**
   The tutor configures the *rhythm* only: for installments, a count (2–12)
   and an interval in days; for deposit+balance, "balance due N days after
   the deposit." The system computes each student's actual due-dates from
   **their own enrolment / first-payment date**, so a student who joins
   later gets a correspondingly later schedule. The anchor is the enrolment
   date for **both** self-paced and tutored programmes — a deliberate
   simplification of the earlier note that "tutored strategies anchor to
   cohort dates" (see *Payment strategies — same as tutored…* under
   self-paced), collapsing both modes onto one code path. Per-student
   exceptions (grace extension, "they paid me in cash") remain a manual
   tutor override, not a schedule the tutor pre-types.

4. **Students pay later installments from the programme tile.** The full
   "My Payments" transaction-history page is sequenced after this work
   (BUILD_LIST Slice 5.7), so the recurring "Pay next installment" action
   lives on the student's programme tile / switcher row — the same place
   the "payment overdue — access paused" state already surfaces — reusing
   the existing checkout shell for the single charge.

**In scope for v1:** deposit+balance ships alongside installments (same
overdue→`PAUSED` machinery, one balance payment instead of N).

**Deferred:** the "payment reminder a few days before the due date" noted
under *Missed installment behaviour* above. MyNclex has no transactional
email yet, so the nightly job flips enrolment status only (which drives the
dashboard tile); reminder emails arrive when email infrastructure lands.

#### Built 2026-05-22 — 7d shipped + follow-up decisions

7d (installments lifecycle) shipped; three decisions firmed up during build
and review:

1. **`installment_index` is NULL on the initial payment** (correcting an
   earlier "= 1" note). A DB CHECK (`installment_index_scope`) only permits
   the column on `PROGRAMME_INSTALLMENT` rows; the initial `PROGRAMME_INITIAL`
   row is implicitly schedule position 1, later installments carry their
   position. "Paid so far" = count of PAID/ACTIVATED programme payment rows.

2. **Off-platform payments are explicit, not inferred.** `nclex_payments`
   gains `collection_channel` (`PAYSTACK` = money into QAcademy / `OFF_PLATFORM`
   = tutor collected directly) + `recorded_by_user_id`. The tutor "mark
   installment paid" path stamps both, so reconciliation no longer relies on a
   null `paystack_reference`.

3. **Grace ("give more time") is distinct from "mark paid".** A tutor can
   defer an overdue student's pause WITHOUT recording a payment — the
   installment stays owed (on-platform) by a later date. Stored as
   `nclex_enrolments.installment_grace_until` (the nightly sweep skips a
   student whose grace is still active) + append-only `grace_history_json`.
   Marking paid (which advances the schedule and claims money) is reserved for
   genuine off-platform payments; a bare unpause/Resume is kept for "let them
   in briefly" but is undone by the next sweep — so all three pause-resolution
   actions carry a consequence-explaining confirmation. This closed the gap
   where tutors would have mis-used "mark paid" just to grant access.

The editable values behind all this (the `enrolment_sweep_enabled` flag, the
`bank_optin_discount`) live in `nclex_config` and are now editable from the
**System Config** admin page (`/admin/config`) — keys are code-defined and
read-only, values are edited via typed controls.

#### Settled 2026-06-24 — Tutor choice: let payment gate access (per programme; designed, not built)

**The question.** Today, access is coupled to payment: a student on a
deposit/installment plan whose next payment goes overdue is paused (loses
content access) by the nightly sweep. Good as a default — but some tutors won't
want a late payment to lock a student out, or won't want payment to control
access at all (e.g. trust-based / off-platform-collected arrangements). So the
tutor should be able to **decide, per programme, whether the system gates
access by payments made.**

**Why this is a small, contained change.** Access itself is gated purely on
enrolment `status = 'ENROLLED'` (+ the access window) — see *enrolments
access-gating*. The **only** automated thing that flips a paid-up student out
of `ENROLLED` for a *missed payment* is sweep step 4a
(`nclex_enrolment_nightly_sweep`, ENROLLED→PAUSED on overdue). That single
chokepoint is the whole coupling, so the change targets just it — the RLS
access gate doesn't change at all.

**The decisions (all locked 2026-06-24):**

1. **Scope = per programme**, not per tutor. A nullable/boolean flag on
   `nclex_programmes` (proposed `payment_gates_access BOOLEAN NOT NULL DEFAULT
   true`). Default `true` = today's behaviour, so existing programmes are
   unchanged. Lives with the programme's other money settings (collection mode,
   access window, plans). A tutor can gate one programme and not another. (A
   tutor-wide switch was considered and rejected as less flexible.)

2. **Off = stop enforcing, keep tracking.** When off, sweep 4a **skips** that
   programme's enrolments — they're never auto-paused for late payment. Plans,
   schedules, due dates, the "overdue" indicators on the roster/analytics all
   keep computing and showing (the money story is still tracked and nudge-able);
   only the *enforcement* (the pause) is suppressed. Full-pay students are
   unaffected either way (no installments to miss).

3. **Turning it OFF auto-resumes the already-paused.** Flipping the toggle off
   immediately **resumes** that programme's enrolments currently `PAUSED` with
   `paused_reason = 'INSTALLMENT_OVERDUE'` (so the change takes effect now, not
   "from tonight"). A tutor's **manual** pauses (`TUTOR_MANUAL`) are **not**
   touched — only the tutor lifts those. (No real users yet, so this is about
   correct behaviour, not a data migration.)

4. **A confirm modal explains the toggle, both directions.** Off → "students
   currently paused for a late payment will regain access, and future late
   payments won't pause anyone on this programme." On → "students who are behind
   on payment may be paused by tonight's check." (Consequence-explaining
   confirmation, consistent with the other pause-resolution actions.)

5. **Out of scope: the access window.** This switch governs the *missed-payment
   pause* only. The separate access-window expiry (ENROLLED/PAUSED→EXPIRED past
   `access_expires_at`, sweep 4b) is a different lever — how *long* access
   lasts — and is untouched.

6. **One action, surfaced in several places (Settled 2026-06-24).** The toggle
   can live in *multiple* surfaces; what matters is that **the same action
   fires wherever it's triggered**. So it's built as ONE canonical server
   action + ONE shared toggle-with-confirm component, mounted on: (A) the
   programme **edit modal** → *Access & collection* section; (B) the **Payment
   plans** page → an *Access policy* card; (C) the programme **Overview**; and
   (D) the **Enrolments** roster (`EnrolmentRosterView`) — arguably the most
   contextual home, since that's where the tutor *sees* a student in "Paused —
   payment overdue," so the control sits next to its visible effect. Crucially
   the toggle is **always its own self-contained immediate action+confirm** —
   even inside the edit modal it does NOT ride that modal's batched "Save
   changes"; that's what keeps it identical everywhere (and avoids entangling a
   live-consequence action with a generic settings save). Because it's one
   component, adding/removing a placement later is a one-line change.

**Build shape (≈1 slice, app-layer + one migration).** (a) Migration: add the
column + update `nclex_enrolment_nightly_sweep()` 4a to join `nclex_programmes`
and skip where `payment_gates_access = false`. (b) ONE server action —
`setProgrammePaymentGating(programmeId, enabled)`: ownership-check → flip the
flag → on turn-off, auto-resume that programme's `INSTALLMENT_OVERDUE` pauses
(leave `TUTOR_MANUAL`) → return the affected count for the confirm/result copy.
(c) ONE shared toggle+confirm component, mounted on the four surfaces above
(edit modal · Payment plans · Overview · Enrolments roster). Default `true`
means zero behaviour change until a tutor opts out.

#### Settled 2026-06-12 — Tutor-add with a payment plan (designed, not yet built)

Until now the manual tutor-add path created an enrolment with **no plan
attached** — the platform recorded nothing about what the student owes
("Off-platform" pill, no schedule, no sweep attention). That baked in a
wrong conflation, corrected in this session's discussion (Sam):
**tutor-added ≠ off-platform money.** Enrolling a student and collecting
their money are separate things — the collection method is a
programme-level decision the tutor already made at creation
(`payment_collection_mode`), so a manually-added student simply
**inherits it**. The settled design:

1. **Add Student form gains two optional pieces** (cohort AND
   self-paced rosters): a **plan picker** (the programme's active
   plans — the same list checkout offers; the tutor records whatever
   they agreed with the student in conversation) and **"payments
   already received: 0..N"** (money already taken by hand — each one
   recorded as a synthetic `OFF_PLATFORM` payment row, the Mark-paid
   mechanism applied at add time; N-of-N = a fully-paid student
   recorded for the books). Default stays "no plan" = exactly the old
   behaviour.
2. **Snapshot frozen as usual.** The chosen plan is snapshotted onto
   the enrolment identically to checkout, so the schedule engine /
   tile / sweep / grace / Mark-paid cannot tell a hand-added student
   from a self-paid one.
3. **Collection follows the programme's method.** QAcademy-collection →
   the student's tile offers "Pay k of N" via Paystack (position 1
   included — the installment checkout + activation path already route
   it to the existing enrolment). Tutor-collection → **tracking-only**:
   schedule + sweep + Mark-paid, but no online Pay button. Requires a
   new **guard on the installment checkout** (refuse tutor-collection
   programmes — previously unreachable, now reachable).
4. **First-payment grace, tutor-set in the form.** A plan's position 1
   is due at enrolment, so a 0-received add would be paused by that
   night's sweep. The form (shown when received = 0) asks "first
   payment due within X days" — stored in the existing
   `installment_grace_until` field the sweep already respects.
5. **Access is immediate** (ENROLLED on add, payment follows) — the
   tutor's trust decision, bounded by the grace deadline + sweep.
   "Pay before access" remains the public checkout's job.

**Accepted v1 boundaries:** tutor picks the plan (the student's
plan-freedom lives in the public checkout; wrong pick → cancel +
re-add while unpaid); **configured plans only** (no custom per-student
amounts — a future feature if real tutors ask); no "change plan later";
waitlist Convert stays one-click/no-plan (extend later if wanted).

#### Parked 2026-06-12 — per-student schedule control (due-date editing)

Discussed and **deliberately skipped for now** (Sam's call, same
session as the add-with-plan build). Context: due dates are never
stored — the engine + nightly sweep recompute them every time from
(frozen snapshot rhythm × anchor date × settled-payment count), where
the anchor is `enrolled_at`. The need: when a tutor adds a student (or
a student self-enrols) at an awkward moment, the rhythm is right but
it's bolted to the wrong starting day (enrolled the 28th but pays on
the 1st; added weeks before the cohort starts; agreed a different
first-payment date). Grace doesn't fix this — it spares only the
*current* payment and leaves later dates keyed to the enrolment moment.

Two options were laid out:

- **Option A — editable schedule anchor (recommended when this is
  built).** One nullable per-enrolment date, "schedule starts on…"
  (default = `enrolled_at`); the whole schedule shifts together,
  rhythm intact. Cheap: engine + sweep read
  `COALESCE(schedule_anchor_at, enrolled_at)` (one TS line + one SQL
  migration, kept in lockstep), an "Edit schedule start" roster action
  with confirm + audit. Solves "starts on the wrong day" — the
  dominant real case. **Bonus observation:** an anchor would be
  semantically cleaner than the add-form's first-payment grace (grace
  says "overdue but unpunished until X" while later dates stay keyed
  to enrolment; an anchor says "the schedule starts when we agreed" and
  moves everything coherently) — if A is built, consider reworking the
  add-form grace field into a "first payment due on [date]" anchor.
- **Option B — per-position hand-typed due dates.** Total freedom,
  but a second source of truth every reader (tile, sweep, roster) must
  honour, and it reopens the settled "due dates are computed from a
  pattern, not typed as calendar dates" decision. Skip unless real
  tutors demonstrate per-position need.

**Amount editing stays off the table** (the Q3 of the same
discussion): per-student amounts remain frozen-snapshot-only — the
immutability is the integrity guarantee; "custom per-student plans" is
its own future design.

**Revisit trigger:** real tutors hitting schedule-misalignment in
practice (expect it first around future-dated cohorts).

#### Settled 2026-06-12 — tutor money surfaces: who shows what (IA)

Same session, after the per-student **payment-history drawer** shipped
(click the roster's payment pill / 🕑 → right-side drawer: plan +
k-of-N + received/remaining + every position's state with channel —
"online via Paystack (QAcademy)" vs "off-platform — marked received by
you" — + grace history + refunds). Discussing where money belongs
produced this boundary:

- **The roster (cohort/programme Enrolments) is an ACCESS-and-enrolment
  page.** Payments appear there only as the thing that explains or
  changes access (overdue → paused; Mark-paid → resumed; the per-student
  drawer answers "what does this student owe?"). Cross-student money
  does NOT accrete here.
- **Payment plans tab = pricing config** ("what do I offer") — correctly
  programme-level, stays put.
- **The transactions list ("what money came in?") = the GLOBAL
  `/tutor/payments` page, built ONCE with filters** (programme, cohort,
  channel, date) — **✅ BUILT 2026-06-22 (on `main`, not yet prod); see
  the build note below.** No per-programme or per-cohort payments pages:
  a filter is cheaper than a page, and at 1–3 programmes per tutor
  global-with-filters is the right zoom. If tutors later want it one
  click from a programme workspace, a programme tab can mount the same
  component pre-filtered (the roster's scope pattern) — choosing global
  now closes no doors.

**BUILD NOTE (2026-06-22) — global `/tutor/payments` shipped.** Built from
the CD "Tutor Payments v1.1" prototype; all app-layer, **no migration**
(reads existing `nclex_payments`). Ownership gate = the tutor's own
programmes (RLS), then a service-role read of programme-fee payments only
(`PROGRAMME_INITIAL`/`INSTALLMENT`; `PAID`/`ACTIVATED`/`SETUP_REQUIRED` =
"received", `REFUNDED` distinct; bank/readiness/optin excluded — that's
QAcademy's money). Cohort + plan total resolved via the enrolment (a
payment row only carries `cohort_id` on the initial position). Reuses the
roster's ownership-then-service-role pattern, so **no new RLS**.
- **Shows money that ARRIVED only** — "owed / upcoming" is never a row; it
  lives in the per-student history drawer (the 🕑 in the Purpose cell,
  which reuses the roster's drawer keyed by `enrolment_id` — generalised
  to `{ enrolmentId, name, email }`). The clock shows only when a frozen
  plan exists (its presence is the cue), including on refunded rows.
- **Rollup scorecards** — programme + cohort, side by side when a cohort
  is selected; fixed-scope received totals + an online-vs-off-platform
  bar; the programme card pairs from the cohort's parent automatically.
- **The Cohort filter lists payment-less cohorts** (the data layer fetches
  the tutor's cohorts; scoped to the selected programme, programme-
  prefixed under "All programmes"), so a tutor can drill into a cohort and
  confirm "nothing collected here" via a named empty state + a "No
  payments yet" scorecard. v1 kept Export CSV (filtered rows) + load-all
  (no pagination yet — same call as the roster).
- Code: `lib/payments/tutor/` (`queries.ts` · `tutor-payments-view.tsx` ·
  `csv.ts` · `types.ts`) + `styles/tutor-payments.css`. Commit `4bca8dc`.

#### Cohort-level payment plans (per-cohort override) — BUILT 2026-06-22 (Slices 1–3)

> **BUILD NOTE (2026-06-22) — shipped, Slices 1–3, on the session branch
> (app-layer + one migration `20260705120000`).** The design below was built
> as specified, with **one build-time refinement**: "revert = delete the
> cohort's plan rows" is impossible because `nclex_enrolments.strategy_id`
> AND `nclex_payments.strategy_id` both reference the strategies table
> `ON DELETE RESTRICT` — a plan a student has paid on can't be deleted. So
> **"custom" = the cohort has ≥1 ACTIVE plan row**, **revert = deactivate**
> (never delete), and **re-enable reuses** the cohort's existing rows (or
> clones the programme's active plans on first enable). Checkout / effective
> reads use the public view, which is active-only, so the inheritance "cohort
> rows if any, else programme" falls out for free.
> - **Slice 1** (`1fe6f6a`) — migration (`cohort_id` + partial unique indexes
>   + the public plans view exposes `cohort_id` + the discovery headline view
>   scopes to `cohort_id IS NULL`) + every programme-default read scoped to
>   `cohort_id IS NULL` (checkout read, tutor plans tab, add-with-plan,
>   `init.ts` upfront fallback, `syncUpfrontStrategy`, the programmes-list
>   embed, the deactivate-guard). Invisible foundation.
> - **Slice 2a** (`3753610`) — the cohort **Pricing** tab: read-only
>   programme preview when inherited; "Use custom pricing" clones → editable
>   (the programme `PaymentPlansPanel` + form, cohort-scoped) + a cohort
>   full-price box; "Revert to programme pricing". New
>   enable/disable/setCohortUpfront actions + `getCohortPaymentPlansContext`.
> - **Slice 2b** (`29b1e0e`) — cohort-aware **student checkout**:
>   `getCheckoutPlansByScope` + the checkout client switches plan sets on
>   cohort change. The frozen snapshot still carries the cohort price through
>   to payment / schedule / the global payments page.
> - **Slice 3** (`3783143`) — tutor **add-with-plan + waitlist-convert**
>   pickers cohort-aware (`getRosterPlanContext` returns a per-cohort map;
>   the picker remounts per cohort) + a **"Custom pricing" badge** on the
>   cohort header. The global `/tutor/payments` page + history drawer needed
>   no change (snapshot-based).

The design (as built):

The sibling deferral flagged in
[live-session-planner.md](live-session-planner.md) ("Sibling — pricing is the
same pattern") + the design-handoff "Per-cohort price overrides" note: price
is per-run data stuck on the template — `nclex_programme_payment_strategies`
is keyed `programme_id`, so **a cohort has no price of its own** and a tutor
can't price two *concurrent* cohorts differently (early-bird, founding
cohort, price-rise, holiday promo). **Designed end-to-end 2026-06-22 (Sam,
one-question-at-a-time); not built.** Supersedes the v2 deferral in
[main.md](main.md) ("the programme's price is the price for every cohort")
and the stale design-handoff schema sketch (which predates the Slice-7e
`price_minor` retirement — the strategies table *is* the price now).

**Model — a cohort carries its own plan SET (clone-and-edit), not a price
delta.** Chosen over a lightweight "cohort total / discount knob": it reuses
the entire existing plan editor + schedule engine, invents no scaling math,
and doesn't box us in if a cohort ever wants a genuinely different *structure*
(e.g. installments for one intake, upfront-only for another). Mechanism = the
**cohort-specific-activities Option A pattern**: a **nullable `cohort_id`** on
`nclex_programme_payment_strategies` (`NULL` = programme default, today's
rows; set = a cohort's own). Partial unique indexes keep one-row-per-kind in
each scope — one `WHERE cohort_id IS NULL` on `(programme_id, kind)`, one
`WHERE cohort_id IS NOT NULL` on `(cohort_id, kind)` (replaces the current
`UNIQUE(programme_id, kind)`). **One migration.**

**Two states, one toggle (full replace, not per-kind merge).** A cohort is on
**Programme pricing** (inherits ALL the programme's plans — today's behaviour)
or **Custom for this cohort** (its OWN set). Flip to custom → **clone** the
programme's current plans into cohort rows; from then the cohort is
**independent** — a later edit to the PROGRAMME's plans does **not** flow into
a custom cohort. **Revert** drops the cohort's rows → it inherits the
programme's *current* plans again. (Per-kind merge — override one plan,
inherit the rest — was rejected: a half-inherited set is murky on a surface
where the student picks exactly one plan.)

**"Custom" = the cohort simply HAS its own plan rows** — no separate flag
(matches cohort-specific-activities). Guard: a custom cohort must keep **≥1
plan**, so it can't silently revert by being edited down to zero.

**Authoring — a new Payment plans pane on the cohort view** (a tab in
`lib/cohorts/cohort-detail.tsx`, alongside Overview / Curriculum / Analytics /
Sessions / Settings), reusing the programme's `PaymentPlansPanel` + strategy
form + actions, scoped to the cohort:
- **Programme pricing (off):** the programme's plans render **read-only** —
  "these come from the programme; flip to customise." Not editable here
  (editing would really be editing the programme).
- **Custom (on):** the cloned plans become editable — add / edit / remove /
  activate, exactly like the programme tab.

**Checkout reads the cohort's EFFECTIVE plans.** When a student picks a
cohort, the plan picker reads cohort rows if the cohort is custom, else the
programme defaults (the read *is* the inheritance rule — "cohort rows if any,
else programme"). The chosen plan is still **frozen onto the enrolment**
(`strategy_snapshot_json`), so **existing enrolments never change** — only
FUTURE enrolments in the cohort see new effective plans. That's why the whole
feature carries no migration-of-live-students risk. The
add-student-with-plan picker (tutor manual add) is made cohort-aware the same
way.

**Discovery / listing — programme default.** The public shop-window headline
price is derived from the **programme's** plans; the real cohort price
surfaces at **checkout** once the student picks a cohort (already where plan
selection happens). No "from ₵X across cohorts" on the listing in v1.

**Currency stays programme-level** — one currency per programme across all its
cohorts; a cohort override changes amounts only, never currency.

**Build plan (3 slices, NOT yet built):**
1. **Schema + cohort-aware reads (invisible foundation).** The migration
   (`cohort_id` + partial indexes + the public view exposes `cohort_id`) +
   make every plan-read cohort-aware (public checkout picker +
   add-with-plan picker): cohort rows if present, else programme. No custom
   cohorts exist yet → behaviour identical; regression-test.
2. **The cohort Payment plans pane + toggle.** New cohort tab; read-only
   programme preview when off; "Use custom pricing" clones → editable;
   "Revert to programme pricing"; ≥1-plan guard. Reuses the programme plan
   editor wholesale.
3. **Surfacing + edges.** A "Custom pricing" badge on the cohort; confirm
   the discovery headline stays programme-default; verify the tutor
   `/payments` page + history drawer are untouched (snapshot-based).

No CD prototype — the pane reuses the existing programme plan editor; it's a
toggle + a read-only-preview wrapper, not new dense UI.
- **The programme sidebar's `Students` placeholder was REMOVED**
  (2026-06-12) — overtaken by Enrolments (admin roster) + cohort
  Analytics (performance); on self-paced programmes the adjacent
  Enrolments/Students pair invited confusion. The future per-student
  360 likely lives at the GLOBAL **My Students** page (placeholder
  kept).
  - ⚠ **"Restore is one nav line if ever wanted" is FALSE, and was false
    the day it was written.** The same 2026-06-12 session deleted the
    `RosterScope` union (`COHORT | PROGRAMME`) — see the note at the top
    of `lib/enrolments/types.ts`, which records its own death. The roster
    is now programme-keyed and branches on delivery mode, so a
    tutor-wide roster is a new query plus a view that spans mixed
    programmes and mixed delivery modes. Not a rebuild, but not a line.
  - ⓘ **The performance half of what this bullet points at was built
    elsewhere** (2026-08-23): self-paced programmes now have their own
    Progress surface at programme level — progress-engine.md §6.4. The
    "Students" name was deliberately *not* revived for it, for exactly
    the Enrolments/Students confusion named above; the row is called
    **Progress** and sits under the sidebar's Delivery divider.
  - ⚠ `/tutor/students` ("My Students") remains a **reachable dead end** —
    a placeholder linked from both the global sidebar and a tutor Home
    KPI card that shows a real, live student count. Reviewed 2026-08-23
    and left alone deliberately: at launch scale a global roster is
    nearly the programme roster with extra chrome, and its value grows
    with the number of programmes a tutor runs. Decide it (build or
    delist) rather than leaving a counted card pointing at an empty room.

#### Settled 2026-06-12 (end of session) — cohort Enrolments MOVE to programme level (✅ BUILT 2026-06-12, next session — see the build note below)

Re-opened by Sam after the IA above settled, and **decided: the
enrolment roster for BOTH delivery modes lives at programme level.**
This supersedes the same morning's placement rule ("the roster lives
where students enrol" — cohort for tutor-led, programme for
self-paced), which is hereby retired. That rule was the right bridge —
it de-risked the shipped cohort surface while building the scope-driven
machinery (RosterScope view + actions + the programme mount) that now
makes this move a modest slice instead of a rebuild.

**Why the move wins:**
- Enrolment work clusters at a cohort's **boundaries** (approve /
  convert / add before the run; the odd overdue at the edges) — the
  cohort roster's "in-context during delivery" advantage is strongest
  exactly when the roster is used least, while the cost of two
  locations-by-mode is paid permanently.
- It completes the IA: **programme = people & money** (Enquiries →
  Enrolments → Payment plans adjacent on one sidebar) · **cohort =
  delivery** (Curriculum · Analytics · Sessions · Announcements).
- The Enrolments tab simply always exists on a programme — no
  mode-conditional nav.
- Composes with the future global `/tutor/payments` page (global money
  → programme people drill-down).
- **Timing:** pre-launch, no tutor habits to break — relocating shipped
  furniture is nearly free now and only gets dearer.

**The build plan (one slice):**
1. The programme Enrolments page **accepts tutor-led** (today it 404s
   them): roster across ALL the programme's cohorts; self-paced
   behaviour unchanged.
2. Rows gain a **cohort tag + a cohort filter** in the toolbar (next to
   the status chips).
3. The **Waitlist tab moves up** with it — all cohorts' PENDING leads,
   each badged with its cohort (Convert already reads the cohort off
   the waitlist row; unchanged).
4. **Add student** gains a joinable-cohort picker for tutor-led (the
   action already takes a cohort id); self-paced keeps none.
5. **Summary cells become mode-driven**: tutor-led programme = Enrolled
   / Pending approval / Waitlist / Paused; self-paced keeps Enrolled /
   Paused / Overdue / Expired.
6. **Nav swap**: `enrolments` shows for BOTH modes on the programme
   sidebar; the cohort sidebar's Enrolments entry AND its route folder
   are **deleted** (routes aren't sacred); the cohort workspace gets a
   "Manage enrolments →" link opening the programme page **pre-filtered
   to that cohort** (`?cohort=` param).

**Regression scope** (the real cost): approve / reject, waitlist
convert / dismiss, add-student (with + without plan), pause / grace /
Mark-paid — all retested at the new mount. **Sequenced AHEAD of the
global payments page** — IA settles before more surfaces build on it.

**BUILD NOTE (2026-06-12, the following session).** The plan above
shipped as written (6 commits, all app-layer, no migration), plus
five discussed-and-agreed extensions that fell out of Sam's testing:

1. **Cohort ZOOM (gamma attempts-page "window" pattern).** The cohort
   filter is page-wide, not table-only: picking a cohort recomputes
   the summary cards AND the status chips, and scopes the Waitlist
   tab (list + badge). Status chips + search stay table-only (cards
   ARE status counts — scoping by status would be circular). A
   **scope line** under the header declares the world — quiet
   "across all cohorts" / teal-tinted "for the X cohort" with a
   **Show all cohorts** exit. The workspace deep link therefore lands
   showing that cohort's own counts — the old cohort page reborn.
2. **Table width fix** (the 7th column overflowed the CD-era 1080px
   cap and `overflow:hidden` silently amputated Actions): `.cw-page`
   → 1400px · `overflow-x:auto` + **sticky Actions column** · row
   actions collapsed to a **⋯ menu** (Approve + Mark paid stay
   inline; menu body-portaled — sticky cells are stacking contexts) ·
   Cohort column hidden when zoomed.
3. **Convert-with-plan parity.** The waitlist Convert dialog carries
   the same optional plan picker as Add Student (one dialog, one
   confirmation; shared `PlanPickerFields`; plan threaded through
   `inviteOrAttachAndEnrol`, so snapshot/sweep/Mark-paid/history all
   behave identically). Closed the gap the add-with-plan slice
   created — converted leads were permanently plan-less.
4. **Header rename** Students → **Enrolments** (matches the sidebar;
   "Students" stays reserved for the future per-student view).
5. `RosterScope` union retired — actions take a plain `programmeId`
   (every mount is programme-level now); waitlist convert/dismiss
   take just the `waitlistId` and read cohort/programme off the lead.

#### On-platform flow — full sequence (Settled 2026-05-18)

When the tutor has opted into on-platform collection and a student
finds the programme through QAcademy's public list:

1. Student lands on the programme detail page → picks a cohort →
   picks one of the tutor's configured payment strategies (upfront
   full / deposit + balance / equal installments).
2. Optionally ticks the bank opt-in card (40% off — see below).
3. Clicks Pay → Paystack checkout. Pays the **initial amount**
   for the chosen strategy (full price for upfront, deposit for
   deposit+balance, installment 1 for installments).
4. Paystack confirms → an `INIT` row in `nclex_payments` flips to
   `PAID`.
5. If no `auth.users` row exists for the student's email yet,
   server fires `auth.admin.inviteUserByEmail(email)` — Supabase
   creates the identity row (no password) and sends the invite
   email.
6. Student clicks the invite link → lands on `/welcome` → fills
   name + chooses password → server writes the password to
   `auth.users` and inserts the matching profile row in
   `nclex_users`.
7. `nclex_enrolments` row created with
   `enrolment_source = 'SELF_PAID'` and status `PENDING_APPROVAL`.
   Bank opt-in (if ticked) activates immediately as a separate
   `nclex_subscriptions` row — bank is QAcademy's product, not
   gated on tutor approval.
8. Student logs in → dashboard shows the programme tile with a
   **"Pending tutor approval"** state — programme content not yet
   accessible. Bank tile is fully usable.
9. Tutor sees the paid waitlist entry in the cohort workspace →
   clicks **Approve enrolment**.
10. State flips to `ENROLLED`. Programme content unlocks for the
    student.

**Remittance.** Money sits in QAcademy's account until the tutor
requests withdrawal. Admin processes payouts manually for v1
(mobile money / bank transfer / Wise / etc., depending on the
tutor's preferred destination). Auto-payouts via Paystack split
accounts are a v2 candidate.

**Tutor rejects a paid pending student.** Manual refund handled
by admin, case-by-case. Student-facing UX: programme tile shows
"Refund being processed" rather than vanishing. Auto-refund on
tutor rejection deferred to v2 once volume justifies it.

#### Off-platform flow — full sequence (Settled 2026-05-18)

When the tutor collects programme fees directly, the tutor is the
one who initiates enrolment. Two sub-cases roll into one flow:

- *Tutor brings their own student* (from their own pipeline,
  referrals, existing students) — tutor types in name + email.
- *Tutor converts a discovery-page waitlist entry* (student found
  the tutor via the public list, joined the cohort waitlist with
  name + email + optional message, then paid the tutor
  off-platform) — tutor confirms payment and converts the
  waitlist entry to an enrolment with one click. The student's
  details carry over from the waitlist row.

**Concrete steps (either sub-case):**

1. Tutor goes to the cohort workspace → **Add student** (or
   **Convert waitlist entry** for the sub-case above).
2. Confirms / enters student's name + email.
3. Clicks Enrol. Server fires `auth.admin.inviteUserByEmail(email)`
   — Supabase creates the `auth.users` row (no password) and
   sends the invite email.
4. `nclex_enrolments` row created immediately with
   `enrolment_source = 'TUTOR_ADDED'` and status `ENROLLED` — no
   pending state because the tutor is both the approver and the
   actor.
5. `nclex_users` profile row inserted using the tutor-supplied
   name (student can edit later).
6. Student clicks the invite link → `/welcome` → sets password
   → logged in → cohort is already on their dashboard, content
   fully accessible.

Off-platform mode never touches QAcademy's payment infrastructure
for the programme fee. The bank opt-in is **not** shown in this
flow — bank opt-in lives at programme checkout, which only exists
in the on-platform flow. Off-platform students who want bank
access buy it through the standard self-study landing page.

**Why one consistent account-creation mechanism (Supabase invite,
not temp-password).** Tutors don't see or set credentials. Same
mechanism as the standalone bank pay-first flow — one pattern
everywhere, no plaintext passwords in WhatsApp, less custom code.

#### Enrolment-source mapping

| Flow | `enrolment_source` |
|---|---|
| On-platform flow (student pays via QAcademy, tutor approves) | `SELF_PAID` |
| Off-platform flow (tutor adds student, paid them or comped them) | `TUTOR_ADDED` |
| Admin manually grants enrolment (refund replacement, support, promo) | `ADMIN_GRANT` |

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

- ~~**Tutor monthly sub**~~ — **resolved 2026-05-18.** Stays at
  **$29/mo flat, single tier, USD only** (no dual-currency for v1).
  Sits at the low end of the SaaS-tutor-platform market (Teachable
  $39, Thinkific $36, Podia $33) which is appropriate for a new,
  niche, vetted platform with no audience yet. Tiering (basic / pro
  with library limits, programme limits, quiz limits, etc.) stays
  deferred to v2 — see *Pricing-related items deferred to v2+* in
  [main.md](main.md).
- ~~**Enrolment-source values**~~ — **resolved 2026-05-18.**
  Three values for v1, mutually exclusive:

  | Value | When |
  |---|---|
  | `SELF_PAID` | Student paid through on-platform checkout. QAcademy collected the money. |
  | `TUTOR_ADDED` | Tutor added the student — whether the student paid the tutor offline or the tutor comped them. We don't distinguish; from QAcademy's revenue view both are $0, and we can't reliably know which actually happened. |
  | `ADMIN_GRANT` | QAcademy admin added the student (refund replacement, support case, promotional grant). Nobody paid. |

  `TRIAL_CONVERTED` was considered and dropped — trials are for the
  bank, not programmes; a trial student who later enrols goes through
  one of the three paths above.

  *Audit fields* like `enrolled_by_user_id` (which tutor or admin
  added them) go in separate columns, not encoded in the enum name.
  Finalise the column shape during build alongside the
  `nclex_enrolments` table.
- ~~**Cohort full / waitlist behaviour**~~ — **resolved
  2026-05-17.** Pattern C adopted: soft cap, waitlist always open,
  tutor decides who to approve. `cohort_size` stays on the cohort
  table as a tutor-set planning target — public list shows
  "X / Y enrolled" progress against it but does not enforce. The
  tutor's approval is the only hard gate.
- ~~**Auth model alignment**~~ — **resolved 2026-05-18.** MyNclex
  uses Supabase Auth as the source of identity. Two tables, 1-to-1:
  `auth.users` (Supabase-managed identity — email, hashed password,
  verification state) and `nclex_users` (our profile mirror with PK
  = `auth.users.id`). Wherever older planning text says
  "`nclex_users` is the account", read it as "`auth.users` is the
  account, with an `nclex_users` profile row alongside it." Full
  reframe lives in *Shared infrastructure → Identity model* above.
  Pay-first flow now uses Supabase's `inviteUserByEmail` rather
  than a Licensure-style custom setup token (see *Two paths on
  card click → Paid card → pay-first flow* in the Self-study
  section).

*(Self-paced enrolment — resolved 2026-05-17 — see the new
top-level "Self-paced enrolment" section below.)*

---

### Discovery — public programmes list

A single public page lists all *discoverable* tutored programmes —
no marketplace bells, just a directory.

- Card per programme: title, tutor name, brief description,
  **headline price** (or *Contact* button — see below), key
  details (length — shown as "N weeks" or "N modules" per the
  programme's `unit_label`, e.g. "8 weeks" or "8 modules" — and
  next available cohort's start date for tutor-led, or
  "self-paced" for self-paced).
- Only programmes from vetted, active tutors appear.
- **Discoverability gate is delivery-mode-specific (Settled
  2026-05-19):**
  - **Tutor-led** — discoverable only when the programme is
    PUBLISHED, the tutor is active, AND it has at least one **open
    cohort** (UPCOMING, or IN_PROGRESS with late-join allowed).
    PUBLISHED tutor-led programmes with zero open cohorts are
    treated as not-yet-launched — they don't appear. This prevents
    dead-end discovery pages (a programme nobody can join).
  - **Self-paced** — discoverable when the programme is PUBLISHED
    and the tutor is active. **No cohort requirement** — self-paced
    has no cohort layer and is intrinsically always-open (self-serve,
    instant access), so there's no "fill a cohort" gate to apply.
    The dead-end risk that motivates the cohort rule for tutor-led
    doesn't exist here; an empty self-paced programme is a tutor
    publishing-discipline matter, not a structural dead-end.

### Headline price display (Settled 2026-05-18)

In the decoupled model (post-2026-05-17), the programme listing
shows the tutor's programme fee only — the QAcademy bank pack is
a separate opt-in line at checkout, not bundled into the
displayed price.

- **Headline price** = the tutor's **upfront-full programme fee**.
  One number, in the currency the tutor configured (likely GHS
  for Ghana-based tutors, USD for international). Stored on the
  programme row.
- **A programme is single-currency (Settled 2026-05-19).** The
  tutor picks **one** currency (GHS *or* USD) and sets the price in
  it — not a GHS/USD pair. Rationale: the bank is QAcademy's product
  and is deliberately dual-currency (regional pricing — local vs
  diaspora), but a programme is the *tutor's* product. Asking an
  individual tutor to maintain two prices makes them run their own
  regional-pricing strategy, which most won't reason about well and
  which invites incoherent pairs (e.g. ₵2,000 set alongside $200).
  The student sees the tutor's currency; the FX-converted hint for
  the student's own toggle is already deferred as polish (below).
  **Schema impact:** the existing `nclex_programmes` table currently
  carries dual `price_minor_ghs` + `price_minor_usd` columns (a
  pre-decision artefact). Build must migrate these to a single
  `price_currency` (`'GHS' | 'USD'`) + `price_minor` pair. The
  per-strategy prices (deposit / installment variants) live on the
  payment-strategies sub-table and inherit the programme's currency.
- **Multiple payment strategies** (upfront / deposit + balance /
  installments) — only the upfront-full price appears publicly.
  Installment and deposit variants (and any surcharges on them)
  only appear at checkout. Keeps cards uncluttered and matches
  industry practice (Teachable, Thinkific, Coursera).
- **Optional bank hint.** A small line below the headline price
  reads *"💡 Add NCLEX Bank Access from $18 at checkout
  (optional)"* — sets expectation that bank is an add-on,
  doesn't muddy the headline.
- **Currency display (v1).** Show in the tutor's configured
  currency only. An automatic FX-converted hint ("≈ ₵2,860")
  based on the student's landing-page currency toggle is a
  polish item — deferred to a later slice.
- **Bank opt-in at checkout** always renders in the student's
  chosen currency (QAcademy product, dual-currency pricing —
  see *Bank opt-in at programme checkout* above).

### Programme detail page

Clicking a card opens the programme detail page with the full
description, syllabus shape, tutor bio, pricing (same headline
price as the card), and a **list of available cohorts**. Each
cohort row shows:

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

- `TRUE` — programme card and detail page show the headline price
  (per *Headline price display* above); cohort rows have *Enrol*
  buttons leading to checkout (on-platform or off-platform flow
  per the tutor's collection-mode setting).
- `FALSE` — programme card and detail page show a *Contact*
  button instead of the price. No price visible on any cohort
  row. Leads to the enquiry form (below).

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

### No waiting room (reconciled 2026-05-19)

There is no dedicated "waiting room" page. The cohort (or self-paced
programme) tile appears on the student's dashboard from the moment the
`nclex_enrolments` row exists — but **what the tile shows depends on
the enrolment status** (per *Enrolment row lifecycle* above), not on
the cohort's start date:

- **On-platform tutored** — the row starts `PENDING_APPROVAL`. The
  tile shows "Pending tutor approval" and programme content stays
  locked until the tutor approves (status → `ENROLLED`). (A ticked
  bank opt-in is a separate subscription and is usable immediately —
  it isn't gated on approval.)
- **Off-platform tutored** and **self-paced** — the row starts
  `ENROLLED` (no approval gate), so content is live from moment one.

Once a row is `ENROLLED`, what's visible *inside* the cohort is
governed by per-cohort release dates on the checklist activities —
see *Programme Structure → Content visibility* in [main.md](main.md).

(The pre-2026-05-17 model auto-enrolled on payment and went live
immediately for everyone; the `PENDING_APPROVAL` gate for on-platform
tutored enrolment supersedes that.)

### Edge cases (reconciled 2026-05-19 — Pattern C waitlist + decoupled bank)

| Scenario | System behaviour |
|---|---|
| Cohort at/over `cohort_size` (soft cap) | **Still joinable.** `cohort_size` is a tutor-set planning target only — never enforced (Pattern C). The cohort row shows "X / Y enrolled" progress; the waitlist stays open; the tutor's approval is the only hard gate on who actually enrols. |
| Cohort started + late-join is OFF | Cohort row shows "Enrolment closed" pill. New join requests not accepted. |
| Cohort started + late-join is ON | Cohort row stays joinable. (Bank access, if opted in, is a separate subscription with its own duration — no longer tied to the cohort end-date.) |
| Tutor-led programme PUBLISHED but zero open cohorts | Programme hidden from the public list (see Discovery — tutor-led gate). Self-paced is unaffected (no cohort requirement). |
| Tutor soft-stopped (per Tutor Onboarding) | All of the tutor's programmes hidden from the public list. Existing enrolled students retain programme access until their access window ends (per *Programme access window*); any bank subscription is the student's own and is unaffected. |
| Cohort cancelled (admin or tutor) | Cohort flips to CANCELLED; enrolment rows cascade to `CANCELLED`. Cohort hidden. Refunds handled manually, off-platform. Other cohorts of the same programme unaffected. |
| Programme cancelled (admin) | All of its cohorts cascade to CANCELLED, and their enrolments to `CANCELLED`. |
| Student already enrolled in this cohort | Detection on join/enrol attempt → "You're already enrolled — open the cohort." (Self-collision guard, per *Duplicate-email handling*.) |
| Student enrolled in multiple cohorts (same or different programmes) | Allowed. Each is a separate `nclex_enrolments` row. Bank access, if any, is a single decoupled subscription on the student's account — not per-cohort. |

### Parallel tables (MyNclex-prefixed)

New tables needed for tutored enrolment:

- `nclex_cohorts` — one row per cohort. Holds the cohort-level
  fields (dates, size, late-join, status, name override) and a FK
  to `nclex_programmes`. Schema finalised in build.
- `nclex_enrolments` — student ↔ programme link, with status,
  `enrolment_source`, and timestamps. For tutor-led the row also
  carries `cohort_id` (programme then inferrable via the cohort);
  for self-paced `cohort_id IS NULL` and the row references the
  programme directly. Schema finalised in build (greenfield — the
  older "cohort link" sketch is illustrative only).
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

## Enrolment row lifecycle (cross-cutting — tutored + self-paced)

**Settled 2026-05-18. Applies to every `nclex_enrolments` row
regardless of programme type.** Six mutually-exclusive status
values; one always set.

| Status | Set when | What the student sees | Bank access (if opted in) |
|---|---|---|---|
| `PENDING_APPROVAL` | Student paid on-platform; awaiting tutor approval. Tutored on-platform flow only — self-paced and off-platform never enter this state. | Programme tile shows "Pending tutor approval". No programme content access. | Unaffected — bank is a separate subscription. |
| `ENROLLED` | Tutor approves (on-platform tutored) **OR** tutor adds student (off-platform tutored) **OR** payment confirmed (self-paced). | Full programme content access. | Unaffected. |
| `PAUSED` | An installment due-date passed without payment. Background job (or manual tutor action) flips the status. | Programme tile shows "Payment overdue — access paused". Tutor can manually mark paid or extend grace. | Unaffected. |
| `REJECTED` | Tutor rejects a `PENDING_APPROVAL` request in the cohort workspace. | "Refund being processed" tile until admin handles the refund. Row preserved for audit. | Unaffected. |
| `CANCELLED` | Tutor or admin terminates an active enrolment; or cohort / programme is cancelled. | "Enrolment cancelled" tile. No access. Refund manual if applicable. | Unaffected (bank purchased separately is the student's own subscription). |
| `EXPIRED` | Access-window end-date passes. Background job flips the status nightly. | "Access expired" tile. No content access. Row preserved for history. | Unaffected. |

**Allowed transitions:**

```
                 ┌──────────────────────┐
                 │   PENDING_APPROVAL   │  (only entry point for
                 │  (on-platform paid)  │   on-platform tutored)
                 └──────┬───────────┬───┘
            approve │   │ reject
                    ▼   ▼
              ┌─────────┐   ┌──────────┐
              │ENROLLED │   │ REJECTED │  ← terminal
              └────┬────┘   └──────────┘
   installment │   ▲ installment paid
   overdue ▼   │
        ┌──────────┐
        │  PAUSED  │
        └────┬─────┘
             │
   (ENROLLED or PAUSED)
             │
  ┌──────────┴──────────┐
  ▼                     ▼
┌──────────┐       ┌──────────┐
│CANCELLED │       │ EXPIRED  │  ← both terminal
│(terminated)      │(window end)
└──────────┘       └──────────┘
```

**Where the status-flip jobs run (Settled 2026-05-19).** The two
recurring transitions — `ENROLLED`/`PAUSED` → `EXPIRED` (access-window
end) and `ENROLLED` → `PAUSED` (installment due-date passed) — run as
a **Supabase `pg_cron` nightly SQL function**, not a Cloudflare Worker
or GitHub Action. Both flips are pure date comparisons against
columns already on the row, so they belong next to the data: no worker
cold-starts, no external call surface, and they keep working even if
the app Worker is mid-deploy. The reminder *emails* that precede a
`PAUSED` flip (and any other notifications) need the MyNclex email
worker and stay deferred to build per *Finalised in build* below — only
the status flip itself is owned by `pg_cron`.

**Status NOT included (deliberately):**

- **`COMPLETED`** — finishing the curriculum is a content-progress
  concept (handled by the progress engine, see
  [progress-engine.md](progress-engine.md)), not an enrolment-row
  concept. The row stays `ENROLLED` until access expires.
- **Tutor-sub-lapsed "transition period"** — not a per-enrolment
  status. It's a global condition on the tutor account that gates
  programme access at read time (see *Programme access window*
  below). Doesn't need its own enrolment status.
- **Student-initiated cancellation** — deferred to v2 per the
  *Out of scope* section under Tutored enrolment.

**Self-paced flow entry points.** Self-paced enrolments are
created directly in `ENROLLED` (no `PENDING_APPROVAL` — no
tutor-approval gate). Same `PAUSED` / `CANCELLED` / `EXPIRED`
transitions apply once active.

**Off-platform tutored entry point.** Off-platform enrolments are
created directly in `ENROLLED` by tutor action (no
`PENDING_APPROVAL` — the tutor is both approver and actor).
Same downstream transitions apply.

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

### Payment-collection mode — on-platform by default (not forced)

**Revised 2026-05-20.** Self-paced **defaults** to on-platform
(QAcademy collects via Paystack) but is **no longer forced** there.
The self-serve / instant-access experience is still the *intended*
shape of self-paced — hence the default — but a tutor can switch a
self-paced programme to off-platform and enrol students by hand. It
works mechanically: the manual tutor-add path creates a self-paced
enrolment row with `cohort_id = NULL` exactly as before. Forcing
on-platform only removed tutor flexibility for no technical gain,
so it's a smart default in the form, not a hard constraint.

Original reasoning for the default (still valid as the *recommended*
path): the self-serve / instant-access experience is the whole point
of self-paced, and mediating it through manual payment-verification
weakens the model — so on-platform is what we steer tutors toward.
The on-platform hard rule lands (if ever) only when there's a
concrete reason to re-impose it.

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

### Enrolment flow — full sequence (Settled 2026-05-18)

Mirrors the tutored on-platform flow with the tutor-approval gate
removed:

1. Student lands on the programme detail page → picks one of the
   tutor's configured payment strategies (upfront full / deposit
   + balance / equal installments).
2. Optionally ticks the bank opt-in card (40% off — see *Bank
   opt-in at checkout* below).
3. Clicks Pay → Paystack checkout. Pays the **initial amount**
   for the chosen strategy (full price for upfront, deposit for
   deposit+balance, installment 1 for installments).
4. Paystack confirms → `nclex_payments` row flips to `PAID`.
5. If no `auth.users` row exists for the student's email yet,
   server fires `auth.admin.inviteUserByEmail(email)` — Supabase
   creates the identity row (no password) and sends the invite
   email. If an `auth.users` row already exists, skip to step 7.
6. Student clicks the invite link → lands on `/welcome` → fills
   name + chooses password → server writes the password to
   `auth.users` and inserts the matching profile row in
   `nclex_users`.
7. `nclex_enrolments` row created with
   `enrolment_source = 'SELF_PAID'`, status `ENROLLED`, and
   `cohort_id = NULL` (self-paced has no cohorts). **No
   `PENDING_APPROVAL` state — self-paced has no tutor-approval
   gate.**
8. Access-window clock starts ticking from this moment (per
   *Programme access window* above). Tutor's chosen window
   (e.g. 90d / 180d / 12 months / lifetime-of-sub) governs the
   end date.
9. Bank opt-in (if ticked) activates as a separate
   `nclex_subscriptions` row, independent of programme access.
10. Student logs in → dashboard → programme tile fully accessible
    from moment one.

The tutor sees the enrolment after the fact in their programme
workspace (no approval action needed).

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

## Finalised in build (not in planning)

- **Notification touchpoints across the flows.** Every payment /
  enrolment flow above triggers one or more notifications (student
  paid → tutor notified; tutor approves → student notified;
  installment due reminder; tutor rejects → "refund being processed"
  email; tutor-add → "you've been enrolled by X" email; access
  window approaching expiry; etc.). The MyNclex email worker
  architecture is referenced (mirrors the Licensure pattern), but
  the full event catalogue, message copy, and trigger wiring are
  deliberately deferred to build — we'll know which events matter
  once the surfaces are live and we see how students / tutors
  actually use them. Don't try to enumerate them all in advance.

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
- [tutor-library.md](tutor-library.md) — BUILT; library visibility
  for tutored students depends on the enrolment flow defined here
  (`nclex_student_can_see_note` checks active `nclex_enrolments`).
- `mynclex/CLAUDE.md` — stack, conventions, extraction rule.
