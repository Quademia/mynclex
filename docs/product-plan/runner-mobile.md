# Runner — mobile compatibility

Last updated: 2026-07-31 (slices 1–3 built + verified on dev, incl. the real
/session route; 4–8 open)

## What this is

`/session/[attempt_id]` — the practice/exam runner — is desktop-only. This
arc makes it work on a phone **without a second layout, a second route, or
rewriting any question type**. It is one new stylesheet, six additive DOM
nodes, and three small new components.

This is the `(focused)` item that `mobile-responsive.md` → *Not done*
has carried since 2026-06-21. That doc stays canonical for **navigation**
mobile; this one owns the runner.

Core audience is phone-first (Ghanaian nurses), and the runner is the
surface every student touches for every question. It is the widest-blast-
radius mobile gap in the product.

## The problem, measured

Not "it looks cramped" — the numbers, verified against the repo at
`89d06ac`:

- `styles/runner.css` is **3,147 lines with four responsive blocks**, and
  all four are cosmetic: hide the calculator/grid-toggle labels at 768px,
  hide the flag/bookmark labels at 480px, drop the bow-tie pool to one
  column at 720px, stop the scoring strip stranding its time on its own
  line. That is the entire responsive surface.
- **The structural layout has none.** `.rn-grid` is `width: 240px` +
  `flex-shrink: 0` (`runner.css:2378`) in a flex row beside `.rn-main`,
  and **no media query touches `.rn-body`, `.rn-main` or `.rn-grid`
  anywhere in the file**. On a 390px phone with the grid open, the
  question column is left with roughly **150px**.
- `.rn-split` (case + trend) is `minmax(380px,1fr) minmax(520px,720px)`
  + 24px gap = **924px minimum** (`runner.css:493`). Below that it cannot
  lay out honestly.

## Strategy

**One rule: the question column is the phone screen. Everything else
becomes a sheet you pull up and dismiss.** Nothing is deleted, nothing
moves to a second page.

**The enabling finding:** every interaction in the runner is *already a
tap*. Verified — zero `onDragStart` / `dataTransfer` / `draggable` in
`lib/practice/runner/types/`; `drag-cloze`, `drag-order` and `bowtie` are
tap-to-arm / tap-to-place with plain `onClick`, `cloze` uses native
`<select>`, `highlight` chunks are `<button>`s. **This is a layout and
chrome problem, not an interaction-model problem** — which is why the
arc is additive rather than a rewrite.

**Container queries, not `@media`.** Every rule keys off the width of
`.rn` itself. In production `.rn` *is* the viewport so they are
equivalent, but keying off the element means the phone layout also
renders correctly inside a frame — design review, screenshots, and the
runner tutorial sandbox — instead of being something only a real device
can show. `container-type: size` (not `inline-size`) because the
landscape rules query height.

**Breakpoint 899px**, derived not picked: it is where `.rn-split`'s
924px minimum gives out. Tablets in portrait get the phone layout rather
than a broken desktop one.

**Desktop is untouched, structurally.** The six new nodes are neutralised
above 900px by `display: contents` / `display: none`, not by promise.

## Source of truth

CD handoff bundle `design_handoff_runner_mobile`, built from
`QAcademy-Nurses/mynclex@main` tree `89d06ac` — which is the tree this
plan was written at, so nothing has drifted.

- `runner-mobile.css` (~640 lines) is **production code**, not a mock. It
  goes to `styles/`, imported after `runner.css`. Its header comment
  lists every component change it assumes.
- The prototype loads the repo's own `tokens.css` / `runner.css` /
  `calculator.css` verbatim and uses the repo's own class names, so the
  visual spec is the real cascade with one layer on top.
- **No new tokens, no new colours, no new assets.** All icons are the
  existing inline SVGs from `runner-topbar.tsx`.

Claims spot-checked against the repo before accepting the bundle: the
924px split, the hard-coded grid constants, the undefined `--surface`,
and the tap-only interaction model. All four held.

## Decisions settled with Sam (2026-07-31)

The handoff left three questions open. All three are now answered.

