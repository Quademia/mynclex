-- Drop dead RPCs: case-save + trend-save/delete (admin and tutor variants).
--
-- Background: slice 1.11b shipped nclex_save_case_with_children, slice 1.12b
-- shipped the trend-save RPCs, and slice 1.12c shipped the trend-delete RPCs.
-- Subsequent design changed those flows to direct CRUD inside server actions
-- (lib/bank/wrappers/case-study/actions.ts and lib/bank/wrappers/trend/actions.ts),
-- and these 7 functions have had no callers since. The cleanup pass was
-- flagged in the trend actions header comment and is being run now alongside
-- the slice 2.5 marks-system-managed work.
--
-- After this migration db/rpcs.sql is removed (it contained only these 7
-- functions). Future RPCs are introduced via numbered migrations directly
-- and back-ported to a fresh db/rpcs.sql when one is needed again.
--
-- Idempotent via IF EXISTS — safe to re-run, safe on environments that
-- never received the originating slice 1.11b/1.12b/1.12c migrations.

DROP FUNCTION IF EXISTS nclex_save_case_with_children(TEXT, TEXT, JSONB, JSONB);
DROP FUNCTION IF EXISTS nclex_save_trend_with_children(JSONB);
DROP FUNCTION IF EXISTS nclex_tutor_save_trend_with_children(JSONB);
DROP FUNCTION IF EXISTS nclex_detach_and_delete_trend(TEXT);
DROP FUNCTION IF EXISTS nclex_delete_trend_and_children(TEXT);
DROP FUNCTION IF EXISTS nclex_tutor_detach_and_delete_trend(TEXT);
DROP FUNCTION IF EXISTS nclex_tutor_delete_trend_and_children(TEXT);
