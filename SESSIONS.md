# MyNclex Sessions Log

Running log of MyNclex work sessions. Each entry: what was done + what's
queued for next session. Newest on top. Product-local — isolated from
other QAcademy products, per the extraction rule in CLAUDE.md.

---

## Session — 2026-04-21 (Auth flow — Slice 1 — Claude Web + Desktop)

First Next.js code written for MyNclex. Auth flow Slice 1 complete:
students can register, log in, reach a placeholder dashboard, and
sign out.

### Decisions

- **Server Actions** for register and login (not client-side Supabase
  calls). Idiomatic Next.js, atomic rollback on failure, password
  never exposed beyond the worker runtime.
- **`@supabase/ssr`** wired in with browser / server / middleware clients.
  Clients are functions, not module-scoped instances, per CLAUDE.md rule #4.
- **`getUser()` over `getSession()`** everywhere on the server. Revalidates
  against Supabase's auth server (rule #4).
- **`export const dynamic = 'force-dynamic'`** on all authenticated pages
  (/router, /dashboard, /no-access).
- **Auth rollback:** if profile or role insert fails post-signup, the
  Server Action deletes the auth.users row via service role key.
  Prevents orphan rows blocking re-registration.
- **No email confirmation** — Supabase setting stays off (matches
  Licensure). Flip on before go-live.
- **No-roles → /no-access dead-end.** Safer than auto-assigning a role;
  surfaces bugs rather than masking them.
- **Landing page** swapped from email-capture form to Sign in / Create
  account buttons. Everything else preserved.
- **Single /dashboard placeholder** catches all roles in Slice 1;
  role-specific dashboards come in Slice 2.

### Files created

- `mynclex/lib/supabase/client.ts` — browser client.
- `mynclex/lib/supabase/server.ts` — server client (reads cookies).
- `mynclex/middleware.ts` — session refresh + route guards.
- `mynclex/app/register/page.tsx` — register form.
- `mynclex/app/register/actions.ts` — signup Server Action with rollback.
- `mynclex/app/register/auth.css` — shared auth-page styles.
- `mynclex/app/login/page.tsx` — login form.
- `mynclex/app/login/actions.ts` — login Server Action.
- `mynclex/app/router/page.tsx` — post-login traffic controller.
- `mynclex/app/dashboard/page.tsx` — placeholder dashboard.
- `mynclex/app/dashboard/dashboard.css` — dashboard styles.
- `mynclex/app/no-access/page.tsx` — no-roles dead-end.
- `mynclex/app/logout/route.ts` — POST-only sign-out handler.

### Files modified

- `mynclex/app/page.tsx` — landing swap.
- `mynclex/app/landing.css` — added `.cta` button styles.
- `mynclex/package.json` — added `@supabase/ssr`.
- `mynclex/CLAUDE.md` — added Environment variables section.

### Manual steps Sam will perform after Claude Desktop finishes

- Create `mynclex/.env.local` with `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Add redirect URLs in Supabase dashboard:
  - `http://localhost:3000/**`
  - `https://qacademy-dev-mynclex.mybackpacc.workers.dev/**`
- Register a test account, then run SUPER_ADMIN seed SQL (Claude Web
  will provide).

### Known followups / deferred

- SUPER_ADMIN seed for Sam's account — manual SQL after first signup.
- Email confirmation — flip on in Supabase before real users.
- Password reset flow (`/forgot-password`, `/reset-password`) — Slice 3.
- Role-specific dashboards — Slice 2.
- Role-picker UI for multi-role users — Slice 2.
- `nclex_sessions` table for concurrent session control — Slice 3.
- `nclex_auth_events` audit log — Slice 3.
- Wrangler env vars for prod deployment — not yet set.
- Google OAuth — deferred.
- `must_change_password` enforcement flow — deferred.

### Next session

Sam will test the flow end-to-end on dev. Once confirmed working,
next session picks up Slice 2 (role-specific dashboards) or jumps
to another priority at Sam's discretion.

---

## Session — 2026-04-21 (First build — auth schema, Claude Web + Desktop)

First code written for MyNclex. Auth + roles schema laid down and
applied to the dev Supabase project.

### Decisions

