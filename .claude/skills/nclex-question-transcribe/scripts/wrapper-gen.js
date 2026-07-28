// ─────────────────────────────────────────────────────────────────────
// wrapper-gen.js — build case-study and trend wrappers as SQL.
//
// Why this exists: the stored wrapper JSON is deeply nested Tiptap
// (every chart cell is a full doc, every narrative entry carries its own
// reveal schedule). Hand-typing it is the single biggest error source in
// authoring a case. These builders emit the exact shapes read back from
// the authored NCLEX_CS_96xxx series, so a new case only has to describe
// its *content*.
//
// Usage (from an authoring script):
//   const G = require('/home/user/mynclex/.claude/skills/nclex-question-transcribe/scripts/wrapper-gen.js');
//   console.log(G.emitCase({ ... }));
//
// Emits SQL only — apply it with the Supabase MCP execute_sql tool.
// ─────────────────────────────────────────────────────────────────────

'use strict';

// ── Tiptap builders ──────────────────────────────────────────────────
// A tab cell / narrative body is a NESTED doc object (entries is jsonb).
function doc(text) {
  const paras = String(text).split('\n').filter((p) => p.trim() !== '');
  return {
    type: 'doc',
    content: (paras.length ? paras : ['']).map((p) => ({
      type: 'paragraph',
      attrs: { textAlign: 'left' },
      content: p === '' ? [] : [{ text: p, type: 'text' }],
    })),
  };
}

// Question option / row / column text is a STRINGIFIED doc.
const str = (text) => JSON.stringify(doc(text));

// ── entries: narrative tabs ──────────────────────────────────────────
// rows: [{ body, chips?: ['0800'], visibleFrom?: 1 }]
function narrative(rows) {
  return {
    v: 2,
    entries: rows.map((r, i) => ({
      id: `e${i}`,
      body: doc(r.body),
      chips: r.chips || [],
      visibleFrom: r.visibleFrom == null ? 1 : r.visibleFrom,
    })),
  };
}

// ── entries: merge-table tabs (custom_grid / rows_cols) ──────────────
// headers: ['Time','Temperature',...]  (col 0 header is NOT bold, matching 96xxx)
// rows: [{ cells: ['0800','37.2',...], visibleFrom: 1 }]
function grid(headers, rows) {
  let cid = 0;
  const cell = (text, heading) => ({
    id: `c${cid++}`,
    colspan: 1,
    rowspan: 1,
    covered: false,
    heading: !!heading,
    content: doc(text),
  });

  const headerRow = headers.map((h, i) => cell(h, i !== 0));
  const bodyRows = rows.map((r) => r.cells.map((c) => cell(c, false)));

  return {
    v: 2,
    tables: [
      {
        id: 't0',
        cols: headers.length,
        grid: [headerRow, ...bodyRows],
        // row 0 is the header — always visible; body rows carry the schedule
        rows: [
          { id: 'r0', visibleFrom: 1 },
          ...rows.map((r, i) => ({
            id: `r${i + 1}`,
            visibleFrom: r.visibleFrom == null ? 1 : r.visibleFrom,
          })),
        ],
      },
    ],
  };
}

// ── marks ────────────────────────────────────────────────────────────
// The question's MAX partial-credit score. A flat 1 on a multi-answer
// type makes the submit RPC throw "score_awarded out of range".
function marksFor(qtype, correct) {
  switch (qtype) {
    case 'MCQ':
    case 'TF':
      return 1;
    case 'SATA':
    case 'SELECT_N':
      return correct.answers.length;
    case 'MATRIX':
      return Object.keys(correct.cells).length;
    case 'MATRIX_MR':
      return Object.values(correct.cells).reduce((n, v) => n + v.length, 0);
    case 'CLOZE':
      return Object.keys(correct.answers).length;
    case 'HIGHLIGHT':
      return correct.answers.length;
    case 'BOWTIE':
      return 5;
    default:
      throw new Error(`marksFor: unknown question type ${qtype}`);
  }
}

const ID_PREFIX = {
  MCQ: 'NCLEX_MCQ_', TF: 'NCLEX_TF_', SATA: 'NCLEX_SATA_', SELECT_N: 'NCLEX_SELN_',
  MATRIX: 'NCLEX_MAT_', MATRIX_MR: 'NCLEX_MMR_', BOWTIE: 'NCLEX_BT_',
  CLOZE: 'NCLEX_CLZ_', HIGHLIGHT: 'NCLEX_HL_',
};

const CJMM = ['Recognise cues', 'Analyse cues', 'Prioritise',
  'Generate solutions', 'Take action', 'Evaluate outcomes'];

// ── SQL helpers ──────────────────────────────────────────────────────
// Dollar-quoting sidesteps every apostrophe-escaping bug.
const q = (s) => (s == null ? 'NULL' : `$q$${s}$q$`);
const j = (o) => `$j$${JSON.stringify(o)}$j$::jsonb`;
const b = (v) => (v ? 'TRUE' : 'FALSE');

function assertAscii(label, s) {
  const bad = String(s).match(/[^\x00-\x7F]/g);
  if (bad) throw new Error(`${label}: non-ASCII character(s) ${[...new Set(bad)].join(' ')}`);
}

