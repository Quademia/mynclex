# Domain, Company Identity & Auth — Settled 2026-08-05

*Status: decisions settled in the 2026-08-05 session (domain + company name +
auth/email audit). Nothing here is built yet — this doc records what was
decided and what was found, so the build slices that follow have one source
of truth. Companion registry: [transactional-email.md](transactional-email.md).*

---

## The settled decisions

### 1. Parent domain: **quademia.com**

All QAcademy-family products move under one parent domain, one subdomain per
product (the UWorld shape — nursing.uworld.com, medicine.uworld.com):

| Product | Future home |
|---|---|
| MyNclex | `nclex.quademia.com` |
| MyTeacher | `teacher.quademia.com` |
| Schools platform (Beta-B) | `schools.quademia.com` |
| MyNMCLicensure | `nmc.quademia.com` (or similar — name at attach time) |

**Why one parent matters (not just branding):** browser cookies can be scoped
to a parent domain and shared across its subdomains. Products on unrelated
domains can never share a login session; sibling subdomains can. This decision
is what keeps future cross-product SSO *possible*. It also means ONE domain to
verify with Resend for email, instead of one per product.

**How the name was chosen:** `qacademynurses.com` (owned, working) was ruled
out as the parent — half the portfolio isn't nursing. `qacademy.com` and
`mynclex.com` are not available to buy. Candidates tested and rejected:
`soaedu.com` (fails the say-it-aloud/spell-it test), the full
consonant+"-ademia" alphabet (only `zademia.com` was available; rejected by
ear), `cuademia.com` (homophone of quademia — word-of-mouth traffic would
land on a domain we don't own), and Rose/Peter family combinations
(best survivor: Rosestone — but weaker education signal). Quademia won every
round on the merits: available, pronounceable one way, spellable once heard,
reads as "academia", subdomains scan well.

**What the Q stands for: "Qualified."** Quademia = Qualified + Academia — the
academy that gets you qualified (NCLEX, NMC licensure, school exams). This is
the public story on the About page and anywhere the name is explained.

### 2. Company name: **Quademia Ltd** (legal = brand)

Nothing is registered yet — "QAcademy Educational Consult" appears in the
gamma repo's email sender but was never incorporated. The company registers
as **Quademia Ltd** (fallback styling if the registrar requires it:
"Quademia Education Ltd").

Why legal name = brand name, at this stage:

- **Card statements.** Paystack shows the legal name (truncated ~22 chars) on
  the customer's bank statement. "QUADEMIA LTD" is recognisable to someone
  who bought from quademia.com; an unrelated legal name reads as an
  unrecognised charge → disputes/chargebacks. Customers are mostly abroad,
  paying by card — this is revenue protection, not cosmetics.
- **Paystack verification.** Upgrading off the free/starter account requires
  registration documents + a bank account in the business name + the website.
  Certificate, bank account and domain all saying "Quademia" makes the review
  trivial; a mismatch invites stalls.
- A split ("Rosestone Ltd trading as Quademia") is legal and was considered —
  rejected as friction without a payoff at this size. Revisit only if a
  holding structure is ever needed.

Registration checklist (Sam, off-platform):
- [ ] Buy `quademia.com` (grab `.org` too if cheap)
- [ ] Name availability check at Ghana ORC before settling exact styling
- [ ] Ask Paystack which registration tier they need (business name vs
      company limited by shares) — the company form is the one that scales
- [ ] Business bank account in the exact registered name
- [ ] Quick trademark sanity check (Ghana + USPTO — customers are US-bound)
- [ ] Social handles (@quademia)

### 3. Rename debt this creates (build-list items when the domain is live)

- Gamma email worker + templates send as
  "QAcademy Educational Consult <noreply@qacademynurses.com>" → becomes
  Quademia + `noreply@quademia.com` once verified in Resend.
- MyNclex hardcodes `support@qacademynurses.com` in two files:
  `app/no-access/page.tsx` and `app/(public)/checkout/callback/page.tsx`.
- Supabase auth redirect allowlists + invite `redirectTo` (built from the
  request `origin` header today — `lib/enrolments/actions.ts`,
  `lib/payments/activate.ts`) must include the new host the day it attaches,
  or invite links silently break. Prefer pinning to an explicit site-URL
  setting over trusting `origin`.

---

## Auth/email audit findings (same session — the "what exists today" survey)

### Login methods

MyNclex has exactly one: **email + password** (`app/login/actions.ts`).
Accounts come into existence three ways: self-serve `/register`, tutor-add
invite (`lib/enrolments/actions.ts`), pay-first invite
(`lib/payments/activate.ts`) — the invited paths set a password at `/welcome`.

**⚠ There is NO forgot-password flow.** No page, no `resetPasswordForEmail`
call, no link on the login form. A student who forgets their password is
locked out permanently short of manual admin intervention. Gamma already has
the full flow (forgot-password.html, reset-password.html, rate-limit tables)
to crib from. **This is the top auth gap.**

No Google / magic-link / OTP on MyNclex (gamma has Google + magic link;
Beta-B has Google + Microsoft via NextAuth).

### Email

- **No email layer exists.** `workers/` is empty, Resend isn't a dependency.
  The only emails MyNclex has ever sent are Supabase Auth invites.
- **⚠ Unverified whether the Supabase projects are on default SMTP** (needs a
  dashboard check on both). Default SMTP = unbranded sender + a few emails/hr
  rate limit — which would silently break tutor-add onboarding at class size.
  Gamma's prod setup doc (`db/setup/supabase_auth_storage.md`) shows the
  custom-SMTP-via-Resend pattern to replicate.
- The `EMAIL-TRIGGER` marker convention in transactional-email.md has
  drifted: ~15 events are marked "anchor exists, needs marker" but only ONE
  marker exists in code. Needs a tidy pass.
- **Architecture conflict to settle at build time:** transactional-email.md
  says "dedicated email worker"; BUILD_LIST.md ("Email (locked, not built)")
  says React Email sent directly from server actions, no worker. Lean:
  server actions — MyNclex runs server-side already, the Resend key never
  reaches a browser, fewer moving parts. (Gamma's worker pattern also ships
  its shared secret to the browser in `js/config.js` — a flaw to fix there,
  not a pattern to copy.)

### SSO

- **"Sign in with Google": feasible, modest slice.** Enable provider on both
  Supabase projects + button. The real work: a first-time Google user skips
  `/register`, so profile-row + STUDENT-role creation must happen on the
  OAuth callback path or they land half-created.
- **True cross-product SSO: parked.** The three products sit on three
  separate identity systems (MyNclex Supabase pair, gamma Supabase pair,
  Beta-B NextAuth+D1). Same parent domain keeps the door open; merging
  identity systems is a large separate decision and cuts against the
  extraction rule.

### Corrections to standing docs

- **CLAUDE.md said MyNclex uses the "shared QAcademy instance" for Supabase.
  Wrong** — MyNclex has its own dev/prod projects (`xkqxfzfsllxyxpdtcrja` /
  `dehspjcfmhoshcdtsmjq`), separate from gamma's pair. Corrected 2026-08-05.
- `sessions/2026-07.md` and `readiness-packs.md` record "`mynclex.com` → 200"
  as a prod release check, calling it "the separate landing." **We do not own
  mynclex.com** (and it is not for sale). Whatever responded 200 was not ours.
  Left in place as history; do not repeat mynclex.com as a release check.

---

## Login methods & rate limiting — settled 2026-08-05 (same session, later)

**v1 login menu: email+password · forgot/reset password · Google sign-in ·
6-digit email-code login.** *(Code login promoted from v2 to v1 on Sam's
call, 2026-08-05 — "I don't like to push things that can be done to v2.")*
Emulates gamma's *menu*, not gamma's build:

- **Magic link is deliberately NOT copied** — it double-loads the weakest
  infrastructure (email delivery), the WhatsApp/Gmail in-app-browser trap
  means the session often lands in a browser the student doesn't use ("the
  link didn't work"), and one-time links get consumed by email-security
  prefetchers before the student clicks. The **email-code login replaces
  it**: same no-password benefit, but the student types the code into the
  browser they're already in, so both failure modes structurally vanish.
- **Email-code login design (verified against Supabase docs 2026-08-05):**
  OTP and magic link share one implementation — putting `{{ .Token }}` in
  the Magic Link email template makes it send a code instead; the app
  verifies with email + code (`verifyOtp`, type `email`). Settled:
  - Template goes **code-only** (no link) — magic link stays off the menu.
  - **`shouldCreateUser: false`** — codes sign in EXISTING accounts only;
    registration stays a deliberate act. (Default would auto-create a bare
    auth user with no profile/role — same trap as first-time Google.)
  - Expiry short (minutes, not the 24h cap); Supabase's built-in
    send-frequency spacing stacks under our layer-2 rule below.
  - Honest cost, accepted: students who choose this door put email
    delivery in their routine login path — which is why it sits AFTER the
    SMTP fix in the build order, and why password + Google remain.
- **Google slice's real work is not the button:** (a) first-time Google users
  skip `/register`, so profile row + STUDENT role must be created on the
  OAuth callback path; (b) verify account-linking behaviour deliberately —
  an email+password student later using Google with the same address must
  land in the SAME account, not a duplicate.
- **Email confirmation policy:** decide consciously when SMTP is fixed.
  Invited flows prove email ownership implicitly; only self-serve /register
  is exposed. Turn confirmation on for self-serve the day delivery is
  reliable — not before.

**Rate limiting: three layers.** *(Revised 2026-08-05, later the same
session — the first cut of this section claimed Supabase built-ins +
Turnstile could stand in for gamma's rules entirely, and that the events
table would "never decide anything". Sam pushed back; on investigation he
was right. Both claims are corrected below.)*

Gamma's rules deserve to be ported, not just admired. Read in full from
`db/migrations/auth_events_and_rate_limit.sql` + `reset_rate_limit.sql`:

| Rule | Window | Threshold |
|---|---|---|
| Login fails per **email** | 10 min | 5 → blocked |
| Login fails per **email** | 24 h | 10 → blocked |
| Login fails per **device** (fp hash) | 10 min | 5 → blocked |
| Login fails per **device** | 24 h | 10 → blocked |
| Reset requests per **email** | 60 min | 3 → blocked |
| Login-code requests per **email** (ours, no gamma equivalent) | 60 min | 3 → blocked |

Design credit where due: graduated windows (sharp brake + slow-grind
catcher), two axes (email AND device, so rotating either still trips the
other), blocked attempts excluded from the counts (punishment doesn't feed
itself), and `retry_after_seconds` returned so the page says "try again in
X minutes" instead of dead-ending. Gamma's real weakness is only WHERE it
runs — browser JS calling RPCs, which an attacker skips by hitting
Supabase's endpoint directly with the public anon key. Supabase built-ins
do NOT replicate these rules (its sign-in limit is per-IP, not per-email;
no graduated account lockout exists) — they cover different attacks.

MyNclex layers:

1. **Turnstile + Supabase built-ins (bots + bulk):** built-in auth rate
   limits (tune in dashboard during the SMTP pass — same screen) +
   **Cloudflare Turnstile** on login/register/forgot-password, verified
   server-side inside the server action before Supabase is called (use the
   native Supabase↔Turnstile integration so the direct endpoint also
   demands a token). Cloudflare WAF/edge rules in reserve. Free protection
   the counters shouldn't have to absorb.
2. **Gamma's graduated rules, ported into the server actions (targeted
   abuse):** one count-query on `nclex_auth_events` at the top of the
   login/reset actions, same thresholds as the table above, same
   retry-countdown UX. Enforced server-side, so nobody using our forms can
   skip it — gamma's logic one layer deeper. **v1 drops only the
   device-fingerprint axis** (Turnstile substitutes for it; keeps
   fingerprint hashing out of the table). Ships with the forgot-password
   slice.
