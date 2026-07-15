// db/seed/cat-pool/build.mjs
//
// CAT test-pool builder — DEV-ONLY synthetic bank items.
//
// Consumes plain-text item definitions from ./data/*.json (authored by the
// generation workflow), deterministically assembles the exact nclex_bank_items
// row shape (content/correct JSONB, option IDs, computed marks), HARD-VALIDATES
// every item, and emits SQL split by difficulty band.
//
// Authoring format is intentionally simpler than the stored shape: an author
// describes options/rows/tokens with a `correct` flag and plain text; this
// builder owns ID assignment, the correct/feedback maps, and marks — so the
// workflow agents cannot corrupt the DB shape.
//
// Storage note: stems/options/feedback are stored as PLAIN TEXT. The runner's
// parseRichDoc() (lib/authoring/rich-doc.ts) wraps any non-Tiptap string as
// paragraphs, so plain text renders correctly. No Tiptap assembly needed for
// standalone items.
//
//   node build.mjs            # validate + emit SQL to ../  (dev seed files)
//   node build.mjs --check    # validate only, no files written
//   node build.mjs --stats    # print coverage tables after building
//
// Everything is tagged batch_id = 'DEV_CAT_POOL'. DEV-ONLY. Never prod.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const OUT_DIR = join(__dirname, '..', '..'); // db/
const BATCH_ID = 'DEV_CAT_POOL';
const QUESTION_REF = 'CATPREP'; // human-facing identifier, shown in the admin bank UI

// ── vocabulary (must mirror lib/bank/classifications.ts EXACTLY) ──────────────
const QUESTION_TYPES = ['MCQ', 'TF', 'SATA', 'SELECT_N', 'MATRIX', 'MATRIX_MR',
  'BOWTIE', 'CLOZE', 'HIGHLIGHT', 'DRAG_CLOZE', 'DRAG_ORDER'];
const ID_PREFIX = {
  MCQ: 'NCLEX_MCQ_', TF: 'NCLEX_TF_', SATA: 'NCLEX_SATA_', SELECT_N: 'NCLEX_SELN_',
  MATRIX: 'NCLEX_MAT_', MATRIX_MR: 'NCLEX_MMR_', BOWTIE: 'NCLEX_BT_', CLOZE: 'NCLEX_CLZ_',
  HIGHLIGHT: 'NCLEX_HL_', DRAG_CLOZE: 'NCLEX_DCZ_', DRAG_ORDER: 'NCLEX_DO_',
};
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
const CATEGORIES = [
  'Safe and Effective Care Environment', 'Health Promotion and Maintenance',
  'Psychosocial Integrity', 'Physiological Integrity',
];
// NOTE: codebase still uses the pre-2026 "Safety and Infection Control" name.
// We classify synthetic items with the codebase string for consistency (see
// bank-consumption-cat.html §19). The 2026 rename is a separate codebase fix.
const SUBCATEGORIES = {
  'Safe and Effective Care Environment': ['Management of Care', 'Safety and Infection Control'],
  'Health Promotion and Maintenance': ['Health Promotion and Maintenance'],
  'Psychosocial Integrity': ['Psychosocial Integrity'],
  'Physiological Integrity': ['Basic Care and Comfort', 'Pharmacological and Parenteral Therapies',
    'Reduction of Risk Potential', 'Physiological Adaptation'],
};
const SUBJECTS = ['Fundamentals of Nursing', 'Medical-Surgical', 'Maternity', 'Pediatrics',
  'Mental Health', 'Pharmacology', 'Community Health', 'Leadership and Management'];
const BLOOM = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

// ── marks — ported verbatim from lib/scoring/dispatch.ts computeMarksFromKey ──
export function computeMarks(type, correct) {
  switch (type) {
    case 'MCQ': case 'TF': return 1;
    case 'SATA': case 'SELECT_N': return correct.answers.length;
    case 'MATRIX': return Object.keys(correct.cells).length;
    case 'MATRIX_MR': return Object.values(correct.cells).reduce((s, c) => s + c.length, 0);
    case 'HIGHLIGHT': return correct.correct_ids.length;
    case 'CLOZE': return Object.keys(correct.answers).length;
    case 'DRAG_CLOZE': case 'DRAG_ORDER': return Object.keys(correct.slots).length;
    case 'BOWTIE': return 5;
    default: throw new Error(`marks: unknown type ${type}`);
  }
}

