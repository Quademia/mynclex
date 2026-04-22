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
};

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