- `nclex_users.id` = `auth.users.id` (UUID PK, standard Supabase pattern).
  Greenfield choice — Licensure/MyTeacher use a separate TEXT user_id +
  auth_id UUID for historical reasons; MyNclex skips that layer.
- Roles stored as rows in `nclex_user_roles` (one row per user-role pair),
  not as an array column. First QAcademy product with real multi-role
  design requirement (Sam = SUPER_ADMIN + TUTOR).
- Permissions stored as rows in `nclex_admin_permissions`. No CHECK
  constraint on permission values yet — deferred until real admin tasks
  surface (per `main.md`).
- Profile creation happens client-side on signup (matches MyTeacher
  pattern). No `auth.users` trigger — avoids cross-product contamination.
- No anon SELECT policy on `nclex_users` — deliberate departure from
  MyTeacher's email-enumeration trade-off.
- Dropped `destination_country` / `destination_region` from the users
  table; will land with Journey Tracker build.

### Columns kept from Licensure/MyTeacher pattern

`forename`, `surname`, `name`, `phone_number`, `avatar_url`,
`must_change_password`, `signup_source`, `last_login_utc`.

### Columns deliberately NOT copied

`username` (unused), `program_id` / `cohort` / `level` (NMC-specific),
`role` as a column (replaced by the separate `nclex_user_roles` table),
`user_id TEXT + auth_id UUID` split (greenfield uses UUID PK directly).

### Files created

- `mynclex/db/schema.sql` — 3 tables, 1 index.
- `mynclex/db/rls.sql` — 3 helper functions, 3 × ENABLE RLS, 10 policies.
- `mynclex/db/README.md` — short entry-point doc.

### Migrations applied

- `mynclex_initial_auth_schema` — tables + index.
- `mynclex_initial_auth_rls` — helpers + RLS policies.

### Helper functions

- `nclex_user_id()` → `auth.uid()`.
- `nclex_user_has_role(role)` → bool.
- `nclex_user_has_permission(perm)` → bool (SUPER_ADMIN passes implicitly).

### Deferred to future sessions

- `nclex_sessions` (concurrent session control) — auth build.
- `nclex_reset_requests` — forgot-password flow.
- `nclex_auth_events` — audit log.
- `nclex_tutor_applications` — "Become a Tutor" public form.
- `nclex_tutor_profiles` — tutor-specific extra fields.
- Manual SUPER_ADMIN seed for Sam's account (runs after register flow exists).

### Next session (continues today)

Sam is driving from Claude web. After this report, he will decide what
to tackle next — likely either the auth flow (register / login /
router / guard) or the basic dashboard placeholders.

---

## Session — 2026-04-20 (Product planning — Claude Web, second long session)

Marathon session. **All 9 MyNclex planning topics now settled.**
Today's work closed the three topics outstanding after the
2026-04-19 session — the bank, curriculum authoring UX, content
sourcing, and the entire student enrolment flow (self-study +
tutored).

### Topics settled today

- **Curriculum Authoring UX** — 14 decisions locked. Programme →
  Week → Module → Activity hierarchy. Six activity block types in
  v1. Weeks view + Calendar view. Up/down arrow reorder. Dual
  publish status (week and module can be Live / Draft
  independently). In-place inline activity picker. Mockups
  produced. See `product-plan/curriculum-authoring-ux.md`.

- **The Bank** — 9 sections covering the full question schema.
  Seven-table structure across QAcademy-owned and tutor-private
  sets. JSONB `content` / `correct` columns. 9 question types in
  v1 (MCQ, TF, SATA, Select N, Matrix, Highlight, Cloze, Drag-drop,
  Bow-tie; Trend deferred). NCSBN-exact scoring via 5 modular
  functions. Case studies with 6 chart tabs and progressive
  unfolding via `visible_from`. Readiness packs as curated
  assessments. 10 filterable classification axes. Per-option
  feedback lives in the `correct` JSONB. See
  `product-plan/bank.md`.

- **Content Sourcing** — reframed as an editorial/business problem,
  out of scope for product build. Bank to be seeded with synthetic
  sample questions for dev/testing. Real editorial work runs off-
  platform led by Sam as a nurse, with vetted nurse educators.
  Two small system decisions taken:
  - No in-platform review workflow — single `is_published`
    boolean.
  - "Report this question" ships in v1 (minimum version). New
    table `nclex_question_reports`.
  Documented in `product-plan/main.md` Content Sourcing section.

