-- =========================================================
-- MyNclex — Slice 3.5: public_profile JSONB on nclex_users
-- File: mynclex/db/migrations/20260530120000_slice_3_5_public_profile_column.sql
-- =========================================================
-- Payments & enrolment follow-on, Slice 3.5. Adds ONE role-agnostic
-- JSONB bag, public_profile, to the shared nclex_users table. Holds the
-- outward-facing display fields any user may show to others (today:
-- tutor headline / speciality / years / bio + optional business
-- branding). The TS type lib/discovery/types.ts#PublicProfile is the
-- single source of truth for its shape.
--
-- Invariant encoded in the NAME: public_profile is public-display data
-- ONLY. Private/sensitive fields (DOB, contacts) never go here — they
-- get their own columns. The public projection views read only this
-- column, so a private column can never leak to anon by accident.
--
-- Storage is shape-agnostic (JSONB): adding/reshaping fields later is a
-- TS-type change with no migration. Default '{}' so every existing row
-- (and every future signup) starts with an empty, valid bag.

BEGIN;

ALTER TABLE nclex_users
  ADD COLUMN IF NOT EXISTS public_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