1. **Exam-live keeps the mode brief.** `examLive` exists to stop *the
   engine's opinion of this question* leaking (subject, difficulty
   pills). The mode brief is static copy about the rules of the sitting —
   it says nothing about any question. Different category, so it stays
   visible in the ⋯ sheet.
2. **The clock stays pinned; no auto-hide on scroll.** Hiding the clock
   is already the student's explicit choice, with a deliberate rule that
   it locks visible once a warning tier fires. Auto-hide would make the
   clock's visibility something the page does *to* them mid-exam — the
   opposite of that design. Also the cheaper answer.
3. **Forward-only modes get a full-width primary** (Sam). In live
   Sequential and CAT there is no Previous and no grid. The case for
   keeping dead 48px placeholders was "the bar doesn't shift between
   modes" — but a student is only ever in one mode per sitting, so the
   bar never shifts in front of anyone. Full width is a bigger Submit
   target in exactly the modes where a mis-tap costs most.

## ⚠ Correction to the handoff's build order

The handoff puts the **session menu in step 1** and **`runner-sheet.tsx`
in step 2**. That cannot work: the session menu *is* one of the five uses
of the sheet shell.

It matters beyond ordering. Step 1 removes `.rn-foot-msg` from the
footer, and the handoff is explicit that the mode brief is **relocated,
not deleted** — its new home is the ⋯ sheet. Ship step 1 without the
sheet shell and the mode brief does not move, it *disappears* on phones.

**Fix: `runner-sheet.tsx` lands in slice 1.** The slicing below reflects
that.

## The slices

Each is independently shippable. Slice 1 is the gate — nothing else works
properly on a phone until it lands.

### ✅ Slice 1 — Shell + sheet shell + session menu  *(built 2026-07-31)*

**Verified on dev at 390px and 1280px** via `/tutorial/exam`, which mounts
the real `<Runner>` and needs no login — the only way to see this surface
without an attempt.

- Question column measured **390px** at a 390px viewport. Before, the
  240px `flex-shrink: 0` rail left it **150px**. That is the slice.
- Desktop checked by computed style, not by eye: grid rail `flex`,
  `.rn-foot-msg` visible, `.rn-top-more` `none`, `.rn-foot-grid` absent,
  exit label visible, `.rn-options` still `margin-left: 32px`, `.rn-opt`
  `min-height: auto`, `.rn-top-ident` resolving to `contents`.
- Sheet proven: `role="dialog"`, `aria-modal`, focus moved in, body scroll
  locked, Escape closes, lock released, focus returned to the ⋯ button.
- Menu action proven end-to-end: tapping *Flag for review* toggled the
  flag, closed the sheet, and the topbar button came back
  `aria-pressed="true"`.
- Console clean. `tsc` at the 2 known errors; `runner.tsx` lint identical
  to baseline (13, all pre-existing).

⚠ **Correction to this entry as first written.** It claimed "no horizontal
overflow" flat. That was measured on **question 1, an MCQ** — not on the
eleven types and two wrappers the acceptance check actually names. On the
tutorial's own case study (Q13) the question column measures **956px
against a 390px viewport**: you get the scenario, and the question itself
sits 566px off-screen to the right behind a horizontal scrollbar.

Not a regression — `.rn-split` has always needed 924px and was worse
before, when the rail left the column 150px — and it is exactly what slice
4 exists to fix. But "no horizontal overflow" was an unqualified claim
built on one question, and the honest form is: **MCQ is clean; case and
trend overflow until slice 4.**

⚠ **Three defects found only by using the rendered page** — none by tsc,
lint or reading:

1. **Focus never returned to the opener.** The cleanup asked "is focus
   still inside the sheet?", but React detaches the sheet before the
   cleanup runs, so focus has already fallen to `<body>` and the answer
   was always *no*. The correct test is "is focus nowhere useful" —
   null, `<body>`, or inside the dying sheet.
