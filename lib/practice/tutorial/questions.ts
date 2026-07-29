// mynclex/lib/practice/tutorial/questions.ts
//
// The dummy questions for the runner tutorial (sandbox). See
// docs/product-plan/runner-tutorial.md.
//
// WHY THIS DATA LIVES IN CODE (not the bank):
//   These are teaching props, not bank content. Holding them in a
//   constant guarantees they can NEVER leak into the real question bank
//   or the CAT/practice pool (nothing here is a row in nclex_bank_items),
//   and they version with the app. The sandbox route builds a runner
//   bundle from these at request time; no attempt row is ever created,
//   so there is nothing to write and nothing to save.
//
// SHAPE:
//   Each TutorialQuestion carries exactly what one unsealed bank item
//   would: the stem (+ any {N} / [[..]] / [N] markers), instruction,
//   classification, the polymorphic `content` + `correct` (typed against
//   the real lib/bank/types shapes), and the rationale. `marks` is NOT
//   stored here — the sandbox builder derives it with
//   computeMarksFromKey() so it always equals the item's max partial-
//   credit score (the invariant that keeps Submit in range).
//
// This file is the 11 stand-alone question types. The case study and the
// trend are added in a second pass (their stimulus is deep rich-JSON,
// validated on screen) — see sandbox-data.ts for how the bundle is built.

import type { QuestionType, CjmmStep } from '@/lib/bank/classifications';
import type { BankItemContent, BankItemCorrect } from '@/lib/bank/types';

// The classification block, matching nclex_attempt_items.classification_snapshot.
// Drives the meta pills the runner shows in study mode (type · subject ·
// difficulty). Fields we don't exercise are held null, as real rows do.
export interface TutorialClassification {
  tags:                     string[];
  topic:                    string | null;
  subtopic:                 string | null;
  difficulty:               'Easy' | 'Medium' | 'Hard';
  body_system:              string | null;
  nursing_subject:          string | null;
  client_needs_category:    string | null;
  client_needs_subcategory: string | null;
}

// One dummy item — an unsealed bank item's worth of data, authored
// ergonomically. The sandbox builder splits this into a SealedItem (what
// the runner renders) plus the answer key (what the local scorer reads on
// Submit), mirroring exactly how page.tsx seals a real attempt.
export interface TutorialQuestion {
  key:            string;        // stable slug — also the synthetic attempt_item_id
  question_type:  QuestionType;
  stem:           string;        // may carry {N} (cloze) / [[..]] (highlight) / [N] (drag-cloze) markers
  instruction:    string | null; // the action cue ("Select all that apply.", etc.)
  classification: TutorialClassification;
  content:        BankItemContent;
  correct:        BankItemCorrect;
  rationale:      string | null;
  // Case/trend linkage (optional — set only on case children + the trend
  // item). The builder copies these onto the SealedItem so the runner shows
  // the case panel / CJMM strip / trend panel exactly as it would for a real
  // wrapped item.
  parent_case_id?: string;
  case_position?:  number;    // 1..6 within the case
  cjmm_step?:      CjmmStep;   // the clinical-judgment step this child targets
  trend_id?:       string;
}

// A case-study wrapper: the shared scenario + progressive-disclosure chart
// tabs. Shape mirrors nclex_attempt_case_snapshots (validated against a real
// row). `tabs` is the tabs_snapshot_json array the case panel reads.
export interface TutorialCase {
  case_id:  string;
  title:    string;
  scenario: string;
  tabs:     unknown[];
}

// A trend dataset wrapper: scenario + a tab-based stimulus (no progressive
// disclosure). Shape mirrors nclex_attempt_trend_snapshots.
export interface TutorialTrend {
  trend_id:  string;
  title:     string;
  scenario:  string;
  tabs:      unknown[];
}

// Small helper to keep the classification blocks readable below.
function clsf(
  partial: Partial<TutorialClassification> &
    Pick<TutorialClassification, 'difficulty'>,
): TutorialClassification {
  return {
    tags:                     [],
    topic:                    null,
    subtopic:                 null,
    body_system:              null,
    nursing_subject:          null,
    client_needs_category:    null,
    client_needs_subcategory: null,
    ...partial,
  };
}

