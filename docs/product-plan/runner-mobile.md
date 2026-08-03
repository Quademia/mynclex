# Runner — mobile compatibility

Last updated: 2026-08-03 (**the arc is CLOSED.** Slices 1–6 + 8 built; the
tablet-landscape band added; **slice 7 cancelled by Sam**. Two defects fixed
that this document had mis-diagnosed — see *The problem, measured*.)

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

⚠ **CORRECTION (2026-08-03) — that last bullet is the number, not the
cause, and this document leaned on it for three sessions.** The 924px is
real, but it is not what stops the split shrinking. Measured on the
rendered page:

- **`.rn-cjmm-strip` is the actual floor.** The 6-step stepper is a
  `nowrap` flex row with a min-content width of **534px**, and it alone
  holds the question column at 536px. Delete it and the entire rest of a
  case question — stem, meta, options, matrix — fits in **180px**. It sits
  within **2px** of the 520px column floor by coincidence, which is
  precisely why the floor looked like the culprit for so long.
- **`.rn-q-wrap`'s `margin: 0 auto` defeats the clamp.** On a grid item
  auto margins suppress stretch, so the wrap sizes shrink-to-fit to its own
  min-content and **overflows its track** rather than filling it — which
  also renders `max-width: 100%` on `.rn-matrix` inert, since 100% then
  resolves against a parent sized by that same content. ⚠ `runner.css`'s
  own comment above `.rn-q-wrap` calls this margin *"a no-op inside a
  case"*. It is not a no-op; it is the defect.

Consequence: lowering the column floors alone does nothing, which is what
the first attempt at this did. Both had to be fixed together.

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
`.rn` itself, which means the phone layout also renders correctly inside a
frame — design review, screenshots, and the runner tutorial sandbox —
instead of being something only a real device can show.
`container-type: size` (not `inline-size`) because the landscape rules
query height.

⚠ **This section used to say "in production `.rn` *is* the viewport so
they are equivalent". That is FALSE, and it shipped a bug** (fixed
2026-08-03). A classic scrollbar sits between the two: at a **900px
viewport `.rn` is 885px**. The CSS hid the case panel via the container
query while `useIsCompact()` — reading the *viewport* through
`matchMedia` — stayed `false` and never rendered the `<CaseSummaryCard>`
that stands in for it. In that band a case question showed **no scenario
at all**. Not clipped: absent. `use-is-compact.ts` now observes the
element with a `ResizeObserver`, so the two are structurally incapable of
disagreeing. **Never reintroduce a viewport measurement in this arc.**

**Breakpoint 899px**, derived not picked: it is where `.rn-split`'s
924px minimum gives out. Tablets in portrait get the phone layout rather
than a broken desktop one.

**Second band — 900–1300px, tablet LANDSCAPE** (added 2026-08-03). Not a
phone layout: the desktop layout stays, and four rules stop it clipping.
See *The tablet-landscape band* below.

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

## ▶ THE ARC IS CLOSED — nothing queued

**State (2026-08-03): slices 1–6 and 8 built and verified; the
tablet-landscape band built and verified; slice 7 CANCELLED by Sam.**
There is no next slice. Do not pick this arc up as queued work.

What "cancelled" means here, in Sam's words: **phones stay portrait.** We
are not designing a landscape phone experience, and if a student reports
one we reopen it — a decision, not an oversight. The reasoning is under
*Slice 7* below.

⚠ **The one known hole, accepted knowingly.** We cannot stop a student
rotating. A **large phone** in landscape — iPhone 15/16 Pro Max is 932px
wide — lands just above the 899px line and therefore gets the **full
desktop layout on a phone**, where case/trend still clip (measured: 139px
at 900, 79px at 960, grid rail open). Smaller phones are unaffected: an
iPhone 14 sideways is 844px, under the line, phone layout.