2. **Two menu glyphs rendered as colour emoji** (🔖 🧮) beside two
   monochrome ones. The handoff says *no emoji anywhere* and names the
   existing SVGs; those are now exported from `runner-topbar.tsx` and
   reused, so the rows look like the controls they replace.
3. **A `setSheet(null)` effect on `[current]` cascaded a render** on
   every question change and failed `react-hooks`. Sheet-closing moves to
   the navigation call sites in slice 2, where something actually
   navigates from a sheet.

~~⚠ Known and deliberate until slice 2: the grid is unreachable on a
phone.~~ **Closed by slice 2** — the footer button now opens it.

⚠ **The tutorial coach is visibly broken at 390px** — its panel hangs off
the left edge and its avatar sits on top of the Previous button. Confirms
slice 8 empirically. It is pre-existing (the coach never had a phone
layout), not caused by this slice, but it is now easy to see.

#### What it did

`100dvh`, safe-area insets, `.rn-top-ident` two-bar topbar, the mode
brief out of the footer and into the ⋯ menu, full-width primary in
forward-only modes (decision 3).

Includes `runner-sheet.tsx` (see the correction above) and
`runner-session-menu.tsx`. Topbar goes from nine controls to five —
`[✕] [position stack] [clock] [⚑ flag] [⋯]`; bookmark, calculator and
grid toggle move into the menu. Flag stays on the bar because it is
per-question and frequent; bookmark moves because it is rarer and must
never be confused with the flag — in the sheet both get words.

Also lands the **`--surface` one-liner in `tokens.css`** (see Gotchas).

### ✅ Slice 2 — Grid sheet  *(built 2026-07-31)*

The same `<RunnerGrid>`, same props, same filter state — rendered inside
the sheet instead of the rail, reached from the footer button. The only
new prop is `compact`, and it exists solely to switch the band geometry.

⚠ **The handoff's warning was right, but about the wrong cause — and the
real cause was in its own CSS.** The constants were fine; what broke
alignment was `justify-content: center` on `.rn-sheet .rn-cells`. That
centres the six *tracks* inside a full-width grid, but the case bands are
absolutely-positioned siblings whose coordinates come from
`runner-grid.tsx`'s arithmetic, measured from the element's padding edge.
The tracks move, the bands do not.

Measured on the page: cells started at x=23, band 1 sat at x=266 for a
cell at x=293. **Band 1 covered no cells at all**, and the six-question
case band covered four of the wrong ones. Fixed by centring the *box*
(`width: max-content` + auto margins) so column 0 stays at x=0, which is
the coordinate space the bands assume.

**Proven both ways.** The same case now bands as **12–17 contiguous** in
each geometry — split `12 | 13–17` at 6×46 on the phone, and
`12–15 | 16–17` at 5×36 on the desktop. Two different row splits of one
correct case is what tells you the parameterisation actually works, rather
than one number happening to look right.

Also verified: desktop still 36/5/5 with no sheet and no footer button;
tapping a cell navigates, dismisses the sheet, releases the scroll lock
and leaves no scrim; the topbar and footer counters agree. Console clean,
tsc at the 2 known errors, `runner.tsx` lint level with baseline.

The desktop rail stays **mounted** on compact (hidden by CSS) rather than
being swapped out, so `gridOpen` and the filter survive a resize across
the breakpoint.

#### What it covers

`<RunnerGrid>` rendered inside the sheet, the `CELL / GAP / COLS`
change, and the colour key as a two-column grid of 44px rows.

⚠ The constants are hard-coded `36 / 5 / 5` and feed `bandsFor()`, which
positions the case bands. The phone grid is `46 / 8 / 6`, so the compact
flag must be **passed in**, not just restyled, or the case bands sit
behind the wrong cells.

⚠ The colour key became the outcome filter on 2026-07-30 — those legend
rows are real `aria-pressed` buttons with counts. It **cannot** collapse
to a wrapped one-line caption: you cannot shrink a control to a label.
Counts stay derived from `isVisibleUnderFilter`, never re-tallied.

**This is the only slice coupled to a file that moved during the design
work.** Re-check it against `runner-grid.tsx` before building.

