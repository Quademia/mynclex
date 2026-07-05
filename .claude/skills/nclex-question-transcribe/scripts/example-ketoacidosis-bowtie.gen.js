// Bowtie + trend wrapper for the DKA specimen → dev. Mirrors Sam's
// NCLEX_TRD_00001 / NCLEX_BT_00001 shapes (banner tables in one custom_grid tab).
const fs = require('fs');
const T = (text) => ({ type: 'text', text });
const P = (...kids) => kids.length ? { type: 'paragraph', attrs: { textAlign: 'left' }, content: kids } : { type: 'paragraph', attrs: { textAlign: 'left' } };
const DOC = (...paras) => ({ type: 'doc', content: paras });
const rs = (text) => JSON.stringify(DOC(P(T(text))));
const stem = (lines) => JSON.stringify(DOC(...lines.map((l) => P(T(l)))));
const rat = (text) => JSON.stringify(DOC(P(T(text))));

let cidN = 0;
const c = (text, heading, opts = {}) => ({ id: 'c' + (cidN++), colspan: opts.colspan || 1, content: text === '' ? DOC(P()) : DOC(P(T(text))), covered: !!opts.covered, heading: !!heading, rowspan: 1 });
function bannerTable(id, title, headerRow, dataRows) {
  cidN = 0;
  const cols = headerRow.length;
  const grid = [];
  const banner = [{ id: 'c' + (cidN++), colspan: cols, content: DOC({ type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: title, marks: [{ type: 'bold' }, { type: 'italic' }] }] }), covered: false, heading: true, rowspan: 1 }];
  for (let i = 1; i < cols; i++) banner.push({ id: 'c' + (cidN++), colspan: 1, content: DOC(P()), covered: true, heading: false, rowspan: 1 });
  grid.push(banner);
  grid.push(headerRow.map((t) => c(t, true)));
  for (const dr of dataRows) grid.push(dr.map((t) => c(t, false)));
  return { id, cols, grid, rows: grid.map((_, i) => ({ id: 'r' + i, visibleFrom: 1 })) };
}

const TREND = 'NCLEX_TRD_00005';
const BT = 'NCLEX_BT_00009';
const summary = "A 73-year-old male client with a history of type II diabetes presented to the emergency department for a change in mental status. Client is diagnosed with ketoacidosis.";

const note1200 = "73-year-old male with a history of diabetes type II brought to the emergency department by spouse for changes in mental status from his baseline. The client's wife reports that he woke at 0600 to complete his morning routine. At approximately 1100 he became unaware of his surroundings and began sweating profusely and slurring his words. Breath sounds are clear but noted with a fruity citrus odor and deep rapid respirations. Sinus tachycardia per cardiac monitor. He is awake and alert, pupils equal and reactive to light. Weight 205lbs (93kg)";
const note1215 = "Voided 30mL dark amber urine sent for urinalysis. Comprehensive metabolic panel, CBC, and ABG. IV of normal saline started. 2L O2 started per NC. Capillary glucose is 440.";

const t0 = bannerTable('t0', "Nurses' Notes", ['Time', 'Note'], [['12:00', note1200], ['12:15', note1215]]);
const t1 = bannerTable('t1', 'Vital Signs', ['Time', '12:00', '12:15'], [
  ['Temperature', '99.5 F (37.5 C)', '99.5 F (37.5 C)'],
  ['Pulse', '118', '115'],
  ['Respiratory rate', '32', '30'],
  ['Blood pressure', '97/66', '98/70'],
  ['Saturation', '89% on RA', '92% on 2L NC'],
]);
const t2 = bannerTable('t2', 'Laboratory Report', ['Lab', 'Results', 'Reference range'], [
  ['ABG pH', '7.20', '7.35-7.45'],
  ['ABG PO2', '60', '75-100 mm Hg'],
  ['ABG PCO2', '45', '35-45 mmHg'],
  ['ABG HCO3', '32', '22-26 mEq/L'],
  ['BUN', '34', '10-20 mg/dL'],
  ['Creatinine (Serum)', '1.9', '0.9 to 1.4 mg/dL'],
  ['Hematocrit', '37', 'Males: 42-52%; Females: 35-47%'],
  ['Hemoglobin', '14', 'Males: 13-18 g/dL; Females: 12-16 g/dL'],
  ['WBC', '4.7', '4.5 - 10.5 x 10^3 cells/mm3'],
  ['Platelets', '140,000', '140,000 to 450,000/mm3'],
  ['Potassium (serum)', '3.4', '3.5 to 5 mEq/L'],
  ['Sodium (serum)', '140', '135 to 145 mEq/L'],
  ['Urine ketones', 'Positive ketones', 'Negative'],
]);
const trendTab = { v: 2, tables: [t0, t1, t2] };