// ── question row ─────────────────────────────────────────────────────
// cls: { category, subcategory, subject, system, topic, difficulty, bloom }
function questionSQL(qn, opts) {
  const { itemId, type, stem, rationale, content, correct, cls,
    parentCaseId = null, trendId = null } = qn;
  const marks = marksFor(type, correct);
  assertAscii(itemId, stem + ' ' + (rationale || '') + ' ' + JSON.stringify(content));

  return `INSERT INTO nclex_bank_items
(item_id, question_type, stem, rationale, content, correct,
 client_needs_category, client_needs_subcategory, nursing_subject, body_system, topic,
 difficulty, difficulty_irt, difficulty_source, bloom_level,
 tags, is_free_sample, is_builder_visible, is_published, marks, shuffle_options,
 parent_case_id, trend_id)
VALUES (${q(itemId)}, ${q(type)}, ${q(stem)}, ${q(rationale)}, ${j(content)}, ${j(correct)},
 ${q(cls.category)}, ${q(cls.subcategory)}, ${q(cls.subject)}, ${q(cls.system)}, ${q(cls.topic)},
 ${q(cls.difficulty)}, ${opts.seedIrt[cls.difficulty]}, 'CURATOR_LABEL', ${q(cls.bloom)},
 '{}', FALSE, TRUE, TRUE, ${marks}, TRUE,
 ${parentCaseId ? q(parentCaseId) : 'NULL'}, ${trendId ? q(trendId) : 'NULL'});`;
}

const SEED_IRT = {
  'Very easy': -2, Easy: -1, Medium: 0, Hard: 1, 'Very hard': 2,
};

// ── emitters ─────────────────────────────────────────────────────────
// spec: { caseId, title, scenario, tabs: [{key,title,shape,entries}], questions: [6] }
function emitCase(spec) {
  const { caseId, title, scenario, tabs, questions } = spec;
  if (questions.length !== 6) throw new Error(`${caseId}: expected 6 child questions, got ${questions.length}`);
  assertAscii(caseId, title + ' ' + scenario);

  const out = [];
  out.push(`-- ${caseId} — ${title}`);
  out.push(`INSERT INTO nclex_case_studies
(case_id, title, scenario_summary, tags, is_free_sample, is_builder_visible, is_published, cat_pool)
VALUES (${q(caseId)}, ${q(title)}, ${q(scenario)}, '{}', FALSE, TRUE, TRUE, FALSE);`);

  tabs.forEach((t, i) => {
    const isCustom = t.key === 'custom_grid' || t.key === 'custom_narrative';
    const shape = t.key === 'custom_grid' ? 'rows_cols'
      : t.key === 'custom_narrative' ? 'free_text' : null;
    out.push(`INSERT INTO nclex_case_study_tabs
(tab_id, case_id, tab_key, title, display_order, is_custom, custom_shape, columns_def, entries)
VALUES (${q(`${caseId}_TAB_${i + 1}`)}, ${q(caseId)}, ${q(t.key)}, ${q(t.title)}, ${i},
 ${b(isCustom)}, ${shape ? q(shape) : 'NULL'}, '[]'::jsonb, ${j(t.entries)});`);
  });

  questions.forEach((qn, i) => {
    out.push(questionSQL({ ...qn, parentCaseId: caseId }, { seedIrt: SEED_IRT }));
    out.push(`INSERT INTO nclex_case_study_items (id, case_id, item_id, position, cjmm_step)
VALUES (${q(`${caseId}_ITEM_${i + 1}`)}, ${q(caseId)}, ${q(qn.itemId)}, ${i + 1}, ${q(CJMM[i])});`);
  });

  return out.join('\n');
}

// spec: { trendId, title, scenario, tabs: [...], questions: [1..n] }
function emitTrend(spec) {
  const { trendId, title, scenario, tabs, questions } = spec;
  assertAscii(trendId, title + ' ' + scenario);

  const out = [];
  out.push(`-- ${trendId} — ${title}`);
  out.push(`INSERT INTO nclex_trend_datasets
(trend_id, title, scenario, tags, is_free_sample, is_builder_visible, is_published, cat_pool)
VALUES (${q(trendId)}, ${q(title)}, ${q(scenario)}, '{}', FALSE, TRUE, TRUE, FALSE);`);

  tabs.forEach((t, i) => {
    const isCustom = t.key === 'custom_grid' || t.key === 'custom_narrative';
    const shape = t.key === 'custom_grid' ? 'rows_cols'
      : t.key === 'custom_narrative' ? 'free_text' : null;
    out.push(`INSERT INTO nclex_trend_tabs
(tab_id, trend_id, tab_key, title, display_order, is_custom, custom_shape, columns_def, entries)
VALUES (${q(`${trendId}_TAB_${i + 1}`)}, ${q(trendId)}, ${q(t.key)}, ${q(t.title)}, ${i},
 ${b(isCustom)}, ${shape ? q(shape) : 'NULL'}, '[]'::jsonb, ${j(t.entries)});`);
  });

  questions.forEach((qn) => {
    out.push(questionSQL({ ...qn, trendId }, { seedIrt: SEED_IRT }));
  });

  return out.join('\n');
}

module.exports = {
  doc, str, narrative, grid, marksFor, emitCase, emitTrend,
  ID_PREFIX, CJMM, SEED_IRT, questionSQL,
};
