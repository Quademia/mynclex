# On-Screen Calculator

*Living document. Started 2026-07-25. Canonical home for the **app-wide
on-screen calculator** — its rationale, the standard-set decision, the
display design, the pure state model, and how surfaces mount it. Built
runner-first but designed as a cross-cutting widget any surface can mount.
Part of `mynclex/docs/product-plan/`.*

Last updated: 2026-07-25 (built + wired into the runner; expression line +
armed-operator + press-flash added the same session)

---

## Why

The real NCLEX gives candidates a **basic on-screen calculator** for the
dosage / med-math / fill-in numeric items (IV drip rates, unit
conversions, BMI, intake/output). A practice runner without one makes
those exact items *harder to answer than the real exam* — the student has
to do arithmetic in their head that Pearson VUE would hand them a tool
for. So this is a real exam tool, not a convenience: unlike the Mark
placeholder (a mere convenience), a **missing** calculator withholds
something the student genuinely needs to answer the question.

That framing is why the calculator was promoted from "dead placeholder"
to a proper build (scheduled 2026-07-25 as BUILD_LIST slice #16).

## Decisions

### It is a *basic* (non-scientific) calculator — on purpose

The governing principle is **exam fidelity**: practice should mirror test
day, not improve on it (the same principle behind the §16.6 exam-mode
display-leak work — see `bank-consumption-cat.html`). Two reasons basic is
*correct*, not merely cheaper:

- **The real exam only gives a basic one.** A scientific calculator would
  be a *stronger* tool than the candidate has on the day — it trains a
  dependency that isn't there when it counts. Over-equipping in practice
  is a way of under-preparing.
- **NCLEX math never needs more.** Every calculation item is arithmetic
  (`+ − × ÷` and decimals). There is no trig / log / exponent question
  anywhere on the exam, so scientific keys would be clutter that makes the
  tool harder to read under pressure, not easier.

Because the calculator is a **real exam tool, not a display leak**, it is
available in **every runner mode** — study + exam, live + review. It
raises exam fidelity rather than compromising it (the opposite of the
§16.6 leaks, which reveal the engine's opinion of the candidate).

### We build our own — we do not import a library

A basic calculator is one of the smallest self-contained UI things there
is (a button grid + a small state machine). Building it ourselves gives
full control over the things that actually matter here — theming with the
app tokens, the draggable pop-up, mobile layout, accessibility — and takes
on **no dependency weight, license, or supply-chain surface** (keeps the
extraction test clean, CLAUDE.md rule #3). A third-party calculator would
be fought more than it saved. Sibling products (e.g. gamma) may have an
analogue, but rule #2 forbids importing across products and a fresh build
to our own conventions beats porting something this small.

### The *full standard* button set

We mirror the classic Windows "Standard" calculator layout that Pearson
VUE's on-screen calculator is modelled on — the full set the candidate
actually sees, not the bare minimum (settled with Sam 2026-07-25; matching
the real screen *is* the fidelity win):

| | | | |
|---|---|---|---|
| MC | MR | MS | M+ · M− |
| % | CE | C | ⌫ |
| ± | √ | 1/x | ÷ |
| 7 | 8 | 9 | × |
| 4 | 5 | 6 | − |
| 1 | 2 | 3 | + |
| 0 (wide) | . | = | |

Nothing scientific — no trig, logs, exponents, or parentheses.

### The display shows a running expression (not one value at a time)

A single-line calculator that only ever shows one value is genuinely
confusing mid-calculation: doing `10 × 2` the user sees `10`, then `2`,
then `20`, with no visible sign an operation is happening (raised by Sam
2026-07-25). The industry-standard fix, added the same session:

- **An expression line above the big value** — small and muted — showing
  the operation in progress: `10 ×` while the multiply is pending, frozen
  to `10 × 2 =` after equals. It sits **above** the live number (not
  below): the big number is the thing being typed, so it anchors the
  bottom, and every calculator people already know (phone / Windows /
  Google) puts the expression on top.
  - **It reflects the running left-to-right fold, never unapplied
    precedence.** A basic calculator has no operator precedence, so
    `2 + 3 × 4` computes `(2+3)×4 = 20` and the line reads `5 × 4 =` — not
    a misleading `2 + 3 × 4` that would imply it did `3×4` first (=14). The
    line is honest about what the machine actually did.
  - Unary keys describe themselves too (`√(144)`).
- **The pending operator button stays filled ("armed")** until the next
  operand — a persistent "a multiply is armed" cue alongside the line.
- **A brief press-flash** (an inset accent ring) confirms each tap
  registered — a *ring*, not a background fill, so it layers cleanly over
  an already-filled armed operator.

The expression line was preferred over a full scrolling "tape" (a receipt
of every past calculation): overkill for a med-math tool, the real NCLEX
calculator has no tape, and it would add clutter and its own scroll.

### A draggable pop-up

The panel floats over the page and is **dragged by its header**, so it
never has to cover the question — the student repositions it wherever
suits. It opens from a topbar toggle (see Integration). No data, no
migration, no engine.

## The state model

All arithmetic lives in `lib/calculator/calculator-logic.ts` as a **pure
reducer** — `applyKey(state, key)` — with the widget holding no arithmetic
(the codebase's pure-logic + thin-view split, cf.
`lib/practice/cat/report-derive.ts`). Key points:

- **`CalcState`** carries `display`, the running `expr` string, the
  accumulator `acc` + pending `op`, a `waiting` flag (next digit starts
  fresh), the `memory` register + `memActive` light, an `error` latch, and
  `justEq`.
- **Float-noise-free formatting** — `formatNumber()` rounds to 12
  significant figures before stringifying, so `0.1 + 0.2` reads exactly
  `0.3`, and drops to exponential only for magnitudes a fixed display
  can't show.
- **Error latch** — `÷0` and `√` of a negative show `Error`; only `C` /
  `CE` clears it (all other keys are ignored while latched).
- **Percent** uses Windows semantics (`A + B%` = `A + A×B/100`).

Covered by **42 unit tests** in `calculator-logic.test.ts`.

## Folder home & integration

- **`lib/calculator/`** — a top-level cross-cutting widget folder in the
  spirit of `lib/overlays/` / `lib/toast/` / `lib/hints/` (CLAUDE.md
  folder-structure §12). `calculator-logic.ts` (pure), `calculator.tsx`
  (the draggable panel + button grid + keyboard entry), and the test file.
- **`styles/calculator.css`** (`calc-*`), imported in `app/(app)/layout.tsx`
  so any authenticated surface can mount the widget.
- **Runner wiring** — the runner topbar (`runner-topbar.tsx`) gained a
  **Calc toggle** beside Mark / Grid (its own calculator glyph, drawn in
  the same stroke family as the clock/grid icons); `runner.tsx` holds a
  `calcOpen` state and mounts `<Calculator open onClose />`. The toggle is
  **always present** (unlike the grid toggle, which comes and goes) because
  the calculator is available in every mode.

### Keyboard entry

Beyond the real exam: digits, `+ − * /`, `Enter`/`=`, `Backspace`,
`Delete` (CE), and `Escape` (close) all work from the keyboard while the
panel is open — **guarded** so it never steals keystrokes from a real text
field (e.g. a Cloze fill-in): if an `input` / `textarea` / `select` /
contenteditable is focused, the calculator ignores the key.

## Future mounts (not built)

Because the widget is self-contained and app-wide, adding it elsewhere is a
one-line `<Calculator>` mount, not a second build. Plausible later homes:
a curator previewing a dosage question in the bank editor, a tutor building
med-math content, a stand-alone "practice your drug calculations" tool.
None are in scope now — the runner is the only current consumer.

## Related docs

- `bank-consumption-runner.html` — the runner chrome the calculator toggle
  lives in (topbar, alongside the clock §8 and grid §16).
- `bank-consumption-cat.html` — §16.6 exam-mode display leaks; the
  calculator is the deliberate *opposite* (a real tool, not a leak).
- `main.md` — overall MyNclex product plan.