export const TUTORIAL_QUESTIONS: TutorialQuestion[] = [
  // ── 1. MCQ ──────────────────────────────────────────────────────
  {
    key:           'mcq',
    question_type: 'MCQ',
    stem:          'A client with heart failure reports waking at night short of breath. Which action should the nurse take first?',
    instruction:   'Select the one best answer.',
    classification: clsf({
      difficulty:               'Medium',
      nursing_subject:          'Medical-Surgical',
      body_system:              'Cardiovascular',
      client_needs_category:    'Physiological Integrity',
      client_needs_subcategory: 'Physiological Adaptation',
    }),
    content: {
      options: [
        { id: 'A', text: 'Raise the head of the bed and assess respiratory effort.' },
        { id: 'B', text: 'Notify the healthcare provider.' },
        { id: 'C', text: 'Document paroxysmal nocturnal dyspnoea in the record.' },
        { id: 'D', text: 'Restrict oral fluids for the remainder of the shift.' },
      ],
    },
    correct: {
      answer: 'A',
      feedback: {
        A: 'Correct. Sitting the client upright and assessing breathing addresses the airway/breathing priority first, before escalating or documenting.',
        B: 'The provider may be notified, but the nurse acts to relieve the client first — assessment and positioning come before escalation.',
        C: 'Documentation follows assessment and intervention; it is never the first action when a client is in distress.',
        D: 'Fluid management is a provider order, not the immediate first action for acute breathlessness.',
      },
    },
    rationale:
      'For a client in acute respiratory distress, the nurse acts on airway/breathing first: positioning upright and assessing effort. Escalation and documentation follow the immediate intervention.',
  },

  // ── 2. TF ───────────────────────────────────────────────────────
  {
    key:           'tf',
    question_type: 'TF',
    stem:          'A rising serum potassium of 6.8 mmol/L in a client with acute kidney injury is a medical emergency.',
    instruction:   'Select True or False.',
    classification: clsf({
      difficulty:               'Easy',
      nursing_subject:          'Medical-Surgical',
      body_system:              'Genitourinary',
      client_needs_category:    'Physiological Integrity',
      client_needs_subcategory: 'Reduction of Risk Potential',
    }),
    content: {
      options: [
        { id: 'A', text: 'True' },
        { id: 'B', text: 'False' },
      ],
    },
    correct: {
      answer: 'A',
      feedback: {
        A: 'Correct. Potassium of 6.8 mmol/L risks life-threatening cardiac dysrhythmias and requires immediate action.',
        B: 'Incorrect. Severe hyperkalaemia is a recognised emergency because of its cardiac effects.',
      },
    },
    rationale:
      'A potassium above ~6.5 mmol/L can cause fatal dysrhythmias. It is treated as an emergency: continuous cardiac monitoring and urgent provider notification.',
  },

  // ── 3. SATA ─────────────────────────────────────────────────────
  {
    key:           'sata',
    question_type: 'SATA',
    stem:          'A client is admitted with suspected hypoglycaemia. Which findings support this?',
    instruction:   'Select all that apply.',
    classification: clsf({
      difficulty:               'Medium',
      nursing_subject:          'Medical-Surgical',
      body_system:              'Endocrine',
      client_needs_category:    'Physiological Integrity',
      client_needs_subcategory: 'Physiological Adaptation',
    }),
    content: {
      options: [
        { id: 'A', text: 'Diaphoresis (sweating)' },
        { id: 'B', text: 'Tremor and shakiness' },
        { id: 'C', text: 'Confusion or altered behaviour' },
        { id: 'D', text: 'Warm, flushed, dry skin' },
        { id: 'E', text: 'Fruity-smelling breath' },
      ],
    },
    correct: {
      answers: ['A', 'B', 'C'],
      feedback: {
        A: 'Correct. Sweating is a classic adrenergic sign of hypoglycaemia.',
        B: 'Correct. Tremor reflects the adrenergic response to a falling glucose.',
        C: 'Correct. The brain depends on glucose, so confusion is an early neuroglycopenic sign.',
        D: 'Incorrect. Warm, dry, flushed skin points to hyperglycaemia/DKA, not hypoglycaemia.',
        E: 'Incorrect. Fruity breath is a sign of ketoacidosis (high glucose), not a low.',
      },
    },
    rationale:
      'Hypoglycaemia produces adrenergic signs (sweating, tremor) and neuroglycopenic signs (confusion). Warm dry skin and fruity breath belong to hyperglycaemia/DKA.',
  },

  // ── 4. SELECT_N ─────────────────────────────────────────────────
  {
    key:           'select_n',
    question_type: 'SELECT_N',
    stem:          'A client is prescribed a new potassium-sparing diuretic. Which TWO points are most important to teach?',
    instruction:   'Select exactly 2 options.',
    classification: clsf({
      difficulty:               'Medium',
      nursing_subject:          'Pharmacology',
      client_needs_category:    'Physiological Integrity',
      client_needs_subcategory: 'Pharmacological and Parenteral Therapies',
    }),
    content: {
      select_count: 2,
      options: [
        { id: 'A', text: 'Avoid salt substitutes that contain potassium.' },
        { id: 'B', text: 'Report muscle weakness or an irregular heartbeat.' },
        { id: 'C', text: 'Take the dose at bedtime to reduce urination.' },
        { id: 'D', text: 'Increase intake of bananas and oranges daily.' },
        { id: 'E', text: 'Double the next dose if one is missed.' },
      ],
    },
    correct: {
      answers: ['A', 'B'],
      feedback: {
        A: 'Correct. Salt substitutes are high in potassium and can compound the drug’s potassium-sparing effect.',
        B: 'Correct. Muscle weakness and palpitations can signal hyperkalaemia — teach the client to report them.',
        C: 'A diuretic is best taken in the morning to avoid night-time urination, not at bedtime.',
        D: 'High-potassium foods should be limited, not increased, with a potassium-sparing diuretic.',
        E: 'Doubling a missed dose is never taught — it risks toxicity.',
      },
    },
    rationale:
      'Potassium-sparing diuretics raise the risk of hyperkalaemia. The priority teaching is to avoid added potassium (salt substitutes, high-potassium foods) and to report signs of a high potassium.',
  },

  // ── 5. MATRIX (one column per row) ──────────────────────────────
  {
    key:           'matrix',
    question_type: 'MATRIX',
    stem:          'For each nursing action below, indicate whether it is Appropriate or Contraindicated for a client with a new deep vein thrombosis (DVT) in the left leg.',
    instruction:   'Select one option in each row.',
    classification: clsf({
      difficulty:               'Medium',
      nursing_subject:          'Medical-Surgical',
      body_system:              'Cardiovascular',
      client_needs_category:    'Physiological Integrity',
      client_needs_subcategory: 'Reduction of Risk Potential',
    }),
    content: {
      row_label: 'Nursing action',
      rows: [
        { id: 'r1', text: 'Massage the affected calf to relieve discomfort' },
        { id: 'r2', text: 'Maintain the prescribed anticoagulant therapy' },
        { id: 'r3', text: 'Apply the prescribed graduated compression to the unaffected leg' },
      ],
      columns: [
        { id: 'c1', text: 'Appropriate' },
        { id: 'c2', text: 'Contraindicated' },
      ],
    },
    correct: {
      cells: { r1: 'c2', r2: 'c1', r3: 'c1' },
      feedback: {
        r1: 'Massaging a DVT can dislodge the clot and cause a pulmonary embolism — contraindicated.',
        r2: 'Anticoagulation is the mainstay of DVT treatment — appropriate.',
        r3: 'Compression is applied to the unaffected leg for prophylaxis — appropriate.',
      },
    },
    rationale:
      'Never massage a limb with a known DVT — it risks embolisation. Anticoagulation and prophylactic compression of the unaffected leg are appropriate.',
  },

  // ── 6. MATRIX_MR (one or more columns per row) ──────────────────
  {
    key:           'matrix_mr',
    question_type: 'MATRIX_MR',
    stem:          'For each assessment finding, indicate every body system it may reflect in a client with sepsis.',
    instruction:   'Select all that apply in each row.',
    classification: clsf({
      difficulty:               'Hard',
      nursing_subject:          'Medical-Surgical',
      body_system:              'Multisystem',
      client_needs_category:    'Physiological Integrity',
      client_needs_subcategory: 'Physiological Adaptation',
    }),
    content: {
      row_label: 'Finding',
      rows: [
        { id: 'r1', text: 'Heart rate 122, blood pressure 88/50' },
        { id: 'r2', text: 'Respiratory rate 28, SpO₂ 90%' },
        { id: 'r3', text: 'New confusion and reduced urine output' },
      ],
      columns: [
        { id: 'c1', text: 'Cardiovascular' },
        { id: 'c2', text: 'Respiratory' },
        { id: 'c3', text: 'Neurological' },
        { id: 'c4', text: 'Renal' },
      ],
    },
    correct: {
      cells: {
        r1: ['c1'],
        r2: ['c2'],
        r3: ['c3', 'c4'],
      },
      feedback: {
        r1: 'Tachycardia with hypotension is a cardiovascular response to sepsis.',
        r2: 'Tachypnoea with a falling SpO₂ reflects respiratory involvement.',
        r3: 'New confusion is neurological; a falling urine output signals renal hypoperfusion — both can occur together.',
      },
    },
    rationale:
      'Sepsis is multisystem. A single row can map to more than one system — new confusion (neurological) alongside oliguria (renal) is the clearest example here.',
  },

  // ── 7. BOWTIE (2 left · 1 centre · 2 right) ─────────────────────
  {
    key:           'bowtie',
    question_type: 'BOWTIE',
    stem:          'A client 2 days post-op reports sudden shortness of breath and pleuritic chest pain. Complete the diagram to show the priority condition, the findings that support it, and what to monitor.',
    instruction:   'Drag one option into each box.',
    classification: clsf({
      difficulty:               'Hard',
      nursing_subject:          'Medical-Surgical',
      body_system:              'Respiratory',
      client_needs_category:    'Physiological Integrity',
      client_needs_subcategory: 'Physiological Adaptation',
    }),
    content: {
      left: {
        label: 'Supporting findings',
        tokens: [
          { id: 'lt1', text: 'Sudden pleuritic chest pain' },
          { id: 'lt2', text: 'SpO₂ 88% on room air' },
          { id: 'lt3', text: 'Bradycardia' },
          { id: 'lt4', text: 'Warm, dry skin' },
        ],
      },
      centre: {
        label: 'Priority condition',
        tokens: [
          { id: 'ct1', text: 'Pulmonary embolism' },
          { id: 'ct2', text: 'Myocardial infarction' },
          { id: 'ct3', text: 'Pneumothorax' },
        ],
      },
      right: {
        label: 'Parameters to monitor',
        tokens: [
          { id: 'rt1', text: 'Oxygen saturation' },
          { id: 'rt2', text: 'Respiratory rate' },
          { id: 'rt3', text: 'Blood glucose' },
          { id: 'rt4', text: 'Bowel sounds' },
        ],
      },
    },
    correct: {
      left:   ['lt1', 'lt2'],
      centre: 'ct1',
      right:  ['rt1', 'rt2'],
      feedback: {
        lt1: 'Sudden pleuritic pain is a classic PE finding.',
        lt2: 'A low SpO₂ supports impaired gas exchange from a PE.',
        lt3: 'PE typically causes tachycardia, not bradycardia.',
        lt4: 'Skin signs are not a defining feature of PE.',
        ct1: 'Correct. Post-op immobility plus sudden dyspnoea and pleuritic pain point to a pulmonary embolism.',
        ct2: 'MI usually presents with crushing, not pleuritic, pain.',
        ct3: 'Pneumothorax is possible but less likely given the post-op immobility context.',
        rt1: 'Oxygen saturation is a priority to monitor in a suspected PE.',
        rt2: 'Respiratory rate tracks the client’s gas-exchange status.',
        rt3: 'Blood glucose is unrelated to the acute respiratory picture.',
        rt4: 'Bowel sounds are not relevant to a suspected PE.',
      },
    },
    rationale:
      'The bow-tie links the priority condition (PE) to the findings that support it (pleuritic pain, low SpO₂) and what to monitor (oxygen saturation, respiratory rate).',
  },

  // ── 8. CLOZE (dropdown blanks; stem carries {N} markers) ────────
  {
    key:           'cloze',
    question_type: 'CLOZE',
    stem:          'The nurse reviews a client in early shock. The blood pressure is expected to be {1} and the heart rate is expected to be {2}.',
    instruction:   'Choose the option that completes each sentence.',
    classification: clsf({
      difficulty:               'Medium',
      nursing_subject:          'Medical-Surgical',
      body_system:              'Cardiovascular',
      client_needs_category:    'Physiological Integrity',
      client_needs_subcategory: 'Physiological Adaptation',
    }),
    content: {
      blanks: [
        {
          id: 'b1',
          choices: [
            { id: 'c1', text: 'low' },
            { id: 'c2', text: 'high' },
            { id: 'c3', text: 'unchanged' },
          ],
        },
        {
          id: 'b2',
          choices: [
            { id: 'c1', text: 'raised' },
            { id: 'c2', text: 'lowered' },
            { id: 'c3', text: 'unchanged' },
          ],
        },
      ],
    },
    correct: {
      answers: { b1: 'c1', b2: 'c1' },
      feedback: {
        b1: {
          c1: 'Correct. In shock, perfusion falls and blood pressure drops.',
          c2: 'A high blood pressure is not expected in shock.',
          c3: 'Blood pressure changes in shock — it does not stay the same.',
        },
        b2: {
          c1: 'Correct. Heart rate rises to compensate for the falling perfusion.',
          c2: 'A lowered heart rate is a late, ominous sign, not the early expectation.',
          c3: 'Heart rate changes early in shock as a compensatory response.',
        },
      },
    },
    rationale:
      'Early shock is defined by falling perfusion: blood pressure drops and the heart rate rises to compensate.',
  },

  // ── 9. HIGHLIGHT (stem carries [[..]] clickable chunks) ─────────
  {
    key:           'highlight',
    question_type: 'HIGHLIGHT',
    stem:          'Nurse’s note: The client is [[drowsy but rousable]], reports [[a headache rated 7/10]], has [[warm pink skin]], and shows [[a widening pulse pressure]]. Vital signs are otherwise stable.',
    instruction:   'Highlight the findings that require immediate follow-up.',
    classification: clsf({
      difficulty:               'Hard',
      nursing_subject:          'Medical-Surgical',
      body_system:              'Neurological',
      client_needs_category:    'Physiological Integrity',
      client_needs_subcategory: 'Reduction of Risk Potential',
    }),
    content: {
      chunks: [
        { id: 'h1', text: 'drowsy but rousable' },
        { id: 'h2', text: 'a headache rated 7/10' },
        { id: 'h3', text: 'warm pink skin' },
        { id: 'h4', text: 'a widening pulse pressure' },
      ],
    },
    correct: {
      correct_ids: ['h1', 'h2', 'h4'],
      feedback: {
        h1: 'Correct. A falling level of consciousness is an early sign of rising intracranial pressure.',
        h2: 'Correct. A new, severe headache is a red-flag neurological finding.',
        h3: 'Warm pink skin is a normal finding — not a cause for immediate follow-up.',
        h4: 'Correct. A widening pulse pressure is part of Cushing’s triad and signals rising intracranial pressure.',
      },
    },
    rationale:
      'Drowsiness, a severe new headache, and a widening pulse pressure together point to rising intracranial pressure and need immediate follow-up. Warm pink skin is normal.',
  },

  // ── 10. DRAG_CLOZE (drag tokens into [N] slots in the sentence) ─
  {
    key:           'drag_cloze',
    question_type: 'DRAG_CLOZE',
    stem:          'Complete the teaching: the client should take the inhaler [1] and then [2] before the next dose.',
    instruction:   'Drag one option into each blank.',
    classification: clsf({
      difficulty:               'Easy',
      nursing_subject:          'Pharmacology',
      client_needs_category:    'Physiological Integrity',
      client_needs_subcategory: 'Pharmacological and Parenteral Therapies',
    }),
    content: {
      slots: [
        { id: 's1', target_text: 'first step' },
        { id: 's2', target_text: 'second step' },
      ],
      tokens: [
        { id: 't1', text: 'shake the canister' },
        { id: 't2', text: 'wait 30 seconds' },
        { id: 't3', text: 'swallow a tablet' },
      ],
    },
    correct: {
      slots: { s1: 't1', s2: 't2' },
      feedback: {
        t1: 'Correct for the first step — shaking mixes the medication before use.',
        t2: 'Correct for the second step — waiting between puffs lets the airway respond.',
        t3: 'Swallowing a tablet is not part of using an inhaler.',
      },
    },
    rationale:
      'Inhaler technique: shake the canister first, then wait between puffs. Swallowing a tablet is a distractor.',
  },

  // ── 11. DRAG_ORDER (rank the tokens into ordered slots) ─────────
  {
    key:           'drag_order',
    question_type: 'DRAG_ORDER',
    stem:          'Place the steps for responding to an unwitnessed adult collapse in the correct order.',
    instruction:   'Drag each step into the correct order.',
    classification: clsf({
      difficulty:               'Medium',
      nursing_subject:          'Fundamentals of Nursing',
      client_needs_category:    'Safe and Effective Care Environment',
      client_needs_subcategory: 'Management of Care',
    }),
    content: {
      slots: [
        { id: 's1', target_text: '1st action' },
        { id: 's2', target_text: '2nd action' },
        { id: 's3', target_text: '3rd action' },
        { id: 's4', target_text: '4th action' },
      ],
      tokens: [
        { id: 't1', text: 'Check the scene is safe and check for a response' },
        { id: 't2', text: 'Call for help and activate the emergency response' },
        { id: 't3', text: 'Check for breathing and a pulse' },
        { id: 't4', text: 'Begin chest compressions' },
      ],
    },
    correct: {
      slots: { s1: 't1', s2: 't2', s3: 't3', s4: 't4' },
      feedback: {
        t1: 'First: ensure the scene is safe and check for a response.',
        t2: 'Second: call for help so advanced support is on the way.',
        t3: 'Third: check for breathing and a pulse.',
        t4: 'Fourth: begin compressions if there is no pulse.',
      },
    },
    rationale:
      'The sequence follows the resuscitation chain: safety and response, then call for help, then check breathing/pulse, then start compressions.',
  },
];

