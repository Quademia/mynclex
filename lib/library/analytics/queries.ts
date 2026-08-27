// mynclex/lib/library/analytics/queries.ts
//
// Tutor "Question analytics" reads (slice 11.11c). Aggregates
// nclex_library_embed_answers over the tutor's own library notes,
// grouped Note → Practice block → question. Everything is derived at
// read time (no cached aggregates), mirroring the cohort-analytics
// approach in lib/analytics/tutor/.
//
// Data path: the tutor reads the answer rows via the table's
// tutor-select RLS (rows where the embedded question is one of theirs);
// the note bodies (RLS = owned) give the block structure + titles. So
// no service-role read is needed for the aggregate — the tutor only
// ever sees their own questions' rows.
//
// "Reach"/engagement is scoped to readers who actually ANSWERED — a
// note is read self-paced, so we never imply a whole-class denominator.

import { createClient } from '@/lib/supabase/server';
import { getLibraryTutorId } from '../tutor-scope';
import { richTextToPlain } from '@/lib/authoring/rich-doc';
import { richTextToPlainLabel } from '@/lib/authoring/bank-image-doc';
import { bodyToTiptap } from '../body-tiptap';
import { tierOf } from './types';
import { resolveReaderSegments } from './readers';
import { buildScope } from './scope';
import type {
  EmbedAnalyticsKpi,
  EmbedAnalyticsOverview,
  EmbedScopeMeta,
  EmbedBlockDetail,
  EmbedNoteAnalytics,
  EmbedNoteHeader,
  EmbedNoteReaders,
  EmbedNoteRow,
  EmbedNoteTab,
  EmbedQuestionDetail,
  EmbedQuestionStat,
  EmbedReaderCell,
  EmbedReaderReport,
  EmbedReaderRow,
  EmbedRosterGroup,
  EmbedRosterRow,
  OptionDist,
  ReadingTier,
  ReportBlock,
  ReportOption,
  ReportQuestion,
} from './types';

// 4-band thresholds (CD "reading lens"). Tunable; shipped hardcoded.
const RETEACH_BELOW = 45;
const RETEACH_CAP = 8;
// Below this many readers a single question's % is noise, so it's kept
// out of the re-teach signal (it can still show in the per-note views).
const MIN_REACH = 3;

// The scope switcher with no cohorts to split by — just "All readers".
const DEFAULT_SCOPE: EmbedScopeMeta = {
  options: [{ key: 'all', label: 'All readers' }],
  activeKey: 'all',
};

/** A Practice block lifted out of a note body, in reading order. */
interface NoteBlock {
  noteId: string;
  noteTitle: string;
  blockId: string;
  /** Tutor-given title, or "Practice N" by reading order. */
  label: string;
  itemIds: string[];
}

function extractEmbedBlocks(
  noteId: string,
  noteTitle: string,
  body: unknown,
): NoteBlock[] {
  const doc = bodyToTiptap(body);
  const out: NoteBlock[] = [];
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
    out.push({
      noteId,
      noteTitle,
      blockId,
      label: title || `Practice ${practiceN}`,
      itemIds,
    });
  }
  return out;
}

/**
 * The Overview read: cross-note re-teach signal + the notes table + the
 * KPI strip. All scoped to the signed-in tutor's own notes/questions.
 */