3. **Auth-hook upgrade (parked, build list):** Supabase auth hooks include
   a password-verification-attempt hook — the same check moved INSIDE
   Supabase Auth, binding even direct endpoint calls (the layer gamma could
   never reach). Verify hook specifics against Supabase docs at build time.

- **Support logbook (`nclex_auth_events`):** ⚠ correction to the first cut
  of this section — with layer 2 adopted, the table IS read by enforcement
  (one count at action-top), so "records, never decides" no longer holds.
  What survives of that principle: the table stays **append-only** (gains a
  reader, never an updater), and layers 1/3 stand independent of it — if
  the table broke, bot/bulk protection would be unchanged; only the
  per-email thresholds and support visibility would pause.
  write-side ships WITH the forgot-password slice (logs can't be captured
  retroactively — the table must exist before the support case does). Logged
  from server actions after each login/register/reset attempt: event type,
  email tried, outcome, rough device label. No passwords, admin-only RLS,
  retention sweep. If this table broke, protection would be unchanged —
  support would just be blind. **Read-side admin viewer** ("account
  activity" panel on admin user detail) is its own later slice, built when
  support traffic justifies it.

  **Gamma's TWO tables become this ONE.** Gamma split `auth_events` (login
  watchdog) from `reset_requests` (reset watchdog) because each carried its
  own enforcement RPCs — kill enforcement and the reason for two tables
  disappears; a reset request is just another event. Design consequences,
  settled 2026-08-05:
  - One `event_type` column: `LOGIN_OK` · `LOGIN_FAIL` · `REGISTERED` ·
    `RESET_REQUESTED` · `RESET_COMPLETED` · `CODE_REQUESTED` ·
    `CODE_LOGIN_OK` · `CODE_LOGIN_FAIL` (later `INVITE_ACCEPTED`,
    `GOOGLE_FIRST_SIGNIN`). One timeline per student — support reads the
    whole story in order instead of interleaving two tables. (A
    `CODE_REQUESTED` with no `CODE_LOGIN_OK` after it = "check your spam",
    same read as unfinished resets.)
  - **Append-only.** Gamma's `used`/`used_utc` update-back flag is replaced
    by reading the timeline: a `RESET_REQUESTED` with no `RESET_COMPLETED`
    after it IS the unfinished reset ("requested 14:02, never completed →
    check spam"). No row is ever updated.
  - **No fingerprint hashes.** Gamma's `fp_hash`/`ua_hash` existed to
    enforce per-device limits; no enforcement → no fingerprints. Keep only
    the human-readable device label ("Android · Chrome") — less machinery,
    less quasi-identifying data at rest.
  - **Keep gamma's `user_exists` idea** on reset events: the page stays
    silent about unknown emails (anti-enumeration), but the log records
    "requested for an address we don't know" — which answers the #1 support
    case ("never got the email" → "you asked for your Yahoo; your account
    is under your Gmail").
- Known limit: "I registered under a different email" is invisible to any
  log — the admin user-search is the tool for that case.

---

## Build order (once the domain is bought)

1. **Verify quademia.com in Resend + custom SMTP on both MyNclex Supabase
   projects, branded auth templates** — nothing email-dependent is safe
   before this.
2. **Forgot-password flow** (depends on 1) — carries Turnstile on the three
   public forms, the `nclex_auth_events` write-side, AND the layer-2
   per-email threshold checks (gamma's rules, server-side) with it.
3. **Email-code login** (depends on 1; reuses slice 2's Turnstile + logging
   + threshold plumbing) — code-only Magic Link template,
   `shouldCreateUser: false`, request-code + enter-code UI on the login
   page, `CODE_*` events logged.
4. **Attach `nclex.quademia.com` to the app Worker** (routes block in
   wrangler.jsonc + Supabase redirect allowlist + site URL).
5. **Google sign-in** — gated on the consent screen showing Quademia, not
   a Supabase project ID (the gamma-era "sign in to
   <ref>.supabase.co" screen must never exist here). Settled 2026-08-05:
   **try the free fix first** — Google Cloud Console Branding +
   Verification (shows logo + name instead of the project ID; brand
   verification takes a few business days; test on the DEV project's
   OAuth credentials and look at the actual screen before shipping).
   The Supabase custom-domain add-on (paid) is the **escalation only if
   branding alone still leaks the supabase.co URL** — judged too
   expensive as a default for a cosmetic fix. Slice also carries:
   first-time-Google profile+role creation on the callback path, and
   the account-linking check (same email = same account, no duplicate).
6. Transactional email arc (registry already in transactional-email.md).
7. Cross-product SSO — parked, revisit post-migration of sibling products.