A cheap guard was offered and **declined**: make the phone layout apply
when the container is narrow **or short** (`height ≤ 520px`). It is ~3
lines now that `use-is-compact.ts` observes the element and already has
the height, and it separates cleanly — phones in landscape are 375–430px
tall, every tablet in landscape is ≥744px, so no tablet would be touched.
Recorded here so reopening is cheap.

**How to work this arc** (it paid off five times, so keep doing it):

- Copy each slice's section **from the bundle**, never from memory — the
  bundle is the verbatim original and this repo's copy is deliberately
  partial.
- Verify on the **rendered page**, not on tsc/lint. Every defect in
  slices 1–5 was invisible to types, lint and tests; four of them were in
  the handoff itself.
- `/tutorial/exam` mounts the real `<Runner>` with no login and carries
  all 11 types + both wrappers — best surface for **types**. The real
  `/session/[attempt_id]` (Sam signs in) is the only surface for
  **modes**. Use both; say which one a claim came from.
- ⚠ **Do not drive a live CAT or timed exam to test layout.** Opening one
  resumes a real sitting and `catTurnAction` fires on submit. Use review
  or the tutorial.
- Measure, don't eyeball: `scrollWidth > clientWidth`, computed styles,
  element rects. Several "fixes" looked right and were inert.

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

### ✅ Slice 4 — Case & trend wrappers  *(built 2026-07-31)*

`.rn-split` stacks, the panel moves into the chart sheet, and a new
`case-summary-card.tsx` holds the question's place in the flow.

**The overflow is gone.** Every case child and the trend question now
measure a question column of exactly **358px** inside a 390px viewport,
against **940–956px** before. Verified across the whole case block
(Q12, 14, 15, 16, 17) and the trend (Q18).

⚠ **One case child still overflows — Q13, at 422px — and it is not this
slice's.** Chased it down rather than assuming: the culprit is
`.rn-matrix` inside the case, whose column track has a min-content floor.
A standalone matrix overflows identically (456px). It belongs to slice 5.
Two theories were tested and discarded first — the CJMM dots (hiding them
changed nothing) and `.rn-q-wrap`'s `margin: 0 auto` defeating flex
stretch (the auto margin already computes to 0).

**The panel is built once and rendered in exactly one place** — beside the
question on desktop, in the sheet on a phone; never both. `<CasePanel>`
resolves its images through a Server Action, so a second mounted copy
would fetch every chart image twice. The handoff's approach (render both,
hide one with CSS) would have done exactly that.

The CSS hide rule is kept anyway, and it is load-bearing rather than
redundant: `useIsCompact()` is false for the first paint, so without it a
phone flashes the 924px panel before the effect flips.

⚠ **The CJMM step name is gated on `hideExamScaffold`,** exactly as the
desktop strip is (§16.6). The strip collapses to six 8px dots on a phone —
six clinical-judgment step names cannot fit a phone row — and the current
step is named in words in the summary card instead. Without the gate, the
phone would name the step in a live exam where the desktop deliberately
hides it.

**Verified:** summary card content reads *"CASE STUDY · 0 of 6 answered ·
Madam Efua Mensah, 68 — post-operative day 2 · Analyse cues · View chart ·
2 tabs"*; both sheets open with the panel intact, tabs preserved
(*History & Physical*, *Vital Signs*) and no internal overflow; sheet
titles read `Case study · 0 of 6 answered` and `Trend dataset`. Desktop
unchanged — split still `grid` at `380px 564px`, panel beside the
question, no summary card, CJMM steps 72px of words. Console clean.

#### What it covers

`.rn-split` to a single column, `case-summary-card.tsx` in the question
column, both panels into the chart sheet with tabs and `visible_from`
reveal rules unchanged, CJMM strip to six dots, wide tables wrapped in
`.rn-table-scroll`.

### ✅ Slice 5 — Matrix & bow-tie reflows  *(built 2026-07-31)*

**Every overflow in the runner is now closed.** Swept all 18 tutorial
questions at 390px — all eleven types and both wrappers — and
`.rn-main-scroll` fits on every one. This is the acceptance check slice 1
claimed prematurely; it is now true and measured rather than asserted.

