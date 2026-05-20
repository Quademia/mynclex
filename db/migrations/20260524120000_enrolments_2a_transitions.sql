-- =========================================================
-- MyNclex — Enrolments, Slice 2a: lifecycle transition RPCs
-- File: mynclex/db/migrations/20260524120000_enrolments_2a_transitions.sql
-- =========================================================
-- Slice 1 created nclex_enrolments lifecycle-ready (all 6 statuses on
-- the CHECK) but only ever wrote ENROLLED rows. This slice makes the
-- state machine real: five SECURITY DEFINER RPCs are the ONLY way to
-- move a row between statuses, and the direct tutor UPDATE policy is
-- dropped so a tutor's browser token can no longer set status by raw
-- write — every transition is validated in one auditable place.
--
-- Transitions (mirror of payments-and-enrolment.md lifecycle diagram):
--   approve : PENDING_APPROVAL -> ENROLLED
--   reject  : PENDING_APPROVAL -> REJECTED   (terminal)
--   pause   : ENROLLED         -> PAUSED     (reason TUTOR_MANUAL)
--   unpause : PAUSED           -> ENROLLED
--   cancel  : ENROLLED|PAUSED  -> CANCELLED  (terminal)
--
-- EXPIRED is NOT set here — it is the nightly pg_cron sweep's job, and
-- that lands with the access-window slice (programmes have no
-- access_window_days column yet, so there is nothing to expire).
--
-- Every RPC validates ownership the same way: the caller must own the
-- enrolment's parent programme (nclex_programmes.tutor_id = auth.uid())
-- OR be SUPER_ADMIN. Illegal source-status transitions raise, so a
-- stale client can't, e.g., pause a cancelled row.


