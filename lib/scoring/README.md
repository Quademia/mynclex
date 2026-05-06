# `lib/scoring/`

Per-question scoring for the Question Bank — pure TypeScript, no DB calls,
deterministic. Two call sites:

- **Editor at save time** — `computeMarksFromKey(question_type, correct)`
  derives the max-possible score from the answer key and writes it to
  `nclex_bank_items.marks` / `nclex_tutor_questions.marks`. Curators do
  not set marks directly; the column is system-managed.
- **Runner at submission time** — `scoreAttempt(question_type, correct, answer)`
  produces `{ score_awarded, is_correct }` per the per-type rule.

Both functions dispatch through one switch on `question_type` to the
five underlying scoring functions (`scoreAllOrNothing`, `scorePlusMinus`,
`scorePerRow`, `scorePerBlank`, `scorePerSlot`).

## Why at the lib root, not under `lib/bank/scoring/`

Scoring is consumed across multiple domains — authoring, the runner,
session aggregation, future analytics. It's not bank-specific, so it
lives one level up alongside other shared lib folders rather than
buried inside the authoring tree.

## Files

- `types.ts` — student-answer wire shapes (`McqAnswer`, `SataAnswer`, …) and `ScoreResult`
- `functions.ts` — the five pure scoring functions
- `dispatch.ts` — `computeMarksFromKey` + `scoreAttempt`
- `index.ts` — public barrel; call sites import from `@/lib/scoring`
- `*.test.ts` — Vitest unit tests, run with `npm test`

## Canonical decision record

The full rationale — per-type rule mapping, the +/− vs all-or-nothing
choices, the full-credit-only `is_correct` policy, edge cases — lives in
[`docs/product-plan/bank-marks-and-scoring.html`](../../docs/product-plan/bank-marks-and-scoring.html).
This module is the implementation of that doc; in particular:

- §3 — the five scoring functions
- §4 — per-type rule mapping (with §4.1 Select-N, §4.2 Bow-tie sub-decisions)
- §5.2 — per-type max formula (consumed by `computeMarksFromKey`)
- §5.5 — `is_correct` is full-credit-only (cascades to every partial-credit type)
