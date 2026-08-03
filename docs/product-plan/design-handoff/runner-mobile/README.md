# Handoff: Runner — mobile compatibility

## Overview

`/session/[attempt_id]` — the practice/exam runner — is desktop-only today. It renders a three-region shell (56px topbar with nine controls, fluid question column, fixed 240px grid rail) plus a 924px-minimum two-column split for case-study and trend questions. Below ~950px viewport width it stops laying out honestly; below ~420px several regions are unusable. Students are phone-first.

This package makes the runner work on a phone **without a second layout, a second route, or a rewrite of any question type**. It is one new stylesheet plus six additive DOM nodes and three small new components. Above 900px, nothing changes — verified.

The key finding from reading the source: **every interaction in the runner is already a tap.** `drag-cloze.tsx`, `drag-order.tsx` and `bowtie.tsx` are tap-to-arm / tap-to-place with plain `onClick` (no HTML5 drag, no pointer events, no `dataTransfer`); `cloze.tsx` uses native `<select>`; `highlight.tsx` chunks are inline `<button>`s. So this is a layout and chrome problem, not an interaction-model problem.

---

## About the design files

The `prototype/` folder contains **design references built in HTML** — they show intended look and behaviour. Do not ship them.

They are unusual in one respect, and it is the point of this handoff: the prototype loads **the repo's own stylesheets verbatim** (`styles/tokens.css`, `styles/runner.css`, `styles/calculator.css`) and uses **the repo's own class names and icon SVGs**. So the visual spec is not a picture to match — it is the real CSS cascade with one extra layer on top.

That extra layer, **`runner-mobile.css` at the root of this folder, is intended as production code.** Copy it into `styles/`, import it after `runner.css`, and read its header comment: it lists every component change it assumes. Adjust to taste, but the selectors, values and comments are written for the repo, not for the prototype.

- `runner-mobile.css` — **the deliverable.** ~640 lines, three rule groups (base, compact, landscape).
- `prototype/Runner Mobile Prototype.dc.html` — interactive prototype: all 11 question types, both wrappers, all five sheets, width switcher (390 / 768 / 1200) and portrait/landscape toggle. Open it in a browser.
- `prototype/Runner Mobile.dc.html` — the written proposal: the audit with measurements, the system, nine annotated phone screens, per-type notes, build order.
- `prototype/styles/*.css` — copies of the repo files at the commit below, so the prototype renders standalone. **Do not copy these back into the repo** — they are read-only snapshots, and `runner.css`/`tokens.css` may have moved on.
- `prototype/support.js` — runtime for the prototype only. Irrelevant to the implementation.

## Fidelity

**High-fidelity.** Colours, type, spacing, radii and states all come from `tokens.css` + `runner.css` as they exist in the repo. No new colours, no new fonts, no new tokens are introduced anywhere in this work. Where the mobile layer sets a number (44px targets, 52px topbar, 46px grid cells, 20px sheet radius) it is stated explicitly in `runner-mobile.css` and repeated below.

---

## Source baseline

Read and built from `QAcademy-Nurses/mynclex@main`, tree `89d06ac663ae` (2026-07-31).

| Read | Why |
| --- | --- |
| `app/(app)/(focused)/session/[attempt_id]/runner.tsx` | shell composition, `.rn` / `.rn-body` / `.rn-main-scroll`, sheet-worthy state, `.rn-split` branches |
| `…/runner-topbar.tsx` | the nine controls, icon SVGs, clock group, existing 768/480 rules |
| `…/runner-footer.tsx` | `[Prev][modeMsg][Primary]`, disable logic |
| `…/runner-question-area.tsx` | `.rn-q-wrap`, meta pills, per-type dispatch, stem-takeover types |
| `…/runner-grid.tsx` | **rebuilt 2026-07-31** — progress rail + colour-key-as-filter |
| `lib/practice/runner/cell-state.ts` | `deriveCellFill`, `isVisibleUnderFilter`, `GridFilter` (10 values), `FILL_LABEL` |
| `lib/practice/runner/mode-brief.ts` | footer status copy per archetype |
| `lib/practice/runner/scoring-strip.tsx` | review strip markup + copy |
| `lib/practice/runner/case/case-panel.tsx`, `trend/trend-panel.tsx` | wrapper panels, tabs, reveal rules |
| `lib/practice/runner/types/*.tsx` (all 11) | per-type markup and class names |
| `styles/runner.css` (88,843 b), `styles/tokens.css`, `styles/calculator.css` | every value used below |

