// mynclex/lib/bank/classifications.ts
//
// Hardcoded classification constants for the Question Bank authoring UI.
//
// Why hardcoded (not a DB lookup table):
//   - Zero RPC cost on every form render.
//   - Edits are one-commit changes, no migration drift.
//   - The set is stable enough (NCLEX official categories don't change often).
//
// If/when curators need to add values without a deploy, this can be
// promoted to a DB table later. Keep the same shape so the migration
// is trivial.

// ─────────────────────────────────────────────────────────────
// Question types — Family A complete; Matrix (1.5) and Bow-tie
// (1.6) added in Family B. HIGHLIGHT, CLOZE, DRAG_DROP land in
// later slices, each as its own bespoke editor.
// ─────────────────────────────────────────────────────────────

export const QUESTION_TYPES = [
  { value: 'MCQ', label: 'MCQ — Multiple Choice (one correct)' },
  { value: 'TF', label: 'TF — True / False' },
  { value: 'SATA', label: 'SATA — Select All That Apply' },
  { value: 'SELECT_N', label: 'Select N — Select exactly N options' },
  { value: 'MATRIX', label: 'Matrix — Grid, one correct per row' },
  { value: 'BOWTIE', label: 'Bow-tie — 5-slot NGN (2 Left · 1 Centre · 2 Right)' },
  { value: 'CLOZE', label: 'Cloze — Fill-in-the-blank sentence' },
  { value: 'HIGHLIGHT', label: 'Highlight — Click correct findings in a passage' },
  { value: 'DRAG_DROP', label: 'Drag-drop — Ordered list or Sentence slots' },
  { value: 'DRAG_CLOZE', label: 'Drag-and-drop cloze — fill the sentence' },
  { value: 'DRAG_ORDER', label: 'Drag to order — ranked response' },
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number]['value'];

// Item-ID prefix per type. Used by the auto-numbering action to
// compute the next sequential ID, e.g. NCLEX_MCQ_00009.
export const ITEM_ID_PREFIX: Record<QuestionType, string> = {
  MCQ: 'NCLEX_MCQ_',
  TF: 'NCLEX_TF_',
  SATA: 'NCLEX_SATA_',
  SELECT_N: 'NCLEX_SELN_',
  MATRIX: 'NCLEX_MAT_',
  BOWTIE: 'NCLEX_BT_',
  CLOZE: 'NCLEX_CLZ_',
  HIGHLIGHT: 'NCLEX_HL_',
  DRAG_DROP: 'NCLEX_DD_',
  DRAG_CLOZE: 'NCLEX_DCZ_',
  DRAG_ORDER: 'NCLEX_DO_',
};

// Tutor-side prefix: all tutor questions use NCLEX_TUT_<TYPE>_NNNNN.
// Added in Slice 2.1 as part of the reusability proof — same editors,
// same parsers, same shell, different table + prefix.
export const TUTOR_ITEM_ID_PREFIX: Record<QuestionType, string> = {
  MCQ:       'NCLEX_TUT_MCQ_',
  TF:        'NCLEX_TUT_TF_',
  SATA:      'NCLEX_TUT_SATA_',
  SELECT_N:  'NCLEX_TUT_SN_',
  MATRIX:    'NCLEX_TUT_MAT_',
  BOWTIE:    'NCLEX_TUT_BT_',
  CLOZE:     'NCLEX_TUT_CLZ_',
  HIGHLIGHT: 'NCLEX_TUT_HL_',
  DRAG_DROP: 'NCLEX_TUT_DD_',
  DRAG_CLOZE: 'NCLEX_TUT_DCZ_',
  DRAG_ORDER: 'NCLEX_TUT_DO_',
};

// Case Study ID prefixes (Slice 1.11a).
// A case study wraps 1-6 child questions under a shared scenario + chart
// tabs. Cases are NOT rows in nclex_bank_items — they live at
// /admin/bank/cases (NCLEX_CS_NNNNN) and /tutor/bank/cases
// (NCLEX_TUT_CS_NNNNN). Kept as separate constants so the question-type
// prefix maps stay untouched.
export const CASE_ID_PREFIX       = 'NCLEX_CS_';
export const TUTOR_CASE_ID_PREFIX = 'NCLEX_TUT_CS_';

