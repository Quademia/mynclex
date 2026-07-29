-- =========================================================
-- MyNclex — Runner tutorial Slice 3a: the tutorial flag tables
-- File: mynclex/db/migrations/20260817120000_tutorial_flags.sql
-- =========================================================
-- The runner tutorial's ONLY database footprint. Two small per-user
-- state tables (docs/product-plan/runner-tutorial.md -> Slice 3):
--
--   nclex_tutorial_completions — tutorial progress ("did this user
--     finish tutorial X"). A record only; it drives no behaviour.
--
--   nclex_dismissed_prompts — a normalized "don't show me this again"
--     list, one row per (user, popup). Powers the pre-exam tutorial
--     popup (prompt_key = 'pre-exam-tutorial-offer'); any future popup
--     is a new prompt_key with NO schema change.
--
-- Split deliberately: "did the tutorial" is a fact about a TUTORIAL,
-- "don't show again" is a fact about a POPUP. One table would assume
-- one tutorial = one popup = one dismissal, which breaks the moment a
-- tutorial's offer appears in two places or a second tutorial ships.
--
-- Both key on nclex_users(id) and carry own-row RLS — the established
-- per-user-state pattern (cf. nclex_library_shelf_seen). Writes no-op
-- for unauthenticated users: no user_id, nothing to insert; the TS
-- helpers guard first, and RLS keys on auth.uid() as the backstop.
-- =========================================================

-- ── Tutorial progress ────────────────────────────────────
CREATE TABLE nclex_tutorial_completions (
  user_id      UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  -- Which walkthrough. 'exam-runner' today; a new tutorial is a new
  -- key value, no schema change. Room to grow additively (last_step…).
  tutorial_key TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tutorial_key)
);
ALTER TABLE nclex_tutorial_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY nclex_tutorial_completions_self_select
  ON nclex_tutorial_completions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY nclex_tutorial_completions_self_insert
  ON nclex_tutorial_completions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY nclex_tutorial_completions_self_update
  ON nclex_tutorial_completions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY nclex_tutorial_completions_self_delete
  ON nclex_tutorial_completions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY nclex_tutorial_completions_admin_all
  ON nclex_tutorial_completions FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));

-- ── Dismissed popups ("don't show again") ────────────────
CREATE TABLE nclex_dismissed_prompts (
  user_id      UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  -- Names the OFFER, not the physical spot — dismissing it silences
  -- that offer wherever it appears. 'pre-exam-tutorial-offer' today.
  prompt_key   TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, prompt_key)
);
ALTER TABLE nclex_dismissed_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY nclex_dismissed_prompts_self_select
  ON nclex_dismissed_prompts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY nclex_dismissed_prompts_self_insert
  ON nclex_dismissed_prompts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY nclex_dismissed_prompts_self_update
  ON nclex_dismissed_prompts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY nclex_dismissed_prompts_self_delete
  ON nclex_dismissed_prompts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY nclex_dismissed_prompts_admin_all
  ON nclex_dismissed_prompts FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));
