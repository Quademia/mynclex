# CLAUDE.md — MyNclex

Last updated: 2026-09-04. This file holds **rules only** — what to do
and what to avoid in this repo. What happened, and why a rule exists,
lives in `SESSIONS.md` (the index) and `sessions/` (the log). What is
built and what is queued lives in `BUILD_LIST.md`. What the product is
designed to be lives in `docs/product-plan/`. Do not write session
history into this file; if a RULE changes, change the rule.

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

**In build, pre-launch.** The bank (authoring, practice, CAT, readiness
packs), tutored programmes (curriculum, quizzes, progress, payments,
enrolment, live sessions), the tutor library, tutor onboarding,
transactional email and auth are built and on `prod`
(`nclex.quademia.com`). Prod holds little content by design; dev is
where testing happens. The inventory of slices with status is
`BUILD_LIST.md`; the tutor commercial model (`tutor-plans-and-billing.md`)
is designed and not built. Build what Sam asks for in the session;
nothing more.

## Stack

- Next.js 16 + TypeScript + React 19 (App Router)
- Deployed to Cloudflare Workers via `@opennextjs/cloudflare`
- Supabase for Postgres + Auth + Storage — MyNclex has its **own** dev and
  prod Supabase projects, separate from the gamma products' pair
- `@supabase/ssr` for cookie-based server-side auth
- Resend for email — **sent from the app itself** (Server Actions), never
  from a separate worker; we run server-side on Workers, so a worker hop
  buys nothing. `workers/` holds only a `.gitkeep` and stays that way.
  See `docs/product-plan/transactional-email.md`
- Paystack for payments (GHS + international card); Stripe USD is planned
  for MyNclex at launch on a UK entity — see `company-registration.md`

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
     survive in copyright lines either. Nothing user-facing may name the
     company or a registration number until the certificate exists. See
     `docs/product-plan/domain-and-identity.md` §2 and
     `company-registration.md`.

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

Each entry is the rule, why, and where the full account lives. The story
of the day it was found is in `sessions/` under the date given.

- **Deep-clone a Tiptap/ProseMirror doc before it crosses a Server
  Action boundary.** ProseMirror builds node `attrs` with a null
  prototype and the Server Action serialiser silently drops them, so an
  image node arrives as a bare `{ type }`. `JSON.parse(JSON.stringify(doc))`
  fixes it; done in `lib/library/body-tiptap.ts` → `tiptapToBody`. Apply to
  any editor doc sent to a Server Action. (2026-05-29)

- **Auth links: `?code=` and `#access_token=` need OPPOSITE handling.**
  `?code=` (PKCE, what real auth emails send): the browser client consumes
  it the instant it is constructed, the code is single-use, so never call
  `exchangeCodeForSession` yourself — only wait for the session.
  `#access_token=` (implicit, admin-generated links): the client refuses
  it silently, so you MUST call `setSession()` yourself.
  `createBrowserClient` overrides `detectSessionInUrl` / `flowType` after
  spreading your options and is a module singleton, so it cannot be
  configured out of this. Reference: `app/reset-password/page.tsx`.
  ⚠ Two URLs differing only in the fragment do not reload the page —
  change the path or force a reload when testing. (2026-08-06)

- **`NEXT_PUBLIC_*` must exist at BUILD time.** `wrangler.jsonc` `vars`
  arrive at runtime; a `NEXT_PUBLIC_*` reference is replaced by webpack
  during `next build`, and anything missing then is `undefined` in the
  browser forever, with no error. **Every new `NEXT_PUBLIC_*` goes in
  three places:** `.env.local`, `wrangler.jsonc` `vars`, and the `env:` of
  the **build** step in both `deploy-dev.yml` and `deploy-prod.yml` (the
  build step carries no `--env prod`). To check a deployed environment,
  grep the served chunk for the literal value. (2026-08-08)

- **A Cloudflare dashboard "Variable" is deleted by the next deploy.
  Server-side values are encrypted SECRETS.** `wrangler deploy` sets the
  Worker's plaintext variables to exactly what `wrangler.jsonc` declares.
  A value being public is not a reason to use a Variable. Secrets apply
  immediately, no redeploy. ⭐ Give every server-side config a distinct
  "not configured" answer (`lib/auth/google-oauth.ts` → `google_unavailable`)
  so "missing" is diagnosable from outside. ⓘ The dashboard also has a
  save-without-deploy trap: the first save can silently not land.
  (2026-08-18, 2026-08-19)

