-- =========================================================
-- MyNclex — Payments Slice 5.4a: cohort on the programme payment
-- File: mynclex/db/migrations/20260603120000_slice_5_4a_payment_cohort.sql
-- =========================================================
-- On-platform programme checkout (5.4a) lets a student pick a cohort
-- BEFORE they pay. The chosen cohort has to survive the Paystack round
-- trip so that, on verify, the activation engine can create the
-- nclex_enrolments row in the right cohort.
--
-- The enrolment row itself doesn't exist until AFTER payment (we don't
-- want abandoned checkouts leaving orphan PENDING_APPROVAL rows that
-- trip the one-active-enrolment-per-cohort unique index), so the payment
-- is the only place that can carry the cohort across the redirect.
-- Hence: a nullable cohort_id on nclex_payments.
--
--   • Tutor-led programme payment → cohort_id set (the picked cohort).
--   • Self-paced programme payment → cohort_id NULL (no cohorts).
--   • Bank / readiness payment     → cohort_id NULL (not a programme).
--
-- RESTRICT on delete, matching nclex_enrolments.cohort_id: a cohort with
-- payment history is archived, never hard-deleted out from under it.

ALTER TABLE nclex_payments
  ADD COLUMN cohort_id UUID
    REFERENCES nclex_cohorts(cohort_id) ON DELETE RESTRICT;

-- cohort_id only ever rides on a programme-initial payment. (Installments
-- inherit the cohort from their parent enrolment, so they don't need it;
-- bank/readiness rows are not programme rows at all.)
ALTER TABLE nclex_payments
  ADD CONSTRAINT nclex_payments_cohort_scope CHECK (
    cohort_id IS NULL OR purpose = 'PROGRAMME_INITIAL'
  );
