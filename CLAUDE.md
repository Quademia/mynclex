# CLAUDE.md — MyNclex

Last updated: 2026-05-14 (release process corrected — `main` → `prod` is a GitHub PR merge commit, not `--ff-only`; added the migration-tracker consistency pre-check)

## What This Is

MyNclex is an NCLEX-RN exam prep product inside the QAcademy family. It has
two layers:
- **The Bank** — a QAcademy-owned NCLEX-RN question bank, available as a
  standalone self-study subscription.
- **Tutored Programmes** — vetted tutors run their own structured NCLEX
  prep curricula (week-by-week schedule, pre/post tutorial tasks, live
  sessions with recordings) on top of the shared bank.

Core early audience: Ghanaian nurses pursuing migration to the US/UK/Canada.
Open to anyone internationally.

## Current Status

**Planning + design phase. The landing page and Cloudflare Workers
pipeline are live (see README). No application code written yet
beyond the landing page. Do not generate further scaffolding,
pages, or features unless explicitly asked.**

When the design phase completes and build begins, this file gets expanded.
For now, keep it minimal.

## Stack (Target)

- Next.js 16 + TypeScript + React 19 (App Router)
- Deployed to Cloudflare Workers via `@opennextjs/cloudflare`
- Supabase for Postgres + Auth + Storage — MyNclex has its **own** dev/prod
  Supabase projects, separate from the gamma products' pair (corrected
  2026-08-05; this line previously claimed a "shared QAcademy instance",
  which was never true — see `docs/product-plan/domain-and-identity.md`)
- `@supabase/ssr` for cookie-based server-side auth
- Resend for email — **sent from the app itself** (Server Actions), not from a
  separate worker (corrected 2026-08-10; this line previously said "via a
  dedicated MyNclex email worker", copied from gamma's shape. Gamma needs one
  because a static site on Pages has nowhere to run server code; we are Next.js
  on Workers, so the extra hop buys nothing — and gamma's worker never achieved
  what it existed for, since the secret needed to reach it ships to the
  browser. `workers/` here holds only a `.gitkeep` and should stay that way.
  See `docs/product-plan/transactional-email.md`)
- Paystack for payments (GHS + international card)

MyNclex is the first QAcademy product on this stack. MyNMCLicensure and
MyTeacher will migrate to the same stack later, one at a time.

## Folder Structure

- `app/` — routes only (Next.js App Router). Each folder is a URL path.
- `components/` — visual pieces, grouped by domain (`shell/`, `nav/<audience>/`).
- `lib/` — logic, grouped by domain (`access/`, `bank/`, `nav/`, `shell/`, `supabase/`).
- `styles/` — all CSS files (top-level sibling of `app/`, not nested under it).
- `db/` — MyNclex-specific database schema, RLS, migrations.
- `public/` — static assets (images, favicon).
- `workers/` — separate Cloudflare Workers (e.g. email) — not the main app.
- `docs/` — planning and product specs.

Layout is **flat** (no `src/` wrapper). This matches Next.js default and
the sibling products' philosophy.

## Folder Conventions

Adopted in the 2026-04-25 student-nav scaffold. Apply to every future
slice.

1. **Routes grouped by audience under `app/(app)/`.** Three audience
   folders: `student/`, `tutor/`, `admin/`. URLs become `/student/...`,
   `/tutor/...`, `/admin/...`. Total symmetry — no audience is "the
   default."

2. **Components grouped by domain.**
   - `components/shell/` — chrome every audience shares (topbar, footer,
     role-chip, user-menu, app-shell).
   - `components/nav/<audience>/` — audience-specific nav pieces (e.g.
     `components/nav/student/sidebar.tsx`).
   - `components/nav/shared/` — genuinely shared nav pieces (e.g. the
     `Placeholder` component used by every "Coming soon" route).

3. **Single-use components live next to their caller.** A component
   used by exactly one page sits in that page's folder. Cross-audience
   reusable chrome lives in `components/<domain>/`.

4. **`lib/nav/` is data-driven.** Each audience exports its sidebar
   config as a `NavItem[]` array. Adding/removing/reordering a sidebar
   item = one-line edit in one file. No hunting through layouts.

5. **`styles/` is top-level.** All CSS lives here as a sibling of
   `app/`, not nested inside it. New domains get a new file (`nav.css`,
   `shell.css`, etc.) — don't keep appending to `dashboards.css`.

6. **Each audience renders its own chrome.** `(app)/layout.tsx` is a
   slim auth boundary (redirect if no user, import workspace CSS) — it
   does NOT render the topbar or footer. Each audience layout calls
   `loadChromeData()` and wraps its tree in `<AppShell>`, passing its
   own `productLabel` and `rightSlot` (e.g. `<ProductSwitcher />` for
   student product spaces). This avoids middleware-pathname tricks and
   keeps each audience's chrome self-contained.

