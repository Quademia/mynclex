# Runner Tutorial (Sandbox)

*Living document. Started 2026-07-25. Canonical home for the **sandbox
tutorial** that teaches students how to use the exam runner — the question
types and the tools — in a safe, unscored, unsaved space. Surfaced by the
CAT work but **general to every mode**. Part of `mynclex/docs/product-plan/`.*

Last updated: 2026-07-25 (design pass **complete** — decisions settled, the
Claude Design walkthrough **v2** adopted + saved in-repo
(`design-handoff/runner-tutorial/`), build slices detailed; **build not
started**)

---

## Status

**Design pass complete. Build not started.** The three open decisions are
settled (below), and Claude Design has delivered the full 32-step
walkthrough (concept-not-source blueprint). This doc is now **build-ready** —
the *Build plan* section is the work.

## Why

On the real NCLEX, a tutorial runs *before* the exam so no candidate loses
marks fumbling the interface — how SATA works, how to drop answers into a
matrix, how drag-and-drop / cloze / bow-tie behave, how to use the
calculator, the navigation and submit rules. Two forces make it worth
building:

- **The CAT trigger + the 5-hour honesty.** The real NCLEX's 5 hours
  *includes* its tutorial; ours (§9.3, moved to 5h on 2026-07-25) is 5 hours
  of pure answering. An **optional, untimed tutorial before the exam** closes
  that gap honestly — the exam clock still starts at zero when the student
  begins.
- **General value.** Our core audience meets NGN item types for the first
  time here. The exam should test *nursing judgement*, not "can you work the
  UI." This applies to **every** mode — CAT is only what surfaced the need.

## The governing principle — one runner, never a copy

The tutorial teaches the **exact** interface used on the day, so it must be
the **real runner**, not a look-alike. The distinction that matters:

- ❌ **A side runner that's a *copy*** — a second runner built to resemble the
  real one and kept in sync forever. This is the **mock we ruled out**: the
  day the real runner changes, a copy teaches a lie. (CD's HTML file *is* such
  a copy — but it is only a **blueprint**, never what we ship.)
- ✅ **The real runner, in a practice mode, with the coach on top** — same
  code, same components, same behaviour; we just feed it fake questions,
  switch off the "save" wiring, and float the coach beside it.

> Analogy: not a replica car built to look like yours — *your actual car*, on
> a private practice track, with an instructor in the passenger seat and the
> odometer unplugged.

The tutorial has its **own address** (a route like `/tutorial`), but that
route **mounts the real runner's building blocks** — it does not re-create
them. **There is only ever one runner.**

## The CD walkthrough (adopted 2026-07-25, concept-not-source)

Claude Design read the *real* runner components (per its sync notes:
`runner-topbar/-footer/-grid/-question-area`, `lib/practice/runner/types/*`,
the case/trend panels, `mode-brief.ts`) and built the walkthrough on top of
them. Shape we're adopting:

- **A 32-step linear walkthrough** grouped: chrome & tools (12) → every
  question type (11) → case & trend (7) → close (2), each step carrying a
  title, body, the **control it points at** (`target`), an optional **gate**
  (a must-do before Next unlocks), and which dummy question to show (`goto`).
- **Coach card anchored to each control** (Exit, calculator, answer area…),
  dimming the rest — a moving coach-mark, not one static modal.
- **Learn-by-doing gates** — several steps require the student to actually
  *do* it (mark the question, open the calculator, answer & submit) before
  continuing. Stronger than passive reading.
- **"Nothing is recorded"** surfaced to the user (a topbar pill + a dedicated
  step) — our sandbox-safety invariant made visible; the pill stays up even
  when coaching is hidden.
- **User controls on the coach card (v2, adopted 2026-07-25):**
  - **Hide coaching → Resume** — collapse the coach to a minimal strip so the
    whole runner is free to explore, and resume the guided flow at any time.
    This makes the tutorial *both* a guided tour and a free-explore sandbox,
    which **dissolves the earlier linear-vs-explore question** — you get both.
  - **End tutorial** — an explicit exit from the coaching, reachable anywhere
    (incl. the hidden-coaching strip).
  - **Jump-to-section** — a **hierarchical** dropdown (big sections + each of
    the 11 question types as a sub-entry), so a returning student lands
    straight on e.g. "bow-tie" in one click.

Two build-time notes (not blockers): the runner's own "Exit" and the coach's
"End tutorial" are **two exits** that must read coherently at build time; and
**jump + gates coexist** by design (the linear path gates on doing the thing,
but jump-to lets a returning user skip straight to a type — correct for a
reference tool, not a bug to "fix").

## Settled decisions

1. **Coverage — FULL.** All 11 question types (MCQ, T/F, SATA, Select-N,
   matrix, matrix-multi, highlight, cloze, drag-cloze, drag-order, bow-tie)
   plus case study and trend. Meeting an untaught type in a real exam is the
   exact failure the tutorial prevents.
