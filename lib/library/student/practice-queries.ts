// mynclex/lib/library/student/practice-queries.ts
//
// "My practice" — the STUDENT-facing reflection over the embedded
// practice questions inside their library notes (the student twin of the
// tutor's lib/library/analytics). A practice-first index: every note the
// student can see THAT CONTAINS practice blocks, how they did (first-try),
// and what's left to review.
//
// Data paths (all read-time, no migration):
//   • Notes + bodies — the student's own Supabase client, RLS-gated by
//     nclex_student_can_see_note(); narrowed to THE library's tutor (so
//     "this programme's practice" means one tutor's notes), exactly like
//     lib/library/student/queries.ts. The body carries the practice
//     blocks (the embedded_questions nodes).
//   • The student's own answers — nclex_library_embed_answers, RLS
//     self-select (own rows only), like the embed player. Oldest-first so
//     the first row per (note, block, item) is the first attempt and the
//     last is the latest.
//
// The metric is FIRST-TRY accuracy. A later correct answer makes a miss
// "recovered" (latest attempt correct) — recovered misses drop out of
// "to review". Nothing here is cached; it recomputes each load, so a
// re-practice in the note is reflected immediately.

import { createClient } from '@/lib/supabase/server';
import { bodyToTiptap } from '../body-tiptap';

/** A practice block lifted from a note body, in reading order. */
export interface PracticeBlock {
  blockId: string;
  /** Tutor-given title, or "Practice N" by reading order. */
  label: string;
  itemIds: string[];
}

/** One note row on the index. */
export interface PracticeNoteRow {
  noteId: string;
  title: string;
  blockCount: number;
  questionCount: number;
  /** Has the student answered at least one question in this note? */
  started: boolean;
  /** Distinct questions answered (first attempt logged). */
  answered: number;
  /** Answered correctly on the first try. */
  firstCorrect: number;
  /** Missed first try and not yet recovered — the "to review" count. */
  toReview: number;
}

export interface StudentPracticeIndex {
  notesPractised: number;
  questionsAnswered: number;
  /** Reader-weighted first-try %, or null if nothing answered yet. */
  firstTryPct: number | null;
  notes: PracticeNoteRow[];
  /** Are there any notes with practice blocks at all? (Drives the empty state.) */
  hasAnyBlocks: boolean;
}

/**
 * Lift the practice blocks out of a note body. Mirrors the tutor
 * analytics' extractor; kept here so the student side never imports the
 * tutor-only analytics module.
 */
export function extractPracticeBlocks(body: unknown): PracticeBlock[] {
  const doc = bodyToTiptap(body);
  const out: PracticeBlock[] = [];
  let practiceN = 0;
  for (const node of doc.content ?? []) {
    if (node.type !== 'embedded_questions') continue;
    practiceN += 1;
    const attrs = (node.attrs ?? {}) as {
      id?: unknown;
      title?: unknown;
      item_ids?: unknown;
    };
    const blockId = typeof attrs.id === 'string' ? attrs.id : null;
    if (!blockId) continue;
    const title = typeof attrs.title === 'string' ? attrs.title.trim() : '';
    const itemIds = Array.isArray(attrs.item_ids)
      ? attrs.item_ids.filter((x): x is string => typeof x === 'string')
      : [];
    out.push({ blockId, label: title || `Practice ${practiceN}`, itemIds });
  }
  return out;
}

// --- tutor resolution (mirrors lib/library/student/queries.ts) --------
// Replicated rather than shared: the student library keeps these
// resolvers private, and they're 3-line metadata reads. RLS gates them.

async function resolveProgrammeTutor(programmeId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_programmes')
    .select('tutor_id')
    .eq('programme_id', programmeId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { tutor_id: string }).tutor_id;
}

async function resolveCohortTutor(cohortId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_cohorts')
    .select('programme_id')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (error || !data) return null;
  return resolveProgrammeTutor((data as { programme_id: string }).programme_id);
}

/** Per (note, block, item) first-attempt + latest verdict, derived from
 *  the student's own append-only answer rows (oldest-first). */
interface ItemVerdict {
  noteId: string;
  firstCorrect: boolean;
  lastCorrect: boolean;
}