- **Dev runs on Cloudflare's Turnstile TESTING keys, on purpose.** Real
  keys make `/login`, `/register` and `/forgot-password` hang in Claude's
  browser: Turnstile detects an automated browser and escalates. Dev:
  sitekey `1x00000000000000000000AA` + secret
  `1x0000000000000000000000000000000AA` (always pass). Prod keeps the
  real pair. **Four places must agree or the front door is an outage:**
  `wrangler.jsonc` `vars` · the build step's `env:` in `deploy-dev.yml` ·
  the captcha secret on the dev Supabase project · `.env.local`, which
  needs **both** keys (`lib/auth/turnstile.ts` switches off unless it
  sees both). If those three pages hang again, check the keys first.
  The real dev widget id is in the comments at each site. To force a
  fail: `2x00000000000000000000AB` + `2x0000000000000000000000000000000AA`.
  ⚠ `.env.local` copies into worktrees parent → child only; a key added
  in a worktree dies with it. (2026-08-09)

- **RLS is the floor, not the filter. Every tutor-side read names its
  owner.** Postgres ORs permissive policies, so "readable" is the union
  of `_self_select`, `_student_select` and `_admin_all`, and a query that
  leans on RLS returns rows the caller does not own. The SQL is not the
  bug and must not be "fixed" — a student reading a note IS allowed. The
  fix is app-layer: `.eq('tutor_id', …)` on every tutor-side read/write
  (`lib/library/tutor-scope.ts`, `lib/programmes/tutor-scope.ts`), and an
  `!inner` embed on the parent for junction tables with no `tutor_id`.
  ⭐ Before trusting RLS to narrow a list, ask what happens to those ids
  next: if any cross into a service-role client, the app filter is the
  only control. ⚠ It runs the other way too — a student screen can show
  rows because the caller is a TUTOR; name `user_id`. ⚠ A DELETE matching
  zero rows is not an error; read the affected row back before reporting
  success. (2026-08-25, both sessions)

- **The admin is the union's third member.** `_admin_all` /
  `_superadmin` policies are `FOR ALL` with a caller-level `USING`, so a
  SUPER_ADMIN matches every row of ~50 tables for reads AND writes, and
  `requireBankCurator('tutor')` admits that account on purpose. Admitting
  someone is not scoping them. The question for a tutor surface is "who
  else does this table let in, and is any of them on this screen?" Where
  children have no `tutor_id`, prove ownership once at the top of the
  action (`assertTutorOwnsCase` / `assertTutorOwnsTrend`,
  `lib/bank/tutor-scope.ts`). Guard the loader AND the action. Verify a
  guard in both directions: refuses the stranger, passes the owner. Do
  not "fix" the SQL. ⏭ The other ~50 admin-`FOR ALL` tables have not
  been walked. (2026-08-27)

- **The Supabase client here is UNTYPED.** Table and column names are
  strings, so a missing or wrong `.eq()` never fails a build. The
  compiler is not a reviewer; the database is. Verify scoping by
  executing as the account (`set role authenticated` + JWT claim).
  ⚠ PostgREST has no `.eq()` until `.select()` has been called — the
  wrong order typechecks and fails at runtime. (2026-08-27)
  ⚠ **An untyped ROUTING LIST is as silent as an untyped column.**
  `PRODUCT_PURPOSES` in `lib/payments/activate.ts` was a plain
  `string[]` gating which purposes reach the grant at all, so adding
  `BANK_TRIAL` to `PaymentPurpose` raised no error and the trial was
  refused with one console line and no grant. When adding a value to a
  union, grep every list and `Record` that switches on it — and do not
  trust a file's header narration of its own flow to be an inventory of
  its branches. (2026-09-04)

- **Production builds use webpack.** `build` and `cf:build` pass
  `--webpack`; `@opennextjs/cloudflare` 1.19.x cannot load Turbopack's
  chunk layout (first SSR request throws `ChunkLoadError`). Dev keeps
  Turbopack. Drop the flag when OpenNext supports Turbopack.

- **`npm install` can drop `lightningcss`'s native binary** (npm
  optional-deps bug on Windows); `next dev` then 500s every page. Quick
  fix: copy `node_modules/lightningcss-win32-x64-msvc/*.node` into
  `node_modules/lightningcss/`, delete `.next`, restart. Proper fix:
  delete `node_modules` + lockfile and reinstall. (2026-05-22)

- **Keep `middleware.ts`; do not rename to `proxy.ts`.** Next 16 warns,
  but `proxy.ts` is Node-runtime only and OpenNext 1.19.x rejects Node
  middleware, breaking the deploy (tried and reverted 2026-05-26,
  `2c66d46`). Tracking: cloudflare/workers-sdk#13755.

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

   ⚠ **Stopping a backgrounded `npm run dev` kills the npm wrapper, not
   the `next dev` child.** The orphan keeps port 3000, a replacement
   starts on 3001, and if `.next` was cleared the orphan serves 500s.
   **Check the port holder, don't assume the stop worked:**
   `Get-NetTCPConnection -LocalPort 3000 -State Listen`, then
   `Stop-Process -Id <pid> -Force`.

   ⚠ `npm run build` writes to the **same `.next`** the dev server is
   using, so it cannot be run alongside one. Stop the server, build,
   restart — and say so first if somebody is testing.

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
   It goes stale the first time someone fixes something. The count
   lives in the baseline file. If a session note describes lint, it
   must say what was actually checked — "clean on the files I touched"
   is not "clean".