| Was | Now |
| --- | --- |
| MATRIX 456px | fits |
| MATRIX_MR 629px | fits |
| BOWTIE 412px | fits |
| MATRIX inside a case (Q13) 422px | fits |

**Matrix → one card per row.** The row's statement becomes a full-width
sentence and each option a full-width 44px chip. ⚠ The `display: flex`
needs `!important` and that is load-bearing, not sloppiness: `matrix.tsx`
sets `grid-template-columns` **inline** (the column count is per-question)
and an inline style beats any stylesheet selector.

⚠ **The column name had to move into the cell.** Matrix cells are empty
`<button>`s — the column is named once, in a header row the phone layout
hides. So `matrix.tsx` and `matrix-mr.tsx` now render
`.rn-matrix-cell-label` inside each cell, hidden ≥900px. Plain text via
`richTextToPlain`, not `RichRender`: this is a 44px chip label, not a
content slot. Verified live — "Appropriate", "Cardiovascular",
"Consistent with sepsis".

**Bow-tie → a vertical stack ordered clinically** (condition, then what
led to it, then what to do), with the flare connectors hidden since they
point at columns that no longer exist. Slots 48px.

Desktop confirmed unchanged: matrix rows still `grid`, header row visible,
the new cell labels `display: none`, bow-tie still its `grid` shape.
Console clean, `tsc` at the 2 known errors.

#### What it covers

Matrix to a row-card stack (needs the per-cell `.rn-matrix-cell-label`,
since the phone layout hides the header row that names the column).
Bow-tie to a vertical stack via `order`, connectors hidden.

### ✅ Slice 6 — Calculator docked  *(built 2026-08-01)*

The calculator opened as its desktop floating `.calc-panel` on a phone
too — a 264px window you drag by its title bar, over the question.
It is now the sheet every other floating thing in the runner became:
`position: static`, full width, no border or shadow, 52px keys (40px on
the memory strip). Same component, same engine, same markup.

**⚠ The slice was smaller than its title.** "Remaining ⋯ rows" was
already done — the handoff's row list (flag · bookmark · calculator ·
hide-clock · Exit, plus session name, mode and brief) is exactly what
`runner-session-menu.tsx` shipped in slice 1. Nothing was left.

**⚠ The handoff's wiring could not have worked.** It routes the compact
calculator through `sheet === 'calc'`. Two independent reasons it cannot:

- **`SandboxCoach` reads `calcOpen`.** Moving the compact truth into
  `sheet` leaves the tutorial's calculator step watching a flag that no
  longer flips on a phone — silently, with `tsc` and the whole suite
  clean. The same class of breakage as the flag arc's coach anchors
  pointing at controls the sandbox hid.
- **`<RunnerSessionMenu>`'s rows call `onToggle()` and then `onClose()`,
  and `onClose` is `closeSheet`.** A row that set `sheet='calc'` would be
  nulled by its own next statement. The calculator would never open at
  all — the failure is total, not subtle.

So **`calcOpen` stays the single source of truth** and the sheet hangs
off it: `{compact && calcOpen && <RunnerSheet title="Calculator">}`, with
the floating panel gated `{!compact && …}`. One renders or the other,
never both, which is what keeps `fixed`/264px off the phone without an
`!important`. The handoff's actual concern — calculator and sheet stack
both open — holds anyway: `.rn-sheet-scrim` covers all of `.rn`, so
nothing that opens another sheet is reachable while this one is up.

**⚠ The handoff's CSS leaves `.calc-head` standing** while the sheet
draws its own head. Rendered, that is two "Calculator" titles and two
close buttons stacked. Hidden here; the sheet owns the frame. ⚠ The
block is scoped to `.rn-sheet`, **not** to the container query the bundle
used — on compact the floating panel is not rendered at all, so the only
`.calc-panel` inside a sheet is the docked one, and scoping this way
leaves `calculator.css`'s own ≤768px rules intact for any surface that
mounts `<Calculator>` later. Every selector is one class deeper than what
it overrides, so import order between the two stylesheets is irrelevant.

