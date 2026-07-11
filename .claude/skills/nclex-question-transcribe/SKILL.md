---
name: nclex-question-transcribe
description: Transcribe Maryland / NGN case-study, trend, and bow-tie question specimens (a .docx file or pasted text) into the MyNclex bank — nclex_bank_items plus the case/trend wrappers and their tabs. Use when converting an external NCLEX question document into authored bank content, on dev (direct insert) or prod (via MCP, gated). Covers extraction, the exact JSON shapes per question type, tab reveal structure, ID minting, insert, and read-back verification.
---

# NCLEX question transcription

Turn a real NGN specimen (Maryland open-source test bank, or similar) into
faithful MyNclex bank content — fast and byte-accurate — instead of
hand-authoring each question in the editor UI.

**The whole point:** the shapes and conventions below are the ~20 minutes of
one-time learning already paid. Reuse them; do not re-derive by re-querying the
DB unless a shape here is missing (e.g. a question type not yet templated).

## When to use

The user hands over an NGN case-study / trend / bow-tie document (a `.docx`
path, or pasted text) and wants it in the bank. Typically one unfolding case =
6 questions across the CJMM steps + optionally a standalone bow-tie or trend.

## The pipeline (steps)

### 1. Extract the document

- **`.docx`**: it's a ZIP. Unzip `word/document.xml`, then run
  `scripts/docx-to-text.js <document.xml> <out.md>` (bundled). It renders
  paragraphs + tables, marks `[shaded]` header cells (= tab boundaries),
  `[spanN]`, and preserves `*` answer-key markers. Windows has no `python`
  (Store stub) and no `pandoc`/`extract-text` on PATH — use the Node script,
  which needs nothing but `node`.
- **Pasted text**: fine for text-keyed docs (words + `*` keys + TSV tables
  survive). **Prefer the file** when the doc has images, bold/highlight-only
  answer keys (no `*`), or any grid where the key columns look ambiguous — a
  paste can silently drop a tab and shift a key.
- **Ignore** the specimen's front matter (title block, QR codes, references).
  Real content starts at "Case Study 1 of 6" / the first scenario.

### 2. Map content to structure

- **Each shaded header (`Nurses' Notes`, `Vital Signs`, `Laboratory Report`,
  `Medications`, `Orders`, `Diagnostics`…) starts a new TAB**, not a merged
  mega-table. The doc stacks them for print; on the exam they are clickable
  tabs.
- **CJMM 6-step order** maps to positions 1–6: Recognise cues · Analyse cues ·
  Prioritise · Generate solutions · Take action · Evaluate outcomes. Assign by
  what the question *does*, and sanity-check position 6 = Evaluate.
- **Question type by phrasing** (see `reference/json-shapes.md` for the full
  cue→type table). Watch the SATA-vs-SELECT_N call: "Select all that apply" →
  SATA; "Which **N** …" (explicit count) → SELECT_N with `select_count = N`.
- **Time-series tables (vitals) ROTATE**: the doc has times as columns; store
  times as **rows** so the per-row reveal engine can unfold them
  question-by-question. Static tables (labs, meds) are not rotated.
- **Progressive reveal**: a timestamp/row/entry gets `visibleFrom = <the
  question number where it first appears in the doc>`. A standalone bow-tie /
  trend snapshot has everything `visibleFrom: 1` (no unfolding).
- **Canonical entries**: the specimen repeats each tab per question with minor
  drift. Store ONE entry per timestamp — use the most complete wording — and
  reveal it where that timestamp first appears.

### 3. Build with the generator (do NOT hand-type JSON)

Copy `scripts/generator-template.js` to scratch, fill its data section with the
specimen's content, and run it. It holds the Tiptap builders and per-type
`content`/`correct` shapes, and either emits SQL or direct-inserts. Hand-typing
the nested Tiptap/JSONB is the error source the generator removes.

Full shapes: **`reference/json-shapes.md`**. Summary of what varies:
- Question `stem`, `rationale` are **TEXT columns holding a Tiptap-JSON
  string**. Options / rows / columns / tokens store their text as a
  **stringified** Tiptap doc; Cloze choices store **plain text**. Tab cell
  content / narrative bodies are **nested Tiptap objects** (entries is JSONB).
- The **cue lives in the stem's first paragraph**; the `instruction` column is
  left NULL (mirror the existing authored cases). Scenario lead-in sentence, if
  the doc has one, is the paragraph before the cue. Cloze puts `{1}`, `{2}`
  markers inline as plain text in a second stem paragraph.

### 4. Mint IDs against the TARGET database

