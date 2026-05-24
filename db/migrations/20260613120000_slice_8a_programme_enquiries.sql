-- =========================================================
-- MyNclex — Slice 8a: programme enquiries (lead capture)
-- File: mynclex/db/migrations/20260613120000_slice_8a_programme_enquiries.sql
-- =========================================================
-- Source of truth: docs/product-plan/payments-and-enrolment.md
--   ("Contact-first flow — pass-through enquiry") and the design handoff
--   §09 (docs/product-plan/design-handoff/payments-and-enrolment/index.html).
--
-- A visitor on a programme's PUBLIC detail page can express interest in
-- a programme by leaving their details + an optional message — WITHOUT
-- an account. That lands in nclex_programme_enquiries as a NEW row. The
-- owning tutor sees it on their programme workspace (8b) and follows up
-- off-platform; if/when the student later enrols by email, the row gets
-- stamped CONVERTED with the resulting enrolment id (8c).
--
-- Programme-scoped, NOT cohort-scoped (per planning doc): the form
-- appears on programmes where there's no on-page commitment path —
-- off-platform self-paced (no cohorts to waitlist against), or
-- price-hidden programmes of any delivery mode (the tutor wants a
-- conversation before quoting). Tutor-led off-platform with visible
-- price keeps using the cohort waitlist (Slice 4); the two paths are
-- shaped differently because the lead has different content.
--
-- Contact preference (CALL / SMS / WHATSAPP / EMAIL) mirrors the
-- waitlist's pattern exactly — same allowed set, same defaults, same
-- "phone required when a phone-based channel is chosen" rule. Shared
-- TS constant (lib/discovery/contact-options.ts) so the two forms can't
-- drift. Audience is WhatsApp-heavy, so the channel signal matters.
--
-- These are pre-enrolment LEADS, not financial records: ON DELETE
-- CASCADE off the programme. A converted row keeps a SET NULL pointer
-- to the enrolment it produced, for the cheap retention metric.
--
-- Write paths (deliberately NOT raw table policies):
--   • INSERT  — only via nclex_submit_enquiry (SECURITY DEFINER, granted
--               to anon): one validated, auditable entry point. The
--               public never writes the table directly.
--   • UPDATE  — tutor status changes (mark Forwarded / Closed) run
--               server-side under the service role (8b), gating tutor
--               ownership in TS first. Same pattern as waitlist.
--   • SELECT  — owning tutor + SUPER_ADMIN (8b's queue + 8c's admin).


-- =========================================================
-- 1. nclex_programme_enquiries
-- =========================================================

CREATE TABLE nclex_programme_enquiries (
  enquiry_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The programme the visitor is asking about. CASCADE: a lead has no
  -- value once the programme is gone (not an audit record).
  programme_id         UUID NOT NULL
                       REFERENCES nclex_programmes(programme_id) ON DELETE CASCADE,

  -- Self-supplied lead details (no account yet). Single name field per
  -- the design handoff §09 — the tutor will collect proper forename /
  -- surname later during the tutor-add flow on conversion. Email stored
  -- lower-cased by the RPC; phone optional.
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL,
  phone                TEXT,

  -- How the lead wants to be contacted. Subset of the allowed set,
  -- always at least one (defaults to EMAIL). Mirrors waitlist exactly.
  preferred_contact    TEXT[] NOT NULL DEFAULT ARRAY['EMAIL']::TEXT[],

  message              TEXT,

  -- NEW       — just submitted, tutor hasn't seen it yet.
  -- FORWARDED — tutor has reached out off-platform (manual flip for v1).
  -- CONVERTED — student later enrolled with a matching email; 8c stamps
  --             this automatically + populates converted_enrolment_id.
  -- CLOSED    — tutor / admin marked the lead dead (no response, etc).
  status               TEXT NOT NULL DEFAULT 'NEW'
                       CHECK (status IN ('NEW','FORWARDED','CONVERTED','CLOSED')),

  -- Stamped when the tutor marks the lead as Forwarded (8b).
  forwarded_at         TIMESTAMPTZ,

  -- Set when CONVERTED (8c). SET NULL so cancelling/removing the
  -- resulting enrolment never deletes the historical enquiry lead.
  converted_enrolment_id UUID
                       REFERENCES nclex_enrolments(enrolment_id) ON DELETE SET NULL,

  -- Free-text notes for the tutor / admin queue.
  admin_notes          TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- preferred_contact is a non-empty subset of the allowed channels.
  CONSTRAINT nclex_enquiry_pref_contact_valid CHECK (
    array_length(preferred_contact, 1) >= 1
    AND preferred_contact <@ ARRAY['CALL','SMS','WHATSAPP','EMAIL']::TEXT[]
  ),

  -- A phone number is present whenever a phone-based channel is chosen.
  CONSTRAINT nclex_enquiry_phone_when_needed CHECK (
    NOT (preferred_contact && ARRAY['CALL','SMS','WHATSAPP']::TEXT[])
    OR (phone IS NOT NULL AND btrim(phone) <> '')
  )
);


