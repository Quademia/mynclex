# MyNclex Sessions Log

Running log of MyNclex work sessions. Each entry: what was done + what's
queued for next session. Newest on top. Product-local — isolated from
other QAcademy products, per the extraction rule in CLAUDE.md.

---

## Session — 2026-04-29 (later — prod deploy cleanup + GHA-based CD migration)

A second session on 2026-04-29 after a break following slice 7. Started
with the open thread from the previous session — phantom Worker on
personal CF, real prod still on pre-slice-1 code, no `account_id`
pinning in `wrangler.jsonc`. Ended several pivots later with CD fully
migrated off Cloudflare Workers Builds and onto GitHub Actions.

Three new commits authored this session:

```
5538449 docs: add CD architecture reference
0031e44 infra: add GitHub Actions workflows for dev + prod Worker deploys
31221ab infra: pin Cloudflare account_id for dev (personal) and prod (workspace)
```

Plus PR #4 (`main` → `prod`) to advance prod and exercise the new
prod workflow on a real merge.

### Discovery 1 — Two CF accounts is by design, not by accident

Opening framing was that the personal-vs-workspace CF split needed
consolidation. Sam clarified it's intentional: personal CF hosts
non-prod / front-page surfaces; workspace CF (qacademynurses) hosts
paid prod. The 2026-04-29 phantom wasn't a "you set it up wrong" bug —
it was a "nothing enforced the boundary you'd already chosen" bug.

Pivot: don't consolidate accounts, **enforce the boundary**.

### Discovery 2 — Direct push to `prod` doesn't trigger workspace CF

While diagnosing why slice 7 hadn't reached real prod, found that
workspace CF Workers Builds had no record of the 2026-04-29 push at
all. Empirically, direct `git push origin prod` doesn't fire
workspace CF; PR-merge via GitHub UI does. GitHub fires the same
`push` webhook in both cases in theory; CF filters on something extra
in practice. Mechanism unknown.

Saved at the time as a feedback memory; later deleted (see Discovery 4)
once GHA replaced CF Workers Builds and the quirk no longer applied.

### Discovery 3 — CF dashboard config silently drifted

PR-merged `main` → `prod` to test whether a merge would fire workspace
CF. It did — the build started, then **failed**. The error was the
`account_id` pinning catching config drift: the deploy command on
workspace CF Workers Builds had silently changed from
`npx wrangler deploy --env prod` (working, 2026-04-28 successful build)
to bare `npx wrangler deploy` (broken, today). Cause unknown. Without
the pinning, the broken command would have shipped dev Supabase config
to the prod Worker — a much worse outcome than today's failure.

Fixed the dashboard setting, retried, build went green. Slice 7 +
dual-mode preview reached real prod for the first time.

### Discovery 4 — GHA is the structural fix

Long discussion with Sam about whether the current setup (one repo,
two CF Workers Builds connections) is "best." Considered alternatives
including a two-repo split with the prod branch mirrored to a separate
workspace-owned repo. Settled on:

- **One repo stays one repo.** Single source of truth.
- **Move CD off CF Workers Builds and onto GitHub Actions.** Mirrors
  the existing `migrate-prod.yml` pattern. Build/deploy commands now
  live in YAML in git instead of in the CF dashboard — drift becomes
  impossible without a visible commit.
- **Scoped CF API tokens stored as GitHub Secrets** become the hard
  isolation boundary. Each token can only act on its own account.

### What landed

`31221ab` — `wrangler.jsonc` now pins `account_id` for both envs
(top-level = personal `e745e37…`, `env.prod` = workspace `38efec1…`).
This is the lock that caught Discovery 3 before it shipped.

`0031e44` — `.github/workflows/deploy-dev.yml` and `deploy-prod.yml`.
Each runs on push to its branch, builds via `npm run cf:build`, deploys
via `cloudflare/wrangler-action@v3` using a per-account API token from
GitHub Secrets. Dev workflow proven green on push; prod workflow proven
green on the PR #4 merge.

`5538449` — `docs/product-plan/cd-architecture.md`. Living-document
reference covering the deploy topology, where every piece of config
lives, the three layers of locks (token scope / account_id pinning /
branch-to-workflow mapping), common operations (rotating tokens,
adding a new env, investigating failed deploys), and a history note
explaining why GHA replaced CF Workers Builds.

### Cleanup actions (off-git)

- Phantom `mynclex` Worker on personal CF deleted
- Workspace CF deploy command corrected (added `--env prod` back)
- Legacy CF Workers Builds GitHub integrations disconnected on both
  accounts. CF accounts are now hosts only — they run the deployed
  Workers and hold env vars/secrets but build/deploy nothing.
- Two CF API tokens created via the "Edit Cloudflare Workers" template,
  scoped to one account each, stored as `CLOUDFLARE_API_TOKEN_DEV` and
  `CLOUDFLARE_API_TOKEN_PROD` GitHub Secrets
- Verified post-disconnect push fires only GHA, no parallel CF build

### Memory state changes

- Deleted: `project_prod_deploy_account_mismatch.md` (open thread
  resolved)
- Deleted: `feedback_prod_merge_via_pr.md` (technical reason gone with
  the move to GHA)
- Rewritten: `project_cd_setup.md` — captures the GHA-based topology
- Updated: `MEMORY.md` index

### Queued for next session

- **Slice 8 — CLOZE editor.** Next in the questions-and-wrappers
  rebuild. Sentence with inline `{N}` markers in the stem, one
  dropdown per blank, per-blank feedback nested by choice. Markers
  auto-renumber on save. Ships with the dual-mode `<PreviewToggle>`
  from day one (per slice plan §11; slices 8–10 build with the toggle,
  slice 11 back-fills the older five). Architecture and atom inventory
  in `docs/product-plan/questions-and-wrappers-rebuild.md` and
  `questions-and-wrappers-rebuild-slice-plan.md` §8.

---

## Session — 2026-04-29 (Questions-and-wrappers rebuild — slices 4, 5, 6, 7 + dual-mode preview infrastructure + slice plan re-org)

Continued the rebuild from the slice 1-3 foundation. Family A
completed (SATA, SELECT_N) and Family B started (MATRIX, BOWTIE).
Slice 7 also introduced the dual-mode preview pattern
(`<PreviewToggle>` Student / Answer key) and wired it into BOWTIE.
The slice plan was re-organised at end of day to fold the dual-mode
preview migration into the build order as its own slice (now
slice 11), bumping the wrappers and swap to 12 / 13 / 14.

Four commits on `origin/main` over the day:

```
e7bba70 authoring: slice 7 — BOWTIE editor + dual-mode preview
f0b3f5a authoring: slice 6 — MATRIX editor
484f80a authoring: slice 5 — SELECT_N editor
18b03b0 authoring: slice 4 — SATA editor
```

Plus a closing doc commit (this session log + slice plan re-org).

### Slice 4 — SATA editor (commit `18b03b0`)

Multi-select variant of MCQ. Three new files + dispatch wiring:

