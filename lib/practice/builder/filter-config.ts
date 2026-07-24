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
import { MIN_ITEMS, MAX_ITEMS } from '@/lib/cat';

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
// THREE MODES PER INTENT — six tuples, not the original eight. Two pairings
// were removed 2026-07-24 (migration 20260814120000) because each was
// MECHANICALLY IDENTICAL to its twin under the other intent, `intent` driving
// no runner behaviour today:
//
//   • UNTIMED_TEST is no longer offered under EXAM. Untimed means
//     duration_seconds = NULL, so there was no clock either way — leaving a
//     card that promised "no clock, single sitting" and delivered the STUDY
//     quiz. "Exam framing without time pressure" is what STUDY already is.
//   • TIMED_SEQUENTIAL is no longer offered under STUDY. Forward-only exists
//     to reproduce exam mechanics (NCSBN: answer in order, no going back, no
//     skipping); it teaches nothing, it only removes an option.
//
// Both modes still exist — each just lives under one intent now. Neither the
// ModeId union nor the runner archetypes changed.
//
// ⚠ These two arrays are ALSO the label lookup for history/launcher reads
// (`intent === 'STUDY' ? MODES_STUDY : MODES_EXAM`, then find by id). An
// attempt row on a tuple missing here falls back to printing its raw id, so
// removing an entry means any stored rows on it must be converted, not left.
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

// ⚠ STUDY LABELS ARE INTERIM (2026-07-24, Sam). They read as one
// "Learning" mode plus two "practice" modes separated only by the clock —
// which is their only actual difference now that Timed Sequential has left
// STUDY. "Free Nav" was dropped from the timed one for the same reason:
// with no other timed study mode to contrast against, the words were no
// longer distinguishing anything. A settled naming decision is still open —
// see bank-consumption.html §15.1 for the full proposal and the reasoning.
export const MODES_STUDY: ModeDef[] = [
  {
    id: 'UNTIMED_LEARNING',
    label: 'Learning',
    clock: 'none',
    feedback: 'After each submit',
    nav: 'Free',
    desc: 'The default for learning. See the rationale right after each answer.',
  },
  {
    id: 'UNTIMED_TEST',
    label: 'Untimed practice',
    clock: 'none',
    feedback: 'At the end',
    nav: 'Free',
    desc: 'Like a quiz with no clock. Rationales arrive when you finish.',
  },
  {
    id: 'TIMED_FREE_NAV',
    label: 'Timed practice',
    clock: 'engagement',
    feedback: 'At the end',
    nav: 'Free',
    desc: 'Engagement-clock — pauses if you step away. Resumable.',
  },
];

// ⚠ EXAM LABELS ARE INTERIM too (2026-07-24, Sam), matching the STUDY set
// above. Named for the thing that varies within this intent — navigation,
// then adaptivity — since every exam mode is timed with feedback at the end,
// so "Timed" was the shared axis rather than the distinguishing one.
export const MODES_EXAM: ModeDef[] = [
  {
    id: 'TIMED_FREE_NAV',
    label: 'Free Navigational Exams',
    clock: 'wall',
    feedback: 'At the end',
    nav: 'Free',
    desc: 'Wall-clock — runs whether you’re there or not. Skip and revisit.',
  },
  {
    id: 'TIMED_SEQUENTIAL',
    label: 'Sequential Exams',
    clock: 'wall',
    feedback: 'At the end',
    nav: 'Forward',
    desc: 'Wall-clock, forward-only. Closest to the real exam mechanics.',
  },
  {
    id: 'CAT',
    label: 'Computer Adaptive Testing (CAT)',
    clock: 'wall',
    feedback: 'Verdict',
    nav: 'Adaptive',
    // Range interpolated from the engine's constants — a literal here was
    // the pre-NGN 75–145 and outlived the §9 correction to 85–150.
    desc: `${MIN_ITEMS}–${MAX_ITEMS} questions. Difficulty adapts. Terminates on confidence.`,
  },
];

/**
 * The display label for a stored attempt's (intent, mode), resolved from
 * the arrays above so there is exactly one place a mode is named.
 *
 * Needed because the two lists deliberately disagree on TIMED_FREE_NAV —
 * the one mode offered under BOTH intents — where STUDY says "Timed
 * practice" and EXAM says "Timed · Free Nav". A label map keyed on mode
 * alone cannot express that, and the runner and preflight each kept one:
 * three hardcoded lists that had already drifted into three spellings of
 * the same mode ("Timed · Free Nav" / "Timed · free navigation" /
 * "Timed · free nav"). They now all resolve through here.
 *
 * Falls back to the raw id, matching what the history and launcher reads
 * already do — a stored row on a tuple no longer offered still renders
 * something rather than blank.
 */
export function modeLabelFor(intent: Intent, mode: ModeId): string {
  const list = intent === 'STUDY' ? MODES_STUDY : MODES_EXAM;
  return list.find((m) => m.id === mode)?.label ?? mode;
}

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
  { id: 'MATRIX_MR', label: 'Matrix (multiple response)' },
  { id: 'HIGHLIGHT', label: 'Highlight (Hot spot)' },
  { id: 'CLOZE',     label: 'Fill-in (Cloze)' },
  { id: 'DRAG_CLOZE', label: 'Drag-and-drop cloze' },
  { id: 'DRAG_ORDER', label: 'Drag to order' },
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
