# Phase 2 (CAT wrapper seed) — resume notes

**State at last checkpoint (2026-07-16):** Phase 2 authoring is COMPLETE and
committed — 36 case studies + 30 trend datasets = 276 questions in
`data-wrappers/*.json` (validated, 0 errors). The **dev insert was in progress**
and may have been interrupted by the session limit. At last check: 34/36 cases,
204 case children, 7/30 trends, 14 trend questions applied to dev.

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