- `lib/authoring/parsers/sata.ts` — vendored from
  `lib/bank/parsers/sata.ts`. `correct.answers` is a string array
  (vs MCQ's scalar `correct.answer`).
- `lib/authoring/editors/sata-row-mapper.ts` — `SataEditorInitial`
  has `correct_ids: string[]`. `SataDbRow = Omit<McqDbRow,'correct'>`
  + sata-shaped JSONB. Same DB table as MCQ; only JSONB differs.
- `lib/authoring/editors/sata-editor.tsx` — body + host + private
  `SataOptionList` (checkboxes, name="correct_id" emits one value
  per ticked box) + private `SataPreview` (square checkboxes
  pre-submit, hint reads "Tick all correct").

Dispatch: `parseQuestionFormData` switch promoted from MCQ/TF
ternary to a switch with a SATA case. SUPPORTED_TYPES set widened.
Picker + bank-list-v2-client + both v2 pages all gain SATA. New
CSS rule `.auth-preview-checkbox` (square sibling of the existing
`.auth-preview-radio`).

Slice plan §13 ticked. Browser-tested on admin + tutor surfaces.

### Slice 5 — SELECT_N editor (commit `484f80a`)

SATA + a curator-picked count. Same template as slice 4:

- `lib/authoring/parsers/select-n.ts` — vendored. Takes a
  `selectCount` argument; rejects a save where
  `correctIds.length !== selectCount` or count is out of bounds.
- `lib/authoring/editors/select-n-row-mapper.ts` —
  `SelectNEditorInitial` adds `select_count: number` (default 2).
  `SelectNDbRow` overrides BOTH `content` and `correct` because
  `content.select_count` lives in the JSONB.
- `lib/authoring/editors/select-n-editor.tsx` — `SataOptionList`
  shape but the hint reads "Tick exactly N". A new private
  `SelectNCountField` (number input, name="select_count") sits
  below the option list; clamped client-side to
  `[1, optionsWithText]`, re-validated server-side. Preview adds
  a "Select exactly **N**." line above the option list.

Dispatch reads `select_count` from form data and passes it to
`parseSelectN`. Picker + client + pages updated. CSS adds
`.auth-input--num` (90px width modifier) + `.auth-preview-select-n`.
Browser-tested.

### Slice 6 — MATRIX editor (commit `f0b3f5a`)

First non-list-shape editor. Custom HTML `<table>` grid with
editable corner (row label), editable column headers, editable
row headers, a radio per cell, per-row feedback strip beneath.
Form-data contract is more elaborate:

- `matrix_row_label` — single value
- `matrix_row_id[]` / `matrix_row_text[]` / `matrix_row_feedback[]`
- `matrix_col_id[]` / `matrix_col_text[]`
- `matrix_correct_<rowId>` — radio name with **dynamic per-row
  name**. The save action loops over `matrix_row_id` to know
  which row IDs to read picks for.

Files: parser vendored, `matrix-row-mapper.ts` with
`MatrixEditorInitial` carrying rows/columns/correct + per-row
feedback inlined into rows, `matrix-editor.tsx` with private
`MatrixGrid` + private `MatrixPreview`. Auto-numbered IDs
(r1/r2…, c1/c2…) scan for the lowest unused. Removing a column
that has correct picks cleans them up.

CSS block ~150 lines: wrap, table cells, corner/col/row inputs,
cell radios, feedback row, bounds footer, plus
`.auth-matrix-preview-*` read-only twins. **Horizontal-scroll
fix**: wrap uses `overflow-x: auto` instead of the legacy's
`overflow: hidden`. Sam caught the bug while testing — added
columns past 4 were getting clipped invisibly. Fix scoped to
the new tree per the slice-13-deletes-it rule.

Browser-tested. Slice 6 includes a follow-up CSS tweak that
better-grounded the preview cell radio (18×18 with a halo).

### Slice 7 — BOWTIE editor + dual-mode preview (commit `e7bba70`)

The big one — the most elaborate single editor and the
introduction of the dual-mode preview pattern.

**BOWTIE editor.** Three independent wings (Left / Centre /
Right), each with its own label and own token pool. Tab-based
wing switching (only one wing's panel renders at a time). Tabs
carry status dots (green / amber / red) based on per-wing
validity. Capacity rules:

- Left: pick exactly 2 (checkbox semantics, soft cap auto-unticks
  the oldest when ticking a 3rd).
- Centre: pick exactly 1 (radio semantics).
- Right: pick exactly 2 (same as left).

Token IDs prefixed `lt`/`ct`/`rt` for global uniqueness. The
parser re-validates capacity strictly. A `HiddenSerialisers`
component renders hidden inputs for ALL three wings regardless
of which tab is active so inactive wings' state survives a save.

Wing-label input is a preset-`<select>` + free-text-`<input>`
combo: selecting a preset fills the input; typing a custom value
flips the select to "Custom…".

Form-data contract (per wing):

- `bowtie_<wing>_label` — single value
- `bowtie_<wing>_token_id[]` / `..._text[]` / `..._feedback[]`
- `bowtie_left_correct[]` / `bowtie_right_correct[]` — repeated
  checkbox values, only emitted for ticked tokens
- `bowtie_centre_correct` — single radio value

Save dispatch uses a small `readWing(wing)` helper to assemble
the per-wing `BowtieWingInput` payload and calls `parseBowtie`.

**Dual-mode preview pattern.** New shared atom
`<PreviewToggle>` — two pills (Student / Answer key) at the top-
right of an `auth-preview-card-header`. Arrow-key navigation
supported. Wired only into BOWTIE this slice; the other five
already-built editors get the toggle in slice 11.

BOWTIE's two preview modes:

- **Answer-key (default for BOWTIE)** — chips view, 3 columns,
  filled coloured chips for correct picks, "(not yet picked)"
  placeholders for empty slots.
- **Student** — matches `docs/product-plan/mockups/ngn-primer.html`
  §4. Drawer of all tokens jumbled at the top (neutral chip
  styling, label "Drag tokens from here"), bow-tie diagram below
  with empty dashed-border slot placeholders (2 / 1 / 2). The
  curator sees what the student starts with pre-submit.

A schema clarification surfaced in design discussion: the wing
prefix in token IDs is unique-id hygiene only, NOT runtime wing-
routing. Per-slot scoring is identity-based: slot S is correct
iff the placed token-id is in `correct[S]`. Cross-wing
misplacement is always wrong by construction (left correct
tokens never appear in `correct.right`). This means the future
runner can render the canonical NGN unified-pool drag UI without
any schema change — captured as a permanent note in the slice 7
commit message.

CSS additions ~280 lines: tabs, wing cards (green/amber/red
inline because they're semantic to NCLEX bow-tie), token rows,
label-picker preset+custom combo, answer-key chip grid, and the
new student-view drawer + empty-slot layout. Plus the toggle
infrastructure (`auth-preview-card-header`,
`auth-preview-toggle-pill`).

### Slice plan re-organisation (closing doc commit)

End of day, with the dual-mode preview now an established pattern
on BOWTIE, the slice plan was re-organised:

- Slices 8 (CLOZE), 9 (HIGHLIGHT), 10 (DRAG_DROP) acceptance
  criteria each gained a bullet: "preview ships with the dual-
  mode toggle from day one". They get both views from the start.
- A new **slice 11 — Dual-mode preview migration** was inserted
  between slice 10 and the wrappers. Its scope: back-fill the
  toggle into MCQ, TF, SATA, SELECT_N, MATRIX so every editor
  has the same shape. Pure mechanical change, no editor-logic
  risk.
- Old slices 11 / 12 / 13 (Case Study / Trend / Swap) renumbered
  to 12 / 13 / 14 to preserve the swap-is-last invariant. 14
  slices total now.

Status: 7 of 14 done.

### Sandbox testing flow during the day

The dev server (`npm run dev`) ran on `localhost:3000` for the
whole session. Slice 4 first hit a Supabase-credentials error
because `.env.local` was missing in the worktree (gitignored, so
`git worktree add` doesn't carry it). One-time fix: copied
`.env.local` from the main checkout into the worktree path.
Subsequent slices used the same dev server with auto-recompile.

### What's queued for next session

- **Slice 8 — CLOZE editor.** Sentence-with-blanks (`{N}` markers
  in the stem) with per-blank choice lists. Markers auto-renumber
  on save (`{1} {3}` → `{1} {2}`). Per-choice feedback is nested
  by blank then by choice. Ships with the dual-mode toggle from
  day one.
- After CLOZE: HIGHLIGHT (slice 9), DRAG_DROP (slice 10),
  Dual-mode migration (slice 11), wrappers (slices 12-13), Swap
  (slice 14).

---

## Session — 2026-04-28 (Questions-and-wrappers rebuild — slices 1, 2, 3 + foundations + lib/bank decouple)

Started from scratch after the prior rebuild attempt was reverted at the
top of the day (`fde8db3`). Architecture re-settled in conversation,
plan + slice plan drafted, then slices 1, 2, and 3 shipped end-to-end on
`-v2` URLs alongside the (untouched) legacy `/admin/bank/all` and
`/tutor/bank/all`. The new authoring tree at `lib/authoring/` is now
fully self-contained — zero imports from `lib/bank/`.

Eight commits on `origin/main` over the day:

```
5826978 authoring: vendor classifications, types, parsers from lib/bank/
effe7ff authoring: slice 3 — TF editor
e6a26bc authoring: dirty-form guard for editors (slice 2 polish)
97d11b4 authoring: fix slice 2 SSR crash on -v2 pages
7035a8a authoring: slice 2 — MCQ end-to-end on bank-list-v2 (admin + tutor)
50efb3e authoring: switch editor sections from accordions to tabs (slice 1 polish)
bb4dfa9 authoring: slice 1 — MCQ editor sandbox (read-only)
eabe7f2 docs: questions-and-wrappers rebuild plan + slice plan
```

### Architecture re-settled (commit `eabe7f2`)

After the rejected dispatcher pattern, the new architecture locked in
through conversation. Two docs landed at
`docs/product-plan/questions-and-wrappers-rebuild.md` (strategic) and
`questions-and-wrappers-rebuild-slice-plan.md` (build order). Core
non-negotiables:

- **No dispatcher.** Hosts open editors by name; no shared modal that
  switches on `question_type`.
- **Each editor is a true self-contained component.** Body + default
  modal host. Mountable anywhere; deletable in isolation.
- **Two-pane edit + pre-submit preview in one file** per editor type.
- **Wrappers stay as pages**, not modals — three-pane layout (wrapper
  edit / question edit / combined preview = student view).
- **Shared atoms, not chooser.** A bank of dumb building blocks
  (`<ModalFrame>`, `<EditorTabs>`, `<StemField>`, etc.) composed by
  each editor. No atom decides what type of editor to render.
- **Parallel build under `lib/authoring/` + `-v2` URLs.** Real surfaces
  from slice 2; integrate-as-you-go.
- **Both audiences in lockstep.** Every slice ships admin + tutor.
- **Swap at slice 13.** Delete the legacy folder cleanly; new tree
  takes over the canonical URLs.

Slice plan: 13 slices total. Slices 1–3 done; 4–13 outstanding.

### Slice 1 — MCQ read-only sandbox (commit `bb4dfa9`)

First proof of the file shape. Built 9 shared atoms in
`lib/authoring/atoms/` (modal-frame, editor-actions, section,
stem-field, instruction-field, rationale-fields, classification-fields,
housekeeping-fields, hidden-item-inputs) plus the MCQ editor
(`lib/authoring/editors/mcq-editor.tsx`) — body + private option list +
private pre-submit preview + default modal host. Sandbox page at
`/admin/sandbox/authoring` opens the modal against an existing MCQ row,
read-only (Save / Cancel / Delete buttons render disabled). New
stylesheet `styles/authoring.css` using the `auth-` prefix. Imported
once in `app/(app)/layout.tsx`.

### Slice 1 polish — accordions to tabs (commit `50efb3e`)

Sam noticed the three vertically-stacked accordions (Content /
Classification / Housekeeping) led to a long scroll. Replaced with a
top tab strip + panel switcher. New atom `<EditorTabs>` + `<TabPanel>`
(context-driven) under `lib/authoring/atoms/editor-tabs.tsx`. Hidden
panels stay in the DOM via the HTML `hidden` attribute so form fields
still submit on Save. Red-dot indicator per tab when its required
fields are unfilled. Auto "Next: <label> →" button at the bottom of
each non-final panel. Lifted the Client Needs `category` state out of
`<ClassificationFields>` up to the editor body so the tab strip can
flag classification incompleteness.

### Slice 2 — MCQ end-to-end on bank-list-v2 (commit `7035a8a`)

Foundation slice. Built:

- `lib/authoring/actions/save-question.ts` (surface-aware,
  auto-numbers IDs via `ITEM_ID_PREFIX` / `TUTOR_ITEM_ID_PREFIX`,
  returns `SaveResult` instead of redirecting because the new path is
  modal-based, not focus-mode).
- `lib/authoring/actions/delete-question.ts` (surface-aware hard
  delete).
- `lib/authoring/hooks/use-save-action.ts` — generic
  `useTransition` + error wrapper used by every editor.
- `lib/authoring/atoms/question-type-picker.tsx` — small modal listing
  all 9 types; only MCQ enabled in slice 2.
- `lib/authoring/bank-list-v2-client.tsx` — shared client component
  that owns the modal stack (closed / picker / editor-create /
  editor-edit).
- `app/(app)/admin/bank/all-v2/page.tsx` and tutor twin — server
  components, fetch standalone rows (`parent_case_id IS NULL AND
  trend_id IS NULL`), build initials maps, hand off to the client.
- "All questions (v2)" entries appended under the Bank dropdown in
  both `lib/nav/admin.ts` and `lib/nav/tutor.ts`.
- Bank-list, type-picker, and typed-DELETE styles added to
  `styles/authoring.css`.

MCQ editor refactored: body now receives `error` / `pending` /
`onSubmit` from its host; host owns the action wiring + the typed-DELETE
confirmation flow (must type `DELETE` to enable the destructive button).
`emptyMcqInitial(surface)` helper added.

### Slice 2 SSR crash fix (commit `97d11b4`)

After deploy, both v2 pages errored with "An error occurred in the
Server Components render" while the slice 1 sandbox still loaded fine.

**Diagnosis path:** schema parity + Supabase API logs both showed the
data fetches returned 200, so the failure was strictly post-fetch in
the render phase.

**Root cause:** the v2 pages imported `emptyMcqInitial` (a function)
from `mcq-editor.tsx`, which carries `'use client'`. Next.js's RSC
machinery treats every export of a `'use client'` module as a client
reference. Calling a non-component function from a Server Component
during RSC render wraps it as a client reference at build time and
throws at runtime in production. The slice 1 sandbox didn't trip it
because it only imported the `McqEditorInitial` *type* (erased at
compile time).

**Fix:** moved the canonical `McqEditorInitial` interface and the
`emptyMcqInitial` constructor into the existing
`lib/authoring/editors/mcq-row-mapper.ts` (a neutral, non-`'use client'`
module). The editor file re-exports the type for backwards
compatibility so existing client callers (the bank-list-v2 client, the
sandbox client) didn't need import changes. The v2 pages now import the
function from the mapper directly.

**Lesson for future slices:** non-component exports from `'use client'`
modules are client references — keep types and helpers in neutral
modules whenever a server component might call them. Each editor
slice 4–10 follows this same split (`<type>-editor.tsx` for the
component, `<type>-row-mapper.ts` for the type + helpers).

### Slice 2 polish — dirty-form guard (commit `e6a26bc`)

Curators editing a question could lose work to an accidental backdrop
click, Escape, X, or Cancel after typing. Added a save-or-discard
guard shared across every editor.

- `lib/authoring/hooks/use-dirty-guard.ts` — tracks dirty state,
  intercepts close attempts via a `requestClose` handler, drives the
  confirm panel.
- `lib/authoring/atoms/discard-confirm.tsx` — inline panel rendered at
  the top of the modal body when the curator tries to close with
  unsaved edits. Three buttons: **Keep editing / Discard changes /
  Save and close**. "Save and close" programmatically submits the form
  via `requestSubmit()`; the existing `useSaveAction` `onSuccess`
  closes the modal.
- MCQ editor wired: form gets `onInput={guard.markDirty}`; modal's
  `onClose` and Cancel button go through `guard.requestClose`; save
  + delete `onSuccess` call `guard.clearDirty()` before `onClose`.

Per-editor wiring is two lines per editor — slice plan principle 7
locks this in for slices 4–10.

### Slice 3 — TF editor (commit `effe7ff`)

True/False as the second editor type — same file shape as MCQ, locked
True/False options with read-only text and no add/remove buttons.

- `lib/authoring/editors/tf-row-mapper.ts` — `TfEditorInitial` type
  (structurally identical to MCQ's, kept separate for future
  divergence), `TF_FIXED_OPTIONS` constant, `emptyTfInitial`,
  `tfRowToInitial`. Re-uses `McqDbRow` + `MCQ_ROW_COLUMNS` since both
  question types share the same DB columns.
- `lib/authoring/editors/tf-editor.tsx` — body + private locked
  option list + private preview + default modal host. Form-data
  contract identical to MCQ (`option_id` / `option_text` /
  `option_feedback` / `correct_id`) so the legacy parser
  (`parseTf`) accepts the payload unchanged.
- `lib/authoring/actions/save-question.ts` branched on type:
  promoted `SUPPORTED_TYPES` to a `Set<QuestionType>`, widened
  `ParsedQuestion.question_type` to the full `QuestionType` union, and
  the parser switch now picks `parseMcq` vs `parseTf` per the form's
  `question_type`.
- `<QuestionTypePicker>` flipped TF from disabled → enabled.
- `BankListV2Client` modal stack gained TF branches (create + edit).
  `EDITABLE_TYPES` set replaces the hard-coded MCQ check; modal-state's
  `editor-edit` shape now carries `question_type` so the right editor
  mounts without a row-table lookup.
- Both v2 pages build `tfInitialsById` alongside `mcqInitialsById` and
  pass both to the client.

### Vendoring — decouple new tree from `lib/bank/` (commit `5826978`)

Audit during the session caught that `lib/authoring/` was silently
importing classifications, JSONB shape types, and parsers from
`lib/bank/`. That coupled the new tree to the legacy tree — at swap
time (slice 13) the legacy folder couldn't be deleted cleanly without
breaking the new tree.

Vendored 4 files into `lib/authoring/`:

- `lib/authoring/classifications.ts` — whole-file copy of
  `lib/bank/classifications.ts`.
- `lib/authoring/types.ts` — whole-file copy of `lib/bank/types.ts`.
- `lib/authoring/parsers/mcq.ts` — whole-file copy.
- `lib/authoring/parsers/tf.ts` — whole-file copy.

Each copy gained a header note documenting the vendoring rationale.
Internal relative imports (`../classifications`, `../types`) inside
the parsers resolve to the new local copies without code changes.

Re-pointed every `from '@/lib/bank/...'` import inside `lib/authoring/`
and the v2 pages to the matching `@/lib/authoring/...` copy. Verified
by grep — **zero `@/lib/bank/` imports remain anywhere in the new
tree.**

Strategic plan §7 gained a "Vendoring" sub-section; §9 swap inventory
expanded to list the legacy `lib/bank/` data-layer files
(`classifications.ts`, `types.ts`, `parsers/`, `list-view.tsx`,
`filters.tsx`, etc.) for explicit deletion at swap.

**Pattern for slices 4–10:** each editor slice vendors its own parser
(`parsers/sata.ts`, `parsers/select-n.ts`, etc.) as part of the slice.
Keeps the work scoped where it belongs.

**Drift rule while both copies exist (slices 3–12):** schema, taxonomy,
and parsers are stable per strategic plan §7. If anything genuinely
needs to change in either copy, update both in the same commit. At
slice 13 the legacy folder is deleted entirely; drift window closes.

### Tabs / atoms inventory at session end

`lib/authoring/atoms/` (12):
modal-frame · editor-actions · editor-tabs (+ TabPanel) · section ·
stem-field · instruction-field · rationale-fields · classification-fields ·
housekeeping-fields · hidden-item-inputs · question-type-picker ·
discard-confirm.

`lib/authoring/hooks/` (2):
use-save-action · use-dirty-guard.

`lib/authoring/actions/` (2):
save-question · delete-question.

`lib/authoring/editors/` (4):
mcq-editor · mcq-row-mapper · tf-editor · tf-row-mapper.

Vendored (`lib/authoring/`): classifications · types ·
parsers/mcq · parsers/tf.

`lib/authoring/bank-list-v2-client.tsx` — modal stack + table.

Surfaces:
- `/admin/sandbox/authoring` (slice 1, still useful as quick-test)
- `/admin/bank/all-v2` + `/tutor/bank/all-v2` (slices 2 + 3)

### What's not changing — re-confirmed

- DB schema, RLS policies, scoring functions, `parent_case_id` /
  `trend_id` linking, classification taxonomy, the 9 question types,
  the JSONB content/correct shapes — none of it changes per strategic
  plan §7.
- The legacy `/admin/bank/all`, `/tutor/bank/all`, `/admin/bank/cases`,
  `/admin/bank/trends` (and tutor twins) continue serving the old code
  unchanged — Sam can still curate via the legacy surfaces.
- `lib/bank/` is untouched apart from being read at start (for the
  parser shape we vendored).

### Resolved during the session

- **CF dev auto-deploy.** The morning's flag
  (`memory/project_cf_dev_deploy_broken.md`) noted that pushes to
  `origin/main` had stopped triggering Workers Build. During the
  session, every push (8 of them) triggered a build that deployed in
  minutes; Sam confirmed visually. Flag cleared.

### Outstanding / Next session

**Build order:** slices 4 → 13. Each slice 4–10 follows the same
template (one editor + its row-mapper + a parser vendor + a one-line
add to the picker's `ENABLED_TYPES` and the bank list's
`EDITABLE_TYPES` + an initials map in both pages):

- **Slice 4** — SATA editor (multi-select). Vendor `parsers/sata.ts`.
- **Slice 5** — SELECT_N (variant of SATA with a count field). Vendor
  `parsers/select-n.ts`.
- **Slice 6** — MATRIX (rows × columns grid). Vendor `parsers/matrix.ts`.
- **Slice 7** — BOWTIE (three-wing). Vendor `parsers/bowtie.ts`.
- **Slice 8** — CLOZE (sentence with `{N}` blanks). Vendor `parsers/cloze.ts`.
- **Slice 9** — HIGHLIGHT (passage with `[[chunks]]`). Vendor `parsers/highlight.ts`.
- **Slice 10** — DRAG_DROP (two subtypes). Vendor `parsers/drag-drop.ts`.

Then:
- **Slice 11** — Case Study wrapper-v2 (three-pane page; reuses every
  editor body).
- **Slice 12** — Trend wrapper-v2 (three-pane page).
- **Slice 13** — Swap (delete legacy code, drop `-v2` suffix from URLs
  and nav entries).

Slice plan status tracker is in
`docs/product-plan/questions-and-wrappers-rebuild-slice-plan.md` §13.
Slices 1, 2, 3 ticked.

---

## Session — 2026-04-26 / 2026-04-27 (Database split: MyNclex onto its own Supabase project — Sam + Claude Desktop)

MyNclex's Supabase backend split off from the shared `qacademy-gamma`
project (`zrakjibtxyzoqcdtvpmq`) into a dedicated dev project
`qacademy-mynclex-dev` (`xkqxfzfsllxyxpdtcrja`). End-to-end verified:
the dev Worker at `https://qacademy-dev-mynclex.mybackpacc.workers.dev`
now hits the new project on every request; gamma sees no MyNclex
auth or data traffic.

### What was done

- **Repo prep — back-port + bootstrap-bug fix.** Lifted all 7 transactional
  RPCs (Slice 1.11b case-save, 1.12b trend-save admin+tutor, 1.12c trend-
  delete ×4) out of the migration files into a new `db/rpcs.sql`, so
  fresh projects bootstrap from `{schema, rls, rpcs}` without replaying
  history. Added `rpcs.sql` to `db/README.md` and updated the back-port
  rule to name all three SoT files. Commit `e91368c`.

  Found and fixed a forward-FK bug in `db/schema.sql`: `parent_case_id`
  was placed inside the `CREATE TABLE` for `nclex_bank_items` and
  `nclex_tutor_questions`, but referenced case-studies tables that come
  later in the same file. Postgres rejects that on a fresh DB. Mirrored
  the existing `trend_id` pattern — defer the column to an `ALTER TABLE
  ADD COLUMN` block at the bottom. Same column, same FK, same partial
  index, just sequenced correctly. No effect on gamma (which was built
  via incremental migrations, not from `schema.sql`). Commit `1593215`.

- **Bootstrap.** Applied `schema.sql` (14 tables) → `rls.sql` (3 helper
  functions + 29 policies) → `rpcs.sql` (7 RPCs + 6 grants) to the empty
  new project. Counts verified equal to gamma: 14 tables, 10 functions,
  29 policies, 13 RLS-enabled tables (`nclex_readiness_packs` stays off
  by design — not yet authored).

- **Schema parity check.** Column-by-column compare of all 14 `nclex_*`
  tables: 177 columns total on both sides, identical names, types, and
  ordinals. No drift between gamma's live schema and the repo files.

- **Auth copy.** 6 dev users + their email-provider identities ported
  via direct SQL (`auth.users` and `auth.identities`) using
  `jsonb_populate_record` against an embedded JSONB extract from
  gamma. `confirmed_at` / `email` are GENERATED columns on the auth
  tables so they were excluded from the insert column list. bcrypt
  password hashes ported as-is — the same passwords work on the new
  project (verified: superadmin login lands successfully). All 6 users
  are email/password only, no MFA, no OAuth.

- **Data copy — 76 nclex rows total.** Round-tripped through MCP using a
  base64-encoded `INSERT ... SELECT (jsonb_populate_record(...)).*`
  pattern for the larger tables, since raw JSONB strings ran into
  escape-level issues with the response wrapper. Tables with rows:
  - `nclex_users` (6), `nclex_user_roles` (15), `nclex_admin_permissions` (3)
  - `nclex_case_studies` (2), `nclex_case_study_items` (3),
    `nclex_case_study_tabs` (4), `nclex_trend_datasets` (1)
  - `nclex_bank_items` (29), `nclex_tutor_questions` (13)

  The two remaining tables (`nclex_case_study_items` final pass,
  `nclex_tutor_questions`) were imported by Sam via Studio's CSV
  download/upload after I paused the Claude-driven copy. FK integrity
  verified: zero orphans across all reference relations.

- **`.env.local` updated** — new URL + new anon key (I wrote both),
  Sam pasted the service role key. `.env.local` stays gitignored
  (rule on line 34 of `.gitignore`).

- **`wrangler.jsonc` updated.** Both public Supabase values (URL +
  anon key) are committed to this file because they bake into the
  client-side bundle at Workers Build time. Without updating this,
  the next auto-deploy would have rebuilt the Worker with gamma's
  URL still embedded for browser-side calls. Commit `c5347e6`.

- **Cloudflare Worker secrets rotated** — Sam updated all three
  (URL, anon key, service role key) in the dashboard for
  `qacademy-dev-mynclex` and triggered a redeploy off `c5347e6`.

- **Auth → URL Configuration set on the new project** — Site URL
  `https://qacademy-dev-mynclex.mybackpacc.workers.dev` and
  redirect-URL allowlist (localhost + dev Worker wildcards). New
  project has its own values, not gamma's, since the Worker URL
  differs.

- **End-to-end smoke test passed.** Sam logged in as superadmin via
  the dev Worker URL. New project's `auth.users.last_sign_in_at`
  ticked from `2026-04-26 16:24:32` → `2026-04-26 23:24:11`; gamma's
  value for the same email stayed frozen at the baseline. Cutover
  is real and complete.

### What did NOT change

- Gamma's `nclex_*` tables remain in place (Sam's call: keep them
  as a confidence-period fallback). Auth users for MyNclex still
  exist in both projects; the duplication is fine since they're
  functionally separate JWT environments now.
- Production cutover. MyNclex isn't launched yet ("Launching 2026"
  per the landing page) so there's no prod environment to split.
- Gamma's `qacademy-gamma` Supabase project still serves
  MyNMCLicensure and MyTeacher.

### Compliance gaps preserved (deliberately, for parity with gamma)

- None of the 7 RPCs in `rpcs.sql` carry an explicit `SECURITY` clause
  — they rely on Postgres's default (= `SECURITY INVOKER`). Future
  RPCs SHOULD spell this out per the `feedback_mynclex_security_explicit`
  memory.
- `nclex_save_case_with_children` lacks an explicit
  `GRANT EXECUTE … TO authenticated` (relies on Postgres default of
  granting to PUBLIC). The other six RPCs grant explicitly.
- Both can be fixed in a small follow-up commit later.

### Outstanding

- Drop `nclex_*` tables from gamma after a confidence period.
- Eventually retire MyNclex's dev users from gamma's `auth.users`
  (after the gamma `nclex_*` drop above).
- Launch-time: split MyNclex prod onto its own Supabase project
  (mirror this dev split). Not blocking until launch.

### Next session

- Continue MyNclex feature work on Slice 2.x. All slices going forward
  target only `xkqxfzfsllxyxpdtcrja`; nothing about MyNclex should
  touch gamma's database again.

---

## Session — 2026-04-26 (Repo decoupled from qacademy-gamma — Claude Web + Desktop)

MyNclex extracted from the qacademy-gamma monorepo into its own
standalone GitHub repo at `mybackpacc-byte/qacademy-mynclex`.

### What was done

- **History preserved.** Used `git subtree split --prefix=mynclex`
  on a temp clone of gamma to extract only the commits touching
  `mynclex/`, with paths flattened to root. 76 commits preserved,
  full message history intact (note: SHAs were rewritten — same
  commit content, different fingerprints, expected behaviour of
  subtree split).
- New local repo at `C:\Users\confi\qacademy-mynclex`.
- New GitHub repo at `mybackpacc-byte/qacademy-mynclex`.
- **Verified standalone build** — `npm install` (672 packages),
  `npm run build` (53 routes, webpack), `tsc --noEmit` clean,
  `eslint app components lib` clean, `npm run dev` serves the
  landing page on `localhost:3000`.
- Cloudflare Worker `qacademy-dev-mynclex` repointed via
  dashboard from gamma's `mynclex/` subdirectory to the new repo's
  root. Same Worker name, same URL, build settings preserved.
- **Gamma left untouched.** `mynclex/` still exists in gamma but
  is no longer the source of truth — to be deleted in a future
  cleanup phase only after the new repo is confirmed stable in
  production deploys.

### Outstanding

- Delete `mynclex/` from gamma (after confidence period).
- Update gamma's `CLONING.md`, root `README.md`, root `.gitignore`
  to remove MyNclex references.
- Supabase project still shared with gamma — separation is a
  future session decision.

### Next session

- Confirm Cloudflare auto-deploy from this repo works end-to-end
  (this commit is the test).

---

## Session — 2026-04-26 (Slice 2.10 — CSS leak fix: faded text on workspace pages — Sam-reported, Desktop-diagnosed)

User-reported visual bug: text on workspace pages — "Welcome back"
on /login, "Dashboard" placeholder content on
/student/bank/dashboard, others — appeared faded/ghosted on first
load and especially after browser-back. Reload "fixed" it.

Two fixes shipped this slice. The first was a real cleanup but
turned out NOT to address the visible bug. The second was the
actual cause.

### Fix #1 (commit c88cf10) — globals.css cleanup

`app/globals.css` defined a competing `body { color; background; }`
rule that referenced `--foreground`, with a `@media
(prefers-color-scheme: dark)` branch flipping `--foreground` to
`#ededed`. `styles/tokens.css` had its OWN body rule using
`--text` (always near-black). Two body rules, same specificity,
last-loaded wins. The dark-mode branch + cascade order made the
outcome unstable on soft navigation.

Cleaned the file from 27 lines down to 4 lines of code:

```css
@import "tailwindcss";
html { color-scheme: light; }
```

Removed: `:root` --background/--foreground vars, `@theme inline`
block (mapped unused Geist fonts), the prefers-color-scheme:dark
branch, the competing body rule. Added explicit `color-scheme:
light` to opt out of OS-driven theming for form controls /
scrollbars.

Was the bug. **Did not actually fix Sam's visible problem.**
A real cleanup, but solving a different (theoretical) issue.

### Fix #2 (commit 35e5201) — landing.css scoping (the actual cause)

`styles/landing.css` defined GLOBAL element selectors for the
public landing-page hero design:
  - `body { color; background: var(--navy-dark); display: flex }`
  - `main { opacity: 0; animation: rise 0.9s ease-out 0.1s
    forwards }`
  - `h1 { background: linear-gradient(white→pale);
    -webkit-text-fill-color: transparent }`
  - `footer { background: rgba(9,21,36,0.5) }`
  - `:root { --text: #e8eef5; --text-muted: rgba(232,238,245,
    0.62); ... }`

Next.js App Router keeps page-level CSS imports in the document
head across soft navigations. Once a user visits `/`,
landing.css stays loaded for the rest of the session. So:

1. User lands on `/` (homepage with landing.css).
2. Clicks "Sign in" → Link soft-nav to `/login` → landing.css
   still active.
3. /login's `<h1 className="auth-title">Welcome back</h1>` gets
   matched by landing's `h1` rule. White-on-white gradient text
   = invisible against the white form card.
4. Workspace `<main className="product-content">` gets matched
   by landing's `main` rule. opacity 0 → 1 fade-in animation
   plays on every navigation.
5. Reload directly to /login or /student/* skips landing.css
   entirely → no leak → "fixed."

Fix: scope every selector in landing.css under a `.landing`
wrapper. Bare element selectors (body/main/h1/footer/* reset)
become `.landing { ... }`, `.landing main { ... }`, `.landing
h1 { ... }`, etc. `:root` token overrides become `.landing
{ --text: ...; --text-muted: ...; }` — variables only cascade
to landing-page descendants. Class selectors got the prefix
too for belt-and-braces.

`app/page.tsx` and `app/programmes/page.tsx` now wrap content
in `<div className="landing">…</div>` instead of a fragment.

### Verification

- `tsc + eslint + npm run build` clean both fixes
- Landing page (`/`) still renders correctly: navy-dark bg,
  gradient h1, fade-in animation
- `/login` h1 "Welcome back" now renders with `color: rgb(30,
  58, 95)` (#1e3a5f, --primary) and NON-transparent text fill
  (was `transparent` before fix #2). Font size 22px (was being
  forced to clamp(56px, 12vw, 112px) by landing's h1 rule)
- Body bg on `/login`: `rgb(249, 250, 251)` = `--bg` from
  tokens.css (was being hijacked by landing's `--navy-dark`)
- User confirmed visually: "looks like its fixed"

### Diagnostic notes (worth remembering)

- **First diagnosis was wrong.** Cascade-fight theory in
  globals.css fit the symptom on paper but didn't survive the
  user's first test. Pushed a fix that didn't help. Lesson:
  when a CSS bug "disappears on reload but appears on
  navigation", the most likely cause is a stylesheet that
  loads on one page persisting into another, not a cascade
  ordering issue between files that always coexist.
- **The screenshot was the proof.** "Welcome back" was lighter
  than the muted subtitle right next to it. That's
  inconsistent with both rules being from token-defined dark
  colors — a token-color theory can't make a heading lighter
  than a muted subtitle. That mismatch should have been a
  flag earlier.
- **Pattern on which elements faded was the smoking gun:**
  - `<h1>` faded, `<div>` headings not faded → bare-element
    selector hijacking <h1>
  - `<main>` content faded, content NOT inside `<main>` not
    faded → bare-element selector hijacking <main>
  - Topbar / sidebar chrome (chrome-class elements) NOT
    affected → confirmed it wasn't a body color cascade

### Convention to remember

**Page-level CSS imports with bare element selectors are
dangerous.** Next.js App Router doesn't unmount page CSS on
soft nav. Any global selector (`body`, `main`, `h1`, `footer`,
`a`, `*`) in a page-imported stylesheet will leak into every
other page in the session.

Going forward: any new CSS file imported by a page (not a
layout, and not via the workspace token chain) MUST scope its
rules under a wrapper class. Either:
  - Wrap content in `<div className="page-x">` and prefix
    every rule with `.page-x` (this slice's approach)
  - Or rewrite to use only class selectors with audience-
    specific prefixes

Adding this to CLAUDE.md as a future folder-conventions rule
is worth considering when the next page-level stylesheet
lands.

### What's still imperfect

- The `.landing` wrapper now hosts both the CSS variable
  overrides AND the body-equivalent layout (flex, min-height,
  bg). Slightly more responsibility on one class than ideal.
  Acceptable; no action needed.
- The fix relied on belt-and-braces scoping (every class
  selector got `.landing` prefix even when its name was
  unique). Defensible but increases specificity by one level
  across the file. No call sites broken.
- Unrelated: globals.css cleanup (fix #1) is good on its own
  merits but its commit message frames it as a fix for the
  user-reported bug, which it wasn't. History is honest in
  this entry.

### What's unblocked

CSS leakage between landing and workspace is closed off. Next
slice can be feature work without worrying about more
landing-page styles bleeding across.

---

## Session — 2026-04-26 (Slice 2.9b — Rename lib/auth to lib/access — Claude Web + Desktop)

Pure rename slice. No logic changes, no behaviour changes, no new
files, no deleted files. The folder slice 2.9 just landed was
named `lib/auth/`, but "auth" conventionally refers to authentication
(login, sessions, password resets) — what we built is authorisation
(gates, permissions, role checks, future ownership/subscription/
enrolment checks). `lib/access/` is plain English and scales to
every check the product will ever need.

### Why now

12 files plus ~21 import sites today; significantly more after the
next 3-4 feature slices land. Renaming while the convention is
fresh and the surface is small was the cheapest moment.

### Decisions captured

- **Pure rename, no logic changes.** Helper signatures, redirect
  targets, type names (`AuthGateResult`, `BankSurface`, etc.) all
  unchanged. Only the folder name was awkward; only the folder name
  was renamed.
- **Type names with "Auth" stay.** `AuthGateResult` is exported
  through the barrel; call sites see the type, not its history.
  Renaming to `AccessGateResult` would be ~15 sites of churn for a
  marginal naming win. Skipped.
- **SESSIONS.md slice 2.9 entry edited in place.** Modifying a
  historical record is a small breach of "history is history," but
  leaving stale `lib/auth` references would confuse future readers
  trying to learn the convention. Kept the audit trail with a note
  at the top of slice 2.9's entry explaining the rename happened.

### Files moved (git mv, history preserved)

`mynclex/lib/auth/` → `mynclex/lib/access/` (11 files: README,
index, types, internal, constants, plus the 4 audience subfolders
admin/, tutor/, student/, shared/).

### Files modified

- 21 source files: every `@/lib/auth` import flipped to `@/lib/access`
  (admin pages × 17, admin/layout.tsx, 3 action files, plus 2
  comment/docstring mentions inside lib/access/ itself).
- File-header comments inside lib/access/* updated to reflect the
  new path (8 files: admin/*, tutor/*, shared/*, internal.ts,
  constants.ts, types.ts, index.ts, plus the require-permission.ts
  JSDoc example).
- Inline `// (lib/auth foundation)` history references in 3 action
  files updated to `// (lib/access foundation)`.
- `mynclex/lib/access/README.md` — heading, folder tree, prose
  references updated.
- `mynclex/CLAUDE.md` — folder enumeration, two folder-conventions
  rules updated to `lib/access/` and `@/lib/access`.
- `mynclex/SESSIONS.md` — slice 2.9 entry updated for naming
  consistency, with a follow-up note prefix explaining the rename.

### Verification

- `git grep '@/lib/auth'` returns zero
- `git grep 'lib/auth'` (without `@` prefix) returns zero in source
  and tracked docs (node_modules and prior git log messages
  legitimately retain the old name)
- `npx tsc --noEmit` clean
- `npx eslint app components lib` clean
- `npm run build` clean — route count unchanged

### Out of scope

- Any logic, redirect-target, helper-signature, or type changes.
- Renaming `AuthGateResult`, `BankSurface`, or other type aliases
  (per the decision above).
- Mobile drawer, audit logging, or any other feature work.

### What's unblocked

Future feature slices (runner, payments, enrolment) add their gate
helpers to `lib/access/<audience>/` from day one with the correct
folder name. No follow-on rename slice ever needed.

---

## Session — 2026-04-26 (Slice 2.9 — lib/access foundation + initial migration — Claude Web + Desktop)

> *Note (2026-04-26): folder originally landed as `lib/access/` and
> was renamed to `lib/access/` in a follow-up slice (2.9b) the
> same day. References in this entry have been updated to reflect
> the final name. Authorisation gates fit "access" better than
> "auth" — the latter conventionally means authentication.*

Pure refactor + foundation slice. No behaviour change, no UI change,
no schema change. Three goals:

1. Establish `lib/access/` as the central module for every access
   decision in the product, with audience-grouped subfolders so
   future feature slices have a clear home for new helpers.
2. Migrate the inline 13-line role+permission boilerplate from 19
   admin pages plus the admin layout into one-line helper calls.
3. Consolidate three near-duplicate inline action helpers
   (`requireSurfaceAuth`, `requireCaseCurator`, `requireTrendCurator`)
   into a single shared `requireBankCurator(surface)`.

### Architecture

`lib/access/` follows the audience-grouped convention already used by
`app/(app)/` (routes) and `components/nav/` (sidebars):

```
lib/access/
├── README.md            ← convention doc
├── index.ts             ← public barrel
├── types.ts             ← AuthGateResult + ServerSupabaseClient
├── internal.ts          ← loadAuthContext, loadRolesOnly (NOT exported)
├── constants.ts         ← PERM_* constants + AdminPermission union
├── admin/
│   ├── require-permission.ts    ← bucket gate, SUPER_ADMIN bypass
│   ├── require-super-admin.ts   ← role-only check
│   └── require-any-admin.ts     ← any admin role
├── tutor/
│   └── require-tutor.ts         ← TUTOR role (SUPER_ADMIN bypasses)
├── student/                     ← empty today (.gitkeep placeholder)
└── shared/
    └── require-bank-curator.ts  ← admin/tutor surface-aware
```

Two internal loaders power every public helper. `loadAuthContext()`
fetches roles + permissions in parallel; `loadRolesOnly()` fetches
roles only (saves one DB round-trip when permissions aren't needed).
Both bounce anonymous callers to `/login`. Helpers that return
`AuthGateResult` always include `permissions: []` even when the lean
loader is used — keeps the return shape uniform across the public API.

The TS helpers mirror SQL `nclex_user_has_permission()` in
`db/rls.sql` — same SUPER_ADMIN short-circuit. The two layers are
deliberately mirrored: TS for UX (clean redirects), SQL for security
(RLS prevents row leaks regardless).

### Decisions captured

- **`AdminPermission` is strict, no `| string` escape hatch.** Bare
  string literals don't compile — typos surface at TS-check time.
  Adding a new bucket = edit `lib/access/constants.ts`, the one place
  that has to stay in sync.
- **`requireSuperAdmin` uses the lean loader.** Saves one DB query
  per Permissions-page render. Same shape as `requireAnyAdmin` so
  the role-only helpers are consistent.
- **`requireBankCurator(tutor)` branches on surface** — uses
  `loadRolesOnly` for tutor (no permissions needed), `loadAuthContext`
  for admin. Matches what the original `requireSurfaceAuth` did
  per surface.
- **Dashboard page gains `requireAnyAdmin()`** — belt-and-braces
  with the parent layout's gate. Adds one DB round-trip per dashboard
  render but keeps the consistent "every page self-gates" pattern.
  Flagging here because this IS a behaviour addition (the gate
  didn't exist before this slice).
- **Two redirect targets converged to `/admin/dashboard`.**
  `requireCaseCurator` and `requireTrendCurator` previously
  redirected admin failures to `/admin` (2-hop via the
  `/admin → /admin/dashboard` redirect). After consolidation, all
  three flow through `requireBankCurator`, which redirects to
  `/admin/dashboard` directly. Same final destination, fewer hops.

### Pre-flight findings (handoff verification)

- Student layouts (`picker/page.tsx`, `bank/layout.tsx`,
  `programme/layout.tsx`) — use `loadChromeData()` + 1-line role
  check. Not the 13-line pattern. Skip confirmed correct.
- Tutor layout — has its own ~10-line inline gate (different shape).
  `requireTutor()` was created and is exported but NOT yet wired
  into `tutor/layout.tsx`. Migrating tutor layout would add a
  SUPER_ADMIN bypass (current layout bounces SUPER_ADMINs without
  TUTOR role). Deferred to a slice where the policy is explicit.
- `app/router/page.tsx` — multi-role dispatcher, doesn't fit the
  helper shapes. Skip correct.
- Other inline `nclex_user_roles` + `nclex_admin_permissions`
  parallel fetch — only `requireTrendCurator` in
  `lib/bank/trend/actions.ts`. Caught and consolidated this slice
  (handoff originally listed only two helpers; the third was
  surfaced by the pre-flight grep).

### Files created (Phase 1)

- `lib/access/README.md` — convention doc covering folder structure,
  naming, public API discipline, defence-in-depth principle, and
  where future helpers go.
- `lib/access/types.ts` — `AuthGateResult`, `ServerSupabaseClient`.
- `lib/access/internal.ts` — `loadAuthContext`, `loadRolesOnly`.
- `lib/access/constants.ts` — 7 `PERM_*` constants + `AdminPermission` union.
- `lib/access/admin/{require-permission,require-super-admin,require-any-admin}.ts`
- `lib/access/tutor/require-tutor.ts`
- `lib/access/shared/require-bank-curator.ts`
- `lib/access/index.ts` — public barrel.
- `lib/access/student/.gitkeep` — placeholder for future student helpers.

### Files migrated (Phase 2 + Bonus A)

20 page-level migrations across 4 batches plus the admin layout:

- Batch 1 (5 bank pages): `bank/all`, `bank/cases`, `bank/cases/[case_id]`,
  `bank/trends`, `bank/trends/new`
- Batch 2 (3 pages): `bank/trends/[trend_id]`, `payments`, `dashboard`
- Batch 3 (5 people pages): `users`, `tutors`, `applications`,
  `programmes`, `enrolments`
- Batch 4 (7 pages): `products`, `reports`, `enquiries`, `announcements`,
  `packs`, `config`, `permissions`
- Bonus A: `app/(app)/admin/layout.tsx` — pure refactor (zero
  behaviour change, just collapses the 12-line inline gate to
  `await requireAnyAdmin()`).

Each migration removed 12–14 lines of inline boilerplate and replaced
them with one helper call. Imports cleaned up in tandem.

### Files migrated (Phase 3)

Three near-duplicate action-file helpers all deleted; callers updated
to call `requireBankCurator(surface)` directly:

- `app/(app)/admin/bank/actions.ts` — removed `requireSurfaceAuth`
  (3 callers updated). Local `Surface` type kept; `createClient`
  type-reference replaced with `ServerSupabaseClient` from
  `@/lib/access`.
- `lib/bank/case-study/actions.ts` — removed `requireCaseCurator`
  (6 callers). Same pattern as above.
- `lib/bank/trend/actions.ts` — removed `requireTrendCurator`
  (5 callers). Same pattern.

### Verification

- `npx tsc --noEmit` — clean
- `npx eslint app components lib` — clean
- `npm run build` — clean. Route count unchanged (refactor only).
- Dev preview boots without errors. Authed walks (SUPER_ADMIN +
  partial-ADMIN) need Sam's session — see manual verification list
  in the slice handoff.

### Approximate footprint

- ~21 inline gates removed × ~13 lines each = ~270 lines of
  boilerplate replaced by single helper calls.
- ~150 lines of inline action-helper definitions consolidated into
  one ~30-line shared `requireBankCurator`.
- 12 new files in `lib/access/`, 1 new convention doc (`README.md`).

### What's deliberately left for future slices

- `tutor/layout.tsx` migration — adds a SUPER_ADMIN bypass; defer
  until that policy decision is explicit.
- Resource-ownership gates (`requireTutorOwnsProgramme`, etc.) —
  land with their features as new helpers in `lib/access/tutor/`.
- Student gates (`requireActiveBankSubscription`, etc.) — land with
  the subscription/enrolment tables in `lib/access/student/`.
- Audit logging (`recordPermissionDenial`) — future, not on the
  immediate roadmap.

### What's unblocked

- Future feature slices use `@/lib/access` from day one — no new
  inline boilerplate accumulating.
- The `lib/access/student/` folder is the natural home for the
  subscription / enrolment / pack-ownership gates that land with
  the runner and payments features.

---

## Session — 2026-04-26 (Slice 2.8 — Admin nav scaffold — Claude Web + Desktop)

Final nav scaffold slice. Admin sidebar with 15 permission-gated
items, collapsible "Bank ▾" sub-nav, "Visible items" footer counter,
list pages only (detail subtrees follow list-vs-detail-as-siblings
when their feature work lands).

### Architecture

`(app)/admin/layout.tsx` reverted from slice 2.6's AppShell wrap to
a slim ADMIN/SUPER_ADMIN role gate (mirrors slice 2.7 tutor revert).
Each admin sub-folder owns its chrome via `<AdminShell>` — a Server
Component that calls `loadChromeData()`, fetches the user's
`nclex_admin_permissions` rows, filters `ADMIN_NAV` via
`filterAdminNav()`, and renders `<AppShell productLabel="· Admin">`
with the filtered sidebar.

The sidebar component is its own file (`components/nav/admin/sidebar.tsx`)
mirroring the tutor global sidebar pattern (FlatRow + ParentRow split
to keep React-hook order stable). Adds `.sidebar-content` wrapper +
`.sidebar-footer` for the "Visible items: N of 15" counter; tutor and
student sidebars unchanged because they don't render the wrapper.

### Route moves

- `admin/bank/page.tsx` → `admin/bank/all/page.tsx` (bank list); new
  `admin/bank/page.tsx` redirects to `/admin/bank/all`
- `admin/trends/{page, new/page, [trend_id]/page}.tsx` →
  `admin/bank/trends/{...}` (mirrors slice 2.7 tutor move)
- `admin/page.tsx` was a ~150-line section-menu page; replaced with a
  4-line redirect to `/admin/dashboard`. The old SECTIONS array,
  viewingAs derivation, and section-card filter all die — the sidebar
  IS the section menu now

Reference updates: `BASE_URL`s, focus-mode redirect for trend
children, "Trend datasets →" header card href, "Back to bank" links,
`lib/bank/list-view.tsx` admin URL builder, `lib/bank/trend/editor.tsx`
admin baseUrl, `lib/bank/trend/actions.ts` admin surfaceConfig
baseUrl, `admin/bank/actions.ts` baseUrl (admin surface), and
`admin/bank/editor-shell.tsx` cancelHref default — all flipped to
`/admin/bank/all` or `/admin/bank/trends`. Permission-fail redirects
across 7 existing admin pages (`/admin` → `/admin/dashboard`) — single-
hop to skip the redirect chain.

### Files created (Phases 2–5)

- `lib/nav/admin.ts` — `ADMIN_NAV` (15 items, dropdown on Bank) +
  `filterAdminNav` helper. Spec-to-code permission mapping (dotted
  spec form → SCREAMING_SNAKE code keys) documented at the top.
- 8 new icons added to `components/nav/shared/nav-icon.tsx`: `tutor`,
  `apply`, `tag`, `flag`, `mail`, `alert`, `shield`, `settings`. Paths
  copied verbatim from `admin-nav.html`'s mockup. Spec icon for
  Programmes (`calendar`) and Readiness Packs (`target`) reuse
  existing entries — no new icon needed.
- `lib/nav/types.ts` — `NavItem` gained optional `permission?: string | null`
  (with sentinel `'SUPER_ADMIN'` for role-only gating).
- `components/nav/admin/sidebar.tsx` — admin sidebar with footer
  counter (FlatRow + ParentRow split, same pattern as
  `components/nav/tutor/global-sidebar.tsx`).
- `components/nav/admin/admin-shell.tsx` — Server Component shell
  helper.
- `app/(app)/admin/{dashboard, packs, users, tutors, applications,
  programmes, enrolments, products, reports, enquiries,
  announcements, permissions, config}/page.tsx` — 13 placeholder
  pages, each with its own permission gate.
- `app/(app)/admin/{dashboard, bank, packs, users, tutors,
  applications, programmes, enrolments, payments, products, reports,
  enquiries, announcements, permissions, config}/layout.tsx` — 15
  thin layout files, each renders `<AdminShell>{children}</AdminShell>`.
- `styles/nav.css` — `.sidebar` refactored to flex column (so admin
  footer pins at bottom; tutor + student sidebars look unchanged
  since they don't render `.sidebar-content`); added
  `.sidebar-content`, `.sidebar-footer`, `.sidebar-footer-label`,
  `.sidebar-footer-value`.

### Files edited

- `app/(app)/admin/layout.tsx` — reverted to slim role gate
- `app/(app)/admin/page.tsx` — section-menu page replaced with redirect
- 7 existing admin pages — perm-fail redirects flipped to
  `/admin/dashboard` (single-hop after the `/admin` redirect change)
- `mynclex/CLAUDE.md` — new 8th folder-conventions rule documenting
  SCREAMING_SNAKE for permission keys
- `mynclex/docs/product-plan/admin-nav.html` — build-note callout
  explaining the SCREAMING_SNAKE convention + the route moves

### Decisions captured

- **Cases keep short slug at `/admin/bank/cases/`**, mirroring tutor.
  Sidebar label is "Case Studies"; URL slug is `cases`.
- **Sidebar code stays audience-isolated.** Admin gets its own
  `components/nav/admin/sidebar.tsx` rather than generalising the
  tutor sidebar. Generalisation can land after a 4th audience
  consumer proves the abstraction is stable.
- **Net-new icons = 8** (handoff said 11). Spec uses `calendar` for
  Programmes (not `briefcase`), `apply` for Enrolments (not `link`),
  and the `pack` SVG is identical to existing `target` — kept
  `target` and skipped the alias.
- **Detail subtrees deferred.** `/admin/user/[id]/...` and friends
  land per-feature when the real pages need them; the list-vs-detail
  sibling rule from slice 2.7 fix applies.
- **Permissions page = SUPER_ADMIN role only**, not a permission
  bucket. The page that grants other admins their buckets isn't a
  bucket itself.

### Verification

- `npx tsc --noEmit` — clean
- `npx eslint app components lib` — clean
- `npm run build` — clean (route count grew significantly, see
  build output)
- Browser preview: dev server boots, middleware bounces unauthed
  `/admin/dashboard` to `/login`. Authed flow needs Sam's session.

### What's unblocked

- Three audience nav scaffolds complete (student, tutor, admin).
- Each admin section (Users, Tutors, etc.) can build out its real
  page + detail subtree following the established pattern.
- Real admin permissions UI (the dropping placeholder under
  `/admin/permissions`) is the natural next admin work.

### Next session

Sam-driven — pick the next admin feature or unrelated work.

---

## Session — 2026-04-26 (Slice 2.7 fix — programme route split — Claude Web + Desktop)

Bug shipped yesterday: visiting any programme detail URL
(`/tutor/programmes/[id]/overview` etc.) rendered TWO topbars and
TWO footers stacked. Root cause: the file tree had
`programmes/layout.tsx` wrap the list AND
`programmes/[programme_id]/layout.tsx` wrap the detail, both nested
under the same parent — Next.js layouts always nest, so both
`<AppShell>` instances rendered on a detail URL.

The structural fix: list and detail are conceptually sibling worlds
(entering a programme is a context switch, not a drill-down), so the
file tree needs to express that. Split into singular vs plural:
- `tutor/programmes/` (plural) — list, global chrome, no children.
- `tutor/programme/[programme_id]/` (singular) — detail subtree,
  programme chrome.

### Changes

- 9 files moved: `tutor/programmes/[programme_id]/{layout,page,
  overview,weeks,sessions,mocks,assignments,students,results}` →
  `tutor/programme/[programme_id]/{...}`
- `lib/nav/tutor.ts` `TUTOR_PROGRAMME_NAV` — 7 hrefs flipped from
  `/tutor/programmes/:programmeId/...` to
  `/tutor/programme/:programmeId/...`
- `tutor/programmes/page.tsx` — demo card hrefs now point at
  `/tutor/programme/${id}/overview`
- `tutor/programme/[programme_id]/page.tsx` — internal redirect now
  targets `/tutor/programme/${id}/overview`
- Stale comments updated in `programme-sidebar.tsx`,
  `tutor/programmes/layout.tsx`, `tutor/layout.tsx`, and the
  `tutor-nav.html` route-shape block
- `tutor-nav.html` — added a second build-note callout explaining
  the singular/plural decision
- `CLAUDE.md` — added a 7th folder-conventions rule documenting the
  list-vs-detail sibling pattern, so the admin scaffold inherits it

Old URLs `/tutor/programmes/[id]/...` 404 — clean break, only Sam
used them.

### Verification

- `npx tsc --noEmit` — clean
- `npx eslint app components lib` — clean
- `npm run build` — clean
- Dev preview: `/tutor/programmes` renders single global chrome,
  `/tutor/programme/demo-bootcamp/overview` renders single
  programme chrome (no double topbar).

### Implication for the admin slice

The `(app)/admin/layout.tsx` from slice 2.6 still renders an
`<AppShell>` directly. The admin scaffold needs to (a) revert it to
a slim role gate, and (b) follow the list-vs-detail sibling pattern
established here for any admin surface where entering a detail
changes the chrome.

---

## Session — 2026-04-25 (Slice 2.7 — Tutor nav scaffold — Claude Web + Desktop)

Tutor navigation end-to-end: global sidebar (Programmes / My Bank ▾ /
My Students / Payments / Profile), programme-scoped sidebar with back
pill (Overview / Weeks / Sessions / Mocks / Assignments / Students /
Results), collapsible "My Bank" dropdown wired to the existing tutor
bank list + case-study list + trend list pages. Two hardcoded demo
programme cards make the programme context reachable for browser
verification.

### Architecture

`(app)/tutor/layout.tsx` reverted from slice 2.6's AppShell-rendering
shape back to a **slim TUTOR role gate**. Each tutor sub-folder owns
its own chrome via two new Server Component helpers:

- `<TutorGlobalShell>` — wraps the 5 global sub-folders (programmes,
  bank, students, payments, profile). Renders AppShell with
  `productLabel="· Tutor"` + the global sidebar.
- `<TutorProgrammeShell>` — wraps `programmes/[programme_id]/*`.
  Renders AppShell with `productLabel="· Tutor"` + the programme
  sidebar + a back pill in the topbar's right slot.

Both helpers call `loadChromeData()` (one PostgREST round-trip per
request) and pass the same shape into `<AppShell>`. Per-folder layout
files stay 3 lines each — the shells are the single source of chrome
composition.

### Route moves (Phase 1 — clean break, no redirects)

- `tutor/trends/page.tsx` → `tutor/bank/trends/page.tsx`
- `tutor/trends/[trend_id]/page.tsx` → `tutor/bank/trends/[trend_id]/page.tsx`
- `tutor/trends/new/page.tsx` → `tutor/bank/trends/new/page.tsx`
- `tutor/bank/page.tsx` → `tutor/bank/all/page.tsx` (and a new
  `tutor/bank/page.tsx` redirect lands users at `/tutor/bank/all`)

Reference updates:
- `BASE_URL` in moved files
- `redirect()` and `<Link href>` in tutor bank list (focus-mode
  redirect for trend children, "Trend datasets →" header card)
- "← Back to bank" link in tutor cases list page now points to
  `/tutor/bank/all`
- `lib/bank/list-view.tsx` `wrapperBaseUrl()` for trends
- `lib/bank/trend/editor.tsx` surface URL builder
- `lib/bank/trend/actions.ts` surface config (drives revalidatePath)

Case Study routes were NOT moved — already at `/tutor/bank/cases/*`
from slice 1.11a. The nav config uses the existing slug; sidebar
label is "Case Studies".

### Files created (Phases 2–6)

- `lib/nav/tutor.ts` — `TUTOR_GLOBAL_NAV` + `TUTOR_PROGRAMME_NAV`.
  Global config has `children` on the bank entry. Programme hrefs
  use `:programmeId` placeholder substituted by the layout.
- `components/nav/shared/nav-icon.tsx` — moved from
  `components/nav/student/`. Now shared across audiences. Added 7
  new icons: `users`, `card`, `layers`, `chart`, `edit`,
  `arrow-left`, `chevron-down`. Paths copied verbatim from
  `tutor-nav.html`'s mockup.
- `components/nav/tutor/global-sidebar.tsx` — collapsible-parent
  client sidebar. Default-expanded if any child href is a prefix of
  current pathname. Click parent → toggle only (sub-items navigate).
- `components/nav/tutor/programme-sidebar.tsx` — flat list, mirrors
  the student sidebar's pattern with a "This programme" header.
- `components/nav/tutor/back-pill.tsx` — server component, renders
  in the topbar `rightSlot` only inside programme context.
- `components/nav/tutor/global-shell.tsx` + `programme-shell.tsx` —
  the two reusable chrome helpers.
- `app/(app)/tutor/programmes/page.tsx` — Home (list) with two
  hardcoded demo cards.
- `app/(app)/tutor/programmes/[programme_id]/{layout,page,overview,weeks,sessions,mocks,assignments,students,results}` — programme context: 1 layout + redirect + 7 placeholders.
- `app/(app)/tutor/{programmes,bank,students,payments,profile}/layout.tsx` — 5 thin global-shell layout files.
- `app/(app)/tutor/{students,payments,profile}/page.tsx` — 3 global placeholder pages.
- `app/(app)/tutor/bank/page.tsx` — redirect to `/tutor/bank/all`.

### Files edited

- `lib/nav/types.ts` — `NavIcon` union grew by 7. `NavItem` gained
  optional `children?: NavItem[]`.
- `components/nav/student/sidebar.tsx` — nav-icon import path
  updated to `@/components/nav/shared/nav-icon`.
- `app/(app)/tutor/layout.tsx` — reverted to slim role gate.
- `app/(app)/tutor/page.tsx` — was placeholder dashboard, now
  redirects to `/tutor/programmes`.
- `app/(app)/tutor/bank/cases/page.tsx` — back link now targets
  `/tutor/bank/all`.
- `lib/bank/list-view.tsx`, `lib/bank/trend/editor.tsx`,
  `lib/bank/trend/actions.ts` — trend baseUrls updated.
- `styles/nav.css` — appended sections for collapsible sidebar
  parents, sidebar header, back pill, programmes list page,
  programme cards.
- `mynclex/docs/product-plan/tutor-nav.html` — added build note
  callout at the top.

### Decisions captured

- **Cases keep short slug.** `/tutor/bank/cases/` (existing) over
  the spec's `/tutor/bank/case-studies/`. URL slug is internal;
  sidebar label remains "Case Studies".
- **Tutor layout reverts to role gate.** Slice 2.6's AppShell wrap
  is unwound — programme context can't replace the sidebar without
  this revert because nested AppShells double-render.
- **Programme shell 404s on unknown programme id.** With no DB to
  consult yet, an unknown `[programme_id]` triggers `notFound()`
  rather than rendering a fake-titled chrome.
- **No placeholder badges in the sidebar.** The mockup shows
  "placeholder" pills next to Payments / Mocks / Assignments;
  skipped for v1 since every page is a placeholder anyway. Add
  back when only some pages are placeholders.

### Verification

- `npx tsc --noEmit` — clean
- `npx eslint app components lib` — clean
- `npm run build` — clean (route count grew, see route list below)
- Browser preview spot-check pending in the verification step.

### What's unblocked

- Admin nav scaffold (slice 2.8 — last of the three).

### Next session

Admin nav scaffold per `docs/product-plan/admin-nav.html`.

---

## Session — 2026-04-25 (Slice 2.6 — Student nav scaffold + folder convention — Claude Web + Desktop)

Two things landed in one slice:

1. **Folder convention** adopted repo-wide: components grouped by
   domain (`shell/`, `nav/<audience>/`), CSS promoted to top-level
   `styles/`, audiences live under `app/(app)/{student,tutor,admin}/`.
2. **Student nav scaffold** end-to-end: picker landing, bank product
   space (6 pages), programme product space (5 pages), product
   switcher with upsell modal, post-login redirect to picker.

### Architectural shift

`(app)/layout.tsx` is now a slim auth boundary — it redirects to
/login if no user, imports the workspace CSS (`tokens`, `dashboards`,
`shell`, `nav`), and renders children. **It no longer renders the
topbar or footer.** Each audience layout calls a new
`loadChromeData()` helper and wraps children in `<AppShell>`,
passing its own `productLabel` and `rightSlot` (e.g.
`<ProductSwitcher />`). This avoids middleware-pathname tricks
that the original handoff prescribed (the `x-pathname` snippet had
a real bug — sets header on response not next request).

Collateral: tutor and admin layouts were updated to render their
own `<AppShell>` so they didn't lose chrome when the parent stopped
rendering it. Tutor layout: now does its own AppShell wrap with no
productLabel/rightSlot. Admin layout: created (didn't exist) with
ADMIN/SUPER_ADMIN gate + AppShell wrap. Both are minimal — full
admin and tutor nav scaffolds land in their own slices later.

### Files moved (Phase 1 tidy)

- `components/{topbar,footer,role-chip,user-menu}.tsx` →
  `components/shell/{...}.tsx`
- `app/{tokens,shell,dashboards,auth,landing}.css` →
  `styles/{...}.css`
- 8 import sites updated to the new paths.

### Files created

- **lib/**
  - `lib/nav/types.ts` — `NavItem` + `NavIcon` union (9 icons)
  - `lib/nav/student.ts` — `STUDENT_BANK_NAV` (6 items, `practice`
    key replaces `bank`) + `STUDENT_PROGRAMME_NAV` (5 items)
  - `lib/shell/load-chrome-data.ts` — fetches user/profile/roles +
    resolves `viewingAs` from cookie

- **components/**
  - `components/shell/app-shell.tsx` — chrome wrapper (shell-root +
    topbar + body + footer)
  - `components/nav/shared/placeholder.tsx` — "Coming soon" body
  - `components/nav/student/sidebar.tsx` — generic sidebar driven
    by `NavItem[]`, active-state via `usePathname` + `startsWith`
  - `components/nav/student/nav-icon.tsx` — switch-on-name returning
    inline SVG, paths copied verbatim from the mockup
  - `components/nav/student/product-switcher.tsx` — topbar pill
    toggle, opens upsell modal for bank-only students
  - `components/nav/student/upsell-modal.tsx` — modal with click-
    outside + Escape dismissal

- **app/**
  - `app/(app)/admin/layout.tsx` — new admin role gate + AppShell
  - `app/(app)/student/picker/page.tsx` — picker landing
  - `app/(app)/student/bank/layout.tsx` + `page.tsx` (redirect) +
    `dashboard/`, `practice/`, `packs/`, `journey/`, `history/`,
    `profile/page.tsx`
  - `app/(app)/student/programme/layout.tsx` + `page.tsx` (redirect)
    + `overview/`, `weeks/`, `sessions/`, `tasks/`, `profile/page.tsx`
  - `app/programmes/page.tsx` — public placeholder, sits outside
    `(app)`, styled with the existing landing tokens
  - `styles/nav.css` — sidebar, picker, switcher, modal, placeholder

### Files edited

- `app/(app)/layout.tsx` — stripped to auth + CSS imports + children
- `app/(app)/tutor/layout.tsx` — now renders its own AppShell
- `app/(app)/student/page.tsx` — was the dashboard, now redirects to
  `/student/picker`
- `app/router/page.tsx` — `STUDENT: '/student' → '/student/picker'`
- `components/shell/topbar.tsx` — added optional `productLabel` +
  `rightSlot` props
- `mynclex/CLAUDE.md` — new "Folder Conventions" section
- `mynclex/docs/product-plan/student-nav.md` — URL prefix note +
  `bank → practice` route key rename

### Known placeholder data

`hasBankSubscription`, `bankDaysLeft`, `hasProgrammeEnrolment`,
`programmeTitle`, `programmeWeek`, `programmeTotalWeeks` are all
hard-coded in the picker page and audience layouts. The real
`nclex_subscriptions` and `nclex_enrolments` tables don't exist
yet — placeholders get replaced when those tables ship.

The bank layout passes `hasProgrammeEnrolment={false}` to the
ProductSwitcher today (so clicking Programme opens the upsell
modal). The programme layout passes `true` (so a programme student
can switch back to bank). Both flips happen for free when the
enrolment table lands.

### What's unblocked

- Tutor nav scaffold (Slice 2.7)
- Admin nav scaffold (Slice 2.8)

### Next session

Tutor nav scaffold per `docs/product-plan/tutor-nav.html`.
Architecture is the same as student: `(app)/tutor/{programmes,
my-bank, my-students, payments, profile}/...` plus nested
`(app)/tutor/programmes/[id]/*` with its own programme-scoped
sidebar and back pill.

---

## Session — 2026-04-24 (Slice 1.12 wrap + bank-list polish — Claude Web + Desktop)

Shipped the Trend wrapper (NGN 10th type) end-to-end across
three sub-slices plus a bank-list polish follow-up. MyNclex
authoring is now complete — every NGN question type family
ships in v1.

### What shipped today

- Slice 1.12a (commit 229287d) — nclex_trend_datasets schema +
  dataset editor. Kind-template picker (5 presets + Custom),
  data-table authoring (rows × timepoints, per-cell flags,
  optional ref-range column).
- Slice 1.12b (commit edd01e3) — trend_id FK on
  nclex_bank_items, attached questions on the right pane with
  variable pill count, transactional save RPC
  nclex_save_trend_with_children.
- Slice 1.12c (commits a6d883b + bcd1423) — delete flow
  (detach-and-delete / delete-everything with typed DELETE),
  validation panel (8 errors + 4 warnings), bank.md revised
  to as-built shape.
- Bank-list polish (commit 1ed5a8d) — case-children visible
  in bank list (stance reversal from 1.11b), context-aware
  Edit labels, clickable wrapper badges, Membership filter,
  composition counts (filtered/total format).

### What's unblocked

Student runner. Every authoring surface is done. The runner
can now consume standalone questions, case studies, and
trend items without waiting on any authoring work.

### Next session

Planning discussion — not building. The layer between bank
and runner needs architecture settled before any build
starts: quiz builder mechanics, quiz session storage,
runner modes (Learning / Timed / Mock / Readiness / CAT),
results and history, analytics capture strategy. Likely 2-3
planning sessions before any build handoff.

---

## Session — 2026-04-24 (Bank-list polish — wrapper visibility + context edit + membership filter)

Six changes to the shared bank list surface. Both admin and tutor
banks now show every authored question — standalone, case-linked,
trend-linked — in the same list, with wrapper-aware affordances:

1. **Case exclusion removed.** `.is('parent_case_id', null)` was
   dropped from both main + count queries on both surfaces.
   Case-children now render alongside standalones and trend-
   children. This is a **stance reversal** from 1.11b — not a
   bug fix. 1.11b *chose* to hide case-children because the edit
   path hadn't been hardened; now that protection exists (the
   `?edit=` redirect to the case editor), hiding them is
   over-strict.
2. **Trend-child Edit redirect added.** The server page's
   focus-mode load grew a parallel `if (full.trend_id)` branch
   mirroring the 1.11b case redirect. Clicking Edit on a
   trend-linked row routes to
   `/admin/trends/[trend_id]?focus=[item_id]` instead of opening
   the standalone editor. Pre-1.12c only case had this; trend
   was falling through to the standalone editor (real bug
   silently shipped).
3. **Context-aware Edit label.** The Edit button text varies:
   `Edit` / `Edit in case editor` / `Edit in trend editor`. The
   href stays uniform `?edit=ID`; only the button copy changes.
4. **Composition-counts row.** Four buckets displayed as
   `filtered/total` under the page title — Total, Standalone,
   Case-linked, Trend-linked. Replaces the old
   `{rows.length} of {total} questions` subtitle (dropped this
   slice — two stacked totals would be redundant).
5. **Membership filter.** Sixth dropdown on the filter bar,
   sitting between Status and Search. Options:
   `All / Standalone / Case-linked / Trend-linked`. Threaded
   through `BankFilterValues` + `BankSearchParams` +
   `buildFilterQueryString` identically to the existing 5
   filters.
6. **Clickable wrapper badges.** The `In case · {title}` and
   `Trend · {title}` chips are now `<Link>` elements that jump
   straight to the wrapper editor focused on that question —
   same destination as Edit, faster to click.

### Locked decisions (from handoff + two Q&A disambiguations)

Handoff-locked:
- **Show every question by default.** Hide-and-redirect is stricter
  than necessary now that both wrappers have edit-redirect coverage.
- **Protect wrapper edits.** Both case and trend children bounce to
  the wrapper editor. Redirect-check order: **trend_id first, then
  parent_case_id.** Rationale beyond "arbitrary": parent_case_id
  has `ON DELETE SET NULL`, trend_id has `ON DELETE RESTRICT`, so
  a row that was once both can legitimately end up with only
  `trend_id` set post-cascade — trend-first correctly catches it.
- **Three Edit-label variants** — `Edit` / `Edit in case editor`
  / `Edit in trend editor`.
- **Counts format** `filtered/total`. Total scoped to surface
  (admin counts don't include tutor items).
- **One new filter, four values.** Membership: All / Standalone /
  Case-linked / Trend-linked. Default All (absent URL param).
- **Clickable badges, no row colour.** Badges carry enough signal.

Disambiguated before build (my two Qs, Sam accepted both):
- **`filtered` counts exclude the membership filter.** Otherwise
  3 of 4 counts would collapse to 0 whenever a membership is
  picked (the main query applies membership; the count queries
  deliberately skip it).
- **Drop the `{rows.length} of {total} questions` subtitle.**
  Composition-row's `Total N/M` replaces it cleanly.

### Schema

No schema changes. All four relevant FK constraints already exist
with Supabase-default naming (verified against dev `pg_catalog`):

- `nclex_bank_items_parent_case_id_fkey` → `nclex_case_studies(case_id)`
- `nclex_bank_items_trend_id_fkey`       → `nclex_trend_datasets(trend_id)`
- `nclex_tutor_questions_parent_case_id_fkey` → `nclex_tutor_case_studies(case_id)`
- `nclex_tutor_questions_trend_id_fkey`       → `nclex_tutor_trend_datasets(trend_id)`

The Supabase FK-join aliases (`case:nclex_case_studies(title)` etc.)
resolve automatically — no `!constraint_name` hint needed.

### Architectural notes

- **Nine queries per list load.** One main rows query + eight
  COUNTs (4 surface-totals + 4 filtered-bucket). All 9 go through
  `Promise.all`, so wall-time is dominated by the slowest. At dev
  scale (29 rows total) this is well under 100ms. Worth
  revisiting if the bank grows past ~100k rows; `count: 'exact'`
  isn't free at that scale.
- **`countQuery` helper lives locally in each page.** Tutor
  version scopes every count to `.eq('tutor_id', user!.id)` —
  RLS handles this too, but belt-and-braces makes the scope
  visible in the source. The `user!` non-null assertion is safe
  because the `redirect('/login')` earlier in the function
  short-circuits on anon.
- **FullBankRow `trend_id` drift-fix.** Pre-slice, `FullBankRow`
  declared `parent_case_id` but not `trend_id` — the `SELECT *`
  returned `trend_id` at runtime but the type didn't know. Fixed
  by promoting both `parent_case_id` and `trend_id` onto the
  shared `BankRow` interface (they belong there now that the
  list renderer needs them). `FullBankRow` carries them via
  inheritance; its own field list got shorter.
- **Row-map fallback for missing joined titles.** If the FK join
  returns null (dataset deleted mid-query, race condition), the
  server falls back to showing the raw ID (`In case · NCLEX_CS_00001`)
  rather than hiding the badge. The curator needs to see the
  membership; a missing title is an "unknown dataset" state, not
  an "unlinked question" state.
- **Focus-mode navigator stays as-is.** The compact nav in
  `/admin/bank?edit=X` now lists every row including wrapper
  children. Clicking a wrapper-child nav link mid-edit fires the
  server redirect → bank editor unmounts → curator lands in
  the wrapper editor. Coherent but a UX surprise worth noting.
  Could be hardened later by hiding wrapper children in the nav;
  deliberately deferred.

### Files created

- None. Every change modifies existing files.

### Files modified

- `mynclex/lib/bank/list-view.tsx` — `BankRow` gains
  `parent_case_id`, `trend_id`, `case_title`. `BankSearchParams`
  + `BankListViewProps` gain `membership` and `counts`. New
  `BankCompositionCounts` type. New `CompositionCounts`
  component rendering the four buckets. New `wrapperBaseUrl`
  helper mapping baseUrl × kind to editor root. `BrowseRow`
  computes `editLabel` + `caseBadgeHref` + `trendBadgeHref`;
  both wrapper badges are `<Link>` elements with
  `.bank-badge-link`. `renderBrowseMode` drops the subtitle and
  mounts `<CompositionCounts>` above the filter bar.
  `buildFilterQueryString` preserves `membership`.
- `mynclex/lib/bank/filters.tsx` — `BankFilterValues` gains
  `membership`. New `<select>` labelled Membership between
  Status and Search.
- `mynclex/app/(app)/admin/bank/page.tsx` — case exclusion
  removed; select extends with `parent_case_id, trend_id,
  case:nclex_case_studies(title)`; membership filter applied
  to main query only; local `countQuery` helper drives 8
  COUNT queries; `trend_id` redirect branch added ahead of the
  case branch.
- `mynclex/app/(app)/tutor/bank/page.tsx` — same changes
  against tutor tables (joins point at
  `nclex_tutor_case_studies` / `nclex_tutor_trend_datasets`;
  redirects go to `/tutor/bank/cases/...` /
  `/tutor/trends/...`; counts scope to
  `.eq('tutor_id', user.id)`).
- `mynclex/app/dashboards.css` — appended `.bank-counts-row` +
  `.bank-count-item` + `.bank-count-label` + `.bank-count-value`
  + `.bank-badge-case` + `.bank-badge-link` block. Purple
  palette (`#eeedfe / #3c3489 / #afa9ec`) matches existing
  `.cs-pill.info` + `.tr-delete-dialog__attached-type` chips.

### Files NOT modified (explicitly)

- `mynclex/lib/bank/navigator.tsx` — focus-mode nav shape
  unchanged; see the architectural note above.
- `mynclex/lib/bank/case-study/`, `mynclex/lib/bank/trend/` —
  not touched. Pure list-surface slice.
- No schema, no RLS, no migrations.
- No editor components.

### Verified locally

- `npx tsc --noEmit` — clean.
- `npx eslint app lib` — clean.
- `npm run build` — clean. **25 routes**, unchanged.
- Pre-slice dev counts (from investigation): 29 total / 22
  standalone / 4 case-linked / 3 trend-linked. Same count
  helper on the page should produce the same numbers on page
  load.
- No browser test this session; Sam verifies.

### Known temporaries / deferrals

- **Focus-mode navigator.** Lists wrapper children alongside
  standalones now. Clicking one mid-edit triggers the server
  redirect, unmounting the bank editor. Acceptable for now;
  could be hidden in a follow-up if it trips curators.
- **Count query cost at scale.** 8 COUNTs per load is fine at
  dev scale but not free at 10k+ rows. Revisit if/when.

### Next session

- **Sam's browser-side verification** per the handoff's
  11-step script (admin list showing all three kinds, badge
  click, Edit click, membership filter, tutor twin).
- **Student runner** — still the only unbuilt piece of the
  MyNclex authoring/consumption loop.

---

## Session — 2026-04-24 (Slice 1.12c — Trend delete flow + validation + bank.md revision)

Slice 1.12c closes out Trend authoring. Three independent pieces:

1. **Delete-with-confirmation dialog** handles datasets with and
   without attached questions, with a typed `DELETE` confirmation
   and two explicit destructive paths backed by four new RPCs.
2. **Validation panel** mirrors the 1.11c Case Study pattern with 8
   errors + 4 warnings. Manual-only; never auto-runs on Save.
3. **`bank.md` Trend section revised** from "planned shape" to
   "as built". Shipped as a solo commit (`a6d883b`) before any
   code so the doc fix was insulated from later build risk.

The student runner is now unblocked on the Trend family; the only
remaining MyNclex authoring slice is done. Case Study + Trend are
both production-ready.

### Schema (applied to dev `zrakjibtxyzoqcdtvpmq`)

- Four new RPC functions, matching the 1.12b two-per-surface
  convention:
  - `nclex_detach_and_delete_trend(p_trend_id TEXT)` — NULLs the
    `trend_id` on every attached `nclex_bank_items` row, then
    deletes the dataset. Questions survive as standalone.
  - `nclex_delete_trend_and_children(p_trend_id TEXT)` — deletes
    attached items + the dataset in one transaction.
  - Parallel tutor twins: `nclex_tutor_detach_and_delete_trend`,
    `nclex_tutor_delete_trend_and_children`. All four
    `GRANT EXECUTE TO authenticated`.
- No new tables, no new columns, no new RLS policies. All four
  RPCs operate on tables that already have RLS enabled.
- `ON DELETE RESTRICT` on the `trend_id` FK remains — the
  belt-and-braces safety net against anyone bypassing the server
  action entirely. Neither new RPC relies on it: detach first
  NULLs the FK; delete-everything removes child items before the
  parent row, which doesn't trigger RESTRICT either way.

### Locked decisions (from handoff)

- **Typed confirmation text:** `DELETE`. Case-sensitive.
- **Single Delete button in the topbar, two paths in the dialog.**
  Topbar stays clean; dialog picks Detach vs Delete-everything
  via radio-ish choice cards.
- **Validation severity:** errors + warnings (2-level, same as 1.11c).
- **Validate is manual only.** Save behaviour is untouched.
- **Bank-editor "Attach trend" dropdown deferred indefinitely.**
  Same posture Case Study took — authoring canonically lives in
  the wrapper's editor.

### Validation rules shipped

*Errors (block publish when `is_published = TRUE`):*
- `trend.title.missing`
- `trend.rows.zero`
- `trend.timepoints.zero`
- `trend.row_values_mismatch` — per-row integrity check
- `trend.question.zero_on_publish`
- `slot.stem.missing`
- `slot.type.missing`
- `slot.content.invalid` — runs `initialToParsedItem` per child;
  surfaces the parser's own error text so the curator sees
  (for example) "Option 2 text is required".

*Warnings (advisory):*
- `trend.scenario.missing`
- `trend.question.zero_on_draft`
- `trend.question.type_diversity` — 3+ children all sharing one
  host type
- `trend.flags.none` — no cells flagged anywhere

Panel header logic same as 1.11c: `Ready to publish` (green) /
`N errors, M warnings — not ready` (red) /
`Draft — N errors, M warnings` (neutral).

### Architectural notes

- **`slot.content.invalid` reuses `initialToParsedItem`.** The same
  helper the save action uses is imported directly into the
  client-side validator. Confirmed client-safe (no `'use server'`,
  no server-only imports in `initial-to-parsed.ts` or any parser).
  Saves reimplementing the parametric-object construction and
  guarantees the validator + save RPC caller agree on what counts
  as valid content.
- **Defense-in-depth on bare delete.** `deleteTrendAction` now
  checks for attached children before calling DELETE. If ≥1
  found → refuses with a friendly message pointing at the dialog
  flow. `ON DELETE RESTRICT` on the FK is the last line of
  defence if someone sidesteps the server action.
- **Unsaved child drafts excluded from the delete dialog's
  attached-items list.** Drafts where `item_id === null` haven't
  been persisted, so they don't count as "dataset has attached
  questions". Filter happens in the editor before passing
  `attachedItems` into `DeleteDialog`.
- **Validate button toggles via `.tr-btn.is-open` class.** Clicking
  while open closes the panel (matches 1.11c).
- **Backdrop click closes the dialog, but only when not pending.**
  Avoids accidentally dismissing an in-flight destructive call.

### Files created

- `mynclex/db/migrations/mynclex_trend_delete_rpcs_slice_1_12c.sql`
  — four RPC function definitions + GRANT EXECUTE. ~180 lines.
- `mynclex/lib/bank/trend/validation.ts` — types
  (`TrendEditorState`, `TrendEditorChildSnapshot`,
  `ValidationIssue`, `Severity`, `PanelSummary`),
  `TREND_VALIDATION_RULES` flat rule array, `validateTrend()` +
  `summarise()` helpers.
- `mynclex/lib/bank/trend/validation-panel.tsx` — pure-
  presentation floating panel mirroring
  `cs-validate-panel` visual conventions.
- `mynclex/lib/bank/trend/delete-dialog.tsx` — modal with
  zero-vs-≥1 attached branching, radio-ish choice cards,
  typed-`DELETE` confirm.

### Files modified

- `mynclex/docs/product-plan/bank.md` — solo-committed in
  `a6d883b`. Replaced the old "planned shape" Trend section with
  an "as built" description: no classification on the dataset,
  `kind` is freeform TEXT with UI template sugar, delete
  semantics via the two RPC-backed paths. Removed the
  `Why v2, not v1` footnote.
- `mynclex/lib/bank/trend/actions.ts`:
  - Tightened `deleteTrendAction` — pre-check for attached
    children; refuse with a pointer to the dialog flow if any.
  - Added `detachAndDeleteTrendAction` and
    `deleteTrendAndChildrenAction`, each selecting the admin
    vs tutor RPC based on surface and handling the RPC's
    error / unexpected-shape responses.
- `mynclex/lib/bank/trend/editor.tsx`:
  - Topbar Delete button now opens the modal (was calling
    `deleteTrendAction` directly via a form).
  - New Validate topbar button between Cancel and Save; toggles
    the floating validation panel.
  - `buildValidatorState()` assembles the snapshot from the
    uncontrolled dataset form DOM + the active child's DOM
    snapshot + current child drafts. Mirrors 1.11c's
    `buildValidatorState` pattern.
  - Three new delete handlers (`onDeleteEmpty`,
    `onDetachAndDelete`, `onDeleteEverything`) routed via a
    shared `runDeleteAction` helper so the pending/error state
    stays consistent across paths.
- `mynclex/lib/bank/trend/types.ts` — re-exports the validator's
  public types (`TrendEditorState`, `ValidationIssue`, etc.) so
  the editor can barrel-import from `./types`.
- `mynclex/app/dashboards.css` — appended `.tr-validate-panel*`,
  `.tr-btn.is-open`, and `.tr-delete-dialog*` blocks (~300 lines).

### Files NOT modified (explicitly)

- `mynclex/db/schema.sql` — RPC definitions stay in the migration
  file only; schema.sql remains a tables-and-indexes reference.
- `mynclex/db/rls.sql` — no policy changes.
- `mynclex/lib/bank/editors/`, `parsers/`,
  `question-authoring-panel.tsx` — unchanged.
- `mynclex/lib/bank/case-study/**` — pattern source, not modified.
- The standalone bank-editor pages (`/admin/bank/new`,
  `/admin/bank/[item_id]`) — no "Attach trend" dropdown per
  handoff decision 6.

### Verified locally

- `npx tsc --noEmit` — clean.
- `npx eslint app lib` — clean.
- `npm run build` — clean. **25 routes**, unchanged from 1.12b
  (this slice wires into existing routes).
- Dev Supabase: `SELECT proname FROM pg_proc WHERE proname LIKE
  '%trend%'` returns 6 functions (2 save + 4 delete).
- No browser test this session. Sam verifies per the handoff
  script.

### Known temporaries / deferrals

- **Bank-editor "Attach trend" dropdown** — deferred indefinitely.
  Curator authoring stays in the trend editor.
- **Drag-to-reorder** — still not in v1 for rows, timepoints, or
  attached questions.
- **Student runner** — separate track; now unblocked by 1.12b/c.
- **Admin filter by `kind`** — wait until `kind` values stabilise
  in practice.

### Next session

- **Student runner** — the Case Study + Trend families are now
  fully authorable end-to-end. Runner can consume real datasets,
  attached questions, and the flags / ref-range metadata the
  authoring editor writes.
- **Browser verification (Sam)** — the 7-step script in the
  1.12c handoff (`When done` section). Key flows: validate clean,
  validate with issues, delete empty dataset, delete with
  detach, delete everything, direct-API bypass attempt.

---

## Session — 2026-04-24 (Slice 1.12b — Trend attached questions + save RPC)

Slice 1.12b fills the right half of the Trend editor — datasets
now attach variable-N bank questions via the new nullable FK
`trend_id` on `nclex_bank_items` (plus the tutor twin). The editor
mounts a pill strip + `QuestionAuthoringPanel` in `standalone`
mode per active pill; Save serialises dataset header + live child
drafts + pending deletions into a single JSONB payload that the
new `nclex_save_trend_with_children` RPC writes atomically.

### Schema (applied to dev)

- **New FK column**: `trend_id TEXT NULL REFERENCES
  nclex_trend_datasets(trend_id) ON DELETE RESTRICT` on
  `nclex_bank_items`; parallel FK to `nclex_tutor_trend_datasets`
  on `nclex_tutor_questions`.
- **Partial indexes**: `nclex_bank_items_trend_id_idx` +
  `nclex_tutor_questions_trend_id_idx`, both `WHERE trend_id IS
  NOT NULL`. 99% of bank items stay NULL so the partial index
  keeps cost off non-trend rows.
- **RPC**: `nclex_save_trend_with_children(payload jsonb)` +
  `nclex_tutor_save_trend_with_children(payload jsonb)`. Two
  parallel entry points, one per surface, as specified in the
  handoff (case-study's RPC took surface as an arg and branched
  internally; Trend follows the handoff's explicit two-function
  shape). `GRANT EXECUTE … TO authenticated` on both.
- **RLS**: no new policies. Existing `nclex_bank_items` and
  `nclex_tutor_questions` policies cover trend-linked rows
  identically to standalone rows. Audit comment added to
  `rls.sql` so the trail is complete.

### Locked state-matrix rules (from handoff + plan doc)

- **Dataset `is_published` is independent of per-question
  `is_published`.** RPC enforces no consistency between them.
- **Type picker optional at draft, required at publish.** Empty
  slots (no `question_type` AND empty stem) are dropped by both
  the client filter and the RPC's skip-filter. A published
  dataset validates that every surviving question has a type +
  non-empty stem; otherwise the whole save rolls back.
- **`is_builder_visible` stays TRUE by default** on trend-linked
  questions — unlike case-study children which forced it to
  FALSE. Trend questions ARE pickable from the student custom
  builder.
- **Empty-slot semantics**: consistent at client (editor filter),
  server action (same filter pre-RPC), and RPC (skip-continue).

### Files created

- `mynclex/db/migrations/mynclex_trend_id_column_slice_1_12b.sql`
  — two ALTER TABLEs + two partial indexes.
- `mynclex/db/migrations/mynclex_trend_save_rpc_slice_1_12b.sql`
  — the two RPC functions + GRANT EXECUTE. ~380 lines total.
- `mynclex/lib/bank/trend/child-draft.ts` — `TrendChildDraft`
  shape (`item_id`, `initial`, `isDirty`, `toDelete`),
  `emptyChildDraft()`, `loadChildDraft(row)`.
- `mynclex/lib/bank/trend/question-nav.tsx` — pill strip with
  `+ Add question` trailing button, horizontal scroll on
  overflow. Variable count; no CJMM step; pending-delete pill
  rendered with strikethrough.

### Files modified

- `mynclex/lib/bank/trend/types.ts` — `TrendEditorInitial`
  extended with `attachedItems: FullBankRow[]`. Re-exports
  `TrendChildDraft`.
- `mynclex/lib/bank/trend/editor.tsx` — rewrote right pane.
  Added child-draft state + active-index state +
  `slotFormRef` (mirrors case-study 1.11b snapshot pattern).
  New handlers: `onSelectPill`, `onAddQuestion`,
  `onDeleteActive`. `onSave` snapshots the active draft's DOM
  + serialises non-deleted drafts → `questions_json` + persisted
  toDelete ids → `deleted_item_ids`. `onDelete` pre-checks for
  attached children and refuses bare delete with a friendly
  error (1.12c will replace with the guided detach flow).
- `mynclex/lib/bank/trend/actions.ts` — `updateTrendAction`
  rewritten to parse `questions_json` + `deleted_item_ids`,
  validate each child via `initialToParsedItem` (reused from
  admin/bank), build the RPC payload, and call
  `nclex_{,tutor_}save_trend_with_children`. Empty-slot filter
  (no stem) applied as defence-in-depth.
- `mynclex/app/(app)/admin/trends/[trend_id]/page.tsx` +
  tutor twin — now fetch attached items in parallel with the
  dataset (`ORDER BY created_at ASC`); pass them via
  `initial.attachedItems`.
- `mynclex/lib/bank/list-view.tsx` — `BankRow` gains
  `trend_title: string | null`. `BrowseRow` renders a
  `bank-badge bank-badge-trend` chip showing `Trend · {title}`
  on linked rows.
- `mynclex/app/(app)/admin/bank/page.tsx` + tutor twin —
  select-query extended with the FK-join
  `trend:nclex_trend_datasets(title)` (admin) /
  `trend:nclex_tutor_trend_datasets(title)` (tutor); flat
  `trend_title` computed in the mapping before passing to
  `BankListView`.
- `mynclex/db/schema.sql` — appended ALTER TABLE + indexes in
  a dated 2026-04-24 section. Function bodies are NOT mirrored
  into schema.sql; the migration file is the authoritative
  source for PL/pgSQL definitions.
- `mynclex/db/rls.sql` — dated comment block noting no new
  policies needed.
- `mynclex/db/seed-trends-dev.sql` — appended `NCLEX_MCQ_91001`
  + `NCLEX_MAT_91001` attached to the demo dataset
  `NCLEX_TRD_00001`.
- `mynclex/app/dashboards.css` — appended `.tr-q-nav-*` +
  `.tr-q-pane-*` + `.bank-badge-trend` block (~150 lines).

### Files NOT modified (explicitly)

- `mynclex/lib/bank/editors/` + `mynclex/lib/bank/parsers/` —
  the 9 per-type editors and their parsers reused verbatim.
- `mynclex/lib/bank/question-authoring-panel.tsx` — stays as-is;
  Trend uses existing `standalone` mode.
- `mynclex/lib/bank/case-study/**` — reference pattern only.
- The standalone bank editor pages (`/admin/bank` focus mode,
  `/admin/bank/new`) — "Attach trend" dropdown is deferred to
  1.12c per the handoff.
- `mynclex/docs/product-plan/bank.md` — trend section still
  reflects the pre-revision shape. 1.12c will revise.

### Architectural notes worth remembering

- **Reused `initialToParsedItem` across three slices now.**
  Standalone bank (parser in actions.ts), case-child save
  (1.11b), trend-child save (1.12b). The helper's three-way
  drift-trap comment at the top of the file still holds — any
  per-type shape change needs checking against all three paths.
- **Cross-boundary import.** `lib/bank/trend/actions.ts` imports
  `initialToParsedItem` from `app/(app)/admin/bank/initial-to-parsed.ts`
  — the same backwards-dependency case-study/actions.ts
  established in 1.11b. Accepted; a future lift to a neutral
  `lib/bank/` module would clean this up across both wrappers at
  once.
- **FK-join on Supabase** for the bank-list badge uses the alias
  syntax `trend:nclex_trend_datasets(title)`. Shape at runtime:
  `{trend: {title} | null}`. Row mapping extracts to flat
  `trend_title` before passing into the shared `BankListView`.

### Divergences / drift points encountered

1. **Handoff mentions `lib/bank/case-study/question-nav.tsx` as
   the component to mirror.** That file doesn't exist — case-study's
   `QuestionNavigator` is an inline function at
   `lib/bank/case-study/editor.tsx:1072`. Mirrored that shape
   into `lib/bank/trend/question-nav.tsx` (new standalone file).
2. **`QuestionAuthoringPanel` key management.** Case-study uses
   `key={activeSlot}` to force remount when switching slots;
   Trend does the same with `key={activeIndex ?? -1}` for
   identical reasons — defaultValue-driven inputs inside the
   panel pick up the active draft's fields on mount only.
3. **Type-change inside an existing question.** Per the 1.11b
   pattern, the panel disables the type select in edit mode so
   content/correct shape can't drift. Trend inherits this — same
   edit-mode gate. If the curator wants to change type, they
   delete the question and add a new one.

### Verified locally

- `npx tsc --noEmit` — clean.
- `npx eslint app lib` — clean (one warning fixed mid-slice:
  unused `prev` in a `setActiveIndex` callback).
- `npm run build` — clean. **25 routes**, same as 1.12a.
  1.12b wires functionality into existing routes; no new ones.
- Dev Supabase state: 2 columns + 2 indexes + 2 functions
  added; seed dataset `NCLEX_TRD_00001` now has 2 attached
  items (`NCLEX_MCQ_91001`, `NCLEX_MAT_91001`).
- No browser test this session; Sam runs the dev worker.

### Next session

- **Slice 1.12c** — three pieces: (a) delete-with-attached-
  questions confirmation dialog + two RPCs (detach-and-delete,
  delete-everything), (b) validation panel mirroring 1.11c,
  (c) bank-editor "Attach trend" dropdown (secondary authoring
  path) + inline "Create new" link.
- **Browser verification** — Sam's verification focus per the
  handoff: add questions of varying types, switch pills to
  confirm state preservation, delete a question, save, reload,
  check persistence. Publish a dataset with a draft question
  attached — should succeed (dataset-independent). Publish with
  an attached question that has no stem — RPC should raise.
- **`docs/product-plan/bank.md` sweep** — still reflects the
  pre-revision trend shape. Revise during 1.12c after the
  build has validated the schema.

---

## Session — 2026-04-24 (Slice 1.12a — Trend dataset schema + editor)

Slice 1.12a lands the dataset layer of the Trend wrapper. A curator
can create a named trend dataset end-to-end from both `/admin/trends`
and `/tutor/trends`: pick a kind (5 presets + Custom), fill in title +
scenario, build the data table (rows × timepoints with per-cell flags
and an optional ref-range column), save, and see it listed. No
attached questions yet — the right half of the split is a "Questions
— Slice 1.12b" placeholder, mirroring how 1.11a reserved the right
half of the case editor.

### Schema

Two new tables on dev (`zrakjibtxyzoqcdtvpmq`):

- `nclex_trend_datasets` — admin-owned. Columns: `trend_id` TEXT PK,
  `title`, `scenario`, `kind`, `timepoints` JSONB, `rows` JSONB,
  `is_published`, timestamps.
- `nclex_tutor_trend_datasets` — tutor-private twin. Same shape plus
  `tutor_id UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE`
  and an index on `tutor_id`.

RLS enabled on both. Four policies total:

- Admin: `*_read_published` (any authenticated, is_published=TRUE) +
  `*_curate_all` (BANK_CURATE via `nclex_user_has_permission`,
  SUPER_ADMIN via the helper's short-circuit).
- Tutor: `*_tutor_own` (tutor_id = auth.uid()) +
  `*_superadmin` (SUPER_ADMIN bypass).

No `trend_id` FK on `nclex_bank_items` or `nclex_tutor_questions` —
that lands in 1.12b. Keeping the schema minimal until attachment
becomes a real feature.

### Divergences from handoff (flagged)

1. **No `set_updated_at()` trigger function.** Handoff asserted the
   helper already existed and said to just attach `CREATE TRIGGER …
   EXECUTE FUNCTION set_updated_at()` on both new tables. It does
   NOT exist — grep across `mynclex/db/**` turns up zero CREATE
   TRIGGER and zero CREATE FUNCTION for updated_at. The repo's
   convention is explicit `updated_at = NOW()` in every write path
   (see `upsertTabAction` in case-study/actions.ts and the
   `nclex_save_case_with_children` RPC). Following that convention:
   no triggers this slice; `updateTrendAction` sets `updated_at`
   explicitly. Migration header documents this. If a project-wide
   trigger pattern arrives later, it can attach to these tables
   without breaking anything.

2. **`tutor_id` FK target.** Handoff SQL named `auth.users(id)`;
   every existing tutor-scoped table in mynclex references
   `nclex_users(id) ON DELETE CASCADE` instead. Followed the repo
   convention. Same practical semantics (nclex_users cascades from
   auth.users), uniform schema reads.

### Files created

- `mynclex/db/migrations/mynclex_trend_datasets_slice_1_12a.sql`
  — the two CREATE TABLEs + RLS. Applied to dev.
- `mynclex/db/seed-trends-dev.sql` — one demo dataset
  (`NCLEX_TRD_00001`, post-op vitals, matches the mockup's Example 1).
  Three timepoints, five rows, flags + ref-range populated on every
  row so every authoring affordance renders during dev testing.
- `mynclex/lib/bank/trend/types.ts` — `Surface`, `TrendFlag`,
  `TrendRow`, `TrendDatasetRow`, `TrendEditorInitial`.
- `mynclex/lib/bank/trend/kind-templates.ts` — `KIND_PRESETS`
  (`'vitals' | 'labs' | 'io' | 'neuro' | 'assessment'`),
  `kindDefaultLabel`, `kindEnablesRefRange`, `kindSeedData` with
  realistic row templates per preset.
- `mynclex/lib/bank/trend/actions.ts` — `createTrendAction`,
  `updateTrendAction`, `deleteTrendAction`, `surfaceConfig` /
  `readSurface` / `requireTrendCurator` / `nextTrendId`. Mirrors
  the Case Study pattern; `parseRows()` validates alignment between
  `values[]` / `flags[]` and the dataset's timepoint count.
- `mynclex/lib/bank/trend/editor.tsx` — top-level editor (split-pane,
  topbar, save/delete/cancel, divider with localStorage persist,
  `?saved=1` redirect).
- `mynclex/lib/bank/trend/metadata-accordions.tsx` — two `<details>`
  accordions (Trend setup / Trend publishing). Kind picker has 5
  presets + "Custom…" with a reveal-on-select text input; a single
  hidden `name="kind"` reflects current state.
- `mynclex/lib/bank/trend/data-table.tsx` — controlled data-table
  with add/remove row, add/remove timepoint, in-place rename of
  metric labels + timepoint headers, per-cell text input, per-cell
  flag cycle button (null → abnormal → borderline → null), ref-range
  column toggle + per-row ref-range input.
- `mynclex/app/(app)/admin/trends/page.tsx` — list view.
- `mynclex/app/(app)/admin/trends/new/page.tsx` — minimal create form
  (kind + title); redirects to editor on success.
- `mynclex/app/(app)/admin/trends/[trend_id]/page.tsx` — server
  component that gates + fetches + mounts `<TrendEditor surface=
  'admin'>`.
- Three tutor twin pages under `app/(app)/tutor/trends/`.

### Files modified

- `mynclex/lib/bank/classifications.ts` — added `TREND_ID_PREFIX =
  'NCLEX_TRD_'` and `TUTOR_TREND_ID_PREFIX = 'NCLEX_TUT_TRD_'`
  alongside the existing case prefixes.
- `mynclex/db/schema.sql` — appended a dated "Added 2026-04-24 in
  Slice 1.12a" section with both CREATE TABLEs.
- `mynclex/db/rls.sql` — appended parallel dated section with RLS
  enables + policies.
- `mynclex/app/dashboards.css` — appended a new `.tr-*` block
  (~410 lines) mirroring the `.cs-*` block's conventions.
- `mynclex/app/(app)/admin/bank/page.tsx` +
  `mynclex/app/(app)/tutor/bank/page.tsx` — added a "Trend datasets →"
  card alongside the existing "Case Studies →" card.

### Files NOT modified (explicitly)

- `mynclex/lib/bank/editors/`, `mynclex/lib/bank/parsers/`,
  `mynclex/lib/bank/question-authoring-panel.tsx` — no attached
  questions in 1.12a.
- `mynclex/lib/bank/case-study/**` — reference pattern to mirror, not
  to modify.
- `mynclex/docs/product-plan/bank.md` — still reflects the pre-
  revision "classification on dataset" shape. Deferred to 1.12c
  per handoff.
- `mynclex/app/landing.css`, `mynclex/db/seed_data.sql`.

### CSS hazard avoided

Initial `.tr-*` block had a comment line containing
`--danger-*/--warn-*` which the postcss parser tokenised as `*/`
prematurely closing the `/* … */` block and flooding stray
apostrophes into CSS syntax. Fixed by rewording the comment to
avoid `*/` inside comment bodies. Build failed once, then cleared.

### Verified locally

- `npx tsc --noEmit` — clean.
- `npx eslint app lib` — clean.
- `npm run build` — clean. **25 routes** (19 → 25, +6 as expected:
  `/admin/trends`, `/admin/trends/new`, `/admin/trends/[trend_id]`
  + 3 tutor twins).
- Dev Supabase state verified post-migration: 2 tables created, RLS
  enabled on both, 4 policies live, seed `NCLEX_TRD_00001` present.
- No browser test this session; Sam runs the dev worker.

### Known temporaries / deferrals

- **No `trend_id` FK on bank items** — lands in 1.12b.
- **No attached questions** — right-pane placeholder only.
- **No delete-with-attached-questions confirmation** — lands in 1.12c.
- **No transactional save RPC** — single-table update in 1.12a;
  multi-row atomic save ships with 1.12b's attached-question flow.
- **No validation panel** — lands in 1.12c.
- **Bank editor "Attach trend" dropdown** — lands in 1.12b.
- **Trend flags are author-side only** — rendered in the authoring
  UI, not intended for student runner rendering. Runner will
  suppress them (separate track).

### Next session

- **Slice 1.12b** — attached questions. Add `trend_id` FK column
  on `nclex_bank_items` + `nclex_tutor_questions`. Wire the right
  pane to a `QuestionAuthoringPanel` with a new `trend-child` mode.
  Variable pill count (unlike Case Study's fixed 6) + overflow
  scroll. Transactional save RPC `nclex_save_trend_with_children`.
  Bank editor "Attach trend" dropdown (secondary path).
- **Browser verification** — Sam to exercise dataset create / list /
  edit / delete against `NCLEX_TRD_00001` before 1.12b planning.

---

## Session — 2026-04-24 (Slice 1.12 planning — Claude Web)

Planning session for Slice 1.12 (Trend wrapper). All decisions
settled and captured in `mynclex/docs/product-plan/slice-1.12-plan.md`.

Headline shape:
- Own route `/admin/trends` + tutor twin. New table
  `nclex_trend_datasets` + nullable FK `trend_id` on
  `nclex_bank_items`. Parallel tutor tables.
- Classification lives on the question, NOT the dataset —
  avoids the Case Study wrapper-vs-child duplication.
- `kind` is freeform TEXT, doubles as template picker (5
  presets + Custom). Template is pure UI, only `kind`
  persists.
- Questions authored inside the trend editor (primary path),
  reusing all existing per-type editors and
  `QuestionAuthoringPanel`. Bank editor "Attach trend"
  dropdown is secondary path.
- Two-pane editor layout: dataset left, active question right,
  variable pill strip along the top of the right pane.
- Delete semantics: `ON DELETE RESTRICT` FK + two explicit UI
  paths (Detach-and-delete / Delete-everything) with
  typed-confirm.
- Three sub-slices: 1.12a schema + dataset editor, 1.12b
  attached questions, 1.12c delete + polish.

### Next session
- Slice 1.12a build handoff.

---

## Session — 2026-04-24 (Slice 1.11c — Preview-as-position + validation panel)

Slice 1.11c lands the last piece of the Case Study authoring
trilogy. A curator working in the case editor can now (a) preview
the chart as a student would see it at any of the six question
positions via a segmented `[Off][1][2][3][4][5][6]` control in the
chart header, and (b) run a client-side validation check via a new
topbar `Validate` button that opens a dismissible panel listing
errors and warnings with a summary header.

Zero schema changes. Zero server-action changes. The server-side
RPC from 1.11b remains the enforcement layer — the panel is early
feedback for the curator, not a replacement.

### Locked decisions (settled 2026-04-24 via Claude Web)

1. **Filtered-out entries render greyed-out with a label** —
   `"hidden until Q{visible_from}"` — rather than disappearing.
   The curator still needs to see what they authored during
   preview.
2. **Two severities — Errors and Warnings.** Errors block publish;
   warnings are advisory. Each rule carries a `'error' | 'warning'`
   tag and renders in the same panel with distinct styling.
3. **Manual Validate only.** Never auto-runs on Save. Save behaves
   exactly as before.
4. **Preview state is per-session.** React state only. No URL, no
   localStorage. Reloading resets to Off.
5. **Preview affects the chart only.** Tab rail, right-hand slot
   pane, metadata accordions, and topbar are unaffected.

### Validation rules shipped

*Errors (block publish when `is_published = TRUE`):*

- `case.title.missing` — case title empty.
- `case.summary.missing` — scenario summary empty.
- `case.tabs.zero` — zero tabs on the case.
- `case.slots.underfilled_on_publish` — publishing but fewer than
  6 slots populated (`isSlotPopulated` = stem-based, mirrors the
  server's definition).
- `slot.stem.missing` — populated slot (by intent: stem OR cjmm
  set) has empty stem.
- `slot.type.missing` — populated slot has no `question_type`.
- `slot.cjmm.missing` — populated slot has no CJMM step.

*Warnings (advisory):*

- `tab.no_entries` — tab has zero entries.
- `tab.no_q1_entry` — tab has entries but none with
  `visible_from = 1` (empty tab at Q1).
- `case.slots.underfilled_on_draft` — draft with fewer than 6
  populated slots; suppressed when `is_published = TRUE`
  (promoted to the matching error).

*Panel header logic:*

- `is_published = TRUE` + 0 errors → `Ready to publish` (green).
- `is_published = TRUE` + >0 errors → `N errors, M warnings — not
  ready` (red).
- `is_published = FALSE` → `Draft — N errors, M warnings`
  (neutral).

### Architectural notes

- **Two definitions of "populated" in the validator.** Tight =
  `isSlotPopulated(draft)` (stem-based, matches server). Loose =
  `slotHasIntent(draft, cjmm)` (stem OR cjmm set). The publish-
  count gate uses the tight definition so the client warning
  matches what the server actually rejects. The slot-level error
  rules use the loose definition so `slot.stem.missing` fires
  meaningfully — "curator clicked Q3, picked CJMM, forgot stem"
  is exactly the kind of authoring slip this panel should catch.
  Both helpers documented in `validation.ts` header.
- **Case header fields are DOM-read at Validate time.** The case
  header form is uncontrolled (defaultValue-driven), so title /
  summary / is_published live in the DOM until Save. The Validate
  click reads them via `new FormData(document.getElementById
  ('cs-case-form'))` so unsaved edits show up in validation
  immediately.
- **Active slot snapshot same pattern as onSaveCase.** Validate
  snapshots the active slot's in-flight edits via
  `parseSlotFormData` + `slotFormRef` before running. Without
  this, the curator who types a stem, clicks Validate (never
  clicked another slot first) would see stale
  `slotDrafts[activeSlot]` and a misleading
  `slot.stem.missing`. Anti-drift rule: any future client-side
  read of slot state across state hooks must reuse this
  snapshot pattern.
- **Panel is anchored to `.cs-editor-frame`.** `position: absolute`
  under the topbar, `top: 56px; right: 16px`. Max-width 440px.
  Frame gets `position: relative` so this anchors correctly.
- **`cs-chart-section` is NOT `position: relative`** (earlier
  draft had it; reverted — the panel overlays the whole editor,
  not the chart). No regressions expected since nothing else
  anchored to `cs-chart-section`.

### Files created

- `mynclex/lib/bank/case-study/validation.ts` — all types (`Severity`,
  `ValidationIssue`, `CaseEditorState` + sub-shapes), the `RULES`
  array, `validateCase()` runner, `summarise()` panel-header helper.
  Pure module — no React, no DOM, no fetch. Grep-friendly flat rule
  array.

### Files modified

- `mynclex/lib/bank/case-study/editor.tsx` — adds `previewPosition`
  state + segmented control in chart header + banner above chart
  when preview active. Adds `validationIssues` state +
  `buildValidatorState()` DOM-snapshot helper + `onValidateClick`
  toggler + `ValidationPanel` component at file bottom + topbar
  Validate button between Cancel and Save. Disabled stub button
  from 1.11a fully removed.
- `mynclex/lib/bank/case-study/narrative-tab.tsx` — accepts
  `previewPosition: number | null`; entry cards gain
  `cs-entry--hidden` class + inline "hidden until Qx" label when
  `visible_from > previewPosition`.
- `mynclex/lib/bank/case-study/structured-tab.tsx` — same treatment
  for table rows.
- `mynclex/app/dashboards.css` — appends a Slice 1.11c block:
  `.cs-preview-toggle` + `.is-active` variant, `.cs-preview-bar`,
  `.cs-entry--hidden` + `.cs-entry-hidden-label`, and the
  `.cs-validate-panel*` family (summary variants is-ready /
  is-blocked / is-draft, issue variants is-error / is-warning,
  close button, list layout). Frame receives `position: relative`
  for the panel anchor.
- `mynclex/docs/product-plan/slice-1.11-plan.md` — the 1.11c
  section was replaced with the locked-decisions version in the
  plan-doc commit that preceded the code commit.

### Files NOT modified (explicitly)

- `mynclex/db/**` — zero schema changes. No migration, no
  `schema.sql`, no `rls.sql`, no seed file touched.
- `mynclex/lib/bank/case-study/actions.ts` — server-action
  surface unchanged. The RPC already enforces publish-gating.
- `mynclex/lib/bank/editors/` — per-type editors untouched.
- `mynclex/lib/bank/question-authoring-panel.tsx` — unchanged.
  The validator reads slot state from the case editor's state,
  not from the panel.
- `mynclex/app/(app)/admin/bank/slot-parser.ts` —
  `parseSlotFormData` and `isSlotPopulated` reused; no changes.

### Verified locally

- `npx tsc --noEmit` — clean.
- `npx eslint app lib` — clean.
- `npm run build` — clean. 19 routes (same as 1.11b).
- No browser test this session; Sam runs the dev worker to verify.

### Known deferrals / non-goals (unchanged from plan)

- Server-side validation changes. RPC from 1.11b remains the
  enforcement layer.
- Auto-running validation on Save. Save never calls `validateCase`.
- The "Clear slot" button (1.11b loose end) — still out of scope.
- The case-wrapper accordion rename (1.11b loose end) — still
  out of scope.
- Plan-doc decision 9 reversal reconciliation elsewhere in the
  plan doc — the 1.11c section is updated; sweep across other
  sections still deferred.

### Next session

- **Student runner** — fully unblocked now that Case Study
  authoring is production-ready. Case runner can consume real
  case shells + tabs + slot rows + per-slot CJMM.
- **Slice 1.12 Trend wrapper** — the next authoring slice;
  reuses the wrapper pattern 1.11a-c established.
- **`?focus=` slot auto-open** — small polish; admin/tutor bank
  list redirects case-linked edits to
  `/admin/bank/cases/[case_id]?focus=[item_id]` but the editor
  doesn't honour it on mount.
- **Plan-doc sweep** — reconcile `slice-1.11-plan.md` decision 9
  reversal across any other sections that still say
  `is_builder_visible = FALSE` on case-linked items.

---

## Session — 2026-04-24 (Slice 1.11b — Case Study child-question authoring)

Slice 1.11b lands the right-half of the Case Study editor. A curator
can now open a case at `/admin/bank/cases/[case_id]` (or the tutor
twin), pick a Q1-Q6 pill to open a slot, assign its CJMM step, and
author the full question via the shared `QuestionAuthoringPanel`.
Save case runs as a single transaction via a new Postgres function —
case header + six slot rows + six join rows land together or none
do. Clicking "Save case" rolls up all six slot drafts, snapshots the
active slot's in-flight FormData, and submits one payload.

**Plan-doc decision 9 reversed.** `mynclex/docs/product-plan/slice-1.11-plan.md`
still says case-linked items should carry `is_builder_visible = FALSE`.
This slice inverts that — case-linked children are now
`is_builder_visible = TRUE` and the standalone vs case-package split
is drawn via `parent_case_id IS NULL` instead. Rationale: the old
flag was conflating "is this content valid" with "can the student
select it stand-alone" — two different questions. Future readers of
the plan doc should trust this SESSIONS entry + the 1.11b handoff,
not the plan doc line. Plan-doc cleanup deferred to next plan-doc
pass.

### Architectural decisions (confirmed before execution)

1. **Prefix prop on per-type editors.** All nine editors in
   `lib/bank/editors/` accept `fieldPrefix?: string = ''` and
   produce prefixed `name=` attributes via a single canonical
   helper — `mynclex/lib/bank/field-prefix.ts`'s `makePrefixer()`.
   No prefix logic duplicated into individual editors. Standalone
   callers pass `''` → identity function, zero behaviour change.
2. **Typed drafts via parseSlotFormData.** New file at
   `mynclex/app/(app)/admin/bank/slot-parser.ts` (adjacent to
   `parseFormData` in `actions.ts` as an anti-drift measure).
   Reads prefixed FormData → returns a `BankFormInitial`. Used by
   the case editor to snapshot the active slot on slot-switch and
   on save so in-flight edits survive unmount / remount.
3. **Transactional save via single Postgres RPC.** First
   multi-row atomic pattern in the repo — flagged as a new
   pattern in the migration's header comment.
4. **Case wrapper accordions untouched.** Left-half labels still
   read "Content / Classification / Housekeeping" — same labels
   as the new right-half panel's accordions. Accepted temporary;
   rename pass is a later slice.
5. **Per-type editors' stem DOM-ID kept.** Only one slot panel
   mounts at a time, so `document.getElementById('bank-stem')` in
   Cloze / Highlight / Drag-drop doesn't collide. If a future
   slice needs multiple panels on-screen simultaneously, the rule
   stays: stop and flag rather than silently rewrite stem access.

### Files created

- `mynclex/lib/bank/field-prefix.ts` — `makePrefixer()`, the one
  prefix helper shared by panel + all nine editors.
- `mynclex/lib/bank/question-authoring-panel.tsx` — (already in
  Phase 2, now accepts mode + fieldPrefix as live props).
- `mynclex/app/(app)/admin/bank/slot-parser.ts` — `parseSlotFormData`.
  Marked as the inverse of `parseFormData`; drift-trap comment at
  top of the file.
- `mynclex/app/(app)/admin/bank/initial-to-parsed.ts` —
  `initialToParsedItem`, converts a `BankFormInitial` draft to the
  JSONB shape the RPC expects. Shares `parseByType` with
  `parseFormData`, so validation stays consistent between
  standalone bank saves and case-linked saves.
- `mynclex/lib/bank/case-study/slot-loader.ts` — server-side loader
  that reads the six join rows + the linked bank items for a case
  and builds a `CaseStudySlotRow[]` via `rowToInitial`.
- `mynclex/db/migrations/mynclex_parent_case_id_slice_1_11b.sql`
  — Phase 1; adds `parent_case_id` + partial index to
  `nclex_bank_items` and `nclex_tutor_questions`.
- `mynclex/db/migrations/mynclex_case_save_rpc_slice_1_11b.sql`
  — Phase 4; creates `nclex_save_case_with_children(surface, case_id,
  case_patch, slots)` RPC. ~360 lines; branches admin / tutor
  internally; generates item_ids for new slots; upserts case header
  + question rows + join rows atomically; validates publish gate.
- `mynclex/db/migrations/mynclex_case_study_items_rls_slice_1_11b.sql`
  — Phase 5; enables RLS on both join tables and adds the four
  policies (admin read-published + BANK_CURATE curate; tutor
  owner-own + SUPER_ADMIN bypass).

### Files modified

- All nine per-type editors in `mynclex/lib/bank/editors/` — added
  `fieldPrefix?: string = ''` prop, use `makePrefixer` helper.
  Sub-components (WingPanel, HiddenSerialisers, BlankCard) pass
  prefix through and create their own prefixer local.
- `mynclex/lib/bank/question-authoring-panel.tsx` — uses
  `makePrefixer` (dropped inline fn declaration); passes
  `fieldPrefix` to every per-type editor it mounts.
- `mynclex/lib/bank/classifications.ts` — added `CJMM_STEPS` + the
  `CjmmStep` string-literal union. Kept in sync with the CHECK
  constraint on `nclex_case_study_items.cjmm_step`.
- `mynclex/lib/bank/case-study/types.ts` — added
  `CaseStudySlotRow`; extended `CaseStudyEditorInitial` with a
  `slots: CaseStudySlotRow[]` field (always length 6, indexed by
  position 1-6).
- `mynclex/lib/bank/case-study/editor.tsx` — replaced the 1.11a
  placeholder right-half with a live `QuestionNavigator` +
  CJMM-step `<select>` + `<QuestionAuthoringPanel mode="case-child"
  fieldPrefix="q{N}_">`. Added `slotDrafts` / `slotCjmm` /
  `activeSlot` state + `slotFormRef` for snapshot capture. Save
  handler snapshots the active slot + serialises the 6-element
  payload as `slots_json` before calling `updateCaseAction`.
- `mynclex/lib/bank/case-study/actions.ts` — `updateCaseAction`
  now builds a `case_patch` JSONB + validates + parses each slot
  via `initialToParsedItem`, then invokes the RPC. Early-rejects
  a publish attempt if any slot is empty.
- `mynclex/lib/bank/list-view.tsx` — `FullBankRow` gains
  `parent_case_id: string | null`.
- `mynclex/app/(app)/admin/bank/cases/[case_id]/page.tsx`
  + `mynclex/app/(app)/tutor/bank/cases/[case_id]/page.tsx` —
  fetch slots via `loadCaseSlots` and pass through to the editor.
- `mynclex/app/(app)/admin/bank/page.tsx`
  + `mynclex/app/(app)/tutor/bank/page.tsx` — bank browse list
  excludes case-linked items via `.is('parent_case_id', null)`.
  Edit-mode load detects `parent_case_id` on the row and redirects
  to `/admin/bank/cases/[case_id]?focus=[item_id]` (or tutor twin).
  Satisfies the 1.11b non-negotiable that a case-linked item
  cannot open in the standalone editor.
- `mynclex/app/(app)/admin/bank/editor-shell.tsx` — Phase 2 only
  (unchanged in Phase 3+); keeps the page-level form + topbar +
  server-action wiring and delegates the body to
  `QuestionAuthoringPanel`.
- `mynclex/db/schema.sql` — `parent_case_id` column + partial
  index back-ported to both `CREATE TABLE` blocks.
- `mynclex/db/rls.sql` — case-study-items policies back-ported.
- `mynclex/db/seed-cases-dev.sql` — appended three child questions
  on `NCLEX_CS_00001` at positions 1 / 2 / 3 (MCQ, MCQ, SATA) +
  the matching join rows. Positions 4-6 left empty so the
  empty-slot "+" pills are visible in the editor.
- `mynclex/app/dashboards.css` — updated `.cs-q-*` block for the
  interactive pill strip (active highlight, filled vs empty
  states, hover) and added `.cs-q-meta` (CJMM dropdown) +
  `.cs-q-empty` (no-slot-open panel). Dropped the old
  placeholder-specific styles.

### Files NOT modified (explicitly)

- `mynclex/lib/bank/parsers/` — per-type parser files untouched.
  `parseByType` stays the canonical validator for both
  `parseFormData` (standalone bank) and `initialToParsedItem`
  (case-child).
- Case wrapper's three accordions on the left half — left as-is;
  rename is deferred.
- `mynclex/lib/bank/case-study/tab-rail.tsx`,
  `narrative-tab.tsx`, `structured-tab.tsx`, `vf-segmented.tsx` —
  all 1.11a work, unchanged.
- `mynclex/docs/product-plan/slice-1.11-plan.md` — the stale
  decision 9 stays in the doc. See plan-doc reversal note above.

### Migrations + data applied to dev (`zrakjibtxyzoqcdtvpmq`)

- `mynclex_parent_case_id_slice_1_11b` — Phase 1. `parent_case_id`
  TEXT NULL + partial index on each of `nclex_bank_items` and
  `nclex_tutor_questions`.
- `mynclex_case_save_rpc_slice_1_11b` — Phase 4. The RPC. Verified
  via `pg_proc`: `pronargs = 4`.
- `mynclex_case_study_items_rls_slice_1_11b` — Phase 5. RLS
  enabled on both join tables, 2 policies each. Verified via
  `pg_class.relrowsecurity` + `pg_policies`.
- Seed rows: `NCLEX_MCQ_90001` / `NCLEX_MCQ_90002` /
  `NCLEX_SATA_90001` in `nclex_bank_items` (all with
  `parent_case_id = 'NCLEX_CS_00001'`, `is_builder_visible = TRUE`)
  + three matching rows in `nclex_case_study_items` at positions
  1 / 2 / 3 with the expected CJMM steps.

### Verified locally

- `npx tsc --noEmit` — clean.
- `npx eslint app lib` — clean.
- `npm run build` — clean. 19 routes, same as pre-slice.
- No browser test this session; Sam runs the dev worker.

### Known temporaries / deferrals

- **Accordion-label duplication** — "Content / Classification /
  Housekeeping" appears twice on the case editor (left: case
  wrapper, right: active slot). Cleanup scoped to a later slice.
- **Per-type editors stay FormData-driven** — the long-deferred
  conversion to controlled `value` / `onChange` components is
  still parked. Will likely surface when the student runner
  starts consuming bank items.
- **Preview-as-position button** — the disabled stub in the chart
  section still says "Slice 1.11c". That slice ships the in-editor
  student-view preview.
- **`?focus=` query param** — the admin/tutor bank list redirects
  case-linked edits to `/admin/bank/cases/[case_id]?focus=[item_id]`
  but the case editor doesn't yet open that slot on mount. Polish
  item for a follow-up.
- **Plan-doc hygiene** — `slice-1.11-plan.md` decision 9 still
  says `is_builder_visible = FALSE` on case-linked items. See the
  reversal note above. Plan doc gets refreshed in a later pass.

### Next session

- **Slice 1.11c** — preview-as-position, student-view in-editor.
- **Student runner** — unblocked by 1.11b; case runner now has
  real slots + join rows to consume.
- **`?focus=` slot auto-open** — small polish item; the link
  exists but the target page doesn't yet honour it.
- **Plan-doc sweep** — reconcile slice-1.11-plan.md with what
  1.11b actually shipped (decision 9 reversal + any others we
  encounter).

---

## Session — 2026-04-23 (Slice 1.11a fix — reorder CHECK constraint)

One-line: dropped `CHECK (display_order >= 0)` from both case-study
tab tables to unblock reorderTabsAction's negate-then-set swap.

Triggered by Sam's browser verification of 1.11a on dev — reorder
button hit `violates check constraint`.

### Files created
- `mynclex/db/migrations/mynclex_case_study_tabs_display_order_fix.sql`

### Files modified
- `mynclex/db/schema.sql` — removed `CHECK (display_order >= 0)`
  from `nclex_case_study_tabs` and `nclex_tutor_case_study_tabs`
  definitions.

### Database
- Dropped `nclex_case_study_tabs_display_order_check` from
  `nclex_case_study_tabs` (dev).
- Dropped `nclex_tutor_case_study_tabs_display_order_check` from
  `nclex_tutor_case_study_tabs` (dev).
- Prod catches up when the new migration is applied.

### Not done
- Prod is untouched. Sam runs the migration there when 1.11 lands
  as a whole.
- reorderTabsAction itself unchanged — the fix is at the schema
  layer, not the code layer.

### Next
- Sam resumes 1.11a verification checklist (Section G onwards).

---

## Session — 2026-04-22 (Slice 1.11a — Case Study case shell + tab authoring)

First of three Case Study sub-slices lands. A curator can now create
a named case study, add tabs (built-in or custom), fill entries with
`visible_from`, save, and list cases on both `/admin/bank/cases` and
`/tutor/bank/cases`. The 6 question slots on the right half of the
desktop split are a 1.11b placeholder — dashed-border pane, no
interactions.

Planning + handoff docs (`slice-1.11-plan.md`, `slice-1.11a-build-handoff.md`,
`mockups/case-study-editor-mockup.html`) landed in the repo at the
start of the session so Phase 0 had authoritative references to work
from.

### Decisions (locked before execution)

From the handoff doc, plus one clarification:

1. Custom tabs use `tab_key` = `'custom_narrative'` | `'custom_grid'`.
   Resolves a minor conflict between the handoff (two-key convention)
   and the mockup edge-case 6 (single `'custom'`). Two keys make the
   editor's renderer lookup one-step.
2. Flexible tab schema replaces the 6 hardcoded JSONB tab columns on
   both case tables.
3. Built-in tab types hardcoded in `lib/bank/case-study/tab-types.ts`
   — no DB registry.
4. Split-pane layout ≥ 900px, single-column below. Draggable divider,
   localStorage persists last width.
5. Case editor mounts its OWN shell (`lib/bank/case-study/editor.tsx`)
   — does NOT route through the bank's `EditorShell`.
6. Tab edits fire per-tab `upsertTabAction` / `deleteTabAction` calls,
   independent of case-header dirty state. Header saves via
   `updateCaseAction`.

### Phase 0 discrepancies found

- `slice-1.11-plan.md`, `slice-1.11a-build-handoff.md`, and the
  mockup HTML were NOT in the repo at session start. Sam pasted all
  three via the Downloads folder; Claude copied them into
  `mynclex/docs/product-plan/` (mockup into `mockups/`).
- `is_published` already present on both `nclex_case_studies` and
  `nclex_tutor_case_studies` from Slice 1 — handoff said "add if
  missing", confirmed already there, skipped the `ADD COLUMN`.
- No TS/TSX references to the 6 JSONB columns being dropped. Grep
  found them only in schema/docs. Safe to drop.
- `/admin/bank` has no existing section-card strip (unlike `/admin`).
  Handoff said "Match the section-card pattern already used on /admin
  and /admin/bank" — resolved by adding a `headerExtra` prop to
  `BankListView` and plugging a "Case Studies →" link into the
  browse-mode header on both `/admin/bank` and `/tutor/bank`.

### Files created

- `mynclex/db/migrations/mynclex_case_study_tabs_slice_1_11a.sql`
  — first tracked migration file in `mynclex/db/migrations/`. Drops
  6 columns × 2 tables, creates 2 child tab tables + 2 indexes.
- `mynclex/lib/bank/case-study/tab-types.ts` — hardcoded registry
  of the 6 built-ins + custom-tab discriminator helpers.
- `mynclex/lib/bank/case-study/types.ts` — `CaseStudyRow`,
  `CaseStudyTabRow`, `CaseStudyEntry`, `CaseStudyEditorInitial`, VF
  + grid-column bounds.
- `mynclex/lib/bank/case-study/actions.ts` — surface-aware server
  actions. Shape mirrors `app/(app)/admin/bank/actions.ts`:
  `surfaceConfig()`, `readSurface()`, `requireCaseCurator()`,
  `nextCaseId()`, `nextTabId()`, `createCaseAction`,
  `updateCaseAction`, `deleteCaseAction`, `upsertTabAction`,
  `deleteTabAction`, `reorderTabsAction`. Reorder uses a two-pass
  negate-then-set shift to dodge the UNIQUE (case_id, display_order)
  constraint mid-swap.
- `mynclex/lib/bank/case-study/vf-segmented.tsx` — visible-from
  1-6 segmented control, shared by both tab editors.
- `mynclex/lib/bank/case-study/narrative-tab.tsx` — stacked-cards
  editor used by built-in narrative tabs (nurses_notes / orders /
  history / diagnostics) and custom_narrative.
- `mynclex/lib/bank/case-study/structured-tab.tsx` — table editor
  used by built-in structured tabs (vital_signs / lab_results) and
  custom_grid. Embeds the ColumnBuilder pill row when rendering
  custom_grid.
- `mynclex/lib/bank/case-study/tab-rail.tsx` — left rail +
  AddTabPopover (built-ins with "Already added" disabled state;
  custom flow with name + Free text / Rows & columns shape picker).
- `mynclex/lib/bank/case-study/editor.tsx` — top-level
  `CaseStudyEditor` shell: sticky topbar, three `<details>`
  accordions (Content open, Classification, Housekeeping), split
  layout with draggable divider (localStorage persist), tab rail +
  active-tab editor, right-pane Q1-Q6 placeholder for 1.11b.
- `mynclex/app/(app)/admin/bank/cases/page.tsx` — admin cases list.
- `mynclex/app/(app)/admin/bank/cases/[case_id]/page.tsx` — admin
  case editor server wrapper.
- `mynclex/app/(app)/tutor/bank/cases/page.tsx` — tutor cases list.
- `mynclex/app/(app)/tutor/bank/cases/[case_id]/page.tsx` — tutor
  case editor server wrapper.
- `mynclex/db/seed-cases-dev.sql` — `NCLEX_CS_00001` demo case with
  three tabs (nurses_notes × 2 entries, vital_signs × 3 entries,
  custom_grid "Intake & Output" × 2 entries + 5 curator columns).
- `mynclex/docs/product-plan/slice-1.11-plan.md`,
  `mynclex/docs/product-plan/slice-1.11a-build-handoff.md`,
  `mynclex/docs/product-plan/mockups/case-study-editor-mockup.html`
  — reference docs pasted in at session start.

### Files modified

- `mynclex/db/schema.sql` — dropped 6 JSONB tab columns from both
  case tables; inserted `nclex_case_study_tabs` (as 6b, after the
  admin items join) and `nclex_tutor_case_study_tabs` (as 10b,
  after the tutor items join). Each table + its btree index.
- `mynclex/db/rls.sql` — enabled RLS + 8 policies across the 4
  case-related tables. Admin cases + tabs: published-visibility for
  any authenticated user; `BANK_CURATE` (which short-circuits on
  `SUPER_ADMIN` via the existing helper) for full CRUD. Tutor cases
  + tabs: `tutor_id = auth.uid()` for full CRUD; `SUPER_ADMIN`
  bypass. Tutor tab policy chases parent case's tutor_id via
  EXISTS.
- `mynclex/lib/bank/classifications.ts` — added `CASE_ID_PREFIX` =
  `'NCLEX_CS_'` and `TUTOR_CASE_ID_PREFIX` = `'NCLEX_TUT_CS_'`
  constants alongside the question-type prefix maps.
- `mynclex/lib/bank/list-view.tsx` — new optional
  `headerExtra?: ReactNode` prop rendered inline in the browse-mode
  header. Zero behaviour change when the prop is absent.
- `mynclex/app/(app)/admin/bank/page.tsx` — `headerExtra` plugged
  with "Case Studies →" link to `/admin/bank/cases`.
- `mynclex/app/(app)/tutor/bank/page.tsx` — same link to
  `/tutor/bank/cases`.
- `mynclex/app/dashboards.css` — appended `.cs-*` block (~650
  lines) for every case-study class: editor frame, sticky topbar,
  split frame + draggable divider, three accordions, chart section,
  tab rail with reorder arrows + custom badge, entries pane,
  structured table, narrative cards, VF segmented control, column
  builder pills, add-tab popover + shape picker, 1.11b right-pane
  placeholder, list page table + pills + banner, and a small
  header-extra wrapper for the bank browse header.

### Files NOT modified (explicitly)

- Every file under `mynclex/lib/bank/editors/` — the 9 per-type
  editors are untouched. Case Study wraps them in 1.11b.
- Every file under `mynclex/lib/bank/parsers/`.
- `mynclex/lib/bank/types.ts` — case-study types stay in
  `lib/bank/case-study/types.ts`.
- `mynclex/lib/bank/form-shape.ts` — that's bank-item form shape,
  not the case shape.
- `mynclex/app/(app)/admin/bank/editor-shell.tsx` and `actions.ts`
  — unchanged. Case Study does NOT mount through the bank's shell.
- `mynclex/app/landing.css` — landing page untouched.

### Migrations + data applied to dev (`zrakjibtxyzoqcdtvpmq`)

- `mynclex_case_study_tabs_slice_1_11a` — `{"success":true}`. 6
  `DROP COLUMN`s × 2 tables clean; both tab tables + both indexes
  present; defaults + nullability match.
- `mynclex_case_study_rls_slice_1_11a` — `{"success":true}`. 8
  policies present across the 4 case tables, verified via
  `pg_policies` query.
- `seed-cases-dev.sql` applied inline — `NCLEX_CS_00001` + 3 tabs
  (entry_count 2/3/2, column_count 0/0/5) verified via SELECT.

### Verified locally

- `npx tsc --noEmit` — clean.
- `npx eslint app lib` — clean after two fix rounds. First pass
  surfaced 12 errors from React 19 / compiler lint rules:
  setState-in-effect (×5), ref mutation during render (×1),
  access-before-declared (×1), unescaped-entities (×3), plus 2
  narrow-tab setState-in-effect. Fixes:
  - Narrative/structured tab error clear: moved into each mutator
    inline (no effect).
  - Editor draft sync: replaced mount-effect + tabsSorted sync
    with a derived `drafts` map from `tabsSorted` + an
    `draftOverrides` state.
  - Editor active-tab reset: moved from effect to during-render
    conditional setState (React-documented pattern).
  - Editor header-dirty reset: folded into `onSaveCase`'s success
    branch.
  - Editor category cascade: replaced effect-based sync with
    during-render compare-prev-prop pattern.
  - Editor split drag: removed `useCallback` handlers + ref
    mutation. Replaced with inline closures created per-drag, so
    `onMove` / `onUp` share closure state (startX, startPct,
    lastPct) directly.
  - Editor localStorage init: kept in effect with a single
    `eslint-disable-next-line react-hooks/set-state-in-effect`
    (intentional external-state sync; the only alternative is to
    risk a hydration mismatch).
- `npm run build` (webpack) — clean. 19 routes total, 4 new:
  `/admin/bank/cases`, `/admin/bank/cases/[case_id]`, tutor twins.
  All existing routes still compile.
- Did NOT browser-test end-to-end. Sam runs dev worker.

### Deferred to future sessions / out of scope here

- **Slice 1.11b — 6 question slots.** Right-half navigator +
  nested per-type editor + `parent_case_id` column on bank_items
  and tutor_questions + transactional save of header + children.
- **Slice 1.11c — Preview-as-position + validation polish.** The
  editor has a disabled "Preview as student · position 1" stub
  button reserved for this.
- **Reorder tabs via drag-and-drop.** Up/down arrows only in v1,
  matches curriculum editor convention.
- **Image attachments on chart entries.** Same deferral as bank
  items — image upload pipeline isn't wired yet.
- **Typed flag column for Lab Results.** Currently free text so
  non-numeric lab values work ("positive", "sinus rhythm").
- **Tutor cross-linking.** Tutor case studies link only tutor
  questions, not admin. Confirmed in plan decision 11.

### Next session

Options:
- **Slice 1.11b** — the 6 question slots, now unblocked.
- **Student runner** — still unblocked from Slice 1.10; case
  runner is blocked on 1.11b.
- **UX polish pass** — Sam's verification on dev may surface
  small pain points in the tab authoring surface.

---

## Session — 2026-04-22 (Planning — Trend promoted to v1)

No code written. Single-decision entry: Trend items promoted from
v2 (deferred) to v1 (queued for build after Case Study).

### Decision

Sam reviewed the Case Study vs Trend scope during close-out of the
Slice 1.10 session. Reasoning:

- Case Study is architecturally harder than Trend (new table + join
  table + 6 JSONB chart tabs + progressive-unfold rendering vs
  Trend's single new table + nullable FK).
- Trend reuses the wrapper pattern Case Study will establish.
- The Trend shape is already fully spec'd from the 22 April planning
  session (`bank.md § Trend items — planned shape`, plus the
  `mockups/trend-visualisation.html` mockup).
- Marginal build cost for Trend on top of Case Study is smaller
  than building it as an isolated v2 project later.

### Files modified

- `mynclex/docs/product-plan/main.md` — removed Trend from the
  "Deferred (v2 or later)" list.
- `mynclex/docs/product-plan/bank.md` — updated the question-types
  table note ("TREND is a wrapper, not a standalone type"), renamed
  the Trend section (dropped `(v2)` qualifier), added a promotion
  paragraph, and updated the "Decisions not yet settled" cross-
  reference to drop the v2 wording.
- `mynclex/docs/product-plan/mockups/trend-visualisation.html` —
  doc-meta, "Why deferred" section heading, callout update paragraph,
  and footer all updated to reflect v1 promotion.

### Files NOT modified

- `mynclex/db/schema.sql` — no schema changes; Trend schema comes
  with Slice 1.12.
- `mynclex/db/rls.sql` — no RLS changes.
- Every file under `mynclex/lib/bank/` and `mynclex/app/(app)/` —
  zero code changes.

### Verified

- Nothing to run. Documentation-only session.

### Next session

Start Slice 1.11 — Case Study wrapper planning. Open question at
that session's start: do we split Slice 1.11 into 1.11a/1.11b/1.11c
(schema + editor shell / item picker / chart tabs) or attempt as
one slice? Sam + Claude decide based on scope read after first
round of discussion.

---

## Session — 2026-04-22 (Slice 1.10 — Drag-drop authoring)

Ninth and last standalone question type lands. With DRAG_DROP live,
all 9 types are authorable end-to-end on both `/admin/bank` and
`/tutor/bank` — only the case-study wrapper (Slice 1.11) and the
student runner remain before Family B is complete.

Both subtypes — ORDERED (ranked positions) and SENTENCE (inline `[N]`
markers in the stem) — share one JSONB shape discriminated by
`content.subtype`. Slice 2.1's surface plumbing carried the tutor
side for free: zero files touched under `/tutor/bank`, and the tutor
prefix `NCLEX_TUT_DD_` is wired via `TUTOR_ITEM_ID_PREFIX`.

### Decisions (locked before execution)

Structural (locked in earlier planning):
1. Two subtypes via `content.subtype` = `'ORDERED'` | `'SENTENCE'`.
2. Curator picks pool size per question; distractors allowed.
3. Each token fills at most one slot — no reuse.
4. Slot bounds 3–8.
5. Token bounds N to min(N+4, 12) where N = active slot count.
6. Feedback granularity: per-slot, optional (sparse map).
7. Slot IDs `s1, s2, …` (position-based).
8. Token IDs `t1, t2, …`.
9. Answer shape `correct.slots = { s1: "t3", ... }`.

Locked via mockup on 2026-04-22:

10. Sentence marker syntax `[N]` — positive integer in single square
    brackets. Shared regex `/\[(\d+)\]/g` in editor + parser.
11. Pool size rule: `tokens.length >= slots.length AND tokens.length
    <= min(slots.length + 4, 12)`.

Implementation calls:

12. Curator slot-assignment via `<select>` per slot (dropdown + `—
    none —` default). No DnD inside the curator; student runner
    will handle drag interactivity.
13. Subtype switch mid-edit: `window.confirm()` prompt, then reset
    slots + tokens. Stem text is preserved (curator may want to keep
    the sentence), but orphan slot cards would be meaningless after
    a subtype flip so they go.

Standing conventions:

14. Item-ID prefixes: `NCLEX_DD_` (admin), `NCLEX_TUT_DD_` (tutor) —
    added to both `ITEM_ID_PREFIX` and `TUTOR_ITEM_ID_PREFIX`.
15. Instruction field inherited via shell (Slice 1.8). No per-editor
    handling.
16. Tutor surface inherits automatically via Slice 2.1 plumbing.
17. `VALID_TYPES` drift point — added `'DRAG_DROP'` first before any
    other actions.ts change.

### Phase 0 discrepancies found

- Drag-drop mockup wasn't in-repo (Sam provided on desktop). Copied
  into `mynclex/docs/product-plan/mockups/drag-drop-editor-mockup.html`
  so bank.md + CSS references resolve.
- `rowToInitial()` now lives in `mynclex/lib/bank/list-view.tsx`
  (moved by Slice 2.1). Handoff said `app/(app)/admin/bank/page.tsx`;
  added the DRAG_DROP branch + `dd_*` fields in list-view.tsx
  instead.
- `types.ts` was missing the DragDrop shapes — added
  `DragDropContent` + `DragDropCorrect` and extended `BankItemContent`
  / `BankItemCorrect` unions. Parent interfaces `DragDropSlot` +
  `DragDropToken` added for reuse.
- `parsers/index.ts` switch is exhaustive — the DRAG_DROP case was
  mandatory, not optional.

### Files created

- `mynclex/lib/bank/parsers/drag-drop.ts` — pure parser. 6 phases:
  subtype validation, SENTENCE `[N]` extraction (1..8, unique), slot
  bounds, token bounds + non-empty text, assignment validity (every
  active slot has a pool-resident token, no reuse), final shape
  build. Stem is byte-preserved.
- `mynclex/lib/bank/editors/drag-drop-editor.tsx` — client editor.
  `SubtypeRadio`, SENTENCE-only `Stem toolbar` with `+ Slot marker`
  (finds lowest free N in 1..8 and inserts at cursor via
  `document.getElementById('bank-stem')`), `SlotsEditor` + `SlotCard`
  (active vs orphan rendering, add/remove on ORDERED), `TokenPoolEditor`
  (+ Add / × Remove, min 1, hard max 12), `BoundsMeter` (ok / warn /
  err), hidden serialisers for every field. Subtype switch calls
  `window.confirm` then resets slots + tokens. Stem stays.
- `mynclex/docs/product-plan/mockups/drag-drop-editor-mockup.html` —
  copied from Sam's desktop into the repo.

### Files modified

- `mynclex/lib/bank/classifications.ts` — `QUESTION_TYPES` + both
  prefix maps + new bounds constants (`MIN_DD_SLOTS`, `MAX_DD_SLOTS`,
  `DEFAULT_DD_SLOTS`, `DD_TOKEN_POOL_MAX_OVER_SLOTS`,
  `DD_TOKEN_POOL_ABSOLUTE_MAX`, `DD_TOKEN_POOL_MIN_EXTRA`).
- `mynclex/lib/bank/types.ts` — `DragDropSlot` / `DragDropToken` /
  `DragDropContent` / `DragDropCorrect`; both unions extended.
- `mynclex/lib/bank/form-shape.ts` — `dd_subtype` / `dd_slots` /
  `dd_tokens` on `BankFormInitial`; defaults on `emptyInitial()`
  (ORDERED, 3 scaffold slots, 3 empty tokens).
- `mynclex/lib/bank/parsers/index.ts` — `DragDropSlotInput` /
  `DragDropTokenInput` imports, `dragDrop` param on dispatcher,
  `DRAG_DROP` case.
- `mynclex/app/(app)/admin/bank/actions.ts` — `'DRAG_DROP'` added
  to `VALID_TYPES` first (drift point discipline kept); 6 new
  FormData extraction lines + one `dragDrop` key passed into
  `parseByType`. Surface + role gate untouched.
- `mynclex/app/(app)/admin/bank/editor-shell.tsx` — `DragDropEditor`
  import + DRAG_DROP case in `renderEditor()`. No other changes to
  the shell.
- `mynclex/lib/bank/list-view.tsx` — new `dd_subtype` / `dd_slots` /
  `dd_tokens` locals with matching defaults; DRAG_DROP branch in
  `rowToInitial()` that reads `content.subtype` / `content.slots` /
  `content.tokens` and merges `correct.slots` + `correct.feedback`
  back into the flat card shape. Returned `BankFormInitial` now
  includes the 3 new dd_* fields.
- `mynclex/app/dashboards.css` — appended `.bank-dd-*` block (~180
  lines). Uses the project's actual tokens (`--primary`, `--accent`,
  `--border`, `--white`, `--bg`, `--text-muted`) + inline hex for
  state colours (teal-chip, amber, warn, danger) — matches the
  convention established by `.bt-*` / `.bank-cz-*` / `.bank-hl-*`.
- `mynclex/db/seed-bank-dev.sql` — appended seed rows 13 + 14.
  Row 13 (`NCLEX_DD_00001`, ORDERED, Post-op deteriorating client,
  5 slots / 6 tokens / 1 distractor, instruction populated) landed
  in the main commit; row 14 (`NCLEX_DD_00002`, SENTENCE, stroke
  recognition, 3 slots / 6 tokens / 3 distractors) was appended in
  a follow-up commit so both subtypes ship in dev.
- `mynclex/docs/product-plan/bank.md` — build-order step 7 unparked;
  Drag-drop `content` and `correct` example blocks added to the
  JSONB shape list alongside MCQ / Matrix / Bow-tie / Cloze /
  Highlight, with paragraphs explaining the two-subtype
  discriminator, pool-size rule, and no-renumber decision.

### Files NOT modified (reuse inheritance from Slice 2.1)

- All 8 existing editors in `mynclex/lib/bank/editors/`.
- All 8 existing parsers in `mynclex/lib/bank/parsers/`.
- `mynclex/app/(app)/tutor/bank/page.tsx` — zero changes. Tutor
  surface picks up DRAG_DROP via `TUTOR_ITEM_ID_PREFIX` + the
  shared actions.ts branching.
- `mynclex/app/(app)/tutor/layout.tsx`, `mynclex/app/(app)/tutor/page.tsx`.

### Migration applied to dev (`zrakjibtxyzoqcdtvpmq`)

- `mynclex_bank_dragdrop_seed_slice_1_10` — `{"success":true}`.
  Verified: subtype=ORDERED, 5 slots, 6 tokens, 5 correct mappings,
  instruction populated.

### Verified locally

- `npx tsc --noEmit` — clean.
- `npx eslint app/(app)/admin/bank lib/bank` — clean.
- `npm run build` (webpack) — clean. All 14 routes compile
  including the unchanged `/tutor/bank`.

### Verified by Sam on dev Worker

1. Smoke + list — PASS. `NCLEX_DD_00001` and `NCLEX_DD_00002`
   visible in `/admin/bank` with DRAG_DROP type pill; filter option
   works.
2. Edit round-trip ORDERED — PASS. All fields pre-fill correctly
   on `NCLEX_DD_00001`; bounds meter shows the expected counter.
3. Create ORDERED — PASS. New row saves with correct `NCLEX_DD_*`
   prefix.
4. Create SENTENCE — PASS. `+ Slot marker` button inserts `[N]` at
   cursor; subtype warn-dialog fires on switch; save round-trips.
5. Rejection cases — PASS. All 6 failure modes correctly blocked
   by editor or parser with clear messages.
6. Tutor-side smoke — PASS. `mynclextutor` authored a DRAG_DROP
   with `NCLEX_TUT_DD_*` prefix; zero tutor-side code changes
   needed. Slice 2.1's reuse architecture holds for drag-drop.

### UX observations (deferred, not blocking)

- **Drag-drop editor feels less polished than other Family B
  editors.** Sam noted during verification that the subtype toggle
  is not as conspicuous as it could be, and that the editor lacks a
  preview mode that Bow-tie, Matrix, and similar types have. The
  editor is functional — every verification phase passed — but it's
  the roughest Family B interface. Revisit after real curator use
  surfaces concrete pain points.
- **Shared-shell stem-state refactor now triples as a cost.** Three
  editors (Cloze, Highlight, Drag-drop) use
  `document.getElementById('bank-stem')` to reach the stem textarea.
  Flagged on prior slices; tripled now. Lift into shared shell
  state the next time any editor needs stem access.

### Deferred to future sessions / out of scope here

- **Slice 1.11 — case-study wrapper.** Groups 6 questions under
  shared scenario + chart tabs. Needs `nclex_case_studies` +
  `nclex_case_study_items` to be wired; tutor parallels already in
  schema.
- **Student runner** — now unblocked for all 9 types.
- **CLONING.md update** — still doesn't exist; same deferral as
  Slices 1.5–2.1.
- **Lift stem into shared shell state** — third editor to use the
  `document.getElementById('bank-stem')` pattern (Cloze / Highlight /
  Drag-drop). Worth refactoring in a standalone cleanup slice.
- **Duplicate-text-token independence** — the parser rejects two
  slots with the same assigned_token_id; if two *different* slot
  positions need independent same-text tokens, the curator must add
  two separate pool entries (`t3: "Call provider"`, `t4: "Call
  provider"`). Acceptable v1 trade-off — flagged if it bites.

### Next session

Options:
- **Slice 1.11** — case-study wrapper.
- **Student runner** — now unblocked.
- **Lift stem into shared shell state** — cleanup slice, one
  refactor touches Cloze + Highlight + Drag-drop.

---

## Session — 2026-04-22 (Slice 2.1 — Tutor-side bank authoring / reusability proof)

First slice of Bank v2 work — stand up tutor-side authoring on
`nclex_tutor_questions` without touching the 8 per-type editors, 8
parsers, `types.ts`, or `form-shape.ts`. The reusability claim made
across Slices 1.3–1.9 either lands or doesn't here. It landed.

### Decisions (locked before execution)

1. **Dual-table approach:** shared `actions.ts` with a `surface`
   parameter (Approach A). No parallel tutor actions file.
2. **ID prefix:** `NCLEX_TUT_<TYPE>_NNNNN` — e.g. `NCLEX_TUT_MCQ_00001`.
3. **Seed:** four Family A tutor rows (MCQ, TF, SATA, SELECT_N) bound
   to Sam's dev tutor account
   (`mybackpacc+mynclextutor@gmail.com`, UUID
   `4ed777d7-e4f7-403b-88f4-63ce5432d65e`).
4. **List-view:** extracted into a shared component
   (`lib/bank/list-view.tsx`) that both `/admin/bank` and
   `/tutor/bank` mount.
5. **Two-pass extraction:** Pass A — extract without behaviour change,
   admin still works identically. Pass B — mount on tutor page.
   Verified the build was clean after each pass before moving on.

### Files created

- `mynclex/lib/bank/list-view.tsx` — shared `BankListView` component
  (browse + focus mode) plus `rowToInitial()` + `buildFilterQueryString()`
  helpers and the `BankRow` / `FullBankRow` / `BankSearchParams`
  types. `editor` arrives as a `ReactNode` prop so the list-view has
  zero dependency on `@/app/...`.
- `mynclex/lib/bank/filters.tsx` — moved from
  `app/(app)/admin/bank/filters.tsx`. Gained a `baseUrl` prop so the
  GET form posts back to the owning surface; behaviour otherwise
  identical.
- `mynclex/lib/bank/navigator.tsx` — moved from
  `app/(app)/admin/bank/navigator.tsx`. Gained a `baseUrl` prop for
  the back-link + per-row `edit=` hrefs.
- `mynclex/app/(app)/tutor/layout.tsx` — TUTOR role gate for the
  entire `/tutor` tree. The (app) layout already enforces
  authenticated access and renders chrome; this layer just adds the
  role requirement. Defensive `if (!user) redirect('/login')` kept.
- `mynclex/app/(app)/tutor/bank/page.tsx` — tutor Question Bank page.
  Mirrors `/admin/bank/page.tsx`: same filter+limit query shape, same
  `rowToInitial()` call, same render; only the table
  (`nclex_tutor_questions`) and the explicit
  `.eq('tutor_id', user.id)` differ. Mounts
  `<EditorShell surface="tutor" … />` so writes route correctly.
- `mynclex/db/seed-tutor-bank-dev.sql` — four seed rows with the
  correct JSONB shapes for MCQ / TF / SATA / SELECT_N. Only
  `NCLEX_TUT_SATA_00001` carries an `instruction` (round-trip
  coverage for the 1.8 column). All rows `is_published=false`.

### Files modified

- `mynclex/lib/bank/classifications.ts` — added
  `TUTOR_ITEM_ID_PREFIX` map (one entry per QuestionType). Existing
  `ITEM_ID_PREFIX` left unchanged.
- `mynclex/db/rls.sql` — enabled RLS on `nclex_tutor_questions` +
  two policies: `nclex_tutor_questions_tutor_own` (FOR ALL,
  `tutor_id = auth.uid()`) and `nclex_tutor_questions_superadmin`
  (FOR ALL, `nclex_user_has_role('SUPER_ADMIN')`). Placed directly
  below the existing `nclex_bank_items` section so related tables
  stay together in the file.
- `mynclex/app/(app)/admin/bank/actions.ts` — surface-aware rewrite:
  - New `Surface = 'admin' | 'tutor'` type + `surfaceConfig()` helper
    that maps surface → table name, ID-prefix map, redirect base URL.
  - `readSurface(formData)` reads the hidden field; defaults to
    `'admin'` on anything unexpected (belt-and-braces).
  - `requireBankCurator()` → `requireSurfaceAuth(surface)`. Admin
    path unchanged (BANK_CURATE / SUPER_ADMIN → `/admin`). Tutor
    path: require TUTOR role → `/no-access`.
  - `nextItemId(supabase, surface, type)` — third arg picks prefix
    map + table to scan.
  - CREATE / UPDATE / DELETE each read surface, pick the table via
    `surfaceConfig(surface).table`, and CREATE also sets
    `tutor_id = user.id` when surface is tutor. RLS enforces the same
    invariant at the DB layer regardless.
  - `redirect()` + `revalidatePath()` use `surfaceConfig.baseUrl` so
    the caller lands back on the owning surface.
- `mynclex/app/(app)/admin/bank/editor-shell.tsx` — the ONLY edit
  here is what Phase 4 explicitly required:
  - New optional `surface?: 'admin' | 'tutor'` prop, default `'admin'`
    so the existing admin callsite keeps working.
  - `<input type="hidden" name="surface" value={surface} />` so the
    server action can read it on submit.
  - Synthetic FormData in `onDelete()` now also sets `surface` so
    delete picks the right table.
  - Total diff: ~5 lines. Editor renderers, section layout, type
    select, and the per-type editor wiring all byte-identical.
- `mynclex/app/(app)/admin/bank/page.tsx` — collapsed from ~595
  lines to ~155. Role gate + nclex_bank_items fetch + initial-row
  load stay here (surface-specific). Everything else delegated to
  `<BankListView surface="admin" baseUrl="/admin/bank" … />` with
  `<EditorShell surface="admin" …/>` passed as the focus-mode
  `editor` ReactNode.

### Files NOT modified (reuse proven)

- `mynclex/lib/bank/editors/mcq-editor.tsx`
- `mynclex/lib/bank/editors/tf-editor.tsx`
- `mynclex/lib/bank/editors/sata-editor.tsx`
- `mynclex/lib/bank/editors/select-n-editor.tsx`
- `mynclex/lib/bank/editors/matrix-editor.tsx`
- `mynclex/lib/bank/editors/bowtie-editor.tsx`
- `mynclex/lib/bank/editors/cloze-editor.tsx`
- `mynclex/lib/bank/editors/highlight-editor.tsx`
- All 8 parsers in `mynclex/lib/bank/parsers/`
- `mynclex/lib/bank/types.ts`
- `mynclex/lib/bank/form-shape.ts`

### Files deleted

- `mynclex/app/(app)/admin/bank/filters.tsx` (moved to
  `lib/bank/filters.tsx`).
- `mynclex/app/(app)/admin/bank/navigator.tsx` (moved to
  `lib/bank/navigator.tsx`).

### Migrations applied to dev (`zrakjibtxyzoqcdtvpmq`)

- `mynclex_bank_tutor_rls_slice_2_1` — `{"success":true}`.
  Enables RLS on `nclex_tutor_questions`, adds the two policies.
- `mynclex_bank_tutor_seed_slice_2_1` — `{"success":true}` on the
  second attempt. First attempt failed on a stray `isn't` apostrophe
  inside a single-quoted SQL literal; fixed by doubling to `isn''t`.
  Backported the same fix to `seed-tutor-bank-dev.sql`.

Verified post-seed with SELECT: 4 rows, all bound to the right
`tutor_id`, `is_published=false` across the board,
`instruction='Select ALL that apply.'` on the SATA row only.

### Verified locally

- `npx tsc --noEmit` — clean after Pass A; clean again after Phase 5.
- `npx eslint app/(app)/admin/bank app/(app)/tutor lib/bank` —
  clean both runs.
- `npm run build` (webpack) — clean both runs. Final route listing
  includes the new `/tutor/bank` entry alongside the existing
  `/admin/bank` and the rest of the app tree.

### Findings

- **Editor-shell edit was unavoidable, but minimal.** Phase 4.1
  offered two ways to pass surface: first action arg, or hidden
  FormData field. FormData field matches the existing pattern
  (question_type, item_id are all hidden fields already), so the
  shell gained a single hidden input + a 5-line type widening on
  its props. No logic changes. Documented per the handoff's "if
  it does, treat that as a finding" rule.
- **`admin/bank/form.tsx` is now dead code.** It was a thin
  `BankForm` wrapper around `EditorShell`. Nothing imports it
  anymore after the page refactor. Left untouched this slice per
  the repo rule *"Don't clean up surrounding code"*; logged here
  for a future cleanup pass.
- **Option (ii) taken for Phase 5.3.** No second `tutor/bank/actions.ts`
  wrapper file. The tutor page imports `EditorShell` directly from
  `@/app/(app)/admin/bank/editor-shell` and passes `surface='tutor'`;
  the shared action reads that from FormData. Cross-import is
  deliberate.

### Not yet verified (Sam's session, on dev Worker)

Per the handoff, browser verification is Sam's job:

1. Log in as admin — `/admin/bank` still works exactly as before.
   Create one MCQ, edit it, delete it. No regressions.
2. Log in as tutor (`mybackpacc+mynclextutor@gmail.com`) — go to
   `/tutor/bank`. Confirm the 4 seeded rows appear.
   Confirm admin rows do **not** appear (RLS isolation).
3. Create one of each 8 types as tutor. Confirm all save with
   `NCLEX_TUT_*` IDs.
4. Edit one of each 8. Confirm round-trip.
5. Delete one. Confirm removal.
6. Log in as a second tutor (you may need to create one) — confirm
   the first tutor's rows are invisible.
7. Log in as STUDENT — confirm `/tutor/bank` redirects to `/no-access`.

### Deferred to future sessions / out of scope here

- **Drag-drop (Slice 1.10)** — still parked, to resume soon.
  Eight of nine types are authorable on both admin and tutor
  surfaces now; Drag-drop will land on both simultaneously via the
  surface plumbing shipped here.
- **CLONING.md update** — still doesn't exist; same deferral as
  Slices 1.5–1.9.
- **Student runner** — unblocked by the full Family B set once
  Drag-drop lands.
- **Case-study wrapper (Slice 1.11)** — the `nclex_tutor_case_studies`
  + join tables already exist per schema.sql; will need a parallel
  surface-aware treatment when the case-study surface is built.
- **Dead code cleanup** — `admin/bank/form.tsx` (no callers).

### Next session

Options:
- Resume Drag-drop (Slice 1.10) with the 3 already-locked decisions.
- Keep proving surface symmetry by adding Family B authoring to the
  tutor surface (should be zero-cost — same reusability proof).
- Start the student runner on the 8 live types.

---

## Session — 2026-04-22 (Planning — Trend items v2 + Drag-drop park)

No code written. Planning-only session covering two things:

1. **Slice 1.10 (Drag-drop) formally parked.** Earlier this session we
   had started Slice 1.10 planning and captured 3 decisions (both
   Ordered-list + Sentence-slots subtypes via `content.subtype` radio;
   curator picks pool size per question including distractors; each
   token fills one slot max). Sam chose to park and pivot before
   writing the mockup. Outstanding decisions when we resume: sentence
   slot-marker syntax (leaning `[1]` `[2]`), slot bounds (3–8
   confirmed), feedback granularity (per-slot confirmed), pool-size
   rule (recommended slot-count up to slot-count + 4), correct-answer
   shape (recommended `correct.slots = { s1: "t3", ... }`). **To
   resume very soon — this is the next in-flight build item.**

2. **Trend items (v2) planned shape settled.** Sam asked to visualise
   what a Trend item would look like; built a 4-example mockup
   (`mockups/trend-visualisation.html`) showing vitals-over-time +
   Matrix, labs-over-days + Cloze, I&O-over-shifts + Highlight, and
   neuro-progression + SATA. Through that mockup, the shape settled:
   Trend is structurally similar to Case Study — its clinical context
   (the time-series table) lives in its own table and joins to one
   bank item via a nullable FK. Documented in `bank.md` under new
   section "Trend items (v2) — planned shape".

### Decisions (Trend v2)

- **Own table:** `nclex_trend_datasets` — `trend_id` PK, title,
  scenario, kind (vitals/labs/io/neuro/assessment), timepoints JSONB
  array, rows JSONB array of `{metric, values, flags}`, plus
  classification subset.
- **Attachment mechanism:** nullable `trend_id TEXT FK` column on
  `nclex_bank_items` (and parallel on `nclex_tutor_questions` via
  `nclex_tutor_trend_datasets`).
- **No new question type.** Trend items re-use the existing 9 types;
  the presence of `trend_id` is the render switch.
- **One trend → many items allowed.** Same trend dataset can pair
  with a Matrix, a Cloze, and a SATA — reuse without copy-paste.
- **Simpler than Case Study's join.** Trend is a one-to-one
  attachment from the item's side, so a plain FK suffices; no join
  table needed (unlike Case Study's position + cjmm_step pair).
- **Build cost when v2 starts:** one ALTER TABLE, new `/admin/trends`
  page, new trend editor, dropdown on bank-item editor, runner
  enhancement to render the panel.

### Files modified

- `mynclex/docs/product-plan/bank.md` — replaced one-line
  "Trend items (v2)." entry under "Decisions not yet settled" with
  a full `## Trend items (v2) — planned shape` section (~150 lines,
  incl. schema sketch and mockup reference). Also updated build-
  order step 7 to flag drag-drop as parked.
- `mynclex/docs/product-plan/mockups/trend-visualisation.html` —
  new file. 989-line static mockup matching `ngn-primer.html`'s
  style tokens (Fraunces + Inter, navy/teal palette). 4 trend
  examples + conceptual framing + future-shape sketch.
- `mynclex/SESSIONS.md` — this entry.

### Files unchanged (explicitly)

- Every file under `mynclex/lib/bank/` — planning only.
- Every file under `mynclex/app/(app)/admin/bank/` — planning only.
- `mynclex/db/schema.sql` — no schema changes this session.
- `mynclex/db/rls.sql` — no RLS changes this session.
- `mynclex/docs/product-plan/main.md` — already lists "Trend items
  (NGN variant...)" under "Deferred (v2 or later)"; no update needed
  there (main.md is the index, bank.md is the detail).

### Verified

- Nothing to run — planning-only session, no TS, no SQL, no routes
  touched.

### Deferred to future sessions

- **Drag-drop (Slice 1.10)** — to resume very soon. 3 decisions
  locked, 2 still open (sentence marker syntax, pool-size rule).
- **CLONING.md update** — still doesn't exist; deferred since Slice
  1.5.
- **Student runner** — unblocks after all Family B editors are live.
- **Case-study wrapper (Slice 1.11).**

### Next session

Resume Slice 1.10 (Drag-drop). Start with the mockup, using the 3
already-locked decisions and closing the 2 open ones (Q1 sentence
marker syntax + Q3 pool-size rule).

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


## Loose ends — deferred from Slice 1.11b (2026-04-23)

Items surfaced during Sam's verification of 1.11b on dev that
aren't shipped but shouldn't be forgotten.

### Clear slot button (UX affordance, deferred)

Currently, removing a question from a case requires clearing the
stem manually and saving — the empty-slot filter (commit
`67d656a`) then treats the slot as empty and the server drops the
row. This works but is not discoverable. A dedicated "Clear slot"
button was discussed and deferred. Open UX question: where the
affordance should live (topbar of the right pane, Housekeeping
accordion, or hover-× on the pill were all considered).

### Case wrapper accordion label clash (known temporary)

The left-half case wrapper uses accordion labels Content /
Classification / Housekeeping (from 1.11a). The right-half
`QuestionAuthoringPanel` uses the same three labels for each
child question (from 1.11b). A curator opening a case sees two
sets of identically-named accordions with different meanings on
the same page. This was flagged as a known temporary in the
1.11b handoff; cleanup is a later slice. Likely rename target
for the case wrapper: Case Setup / Case Metadata / Case
Publishing (or similar), so the wrapper accordions read as
case-level rather than question-level.

### Slice 1.11c — next planned focus

Wires up the "Preview as student · position N" button that
already exists as a disabled stub in the case editor's chart
header. When functional, clicking the button toggles the chart
to show only entries where `visible_from <= N` for the chosen
position — letting the curator see what a student on question N
will actually see during the case. Also brings in
validation-summary-style warnings ("Tab X has no entries visible
at position 1", "This case has 4/6 questions; publish requires
all six", "Q3 has no CJMM step selected") that catch authoring
errors before publish. Unblocks clean authoring before the
student runner is built.

## 2026-04-27 → 2026-04-28 — Prod environment + automated migration pipeline

Closed out the prod-setup plan that had been paused mid-execution.
By the end of the session prod is fully wired, isolated from dev,
and reachable at `mynclex.qacademynurses.workers.dev` with its own
Supabase project (`dehspjcfmhoshcdtsmjq`). Future releases are now
a one-step `merge main → prod, push` operation that auto-deploys
the Cloudflare Worker and applies any new database migrations in
parallel.

### MCP wiring across all 6 Supabase projects

Before any prod work could happen, the session connected Claude to
all six Supabase projects (3 accounts × 2 products) via the hosted
MCP gateway. Each `.mcp.json` entry carries a `project_ref` URL
parameter; each Cloudflare/Supabase account requires its own OAuth
flow against the owning identity. The dev account was already
authenticated; the security and prod accounts each needed their
own browser sign-in. Two prod redirects timed out the local
listener on the first attempt and we regenerated the auth URLs.
Final state: `supabase-{gamma,mynclex}-{dev,sec,prod}` namespaces
all live with read+write tools.

### Stage 3 — bootstrap prod schema via MCP

Empty prod database. Two SoT files (`db/schema.sql`, `db/rls.sql`)
plus the three RPC migration files were applied directly via
`apply_migration` against the prod project. Pre-flight discovered
two issues with `schema.sql`: forward foreign-key references on
`nclex_bank_items.parent_case_id` and `nclex_tutor_questions.parent_case_id`
that wouldn't run as a single shot, and the deliberate exclusion of
RPC bodies that meant `schema.sql + rls.sql` alone would not match
dev's final state. The schema.sql FK fix already existed in the
prod-bound repo (commit `1593215`); a duplicate edit landed in the
gamma worktree's `mynclex/` subfolder and is dead weight (revert
follow-up). Applied the 3 RPC migrations after schema + rls.
Verification counts matched dev exactly: 14 tables, 13 RLS-enabled
tables, 29 policies, 10 `nclex_*` functions.

### GitHub org migration + repo rename

The repo lived on a personal GitHub account (`mybackpacc-byte`),
which couldn't cleanly accommodate a second Cloudflare account
(prod). Created GitHub organisation `QAcademy-Nurses`, transferred
`qacademy-mynclex` into it, invited the prod GitHub user as Member,
installed the Cloudflare Workers and Pages App on the new org with
access to the repo. The dev CF Worker still worked through GitHub's
URL redirect; we disconnected and reconnected the dev Worker's Git
source to point directly at the new owner. Tested the auto-deploy
with a real (non-empty) commit since the Worker has a path filter
that skips empty-commit pushes. Sam later renamed the repo from
`qacademy-mynclex` to just `mynclex`. Local remote URLs updated
twice to track these moves.

### Stage 4 — prod Cloudflare Worker

Created a new Worker `mynclex` on the prod CF account
(`qacademynurses` handle) connected to the prod branch. First
attempt blocked by GitHub's "This action must be performed by an
organization owner" check — the prod GitHub user was a Member, not
Owner. Resolved by signing into Cloudflare's GitHub OAuth flow
with the Owner credentials in an incognito window; one-time
authorization sufficed. Production branch defaulted to `main`
during the wizard; corrected to `prod` post-setup. Worker URL is
`https://mynclex.qacademynurses.workers.dev`.

### Stage 5 — env wiring (wrangler.jsonc + Supabase Auth)

Cloudflare Workers Builds runs `wrangler deploy` on every push,
which overwrites any dashboard-set env vars from `wrangler.jsonc`.
Dashboard-only vars therefore don't survive deploys. Added an
`env.prod` block to `wrangler.jsonc` with the prod Supabase URL +
prod legacy anon JWT; the prod Worker's build configuration was
changed to call `npx wrangler deploy --env prod` so the
env-specific block is selected at deploy time. Top-level vars stay
as the dev defaults — dev's Workers Builds still uses them when it
deploys without `--env`. Disconnected and reconnected the prod
Worker's Git source after the repo rename to drop the redirect
dependency. Set the prod Supabase project's Auth URL Configuration
with site URL + redirect URLs pointing at the prod Worker domain.

### Stage 6 — historical migrations renamed to timestamp format

The Supabase CLI only recognises migration files whose names match
`<14-digit-timestamp>_<name>.sql` and applies them in timestamp
order. Renamed the 9 historical migration files in `db/migrations/`
accordingly, picking pseudo-timestamps based on the slice dates
from each file's comments. Pure git rename — no SQL content
changes. Stage 8 depended on these exact filenames being final.

### Stage 7 — `migrate-prod.yml` GitHub Action

Workflow at `.github/workflows/migrate-prod.yml` triggers on push
to the `prod` branch. Installs the Supabase CLI, symlinks
`db/migrations/` to `supabase/migrations/` (the path the CLI
expects), links to the prod project via project_ref, and runs
`supabase db push --include-all`. Uses GitHub secrets
`SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` for auth. A
`concurrency: { group: prod-migrations, cancel-in-progress: false }`
guard prevents two migration runs racing. The action runs in
parallel with the Cloudflare deploy and neither blocks the other
(per the locked-in additive-migrations-only rule).

### Stage 8 — seed prod's `schema_migrations` tracker

Inserted 9 rows into `supabase_migrations.schema_migrations` on
prod, with `version` values exactly matching the renamed file
timestamps, so the action's first run on prod would see "all
historical migrations already applied" and skip them. Removed the
3 RPC marker rows that Stage 3's `apply_migration` calls had
written with wall-clock timestamps. Initially also kept 2 bootstrap
markers (`initial_schema_bootstrap`, `initial_rls_bootstrap`) — see
Stage 9 for why those had to come out.

### Stage 9 — end-to-end pipeline check

Added a no-op migration `20260428000000_pipeline_check.sql`
containing only `SELECT 1`, committed to main, fast-forwarded prod
from main, and pushed. The CF deploy fired and succeeded. The
GitHub Action fired and **failed** on the first run with "Remote
migration versions not found in local migrations directory" — the
Supabase CLI does a strict consistency check that errors when any
tracker rows lack on-disk files. The 2 bootstrap markers from
Stage 8 were the offending rows. Deleted them via MCP and re-ran
the failed action; the second run applied the pipeline_check
migration and recorded its `20260428000000` row. End state: 10
tracker rows, all matching files. Both halves of the pipeline (CF
deploy, DB migration apply) verified working end-to-end.

### Steady-state release process

For every future MyNclex change:

1. Schema/RLS/RPC change: write a new file in `db/migrations/`
   named `<timestamp>_<descriptive>.sql`. Apply to dev via MCP.
   Test. Back-port the change to `db/schema.sql` or `db/rls.sql`
   per the established convention so a fresh bootstrap of a new
   environment would produce the same final state.
2. App code change: as before — commit on main.
3. When ready to release: merge `main` → `prod` and push. The
   Cloudflare Worker redeploys with prod env vars; the GitHub
   Action applies any new migrations to prod Supabase. Both run
   in parallel; neither blocks the other.

The additive-only rule is the safety guarantee that makes the
parallel deploys safe. Never drop columns, rename, change types
incompatibly, drop policies, or tighten RLS without a multi-step
pattern (add new → backfill → switch code → drop old) coordinated
across multiple releases.

### Cleanup follow-ups (deferred)

- The Cloudflare auto-PR branch `update_worker_name_to_qacademy-mynclex`
  on GitHub can be closed; the env.prod name override already
  handles the worker name correctly.
- The duplicate `schema.sql` deferred-FK edit in the gamma
  worktree's `mynclex/` subfolder is dead weight (the prod-bound
  `qacademy-mynclex` repo already had the equivalent fix). Should
  be reverted in the gamma worktree at next opportunity.
- Migrate `wrangler.jsonc` from the legacy anon JWT to the modern
  `sb_publishable_*` key for both top-level (dev) and env.prod
  blocks. Cosmetic; not blocking.