// ════════════════════════════════════════════════════════════════
// The case study + the trend (second data pass).
// Shapes mirror real nclex_attempt_case_snapshots / _trend_snapshots
// rows (validated against live dev data) so the case + trend panels
// render unchanged.
// ════════════════════════════════════════════════════════════════

// Frozen timestamp for the snapshot tab metadata — a constant (not a
// clock) so the data stays pure/deterministic. The value is cosmetic; the
// panels don't display it.
const TAB_TS = '2026-01-01T00:00:00.000Z';

// Minimal Tiptap/ProseMirror doc for one paragraph — the v2 trend tab
// bodies are rich docs. Keeps the trend entries readable below.
function richPara(text: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { textAlign: 'left' },
        content: [{ text, type: 'text' }],
      },
    ],
  };
}

export const TUTORIAL_CASE_ID = 'NCLEX_CS_TUTORIAL';

// ── The case study wrapper — post-op sepsis, 6 CJMM children ──────
export const TUTORIAL_CASE: TutorialCase = {
  case_id:  TUTORIAL_CASE_ID,
  title:    'Madam Efua Mensah, 68 — post-operative day 2',
  scenario:
    'Madam Efua Mensah is 68 and post-operative day 2 following an open bowel resection. Overnight she has become increasingly unwell — her temperature is climbing, her heart rate rising, her blood pressure drifting down, and the night nurse reports she is "not herself": drowsy and slow to answer. Her surgical wound is intact with a small amount of serous ooze.',
  tabs: [
    {
      title:        'History & Physical',
      tab_id:       'tab_tutcase_history',
      case_id:      TUTORIAL_CASE_ID,
      entries: {
        v: 2,
        entries: [
          { id: 'e0', visibleFrom: 1, chips: ['Past medical'],      body: richPara('Type 2 diabetes (metformin) and hypertension. No known kidney disease.') },
          { id: 'e1', visibleFrom: 1, chips: ['Past surgical'],     body: richPara('Open bowel resection 2 days ago for a benign obstruction. Uncomplicated intra-operatively.') },
          { id: 'e2', visibleFrom: 1, chips: ['Allergies'],         body: richPara('Penicillin — rash.') },
          { id: 'e3', visibleFrom: 2, chips: ['Medications'],       body: richPara('Metformin, amlodipine, PRN paracetamol, prophylactic subcutaneous heparin.') },
          { id: 'e4', visibleFrom: 3, chips: ['Review of systems'], body: richPara('New confusion overnight, reduced oral intake, one episode of rigors. No chest pain.') },
        ],
      },
      tab_key:      'history',
      is_custom:    false,
      created_at:   TAB_TS,
      updated_at:   TAB_TS,
      columns_def:  [],
      custom_shape: null,
      display_order: 1,
    },
    {
      title:        'Vital Signs',
      tab_id:       'tab_tutcase_vitals',
      case_id:      TUTORIAL_CASE_ID,
      entries: {
        v: 2,
        entries: [
          { id: 'e0', visibleFrom: 1, chips: ['06:00'], body: richPara('T 38.9°C · HR 112 · BP 98/56 · RR 24 · SpO₂ 94% · Pain 4') },
          { id: 'e1', visibleFrom: 1, chips: ['08:00'], body: richPara('T 39.2°C · HR 120 · BP 92/50 · RR 26 · SpO₂ 92% · Pain 5') },
          { id: 'e2', visibleFrom: 3, chips: ['10:00'], body: richPara('T 38.6°C · HR 104 · BP 108/64 · RR 22 · SpO₂ 95% · Pain 3') },
          { id: 'e3', visibleFrom: 5, chips: ['12:00'], body: richPara('T 37.8°C · HR 92 · BP 118/70 · RR 18 · SpO₂ 97% · Pain 2') },
          { id: 'e4', visibleFrom: 6, chips: ['16:00'], body: richPara('T 37.2°C · HR 84 · BP 124/76 · RR 16 · SpO₂ 98% · Pain 1') },
        ],
      },
      tab_key:      'vital_signs',
      is_custom:    false,
      created_at:   TAB_TS,
      updated_at:   TAB_TS,
      columns_def:  [],
      custom_shape: null,
      display_order: 2,
    },
  ],
};

