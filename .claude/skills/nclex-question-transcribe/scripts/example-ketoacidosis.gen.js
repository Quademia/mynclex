// Generator for the Maryland "Type II Diabetes & Ketoacidosis" specimen →
// MyNclex dev bank. Emits case.sql + bowtie.sql. Byte-shapes mirror Sam's
// authored NCLEX_CS_00015 / NCLEX_TRD_00001 (pulled as templates).
const fs = require('fs');
const DIR = __dirname;

// ---------- Tiptap builders ----------
const T = (text) => ({ type: 'text', text });
const P = (...kids) => kids.length ? { type: 'paragraph', attrs: { textAlign: 'left' }, content: kids }
                                   : { type: 'paragraph', attrs: { textAlign: 'left' } };
const DOC = (...paras) => ({ type: 'doc', content: paras });
// rich string (for options / rows / columns / tokens — stored as STRING inside content jsonb)
const rs = (text) => JSON.stringify(DOC(P(T(text))));
// rich string, single line — plain-text tiptap
// tiptap doc OBJECT (for tab cells / narrative bodies — nested in entries jsonb)
const ro = (text) => DOC(P(T(text)));
const roMulti = (lines) => DOC(...lines.map((l) => P(T(l))));

// ---------- merge-table cell/grid helpers ----------
let cidN = 0;
const cell = (text, heading = false, opts = {}) => ({
  id: 'c' + (cidN++),
  colspan: opts.colspan || 1,
  content: text === '' ? DOC(P()) : DOC(P(T(text))),
  covered: !!opts.covered,
  heading,
  rowspan: opts.rowspan || 1,
});
// build a simple rectangular grid table (no merges) from a 2D array of {text,heading}
function gridTable(id, matrix, rowVis) {
  cidN = 0;
  const grid = matrix.map((row) => row.map((c) => cell(c.text, !!c.heading)));
  const rows = matrix.map((_, i) => ({ id: 'r' + i, visibleFrom: rowVis[i] }));
  return { id, cols: matrix[0].length, grid, rows };
}
// build a table whose first row is a full-width centred heading banner (bowtie style)
function bannerTable(id, title, headerRow, dataRows) {
  cidN = 0;
  const cols = headerRow.length;
  const grid = [];
  // banner row: heading cell colspan=cols + (cols-1) covered cells
  const banner = [ { id: 'c' + (cidN++), colspan: cols, content: DOC({ type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: title, marks: [{ type: 'bold' }, { type: 'italic' }] }] }), covered: false, heading: true, rowspan: 1 } ];
  for (let i = 1; i < cols; i++) banner.push({ id: 'c' + (cidN++), colspan: 1, content: DOC(P()), covered: true, heading: false, rowspan: 1 });
  grid.push(banner);
  grid.push(headerRow.map((t) => cell(t, true)));
  for (const dr of dataRows) grid.push(dr.map((t) => cell(t, false)));
  const rows = grid.map((_, i) => ({ id: 'r' + i, visibleFrom: 1 }));
  return { id, cols, grid, rows };
}

// ---------- narrative entry helper ----------
const nEntry = (id, chips, lines, vf) => ({ id, body: roMulti(lines), chips, visibleFrom: vf });

// ================= CASE =================
const CASE = 'NCLEX_CS_00003';
const caseTitle = 'Diabetic Ketoacidosis';
const caseSummary = "A 73-year-old male client with a history of type II diabetes presented to the emergency department for a change in mental status. Client is diagnosed with ketoacidosis.";

// ---- Nurses' Notes (narrative) ----
const nn = {
  v: 2,
  entries: [
    nEntry('e0', ['12:00'], ["73-year-old male with a history of diabetes type II brought to the emergency department by spouse for changes in mental status from his baseline. The client's wife reports that he woke at 0600 to complete his morning routine. At approximately 1100 he became unaware of his surroundings and began sweating profusely and slurring his words. Breath sounds are clear but noted with a fruity citrus odor and deep rapid respirations. Sinus tachycardia per cardiac monitor. He is awake and alert, pupils equal and reactive to light. Weight 205lbs (93kg)"], 1),
    nEntry('e1', ['12:15'], ["Voided 30mL dark amber urine sent for urinalysis. Comprehensive metabolic panel, CBC, and ABG. IV of normal saline started. 2L O2 started per NC. Capillary glucose is 440."], 2),
    nEntry('e2', ['12:30'], ["Transferred to ICU. IV fluids bolus given."], 6),
    nEntry('e3', ['13:00'], ["Started on maintenance IV fluids and insulin drip."], 6),
    nEntry('e4', ['13:30'], ["Capillary glucose 435. Awake, alert, oriented to person and place, talking in full complete sentences. Denies pain. Breath sounds are clear. Voided 300mL clear color urine."], 6),
  ],
};

