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
   **Cloudflare Turnstile** on login/register/forgot-password, verified
   server-side inside the server action before Supabase is called (use the
   native Supabase↔Turnstile integration so the direct endpoint also
   demands a token). Cloudflare WAF/edge rules in reserve. Free protection
   the counters shouldn't have to absorb.
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
     must call `setSession` yourself). Slice 3's email-code login will
     meet the same thing.
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
   **Carries the invite rewrite** — see item 1's template note and the
   Supabase-managed section of `transactional-email.md`.
7. Cross-product SSO — parked, revisit post-migration of sibling products.

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