7. **List and detail are sibling worlds when each has its own chrome.**
   When entering a detail view changes the surrounding chrome (different
   sidebar, different topbar slots), put the list and the detail in
   sibling folders, not parent-and-child. Use plural for the list and
   singular for the detail subtree:
   - `/tutor/programmes/` (list) + `/tutor/programme/[id]/...` (detail)
   - `/admin/users/` (list) + `/admin/user/[id]/...` (detail)
   Nesting them (`programmes/[id]/`) makes Next.js render BOTH layouts
   on a detail URL, which double-renders the topbar/footer. Sibling
   routes don't share a layout chain, so each owns its frame entirely.

8. **Permission keys use SCREAMING_SNAKE_CASE.** `BANK_CURATE`,
   `USERS_MANAGE`, etc. — not `bank.manage` or `users:manage`. Specs
   sometimes use a dotted-lowercase form for readability; the canonical
   mapping to code keys lives in `lib/access/constants.ts` (re-exported
   as `PERM_*` constants from `@/lib/access`). Sentinel `'SUPER_ADMIN'`
   on `NavItem.permission` is a role check, not a permission lookup.

9. **Audience-grouped code organisation.** Where a folder will contain
   work for multiple audiences (admin, tutor, student), group by
   audience as subfolders rather than mixing files. Already applied
   to `app/(app)/` (routes), `components/nav/` (sidebars + audience
   chrome), and `lib/access/` (gate helpers). New audience-aware
   modules should follow the same pattern.

10. **Access gates go through `@/lib/access`.** Pages and Server
    Actions call `requireAdminPermission(PERM_X)`, `requireSuperAdmin()`,
    `requireAnyAdmin()`, `requireTutor()`, or `requireBankCurator(surface)`
    instead of inlining the role/permission boilerplate. The helpers
    live in `lib/access/<audience>/require-<thing>.ts` and are
    re-exported through the `@/lib/access` barrel — call sites import
    from the barrel, not the deep paths. TS-layer gates mirror SQL
    RLS policies in `db/rls.sql` — UX is in TS, security is in SQL.
    See `lib/access/README.md` for the full convention including where
    new helpers go.

11. **`lib/bank/` is curator-side. `lib/practice/` is student-side.**
    Curator surfaces (editors, wrappers, bank list, save/delete actions,
    classifications, types) live in `lib/bank/`. Student-facing
    consumption (`runner/`, `builder/`, `launchers/`) lives in
    `lib/practice/`. Shared schema (`types.ts`, `classifications.ts`)
    stays in `lib/bank/` as the source of truth — `practice/` imports
    from `bank/`, never the other way round (consumers depend on
    producers).

12. **Cross-cutting UI categories: `lib/overlays/` + `lib/toast/` +
    `lib/hints/`.** Three top-level folders, one per category of
    floating/affordance UI:
    - `lib/overlays/` — modal/blocking confirmation dialogs.
    - `lib/toast/` — passive top-right notifications.
    - `lib/hints/` — explanation surfaces (bulb 💡 today, future shells).

    Within `overlays/` and `hints/`, the layer is encoded in the
    sub-structure: `shared/` holds generic primitives/shells used
    everywhere; area subfolders (`bank/`, `practice/`) hold instances
    specific to a curator/student surface. **Layer-3 instances belong
    next to the area, not in `shared/`** — e.g., the curator's
    `delete-confirm` (which hardcodes "Delete <itemId>" copy) lives in
    `overlays/bank/`, not `overlays/shared/`. `toast/` is flat (no
    subfolders) because toast variants are tone-only — every caller
    passes the message as a string, so there's no such thing as an
    area-specific toast instance.

    `lib/hints/` follows Path B: each unique explainer is its own file
    in `hints/<area>/<surface>-bulb.tsx` that wraps the shell with its
    content baked in. Toolbars import the named bulb (`<TrendWrapperBulb />`),
    never the shell directly. This keeps explanation copy auditable in
    one folder.

    **Editor-form atoms (`stem-field`, `instruction-field`, `editor-tabs`,
    `modal-frame`, etc.) stay in `lib/bank/atoms/`** — they're
    curator-internal plumbing, not cross-cutting affordances.

## UI Conventions

1. **Toasts for messages, not inline banners.** Server errors,
   client-side validation messages, and "action completed"
   confirmations surface through a fixed-position toast at the
   top-right of the viewport — see `<ErrorToast>` in
   `lib/bank/atoms/error-toast.tsx` for the reference
   implementation. Auto-dismiss after ~5 s with a click-× escape.
   Reason: an inline banner at the top of a scrollable form is
   invisible the moment the user scrolls past it; toasts stay
   visible regardless of scroll. Apply to any new editor or
   form-driven action.

2. **Confirmation dialogs for destructive or irreversible actions.**
   Anything that loses work or can't be undone (delete, discard
   unsaved changes, override a record) goes through a centred
   floating dialog with a dimmed backdrop — see
   `<DiscardConfirm>` and `<DeleteConfirm>` in
   `lib/bank/atoms/`. For dangerous actions add a *type-to-
   confirm* gate (curator types `DELETE` or the item name before
   the destructive button activates). Inline confirmation panels at
   the top of a scrollable body suffer the same visibility bug as
   inline banners; silent destruction is unrecoverable. Backdrop
   click should map to the safe option (Cancel / Keep editing).

