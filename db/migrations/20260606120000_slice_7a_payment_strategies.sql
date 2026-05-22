-- =========================================================
-- MyNclex — Payments Slice 7a: payment strategies foundation
-- File: mynclex/db/migrations/20260606120000_slice_7a_payment_strategies.sql
-- =========================================================
-- Source of truth: docs/product-plan/payments-and-enrolment.md
--   (Payment strategies → Settled 2026-05-22) + design-handoff
--   index.html §05. DB-only slice — no tutor UI, no checkout wiring
--   (those are 7b / 7c).
--
-- What this adds:
--   1. nclex_programme_payment_strategies — one row per payment plan a
--      tutor offers on a programme. UPFRONT_FULL is a real row (not
--      implicit): auto-created here by backfill, manageable in 7b,
--      deactivatable. The table becomes the single source of truth for
--      programme amounts. Currency is NOT stored — a strategy inherits
--      its programme's price_currency.
--   2. nclex_enrolments.strategy_id        — which plan the student chose
--      (NULL until 7c writes it; upfront enrolments may stay NULL).
--      nclex_enrolments.strategy_snapshot_json — frozen copy of the
--      chosen plan at checkout, so a later tutor edit can't rewrite an
--      existing student's schedule (settled decision 2026-05-22).
--   3. The real FK on nclex_payments.strategy_id (shipped as a bare
--      nullable UUID in Slice 5.1; no non-NULL values exist yet, so
--      adding the constraint is safe).
--
-- Phasing 2 (see BUILD_LIST Slice 7): nclex_programmes.price_minor is
-- LEFT IN PLACE this slice. The backfill mirrors it into an UPFRONT_FULL
-- strategy row per programme, but price_minor stays the display + charge
-- source until the dedicated 7e cutover retires it. So nothing visible
-- changes here.


-- =========================================================
-- 1. nclex_programme_payment_strategies
-- =========================================================
-- Sub-table on programme; one row per allowed plan. UNIQUE (programme_id,
-- kind) → at most one plan of each kind per programme. Different plans
-- may carry different totals (installments often priced higher — a tutor
-- marketing lever). initial_price_minor is what the student pays at
-- checkout (full / deposit / installment 1); total_price_minor is what
-- they end up paying across the whole plan.

CREATE TABLE nclex_programme_payment_strategies (
  strategy_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CASCADE: plans are configuration that belongs to the programme. A
  -- live enrolment freezes its own snapshot (strategy_snapshot_json), and
  -- nclex_enrolments.strategy_id / nclex_payments.strategy_id are RESTRICT
  -- so a referenced plan can't be deleted out from under them anyway.
  programme_id         UUID NOT NULL
                       REFERENCES nclex_programmes(programme_id) ON DELETE CASCADE,

  kind                 TEXT NOT NULL
                       CHECK (kind IN ('UPFRONT_FULL','DEPOSIT_BALANCE','EQUAL_INSTALLMENTS')),

  -- Optional tutor display name ("Pay in 3", "Founding-cohort price").
  -- NULL → UI falls back to a system label per kind.
  label                TEXT,

  -- Minor units, in the programme's currency (inherited, not stored here).
  total_price_minor    INTEGER NOT NULL CHECK (total_price_minor   >= 0),
  initial_price_minor  INTEGER NOT NULL CHECK (initial_price_minor >= 0),

  -- EQUAL_INSTALLMENTS only.
  installment_count            SMALLINT
                               CHECK (installment_count IS NULL
                                      OR installment_count BETWEEN 2 AND 12),
  installment_interval_days    SMALLINT
                               CHECK (installment_interval_days IS NULL
                                      OR installment_interval_days > 0),

  -- DEPOSIT_BALANCE only — balance due this many days after enrolment
  -- (the deposit). The due-date is computed per student from their own
  -- enrolment date (settled decision 2026-05-22), not a stored calendar date.
  balance_due_days_after_enrolment SMALLINT
                               CHECK (balance_due_days_after_enrolment IS NULL
                                      OR balance_due_days_after_enrolment >= 0),

  -- Tutor can hide a plan without deleting it (preserves running
  -- enrolments that reference it).
  is_active            BOOLEAN  NOT NULL DEFAULT TRUE,
  sort_order           SMALLINT NOT NULL DEFAULT 0,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- The initial payment can't exceed the plan total.
  CONSTRAINT nclex_pps_initial_le_total CHECK (initial_price_minor <= total_price_minor),

  -- Per-kind field shape: each kind uses only its own optional fields.
  --   UPFRONT_FULL       → paid in one go; initial = total; no schedule.
  --   DEPOSIT_BALANCE    → deposit now + balance later; balance offset set.
  --   EQUAL_INSTALLMENTS → count + interval set.
  CONSTRAINT nclex_pps_kind_fields CHECK (
    (kind = 'UPFRONT_FULL'
       AND initial_price_minor = total_price_minor
       AND installment_count IS NULL
       AND installment_interval_days IS NULL
       AND balance_due_days_after_enrolment IS NULL)
    OR
    (kind = 'DEPOSIT_BALANCE'
       AND installment_count IS NULL
       AND installment_interval_days IS NULL
       AND balance_due_days_after_enrolment IS NOT NULL)
    OR
    (kind = 'EQUAL_INSTALLMENTS'
       AND installment_count IS NOT NULL
       AND installment_interval_days IS NOT NULL
       AND balance_due_days_after_enrolment IS NULL)
  )
);

