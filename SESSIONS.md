# MyNclex Sessions Log

Running log of MyNclex work sessions. Each entry: what was done + what's
queued for next session. Newest on top. Product-local — isolated from
other QAcademy products, per the extraction rule in CLAUDE.md.

---

## Session — 2026-04-21 (Bank Slice 1.2 — MCQ/TF/SATA/Select N authoring)

First real curator workflow on top of Slice 1's read-only listing.
Create + edit + delete for the four "Family A" question types:
MCQ, TF, SATA, SELECT_N. These four share ~80% of the authoring UI
(option list + per-option correct toggle + per-option feedback)
and only differ in the correct-answer control — radio for MCQ/TF,
checkbox for SATA/SELECT_N, plus a count field for SELECT_N.

### Decisions (from discussion with Sam)

- **Bundle CRUD into one slice, not split.** Original lean was
  create-only first, edit/delete as a separate 1.3. Sam pushed back:
  edit reuses ~90% of the create form, and splitting was artificial.
  Single slice for all three ops.
- **Family A only this slice.** Of the 9 v1 question types, four
  share an option-list shape (MCQ/TF/SATA/SELECT_N). The other five
  (Matrix, Highlight, Cloze, Drag-drop, Bow-tie) each need a bespoke
  editor — each lands as its own slice (1.3 → 1.7).
- **Keep every field; nothing dropped.** Sam was firm on this even
  for fields not yet wired (`rationale_img`, `marks`, `is_free_sample`,
  `is_builder_visible`, `shuffle_options`, `question_ref`, `batch_id`,
  `nursing_subject`). Form ships with all of them; image upload
  accepts a pasted URL for now (direct upload deferred until
  Supabase Storage is wired in a later slice).
- **Architecture: beta-b pattern, not MyTeacher.** Server component
  page does data + auth gate; thin `'use client'` form component
  handles option-list state + type-driven control swap; plain
  `<form>` submission to Server Actions. Same shape as auth Slices
  1–2 (`actions.ts` next to `page.tsx`). Reviewed both
  `myteacher/teacher/bank.html` (closest in field set, distant in
  stack) and `qacademy-beta-b/src/app/(exams)/question-bank/`
  (native Next.js + Server Actions); beta-b pattern translated 1:1.
- **Split-panel layout (list left, sticky form right).** Sam's call
  over the originally-proposed "list above, form below" — a long
  list would push the form off-screen. Stacks to one column below
  900px so mobile still works.
- **URL-driven edit mode (`?edit={item_id}`).** No separate
  `/new` or `/edit/:id` route. Click a row → URL gains `?edit=ID`
  → form pre-fills. Click "+ New" → URL clears → blank form.
  Bookmarkable, deep-linkable.
- **Auto sequential item IDs per type.** `NCLEX_MCQ_00009`,
  `NCLEX_TF_00001`, `NCLEX_SATA_00001`, `NCLEX_SELN_00001`.
  Computed in the create action via `MAX(item_id) LIKE prefix + 1`,
  fixed-width zero-padded. Type readable at a glance in the
  listing and in error logs. Matches the existing seed.
- **Question type locked on edit.** Changing type would invalidate
  both the JSONB shape (`content` / `correct`) and the ID prefix.
  Enforced server-side; the dropdown is `disabled` in edit mode.