// ---- Vital Signs (rotated merge table: metrics = columns, times = rows) ----
const vitMatrix = [
  [{ text: 'Time', heading: false }, { text: 'Temperature', heading: true }, { text: 'Pulse', heading: true }, { text: 'RR', heading: true }, { text: 'B/P', heading: true }, { text: 'Saturations', heading: true }],
  [{ text: '12:00' }, { text: '99.5 F (37.5 C)' }, { text: '118' }, { text: '32' }, { text: '97/66' }, { text: '89% on RA' }],
  [{ text: '12:15' }, { text: '99.5 F (37.5 C)' }, { text: '115' }, { text: '30' }, { text: '98/70' }, { text: '92% on 2L NC' }],
  [{ text: '13:00' }, { text: '98.9 F (37.1 C)' }, { text: '105' }, { text: '30' }, { text: '100/70' }, { text: '94% on 2L NC' }],
  [{ text: '13:30' }, { text: '98.9 F (37.1 C)' }, { text: '100' }, { text: '24' }, { text: '109/70' }, { text: '95% on 2L NC' }],
];
const vit = { v: 2, tables: [gridTable('t0', vitMatrix, [1, 1, 2, 6, 6])] };

// ---- Medications (narrative, static from Q1) ----
const meds = { v: 2, entries: [ { id: 'e0', body: roMulti(['Empagliflozin 10 mg PO daily', 'Sitagliptin / metformin 50-1000 mg PO daily', 'Valsartan 160 mg PO daily']), chips: [], visibleFrom: 1 } ] };

// ---- Laboratory Report (merge table, appears Q2) ----
const labMatrix = [
  [{ text: 'Lab', heading: true }, { text: 'Results', heading: true }, { text: 'Reference range', heading: true }],
  [{ text: 'ABG pH' }, { text: '7.20' }, { text: '7.35-7.45' }],
  [{ text: 'ABG PCO2' }, { text: '45' }, { text: '35-45 mmHg' }],
  [{ text: 'ABG HCO3' }, { text: '32' }, { text: '22-26 mEq/L' }],
  [{ text: 'Creatinine (Serum)' }, { text: '1.9' }, { text: '0.9 to 1.4 mg/dL' }],
  [{ text: 'Glucose random' }, { text: '435' }, { text: '70-140 mg/dL' }],
  [{ text: 'Urine ketones' }, { text: 'Positive ketones' }, { text: 'Negative' }],
  [{ text: 'Potassium (serum)' }, { text: '3.4' }, { text: '3.5 to 5 mEq/L' }],
];
const lab = { v: 2, tables: [gridTable('t0', labMatrix, [2, 2, 2, 2, 2, 2, 2, 2])] };

// ---- Orders (narrative built-in, appears Q5) ----
const orders = { v: 2, entries: [ { id: 'e0', body: roMulti(['Admit to ICU with diagnosis of ketoacidosis', 'Give 1000ml IV 0.9 NS fluid bolus over 30 minutes', 'Then start .9NS with 20mEQ KCL/100 mL at 125mL/hr', 'Start regular insulin infusion at 0.1 Units/kg/h after fluid bolus', 'Finger stick blood glucose hourly; titrate insulin infusion-based on ICU protocol', 'Obtain electrolytes every 2 hours', 'Continuous cardiac monitoring']), chips: [], visibleFrom: 5 } ] };

const caseTabs = [
  { key: 'nurses_notes', title: "Nurses' Notes", order: 0, custom: false, shape: null, entries: nn },
  { key: 'custom_grid', title: 'Vital Signs', order: 1, custom: true, shape: 'rows_cols', entries: vit },
  { key: 'custom_narrative', title: 'Medications', order: 2, custom: true, shape: 'free_text', entries: meds },
  { key: 'custom_grid', title: 'Laboratory Report', order: 3, custom: true, shape: 'rows_cols', entries: lab },
  { key: 'orders', title: 'Orders', order: 4, custom: false, shape: null, entries: orders },
];

