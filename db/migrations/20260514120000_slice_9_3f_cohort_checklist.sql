-- =========================================================
-- MyNclex — Slice 9.3f: Cohort curriculum checklist
-- File: mynclex/db/migrations/20260514120000_slice_9_3f_cohort_checklist.sql
-- =========================================================
-- The cohort layer's curation surface. The programme owns the
-- curriculum template (units → blocks → activities); the cohort
-- carries dates, students, and a "checklist" of which template
-- activities are included in this specific run.
--
-- Core architectural rule:
--   Cohort = pointer to template, not a copy.
--   Content edits on the template (title, body, PDF replacement,
--   recording URL, future quiz key) propagate to every cohort.
--   The cohort-side row stores only what's cohort-specific:
--   inclusion flag + release date.
--
-- One structural rule that does NOT propagate:
--   Adding a NEW template activity after a cohort exists does not
--   auto-add it to that cohort. The cohort sees the activities
--   that existed when it was created (the AFTER INSERT trigger
--   seeds those once); future template additions wait for an
--   explicit "add new template items" affordance (deferred).
--
-- Every other structural operation handles itself naturally:
--   - DELETE a template activity → ON DELETE CASCADE wipes the
--     cohort row.
--   - REORDER activities → the row stores activity_id only;
--     rendering joins live to the template and picks up the new
--     ordinal automatically.
--   - MOVE an activity between units/blocks → same. The cohort
--     view follows the activity to its new location.
--   - ADD a new block → blocks don't have checklist rows; only
--     activities do. The block surfaces in the cohort when an
--     activity is moved into it.
--
-- Visibility note: a checklist row's existence + is_included=true
-- means "this activity is in this cohort's plan." Whether a
-- STUDENT actually sees it adds three more gates (programme
-- PUBLISHED, all parent rows is_published=true, release_date <=
-- today). The isVisibleToStudents() helper in
-- lib/curriculum/format.ts gets extended in this slice to AND in
-- the cohort gates.


-- =========================================================
-- nclex_cohort_checklist_items
-- =========================================================

CREATE TABLE nclex_cohort_checklist_items (
  checklist_item_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent cohort. CASCADE so deleting a cohort cleans up its
  -- entire checklist atomically.
  cohort_id             UUID NOT NULL
                        REFERENCES nclex_cohorts(cohort_id)
                        ON DELETE CASCADE,

  -- Template activity this row points to. CASCADE so deleting a
  -- template activity cleanly removes it from every cohort that
  -- referenced it — orphan rows would be ambiguous and there's
  -- no recovery flow.
  template_activity_id  UUID NOT NULL
                        REFERENCES nclex_programme_activities(activity_id)
                        ON DELETE CASCADE,

  -- Cohort-side controls.
  is_included           BOOLEAN NOT NULL DEFAULT true,
  release_date          DATE NOT NULL,

  -- Reserved for future COHORT_ONLY adds (activities added to a
  -- single cohort without a template entry). Column ships now to
  -- avoid a future migration; UI deferred. v1 only ever writes
  -- 'TEMPLATE'.
  source                TEXT NOT NULL DEFAULT 'TEMPLATE'
                        CHECK (source IN ('TEMPLATE', 'COHORT_ONLY')),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One row per (cohort, template_activity). Prevents the trigger
  -- + backfill from racing and dupes from any future re-seed flow.
  UNIQUE (cohort_id, template_activity_id)
);

CREATE INDEX idx_nclex_cohort_checklist_cohort
  ON nclex_cohort_checklist_items(cohort_id);
CREATE INDEX idx_nclex_cohort_checklist_activity
  ON nclex_cohort_checklist_items(template_activity_id);


-- updated_at: stamped from the application layer on every UPDATE
-- via the server actions, matching the pattern used by every
-- other nclex_* table. No DB trigger here.