// Trend dataset ID prefixes (Slice 1.12a).
// A trend dataset carries a time-series table (rows × timepoints) that
// one or more bank items attach to. Datasets live at
// /admin/trends (NCLEX_TRD_NNNNN) and /tutor/trends
// (NCLEX_TUT_TRD_NNNNN). Same separation rationale as the case-study
// prefixes above.
export const TREND_ID_PREFIX       = 'NCLEX_TRD_';
export const TUTOR_TREND_ID_PREFIX = 'NCLEX_TUT_TRD_';

// ─────────────────────────────────────────────────────────────
// NGN Case Study — Clinical Judgment Measurement Model steps.
// Each of the six slots in a case study targets one step.
// Values must stay in sync with the CHECK constraint on
// nclex_case_study_items.cjmm_step (schema.sql).
// ─────────────────────────────────────────────────────────────

export const CJMM_STEPS = [
  'Recognise cues',
  'Analyse cues',
  'Prioritise',
  'Generate solutions',
  'Take action',
  'Evaluate outcomes',
] as const;

export type CjmmStep = (typeof CJMM_STEPS)[number];

// ─────────────────────────────────────────────────────────────
// NCLEX Client Needs categories + subcategories.
// Source: NCSBN 2023 NCLEX-RN Test Plan.
// ─────────────────────────────────────────────────────────────

export const CLIENT_NEEDS_CATEGORIES = [
  'Safe and Effective Care Environment',
  'Health Promotion and Maintenance',
  'Psychosocial Integrity',
  'Physiological Integrity',
] as const;

export type ClientNeedsCategory = (typeof CLIENT_NEEDS_CATEGORIES)[number];

export const CLIENT_NEEDS_SUBCATEGORIES: Record<ClientNeedsCategory, string[]> = {
  'Safe and Effective Care Environment': [
    'Management of Care',
    'Safety and Infection Control',
  ],
  'Health Promotion and Maintenance': [
    'Health Promotion and Maintenance',
  ],
  'Psychosocial Integrity': [
    'Psychosocial Integrity',
  ],
  'Physiological Integrity': [
    'Basic Care and Comfort',
    'Pharmacological and Parenteral Therapies',
    'Reduction of Risk Potential',
    'Physiological Adaptation',
  ],
};

// ─────────────────────────────────────────────────────────────
// Other classification axes.
// ─────────────────────────────────────────────────────────────

export const NURSING_SUBJECTS = [
  'Fundamentals of Nursing',
  'Medical-Surgical',
  'Maternity',
  'Pediatrics',
  'Mental Health',
  'Pharmacology',
  'Community Health',
  'Leadership and Management',
] as const;

export const BODY_SYSTEMS = [
  'Cardiovascular',
  'Respiratory',
  'Gastrointestinal',
  'Genitourinary',
  'Musculoskeletal',
  'Neurological',
  'Endocrine',
  'Hematologic',
  'Immune',
  'Integumentary',
  'Reproductive',
  'Sensory',
  'Psychiatric/Mental Health',
  'Multisystem',
] as const;

// Schema CHECK constrains difficulty to these three.
export const DIFFICULTY_LEVELS = ['Easy', 'Medium', 'Hard'] as const;

export type Difficulty = (typeof DIFFICULTY_LEVELS)[number];

export const BLOOM_LEVELS = [
  'Remember',
  'Understand',
  'Apply',
  'Analyze',
  'Evaluate',
  'Create',
] as const;

// ─────────────────────────────────────────────────────────────
// Option lettering — 10 slots max (A–J). Bumped from 6 (A–F) on
// 2026-05-27 because real Maryland NGN test-bank items routinely
// run 7–10 options on SATA / SELECT_N. MCQ still typically 4.
// ─────────────────────────────────────────────────────────────