export async function getEmbedAnalyticsOverview(
  scopeParam: string | null = null,
): Promise<EmbedAnalyticsOverview> {
  const empty: EmbedAnalyticsOverview = {
    kpis: [],
    reteach: [],
    notes: [],
    hasAnyData: false,
    hasAnyBlocks: false,
    scope: DEFAULT_SCOPE,
  };

  const supabase = await createClient();

  // 1. The tutor's notes. The `tutor_id` filter is what makes them
  // the tutor's — RLS is wider than ownership (see ../tutor-scope.ts).
  const tutorId = await getLibraryTutorId();
  if (!tutorId) return empty;

  const { data: noteRows } = await supabase
    .from('nclex_tutor_library_notes')
    .select('note_id, title, body')
    .eq('tutor_id', tutorId);
  const notes = (noteRows ?? []) as Array<{
    note_id: string;
    title: string;
    body: unknown;
  }>;
  if (notes.length === 0) return empty;

  // 2. Lift the Practice blocks out of every note body.
  const blocks: NoteBlock[] = [];
  const noteTitleById = new Map<string, string>();
  for (const n of notes) {
    noteTitleById.set(n.note_id, n.title);
    blocks.push(...extractEmbedBlocks(n.note_id, n.title, n.body));
  }
  if (blocks.length === 0) return empty;

  const blockById = new Map(blocks.map((b) => [b.blockId, b]));
  const notesWithEmbeds = [
    ...new Set(blocks.map((b) => b.noteId)),
  ];
  const totalQuestionPlacements = blocks.reduce(
    (a, b) => a + b.itemIds.length,
    0,
  );

  // 3. Every embed answer on the tutor's questions, scoped to their
  //    notes, oldest-first (so the first row per reader/question is the
  //    first attempt and the last is the latest).
  const { data: answerRows } = await supabase
    .from('nclex_library_embed_answers')
    .select(
      'note_id, block_id, item_id, student_id, is_correct, submitted_at, stem_snapshot',
    )
    .in('note_id', notesWithEmbeds)
    .order('submitted_at', { ascending: true });
  const answers = (answerRows ?? []) as Array<{
    note_id: string;
    block_id: string;
    item_id: string;
    student_id: string;
    is_correct: boolean;
    submitted_at: string;
    stem_snapshot: string | null;
  }>;

  // 3b. Resolve reader segments + the scope filter (cohort / self-paced).
  const allReaderIds = [...new Set(answers.map((a) => a.student_id))];
  const { byId, cohorts } = await resolveReaderSegments(allReaderIds);
  const { meta: scopeMeta, inScope } = buildScope(byId, cohorts, scopeParam);

  // 4. Reduce to one entry per (reader, block, item): first-attempt
  //    verdict + how many re-tries. Keying by block (not just item) means
  //    a question reused across two blocks aggregates per placement,
  //    matching how the readout is grouped.
  interface ReaderItem {
    student: string;
    blockId: string;
    firstCorrect: boolean;
    attempts: number;
  }
  const entries = new Map<string, ReaderItem>(); // key = student|block|item
  const stemByItem = new Map<string, string>();
  for (const a of answers) {
    if (!blockById.has(a.block_id)) continue; // block deleted/restructured
    if (inScope && !inScope.has(a.student_id)) continue; // out of scope
    const key = `${a.student_id}|${a.block_id}|${a.item_id}`;
    const cur = entries.get(key);
    if (!cur) {
      entries.set(key, {
        student: a.student_id,
        blockId: a.block_id,
        firstCorrect: a.is_correct,
        attempts: 1,
      });
    } else {
      cur.attempts += 1;
    }
    if (a.stem_snapshot && !stemByItem.has(a.item_id)) {
      stemByItem.set(a.item_id, richTextToPlainLabel(a.stem_snapshot));
    }
  }

  // 5. Aggregate per question (block|item), per block, per note.
  interface QAgg {
    blockId: string;
    itemId: string;
    reach: number;
    firstCorrect: number;
    retries: number;
  }
  const qAgg = new Map<string, QAgg>(); // key = block|item
  interface BlockAgg {
    first: number;
    firstCorrect: number;
    readers: Set<string>;
  }
  const blockAgg = new Map<string, BlockAgg>();
  const noteFirst = new Map<string, { first: number; firstCorrect: number }>();
  const noteReaders = new Map<string, Set<string>>();
  const activeReaders = new Set<string>();
  let totalFirst = 0;
  let totalFirstCorrect = 0;

  // The entries key carries student|block|item, so item id is the tail.
  for (const [key, e] of entries) {
    const lastSep = key.lastIndexOf('|');
    const itemId = key.slice(lastSep + 1);
    const block = blockById.get(e.blockId);
    if (!block) continue;

    // per-question
    const qk = `${e.blockId}|${itemId}`;
    const qa =
      qAgg.get(qk) ??
      { blockId: e.blockId, itemId, reach: 0, firstCorrect: 0, retries: 0 };
    qa.reach += 1;
    if (e.firstCorrect) qa.firstCorrect += 1;
    qa.retries += e.attempts - 1;
    qAgg.set(qk, qa);

    // per-block
    const ba =
      blockAgg.get(e.blockId) ??
      { first: 0, firstCorrect: 0, readers: new Set<string>() };
    ba.first += 1;
    if (e.firstCorrect) ba.firstCorrect += 1;
    ba.readers.add(e.student);
    blockAgg.set(e.blockId, ba);

    // per-note
    const nf = noteFirst.get(block.noteId) ?? { first: 0, firstCorrect: 0 };
    nf.first += 1;
    if (e.firstCorrect) nf.firstCorrect += 1;
    noteFirst.set(block.noteId, nf);
    const nr = noteReaders.get(block.noteId) ?? new Set<string>();
    nr.add(e.student);
    noteReaders.set(block.noteId, nr);

    // cohort-wide
    activeReaders.add(e.student);
    totalFirst += 1;
    if (e.firstCorrect) totalFirstCorrect += 1;
  }

  // 6. Re-teach signal — questions with enough reach, most-missed first.
  const reteachAll: EmbedQuestionStat[] = [];
  for (const qa of qAgg.values()) {
    if (qa.reach < MIN_REACH) continue;
    const block = blockById.get(qa.blockId);
    if (!block) continue;
    const firstAccPct = Math.round((qa.firstCorrect / qa.reach) * 100);
    reteachAll.push({
      itemId: qa.itemId,
      stem: stemByItem.get(qa.itemId) ?? 'Untitled question',
      blockLabel: block.label,
      noteId: block.noteId,
      noteTitle: block.noteTitle,
      reach: qa.reach,
      firstAccPct,
      retries: qa.retries,
      tier: tierOf(firstAccPct),
    });
  }
  reteachAll.sort(
    (a, b) => a.firstAccPct - b.firstAccPct || b.reach - a.reach,
  );
  const reteachCount = reteachAll.filter(
    (q) => q.firstAccPct < RETEACH_BELOW,
  ).length;

  // 7. Per-note rows (weakest first; no-data notes sink to the bottom).
  const noteRowsOut: EmbedNoteRow[] = notesWithEmbeds.map((noteId) => {
    const noteBlocks = blocks.filter((b) => b.noteId === noteId);
    const nf = noteFirst.get(noteId);
    const reach = noteReaders.get(noteId)?.size ?? 0;
    let firstAccPct: number | null = null;
    let weakestBlockLabel: string | null = null;
    let weakestBlockPct: number | null = null;
    let tier: ReadingTier | null = null;
    if (nf && nf.first > 0) {
      firstAccPct = Math.round((nf.firstCorrect / nf.first) * 100);
      tier = tierOf(firstAccPct);
      for (const b of noteBlocks) {
        const ba = blockAgg.get(b.blockId);
        if (!ba || ba.first === 0) continue;
        const pct = Math.round((ba.firstCorrect / ba.first) * 100);
        if (weakestBlockPct === null || pct < weakestBlockPct) {
          weakestBlockPct = pct;
          weakestBlockLabel = b.label;
        }
      }
    }
    return {
      noteId,
      title: noteTitleById.get(noteId) ?? 'Untitled note',
      blockCount: noteBlocks.length,
      questionCount: noteBlocks.reduce((a, b) => a + b.itemIds.length, 0),
      reach,
      firstAccPct,
      weakestBlockLabel,
      weakestBlockPct,
      tier,
    };
  });
  noteRowsOut.sort((a, b) => {
    if (a.firstAccPct === null && b.firstAccPct === null) {
      return a.title.localeCompare(b.title);
    }
    if (a.firstAccPct === null) return 1;
    if (b.firstAccPct === null) return -1;
    return a.firstAccPct - b.firstAccPct;
  });

  // 8. KPI strip.
  const overallFirstAcc =
    totalFirst > 0 ? Math.round((totalFirstCorrect / totalFirst) * 100) : null;
  const kpis: EmbedAnalyticsKpi[] = [
    {
      label: 'Notes with embeds',
      value: String(notesWithEmbeds.length),
      sub: 'in your library',
    },
    {
      label: 'Embedded questions',
      value: String(totalQuestionPlacements),
      sub: 'across all blocks',
    },
    {
      label: 'Active readers',
      value: String(activeReaders.size),
      sub: 'reached ≥ 1 block',
    },
    {
      label: 'First-try accuracy',
      value: overallFirstAcc === null ? '—' : `${overallFirstAcc}%`,
      sub: 'before any re-read',
      tone: overallFirstAcc === null ? 'neutral' : tierOf(overallFirstAcc),
    },
    {
      label: 'Re-teach targets',
      value: String(reteachCount),
      sub: 'questions under 45% first try',
      tone: reteachCount > 0 ? 'reteach' : 'neutral',
    },
  ];

  return {
    kpis,
    reteach: reteachAll.slice(0, RETEACH_CAP),
    notes: noteRowsOut,
    hasAnyData: totalFirst > 0,
    hasAnyBlocks: true,
    scope: scopeMeta,
  };
}

