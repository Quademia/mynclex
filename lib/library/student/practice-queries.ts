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

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { richTextToPlain } from '@/lib/authoring/rich-doc';
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

// ── Per-note reflection (Slice 2) ────────────────────────────────────

/** A reader's standing on one embedded question. */
export type PracticeQuestionState =
  | 'correct' // right first try
  | 'recovered' // missed first, latest attempt correct
  | 'missed' // missed first, not yet recovered
  | 'unanswered'; // never reached/answered

export interface PracticeQuestion {
  itemId: string;
  stem: string;
  state: PracticeQuestionState;
  /** The option(s) the student chose on their first attempt (joined text). */
  youText: string | null;
  /** The correct option(s) (joined text) — shown on misses + recoveries. */
  correctText: string | null;
  /** The rationale — shown only on unrecovered misses. */
  rationale: string | null;
}

export interface PracticeNoteBlock {
  blockId: string;
  label: string;
  /** Does this block hold an unrecovered miss? (Drives the per-block cue.) */
  hasReview: boolean;
  questions: PracticeQuestion[];
}

export interface StudentPracticeNote {
  noteId: string;
  title: string;
  started: boolean;
  answered: number;
  firstCorrect: number;
  toReview: number;
  total: number;
  blockCount: number;
  blocks: PracticeNoteBlock[];
  /** The block the primary CTA should land on (first miss block, else first). */
  practiceBlockId: string | null;
}

// --- snapshot option helpers (mirror lib/library/analytics) ----------

function optionList(content: unknown): Array<{ id: string; text: string }> {
  const opts = (content as { options?: Array<{ id: string; text: string }> })
    ?.options;
  return Array.isArray(opts) ? opts : [];
}

function selectedIdSet(answer: unknown): Set<string> {
  if (typeof answer === 'string') return new Set([answer]);
  if (Array.isArray(answer)) {
    return new Set(
      (answer as unknown[]).filter((x): x is string => typeof x === 'string'),
    );
  }
  return new Set();
}

function correctIdSet(type: string, correctSnap: unknown): Set<string> {
  if (type === 'SATA' || type === 'SELECT_N') {
    const arr = (correctSnap as { answers?: unknown })?.answers;
    return new Set(
      Array.isArray(arr)
        ? arr.filter((x): x is string => typeof x === 'string')
        : [],
    );
  }
  const a = (correctSnap as { answer?: unknown })?.answer;
  return new Set(typeof a === 'string' ? [a] : []);
}

function textsFor(content: unknown, ids: Set<string>): string | null {
  const texts = optionList(content)
    .filter((o) => ids.has(o.id))
    .map((o) => richTextToPlain(o.text));
  return texts.length ? texts.join(', ') : null;
}

/**
 * The per-note reflection (Slice 2) for the signed-in student: their
 * questions grouped by block, each with their first pick, the correct
 * answer, and the rationale on misses. Answered questions read entirely
 * from the student's OWN snapshotted answer rows (RLS self); un-answered
 * questions need only their stem, fetched via service role once the note
 * read has proved entitlement (the embed-player pattern). Returns null if
 * the note isn't readable (→ 404).
 */