3. **Surfaces must be mobile-friendly — student surfaces are the
   priority.** Every authenticated surface has to work on a phone, not
   just desktop. The core audience (Ghanaian nurses) is phone-first, so
   **student** surfaces especially must be usable at narrow widths;
   tutor/admin must at least be navigable and not broken. The
   breakpoint is **768px** — below it, mobile layout applies; above it,
   the desktop layout is untouched.
   - **Navigation is already solved — don't hand-roll it per surface.**
     The shared **mobile-nav system** lives in
     `components/shell/mobile/` (+ `styles/mobile-nav.css`), wired
     through `AppShell`'s `mobileNav` slot. At ≤768px it hides the
     desktop topbar + sidebar and renders: a slide-in **drawer** (the
     complete menu, every audience), an **account sheet** (consolidated
     user menu + role switch + sign-out), and — for **students** only —
     an additive **bottom-tab bar**. Tabs come from `NavItem.mobileTab`
     (≤4 per context, with optional `tabLabel`) in `lib/nav/*`. A new
     audience surface gets mobile nav for free by going through a shell
     that renders `<MobileNav>`.
   - **For non-nav content** (tables, forms, editors, dashboards),
     reflow/stack at ≤768px rather than letting it overflow. New CSS
     goes in the surface's own stylesheet with a `@media
     (max-width: 768px)` block.
   - Full design + slice history:
     `docs/product-plan/mobile-responsive.md`.

4. **One money voice: `GHS 350`, never `₵350`.** Every surface —
   public, student, tutor, admin — renders cedis as the ISO code, and
   dollars as `$`. Amounts are stored as integer **minor units** and
   should only be rendered through `formatMinor()` in
   `lib/products/money.ts`, which owns both the minor→major conversion
   and the prefix. Don't hand-roll ``currency === 'GHS' ? `GHS ${x}` :
   `$${x}` `` — five files still do, and that's known debt, not a
   pattern to copy. (Settled 2026-07-08: the admin/tutor surfaces
   printed ₵ while the public ones printed GHS; a split voice is two
   things to keep in step, and `₵` isn't a sign our migrating,
   international audience reliably reads.) A `₵` glyph used as a
   decorative **icon** is fine — an icon isn't an amount.

5. **One brand name: `Quademia`. `QAcademy` is the old name and must
   never reach a reader.** Settled 2026-08-19, swept across the app
   2026-08-22. ⭐ **The rule is deliberately asymmetric** — nothing a
   *user* sees keeps the old name; nothing a *developer* reads gets
   churned for it. So `lib/payments`' comments about whose money is
   whose, `lib/audit`, `_archive/`, `tokens.css`, `wrangler.jsonc` and
   the repo org itself all still say QAcademy, on purpose. If you are
   writing a string that renders — copy, a page title, an email, an
   `aria-label` — it says Quademia.
   - ⚠ **Quademia is THE brand; MyNclex is a product name under it**
     (Sam, 2026-08-22). MyNclex has no logo of its own and is not
     getting one. The public nav's `M` tile is a letter, not a mark.
   - ⚠ **QAcademy is not a registered company name**, so it does not
     survive in copyright lines either. See
     `docs/product-plan/domain-and-identity.md` §2b–§2c.
   - ⓘ It took three days and a full sweep for this to land after it was
     decided, because the decision lived in one call site's comment. **A
     rule recorded where one caller can see it is not a rule.**

## Non-Negotiable Rules

1. **Table prefix: `nclex_`** on every MyNclex database object (tables,
   RPCs, policies, storage buckets). This is the extraction
   mechanism — the day MyNclex moves to its own Supabase project, every
   `nclex_*` object goes, nothing else.
   - **Documented exception — the Journey Tracker (`journey_*`).** The
     Journey Tracker is a *generic, platform-level* case-management engine
     (not an NCLEX feature) that we will build as a bounded module inside
     this repo now and **extract into a standalone QAcademy product later**.
     So its database objects deliberately use a neutral **`journey_*`** (or
     `qa_*`) prefix, **not** `nclex_*`, and its code keeps a one-way
     dependency (MyNclex → journey, never the reverse) with the
     NCLEX-specific bit behind an adapter. Do **not** "fix" `journey_*` to
     `nclex_*`. Rationale + the full module/extraction contract:
     `docs/product-plan/journey-tracker.md` → *Architecture*.

2. **No imports from sibling products.** MyNclex never imports code from
   `mynmclicensure/` or `myteacher/`. Vice versa. Copy-paste is allowed if
   the same helper is needed; sharing is not.

3. **The extraction test.** At any moment, `cp -r mynclex/ ../qacademy-nclex/`
   must produce a fully working independent repo. If a decision would
   break that, reconsider.

4. **Server-side auth rules** (enforce these from the first line of code):
   - Use `@supabase/ssr`, never `@supabase/auth-helpers-nextjs` (deprecated).
   - On the server, use `supabase.auth.getClaims()` or `getUser()`, never
     `getSession()` — the latter doesn't revalidate tokens and is spoofable.
   - Create the Supabase client per-request, never at module scope — warm
     runtimes (Cloudflare Workers, Vercel Fluid) can leak sessions between
     users otherwise.
   - Authenticated pages must set `export const dynamic = 'force-dynamic'`
     and respond with `Cache-Control: private, no-store` — otherwise a CDN
     can cache one user's `Set-Cookie` response and serve it to another.

5. **Never expose the Supabase service role key to the browser.** Anon /
   publishable key only in client code. Service role lives in Worker
   secrets.

6. **Project layout is flat — no `src/` wrapper.** Do not suggest
   reorganising into `src/` without an explicit decision.

## Known Workarounds

- **ProseMirror/Tiptap node `attrs` are dropped crossing a Server
  Action boundary — deep-clone the doc before sending.** Tiptap's
  `editor.getJSON()` returns each node's `attrs` as the *live*
  ProseMirror attrs object, which ProseMirror builds with
  `Object.create(null)` (null prototype). When such an object is
  passed as a React Server Action argument, the serializer silently
  drops it — so a `libImage` node arrived server-side as a bare
  `{ type: 'libImage' }` and the saved image vanished on reload
  (slice 11.6a). Fix: round-trip the doc through
  `JSON.parse(JSON.stringify(doc))` before it crosses the boundary,
  which rebuilds every object with the normal `Object.prototype`.
  Done in `lib/library/body-tiptap.ts` → `tiptapToBody`. Apply the
  same clone to any future editor doc / PM-derived structure sent to
  a Server Action.

- **Auth links: `?code=` and `#access_token=` need OPPOSITE handling, and
  the browser client cannot be configured out of it.** Verified against
  the installed `@supabase/ssr` 0.5.2 + `@supabase/auth-js` source on
  2026-08-06, after `/reset-password` took three attempts.
  - `createBrowserClient` sets `detectSessionInUrl`, `flowType`,
    `storage`, `persistSession` and `autoRefreshToken` **after** spreading
    the caller's options, so anything you pass for those keys is
    **discarded silently**. It is also a module-level singleton — later
    calls return the first client and ignore their arguments.
  - **`?code=` (PKCE — what real auth emails send): the library owns it.**
    It consumes the code the instant any client is constructed. The code
    is single-use, so calling `exchangeCodeForSession` yourself races the
    library and the loser reports failure for an operation that
    succeeded. Only *wait* for the session (`onAuthStateChange` +
    `getUser`).
  - **`#access_token=` (implicit — admin-generated links): the library
    refuses it.** `GoTrueClient` throws `"Not a valid PKCE flow url."`
    for an implicit callback under `flowType:'pkce'`, and routes that
    error to its own debug channel, so **nothing appears in the
    console**. Here you MUST call `setSession()` yourself. (This is why
    `/welcome` has always worked — it does exactly that.)
  - Reference implementation: `app/reset-password/page.tsx`. The same
    trap is waiting for slice 3's email-code login.
  - ⚠ Debugging note: navigating between two URLs that differ **only in
    the fragment does not reload the page**. Two wrong diagnoses that day
    came from "tests" that never ran the new code and were showing the
    previous attempt's screen. Change path, or force a reload.