// ── per-type assembler: author def -> {content, correct} ─────────────────────
// Each throws on structural problems; the validator adds cross-checks.
export function assemble(def, ctx = def.item_id || '?') {
  const t = def.type;
  const fb = {}; // feedback map (plain text)
  switch (t) {
    case 'MCQ': case 'TF': {
      const opts = t === 'TF'
        ? [{ text: 'True', correct: def.answer === 'True' }, { text: 'False', correct: def.answer === 'False' }]
        : def.options;
      req(opts && opts.length >= 2, ctx, 'needs >=2 options');
      const correctIdx = opts.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
      req(correctIdx.length === 1, ctx, `${t} needs exactly 1 correct option`);
      const options = opts.map((o, i) => ({ id: LETTERS[i], text: o.text }));
      opts.forEach((o, i) => { if (o.feedback) fb[LETTERS[i]] = o.feedback; });
      return { content: { options }, correct: { answer: LETTERS[correctIdx[0]], feedback: fb } };
    }
    case 'SATA': {
      req(def.options && def.options.length >= 3, ctx, 'SATA needs >=3 options');
      const correct = def.options.map((o, i) => (o.correct ? LETTERS[i] : null)).filter(Boolean);
      req(correct.length >= 1, ctx, 'SATA needs >=1 correct');
      const options = def.options.map((o, i) => ({ id: LETTERS[i], text: o.text }));
      def.options.forEach((o, i) => { if (o.feedback) fb[LETTERS[i]] = o.feedback; });
      return { content: { options }, correct: { answers: correct, feedback: fb } };
    }
    case 'SELECT_N': {
      req(def.options && def.options.length >= 3, ctx, 'SELECT_N needs >=3 options');
      const correct = def.options.map((o, i) => (o.correct ? LETTERS[i] : null)).filter(Boolean);
      const n = def.select_count ?? correct.length;
      req(correct.length === n, ctx, `SELECT_N: correct count ${correct.length} != select_count ${n}`);
      const options = def.options.map((o, i) => ({ id: LETTERS[i], text: o.text }));
      def.options.forEach((o, i) => { if (o.feedback) fb[LETTERS[i]] = o.feedback; });
      return { content: { options, select_count: n }, correct: { answers: correct, feedback: fb } };
    }
    case 'MATRIX': case 'MATRIX_MR': {
      req(def.rows && def.rows.length >= 2, ctx, 'matrix needs >=2 rows');
      req(def.columns && def.columns.length >= 2, ctx, 'matrix needs >=2 columns');
      const rows = def.rows.map((r, i) => ({ id: `r${i + 1}`, text: r.text }));
      const columns = def.columns.map((c, i) => ({ id: `c${i + 1}`, text: typeof c === 'string' ? c : c.text }));
      const cells = {};
      def.rows.forEach((r, i) => {
        const rid = `r${i + 1}`;
        if (t === 'MATRIX') {
          req(Number.isInteger(r.answer), ctx, `MATRIX row ${rid} needs integer answer (column index)`);
          req(r.answer >= 0 && r.answer < columns.length, ctx, `MATRIX row ${rid} answer out of range`);
          cells[rid] = `c${r.answer + 1}`;
        } else {
          req(Array.isArray(r.answers) && r.answers.length >= 1, ctx, `MATRIX_MR row ${rid} needs >=1 answer`);
          r.answers.forEach((a) => req(a >= 0 && a < columns.length, ctx, `MATRIX_MR row ${rid} answer out of range`));
          cells[rid] = r.answers.map((a) => `c${a + 1}`);
        }
        if (r.feedback) fb[rid] = r.feedback;
      });
      return { content: { row_label: def.row_label || 'Finding', rows, columns }, correct: { cells, feedback: fb } };
    }
    case 'CLOZE': {
      req(def.blanks && def.blanks.length >= 1, ctx, 'CLOZE needs >=1 blank');
      const blanks = []; const answers = {}; const cfb = {};
      def.blanks.forEach((b, i) => {
        const bid = `b${i + 1}`;
        req(b.choices && b.choices.length >= 2, ctx, `CLOZE ${bid} needs >=2 choices`);
        const choices = b.choices.map((c, j) => ({ id: `c${j + 1}`, text: typeof c === 'string' ? c : c.text }));
        const correctIdx = b.choices.map((c, j) => (typeof c === 'object' && c.correct ? j : -1)).filter((j) => j >= 0);
        req(correctIdx.length === 1, ctx, `CLOZE ${bid} needs exactly 1 correct choice`);
        blanks.push({ id: bid, choices });
        answers[bid] = `c${correctIdx[0] + 1}`;
      });
      // marker check: stem must contain {1}..{N}
      def.blanks.forEach((_, i) => req(def.stem.includes(`{${i + 1}}`), ctx, `CLOZE stem missing marker {${i + 1}}`));
      return { content: { blanks }, correct: { answers, feedback: cfb } };
    }
    case 'HIGHLIGHT': {
      req(def.chunks && def.chunks.length >= 2, ctx, 'HIGHLIGHT needs >=2 chunks');
      const chunks = def.chunks.map((c, i) => ({ id: `h${i + 1}`, text: typeof c === 'string' ? c : c.text }));
      const correct_ids = def.chunks.map((c, i) => (typeof c === 'object' && c.correct ? `h${i + 1}` : null)).filter(Boolean);
      req(correct_ids.length >= 1, ctx, 'HIGHLIGHT needs >=1 correct chunk');
      req(correct_ids.length < chunks.length, ctx, 'HIGHLIGHT needs >=1 wrong (distractor) chunk');
      def.chunks.forEach((c, i) => { if (typeof c === 'object' && c.feedback) fb[`h${i + 1}`] = c.feedback; });
      // each chunk text must appear inside [[...]] in the stem passage
      chunks.forEach((c) => req(def.stem.includes(`[[${c.text}]]`), ctx, `HIGHLIGHT stem missing [[${c.text}]]`));
      return { content: { chunks }, correct: { correct_ids, feedback: fb } };
    }
    case 'BOWTIE': {
      const wing = (w, prefix, need) => {
        req(w && w.tokens && w.tokens.length >= need, ctx, `BOWTIE ${prefix} needs >=${need} tokens`);
        const tokens = w.tokens.map((tk, i) => ({ id: `${prefix}${i + 1}`, text: typeof tk === 'string' ? tk : tk.text }));
        const correct = w.tokens.map((tk, i) => (typeof tk === 'object' && tk.correct ? `${prefix}${i + 1}` : null)).filter(Boolean);
        w.tokens.forEach((tk, i) => { if (typeof tk === 'object' && tk.feedback) fb[`${prefix}${i + 1}`] = tk.feedback; });
        return { label: w.label, tokens, correct };
      };
      const L = wing(def.left, 'lt', 2), C = wing(def.centre, 'ct', 1), R = wing(def.right, 'rt', 2);
      req(L.correct.length === 2, ctx, 'BOWTIE left needs exactly 2 correct');
      req(C.correct.length === 1, ctx, 'BOWTIE centre needs exactly 1 correct');
      req(R.correct.length === 2, ctx, 'BOWTIE right needs exactly 2 correct');
      return {
        content: { left: { label: L.label, tokens: L.tokens }, centre: { label: C.label, tokens: C.tokens }, right: { label: R.label, tokens: R.tokens } },
        correct: { left: L.correct, centre: C.correct[0], right: R.correct, feedback: fb },
      };
    }
    case 'DRAG_CLOZE': {
      req(def.slots && def.slots.length >= 1, ctx, 'DRAG_CLOZE needs >=1 slot');
      req(def.tokens && def.tokens.length >= def.slots.length + 1, ctx, 'DRAG_CLOZE needs >=1 distractor token');
      const slots = def.slots.map((s, i) => ({ id: `s${i + 1}`, target_text: s.target_text || '' }));
      const tokens = def.tokens.map((tk, i) => ({ id: `t${i + 1}`, text: typeof tk === 'string' ? tk : tk.text }));
      const map = {};
      def.slots.forEach((s, i) => {
        req(Number.isInteger(s.token), ctx, `DRAG_CLOZE slot s${i + 1} needs integer token index`);
        req(s.token >= 0 && s.token < tokens.length, ctx, `DRAG_CLOZE slot s${i + 1} token out of range`);
        map[`s${i + 1}`] = `t${s.token + 1}`;
        req(def.stem.includes(`[${i + 1}]`), ctx, `DRAG_CLOZE stem missing marker [${i + 1}]`);
      });
      return { content: { slots, tokens }, correct: { slots: map } };
    }
    case 'DRAG_ORDER': {
      req(def.tokens && def.tokens.length >= 2, ctx, 'DRAG_ORDER needs >=2 tokens');
      req(def.order && def.order.length >= 2, ctx, 'DRAG_ORDER needs an order of >=2');
      const slots = def.order.map((_, i) => ({ id: `s${i + 1}`, target_text: def.order[i].target_text || `${ordinal(i + 1)} action` }));
      const tokens = def.tokens.map((tk, i) => ({ id: `t${i + 1}`, text: typeof tk === 'string' ? tk : tk.text }));
      const map = {};
      def.order.forEach((o, i) => {
        req(Number.isInteger(o.token), ctx, `DRAG_ORDER position ${i + 1} needs integer token index`);
        req(o.token >= 0 && o.token < tokens.length, ctx, `DRAG_ORDER position ${i + 1} token out of range`);
        map[`s${i + 1}`] = `t${o.token + 1}`;
      });
      return { content: { slots, tokens }, correct: { slots: map } };
    }
    default: throw new Error(`assemble: unknown type ${t}`);
  }
}

