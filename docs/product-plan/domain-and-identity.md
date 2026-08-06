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

Two loose ends deferred:

- [ ] **DKIM** — blocked by Google until ~24h after Gmail activation
      (prompt seen 2026-08-05; retry from 2026-08-06). Admin console →
      Apps → Gmail → Authenticate email → quademia.com → Generate new
      record → add the `google._domainkey` TXT in Cloudflare → Start
      authentication. Affects outbound signatures only; nothing else
      waits on it.
- [ ] **DMARC** — add in Cloudflare: TXT `_dmarc` =
      `v=DMARC1; p=none; rua=mailto:admin@quademia.com`. Monitoring
      mode only (reports, no blocking). Providers send one aggregate
      XML report/day each; the interval is effectively fixed (big
      providers ignore `ri=`) — filter to a label and ignore until
      needed. Tighten policy only after Resend is live and both
      senders authenticate.

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
   **STATUS 2026-08-06 — plumbing DONE, templates remain:**
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
   - ⬜ **Auth-email rate limit bump to 100/hr** (both projects,
     Authentication → Rate Limits; matches Resend's free 100/day ceiling;
     both rise together at the Pro upgrade). Instructed 2026-08-06 but
     **not confirmed done** — verify at next session.
   - ⬜ **Branded auth templates** — scope + wording settled with Sam
     2026-08-06, nothing pasted yet. Brand FOUR: invite ·
     reset-password · confirm-signup · change-email (all text-branded,
     "— The Quademia team", no logo until one exists; invite copy stays
     neutral on who invited, because tutor-add and pay-first checkout
     send the same template). **Deliberately skipped:** magic link
     (slice 3 rewrites it code-only — branding now is thrown-away work)
     and reauthentication (nothing uses it).
   - ⬜ **New docs folder for ALL product email copy** (not just auth) —
     approved by Sam 2026-08-06; create it when the templates are
     written, so the canonical copy lives in the repo, not only in two
     dashboards.
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
