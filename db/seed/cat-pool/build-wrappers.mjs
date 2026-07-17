// db/seed/cat-pool/build-wrappers.mjs
//
// Phase 2 wrapper builder — DEV-ONLY synthetic CASE STUDIES and TRENDS for the
// CAT test pool. Consumes case/trend definitions from ./data-wrappers/*.json,
// assembles the exact nclex_case_studies / nclex_trend_datasets + tabs +
// children/links + linked-question rows, computes child marks correctly
// (reusing Phase 1's assemble/computeMarks), HARD-VALIDATES, and emits SQL.
//
// Children/questions are authored in the SAME plain-text format as Phase 1
// standalones (the runner's parseRichDoc wraps plain strings). Chart-tab
// entries DO need the nested Tiptap-object shape — built here from a friendly
// tab spec. Byte-shapes mirror the skill's example-ketoacidosis.gen.js.
//
//   node build-wrappers.mjs            # validate + emit chunked SQL to ./apply-wrappers/
//   node build-wrappers.mjs --check    # validate only
//   node build-wrappers.mjs --file X   # only ./data-wrappers/X
//   node build-wrappers.mjs --stats
//
// Tagged batch_id='DEV_CAT_POOL', question_ref='CATPREP', published + builder-visible.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assemble, computeMarks } from './build.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data-wrappers');
const APPLY_DIR = join(__dirname, 'apply-wrappers');
const BATCH_ID = 'DEV_CAT_POOL';
const QUESTION_REF = 'CATPREP';