- **Self-Study Enrolment** — pay-first model inherited from
  Licensure. Four bank packs (Trial, 30d, 90d, 180d) plus separate
  standalone readiness packs. Dual currency (GHS default, USD
  toggle) via single-row / two-column model on `nclex_products`.
  Currency passed as parameter to a MyNclex-specific payment
  worker. Post-payment: welcome email immediately, cold-start
  dashboard with clear CTAs, "My Payments" page for transaction
  history. Edge cases inherit Licensure behaviour. Documented in
  `product-plan/payments-and-enrolment.md`.

- **Tutored Enrolment** — public programmes list page. Per-
  programme price visibility is a tutor choice via
  `show_price_publicly`. Contact-first flow routes through
  QAcademy as pass-through enquiry (new `nclex_programme_enquiries`
  table). Bundled single-checkout transaction (programme fee +
  subsidised bank), internal split, manual payouts for v1. Auto-
  enrolment on successful payment. No waiting room. Edge cases:
  full/closed programmes visible but not purchasable; soft-stopped
  tutors' programmes hidden; cancellations admin-handled. No
  waitlist in v1. Multiple concurrent enrolments allowed.
  Documented in `product-plan/payments-and-enrolment.md`.

### Revision to earlier decision

- **Programme Structure (2026-04-19) — revised.** Cohort/rolling
  mode distinction removed. Time-gated weekly progress no longer a
  platform behaviour. Content visibility now controlled per-
  activity via Live/Draft status. Rationale: tutors want
  flexibility, not mode-picking. Original decision preserved in
  this session log for audit.

### Schema additions queued for build

- `nclex_products` — full shape locked.
- `nclex_question_reports` — student-reported questions.
- `nclex_programme_enquiries` — contact-first enquiries.
- `nclex_enrolments` — student ↔ programme link.
- `is_published` boolean added to `nclex_bank_items` and
  `nclex_tutor_questions`.
- MyNclex-specific worker: `qacademy-mynclex-payment-worker`
  (dev and prod).

### Planning status — end of day

**9 of 9 topics settled.** Planning phase closed.

### Next session

- Move from planning to build. Suggested order: (1) database
  schema sprint (`nclex_*` tables + RLS), (2) auth setup for
  MyNclex-specific `nclex_users`, (3) public landing page + bank
  products catalogue, (4) self-study pay-first flow (subscribe
  page + payment worker + confirmation page), (5) admin authoring
  flows, (6) tutored flows. Prioritisation to be confirmed in
  next session.

---

## Session — 2026-04-20 (Planning continued — Claude Web + Claude Code)

Three topics settled in one day, with visual reference artefacts for
two of them. Still no code — planning docs only.

### The Bank (Question Bank) — SETTLED

Parallel ownership model (QAcademy-owned + tutor-private, identical
shapes). Seven core tables. All 9 question types ship in v1 (MCQ,
TF, SATA, Select N, Matrix, Highlight, Cloze, Drag-drop, Bow-tie;
Trend deferred to v2). Polymorphic JSONB `content` + `correct`
columns. Per-option feedback in `correct`. Case studies with 6
JSONB chart tabs and `visible_from` unfolding. Readiness packs as a
QAcademy-only product with reserved questions. Five scoring
functions cover all 9 types, NCSBN-exact. 10 classification axes,
all filterable.

Full spec in `product-plan/bank.md`. NGN visual primer saved at
`product-plan/mockups/ngn-primer.html`.

### Curriculum Authoring UX — SETTLED

Unblocked by the bank settlement the same day. Structure hierarchy:
Programme → Week → Module → Activity. Screens: My Programmes
landing, single-screen New Programme form (7 fields), Weeks
Overview with Weeks-view + Calendar-view toggle, Week Builder with
module cards and activity rows, inline 3×2 add-activity picker, six
activity editors (Text, PDF, External link, Live session, Mock,
Practice quiz). Reorder via up/down arrows (drag-and-drop deferred
to v2). Dual publish status (module + week both carry Live/Draft
pills).