// ---------- question builders ----------
function optionList(arr) { // arr of {id,text}
  return arr.map((o) => ({ id: o.id, text: rs(o.text) }));
}
// stem = optional lead-in + cue (each its own paragraph)
function stem(lines) { return JSON.stringify(DOC(...lines.map((l) => P(T(l))))); }
function stemCloze(cue, sentenceParts) {
  // sentenceParts: array of {t} text or {blank:'{1}'}
  const sent = sentenceParts.map((s) => s.blank ? T(s.blank) : T(s.t));
  return JSON.stringify(DOC(P(T(cue)), P(...sent)));
}
const rat = (text) => JSON.stringify(DOC(P(T(text))));

const CH = []; // case children: {item_id, qtype, stem, content, correct, rationale, position, cjmm}

// Q1 SELECT_N
CH.push({
  item_id: 'NCLEX_SELN_00007', qtype: 'SELECT_N', position: 1, cjmm: 'Recognise cues',
  stem: stem(['Which 4 findings are most significant?']),
  content: { options: optionList([
    { id: 'A', text: 'Lung sounds' }, { id: 'B', text: 'History of type II diabetes' },
    { id: 'C', text: 'Respiratory status' }, { id: 'D', text: 'Circulation' },
    { id: 'E', text: 'Pupils' }, { id: 'F', text: 'Temperature' },
    { id: 'G', text: 'Mental status' }, { id: 'H', text: 'Medications' },
  ]), select_count: 4 },
  correct: { answers: ['B', 'C', 'D', 'G'], feedback: {} },
  rationale: rat("Because the client has a history of type II diabetes, the nurse should follow up with signs that the client's diabetes may be out of control such as the deep and rapid respirations, the odor on the breath, and mental changes. The low B/P and tachycardia can indicate severe hypovolemia."),
});

// Q2 MATRIX_MR
CH.push({
  item_id: 'NCLEX_MMR_00004', qtype: 'MATRIX_MR', position: 2, cjmm: 'Analyse cues',
  stem: stem(['The nurse starts an IV and reviews the labs.', 'For each finding click to specify if it is consistent with ketoacidosis or hyperglycemic hyperosmolar syndrome. Each finding may support more than one condition. Each column must have at least 1 correct option.']),
  content: {
    rows: [ { id: 'r1', text: rs('Ph') }, { id: 'r2', text: rs('Blood glucose') }, { id: 'r3', text: rs('Serum creatinine') }, { id: 'r4', text: rs('Urine') } ],
    columns: [ { id: 'c1', text: rs('Ketoacidosis') }, { id: 'c2', text: rs('Hyperglycemic hyperosmolar syndrome') } ],
    row_label: rs('Laboratory Report'),
  },
  correct: { cells: { r1: ['c1'], r2: ['c1'], r3: ['c1', 'c2'], r4: ['c1'] }, feedback: {} },
  rationale: rat('Serum blood glucose levels in diabetic ketoacidosis can fluctuate between 300 and 800mg/dl. It is typically above 600 mg/dL with HHS. Low pH and urine ketones are seen with DKA. Those values are typically normal with HHS. Both conditions can cause dehydration and elevated creatine.'),
});

// Q3 CLOZE
CH.push({
  item_id: 'NCLEX_CLZ_00019', qtype: 'CLOZE', position: 3, cjmm: 'Prioritise',
  stem: stemCloze('Complete the sentence from the list of drop-down options.', [ { t: 'The problem the nurse should address first is ' }, { blank: '{1}' }, { t: '.' } ]),
  content: { blanks: [ { id: 'b1', choices: [ { id: 'c1', text: 'Correcting pH' }, { id: 'c2', text: 'Restoring volume' }, { id: 'c3', text: 'Lowering glucose' } ] } ] },
  correct: { answers: { b1: 'c2' }, feedback: {} },
  rationale: rat('The priority for care is to restore volume so the client has adequate perfusion. Once the volume is improved, insulin therapy can begin to slowly bring the glucose down. The client will be monitored to determine if the acidosis is getting worse, giving sodium bicarbonate is not done unless the pH is <6.9'),
});

