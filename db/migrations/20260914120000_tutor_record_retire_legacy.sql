-- mynclex/db/migrations/20260914120000_tutor_record_retire_legacy.sql
--
-- Tutor onboarding — retires the LEGACY source introduced one migration
-- ago (20260913120000). Plan: docs/product-plan/tutor-onboarding.md §11.
--
-- ⭐ WHY THIS EXISTS: THE PREVIOUS MIGRATION ASSERTED SOMETHING FALSE.
-- It backfilled the pre-existing tutors as source 'LEGACY' with NULL
-- approved_at/approved_by, and its comment said "NULL is the honest
-- answer to 'who approved them, and when': nobody knows."
--
-- Nobody had looked at the table next door. nclex_user_roles records
-- granted_at (NOT NULL) for every role it holds, and granted_by for some
-- — so the date each of these people actually became a tutor was sitting
-- one join away the whole time. The UI was rendering "Unknown · predates
-- the record" over data we had.
--
-- ⭐ AND REMOVING THE VALUE DISAMBIGUATES A COLUMN, which is the better
-- reason. With LEGACY rows present, a NULL approved_at meant either "this
-- applicant has not been approved yet" or "this tutor predates the
-- record" — two unrelated things reading identically. Afterwards it means
-- exactly one: not yet approved. That is worth more than the branch it
-- deletes, because a column that means one thing needs no branch at all.
--
-- ⚠ ONE VALUE IS INFERRED, AND ONLY ON DEV. approved_by falls back to the
-- sole SUPER_ADMIN where nclex_user_roles recorded no granter. That is an
-- inference — well-founded, because only a SUPER_ADMIN can write a role
-- row (nclex_roles_admin_write) and there has only ever been one — but an
-- inference, and it is written down here rather than left to be
-- discovered. On PROD it never fires: prod's single tutor row carries a
-- real granted_by. On dev it fires for four seeded test accounts.
-- If no single SUPER_ADMIN can be identified, approved_by stays NULL
-- rather than guessing.
--
-- ⓘ approved_at REMAINS NULLABLE, and that is not leftover slack: a
-- PENDING or REJECTED applicant has no approval date by definition.


-- ── 1. backfill from the role grant that already recorded it ─────────

WITH sole_super AS (
  -- Exactly one, or nothing. `LIMIT 1` on an ambiguous set would pick an
  -- arbitrary person and record them as an approver, which is precisely
  -- the class of fabrication this migration exists to undo — so the
  -- count is a condition, not an ordering. (Written as a scalar subquery
  -- rather than HAVING COUNT(*) = 1, which would need user_id
  -- aggregated, and min(uuid) is not portable.)
  SELECT user_id
    FROM nclex_user_roles
   WHERE role = 'SUPER_ADMIN'
     AND (SELECT COUNT(*) FROM nclex_user_roles WHERE role = 'SUPER_ADMIN') = 1
),
grant_facts AS (
  SELECT r.user_id, r.granted_at, r.granted_by
    FROM nclex_user_roles r
   WHERE r.role = 'TUTOR'
)
UPDATE nclex_tutors t
   SET approved_at = COALESCE(t.approved_at, g.granted_at),
       approved_by = COALESCE(
                       t.approved_by,
                       g.granted_by,
                       (SELECT user_id FROM sole_super)
                     ),
       source      = 'ADMIN_PROMOTION',
       updated_at  = NOW()
  FROM grant_facts g
 WHERE g.user_id = t.user_id
   AND t.source  = 'LEGACY';


-- ── 2. retire the value ──────────────────────────────────────────────
-- Nothing can be LEGACY after section 1, and no doorway will ever write
-- it again: the four real sources all record who acted. Dropping it from
-- the CHECK is what stops it coming back by accident.

ALTER TABLE nclex_tutors
  DROP CONSTRAINT IF EXISTS nclex_tutors_source_check;

ALTER TABLE nclex_tutors
  ADD CONSTRAINT nclex_tutors_source_check
  CHECK (source IN ('SELF_APPLICATION','ADMIN_PROMOTION',
                    'ADMIN_INVITE','REGISTRATION'));


-- ── 3. prove it ──────────────────────────────────────────────────────
-- A migration that silently half-applies is worse than one that fails.
-- Every tutor row must now carry an approval date; any that does not
-- means nclex_user_roles had no TUTOR grant for it, which would be a
-- contradiction worth stopping on.

DO $$
DECLARE
  undated INT;
BEGIN
  SELECT COUNT(*) INTO undated
    FROM nclex_tutors
   WHERE status = 'APPROVED'
     AND approved_at IS NULL;

  IF undated > 0 THEN
    RAISE EXCEPTION
      'tutor_record_retire_legacy: % approved tutor row(s) still have no approved_at — expected every one to be datable from nclex_user_roles.granted_at',
      undated;
  END IF;
END $$;
