-- mynclex/db/migrations/20260918120000_tutor_suspension_public_filter.sql
--
-- Tutor onboarding — slice 1d-iii: what the public can see of a
-- suspended tutor. Plan: docs/product-plan/tutor-onboarding.md §7, §11.1d.
--
-- ⚠ THE PLAN DOC SAYS "the same two views". IT IS FOUR VIEWS AND TWO
-- FUNCTIONS. Asked of the live database rather than the docs:
--   nclex_public_programmes · nclex_public_units · nclex_public_cohorts ·
--   nclex_public_payment_strategies · nclex_join_waitlist ·
--   nclex_submit_enquiry
-- Patching only the two named would produce a convincing half-failure —
-- the programme vanishes from /programmes while its units, cohorts and
-- PRICES stay publicly readable, and anyone holding a direct link can
-- still join a waitlist or send an enquiry to a tutor we have suspended.
--
-- ⭐ FAIL CLOSED: `t.status = 'APPROVED'`, not `<> 'SUSPENDED'`.
-- ⚠ THIS REVISES A DELIBERATE DECISION FROM 1a, so here is why. 20260913
-- made the tutors join LEFT on purpose, reasoning that "a programme whose
-- tutor somehow has no nclex_tutors row must still appear rather than
-- vanishing". That was right when the row meant only "a profile bag":
-- its absence was cosmetic. 1d changes what the row MEANS — it is now the
-- only thing that records whether this person is allowed to take
-- students. A missing row no longer means "no bio", it means "we have no
-- record that we approved this person", and publishing them anyway is
-- the wrong way to be wrong.
-- ⓘ Checked before choosing, not after: on dev all 11 published
-- programmes have a tutor record, and on prod no TUTOR role exists
-- without one. §4.4 ("every doorway writes a row") is what keeps that
-- true, so fail-closed costs nothing real and fails safe if it breaks.
--
-- ⓘ The predicate is inlined into each view rather than wrapped in a
-- helper function ON PURPOSE. These views run with owner rights
-- (security_invoker = false), which is how they already read the
-- locked-down nclex_users. A plain function called from the WHERE clause
-- would execute as the INVOKER — anon — hit nclex_tutors' RLS, find
-- nothing, and quietly empty the entire public catalogue.

-- ── 1. programmes ────────────────────────────────────────────────────
-- The LEFT JOIN and its COALESCE stay so the column list is untouched;
-- the WHERE is what now excludes a suspended (or unrecorded) tutor.

CREATE OR REPLACE VIEW nclex_public_programmes AS
SELECT
  p.programme_id,
  p.title,
  p.tagline,
  p.description,
  p.delivery_mode,
  p.unit_label,
  p.length_units,
  p.price_currency,
  p.show_price_publicly,
  p.payment_collection_mode,
  p.access_window_days,
  p.published_at,
  u.name           AS tutor_name,
  u.avatar_url     AS tutor_avatar_url,
  oc.next_cohort_start,
  COALESCE(oc.open_cohort_count, 0) AS open_cohort_count,
  COALESCE(t.public_profile, '{}'::jsonb) AS tutor_profile,
  COALESCE(
    (SELECT s.total_price_minor
       FROM nclex_programme_payment_strategies s
      WHERE s.programme_id = p.programme_id
        AND s.kind = 'UPFRONT_FULL'
        AND s.is_active
      LIMIT 1),
    (SELECT MIN(s.initial_price_minor)
       FROM nclex_programme_payment_strategies s
      WHERE s.programme_id = p.programme_id
        AND s.is_active),
    0
  )                AS headline_price_minor,
  EXISTS (
    SELECT 1
      FROM nclex_programme_payment_strategies s
     WHERE s.programme_id = p.programme_id
       AND s.kind = 'UPFRONT_FULL'
       AND s.is_active
  )                AS headline_is_upfront