- **`NEXT_PUBLIC_*` must exist at BUILD time — `wrangler.jsonc` vars are
  RUNTIME only, and the gap is silent.** Cloudflare hands `vars` to the
  Worker when it serves a request, so every server-side read works and
  nothing looks wrong. But `NEXT_PUBLIC_*` is a *build-time substitution*:
  webpack replaces each reference with a string literal while `next build`
  runs, and anything missing at that moment is `undefined` in the browser
  bundle **forever**. A runtime binding arrives hours too late.
  Found 2026-08-08, after it had been true for as long as the deploy
  workflows existed. Two symptoms, one cause:
  - The Turnstile widget rendered **server-side** (runtime vars present)
    and vanished on hydration (client bundle had no key) — a container in
    the HTML and no widget on the page.
  - ⚠ Worse and older: the deployed `/reset-password` bundle read
    `createBrowserClient(n.env.NEXT_PUBLIC_SUPABASE_URL, …)` **unreplaced**,
    so it and `/welcome` (invite acceptance) could not work on either
    Worker. Both had only ever been tested on **localhost**, where
    `.env.local` is present at build time — which is exactly why months of
    sessions never caught it.

  **Rule: any new `NEXT_PUBLIC_*` goes in THREE places** — `.env.local`
  (local dev), `wrangler.jsonc` `vars` (server at runtime, dev + `env.prod`),
  and the `env:` block of the **build** step in *both*
  `.github/workflows/deploy-dev.yml` and `deploy-prod.yml`. ⚠ The build step
  carries no `--env prod`; only the deploy does, so nothing else in the
  pipeline supplies prod's values. The duplication is known debt, flagged in
  comments on both sides (wrangler.jsonc is JSONC, so a workflow step cannot
  just `jq` it out).

  **To check a deployed environment**, read the served bundle rather than
  trusting the config — the value should appear as a literal:
  `curl -s <origin>/login | grep -oE '/_next/static/chunks/app/login/[^"]+\.js'`
  then grep that chunk for the expected value.