Sequences differ between dev and prod — always query the target first:
```sql
-- next numeric per type (ignores TESTCASE-suffixed ids)
WITH ids AS (SELECT question_type, NULLIF(regexp_replace(item_id,'^.*_(\d+)$','\1'),item_id)::int AS num FROM nclex_bank_items)
SELECT question_type, max(num) FROM ids WHERE num IS NOT NULL GROUP BY question_type;
-- + max NCLEX_CS_\d+ and NCLEX_TRD_\d+
```
ID formats: questions `NCLEX_<TYPE>_<NNNNN>` (SATA/MCQ often a `900xx`/`910xx`
series — continue whichever the recent case-study items use); case
`NCLEX_CS_000NN`; tabs `<CASE>_TAB_<n>`; links `<CASE>_ITEM_<n>`; trend
`NCLEX_TRD_000NN`, its tab `<TREND>_TAB_1`. New rows: `is_published=false`
(draft), `is_builder_visible=true`.

**`marks` = the question's MAX partial-credit score — NEVER a flat 1.** A flat
`marks=1` on a multi-answer type makes the submit RPC throw `score_awarded N out
of range [0, marks]` and blocks Submit. Compute it (mirror
`lib/scoring/dispatch.ts` → `computeMarksFromKey`): MCQ/TF = 1 · SATA/SELECT_N =
#correct answers · MATRIX = #rows · MATRIX_MR = #correct cells (summed over
rows) · CLOZE = #blanks · HIGHLIGHT = #correct chunks · BOWTIE = 5. Put a
`marksFor(qtype, correct)` helper in the generator and use it — do not hardcode.

### 5. Insert

- **dev**: the generator direct-inserts via `@supabase/supabase-js` using the
  service-role key in the worktree `.env.local`. That key is DEV-only; the
  client lib is not in the worktree — require it from the main checkout
  (`C:/Users/confi/qacademy-mynclex/node_modules/@supabase/supabase-js`). The
  template hard-guards on the dev project ref before writing.
- **prod**: the local key can't reach prod. Apply the generated SQL via the
  **prod MCP `execute_sql`** tool, and **only with explicit user approval**.
  Prefer the settled path: author+verify on dev, then export approved cases to
  prod with re-IDing (`for_prod` tag → SQL insert → strip tag → verify) — see
  the bank dev→prod export memory. Prod rows go in as unpublished drafts.

### 6. Verify (always)

Read the rows back from the target and deep-compare against intent:
question `question_type` / `position` / `cjmm_step` / `correct` / `marks`; tab
`visibleFrom` schedules; child count = 6; wrapper `is_published=false`. Only
then report to the user, who does the final visual/clinical review in the
editor at `localhost:3000` → admin bank.

**When a case goes to BOTH dev and prod, MD5-verify the copy is faithful.** The
prod insert re-uses the same content re-IDed, so `md5(content::text)`,
`md5(correct::text)` per question, and `md5(entries::text)` per tab must be
**byte-identical** on dev and prod (Postgres normalises jsonb, so equal logical
content → equal hash). Any mismatch = a corrupted/edited copy; fix before
reporting. (This only proves the dev→prod *copy* is faithful — NOT that the
clinical mapping is right. That still needs a human eye on the flagged calls.)

## Conventions & judgment calls — FLAG, don't silently decide

Surface these to the user for confirmation (they own the clinical call):
- **SATA vs SELECT_N** when the doc names a count.
- **CJMM step** where the doc is ambiguous (esp. position 6 = Evaluate).
- **Typo / data fixes** in the source (e.g. a duplicated column header, an
  incomplete reference range) — state each fix.
- **Label cleanup** (doc "P / Pulse oximeter" → "Pulse / Saturations") — match
  the existing authored cases' cleaned labels; note it.
- **Classifications + difficulty** — the specimen states none, but **fill them
  per question** (Sam's standing ask, 2026-07-10): `client_needs_category` (one
  of the 4 top-level in `lib/bank/classifications.ts`), `nursing_subject`,
  `body_system`, `topic` (free text), `subtopic` (free text/null), `difficulty`
  (Easy/Medium/Hard). Assign per-question by CJMM focus (e.g. prioritise/take-
  action → often *Safe and Effective Care Environment*; physiological recognise/
  analyse/evaluate → *Physiological Integrity*; teaching → *Health Promotion*).
  They gate builder eligibility. Use the EXACT enum strings from
  `classifications.ts`. Flag any genuinely ambiguous axis to the user.
- **Paired-scoring Cloze** ("Scoring Rule: Rationale" / cause-effect) — v1
  scores each blank independently; note the deferral.

## Governance