export const TUTORIAL_CASE_QUESTIONS: TutorialQuestion[] = [
  // 1 · Recognise cues (SATA)
  {
    key:            'case_recognise',
    question_type:  'SATA',
    parent_case_id: TUTORIAL_CASE_ID,
    case_position:  1,
    cjmm_step:      'Recognise cues',
    stem:           'Reviewing the 06:00–08:00 data, which findings are of most concern?',
    instruction:    'Select all that apply.',
    classification: clsf({
      difficulty:               'Medium',
      nursing_subject:          'Medical-Surgical',
      body_system:              'Multisystem',
      client_needs_category:    'Physiological Integrity',
      client_needs_subcategory: 'Physiological Adaptation',
    }),
    content: {
      options: [
        { id: 'A', text: 'Temperature 39.2°C' },
        { id: 'B', text: 'Heart rate 120' },
        { id: 'C', text: 'Blood pressure 92/50' },
        { id: 'D', text: 'New confusion overnight' },
        { id: 'E', text: 'Penicillin allergy' },
        { id: 'F', text: 'Small serous wound ooze' },
      ],
    },
    correct: {
      answers: ['A', 'B', 'C', 'D'],
      feedback: {
        A: 'Correct. A high fever suggests an infective process.',
        B: 'Correct. Tachycardia is part of the systemic response to sepsis.',
        C: 'Correct. A falling blood pressure signals developing shock.',
        D: 'Correct. New confusion is an early sign of poor perfusion in sepsis.',
        E: 'The allergy matters for prescribing but is not a new concerning finding.',
        F: 'A small amount of serous ooze from a 2-day-old wound is expected.',
      },
    },
    rationale:
      'Fever, tachycardia, hypotension and new confusion together are the recognisable cues of developing sepsis. The allergy and minor ooze are not the acute concern.',
  },

  // 2 · Analyse cues (MATRIX)
  {
    key:            'case_analyse',
    question_type:  'MATRIX',
    parent_case_id: TUTORIAL_CASE_ID,
    case_position:  2,
    cjmm_step:      'Analyse cues',
    stem:           'For each finding, indicate whether it is consistent with sepsis or unrelated.',
    instruction:    'Select one option in each row.',
    classification: clsf({
      difficulty:               'Medium',
      nursing_subject:          'Medical-Surgical',
      body_system:              'Multisystem',
      client_needs_category:    'Physiological Integrity',
      client_needs_subcategory: 'Physiological Adaptation',
    }),
    content: {
      row_label: 'Finding',
      rows: [
        { id: 'r1', text: 'Temperature 39.2°C' },
        { id: 'r2', text: 'Heart rate 120' },
        { id: 'r3', text: 'Blood pressure 92/50' },
        { id: 'r4', text: 'New confusion' },
      ],
      columns: [
        { id: 'c1', text: 'Consistent with sepsis' },
        { id: 'c2', text: 'Unrelated' },
      ],
    },
    correct: {
      cells: { r1: 'c1', r2: 'c1', r3: 'c1', r4: 'c1' },
      feedback: {
        r1: 'Fever reflects the infective/inflammatory response.',
        r2: 'Tachycardia is a compensatory response to falling perfusion.',
        r3: 'Hypotension marks progression toward septic shock.',
        r4: 'Reduced cerebral perfusion produces new confusion.',
      },
    },
    rationale:
      'All four findings are consistent with sepsis — together they form the clinical picture, not four unrelated problems.',
  },

  // 3 · Prioritise (MCQ)
  {
    key:            'case_prioritise',
    question_type:  'MCQ',
    parent_case_id: TUTORIAL_CASE_ID,
    case_position:  3,
    cjmm_step:      'Prioritise',
    stem:           'Which is the priority nursing action?',
    instruction:    'Select the one best answer.',
    classification: clsf({
      difficulty:               'Medium',
      nursing_subject:          'Medical-Surgical',
      client_needs_category:    'Safe and Effective Care Environment',
      client_needs_subcategory: 'Management of Care',
    }),
    content: {
      options: [
        { id: 'A', text: 'Escalate to the provider and initiate the sepsis protocol.' },
        { id: 'B', text: 'Give PRN paracetamol and reassess in an hour.' },
        { id: 'C', text: 'Document the findings and continue routine observations.' },
        { id: 'D', text: 'Encourage oral fluids and sit the client upright.' },
      ],
    },
    correct: {
      answer: 'A',
      feedback: {
        A: 'Correct. Suspected sepsis is time-critical — escalate and start the protocol now.',
        B: 'Treating only the fever delays the definitive response to sepsis.',
        C: 'Documenting without escalating loses critical time.',
        D: 'Oral fluids are inadequate for a client heading into septic shock.',
      },
    },
    rationale:
      'Sepsis is a time-critical emergency. The priority is to escalate and begin the sepsis protocol, not to treat a single symptom or simply document.',
  },

  // 4 · Generate solutions (SELECT_N)
  {
    key:            'case_generate',
    question_type:  'SELECT_N',
    parent_case_id: TUTORIAL_CASE_ID,
    case_position:  4,
    cjmm_step:      'Generate solutions',
    stem:           'Which TWO interventions should the nurse anticipate first?',
    instruction:    'Select exactly 2 options.',
    classification: clsf({
      difficulty:               'Hard',
      nursing_subject:          'Medical-Surgical',
      client_needs_category:    'Physiological Integrity',
      client_needs_subcategory: 'Pharmacological and Parenteral Therapies',
    }),
    content: {
      select_count: 2,
      options: [
        { id: 'A', text: 'Obtain blood cultures, then start IV broad-spectrum antibiotics.' },
        { id: 'B', text: 'Begin an IV fluid bolus.' },
        { id: 'C', text: 'Restrict IV fluids to avoid overload.' },
        { id: 'D', text: 'Apply a cooling blanket as the first step.' },
        { id: 'E', text: 'Withhold all analgesia.' },
      ],
    },
    correct: {
      answers: ['A', 'B'],
      feedback: {
        A: 'Correct. Cultures before antibiotics, then early antibiotics — core sepsis management.',
        B: 'Correct. A fluid bolus supports the falling blood pressure.',
        C: 'Fluid restriction is wrong here — the client needs volume.',
        D: 'Cooling is not the priority intervention in sepsis.',
        E: 'Analgesia is not withheld; it is simply not the priority.',
      },
    },
    rationale:
      'The first anticipated interventions are cultures-then-antibiotics and an IV fluid bolus. Restricting fluids or leading with cooling would be wrong.',
  },

  // 5 · Take action (DRAG_ORDER)
  {
    key:            'case_action',
    question_type:  'DRAG_ORDER',
    parent_case_id: TUTORIAL_CASE_ID,
    case_position:  5,
    cjmm_step:      'Take action',
    stem:           'Place the first sepsis-bundle actions in the correct order.',
    instruction:    'Drag each step into the correct order.',
    classification: clsf({
      difficulty:               'Hard',
      nursing_subject:          'Medical-Surgical',
      client_needs_category:    'Physiological Integrity',
      client_needs_subcategory: 'Pharmacological and Parenteral Therapies',
    }),
    content: {
      slots: [
        { id: 's1', target_text: '1st' },
        { id: 's2', target_text: '2nd' },
        { id: 's3', target_text: '3rd' },
        { id: 's4', target_text: '4th' },
      ],
      tokens: [
        { id: 't1', text: 'Take blood cultures' },
        { id: 't2', text: 'Start IV broad-spectrum antibiotics' },
        { id: 't3', text: 'Give the IV fluid bolus' },
        { id: 't4', text: 'Measure serum lactate and monitor urine output' },
      ],
    },
    correct: {
      slots: { s1: 't1', s2: 't2', s3: 't3', s4: 't4' },
      feedback: {
        t1: 'Cultures are taken before antibiotics so the sample is not contaminated.',
        t2: 'Antibiotics follow immediately — do not delay them.',
        t3: 'The fluid bolus supports perfusion.',
        t4: 'Lactate and urine output track the response to treatment.',
      },
    },
    rationale:
      'Cultures first (before antibiotics), then antibiotics, then fluids, then measure lactate and monitor urine output — the sepsis-bundle sequence.',
  },

  // 6 · Evaluate outcomes (SATA)
  {
    key:            'case_evaluate',
    question_type:  'SATA',
    parent_case_id: TUTORIAL_CASE_ID,
    case_position:  6,
    cjmm_step:      'Evaluate outcomes',
    stem:           'By 16:00, which findings show the treatment is working?',
    instruction:    'Select all that apply.',
    classification: clsf({
      difficulty:               'Medium',
      nursing_subject:          'Medical-Surgical',
      body_system:              'Multisystem',
      client_needs_category:    'Physiological Integrity',
      client_needs_subcategory: 'Physiological Adaptation',
    }),
    content: {
      options: [
        { id: 'A', text: 'Heart rate down to 84' },
        { id: 'B', text: 'Blood pressure up to 124/76' },
        { id: 'C', text: 'Temperature down to 37.2°C' },
        { id: 'D', text: 'Respiratory rate down to 16' },
        { id: 'E', text: 'Increasing drowsiness' },
        { id: 'F', text: 'Falling oxygen saturation' },
      ],
    },
    correct: {
      answers: ['A', 'B', 'C', 'D'],
      feedback: {
        A: 'Correct. A settling heart rate shows improving perfusion.',
        B: 'Correct. The recovering blood pressure is a good sign.',
        C: 'Correct. The falling temperature reflects a response to treatment.',
        D: 'Correct. A normalising respiratory rate is reassuring.',
        E: 'Increasing drowsiness would signal deterioration, not improvement.',
        F: 'A falling SpO₂ would be a worsening sign.',
      },
    },
    rationale:
      'A settling heart rate, recovering blood pressure, falling temperature and normalising respiratory rate all show the sepsis treatment is working.',
  },
];

