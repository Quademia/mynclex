-- mynclex/db/migrations/20260707120000_universal_programme_contact.sql
--
-- Universal "Contact the tutor": every PUBLISHED programme (active tutor)
-- now accepts a contact message — not only the off-platform / price-hidden
-- ones the old canEnquire branch allowed. The public detail page gains a
-- universal contact section (any visitor can ask a question whether they can
-- pay or not), so the RPC's eligibility gate is loosened to "published +
-- active tutor".
--
-- Also fixes the duplicate-check, which still referenced the pre-8b
-- 'FORWARDED' status (renamed to 'CONTACTED' in 20260614120000) and so failed
-- to dedupe against already-contacted leads.

CREATE OR REPLACE FUNCTION public.nclex_submit_enquiry(
  p_programme_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_preferred_contact text[],
  p_message text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  -- Eligibility: any published programme with an active tutor accepts a
  -- contact message (previously gated to OFF_PLATFORM or price-hidden only).
  PERFORM 1
  FROM nclex_programmes p
  JOIN nclex_users u ON u.id = p.tutor_id
  WHERE p.programme_id = p_programme_id
    AND p.status = 'PUBLISHED'
    AND u.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'programme is not accepting enquiries';
  END IF;

  -- Idempotent on (programme, email) while a lead is still OPEN. NEW /
  -- CONTACTED are the open set; CONVERTED / CLOSED are terminal, so a fresh
  -- message after those is a genuinely new enquiry.
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