-- =========================================================
-- 2. Indexes
-- =========================================================

-- At most ONE open lead per (programme, email) — stops a refresh /
-- double-tap from stacking duplicate enquiries. CONVERTED / CLOSED
-- rows are excluded so the same person can re-enquire later if the
-- earlier one was closed.
CREATE UNIQUE INDEX idx_nclex_programme_enquiries_open
  ON nclex_programme_enquiries (programme_id, lower(email))
  WHERE status IN ('NEW','FORWARDED');

-- Tutor + admin queue queries (leads for a programme, by status).
CREATE INDEX idx_nclex_programme_enquiries_programme_status
  ON nclex_programme_enquiries (programme_id, status);

-- 8c's auto-convert matcher (when an enrolment lands, look up live
-- enquiries by the student's email).
CREATE INDEX idx_nclex_programme_enquiries_email
  ON nclex_programme_enquiries (lower(email))
  WHERE status IN ('NEW','FORWARDED');


-- =========================================================
-- 3. RLS
-- =========================================================
-- (updated_at is set manually by server actions, matching the rest of
-- the codebase — no trigger helper exists.)

ALTER TABLE nclex_programme_enquiries ENABLE ROW LEVEL SECURITY;

-- The owning tutor reads leads for their own programmes (8b).
CREATE POLICY nclex_programme_enquiries_tutor_select
  ON nclex_programme_enquiries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_enquiries.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

-- SUPER_ADMIN full bypass (8c's admin queue + safety net).
CREATE POLICY nclex_programme_enquiries_admin_all
  ON nclex_programme_enquiries FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- 4. nclex_submit_enquiry — anon-callable, validated INSERT
-- =========================================================
-- The ONE public write path. SECURITY DEFINER so it can insert past the
-- (deliberately) policy-less table. Validates the programme is genuinely
-- enquiry-eligible (published + active tutor + off-platform OR
-- price-hidden) so a forged programme_id or a non-eligible programme
-- can't seed leads. Idempotent on (programme, email): a repeat while a
-- lead is still open returns the existing row rather than erroring —
-- the form shows the same "thanks, we'll be in touch" either way (no
-- email-enumeration signal).
CREATE OR REPLACE FUNCTION nclex_submit_enquiry(
  p_programme_id      UUID,
  p_name              TEXT,
  p_email             TEXT,
  p_phone             TEXT,
  p_preferred_contact TEXT[],
  p_message           TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name       TEXT := btrim(p_name);
  v_email      TEXT := lower(btrim(p_email));
  v_phone      TEXT := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_message    TEXT := NULLIF(btrim(COALESCE(p_message, '')), '');
  v_pref       TEXT[];
  v_eligible   BOOLEAN;
  v_existing   UUID;
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'name is required';
  END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'a valid email is required';
  END IF;

  -- Normalise preferred contact: default to EMAIL, must be a subset of
  -- the allowed channels.
  v_pref := COALESCE(NULLIF(p_preferred_contact, ARRAY[]::TEXT[]), ARRAY['EMAIL']::TEXT[]);
  IF NOT (v_pref <@ ARRAY['CALL','SMS','WHATSAPP','EMAIL']::TEXT[]) THEN
    RAISE EXCEPTION 'invalid contact preference';
  END IF;
  IF (v_pref && ARRAY['CALL','SMS','WHATSAPP']::TEXT[]) AND v_phone IS NULL THEN
    RAISE EXCEPTION 'a phone number is required for call, SMS, or WhatsApp contact';
  END IF;

  -- Programme must be enquiry-eligible: published + active tutor + has
  -- no on-page checkout path (off-platform collection OR price hidden).
  -- Matches the detail-page trigger rule (Slice 8 scope refinement
  -- 2026-05-22) — a programme that already shows an Enrol button or a
  -- waitlist row shouldn't accept enquiries.
  SELECT TRUE
  INTO v_eligible
  FROM nclex_programmes p
  JOIN nclex_users u ON u.id = p.tutor_id
  WHERE p.programme_id = p_programme_id
    AND p.status = 'PUBLISHED'
    AND u.is_active
    AND (
      p.payment_collection_mode = 'OFF_PLATFORM'
      OR p.show_price_publicly = FALSE
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'programme is not accepting enquiries';
  END IF;

  -- Idempotent: return the live open lead if one already exists.
  SELECT enquiry_id
  INTO v_existing
  FROM nclex_programme_enquiries
  WHERE programme_id = p_programme_id
    AND lower(email) = v_email
    AND status IN ('NEW','FORWARDED');

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
$$;

REVOKE EXECUTE ON FUNCTION nclex_submit_enquiry(UUID, TEXT, TEXT, TEXT, TEXT[], TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION nclex_submit_enquiry(UUID, TEXT, TEXT, TEXT, TEXT[], TEXT) TO anon, authenticated;