export async function getStudentPracticeNote(
  noteId: string,
): Promise<StudentPracticeNote | null> {
  const supabase = await createClient();

  // Entitlement — RLS returns the note only if the student may read it.
  const { data: note } = await supabase
    .from('nclex_tutor_library_notes')
    .select('note_id, title, body')
    .eq('note_id', noteId)
    .maybeSingle();
  if (!note) return null;
  const nrow = note as { note_id: string; title: string; body: unknown };

  const blocks = extractPracticeBlocks(nrow.body);
  const blockById = new Map(blocks.map((b) => [b.blockId, b]));
  const allItemIds = [...new Set(blocks.flatMap((b) => b.itemIds))];

  // The student's own answers for this note (RLS self), oldest-first.
  const { data: answerRows } = await supabase
    .from('nclex_library_embed_answers')
    .select(
      'block_id, item_id, is_correct, submitted_at, answer_json, content_snapshot_json, correct_answer_snapshot_json, rationale_snapshot, stem_snapshot, question_type',
    )
    .eq('note_id', noteId)
    .order('submitted_at', { ascending: true });
  const answers = (answerRows ?? []) as Array<{
    block_id: string;
    item_id: string;
    is_correct: boolean;
    submitted_at: string;
    answer_json: unknown;
    content_snapshot_json: unknown;
    correct_answer_snapshot_json: unknown;
    rationale_snapshot: string | null;
    stem_snapshot: string | null;
    question_type: string;
  }>;

  interface Entry {
    firstCorrect: boolean;
    lastCorrect: boolean;
    firstAnswer: unknown;
    content: unknown;
    correctSnap: unknown;
    rationale: string | null;
    stem: string | null;
    type: string;
  }
  const entries = new Map<string, Entry>(); // block|item
  const stemByItem = new Map<string, string>();
  for (const a of answers) {
    if (!blockById.has(a.block_id)) continue;
    const key = `${a.block_id}|${a.item_id}`;
    const cur = entries.get(key);
    if (!cur) {
      entries.set(key, {
        firstCorrect: a.is_correct,
        lastCorrect: a.is_correct,
        firstAnswer: a.answer_json,
        content: a.content_snapshot_json,
        correctSnap: a.correct_answer_snapshot_json,
        rationale: a.rationale_snapshot ? richTextToPlain(a.rationale_snapshot) : null,
        stem: richTextToPlain(a.stem_snapshot),
        type: a.question_type,
      });
    } else {
      cur.lastCorrect = a.is_correct;
    }
    if (a.stem_snapshot && !stemByItem.has(a.item_id)) {
      stemByItem.set(a.item_id, richTextToPlain(a.stem_snapshot));
    }
  }

  // Stems for never-answered questions (service role; entitlement already
  // proven by the note read above) — so a not-started note still lists
  // its questions.
  const missingStems = allItemIds.filter((id) => !stemByItem.has(id));
  if (missingStems.length > 0) {
    const admin = createServiceRoleClient();
    const { data: qRows } = await admin
      .from('nclex_tutor_questions')
      .select('item_id, stem')
      .in('item_id', missingStems);
    for (const q of (qRows ?? []) as Array<{ item_id: string; stem: string }>) {
      stemByItem.set(q.item_id, richTextToPlain(q.stem ?? ''));
    }
  }

  let answered = 0;
  let firstCorrect = 0;
  let toReview = 0;
  let total = 0;
  let practiceBlockId: string | null = null;

  const outBlocks: PracticeNoteBlock[] = blocks.map((b) => {
    let hasReview = false;
    const questions: PracticeQuestion[] = b.itemIds.map((itemId) => {
      total += 1;
      const stem = (stemByItem.get(itemId) ?? '').trim() || 'Untitled question';
      const e = entries.get(`${b.blockId}|${itemId}`);
      if (!e) {
        return {
          itemId,
          stem,
          state: 'unanswered',
          youText: null,
          correctText: null,
          rationale: null,
        };
      }
      answered += 1;
      const youText = textsFor(e.content, selectedIdSet(e.firstAnswer));
      const correctText = textsFor(e.content, correctIdSet(e.type, e.correctSnap));
      if (e.firstCorrect) {
        firstCorrect += 1;
        return {
          itemId,
          stem,
          state: 'correct',
          youText,
          correctText: null,
          rationale: null,
        };
      }
      if (e.lastCorrect) {
        return {
          itemId,
          stem,
          state: 'recovered',
          youText,
          correctText,
          rationale: null,
        };
      }
      toReview += 1;
      hasReview = true;
      return {
        itemId,
        stem,
        state: 'missed',
        youText,
        correctText,
        rationale: e.rationale,
      };
    });
    if (hasReview && practiceBlockId === null) practiceBlockId = b.blockId;
    return { blockId: b.blockId, label: b.label, hasReview, questions };
  });

  // Nothing to review → land practice on the first block.
  if (practiceBlockId === null && blocks.length > 0) {
    practiceBlockId = blocks[0].blockId;
  }

  return {
    noteId,
    title: nrow.title,
    started: answered > 0,
    answered,
    firstCorrect,
    toReview,
    total,
    blockCount: blocks.length,
    blocks: outBlocks,
    practiceBlockId,
  };
}