// Q4 MATRIX (single)
CH.push({
  item_id: 'NCLEX_MAT_91005', qtype: 'MATRIX', position: 4, cjmm: 'Generate solutions',
  stem: stem(['The client is diagnosed with ketoacidosis and the nurse begins to plan care.', 'For each nursing intervention, click to specify whether the intervention is indicated, contraindicated or non-essential.']),
  content: {
    rows: [ { id: 'r1', text: rs('Obtain glycosylated hemoglobin A1C') }, { id: 'r2', text: rs('Teach the client pursed-lipped breathing') }, { id: 'r3', text: rs('Administer insulin glargine subcutaneous') }, { id: 'r4', text: rs('Insert dwelling foley catheter') }, { id: 'r5', text: rs('Administer IV potassium') }, { id: 'r6', text: rs('Monitor EKG') } ],
    columns: [ { id: 'c1', text: rs('Indicated') }, { id: 'c2', text: rs('Contraindicated') }, { id: 'c3', text: rs('Non-Essential') } ],
    row_label: rs('Nursing Intervention'),
  },
  correct: { cells: { r1: 'c3', r2: 'c1', r3: 'c2', r4: 'c2', r5: 'c1', r6: 'c1' }, feedback: {} },
  rationale: rat("The nurse monitors fingerstick glucoses. The glycosylated hemoglobin A1C is not a good indicator to determine the effectiveness of treatment. Pursed-lipped breathing will help slow the pace of breathing. Treatment for DKA is with regular insulin, not glargine, because it can given IV and titrated to slowly achieve goals. The client's urine output should be measured with a urinal. Clients with diabetes have a high risk of developing infections and a high risk of delayed healing time, thereby an indwelling catheter poses a greater risk for infection. Cardiovascular changes can be observed with mild acidosis. Prolonged and untreated acidosis can lead to the onset of hyperkalemia. The heart rate will decrease, T waves become tall and peaked, and the QRS complex widens. Conversely, hypokalemia can result with insulin therapy; potassium replacement is initiated when serum levels fall below the normal range."),
});

// Q5 SATA
CH.push({
  item_id: 'NCLEX_SATA_90013', qtype: 'SATA', position: 5, cjmm: 'Take action',
  stem: stem(['The nurse reviews the orders.', 'What actions should the nurse take while implementing the treatment plan? Select all that apply.']),
  content: { options: optionList([
    { id: 'A', text: 'Begin insulin after bolus at 0.9 Units/hr' },
    { id: 'B', text: 'Anticipate holding insulin for low potassium levels' },
    { id: 'C', text: 'Request IV fluids with dextrose when glucose levels start to normalize' },
    { id: 'D', text: 'Allow client to eat when status stabilizes' },
    { id: 'E', text: 'Monitor for symptoms of fluid overload' },
  ]) },
  correct: { answers: ['B', 'C', 'D', 'E'], feedback: {} },
  rationale: rat("Hypokalemia can result with insulin therapy. Insulin is typically held if levels fall below 3.3mEq/L. Dextrose is added to IV fluids when glucose levels stabilize to prevent hypoglycemia. Clients can eat when their respiratory status is stable, and they feel like eating. During the initial phase of treating the client for DKA, the nurse should monitor the client's status to prevent the onset of fluid overload. The client weighs 93 kg so based on orders the starting rate would be 9.3 Units/hr."),
});

// Q6 SATA
CH.push({
  item_id: 'NCLEX_SATA_90014', qtype: 'SATA', position: 6, cjmm: 'Evaluate outcomes',
  stem: stem(['The nurse reassesses the client after giving a fluid bolus and starting the insulin infusion.', 'Which findings indicate the treatment plan has been effective? Select all that apply.']),
  content: { options: optionList([
    { id: 'A', text: 'Blood pressure' }, { id: 'B', text: 'Mental status' }, { id: 'C', text: 'Breath sounds' },
    { id: 'D', text: 'Pulse 100 bpm' }, { id: 'E', text: 'Capillary glucose' }, { id: 'F', text: 'Pain levels' },
  ]) },
  correct: { answers: ['A', 'B', 'D'], feedback: {} },
  rationale: rat("Treatment of diabetic ketoacidosis focuses on managing and correcting the serum glucose along with correcting dehydration, electrolyte imbalances and acidosis. With the administration of the intravenous fluids and the insulin infusion, the accumulated ketone bodies are reversed, thereby correcting the acidotic state, and ending the production of ketones from the fat breakdown. Reversal of the ketone production and correction of the fluid and electrolyte imbalance, the compensatory mechanisms are stimulated. The blood pressure will increase, and the heart rate will decrease. With the cells being rehydrated and glucose moving into the cells, the client's neurological status should improve. Pain was not a primary issue and breath sounds were clear to start. The blood glucose has not yet begun to decrease."),
});