-- Checkout / tutor-config ordering query.
CREATE INDEX idx_nclex_pps_programme_sort
  ON nclex_programme_payment_strategies (programme_id, sort_order);

-- At most one plan of each kind per programme.
CREATE UNIQUE INDEX idx_nclex_pps_programme_kind
  ON nclex_programme_payment_strategies (programme_id, kind);

ALTER TABLE nclex_programme_payment_strategies ENABLE ROW LEVEL SECURITY;

-- Read + write: the owning tutor (walks the parent programme's tutor_id).
-- SUPER_ADMIN bypass. NO public base-table policy — public checkout /
-- discovery read a curated view (added in 7c/7e), matching the
-- nclex_public_programmes pattern established in Slice 3b.
CREATE POLICY nclex_pps_tutor_all
  ON nclex_programme_payment_strategies FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_payment_strategies.programme_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_payment_strategies.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_pps_admin_all
  ON nclex_programme_payment_strategies FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- 2. nclex_enrolments — strategy link + frozen snapshot
-- =========================================================
-- strategy_id: which plan this student is on. NULL until 7c writes it
--   (and may legitimately stay NULL for plain upfront enrolments). RESTRICT
--   so a plan with live enrolments can't be deleted (deactivate instead).
-- strategy_snapshot_json: frozen copy of the plan's terms at checkout, so
--   a later tutor edit only affects future students.
ALTER TABLE nclex_enrolments
  ADD COLUMN strategy_id UUID
    REFERENCES nclex_programme_payment_strategies(strategy_id) ON DELETE RESTRICT,
  ADD COLUMN strategy_snapshot_json JSONB;


-- =========================================================
-- 3. nclex_payments — real FK on the existing strategy_id
-- =========================================================
-- Shipped as a bare nullable UUID in Slice 5.1 (the strategies table
-- didn't exist yet). No non-NULL values exist (upfront pays NULL), so the
-- constraint is safe to add now. RESTRICT mirrors the enrolment link.
ALTER TABLE nclex_payments
  ADD CONSTRAINT nclex_payments_strategy_fk
  FOREIGN KEY (strategy_id)
  REFERENCES nclex_programme_payment_strategies(strategy_id) ON DELETE RESTRICT;


-- =========================================================
-- 4. Backfill — one UPFRONT_FULL plan per existing programme
-- =========================================================
-- Mirrors each programme's current price_minor into an active upfront
-- plan (total = initial = price_minor). Idempotent via NOT EXISTS, so a
-- re-run is a no-op. price_minor itself stays the live source until 7e.
INSERT INTO nclex_programme_payment_strategies
  (programme_id, kind, total_price_minor, initial_price_minor, is_active, sort_order)
SELECT pr.programme_id, 'UPFRONT_FULL', pr.price_minor, pr.price_minor, TRUE, 0
FROM nclex_programmes pr
WHERE NOT EXISTS (
  SELECT 1 FROM nclex_programme_payment_strategies s
  WHERE s.programme_id = pr.programme_id
    AND s.kind = 'UPFRONT_FULL'
);
