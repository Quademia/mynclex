-- =========================================================
-- MyNclex — Enrolments, Slice 1a: nclex_enrolments foundation
-- File: mynclex/db/migrations/20260522120000_enrolments_1_foundation.sql
-- =========================================================
-- The first real occurrence of nclex_enrolments. Source of truth:
--   docs/product-plan/payments-and-enrolment.md
--   (Enrolment row lifecycle + Tutored/Self-paced enrolment sections)
-- and the adopted Claude Design schema proposal (2026-05-19).
--
-- One row = "this student is in this programme (and, for tutor-led,
-- this cohort)", carrying the 6-status lifecycle, the enrolment
-- source, audit of who created/approved it, and the frozen
-- access-window expiry.
--
-- Built LIFECYCLE-READY on purpose: Slice 1 (off-platform tutor-add)
-- only ever writes ENROLLED / TUTOR_ADDED rows, but all 6 statuses
-- and the audit columns are present now so later slices (on-platform
-- checkout, installments, expiry sweep) don't each need an ALTER.
--
-- Deliberately OMITTED until their owning slice lands:
--   • strategy_id   — FK to nclex_programme_payment_strategies, which
--                     doesn't exist until the installments slice.
--   • the nightly pg_cron EXPIRED/PAUSED sweep — Slice 2.
--   • RPC-gated transitions — Slice 2; v1 here allows direct
--     tutor/admin writes under RLS, matching the established pattern
--     (e.g. nclex_question_marks).
--
-- access_expires_at is NULL ("lifetime of tutor's subscription",
-- Pattern A) for every Slice-1 row — programmes have no
-- access_window_days column yet (that's the discovery/programme-delta
-- slice). When that lands, the create path computes the expiry and
-- freezes it onto the row so a later policy change can't shrink an
-- existing student's window.


-- =========================================================
-- 1. nclex_enrolments
-- =========================================================

CREATE TABLE nclex_enrolments (
  enrolment_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The enrolled student. CASCADE: deleting the user removes their
  -- enrolment rows along with the rest of their data.
  user_id              UUID NOT NULL
                       REFERENCES nclex_users(id) ON DELETE CASCADE,

  -- The programme. RESTRICT: enrolments are audit/financial records;
  -- a programme with live enrolments is archived (status ARCHIVED),
  -- never hard-deleted out from under them.
  programme_id         UUID NOT NULL
                       REFERENCES nclex_programmes(programme_id) ON DELETE RESTRICT,

  -- The cohort, for tutor-led programmes. NULL for self-paced
  -- (enrolment then references the programme directly). RESTRICT for
  -- the same audit reason as programme_id.
  cohort_id            UUID
                       REFERENCES nclex_cohorts(cohort_id) ON DELETE RESTRICT,

  -- Lifecycle. See payments-and-enrolment.md "Enrolment row
  -- lifecycle". Transitions are enforced in server actions (Slice 1)
  -- and tightened to RPCs in Slice 2 — not DB triggers.
  status               TEXT NOT NULL
                       CHECK (status IN (
                         'PENDING_APPROVAL','ENROLLED','PAUSED',
                         'REJECTED','CANCELLED','EXPIRED'
                       )),

  enrolment_source     TEXT NOT NULL
                       CHECK (enrolment_source IN (
                         'SELF_PAID','TUTOR_ADDED','ADMIN_GRANT'
                       )),

  -- Who created the row. NULL for SELF_PAID (the student paid);
  -- the acting tutor for TUTOR_ADDED, the acting admin for
  -- ADMIN_GRANT. Audit only. SET NULL so removing the actor's
  -- account doesn't erase the student's enrolment.
  enrolled_by_user_id  UUID
                       REFERENCES nclex_users(id) ON DELETE SET NULL,

  -- Anchors the access-window clock.
  enrolled_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- PENDING_APPROVAL -> ENROLLED transition (on-platform tutored
  -- only). NULL for paths that skip pending (off-platform / self-
  -- paced / admin-grant).
  approved_at          TIMESTAMPTZ,
  approved_by_user_id  UUID
                       REFERENCES nclex_users(id) ON DELETE SET NULL,

  -- Frozen at enrolment time from programmes.access_window_days.
  -- NULL = lifetime-of-tutor-sub (Pattern A). The nightly sweep
  -- reads this.
  access_expires_at    TIMESTAMPTZ,

  -- PAUSED bookkeeping.
  paused_at            TIMESTAMPTZ,
  paused_reason        TEXT
                       CHECK (paused_reason IS NULL OR paused_reason IN (
                         'INSTALLMENT_OVERDUE','TUTOR_MANUAL'
                       )),

  -- When REJECTED / CANCELLED / EXPIRED was set.
  terminal_at          TIMESTAMPTZ,

  -- Optional tutor reason on reject/cancel; shown to admin during
  -- manual refund handling.
  tutor_note           TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- The acting party is recorded for non-self-serve sources and
  -- absent for self-serve ones.
  CONSTRAINT nclex_enrolments_actor_consistent CHECK (
    (enrolment_source = 'SELF_PAID' AND enrolled_by_user_id IS NULL)
    OR (enrolment_source <> 'SELF_PAID' AND enrolled_by_user_id IS NOT NULL)
  )
);


