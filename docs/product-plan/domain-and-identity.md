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
| MyNMCLicensure | `licensure.quademia.com` |

*Subdomain names settled 2026-08-05 (attached at each product's
migration time, so rename-before-attach stays cheap):*
- **`licensure`** for MyNMCLicensure — the product is **Ghana-based**
  (NMC here = Ghana's Nursing and Midwifery Council), and "the licensure
  exam" is what its students call the thing. Rejected: `nmcghlicensure`
  (15 chars, phone-hostile), `nmc` (ambiguous — the UK regulator is also
  the NMC, and a future UK-bound product would fight over it; if that
  product ever exists, *it* takes the specific name, e.g. `uknmc`/`cbt`).
- **`teacher`** for MyTeacher — matches the brand users already know;
  its students log in there too, and `assessor` is a rarer word to type.
  (`assessor`/`assess` considered — the product is really class-based
  assessment; revisit only at gamma-migration time if the brand itself
  is rethought.)
- **`schools`** (plural) for Beta-B — the hub for many schools. The
  white-label ambition strengthens this: a white-labeled school gets its
  own subdomain (`<schoolname>.quademia.com`) or custom domain later, so
  the hub name stays out of their way.

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
- [x] **BOUGHT 2026-08-05:** `quademia.com` AND `quademia.org` (~£20 for
      both), on the **workspace Cloudflare account** (Cloudflare
      Registrar), 2FA enabled on the account first, auto-renew on. Why
      that account: the prod app Worker lives there, and Cloudflare only
      routes a custom domain to a Worker when the domain's DNS zone sits
      in the *same* account — buying it anywhere else would have added a
      zone-transfer step before build-order item 4. Buying via Cloudflare
      Registrar also means DNS was born in Cloudflare (day-one sequence,
      step 1, effectively done). The `.org` is purely defensive — an
      education brand's most credible lookalike TLD — and does nothing
      until it's pointed as a redirect to `.com` someday; no email, no
      site, just renews.
- [ ] Name availability check at Ghana ORC before settling exact styling
- [ ] Ask Paystack which registration tier they need (business name vs
      company limited by shares) — the company form is the one that scales
- [ ] Business bank account in the exact registered name
- [ ] Quick trademark sanity check (Ghana + USPTO — customers are US-bound)
- [ ] **Check + secure `@quademia` social handles** — urgency raised
      2026-08-05: the name is now publicly discoverable (domain
      registration + certificate logs), so squatting risk is live.
      Platforms, chosen for the phone-first audience: **Instagram,
      TikTok, Facebook, WhatsApp Business, X, YouTube, LinkedIn**
      (company page). Register even with no content plan — an empty
      owned handle beats a squatted one (same logic as the `.org`).
      Where `@quademia` is taken, use ONE consistent fallback everywhere
      (e.g. `@quademiahq`), not a different name per platform. Register
      with `hello@quademia.com` (public-facing face; infra keeps
      `admin@`).

### 2b. New logo needed (noted 2026-08-05; urgency raised same day)

The current logo is geared to **QAcademy** and doesn't carry over — the
rebrand needs an **official Quademia logo**. Wanted before/alongside the
domain going live, because the logo lands in several launch-path places
at once: the Google OAuth consent screen (Branding config — the free
consent-screen fix shows *logo + name*), the branded Supabase auth email
templates (SMTP slice), the app shell/topbar, favicons/app icons, and
the future landing page.

**One slot is live TODAY (Sam, 2026-08-05):** the **Workspace profile
picture** on sam@quademia.com. That avatar is what recipients see next
to every email sent from sam@ *and* every alias face (admin@, support@,
hello@, billing@) — a logo there makes every mail from us read as
official from the first glance, at zero infrastructure cost. It's the
cheapest, highest-visibility branding surface we have, and it's empty
until the logo exists. Design work happens off-repo; the asset drop is
a small slice when ready.

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
- ~~**⚠ Unverified whether the Supabase projects are on default SMTP**~~
  **RESOLVED 2026-08-06: they were — both of them.** Confirmed the honest
  way, in passing: the custom-SMTP toggle was OFF on dev and on prod when
  each was opened for the wiring (nothing to configure it with had ever
  existed — no Resend account, no credentials). Both now run **custom SMTP
  via Resend** (see the build-order item 1 status below). The original
  worry stands as history: default SMTP = unbranded sender + a few
  emails/hr — it would have silently broken tutor-add onboarding at class
  size. Gamma's prod setup doc (`db/setup/supabase_auth_storage.md`) was
  the pattern replicated.
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

- **"Sign in with Google": feasible, modest slice — and SIGN-IN ONLY.**
  Enable provider on both Supabase projects + button. ⭐ **Settled
  2026-08-09 (later still): Google never creates an account.** It is a
  second door into an account that already exists. Mechanism and reasoning
  in build-order item ⑤.
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
    auth user with no profile/role.) ⭐ **Google took the same stance on
    2026-08-09 (later still)** — see item ⑤ — so both passwordless doors now
    agree: *signing in never registers.* What was a warning about a trap
    Google was going to walk into became a shared rule.
  - Expiry short (minutes, not the 24h cap); Supabase's built-in
    send-frequency spacing stacks under our layer-2 rule below.
  - Honest cost, accepted: students who choose this door put email
    delivery in their routine login path — which is why it sits AFTER the
    SMTP fix in the build order, and why password + Google remain.
- **Google slice's real work is not the button:** (a) ⚠ **turning unknown
  addresses away** — Google is sign-in only, so an address with no account
  here must be refused *before* an `auth.users` row is written; (b) verify
  account-linking behaviour deliberately — an email+password student later
  using Google with the same address must land in the SAME account, not a
  duplicate. ⓘ **(a) was reversed on 2026-08-09 (later still).** It read
  "profile row + STUDENT role must be created on the OAuth callback path"
  from 2026-08-05 until then — the exact opposite instruction. Anyone
  working from a stale copy will build the wrong half of this slice.
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
catcher), two axes (email AND device), blocked attempts excluded from the
counts (punishment doesn't feed itself), and `retry_after_seconds`
returned so the page says "try again in X minutes" instead of
dead-ending.

⚠ **Correction, 2026-08-06, from reading gamma's SQL rather than this
summary of it:** the line above used to read "two axes … so rotating
either still trips the other", which describes redundancy and is wrong.
**Gamma's device query carries no `identifier` filter** — it counts
failures for a fingerprint across *every* address. So the axes catch
opposite attacks: the email axis sees many attempts against ONE account
(credential stuffing on a known target), the device axis sees ONE machine
failing against MANY accounts (a spray or an enumeration sweep). Dropping
the device axis therefore does not weaken the email rule — it removes the
only rule watching a different door. That is what makes Turnstile
load-bearing rather than merely nice (layer 1), and it is the reason 2d
should not lag far behind 2c.

⚠ **One more thing gamma gets wrong, and we did not port:** its countdown
comes from `MIN(created_utc)`, the oldest attempt in the window. That is
correct only when the count sits exactly on the threshold. Past it — 7
failures against a limit of 5 — the oldest ageing out still leaves 6, so
gamma tells the student to return in 2 minutes and refuses her again when
she does. The block actually lifts when the **Nth-newest** attempt ages
out. Ours computes that instead, and needs at most `limit` rows to do it. Gamma's real weakness is only WHERE it
runs — browser JS calling RPCs, which an attacker skips by hitting
Supabase's endpoint directly with the public anon key. Supabase built-ins
do NOT replicate these rules (its sign-in limit is per-IP, not per-email;
no graduated account lockout exists) — they cover different attacks.

MyNclex layers:

1. **Turnstile + Supabase built-ins (bots + bulk):** built-in auth rate
   limits (tune in dashboard during the SMTP pass — same screen) +
   **Cloudflare Turnstile** on login/register/forgot-password. ✅ **BUILT as
   slice 2d, 2026-08-08.** Cloudflare WAF/edge rules in reserve. Free
   protection the counters shouldn't have to absorb.

   ⚠ **CORRECTED 2026-08-08 — this paragraph used to ask for two checks and
   they cannot both exist.** It read *"verified server-side inside the server
   action before Supabase is called (use the native Supabase↔Turnstile
   integration so the direct endpoint also demands a token)"*. A Turnstile
   token can be validated **exactly once**; whichever side checks it first
   spends it and the other is handed a used one. Building the first half is
   what surfaced this. **Supabase is the verifier** — it is the only one of
   the two standing at *both* doors, since the anon key is public and anyone
   can call Supabase's auth endpoint without ever touching our code. Our
   server actions read the token without consuming it and forward it in
   `options.captchaToken`. See `lib/auth/turnstile.ts` and slice 2d below.
2. **Gamma's graduated rules, ported into the server actions (targeted
   abuse):** ✅ **BUILT as slice 2c, 2026-08-06** — `lib/auth/thresholds.ts`.
   One count-query on `nclex_auth_events` at the top of the login/reset
   actions, same thresholds as the table above, same retry-countdown UX.
   Enforced server-side, so nobody using our forms can skip it — gamma's
   logic one layer deeper. **v1 drops only the device-fingerprint axis**
   (Turnstile substitutes for it; keeps fingerprint hashing out of the
   table) — ⚠ but see the correction above for what that axis was actually
   doing, and why layer 1 is not optional now. ⚠ **And it must NOT grow an IP threshold** — see the IP
   decision below; the address is logged and never enforced on, because
   Ghanaian mobile carriers put thousands of subscribers behind a handful
   of addresses and a per-IP rule could lock out a whole network's worth
   of nurses on a busy evening. → The same "what is a device, and do we
   care?" question returns
   in **Concurrent sessions / device limits** below; the answer there is
   also *don't fingerprint* — count Supabase's real sessions instead.
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
  - ⭐ **THE PAGE AND THE LOG HAVE DIFFERENT AUDIENCES, AND ARE ALLOWED
    DIFFERENT ANSWERS** (Sam, 2026-08-06, while reading the first
    `LOGIN_FAIL` rows). The anti-enumeration rule constrains what the
    PAGE may say. It does not constrain what we may KNOW. An admin
    reading a support case sits behind a login, a role check and an RLS
    policy, and has no reason to inherit a visitor's blindfold.
    **Consequence, built in 2b:** `user_exists` is filled on `LOGIN_FAIL`
    too, and `reason` carries our diagnosis — `wrong_password` vs
    `no_such_account` — while the student keeps seeing Supabase's
    identical "Invalid login credentials" for both. So `user_exists`
    stopped being a reset-only column.
    **Why record it rather than look it up later:** a lookup answers
    "does this address exist NOW". A student who mistypes on Monday and
    registers properly on Tuesday leaves a Monday row that a Wednesday
    search reads as "her account existed, so it was a password problem"
    — misleading, and silently so. It also separates two attacks that
    look identical otherwise: failures against addresses that DON'T
    exist are enumeration, against ones that DO are credential stuffing.
    ⚠ **The answer must never travel back to the user** — not in an
    error, a response body, or a redirect. That is the enumeration
    oracle we declined to build, rebuilt by accident.
    ⓘ Known gap: `accountExistsForEmail` reads `nclex_users`, not
    `auth.users`, so a pay-first buyer between paying and finishing
    setup at `/welcome` logs as "no account". Flag only — she can still
    reset. Closing it needs a SECURITY DEFINER function, since PostgREST
    does not expose the auth schema.
  - **The IP address: logged, never enforced on** (settled with Sam,
    2026-08-06 — the doc previously recommended storing none). Storing
    and blocking are two decisions and they go different ways here. It
    is the only axis that can SEE a spray that came through our own
    forms; a per-IP *threshold* is the dangerous half, for the
    carrier-NAT reason in the rate-limiting section above. ⓘ Its honest
    scope is "traffic through our forms" — an attacker calling
    Supabase's endpoint directly with the public anon key never reaches
    our server actions and writes no row at all.