// ── Per-note drill-in (Slice 2) ──────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  MCQ: 'MCQ',
  TF: 'TF',
  SATA: 'SATA',
  SELECT_N: 'SELECT N',
};

/** Did a first-attempt answer select this option id? (MCQ/TF = pick;
 *  SATA/Select-N = membership.) */
function selected(answer: unknown, id: string): boolean {
  if (typeof answer === 'string') return answer === id;
  if (Array.isArray(answer)) return (answer as unknown[]).includes(id);
  return false;
}

function correctIdSet(type: string, correctSnap: unknown): Set<string> {
  if (type === 'SATA' || type === 'SELECT_N') {
    const arr = (correctSnap as { answers?: unknown })?.answers;
    return new Set(
      Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [],
    );
  }
  const a = (correctSnap as { answer?: unknown })?.answer;
  return new Set(typeof a === 'string' ? [a] : []);
}

interface QGroup {
  reach: number;
  firstCorrect: number;
  latestCorrect: number;
  retried: number;
  /** Each reader's first-attempt answer_json — for the distribution. */
  firstAnswers: unknown[];
  /** A representative content snapshot (for the option labels). */
  content: unknown;
  correctSnap: unknown;
  type: string;
}

/** The full first-attempt answer distribution: every option, with KEY +
 *  TOP-MISS flags (the latter when >=20% of readers fell for one wrong one). */
