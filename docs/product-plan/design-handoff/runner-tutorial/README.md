# Runner Tutorial — Claude Design handoff (v2)

**Concept, not source.** This is the adopted CD blueprint for the sandbox
runner tutorial — a static HTML reproduction of the runner with the coaching
layer on top. It is the design reference to **build from**, not code to ship:
at build time, fidelity is checked against the **live** React runner
components, never against this reproduction.

Adopted 2026-07-25 (this v2 supersedes CD's first version — it adds
hide/resume coaching, an explicit "End tutorial", and the hierarchical
jump-to-section dropdown).

## Files

- `tutorial-runner.html` — the prototype. Open in a browser to walk the
  32-step guided flow. The step list is the `STEPS` array; the jump-to
  index is the `SECTIONS` array; the closing summary is `RECAP`.
- `support.js` — the DC runtime the prototype renders through.
- `styles/` — the `runner.css` / `calculator.css` snapshots CD lifted the
  runner chrome + question-type states from.
- `cd-sync-notes.md` — CD's own notes on which real components each screen
  was built from (a useful map for the implementer).

## The plan

Design + build plan lives in `../../runner-tutorial.md` (the canonical doc).
Build is Slices 1–3 there: sandbox runner mode → coach layer → entry points.
