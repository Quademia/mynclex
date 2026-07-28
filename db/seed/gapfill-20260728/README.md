# Gap-fill authoring run — 2026-07-28

622 standalone bank items authored to close the coverage gaps measured in
`docs/product-plan/bank-coverage-gap-analysis.md`.

Every row carries `batch_id = 'gapfill-20260728'`, so the whole run is
reversible in one statement:

```sql
DELETE FROM nclex_bank_items WHERE batch_id = 'gapfill-20260728';
```

## What is here

| File | Items | ID block | Fills |
|---|---|---|---|
| `gap-01-maternity-antenatal.sql` | 55 | 510001– | antenatal care, dating, hypertensive disorders, bleeding |
| `gap-02-maternity-labour.sql` | 55 | 511001– | stages/phases, fetal monitoring, intrapartum emergencies |
| `gap-03-newborn-postpartum.sql` | 50 | 512001– | newborn variations, kernicterus, fundus, lochia |
| `gap-04-peds-development.sql` | 50 | 520001– | Piaget-timed teaching, play and toys, child safety |
| `gap-05-peds-conditions.sql` | 50 | 521001– | congenital heart defects, paediatric med-surg |
| `gap-06-peds-meds-procedures.sql` | 50 | 522001– | weight-based dosing, paediatric procedures |
| `gap-07-moc-delegation.sql` | 55 | 530001– | LPN/UAP scope, staff escalation, care coordination |
| `gap-08-moc-prioritisation.sql` | 55 | 531001– | the prioritisation rule stack, triage |
| `gap-09-pharm-toxicity.sql` | 40 | 540001– | therapeutic ranges, peak/trough, high-alert safety |
| `gap-10-pharm-psych.sql` | 40 | 541001– | psychotropics, NMS vs EPS, lithium, MAOIs |
| `gap-11-mh-psychosis.sql` | 35 | 550001– | delusion/hallucination/illusion, psychosis triage |
| `gap-12-mh-substance-crisis.sql` | 35 | 551001– | intoxication/withdrawal, abuse dynamics, grief |
| `gap-13-medsurg-zero.sql` | 52 | 560001– | laminectomy, hiatal/dumping, chest drains, ventilators |

All items are `cat_pool = FALSE` — this run grows the **free practice
pool**, it does not touch the 2,400-item CAT reservation.

`shuffle_options` is deliberately omitted from the INSERT column list so
every row takes the column default (`TRUE`). The runner
(`lib/practice/runner/option-order.ts`) therefore permutes MCQ / SATA /
SELECT_N options per attempt and relabels the badges positionally, so the
authored letter order is never what a student sees.

## Verification

`validate.py <dir>` parses the SQL without executing it and checks
everything the database enforces plus what it does not:

- 22 fields per row, quoting balanced, apostrophes doubled
- `content` / `correct` parse as JSON
- every `correct` id resolves to an id in that item's own `content`
- feedback covers every option; MATRIX rows single-valued, MATRIX_MR ≥1
- `select_count` matches the answer count; CLOZE markers match blanks
- closed vocabularies, valid category→subcategory pairs, `cat_pool FALSE`
- item ids unique across the whole run

`qa_report.py <dir>` adds cross-batch checks no single authoring agent can
do for itself: answer-key positional bias, SATA answer-count spread, and
near-duplicate stems **across** files. It was the only thing that caught
the one real cross-file collision in this run — two agents independently
writing the same infant-fracture safeguarding scenario.

Both are kept here because the next authoring run should start by running
them, not by rebuilding them.

## Known accepted overlaps

Reported by `qa_report.py`, deliberately kept:

- `531037` / `531038` (0.90) — the intentional FIRST-vs-BEST pair on a
  chest-drain disconnection. Same scenario, two lead-ins, two answers.
- `541007` / `541016` (0.70) — same teaching-item frame, different drugs
  (chlorpromazine vs lithium).
- `530006` / `531014` (0.57) — LPN scope asked from both directions.
  Different answer sets; they do share an opening sentence verbatim, which
  is worth varying if either is ever edited.