function buildOptions(g: QGroup): OptionDist[] {
  const opts =
    (g.content as { options?: Array<{ id: string; text: string }> })?.options ?? [];
  if (opts.length === 0) return [];
  const keys = correctIdSet(g.type, g.correctSnap);
  const counts = opts.map((o) => ({
    text: richTextToPlain(o.text),
    key: keys.has(o.id),
    count: g.firstAnswers.filter((a) => selected(a, o.id)).length,
  }));
  let trapIdx = -1;
  let trapN = -1;
  counts.forEach((c, i) => {
    if (!c.key && c.count > trapN) {
      trapN = c.count;
      trapIdx = i;
    }
  });
  const reach = g.reach;
  return counts.map((c, i) => ({
    letter: String.fromCharCode(65 + i),
    text: c.text,
    pct: reach ? Math.round((c.count / reach) * 100) : 0,
    isKey: c.key,
    isTrap: i === trapIdx && trapN > 0 && reach > 0 && trapN / reach >= 0.2,
  }));
}

function buildQuestionDetail(
  itemId: string,
  n: number,
  type: string,
  stem: string,
  g: QGroup | undefined,
  minReach: number,
): EmbedQuestionDetail {
  const typeLabel = TYPE_LABEL[type] ?? type;
  const isSelect = type === 'SATA' || type === 'SELECT_N';
  const distNote = isSelect
    ? '% of readers who selected each option · all correct options needed'
    : '% of readers who chose each option';
  if (!g || g.reach === 0) {
    return {
      itemId,
      n,
      questionType: type,
      typeLabel,
      stem,
      reach: 0,
      retriedN: 0,
      noData: true,
      thin: false,
      firstAccPct: 0,
      latestAccPct: 0,
      liftPts: 0,
      tier: null,
      options: [],
      distNote,
    };
  }
  const reach = g.reach;
  const firstAccPct = Math.round((g.firstCorrect / reach) * 100);
  const latestAccPct = Math.round((g.latestCorrect / reach) * 100);
  return {
    itemId,
    n,
    questionType: type,
    typeLabel,
    stem,
    reach,
    retriedN: g.retried,
    noData: false,
    thin: reach < minReach,
    firstAccPct,
    latestAccPct,
    liftPts: latestAccPct - firstAccPct,
    tier: tierOf(firstAccPct),
    options: buildOptions(g),
    distNote,
  };
}

/**
 * The per-note drill-in read (Slice 2 — Questions tab). Blocks in reading
 * order, each with its questions' first-try accuracy, full answer
 * distribution, and after-re-practice lift. Returns null if the note
 * isn't owned/readable (page -> 404).
 */