- Known limit: "I registered under a different email" is invisible to any
  log — the admin user-search is the tool for that case.

---

## Concurrent sessions / device limits — researched 2026-08-06 (later)

*Raised by Sam while scoping slice 2a: "how many devices can be logged in
on the same user at a time — gamma does it." It had never entered this
doc. It belongs here, because it is the same question as the device axis
we just dropped from rate limiting: **what is a device, and do we care?***

**This is a revenue problem wearing a security costume.** The Bank is a
standalone subscription, and a question bank is the classic
shared-password product — one nurse buys, her study group uses it. Every
other item in this doc protects students from attackers. This one
protects the product from its own customers, which is why it reads
differently and why the acceptable false-positive rate is much lower: an
over-tight limit doesn't annoy an attacker, it annoys a paying student.

### What gamma built (read 2026-08-06)

`sessions` table (`db/schema.sql` §1.11) — **max 2 active per user**,
7-day expiry. On login it counts active sessions and, at 2, deactivates
the **oldest** before inserting the new one. `guard.js` re-checks on
every guarded page load and treats a dead session as logged out; logout
sets `active = FALSE`; rows are never deleted.

⚠ **Same structural flaw as gamma's rate limiting, for the same reason:
it runs in the browser.** The session id lives in `localStorage` and the
check is a script the browser is trusted to run. A sharer doesn't have to
defeat it — a browser that never runs `guard.js` is unaffected. Speed
bump, not a lock. The *rule* is worth porting; the *placement* is the
thing we fix by being server-side, exactly as with layer 2.

### What Supabase gives natively (verified against Supabase docs 2026-08-06)

Three settings, no code, per project, under **Authentication → Sessions**:

| Setting | Does |
|---|---|
| Time-box user sessions | Fixed maximum lifetime, then re-authenticate |
| Inactivity timeout | Sessions die if not refreshed within N |
| **Single session per user** | Most recent sign-in survives; all others terminated |

⭐ **Only ONE of the three addresses sharing.** Time-box and inactivity
timeout force periodic re-login — a security/compliance feature (their
docs frame it around SOC 2 / HIPAA). A shared account simply logs in
again, so neither touches the problem. Don't let "Supabase offers all
three" read as "Supabase solves this".

Two limits on the one that does apply:
- **It is exactly 1, not N.** There is no "max 2" setting.
- **It is not instant.** Enforcement happens when a session next
  *refreshes*, so the effect lands within roughly the access-token
  lifetime (1 h by default), not at the moment someone else signs in.

⭐ **The useful gift is elsewhere:** every access token carries a
**`session_id` claim** (UUID) matching the primary key of
`auth.sessions`. Gamma invented its own session ids because it had no
server to ask. We do not need to.

### Settled direction

**Reject single-session-per-user as the default.** It would log a student
out of her laptop every time she opened her phone. Study on the laptop,
practise on the phone is the exact pattern the mobile work was designed
around (`mobile-responsive.md`) — punishing it to deter sharing costs
more than it saves. Gamma's **2** exists for that reason and is the right
starting number.

**What we would build is a POLICY, not a session system.** Supabase keeps
owning sessions — issuing, refreshing, revoking. We only add the rule:
count this user's live sessions, and when a third appears, revoke the
oldest. That is much smaller than gamma's build, and unlike gamma's it
can *actually revoke* rather than flip a boolean the browser is trusted
to honour. Our own check also bites on the **next page load**, where
Supabase's native toggle waits for a token refresh — ours is stricter
*and* faster, which is itself an argument for allowing two rather than
one.

⚠ **What is counted is browsers, not devices.** One laptop running Chrome
and Edge is two sessions. Whatever number gets picked, pick it knowing
that — "2 devices" and "2 sessions" are not the same promise, and the
support conversation will be about the difference.

### ⭐ Sequencing: capture first, decide with evidence

**Not part of slice 2, and deliberately given no build-order number yet.**

Slice 2a logs a `LOGIN_OK` with a `device_label` on every successful
sign-in. **The moment that ships, account sharing becomes visible** — one
account, five device labels, a week's worth of usage — with no
enforcement built at all. So: ship 2a, watch real logins, then choose the
limit from data instead of picking a number in advance. Same rule applied
elsewhere in this product (capture the data now, defer the surface —
see [[analytics-deferred-per-feature]] in practice across the progress
engine and audit log).

Consequences folded back into slice 2a because of this:
- The **device-label helper** (user-agent → "Android · Chrome") is built
  once there and shared with any future session slice. Don't write it
  twice.
- ⓘ **Password change already terminates all of a user's sessions**
  (Supabase behaviour, per their sessions doc). So the forgot-password
  flow being built in slice 2 *is itself* the "kick everyone off" button
  — which is exactly what a student does the day she realises her
  password got around. Worth saying in the support copy when that exists.

⚠ **Unverified:** whether these three toggles are available on the free
plan. Supabase's docs don't say, and auth config cannot be read over MCP
(same limit as the rate-limit and OTP-expiry settings). Visible on
Authentication → Sessions — worth a glance, because if time-boxing is
free it is a cheap win independent of everything above.

---

## Professional email — settled 2026-08-05 (same session, later)

Two systems share the domain and must not be confused:

1. **The robot (sending):** app-fired mail — invites, resets, login codes,
   receipts — as `noreply@quademia.com` via **Resend** (the already-settled
   plan). No mailbox exists behind noreply@; it's a sender identity whose
   right to send comes from DNS records set when verifying the domain in
   Resend. Auth/transactional emails send from the **root domain** (they
   should look maximally official); a reputation-isolating subdomain
   (e.g. `mail.quademia.com`) is considered only when bulk sends
   (nudges/announcements) arrive with the transactional-email arc.
2. **The humans (receiving + replying):** real mailboxes. **No new
   purchase** — Sam's existing Google Workspace seat
   (admin@qacademynurses.com + aliases) carries the move, because
   Workspace charges per person, not per domain:
   - Add quademia.com to the existing Workspace (Admin console → Domains;
     verify via one TXT record; point quademia.com MX at Google).
   - **Rename the user** admin@qacademynurses.com → sam@quademia.com —
     same mailbox, same history, same subscription; Google auto-keeps the
     old address as an alias.
   - Recreate free aliases on the new domain: support@, hello@, billing@,
     admin@ — one inbox wearing department faces.
   - **Primary = the person, roles = aliases (settled 2026-08-05).**
     `sam@quademia.com` is the primary Workspace identity; `admin@` is an
     alias on it, NOT the other way round. A primary is the account's
     identity and expensive to change; an alias is free to re-point — so
     the stable thing (the human) holds the primary and the roles ride as
     labels. Also: Google's security model (recovery, 2FA, alerts) assumes
     one account = one human, and some vendor signups block role-based
     addresses (`admin@`/`info@`) outright.
   - **Infrastructure accounts register under `admin@quademia.com`** (the
     alias): Cloudflare, Supabase, Resend, Paystack, GitHub. Mail lands in
     Sam's box either way, but the day a second human runs infrastructure,
     `admin@` converts to its own account/group and every vendor account
     transfers with it — without entangling Sam's personal identity.
     Be consistent: every infra vendor gets `admin@`, human correspondence
     stays `sam@`.
   - Optionally flip quademia.com to primary domain (blocked on a few
     purchase channels; if blocked, daily reality is identical — skip).
   - Bill only ever grows when a second HUMAN needs a separate inbox.

**DNS coexistence rule:** Google (human mail) and Resend (robot mail) each
need auth records on quademia.com. SPF must be ONE record naming both —
two competing SPF records is a classic silent-delivery killer. DKIM
selectors are separate per sender (fine). Start DMARC in monitoring mode
(`p=none`), tighten later.
  ⓘ **How it actually landed (2026-08-06):** the feared root-SPF edit
  never happened, because Resend doesn't put SPF on the root at all — its
  records scope to the **`send.` subdomain** (MX + SPF on
  `send.quademia.com`, DKIM on its own `resend._domainkey` selector).
  Google's root SPF record is untouched and stays Google-only. The
  ONE-record rule above remains true and live — it just turned out
  nothing needed merging for this sender. Re-check it if any future
  sender wants root-level SPF.
  ⓘ **Confirmed by lookup 2026-08-06 (later), after both senders and
  DKIM were live:** root `quademia.com` still carries exactly one SPF
  record, `v=spf1 include:_spf.google.com ~all` (Google only), while
  Resend's sits separately on `send.quademia.com` as
  `v=spf1 include:amazonses.com ~all` (Resend delivers over SES
  underneath). **Two SPF records that never had to be merged, because
  they are on different names** — the danger the rule guards against is
  two records on the *same* name, which is a different thing from two
  records in the same zone. DKIM likewise coexists on separate selectors
  (`google._domainkey` + `resend._domainkey`), which is by design.

**Workspace move — DONE 2026-08-05, all in one day.** The completed
sequence, in order:

1. quademia.com added to the Workspace as a **secondary domain**,
   verified, **Gmail activated**. Google's auto-setup wrote the DNS into
   Cloudflare itself: the **legacy 5-record MX set** (`aspmx.l.google.com`
   + four `alt*` — supported indefinitely per Google, "no changes
   required"; do NOT replace with the newer single `smtp.google.com`
   record) and the SPF TXT (`v=spf1 include:_spf.google.com ~all` — the
   ONE record the Resend slice later edits, never duplicates).
2. ⚠ Detour worth remembering: the domain-add flow **accidentally created
   a second user** at sam@quademia.com (a second seat, squatting on the
   rename's target address). Deleted (empty, minutes old, no data
   transfer) before renaming; billing seat count checked back to 1.
3. **Rename done:** admin@qacademynurses.com → `sam@quademia.com` — same
   mailbox/history/subscription; the old address auto-kept as an alias
   (proven: still receives).
4. **Aliases added** on quademia.com, all landing in the one inbox:
   `admin@` · `support@` · `hello@` · `billing@`.
