// mynclex/lib/bank/builder/filter-config.ts
//
// All static config the Practice page needs:
//   - Pool chip definitions (the 6 chips from §17)
//   - Mode card definitions per intent (with Clock/Feedback/Nav metadata
//     for the rich Mode card from the design)
//   - Smart-link associations:
//       • CNC → Subcategory parent map (derived from
//         CLIENT_NEEDS_SUBCATEGORIES already in lib/bank/classifications)
//       • Subject → BodySystem associations (new — invented for v1; the
//         DB doesn't carry this relationship)
//
// All IDs use our actual DB string values directly — no friendly-ID
// translation layer. The filter-payload builder (build-filter-payload.ts)
// just packages these into the JSONB shape the RPC accepts.

import {
  CLIENT_NEEDS_CATEGORIES,
  CLIENT_NEEDS_SUBCATEGORIES,
  NURSING_SUBJECTS,
  BODY_SYSTEMS,
  DIFFICULTY_LEVELS,
  QUESTION_TYPES,
} from '@/lib/bank/classifications';

// ─── Pool chips ─────────────────────────────────────────────────────
// 'SEEN' is a UI-only concept (= CORRECT ∪ INCORRECT). 'ALL' is a
// shortcut that auto-selects the other 5. Both are translated at the
// payload-building seam (build-filter-payload.ts) to the 4 history
// states + the marked boolean the RPC actually understands.

export type PoolId = 'UNSEEN' | 'SEEN' | 'CORRECT' | 'INCORRECT' | 'MARKED' | 'ALL';

export interface PoolDef {
  id: PoolId;
  label: string;
  sub: string;
}

export const POOLS: PoolDef[] = [
  { id: 'UNSEEN',    label: 'Unseen',    sub: 'Never attempted' },
  { id: 'SEEN',      label: 'Seen',      sub: 'Attempted at least once' },
  { id: 'CORRECT',   label: 'Correct',   sub: 'Last attempt right' },
  { id: 'INCORRECT', label: 'Incorrect', sub: 'Last attempt wrong' },
  { id: 'MARKED',    label: 'Marked',    sub: 'You bookmarked' },
  { id: 'ALL',       label: 'All',       sub: 'Every question in scope' },
];

// ─── Intent + Mode definitions ──────────────────────────────────────
// Mode IDs match the nclex_attempts CHECK constraint exactly so we can
// pass them straight to the create-attempt RPC.
//
// Clock / Feedback / Nav metadata drives the rich Mode card pills.
//   clock    — none / engagement / wall (visual pill colour key)
//   feedback — when rationales appear
//   nav      — Free (back-and-forth allowed) or Forward (no going back)

export type Intent = 'STUDY' | 'EXAM';

export type ModeId =
  | 'UNTIMED_LEARNING'
  | 'UNTIMED_TEST'
  | 'TIMED_FREE_NAV'
  | 'TIMED_SEQUENTIAL'
  | 'CAT';

export interface ModeDef {
  id: ModeId;
  label: string;
  clock: 'none' | 'engagement' | 'wall';
  feedback: string;
  nav: 'Free' | 'Forward' | 'Adaptive';
  desc: string;
}

export const MODES_STUDY: ModeDef[] = [
  {
    id: 'UNTIMED_LEARNING',
    label: 'Untimed Learning',
    clock: 'none',
    feedback: 'After each submit',
    nav: 'Free',
    desc: 'The default for learning. See the rationale right after each answer.',
  },
  {
    id: 'UNTIMED_TEST',
    label: 'Untimed Test',
    clock: 'none',
    feedback: 'At the end',
    nav: 'Free',
    desc: 'Like a quiz with no clock. Rationales arrive when you finish.',
  },
  {
    id: 'TIMED_FREE_NAV',
    label: 'Timed · Free Nav',
    clock: 'engagement',
    feedback: 'At the end',
    nav: 'Free',
    desc: 'Engagement-clock — pauses if you step away. Resumable.',
  },
  {
    id: 'TIMED_SEQUENTIAL',
    label: 'Timed · Sequential',
    clock: 'engagement',
    feedback: 'At the end',
    nav: 'Forward',
    desc: 'Engagement-clock, forward-only. Practise pacing without losing your place.',
  },
];

export const MODES_EXAM: ModeDef[] = [
  {
    id: 'UNTIMED_TEST',
    label: 'Untimed Test',
    clock: 'none',
    feedback: 'At the end',
    nav: 'Free',
    desc: 'No clock, single sitting. Rationales at the end only.',
  },
  {
    id: 'TIMED_FREE_NAV',
    label: 'Timed · Free Nav',
    clock: 'wall',
    feedback: 'At the end',
    nav: 'Free',
    desc: 'Wall-clock — runs whether you’re there or not. Skip and revisit.',
  },
  {
    id: 'TIMED_SEQUENTIAL',
    label: 'Timed · Sequential',
    clock: 'wall',
    feedback: 'At the end',
    nav: 'Forward',
    desc: 'Wall-clock, forward-only. Closest to the real exam mechanics.',
  },
  {
    id: 'CAT',
    label: 'CAT',
    clock: 'wall',
    feedback: 'Verdict',
    nav: 'Adaptive',
    desc: '75–145 questions. Difficulty adapts. Terminates on confidence.',
  },
];