-- =========================================================
-- 2. Indexes
-- =========================================================

-- At most ONE active enrolment per (student, cohort). Terminal rows
-- (REJECTED / CANCELLED / EXPIRED) are excluded, so a student whose
-- access lapsed can be enrolled again (the "allow re-enrolment"
-- decision, 2026-05-20). Tutor-led path.
CREATE UNIQUE INDEX idx_nclex_enrolments_active_cohort
  ON nclex_enrolments (user_id, cohort_id)
  WHERE cohort_id IS NOT NULL
    AND status IN ('PENDING_APPROVAL','ENROLLED','PAUSED');

-- Same rule for self-paced (no cohort): one active enrolment per
-- (student, programme).
CREATE UNIQUE INDEX idx_nclex_enrolments_active_selfpaced
  ON nclex_enrolments (user_id, programme_id)
  WHERE cohort_id IS NULL
    AND status IN ('PENDING_APPROVAL','ENROLLED','PAUSED');

-- Tutor cohort-workspace roster query.
CREATE INDEX idx_nclex_enrolments_cohort_status
  ON nclex_enrolments (cohort_id, status);

-- Student dashboard + per-user entitlement reads.
CREATE INDEX idx_nclex_enrolments_user_status
  ON nclex_enrolments (user_id, status);

-- Feeds the nightly EXPIRED sweep (Slice 2).
CREATE INDEX idx_nclex_enrolments_expiry
  ON nclex_enrolments (access_expires_at)
  WHERE status IN ('ENROLLED','PAUSED');


-- =========================================================
-- 3. RLS
-- =========================================================
-- Read: the enrolled student (own rows), the owning tutor (walks the
-- parent programme's tutor_id), SUPER_ADMIN.
-- Write: owning tutor (insert + status flips on their programmes) and
-- SUPER_ADMIN. The off-platform tutor-add server action additionally
-- uses the service role (to invite + write the invited student's
-- profile), which bypasses RLS by design; it validates tutor
-- ownership in TS before writing.
-- No tutor DELETE — terminal state is CANCELLED, not row removal.
--
-- NOTE: the permissive "PUBLISHED-parent" student-select policies on
-- nclex_cohorts / nclex_programme_* are intentionally NOT tightened
-- here. Tightening to enrolment-aware happens in a later step, once
-- real enrolment data exists, to avoid locking out current test
-- students mid-build.

ALTER TABLE nclex_enrolments ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_enrolments_student_select
  ON nclex_enrolments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY nclex_enrolments_tutor_select
  ON nclex_enrolments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_enrolments.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_enrolments_tutor_insert
  ON nclex_enrolments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_enrolments.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_enrolments_tutor_update
  ON nclex_enrolments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_enrolments.programme_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_enrolments.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_enrolments_admin_all
  ON nclex_enrolments FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));
