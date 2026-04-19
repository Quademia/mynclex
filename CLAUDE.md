# CLAUDE.md — MyNclex

Last updated: 2026-04-19 (initial skeleton)

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

**Design phase.** Sam is designing MyNclex visually using Claude artefacts
before any code is written. No application code exists yet. Do not generate
scaffolding, pages, or features unless explicitly asked.

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

- `app/` — pages (Next.js App Router). Each folder is a URL path.
- `components/` — reusable UI pieces (React components).
- `lib/` — helpers, data access, Supabase client setup.
- `public/` — static assets (images, favicon).
- `db/` — MyNclex-specific database schema, RLS, migrations.
- `workers/` — separate Cloudflare Workers (e.g. email) — not the main app.

Layout is **flat** (no `src/` wrapper). This matches Next.js default and
the sibling products' philosophy.

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
- `mynclex/SESSIONS.md` — once it exists, running log of work done
- `mynclex/BUILD_LIST.md` — once it exists, current priorities
- Recent commits (`git log --oneline -10`)

## Explicit Deferrals (Not v1)

- CAT adaptive testing logic
- NGN item types (case studies, bow-tie, drag-and-drop, extended multi-response)
- Public self-serve tutor signup (tutors are manually vetted in v1)
- Payment splits / marketplace billing between QAcademy and tutors
- Migration of MyNMCLicensure or MyTeacher onto this stack

These are valid v2+ ideas. Do not build them in v1 unless Sam explicitly
re-opens the scope.