FROM nclex_programmes p
JOIN nclex_users u ON u.id = p.tutor_id
LEFT JOIN nclex_tutors t ON t.user_id = p.tutor_id
LEFT JOIN LATERAL (
  SELECT
    MIN(c.start_date) FILTER (WHERE c.start_date >= CURRENT_DATE)
                                         AS next_cohort_start,
    COUNT(*)                             AS open_cohort_count
  FROM nclex_cohorts c
  WHERE c.programme_id = p.programme_id
    AND c.cancelled_at IS NULL
    AND c.end_date >= CURRENT_DATE
    AND (c.start_date >= CURRENT_DATE OR c.allow_late_join)
) oc ON TRUE
WHERE p.status = 'PUBLISHED'
  AND u.is_active
  AND t.status = 'APPROVED';   -- 1d

GRANT SELECT ON nclex_public_programmes TO anon, authenticated;

-- ── 2. units ─────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW nclex_public_units AS
SELECT
  pu.programme_id,
  pu.unit_index,
  pu.title,
  pu.description
FROM nclex_programme_units pu
JOIN nclex_programmes p ON p.programme_id = pu.programme_id
JOIN nclex_users u ON u.id = p.tutor_id
JOIN nclex_tutors t ON t.user_id = p.tutor_id AND t.status = 'APPROVED'  -- 1d
WHERE p.status = 'PUBLISHED' AND u.is_active AND pu.is_published;

GRANT SELECT ON nclex_public_units TO anon, authenticated;

-- ── 3. cohorts ───────────────────────────────────────────────────────

CREATE OR REPLACE VIEW nclex_public_cohorts AS
SELECT
  c.cohort_id,
  c.programme_id,
  c.name,
  c.start_date,
  c.end_date,
  c.allow_late_join
FROM nclex_cohorts c
JOIN nclex_programmes p ON p.programme_id = c.programme_id
JOIN nclex_users u ON u.id = p.tutor_id
JOIN nclex_tutors t ON t.user_id = p.tutor_id AND t.status = 'APPROVED'  -- 1d
WHERE p.status = 'PUBLISHED' AND u.is_active AND c.cancelled_at IS NULL;

GRANT SELECT ON nclex_public_cohorts TO anon, authenticated;

-- ── 4. payment strategies ────────────────────────────────────────────
-- ⚠ Filtering this view hides the PRICES; it does not block the sale.
-- See lib/payments/init.ts, which reads the base table through the
-- service role and needed its own check.

CREATE OR REPLACE VIEW nclex_public_payment_strategies AS
SELECT
  s.strategy_id,
  s.programme_id,
  s.kind,
  s.label,
  s.total_price_minor,
  s.initial_price_minor,
  s.installment_count,
  s.installment_interval_days,
  s.balance_due_days_after_enrolment,
  s.sort_order,
  s.cohort_id
FROM nclex_programme_payment_strategies s
JOIN nclex_programmes p ON p.programme_id = s.programme_id
JOIN nclex_users u ON u.id = p.tutor_id
JOIN nclex_tutors t ON t.user_id = p.tutor_id AND t.status = 'APPROVED'  -- 1d
WHERE s.is_active AND p.status = 'PUBLISHED' AND u.is_active;

GRANT SELECT ON nclex_public_payment_strategies TO anon, authenticated;

-- ── 5. the two public write paths ────────────────────────────────────
-- Both are SECURITY DEFINER, so they read nclex_tutors without trouble.
-- Each already has an eligibility check that ends in "not open"; the
-- tutor's standing joins that same check rather than becoming a second,
-- differently-worded refusal. A stranger must not be able to tell a
-- suspended tutor from a closed cohort.