export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 10;
export const DEFAULT_OPTIONS = 4;

// Matrix bounds (Family B — Slice 1.5; row cap bumped 2026-05-27)
// MAX_MATRIX_ROWS raised from 6 to 10 to accommodate real NGN
// matrix items, which routinely run 7–9 rows.
export const MIN_MATRIX_ROWS = 2;
export const MAX_MATRIX_ROWS = 10;
export const MIN_MATRIX_COLS = 2;
export const MAX_MATRIX_COLS = 6;
export const DEFAULT_MATRIX_ROWS = 3;
export const DEFAULT_MATRIX_COLS = 3;

// Bow-tie bounds (Family B — Slice 1.6)
// Structural: each wing has a fixed correct-count. Tokens >= correct-count.
export const BT_LEFT_CORRECT   = 2;
export const BT_CENTRE_CORRECT = 1;
export const BT_RIGHT_CORRECT  = 2;
export const BT_WING_MAX_TOKENS = 8;  // applies to all three wings

// Preset label suggestions (curator can override with custom text)
export const BT_LEFT_PRESETS = [
  'Actions to take',
  'Interventions',
  'Evidence / Supporting findings',
  'Contributing factors',
] as const;

export const BT_CENTRE_PRESETS = [
  'Condition',
  'Potential condition',
  'Problem',
  'Priority concern',
  'Diagnosis',
] as const;

export const BT_RIGHT_PRESETS = [
  'Parameters to monitor',
  'Assessments',
  'Evaluation criteria',
  'Expected outcomes',
] as const;

// Cloze bounds (Family B — Slice 1.8; relaxed 2026-06-30 under advise > block)
// Stem contains {N} markers; each marker maps to a blank card with
// 2–5 choices, exactly one correct.
// HARD bounds (block Save): 1–10 blanks. A single-blank cloze is a legitimate
// NCLEX item (the corpus already has one), so the floor is the structural
// minimum of 1, not the textbook norm. The 2–6 "most items" range is a
// RECOMMENDATION surfaced as an amber advisory in the editor — it never blocks.
export const CLOZE_MIN_BLANKS  = 1;
export const CLOZE_MAX_BLANKS  = 10;
export const CLOZE_MIN_CHOICES = 2;
export const CLOZE_MAX_CHOICES = 5;
// Advisory band (editor nudge only — NOT enforced by the parser).
export const CLOZE_RECOMMENDED_MIN_BLANKS = 2;
export const CLOZE_RECOMMENDED_MAX_BLANKS = 6;

// Highlight bounds (Family B — Slice 1.9; relaxed 2026-06-30 under advise > block)
// Passage contains [[chunk]] double-bracket spans. Each span is a
// chunk card. At least one correct AND one wrong (distractor) chunk
// required so students can't "click everything = 100%".
// HARD floor is the STRUCTURAL minimum of 2 (≥1 correct + ≥1 wrong already
// forces it) — the old 3 was a textbook norm, not a requirement. The "most
// items have 3+" norm is an amber advisory in the editor; it never blocks.
export const HIGHLIGHT_MIN_CHUNKS  = 2;
export const HIGHLIGHT_MAX_CHUNKS  = 12;
export const HIGHLIGHT_MIN_CORRECT = 1;
export const HIGHLIGHT_MIN_WRONG   = 1;
// Advisory floor (editor nudge only — NOT enforced by the parser).
export const HIGHLIGHT_RECOMMENDED_MIN_CHUNKS = 3;