- **Hard delete, not archive.** No FK references to bank items in
  v1 (case-study and readiness-pack join tables aren't populated),
  so nothing cascades. Revisit if/when they are.
- **Server Actions re-check auth + BANK_CURATE/SUPER_ADMIN
  independently.** Page-level gate is UX polish; the action-level
  gate is the real security boundary — defends against tampered
  hidden inputs and direct action invocation.
- **Classifications hardcoded.** `lib/bank/classifications.ts` —
  TS constants for question types, NCLEX client-needs categories
  + subcategories, nursing subjects, body systems, difficulty,
  Bloom's, option letters, ID prefixes. Promotable to a DB lookup
  table later if non-engineers need to edit values without a
  deploy. Topic / subtopic stay free-text inputs (open-ended in
  real authoring).
- **JSONB shapes typed in `lib/bank/types.ts`.** Discriminated
  union on `question_type` so future types (Family B) just add
  their branch — editor, future renderer, and scoring functions
  all narrow the same way.

### Files created

- `mynclex/lib/bank/classifications.ts` — hardcoded enums.
- `mynclex/lib/bank/types.ts` — TS shapes for `content` /
  `correct` JSONB (Family A only; Family B added per-slice).
- `mynclex/lib/bank/form-shape.ts` — `BankFormInitial` interface
  + `emptyInitial()` factory. Lives outside the form component
  for the RSC-boundary reason described under "Bug fixed mid-
  session" below.
- `mynclex/app/(app)/admin/bank/actions.ts` — three Server Actions
  (`createBankItemAction`, `updateBankItemAction`,
  `deleteBankItemAction`). Each gates auth + permission, parses
  + validates the form payload into `content` / `correct` JSONB,
  performs the DB write, then `revalidatePath` + `redirect`.
  Auto item-ID computation via `nextItemId()`.
- `mynclex/app/(app)/admin/bank/form.tsx` — `'use client'`
  component. Manages: type selector, variable-length option list
  (A–F, min 2, max 6, default 4 / locked 2 for TF), per-row
  correct toggle (radio or checkbox), SELECT_N count field, all
  classification + housekeeping fields. Submits via Server Action.

### Files modified

- `mynclex/app/(app)/admin/bank/page.tsx` — split-panel layout;
  reads `?edit={id}` searchParam; loads single row in full when
  editing and maps JSONB back into the form's initial-values
  shape; preserves the existing auth gate + listing query.
- `mynclex/app/dashboards.css` — added `bank-split`, `bank-list`,
  `bank-form`, option-row, checkbox group, and button styles.
  Sticky right pane on desktop; stacks below 900px.

### Bug fixed mid-session

After the first push, `/admin/bank` 500'd on the dev Worker:

> Attempted to call emptyInitial() from the server but emptyInitial
> is on the client.

`emptyInitial()` was originally exported from `form.tsx` (which
carries `'use client'`) and called by the server component page.
Next.js blocks any server→client *function call* across the RSC
boundary; only components and props can cross. Type-only imports
work, but runtime helpers don't. Fixed by extracting
`BankFormInitial` + `emptyInitial()` into the new neutral
`lib/bank/form-shape.ts` module (no directive). Both sides import
from there — no boundary crossed. Filed as commit 862a26b.

### Verified locally + on dev Worker

- `tsc --noEmit` clean (mynclex root).
- `eslint app/(app)/admin/bank lib/bank` clean.
- Dev server boots without compile errors locally; the only
  runtime errors in this worktree are the pre-existing missing-
  `.env.local` crash in middleware (no Supabase creds in the
  worktree).
- Sam confirmed `/admin/bank` loads on the dev Worker after the
  fix push (commit 862a26b). Workers Builds auto-deploy picked
  up both pushes within minutes.

### Not yet verified (Sam's session)

- Full create-edit-delete flow end-to-end as both
  `+mynclexsuperadmin` and `+mynclexadmin` (BANK_CURATE granted).
- Type-switching in create mode — TF locking True/False;
  SATA / SELECT_N swapping correct controls; SELECT_N count field
  enforcing exactly N.
- Plain TUTOR / STUDENT direct hit on `/admin/bank` → bounce
  to `/admin`.

### Deferred to future sessions

- **Family B authoring** — each in its own slice (Matrix,
  Highlight, Cloze, Drag-drop, Bow-tie). Each adds a new editor
  branch, a new JSONB shape in `lib/bank/types.ts`, and a new
  scoring function later.
- **Direct image upload** — `rationale_img` accepts a pasted URL
  today. Real Supabase Storage upload + bucket policies land in a
  separate slice that can also wire option-image support.
- **Filter chips + pagination on the listing** — fine at 8 rows
  + a 500-row limit; revisit when the list gets long.
- **Student-view preview** — meaningful only once the student
  quiz runner exists. Reuse the runner in author-preview mode
  rather than building it twice.
- **Tutor-private bank** (`nclex_tutor_questions` and friends) —
  duplicate the same authoring UI with a `tutor_id` filter once
  tutor-side workflows arrive.
- **Soft archive** — current delete is hard. Consider archiving
  if/when bank items are referenced by case studies or readiness
  packs (deferred FK pressure).
- **Toast / status-line feedback polish** — today's feedback is a
  single in-form flash ("Saved ✓") plus inline error banner. A
  page-level toast can wait until other admin sections need one.

### Commits

- `11adceb` — `mynclex: MCQ/TF/SATA/Select N authoring UI — Bank Slice 1.2`
- `862a26b` — `mynclex: fix /admin/bank crash — move shared form shape out of client file`

### Next session

Likely options: (a) Family B authoring — pick one type to do
first (Matrix is the most-bounded; Bow-tie is the highest-
profile NGN signature), (b) RLS on the remaining 6 bank tables,
(c) student-side practice runner so the Bank starts producing
value end-to-end, (d) Supabase Storage wiring so rationale +
option images can be uploaded from the form.

---

## Session — 2026-04-21 (Bank Slice 1 — schema + RLS + seed + admin view)

First build work on The Bank. Scope deliberately narrow: QAcademy-owned
tables only, no tutor-private authoring yet; RLS only on
`nclex_bank_items`; a read-only `/admin/bank` listing page to confirm
RLS and data are wired up end-to-end. No authoring UI, no student
runner yet.

### Decisions (from discussion with Sam)

- **Narrow slice instead of "schema for everything."** All 7 bank
  tables landed in one migration (mechanical copy from `bank.md`), but
  RLS + UI start with `nclex_bank_items` only. Tutor-private tables,
  case studies, and readiness packs are structurally present but RLS-
  disabled; policies come per-table in later slices.
- **Question type scope — MCQ only for Slice 1.** TF is effectively MCQ
  with 2 options; it lands alongside SATA later (SATA forces a second
  scoring function anyway — that's when TF earns its keep).
- **Seed strategy — synthetic placeholders, clearly tagged.** 8 rows
  with `batch_id = 'DEV_SEED_001'` for clean removal. Seed file header
  explicitly flags this as NOT real NCLEX content; real editorial work
  is off-platform per the Content Sourcing decision.
- **QAcademy-owned tables first; tutor-private later.** Tutor tables
  are mechanical duplication once the shape works (same columns plus a
  `tutor_id` FK). Building QAcademy-owned first keeps RLS simpler and
  aligns with the higher-value path (the bank students pay for).
- **Judgment call — added `is_published` to both case-study tables** even
  though `bank.md` only lists it on the two item tables. A case study
  needs a draft/live gate too; without it, cases can't be held back
  mid-authoring. Can drop if Sam wants spec-exact.
- **Judgment call — CHECK constraints on enumerated values**
  (`question_type`, `difficulty`, `cjmm_step`, readiness-pack `status`,
  join-table `position`). Prevents author typos; trivial to ALTER if
  new values arise later.
- **RLS shape for `nclex_bank_items`:**
  - Any authenticated user can SELECT where `is_published = TRUE`.
  - `BANK_CURATE` holders (SUPER_ADMIN bypasses via the helper's
    short-circuit) get full access — read drafts + INSERT/UPDATE/DELETE.
  - Entitlement gating (paid bank access for self-study students) is
    deliberately NOT in RLS. Belongs to the app layer once payments ship.
- **`/admin/bank` follows the hide-what-you-can't-access pattern.**
  Section card only appears on `/admin` for users with `BANK_CURATE` (or
  SUPER_ADMIN). The page itself also gates server-side, so direct URL
  navigation without the permission bounces to `/admin`.
- **Read-only for now.** Authoring (create/edit/delete), question
  detail view, filter chips, and pagination are all deferred.

### Files created

- `mynclex/db/seed-bank-dev.sql` — 8 synthetic MCQ rows.
- `mynclex/app/(app)/admin/bank/page.tsx` — read-only listing.

### Files modified

- `mynclex/db/schema.sql` — 7 bank tables appended.
- `mynclex/db/rls.sql` — RLS block for `nclex_bank_items`.
- `mynclex/app/(app)/admin/page.tsx` — now fetches
  `nclex_admin_permissions`; renders a section-card grid when at least
  one card is visible. First card: Question Bank → `/admin/bank`.
- `mynclex/app/dashboards.css` — `.dash-card--wide` variant,
  `.section-grid` / `.section-card` styles, focused `.bank-table` /
  `.bank-badge` block.

### Migrations applied to dev (`zrakjibtxyzoqcdtvpmq`)

- `mynclex_bank_tables` — the 7 tables.
- `mynclex_bank_items_rls` — RLS enable + 2 policies.
- `mynclex_bank_dev_seed` — 8 INSERT rows.

### Verified locally

- `npx tsc --noEmit` clean.
- `npx eslint` clean on the admin tree.
- Dev server boots without compile errors.
- Unauthenticated `GET /admin/bank` → redirect to `/login` (auth gate
  intact).

### Not yet verified (requires Sam's session)

- Visual rendering for `+mynclexsuperadmin` — should see all 8 rows.
- Section-card hiding for `+mynclexadmin` (no BANK_CURATE granted).
- Redirect for TUTOR/STUDENT attempting to visit `/admin/bank`.

### Deferred to future sessions

- RLS on the other 6 bank tables (per-table as features land).
- Authoring UI for MCQ (create + edit).
- Question detail view.
- Filter chips + pagination on the admin listing.
- SATA + TF (next question-type wave; adds a second scoring function).
- Tutor-private bank view + authoring.
- `BANK_CURATE` CHECK constraint on `nclex_admin_permissions` (still no
  CHECK per main.md's deferral policy).
- `nclex_question_reports` table (separate, from Content Sourcing).

### Manual step Sam may run (optional)

To exercise the non-SUPER_ADMIN curator path on dev:

```sql
INSERT INTO nclex_admin_permissions (user_id, permission)
SELECT id, 'BANK_CURATE' FROM nclex_users
WHERE email = 'mybackpacc+mynclexadmin@gmail.com'
ON CONFLICT DO NOTHING;
```

Or leave it ungranted to test the hide-the-card path for plain ADMIN.

### Next session

Likely options: (a) MCQ authoring UI (create/edit), (b) RLS on the
remaining 6 bank tables, (c) student-side practice runner. Sam's pick.

---

## Session — 2026-04-21 (App shell — Slice 2.5)

Shared app chrome introduced. Each authenticated workspace page
(`/student`, `/tutor`, `/admin`) now renders inside one shell
layout: sticky topbar, footer, and cleaner page bodies.

### Decisions (from discussion with Sam)

- **Single-tier topbar, not topbar+sidebar.** Same pattern MyTeacher
  uses: sticky topbar with logo on the left, middle nav links, user
  controls on the right. Different roles will see different nav
  links when feature pages land. Mobile: hamburger → drawer (scaffold
  only today — nothing to put in it yet).
- **Sidebars are per-feature, opt-in later.** The Bank or Programmes
  may grow sub-navigation sidebars (nested `layout.tsx` under their
  route). Not built today, no plumbing needed now.
- **Topbar mostly empty in the middle today.** No feature pages
  exist yet to link to. As Bank / Programmes / Profile / admin
  sub-routes arrive, links get added here and vary per role.
- **Role switcher moved from inline (bottom of each dashboard) to
  topbar** — now a chip showing the current role that opens a
  dropdown of other roles held. Only rendered for multi-role users.
- **User menu: initials circle** on the far right. Click opens a
  dropdown with name, email, and Sign out (form POST to `/logout`).
  Sign-out button removed from each dashboard body.
- **Route group `(app)`** wraps only the workspace pages. Auth pages
  (`/login`, `/register`), transitions (`/pick-role`, `/router`),
  and dead-ends (`/no-access`) deliberately skip the shell.

### URL impact

None. Route group parens in the folder name don't appear in URLs.
`/student` is still `/student` from the user's perspective.

### Files created

- `mynclex/app/(app)/layout.tsx` — shared shell layout. Fetches
  user, profile, roles, and active-role cookie; passes to topbar.
  Redirects to `/login` if no user.
- `mynclex/app/shell.css` — topbar, dropdown, footer styles.
- `mynclex/components/topbar.tsx` — Server Component, renders the
  topbar skeleton and delegates interactive bits to children.
- `mynclex/components/role-chip.tsx` — Client Component (dropdown
  toggle). Replaces the old bottom-of-page role switcher.
- `mynclex/components/user-menu.tsx` — Client Component (dropdown
  toggle) with sign-out.
- `mynclex/components/footer.tsx` — static footer.

### Files moved

- `mynclex/app/student/` → `mynclex/app/(app)/student/`
- `mynclex/app/tutor/`   → `mynclex/app/(app)/tutor/`
- `mynclex/app/admin/`   → `mynclex/app/(app)/admin/`

### Files modified

- Each role page (`student`, `tutor`, `admin`): stripped the inline
  role badge, inline role switcher, and inline sign-out form. CSS
  imports dropped from page files — layout imports them now. Each
  page keeps its own server-side role check.
- `mynclex/app/dashboards.css`: removed dead `.role-switcher*` and
  `.dash-role-badge` / `.dash-signout-wrap` classes now that the
  topbar owns those concerns.
- `mynclex/app/pick-role/actions.ts`: comment updated to reference
  the topbar role-chip instead of the retired role-switcher.

### Files deleted

- `mynclex/components/role-switcher.tsx` — replaced by the topbar
  role-chip.

### Deferred to future sessions

- **Feature nav links in the topbar** — added per-role as Bank,
  Programmes, Profile, admin sub-sections land.
- **Mobile drawer contents** — scaffolding only today; fills in
  when nav links exist.
- **Active-link highlighting** in the topbar — wire up once there
  are links to highlight.
- **Per-feature sidebars** (e.g. `/bank/*` might get one) — decide
  when the feature is built.
- **Profile link** in user menu — points at `/profile` once that
  page exists.

---

## Session — 2026-04-21 (Auth flow — Slice 2 — role-specific dashboards)

Slice 2 built end-to-end with Claude Desktop (no Claude Web prompt).
Role-specific dashboards now live with per-role server-side guards,
multi-role pick-role page, and an in-dashboard role switcher.

### Decisions (from discussion with Sam)

- **URL shape — Pattern 2 (feature URLs, role-only for authoring areas).**
  Dashboards are role-prefixed (`/student`, `/tutor`, `/admin`) but the
  shared feature pages that arrive later (e.g. `/bank`, `/profile`,
  `/programmes`) will be top-level and render role-adaptive content.
  Tutor/admin authoring pages will still live under `/tutor/*` and
  `/admin/*`. Avoids URL duplication for things that are conceptually
  shared.
- **Multi-role UX — picker + switcher.** First-time multi-role users hit
  `/pick-role`. Subsequent visits honour an `nclex_active_role` cookie.
  A role switcher lives inside every dashboard for cross-over (Sam =
  SUPER_ADMIN + TUTOR).
- **ADMIN and SUPER_ADMIN share `/admin` — single route, section-menu
  model (refined 2026-04-21 same-day).** `/admin` is a menu of admin
  sections (sub-routes like `/admin/payments`, `/admin/bank`, etc.).
  SUPER_ADMIN is NOT "ADMIN with a special extras card" — it's a role
  that bypasses the permission engine entirely via
  `nclex_user_has_permission()`'s SUPER_ADMIN short-circuit. ADMIN is
  a trust gate; real capability is governed per-user by rows in
  `nclex_admin_permissions`.
  - **Hide pattern (A1):** ADMIN only sees section cards for permissions
    they hold. SUPER_ADMIN sees every card. Server-side permission gate
    on every sub-route; UI hide is cosmetic, the gate is the real
    security. No separate `/super-admin` route.
  - **SUPER_ADMIN-only sections** (role assignment, config) are
    implemented as permissions that simply never get granted to plain
    admins — no hard-coded super-admin checks in page code.
  - **Empty state:** an ADMIN with zero permissions lands on `/admin`
    with a "No admin sections granted yet — contact your super admin"
    message.
- **Placeholder dashboard content (Decision 3A).** Student and tutor
  dashboards show welcome + "Coming next:" card. `/admin` shows the
  section-menu placeholder described above. Real UI lands as features
  arrive.
- **`nclex_active_role` cookie** — HttpOnly, SameSite=Lax, path=/,
  30-day max-age. Read only by server code; never touched by browser JS.
  Per-request validation: the cookie's value must match a role the user
  still holds, otherwise they get bounced to `/pick-role`.

### Files created

- `mynclex/app/dashboards.css` — shared shell styles for all role
  dashboards, `/no-access`, `/pick-role`, plus `.role-switcher*` and
  `.pick-role-*` rules. Replaces the old `dashboard/dashboard.css`.
- `mynclex/components/role-switcher.tsx` — Server Component. Small
  "Switch to" block shown only when the user holds >1 role. Each
  button is its own `<form>` posting to `switchRoleAction`.
- `mynclex/app/pick-role/page.tsx` — the picker screen for multi-role
  users. Single-role visitors are bounced back to `/router`.
- `mynclex/app/pick-role/actions.ts` — Server Action used by both
  `/pick-role` and the role switcher. Validates that the user actually
  holds the requested role before setting the cookie.
- `mynclex/app/student/page.tsx` — student dashboard.
- `mynclex/app/tutor/page.tsx` — tutor dashboard.
- `mynclex/app/admin/page.tsx` — admin section menu (ADMIN + SUPER_ADMIN).
  Badge + view driven by `nclex_active_role` cookie, not role holdings.

### Files modified

- `mynclex/app/router/page.tsx` — new dispatch logic: 0 roles →
  `/no-access`; 1 role → that dashboard; ≥2 roles → cookie or
  `/pick-role`.
- `mynclex/app/no-access/page.tsx` — import path updated to
  `../dashboards.css`.
- `mynclex/middleware.ts` — `AUTH_REQUIRED_PREFIXES` updated. `/dashboard`
  removed (route deleted); `/pick-role`, `/student`, `/tutor`, `/admin`
  added.

### Files deleted

- `mynclex/app/dashboard/page.tsx`
- `mynclex/app/dashboard/dashboard.css`
- `mynclex/app/dashboard/` folder

### Security posture (Pattern 2 / server-first)

- Every role page fetches the user's roles server-side and `redirect`s
  to `/no-access` if the required role isn't present — guard runs
  before any HTML is rendered.
- The `switchRoleAction` re-checks `nclex_user_roles` before trusting
  whatever role came in from the form — the cookie is never set for a
  role the user doesn't currently hold.
- No business logic in the browser. Forms post straight to Server
  Actions. Cookies are `httpOnly` so browser JS can't read or forge
  them.

### Deferred to future sessions

- **Feature pages** (bank, programmes, profile, classes, curriculum,
  user management) — not in Slice 2's scope.
- **Per-permission gates on admin sub-routes** via
  `nclex_user_has_permission()` — added as each real admin section
  lands (e.g. `/admin/payments` checks `PAYMENTS_REVIEW`).
- **Draft permission list** (not yet a CHECK constraint):
  `PAYMENTS_REVIEW`, `BANK_CURATE`, `TUTOR_VET`, `REPORTS_REVIEW`,
  `USERS_MANAGE`, `CONFIG_EDIT`. Expand as features land. Some
  (`USERS_MANAGE`, `CONFIG_EDIT`) stay SUPER_ADMIN-only by policy.
- **"View as student" / impersonation** for admins — future.
- **Role revocation UI** — admins still edit roles via SQL for now.
- **Cookie writeback on direct URL access.** If a user navigates to
  `/tutor` directly while their cookie says `SUPER_ADMIN`, the cookie
  is not updated. Works fine, just a tiny drift. Revisit if it causes
  confusion.

### Manual step Sam will perform

- After testing, grant SUPER_ADMIN + TUTOR to his account via SQL so
  the multi-role flow can be exercised:
  ```sql
  INSERT INTO nclex_user_roles (user_id, role)
  SELECT id, 'SUPER_ADMIN' FROM nclex_users WHERE email = 'mybackpacc@gmail.com';
  INSERT INTO nclex_user_roles (user_id, role)
  SELECT id, 'TUTOR' FROM nclex_users WHERE email = 'mybackpacc@gmail.com';
  ```

### Next session

Slice 3 (password reset + email confirmation), or pivot to first real
feature slice (likely the bank or programmes), at Sam's discretion.

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