**⚠ `onClose` must be a stable callback**, not an inline arrow.
`<RunnerSheet>`'s focus/scroll-lock effect depends on its identity, so a
fresh closure each render tears the sheet down and re-runs it — snatching
focus back to the top on every keystroke. `closeCalc` is a `useCallback`.
Proven: focus stayed on `=` across four re-renders.

**The sheet union lost both unreachable members.** `'calc'` never was one
(see above), and `'results'` is settled below.

**Verified at 390px on `/tutorial/exam`:** exactly one `.calc-panel` in
the DOM, `position: static`, 390px wide, border `0px`, shadow `none`,
`touch-action: auto`, `.calc-head` `display: none`, one visible title,
keys 52/40px. **7 × 8 = 56** computed inside the sheet. Escape and the
scrim both close it, scroll lock released, focus returned to
`.rn-top-more`, and the scrim tap does **not** select the answer
underneath. Reopening shows `aria-pressed="false"` — the toggle
round-trips with no stuck state. A calculator open on desktop becomes a
docked sheet on resize to 390px. No horizontal overflow, console clean.
**Desktop proven unchanged by computed style:** `fixed`, 264px, top 76,
1px border, shadow present, `touch-action: none` (drag intact), head
visible at 38px, keys 42px, zero sheets. 855 tests pass; lint unchanged
at its 13 pre-existing `react-hooks` problems.

#### ⓘ Not done here — the nested dialog

`.calc-panel` carries `role="dialog" aria-label="Calculator"`, so inside
the sheet (itself `role="dialog" aria-modal="true"`) there are two nested
dialogs. Invisible, wrong, and deliberately left: fixing it means editing
`lib/calculator/calculator.tsx`, which is the app-wide widget, and the
visual work needed no change there. Its own `.calc-close` also survives
in the DOM inside the hidden head — harmless (`display: none` is out of
tab order, and it is neither the first nor last node in the focus trap).
Worth its own small job.

### ✅ The results sheet — settled 2026-08-01, it stays a modal

State listed five sheet uses and four had a spec; **"results" was a word
in a list**. Confirmed independently before asking: across the whole
bundle it appears **exactly twice** — `README.md` §6 ("used five ways…")
and the state union it hands over. Neither says what opens it or what is
in it.

**Sam's decision: the end-of-sitting popup stays a centred modal at every
width.** Two reasons:

- **It is the one floating thing in the runner that is not a
  peek-and-return tool.** Grid, chart, calculator and menu are all "check
  something, go back to the question". `ResultsPopup` is terminal — the
  sitting is over and it is where the student picks what happens next
  (report / review / retake). A sheet's grammar is swipe-to-dismiss, and
  dismissing is the least useful thing available there.
- **Nothing is broken.** Unlike every fixed-width element slices 1–5
  fixed, `ViewerModalShell` is already fluid — `width: 100%`,
  `max-width: 460px`, 24px backdrop padding, `max-height: 80vh`,
  scrolling body — so at 390px it is a centred ~342px card.

⚠ **It has still not been seen at phone width.** `ResultsPopup` is
mounted only in the real `/session/[attempt_id]` route, never in the
sandbox, so it cannot be reached from `/tutorial/exam` — the same
verification limit this document already records. The decision rests on
computed CSS plus what the element is for, not on the rendered page.
Look at it during the next signed-in pass.

### ✅ The tablet-landscape band — 900–1300px  *(built 2026-08-03)*

**Not in the handoff, and not a phone layout.** The desktop layout stays
exactly as it is; four rules stop it clipping.

**Why it existed.** A tablet in portrait is ≤899px and gets the phone
layout — Sam tested that and it was fine. **Rotate it** and the desktop
layout takes over at a width it cannot honour. Measured at 1024×768
(classic 4:3 iPad landscape, and much of Android): **35px of the question
cut with the grid rail closed, 227px with it open** — and with **no page
scrollbar**, so the hidden part was reachable only via a sub-region
scrollbar a student will never find. Case study and trend only; all 11
standalone types measured clean.