3. Sam tests the change in the browser at `localhost:3000`.

4. **Wrap up per *At session end* below** — the log first, then the
   merge, and only with Sam's explicit approval. Never push to `main`
   without it.

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
operate inside the session's `.claude/worktrees/<...>` worktree. There
is no shared `work` branch (retired 2026-05-09); the session branch is
the working branch.

## At session end

Sam says we are stopping ("let's wrap up" or similar). **Read this
section first, then do it in this order.** Nothing else comes before it.

1. **The log entry** in `sessions/<period>.md`, newest first. Ask
   whether it goes in the current period file or a new one. It carries:
   what was built or changed, with slice ids; what was decided and what
   was rejected, with the reason; what went wrong and what it taught;
   what is open. It records what was true when written — it does not
   claim merge or release status.
2. **Two lines in `SESSIONS.md`** under the period heading: the title
   line (under 160 characters) and the keyword line (under 250). Count
   the characters; every first draft so far has been over.
3. **Ticks.** Every slice closed gets its date in `BUILD_LIST.md` **and**
   in the plan doc's ladder, in the same commit. Anything built off-list
   gets an `(unplanned)` line. Anything found and not done gets a ⬜ or ⏸
   line with its reason.
4. **This file, only if a rule changed** or a workaround was learned:
   the rule, one line on why, the session date. The story stays in the
   log.
5. **Memory, only for how Sam works or a trap I would repeat.** Never
   project status.
6. **`npm run lint:check`** once, and the log says what was checked.
7. **One docs commit** on the session branch for the above.
8. **Ask for the merge.** On Sam's explicit yes:

   ```powershell
   git checkout main
   git merge claude/<random> --ff-only
   git push origin main
   ```

9. **Report:** what is committed, what is on `main`, what is open. Stop.

**A session ends merged to `main`, or the log entry's first line says
why not.** The only reasons: Sam has not tested it yet; the build is
broken or a slice is half-done; or Sam said hold. Prefer ending a
session at a slice boundary over leaving a half-built slice on the
branch. Releasing `main` → `prod` is a separate decision and never part
of the wrap-up.

**If a session ends without a wrap-up**, the next session's first job is
to log the previous one from the diff and say so in the entry.

Commits on the session branch come **before** Sam's test; the test gates
the merge, not the commit. A failed test is fixed by another commit.

## Working With Sam

- Sam has no coding background. Explain rationale before code. No assumed
  code literacy.
- Discuss plans before building. No full rewrites without approval.
- Work on the auto-created session branch (`claude/<random>`). Always ask Sam for explicit approval before merging to `main`, and again before merging `main` to `prod`. See **Branching workflow** above.
- One issue at a time, confirmed before moving on.

## Files To Read at Session Start

- This file.
- `SESSIONS.md` — the index: one title line + one keyword line per
  session, newest first. Then the **head** of the latest period file in
  `sessions/` for recent detail (period files are newest-first; never
  read the tail for current state). Search the period files by keyword
  for anything older.
- `BUILD_LIST.md` — the inventory: one line per slice, per plan doc,
  with ✅ date / ⬜ / ⏸ / ✖. There is no "next" marker; Sam decides
  each session.
- `git fetch --prune`, then `git log --oneline -10` and the tips of
  `origin/main` and `origin/prod` — merge and release status live in
  git, not in any document.

**At session end**, the summary is written ONCE, in the period file.
`SESSIONS.md` gets its two lines; `BUILD_LIST.md` and the plan doc's
ladder get the same tick and date in the same commit; this file changes
only if a rule changed.

## Explicit Deferrals (Not v1)

- NGN item types beyond those the bank already has
- **Payment splits / marketplace billing** — deferred on purpose: a
  Paystack subaccount keeps us merchant of record, so tutor fees stay
  off-platform at launch. The tutor commercial model around it (seats,
  Starter · Pro · Academy, on-platform payments as an approved
  capability, never on Starter) is designed and not built; **every price
  is a proposal**. Canonical: `docs/product-plan/tutor-plans-and-billing.md`.
- Cross-product SSO
- Migration of MyNMCLicensure or MyTeacher onto this stack

Do not build these unless Sam explicitly re-opens the scope. Public
tutor self-signup was on this list and was re-opened and built in
August 2026; `BUILD_LIST.md` and `tutor-onboarding.md` are canonical.

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
Supabase project has its captcha switch ON, so a missing site key means
every login, signup and password reset on `localhost:3000` is refused.
They are Cloudflare's **testing** pair on purpose (see *Known
Workarounds*). **Both lines or neither** — `lib/auth/turnstile.ts`
switches itself off unless it sees both.

Production values live as Cloudflare Worker secrets set via
`wrangler secret put`. See `mynclex/CLONING.md` (future) for the
full setup runbook.