// Drag-drop bounds (Family B — Slice 1.10; relaxed 2026-06-30 under advise > block)
// Two subtypes: ORDERED (ranked positions) and SENTENCE ([N] markers
// in the stem). Both use the same slot + token shape.
//
// What's STRUCTURAL (hard-blocks Save):
//   - slot count in [MIN_DD_SLOTS, MAX_DD_SLOTS] (2..8). The floor is the
//     structural minimum of 2 — a 2-item ordering / 2-blank sentence is a
//     legitimate item. The old 3 was a textbook norm, not a requirement.
//   - token pool ≥ slots + DD_TOKEN_POOL_MIN_EXTRA (i.e. ≥1 distractor, so
//     a student can't solve by dropping everything) and ≤ the cap.
//
// What's a NORM (editor advisory only — amber nudge, never blocks):
//   - DD_RECOMMENDED_MIN_SLOTS (3): most NGN drag-drop items have 3+ slots.
//   - DD_TOKEN_POOL_RECOMMENDED_MIN (4): the NCSBN "between 4 and 10 items"
//     spec floor. Now a recommendation, not a wall — a 2-slot item only
//     needs 3 tokens structurally.
//   - Soft target pool ≈ 2 × slots (capped at the NCLEX 10 ceiling).
export const MIN_DD_SLOTS                 = 2;   // structural floor (was 3 — a norm)
export const MAX_DD_SLOTS                 = 8;
export const DEFAULT_DD_SLOTS             = 3;   // new-item seed = the recommended count
export const DD_RECOMMENDED_MIN_SLOTS     = 3;   // advisory floor (editor nudge only)
export const DD_TOKEN_POOL_MAX_OVER_SLOTS = 4;   // pool cap = slots + this
export const DD_TOKEN_POOL_RECOMMENDED_MIN = 4;  // NCLEX 4-floor — advisory now (was a hard floor)
export const DD_TOKEN_POOL_ABSOLUTE_MAX   = 10;  // NCLEX ceiling — never more than 10
export const DD_TOKEN_POOL_MIN_EXTRA      = 1;   // ≥1 distractor — the real hard floor (pool > slots)

// Drag-and-drop cloze bounds (DRAG_CLOZE — the sentence-blanks type split out of
// DRAG_DROP, 2026-06-30). Its own constants so the type is fully decoupled from
// DRAG_DROP (which is retired once DRAG_ORDER also lands). Values mirror the
// drag-drop SENTENCE rules: same advise > block stance.
export const DCZ_MIN_SLOTS                 = 1;   // a single-blank drag-cloze is valid (mirrors CLOZE)
export const DCZ_MAX_SLOTS                 = 8;
export const DCZ_RECOMMENDED_MIN_SLOTS     = 3;   // advisory floor (editor nudge only)
export const DCZ_TOKEN_POOL_MAX_OVER_SLOTS = 4;   // pool cap = slots + this
export const DCZ_TOKEN_POOL_RECOMMENDED_MIN = 4;  // NCLEX 4-floor — advisory
export const DCZ_TOKEN_POOL_ABSOLUTE_MAX   = 10;  // NCLEX ceiling
export const DCZ_TOKEN_POOL_MIN_EXTRA      = 1;   // ≥1 distractor — the real hard floor

// Drag-to-order bounds (DRAG_ORDER — the ranked-response type split out of
// DRAG_DROP, 2026-06-30). Own constants for full decoupling from DRAG_DROP.
// Values mirror the drag-drop ORDERED rules: same advise > block stance.
export const DO_MIN_SLOTS                 = 2;   // structural floor (a 2-item ordering is valid)
export const DO_MAX_SLOTS                 = 8;
export const DO_DEFAULT_SLOTS             = 3;   // new-item seed = the recommended count
export const DO_RECOMMENDED_MIN_SLOTS     = 3;   // advisory floor (editor nudge only)
export const DO_TOKEN_POOL_MAX_OVER_SLOTS = 4;   // pool cap = slots + this
export const DO_TOKEN_POOL_ABSOLUTE_MAX   = 10;  // NCLEX ceiling
// Ordered-response items are classically "arrange exactly these N" — distractors
// are OPTIONAL, not required. So the hard token floor is `slots` (MIN_EXTRA=0);
// extra distractor tokens are allowed up to the cap but never forced or nagged.
export const DO_TOKEN_POOL_MIN_EXTRA      = 0;   // distractors optional — floor = slots