⚠ **The threshold moves with the grid rail**, which is why it looked
size-dependent: the rail is a fixed 240px open / 87px collapsed. Same
1180px viewport — **56px cut with the grid open, 0px with it closed.**

The cause was **not** the 520px floor; see the correction under *The
problem, measured*. The four rules:

```css
@container rn (min-width: 900px) and (max-width: 1300px) {
  .rn-split      { grid-template-columns: minmax(250px, 1fr) minmax(400px, 720px); }
  .rn-cjmm-strip { flex-wrap: wrap; }
  .rn-q-wrap     { min-width: 0; }
  .rn-matrix     { max-width: 100%; overflow-x: auto; }
  .rn-split > .rn-q-wrap { margin-inline: 0; }   /* the load-bearing one */
}
```

- The case column keeps `1fr`, so its floor **only binds in the tightest
  configuration** (narrow screen AND rail open); with the rail closed the
  panel still grows past 400px.
- Wrapping the strip costs **no height until it actually wraps** — 44px is
  its normal single-row height, not an increase. (⚠ I claimed a 44px
  vertical cost mid-session and it was a misreading of my own measurement.)
- ⚠ **1300, not 1250:** at 1251 the desktop floors land on *exactly* the
  width available (939 vs 939) — zero margin. The band must end where the
  desktop layout has room to spare, not where it merely fits.

⚠ **The grid rail is deliberately untouched.** Narrowing it to 180px fixes
the split but overflows `.rn-cells` (needs 204px; fixed 5-column grid) —
and the case bands are absolute-positioned from **JS-computed offsets**
against those cells, which the 2026-07-31 slice already broke once. Not
worth 60px.

**Verified**, grid rail OPEN (the worst case): all **18** tutorial
questions — 11 types + both wrappers — **0px clipped across 1024–1300**.
Desktop proven untouched **by computed style** at 1440 (tracks
`384px 720px`; every band rule confirmed off). Console clean.
Sam confirmed on a real tablet.

⚠ **Measured, not structural.** The band is verified against the
tutorial's content. A case study with a **substantially wider matrix**
than any we hold could still clip; the general answer is the phone's
row-card treatment, deliberately not pulled into this band.

⚠ A **pre-existing** 16px overflow inside `.rn-q-wrap` on SELECT_N at
390px was found and confirmed present on unmodified code (verified by
stashing the change and re-measuring). Left alone — not a regression.

### ❌ Slice 7 — Landscape layer  *(CANCELLED 2026-08-03, Sam)*

**Was:** `@container rn (max-height: 520px)`. Sheets become right-edge
drawers; a bottom sheet in 390px of height is useless. Above 700px wide
the split, the matrix table and the bow-tie shape all return. Explicitly
**not** a scaled-down desktop: fitting 924px into 844 means `zoom ≈ 0.62`,
which drops body copy to 9.6px and overrides the student's own iOS
text-size setting.

**Why it was cancelled.** Two reasons, in order:

1. **The tablet complaint that made it look urgent was never slice 7's to
   fix.** It was a fixed-width floor in the *desktop* layout, and it is
   now fixed there — by the band above, on the width axis, with no JS and
   no breakpoint change. Slice 7 would have answered a tablet problem by
   giving tablets a phone layout, which is the wrong shape of answer.
2. **Sam's call: phones stay portrait.** We are not designing a landscape
   phone experience. Reopen if a student reports one.

Also weighing on it, and worth keeping if it is ever revisited: a
landscape phone today is **cramped, not lying** — it shows correct
information in a tight space, a materially weaker case than slice 8's
public tutorial, which was actively teaching a screen that did not exist.
And the expensive half (restoring the split) forces `useIsCompact` to
become two-dimensional, touching the three structural decisions the whole
arc rests on. If revisited, take **only the cheap half** — chrome shrink +
sheets as right-edge drawers — and leave the split restoration alone.