export const TUTORIAL_TREND_ID = 'NCLEX_TRD_TUTORIAL';

// ── The trend wrapper — deteriorating neuro status ────────────────
export const TUTORIAL_TREND: TutorialTrend = {
  trend_id:  TUTORIAL_TREND_ID,
  title:     'Deteriorating neurological status after a head injury',
  scenario:
    'A 24-year-old is admitted to the observation unit after a fall from a ladder with a brief loss of consciousness. Hourly neurological checks are recorded in the nurses’ notes below.',
  tabs: [
    {
      title:    'Nurses’ Notes',
      tab_id:   'tab_tuttrend_notes',
      trend_id: TUTORIAL_TREND_ID,
      entries: {
        v: 2,
        entries: [
          { id: 'e0', body: richPara('0800 — Alert and oriented ×3, GCS 15. Pupils equal, reactive, 3 mm. Denies headache. Moves all limbs.'), chips: ['0800'], visibleFrom: 1 },
          { id: 'e1', body: richPara('1000 — Drowsy but rousable to voice, GCS 14. Reports mild headache 3/10. Pupils remain equal, 3 mm.'), chips: ['1000'], visibleFrom: 1 },
          { id: 'e2', body: richPara('1200 — Harder to rouse, GCS 12. Headache now 6/10. Right pupil sluggish, 4 mm; left brisk, 3 mm. Vomited once. Provider notified.'), chips: ['1200'], visibleFrom: 1 },
          { id: 'e3', body: richPara('1400 — Responds to painful stimuli only, GCS 9. Right pupil fixed and dilated, 5 mm. Respirations irregular. Rapid response called; STAT head CT ordered.'), chips: ['1400'], visibleFrom: 1 },
        ],
      },
      tab_key:      'nurses_notes',
      is_custom:    false,
      created_at:   TAB_TS,
      updated_at:   TAB_TS,
      columns_def:  [],
      custom_shape: null,
      display_order: 0,
    },
  ],
};