- **⚠ A dashboard "Variable" is DELETED BY THE NEXT DEPLOY. Server-side
  values must be added as encrypted SECRETS.** Cloudflare stores the two
  differently: `wrangler deploy` sets the Worker's plaintext variables to
  exactly what `wrangler.jsonc` declares, so anything added in the dashboard
  as a **Variable** and not present in that file is **wiped on the next
  deploy**. **Secrets** are stored separately and survive. Found 2026-08-19
  adding `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: both were set on
  `mynclex-dev` before the merge, the deploy three minutes later removed
  them, and the door reported itself unconfigured.
  - **The value being public is not a reason to use a Variable.** The Google
    client ID is public by design, but stored as a Variable it still
    vanishes. Either put it in `wrangler.jsonc` `vars` (committed, and then
    it survives) or make it a Secret — not the dashboard's Variable box.
  - ⭐ **Give every new server-side config a distinct "not configured"
    answer** and the diagnosis costs one click instead of a hunt. Here
    `lib/auth/google-oauth.ts` returns null unless it sees **both** values,
    which routes to `/login?error=google_unavailable` — visibly different
    from a real Google failure, so "the secrets are missing" is
    distinguishable from "the handshake broke" from outside, with no
    dashboard access. Same idea as the email drain's 503-vs-401 split.
  - ⓘ Secrets apply to the running Worker immediately (no redeploy) and are
    one-time per Worker. See also the CRON_SECRET episode (2026-08-18): the
    dashboard also has a save-without-deploy draft trap, where the first
    attempt silently never lands and re-adding fixes it.

- **⚠ REAL TURNSTILE KEYS ON DEV MAKE `/login`, `/register` AND
  `/forgot-password` UNREACHABLE TO CLAUDE — THE BROWSER PANE HANGS ON
  THEM.** Not a bug and not fixable. Turnstile exists to detect an
  automated browser; Claude's browser is one; so Cloudflare escalates to
  its heaviest challenge on exactly that client and the pane stops
  responding. **The product working correctly is the failure mode.**
  Settled 2026-08-09 (`0d38cf3`): **dev runs on Cloudflare's published
  testing pair** — sitekey `1x00000000000000000000AA` (visible, always
  passes, no challenge) + secret `1x0000000000000000000000000000000AA`
  (always passes validation). The widget still renders and every step
  still runs — pass issued, forwarded, validated by Supabase, answer read
  back — only the judgement is stubbed to yes. **Prod keeps the real pair**
  (separate Cloudflare account, separate widget, separate Supabase
  project) and was verified to genuinely validate, not merely demand, a
  token.

  **If those three pages start hanging again, check the dev keys first —
  that is the cause, every time.** The real dev widget
  (`0x4AAAAAAEKb3Z55nyB9Sipe`) is kept in the comments at every site,
  since it is what a swap-back uses.

  **⚠ Four places, one truth, and a mismatch is an outage at the front
  door** (a testing pass checked by the real secret is refused, and so is
  the reverse): `wrangler.jsonc` `vars` · the build step's `env:` in
  `deploy-dev.yml` · **the secret on the dev Supabase project's captcha
  setting** (dashboard, not in the repo) · and `.env.local`, which needs
  **both** keys — `lib/auth/turnstile.ts` treats Turnstile as switched off
  unless it sees the secret *and* the site key, and "off" now means our
  server drops the pass while Supabase still demands one.

  ⚠ `.env.local` is copied into worktrees **parent → child only**. A key
  added inside a worktree dies with it — write it to the main checkout's
  copy or it is gone next session. (That is exactly how localhost auth sat
  broken from 08-08 to 08-09 without anyone noticing.)

  ⓘ To make Turnstile **fail** on demand — the only practical way to test
  the `LOGIN_BLOCKED`-vs-`LOGIN_FAIL` routing — swap dev to
  `2x00000000000000000000AB` + `2x0000000000000000000000000000000AA`.
  https://developers.cloudflare.com/turnstile/troubleshooting/testing/

- **⚠ RLS IS THE FLOOR, NOT THE FILTER — "readable" is a wider set than
  "mine", and every tutor-side read must name its owner.** Postgres ORs
  permissive policies together, so a table with a `_self_select` policy
  AND a `_student_select` policy hands the caller the union of both. A
  query that leans on RLS to do the narrowing therefore returns rows the
  caller does not own. Found 2026-08-25: a test account holding **both**
  TUTOR and STUDENT, enrolled on another tutor's programme, opened its own
  tutor Library and saw **all 38 of that tutor's notes** — plus their
  folders, shelves, memberships and attachments — because
  `lib/library/queries.ts` asked for "the notes" and never said "…that are
  mine". Every affected file had a comment saying RLS scoped it. It did
  not.
  - **The SQL is not the bug and must not be "fixed".** A student reading
    that note IS allowed — that's what the student surfaces are for. The
    mistake was a *tutor* surface asking a question whose answer legally
    includes other people's rows. The fix is app-layer, in
    `lib/library/tutor-scope.ts` (`getLibraryTutorId()`), and every
    tutor-side read/write now carries `.eq('tutor_id', …)`.
  - **Writes were never exposed** — UPDATE/DELETE carry only the self
    policy, so a cross-tutor write was always refused (verified). Reads
    were the whole leak. But `_admin_all` is `FOR ALL`, so a SUPER_ADMIN
    walking a tutor surface *could* write another tutor's rows; the
    explicit filter closes that too.
  - **Junction tables have no `tutor_id`** (`_shelf_memberships`,
    `_note_attachments`) — scope them through an explicit
    ownership probe on the parent shelf/note, not through RLS.
  - ⭐ **The same class of bug lived outside the library — ✅ SWEPT
    2026-08-25 (13 call sites, three commits, no migration).** ⚠ Two
    things this entry originally said were wrong, and both mattered:
    - ⚠ **`_public_select` does not exist.** It was dropped in
      migration `20260528120000` when public discovery moved to the
      `nclex_public_programmes` view. `nclex_programmes` carries
      `_self_select` · `_student_select` · `_admin_all`, and
      `_student_select` alone is enough to cause this. **Verified
      against the live dev catalogue, not the SQL files** — which is
      the only way to be sure, since a dropped policy leaves its
      `CREATE` behind in the migration that added it.
    - ⚠⚠ **The scope was understated.** This said the leak "gates the
      `/tutor/programme/[id]/…` subtree", implying you had to type a
      URL. In fact **`getMyProgrammes()` had no owner filter at all**,
      so other tutors' programmes were **listed on the tutor
      dashboard**. Measured: `+mynclexstudent3`, who owns **zero**
      programmes, was shown **2**; `benedictbless9` saw 4 for 2 owned.
    - ⚠⚠ **AND IT WAS NOT READ-ONLY-ISH — SERVICE ROLE IS WHERE THIS
      BITES.** The library leak was bounded by RLS. This one was not:
      those programme ids are handed to `createServiceRoleClient()`
      reads in `getTutorPayments`, `readRoster` and
      `getMyProgrammesForList`, each commented "owner-proven". Service
      role **ignores RLS by design**, so the app-layer filter is the
      *only* control. Exposed on dev: **22 strangers' names + emails**
      on the enrolments roster, and **3 of another student's payments**
      (name, email, GHS 3,000) on the tutor Payments page.
    - ⭐ **The shape of the fix:** `getProgrammeForShell` could not
      take an owner filter — the **student** gate shares it, and there
      *readable* is the correct question. So `getOwnedProgrammeForShell`
      sits beside it and the seven tutor routes call that instead.
      Everything else was tutor-only and took the filter directly.
      Junction-style tables (units, cohorts) have no `tutor_id`, so
      they filter through an `!inner` embed on the parent programme.
    - ⭐ **`deleteUnit` reported SUCCESS while deleting nothing** — a
      DELETE matching zero rows is not an error, so a refused write
      fell through to `ok: true`. **RLS protecting the write does not
      mean the screen tells the truth about it.**
    - ⭐ **Rule of thumb worth more than the fix:** *before trusting
      RLS to narrow a list, ask what happens to those ids next.* If
      any of them cross into a service-role client, RLS was never the
      control and the filter is load-bearing.
    - Canonical: `lib/programmes/tutor-scope.ts`.
  - ⭐ **It also runs the other way — a STUDENT screen showing rows
    because the caller is a TUTOR.** `nclex_enrolments` carries
    `_student_select` (`user_id = auth.uid()`) **and** `_tutor_select`
    (I tutor that programme), so "my enrolments" returned a tutor's
    **students'** rows: Steven, with **zero** enrolments of his own, got
    **48**. Consequences, all fixed 2026-08-25 by naming `user_id`:
    his student picker listed **5 programmes he teaches and is not on**;
    `getMyProgrammeEnrolmentStatus` / `getMyCohortEnrolmentStatus`
    answered ENROLLED off a stranger's row, so **entry was open** (a
    code comment claiming "listing only — entry was never open" was
    simply wrong); and the picker's next-payment panel rendered **a real
    student's amount and due date**. Charging was never possible —
    `lib/payments/init.ts` re-checks `user_id` against the service-role
    client — so the money was visible, not chargeable.
  - ⓘ **Fixing the enrolment question also shut the door** that
    `getProgrammeForShell`'s looseness had opened: `require-programme-
    access` and `require-cohort-access` both run a readability check
    *then* a status check, and the status check is now genuinely
    per-caller. The readability half is still wrong — see above — but it
    is no longer load-bearing on that path.
  - ⚠ **A tutor cannot fix this by enrolling in their own programme** —
    the product refuses it ("You can't enrol yourself in your own
    programme" / "...own cohort", `lib/enrolments/actions.ts`). The
    sanctioned way to see a programme through a student's eyes is a
    **preview**, and today one exists only for the **Library** tab.
    Curriculum, quizzes, sessions and assignments have none. Closing the
    leak removed an accidental substitute for that missing preview;
    building the real thing is open work (Sam, 2026-08-25).

- **Production builds use webpack, not Turbopack.** The `build` and
  `cf:build` scripts pass `--webpack` to `next build`. Reason: Next.js 16
  defaults to Turbopack for production builds, but
  `@opennextjs/cloudflare` 1.19.x does not yet support Turbopack's chunk
  layout — the Worker boots but the first SSR request fails with
  `ChunkLoadError: Failed to load chunk server/chunks/ssr/[root-of-the-server]__*.js`.
  Dev (`next dev`) still uses Turbopack (it is mature for dev).
  Revisit and drop `--webpack` once OpenNext adds Turbopack support.

- **`npm install` can break the dev server's CSS (lightningcss).** Running
  `npm install` on Windows can trip the npm optional-dependencies bug and drop
  Tailwind v4's native `lightningcss` binary, after which `next dev` throws
  `Cannot find module '../lightningcss.win32-x64-msvc.node'` on every request
  and pages render unstyled / 500. Quick fix: copy
  `node_modules/lightningcss-win32-x64-msvc/lightningcss.win32-x64-msvc.node`
  into `node_modules/lightningcss/`, delete `.next`, restart `npm run dev`.
  Proper fix: delete `node_modules` + `package-lock.json` and reinstall. (Hit
  2026-05-22 after installing vitest.)

- **Keep using `middleware.ts` — do NOT rename to `proxy.ts`.** Next.js 16
  prints a deprecation warning at `npm run dev` startup recommending the
  rename, but `proxy.ts` is **Node.js-runtime only** in Next 16 (route
  segment config — including `export const runtime = 'edge'` — is not
  allowed on proxies). The current `@opennextjs/cloudflare` (1.19.x)
  build pipeline rejects Node middleware with
  `ERROR Node.js middleware is not currently supported. Consider switching
  to Edge Middleware.`, breaking the dev deploy. Tracking issue:
  cloudflare/workers-sdk#13755 (unresolved as of 2026-04). The cosmetic
  rename was attempted in commit `2c66d46` (2026-05-26) and immediately
  reverted the same day after the deploy of slice 11.2b failed. Re-rename
  when OpenNext ships proxy.ts support via the Next 16.2 Build Adapters API.

## Branching workflow

Two long-lived branches on the remote:

- **`main`** — stable. Each session's work merges here after Sam tests
  it locally and explicitly approves.
- **`prod`** — released / deployed. `main` merges into `prod` when
  it's time to ship to users (also with Sam's approval).

Each session lands in a fresh `.claude/worktrees/<random>` worktree on
an auto-created `claude/<random>` branch. **That session branch is the
working branch** — commit there directly, no checkout needed. Each
session is short-lived and gets its own branch.

`dev` is deliberately avoided as a branch name (Cloudflare / Supabase
already use `dev`/`prod` for env naming, so a `dev` branch would
collide). `prod` is reused as a branch name only because the env
mapping is 1-to-1.

**Per-session loop:**

1. **Start the dev server** as the first action of the session:

   ```powershell
   npm run dev
   ```

   Serves on `http://localhost:3000`. The `.env.local` is auto-copied
   into new worktrees by `.worktreeinclude`, so credentials are
   already wired.