See *▶ THE ARC IS CLOSED* for the one accepted hole (large phones
sideways) and the ~3-line guard that was offered and declined.

### ✅ Slice 8 — Runner tutorial pass  *(built 2026-08-01; not in the handoff)*

The prediction was right and understated. Measured at 390px, **9 of the
coach's 17 anchors were not on screen**: five hidden by the phone layout
(`bookmark`, `calc`, `grid`, `gridfilters`, `legend`) and four more
(`casepanel`, `casetabs`, `trendpanel`, plus the grid's own children)
reachable only inside a sheet. `/tutorial/exam` is **public and needs no
login**, so this was the one broken surface in the whole arc that a
prospective student could reach before paying anything.

**The fix follows the controls rather than hiding the steps.** Nothing
was deleted by the phone layout — bookmark, calculator and hide-clock
moved into the ⋯ menu, the grid rail became a sheet, the chart became a
sheet behind the summary card. So a step now declares `phoneSheet`, the
coach opens it, and the ⋯ menu rows carry **the same `data-coach` names
as the topbar buttons they stand in for**.

**⚠ Anchoring is now "first VISIBLE match", and that is doing two jobs.**
A hidden button is skipped — but so is a **duplicate**: the grid rail
keeps its marker in the DOM while hidden on compact *and* the grid sheet
renders the same component, so a plain `querySelector` found the rail the
student cannot see. One rule settles both, and the coach never has to
know which layout it is in.

#### ⚠ Three findings, none from tsc, lint or the suite

1. **The off-screen card was our own CSS.** The phone block forced
   `left: 8px !important` while `.tc-centered` still applied
   `translate(-50%, -50%)` — placing the card at 8px and then dragging it
   back by half its own width. **Measured at −179px on a 390px screen.**
   Positioning now belongs entirely to `place()`; the stylesheet only
   sizes, and may never again set left/top/transform. The breakpoint also
   moved **768 → 899** to match `RN_COMPACT_QUERY`: they disagreed by
   131px, a band in which a phone-shaped runner got a desktop-shaped coach.
2. **The ring took the sheet's mid-animation position** — correctly
   sized, **370px low**, spotlighting nothing. Both existing measurements
   (a rAF and a 90ms timeout) land inside the sheet's 220ms slide-up.
   Fixed by re-placing on `animationend`, **not** a third hard-coded
   delay: the sheet's duration is not the coach's to know and is disabled
   under `prefers-reduced-motion`. ⚠ This one was introduced by the slice
   itself and caught only by measuring the rendered page.
3. **⚠ THE "AVATAR" DEFECT NEVER EXISTED.** This document recorded that
   the coach's avatar sits on the Previous button. That element is
   `NEXTJS-PORTAL` — the Next.js **dev toolbar** — absent from
   production. One of slice 8's three stated defects was a development
   artefact mistaken for a product bug, and it survived here because it
   was seen in a screenshot and never identified.

**⚠ Layering:** the coach card sits at z 55 and sheets at 61, so a sheet
the coach opened would have covered the coach. Raised above the sheet
layer **on compact only**; the scrim rises too (so the ring can land on a
row *inside* a sheet) and stays `pointer-events: none`.

**Copy.** Steps whose desktop sentence names something a phone lacks now
carry a `phoneBody` — the clock's "use the button" (that button is in the
⋯ menu), the case study's "the chart stays **beside** the question"
(there is no second column), the trend and grid steps. The closing recap
gained a phone variant: the desktop one recites a **nine-control topbar**
to someone looking at **five**. Only the two lines that describe *where* a
control lives differ; the rest is reused, because a second full copy is a
second thing to keep true.

