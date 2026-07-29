repo: QAcademy-Nurses/mynclex
branch: main

## Last sync
date: 2026-07-25T20:19:28Z

### Updated in this project (latest)
- Read lib/practice/runner/types/cloze.tsx and matched it: "— choose —" placeholder, ✓/✕ pill marks, "(skipped)", the filled-count hint, and per-choice inline feedback prose with green/red answer-key labels.
- Answering hints are now suppressed in review for every stem-takeover / token type, matching each component's `{!isReview && …}` guard.

### Updated in this project
- Built "Tutorial Runner.dc.html" — a non-recording tutorial that reproduces the session runner exactly and layers guided coaching on top.
- Runner chrome, question-type behaviour and colour states lifted from styles/runner.css + the runner components.
- Read highlight/cloze/drag-cloze/drag-order/bowtie components in full and added their review-mode structures (per-chunk feedback list, per-slot verdict blocks, ordered answer-key cards, distractor strips, bow-tie feedback pills) plus the exact SELECT_N count copy.

## Sync history
- 2026-07-25T19:50:00Z — first build of the tutorial runner from the runner components + styles/runner.css.

## Screen map
| Screen | Built from |
| --- | --- |
| Tutorial Runner — shell, topbar, footer | app/(app)/(focused)/session/[attempt_id]/runner-topbar.tsx, runner-footer.tsx, styles/runner.css, styles/tokens.css |
| Question grid + filters + legend | app/(app)/(focused)/session/[attempt_id]/runner-grid.tsx |
| Question area, meta pills, rationale | app/(app)/(focused)/session/[attempt_id]/runner-question-area.tsx |
| MCQ / TF / SATA / SELECT_N / MATRIX / MATRIX_MR | lib/practice/runner/types/*.tsx |
| HIGHLIGHT / CLOZE / DRAG_CLOZE / DRAG_ORDER / BOWTIE | lib/practice/runner/types/*.tsx + styles/runner.css (.rn-highlight-*, .rn-cloze-*, .rn-dd-*, .rn-bt-*) |
| Case panel + CJMM strip | lib/practice/runner/case/case-panel.tsx, cjmm-strip.tsx |
| Trend panel | lib/practice/runner/trend/trend-panel.tsx |
| Mode copy in footer / coaching | lib/practice/runner/mode-brief.ts |