2. Build the requested slice / fix on the auto-created session
   branch. Commit there freely.

   **A pre-commit hook runs the lint guard for you.** `.githooks/pre-commit`
   calls `npm run lint:staged`, which lints only the staged files
   (~4 s) and refuses the commit if any of them carries a **new**
   error, naming the file and rule. It is enabled per machine with
   `git config core.hooksPath .githooks` — already set here, and
   worktrees share it. `git commit --no-verify` bypasses it; if you
   use that, **say so in the session log**.

   To check the whole repo deliberately — worth doing once a session,
   since the hook only ever sees files you touched:

   ```powershell
   npm run lint:check
   ```

   Both compare against `.eslint-baseline.json` and fail **only** on
   problems this session added. A known backlog is recorded there
   deliberately — see the header of `scripts/lint-baseline.mjs` for how
   it got there, why the baseline counts rather than pins line numbers,
   and why the hook is staged-only (a 71-second hook teaches the
   bypass).

   ⚠ **Renaming a file that carries known errors trips a false alarm** —
   the baseline is keyed by path, so a move reads as "old path fixed,
   new path new". Nothing is wrong: re-run `npm run lint:baseline` as
   part of the rename commit.

   ⚠ **Never re-baseline to make the check pass.** `npm run
   lint:baseline` is for *banking a fix*, not for absorbing a new
   error. A genuinely unavoidable one gets an `eslint-disable` **at
   the line, with the reason written next to it**, so the judgement
   survives for whoever reads it next.

   ⚠ **Do not write the error count into this file or a session log.**
   It goes stale the first time someone fixes something, and then it
   quietly gives the wrong answer. The count lives in the baseline
   file, which regenerates. If a session note describes lint at all,
   it must say what was actually checked — "clean on the files I
   touched" is not "clean", and describing the first as the second is
   exactly how a 47-error backlog went unnoticed for four months.