async function buildIndexForTutor(
  tutorId: string,
): Promise<StudentPracticeIndex> {
  const empty: StudentPracticeIndex = {
    notesPractised: 0,
    questionsAnswered: 0,
    firstTryPct: null,
    notes: [],
    hasAnyBlocks: false,
  };

  const supabase = await createClient();

  // 1. The library's visible notes + bodies (RLS = student-can-see).
  const { data: noteRows } = await supabase
    .from('nclex_tutor_library_notes')
    .select('note_id, title, body, updated_at')
    .eq('tutor_id', tutorId)
    .order('updated_at', { ascending: false });
  const notes = (noteRows ?? []) as Array<{
    note_id: string;
    title: string;
    body: unknown;
  }>;
  if (notes.length === 0) return empty;

  // 2. Keep only notes that actually carry practice blocks.
  const withBlocks = notes
    .map((n) => ({
      noteId: n.note_id,
      title: n.title,
      blocks: extractPracticeBlocks(n.body),
    }))
    .filter((n) => n.blocks.length > 0);
  if (withBlocks.length === 0) return empty;

  const noteIds = withBlocks.map((n) => n.noteId);
  const validBlockIds = new Set(
    withBlocks.flatMap((n) => n.blocks.map((b) => b.blockId)),
  );

  // 3. The student's own answers across these notes (RLS self-select),
  //    oldest-first → first row per key is the first attempt.
  const { data: answerRows } = await supabase
    .from('nclex_library_embed_answers')
    .select('note_id, block_id, item_id, is_correct, submitted_at')
    .in('note_id', noteIds)
    .order('submitted_at', { ascending: true });
  const answers = (answerRows ?? []) as Array<{
    note_id: string;
    block_id: string;
    item_id: string;
    is_correct: boolean;
    submitted_at: string;
  }>;

  // 4. Reduce to one verdict per (note, block, item).
  const verdicts = new Map<string, ItemVerdict>();
  for (const a of answers) {
    if (!validBlockIds.has(a.block_id)) continue; // block restructured/deleted
    const key = `${a.note_id}|${a.block_id}|${a.item_id}`;
    const cur = verdicts.get(key);
    if (!cur) {
      verdicts.set(key, {
        noteId: a.note_id,
        firstCorrect: a.is_correct,
        lastCorrect: a.is_correct,
      });
    } else {
      cur.lastCorrect = a.is_correct;
    }
  }

  // 5. Aggregate per note.
  interface Agg {
    answered: number;
    firstCorrect: number;
    toReview: number;
  }
  const perNote = new Map<string, Agg>();
  for (const v of verdicts.values()) {
    const agg =
      perNote.get(v.noteId) ?? { answered: 0, firstCorrect: 0, toReview: 0 };
    agg.answered += 1;
    if (v.firstCorrect) agg.firstCorrect += 1;
    // Missed first AND latest attempt still wrong = recovered? no → review.
    else if (!v.lastCorrect) agg.toReview += 1;
    perNote.set(v.noteId, agg);
  }

  let notesPractised = 0;
  let questionsAnswered = 0;
  let totalFirstCorrect = 0;

  const rows: PracticeNoteRow[] = withBlocks.map((n) => {
    const agg = perNote.get(n.noteId) ?? {
      answered: 0,
      firstCorrect: 0,
      toReview: 0,
    };
    const questionCount = n.blocks.reduce((a, b) => a + b.itemIds.length, 0);
    const started = agg.answered > 0;
    if (started) {
      notesPractised += 1;
      questionsAnswered += agg.answered;
      totalFirstCorrect += agg.firstCorrect;
    }
    return {
      noteId: n.noteId,
      title: n.title,
      blockCount: n.blocks.length,
      questionCount,
      started,
      answered: agg.answered,
      firstCorrect: agg.firstCorrect,
      toReview: agg.toReview,
    };
  });

  // Order: started notes first (most to review first, then weakest score),
  // then not-started, alphabetical. Practice-first surface — what needs
  // attention rises.
  rows.sort((a, b) => {
    if (a.started !== b.started) return a.started ? -1 : 1;
    if (a.started && b.started) {
      if (a.toReview !== b.toReview) return b.toReview - a.toReview;
      const accA = a.answered ? a.firstCorrect / a.answered : 1;
      const accB = b.answered ? b.firstCorrect / b.answered : 1;
      if (accA !== accB) return accA - accB;
    }
    return a.title.localeCompare(b.title);
  });

  return {
    notesPractised,
    questionsAnswered,
    firstTryPct:
      questionsAnswered > 0
        ? Math.round((totalFirstCorrect / questionsAnswered) * 100)
        : null,
    notes: rows,
    hasAnyBlocks: true,
  };
}

/** My-practice index for a self-paced programme. Null = stale/not enrolled. */
export async function getStudentPracticeIndexForProgramme(
  programmeId: string,
): Promise<StudentPracticeIndex | null> {
  const tutorId = await resolveProgrammeTutor(programmeId);
  if (!tutorId) return null;
  return buildIndexForTutor(tutorId);
}

/** My-practice index for a tutor-led cohort. Null = stale/not enrolled. */
export async function getStudentPracticeIndexForCohort(
  cohortId: string,
): Promise<StudentPracticeIndex | null> {
  const tutorId = await resolveCohortTutor(cohortId);
  if (!tutorId) return null;
  return buildIndexForTutor(tutorId);
}
