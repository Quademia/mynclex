// nclex-question-transcribe — generator template.
// Copy to scratch, fill the DATA section, run `node this.js` to preview,
// `node this.js --insert` to write to DEV. See ../reference/json-shapes.md and
// the example-ketoacidosis*.gen.js files for full worked usage.
const fs = require('fs');

// ---------- Tiptap builders ----------
const T = (text) => ({ type: 'text', text });
const P = (...kids) => kids.length ? { type: 'paragraph', attrs: { textAlign: 'left' }, content: kids } : { type: 'paragraph', attrs: { textAlign: 'left' } };
const DOC = (...paras) => ({ type: 'doc', content: paras });
const rs = (text) => JSON.stringify(DOC(P(T(text))));          // stringified doc — options/rows/cols/tokens
const roMulti = (lines) => DOC(...lines.map((l) => P(T(l))));   // object doc — narrative body / cells
const stem = (lines) => JSON.stringify(DOC(...lines.map((l) => P(T(l)))));           // lead-in + cue paragraphs
const stemCloze = (cue, parts) => JSON.stringify(DOC(P(T(cue)), P(...parts.map((s) => T(s.blank || s.t)))));
const rat = (text) => JSON.stringify(DOC(P(T(text))));

// ---------- merge-table helpers ----------
let cidN = 0;
const cell = (text, heading = false, opts = {}) => ({ id: 'c' + (cidN++), colspan: opts.colspan || 1, content: text === '' ? DOC(P()) : DOC(P(T(text))), covered: !!opts.covered, heading, rowspan: opts.rowspan || 1 });
function gridTable(id, matrix, rowVis) {           // matrix: [[{text,heading}]]; rowVis: [n per row]
  cidN = 0;
  const grid = matrix.map((row) => row.map((c) => cell(c.text, !!c.heading)));
  return { id, cols: matrix[0].length, grid, rows: matrix.map((_, i) => ({ id: 'r' + i, visibleFrom: rowVis[i] })) };
}
function bannerTable(id, title, headerRow, dataRows) {   // standalone snapshot table (all visibleFrom 1)
  cidN = 0; const cols = headerRow.length; const grid = [];
  const banner = [{ id: 'c' + (cidN++), colspan: cols, content: DOC({ type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: title, marks: [{ type: 'bold' }, { type: 'italic' }] }] }), covered: false, heading: true, rowspan: 1 }];
  for (let i = 1; i < cols; i++) banner.push({ id: 'c' + (cidN++), colspan: 1, content: DOC(P()), covered: true, heading: false, rowspan: 1 });
  grid.push(banner); grid.push(headerRow.map((t) => cell(t, true)));
  for (const dr of dataRows) grid.push(dr.map((t) => cell(t, false)));
  return { id, cols, grid, rows: grid.map((_, i) => ({ id: 'r' + i, visibleFrom: 1 })) };
}
const nEntry = (id, chips, lines, vf) => ({ id, body: roMulti(lines), chips, visibleFrom: vf });
const optionList = (arr) => arr.map((o) => ({ id: o.id, text: rs(o.text) }));   // arr: [{id,text}]

// ================= DATA — FILL THIS =================
// Query the TARGET db for next ids first (see SKILL.md step 4).
const CASE = 'NCLEX_CS_000NN';
const caseTitle = 'TODO';
const caseSummary = 'TODO scenario summary sentence.';
const CASE_TAGS = ['Maryland', 'TODO'];

const caseTabs = [
  // { key:'nurses_notes', title:"Nurses' Notes", order:0, custom:false, shape:null,       entries:{v:2, entries:[ nEntry('e0',['12:00'],['...'],1), ... ]} },
  // { key:'custom_grid',  title:'Vital Signs',    order:1, custom:true,  shape:'rows_cols', entries:{v:2, tables:[ gridTable('t0', [[{text:'Time',heading:false},{text:'Temperature',heading:true},...],[{text:'12:00'},...]], [1,1,2,...]) ]} },
  // { key:'custom_narrative', title:'Medications', order:2, custom:true, shape:'free_text', entries:{v:2, entries:[ {id:'e0', body:roMulti(['drug 1','drug 2']), chips:[], visibleFrom:1} ]} },
  // { key:'orders',       title:'Orders',         order:4, custom:false, shape:null,       entries:{v:2, entries:[ {id:'e0', body:roMulti([...]), chips:[], visibleFrom:5} ]} },
];