3. Sam tests the change in the browser at `localhost:3000`.

4. **Always ask Sam for explicit approval before merging to `main`.**
   Never push to `main` without it. On approval:

   ```powershell
   git push origin claude/<random>           # optional: keep session branch on remote
   git checkout main
   git merge claude/<random> --ff-only
   git push origin main
   ```

**Releasing `main` → `prod`** (when ready to deploy, again with Sam's
explicit approval):

`prod` is **not** fast-forwardable from `main` — every release so far
has been a GitHub pull request from `main` into `prod`, merged as a
**merge commit**. `prod` therefore carries release merge commits that
`main` does not, so `git merge main --ff-only` would fail. Release the
established way:

```powershell
gh pr create --base prod --head main --title "Release main → prod — <summary>" --body "<what ships>"
gh pr merge <pr#> --merge --subject "Release main → prod — <summary>" --delete-branch=false
```

The merge pushes `prod`, which triggers two GitHub Actions in parallel:
`migrate-prod.yml` (applies any new `db/migrations/` files to the prod
Supabase project) and `deploy-prod.yml` (builds the OpenNext bundle and
deploys the Worker to the workspace Cloudflare account). Watch both with
`gh run list` / `gh run watch`, then sanity-check prod
(`supabase_migrations.schema_migrations`, the prod Worker URL).

