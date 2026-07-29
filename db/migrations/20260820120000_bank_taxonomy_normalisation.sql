-- Bank taxonomy normalisation.
--
-- Classification labels on nclex_bank_items had drifted into near-duplicate
-- variants, introduced by bulk SQL seeding rather than the curator UI (which
-- only offers the canonical lists). Left unfixed this corrupts blueprint
-- reporting and CAT content-balancing, both of which group by these columns:
-- 'GI' and 'Gastrointestinal' read as two unrelated systems.
--
-- The canonical vocabularies are NURSING_SUBJECTS and BODY_SYSTEMS in
-- lib/bank/classifications.ts. That file stays the source of truth; this
-- migration folds the strays into it and adds CHECK constraints so a future
-- bulk insert fails loudly instead of drifting silently.
--
-- 'Not applicable' is preserved as a legitimate body_system: it means
-- "deliberately not system-specific" (leadership, delegation, ethics items),
-- which is distinct from NULL meaning "unclassified".
--
-- NULLs are left alone. They are a separate backfill.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. nursing_subject → the canonical 8
-- ─────────────────────────────────────────────────────────────

-- Critical Care is not a test-plan subject; those items are med-surg.
UPDATE nclex_bank_items SET nursing_subject = 'Medical-Surgical'
 WHERE nursing_subject IN (
   'Medical-Surgical Nursing',      -- 30
   'Critical Care',                 -- 39
   'Critical Care Nursing',         --  6
   'Adult Health - Cardiovascular'  --  6
 );

UPDATE nclex_bank_items SET nursing_subject = 'Maternity'
 WHERE nursing_subject IN (
   'Maternal-Newborn',              -- 29
   'Maternal Newborn Nursing'       --  2
 );

UPDATE nclex_bank_items SET nursing_subject = 'Pediatrics'
 WHERE nursing_subject = 'Pediatric';  -- 7

-- ─────────────────────────────────────────────────────────────
-- 2. body_system → the canonical 14 (+ 'Not applicable')
-- ─────────────────────────────────────────────────────────────

UPDATE nclex_bank_items SET body_system = 'Gastrointestinal'
 WHERE body_system = 'GI';                       -- 103

-- Canonical label is 'Genitourinary'; the renal variants fold into it.
UPDATE nclex_bank_items SET body_system = 'Genitourinary'
 WHERE body_system IN (
   'Renal/Genitourinary',                        -- 102
   'Renal',                                      --  43
   'Renal/Urinary'                               --   2  (acute kidney injury)
 );

UPDATE nclex_bank_items SET body_system = 'Neurological'
 WHERE body_system IN ('Neurologic', 'Neuro');   -- 6 + 3

-- All 6 'Neuropsychiatric' rows are schizophrenia / therapeutic-communication
-- items on Mental Health; none are neurological.
UPDATE nclex_bank_items SET body_system = 'Psychiatric/Mental Health'
 WHERE body_system IN ('Psychiatric', 'Neuropsychiatric');  -- 6 + 6

UPDATE nclex_bank_items SET body_system = 'Reproductive'
 WHERE body_system = 'Reproductive/Obstetric';   -- 2  (pre-eclampsia)

-- Both 'Cardiovascular/Immune' rows are sepsis / septic shock, which is
-- multisystem rather than either single system.
UPDATE nclex_bank_items SET body_system = 'Multisystem'
 WHERE body_system = 'Cardiovascular/Immune';    -- 2

-- ─────────────────────────────────────────────────────────────
-- 3. Guard rails — keep the vocabularies closed
-- ─────────────────────────────────────────────────────────────

ALTER TABLE nclex_bank_items
  ADD CONSTRAINT nclex_bank_items_nursing_subject_check
  CHECK (nursing_subject IS NULL OR nursing_subject IN (
    'Fundamentals of Nursing',
    'Medical-Surgical',
    'Maternity',
    'Pediatrics',
    'Mental Health',
    'Pharmacology',
    'Community Health',
    'Leadership and Management'
  ));

ALTER TABLE nclex_bank_items
  ADD CONSTRAINT nclex_bank_items_body_system_check
  CHECK (body_system IS NULL OR body_system IN (
    'Cardiovascular',
    'Respiratory',
    'Gastrointestinal',
    'Genitourinary',
    'Musculoskeletal',
    'Neurological',
    'Endocrine',
    'Hematologic',
    'Immune',
    'Integumentary',
    'Reproductive',
    'Sensory',
    'Psychiatric/Mental Health',
    'Multisystem',
    'Not applicable'
  ));

COMMIT;