5. **Org display name** → Quademia; **primary domain FLIPPED** —
   quademia.com is now the Workspace primary, qacademynurses.com demoted
   to secondary/legacy receiver (the flip was allowed; the "skip if
   blocked" fallback wasn't needed).
6. **Delivery proven by test mail** from an outside account to all three
   routes: sam@quademia.com ✓ · admin@quademia.com ✓ ·
   admin@qacademynurses.com ✓.

Two loose ends deferred — **both CLOSED 2026-08-06 (later)**:

- [x] **DKIM** — was blocked by Google until ~24h after Gmail activation
      (prompt seen 2026-08-05); the gate opened and it was done on the
      06. Admin console → Apps → Gmail → Authenticate email →
      quademia.com → Generate new record → `google._domainkey` TXT in
      Cloudflare → **Start authentication**. Affects outbound signatures
      only; nothing else waited on it.
      **Verified by DNS lookup, not by report:** the published key's own
      header (`MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A…`) is the **2048-bit**
      RSA signature — so the key length is a fact about the record, not
      a claim about which radio button was clicked. Google-side state
      confirmed by Sam: the console offers **Stop** authentication,
      which only appears once it is running.
      ⚠ **The step that silently does nothing if skipped is "Start
      authentication".** Publishing the TXT record is necessary and not
      sufficient — and DNS cannot reveal the difference, so a future
      audit of this must look at the Google console, not at `dig`.
- [x] **DMARC** — TXT `_dmarc` =
      `v=DMARC1; p=none; rua=mailto:admin@quademia.com`, live and
      confirmed by lookup. Monitoring mode only (reports, no blocking).
      Providers send one aggregate XML report/day each; the interval is
      effectively fixed (big providers ignore `ri=`) — filter to a label
      and ignore until needed. Tighten policy only after both senders
      have been passing for a while; there is no deadline on that and no
      benefit to rushing it.

ⓘ **Resend's DKIM is 1024-bit and that is not a defect.** The
`resend._domainkey` key header (`MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC…`)
is 1024-bit — Resend's own default, not a setting anyone chose. The two
senders therefore carry visibly different key lengths. Don't "fix" it.

**Post-rename dashboard email sweep — DONE 2026-08-05 (same day).**
The accounts never needed "taking over" — the same person and the same
mailbox persisted through the rename (the old address survives as an
alias, so resets/verifications kept landing throughout). The verified
login inventory + what was changed:

- **Cloudflare (workspace)** — was Google-SSO; a password was set during
  the pre-purchase 2FA setup, which insulated the rename. Account email
  changed to `admin@quademia.com` ✓. Consequence, accepted: the Google
  identity (sam@) no longer matches the account email (admin@), so
  **email + password + 2FA is the door now**, not the Google button.
- **Workspace GitHub** (the prod-Supabase key) — logs in with its own
  password, so the Google rename never touched it. `admin@quademia.com`
  added, verified, **set primary** ✓. Note: this account holds no repos
  and doesn't need to — it exists purely as the Supabase login key.
  Keep it; converting Supabase to email-login is churn with no payoff.
- **Prod Supabase** — login unchanged ("Sign in with GitHub", inherits
  the fix above). Account email checked in preferences ✓.
- **Untouched by design:** the mybackpacc-byte GitHub user and the
  QAcademy-Nurses org (repo host) — personal-side, outside the Workspace,
  nothing to move. Paystack + Resend get their email swept when their
  build slices arrive.

**qacademynurses.com transition:**
- Stays in the same Workspace as a legacy receiver — old addresses
  (support@, admin@) keep landing in the same inbox indefinitely. Gamma
  products keep their noreply@qacademynurses.com Resend sender untouched
  until their own migration; gamma will move to quademia senders
  eventually (Sam, 2026-08-05), on gamma's schedule, not forced by this
  move.
- **Bring qacademynurses.com over from IONOS (settled 2026-08-05 — NO
  RUSH, deliberately last).** The domain is currently registered at
  IONOS — exactly the "old registrar, old card on file" failure mode the
  never-expire rule below fears. Plan: move it to the workspace
  Cloudflare account so all three company domains share one 2FA'd,
  auto-renewing home under admin@quademia.com. Two steps, in order:
  1. **Move the DNS zone** to the workspace Cloudflare account (add
     zone, let Cloudflare import records, verify the copy, flip
     nameservers at IONOS). Must-not-break list, in priority order:
     ① **Google MX** — legacy *receiving*; the old addresses are still
     recovery contacts for unswept vendors (Paystack, Resend, and
     anything forgotten) — non-negotiable, test with a real email.
     ② Resend's DKIM records — gamma still sends as
     noreply@qacademynurses.com. ③ The gamma sites' CNAMEs (Pages
     lives in gamma's CF account; cross-account CNAMEs keep working).
     Ground rule from Sam: gamma disruption is acceptable (free,
     inactive accounts) — mail delivery is not.
  2. **Registrar transfer** IONOS → Cloudflare, a few stable days
     later (unlock + EPP code at IONOS; up to ~7 days; charges one
     year's at-cost renewal; blocked if IONOS renewed it within the
     last 60 days). IONOS account can then be emptied and closed.
  **Why no rush (Sam's sequencing call):** everything gets repointed to
  quademia.com *first* — once that migration is done, the old domain is
  a pure legacy shell (receiving-only), so the transfer becomes a
  near-zero-stakes formality rather than a live-infrastructure move.
- ⚠ **NEVER let qacademynurses.com expire — even years after last use.**
  Its addresses are registered as logins/contacts in places that will be
  forgotten (Supabase, Paystack, Cloudflare, Resend, student records). A
  lapsed domain can be re-registered by a stranger who then receives
  password-reset mail for those accounts. Renew forever (~$12/yr); it may
  downgrade to a pure forwarding shell once migration completes, but it
  renews.

**Day-one sequence when the domain lands:** DNS into Cloudflare → add
domain to Workspace + rename + aliases → verify domain in Resend → wire
Supabase SMTP (build-order item 1). ~One afternoon, mostly DNS waits.
Repo touch is minimal: the two hardcoded support@qacademynurses.com
references (rename debt above) and the Resend/SMTP work already scoped.

---

## Build order (domain bought 2026-08-05 — this list is live)

1. **Verify quademia.com in Resend + custom SMTP on both MyNclex Supabase
   projects, branded auth templates** — nothing email-dependent is safe
   before this.
   **STATUS 2026-08-06 (later) — ✅ ITEM COMPLETE.** Plumbing landed
   earlier the same day; templates, the copy folder, DKIM and DMARC
   closed in the session after it.
   - ✅ **Resend account created — a NEW one, registered under
     `admin@quademia.com`** (the infra rule holds from day one). Settled
     over reusing gamma's account (mybackpacc@gmail.com): Resend's free
     plan allows **one verified domain per account** (checked live
     2026-08-06), and gamma's slot is taken by qacademynurses.com — so
     sharing forces the $20/mo Pro plan for no gain, and the free 100
     emails/day pot would be shared between gamma's ~629 users and
     MyNclex. Convergence still comes for free later: when gamma migrates
     to quademia senders, it sends through THIS account and the old one
     retires. ⚠ **Paid-plan trigger accepted by Sam:** the Pro upgrade
     (~$20/mo, 50k/month, no daily cap) happens **before real signup
     volume** — gamma once had >100 signups in a day and emails silently
     stopped; that is the known failure the free tier re-creates.
   - ✅ **quademia.com verified in Resend** (region eu-west-1), via
     Resend's Domain Connect auto-configure → one-time Cloudflare
     authorization. Three records, all DNS-only, none touching the root
     (see the coexistence note above).
   - ✅ **Custom SMTP live on BOTH projects** (dev first, then prod), as
     **Quademia `<noreply@quademia.com>`**, `smtp.resend.com:465`,
     per-environment sending-only API keys (`mynclex-dev-smtp` /
     `mynclex-prod-smtp` — dev revocable without touching prod).
   - ✅ **Delivery proven on both**: dashboard invite to an outside Gmail
     address — arrived in the **inbox** (not spam), branded sender, on
     dev and on prod. Test users deleted after.
   - ✅ **Auth-email rate limit bumped to 100/hr** (both projects,
     Authentication → Rate Limits; matches Resend's free 100/day ceiling;
     both rise together at the Pro upgrade). Instructed 2026-08-06, and
     **confirmed done by Sam 2026-08-06 (later)** — recorded on his word,
     not tool-verified: the MCP connection cannot read a project's auth
     config, so this setting is unreadable from here by design.
   - ✅ **Branded auth templates — TWO, not four** (written, pasted to
     dev and prod, reset verified end-to-end 2026-08-06 later). Copy
     lives in [`../email/auth-templates.md`](../email/auth-templates.md).
     Branded: **reset-password** · **confirm-signup**. Text-branded,
     "— The Quademia team", no logo until one exists; sender is
     **Quademia**, but the body names **MyNclex** in the first sentence,
     because a nurse who signed up for NCLEX prep has never heard of
     Quademia and an unrecognised sender reads as phishing.
     ⭐ **The four became two on Sam's reasoning, and it is the better
     split.** The plan had invite branded "neutrally" because tutor-add
     and pay-first share one template. Sam's objection: *an invite is
     never just an invite* — it always arrives attached to a programme
     or to bank access, so a generic "create your account" email is a
     link with no answer to "for what?". The neutral wording was
     therefore not a solution to the shared-template problem, it was the
     problem, restated. Invite goes **custom** in the transactional arc;
     branding the generic body would have been work we then delete.
     Cheaper than it sounds to leave: since the SMTP switch it already
     sends **from** Quademia, so it reads unstyled, not untrustworthy.
     **Also skipped:** magic link (slice 3 rewrites it code-only),
     reauthentication (nothing uses it), and **change-email** (nothing
     in the codebase calls `updateUser({ email })` — brand it the day a
     change-email surface exists).
     ⚠ **Link expiry is default-backed, not verified.** Both templates
     say 1 hour = Supabase's documented default, unchanged on either
     project. The dashboard setting was not locatable on the day and
     cannot be read over MCP. See the warning in `auth-templates.md`.
   - ✅ **New docs folder for ALL product email copy** — created as
     [`docs/email/`](../email/README.md) (a sibling of `product-plan/`,
     not inside it: this is an asset, not a plan). Carries the standing
     rule **repo is the source, dashboard is a copy** — because a
     template that only exists in two dashboards is copy nobody can
     review, diff, or recover. The app's own transactional copy joins it
     when that arc is built.
2. **Forgot-password flow** (depends on 1) — carries Turnstile on the three
   public forms, the `nclex_auth_events` write-side, AND the layer-2
   per-email threshold checks (gamma's rules, server-side) with it.
   **STATUS 2026-08-08 — ITEM 2 IS COMPLETE AND ON PROD.** 2a, 2b, 2c and
   2d all built, Sam-tested on dev, released (`cf0cb8e` + `fccc9db`), and
   exercised on prod with the captcha switch on and the redirect allowlist
   set. Prod tracker 153.
   - ✅ **2a — the logbook.** `nclex_auth_events` + the write side
     (migration `20260904120000_auth_events.sql`, `lib/auth/events.ts`,
     `lib/auth/device-label.ts`). Shipped BEFORE the flow it serves
     because logs cannot be captured retroactively — the table has to
     exist before the support case does. Append-only is **enforced, not
     remembered**: one SELECT policy for `USERS_MANAGE` and no
     insert/update/delete policy for anybody, so the database refuses
     rather than trusting call sites. Writes go through the service-role
     client, which is required anyway — a failed login has no session,
     so `auth.uid()` is NULL and no policy could ever admit the row.
     90-day retention sweep on pg_cron, window in `nclex_config`.
     Every future event type (`CODE_*` for slice 3,
     `GOOGLE_FIRST_SIGNIN` for slice 5) is already in the CHECK
     constraint, so those slices need no migration. `INVITE_ACCEPTED`
     is written from `/welcome` today, tagged `tutor_add` / `pay_first`.
   - ✅ **2b — the flow.** `/forgot-password`, `/reset-password`, the
     login-form link, and `lib/auth/account-lookup.ts`. Verified end to
     end on dev: request → email → link → new password → signed in, with
     the `RESET_REQUESTED` / `RESET_COMPLETED` pair 56 s apart in the
     log.
     ⚠ **The `?code=` vs `#access_token=` trap cost three attempts** and
     is now written up in `CLAUDE.md` → Known Workarounds. Short version:
     `@supabase/ssr` forces `flowType:'pkce'`, so the browser client
     auto-consumes PKCE links (never exchange those yourself — the code
     is single-use) and **refuses** implicit ones outright (there you
     must call `setSession` yourself). ~~Slice 3's email-code login will
     meet the same thing.~~ ⚠ **IT DOES NOT — corrected 2026-08-09 when
     slice 3d was built.** The trap is about a LINK arriving in the browser
     carrying a token, which is the one thing a code flow does not have.
     `verifyOtp` hands the session to a Server Action and `@supabase/ssr`
     writes the session cookies through `setAll`; nothing is parsed out of
     an address bar, so there is nothing to race and nothing to configure.
     The warning stood for four days and shaped the slice-3 plan — kept
     struck through rather than deleted, so anyone who remembers it finds
     the answer instead of the fear. **It still applies to `/welcome` and
     `/reset-password`**, which really do receive links.
   - ✅ **2c — the thresholds** (2026-08-06 evening). `lib/auth/thresholds.ts`
     plus the gate at the top of both server actions. **No migration** —
     2a had already built the index and the `*_BLOCKED` event types this
     needs. Login **5 in 10 min + 10 in 24 h**, reset **3 in 60 min**, per
     email address. Verified on dev by driving both forms, with the event
     timeline read back from the table each time.
     - **Reset has no long rule, deliberately.** Guessing passwords is
       only useful if you can keep guessing, so the patient attacker is a
       real threat and the 24-hour login rule exists for him. Requesting
       reset links gains an attacker nothing however long he waits — the
       link goes to the student's inbox. The 60-minute rule stops inbox
       flooding, and flooding spread over a day is not flooding.
     - ⭐ **It fails OPEN**, exactly as the support-logbook section above
       promises. A broken count query lets the caller through; closed
       would convert a database blip into "nobody can sign in".
     - ⭐ **The countdown reads the Nth-newest failure, not `MIN()`.**
       Gamma computes from the oldest attempt in the window, which is
       correct only when the count sits exactly on the threshold; past it
       gamma quotes a time that expires while the student is still
       blocked. A countdown that lies is worse than no countdown, and the
       countdown is why this is a rule rather than a flat refusal.
     - ⭐ **A 24-hour block offers the reset link; a 10-minute one does
       not** (Sam, walking the timeline). On the tenth failure both rules
       trip and the longer one wins, so the block is ~23½ h anchored to
       her FIRST failure. "Come back tomorrow" does not state the wrong
       duration — it answers the wrong question, because someone who has
       failed that often has genuinely forgotten the password. Reset is a
       separate counter and works immediately. At 10 minutes waiting
       really is the right advice, and pushing a reset at someone one
       typo away creates work she didn't need.
     - ⓘ **Known and accepted, both also true of gamma:** a successful
       login does not clear the failure counter, and the 24-hour rule can
       catch a genuinely forgetful student — who is never stranded, since
       reset stays open, which is the reason the offer above exists.
   - ✅ **2d — Turnstile** (2026-08-08). Four commits, one migration
     (`20260905120000_register_rejected.sql`), dev-applied. Widget on all
     three public forms in **Managed** mode; `lib/auth/turnstile.ts` +
     `components/auth/turnstile-widget.tsx`. vitest **939 → 948**.
     It closes the door 2c cannot see: reading gamma's SQL closely
     (2026-08-06) showed its device axis has **no email filter**, so it is
     not the email axis applied twice — it catches ONE machine failing
     against MANY addresses, which per-email counting is blind to.

     - ⭐⭐ **THE PLAN ASKED FOR TWO CHECKS AND TWO IS NOT BUILDABLE.**
       This section used to read "verified server-side inside the server
       action … (use the native Supabase↔Turnstile integration so the
       direct endpoint also demands a token)". That is both, and a
       Turnstile token **can be validated exactly once** — Cloudflare's
       own words, with `timeout-or-duplicate` returned for a replay. The
       first cut spent the token in our own actions, which worked, and
       made the Supabase switch impossible to turn on: Supabase would
       have been handed a spent token and refused every sign-in, signup
       and reset on the site. One token, one check; the only real
       question is **who gets it**.
     - ⭐ **SUPABASE GETS IT**, because it is the only one of the two
       standing at BOTH doors. Our anon key is public by design — it
       ships in every page — so anyone can call Supabase's auth endpoint
       directly and never touch a server action of ours. Our forms hand
       the token through untouched in `options.captchaToken`. What stays
       on our side is deliberately cheap and **non-consuming**: is
       Turnstile on, did a token arrive. A missing token is refused and
       logged before the database is touched, which is exactly the
       traffic this layer is for — a script spraying addresses sends no
       token at all.
     - ⭐ **PROVEN, NOT ASSUMED.** With the dev switch on, a direct POST
       to `/auth/v1/token?grant_type=password` carrying only the public
       anon key returns
       `{"error_code":"captcha_failed","msg":"captcha protection: request
       disallowed (no captcha_token found)"}`. Before this slice that
       same call tried the password and, repeated, walked past Turnstile
       **and** every 2c threshold.
     - ⭐ **A CAPTCHA REFUSAL IS NOT A FAILED PASSWORD.** Supabase reports
       it as an ordinary auth error, so left alone it would log
       `LOGIN_FAIL` and feed 2c's counter — five of them and a student is
       locked out of an account she typed correctly every time.
       `isCaptchaRejection()` routes them to `LOGIN_BLOCKED` /
       `RESET_BLOCKED` / `REGISTER_REJECTED`, which are excluded from the
       counts by construction. ⚠ Matched on message text, since there is
       no stable code; deliberately broad, because over-matching costs a
       row filed under the wrong type and under-matching costs a student
       her account.
     - ⭐ **A PASS IS SINGLE-USE, AND THAT IS THE WHOLE DIFFICULTY OF THE
       SLICE.** A student who mistypes her password has spent hers before
       the screen tells her, so her *correct* retry would be refused with
       a message about her browser. Every form calls `resetTurnstile()`
       on every failed submit. Verified in the log, twice, as
       `LOGIN_FAIL` → `LOGIN_OK` seconds apart with no block between —
       once with us verifying and once with Supabase verifying.
     - ⭐ **AND THE FORM NOW WAITS FOR THE PASS.** Found by Sam testing on
       dev, in the logbook rather than on screen: a `RESET_BLOCKED /
       turnstile:missing_token` followed by success twelve seconds later.
       The form renders instantly, the pass takes a moment, and a submit
       in that gap carries none — the app blaming her for being quick.
       ⚠ **The window is WIDER for this product's students, not
       narrower**: a slow mobile connection means a slower widget, and
       `/forgot-password` has one field so the button is reached soonest.
       The submit button is now held until a pass exists. Three separate
       guards stop that becoming a dead form (no site key → ready at
       once; `error-callback`/`timeout-callback` **unlock** rather than
       lock, since an errored widget will never produce a pass; a
       10-second backstop for a widget that never speaks). Nothing in
       tsc, eslint or 948 tests could have found this.
     - ⚠ **`localhost` IS NOT ALLOWED AUTOMATICALLY** on a Turnstile
       widget, contrary to what was assumed on the day. The widget throws
       **error 110200 (domain not authorised)**, emits no token, and
       every sign-in is then refused. Add `localhost` — hostname only, no
       port, no scheme — to the widget's Hostname Management.
     - ⓘ **Managed mode, not Invisible, and Invisible is not available to
       us anyway.** Invisible has nowhere to put a challenge, so a
       visitor Cloudflare is unsure about is simply refused with nothing
       to click — and this audience is disproportionately that visitor,
       for the same carrier-NAT reason that forbids a per-IP rule.
       Separately, Cloudflare requires that invisible mode be paired with
       a reference to its Privacy Addendum **in our own privacy policy**,
       and MyNclex has no privacy-policy route at all. ⏭ Revisit at
       launch, when that page has to exist regardless.
       ⭐ **UPDATE 2026-08-09 (later) — that page is now on the critical
       path, and not for this.** Google's brand verification wants the
       same missing document, which makes **two** items blocked on one
       page that neither listed as a dependency. Decision on where the
       legal pages live, and the rule for writing them: → *Legal pages*,
       below the build order.
       ⭐ **UPDATE 2026-08-10 — the ROUTE exists; the DOCUMENT does not.**
       `https://quademia.com/privacy` is live (own repo, own domain — see
       *Legal pages*), so neither this nor Google's verification is
       waiting on an address any more. Both now wait only on the prose —
       which in turn waits on **company registration**, because a privacy
       policy has to name a data controller. ⚠ "MyNclex has no
       privacy-policy route at all" above is no longer the blocker, but
       do not read the live URL as the item being unblocked: a page
       reading *Coming soon* cannot carry Cloudflare's Privacy Addendum
       reference.
     - ⓘ Refusal copy is one shared sentence — *"We could not verify your
       browser. Please refresh the page and try again."* Deliberately
       silent about which of the reasons applied, since they all have the
       same fix. **Not Sam-copy-passed.**
     - ✅ **PROD IS LIVE** (2026-08-08, releases `cf0cb8e` then `fccc9db`).
       Switch flipped, redirect allowlist set, `TURNSTILE_SECRET_KEY` a
       Worker secret in both environments (dashboard, not CLI). The same
       back-door probe that returned `invalid_credentials` before the flip
       now returns `captcha_failed`. Prod's logbook holds its first rows —
       `LOGIN_OK`, `LOGIN_FAIL (wrong_password)`, `LOGIN_OK` 24 s later:
       the typo retry succeeding on prod with Supabase verifying.
     - ⚠⚠ **THE RELEASE EXPOSED A BUG OLDER THAN THIS SLICE, AND IT IS THE
       MOST IMPORTANT THING ON THIS PAGE.** The widget did not appear on
       either Worker. Cause: `wrangler.jsonc` `vars` are **runtime**
       bindings, but `NEXT_PUBLIC_*` is a **build-time** substitution, and
       neither deploy workflow passed any environment to its build step —
       so the server rendered the widget's container and hydration removed
       it. **The same starvation hit `createBrowserClient`**, meaning
       `/reset-password` and **`/welcome` (invite acceptance) had never
       worked on the dev or prod Workers at all.** Both had only ever been
       tested on localhost, where `.env.local` is present at build time.
       Fixed in `ac822dc`; the three-places rule for any future
       `NEXT_PUBLIC_` variable is now in `CLAUDE.md` → Known Workarounds.
       ⭐ It surfaced only because Sam said the widget was missing on a
       release already reported green — **a green deploy is not evidence
       of a working page**, the companion to 2026-08-06's *a green merge
       is not evidence of a green deploy*.

     **↳ 2d's tail: DEV RUNS ON CLOUDFLARE'S TESTING PAIR** (settled
     2026-08-09, commit `0d38cf3`). Slice 2d worked, and the first thing it
     did was lock Claude out of the three surfaces it protects.

     - ⚠⚠ **THE WARNING THAT MATTERS MOST ON THIS PAGE: THE DAY DEV GOES
       BACK TO THE REAL KEYS, CLAUDE LOSES `/login`, `/register` AND
       `/forgot-password` AGAIN, AND THE BROWSER PANE HANGS ON THEM.** Not
       degrades — crashes. This is not a bug to be fixed, worked around, or
       retried: Turnstile's entire purpose is to detect an automated
       browser, Claude's browser is an automated browser, so Cloudflare
       escalates to its heaviest challenge on exactly that client and the
       pane stops responding. **The product succeeding *is* the failure.**
       If those three pages ever start hanging again, check the dev keys
       before looking anywhere else — that is the cause, every time.
     - **What dev uses now:** sitekey `1x00000000000000000000AA` (visible,
       always passes, no challenge) + secret
       `1x0000000000000000000000000000000AA` (always passes validation).
       Both are published by Cloudflare for this exact purpose. The real
       dev widget is `0x4AAAAAAEKb3Z55nyB9Sipe` (personal CF account) —
       kept in the comments at every site, since it is what we swap back to.
     - **Nothing about the code changed, and that is the point.** The
       widget still renders, visible and full size; a pass is still issued,
       still forwarded, still validated by Supabase, and the answer is
       still read back. Every step of the machinery runs. Only the
       *judgement* is stubbed to yes. Which means the chain that broke
       repeatedly on 08-06 and 08-08 stays exercised on dev instead of
       being discovered on prod.
     - ⚠ **IT IS A FOUR-WAY MATCH AND ALL FOUR MOVE TOGETHER:**
       `wrangler.jsonc` `vars` · the build step's `env:` in
       `deploy-dev.yml` · the **secret on the dev Supabase project's
       captcha setting** · and `.env.local` for local dev (**both** keys —
       `lib/auth/turnstile.ts` treats Turnstile as off unless it sees the
       secret *and* the site key). A testing pass checked against the real
       secret is refused, and so is the reverse. **A mismatch is an outage
       at the front door, not a degraded mode.**
     - ⚠ **`.env.local` HAD NO TURNSTILE KEYS AT ALL, AND THAT IS WHY WE
       LOOKED.** Dev's Supabase captcha was on, localhost rendered no
       widget, so **every login, signup and reset on `localhost:3000` was
       refused** — for Sam as much as for Claude, silently, since 08-08.
       Cause: `.worktreeinclude` copies `.env*` **parent → child only**.
       The keys were written into the 08-08 worktree's copy, that worktree
       was pruned, and nothing carries a change back up. The permanent copy
       in the main checkout has them now, so every future session inherits
       them.
     - ⭐ **PROD WAS PROVEN, NOT ASSUMED — AND THE 08-08 CHECK HAD NOT
       PROVEN IT.** That probe sent **no** token and got `captcha_failed`,
       which shows prod *demands* a pass; a door that asks for ID and never
       reads it answers that probe identically. Probed again on 08-09 with
       a deliberately **garbage** token, prod answered `captcha_failed —
       invalid-input-response`: Cloudflare looked at it and refused. Prod
       validates. **Dev, by contrast, accepts any string as a pass** — that
       is what an always-passes secret means, and it is the expected state,
       not a defect.
     - ⓘ **Dev's front door is now decorative**, and the cost is bounded:
       slice **2c's per-email thresholds are still fully live on dev**
       (our own code, nothing to do with Cloudflare), and dev holds no real
       users. Prod is untouched — separate Cloudflare account, separate
       widget, separate Supabase project.
     - ⏭ **NEWLY POSSIBLE, AND STILL NOT DONE: force a real refusal.** Swap
       dev to the *always-fails* pair (`2x00000000000000000000AB` +
       `2x0000000000000000000000000000000AA`) and a genuine captcha
       rejection happens on demand. That is the only practical way to test
       `isCaptchaRejection` routing a refusal to `LOGIN_BLOCKED` instead of
       `LOGIN_FAIL` — the guard that stops a student being locked out of an
       account she typed correctly every time. **It has never been tested**,
       because real Turnstile cannot be made to fail to order.
       https://developers.cloudflare.com/turnstile/troubleshooting/testing/

     **↳ 2d also carries the `/register` gap** (found 2026-08-06 when Sam
     asked what happens on signup with an address that already exists —
     verified on dev, not assumed). Registering with a known address
     returns Supabase's **"User already registered"** verbatim from
     `app/register/actions.ts`. Functionally correct: no duplicate is
     created and no orphan auth user is left, because the flow errors
     before the profile insert. But it makes `/register` the one public
     auth surface that answers the question the other two refuse:

     | Form | Unknown address | Known address |
     |---|---|---|
     | Login | "Invalid login credentials" | "Invalid login credentials" |
     | Forgot password | "If an account exists…" | "If an account exists…" |
     | **Register** | proceeds | **"User already registered"** |

     ⭐ **THE MESSAGE STAYS — Sam's call, 2026-08-06.** A returning
     student who has forgotten she already signed up gets a clear,
     actionable answer instead of a dead end, and that is worth more here
     than closing an oracle an attacker can approximate anyway. Recorded
     so this reads as a decision rather than the oversight it currently
     looks like. ⚠ **But the decision has an expiry we do not control:**
     switching email confirmation ON (a launch gate above) makes Supabase
     stop returning that error and hand back a decoy user instead,
     emailing the real owner "someone tried to sign up with your
     address". So at launch the message disappears on its own. Keeping it
     past that point would mean looking the address up ourselves and
     re-creating the oracle deliberately — a different decision from this
     one, and one to take with eyes open.

     Two things that DO belong in 2d, both independent of the wording —
     **both ✅ BUILT 2026-08-08:**
     - ✅ **Turnstile on `/register`, not just login and forgot-password.**
       The oracle could previously be queried as fast as the network
       allowed: 2c's thresholds count `LOGIN_FAIL` and `RESET_REQUESTED`
       only, so **`/register` had no rate limit of any kind.** It is now
       the one surface where Turnstile is the *only* limit, which is why
       it mattered most here.
     - ✅ **A rejected signup is visible** — `REGISTER_REJECTED`,
       migration `20260905120000_register_rejected.sql`. ⚠ The only event
       type in this arc that was **not free**, unlike the `CODE_*` and
       `GOOGLE_FIRST_SIGNIN` types 2a pre-loaded into the constraint.
       ⭐ **It also reversed an earlier decision on purpose.** The old
       comment argued the profile/role rollback paths should not be
       logged, because the rollback deletes the auth user and `REGISTERED`
       was the only signup type available to describe the attempt with.
       The second half is what changed: `REGISTER_REJECTED` says exactly
       "this signup did not happen", which is the true statement about a
       rolled-back attempt — **and it is the support case that matters
       most**, a student who says she registered and cannot sign in. Until
       now that existed only as a console line on a Worker nobody will
       read. Five failure paths now write a row; the three validation
       bounces stay unlogged, matching the login action's empty-form
       bounce.
   - ⓘ **Prod is untouched.** Both migrations (`20260904120000`,
     `20260905120000`) reach prod through `migrate-prod.yml` on the next
     release; prod's redirect allowlist
     (`https://mynclex.qacademynurses.workers.dev/**`) must be set before
     the flow works there, and prod's captcha switch must be flipped
     **after** that release, never before.
3. **Email-code login** (depends on 1; reuses slice 2's Turnstile + logging
   + threshold plumbing) — code-only Magic Link template,
   `shouldCreateUser: false`, request-code + enter-code UI on the login
   page, `CODE_*` events logged.
   **STATUS 2026-08-09 — BUILT AND VERIFIED ON DEV, NOT YET RELEASED.**
   Six sub-slices, one migration (`20260906120000_code_blocked.sql`,
   dev-applied). vitest **948 → 952**, eslint clean, tsc at the known
   pre-existing errors.

   - ✅ **3a — `CODE_BLOCKED`.** ⚠ **The plan said this slice needed no
     migration and the plan was 75% right.** 2a pre-loaded the constraint
     with the types it could foresee — and what it foresaw were the three
     describing what the STUDENT did (asked, succeeded, got it wrong). It
     missed the one describing what WE do: refuse her before asking. A
     refusal cannot be written as a failure, because 2c's rules count
     failures, so the block would be counted by the rule that produced it
     and extend itself. One type, not two; `reason` separates
     `threshold_request_60min` / `threshold_verify_10min` / `turnstile:*`,
     exactly as `LOGIN_BLOCKED` already serves three meanings. Proven both
     ways on dev — the type inserts, and a made-up type is still refused
     with `23514`.
     ⏭ **Slice 5 had the same shape — and the sign-in-only decision of
     2026-08-09 (later still) dissolved it.** Turning away an unknown Google
     address is now a real, expected, frequent event, so the missing refusal
     partner finally has an obvious meaning instead of being a shape nobody
     could name. Three sightings cost two migrations; the fourth was fixed
     by a product decision, not by a schema one.
     ⓘ `GOOGLE_FIRST_SIGNIN` **survives with a shifted meaning** — no longer
     "an account was created via Google", which can no longer happen, but
     "an existing user linked Google for the first time". The type name is
     already in the CHECK constraint (`20260904120000_auth_events.sql`) and
     is worth keeping; the *definition* is what moved. Noted in
     `lib/auth/events.ts`.
   - ✅ **3b — the code-only template** (`docs/email/auth-templates.md`
     template 3). Pasted into the template Supabase calls *Magic Link*,
     which is not a mistake: links and codes are one implementation and the
     template is the only switch between them. **No link at all**, which
     is what takes magic link off the menu. Four choices in the markup are
     load-bearing, not decorative — the code sits high so a notification
     preview often saves opening the email; the words *"sign-in code is"*
     sit immediately before the digits because that adjacency is how iOS
     and Android detect a one-time code and offer autofill (pairing with
     the input attribute in 3e); the code is not inside a link, since some
     clients linkify anything tappable and a scanner may follow it; and it
     is monospaced and widely spaced for six digits on a small screen.
     ⚠⚠ **THE SLICE LOST ITS DASHBOARD CHANGE, ON EVIDENCE.** The plan
     was to shorten the OTP expiry to 10 minutes. **There is one expiry
     dial** (`Auth → Providers → Email → Email OTP Expiration`) **and it
     moves every email token at once**, including the password-reset link
     that template 1 promises lasts an hour. So the change would have made
     that email lie, and shortened it for exactly the person the reset flow
     exists for. It also buys almost nothing: *"a short expiry does more
     against guessing than any rule we write"* was true before this slice
     had a rule and false the moment it did — at 5 wrong codes per 10
     minutes an attacker gets ~30 guesses an hour against a million
     combinations. **Left at 1 hour**, reasoning recorded in the template
     doc so it is not relitigated.
   - ✅ **3c — requesting a code** (`app/login/code-actions.ts`,
     `lib/auth/code-session.ts`). Always succeeds, as
     `/forgot-password` does, so the form cannot be used to discover who
     has an account here. ⚠ **That silence is harder to hold here**, because
     `shouldCreateUser: false` makes Supabase answer an unknown address
     with a DISTINCT error (`422 otp_disabled`, *"Signups not allowed for
     otp"*) rather than a quiet nothing. Every error swallowed except the
     captcha one, which is safe because it keys off the pass, not the
     address. ⭐ **The pending-address cookie is part of that silence** —
     written on every path that gets past the gates, because a cookie set
     only for real accounts would answer through a side channel the exact
     question every other line refuses to answer.
     ⭐ **THE HALF-BUILT ACCOUNT IS REAL — measured, by making one.** The
     same call without `shouldCreateUser: false` produced a row in
     `auth.users`, already `confirmed_at` **and** `last_sign_in_at`, with
     zero rows in `nclex_users` and zero roles: a person who exists to
     Supabase and is invisible to the app. The 500 the caller sees arrives
     afterwards, from the email — so the error is not even the damaging
     part. Test user deleted. **The identical trap waits on slice 5's
     OAuth callback.**
   - ✅ **3d — verifying** (`verifyCodeAction`). ⭐ **The `?code=` trap does
     not apply** — see the struck-through warning above. ⭐ **No Turnstile
     on this step, checked not assumed**: `/auth/v1/verify` with no pass at
     all answers `otp_expired`, not `captcha_failed`, so a pass here would
     be friction with no counterpart. Rule: **5 wrong codes in 10 minutes**
     per address, counting `CODE_LOGIN_FAIL` only. ⚠ **Two doors, two
     counters, in both directions** — a mistyped code must never reach the
     password counter and vice versa, or a student struggling at one door
     silently loses the other. Held by construction and pinned by tests
     that were **mutation-checked**, not merely green.
   - ✅ **3e — the two-step UI** (`app/login/code-form.tsx`,
     `/login?mode=code`, reached from *"Email me a sign-in code instead"*).
     Mode in the URL so it survives a reload; **step decided by the server
     from the cookie**, which is the whole point — she asks for a code,
     switches to Gmail, and the phone discards the tab behind her. Proven:
     a full reload returns her to the code box with the address intact.
     Had it lived in React state she would land on an empty field, and
     asking again is what trips the 3-an-hour limit.
     **One field, not six boxes** — the six-box pattern looks premium and
     behaves badly exactly where these students are (paste lands in one box
     on many mobile browsers, screen readers announce six unlabelled
     fields, OS autofill often declines). A single input keeps
     `autocomplete="one-time-code"` working, which is the biggest usability
     win available. ⭐ **The widget is mounted on both steps and only
     *resend* waits for it** — resending is not verifying, it is step 1's
     request wearing step 2's clothes, so it needs the same pass; the code
     box never waits for Cloudflare.
     ⚠ Two bugs found only by driving it: a **nested `<form>`** for the
     restart control (HTML forbids it, browsers silently drop the inner
     one, so it would have done nothing), and **React 19 resets the field
     after every action** — which is wanted, but it made `required` block
     later submits before the action ran, and is invisible in the file.
   - ✅ **3f — verified on dev.** ⭐ **The end-to-end proof is Sam's own
     run**: `CODE_REQUESTED` 11:09:29 → `CODE_LOGIN_OK` 11:10:08, **39
     seconds**, `reason: null` on the request (so the send genuinely
     succeeded), `user_id` set and `nclex_users.last_login_utc` written.
     Also driven and confirmed against the table: an unknown address
     advances exactly as a real one does while the log holds
     `user_exists: false` · five wrong codes then `CODE_BLOCKED /
     threshold_verify_10min` ("try again in 7 minutes") · three requests
     then `CODE_BLOCKED / threshold_request_60min` ("46 minutes") · the
     cookie cleared server-side by *"Use a different email address"*,
     confirmed by reload · `httpOnly` real (invisible to `document.cookie`)
     · **375px clean** — no horizontal overflow, code field and widget both
     sized to the card. ⭐ **The two counters proved separate in the live
     system, not just in tests**: that address was verify-blocked and could
     still request codes.
     ⚠ **Unexercised, and named rather than covered by "done"**: the
     **resend** control (needs a 60 s wait plus a ready pass), **Turnstile
     meeting a real challenge** on this door (dev runs the testing pair, so
     the pass is always instant), and **`next`** threading through the code
     door. None are security controls.
   - ⓘ **Prod is untouched.** `20260906120000` reaches prod through
     `migrate-prod.yml` on the next release, and ⚠ **prod's Magic Link
     template must be replaced with template 3 before that release**, or
     the code door sends links there.
4. **Attach `nclex.quademia.com` to the app Worker** (routes block in
   wrangler.jsonc + Supabase redirect allowlist + site URL).
   **STATUS 2026-08-09 (later) — ✅ ITEM COMPLETE AND LIVE ON PROD.**
   Released as PR #51, prod `d86f6e2`. Both workflows green; the tracker
   went 153 → **154** rows.
   - ✅ **The domain is served by the prod Worker**, attached by the
     deploy itself: `custom_domain: true` on an `env.prod` route, so
     wrangler created the DNS record and provisioned the certificate.
     Nothing was added by hand. ⓘ **The deploy token turned out to carry
     Zone → DNS → Edit**, which was the one thing that could not be
     checked in advance — the fallback (attach in the dashboard, drop the
     block) was never needed.
   - ✅ **Verified on the live domain, not assumed**: `/`, `/login`,
     `/register`, `/forgot-password`, `/programmes`, `/readiness` all
     **200**; `/student` **307** to login. The **prod** Turnstile sitekey
     is present in the login browser bundle and the dev testing key
     appears **zero** times; `/reset-password`'s bundle carries the
     Supabase URL as a literal with nothing left unreplaced — so both
     08-08 traps are clear on the new host.
   - ⭐ **THE APP NEEDED NO CODE CHANGE, AND THE DOC HAD PREDICTED
     OTHERWISE.** Every absolute URL the app builds — the reset link, both
     invite links (`lib/enrolments/actions.ts`, `lib/payments/activate.ts`)
     and the Paystack return (`lib/payments/actions.ts`) — is read off the
     incoming request, so each followed the app to the new domain by
     itself. The warning in `app/forgot-password/actions.ts` that this
     item would leave the reset link "pointing nowhere useful in prod" was
     checked and **struck**, with the finding written in its place.
   - ⭐⭐ **`workers_dev` FLIPPED ITS OWN DEFAULT, AND THE PLAN LOST.** The
     agreed sequence was two releases: attach the domain with
     `mynclex.qacademynurses.workers.dev` still open, prove the new host
     against a working fallback, *then* close the old one. It did not
     happen. `workers_dev` defaults to true only while a Worker has **no
     routes** — declaring the custom domain flipped it to false, and both
     changes landed in the same deploy. The only trace was a line in the
     deploy log. ⚠ **The recommendation to take the "safe" two-step was
     mine and it was built on a wrong belief about that default.** It cost
     nothing (the certificate provisioned instantly, the domain answered
     first request) and `false` is the state we wanted — but the safety
     step was never actually taken. The value is now **stated explicitly**
     in `wrangler.jsonc` with the reasoning, because an implicit default
     that silently overrides a plan is the 08-08 shape: config that does
     not say what is true.
   - ✅ **The rename debt this move always carried is paid**:
     `support@qacademynurses.com` → `support@quademia.com` in
     `app/no-access/page.tsx` and
     `app/(public)/checkout/callback/page.tsx`. Confirmed in the compiled
     bundle; the string `qacademynurses` no longer appears anywhere in app
     code. The old address still receives, so a receipt already in
     somebody's inbox does not go dead.
   - ⓘ **Sam did both dashboard halves before the release** — prod's
     Supabase redirect allowlist + Site URL, and the prod Turnstile
     widget's hostname list. Neither lives in the repo and both refuse the
     new domain **silently** if missing, so they are the first thing to
     check if the front door ever misbehaves on a new host.
   - ⚠ **This release also carried slice 3** (email-code login) and its
     migration, which had been sitting on `main`. Prod's Magic Link
     template was replaced with template 3 by Sam beforehand, which was
     the stated blocker. ⬜ **The code door has still never been driven on
     prod** — only on dev. Prod being empty by design keeps the blast
     radius near zero, but it is not verified there.
5. **Google sign-in** — ✅ **DONE AND LIVE ON PROD, 2026-08-09 (later
   still)** (`aa0391f` 5a+5b, `2f370f0` 5c+5d, `42f3f7e` docs; released as
   PR #52, tracker 154 → **155**). Refusal, registration, linking and
   sign-in each driven by Sam against a real Google account on **both**
   dev and prod. Branding deliberately deferred — see *Releasing this*
   below. Gated on the consent screen showing
   Quademia, not a Supabase project ID (the gamma-era "sign in to
   <ref>.supabase.co" screen must never exist here). Settled 2026-08-05:
   **try the free fix first** — Google Cloud Console Branding +
   Verification (shows logo + name instead of the project ID; brand
   verification takes a few business days; test on the DEV project's
   OAuth credentials and look at the actual screen before shipping).
   The Supabase custom-domain add-on (paid) is the **escalation only if
   branding alone still leaks the supabase.co URL** — judged too
   expensive as a default for a cosmetic fix.

   > ### ⚠⚠ REVERSED 2026-08-18 (Sam) — branding is NOT the cheap path
   >
   > The decision above survives as the record of what was believed; it is no
   > longer the plan. **"Free" was only ever free in money.**
   >
   > Branding + Verification is blocked on, in order: a **published privacy
   > policy** (nobody has written it), **terms**, an **official Quademia logo**
   > (does not exist), **Google brand verification** (days of latency, a third
   > party's decision, can be refused), and a company name that is **not
   > incorporated** (see `lib/email/templates/footer.ts`). ⭐ **Every one of
   > those dependencies sits outside our control.**
   >
   > ⚠ **And the outcome was never proven.** We would spend the logo, the legal
   > pages and the verification wait and might still see `<ref>.supabase.co` —
   > which is exactly why the paid add-on was kept as an escalation. Expensive
   > in dependencies AND uncertain in result is the worst pair available.
   >
   > ⭐⭐ **What settled it: `qacademy-beta-b`.** Sam pointed at the schools
   > project, which shows a clean consent screen with **no logo, no
   > verification, no privacy policy and no registered company**. Checked
   > directly (2026-08-18): it is **NextAuth v5 + `@auth/d1-adapter`, no
   > Supabase anywhere**, and its OAuth callback lives at
   > `src/app/api/auth/[...nextauth]/route.ts` — **on its own domain**. Its
   > clean screen was never a branding achievement; it never needed Google's
   > permission to look right, because Google was only ever reporting the host
   > it redirects to.
   >
   > ### The plan now — own the redirect
   >
   > Register our own Google OAuth client against
   > `https://nclex.quademia.com/auth/google/callback`, so the consent screen
   > names **our domain**. Our route exchanges the code with Google
   > server-side and hands the resulting ID token to Supabase via
   > **`signInWithIdToken({ provider: 'google', token })`** — verified present
   > in the installed `@supabase/supabase-js` 2.105.3, `google` among its
   > supported providers.
   >
   > ⭐ **The stranger-refusal guard SURVIVES the swap.**
   > `hook_reject_google_signups` is a GoTrue **before-user-created** hook, and
   > migration `20260907120000` states it is *"consulted for EVERY user
   > creation… structural, not a condition we hand-wrote carefully and hope is
   > right."* The id-token path creates its user through GoTrue like every
   > other door, so the hook fires. ⚠ **Prove it anyway** — five minutes on dev
   > with one unknown Google address. It is the property that closed the
   > half-built-account trap and it is live on prod.
   >
   > **Measured cost**, not estimated: `app/login/google-actions.ts` (64 lines)
   > rewritten to build Google's authorize URL ourselves — state, nonce, PKCE,
   > which is the genuinely fiddly part; **one new callback route**; and
   > `app/auth/callback/route.ts` (124 lines) adapted, since it already knows
   > how to write `GOOGLE_BLOCKED` / `GOOGLE_LOGIN_OK`. ⓘ **Unchanged:** the
   > hook migration, `lib/auth/events.ts`, and `google-button.tsx`. One slice.
   >
   > ⓘ **The paid add-on drops to third**, not second: ~$120/year forever
   > against one session once, and it leaves the Supabase dependency in place
   > rather than removing it. ⓘ Owning the flow is also the right shape if
   > cross-product SSO (item ⑦) ever happens — beta-b being NextAuth already
   > makes that seam real.
   >
   > **Branding becomes optional polish**, worth doing when the logo and legal
   > pages exist for their own reasons — not a blocker on anything.
   >
   > ⓘ **For the record, Claude argued branding-first and was wrong twice:**
   > it called the option "free" when it is only free in money, and it claimed
   > the swap risked reopening the half-built-account trap when the hook is
   > structural and unaffected. Both corrections came from Sam pushing back
   > rather than from the analysis.

   Slice also carries:
   **refusing addresses that have no account here** (Google is sign-in
   only — see the settlement below), and the account-linking check (same
   email = same account, no duplicate).
   **⚠ "BLOCKED ON A MISSING PAGE" — WRITTEN 2026-08-09 (later),
   OVERTAKEN THE SAME DAY.** ⭐ Struck as a blocker: the slice was built,
   released and published without the page. What the missing privacy policy
   actually holds up is **brand verification** (the branded screen), not
   publishing and not the feature. Left here because the reasoning below is
   still sound and the correction is the useful part — *the document gates
   the clock, never the code.*
   See *Legal pages* below. Google's consent-screen configuration wants a
   publicly reachable **privacy policy URL** (plus a homepage, usually
   terms) on the authorized domain, and **MyNclex has no privacy-policy
   route at all** — no `/privacy`, no `/terms`, no privacy link anywhere
   in the UI. So the *verification clock cannot start*, which matters
   because that clock is the only slow part of this item.
   - ⭐ **THE SLICE AND THE CLOCK ARE SEPARABLE, AND SAM'S CALL WAS TO
     TREAT THEM SO.** Google sign-in **works unverified** — it just shows
     the raw `<ref>.supabase.co` screen until verification clears. With
     prod empty by design that costs nothing, so the code can be built
     and shipped in any order relative to the submission. ⓘ What that
     reasoning does **not** buy is a running clock: building first does
     not start the N days. Legal pages first is therefore the sequencing,
     not because the code depends on them but because nothing else is on
     the critical path.
   - ⭐⭐ **SETTLED 2026-08-09 (later still) — GOOGLE IS A SIGN-IN METHOD,
     NOT A SIGN-UP METHOD.** Sam's framing, and it follows from what the
     product *is*: an account with no subscription and no enrolment can do
     nothing here, so manufacturing empty accounts serves nobody. The rule:
     **Google verifies who she is; we then verify she has an account with
     us.** Known address → in. Unknown address → turned away, with nothing
     written anywhere.
     - ⚠ **`signInWithOAuth` has no `shouldCreateUser`.** Verified against
       the installed `@supabase/auth-js` on 2026-08-09: that option exists
       only on the passwordless path. Its OAuth options are exactly
       `redirectTo`, `scopes`, `queryParams`, `skipBrowserRedirect`. So the
       switch that holds the line for email-code login **does not exist
       here** and the same rule must be enforced by other means.
     - ✅ **Existing users need no code — automatic linking is built in.**
       Supabase Auth looks for a user with the same email when a new OAuth
       identity arrives and links it to that user. So an email+password
       student clicking Google lands in *her own* account and no row is
       created. This makes the account-linking sub-slice **verification
       work, not construction**. ⚠ Precondition not yet tested: the docs
       warn that linking to an **unverified** email would be insecure, and
       our invited + never-confirmed users sit exactly there. **Test on dev
       before trusting it.**
     - ✅ **Unknown users are refused by the `before-user-created` hook.**
       Supabase runs it before the row is written; returning an error
       object denies the signup and *no user is created*. Implementable as
       a **Postgres function** — no new infrastructure, we already own the
       database. One of Supabase's own worked examples is rejecting a
       single OAuth provider's signups, which is nearly this case exactly.
     - ⭐ **This retracts the create-then-delete objection.** The argument
       against sign-in-only on 2026-08-09 (later) was that it would mean
       letting Supabase create an account and deleting it — manufacturing
       the half-built-account trap on every refusal, with permanent lockout
       if a delete ever failed. **That is not the mechanism available.** The
       hook refuses before creation, so there is nothing to delete and that
       failure mode does not exist. The objection was answered by the
       platform, not by accepting its cost.
     - ⚠⚠ **THE HOOK SITS IN FRONT OF EVERY DOOR — this is the sharpest
       edge in the slice.** `/register` and both invite paths
       (`lib/enrolments/actions.ts`, `lib/payments/activate.ts`) create
       users too. A hook that rejects carelessly kills registration **and**
       tutor enrolment **and** payment activation in one move. It must
       refuse **only** creations arriving via Google and wave everything
       else through.
     - ⚠ **Enabling a hook is project config, not just SQL** — so dev and
       prod each need it switched on by hand, in the dashboard. That is
       this repo's oldest failure shape (`NEXT_PUBLIC_*` in three places,
       Turnstile in four) arriving in a new costume. **Write both down.**
   - ⓘ **Slice shape, surveyed 2026-08-09 (later), revised (later still).**
     No OAuth exists today; the only `exchangeCodeForSession` in the repo
     is `/welcome`'s. Needs: a **migration** (the `before-user-created`
     Postgres function, plus the refusal event type — see the resolved
     refusal-partner note in slice 2a), an `/auth/callback` **route
     handler**, the refusal path, account-linking *verification*, the
     button, and logging. Slice-3 sized: five or six sub-slices.
     ⓘ **What left the slice:** first-time profile+role creation. Under
     sign-in-only there is no first-time creation to do — which removes
     what the 08-09 (later) session called the *delicate* sub-slice.
   - ✅ **What shipped, 2026-08-09 (later still).** `hook_reject_google_signups`
     (Postgres, `20260907120000`) · `GOOGLE_LOGIN_OK` + `GOOGLE_BLOCKED`
     replacing `GOOGLE_FIRST_SIGNIN` · `app/auth/callback/route.ts` (both
     endings, one handler) · `app/login/google-actions.ts` (Server Action,
     no browser client) · the button on `/login`, offered on both doors.
   - ⭐ **Names: `GOOGLE_LOGIN_OK` + `GOOGLE_BLOCKED`, and the pair is the
     point.** Sam's call was to retire `GOOGLE_FIRST_SIGNIN` rather than
     repurpose it — a name that goes on reading correctly while meaning
     something else is worse than a wrong one. The pair (rather than a lone
     `GOOGLE_SIGNIN`) declines the fourth invitation to ship a success type
     with no refusal partner; the previous two cost `20260905120000` and
     `20260906120000`. Refusing a stranger is the most common thing this
     feature does and should not be the one event the logbook cannot name.
   - ⚠ **AUTOMATIC LINKING RESTS ON EMAIL CONFIRMATION, AND THAT DIAL IS
     STILL OPEN.** Supabase links a new OAuth identity to an existing user
     only when it can trust the address; the docs call linking to an
     unverified email insecure. Both projects currently run
     `mailer_autoconfirm: true` (checked 2026-08-09), so every address
     counts as verified and dev faithfully predicts prod. **The day
     self-serve email confirmation is turned on** — already a named open
     decision under *Email confirmation policy* above — **that precondition
     changes and linking must be re-tested.** Nothing connects those two
     decisions but this paragraph.
   - ⚠ **The invited-but-unfinished student — OPEN, not handled.** Someone
     invited by a tutor or a payment who never completed `/welcome` has an
     auth user and no profile. Arriving by Google on that address, linking
     attaches to that half-finished account, nothing is created, the hook
     never fires, and she lands with a session and nothing behind it —
     `/router` sorts her to `/no-access`. Dev carries three such invites
     from June's payments testing, so this is live, not hypothetical. The
     callback logs it with `reason: 'no_profile'` so it is visible rather
     than looking like an ordinary sign-in. **Routing her to `/welcome`
     instead is a product decision Sam has not taken**, and was deliberately
     not smuggled into the slice.

   ### ✅ Released 2026-08-09 — and the order that made it safe

   ⚠ **The prod Supabase switches must come AFTER the migration lands,
   never before** — the rule that shaped this release and the one to reuse
   for any future auth hook. Before PR #52, prod had no
   `hook_reject_google_signups` and still carried the old
   `GOOGLE_FIRST_SIGNIN` constraint (both checked first). Enabling the hook
   there first would have pointed it at a function that does not exist, and
   that hook is consulted for **every** user creation — `/register`, tutor
   invites, pay-first activation. The precise set of flows this slice
   exists to protect.

   1. Google Console — safe any time, independent of the repo.
   2. Merge to `main`, then release `main` → `prod`. **The migration lands
      here**, bringing the function and the two event types.
   3. **Then** prod Supabase: Google provider · Redirect URLs
      (`https://nclex.quademia.com/**`) · the `before-user-created` toggle.

   ⚠ **The toggle is the one that fails silently** — the function ships with
   the migration, but a hook that is not switched on simply does not run,
   and prod starts creating exactly the orphan rows this was built to
   prevent. No error, no symptom, until someone's payment fails weeks
   later. **On the release checklist, never in memory.** ⓘ On 2026-08-09
   the proof it was on was Sam's `GOOGLE_BLOCKED` row — a disabled hook
   could not have produced one.

   ⭐ **THE HOLD WAS LIFTED BY SEPARATING COSMETICS FROM FUNCTION, not by
   overriding the reasoning.** This section previously said hold prod until
   the consent screen is published, because in Testing status the button
   refuses everyone who is not a listed test user. Sam's call was that the
   raw `dehspjcfmhoshcdtsmjq.supabase.co` screen is acceptable for now —
   what matters is proving the flow works on prod; branding comes after.
   The earlier framing had bundled the two together. ⓘ An environment
   variable gate to ship the button dark was proposed and **dropped** the
   same day: it was code written to avoid waiting, for a problem the plan
   had already answered.

   ✅ **THE PROD APP IS PUBLISHED** (confirmed 2026-08-09), so Google
   sign-in is live for **real students**, not only listed test users. The
   Testing-mode consequence this section spent a day reasoning about never
   applied to the released state. ⓘ The log had already implied it: the
   second account in Sam's `GOOGLE_BLOCKED` reached **our** hook, which a
   Testing-mode app would have stopped at Google.

   ⭐ **Which means publishing did NOT wait for the privacy policy.** The
   earlier reasoning — that publishing needs a public privacy-policy URL —
   did not hold in practice for an app requesting only `email` + `profile`.
   Those are **non-sensitive scopes**, which need no verification, and it is
   *verification* (the branded screen), not *publishing*, that the document
   actually gates. Two things that had been treated as one. ⚠ The privacy
   policy is still owed for its own reasons — Turnstile's invisible mode,
   brand verification, and the plain fact that this product takes payments
   and personal data across four jurisdictions.

   ⓘ **Not explicitly confirmed:** whether a *"Google hasn't verified this
   app"* interstitial appears en route. Not expected on non-sensitive
   scopes, and Sam reported no obstacle, but he was not asked directly.
   ⚠ Keep it separate from branding — the ugly URL is cosmetic, that screen
   would not be.

   ### One Google Cloud project, one consent screen — settled 2026-08-09

   ⭐ **The consent screen is per-PROJECT, not per-client.** Every OAuth
   client in a project shares the app name, logo, authorized domains,
   privacy/terms URLs, publishing status, verification state and test-user
   list. Only the client ID/secret and redirect URIs are per-client. So the
   end state is **one `Quademia` project owned by `admin@quademia.com`, with
   one client per product** — verify once, one privacy policy URL, one brand
   on the door. It is the same argument the *Legal pages* section makes
   about writing the policy as a company document.

   ⚠ **Do NOT rename gamma's existing Cloud project to serve this.** Sam
   proposed it (correctly noting a project can hold several clients); the
   objection is that gamma prod is the live login path for **~629 real
   users**, so editing its consent screen is a change to a production
   authentication surface — and if that app is verified, branding edits can
   send it back through review. Consolidate **forward**: new project now,
   gamma's clients move in when those products migrate to this stack. Three
   things to check first were listed and not yet answered — who owns
   gamma's project, whether it is verified/published, and whether its screen
   currently leaks a `supabase.co` ref.

   ⓘ **Accepted cost of one shared screen:** she sees *"Sign in to
   Quademia"*, not *"MyNclex"* — an unfamiliar word at the exact moment she
   decides whether to trust us with her Google account. Two things soften it
   and both are deliberate work, not hope: the **logo**, which is
   recognisable when the word is not, and **`quademia.com` resolving to
   something** (the apex is still dark — see the end of *Legal pages*).
   - ⭐ **The `?code=` trap does NOT apply to the callback.** That trap is
     about `createBrowserClient` consuming the code in the BROWSER before
     the caller can. A server-side route handler owns the exchange
     legitimately and is the documented Supabase SSR pattern. ⚠ Do not
     "fix" it to match `/welcome`, which is a different situation
     (implicit-flow fragment, handled client-side on purpose).
   - ⭐ **The half-built-account trap USED TO BE waiting on this callback.
     Sign-in-only disarms it.** It was never hypothetical: prod carried a
     real example until 2026-08-09 (an unconfirmed, never-signed-in
     `auth.users` row with no profile and no roles, left from 08-06 SMTP
     testing; deleted with Sam's approval, prod now has **zero**
     profile-less users). The trap needed a path that creates an auth user
     and then has to create a profile alongside it; refusing before
     creation removes the gap rather than guarding it.
     ⚠ Still true of the OTHER doors — `/register` guards it with
     `rollbackAuthUser`, and both invite paths create users. This item
     stops adding a new way in; it does not retire the shape.
6. Transactional email arc (registry already in transactional-email.md).
   **Carries the invite rewrite** — see item 1's template note and the
   Supabase-managed section of `transactional-email.md`.
7. Cross-product SSO — parked, revisit post-migration of sibling products.
   ⓘ **It now has an obvious home.** As of 2026-08-10 the parent site
   (`quademia.com`, its own repo — see *Legal pages*) runs the same stack
   as this app, which is precisely why it was built as an application
   rather than as static files. It carries no Supabase, no database and no
   login today; SSO is the one thing that would change that, and it would
   be a decision, not a slice.

ⓘ **Not numbered, because it is not this app:** the **parent site** was
built and released on 2026-08-10 — `quademia.com` + `www`, with
`/privacy` and `/terms` as placeholders. It is a separate repo with its
own branches and its own Workers. Nothing in the numbered list above
depends on it except that the legal-page *addresses* now exist. → *Legal
pages*, below.

---

## Legal pages (privacy policy + terms) — settled 2026-08-09 (later)

**One feature is blocked on a document nobody has written** — and it used to
be two.

⚠ **Corrected 2026-08-18.** This said *"two features"*, the second being
Google's OAuth consent screen, which wanted a public privacy-policy URL
before the brand verification that would make the screen say *Quademia*
instead of a raw `<ref>.supabase.co`. **That dependency is gone**: the
consent screen is being fixed by owning the redirect URI instead of by
asking Google to re-brand the Supabase one — see the reversal under
build-order item ⑤. ⭐ Which is itself an argument for the new approach:
the old one made a cosmetic fix wait on a legal document. And Turnstile's **invisible mode** was already parked on
the same thing — Cloudflare requires its Privacy Addendum be referenced in
ours (see the 2d notes above, which recorded it as a launch-time question and
did not connect it to anything else). One missing page, two stalled items,
and neither had it as a named dependency.

### ~~Where they live: **in this repo, at `nclex.quademia.com/privacy` and `/terms`** — for now~~

> ⚠⚠ **REVERSED BY SAM ON 2026-08-10, THE DAY AFTER IT WAS WRITTEN, AND THE
> REVERSAL IS BUILT AND LIVE.** The legal pages are **not** in this repo.
> They are at **`https://quademia.com/privacy`** and **`/terms`**, served by
> a **second repo**, `QAcademy-Nurses/quademia-parent-site`. The original
> reasoning is kept below, struck through, because it is wrong in an
> instructive way — see *Where they actually live*, which follows it.

~~Sam's question was whether to stand up a small site at `quademia.com`
instead. Checked, and the root domain **serves nothing** — no apex record, no
`www`, and the `.org` is dark. Only `nclex.quademia.com` resolves. So "a
small repo at the root" is a new repo, build, Worker/Pages project, DNS and
deploy pipeline, from zero.~~

~~Decided in this repo because:~~
- ~~**Google is satisfied either way** — the authorized domain is
  `quademia.com`, which covers its subdomains. Hosting location does not
  change the verification outcome, so this constraint does not decide it.~~
- ~~**It is the fastest route to a live URL**, and a live URL is the only
  thing standing between us and a running verification clock.~~
- ~~**Moving later is cheap** — a redirect, and one URL edited in the Google
  console.~~
- ~~**The root site is coming, but is not ready to be forced into existence.**
  It needs brand decisions that have not been made (the About page, the
  "Qualified + Academia" story). A legal page should not drag those forward
  half-finished.~~

### Where they actually live: **`quademia.com/privacy` and `/terms`, in their own repo** — settled and shipped 2026-08-10

Sam re-opened it the next morning with one sentence: *why do something now
and redo it later?* Three things came out of that, and each reversed a
claim above.

- ⭐⭐ **THE COST WAS MIS-PRICED, NOT MIS-JUDGED.** "A new repo, build,
  Worker/Pages project, DNS and deploy pipeline, from zero" costs a
  *website*. Sam had asked for **two pages**. The actual build — repo,
  three routes, pipeline, domain, live — took one session.
- ⭐ **"Moving later is cheap" WAS THE WEAKEST LINE ON THE PAGE.** A
  privacy-policy URL is *recorded by outsiders*: Google's OAuth consent
  configuration, Cloudflare's Turnstile privacy-addendum requirement, the
  payment provider, later an app store. Moving it means re-telling each,
  and a Google brand verification may have to re-run. Worse, the move
  would probably never happen — the root site needs brand decisions nobody
  has made, so "for now" quietly becomes forever, and then a **MyTeacher**
  user reads the *company's* privacy policy on a *nursing product's*
  subdomain.
- ⭐ **THE EXTRACTION RULE APPLIES IN REVERSE, AND THAT IS THE REAL
  ARGUMENT.** Legal pages inside this repo do not break `cp -r mynclex/`
  going *out*; they break it coming *back*. The **company's** documents
  would depend on **one product's** deployment staying alive. And the
  precedent is this project's own: `mynclex` was a folder in the gamma
  repo, went stale, and had to be cut out on 2026-05-19.

⓵ **A third option was designed and rejected.** Serving
`quademia.com/privacy` from *this* Worker via Cloudflare zone routes needs
**three** special cases — an asset carve-out (or the page arrives as
unstyled text, because `/_next/*` would be swallowed by the apex redirect),
a login-cookie scoping guard (a Supabase cookie set on the apex is sent to
every subdomain), and a middleware exclusion. All three exist only because
one app would be answering to two identities. When the clever option needs
three special cases and the plain one needs none, the clever option is only
cheaper this week.

**What now exists** (full detail lives in that repo's `CLAUDE.md` and
`README.md`, not here — this section is a pointer, not a second copy):

- `QAcademy-Nurses/quademia-parent-site`, private. Same stack as this app
  on purpose (Next 16 / React 19 / OpenNext on a Worker) so both migrate
  together rather than becoming two things to understand. **No Supabase, no
  database, no login, no secrets** — cross-product SSO (build order ⑦) is
  the one thing that would change that.
- `main` → dev Worker on the **personal** CF account. `prod` → live Worker
  on the **workspace** account, serving `quademia.com` + `www`.
  ⚠ The custom domain can only ever be on prod: the zone is on the
  workspace account and Cloudflare will not route a custom domain across
  accounts — the same rule that decided where the domain was bought.
- `/`, `/privacy`, `/terms` are live. **The legal pages are "Coming soon"
  placeholders** — the *address* was the urgent part, not the prose.

⚠ **`@opennextjs/cloudflare` had to be pinned exactly (`1.19.6`) there, and
now here too.** This repo's `^1.19.1` floats to 1.20.x, which requires
`next >= 16.2.11` against our 16.2.4 — `npm install` fails outright, and
only the lockfile was hiding it.

### ⭐ The rule that matters more than the hosting

> **Write it as a Quademia Ltd company document covering our products — NOT
> as "MyNclex's privacy policy".**

This project's recurring failure is *one truth in several places*:
`NEXT_PUBLIC_*` in three, Turnstile in four, money formatting in five. A
privacy policy is the ideal candidate to repeat it — four products arrive,
each takes a copy, and four documents must then be amended in step by hand.
Legal documents *do* get amended, and the copy that misses an amendment is
the one that causes harm.

Get the framing right and relocating to a root site later is a **move**. Get
it wrong and it is a **merge of four diverged documents**.

⚠ **This is not a task to hand to Claude alone.** The routes and a draft are
ordinary work, but what a privacy policy *claims* must be true of the actual
data handling — and this product takes payments and personal data from nurses
across several jurisdictions (Ghana, US, UK, Canada). A professional should
read it before it goes live. Recorded here so "Claude drafted it" is never
mistaken for "it was reviewed".

### ⚠⚠ The document is blocked on COMPANY REGISTRATION (found 2026-08-10)

A privacy policy has to name a **data controller** — the legal person
answerable for the data. **Quademia Ltd is not incorporated** (§2:
"Nothing is registered yet"), and "QAcademy Educational Consult" never was
either. So there is currently **no entity to name**.

⭐ This re-orders two lists that looked independent. The registration
checklist in §2 is **upstream of the legal text**, not parallel to it —
the Ghana ORC step in particular. Writing the policy first would mean
drafting it around a company that does not exist and then amending the one
document we least want to amend.

ⓘ Same constraint, smaller: the parent site carries **no "Quademia Ltd"
and no registration number on any page** for the same reason. That is
written into its `CLAUDE.md` as a standing rule, not left to memory.

### ~~Separately: the apex domain is dark~~ — ✅ FIXED 2026-08-10

~~Now the name is publicly discoverable (registration + certificate logs),
someone who hears "Quademia" and types `quademia.com` gets nothing. ⓘ **This
needs no repo** — a DNS record plus a Cloudflare redirect rule to
`nclex.quademia.com` fixes it with zero infrastructure. Low urgency, and a
separate decision from where the legal pages live.~~

The parent site closed this as a side effect, and better than the planned
redirect would have: `quademia.com` and `www.quademia.com` now serve a real
holding page naming the company and linking to MyNclex, rather than
bouncing a curious visitor into a nursing product. No redirect rule was
needed. ⓘ The `.org` is still dark and still purely defensive.

ⓘ **Two deployment behaviours worth knowing before the next domain change**,
both observed on 2026-08-10:
- **The first request to a route within ~30 s of a deploy can 404** while
  Cloudflare rolls the new version across its edge. Seen on three separate
  deploys, a different route each time, always stable afterwards. Not a
  defect — but it means the first visitor after a release can catch a
  stale edge.
- ⚠ **A negative DNS answer outlives the fix.** The apex had been dark all
  day, so the local network had cached "no address" and kept refusing
  `quademia.com` for about an hour after it was live worldwide.
  `ipconfig /flushdns` did not help — the stale entry was upstream. Verify
  with `curl --doh-url https://cloudflare-dns.com/dns-query`, or from
  mobile data, before concluding a domain has failed to attach.

---

## Launch gates (things deliberately left OFF until real users arrive)

Not deferrals through neglect — each is **correct to leave off today and
wrong to leave off at launch**. They share one trigger: *the moment
strangers can reach the product*. Collected here because each one's
failure mode is silent, and a silent failure nobody is watching for is
found by a user, not by us.

- [ ] **Email confirmation on self-serve `/register`** (Supabase Auth →
      Providers → Email → Confirm email). Off since the beginning, and
      **Sam's reason for keeping it off is right**: during a build you
      create test users constantly, and confirmation turns every one of
      them into an inbox round-trip. Blast radius checked 2026-08-06
      (later) and it is narrower than it feels — `signUp()` appears in
      exactly ONE place, `app/register/actions.ts`; seeded demo users
      insert into `auth.users` with `email_confirmed_at` already set, and
      invited students come via `inviteUserByEmail`, which confirms on
      accept. So the toggle reaches self-serve registration and nothing
      else.
      **Why it must flip at launch:** what confirmation buys is stopping
      someone occupying an account with an address they don't own, and
      catching typos before they harden. With prod empty by design that
      benefit is currently **zero**, while the cost is paid on every test
      signup — a real cost against an imaginary population. The moment
      the population is real the trade inverts. ⚠ The failure mode if
      forgotten is quiet and lands on the user: a nurse mistypes her
      address at signup, never receives the reset she needs months later,
      and there is no way to prove the account is hers.
      The template is already written and pasted (item 1), so flipping it
      is a toggle, not a task. Branding it changed nothing on its own —
      it only decided what the email says *if* this is ever switched on.
- [ ] **Resend Pro upgrade** (~$20/mo, 50k/month, no daily cap) — the
      trigger accepted by Sam in item 1: **before real signup volume**.
      Gamma once took >100 signups in a day and emails silently stopped;
      the free tier's 100/day ceiling re-creates exactly that failure.
      The auth rate limit (100/hr) rises with it — they move together.