export async function getEmbedAnalyticsNote(
  noteId: string,
  scopeParam: string | null = null,
): Promise<EmbedNoteAnalytics | null> {
  const MIN = 3;
  const supabase = await createClient();

  const tutorId = await getLibraryTutorId();
  if (!tutorId) return null;

  const { data: note } = await supabase
    .from('nclex_tutor_library_notes')
    .select('note_id, title, body')
    .eq('note_id', noteId)
    .eq('tutor_id', tutorId)
    .maybeSingle();
  if (!note) return null;
  const nrow = note as { note_id: string; title: string; body: unknown };

  const blocks = extractEmbedBlocks(nrow.note_id, nrow.title, nrow.body);
  const blockCount = blocks.length;
  const questionCount = blocks.reduce((a, b) => a + b.itemIds.length, 0);

  const baseEmpty: EmbedNoteAnalytics = {
    noteId,
    noteTitle: nrow.title,
    reach: 0,
    firstAccPct: null,
    blockCount,
    questionCount,
    blocks: [],
    hasAnyData: false,
    scope: DEFAULT_SCOPE,
  };
  if (blocks.length === 0) return baseEmpty;

  const blockById = new Map(blocks.map((b) => [b.blockId, b]));
  const allItemIds = [...new Set(blocks.flatMap((b) => b.itemIds))];

  // Live question stems/types (RLS = the tutor's own questions) — so even
  // un-answered questions render with their real text.
  const { data: qRows } = await supabase
    .from('nclex_tutor_questions')
    .select('item_id, stem, question_type')
    .in('item_id', allItemIds);
  const qMeta = new Map(
    ((qRows ?? []) as Array<{
      item_id: string;
      stem: string;
      question_type: string;
    }>).map((q) => [q.item_id, { stem: richTextToPlainLabel(q.stem), type: q.question_type }]),
  );

  const { data: answerRows } = await supabase
    .from('nclex_library_embed_answers')
    .select(
      'block_id, item_id, student_id, is_correct, submitted_at, question_type, answer_json, content_snapshot_json, correct_answer_snapshot_json',
    )
    .eq('note_id', noteId)
    .order('submitted_at', { ascending: true });
  const answers = (answerRows ?? []) as Array<{
    block_id: string;
    item_id: string;
    student_id: string;
    is_correct: boolean;
    submitted_at: string;
    question_type: string;
    answer_json: unknown;
    content_snapshot_json: unknown;
    correct_answer_snapshot_json: unknown;
  }>;

  // Resolve reader segments + the scope filter (cohort / self-paced).
  const allReaderIds = [...new Set(answers.map((a) => a.student_id))];
  const { byId, cohorts } = await resolveReaderSegments(allReaderIds);
  const { meta: scopeMeta, inScope } = buildScope(byId, cohorts, scopeParam);

  // Per (reader, block, item): first attempt + final verdict + re-tries.
  interface Entry {
    student: string;
    blockId: string;
    itemId: string;
    firstCorrect: boolean;
    firstAnswer: unknown;
    content: unknown;
    correctSnap: unknown;
    type: string;
    attempts: number;
    lastCorrect: boolean;
  }
  const entries = new Map<string, Entry>();
  for (const a of answers) {
    if (!blockById.has(a.block_id)) continue;
    if (inScope && !inScope.has(a.student_id)) continue;
    const key = `${a.student_id}|${a.block_id}|${a.item_id}`;
    const cur = entries.get(key);
    if (!cur) {
      entries.set(key, {
        student: a.student_id,
        blockId: a.block_id,
        itemId: a.item_id,
        firstCorrect: a.is_correct,
        firstAnswer: a.answer_json,
        content: a.content_snapshot_json,
        correctSnap: a.correct_answer_snapshot_json,
        type: a.question_type,
        attempts: 1,
        lastCorrect: a.is_correct,
      });
    } else {
      cur.attempts += 1;
      cur.lastCorrect = a.is_correct;
    }
  }

  const groups = new Map<string, QGroup>(); // block|item
  const blockReaders = new Map<string, Set<string>>();
  const blockFirst = new Map<string, { first: number; correct: number }>();
  const noteReaders = new Set<string>();
  let noteFirst = 0;
  let noteFirstCorrect = 0;

  for (const e of entries.values()) {
    const qk = `${e.blockId}|${e.itemId}`;
    const g =
      groups.get(qk) ??
      ({
        reach: 0,
        firstCorrect: 0,
        latestCorrect: 0,
        retried: 0,
        firstAnswers: [],
        content: e.content,
        correctSnap: e.correctSnap,
        type: e.type,
      } satisfies QGroup);
    g.reach += 1;
    if (e.firstCorrect) g.firstCorrect += 1;
    if (e.lastCorrect) g.latestCorrect += 1;
    if (e.attempts > 1) g.retried += 1;
    g.firstAnswers.push(e.firstAnswer);
    if (g.content == null) g.content = e.content;
    if (g.correctSnap == null) g.correctSnap = e.correctSnap;
    groups.set(qk, g);

    const br = blockReaders.get(e.blockId) ?? new Set<string>();
    br.add(e.student);
    blockReaders.set(e.blockId, br);
    const bf = blockFirst.get(e.blockId) ?? { first: 0, correct: 0 };
    bf.first += 1;
    if (e.firstCorrect) bf.correct += 1;
    blockFirst.set(e.blockId, bf);

    noteReaders.add(e.student);
    noteFirst += 1;
    if (e.firstCorrect) noteFirstCorrect += 1;
  }

  const blockDetails: EmbedBlockDetail[] = blocks.map((b, bi) => {
    const bf = blockFirst.get(b.blockId);
    const reach = blockReaders.get(b.blockId)?.size ?? 0;
    const firstAccPct =
      bf && bf.first > 0 ? Math.round((bf.correct / bf.first) * 100) : null;
    const questions = b.itemIds.map((itemId, idx) => {
      const meta = qMeta.get(itemId);
      const g = groups.get(`${b.blockId}|${itemId}`);
      const type = meta?.type ?? g?.type ?? '';
      const stem = (meta?.stem ?? '').trim() || 'Untitled question';
      return buildQuestionDetail(itemId, idx + 1, type, stem, g, MIN);
    });
    return {
      blockId: b.blockId,
      index: bi,
      title: b.label,
      reach,
      answers: bf?.first ?? 0,
      questionCount: b.itemIds.length,
      firstAccPct,
      tier: firstAccPct === null ? null : tierOf(firstAccPct),
      questions,
    };
  });

  return {
    noteId,
    noteTitle: nrow.title,
    reach: noteReaders.size,
    firstAccPct:
      noteFirst > 0 ? Math.round((noteFirstCorrect / noteFirst) * 100) : null,
    blockCount,
    questionCount,
    blocks: blockDetails,
    hasAnyData: noteFirst > 0,
    scope: scopeMeta,
  };
}