⚠ **Sync note.** `runner-grid.tsx` and `cell-state.ts` changed *during* this design work (grid rail went from four correctness-gated tabs to three progress buttons; the colour key became the outcome filter). Everything here reflects the new version. If they have moved again, re-check the grid-sheet section — it is the only part of this handoff coupled to that file.

---

## Strategy

**One rule: the question column is the phone screen. Everything else becomes a sheet you pull up and dismiss.** Nothing is deleted, nothing moves to a second page.

### Why container queries, not `@media`

`runner-mobile.css` keys every rule off the width of `.rn` itself:

```css
.rn { container-type: size; container-name: rn; height: 100dvh; }
@container rn (max-width: 899px) { … }
@container rn (max-height: 520px) { … }
```

In production `.rn` *is* the viewport, so container and media queries are equivalent — but keying off the element means the phone layout also renders correctly inside a frame (design review, the runner tutorial sandbox at `docs/product-plan/design-handoff/runner-tutorial/`, screenshots) instead of being something only a real device can show. `container-type: size` (not `inline-size`) because the landscape rules query height; `.rn` has a definite height, so size containment is safe. It also makes `.rn` the containing block for the sheets.

If your team would rather not adopt container queries, the same rules work verbatim as `@media (max-width: 899px)` / `@media (max-height: 520px)` — replace `100cqh` with `100dvh` in the one landscape `max-height` calc.

### Why 899px

`.rn-split` is `minmax(380px, 1fr) minmax(520px, 720px)` with a 24px gap = **924px minimum**. 899 is where that gives out, so tablets in portrait get the phone layout rather than a broken desktop one.

---

## Component changes required

All six are additive and inert above 900px. `runner-mobile.css` contains the base rules that neutralise them (`display: contents`, `display: none`).

### 1 · `runner-topbar.tsx`

- Wrap `.rn-top-title`, `.rn-top-spacer` and `.rn-counter` in a single `<div className="rn-top-ident">`. Base CSS gives it `display: contents`, so the desktop flex row is byte-for-byte what it is today.
- Move the exit label into a span: `← <span className="rn-top-exit-label">Exit</span>`.
- Add a new overflow button, always rendered (CSS hides it ≥900px):
  ```tsx
  <button type="button" className="rn-top-more" onClick={onOpenMenu} aria-label="Session menu">⋯</button>
  ```

### 2 · `runner-footer.tsx`

