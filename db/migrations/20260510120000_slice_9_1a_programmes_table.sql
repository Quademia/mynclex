-- =========================================================
-- MyNclex — Slice 9.1a: nclex_programmes table
-- File: mynclex/db/migrations/20260510120000_slice_9_1a_programmes_table.sql
-- =========================================================
-- The first table on the Programme side. Tutor-owned programmes plug
-- into Phase 4 of the Journey Tracker (see main.md). One row per
-- programme; co-tutors deferred (single-tutor model in v1, join table
-- to follow when needed).
--
-- Source of truth for shape + semantics:
--   docs/product-plan/main.md (Programme Structure, Pricing,
--                              Enrolment paths)
--   docs/product-plan/curriculum-authoring-ux.md (New Programme modal
--                                                  field list)
--   docs/product-plan/payments-and-enrolment.md (price columns +
--                                                 enrolment_source)
--   SESSIONS 2026-05-10 — Phase A planning conversation.
--
-- Decisions locked for this slice (planning conversation 2026-05-10):
--   • Cohort/Rolling mode dropped (main.md revision 2026-04-20).
--     Visibility is now per-activity via Live/Draft, not platform-
--     enforced.
--   • Late-enrolment toggle dropped — replaced by the tutor-add-
--     anytime path (see payments-and-enrolment.md → Tutor-added
--     enrolment).
--   • End_date stored as a real column, not derived. Auto-fills from
--     start + length × 7 in the form, but the tutor can edit it to
--     extend bank access beyond the curriculum (a buffer for revision).
--   • Cohort size optional; blank = no cap. Per-tutor QAcademy quota
--     deferred.
--   • Dual GHS + USD prices required, in minor units. 0 = free.
--   • show_price_publicly toggle drives the public CTA: TRUE → "Pay
--     & enrol", FALSE → "Contact" (per payments-and-enrolment.md).
--   • Status: DRAFT (default) → PUBLISHED → ARCHIVED (tutor) /
--     CANCELLED (admin). Set by post-create actions, not the form.
--   • UUID PK with gen_random_uuid() default. Slugs deferred until
--     public discovery is built.
--   • Schema is provisional — programme work is in early scoping;
--     expect revisions during build.
--
-- RLS scope for this slice:
--   • self_select   — tutor reads own programmes (any status)
--   • self_insert   — tutor creates DRAFT programmes (slice 9.1b)
--   • admin_all     — SUPER_ADMIN bypass
--   UPDATE / DELETE / public-select policies are deferred to the
--   slices that actually need them (edit, discard/archive, public
--   discovery).
--
-- Additive-only — new table, no changes to existing tables.


-- =========================================================
-- 1. nclex_programmes
-- =========================================================
CREATE TABLE nclex_programmes (
  programme_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id              UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,

  -- Identity
  title                 TEXT NOT NULL,
  tagline               TEXT,
  description           TEXT,

  -- Shape
  length_weeks          SMALLINT NOT NULL
                        CHECK (length_weeks BETWEEN 1 AND 52),
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  cohort_size           INTEGER
                        CHECK (cohort_size IS NULL OR cohort_size > 0),

  -- Pricing (minor units; 0 = free)
  price_minor_ghs       INTEGER NOT NULL DEFAULT 0
                        CHECK (price_minor_ghs >= 0),
  price_minor_usd       INTEGER NOT NULL DEFAULT 0
                        CHECK (price_minor_usd >= 0),
  show_price_publicly   BOOLEAN NOT NULL DEFAULT TRUE,

  -- Lifecycle
  status                TEXT NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED','CANCELLED')),
  published_at          TIMESTAMPTZ,
  archived_at           TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,

  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT nclex_programmes_dates_ok CHECK (end_date >= start_date)
);

-- Tutor's own programmes — drives the My Programmes list query.
CREATE INDEX idx_nclex_programmes_tutor
  ON nclex_programmes(tutor_id);

-- Public discovery list (filter by PUBLISHED). Partial index keeps it
-- small; covers the future public discovery page without an extra
-- migration when that slice lands.
CREATE INDEX idx_nclex_programmes_public
  ON nclex_programmes(status)
  WHERE status = 'PUBLISHED';


-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE nclex_programmes ENABLE ROW LEVEL SECURITY;


-- Tutor sees their own programmes (any status)
CREATE POLICY nclex_programmes_self_select ON nclex_programmes FOR SELECT
  TO authenticated
  USING (tutor_id = auth.uid());

-- Tutor inserts own programmes (slice 9.1b create flow)
CREATE POLICY nclex_programmes_self_insert ON nclex_programmes FOR INSERT
  TO authenticated
  WITH CHECK (tutor_id = auth.uid());

-- SUPER_ADMIN bypass
CREATE POLICY nclex_programmes_admin_all ON nclex_programmes FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));