const CH = [
  // { item_id:'NCLEX_SELN_000NN', qtype:'SELECT_N', position:1, cjmm:'Recognise cues',
  //   stem: stem(['Which 4 findings are most significant?']),
  //   content: { options: optionList([{id:'A',text:'...'},...]), select_count:4 },
  //   correct: { answers:['B','C','D','G'], feedback:{} },
  //   rationale: rat('...') },
  // MATRIX_MR: content {rows,columns,row_label}, correct {cells:{r1:['c1'],...}}
  // CLOZE: stem: stemCloze('cue',[{t:'The ... is '},{blank:'{1}'},{t:'.'}]); content {blanks:[{id:'b1',choices:[{id:'c1',text:'plain'}]}]}; correct {answers:{b1:'c2'}}
  // MATRIX: correct {cells:{r1:'c3',...}}
  // SATA: content {options}, correct {answers}
];
// ===================================================

// preview
console.log(JSON.stringify({ case: CASE, tabs: caseTabs.map((t) => t.title), children: CH.map((q) => ({ id: q.item_id, type: q.qtype, pos: q.position, cjmm: q.cjmm, correct: q.correct.answers || q.correct.cells })) }, null, 1));

if (process.argv.includes('--insert')) {
  const MAIN = 'C:/Users/confi/qacademy-mynclex';                 // main checkout (has @supabase/supabase-js)
  const ROOT = MAIN + '/.claude/worktrees';                        // adjust to the current worktree if needed
  const envPath = process.env.ENV_LOCAL || (MAIN + '/.env.local'); // point at the worktree .env.local
  const env = fs.readFileSync(envPath, 'utf8');
  const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1].trim();
  const url = get('NEXT_PUBLIC_SUPABASE_URL'), key = get('SUPABASE_SERVICE_ROLE_KEY');
  const DEV_REF = 'xkqxfzfsllxyxpdtcrja';
  if (!url.includes(DEV_REF)) throw new Error('Refusing: .env.local is not the DEV project. Got ' + url + '. (Prod inserts go via the prod MCP execute_sql tool, with explicit approval — never this script.)');
  const { createClient } = require(MAIN + '/node_modules/@supabase/supabase-js');
  const db = createClient(url, key, { auth: { persistSession: false } });
  (async () => {
    const step = async (label, p) => { const { error } = await p; if (error) { console.error('FAIL', label, error.message); process.exit(1); } console.log('ok', label); };
    if (caseTabs.length) {
      await step('case', db.from('nclex_case_studies').insert({ case_id: CASE, title: caseTitle, scenario_summary: rs(caseSummary), tags: CASE_TAGS, is_free_sample: false, is_builder_visible: true, is_published: false }));
      await step('tabs', db.from('nclex_case_study_tabs').insert(caseTabs.map((tb, i) => ({ tab_id: `${CASE}_TAB_${i + 1}`, case_id: CASE, tab_key: tb.key, title: tb.title, display_order: tb.order, is_custom: tb.custom, custom_shape: tb.shape, columns_def: [], entries: tb.entries }))));
      await step('items', db.from('nclex_bank_items').insert(CH.map((q) => ({ item_id: q.item_id, question_type: q.qtype, stem: q.stem, rationale: q.rationale, content: q.content, correct: q.correct, instruction: null, marks: 1, is_published: false, is_builder_visible: true, tags: [], parent_case_id: CASE }))));
      await step('links', db.from('nclex_case_study_items').insert(CH.map((q, i) => ({ id: `${CASE}_ITEM_${i + 1}`, case_id: CASE, item_id: q.item_id, position: q.position, cjmm_step: q.cjmm }))));
    }
    console.log('DONE', CASE);
  })();
}