const CJMM_STEPS = ['Recognise cues', 'Analyse cues', 'Prioritise', 'Generate solutions', 'Take action', 'Evaluate outcomes'];
const CATEGORIES = ['Safe and Effective Care Environment', 'Health Promotion and Maintenance', 'Psychosocial Integrity', 'Physiological Integrity'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

// ── Tiptap builders (from example-ketoacidosis.gen.js) ────────────────────────
const T = (text) => ({ type: 'text', text });
const P = (...kids) => (kids.length ? { type: 'paragraph', attrs: { textAlign: 'left' }, content: kids } : { type: 'paragraph', attrs: { textAlign: 'left' } });
const DOC = (...paras) => ({ type: 'doc', content: paras });
const rs = (text) => JSON.stringify(DOC(P(T(text))));            // stringified doc — scenario_summary
const roMulti = (lines) => DOC(...lines.map((l) => P(T(l))));   // object doc — narrative body / cells

let cidN = 0;
const cell = (text, heading = false) => ({ id: 'c' + cidN++, colspan: 1, content: text === '' ? DOC(P()) : DOC(P(T(String(text)))), covered: false, heading, rowspan: 1 });
function gridTable(id, matrix, rowVis) {
  cidN = 0;
  const grid = matrix.map((row) => row.map((c) => cell(c.text, !!c.heading)));
  return { id, cols: matrix[0].length, grid, rows: matrix.map((_, i) => ({ id: 'r' + i, visibleFrom: rowVis[i] })) };
}

function req(cond, ctx, msg) { if (!cond) throw new Error(`[${ctx}] ${msg}`); }

// ── friendly tab spec -> exact DB tab row shape ───────────────────────────────
// Supported tab specs (authored by agents):
//   { kind:'narrative', key:'nurses_notes'|'orders'|'diagnostics'|'custom_narrative', title, entries:[{chips:[], lines:[], visibleFrom}] }
//   { kind:'grid', title, headers:[...], rows:[[...]], rowVisibleFrom:[...] }   -> custom_grid / rows_cols
function buildTab(spec, order, ctx) {
  if (spec.kind === 'narrative') {
    const builtin = ['nurses_notes', 'orders', 'diagnostics'].includes(spec.key);
    req(spec.entries && spec.entries.length >= 1, ctx, `narrative tab "${spec.title}" needs entries`);
    const entries = spec.entries.map((e, i) => {
      req(Array.isArray(e.lines) && e.lines.length >= 1, ctx, `tab "${spec.title}" entry ${i} needs lines`);
      return { id: 'e' + i, body: roMulti(e.lines), chips: e.chips || [], visibleFrom: e.visibleFrom || 1 };
    });
    return { tab_key: builtin ? spec.key : 'custom_narrative', title: spec.title, display_order: order, is_custom: !builtin, custom_shape: builtin ? null : 'free_text', entries: { v: 2, entries } };
  }
  if (spec.kind === 'grid') {
    req(Array.isArray(spec.headers) && spec.headers.length >= 2, ctx, `grid tab "${spec.title}" needs >=2 headers`);
    req(Array.isArray(spec.rows) && spec.rows.length >= 1, ctx, `grid tab "${spec.title}" needs >=1 data row`);
    spec.rows.forEach((r, i) => req(r.length === spec.headers.length, ctx, `grid "${spec.title}" row ${i} width ${r.length} != headers ${spec.headers.length}`));
    // row 0 = headers (first cell heading:false per rotated-vitals convention, rest heading:true); data rows heading:false
    const matrix = [spec.headers.map((h, j) => ({ text: h, heading: j > 0 }))].concat(spec.rows.map((r) => r.map((c) => ({ text: c, heading: false }))));
    const rowVis = [1].concat(spec.rowVisibleFrom || spec.rows.map(() => 1));
    req(rowVis.length === matrix.length, ctx, `grid "${spec.title}" rowVisibleFrom length mismatch`);
    return { tab_key: 'custom_grid', title: spec.title, display_order: order, is_custom: true, custom_shape: 'rows_cols', entries: { v: 2, tables: [gridTable('t0', matrix, rowVis)] } };
  }
  throw new Error(`[${ctx}] unknown tab kind: ${spec.kind}`);
}

// ── child validation + assembly (reuse Phase 1) ───────────────────────────────
function buildChild(def, ctx, extra) {
  req(def.item_id, ctx, 'child missing item_id');
  req(DIFFICULTIES.includes(def.difficulty), ctx, `child ${def.item_id} bad difficulty: ${def.difficulty}`);
  req(CATEGORIES.includes(def.category), ctx, `child ${def.item_id} bad category`);
  req(def.stem && def.stem.trim(), ctx, `child ${def.item_id} empty stem`);
  const { content, correct } = assemble(def, `${ctx}:${def.item_id}`);
  const marks = computeMarks(def.type, correct);
  req(marks >= 1, ctx, `child ${def.item_id} marks ${marks} < 1`);
  return { def, content, correct, marks, ...extra };
}

// ── SQL helpers (dollar-quoted to avoid escaping) ─────────────────────────────
let dqN = 0;
const dq = (s) => { const tag = `$w${dqN++}$`; return tag + String(s) + tag; };
const arrLit = (a) => 'ARRAY[' + (a.length ? a.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(',') : '') + ']::text[]';
const jq = (o) => `${dq(JSON.stringify(o))}::jsonb`;

const CHILD_COLS = 'item_id, question_type, stem, rationale, content, correct, instruction, marks, ' +
  'client_needs_category, client_needs_subcategory, nursing_subject, body_system, topic, subtopic, difficulty, bloom_level, ' +
  'is_published, is_builder_visible, is_free_sample, tags, batch_id, question_ref';

function childValues(r, parentCol, parentId) {
  const d = r.def;
  return `('${d.item_id}', ${dq(d.type)}, ${dq(d.stem)}, ${d.rationale ? dq(d.rationale) : 'NULL'}, ${jq(r.content)}, ${jq(r.correct)}, NULL, ${r.marks}, ` +
    `${dq(d.category)}, ${d.subcategory ? dq(d.subcategory) : 'NULL'}, ${d.subject ? dq(d.subject) : 'NULL'}, ${d.body_system ? dq(d.body_system) : 'NULL'}, ${d.topic ? dq(d.topic) : 'NULL'}, ${d.subtopic ? dq(d.subtopic) : 'NULL'}, ${dq(d.difficulty)}, ${d.bloom ? dq(d.bloom) : 'NULL'}, ` +
    `TRUE, TRUE, FALSE, '{}'::text[], '${BATCH_ID}', '${QUESTION_REF}')`;
}

// ── assemble a CASE -> SQL ────────────────────────────────────────────────────
function caseSql(c, ctx) {
  req(c.case_id && c.case_id.startsWith('NCLEX_CS_'), ctx, `bad case_id ${c.case_id}`);
  req(c.title && c.scenario, ctx, 'case needs title + scenario');
  req(Array.isArray(c.children) && c.children.length === 6, ctx, `case needs exactly 6 children, got ${c.children?.length}`);
  req(Array.isArray(c.tabs) && c.tabs.length >= 2, ctx, 'case needs >=2 chart tabs');
  const tags = Array.from(new Set([...(c.tags || []), QUESTION_REF]));
  const tabs = c.tabs.map((t, i) => buildTab(t, i, ctx));
  const children = c.children.map((ch, i) => {
    req(ch.position === i + 1, ctx, `case ${c.case_id} child ${i} position must be ${i + 1}`);
    req(CJMM_STEPS.includes(ch.cjmm), ctx, `case ${c.case_id} child ${i} bad cjmm: ${ch.cjmm}`);
    return buildChild(ch, ctx, { position: ch.position, cjmm: ch.cjmm });
  });
  let sql = `-- CASE ${c.case_id} — ${c.title}\n`;
  sql += `INSERT INTO nclex_case_studies (case_id,title,scenario_summary,tags,is_free_sample,is_builder_visible,is_published) VALUES ` +
    `('${c.case_id}', ${dq(c.title)}, ${dq(rs(c.scenario))}, ${arrLit(tags)}, FALSE, TRUE, TRUE) ON CONFLICT (case_id) DO NOTHING;\n`;
  tabs.forEach((tb, i) => {
    sql += `INSERT INTO nclex_case_study_tabs (tab_id,case_id,tab_key,title,display_order,is_custom,custom_shape,columns_def,entries) VALUES ` +
      `('${c.case_id}_TAB_${i + 1}','${c.case_id}',${dq(tb.tab_key)},${dq(tb.title)},${tb.display_order},${tb.is_custom},${tb.custom_shape ? dq(tb.custom_shape) : 'NULL'},'[]'::jsonb,${jq(tb.entries)}) ON CONFLICT (tab_id) DO NOTHING;\n`;
  });
  children.forEach((r, i) => {
    sql += `INSERT INTO nclex_bank_items (${CHILD_COLS}, parent_case_id) VALUES ` +
      childValues(r).slice(0, -1) + `, '${c.case_id}') ON CONFLICT (item_id) DO NOTHING;\n`;
    sql += `INSERT INTO nclex_case_study_items (id,case_id,item_id,position,cjmm_step) VALUES ` +
      `('${c.case_id}_ITEM_${i + 1}','${c.case_id}','${r.def.item_id}',${r.position},${dq(r.cjmm)}) ON CONFLICT (id) DO NOTHING;\n`;
  });
  return { sql, childCount: children.length };
}

// ── assemble a TREND -> SQL ───────────────────────────────────────────────────
function trendSql(t, ctx) {
  req(t.trend_id && t.trend_id.startsWith('NCLEX_TRD_'), ctx, `bad trend_id ${t.trend_id}`);
  req(t.title && t.scenario, ctx, 'trend needs title + scenario');
  req(Array.isArray(t.questions) && t.questions.length >= 1, ctx, 'trend needs >=1 question');
  req(Array.isArray(t.tabs) && t.tabs.length >= 1, ctx, 'trend needs >=1 tab (the flowsheet)');
  const tags = Array.from(new Set([...(t.tags || []), QUESTION_REF]));
  const tabs = t.tabs.map((tb, i) => buildTab(tb, i, ctx));
  const questions = t.questions.map((q) => buildChild(q, ctx, {}));
  let sql = `-- TREND ${t.trend_id} — ${t.title}\n`;
  sql += `INSERT INTO nclex_trend_datasets (trend_id,title,scenario,tags,is_free_sample,is_builder_visible,is_published) VALUES ` +
    `('${t.trend_id}', ${dq(t.title)}, ${dq(rs(t.scenario))}, ${arrLit(tags)}, FALSE, TRUE, TRUE) ON CONFLICT (trend_id) DO NOTHING;\n`;
  tabs.forEach((tb, i) => {
    sql += `INSERT INTO nclex_trend_tabs (tab_id,trend_id,tab_key,title,display_order,is_custom,custom_shape,columns_def,entries) VALUES ` +
      `('${t.trend_id}_TAB_${i + 1}','${t.trend_id}',${dq(tb.tab_key)},${dq(tb.title)},${tb.display_order},${tb.is_custom},${tb.custom_shape ? dq(tb.custom_shape) : 'NULL'},'[]'::jsonb,${jq(tb.entries)}) ON CONFLICT (tab_id) DO NOTHING;\n`;
  });
  questions.forEach((r) => {
    sql += `INSERT INTO nclex_bank_items (${CHILD_COLS}, trend_id) VALUES ` +
      childValues(r).slice(0, -1) + `, '${t.trend_id}') ON CONFLICT (item_id) DO NOTHING;\n`;
  });
  return { sql, childCount: questions.length };
}

// ── main ──────────────────────────────────────────────────────────────────────
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('build-wrappers.mjs');
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const fileArg = args.indexOf('--file') >= 0 ? args[args.indexOf('--file') + 1].replace(/^.*\//, '') : null;
  const files = fileArg ? [fileArg] : readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')).sort();
  const blocks = [];
  const seen = new Set();
  let errors = 0, cases = 0, trends = 0, childCount = 0;

  for (const f of files) {
    let parsed;
    try { parsed = JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8')); }
    catch (e) { console.error(`PARSE FAIL ${f}: ${e.message}`); errors++; continue; }
    const wrappers = Array.isArray(parsed) ? parsed : [parsed];
    wrappers.forEach((w, i) => {
      const id = w.case_id || w.trend_id || '?';
      const ctx = `${f}#${i}:${id}`;
      try {
        if (seen.has(id)) throw new Error(`duplicate wrapper id ${id}`);
        seen.add(id);
        const out = w.kind === 'trend' ? trendSql(w, ctx) : caseSql(w, ctx);
        blocks.push(out.sql);
        childCount += out.childCount;
        if (w.kind === 'trend') trends++; else cases++;
      } catch (e) { console.error(`INVALID ${ctx}: ${e.message}`); errors++; }
    });
  }

  console.log(`Parsed ${files.length} file(s) → ${cases} case(s) + ${trends} trend(s) = ${childCount} questions, ${errors} error(s).`);
  if (errors > 0 && !args.includes('--skip-invalid')) { console.error('Refusing to emit — fix errors first (or --skip-invalid).'); process.exit(1); }

  if (!args.includes('--check') && blocks.length) {
    mkdirSync(APPLY_DIR, { recursive: true });
    // one SQL file per wrapper block, wrapped in a transaction (atomic per wrapper)
    blocks.forEach((b, i) => {
      const sql = `BEGIN;\n${b}COMMIT;\n`;
      writeFileSync(join(APPLY_DIR, `wrapper-${String(i + 1).padStart(3, '0')}.sql`), sql);
    });
    console.log(`wrote ${blocks.length} wrapper SQL file(s) to ${APPLY_DIR}`);
  }
}