export const TUTORIAL_TREND_QUESTIONS: TutorialQuestion[] = [
  {
    key:            'trend_neuro',
    question_type:  'MCQ',
    trend_id:       TUTORIAL_TREND_ID,
    stem:           'Reviewing the trend of neurological findings, which is the priority action at 1400?',
    instruction:    'Select the one best answer.',
    classification: clsf({
      difficulty:               'Hard',
      nursing_subject:          'Medical-Surgical',
      body_system:              'Neurological',
      client_needs_category:    'Physiological Integrity',
      client_needs_subcategory: 'Physiological Adaptation',
    }),
    content: {
      options: [
        { id: 'A', text: 'Activate the rapid response and prepare for urgent imaging.' },
        { id: 'B', text: 'Reassess the client in one hour.' },
        { id: 'C', text: 'Administer oral analgesia for the headache.' },
        { id: 'D', text: 'Encourage the client to rest and dim the lights.' },
      ],
    },
    correct: {
      answer: 'A',
      feedback: {
        A: 'Correct. A falling GCS with a fixed, dilated pupil signals rising intracranial pressure — an emergency.',
        B: 'Waiting an hour with this trajectory risks irreversible harm.',
        C: 'Oral analgesia does nothing for rising intracranial pressure and delays escalation.',
        D: 'Rest is not the answer to a rapidly deteriorating neurological picture.',
      },
    },
    rationale:
      'The trend — GCS 15 → 9, a right pupil becoming fixed and dilated, irregular respirations — shows rising intracranial pressure. The priority is to activate the rapid response and prepare for urgent imaging.',
  },
];

