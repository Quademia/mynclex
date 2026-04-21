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
// Question types — Family A only for Slice 1.2.
// MATRIX, HIGHLIGHT, CLOZE, DRAG_DROP, BOWTIE land in later slices,
// each as its own bespoke editor.
// ─────────────────────────────────────────────────────────────

export const QUESTION_TYPES = [
  { value: 'MCQ', label: 'MCQ — Multiple Choice (one correct)' },
  { value: 'TF', label: 'TF — True / False' },
  { value: 'SATA', label: 'SATA — Select All That Apply' },
  { value: 'SELECT_N', label: 'Select N — Select exactly N options' },
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number]['value'];

// Item-ID prefix per type. Used by the auto-numbering action to
// compute the next sequential ID, e.g. NCLEX_MCQ_00009.
export const ITEM_ID_PREFIX: Record<QuestionType, string> = {
  MCQ: 'NCLEX_MCQ_',
  TF: 'NCLEX_TF_',
  SATA: 'NCLEX_SATA_',
  SELECT_N: 'NCLEX_SELN_',
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