// ── Roster + Readers tabs (Slice 3a) ─────────────────────────────────

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

/**
 * Per-note "who answered" read (Slice 3a) — feeds the Roster heatmap
 * (reader × block first-try accuracy, grouped by cohort / self-paced)
 * and the Readers list. Reader names + segments come from
 * resolveReaderSegments. Returns null if the note isn't owned/readable.
 */
export async function getEmbedNoteReaders(
  noteId: string,
  scopeParam: string | null = null,
): Promise<EmbedNoteReaders | null> {
  const supabase = await createClient();

  const tutorId = await getLibraryTutorId();
  if (!tutorId) return null;

  const { data: note } = await supabase
    .from('nclex_tutor_library_notes')
    .select('note_id, title, body')
    .eq('note_id', noteId)
    .eq('tutor_id', tutorId)
    .maybeSingle();
  if (!note) return null;
  const nrow = note as { note_id: string; title: string; body: unknown };

  const blocks = extractEmbedBlocks(nrow.note_id, nrow.title, nrow.body);
  const blockCount = blocks.length;
  const questionCount = blocks.reduce((a, b) => a + b.itemIds.length, 0);
  const cols = blocks.map((b, i) => ({ label: `B${i + 1}`, title: b.label }));

  const header: EmbedNoteHeader = {
    noteId,
    noteTitle: nrow.title,
    reach: 0,
    firstAccPct: null,
    blockCount,
    questionCount,
    hasAnyData: false,
    scope: DEFAULT_SCOPE,
  };
  if (blocks.length === 0) {
    return { ...header, cols, groups: [], readers: [] };
  }

  const blockById = new Map(blocks.map((b) => [b.blockId, b]));

  const { data: answerRows } = await supabase
    .from('nclex_library_embed_answers')
    .select('block_id, item_id, student_id, is_correct, submitted_at')
    .eq('note_id', noteId)
    .order('submitted_at', { ascending: true });
  const answers = (answerRows ?? []) as Array<{
    block_id: string;
    item_id: string;
    student_id: string;
    is_correct: boolean;
    submitted_at: string;
  }>;

  // Per (reader, block, item): first attempt + re-tries.
  interface Entry {
    student: string;
    blockId: string;
    firstCorrect: boolean;
    attempts: number;
  }
  const entries = new Map<string, Entry>();
  for (const a of answers) {
    if (!blockById.has(a.block_id)) continue;
    const key = `${a.student_id}|${a.block_id}|${a.item_id}`;
    const cur = entries.get(key);
    if (!cur) {
      entries.set(key, {
        student: a.student_id,
        blockId: a.block_id,
        firstCorrect: a.is_correct,
        attempts: 1,
      });
    } else {
      cur.attempts += 1;
    }
  }

  // Per reader: per-block first counts + overall + re-tries + blocks seen.
  interface SAgg {
    perBlock: Map<string, { first: number; correct: number }>;
    total: number;
    correct: number;
    retried: number;
    blocks: Set<string>;
  }
  const sAgg = new Map<string, SAgg>();
  for (const e of entries.values()) {
    const s =
      sAgg.get(e.student) ??
      {
        perBlock: new Map<string, { first: number; correct: number }>(),
        total: 0,
        correct: 0,
        retried: 0,
        blocks: new Set<string>(),
      };
    const pb = s.perBlock.get(e.blockId) ?? { first: 0, correct: 0 };
    pb.first += 1;
    if (e.firstCorrect) pb.correct += 1;
    s.perBlock.set(e.blockId, pb);
    s.total += 1;
    if (e.firstCorrect) s.correct += 1;
    if (e.attempts > 1) s.retried += 1;
    s.blocks.add(e.blockId);
    sAgg.set(e.student, s);
  }

  const studentIds = [...sAgg.keys()];
  const { byId, cohorts } = await resolveReaderSegments(studentIds);
  const { meta: scopeMeta, inScope } = buildScope(byId, cohorts, scopeParam);

  let noteFirst = 0;
  let noteFirstCorrect = 0;
  let scopedReaders = 0;
  for (const [sid, s] of sAgg) {
    if (inScope && !inScope.has(sid)) continue;
    scopedReaders += 1;
    noteFirst += s.total;
    noteFirstCorrect += s.correct;
  }

  const cellsFor = (s: SAgg): EmbedReaderCell[] =>
    blocks.map((b) => {
      const pb = s.perBlock.get(b.blockId);
      if (!pb || pb.first === 0) return { pct: null, tier: null };
      const pct = Math.round((pb.correct / pb.first) * 100);
      return { pct, tier: tierOf(pct) };
    });
  const overallOf = (
    s: SAgg,
  ): { pct: number | null; tier: ReadingTier | null } => {
    if (s.total === 0) return { pct: null, tier: null };
    const pct = Math.round((s.correct / s.total) * 100);
    return { pct, tier: tierOf(pct) };
  };

  const rosterByCohort = new Map<string, EmbedRosterRow[]>();
  const rosterSelf: EmbedRosterRow[] = [];
  const readers: EmbedReaderRow[] = [];

  for (const [sid, s] of sAgg) {
    if (inScope && !inScope.has(sid)) continue;
    const seg = byId.get(sid) ?? {
      name: 'Reader',
      cohortId: null,
      cohortName: null,
    };
    const ov = overallOf(s);
    const rosterRow: EmbedRosterRow = {
      studentId: sid,
      name: seg.name,
      cells: cellsFor(s),
      overallPct: ov.pct,
      tier: ov.tier,
    };
    if (seg.cohortId) {
      const arr = rosterByCohort.get(seg.cohortId) ?? [];
      arr.push(rosterRow);
      rosterByCohort.set(seg.cohortId, arr);
    } else {
      rosterSelf.push(rosterRow);
    }

    readers.push({
      studentId: sid,
      name: seg.name,
      initials: initialsOf(seg.name),
      segmentLabel: seg.cohortName ?? 'Self-paced',
      isCohort: !!seg.cohortId,
      blocksReached: s.blocks.size,
      totalBlocks: blockCount,
      overallPct: ov.pct,
      tier: ov.tier,
      retriedLabel: s.retried > 0 ? `${s.retried} retried` : '—',
    });
  }

  const sortRows = (rows: EmbedRosterRow[]) =>
    rows.sort((a, b) => (a.overallPct ?? 999) - (b.overallPct ?? 999));
  const groups: EmbedRosterGroup[] = [];
  for (const c of cohorts) {
    const rows = sortRows(rosterByCohort.get(c.id) ?? []);
    if (rows.length) {
      groups.push({
        key: c.id,
        label: c.name,
        count: rows.length,
        kind: 'cohort',
        rows,
      });
    }
  }
  if (rosterSelf.length) {
    groups.push({
      key: 'self',
      label: 'Self-paced',
      count: rosterSelf.length,
      kind: 'self',
      rows: sortRows(rosterSelf),
    });
  }

  readers.sort((a, b) => (a.overallPct ?? 999) - (b.overallPct ?? 999));

  return {
    noteId,
    noteTitle: nrow.title,
    reach: scopedReaders,
    firstAccPct:
      noteFirst > 0 ? Math.round((noteFirstCorrect / noteFirst) * 100) : null,
    blockCount,
    questionCount,
    hasAnyData: noteFirst > 0,
    cols,
    groups,
    readers,
    scope: scopeMeta,
  };
}