function ordinal(n) { return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`; }
function req(cond, ctx, msg) { if (!cond) throw new Error(`[${ctx}] ${msg}`); }

// ── classification validation ────────────────────────────────────────────────
function validateClass(def, ctx) {
  req(CATEGORIES.includes(def.category), ctx, `bad category: ${def.category}`);
  req(SUBCATEGORIES[def.category].includes(def.subcategory), ctx, `bad subcategory for ${def.category}: ${def.subcategory}`);
  req(!def.subject || SUBJECTS.includes(def.subject), ctx, `bad subject: ${def.subject}`);
  req(DIFFICULTIES.includes(def.difficulty), ctx, `bad difficulty: ${def.difficulty}`);
  req(!def.bloom || BLOOM.includes(def.bloom), ctx, `bad bloom: ${def.bloom}`);
  req(def.stem && def.stem.trim().length > 0, ctx, 'empty stem');
}

// ── SQL emit ─────────────────────────────────────────────────────────────────
const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const jq = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

function toRow(def, ctx) {
  validateClass(def, ctx);
  req(QUESTION_TYPES.includes(def.type), ctx, `bad type: ${def.type}`);
  req(def.item_id && def.item_id.startsWith(ID_PREFIX[def.type]), ctx, `item_id ${def.item_id} wrong prefix for ${def.type}`);
  const { content, correct } = assemble(def, ctx);
  const marks = computeMarks(def.type, correct);
  req(marks >= 1, ctx, `computed marks ${marks} < 1`);
  return { def, content, correct, marks };
}

function rowSql(r) {
  const d = r.def;
  return `('${d.item_id}', '${d.type}', ${q(d.stem)}, ${q(d.rationale)}, ${jq(r.content)}, ${jq(r.correct)}, ` +
    `${q(d.category)}, ${q(d.subcategory)}, ${q(d.subject)}, ${q(d.body_system)}, ${q(d.topic)}, ${q(d.subtopic)}, ` +
    `${q(d.difficulty)}, ${q(d.bloom)}, '{}', ${r.marks}, TRUE, TRUE, FALSE, '${BATCH_ID}', '${QUESTION_REF}')`;
}

const COLS = `item_id, question_type, stem, rationale, content, correct, ` +
  `client_needs_category, client_needs_subcategory, nursing_subject, body_system, topic, subtopic, ` +
  `difficulty, bloom_level, tags, marks, is_published, is_builder_visible, is_free_sample, batch_id, question_ref`;

// ── main ─────────────────────────────────────────────────────────────────────
// Guard: only run the file-reading/emit pipeline when invoked directly
// (node build.mjs ...), not when imported by the vitest scoring test.
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('build.mjs');
if (!invokedDirectly) { /* imported as a module — export functions only */ }
else {
const args = process.argv.slice(2);
// --file <name>: validate/emit only one data file (agents self-check their own
// output during the workflow, before other files exist). Otherwise all of data/.
const fileArgIdx = args.indexOf('--file');
const onlyFile = fileArgIdx >= 0 ? args[fileArgIdx + 1] : null;
const files = onlyFile
  ? [onlyFile.replace(/^.*\//, '')]
  : readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')).sort();
const rows = [];
const seenIds = new Set();
let errors = 0;

for (const f of files) {
  let parsed;
  try { parsed = JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8')); }
  catch (e) { console.error(`PARSE FAIL ${f}: ${e.message}`); errors++; continue; }
  const items = Array.isArray(parsed) ? parsed : parsed.items;
  items.forEach((def, i) => {
    const ctx = `${f}#${i}:${def.item_id || '?'}`;
    try {
      if (seenIds.has(def.item_id)) throw new Error(`duplicate item_id ${def.item_id}`);
      seenIds.add(def.item_id);
      rows.push(toRow(def, ctx));
    } catch (e) { console.error(`INVALID ${ctx}: ${e.message}`); errors++; }
  });
}