**Verified at 390px on the rendered page:** card fully on screen at every
step checked, ring on a visible target every time, ⋯ sheet for
bookmark/calculator, grid sheet for grid/filters/colours, chart sheet for
case/trend — **and closed again for the footer step**, so no sheet
outlives the step that opened it. Desktop proven unchanged: 340px card,
z 55, anchored to `.rn-calc-btn`, **zero sheets opened**, desktop copy.
Console clean. **855 → 870 tests**, and the new phone-sheet guard was
**proven to bite** by deleting one `phoneSheet` — it failed naming the
step.

⚠ **Not covered:** the steps between section starts were not each walked
(the jump menu reaches 20 of 33, and gates block the rest without
answering questions); `cjmm` was reasoned to stay in the question column
rather than measured on a case question; and none of this has been seen
on a real device. See `runner-tutorial.md`.

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

## ⬜ NOT BUILT — the complete list

Everything below is knowingly absent as of 2026-08-03. Nothing here is a
regression; each is either a cancelled slice or a pre-existing condition.

**Slices**
- ~~**6** — calculator docked.~~ ✅ **Built 2026-08-01.** The remaining ⋯
  rows turned out to be already done, and the results sheet is settled as
  a modal rather than built. Left behind: the nested `role="dialog"`
  inside the calculator sheet (see slice 6).
- ~~**7** — the landscape layer.~~ ❌ **CANCELLED 2026-08-03 by Sam** —
  phones stay portrait, reopen if a student reports it. The tablet
  complaint that made it look urgent was fixed in the *desktop* layout
  instead (see *The tablet-landscape band*), which is where it belonged.
  Full reasoning, and the cheap half worth taking if it is ever revisited,
  under *Slice 7* above.

  ⚠ **Accepted hole:** a large phone sideways (iPhone 15/16 Pro Max,
  932px) is just above the 899px line, so it gets the desktop layout and
  case/trend clip there. A ~3-line guard (compact when narrow **or**
  short) was offered and declined; it is described under *▶ THE ARC IS
  CLOSED*.
- ~~**8** — the runner tutorial pass.~~ ✅ **Built 2026-08-01.** ⚠ And one
  of its three stated defects — the avatar over the Previous button — was
  **never real**; it was the Next.js dev toolbar. See slice 8 above.

**Verification not done**
- **Timed modes** — clock tiers, escalation tones, and hide-clock locking
  once a warning fires, all at phone width.
- **The bookmark row's absence** in CAT / packs / tutor quizzes
  specifically (flag and grid were checked there; bookmark was not).
- **A real device.** Everything is a resized desktop browser, so
  `env(safe-area-inset-*)`, the iOS URL bar and the on-screen keyboard
  over a CLOZE `<select>` are all untested in the flesh.

**Known and accepted**
- **First-paint flash.** `useIsCompact()` is `false` on the server, so a
  phone paints the desktop tree for one frame. The CSS masks nearly all of
  it; the case panel is explicitly covered by a hide rule.
- **`--surface` changes desktop.** `tokens.css` now defines it, so three
  runner controls that have been rendering *transparent* — on desktop too
  — become white. A fix, but a desktop-visible one riding in a mobile arc.
  **Look at it before this ships to prod.**
- **A pre-existing hydration mismatch in `ClockGroup`** surfaces as "1
  Issue" in the dev overlay: the clock renders `1:42:6` server-side and
  `1:42:7` client-side. Untouched by this arc, and unrelated to it.

## Gaps and risks

- ~~**⚠ The results sheet is named and never specified.**~~ ✅ **Closed
  2026-08-01** — settled with Sam as *stays a modal*, and the inference
  recorded here ("probably the existing popup becomes a sheet") was
  **wrong**. See *The results sheet* above.

  ⚠ **Two counts follow from this and are now stale in code.**
  `<RunnerSheet>` has **four** uses, not five — grid · chart · calculator
  · session menu — while the `sheet` union has **three** members, because
  the calculator hangs off `calcOpen` instead. The two numbers differ on
  purpose and neither is five. `runner-sheet.tsx`'s header comment and
  `runner-mobile.css`'s sheet-section comment both still say *"five uses"*
  and both still list *results*.
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
