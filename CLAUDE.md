# CLAUDE.md — MyNclex

Last updated: 2026-05-05 (CAT removed from Explicit Deferrals — settled for v1 in `docs/product-plan/bank-consumption-cat.html`)

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
- Supabase (shared QAcademy instance) for Postgres + Auth + Storage
- `@supabase/ssr` for cookie-based server-side auth
- Resend for transactional email via a dedicated MyNclex email worker
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

## Non-Negotiable Rules

1. **Table prefix: `nclex_`** on every MyNclex database object (tables,
   RPCs, policies, storage buckets). No exceptions. This is the extraction
   mechanism — the day MyNclex moves to its own Supabase project, every
   `nclex_*` object goes, nothing else.

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

- **Production builds use webpack, not Turbopack.** The `build` and
  `cf:build` scripts pass `--webpack` to `next build`. Reason: Next.js 16
  defaults to Turbopack for production builds, but
  `@opennextjs/cloudflare` 1.19.x does not yet support Turbopack's chunk
  layout — the Worker boots but the first SSR request fails with
  `ChunkLoadError: Failed to load chunk server/chunks/ssr/[root-of-the-server]__*.js`.
  Dev (`next dev`) still uses Turbopack (it is mature for dev).
  Revisit and drop `--webpack` once OpenNext adds Turbopack support.

## Working With Sam

- Sam has no coding background. Explain rationale before code. No assumed
  code literacy.
- Discuss plans before building. No full rewrites without approval.
- Always push directly to main. No PRs or branches.
- One issue at a time, confirmed before moving on.

## Files To Read at Session Start

- This file (`mynclex/CLAUDE.md`)
- `mynclex/SESSIONS.md` — running log of work done
- `mynclex/BUILD_LIST.md` — once it exists, current priorities
- Recent commits (`git log --oneline -10`)

## Explicit Deferrals (Not v1)

- NGN item types (case studies, bow-tie, drag-and-drop, extended multi-response)
- Public self-serve tutor signup (tutors are manually vetted in v1)
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
```

The first two are safe for the browser (RLS protects data).
The service role key **never leaves the server** (per rule #5).
It's used only by the registration rollback path — see
`app/register/actions.ts`.

Production values live as Cloudflare Worker secrets set via
`wrangler secret put`. See `mynclex/CLONING.md` (future) for the
full setup runbook.