console.log(`Parsed ${files.length} file(s) → ${rows.length} valid item(s), ${errors} error(s).`);
// Strict by default: any invalid item fails the build. With --skip-invalid the
// aggregate build drops bad items and proceeds (used when many agents each
// contribute a file and a handful of rows may be malformed — the dropped ones
// are logged above and topped up in a later round).
if (errors > 0 && !args.includes('--skip-invalid')) {
  console.error('Refusing to emit — fix errors first (or pass --skip-invalid).');
  process.exit(1);
}
if (errors > 0) console.warn(`--skip-invalid: dropped ${errors} invalid item(s), emitting ${rows.length}.`);

if (args.includes('--stats')) {
  const by = (fn) => rows.reduce((m, r) => ((m[fn(r)] = (m[fn(r)] || 0) + 1), m), {});
  console.log('\nBy difficulty:', by((r) => r.def.difficulty));
  console.log('By type:', by((r) => r.def.type));
  console.log('By category:', by((r) => r.def.category));
  console.log('By subcategory:', by((r) => r.def.subcategory));
}

function insertSql(bandRows, band) {
  return `-- DEV-ONLY synthetic CAT test pool (batch_id=${BATCH_ID}), band=${band}.\n` +
    `-- Generated by db/seed/cat-pool/build.mjs. Delete with:\n` +
    `--   DELETE FROM nclex_bank_items WHERE batch_id = '${BATCH_ID}';\n\n` +
    `INSERT INTO nclex_bank_items (\n  ${COLS}\n) VALUES\n` +
    bandRows.map(rowSql).join(',\n') + '\nON CONFLICT (item_id) DO NOTHING;\n';
}