const bt = {
  content: {
    left: { label: 'Actions to take', tokens: [
      { id: 'lt1', text: rs('Administer IV insulin') }, { id: 'lt2', text: rs('Give nitroglycerin') },
      { id: 'lt3', text: rs('Assist with intubation') }, { id: 'lt4', text: rs('Administer antibiotics') },
      { id: 'lt5', text: rs('Infuse normal saline fluid bolus') } ] },
    centre: { label: 'Condition', tokens: [
      { id: 'ct1', text: rs('Cardiogenic shock') }, { id: 'ct2', text: rs('Diabetic ketoacidosis') },
      { id: 'ct3', text: rs('Hyperglycemic hyperosmolar syndrome') }, { id: 'ct4', text: rs('Urinary tract infection with delirium') } ] },
    right: { label: 'Parameters to monitor', tokens: [
      { id: 'rt1', text: rs('Capillary glucose monitoring') }, { id: 'rt2', text: rs('Serial electrocardiogram') },
      { id: 'rt3', text: rs('Arterial blood gases') }, { id: 'rt4', text: rs('Urinalysis') },
      { id: 'rt5', text: rs('Level of consciousness') } ] },
  },
  correct: { left: ['lt1', 'lt5'], right: ['rt1', 'rt5'], centre: 'ct2', feedback: {} },
  stem: stem(['The nurse assesses the client 30 minutes after admission.', "Complete the diagram by dragging from the choices below to specify what condition the client is most likely experiencing, 2 actions the nurse should take to address that condition, and 2 parameters the nurse should monitor to assess the client's progress."]),
  rationale: rat("The labs indicate the client has diabetic ketoacidosis an acute complication of diabetes evidenced by the hyperglycemia, acidosis, and production of ketones. Treatment of diabetic ketoacidosis focuses on managing and correcting the serum glucose along with correcting dehydration and electrolyte imbalances. With the administration of the intravenous fluids and the insulin infusion the accumulated ketone bodies are reversed thereby correcting the acidotic state and ending the production of ketones from the fat breakdown. The nurse closely monitors blood glucose and adjust insulin accordingly. With the cells being rehydrated and glucose moving into the cells the client's neurological status should improve."),
};

console.log(JSON.stringify({ trend: TREND, bt: BT, tables: [t0.rows.length, t1.rows.length, t2.rows.length], correct: bt.correct }, null, 1));

if (process.argv.includes('--insert')) {
  const ROOT = 'C:/Users/confi/qacademy-mynclex/.claude/worktrees/recursing-boyd-d68c11';
  const env = fs.readFileSync(ROOT + '/.env.local', 'utf8');
  const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1].trim();
  const url = get('NEXT_PUBLIC_SUPABASE_URL'); const key = get('SUPABASE_SERVICE_ROLE_KEY');
  if (!/xkqxfzfsllxyxpdtcrja/.test(url)) throw new Error('Refusing: not dev. ' + url);
  const { createClient } = require('C:/Users/confi/qacademy-mynclex/node_modules/@supabase/supabase-js');
  const db = createClient(url, key, { auth: { persistSession: false } });
  (async () => {
    const step = async (label, p) => { const { error } = await p; if (error) { console.error('FAIL', label, error.message); process.exit(1); } console.log('ok', label); };
    await step('trend', db.from('nclex_trend_datasets').insert({ trend_id: TREND, title: 'Diabetic Ketoacidosis', scenario: rs(summary), is_published: false, is_free_sample: false, is_builder_visible: true, tags: ['Maryland', 'Ketoacidosis'] }));
    await step('trend_tab', db.from('nclex_trend_tabs').insert({ tab_id: TREND + '_TAB_1', trend_id: TREND, tab_key: 'custom_grid', title: "Patients' Charts", display_order: 0, is_custom: true, custom_shape: 'rows_cols', columns_def: [], entries: trendTab }));
    await step('bowtie', db.from('nclex_bank_items').insert({ item_id: BT, question_type: 'BOWTIE', stem: bt.stem, rationale: bt.rationale, content: bt.content, correct: bt.correct, instruction: null, marks: 1, is_published: false, is_builder_visible: true, tags: [], trend_id: TREND }));
    console.log('DONE bowtie', BT);
  })();
}