2. **Shape — linear walkthrough + jump-to-section.** Guided "Step N of 32" as
   the default first-timer path, with a jump-to-any-section index for
   returners (CD delivered it, so it's in v1).
3. **Dummy content — CD's real clinical questions, kept as-is.** An earlier
   musing to make them trivial/non-nursing was **reversed**: a nurse doing a
   "primary-colours" question would feel patronised, and real content keeps it
   feeling like the exam. (If any prove to demand real deliberation we can ease
   them, but the set stands.)
4. **Design route — done.** CD delivered the coach-layer UX.
5. **Placement — authenticated focused route for v1.** The sandbox reuses the
   real runner components (which assume a logged-in context), so v1 is an
   authed, audience-neutral, distraction-free route. A public preview for
   prospective buyers is a possible **v2**, not a v1 gate.

## Build plan — the slices

A **multi-session feature**. Build in order; each slice is testable and
mergeable on its own.

### Slice 1 — the sandbox runner mode (the real engineering)

Make the runner run with fake questions that save nothing. The load-bearing
piece.

- **Dummy questions, held in the app code (NOT the bank).** ~19 dummy items —
  one per type (+ the case's children and a trend) — shaped exactly like real
  `nclex_attempt_items` so the runner renders them unchanged, kept in a
  constant (e.g. `lib/practice/tutorial/questions.ts`). Held in code so they
  **can never leak into the real bank or the CAT pool**, and are versioned
  with the app.
- **A third runner mode.** The runner today branches on `mode: 'live' |
  'review'`; add a `tutorial`/`sandbox` mode. **Review mode is the template** —
  it already reveals answers without saving; the sandbox is "review, but the
  student answers fresh and still nothing saves."
- **Every server action becomes a no-op.** `submitAnswer`, `saveProgress`,
  `completeAttempt`, `expire`, the clocks — all stubbed / not called in
  sandbox mode.
- **Wiring choice (settle in this slice):** teach the *existing* runner shell
  the new mode (one shell handles all three — preferred, guarantees zero
  drift), **or** a thin tutorial host mounting the runner's real child
  components. Either way it's the **same components**, never a reimplementation.
- **The safety invariant — provably no writes.** The sandbox never creates a
  real attempt, so there is nothing to write into; the stubs are belt-and-
  braces. **Sign-off = after a full tutorial run, the DB has zero new records**
  (no attempt, no answers, no score).
- *Nothing user-facing yet* beyond a bare sandboxed runner for testing.

### Slice 2 — the coach layer + flow

The guided coaching on top of the sandbox. CD's blueprint specifies most of it.

- **Step data** — port CD's 32-step list (title, body, `target`, `gate`,
  `goto`) into the app.
- **Coach card** — a floating React component that positions itself next to
  the `target` control, dims the rest (the spotlight/ring), and renders
  title/body/Back/Next/Skip. Cross-viewport positioning is the fiddly UX bit.
- **Gate logic** — for gated steps, Next stays disabled until the student
  does the thing; the runner already announces mark/answer/submit events, the
  coach listens.
- **Flow controller + coach controls** — current step, advance/rewind, switch
  the underlying dummy question on `goto`, the hierarchical **jump-to-section**
  index, **hide/resume** (collapse to a strip → free-explore → resume), an
  explicit **End tutorial**, and the "you're ready — start your exam" ending.
  (All of these are coach-layer only — they don't touch Slice 1 or the safety
  invariant.)

### Slice 3 — entry points + "done" memory

- **Doorways** — links from `/help` and the dashboard, plus an optional offer
  before an exam (CAT / pack / timed preflight: "New here? Take the
  walkthrough").
- **"Done" memory** — one per-user flag (e.g. `tutorial_completed_at`) so the
  pre-exam offer becomes a quiet link, not a nag. **This is the only thing in
  the whole feature that writes to the database** — everything else writes
  nothing.

## Build-approach guardrails

- **One runner only.** Reuse the real components; never a parallel copy.
- **CD's HTML is the blueprint, not the source.** At build time, fidelity is
  checked against the **live** React components, not CD's static reproduction
  (same concept-not-source discipline as the bank/readiness CD work).
- **The no-write invariant is load-bearing** and gets its own verification
  (zero DB records after a full run) before Slice 1 is called done.

## Related docs

- `bank-consumption-runner.html` — the runner this tutorial teaches (chrome,
  per-type rendering, navigation, grid, mark-for-review).
- `bank-consumption-cat.html` — §3.2 the `/help/cat` explainer (the tutorial's
  text cousin); §9.3 the 5-hour limit this tutorial complements.
- `calculator.md` — a tool the tutorial covers.
- **`design-handoff/runner-tutorial/`** — the adopted CD blueprint (v2),
  concept-not-source. `tutorial-runner.html` is the 32-step prototype (`STEPS`
  / `SECTIONS` / `RECAP` arrays); `cd-sync-notes.md` maps each screen to the
  real component it was built from; `README.md` explains the contract.
- `main.md` — overall MyNclex product plan.