-- =========================================================
-- nclex_approve_enrolment : PENDING_APPROVAL -> ENROLLED
-- =========================================================
CREATE OR REPLACE FUNCTION nclex_approve_enrolment(p_enrolment_id UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor  UUID := auth.uid();
  v_owner  UUID;
  v_status TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT e.status, p.tutor_id
  INTO v_status, v_owner
  FROM nclex_enrolments e
  JOIN nclex_programmes p ON p.programme_id = e.programme_id
  WHERE e.enrolment_id = p_enrolment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrolment not found: %', p_enrolment_id;
  END IF;

  IF v_owner <> v_actor AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your enrolment';
  END IF;

  IF v_status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'enrolment is %, cannot approve', v_status;
  END IF;

  UPDATE nclex_enrolments
  SET status              = 'ENROLLED',
      approved_at         = NOW(),
      approved_by_user_id = v_actor,
      updated_at          = NOW()
  WHERE enrolment_id = p_enrolment_id;
END;
$$;


-- =========================================================
-- nclex_reject_enrolment : PENDING_APPROVAL -> REJECTED (terminal)
-- =========================================================
CREATE OR REPLACE FUNCTION nclex_reject_enrolment(p_enrolment_id UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor  UUID := auth.uid();
  v_owner  UUID;
  v_status TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT e.status, p.tutor_id
  INTO v_status, v_owner
  FROM nclex_enrolments e
  JOIN nclex_programmes p ON p.programme_id = e.programme_id
  WHERE e.enrolment_id = p_enrolment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrolment not found: %', p_enrolment_id;
  END IF;

  IF v_owner <> v_actor AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your enrolment';
  END IF;

  IF v_status <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'enrolment is %, cannot reject', v_status;
  END IF;

  UPDATE nclex_enrolments
  SET status      = 'REJECTED',
      terminal_at = NOW(),
      tutor_note  = p_note,
      updated_at  = NOW()
  WHERE enrolment_id = p_enrolment_id;
END;
$$;


-- =========================================================
-- nclex_pause_enrolment : ENROLLED -> PAUSED (TUTOR_MANUAL)
-- =========================================================
CREATE OR REPLACE FUNCTION nclex_pause_enrolment(p_enrolment_id UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor  UUID := auth.uid();
  v_owner  UUID;
  v_status TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT e.status, p.tutor_id
  INTO v_status, v_owner
  FROM nclex_enrolments e
  JOIN nclex_programmes p ON p.programme_id = e.programme_id
  WHERE e.enrolment_id = p_enrolment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrolment not found: %', p_enrolment_id;
  END IF;

  IF v_owner <> v_actor AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your enrolment';
  END IF;

  IF v_status <> 'ENROLLED' THEN
    RAISE EXCEPTION 'enrolment is %, cannot pause', v_status;
  END IF;

  UPDATE nclex_enrolments
  SET status        = 'PAUSED',
      paused_at     = NOW(),
      paused_reason = 'TUTOR_MANUAL',
      updated_at    = NOW()
  WHERE enrolment_id = p_enrolment_id;
END;
$$;


-- =========================================================
-- nclex_unpause_enrolment : PAUSED -> ENROLLED
-- =========================================================
CREATE OR REPLACE FUNCTION nclex_unpause_enrolment(p_enrolment_id UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor  UUID := auth.uid();
  v_owner  UUID;
  v_status TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT e.status, p.tutor_id
  INTO v_status, v_owner
  FROM nclex_enrolments e
  JOIN nclex_programmes p ON p.programme_id = e.programme_id
  WHERE e.enrolment_id = p_enrolment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrolment not found: %', p_enrolment_id;
  END IF;

  IF v_owner <> v_actor AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your enrolment';
  END IF;

  IF v_status <> 'PAUSED' THEN
    RAISE EXCEPTION 'enrolment is %, cannot resume', v_status;
  END IF;

  UPDATE nclex_enrolments
  SET status        = 'ENROLLED',
      paused_at     = NULL,
      paused_reason = NULL,
      updated_at    = NOW()
  WHERE enrolment_id = p_enrolment_id;
END;
$$;


-- =========================================================
-- nclex_cancel_enrolment : ENROLLED|PAUSED -> CANCELLED (terminal)
-- =========================================================
CREATE OR REPLACE FUNCTION nclex_cancel_enrolment(p_enrolment_id UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor  UUID := auth.uid();
  v_owner  UUID;
  v_status TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT e.status, p.tutor_id
  INTO v_status, v_owner
  FROM nclex_enrolments e
  JOIN nclex_programmes p ON p.programme_id = e.programme_id
  WHERE e.enrolment_id = p_enrolment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrolment not found: %', p_enrolment_id;
  END IF;

  IF v_owner <> v_actor AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your enrolment';
  END IF;

  IF v_status NOT IN ('ENROLLED', 'PAUSED') THEN
    RAISE EXCEPTION 'enrolment is %, cannot cancel', v_status;
  END IF;

  UPDATE nclex_enrolments
  SET status      = 'CANCELLED',
      terminal_at = NOW(),
      tutor_note  = p_note,
      updated_at  = NOW()
  WHERE enrolment_id = p_enrolment_id;
END;
$$;


-- =========================================================
-- Tighten RLS: transitions are RPC-only from here.
-- =========================================================
-- The Slice 1a tutor UPDATE policy let a tutor's authed client write
-- any column (including status) directly. With the RPCs above owning
-- every legal transition, that raw path is now dropped — the only way
-- a tutor changes status is through a validated function. (The RPCs
-- are SECURITY DEFINER so they update regardless of this policy; the
-- service-role add path and SUPER_ADMIN policy are untouched.)
DROP POLICY IF EXISTS nclex_enrolments_tutor_update ON nclex_enrolments;


-- =========================================================
-- Grants — authenticated only; PUBLIC + anon explicitly revoked.
-- =========================================================
REVOKE EXECUTE ON FUNCTION nclex_approve_enrolment(UUID)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION nclex_reject_enrolment(UUID, TEXT)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION nclex_pause_enrolment(UUID)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION nclex_unpause_enrolment(UUID)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION nclex_cancel_enrolment(UUID, TEXT)  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION nclex_approve_enrolment(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION nclex_reject_enrolment(UUID, TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION nclex_pause_enrolment(UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION nclex_unpause_enrolment(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION nclex_cancel_enrolment(UUID, TEXT)   TO authenticated;
