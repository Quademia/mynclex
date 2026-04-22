# MyNclex Sessions Log

Running log of MyNclex work sessions. Each entry: what was done + what's
queued for next session. Newest on top. Product-local — isolated from
other QAcademy products, per the extraction rule in CLAUDE.md.

---

## Session — 2026-04-22 (Slice 1.9 — Highlight authoring)

Fourth Family B question type. `[[double-bracket]]` chunk syntax on
top of the stem, with per-chunk correctness toggles. Simpler than
Cloze — brackets carry their own text so no stem renumbering is
needed; the parser produces a byte-identical stem and only
normalises chunk metadata. Plan drafted in Claude Web; executed
from a pre-written handoff file.

### Decisions (from Claude Web discussion)

- **Storage.** Passage stored in top-level `stem` column with
  `[[chunk]]` syntax intact; `content.chunks` lists one entry per
  bracket pair in passage order; `correct.correct_ids` is a flat
  list; `correct.feedback` is flat (unlike Cloze's nested per-blank
  map — Highlight chunks don't restart IDs per anything).
- **Double brackets** distinguish markers from literal single-bracket
  notation. Medical text like `[K⁺] = 3.2` or `[diagnosis TBD]` is
  safe passage content. Inner single brackets allowed inside a chunk
  (`[[low Hgb [<10 g/dL]]]`) — handled by the non-greedy regex
  `/\[\[(.+?)\]\]/g`.
- **Non-greedy matching is non-negotiable.** A greedy pattern would
  span `[[foo]]bar[[baz]]` as one match and break the type.
- **Stable positional IDs.** `h1`, `h2`, … assigned in passage order
  at save time. Independent of chunk text — curator can edit the
  text inside `[[...]]` without breaking feedback references.
- **Smart Wrap / Insert button** — dual-behaviour toolbar button.
  With a selection it wraps (`[[ ]]` around selected text, cursor
  after `]]`); without selection it inserts empty `[[]]` at cursor
  and places the caret between the inner brackets so the curator
  types the chunk text directly.
- **Orphan preservation (Option II, same as Cloze).** Removing
  `[[...]]` from the passage greys out the card as "will be dropped
  on save" but keeps the correctness + feedback; re-bracketing the
  same text reconnects it. Parser drops `in_passage=false` cards at
  save time.
- **Colour-coded preview** — author-facing answer key with green
  (correct) / grey (wrong) / dashed-amber (undecided) pills, plus a
  legend below the passage.
- **Bounds summary bar** — four pills showing chunk / correct /
  wrong / undecided counts, each flipping green when its constraint
  is met.
- **Bounds.** 3–12 chunks, ≥1 correct, ≥1 wrong. The wrong-chunk
  floor enforces distractors so "click everything = 100%" is
  impossible.
- **Duplicate-text handling.** If the curator has `[[118]]` twice
  (e.g. HR at two timestamps), both spans get the same decision +
  feedback — the parser keys by text. Truly independent dupes are
  out of scope (would need per-position FormData IDs); flagged in
  deferrals.

### Files created

- `mynclex/lib/bank/parsers/highlight.ts` — non-greedy bracket
  extraction, positional ID assignment, bounds validation, orphan
  drop. Stem passes through byte-identical (no renumber needed).
- `mynclex/lib/bank/editors/highlight-editor.tsx` — toolbar (Wrap /
  Insert + Clear all + chunk-count pill), smart-tip, preview with
  legend, bounds summary, per-chunk cards with ✓/✗ toggle + feedback
  textarea, orphan state, hidden serialisers.

### Files modified

- `mynclex/lib/bank/classifications.ts` — HIGHLIGHT added to
  `QUESTION_TYPES` + `ITEM_ID_PREFIX`; `HIGHLIGHT_MIN_CHUNKS` /
  `HIGHLIGHT_MAX_CHUNKS` / `HIGHLIGHT_MIN_CORRECT` /
  `HIGHLIGHT_MIN_WRONG` constants.
- `mynclex/lib/bank/types.ts` — `HighlightChunk` /
  `HighlightContent` / `HighlightCorrect`; union extensions.
- `mynclex/lib/bank/form-shape.ts` — `highlight_chunks` array on
  `BankFormInitial`; default `[]` in `emptyInitial()` (empty
  scaffold — chunks are extracted from bracketing, not pre-seeded).
- `mynclex/lib/bank/parsers/index.ts` — `HighlightChunkInput`
  import, `highlight?: { stem; chunks }` on dispatcher params,
  HIGHLIGHT branch.
- `mynclex/app/(app)/admin/bank/actions.ts` — `'HIGHLIGHT'` added
  to `VALID_TYPES` (drift-point streak kept — caught on first pass);
  `HighlightChunkInput` import; 5-array FormData extraction block
  with decision narrowed to the string union.
- `mynclex/app/(app)/admin/bank/editor-shell.tsx` — `HighlightEditor`
  import + HIGHLIGHT case in `renderEditor()`. Stem textarea already
  had `id="bank-stem"` from Slice 1.8; no shell change needed.
- `mynclex/app/(app)/admin/bank/page.tsx` — `highlight_chunks`
  local + HIGHLIGHT branch in `rowToInitial()` (decision = `correct`
  iff chunk ID is in `correct_ids`, else `wrong` — persisted rows
  never have `'undecided'` because the parser rejects that at save
  time); `highlight_chunks` included in returned `BankFormInitial`.
- `mynclex/app/dashboards.css` — `bank-hl-*` block appended:
  toolbar, smart-tip, preview with colour-coded chunks + legend,
  bounds summary, chunk cards with correct / wrong / warn / orphan
  variants, toggle button group, feedback textarea. Family A +
  Matrix + Bow-tie + Cloze CSS untouched.
- `mynclex/db/seed-bank-dev.sql` — one HIGHLIGHT seed row
  (`NCLEX_HL_00001`, "Post-op vitals", 5 chunks / 3 correct).
  Added as a separate standalone INSERT rather than extending the
  main multi-row batch, so the `instruction` column can be
  populated without touching the shared header — **first seed to
  use the `instruction` column** landed in Slice 1.7.
- `mynclex/docs/product-plan/bank.md` — Highlight `content` /
  `correct` examples rewritten to the new `chunks` + `correct_ids`
  + flat-feedback shape; paragraphs explain the double-bracket
  syntax, non-greedy regex, positional IDs, and distractor floor.

### Migrations applied to dev (`zrakjibtxyzoqcdtvpmq`)

- `mynclex_bank_highlight_seed_slice_1_9` — standalone INSERT.
  Returned `{"success":true}`. Verified: 5 chunks, 3 correct_ids,
  instruction populated with "Highlight the findings that require
  immediate action."

### Drift caught during execution

- **`VALID_TYPES`** — flagged in the handoff as a known drift
  point. Added `'HIGHLIGHT'` on first pass; streak kept.
- **Non-greedy regex** — defined once as `const BRACKET_RE =
  /\[\[(.+?)\]\]/g` in both `parsers/highlight.ts` and
  `editors/highlight-editor.tsx`. Both use `value.matchAll(...)` so
  no `lastIndex` mutation inside a React component (same lesson
  from Slice 1.8's ESLint `react-hooks/immutability` catch).
- **Separate INSERT for seed.** The existing seed batch uses a
  shared 19-column header that predates `instruction`. Extending
  the header would have required adding `NULL` to every existing
  row (churn). Chose a separate INSERT with a wider column list for
  the new row — keeps the slice diff small and sets the pattern
  for future seeds that need new columns.

### Verified

- Migration applied successfully to dev Supabase.
- `npx tsc --noEmit` — clean.
- `npx eslint app/(app)/admin/bank lib/bank` — clean.
- `npm run build` (webpack) — clean. Every route still compiles:
  `/`, `/admin`, `/admin/bank`, `/admin/payments`, `/login`,
  `/logout`, `/no-access`, `/pick-role`, `/register`, `/router`,
  `/student`, `/tutor` + proxy middleware.

### Not yet verified (Sam's session, on dev Worker)

Per the handoff, browser verification is a separate 5-phase pass:

1. Smoke + list — `NCLEX_HL_00001` appears with HIGHLIGHT pill.
2. Edit round-trip — all 5 chunks pre-fill with correct decisions
   (h2 / h3 / h5 = green, h1 / h4 = grey); instruction shows the
   saved text; preview renders colour-coded.
3. Create flow — smart button with and without selection; add 3+
   chunks; toggle decisions; save → `NCLEX_HL_00002`.
4. Orphan preservation — delete `[[184/96]]` brackets; card h2
   greys out; re-wrap `184/96`; card reconnects.
5. Rejection cases — <3 chunks; all correct; all wrong; undecided.

### Deferred to future sessions / out of scope here

- **CLONING.md update** — file still doesn't exist; same deferral
  as Slices 1.5–1.8.
- **Drag-drop (Slice 1.10)** — ordered slot filling; last
  stand-alone Family B type.
- **Case-study wrapper (Slice 1.11)** — 6 questions + chart tabs
  under a shared scenario.
- **Student runner** — now unblocked for all 8 standalone types
  (MCQ, TF, SATA, SELECT_N, MATRIX, BOWTIE, CLOZE, HIGHLIGHT) once
  Drag-drop lands.
- **Truly independent duplicate-text chunks** — currently two
  `[[118]]` spans share a decision + feedback. Making them
  independent requires per-position FormData IDs and a parser
  change; flagged here for when a curator actually hits the case.
- **Lift stem into shared shell state** — the `getElementById`
  pattern is now used by both Cloze and Highlight. If a third
  type needs it, time to refactor.

### Next session

Options:
- (a) Drag-drop (Slice 1.10) — finishes the stand-alone Family B
  set, unblocks the student runner.
- (b) Case-study wrapper (Slice 1.11) — more architectural;
  requires the `nclex_case_studies` + join tables work too.
- (c) Student runner — start consuming the 8 live types
  end-to-end; still needs Drag-drop to cover Family B completely.

Per the handoff's trajectory, Drag-drop is the natural next — the
last editor before the runner.

---

## Session — 2026-04-22 (Slice 1.8 — Cloze authoring + Instruction wiring)

Two tightly-coupled pieces shipped as one commit: Slice 1.7's orphan
`instruction` column is now surfaced in the shell, and CLOZE — the
third Family B question type — has end-to-end authoring (create / edit
/ delete, plus a seeded Heart-Failure example). Plan drafted in Claude
Web; executed from a pre-written handoff file.

### Decisions (from Claude Web discussion)

**Instruction wiring**
- Shell-level field, not per-type — one textarea at the top of Content,
  inherited by every editor.
- Optional on every type; empty input stores as `NULL` (DB column
  distinguishes "never set" from "explicitly blank").
- Amber-accented card with `!` icon to distinguish from the stem.
- Student-runner rendering deferred to when the runner is built.

**Cloze authoring**
- **Item-ID prefix** `NCLEX_CLZ_`; bounds 2–6 blanks × 2–5 choices ×
  exactly 1 correct per blank.
- **Stem holds the sentence** with inline `{N}` markers. Blank IDs
  `b1`, `b2`, … are stable across reorders; choice IDs `c1`, `c2`, …
  restart per blank. Nested `correct.feedback[bid][cid]` avoids the
  collision that a flat map would produce.
- **Click-to-insert** — `+ Add blank` finds the lowest free `N` in
  1–6, inserts `{N}` at the cursor (with a leading space if needed),
  and reuses an existing orphan card with that ID if one exists.
- **Orphan preservation** — removing a marker from the stem greys out
  the matching card with a "will be dropped on save" badge; retyping
  the marker reconnects it. Orphans auto-drop at save time.
- **Silent renumber** — gaps like `{1} {3}` are rewritten to
  `{1} {2}` by the parser, with blank IDs remapped in lockstep across
  stem / `content.blanks` / `correct.answers` / `correct.feedback`.
  Two-phase placeholder substitution prevents the mid-rewrite
  collision (`{3} → {2}` mustn't then rewrite an existing `{2}`).
- **Stem-to-editor sync via `document.getElementById('bank-stem')`** —
  deliberately dirty. Lifting the stem into shared shell state would
  mean restructuring the shell for one editor's edge case. Scoped to
  the mounted-Cloze case; documented in a code comment.
- **Default scaffold** — 2 blank cards × 2 empty choices. On an empty
  stem both flip to orphan on mount; the first two `+ Add blank`
  clicks reuse them by ID rather than stacking.

**Parser design drift from handoff**
- Handoff sketch used `throw` for validation errors; I matched the
  existing `{ ok, ... } | { ok: false, error }` pattern used by
  bowtie.ts / matrix.ts so the dispatcher doesn't need a try/catch
  branch for one type.
- Handoff suggested passing `stem` through the top-level dispatcher
  params; I kept it scoped to `cloze: { stem, blanks }` so Family A
  call sites stay unchanged. Return type gains `stem?: string` on the
  success branch — only CLOZE populates it, others leave it undefined.

### Files created

- `mynclex/lib/bank/parsers/cloze.ts` — marker extraction, gap
  renumber, orphan drop, per-blank validation.
- `mynclex/lib/bank/editors/cloze-editor.tsx` — three-section UI
  (toolbar + live preview + per-blank cards), stem DOM listener,
  per-choice radio/text/feedback, hidden-input serialisers.

### Files modified

- `mynclex/lib/bank/classifications.ts` — CLOZE added to
  `QUESTION_TYPES` + `ITEM_ID_PREFIX`; `CLOZE_MIN_BLANKS` /
  `CLOZE_MAX_BLANKS` / `CLOZE_MIN_CHOICES` / `CLOZE_MAX_CHOICES`
  constants.
- `mynclex/lib/bank/types.ts` — `ClozeChoice` / `ClozeBlank` /
  `ClozeContent` / `ClozeCorrect`; union extensions in
  `BankItemContent` + `BankItemCorrect`.
- `mynclex/lib/bank/form-shape.ts` — `instruction: string` (Part A)
  + `cloze_blanks` array (Part B); defaults in `emptyInitial()`.
- `mynclex/lib/bank/parsers/index.ts` — `ClozeBlankInput` import,
  `cloze` key on `params`, CLOZE branch, `stem?` on `ParseResult`.
- `mynclex/app/(app)/admin/bank/actions.ts` — `'CLOZE'` added to
  `VALID_TYPES` (the known drift point — flagged in the handoff and
  caught on first read); `instruction` extracted and persisted as
  `NULL` when blank; CLOZE FormData extraction block (orphan-filtered
  early); `finalStem = parsed.stem ?? stem` so CLOZE's renumbered
  stem overwrites the curator input.
- `mynclex/app/(app)/admin/bank/editor-shell.tsx` — instruction
  textarea block above the stem, stem textarea renamed to
  `id="bank-stem"` (the Cloze editor reads from this), `ClozeEditor`
  import + CLOZE case in `renderEditor()`.
- `mynclex/app/(app)/admin/bank/page.tsx` — `instruction: string |
  null` on `FullBankRow`; `instruction: row.instruction ?? ''` +
  `cloze_blanks` branch in `rowToInitial()`; `cloze_blanks` included
  in the returned `BankFormInitial`.
- `mynclex/app/dashboards.css` — `bank-instruction-*` block (amber
  card) + `bank-cz-*` block (toolbar, preview, per-blank cards,
  choice rows, orphan state) appended; Family A + Matrix + Bow-tie
  CSS untouched.
- `mynclex/db/seed-bank-dev.sql` — one CLOZE seed row
  (`NCLEX_CLZ_00001`, "Heart Failure presentation"). Prior row 10's
  closing `;` became `,`.
- `mynclex/docs/product-plan/bank.md` — Cloze `content` and
  `correct` examples rewritten to the new stem-plus-markers +
  nested-feedback shape; paragraph explaining blank-ID stability,
  per-blank choice-ID restart, and silent renumber.

### Migrations applied to dev (`zrakjibtxyzoqcdtvpmq`)

- `mynclex_bank_cloze_seed_slice_1_8` — single INSERT. Returned
  `{"success":true}`. Verified via `SELECT ... jsonb_array_length` —
  3 blanks on the row, stem has 3 markers.

### Drift caught during execution

- **ESLint `react-hooks/immutability`** — first pass used
  `MARKER_RE.lastIndex = 0` + `exec` inside `ClozePreview` (a React
  component), which mutates a module-level value. Fixed by switching
  to `stemText.matchAll(MARKER_RE)`, which is iterator-based and
  doesn't touch `lastIndex`. The module-level helper
  `parseStemMarkers()` still uses `exec` (fine — it's not a
  component).

### Verified

- Migration applied successfully to dev Supabase; seed row queries
  clean.
- `npx tsc --noEmit` — clean.
- `npx eslint app/(app)/admin/bank lib/bank` — clean.
- `npm run build` (webpack) — clean. Every route still compiles:
  `/`, `/admin`, `/admin/bank`, `/admin/payments`, `/login`,
  `/logout`, `/no-access`, `/pick-role`, `/register`, `/router`,
  `/student`, `/tutor` + proxy middleware.

### Not yet verified (Sam's session, on dev Worker)

Per the handoff, in-browser verification is deferred to the next
session as its own 5-phase pass:

1. Instruction round-trip (open a Matrix row, add instruction, save,
   reopen).
2. Cloze create — 3 blanks, 3 choices each, happy path → saves with
   `NCLEX_CLZ_00002`.
3. Cloze edit — reopen `NCLEX_CLZ_00001`, verify all 3 blanks
   pre-fill with correct picks + feedback.
4. Gap renumber — edit `NCLEX_CLZ_00001`, delete `{2}`, orphan card
   appears; save; reopen — stem is now `{1} {2}` clean and cards
   rebind to `b1` / `b2`.
5. Rejection cases — blank missing correct pick, <2 blanks, <2
   choices.

### Deferred to future sessions / out of scope here

- **CLONING.md update** — file still doesn't exist; same deferral as
  Slices 1.5 / 1.6 / 1.7.
- **Highlight, Drag-drop** — each as its own slice.
- **Student runner** — now unblocked for all 7 authored types (MCQ,
  TF, SATA, SELECT_N, MATRIX, BOWTIE, CLOZE) after Highlight and
  Drag-drop land.
- **Tutor-private CLOZE authoring** — same editor against
  `nclex_tutor_questions` once tutor workflows arrive.
- **Lift stem into shared shell state** — the `getElementById`
  approach is scoped to CLOZE and works, but if the editor grows or
  a second type needs stem access we should refactor. Flagged.

### Next session

Options:
- (a) Highlight (Slice 1.9) — passage with selectable chunks.
- (b) Drag-drop — ordered slot filling; most interactive type.
- (c) Student runner — start consuming the 7 live types end-to-end.

Per the handoff's trajectory, Highlight is the natural next — it
finishes Family B before the runner.

---

## Session — 2026-04-22 (Slice 1.7 — add `instruction` column)

Tiny preventive schema change. Adds a nullable `instruction TEXT` column
to both `nclex_bank_items` and `nclex_tutor_questions`. No editor
changes; the column sits unused until a future slice wires it in.

### Decisions (prior-session context)

- **Instruction is conceptually distinct from stem.** Stem holds the
  scenario and overall prompt; instruction holds the task directive
  ("Which action should the nurse take FIRST?", "Complete the bow-tie",
  "Select all that apply"). On the real NCLEX, these are often
  separable, and splitting them later enables better case-study UX,
  better search/filtering, and possible future localisation.
- **Add now, wire later.** Real content volume is near zero (only
  dev seeds), so the migration cost is trivial right now and grows
  with content volume later.
- **Both tables get the column.** Parallel ownership model convention
  — tutor-private table stays structurally identical to QAcademy-owned.
- **Nullable, no backfill.** Existing seeds have NULL for `instruction`.
  Future editor slice will let curators populate it for new questions.

### Files modified
- `mynclex/db/schema.sql` — added `instruction TEXT` in both
  `nclex_bank_items` and `nclex_tutor_questions` (placed right before
  `created_at` in each block, matching the Postgres column order after
  `ALTER TABLE ADD COLUMN`).
- `mynclex/SESSIONS.md` — this entry.

### Migrations applied to dev (`zrakjibtxyzoqcdtvpmq`)
- `mynclex_bank_add_instruction_column_slice_1_7` — two `ALTER TABLE
  … ADD COLUMN instruction TEXT` + two `COMMENT ON COLUMN`. Applied
  via Supabase MCP; returned `{"success":true}`. Verified present via
  `information_schema.columns` (both `text`, `is_nullable=YES`).

### Files unchanged (explicitly)
- Every TS file in `lib/bank/` and `app/(app)/admin/bank/` — we
  deliberately did NOT surface the column to the editor in this slice.
  That's a future slice.
- `db/rls.sql` — column inherits existing policies; no changes needed.

### Verified
- Migration applied successfully to dev Supabase.
- `npx tsc --noEmit` — clean (no output).
- `npx eslint app/(app)/admin/bank lib/bank` — clean (no output).
- `npm run build` (webpack) — clean. Every route still compiles.
- Editor code is untouched and uses column-explicit SELECTs, so
  `/admin/bank` is invisibly unchanged. Browser re-check of an existing
  MCQ / Matrix / Bow-tie row deferred to Sam's next dev-Worker session.

### Deferred to future sessions
- **Wiring `instruction` into the editor shell** — add a textarea above
  the stem in `editor-shell.tsx`, add `instruction: string` to
  `BankFormInitial`, read it in `parseFormData()`, map it in
  `rowToInitial()`. Small slice when we're ready.
- **Backfilling existing seeds** — if we want existing seeds to use
  `instruction` meaningfully, manually split each stem. Also a future
  slice.
- **Student-runner rendering** — decide whether instruction appears
  above or below the stem. Punted to when the runner is built.

### Next session

Return to **Slice 1.8: Cloze authoring**. Planning mostly complete in
the prior session log — decisions on click-based add/remove, unified
stem with `{N}` pills, content shape, and bounds are all settled.
Remaining design questions to confirm before build:
1. Bounds: 2–6 blanks per question, 2–5 choices per blank, exactly 1
   correct per blank
2. Blank ID convention: `b1`, `b2`, `b3` stable IDs
3. Live preview behaviour when a blank has no correct pick yet
4. Whether the same `{N}` can appear twice in the sentence (Claude Web
   recommended no)

---

## Session — 2026-04-22 (Bank Slice 1.6 — Bow-tie authoring)

Second Family B question type live. End-to-end create / edit / delete
for BOWTIE. Introduced the tabbed-wing switcher pattern with live
answer-key preview — the first use of tabs anywhere in `/admin/bank`.
Plan drafted in Claude Web; executed from a pre-written handoff file.

### Decisions (from discussion with Sam, via Claude Web)

- **Strict NCLEX correctness** — exactly 2 Left + 1 Centre + 2 Right.
  No "any of these would count" flexibility in this slice.
- **Three self-contained wings** — rejected the global token pool
  approach mid-design; each wing owns its label, tokens, and
  correctness independently. Matches how NCSBN writes bow-ties.
- **Curator-defined wing labels** — preset dropdown per wing +
  typeable custom. Text field is source of truth; dropdown fills
  the field but doesn't lock it. Supports both standard bow-ties
  ("Actions / Condition / Parameters") and NCSBN variants
  ("Evidence / Problem / Actions").
- **Tabbed editing with live preview** — only one wing visible at
  a time to keep form focused. Top-of-panel preview + status dots
  on tabs keep the whole picture in view while zoomed in.
- **Coloured tab + wing pairing** — green Left, amber Centre, red
  Right. Matches NGN primer visual conventions and makes the three
  wings instantly distinguishable.
- **Token ID prefixes lt / ct / rt** — wing-local uniqueness via
  prefix is sufficient; feedback map is flat and keyed by token ID
  across the whole question.
- **Soft-cap UX for the 3rd checkbox** in Left/Right wings: ticking a
  3rd auto-unticks the oldest picked. Avoids a confirmation modal
  while still enforcing "exactly 2 correct."

### Drift caught and fixed during execution

- **`VALID_TYPES` in `actions.ts`** — the handoff flagged this
  specifically (lesson from Slice 1.5's drift). Added `'BOWTIE'`; no
  surprise drift beyond the flagged surface.
- **`HiddenSerialisers` wrapper swap** — the handoff wrapped each
  token's hidden inputs in a `<span>`. Switched to `<Fragment
  key=...>` to match the pattern Slice 1.5's Matrix editor uses —
  same React key semantics, no stray inline elements in the DOM,
  still works the same inside a `<form>`.
- **`BowtiePreview` `chip`/`emptyChip`** — the handoff called these
  as plain functions without passing keys. Harmless visually but
  React would have warned about missing keys in the sibling list.
  Added explicit `key` props (`'l0'`, `'l1'`, `'c0'`, `'r0'`, `'r1'`)
  at the call sites — same output, no warning.
- **Removed unused `validity` prop on `WingPanel`** — the handoff
  defined it but the component only reads `correctCount`. ESLint
  `no-unused-vars` would have caught it; dropped to keep the file
  clean.

### Files created

- `mynclex/lib/bank/parsers/bowtie.ts` — strict NCLEX parser.
- `mynclex/lib/bank/editors/bowtie-editor.tsx` — three-wing tabbed UI
  with live preview + status dots + hidden FormData serialisers.

### Files modified

- `mynclex/lib/bank/classifications.ts` — BOWTIE in QUESTION_TYPES +
  ITEM_ID_PREFIX (`NCLEX_BT_`); BT_*_CORRECT + BT_WING_MAX_TOKENS
  constants; BT_{LEFT,CENTRE,RIGHT}_PRESETS label lists.
- `mynclex/lib/bank/types.ts` — BowtieToken / BowtieWing /
  BowtieContent / BowtieCorrect + union extensions.
- `mynclex/lib/bank/form-shape.ts` — 6 new `bowtie_*` fields on
  `BankFormInitial` (one label + one token list per wing);
  `emptyInitial()` defaults: preset labels + 3/2/3 empty tokens.
- `mynclex/lib/bank/parsers/index.ts` — import + `bowtie?` in params
  + BOWTIE branch in `parseByType`.
- `mynclex/app/(app)/admin/bank/actions.ts` — `'BOWTIE'` added to
  VALID_TYPES; per-wing FormData extraction (label + parallel id /
  text / feedback / correct arrays); payload passed to dispatcher.
- `mynclex/app/(app)/admin/bank/editor-shell.tsx` — BowtieEditor
  import + BOWTIE case in `renderEditor()`.
- `mynclex/app/(app)/admin/bank/page.tsx` — `rowToInitial` BOWTIE
  branch; 6 new `bowtie_*` fields on the returned `BankFormInitial`.
- `mynclex/app/dashboards.css` — `.bt-*` block appended (preview
  grid, tab bar with coloured active-tab borders, wing cards,
  counter pills, token rows). Family A + Matrix styles untouched.
- `mynclex/db/seed-bank-dev.sql` — one Bow-tie seed row
  (`NCLEX_BT_00001`, "Inferior wall MI"). Prior row 9's closing `;`
  became `,`.
- `mynclex/docs/product-plan/bank.md` — `content` example gains the
  three-wing shape with `label` + `tokens`; `correct` example swaps
  the old condition/actions/parameters shape for
  `left`/`centre`/`right` + flat feedback map; paragraph explaining
  wing-scoped correctness and the lt/ct/rt prefix convention.

### Migrations applied to dev (`zrakjibtxyzoqcdtvpmq`)

- `mynclex_bank_bowtie_seed_slice_1_6` — the single INSERT. Applied
  via Supabase MCP; returned `{"success":true}`.

### Verified locally

- `npx tsc --noEmit` — clean (no output).
- `npx eslint app/(app)/admin/bank lib/bank` — clean (no output).
- `npm run build` (webpack) — clean. Every route still compiles:
  `/`, `/admin`, `/admin/bank`, `/admin/payments`, `/login`,
  `/logout`, `/no-access`, `/pick-role`, `/register`, `/router`,
  `/student`, `/tutor` + proxy middleware.

### Not yet verified (Sam's session, on dev Worker)

- Create flow end-to-end as `+mynclexsuperadmin` and `+mynclexadmin`.
- Tab switching preserves state across left/centre/right.
- Label-picker preset → tab text + preview column header updates.
- Ticking / unticking correct tokens updates preview chips live.
- Soft-cap: ticking a 3rd checkbox auto-unticks the oldest.
- Counter pill colour transitions (warn / ok / err).
- Edit flow — reopen a saved Bow-tie row; all three wings pre-fill
  including labels, tokens, ticks, feedback.
- Rejection cases via tampered submit: blank wing label; wrong
  correct count; empty wing.

### Deferred to future sessions / out of scope here

- **CLONING.md update** — file still doesn't exist. Same deferral as
  Slice 1.5.
- **Cloze, Highlight, Drag-drop** — each as its own slice.
- **Student runner** — consumes all per-type editors in display mode;
  unblocks preview for every authored type.
- **Tutor-private BOWTIE authoring** — same editor against
  `nclex_tutor_questions` once tutor workflows arrive.
- **Tab keyboard navigation (arrow-key)** — today tabs are reachable
  via click and Tab focus but arrow-key tab-list semantics aren't
  wired. Accessible enough for v1; revisit if curators ask.
- **Token drag-to-reorder within a wing** — not needed for v1; string
  IDs keep it safe whenever it's added.
- **Pre-existing `.bank-grid-2` / `.bank-grid-3` / `.bank-link-btn`
  gaps from Slice 1.4** — still open; not introduced here.

### Next session

Options:
- (a) Cloze (Slice 1.7) — sentence with inline dropdown blanks.
  Bounded, template-parse pattern.
- (b) Highlight — passage with selectable chunks.
- (c) Drag-drop — ordered slot filling. Most interactive.
- (d) Student runner — start consuming the 6 live types end-to-end.

Per handoff's recommendation: finish Family B before the runner.
Cloze is the natural next.

---

## Session — 2026-04-21 (Bank Slice 1.5 — Matrix authoring)

First Family B question type live. End-to-end create / edit / delete
for MATRIX, using the Slice 1.3 shell + per-type editor architecture.
Plan drafted end-to-end in Claude Web; executed from a pre-written
handoff file.

### Decisions (from discussion with Sam, via Claude Web)

- **String IDs for cell_map keys** — `r1 → c1` rather than positional
  indices. Reorder-safe and shuffle-safe. Matches Family A option IDs.
- **parseByType dispatcher extended** with a `matrix` branch; parsers
  stay pure (no FormData reading inside parsers). Symmetric with
  Family A's flat-array params.
- **Per-row feedback ships in this slice.** Matches Family A; matches
  bank.md spec.
- **Editable row-axis label** at the top-left of the grid — stored in
  `content.row_label`. Lets curators use "Finding", "Medication",
  "Screening test", or whatever fits the question.
- **Editor mirrors student view** — curator builds on the same grid
  the student answers on. Same rule will apply to Highlight, Cloze,
  Drag-drop, Bow-tie in future slices.
- **Bounds: 2–6 rows × 2–6 columns.** Default 3×3 on new.

### Drift caught and fixed during execution

- **`VALID_TYPES` in `actions.ts` was a hardcoded
  `Set<QuestionType>(['MCQ','TF','SATA','SELECT_N'])`** — the handoff
  did not flag it. Added `'MATRIX'` to the set; without this every
  Matrix submit would be rejected at the first gate with "Invalid
  question type" regardless of payload.
- **Matrix editor's per-row `<>...</>` fragment inside `.map()`** would
  have triggered a React missing-key warning. Replaced with
  `<Fragment key={row.id}>` — same runtime shape, React happy.

### Files created

- `mynclex/lib/bank/parsers/matrix.ts`
- `mynclex/lib/bank/editors/matrix-editor.tsx`

### Files modified

- `mynclex/lib/bank/classifications.ts` — MATRIX added to
  QUESTION_TYPES + ITEM_ID_PREFIX; new MIN/MAX/DEFAULT_MATRIX_ROWS/
  COLS constants; Family A header comment refreshed.
- `mynclex/lib/bank/types.ts` — MatrixRow, MatrixColumn,
  MatrixContent, MatrixCorrect + union extensions.
- `mynclex/lib/bank/form-shape.ts` — matrix_row_label, matrix_rows,
  matrix_columns, matrix_correct on BankFormInitial; defaults in
  emptyInitial() (3 rows × 3 columns, empty strings).
- `mynclex/lib/bank/parsers/index.ts` — import + MatrixParseInput in
  params + MATRIX branch in parseByType.
- `mynclex/app/(app)/admin/bank/actions.ts` — VALID_TYPES drift fix;
  Matrix FormData extraction; parseByType call passes matrix payload.
- `mynclex/app/(app)/admin/bank/editor-shell.tsx` — MatrixEditor
  import; MATRIX case in renderEditor().
- `mynclex/app/(app)/admin/bank/page.tsx` — rowToInitial's Matrix
  branch reads content.row_label / rows / columns and correct.cells /
  feedback; four new fields on the returned BankFormInitial.
- `mynclex/app/dashboards.css` — appended `.bank-matrix-*` block
  (wrap, table, corner, col-head, row-head, cell, bounds, feedback
  row). Family A styles untouched.
- `mynclex/db/seed-bank-dev.sql` — one Matrix seed row
  (`NCLEX_MAT_00001`, "Finding triage"). Prior row 8's closing `;`
  became `,`; new row closes the INSERT.
- `mynclex/docs/product-plan/bank.md` — Matrix `content` example
  gained `row_label`; `correct` example replaced numeric indices with
  string IDs; added paragraph explaining the ID choice.

### Migrations applied to dev (`zrakjibtxyzoqcdtvpmq`)

- `mynclex_bank_matrix_seed_slice_1_5` — the single INSERT. Applied
  via Supabase MCP; returned `{"success":true}`.

### Verified locally

- `npx tsc --noEmit` — clean (no output).
- `npx eslint app/(app)/admin/bank lib/bank` — clean (no output).
- `npm run build` (webpack) — clean. Every route still compiles:
  `/`, `/admin`, `/admin/bank`, `/admin/payments`, `/login`,
  `/logout`, `/no-access`, `/pick-role`, `/register`, `/router`,
  `/student`, `/tutor` + proxy middleware.

### Not yet verified (Sam's session, on dev Worker)

- Create flow for MATRIX end-to-end as `+mynclexsuperadmin` and
  `+mynclexadmin` (BANK_CURATE granted).
- Edit flow — reopen a saved Matrix row; confirm row_label, rows,
  columns, radio picks, feedback all pre-fill.
- Delete flow — confirm removes from listing.
- Rejection cases via tampered submit: blank row_label; row with no
  correct pick; submit with fewer than `MIN_MATRIX_ROWS` rows.
- Type-switching in create mode: MCQ → MATRIX → MCQ preserves
  non-editor fields.
- Type dropdown disabled in edit mode.

### Deferred to future sessions / out of scope here

- **CLONING.md update** — the handoff asked for this, but the file
  doesn't exist yet (listed as "future" in `mynclex/CLAUDE.md`). Skip
  now; fold Matrix note in when CLONING.md is created.
- **Highlight, Cloze, Drag-drop, Bow-tie** — each as its own slice.
- **Student runner** — needed before Matrix can be previewed in-form.
- **Tutor-private Matrix authoring** — same editor against
  `nclex_tutor_questions`; comes with tutor-side workflows.
- **Shuffle labelling** — the "Shuffle options" checkbox is labelled
  Family A-centric; for Matrix it would shuffle rows and columns.
  Revisit when the student runner lands.
- **Pre-existing `.bank-grid-2` / `.bank-grid-3` / `.bank-link-btn`
  class gaps noted in Slice 1.4** — still open; not introduced here.

### Next session

Options:
- (a) Family B — next type. Bow-tie is the most NGN-signature (fixed
  5-slot). Cloze and Highlight both require a richer text-input UI.
- (b) Student runner — consume the same per-type split for display.
  Unblocks preview mode for all authored types.
- (c) RLS on the remaining 6 bank tables (tutor questions, case
  studies, readiness packs).

---

## Session — 2026-04-21 (Bank Slice 1.4 — filters + two-pane focus mode)

Restructured the /admin/bank page into two distinct modes
driven entirely by URL state. Eliminates the old split-panel
layout that crowded both the list and the form.

### Why

With only Family A live and 8 seed rows the split-panel was
already cramped. Once Family B lands (5 more types) and real
content arrives, the list becomes unusable without filters,
and the form becomes unusable at its current width. Fixing
both before Family B means every new editor drops into a
page that's already ready for it.

### Decisions (from discussion with Sam)

- **Two-pane focus mode, not drawer/modal.** When editing,
  the list collapses to a compact left-hand navigator; the
  form takes the rest. Curators edit questions back-to-back
  without popping in and out of a modal — Gmail-inbox /
  Notion-database / Linear-issue pattern.
- **URL drives everything.** No client state, no mode flag.
  Bare `/admin/bank` = browse. `?edit=ID` or `?new=1` =
  focus. Filter params live alongside. Bookmarkable,
  shareable, back-button-safe.
- **5 filters in scope:** type, client-needs category,
  difficulty, status, free-text search. Remaining axes
  (subcat, subject, body system, topic, subtopic, bloom,
  tags) deferred — when curators hit the limit we add more.
  Start lean, scale on need.
- **Native `<details>`/`<summary>` accordions** for the
  three form sections (Content open by default;
  Classification + Housekeeping collapsed). Zero JS, fully
  accessible, keyboard-navigable.
- **Sticky Save bar at the TOP of the form**, not bottom.
  Long forms + bottom buttons = scroll-fatigue. Sticking to
  top keeps the action available regardless of scroll
  position.
- **Filters persist through focus mode via URL.** If user
  narrows to "all hard SATA" then edits one, the left
  navigator only shows hard SATA. Preserves their context.
- **Browse-mode rows show `[Edit]` only, no `[Delete]`.**
  Mockup hinted at row-level delete, but verification only
  covers delete in focus mode — and keeping destructive
  actions behind the focus view (where the curator sees
  the full question) reduces accidental bulk deletion.
  Saves a client-component file too. Can add later if
  curators ask.
- **Preview deferred** — reuses the student runner in a
  preview mode when the runner exists. Building a bespoke
  preview now would be duplicated work.

### Files created

- `mynclex/app/(app)/admin/bank/filters.tsx` — filter bar
  component. 5 controls, GET-form submission.
- `mynclex/app/(app)/admin/bank/navigator.tsx` — compact
  left-pane list for focus mode.

### Files modified

- `mynclex/app/(app)/admin/bank/page.tsx` — split into
  browse-mode and focus-mode render branches; applies
  filters to the Supabase query (`.eq` for type/category/
  difficulty/status, `.ilike` for search); loads the full
  row for edit mode; builds `preservedFilterQuery` so
  navigation between modes keeps filter context.
- `mynclex/app/(app)/admin/bank/editor-shell.tsx` — wrapped
  Content / Classification / Housekeeping sections in
  collapsible `<details>`; moved Save/Delete/Cancel to a
  sticky top bar; added optional `cancelHref` prop so
  Cancel lands back on the filtered browse view. `form.tsx`
  remains a thin re-export; `cancelHref` defaults to
  `/admin/bank` so the old signature still works.
- `mynclex/app/dashboards.css` — added `.bank-browse-*`,
  `.bank-filters*`, `.bank-row-*`, `.bank-focus-*`,
  `.bank-nav-*`, `.bank-section-*`, `.bank-form-topbar*`,
  `.bank-btn-sm` classes. Removed dead `.bank-split`,
  `.bank-list-*`, `.bank-form-title`, `.bank-form-cancel*`,
  and the old `position: sticky` on `.bank-form`.

### Files unchanged

- `mynclex/app/(app)/admin/bank/form.tsx` (thin re-export).
- `mynclex/app/(app)/admin/bank/actions.ts`.
- `mynclex/lib/bank/editors/*`.
- `mynclex/lib/bank/parsers/*`.
- `mynclex/lib/bank/{types,classifications,form-shape}.ts`.
- DB schema, RLS, seeds.

### Verified
- `tsc --noEmit` clean.
- `eslint app/(app)/admin/bank lib/bank` clean.
- `npm run build` clean — every route still compiles,
  including /admin/bank.
- No references to retired `.bank-split` / `.bank-list-*`
  classes outside the CSS file itself (or the historical
  entry for them in this log).
- Slice 1.3's hidden `item_id` input still rendered by the
  shell in edit mode; Save-changes flow intact.

### Notes / pre-existing gaps (out of scope)

- Several class names referenced by editors/shell have no
  matching CSS rules: `.bank-grid-2`, `.bank-grid-3`,
  `.bank-link-btn`, `.bank-row-remove`, `.bank-input--sm`,
  `.bank-input--num`, `.bank-option-fields`, `.bank-checks`,
  `.bank-check`. These gaps existed before this slice —
  the form renders with default stacked flex fallbacks —
  and were not introduced by Slice 1.4. Worth a follow-up
  tidy once curators feel the form's visual rhythm is off.
- `.bank-table-*` / `.bank-cell-*` classes from an even
  earlier listing layout remain in the CSS but are
  unreferenced. Out of this slice's scope to delete.

### Next session — **Bank Slice 1.5: Family B authoring (Matrix first)**

Family B is the set of NGN-style question types that don't
fit the Family A "option list + correct toggle" mould:

| Type        | Shape                                              |
|-------------|----------------------------------------------------|
| `MATRIX`    | rows × columns grid, each row picks one column     |
| `HIGHLIGHT` | select tokens (words/phrases) inside a passage     |
| `CLOZE`     | passage with inline blanks, each a dropdown        |
| `DRAG_DROP` | drag tokens into ordered slots                     |
| `BOWTIE`    | signature NGN layout — causes / actions / problems |

**Slice 1.5 scope = Matrix only.** Single type, end-to-end.
Most-bounded Family B shape, so it's the right candidate to
prove the Slice 1.3 architecture (shell + per-type editor +
per-type parser) scales through an editor with a
fundamentally different UI than Family A. Other Family B
types come in their own slices (1.6, 1.7, …).

#### Work items for Slice 1.5

1. **JSON shape decision (align with Sam before coding).**
   Proposed:
   - `content`: `{ rows: [{ id, text }], columns: [{ id, text }] }`
   - `correct`: `{ cell_map: { [rowId]: columnId }, feedback?: { [rowId]: string } }`
   - Bounded 2–6 rows × 2–6 columns to start.
2. **Extend classifications.ts** — add `MATRIX` to
   `QUESTION_TYPES` + `ITEM_ID_PREFIX` (`NCLEX_MAT_`).
3. **Extend types.ts** — add `MatrixContent` /
   `MatrixCorrect` interfaces and union them into
   `BankItemContent` / `BankItemCorrect`.
4. **Extend form-shape.ts** — decide whether Matrix lives
   alongside Family A fields on `BankFormInitial` (adds
   `rows`, `columns`, `cell_map`) or if Family B gets a
   disjoint initial type. Probably additive fields with
   sensible empty defaults — keeps `rowToInitial` simple.
5. **Create `lib/bank/parsers/matrix.ts`** — validates
   row/column bounds, every row has exactly one correct
   column, all referenced column IDs exist.
6. **Update `parseByType` dispatcher** — route `MATRIX` to
   the new parser.
7. **Create `lib/bank/editors/matrix-editor.tsx`** — grid
   UI: rows × columns, one radio per cell grouped by
   `name="matrix_correct_${rowId}"`. Add/remove row + add/
   remove column controls. Hidden inputs for row IDs +
   texts, column IDs + texts, so the FormData carries the
   whole shape without any manual marshalling (same
   pattern as Family A editors).
8. **Wire `renderEditor()` in `editor-shell.tsx`** to the
   new `MatrixEditor`.
9. **Update `rowToInitial` in `page.tsx`** to map the
   Matrix JSONB back into `BankFormInitial` fields.
10. **Add a Matrix seed row** so the list/focus view has
    something to render. Stays in the dev Supabase project.

#### Known risks / watch-outs

- Matrix FormData shape uses per-row correct IDs — the
  dispatcher's current `correctIds: string[]` doesn't fit.
  `parseByType` may need to accept a `matrix` branch with
  its own param shape, or the parser pulls directly from
  FormData. Settle this before coding the editor.
- Several pre-existing unstyled class names noted in the
  1.4 entry (`bank-grid-2`, `bank-grid-3`, etc.) will
  become more visible once Matrix adds grid UI of its own.
  Consider fixing in a side slice, not mid-Family-B.
- Student-view preview for Matrix still deferred — will
  come with the student runner.

#### Out of scope for 1.5

- Other Family B types (Highlight, Cloze, Drag-drop,
  Bow-tie) — each gets its own slice.
- Tutor-side authoring (reuses same editors against
  `nclex_tutor_questions` — separate slice).
- Student runner (separate track).

---

## Session — 2026-04-21 (Bank Slice 1.3 — editor architecture refactor)

Restructured the Family A authoring form from one monolithic
client component into a shell + per-type editor pattern.
Zero UI changes; zero behaviour changes beyond a pre-existing
edit-save bug fix (see below).

### Why now

Family B (Matrix, Highlight, Cloze, Drag-drop, Bow-tie) are
structurally different UIs, not just variations of an option
list. Adding them to the existing `if (type === 'X')` branches
in a single `form.tsx` would produce a 1500-line tangle.
Refactoring while Family A is still the only thing live keeps
the diff small and reviewable. The new shape also sets up
reuse for (a) tutor-side authoring (parallel ownership model
in bank.md — same UI points at `nclex_tutor_questions`), and
(b) the future student-side question runner (same per-type
component split, display-only).

### Decisions (from discussion with Sam)

- **Shell + per-type editor, not type-branches.** Shell owns
  the ~80% shared (stem, rationale, classification axes,
  housekeeping, actions). Editors own the ~20% unique per
  type. `form.tsx` becomes a thin re-export dispatcher.
- **Editors live in `lib/bank/editors/`, not route-local.**
  Same reason as `lib/bank/types.ts` — tutors will need
  these. `lib/bank/` is the bank's shared machinery.
- **Parsers extracted per-type too.** `lib/bank/parsers/` with
  one file per type + a dispatcher index. `actions.ts` calls
  `parseByType(question_type, payload)`. Same pattern as the
  editors — Family B parsers will be bespoke per type.
- **`types.ts` stays Family A only.** Each future type
  extends the discriminated union in its own slice, when
  the shape is actually settled. No speculative types.
- **Name-based form fields instead of manual FormData
  appendage.** Editors render inputs with `name=` attrs so
  their values flow directly into the outer FormData. The
  shell's onSubmit no longer marshals editor state — there's
  no editor state to marshal from its perspective. Server
  payload is byte-identical to Slice 1.2.
- **Sam authorised one bug fix alongside the refactor
  (Option B).** Slice 1.2's `form.tsx` never posted
  `item_id`, so Save-changes on an existing row would have
  returned "Missing item_id." The new shell renders a hidden
  `<input name="item_id">` in edit mode. One-line fix; the
  refactor's verification checklist ("Edit saves updates")
  wouldn't have passed without it.

### Files created

- `mynclex/lib/bank/parsers/mcq.ts` — MCQ content/correct builder.
- `mynclex/lib/bank/parsers/tf.ts`
- `mynclex/lib/bank/parsers/sata.ts`
- `mynclex/lib/bank/parsers/select-n.ts`
- `mynclex/lib/bank/parsers/index.ts` — `parseByType()` dispatcher.
- `mynclex/lib/bank/editors/mcq-editor.tsx` — option list + radio.
- `mynclex/lib/bank/editors/tf-editor.tsx` — locked True/False.
- `mynclex/lib/bank/editors/sata-editor.tsx` — option list + checkboxes.
- `mynclex/lib/bank/editors/select-n-editor.tsx` — option list + count field.
- `mynclex/app/(app)/admin/bank/editor-shell.tsx` — shared frame.

### Files modified

- `mynclex/app/(app)/admin/bank/form.tsx` — now a ~15-line
  re-export that wraps `EditorShell` (page.tsx still imports
  `BankForm` from the same path).
- `mynclex/app/(app)/admin/bank/actions.ts` — internal
  `parseFormData()` now delegates the type-specific branches
  to `parseByType()`. Auth gate, `nextItemId()`, DB write,
  `revalidatePath`, `redirect` — all unchanged.

### Files unchanged

- `mynclex/app/(app)/admin/bank/page.tsx`
- `mynclex/lib/bank/types.ts`
- `mynclex/lib/bank/classifications.ts`
- `mynclex/lib/bank/form-shape.ts`
- `mynclex/app/dashboards.css` and every other CSS file.
- DB schema, RLS, seeds.

### Verified
- `tsc --noEmit` clean.
- `eslint app/(app)/admin/bank lib/bank` clean.
- `npm run build` clean — every route still compiles.
- `CLIENT_NEEDS_CATEGORIES` referenced only in
  `editor-shell.tsx` (UI) + `classifications.ts` (source) +
  `actions.ts` (server validation). Not duplicated across
  editors — the shell owns classification dropdowns once.
- `MIN_OPTIONS` / `MAX_OPTIONS` appear in each of the 3
  add/remove-capable editors + the 3 add/remove-bound
  parsers. This is by design: editors gate the Add/Remove
  buttons, parsers enforce server-side bounds. Neither is
  a classification dropdown.
- Server/client directives correct on every file: parsers
  have none (server-safe), editors all `'use client'`,
  shell + form `'use client'`, actions `'use server'`,
  page has no directive (server component).

### Next session
- **Bank Slice 1.4 — Family B, first type.** Matrix is the
  most bounded of Family B (grid of rows × columns, each cell
  a radio). Good candidate to prove the new architecture
  scales. Alternatives: Bow-tie (signature NGN but fixed 5-
  slot shape), student runner (reverse direction — consume
  the same per-type split for display).

---

## Session — 2026-04-21 (UI Slice 1 — light theme migration)

Moved MyNclex off the dark landing-page palette for every
authenticated and auth page. Landing page untouched.

### Decisions (from discussion with Sam)

- **Landing stays dark; everything else goes light.** Long-dwell
  product pages (bank, future rationales, programme content) need
  to read like documents, not marketing.
- **Copy the QAcademy palette from MyTeacher/Licensure exactly.**
  Same navy `#1e3a5f`, teal `#2d7d72`, `#f9fafb` bg, white cards.
  Three-product consistency beats a bespoke MyNclex theme.
- **System font stack** (`-apple-system, ...`) instead of Inter —
  matches siblings. Inter removed from body font chain.
- **Same class names everywhere.** No component code changes; only
  CSS files and import lines edited. `landing.css` keeps its dark
  palette scoped to itself.
- **Kept `.shell-dropdown-item-current`** in the new light
  shell.css (teal text on `--primary-light`, no hover change) so
  the role-switcher dropdown still marks the active workspace.
  Dropping it would have been a silent UX regression.

### Files created
- `mynclex/app/tokens.css` — QAcademy light palette + shared
  primitives (`.btn-*`, `.form-group`, `.alert-*`).
- `mynclex/app/auth.css` — light auth-card styling for /login
  and /register. Replaces `app/register/auth.css`.

### Files rewritten
- `mynclex/app/shell.css` — white topbar, navy brand, teal chip.
- `mynclex/app/dashboards.css` — light dashboards, section-cards,
  pick-role, no-access, `/admin/bank` split-panel + table + form.

### Files modified (import swaps only)
- `mynclex/app/login/page.tsx`
- `mynclex/app/register/page.tsx`
- `mynclex/app/pick-role/page.tsx`
- `mynclex/app/no-access/page.tsx`
- `mynclex/app/(app)/layout.tsx`

### Files deleted
- `mynclex/app/register/auth.css` (moved to `app/auth.css`).

### Untouched
- `mynclex/app/page.tsx` — landing.
- `mynclex/app/landing.css` — landing palette + visuals.
- Every component file (topbar, role-chip, user-menu, footer,
  bank form, admin page, etc.).
- Middleware, Supabase clients, Server Actions, DB schema, RLS.

### Verified
- `tsc --noEmit` clean.
- `eslint app components` clean.
- No stray dark-palette `rgba(232, 238, 245, ...)` or
  `rgba(9, 21, 36, ...)` values outside `app/landing.css`.
- Only `app/page.tsx` still imports `landing.css`.

### Next session
- Return to bank work — Family B authoring (Matrix first is
  most-bounded; Bow-tie is highest-profile NGN), RLS on the
  remaining 6 bank tables, or student-side practice runner.

---

## Session — 2026-04-21 (Bank Slice 1.2 — MCQ/TF/SATA/Select N authoring)

First real curator workflow on top of Slice 1's read-only listing.
Create + edit + delete for the four "Family A" question types:
MCQ, TF, SATA, SELECT_N. These four share ~80% of the authoring UI
(option list + per-option correct toggle + per-option feedback)
and only differ in the correct-answer control — radio for MCQ/TF,
checkbox for SATA/SELECT_N, plus a count field for SELECT_N.

### Decisions (from discussion with Sam)

- **Bundle CRUD into one slice, not split.** Original lean was
  create-only first, edit/delete as a separate 1.3. Sam pushed back:
  edit reuses ~90% of the create form, and splitting was artificial.
  Single slice for all three ops.
- **Family A only this slice.** Of the 9 v1 question types, four
  share an option-list shape (MCQ/TF/SATA/SELECT_N). The other five
  (Matrix, Highlight, Cloze, Drag-drop, Bow-tie) each need a bespoke
  editor — each lands as its own slice (1.3 → 1.7).
- **Keep every field; nothing dropped.** Sam was firm on this even
  for fields not yet wired (`rationale_img`, `marks`, `is_free_sample`,
  `is_builder_visible`, `shuffle_options`, `question_ref`, `batch_id`,
  `nursing_subject`). Form ships with all of them; image upload
  accepts a pasted URL for now (direct upload deferred until
  Supabase Storage is wired in a later slice).
- **Architecture: beta-b pattern, not MyTeacher.** Server component
  page does data + auth gate; thin `'use client'` form component
  handles option-list state + type-driven control swap; plain
  `<form>` submission to Server Actions. Same shape as auth Slices
  1–2 (`actions.ts` next to `page.tsx`). Reviewed both
  `myteacher/teacher/bank.html` (closest in field set, distant in
  stack) and `qacademy-beta-b/src/app/(exams)/question-bank/`
  (native Next.js + Server Actions); beta-b pattern translated 1:1.
- **Split-panel layout (list left, sticky form right).** Sam's call
  over the originally-proposed "list above, form below" — a long
  list would push the form off-screen. Stacks to one column below
  900px so mobile still works.
- **URL-driven edit mode (`?edit={item_id}`).** No separate
  `/new` or `/edit/:id` route. Click a row → URL gains `?edit=ID`
  → form pre-fills. Click "+ New" → URL clears → blank form.
  Bookmarkable, deep-linkable.
- **Auto sequential item IDs per type.** `NCLEX_MCQ_00009`,
  `NCLEX_TF_00001`, `NCLEX_SATA_00001`, `NCLEX_SELN_00001`.
  Computed in the create action via `MAX(item_id) LIKE prefix + 1`,
  fixed-width zero-padded. Type readable at a glance in the
  listing and in error logs. Matches the existing seed.
- **Question type locked on edit.** Changing type would invalidate
  both the JSONB shape (`content` / `correct`) and the ID prefix.
  Enforced server-side; the dropdown is `disabled` in edit mode.
- **Hard delete, not archive.** No FK references to bank items in
  v1 (case-study and readiness-pack join tables aren't populated),
  so nothing cascades. Revisit if/when they are.
- **Server Actions re-check auth + BANK_CURATE/SUPER_ADMIN
  independently.** Page-level gate is UX polish; the action-level
  gate is the real security boundary — defends against tampered
  hidden inputs and direct action invocation.
- **Classifications hardcoded.** `lib/bank/classifications.ts` —
  TS constants for question types, NCLEX client-needs categories
  + subcategories, nursing subjects, body systems, difficulty,
  Bloom's, option letters, ID prefixes. Promotable to a DB lookup
  table later if non-engineers need to edit values without a
  deploy. Topic / subtopic stay free-text inputs (open-ended in
  real authoring).
- **JSONB shapes typed in `lib/bank/types.ts`.** Discriminated
  union on `question_type` so future types (Family B) just add
  their branch — editor, future renderer, and scoring functions
  all narrow the same way.

### Files created

- `mynclex/lib/bank/classifications.ts` — hardcoded enums.
- `mynclex/lib/bank/types.ts` — TS shapes for `content` /
  `correct` JSONB (Family A only; Family B added per-slice).
- `mynclex/lib/bank/form-shape.ts` — `BankFormInitial` interface
  + `emptyInitial()` factory. Lives outside the form component
  for the RSC-boundary reason described under "Bug fixed mid-
  session" below.
- `mynclex/app/(app)/admin/bank/actions.ts` — three Server Actions
  (`createBankItemAction`, `updateBankItemAction`,
  `deleteBankItemAction`). Each gates auth + permission, parses
  + validates the form payload into `content` / `correct` JSONB,
  performs the DB write, then `revalidatePath` + `redirect`.
  Auto item-ID computation via `nextItemId()`.
- `mynclex/app/(app)/admin/bank/form.tsx` — `'use client'`
  component. Manages: type selector, variable-length option list
  (A–F, min 2, max 6, default 4 / locked 2 for TF), per-row
  correct toggle (radio or checkbox), SELECT_N count field, all
  classification + housekeeping fields. Submits via Server Action.

### Files modified

- `mynclex/app/(app)/admin/bank/page.tsx` — split-panel layout;
  reads `?edit={id}` searchParam; loads single row in full when
  editing and maps JSONB back into the form's initial-values
  shape; preserves the existing auth gate + listing query.
- `mynclex/app/dashboards.css` — added `bank-split`, `bank-list`,
  `bank-form`, option-row, checkbox group, and button styles.
  Sticky right pane on desktop; stacks below 900px.

### Bug fixed mid-session

After the first push, `/admin/bank` 500'd on the dev Worker:

> Attempted to call emptyInitial() from the server but emptyInitial
> is on the client.

`emptyInitial()` was originally exported from `form.tsx` (which
carries `'use client'`) and called by the server component page.
Next.js blocks any server→client *function call* across the RSC
boundary; only components and props can cross. Type-only imports
work, but runtime helpers don't. Fixed by extracting
`BankFormInitial` + `emptyInitial()` into the new neutral
`lib/bank/form-shape.ts` module (no directive). Both sides import
from there — no boundary crossed. Filed as commit 862a26b.

### Verified locally + on dev Worker

- `tsc --noEmit` clean (mynclex root).
- `eslint app/(app)/admin/bank lib/bank` clean.
- Dev server boots without compile errors locally; the only
  runtime errors in this worktree are the pre-existing missing-
  `.env.local` crash in middleware (no Supabase creds in the
  worktree).
- Sam confirmed `/admin/bank` loads on the dev Worker after the
  fix push (commit 862a26b). Workers Builds auto-deploy picked
  up both pushes within minutes.

### Not yet verified (Sam's session)

- Full create-edit-delete flow end-to-end as both
  `+mynclexsuperadmin` and `+mynclexadmin` (BANK_CURATE granted).
- Type-switching in create mode — TF locking True/False;
  SATA / SELECT_N swapping correct controls; SELECT_N count field
  enforcing exactly N.
- Plain TUTOR / STUDENT direct hit on `/admin/bank` → bounce
  to `/admin`.

### Deferred to future sessions

- **Family B authoring** — each in its own slice (Matrix,
  Highlight, Cloze, Drag-drop, Bow-tie). Each adds a new editor
  branch, a new JSONB shape in `lib/bank/types.ts`, and a new
  scoring function later.
- **Direct image upload** — `rationale_img` accepts a pasted URL
  today. Real Supabase Storage upload + bucket policies land in a
  separate slice that can also wire option-image support.
- **Filter chips + pagination on the listing** — fine at 8 rows
  + a 500-row limit; revisit when the list gets long.
- **Student-view preview** — meaningful only once the student
  quiz runner exists. Reuse the runner in author-preview mode
  rather than building it twice.
- **Tutor-private bank** (`nclex_tutor_questions` and friends) —
  duplicate the same authoring UI with a `tutor_id` filter once
  tutor-side workflows arrive.
- **Soft archive** — current delete is hard. Consider archiving
  if/when bank items are referenced by case studies or readiness
  packs (deferred FK pressure).
- **Toast / status-line feedback polish** — today's feedback is a
  single in-form flash ("Saved ✓") plus inline error banner. A
  page-level toast can wait until other admin sections need one.

### Commits

- `11adceb` — `mynclex: MCQ/TF/SATA/Select N authoring UI — Bank Slice 1.2`
- `862a26b` — `mynclex: fix /admin/bank crash — move shared form shape out of client file`

### Next session

Likely options: (a) Family B authoring — pick one type to do
first (Matrix is the most-bounded; Bow-tie is the highest-
profile NGN signature), (b) RLS on the remaining 6 bank tables,
(c) student-side practice runner so the Bank starts producing
value end-to-end, (d) Supabase Storage wiring so rationale +
option images can be uploaded from the form.

---

## Session — 2026-04-21 (Bank Slice 1 — schema + RLS + seed + admin view)

First build work on The Bank. Scope deliberately narrow: QAcademy-owned
tables only, no tutor-private authoring yet; RLS only on
`nclex_bank_items`; a read-only `/admin/bank` listing page to confirm
RLS and data are wired up end-to-end. No authoring UI, no student
runner yet.

### Decisions (from discussion with Sam)

- **Narrow slice instead of "schema for everything."** All 7 bank
  tables landed in one migration (mechanical copy from `bank.md`), but
  RLS + UI start with `nclex_bank_items` only. Tutor-private tables,
  case studies, and readiness packs are structurally present but RLS-
  disabled; policies come per-table in later slices.
- **Question type scope — MCQ only for Slice 1.** TF is effectively MCQ
  with 2 options; it lands alongside SATA later (SATA forces a second
  scoring function anyway — that's when TF earns its keep).
- **Seed strategy — synthetic placeholders, clearly tagged.** 8 rows
  with `batch_id = 'DEV_SEED_001'` for clean removal. Seed file header
  explicitly flags this as NOT real NCLEX content; real editorial work
  is off-platform per the Content Sourcing decision.
- **QAcademy-owned tables first; tutor-private later.** Tutor tables
  are mechanical duplication once the shape works (same columns plus a
  `tutor_id` FK). Building QAcademy-owned first keeps RLS simpler and
  aligns with the higher-value path (the bank students pay for).
- **Judgment call — added `is_published` to both case-study tables** even
  though `bank.md` only lists it on the two item tables. A case study
  needs a draft/live gate too; without it, cases can't be held back
  mid-authoring. Can drop if Sam wants spec-exact.
- **Judgment call — CHECK constraints on enumerated values**
  (`question_type`, `difficulty`, `cjmm_step`, readiness-pack `status`,
  join-table `position`). Prevents author typos; trivial to ALTER if
  new values arise later.
- **RLS shape for `nclex_bank_items`:**
  - Any authenticated user can SELECT where `is_published = TRUE`.
  - `BANK_CURATE` holders (SUPER_ADMIN bypasses via the helper's
    short-circuit) get full access — read drafts + INSERT/UPDATE/DELETE.
  - Entitlement gating (paid bank access for self-study students) is
    deliberately NOT in RLS. Belongs to the app layer once payments ship.
- **`/admin/bank` follows the hide-what-you-can't-access pattern.**
  Section card only appears on `/admin` for users with `BANK_CURATE` (or
  SUPER_ADMIN). The page itself also gates server-side, so direct URL
  navigation without the permission bounces to `/admin`.
- **Read-only for now.** Authoring (create/edit/delete), question
  detail view, filter chips, and pagination are all deferred.

### Files created

- `mynclex/db/seed-bank-dev.sql` — 8 synthetic MCQ rows.
- `mynclex/app/(app)/admin/bank/page.tsx` — read-only listing.

### Files modified

- `mynclex/db/schema.sql` — 7 bank tables appended.
- `mynclex/db/rls.sql` — RLS block for `nclex_bank_items`.
- `mynclex/app/(app)/admin/page.tsx` — now fetches
  `nclex_admin_permissions`; renders a section-card grid when at least
  one card is visible. First card: Question Bank → `/admin/bank`.
- `mynclex/app/dashboards.css` — `.dash-card--wide` variant,
  `.section-grid` / `.section-card` styles, focused `.bank-table` /
  `.bank-badge` block.

### Migrations applied to dev (`zrakjibtxyzoqcdtvpmq`)

- `mynclex_bank_tables` — the 7 tables.
- `mynclex_bank_items_rls` — RLS enable + 2 policies.
- `mynclex_bank_dev_seed` — 8 INSERT rows.

### Verified locally

- `npx tsc --noEmit` clean.
- `npx eslint` clean on the admin tree.
- Dev server boots without compile errors.
- Unauthenticated `GET /admin/bank` → redirect to `/login` (auth gate
  intact).

### Not yet verified (requires Sam's session)

- Visual rendering for `+mynclexsuperadmin` — should see all 8 rows.
- Section-card hiding for `+mynclexadmin` (no BANK_CURATE granted).
- Redirect for TUTOR/STUDENT attempting to visit `/admin/bank`.

### Deferred to future sessions

- RLS on the other 6 bank tables (per-table as features land).
- Authoring UI for MCQ (create + edit).
- Question detail view.
- Filter chips + pagination on the admin listing.
- SATA + TF (next question-type wave; adds a second scoring function).
- Tutor-private bank view + authoring.
- `BANK_CURATE` CHECK constraint on `nclex_admin_permissions` (still no
  CHECK per main.md's deferral policy).
- `nclex_question_reports` table (separate, from Content Sourcing).

### Manual step Sam may run (optional)

To exercise the non-SUPER_ADMIN curator path on dev:

```sql
INSERT INTO nclex_admin_permissions (user_id, permission)
SELECT id, 'BANK_CURATE' FROM nclex_users
WHERE email = 'mybackpacc+mynclexadmin@gmail.com'
ON CONFLICT DO NOTHING;
```

Or leave it ungranted to test the hide-the-card path for plain ADMIN.

### Next session

Likely options: (a) MCQ authoring UI (create/edit), (b) RLS on the
remaining 6 bank tables, (c) student-side practice runner. Sam's pick.

---

## Session — 2026-04-21 (App shell — Slice 2.5)

Shared app chrome introduced. Each authenticated workspace page
(`/student`, `/tutor`, `/admin`) now renders inside one shell
layout: sticky topbar, footer, and cleaner page bodies.

### Decisions (from discussion with Sam)

- **Single-tier topbar, not topbar+sidebar.** Same pattern MyTeacher
  uses: sticky topbar with logo on the left, middle nav links, user
  controls on the right. Different roles will see different nav
  links when feature pages land. Mobile: hamburger → drawer (scaffold
  only today — nothing to put in it yet).
- **Sidebars are per-feature, opt-in later.** The Bank or Programmes
  may grow sub-navigation sidebars (nested `layout.tsx` under their
  route). Not built today, no plumbing needed now.
- **Topbar mostly empty in the middle today.** No feature pages
  exist yet to link to. As Bank / Programmes / Profile / admin
  sub-routes arrive, links get added here and vary per role.
- **Role switcher moved from inline (bottom of each dashboard) to
  topbar** — now a chip showing the current role that opens a
  dropdown of other roles held. Only rendered for multi-role users.
- **User menu: initials circle** on the far right. Click opens a
  dropdown with name, email, and Sign out (form POST to `/logout`).
  Sign-out button removed from each dashboard body.
- **Route group `(app)`** wraps only the workspace pages. Auth pages
  (`/login`, `/register`), transitions (`/pick-role`, `/router`),
  and dead-ends (`/no-access`) deliberately skip the shell.

### URL impact

None. Route group parens in the folder name don't appear in URLs.
`/student` is still `/student` from the user's perspective.

### Files created

- `mynclex/app/(app)/layout.tsx` — shared shell layout. Fetches
  user, profile, roles, and active-role cookie; passes to topbar.
  Redirects to `/login` if no user.
- `mynclex/app/shell.css` — topbar, dropdown, footer styles.
- `mynclex/components/topbar.tsx` — Server Component, renders the
  topbar skeleton and delegates interactive bits to children.
- `mynclex/components/role-chip.tsx` — Client Component (dropdown
  toggle). Replaces the old bottom-of-page role switcher.
- `mynclex/components/user-menu.tsx` — Client Component (dropdown
  toggle) with sign-out.
- `mynclex/components/footer.tsx` — static footer.

### Files moved

- `mynclex/app/student/` → `mynclex/app/(app)/student/`
- `mynclex/app/tutor/`   → `mynclex/app/(app)/tutor/`
- `mynclex/app/admin/`   → `mynclex/app/(app)/admin/`

### Files modified

- Each role page (`student`, `tutor`, `admin`): stripped the inline
  role badge, inline role switcher, and inline sign-out form. CSS
  imports dropped from page files — layout imports them now. Each
  page keeps its own server-side role check.
- `mynclex/app/dashboards.css`: removed dead `.role-switcher*` and
  `.dash-role-badge` / `.dash-signout-wrap` classes now that the
  topbar owns those concerns.
- `mynclex/app/pick-role/actions.ts`: comment updated to reference
  the topbar role-chip instead of the retired role-switcher.

### Files deleted

- `mynclex/components/role-switcher.tsx` — replaced by the topbar
  role-chip.

### Deferred to future sessions

- **Feature nav links in the topbar** — added per-role as Bank,
  Programmes, Profile, admin sub-sections land.
- **Mobile drawer contents** — scaffolding only today; fills in
  when nav links exist.
- **Active-link highlighting** in the topbar — wire up once there
  are links to highlight.
- **Per-feature sidebars** (e.g. `/bank/*` might get one) — decide
  when the feature is built.
- **Profile link** in user menu — points at `/profile` once that
  page exists.

---

## Session — 2026-04-21 (Auth flow — Slice 2 — role-specific dashboards)

Slice 2 built end-to-end with Claude Desktop (no Claude Web prompt).
Role-specific dashboards now live with per-role server-side guards,
multi-role pick-role page, and an in-dashboard role switcher.

### Decisions (from discussion with Sam)

- **URL shape — Pattern 2 (feature URLs, role-only for authoring areas).**
  Dashboards are role-prefixed (`/student`, `/tutor`, `/admin`) but the
  shared feature pages that arrive later (e.g. `/bank`, `/profile`,
  `/programmes`) will be top-level and render role-adaptive content.
  Tutor/admin authoring pages will still live under `/tutor/*` and
  `/admin/*`. Avoids URL duplication for things that are conceptually
  shared.
- **Multi-role UX — picker + switcher.** First-time multi-role users hit
  `/pick-role`. Subsequent visits honour an `nclex_active_role` cookie.
  A role switcher lives inside every dashboard for cross-over (Sam =
  SUPER_ADMIN + TUTOR).
- **ADMIN and SUPER_ADMIN share `/admin` — single route, section-menu
  model (refined 2026-04-21 same-day).** `/admin` is a menu of admin
  sections (sub-routes like `/admin/payments`, `/admin/bank`, etc.).
  SUPER_ADMIN is NOT "ADMIN with a special extras card" — it's a role
  that bypasses the permission engine entirely via
  `nclex_user_has_permission()`'s SUPER_ADMIN short-circuit. ADMIN is
  a trust gate; real capability is governed per-user by rows in
  `nclex_admin_permissions`.
  - **Hide pattern (A1):** ADMIN only sees section cards for permissions
    they hold. SUPER_ADMIN sees every card. Server-side permission gate
    on every sub-route; UI hide is cosmetic, the gate is the real
    security. No separate `/super-admin` route.
  - **SUPER_ADMIN-only sections** (role assignment, config) are
    implemented as permissions that simply never get granted to plain
    admins — no hard-coded super-admin checks in page code.
  - **Empty state:** an ADMIN with zero permissions lands on `/admin`
    with a "No admin sections granted yet — contact your super admin"
    message.
- **Placeholder dashboard content (Decision 3A).** Student and tutor
  dashboards show welcome + "Coming next:" card. `/admin` shows the
  section-menu placeholder described above. Real UI lands as features
  arrive.
- **`nclex_active_role` cookie** — HttpOnly, SameSite=Lax, path=/,
  30-day max-age. Read only by server code; never touched by browser JS.
  Per-request validation: the cookie's value must match a role the user
  still holds, otherwise they get bounced to `/pick-role`.

### Files created

- `mynclex/app/dashboards.css` — shared shell styles for all role
  dashboards, `/no-access`, `/pick-role`, plus `.role-switcher*` and
  `.pick-role-*` rules. Replaces the old `dashboard/dashboard.css`.
- `mynclex/components/role-switcher.tsx` — Server Component. Small
  "Switch to" block shown only when the user holds >1 role. Each
  button is its own `<form>` posting to `switchRoleAction`.
- `mynclex/app/pick-role/page.tsx` — the picker screen for multi-role
  users. Single-role visitors are bounced back to `/router`.
- `mynclex/app/pick-role/actions.ts` — Server Action used by both
  `/pick-role` and the role switcher. Validates that the user actually
  holds the requested role before setting the cookie.
- `mynclex/app/student/page.tsx` — student dashboard.
- `mynclex/app/tutor/page.tsx` — tutor dashboard.
- `mynclex/app/admin/page.tsx` — admin section menu (ADMIN + SUPER_ADMIN).
  Badge + view driven by `nclex_active_role` cookie, not role holdings.

### Files modified

- `mynclex/app/router/page.tsx` — new dispatch logic: 0 roles →
  `/no-access`; 1 role → that dashboard; ≥2 roles → cookie or
  `/pick-role`.
- `mynclex/app/no-access/page.tsx` — import path updated to
  `../dashboards.css`.
- `mynclex/middleware.ts` — `AUTH_REQUIRED_PREFIXES` updated. `/dashboard`
  removed (route deleted); `/pick-role`, `/student`, `/tutor`, `/admin`
  added.

### Files deleted

- `mynclex/app/dashboard/page.tsx`
- `mynclex/app/dashboard/dashboard.css`
- `mynclex/app/dashboard/` folder

### Security posture (Pattern 2 / server-first)

- Every role page fetches the user's roles server-side and `redirect`s
  to `/no-access` if the required role isn't present — guard runs
  before any HTML is rendered.
- The `switchRoleAction` re-checks `nclex_user_roles` before trusting
  whatever role came in from the form — the cookie is never set for a
  role the user doesn't currently hold.
- No business logic in the browser. Forms post straight to Server
  Actions. Cookies are `httpOnly` so browser JS can't read or forge
  them.

### Deferred to future sessions

- **Feature pages** (bank, programmes, profile, classes, curriculum,
  user management) — not in Slice 2's scope.
- **Per-permission gates on admin sub-routes** via
  `nclex_user_has_permission()` — added as each real admin section
  lands (e.g. `/admin/payments` checks `PAYMENTS_REVIEW`).
- **Draft permission list** (not yet a CHECK constraint):
  `PAYMENTS_REVIEW`, `BANK_CURATE`, `TUTOR_VET`, `REPORTS_REVIEW`,
  `USERS_MANAGE`, `CONFIG_EDIT`. Expand as features land. Some
  (`USERS_MANAGE`, `CONFIG_EDIT`) stay SUPER_ADMIN-only by policy.
- **"View as student" / impersonation** for admins — future.
- **Role revocation UI** — admins still edit roles via SQL for now.
- **Cookie writeback on direct URL access.** If a user navigates to
  `/tutor` directly while their cookie says `SUPER_ADMIN`, the cookie
  is not updated. Works fine, just a tiny drift. Revisit if it causes
  confusion.

### Manual step Sam will perform

- After testing, grant SUPER_ADMIN + TUTOR to his account via SQL so
  the multi-role flow can be exercised:
  ```sql
  INSERT INTO nclex_user_roles (user_id, role)
  SELECT id, 'SUPER_ADMIN' FROM nclex_users WHERE email = 'mybackpacc@gmail.com';
  INSERT INTO nclex_user_roles (user_id, role)
  SELECT id, 'TUTOR' FROM nclex_users WHERE email = 'mybackpacc@gmail.com';
  ```

### Next session

Slice 3 (password reset + email confirmation), or pivot to first real
feature slice (likely the bank or programmes), at Sam's discretion.

---

## Session — 2026-04-21 (Auth flow — Slice 1 — Claude Web + Desktop)

First Next.js code written for MyNclex. Auth flow Slice 1 complete:
students can register, log in, reach a placeholder dashboard, and
sign out.

### Decisions

- **Server Actions** for register and login (not client-side Supabase
  calls). Idiomatic Next.js, atomic rollback on failure, password
  never exposed beyond the worker runtime.
- **`@supabase/ssr`** wired in with browser / server / middleware clients.
  Clients are functions, not module-scoped instances, per CLAUDE.md rule #4.
- **`getUser()` over `getSession()`** everywhere on the server. Revalidates
  against Supabase's auth server (rule #4).
- **`export const dynamic = 'force-dynamic'`** on all authenticated pages
  (/router, /dashboard, /no-access).
- **Auth rollback:** if profile or role insert fails post-signup, the
  Server Action deletes the auth.users row via service role key.
  Prevents orphan rows blocking re-registration.
- **No email confirmation** — Supabase setting stays off (matches
  Licensure). Flip on before go-live.
- **No-roles → /no-access dead-end.** Safer than auto-assigning a role;
  surfaces bugs rather than masking them.
- **Landing page** swapped from email-capture form to Sign in / Create
  account buttons. Everything else preserved.
- **Single /dashboard placeholder** catches all roles in Slice 1;
  role-specific dashboards come in Slice 2.

### Files created

- `mynclex/lib/supabase/client.ts` — browser client.
- `mynclex/lib/supabase/server.ts` — server client (reads cookies).
- `mynclex/middleware.ts` — session refresh + route guards.
- `mynclex/app/register/page.tsx` — register form.
- `mynclex/app/register/actions.ts` — signup Server Action with rollback.
- `mynclex/app/register/auth.css` — shared auth-page styles.
- `mynclex/app/login/page.tsx` — login form.
- `mynclex/app/login/actions.ts` — login Server Action.
- `mynclex/app/router/page.tsx` — post-login traffic controller.
- `mynclex/app/dashboard/page.tsx` — placeholder dashboard.
- `mynclex/app/dashboard/dashboard.css` — dashboard styles.
- `mynclex/app/no-access/page.tsx` — no-roles dead-end.
- `mynclex/app/logout/route.ts` — POST-only sign-out handler.

### Files modified

- `mynclex/app/page.tsx` — landing swap.
- `mynclex/app/landing.css` — added `.cta` button styles.
- `mynclex/package.json` — added `@supabase/ssr`.
- `mynclex/CLAUDE.md` — added Environment variables section.

### Manual steps Sam will perform after Claude Desktop finishes

- Create `mynclex/.env.local` with `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Add redirect URLs in Supabase dashboard:
  - `http://localhost:3000/**`
  - `https://qacademy-dev-mynclex.mybackpacc.workers.dev/**`
- Register a test account, then run SUPER_ADMIN seed SQL (Claude Web
  will provide).

### Known followups / deferred

- SUPER_ADMIN seed for Sam's account — manual SQL after first signup.
- Email confirmation — flip on in Supabase before real users.
- Password reset flow (`/forgot-password`, `/reset-password`) — Slice 3.
- Role-specific dashboards — Slice 2.
- Role-picker UI for multi-role users — Slice 2.
- `nclex_sessions` table for concurrent session control — Slice 3.
- `nclex_auth_events` audit log — Slice 3.
- Wrangler env vars for prod deployment — not yet set.
- Google OAuth — deferred.
- `must_change_password` enforcement flow — deferred.

### Next session

Sam will test the flow end-to-end on dev. Once confirmed working,
next session picks up Slice 2 (role-specific dashboards) or jumps
to another priority at Sam's discretion.

---

## Session — 2026-04-21 (First build — auth schema, Claude Web + Desktop)

First code written for MyNclex. Auth + roles schema laid down and
applied to the dev Supabase project.

### Decisions

- `nclex_users.id` = `auth.users.id` (UUID PK, standard Supabase pattern).
  Greenfield choice — Licensure/MyTeacher use a separate TEXT user_id +
  auth_id UUID for historical reasons; MyNclex skips that layer.
- Roles stored as rows in `nclex_user_roles` (one row per user-role pair),
  not as an array column. First QAcademy product with real multi-role
  design requirement (Sam = SUPER_ADMIN + TUTOR).
- Permissions stored as rows in `nclex_admin_permissions`. No CHECK
  constraint on permission values yet — deferred until real admin tasks
  surface (per `main.md`).
- Profile creation happens client-side on signup (matches MyTeacher
  pattern). No `auth.users` trigger — avoids cross-product contamination.
- No anon SELECT policy on `nclex_users` — deliberate departure from
  MyTeacher's email-enumeration trade-off.
- Dropped `destination_country` / `destination_region` from the users
  table; will land with Journey Tracker build.

### Columns kept from Licensure/MyTeacher pattern

`forename`, `surname`, `name`, `phone_number`, `avatar_url`,
`must_change_password`, `signup_source`, `last_login_utc`.

### Columns deliberately NOT copied

`username` (unused), `program_id` / `cohort` / `level` (NMC-specific),
`role` as a column (replaced by the separate `nclex_user_roles` table),
`user_id TEXT + auth_id UUID` split (greenfield uses UUID PK directly).

### Files created

- `mynclex/db/schema.sql` — 3 tables, 1 index.
- `mynclex/db/rls.sql` — 3 helper functions, 3 × ENABLE RLS, 10 policies.
- `mynclex/db/README.md` — short entry-point doc.

### Migrations applied

- `mynclex_initial_auth_schema` — tables + index.
- `mynclex_initial_auth_rls` — helpers + RLS policies.

### Helper functions

- `nclex_user_id()` → `auth.uid()`.
- `nclex_user_has_role(role)` → bool.
- `nclex_user_has_permission(perm)` → bool (SUPER_ADMIN passes implicitly).

### Deferred to future sessions

- `nclex_sessions` (concurrent session control) — auth build.
- `nclex_reset_requests` — forgot-password flow.
- `nclex_auth_events` — audit log.
- `nclex_tutor_applications` — "Become a Tutor" public form.
- `nclex_tutor_profiles` — tutor-specific extra fields.
- Manual SUPER_ADMIN seed for Sam's account (runs after register flow exists).

### Next session (continues today)

Sam is driving from Claude web. After this report, he will decide what
to tackle next — likely either the auth flow (register / login /
router / guard) or the basic dashboard placeholders.

---

## Session — 2026-04-20 (Product planning — Claude Web, second long session)

Marathon session. **All 9 MyNclex planning topics now settled.**
Today's work closed the three topics outstanding after the
2026-04-19 session — the bank, curriculum authoring UX, content
sourcing, and the entire student enrolment flow (self-study +
tutored).

### Topics settled today

- **Curriculum Authoring UX** — 14 decisions locked. Programme →
  Week → Module → Activity hierarchy. Six activity block types in
  v1. Weeks view + Calendar view. Up/down arrow reorder. Dual
  publish status (week and module can be Live / Draft
  independently). In-place inline activity picker. Mockups
  produced. See `product-plan/curriculum-authoring-ux.md`.

- **The Bank** — 9 sections covering the full question schema.
  Seven-table structure across QAcademy-owned and tutor-private
  sets. JSONB `content` / `correct` columns. 9 question types in
  v1 (MCQ, TF, SATA, Select N, Matrix, Highlight, Cloze, Drag-drop,
  Bow-tie; Trend deferred). NCSBN-exact scoring via 5 modular
  functions. Case studies with 6 chart tabs and progressive
  unfolding via `visible_from`. Readiness packs as curated
  assessments. 10 filterable classification axes. Per-option
  feedback lives in the `correct` JSONB. See
  `product-plan/bank.md`.

- **Content Sourcing** — reframed as an editorial/business problem,
  out of scope for product build. Bank to be seeded with synthetic
  sample questions for dev/testing. Real editorial work runs off-
  platform led by Sam as a nurse, with vetted nurse educators.
  Two small system decisions taken:
  - No in-platform review workflow — single `is_published`
    boolean.
  - "Report this question" ships in v1 (minimum version). New
    table `nclex_question_reports`.
  Documented in `product-plan/main.md` Content Sourcing section.

- **Self-Study Enrolment** — pay-first model inherited from
  Licensure. Four bank packs (Trial, 30d, 90d, 180d) plus separate
  standalone readiness packs. Dual currency (GHS default, USD
  toggle) via single-row / two-column model on `nclex_products`.
  Currency passed as parameter to a MyNclex-specific payment
  worker. Post-payment: welcome email immediately, cold-start
  dashboard with clear CTAs, "My Payments" page for transaction
  history. Edge cases inherit Licensure behaviour. Documented in
  `product-plan/payments-and-enrolment.md`.

- **Tutored Enrolment** — public programmes list page. Per-
  programme price visibility is a tutor choice via
  `show_price_publicly`. Contact-first flow routes through
  QAcademy as pass-through enquiry (new `nclex_programme_enquiries`
  table). Bundled single-checkout transaction (programme fee +
  subsidised bank), internal split, manual payouts for v1. Auto-
  enrolment on successful payment. No waiting room. Edge cases:
  full/closed programmes visible but not purchasable; soft-stopped
  tutors' programmes hidden; cancellations admin-handled. No
  waitlist in v1. Multiple concurrent enrolments allowed.
  Documented in `product-plan/payments-and-enrolment.md`.

### Revision to earlier decision

- **Programme Structure (2026-04-19) — revised.** Cohort/rolling
  mode distinction removed. Time-gated weekly progress no longer a
  platform behaviour. Content visibility now controlled per-
  activity via Live/Draft status. Rationale: tutors want
  flexibility, not mode-picking. Original decision preserved in
  this session log for audit.

### Schema additions queued for build

- `nclex_products` — full shape locked.
- `nclex_question_reports` — student-reported questions.
- `nclex_programme_enquiries` — contact-first enquiries.
- `nclex_enrolments` — student ↔ programme link.
- `is_published` boolean added to `nclex_bank_items` and
  `nclex_tutor_questions`.
- MyNclex-specific worker: `qacademy-mynclex-payment-worker`
  (dev and prod).

### Planning status — end of day

**9 of 9 topics settled.** Planning phase closed.

### Next session

- Move from planning to build. Suggested order: (1) database
  schema sprint (`nclex_*` tables + RLS), (2) auth setup for
  MyNclex-specific `nclex_users`, (3) public landing page + bank
  products catalogue, (4) self-study pay-first flow (subscribe
  page + payment worker + confirmation page), (5) admin authoring
  flows, (6) tutored flows. Prioritisation to be confirmed in
  next session.

---

## Session — 2026-04-20 (Planning continued — Claude Web + Claude Code)

Three topics settled in one day, with visual reference artefacts for
two of them. Still no code — planning docs only.

### The Bank (Question Bank) — SETTLED

Parallel ownership model (QAcademy-owned + tutor-private, identical
shapes). Seven core tables. All 9 question types ship in v1 (MCQ,
TF, SATA, Select N, Matrix, Highlight, Cloze, Drag-drop, Bow-tie;
Trend deferred to v2). Polymorphic JSONB `content` + `correct`
columns. Per-option feedback in `correct`. Case studies with 6
JSONB chart tabs and `visible_from` unfolding. Readiness packs as a
QAcademy-only product with reserved questions. Five scoring
functions cover all 9 types, NCSBN-exact. 10 classification axes,
all filterable.

Full spec in `product-plan/bank.md`. NGN visual primer saved at
`product-plan/mockups/ngn-primer.html`.

### Curriculum Authoring UX — SETTLED

Unblocked by the bank settlement the same day. Structure hierarchy:
Programme → Week → Module → Activity. Screens: My Programmes
landing, single-screen New Programme form (7 fields), Weeks
Overview with Weeks-view + Calendar-view toggle, Week Builder with
module cards and activity rows, inline 3×2 add-activity picker, six
activity editors (Text, PDF, External link, Live session, Mock,
Practice quiz). Reorder via up/down arrows (drag-and-drop deferred
to v2). Dual publish status (module + week both carry Live/Draft
pills).

Full spec in `product-plan/curriculum-authoring-ux.md`; mockups at
`product-plan/mockups/curriculum-authoring-ux.html`.

### Repo reshuffle

`mynclex/docs/product-plan.md` rebuilt into a `product-plan/`
folder: `main.md` (overview + index), `bank.md`, and
`curriculum-authoring-ux.md` as siblings. Visual HTML references
live in `product-plan/mockups/`. Future topic docs (payments,
registration, etc) slot in as siblings.

### Also settled this session — Content sourcing

Late addition to the planning day. Content sourcing reframed as an
**editorial/business problem, out of scope for product build**. The
bank will be seeded with synthetic sample questions for development
and testing; real content comes later via off-platform editorial
work with vetted nurse educators, led by Sam as a nurse himself.

Two small system decisions taken:
- **No in-platform review workflow.** Single `is_published` boolean
  on questions; reviewing happens off-platform.
- **"Report this question" ships in v1** (minimum version). New
  table `nclex_question_reports`; simple "Dismiss" / "Mark for fix"
  admin queue.

Schema consequences: `is_published` column added to
`nclex_bank_items` and `nclex_tutor_questions`;
`nclex_question_reports` table added.

Documented in `product-plan/main.md` (new "Content Sourcing"
section). `bank.md` cross-references this section.

### MyNclex planning status — end of day

- **8 of 9 topics settled.** Only **Student enrolment flow** remains
  open.

### Next session

- Settle **Student enrolment flow** (signup → programme enrolment →
  bundled bank purchase → Journey Tracker handoff).
- Once that lands, planning is complete and build can begin.

---

## Session — 2026-04-19 (Product planning — Claude Web)

Long planning session to flesh out `docs/product-plan.md` from
skeleton to a usable spec. No code written. Five of the nine planned
topics settled in one sitting.

### Topics settled

- **Roles** — STUDENT, TUTOR, ADMIN, SUPER_ADMIN. Users can hold
  multiple roles. No platform-level "programmes" category — NCLEX-RN
  is the only exam. Permission list for ADMIN deferred until real
  admin tasks surface.
- **Journey Tracker** — 7 phases (destination & plan → credential
  evaluation → English proficiency → state board app → exam prep →
  ATT & exam booking → licensure). Phase 7 (migration) deferred to
  v2. Tutor programmes plug into Phase 4.
- **Programme Structure** — week-based, tutor-defined weekly template
  with a default shape, 6 block types in v1, both cohort and rolling
  modes, time-gated progress, mixed auto/tick completion, tutor-
  authored questions private to tutor, co-tutors have identical
  powers.
- **Tutor Onboarding** — Shape 1 vetted marketplace, no public self-
  signup. Public "Become a Tutor" application form storing to
  `nclex_tutor_applications` with status. Vetting off-platform.
  Account creation via admin-triggered setup-link email. Soft-stop
  deactivation. Admin-only deletion.
- **Pricing** — Dual currency (GHS + USD, manual dual pricing, no IP
  detection). Bank as duration packs (30/90/180 days). Readiness
  packs as separate product. Tutor SaaS subscription model (Camp 2),
  flat monthly fee, no payment splits. Tutored students get bundled
  bank access at 50% subsidy, paid to QAcademy directly. Provisional
  numbers anchored (validate before launch).

### Topics still open (from the original nine)

- **The bank** — content structure, question types in v1,
  organisation (topics, difficulty, NCLEX test plan categories)
- **Curriculum authoring UX** — how tutors physically build a week
- **Student enrolment flow** — discovery → payment → start
- **What a tutorial session looks like** on the platform
- **Content sourcing** — where do the initial NCLEX questions come from

### Repo hygiene

- This file created — MyNclex now has its own product-local
  SESSIONS.md, matching MyNMCLicensure and MyTeacher.
- The root `SESSIONS.md` is being retained as a repo-wide milestone
  log only; detailed product work moves to product-local session
  logs.

### Next session

- Pick up one of the five remaining topics. Recommended next: **The
  bank** (content structure + sourcing), as everything else
  (authoring UX, enrolment flow, session UX) depends on the bank
  being understood first.
- Still no code. Design + plan phase continues.
