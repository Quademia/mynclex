# `lib/auth/`

Central module for every access decision in the product. Pages,
Server Actions, and (eventually) middleware import gate helpers from
here instead of inlining role/permission boilerplate.

## Why centralised

Three reasons:

1. **One place that knows the rule.** Changing a redirect target,
   a fallback path, or a check pattern means changing one file —
   not hunting across 20+ pages.
2. **Hard to forget.** Inline checks rely on copy-paste discipline;
   helper calls force the gate into a single line that's easy to
   spot and impossible to miss.
3. **Defence in depth.** The TS helpers are the user-experience
   layer (clean redirects). The DB layer (RLS in `db/rls.sql`) is
   the security layer. The two mirror each other: the helper logic
   here matches the SQL helper functions in `db/rls.sql`.

## Folder structure

```
lib/auth/
├── README.md            ← this file
├── index.ts             ← public barrel
├── types.ts             ← shared types (AuthGateResult, ServerSupabaseClient)
├── internal.ts          ← shared loaders (NOT re-exported)
├── constants.ts         ← permission-key constants (PERM_*) + AdminPermission union
├── admin/               ← admin-audience gates
├── tutor/               ← tutor-audience gates
├── student/             ← student-audience gates (empty today)
└── shared/              ← cross-audience gates (e.g. bank curator)
```

## Where new helpers go

When adding a helper, put it in the audience subfolder it gates:

- Admin permission or role check → `admin/`
- Tutor role or ownership check → `tutor/`
- Student role, subscription, or enrolment check → `student/`
- Helpers that branch on audience (admin OR tutor) → `shared/`

If the gate is reused across audiences without branching, it's in
`shared/`. If it branches (like `require-bank-curator` which checks
admin perms OR tutor role depending on a surface parameter), still
`shared/` — the branching is part of the gate's identity.

## Naming convention

`require-<thing>.ts`:

- One helper per file.
- File name = function name in kebab-case.
- Function name in camelCase: `requireAdminPermission`,
  `requireBankCurator`, `requireTutor`.
- The verb is always `require` because every helper has the same
  shape: succeed silently with `AuthGateResult`, or redirect on
  failure. Side-effecting on failure is the point.

Other helpers (data fetchers used by gates, audit-log calls, etc.)
get descriptive names without the `require` prefix:
`getStudentBankAccess`, `recordPermissionDenial`, etc. They go in
their audience subfolder too.

## Public API

Every helper that pages or actions should call must be re-exported
through `index.ts`. Call sites import from `@/lib/auth`, not from
the deep paths. This lets the implementation paths move without
breaking call sites.

`internal.ts` and the audience-folder files are NOT meant for
direct import outside `lib/auth/`. ESLint can be configured to
enforce this if the convention slips.

## Loaders (internal)

Two internal loaders power the public helpers:

- **`loadAuthContext()`** — fetches roles AND admin permissions in
  parallel. Use from helpers that gate on a permission bucket
  (e.g. `requireAdminPermission`, `requireBankCurator(admin)`).
- **`loadRolesOnly()`** — fetches roles only. Use from helpers that
  gate on a role and don't need permissions data
  (`requireAnyAdmin`, `requireSuperAdmin`, `requireTutor`,
  `requireBankCurator(tutor)`). Saves one DB round-trip per request.

Both bounce unauthenticated callers to `/login` and return an
`AuthGateResult`. The lean loader pads `permissions: []` so the
return shape stays uniform — call sites never have to narrow.

## What's currently here

Today's slice (foundation + refactor of admin nav scaffold inline
boilerplate):

- `requireAdminPermission(permission)` — admin permission gate with
  SUPER_ADMIN bypass. Redirects to `/admin/dashboard` on failure.
  Permission parameter is typed as the `AdminPermission` union — bare
  strings won't compile.
- `requireSuperAdmin()` — SUPER_ADMIN role only. Redirects to
  `/admin/dashboard` on failure.
- `requireAnyAdmin()` — ADMIN or SUPER_ADMIN role. Redirects to
  `/no-access` on failure. Used by `admin/layout.tsx` and the
  dashboard page.
- `requireTutor()` — TUTOR role (SUPER_ADMIN bypasses). Redirects
  to `/no-access` on failure. Created today but not yet wired into
  `tutor/layout.tsx` — that's a deferred behaviour decision.
- `requireBankCurator(surface)` — admin or tutor surface. Different
  failure modes per surface. Replaces the deprecated
  `requireSurfaceAuth`, `requireCaseCurator`, and `requireTrendCurator`
  inline helpers (all three consolidated this slice).

## What will be added later

These helpers don't exist yet because the features they gate haven't
been built. They'll land with their respective features:

- **Tutor ownership checks:** `requireTutorOwnsProgramme`,
  `requireTutorOwnsCase`, `requireTutorOwnsTrend`,
  `requireTutorOwnsQuestion` — when the programmes table and
  resource-ownership patterns are built.
- **Student access checks:** `requireActiveBankSubscription`,
  `requireProgrammeEnrolment`, `requirePackOwnership` — when the
  subscription and enrolment tables land.
- **Composite checks:** `requireCanAttemptItem` — when the runner
  is built (combines subscription + draft state + report status).
- **Audit logging:** `recordPermissionDenial` — when audit
  requirements are formalised; not on the immediate roadmap.

When you add one of these, follow the convention: one file in the
appropriate audience subfolder, re-export through `index.ts`,
update this README's "currently here" section.

## Defence in depth — the database is the floor

The TS helpers in this module are the application-layer gate. They
exist for user experience: clean redirects, sensible fallbacks,
context-aware error states.

The **real security** lives in `db/rls.sql`. Every table has Row
Level Security policies that enforce the same logic at the
database layer. Even if a developer forgets to add a TS gate, RLS
won't let unauthorised users see data — they'll get an empty
result, not a leaked row.

The TS helpers and the SQL policies are deliberately mirrored. The
SQL helper `nclex_user_has_permission(perm)` short-circuits on
SUPER_ADMIN; so do the TS helpers. The two layers are independent
but consistent.

If you change the gate logic in a TS helper without updating the
matching RLS policy (or vice versa), you create drift between the
two layers. This is the most important convention in this folder:
**TS helpers and SQL policies must encode the same access rules.**