- dev: proceed freely. prod: **explicit per-batch approval, every time.**
- Never invent clinical content. Transcription copies the specimen verbatim;
  authoring new questions is a separate task with its own review.

## Batch mode — multi-agent (a whole folder at once)

**Proven 2026-07-10:** the whole Family folder went in as parallel subagent
batches — 6 fresh cases across two batches of 3, one general-purpose subagent per
`.docx`, each end-to-end (dev + prod + MD5-verify + classifications), **zero ID
collisions, zero failures**. Two modes: (a) **one file at a time** (the serial
pipeline above — the orchestrator maps + builds each case; best for a single
file or when you want to eyeball every question), or (b) **multi-agent** —
requires the user to opt in (spawning agents + prod writes cost tokens). Use
multi-agent when a folder has several untranscribed case files.

**THE one rule that makes it safe: pre-mint a distinct ID band per agent BEFORE
fan-out.** If agents each query "next SATA id" in parallel they pick the SAME
number and collide on insert. So the orchestrator allocates non-overlapping
ranges up front and hands each agent its exact IDs.

The band trick: an `item_id` is `PREFIX + number`, and the prefix differs per
type — so ONE sequential number range per agent works for ALL its types at once.
Give agent A the numbers `x01, x02, …` (Q1=x01 … Q6=x06, standalone=x07) with
the correct per-type prefix; give agent B a disjoint hundreds-range; etc.

**Orchestrator steps:**
1. **Pick the files** + confirm the batch size with the user (3 validated cleanly;
   4–5 is fine once proven). Skip any already in the bank (title match).
2. **Query current maxes** on dev AND prod for every question type + CS + TRD
   (see step 4 above). Pick a CLEAN high band above all maxes and verify it's
   empty. Used so far: **dev items `97xxx`, prod items `99xxx`** — carve a
   distinct hundreds-range per agent (A=`970xx`/`990xx`, B=`971xx`/`991xx`, …).
   Assign each agent explicit `CS_000NN` (dev+prod) and `TRD_000NN` (dev+prod).
   Log the next free band in memory so the following batch continues cleanly.
3. **Fan out one subagent per file** (Agent tool, `general-purpose`, all in one
   message → parallel). Each agent prompt MUST include: its `.docx` path; a
   pointer to `reference/json-shapes.md`; a WORKING generator to COPY as the
   template (this session used `gen-scc.js` = case + bow-tie + `cls()`
   classifications + dev insert + prod SQL emit; `gen-pph.js` = a standalone
   *trend* question + rotated flowsheet); `lib/bank/classifications.ts` for the
   vocabulary; **its exact dev+prod ID assignment**; the full step list
   (extract → map → build → `node gen dev --insert` → verify dev → `node gen prod
   --sql` → apply via prod MCP `execute_sql` in one `BEGIN…COMMIT` → MD5-verify
   dev==prod); governance (drafts only, touch ONLY its own band); and a report
   format (per-question type/marks/cjmm/classification/key + every judgment call
   + PASS/FAIL). Agents reach the prod MCP tool via ToolSearch.
4. **Batch-level verify after all report:** on prod, confirm each new case has 6
   children + expected tabs + `is_published=false`; count items per band (should
   equal 7 = 6 + standalone, no overlap between bands); check no multi-answer
   type sits at `marks=1` (a legit 1-blank CLOZE at marks 1 is fine — verify it's
   actually a cloze). Then read each agent's flagged judgment calls and review
   them (the MD5 only proves the copy is faithful, not the mapping).

The generator each agent copies carries: the Tiptap builders, `gridTable` /
`bannerTable` (shared `cidN` so cell ids stay unique across banner tables in one
tab), `marksFor`, the `cls()` classification helper, an `IDS = {dev,prod}` map,
and both a dev `--insert` path (supabase-js, dev-ref-guarded) and a prod `--sql`
emit. `tags` is `text[]` → emit `'{}'` (NOT `'[]'::jsonb`). Keep prose
apostrophes as curly `’` where possible to sidestep SQL-quote escaping.

## Reference material in this skill

- `reference/json-shapes.md` — exact `content` + `correct` per question type,
  the tab (narrative / merge-table / banner) shapes, wrapper table columns, and
  the cue→type table.
- `scripts/docx-to-text.js` — the extractor.
- `scripts/generator-template.js` — the builders + insert harness to copy and
  fill. **Evolve it toward the session generators** (`gen-scc.js` pattern): add
  `marksFor()`, the `cls()` classification helper + the 6 classification columns,
  the `IDS = {dev,prod}` map, and a prod `--sql` emitter alongside the dev
  `--insert` — the bundled template predates all of these.