### ✅ Slice 3 — Answers  *(built 2026-07-31)*

CSS only — no component changed. Verified by walking **every question type**
at 390px and measuring, not by looking:

| Type | Result |
| --- | --- |
| MCQ · True/False | indent 32px → **0**, option 71px / 48px |
| SATA | indent 0, option 48px |
| SELECT_N | indent 0, option 71px, count line sticky |
| CLOZE | select **36px** — the documented exception |
| HIGHLIGHT | chunk **45px** (was ~33) |
| DRAG_CLOZE | inline box **48px** (was **29** — the smallest target in the runner), token 44px |
| DRAG_ORDER | token 59px, slot row 50px |

No horizontal overflow on any of them. The only overflows left are
**MATRIX 456px, MATRIX_MR 629px, BOWTIE 412px** (slice 5) and the
**case/trend `.rn-split` at 940px** (slice 4) — all unbuilt, none touched
by this slice.

⚠ **The handoff's sticky count rule was inert, and I proved it before
replacing it.** It specified `position: sticky; bottom: 0` so the
"N of M chosen" line survives a long list. But `bottom` pins an element
that would fall *below* the scrollport — and `.rn-opt-count` renders
**before** `.rn-options` (`select-n.tsx:86`), so it starts above the fold
and leaves via the top, where a bottom inset never engages. Measured: the
line moved **152px while the container scrolled 152px**, exactly 1:1.

Fixed with `top: 0` and the gradient flipped (solid at the top, fading
down, so options pass out of view beneath it). Re-measured with enough
scroll to be conclusive — the first test was inconclusive because the
container only scrolled 152px while the line sat 176px down, so it never
reached the edge. With 312px of scroll it **holds at 14px**, the scroll
container's own padding edge.

ⓘ **SATA has no count line at all.** Only `select-n.tsx` renders
`.rn-opt-count` — it is the type with a cap to report against. The handoff
lists both types; the code has one.

#### The rules

Indent and max-width off, 44/48px tap targets, sticky "N of M selected"
count line. **This one slice fixes eight of the eleven question types.**

The 32px academic indent costs 8% of a phone screen for no reading
benefit, and the 460px cap is wider than the viewport anyway.

### ⬜ Slice 4 — Case & trend wrappers

`.rn-split` to a single column, `case-summary-card.tsx` in the question
column, both panels into the chart sheet with tabs and `visible_from`
reveal rules unchanged, CJMM strip to six dots, wide tables wrapped in
`.rn-table-scroll`.

### ⬜ Slice 5 — Matrix & bow-tie reflows

Matrix to a row-card stack (needs the per-cell `.rn-matrix-cell-label`,
since the phone layout hides the header row that names the column).
Bow-tie to a vertical stack via `order`, connectors hidden.

### ⬜ Slice 6 — Calculator sheet + remaining ⋯ rows

⚠ **Also the slice that must pin down the results sheet** — see Gaps.

### ⬜ Slice 7 — Landscape layer

`@container rn (max-height: 520px)`. Sheets become right-edge drawers; a
bottom sheet in 390px of height is useless. Above 700px wide the split,
the matrix table and the bow-tie shape all return.

Explicitly **not** a scaled-down desktop: fitting 924px into 844 means
`zoom ≈ 0.62`, which drops body copy to 9.6px and overrides the
student's own iOS text-size setting.

### ⬜ Slice 8 — Runner tutorial pass  *(added here; not in the handoff)*

The public walkthrough anchors coach steps to real runner controls, and
on compact three of those (bookmark, calculator, grid toggle) become
`display: none` and move into the ⋯ sheet. **An anchor pointing at a
hidden element is the exact failure the flag/bookmark arc already hit**
when the sandbox hid controls the coach pointed at.

Until this lands, assume the tutorial is broken-or-lying at phone
widths. See `runner-tutorial.md`.

## ⚠ What the verification does NOT cover