CREATE OR REPLACE FUNCTION nclex_join_waitlist(
  p_cohort_id UUID,
  p_forename TEXT,
  p_surname TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_preferred_contact TEXT[],
  p_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_forename TEXT := btrim(p_forename);
  v_surname  TEXT := btrim(p_surname);
  v_email    TEXT := lower(btrim(p_email));
  v_phone    TEXT := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_message  TEXT := NULLIF(btrim(COALESCE(p_message, '')), '');
  v_pref     TEXT[];
  v_programme UUID;
  v_existing  UUID;
BEGIN
  IF v_forename = '' OR v_surname = '' THEN
    RAISE EXCEPTION 'first name and surname are required';
  END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'a valid email is required';
  END IF;
  v_pref := COALESCE(NULLIF(p_preferred_contact, ARRAY[]::TEXT[]), ARRAY['EMAIL']::TEXT[]);
  IF NOT (v_pref <@ ARRAY['CALL','SMS','WHATSAPP','EMAIL']::TEXT[]) THEN
    RAISE EXCEPTION 'invalid contact preference';
  END IF;
  IF (v_pref && ARRAY['CALL','SMS','WHATSAPP']::TEXT[]) AND v_phone IS NULL THEN
    RAISE EXCEPTION 'a phone number is required for call, SMS, or WhatsApp contact';
  END IF;

  SELECT c.programme_id INTO v_programme
  FROM nclex_cohorts c
  JOIN nclex_programmes p ON p.programme_id = c.programme_id
  JOIN nclex_users u ON u.id = p.tutor_id
  JOIN nclex_tutors t ON t.user_id = p.tutor_id AND t.status = 'APPROVED'  -- 1d
  WHERE c.cohort_id = p_cohort_id
    AND p.status = 'PUBLISHED' AND u.is_active
    AND c.cancelled_at IS NULL AND c.end_date >= CURRENT_DATE
    AND (c.start_date >= CURRENT_DATE OR c.allow_late_join);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cohort is not open for waitlist join';
  END IF;

  SELECT waitlist_id INTO v_existing
  FROM nclex_cohort_waitlist
  WHERE cohort_id = p_cohort_id AND lower(email) = v_email AND status = 'PENDING';
  IF FOUND THEN RETURN v_existing; END IF;

  INSERT INTO nclex_cohort_waitlist
    (cohort_id, programme_id, forename, surname, email, phone, preferred_contact, message)
  VALUES (p_cohort_id, v_programme, v_forename, v_surname, v_email, v_phone, v_pref, v_message)
  RETURNING waitlist_id INTO v_existing;
  RETURN v_existing;
END;
$function$;

CREATE OR REPLACE FUNCTION nclex_submit_enquiry(
  p_programme_id UUID,
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_preferred_contact TEXT[],
  p_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_name       TEXT := btrim(p_name);
  v_email      TEXT := lower(btrim(p_email));
  v_phone      TEXT := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_message    TEXT := NULLIF(btrim(COALESCE(p_message, '')), '');
  v_pref       TEXT[];
  v_existing   UUID;
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'name is required';
  END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'a valid email is required';
  END IF;

  v_pref := COALESCE(NULLIF(p_preferred_contact, ARRAY[]::TEXT[]), ARRAY['EMAIL']::TEXT[]);
  IF NOT (v_pref <@ ARRAY['CALL','SMS','WHATSAPP','EMAIL']::TEXT[]) THEN
    RAISE EXCEPTION 'invalid contact preference';
  END IF;
  IF (v_pref && ARRAY['CALL','SMS','WHATSAPP']::TEXT[]) AND v_phone IS NULL THEN
    RAISE EXCEPTION 'a phone number is required for call, SMS, or WhatsApp contact';
  END IF;

  PERFORM 1
  FROM nclex_programmes p
  JOIN nclex_users u ON u.id = p.tutor_id
  JOIN nclex_tutors t ON t.user_id = p.tutor_id AND t.status = 'APPROVED'  -- 1d
  WHERE p.programme_id = p_programme_id
    AND p.status = 'PUBLISHED'
    AND u.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'programme is not accepting enquiries';
  END IF;

  SELECT enquiry_id
  INTO v_existing
  FROM nclex_programme_enquiries
  WHERE programme_id = p_programme_id
    AND lower(email) = v_email
    AND status IN ('NEW','CONTACTED');

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  INSERT INTO nclex_programme_enquiries
    (programme_id, name, email, phone, preferred_contact, message)
  VALUES
    (p_programme_id, v_name, v_email, v_phone, v_pref, v_message)
  RETURNING enquiry_id INTO v_existing;

  RETURN v_existing;
END;
$function$;