// ── Per-reader report (Slice 3b) ─────────────────────────────────────

/**
 * One reader's full picture on a note — their first-attempt answer on
 * each embedded question (their pick + the key), whether they recovered
 * on re-practice, block by block. Returns null if the note isn't
 * owned/readable.
 */
export async function getEmbedReaderReport(
  noteId: string,
  studentId: string,
  fromTab: EmbedNoteTab = 'roster',
): Promise<EmbedReaderReport | null> {
  const supabase = await createClient();

  const tutorId = await getLibraryTutorId();
  if (!tutorId) return null;

  const { data: note } = await supabase
    .from('nclex_tutor_library_notes')
    .select('note_id, title, body')
    .eq('note_id', noteId)
    .eq('tutor_id', tutorId)
    .maybeSingle();
  if (!note) return null;
  const nrow = note as { note_id: string; title: string; body: unknown };

  const blocks = extractEmbedBlocks(nrow.note_id, nrow.title, nrow.body);
  const blockById = new Map(blocks.map((b) => [b.blockId, b]));
  const allItemIds = [...new Set(blocks.flatMap((b) => b.itemIds))];

  // Live question content (RLS = the tutor's own) — so un-answered
  // questions still show their options + key.
  const { data: qRows } = await supabase
    .from('nclex_tutor_questions')
    .select('item_id, stem, question_type, content, correct')
    .in('item_id', allItemIds);
  const qMeta = new Map(
    ((qRows ?? []) as Array<{
      item_id: string;
      stem: string;
      question_type: string;
      content: unknown;
      correct: unknown;
    }>).map((q) => [
      q.item_id,
      { stem: richTextToPlainLabel(q.stem), type: q.question_type, content: q.content, correct: q.correct },
    ]),
  );

  const { data: answerRows } = await supabase
    .from('nclex_library_embed_answers')
    .select(
      'block_id, item_id, is_correct, submitted_at, answer_json, content_snapshot_json, correct_answer_snapshot_json, question_type',
    )
    .eq('note_id', noteId)
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: true });
  const answers = (answerRows ?? []) as Array<{
    block_id: string;
    item_id: string;
    is_correct: boolean;
    submitted_at: string;
    answer_json: unknown;
    content_snapshot_json: unknown;
    correct_answer_snapshot_json: unknown;
    question_type: string;
  }>;

  interface E {
    firstCorrect: boolean;
    firstAnswer: unknown;
    content: unknown;
    correctSnap: unknown;
    type: string;
    plays: number;
    lastCorrect: boolean;
  }
  const entries = new Map<string, E>(); // block|item
  for (const a of answers) {
    if (!blockById.has(a.block_id)) continue;
    const key = `${a.block_id}|${a.item_id}`;
    const cur = entries.get(key);
    if (!cur) {
      entries.set(key, {
        firstCorrect: a.is_correct,
        firstAnswer: a.answer_json,
        content: a.content_snapshot_json,
        correctSnap: a.correct_answer_snapshot_json,
        type: a.question_type,
        plays: 1,
        lastCorrect: a.is_correct,
      });
    } else {
      cur.plays += 1;
      cur.lastCorrect = a.is_correct;
    }
  }

  let tot = 0;
  let corr = 0;
  let lat = 0;
  const reportBlocks: ReportBlock[] = blocks.map((b, bi) => {
    const questions: ReportQuestion[] = b.itemIds.map((itemId) => {
      const meta = qMeta.get(itemId);
      const e = entries.get(`${b.blockId}|${itemId}`);
      const type = meta?.type ?? e?.type ?? '';
      const stem = (meta?.stem ?? '').trim() || 'Untitled question';
      const answered = !!e;
      if (e) {
        tot += 1;
        if (e.firstCorrect) corr += 1;
        if (e.lastCorrect) lat += 1;
      }
      const firstCorrect = !!e && e.firstCorrect;
      const edgeTone: 'na' | 'ok' | 'bad' = !e ? 'na' : firstCorrect ? 'ok' : 'bad';
      const mark = !e ? '○' : firstCorrect ? '✓' : '✕';

      const contentSrc = e?.content ?? meta?.content;
      const correctSrc = e?.correctSnap ?? meta?.correct;
      const opts =
        (contentSrc as { options?: Array<{ id: string; text: string }> })
          ?.options ?? [];
      const keys = correctIdSet(type, correctSrc);
      const options: ReportOption[] = opts.map((o, i) => ({
        letter: String.fromCharCode(65 + i),
        text: richTextToPlain(o.text),
        isKey: keys.has(o.id),
        isYou: e ? selected(e.firstAnswer, o.id) : false,
      }));

      let qNote: string;
      if (!e) qNote = 'Not reached yet.';
      else if (firstCorrect)
        qNote = 'Correct on first try' + (e.plays > 1 ? ' · re-practiced' : '');
      else
        qNote =
          'Missed first try' +
          (e.lastCorrect
            ? ', got it after re-practice'
            : e.plays > 1
              ? ', still missed on retry'
              : '');

      return { itemId, stem, answered, mark, edgeTone, options, note: qNote };
    });
    return { tag: `Block ${bi + 1}`, title: b.label, questions };
  });

  const { byId } = await resolveReaderSegments([studentId]);
  const seg = byId.get(studentId) ?? {
    name: 'Reader',
    cohortId: null,
    cohortName: null,
  };

  return {
    noteId,
    noteTitle: nrow.title,
    studentId,
    name: seg.name,
    initials: initialsOf(seg.name),
    segmentLabel: seg.cohortName ?? 'Self-paced',
    isCohort: !!seg.cohortId,
    firstScoreLabel: `${corr} / ${tot}`,
    firstTier: tot > 0 ? tierOf(Math.round((corr / tot) * 100)) : null,
    latestAccPct: tot > 0 ? Math.round((lat / tot) * 100) : null,
    blocks: reportBlocks,
    fromTab,
  };
}
