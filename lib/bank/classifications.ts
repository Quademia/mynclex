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
// Option lettering — 6 slots max (A–F) so authoring stays bounded.
// SATA / SELECT_N can use up to 6; MCQ typically 4.
// ─────────────────────────────────────────────────────────────

export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const DEFAULT_OPTIONS = 4;

// Matrix bounds (Family B — Slice 1.5)
export const MIN_MATRIX_ROWS = 2;
export const MAX_MATRIX_ROWS = 6;
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

// Cloze bounds (Family B — Slice 1.8)
// Stem contains {N} markers; each marker maps to a blank card with
// 2–5 choices, exactly one correct.
export const CLOZE_MIN_BLANKS  = 2;
export const CLOZE_MAX_BLANKS  = 6;
export const CLOZE_MIN_CHOICES = 2;
export const CLOZE_MAX_CHOICES = 5;

// Highlight bounds (Family B — Slice 1.9)
// Passage contains [[chunk]] double-bracket spans. Each span is a
// chunk card. At least one correct AND one wrong (distractor) chunk
// required so students can't "click everything = 100%".
export const HIGHLIGHT_MIN_CHUNKS  = 3;
export const HIGHLIGHT_MAX_CHUNKS  = 12;
export const HIGHLIGHT_MIN_CORRECT = 1;
export const HIGHLIGHT_MIN_WRONG   = 1;

// Drag-drop bounds (Family B — Slice 1.10)
// Two subtypes: ORDERED (ranked positions) and SENTENCE ([N] markers
// in the stem). Both use the same slot + token shape.
//
// Pool sizing matches the actual NCLEX NGN Extended Drag-and-Drop spec:
// "between 4 and 10 items to drag and drop" with "more response options
// than answer spaces" (i.e. ≥1 distractor). Slot count itself isn't
// fixed by NCSBN; we keep 3-8 to give curators flexibility while staying
// in NGN-shaped territory.
//
// Soft target (recommended, not enforced): pool ≈ 2 × slots, capped by
// DD_TOKEN_POOL_ABSOLUTE_MAX. The bounds meter colours flag pools below
// the recommendation but valid as 'warn', and below the floor as 'err'.
export const MIN_DD_SLOTS                 = 3;
export const MAX_DD_SLOTS                 = 8;
export const DEFAULT_DD_SLOTS             = 3;
export const DD_TOKEN_POOL_MAX_OVER_SLOTS = 4;   // pool cap = slots + this
export const DD_TOKEN_POOL_ABSOLUTE_MIN   = 4;   // NCLEX floor — never fewer than 4 tokens
export const DD_TOKEN_POOL_ABSOLUTE_MAX   = 10;  // NCLEX ceiling — never more than 10
export const DD_TOKEN_POOL_MIN_EXTRA      = 1;   // ≥1 distractor — pool > slots