**Pre-release check — migration-tracker consistency.** `supabase db
push` fails its strict consistency check if prod's
`schema_migrations` tracker has a row whose `version` doesn't match an
on-disk `db/migrations/<version>_*.sql` filename. This happens when a
migration was applied to prod directly via MCP `apply_migration`
(which stamps a wall-clock `version`) instead of through the pipeline.
Before releasing, compare prod's tracker tail against the migration
files; reconcile any mismatch with a one-row `UPDATE` on
`schema_migrations.version` so it matches the file. (Seen 2026-05-14
with `keepalive_table`.)

Never work directly in the `qacademy-mynclex` main checkout — always
operate inside the session's `.claude/worktrees/<...>` worktree.

**The old `work` branch was retired on 2026-05-09.** It used to be the
single rolling branch Claude committed to, but each session already
has its own isolated `claude/<random>` branch — `work` was a redundant
hop and caused worktree-exclusivity collisions when more than one
session was open.

## Working With Sam

- Sam has no coding background. Explain rationale before code. No assumed
  code literacy.
- Discuss plans before building. No full rewrites without approval.
- Work on the auto-created session branch (`claude/<random>`). Always ask Sam for explicit approval before merging to `main`, and again before merging `main` to `prod`. See **Branching workflow** above.
- One issue at a time, confirmed before moving on.

## Files To Read at Session Start

- This file (`mynclex/CLAUDE.md`)
- `mynclex/SESSIONS.md` — index of work sessions; then open the latest
  period file in `mynclex/sessions/` (monthly, e.g. `sessions/2026-05.md`)
  for recent detail. Don't read every archive — just the index + the
  latest period file(s) relevant to the task.
- `mynclex/BUILD_LIST.md` — current priorities (slice checklists)
- Recent commits (`git log --oneline -10`)

## Explicit Deferrals (Not v1)

- NGN item types (case studies, bow-tie, drag-and-drop, extended multi-response)
- ~~Public self-serve tutor signup (tutors are manually vetted in v1)~~ —
  ⭐ **RE-OPENED 2026-08-21 (Sam), and ✅ BUILT 2026-08-22** as slice 2 of
  the tutor-onboarding arc: `/for-tutors`, an application route, the
  `/admin/applications` queue, and four emails. **Vetting is still a
  human decision** — the change is that it is now made on a screen
  instead of by hand-written SQL, and that a tutor can ask without
  knowing somebody. ⚠ The register-as-tutor toggle named here was
  **dropped** during design; the door lives on the tutors page, not on
  `/register`. Canonical: `docs/product-plan/tutor-onboarding.md`.
  Left in this list, struck through, so the reversal is visible rather
  than silent.
  ⭐ **The whole arc closed 2026-08-22** with slice 3 (invite by email),
  so all four doorways exist: admin promotion · self-application ·
  registration · invite. There is no longer any way of becoming a tutor
  that needs somebody to write SQL.
- Payment splits / marketplace billing between QAcademy and tutors
- Migration of MyNMCLicensure or MyTeacher onto this stack

These are valid v2+ ideas. Do not build them in v1 unless Sam explicitly
re-opens the scope.

## Environment variables

Local dev requires `mynclex/.env.local` (git-ignored):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
PAYSTACK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

The first two are safe for the browser (RLS protects data).
The service role key **never leaves the server** (per rule #5).
It's used only by the registration rollback path — see
`app/register/actions.ts`.

⚠ **The two Turnstile lines are not optional and not a placeholder.** Dev's
Supabase project has its captcha switch ON, so a missing site key means no
widget, no pass, and **every login, signup and password reset on
`localhost:3000` refused** — which is precisely what happened, unnoticed,
between 2026-08-08 and 08-09. They are Cloudflare's **testing** pair, on
purpose; see the Turnstile entry under *Known Workarounds* for why, and for
the warning about putting the real keys back. **Both lines or neither** —
`lib/auth/turnstile.ts` switches itself off unless it sees both.

Production values live as Cloudflare Worker secrets set via
`wrangler secret put`. See `mynclex/CLONING.md` (future) for the
full setup runbook.