Full spec in `product-plan/curriculum-authoring-ux.md`; mockups at
`product-plan/mockups/curriculum-authoring-ux.html`.

### Repo reshuffle

`mynclex/docs/product-plan.md` rebuilt into a `product-plan/`
folder: `main.md` (overview + index), `bank.md`, and
`curriculum-authoring-ux.md` as siblings. Visual HTML references
live in `product-plan/mockups/`. Future topic docs (payments,
registration, etc) slot in as siblings.

### Also settled this session — Content sourcing

Late addition to the planning day. Content sourcing reframed as an
**editorial/business problem, out of scope for product build**. The
bank will be seeded with synthetic sample questions for development
and testing; real content comes later via off-platform editorial
work with vetted nurse educators, led by Sam as a nurse himself.

Two small system decisions taken:
- **No in-platform review workflow.** Single `is_published` boolean
  on questions; reviewing happens off-platform.
- **"Report this question" ships in v1** (minimum version). New
  table `nclex_question_reports`; simple "Dismiss" / "Mark for fix"
  admin queue.

Schema consequences: `is_published` column added to
`nclex_bank_items` and `nclex_tutor_questions`;
`nclex_question_reports` table added.

Documented in `product-plan/main.md` (new "Content Sourcing"
section). `bank.md` cross-references this section.

### MyNclex planning status — end of day

- **8 of 9 topics settled.** Only **Student enrolment flow** remains
  open.

### Next session

- Settle **Student enrolment flow** (signup → programme enrolment →
  bundled bank purchase → Journey Tracker handoff).
- Once that lands, planning is complete and build can begin.

---

## Session — 2026-04-19 (Product planning — Claude Web)

Long planning session to flesh out `docs/product-plan.md` from
skeleton to a usable spec. No code written. Five of the nine planned
topics settled in one sitting.

### Topics settled

- **Roles** — STUDENT, TUTOR, ADMIN, SUPER_ADMIN. Users can hold
  multiple roles. No platform-level "programmes" category — NCLEX-RN
  is the only exam. Permission list for ADMIN deferred until real
  admin tasks surface.
- **Journey Tracker** — 7 phases (destination & plan → credential
  evaluation → English proficiency → state board app → exam prep →
  ATT & exam booking → licensure). Phase 7 (migration) deferred to
  v2. Tutor programmes plug into Phase 4.
- **Programme Structure** — week-based, tutor-defined weekly template
  with a default shape, 6 block types in v1, both cohort and rolling
  modes, time-gated progress, mixed auto/tick completion, tutor-
  authored questions private to tutor, co-tutors have identical
  powers.
- **Tutor Onboarding** — Shape 1 vetted marketplace, no public self-
  signup. Public "Become a Tutor" application form storing to
  `nclex_tutor_applications` with status. Vetting off-platform.
  Account creation via admin-triggered setup-link email. Soft-stop
  deactivation. Admin-only deletion.
- **Pricing** — Dual currency (GHS + USD, manual dual pricing, no IP
  detection). Bank as duration packs (30/90/180 days). Readiness
  packs as separate product. Tutor SaaS subscription model (Camp 2),
  flat monthly fee, no payment splits. Tutored students get bundled
  bank access at 50% subsidy, paid to QAcademy directly. Provisional
  numbers anchored (validate before launch).

### Topics still open (from the original nine)

- **The bank** — content structure, question types in v1,
  organisation (topics, difficulty, NCLEX test plan categories)
- **Curriculum authoring UX** — how tutors physically build a week
- **Student enrolment flow** — discovery → payment → start
- **What a tutorial session looks like** on the platform
- **Content sourcing** — where do the initial NCLEX questions come from

### Repo hygiene

- This file created — MyNclex now has its own product-local
  SESSIONS.md, matching MyNMCLicensure and MyTeacher.
- The root `SESSIONS.md` is being retained as a repo-wide milestone
  log only; detailed product work moves to product-local session
  logs.

### Next session

- Pick up one of the five remaining topics. Recommended next: **The
  bank** (content structure + sourcing), as everything else
  (authoring UX, enrolment flow, session UX) depends on the bank
  being understood first.
- Still no code. Design + plan phase continues.