// --chunk <N>: emit N-row chunk files into ./apply/ (application units for the
// applier subagents), instead of the canonical 3 combined band files.
const chunkIdx = args.indexOf('--chunk');
const chunkN = chunkIdx >= 0 ? parseInt(args[chunkIdx + 1], 10) : 0;

if (!args.includes('--check') && rows.length > 0) {
  if (chunkN > 0) {
    const applyDir = join(__dirname, 'apply');
    mkdirSync(applyDir, { recursive: true });
    let part = 0;
    for (const band of DIFFICULTIES) {
      const bandRows = rows.filter((r) => r.def.difficulty === band);
      for (let i = 0; i < bandRows.length; i += chunkN) {
        part++;
        const slice = bandRows.slice(i, i + chunkN);
        const name = `part-${String(part).padStart(3, '0')}-${band.toLowerCase()}.sql`;
        writeFileSync(join(applyDir, name), insertSql(slice, band));
      }
    }
    console.log(`wrote ${part} chunk file(s) of <=${chunkN} rows to ${applyDir}`);
  } else {
    for (const band of DIFFICULTIES) {
      const bandRows = rows.filter((r) => r.def.difficulty === band);
      if (bandRows.length === 0) continue;
      const out = join(OUT_DIR, `seed-cat-pool-dev-${band.toLowerCase()}.sql`);
      writeFileSync(out, insertSql(bandRows, band));
      console.log(`wrote ${out} (${bandRows.length} rows)`);
    }
  }
}
} // end invokedDirectly