// ================= SQL emit =================
function dq(s) { return '$DKA$' + s + '$DKA$'; }
const arr = (a) => "ARRAY[" + a.map((x) => "'" + x.replace(/'/g, "''") + "'") + "]::text[]";

let sql = 'BEGIN;\n\n';
// case row
sql += `INSERT INTO nclex_case_studies (case_id,title,scenario_summary,tags,is_free_sample,is_builder_visible,is_published)\nVALUES ('${CASE}', ${dq(caseTitle)}, ${dq(rs(caseSummary))}, ${arr(['Maryland','Ketoacidosis'])}, false, true, false);\n\n`;
// tabs
caseTabs.forEach((tb, i) => {
  sql += `INSERT INTO nclex_case_study_tabs (tab_id,case_id,tab_key,title,display_order,is_custom,custom_shape,columns_def,entries)\nVALUES ('${CASE}_TAB_${i + 1}','${CASE}',${dq(tb.key)},${dq(tb.title)},${tb.order},${tb.custom},${tb.shape ? dq(tb.shape) : 'NULL'},'[]'::jsonb,${dq(JSON.stringify(tb.entries))}::jsonb);\n\n`;
});
// children + links
CH.forEach((q, i) => {
  sql += `INSERT INTO nclex_bank_items (item_id,question_type,stem,rationale,content,correct,instruction,marks,is_published,is_builder_visible,tags,parent_case_id)\nVALUES ('${q.item_id}',${dq(q.qtype)},${dq(q.stem)},${dq(q.rationale)},${dq(JSON.stringify(q.content))}::jsonb,${dq(JSON.stringify(q.correct))}::jsonb,NULL,1,false,true,'{}'::text[],'${CASE}');\n`;
  sql += `INSERT INTO nclex_case_study_items (id,case_id,item_id,position,cjmm_step)\nVALUES ('${CASE}_ITEM_${i + 1}','${CASE}','${q.item_id}',${q.position},${dq(q.cjmm)});\n\n`;
});
sql += 'COMMIT;\n';
fs.writeFileSync(DIR + '/case.sql', sql);

// verification summary
const sum = {
  case: CASE, tabs: caseTabs.map((t) => t.title),
  children: CH.map((q) => ({ id: q.item_id, type: q.qtype, pos: q.position, cjmm: q.cjmm, correct: q.correct.answers || q.correct.cells })),
};
console.log(JSON.stringify(sum, null, 1));
console.log('case.sql bytes:', sql.length);

// ---------- direct insert into dev via supabase-js ----------
if (process.argv.includes('--insert')) {
  const ROOT = 'C:/Users/confi/qacademy-mynclex/.claude/worktrees/recursing-boyd-d68c11';
  const env = fs.readFileSync(ROOT + '/.env.local', 'utf8');
  const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1].trim();
  const url = get('NEXT_PUBLIC_SUPABASE_URL');
  const key = get('SUPABASE_SERVICE_ROLE_KEY');
  if (!/xkqxfzfsllxyxpdtcrja/.test(url)) throw new Error('Refusing: .env.local URL is not the dev project. Got: ' + url);
  const { createClient } = require('C:/Users/confi/qacademy-mynclex/node_modules/@supabase/supabase-js');
  const db = createClient(url, key, { auth: { persistSession: false } });

  (async () => {
    const caseRow = { case_id: CASE, title: caseTitle, scenario_summary: rs(caseSummary), tags: ['Maryland', 'Ketoacidosis'], is_free_sample: false, is_builder_visible: true, is_published: false };
    const tabRows = caseTabs.map((tb, i) => ({ tab_id: `${CASE}_TAB_${i + 1}`, case_id: CASE, tab_key: tb.key, title: tb.title, display_order: tb.order, is_custom: tb.custom, custom_shape: tb.shape, columns_def: [], entries: tb.entries }));
    const itemRows = CH.map((q) => ({ item_id: q.item_id, question_type: q.qtype, stem: q.stem, rationale: q.rationale, content: q.content, correct: q.correct, instruction: null, marks: 1, is_published: false, is_builder_visible: true, tags: [], parent_case_id: CASE }));
    const linkRows = CH.map((q, i) => ({ id: `${CASE}_ITEM_${i + 1}`, case_id: CASE, item_id: q.item_id, position: q.position, cjmm_step: q.cjmm }));

    const step = async (label, p) => { const { error } = await p; if (error) { console.error('FAIL', label, error.message); process.exit(1); } console.log('ok', label); };
    await step('case', db.from('nclex_case_studies').insert(caseRow));
    await step('tabs', db.from('nclex_case_study_tabs').insert(tabRows));
    await step('items', db.from('nclex_bank_items').insert(itemRows));
    await step('links', db.from('nclex_case_study_items').insert(linkRows));
    console.log('DONE case', CASE);
  })();
}