export const DEFAULT_MODE_FOR_INTENT: Record<Intent, ModeId> = {
  STUDY: 'UNTIMED_LEARNING',
  EXAM:  'TIMED_SEQUENTIAL',
};

// ─── 8 content filter axes ──────────────────────────────────────────
// Direct exports of the canonical strings already used by authoring +
// scoring. The Builder treats these as the source of truth.

export const CNC_VALUES = [...CLIENT_NEEDS_CATEGORIES] as readonly string[];

export const SUBCAT_VALUES: string[] = Object.values(CLIENT_NEEDS_SUBCATEGORIES).flat();

// CNC → Subcategory parent map (derived from CLIENT_NEEDS_SUBCATEGORIES).
// Smart-link: when a CNC is selected, only its child subcategories are
// checkable in the Subcategory axis.
export const SUBCAT_PARENT: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const cnc of CLIENT_NEEDS_CATEGORIES) {
    for (const sub of CLIENT_NEEDS_SUBCATEGORIES[cnc]) {
      map[sub] = cnc;
    }
  }
  return map;
})();

export const SUBJECT_VALUES = [...NURSING_SUBJECTS] as readonly string[];

export const BODY_VALUES = [...BODY_SYSTEMS] as readonly string[];

// Subject → BodySystem associations.
// v1 only — invented to drive the smart-link UX. The DB doesn't carry
// this; if it ever needs to live in the schema, promote to a config
// table. Mappings are best-effort domain sense, not gospel.
//
// Subjects with no entry here (or an empty array) are treated as
// "associates with all body systems" — i.e. the smart-link doesn't
// constrain. This matters for Pharmacology and Mental Health, which
// span everything.
export const SUBJECT_BODY_ASSOC: Record<string, readonly string[]> = {
  'Fundamentals of Nursing': [], // open — fundamentals span everything
  'Medical-Surgical': [
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
    'Multisystem',
  ],
  'Maternity': ['Reproductive', 'Genitourinary'],
  'Pediatrics': [
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
    'Sensory',
  ],
  'Mental Health': ['Psychiatric/Mental Health', 'Neurological'],
  'Pharmacology': [], // open — meds across every system
  'Community Health': [],
  'Leadership and Management': [],
};

/**
 * Returns true if the given body-system value is "available" given
 * the current Subject selection.
 *
 * Rule: empty subject set OR any selected subject has an empty assoc
 * list (= "open") OR the body is in the assoc list of a selected
 * subject — then the body is available. Otherwise it's smart-linked
 * out (rendered dimmed + disabled).
 */
export function bodyAvailableFor(body: string, subjects: ReadonlySet<string>): boolean {
  if (subjects.size === 0) return true;
  for (const subj of subjects) {
    const assoc = SUBJECT_BODY_ASSOC[subj];
    if (!assoc || assoc.length === 0) return true; // open subject
    if (assoc.includes(body)) return true;
  }
  return false;
}

/**
 * Subcategory smart-link. Empty CNC set ⇒ all subcats checkable.
 * Otherwise, only subcats whose parent CNC is selected are checkable.
 */
export function subcatAvailableFor(sub: string, cnc: ReadonlySet<string>): boolean {
  if (cnc.size === 0) return true;
  const parent = SUBCAT_PARENT[sub];
  return parent ? cnc.has(parent) : true;
}

// ─── Question Type axis ─────────────────────────────────────────────
// Re-export the 9 canonical types with a short student-facing label
// (the QUESTION_TYPES export uses authoring labels like "MCQ — Multiple
// Choice (one correct)" — too verbose for a checkbox row).

export const QTYPE_OPTIONS: { id: string; label: string }[] = [
  { id: 'MCQ',       label: 'Multiple choice' },
  { id: 'TF',        label: 'True / False' },
  { id: 'SATA',      label: 'Select All That Apply' },
  { id: 'SELECT_N',  label: 'Select N' },
  { id: 'MATRIX',    label: 'Matrix grid' },
  { id: 'HIGHLIGHT', label: 'Highlight (Hot spot)' },
  { id: 'CLOZE',     label: 'Fill-in (Cloze)' },
  { id: 'DRAG_DROP', label: 'Drag and drop' },
  { id: 'DRAG_CLOZE', label: 'Drag-and-drop cloze' },
  { id: 'BOWTIE',    label: 'Bow-tie' },
];

// Sanity: QTYPE_OPTIONS must align with QUESTION_TYPES exactly.
// (Compile-time-ish — runtime guard so we don't silently drift.)
if (QTYPE_OPTIONS.length !== QUESTION_TYPES.length) {
  // Will throw at module load time if someone adds a type and forgets
  // to wire it through. Cheap insurance.
  throw new Error(
    'QTYPE_OPTIONS out of sync with QUESTION_TYPES — update lib/bank/builder/filter-config.ts'
  );
}

// ─── Difficulty axis ────────────────────────────────────────────────
export const DIFFICULTY_VALUES = [...DIFFICULTY_LEVELS] as readonly string[];
