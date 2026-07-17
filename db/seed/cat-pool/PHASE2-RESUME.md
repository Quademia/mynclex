# Phase 2 (CAT wrapper seed) — COMPLETE ✅

**Finished + verified in dev 2026-07-17.** All 66 wrappers applied:
**36 case studies (216 children) + 30 trend datasets (60 questions)** in dev,
tagged `CATPREP`. Verified: every case has exactly 6 CJMM children, 0 bad marks.
Total CAT test pool (Phase 1 + 2) = **2,087 items**.

The rest of this file is kept as a runbook (rebuild / verify / rollback).

Everything is idempotent (`ON CONFLICT DO NOTHING`), so re-running is safe.

## To finish the dev insert

```bash
cd db/seed/cat-pool
node build-wrappers.mjs          # regenerates apply-wrappers/wrapper-*.sql (66 files, gitignored)
```

Then apply each `apply-wrappers/wrapper-NNN.sql` to the dev Supabase project
`xkqxfzfsllxyxpdtcrja` via the Supabase MCP `execute_sql` (each file is one
atomic BEGIN…COMMIT transaction). Use applier subagents in batches to keep the
main context clean (see the `cat-pool-apply-wrappers` workflow pattern).

## To verify completion

```sql
SELECT
  (SELECT count(*) FROM nclex_case_studies   WHERE 'CATPREP' = ANY(tags)) AS cases,      -- expect 36
  (SELECT count(*) FROM nclex_trend_datasets WHERE 'CATPREP' = ANY(tags)) AS trends,     -- expect 30
  (SELECT count(*) FROM nclex_bank_items WHERE question_ref='CATPREP' AND parent_case_id IS NOT NULL) AS case_children,  -- expect 216
  (SELECT count(*) FROM nclex_bank_items WHERE question_ref='CATPREP' AND trend_id IS NOT NULL)       AS trend_questions; -- expect ~60
```

If any wrapper is short, find which case_ids / trend_ids are missing and
re-apply just those `wrapper-*.sql` files (idempotent).

## Cleanup / rollback

Whole CAT test pool (Phase 1 + 2) is tagged `question_ref = 'CATPREP'` and
`batch_id = 'DEV_CAT_POOL'`. To remove wrappers specifically, delete the
`nclex_case_studies` / `nclex_trend_datasets` rows tagged `CATPREP` (children
cascade via their links) — or delete `nclex_bank_items WHERE question_ref='CATPREP'`
for the entire pool.