-- =========================================================
-- RLS — tutor side only in this slice
-- =========================================================
-- Ownership chain: checklist_item → cohort → programme → tutor.
-- Two-hop join used by every policy. SUPER_ADMIN bypass policy
-- mirrors the pattern from nclex_programme_units / _blocks /
-- _activities. Student-side policy (enrolled student gets SELECT
-- on rows where the visibility predicate is true) deferred to the
-- enrolment slice — students can't read this table yet.

ALTER TABLE nclex_cohort_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_cohort_checklist_items_self_select
  ON nclex_cohort_checklist_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_checklist_items.cohort_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_checklist_items_self_insert
  ON nclex_cohort_checklist_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_checklist_items.cohort_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_checklist_items_self_update
  ON nclex_cohort_checklist_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_checklist_items.cohort_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_checklist_items.cohort_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_checklist_items_self_delete
  ON nclex_cohort_checklist_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_checklist_items.cohort_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_checklist_items_admin_all
  ON nclex_cohort_checklist_items FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- Trigger: seed checklist on cohort INSERT
-- =========================================================
-- AFTER INSERT ON nclex_cohorts fires once per new cohort. The
-- function inserts one row per current template activity under
-- the new cohort's programme. release_date defaults to
-- start_date + (unit_index - 1) × 7 days — matches the planning
-- doc's "week N starts on day (N-1)*7" pacing rule for tutor-led
-- cohorts. Both Draft and Live template activities seed (the
-- checklist is a control surface, not a student filter — the
-- tutor sees the full template shape inside the cohort).
--
-- SECURITY DEFINER: the trigger fires after a successful INSERT
-- on nclex_cohorts, which is already RLS-gated to the cohort's
-- programme owner. The trigger's writes are confined to that
-- single cohort, so no privilege escalation across rows. The
-- definer attribute also keeps the seed working if cohort_checklist
-- RLS is ever tightened.

CREATE OR REPLACE FUNCTION nclex_cohorts_seed_checklist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO nclex_cohort_checklist_items
    (cohort_id, template_activity_id, release_date)
  SELECT
    NEW.cohort_id,
    a.activity_id,
    NEW.start_date + ((u.unit_index - 1) * INTERVAL '7 days')
  FROM nclex_programme_activities a
  JOIN nclex_programme_units u ON u.unit_id = a.unit_id
  WHERE u.programme_id = NEW.programme_id;

  RETURN NEW;
END;
$$;

-- Lock down execution as the rest of the codebase does
-- (REVOKE FROM PUBLIC + anon + authenticated). The trigger is
-- the only legitimate caller; no direct invocation path.
REVOKE EXECUTE ON FUNCTION nclex_cohorts_seed_checklist() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION nclex_cohorts_seed_checklist() FROM anon;
REVOKE EXECUTE ON FUNCTION nclex_cohorts_seed_checklist() FROM authenticated;

CREATE TRIGGER nclex_cohorts_seed_checklist_trg
  AFTER INSERT ON nclex_cohorts
  FOR EACH ROW
  EXECUTE FUNCTION nclex_cohorts_seed_checklist();


-- =========================================================
-- One-shot backfill — existing cohorts get rows for all current
-- template activities they don't already have. Future cohorts
-- get them via the AFTER INSERT trigger above.
-- =========================================================

INSERT INTO nclex_cohort_checklist_items
  (cohort_id, template_activity_id, release_date)
SELECT
  c.cohort_id,
  a.activity_id,
  c.start_date + ((u.unit_index - 1) * INTERVAL '7 days')
FROM nclex_cohorts c
JOIN nclex_programme_units u ON u.programme_id = c.programme_id
JOIN nclex_programme_activities a ON a.unit_id = u.unit_id
WHERE NOT EXISTS (
  SELECT 1 FROM nclex_cohort_checklist_items i
  WHERE i.cohort_id = c.cohort_id
    AND i.template_activity_id = a.activity_id
);
