# MyNclex Database

Product-local database assets. Isolated from MyNMCLicensure and MyTeacher.
All tables prefixed `nclex_`. All helper functions prefixed `nclex_`.

## Files

- `schema.sql` — single source of truth for every CREATE TABLE + index + FK.
- `rls.sql` — RLS helper functions and policies.
- `migrations/` — numbered migration files as the schema evolves (created when needed).

There is no `rpcs.sql` today — the original case-save and trend-save RPCs
were retired in favour of direct CRUD in server actions, and the file was
removed in `20260506130000_drop_dead_case_trend_rpcs.sql`. When the project
adds business-transaction RPCs again, recreate `rpcs.sql` as the
source-of-truth file and reinstate it in the bootstrap and convention
lists below.

## Bootstrap order

Run against a fresh Supabase database:
1. `schema.sql`
2. `rls.sql`
3. Apply every file in `migrations/` in timestamp order.

## Conventions

- Every table prefixed `nclex_`.
- Every helper function prefixed `nclex_`.
- `nclex_users.id` = `auth.users.id` (UUID, Supabase pattern).
- Role checks use `nclex_user_has_role('ROLE_NAME')` in RLS.
- Permission checks use `nclex_user_has_permission('PERM_NAME')` in RLS.
- Every schema change: write a migration file AND back-port to the right
  source-of-truth file — tables/indexes/FKs to `schema.sql`, RLS helpers
  and policies to `rls.sql`. New RPCs land in numbered migrations until a
  fresh `rpcs.sql` is reinstated.