Add a grid button, always rendered, after the primary side:
```tsx
<button type="button" className="rn-foot-grid" onClick={onOpenGrid} aria-label="Question grid">
  <GridIcon /><span className="n">{current}/{total ?? '–'}</span>
</button>
```
Render it only when `gridAvailable` (same condition as the topbar's grid toggle) — it must not appear in live Sequential/CAT, which have no grid.

### 3 · `runner-grid.tsx`

`CELL`, `GAP` and `COLS` are hard-coded (36 / 5 / 5) and feed `bandsFor()`, which positions the case bands. The phone grid uses **46 / 8 / 6**, so pass the compact flag in and derive the constants from it, or the case bands will sit behind the wrong cells:

```ts
const { CELL, GAP, COLS } = compact
  ? { CELL: 46, GAP: 8, COLS: 6 }
  : { CELL: 36, GAP: 5, COLS: 5 };
```
Keep them in sync with `--rn-cell` / `--rn-cell-gap`, which `runner-mobile.css` overrides inside `.rn-sheet .rn-grid`. (A `useLayoutEffect` read-back would also work; the file's comment explains why it was avoided.)

### 4 · `matrix.tsx` and `matrix-mr.tsx`

The column name currently lives only in the header row, which the phone layout hides. Render it inside each cell (CSS hides it ≥900px):
```tsx
<button className={cls.join(' ')} …>
  <span className="rn-matrix-cell-label">{col.label}</span>
</button>
```

### 5 · `runner.tsx` — one hook, three decisions

```ts
const compact = useIsCompact();   // matchMedia('(max-width: 899px)'), SSR-safe default false
```
CSS cannot do these three:
1. Render `<RunnerGrid>` inside `<RunnerSheet>` instead of in `.rn-body`.
2. Render `<CasePanel>` / `<TrendPanel>` inside `<RunnerSheet>`, and a `<CaseSummaryCard>` in the question column.
3. Pass the bookmark / calculator / grid actions to the session menu instead of the topbar.

Everything else is CSS.

### 6 · New components

**`runner-sheet.tsx`** — the one bottom-sheet shell, used five ways (grid, chart, calculator, session menu, results).
```tsx
<RunnerSheet title="Question grid" onClose={…}>{children}</RunnerSheet>
```
Renders: `.rn-sheet-scrim` (click = close) + `.rn-sheet` > `.rn-sheet-grab` + `.rn-sheet-head` (`.rn-sheet-title` + `.rn-sheet-close`) + `.rn-sheet-body`. Owns focus trap, `Escape`, `aria-modal`, body-scroll lock, and returning focus to the trigger. Max height `85dvh`, safe-area padding on the body. The CSS is written; the behaviour is yours.

**`runner-session-menu.tsx`** — the ⋯ contents. Session name + mode + the mode brief (from `footerBrief()`), then rows for flag, bookmark, calculator, hide-clock, then Exit. Every row carries the sentence its desktop `title=` tooltip used to carry — see the copy table below.

**`case-summary-card.tsx`** — persistent 2-line stand-in for the case/trend panel in the question column, with a *View chart* button and (for cases) the CJMM step. Class `.rn-case-summary`; markup shape is in the prototype.

---

## Region-by-region spec

Every value below is in `runner-mobile.css`; this is the prose version.

### Topbar — five controls (52px + safe-area-inset-top)

`[✕ exit] [position stack] [clock pill] [⚑ flag] [⋯]`

- `.rn-top-ident` becomes `flex-direction: column-reverse`, so the counter (14px/800) sits above the meta line (10.5px, ellipsised). `.rn-top-title .name` hides — it reads in full in the ⋯ sheet. `.rn-top-spacer` hides.
- `.rn-top-exit` → 40×40 icon, borderless, label hidden.
- `.rn-flag-btn` and `.rn-top-more` → 40×40, 9px radius, no label.
- `.rn-bookmark-btn`, `.rn-calc-btn`, `.rn-grid-toggle-btn` → `display: none` (they move to the ⋯ sheet).
- `.rn-clock-eye` hides (the ⋯ sheet has "Hide the clock"); `.rn-clock-pill` keeps its tier tones untouched — the countdown escalation is unchanged.

Flag stays on the bar because it is per-question and frequent; bookmark moves because it is rarer and, per `runner-topbar.tsx`'s own comment, must never be confused with the flag — in the sheet both get words.

### Footer — back · primary · grid (auto height + safe-area-inset-bottom)

- `.rn-foot-msg` → `display: none`. It is a 70–100 character sentence from `footerBrief()`; on a phone it either wraps to three lines or crushes the primary button. It reads in full in the ⋯ sheet. **It is not deleted — it is relocated.**
- `.rn-foot-side.right { flex: 1 }` and `.btn-accent { width: 100%; min-height: 48px; border-radius: 10px; font-size: 15px }`.
- `.btn-ghost` (Previous) → 48×48, `font-size: 0` with a `::before { content: '←' }` so the label collapses to a glyph without touching the JSX. Its disabled reason (at Q1, or Sequential mode) currently lives in `title=` — surface it as a toast or inline line if you want it on touch; it is listed as an open question below.
- `.rn-foot-grid` → 48×48 with the position counter under the glyph.

### Sheets

One pattern, five uses. `20px 20px 0 0` radius, `0 -8px 32px rgba(15,23,42,.18)`, `max-height: 85dvh`, 220ms `cubic-bezier(.22,.9,.3,1)` slide-up, scrim `rgba(17,24,39,.42)` at 160ms, both suppressed under `prefers-reduced-motion`. `overscroll-behavior: contain` on the body. `position: absolute` inside `.rn` — identical to `fixed` in production, and it keeps the sheet inside a framed runner (the tutorial sandbox).

### Grid sheet

Reuses `<RunnerGrid>` unchanged. Overrides inside `.rn-sheet .rn-grid`: `--rn-cell: 46px`, `--rn-cell-gap: 8px`, six columns, centred; `.rn-grid-title-row` hidden (the sheet head says it); rail buttons to 44px min-height.

⚠ **The colour key is now the outcome filter** (`runner-grid.tsx`, 2026-07-31): `.rn-grid-legend .row.act` rows are real `aria-pressed` buttons with counts, including a two-swatch "Dropped marks" that unions wrong + partial, plus one inert "Current" row. So the key **cannot** be squeezed into a wrapped one-line caption on phone — you cannot shrink a control to a label. It becomes a **two-column grid of 44px rows**, which fits the eight controls plus the cells in one sheet.

Counts must stay derived from `isVisibleUnderFilter` (as the rebuilt file does) — never re-tallied per filter.

### Case & trend wrappers

- `.rn-split` → single column; `.rn-split > .rn-case` / `> .rn-trend` hidden (they render inside the chart sheet instead).
- `.rn-case-summary` shows in the question column: label + counter pill, 2-line title, *View chart · N tabs*, and for cases the CJMM position.
- **CJMM strip** → six 8px dots (`.rn-cjmm-step` with `text-indent: -9999px`; `.done` accent, `.current` 10px with a 3px accent ring, arrows hidden). Six clinical-judgment step names cannot fit a phone row; the step is named once, in words, under the button.
- Chart sheet keeps `<CasePanel>` / `<TrendPanel>` intact — tabs, `visible_from` reveal rules, scenario block, all unchanged. Wrap wide tables in `.rn-table-scroll` (`overflow-x: auto`); `.rn-trend-table { min-width: 460px }` so columns scroll instead of crushing.

### Answers — the shared changes

- `.rn-options`, `.rn-opt-count`, `.rn-matrix` → `margin-left: 0; max-width: none`. The 32px academic indent costs 8% of a phone screen for no reading benefit and the 460px cap is wider than the viewport anyway.
- `.rn-opt` → `min-height: 48px`, `padding: 12px 13px`, `gap: 10px`, 14.5px. The three-channel state encoding (left border + letter circle) is untouched.
- `.rn-opt-count` (SATA/SELECT_N) becomes sticky to the bottom of the scroll area with a gradient fade, so "2 of 3 selected" survives a list longer than the screen.
- `.rn-main-scroll` → `padding: 14px 16px 16px`, `overscroll-behavior: contain`.

### Per-type reflows

| Type | Change |
| --- | --- |
| MCQ · TF | Shared rules only. |
| SATA · SELECT_N | Shared rules + sticky count line. |
| MATRIX · MATRIX_MR | Row-card stack: `.rn-matrix-row.head` hidden, `.rn-matrix-row:not(.head) { display: flex !important; flex-direction: column }` (`!important` because the per-question `grid-template-columns` is set inline by the runner), label as a full-width sentence, cells 44px full-width chips carrying `.rn-matrix-cell-label`. `.multi` checkbox glyphs unchanged. |
| HIGHLIGHT | Works as-is. `.rn-highlight-chunk` padding → `7px 6px`, which is exactly 44px at 15.5px/1.85 (28.7 line box + 14 padding + 2 border). The deliberate no-affordance default is preserved. |
| CLOZE | Native `<select>` keeps the iOS wheel picker. `min-height: 36px`, `max-width: 14ch`. **The one documented exception to the 44px floor** — a select gets its own hit slop, and forcing it taller would break the baseline of the sentence it sits in. |
| DRAG_CLOZE | `.rn-dd-inline-box` → `min-height: 44px; padding: 8px 10px`. At 29px it was the smallest target in the runner and it is that type's whole interaction, sitting inline in 15.5px/1.95 prose, so a mis-tap landed on the sentence. `.rn-dd-token` → 44px. |
| DRAG_ORDER | `.rn-dd-slot-row` → 44px; `.rn-dd-token` → 44px. |
| BOWTIE | Vertical stack via `order`: centre label → centre slot → left label → left slots → right label → right slots. Connector pseudo-elements hidden (they point at columns that no longer exist). Pool already collapses at 720px. |
| Review add-ons | `.rn-strip` already has phone rules. `.rn-strip-others`' population sentence lives in `title=` — surface it visibly; there is no hover on touch. |

### Landscape — `@container rn (max-height: 520px)`

**Do not scale the desktop layout down.** Fitting the 924px split into 844 means `zoom ≈ 0.62`: body copy drops 15.5px → 9.6px, and it overrides the student's own iOS text-size setting. Height is the harder limit anyway — landscape gives 390px of it, of which today's chrome takes 120.

Instead, keep the compact layout and spend the width:
- Chrome to 44px, `.rn-top-title` hidden, `.rn-top-ident` back to a row, controls 36px.
- Footer 42px controls, primary capped at 420px and centred.
- **Sheets become right-edge drawers**: `min(440px, 62%)` wide, full height, `20px 0 0 20px` radius, slide in from the right, vertical grab handle. A bottom sheet in 390px of height is useless.
- Grid drawer: 6 cell columns (8 overflowed), key stays two columns.
- Above 700px width: `.rn-split` returns as `minmax(260px, 1fr) minmax(340px, 1.15fr)`, the summary card hides, **the matrix returns to its table form** and **the bow-tie returns to its 3-column shape with connectors** — both are layouts that cost a lot of height in portrait and have width to spare here.

---

## Tap targets

The floor is 44px. Current state after this layer:

| Control | Before | After |
| --- | --- | --- |
| `.rn-opt` | ~38px | 48px |
| `.rn-matrix-cell` | 44px | 44px (full width) |
| `.rn-dd-inline-box` | **29px** | 44px |
| `.rn-dd-token`, `.rn-dd-slot-row` | ~34px | 44px |
| `.rn-highlight-chunk` | ~33px | 44px |
| `.rn-cell` (grid) | 36px | 46px |
| `.rn-grid-filter`, `.rn-grid-legend .row` | ~26px | 44px |
| topbar icons | ~28px | 40px |
| footer buttons | ~30px | 48px |
| `.rn-cloze-select` | 30px | 36px (documented exception) |

---

## Copy — words that used to be tooltips

Touch has no hover. Every one of these currently lives in a `title=` attribute and must become visible text in the ⋯ sheet or inline.

| Where | Copy |
| --- | --- |
| Session menu · flag | **Flag for review** — "Comes back in the grid's Flagged filter this sitting" |
| Session menu · bookmark | **Bookmark for later study** — "Kept after this sitting ends" |
| Session menu · calculator | **Calculator** — "The on-screen calculator you get in the exam" |
| Session menu · clock | **Hide the clock** — "Locks once the first time warning fires" |
| Session menu · brief | the `footerBrief()` string for the mode, in full |
| Session menu · exit | **Exit the session** (danger tone; still routes through the existing confirm) |
| Review · frozen flag | "Flags cannot be changed after a sitting ends" |
| Footer · disabled Previous | "You're on the first question" / the mode's reason |
| Review strip · others | the `statsTooltip()` sentence naming the population |

Sheet titles: `Question grid`, `Case study · N of 6 answered`, `Trend dataset`, `Calculator`. Grid key heading: `What the colours mean — tap one to filter`.

---

## State management

No new server state, no new queries. Additions to `runner.tsx`:

```ts
const [sheet, setSheet] = useState<null | 'grid' | 'chart' | 'calc' | 'menu' | 'results'>(null);
const compact = useIsCompact();
```
- One sheet at a time; opening another replaces it. Close on scrim tap, `Escape`, the ✕, and on any navigation (`onPick`, `setCurrent`, submit).
- `calcOpen` already exists — on compact, route it through `sheet === 'calc'` rather than the floating `.calc-panel`, so the calculator and the sheet stack cannot both be open.
- `gridOpen` / `RunnerGridHandle` are desktop-only concepts; on compact the sheet replaces both (`.rn-grid-handle { display: none }`).
- Grid `filter` state is unchanged — the sheet renders the same `<RunnerGrid>` with the same props.
- Restore focus to the triggering control on close.

## Design tokens

**No new tokens.** Everything resolves from `styles/tokens.css` (`--accent #2d7d72`, `--accent-dark #235f56`, `--primary #1e3a5f`, `--text #111827`, `--text-muted #6b7280`, `--text-faint #9ca3af`, `--border #e5e7eb`, `--border-strong #cbd5e1`, `--bg #f9fafb`, `--bg-soft #eef0f3`, `--white`) and the `--rn-*` block at the top of `runner.css` (shell/pane colours, cell fills, `--rn-mark-border #d97706`, `--rn-current-ring #2d7d72`, timer tiers).

Mobile-layer literals, all in one file: 52px topbar, 44px landscape topbar, 44/48px targets, 46px + 8px grid cell/gap, 20px sheet radius, `85dvh` sheet cap, `min(440px, 62%)` drawer, 899px and 520px breakpoints.

⚠ **One repo gap found:** `runner.css` uses `var(--surface)` on `.rn-dd-slot-row`, `.rn-cloze-select` and `.rn-bt-slot.filled`, but `tokens.css` never defines it — those surfaces render transparent today, on desktop too. `runner-mobile.css` defines `--surface: var(--white)` so the phone layer is honest; **the real fix belongs in `tokens.css`.**

## Assets

None. All icons are the existing inline SVGs from `runner-topbar.tsx` (`FlagIcon`, `BookmarkIcon`, `CalcIcon`, `GridIcon`/`GridOffIcon`, `ClockIcon`/`ClockOffIcon`) — 14×14 / 15×15, `stroke="currentColor"`, stroke-width 1.4–2, round caps. The `◷` and `◐`/`✓`/`✕` glyphs in the scoring strip are the source's own characters. No emoji anywhere.

---

## Build order

Each step is independently shippable.

1. **Shell** — `100dvh`, safe-area insets, `.rn-top-ident` + two-bar layout, mode brief out of the footer, session menu. *Nothing works properly on a phone until this lands.*
2. **Grid sheet** — `runner-sheet.tsx` + `<RunnerGrid>` in a sheet + the `CELL/GAP/COLS` change + two-column colour key.
3. **Answers** — indent, caps, tap targets, sticky count line. **This one step fixes eight of the eleven types.**
4. **Case & trend** — `.rn-split` stack, summary card, chart sheet, CJMM dots, table scroll.
5. **Matrix & bow-tie reflows.**
6. **Calculator sheet** and the remaining ⋯ menu rows.
7. **Landscape layer.**

## Acceptance checks

- At 1200px: grid rail is `display: flex`, `.rn-foot-msg` is visible, `.rn-top-more` and `.rn-foot-grid` are `display: none`, the exit label shows, `.rn-options` still has `margin-left: 32px`, `.rn-opt` has no min-height. **Desktop must be pixel-identical to today.**
- At 390px: no horizontal overflow in `.rn-main-scroll` for any of the 11 types or either wrapper.
- Submit is never under the iOS URL bar or the home indicator; test with the keyboard open on a CLOZE question.
- Case-band rectangles line up with the cells in the phone grid (this is the `CELL/GAP/COLS` change).
- Grid key counts match what tapping each row reveals, in both live-UL and review states, and the outcome rows are absent when `revealCorrectness` is false.
- Every `title=`-only sentence in the table above appears somewhere visible.
- 44px floor holds for every control in the table above, `.rn-cloze-select` excepted.
- Landscape 812×390: sheets are right-edge drawers; above 700px the split, the matrix table and the bow-tie shape return.

## Open questions for the product owner

1. **Exam-live mode.** `runner.tsx` passes `examLive` to hide the subject and difficulty pills so the engine's opinion doesn't leak. Does that also mean hiding the mode brief in the ⋯ sheet?
2. **Clock behaviour.** Should the clock auto-hide when a student scrolls a long stem, or stay pinned? (The existing rule — visibility locks once a warning tier fires — is untouched either way.)
3. **Forward-only modes.** In live Sequential and CAT there is no Previous and no grid. Should the primary button run full width there, or keep the 48px placeholders so the bar doesn't shift between modes? *This one changes the bottom bar's design — worth deciding before step 1.*

## Files in this bundle

```
runner-mobile.css                          ← the deliverable; copy into styles/
prototype/
  Runner Mobile Prototype.dc.html          ← interactive: 11 types, 2 wrappers, 5 sheets, width + orientation toggles
  Runner Mobile.dc.html                    ← written proposal: audit, system, 9 phone screens, per-type notes
  support.js                               ← prototype runtime only
  styles/runner.css                        ← read-only snapshots @89d06ac, so the prototype renders standalone
  styles/tokens.css
  styles/calculator.css
  styles/runner-mobile.css                 ← same file as above, where the prototype expects it
```

Open `prototype/Runner Mobile Prototype.dc.html` first. The chip row switches question type; the two segmented controls switch width and orientation. Everything in it is tappable.