Everything checked so far has been **`/tutorial/exam`**. It mounts the real
`<Runner>` with the real stylesheets and needs no login, which makes it the
only way to see this surface without an attempt — but it is exactly **one**
configuration (`sandbox-data.ts`): `intent: STUDY`, `mode:
UNTIMED_LEARNING`, `live`. So these paths have never rendered:

**✅ Largely closed 2026-07-31** — Sam signed in on dev, so the real
`/session/[attempt_id]` route was driven with real attempt data:

- **Review mode** — a finished Free-Navigation sitting. The ⋯ sheet is
  right: the session name and `Review · tap a colour to filter…` brief
  both present, **no clock row at all**, and the flag row **disabled and
  greyed with "Flags cannot be changed after a sitting ends"**. The
  topbar's `Score · 64%` pill renders in place of the clock.
- **Forward-only** — a live CAT sitting at Q70. `.rn-foot-fwd` applied,
  Previous `display: none`, the primary spanning **356px of a 390px**
  viewport, and both the grid and flag buttons correctly absent. The
  counter reads `Q 70` with no total, as CAT requires. **Sam's decision 3
  is proven on real data, not just by injecting the class.**
- **The real route** — loads, renders and is usable at 390px.

Still unexercised:

- **Timed modes** — clock tiers, escalation tones, hide-clock locking once
  a warning fires.
- **Bookmark-absent modes** — CAT hides bookmark, and the CAT above was
  checked for flag/grid but not specifically for the bookmark row.

⚠ The live CAT also confirmed the **case/trend overflow on real data**
(`.rn-split` at 940px against 390px), on a *paid, one-shot* exam. A
student sitting a CAT on a phone currently meets a case study with the
question off-screen. That is the argument for slice 4 next.

## Gaps and risks

- **⚠ The results sheet is named and never specified.** State lists five
  sheet uses — `grid | chart | calc | menu | results` — and four get a
  full spec. "Results" is a word: nothing says what opens it, what is in
  it, or how the end-of-sitting popup relates to it. Probably "the
  existing popup becomes a sheet on compact", but that is an inference,
  not an instruction. Settle it in slice 6.
- **⚠ Repo gap, pre-existing, not a mobile issue:** `runner.css` uses
  `var(--surface)` **seven times** (`.rn-dd-slot-row`, `.rn-cloze-select`,
  `.rn-bt-slot.filled` and others) and **no file in `styles/` defines
  it** — verified. Those surfaces render transparent *today, on desktop
  too*. `runner-mobile.css` defines it defensively so the phone layer is
  honest, but **the real fix belongs in `tokens.css`** and is folded into
  slice 1.
- **First-paint flash.** `useIsCompact()` is `matchMedia`-based with an
  SSR-safe `false` default, so a phone's first paint is the desktop DOM
  for a blink before the three JSX decisions flip. The CSS layer masks
  most of it because the layout is container-query-driven. If a flash of
  the grid rail shows up in testing, this is what it is.
- **Slice 2 is coupled to a moving file.** `runner-grid.tsx` and
  `cell-state.ts` were rebuilt *during* the design work.

## Acceptance checks

- **At 1200px, desktop is pixel-identical to today**: grid rail
  `display: flex`, `.rn-foot-msg` visible, `.rn-top-more` and
  `.rn-foot-grid` `display: none`, exit label shown, `.rn-options` still
  has `margin-left: 32px`, `.rn-opt` has no min-height.
- At 390px: no horizontal overflow in `.rn-main-scroll` for any of the 11
  types or either wrapper.
- Submit is never under the iOS URL bar or the home indicator — test with
  the keyboard open on a CLOZE question.
- Case-band rectangles line up with the cells in the phone grid.
- Grid key counts match what tapping each row reveals, in both live-UL
  and review states; outcome rows absent when `revealCorrectness` is
  false.
- Every `title=`-only sentence appears somewhere visible — touch has no
  hover.
- 44px floor holds for every control, `.rn-cloze-select` excepted (a
  native select gets its own hit slop, and forcing it taller would break
  the baseline of the sentence it sits in).
- Landscape 812×390: sheets are right-edge drawers; above 700px the
  split, matrix table and bow-tie shape return.
