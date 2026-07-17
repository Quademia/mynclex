// mynclex/lib/library/student/embed-player-actions.ts
//
// The secure server path for the embedded-questions player (slice
// 11.13b). Students cannot read nclex_tutor_questions directly (RLS =
// tutor/admin only), so these two actions are the only way the player
// touches the question bank — gated, and never leaking the answer key
// before submit (the runner's "Pillar 2" rule).
//
//   loadEmbedBlock   — entitlement-gate the note, find the block by id,
//                      return ANSWERABLE content (stem/options, NO key)
//                      for the block's current questions + the student's
//                      prior-attempt summary.
//   submitEmbedAnswer — entitlement-gate, read the full question via the
//                      service-role client, grade with lib/scoring,
//                      append a snapshotted history row, and return the
//                      feedback (key + rationale) for inline review.
//
// Both re-read the note body server-side and take the block's item_ids
// from there — the browser's claims about which questions are in the
// block are never trusted.

'use server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { bodyToTiptap } from '../body-tiptap';
import { scoreAttempt, type BankItemAnswer } from '@/lib/scoring';
import type { QuestionType } from '@/lib/bank/classifications';
import type { BankItemCorrect } from '@/lib/bank/types';
import { EMBED_QUESTION_TYPES, type EmbedQuestionType } from '../types';
// The embed player runs its OWN option shuffle (option B) — it never touches
// nclex_attempt_items, so the attempt-side trigger can't reach it. The display
// order is a deterministic permutation seeded on (play_id, item_id): the client
// computes it to render, and submitEmbedAnswer re-derives the SAME order here to
// persist (shared helper = identical result), so review replays exactly what the
// student saw.
import { embedOptionOrder } from '@/lib/practice/runner/option-order';

const EMBED_TYPE_SET = new Set<string>(EMBED_QUESTION_TYPES);

/** One question, ready for the player to render in answering mode. */
export type EmbedPlayQuestion = {
  itemId: string;
  questionType: EmbedQuestionType;
  stem: string;
  instruction: string | null;
  /** McqContent / SataContent / … — answerable options only, NO key. */
  content: unknown;
  marks: number;
  /** Whether this question's options shuffle (the tutor's per-item flag). The
   *  client seeds the display order on play_id + item_id when true. */
  shuffleOptions: boolean;
  /** How many times this student has answered this question (any sitting). */
  priorAttempts: number;
  /** The most recent attempt's verdict, or null if never answered. */
  lastCorrect: boolean | null;
};

/** One past sitting (play) at this block — for the intro card's list. */
export type EmbedSitting = {
  playId: string;
  /** Time of the latest answer in the sitting. */
  at: string;
  answered: number;
  correct: number;
};

export type EmbedBlockData = {
  blockId: string;
  questions: EmbedPlayQuestion[];
  /**
   * The student's past sittings at this block, newest first. The intro
   * card lists them (date + X/Y) and lets each be reviewed read-only.
   * Empty if they've never played this block.
   */
  sittings: EmbedSitting[];
};

/** One question as the student answered it in a past sitting — read-only review. */
export type EmbedReviewQuestion = {
  itemId: string;
  questionType: EmbedQuestionType;
  stem: string;
  instruction: string | null;
  /** Frozen snapshot content + key — what they actually saw. */
  content: unknown;
  correct: unknown;
  rationale: string | null;
  rationaleImg: string | null;
  marks: number;
  studentAnswer: unknown;
  isCorrect: boolean;
  scoreAwarded: number;
  /** The display order the student saw (option shuffle). NULL = authored order. */
  optionOrder: unknown;
};

export type EmbedSubmitResult =
  | {
      ok: true;
      isCorrect: boolean;
      scoreAwarded: number;
      marks: number;
      /** McqCorrect / SataCorrect / … — key + per-option feedback for review. */
      correct: unknown;
      rationale: string | null;
      rationaleImg: string | null;
    }
  | { ok: false; error: string };

// Find an embedded_questions block by its stable id and return its
// CURRENT item_ids (server-authoritative). Embed blocks are top-level
// doc nodes.
function findEmbedBlock(
  body: unknown,
  blockId: string,
): { itemIds: string[] } | null {
  const doc = bodyToTiptap(body);
  for (const node of doc.content ?? []) {
    if (
      node.type === 'embedded_questions' &&
      node.attrs?.id === blockId
    ) {
      const raw = node.attrs?.item_ids;
      const itemIds = Array.isArray(raw)
        ? raw.filter((x): x is string => typeof x === 'string')
        : [];
      return { itemIds };
    }
  }
  return null;
}

export async function loadEmbedBlock(
  noteId: string,
  blockId: string,
): Promise<EmbedBlockData | null> {
  const supabase = await createClient();

  // 1. Entitlement — RLS returns the note only if the student may read it.
  const { data: note, error } = await supabase
    .from('nclex_tutor_library_notes')
    .select('body')
    .eq('note_id', noteId)
    .maybeSingle();
  if (error || !note) return null;

  // 2. Locate the block + its current questions (server-authoritative).
  const block = findEmbedBlock((note as { body: unknown }).body, blockId);
  if (!block) return null;
  if (block.itemIds.length === 0)
    return { blockId, questions: [], sittings: [] };

  // 3. Answerable content via service role (no student RLS on questions).
  //    Select content but NOT correct / rationale — the key stays server-side
  //    until the student submits.
  const admin = createServiceRoleClient();
  const { data: qRows } = await admin
    .from('nclex_tutor_questions')
    .select('item_id, question_type, stem, instruction, content, marks, shuffle_options')
    .in('item_id', block.itemIds);

  const byId = new Map(
    (qRows ?? []).map((q) => [
      (q as { item_id: string }).item_id,
      q as {
        item_id: string;
        question_type: string;
        stem: string;
        instruction: string | null;
        content: unknown;
        marks: number;
        shuffle_options: boolean;
      },
    ]),
  );

  // 4. The student's prior attempts on this block (RLS = own rows),
  //    newest first.
  const { data: history } = await supabase
    .from('nclex_library_embed_answers')
    .select('item_id, is_correct, submitted_at, play_id')
    .eq('note_id', noteId)
    .eq('block_id', blockId)
    .order('submitted_at', { ascending: false });

  const rows = (history ?? []) as Array<{
    item_id: string;
    is_correct: boolean;
    submitted_at: string;
    play_id: string;
  }>;

  const hist = new Map<string, { count: number; lastCorrect: boolean }>();
  for (const h of rows) {
    const cur = hist.get(h.item_id);
    if (cur) cur.count += 1;
    // First row seen per item is the latest (desc order).
    else hist.set(h.item_id, { count: 1, lastCorrect: h.is_correct });
  }

  // Group rows into sittings by play_id. Rows are newest-first, so each
  // play is first seen at its latest answer — giving sittings in
  // newest-first order with `at` = the sitting's most recent answer.
  const playMap = new Map<
    string,
    { at: string; answered: number; correct: number }
  >();
  for (const r of rows) {
    const cur = playMap.get(r.play_id);
    if (cur) {
      cur.answered += 1;
      if (r.is_correct) cur.correct += 1;
    } else {
      playMap.set(r.play_id, {
        at: r.submitted_at,
        answered: 1,
        correct: r.is_correct ? 1 : 0,
      });
    }
  }
  const sittings: EmbedSitting[] = Array.from(playMap.entries()).map(
    ([playId, v]) => ({ playId, ...v }),
  );

  // 5. Assemble in the block's authored order; drop deleted / non-embed.
  const questions: EmbedPlayQuestion[] = [];
  for (const id of block.itemIds) {
    const q = byId.get(id);
    if (!q || !EMBED_TYPE_SET.has(q.question_type)) continue;
    const h = hist.get(id);
    questions.push({
      itemId: q.item_id,
      questionType: q.question_type as EmbedQuestionType,
      stem: q.stem,
      instruction: q.instruction ?? null,
      content: q.content,
      marks: Number(q.marks),
      shuffleOptions: q.shuffle_options !== false,
      priorAttempts: h?.count ?? 0,
      lastCorrect: h ? h.lastCorrect : null,
    });
  }

  return { blockId, questions, sittings };
}

/**
 * The student's answers for one past sitting (play) — for read-only
 * review. Reads the student's OWN history rows (RLS self_select), so the
 * frozen snapshot (content + key + rationale + their answer) comes
 * straight back; no service-role / live-question read needed. Ordered as
 * they answered them.
 */
export async function loadEmbedPlayReview(
  noteId: string,
  blockId: string,
  playId: string,
): Promise<EmbedReviewQuestion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_library_embed_answers')
    .select(
      'item_id, question_type, stem_snapshot, instruction_snapshot, content_snapshot_json, correct_answer_snapshot_json, rationale_snapshot, rationale_img_snapshot, marks_snapshot, answer_json, is_correct, score_awarded, option_order_json',
    )
    .eq('note_id', noteId)
    .eq('block_id', blockId)
    .eq('play_id', playId)
    .order('submitted_at', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => {
    const r = row as {
      item_id: string;
      question_type: string;
      stem_snapshot: string;
      instruction_snapshot: string | null;
      content_snapshot_json: unknown;
      correct_answer_snapshot_json: unknown;
      rationale_snapshot: string | null;
      rationale_img_snapshot: string | null;
      marks_snapshot: number;
      answer_json: unknown;
      is_correct: boolean;
      score_awarded: number;
      option_order_json: unknown;
    };
    return {
      itemId: r.item_id,
      questionType: r.question_type as EmbedQuestionType,
      stem: r.stem_snapshot,
      instruction: r.instruction_snapshot,
      content: r.content_snapshot_json,
      correct: r.correct_answer_snapshot_json,
      rationale: r.rationale_snapshot,
      rationaleImg: r.rationale_img_snapshot,
      marks: Number(r.marks_snapshot),
      studentAnswer: r.answer_json,
      isCorrect: r.is_correct,
      scoreAwarded: r.score_awarded,
      optionOrder: r.option_order_json ?? null,
    } satisfies EmbedReviewQuestion;
  });
}

export async function submitEmbedAnswer(args: {
  noteId: string;
  blockId: string;
  itemId: string;
  /** The current sitting's id — groups all answers from one Start→finish run. */
  playId: string;
  answer: BankItemAnswer;
  timeSpentSec?: number | null;
}): Promise<EmbedSubmitResult> {
  const { noteId, blockId, itemId } = args;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  // 1. Entitlement + membership — re-read the note, confirm the question
  //    really belongs to this block (don't trust the client).
  const { data: note, error } = await supabase
    .from('nclex_tutor_library_notes')
    .select('body')
    .eq('note_id', noteId)
    .maybeSingle();
  if (error || !note) return { ok: false, error: 'Not found.' };

  const block = findEmbedBlock((note as { body: unknown }).body, blockId);
  if (!block || !block.itemIds.includes(itemId)) {
    return { ok: false, error: 'Not found.' };
  }

  // 2. Read the full question (key included) via service role.
  const admin = createServiceRoleClient();
  const { data: q, error: qErr } = await admin
    .from('nclex_tutor_questions')
    .select(
      'item_id, question_type, stem, instruction, content, correct, rationale, rationale_img, marks, shuffle_options',
    )
    .eq('item_id', itemId)
    .maybeSingle();
  if (qErr || !q) return { ok: false, error: 'Question unavailable.' };

  const question = q as {
    question_type: string;
    stem: string;
    instruction: string | null;
    content: unknown;
    correct: unknown;
    rationale: string | null;
    rationale_img: string | null;
    marks: number;
    shuffle_options: boolean;
  };
  if (!EMBED_TYPE_SET.has(question.question_type)) {
    return { ok: false, error: 'Unsupported question type.' };
  }

  // 3. Grade server-side (reuses the runner's scorer). Scoring keys on option
  //    id, so the display shuffle below never affects the grade.
  const result = scoreAttempt(
    question.question_type as QuestionType,
    question.correct as BankItemCorrect,
    args.answer,
  );

  // 3b. Re-derive the exact display order the client showed (deterministic on
  //     play_id + item_id) and freeze it into the snapshot so review replays it.
  const optionOrder = embedOptionOrder(
    question.question_type,
    question.content,
    question.shuffle_options !== false,
    args.playId,
    itemId,
  );

  // 4. Append the snapshotted history row (student client — RLS enforces
  //    student_id = auth.uid()). Append-only; never updates.
  const { error: insErr } = await supabase
    .from('nclex_library_embed_answers')
    .insert({
      student_id: user.id,
      note_id: noteId,
      block_id: blockId,
      play_id: args.playId,
      item_id: itemId,
      question_type: question.question_type,
      answer_json: args.answer,
      is_correct: result.is_correct,
      score_awarded: result.score_awarded,
      time_spent_sec: args.timeSpentSec ?? null,
      stem_snapshot: question.stem,
      instruction_snapshot: question.instruction ?? null,
      content_snapshot_json: question.content,
      correct_answer_snapshot_json: question.correct,
      rationale_snapshot: question.rationale ?? null,
      rationale_img_snapshot: question.rationale_img ?? null,
      marks_snapshot: question.marks,
      option_order_json: optionOrder,
    });
  if (insErr) return { ok: false, error: 'Could not save your answer.' };

  // 5. Return the review payload (key + rationale) for inline feedback.
  return {
    ok: true,
    isCorrect: result.is_correct,
    scoreAwarded: result.score_awarded,
    marks: Number(question.marks),
    correct: question.correct,
    rationale: question.rationale ?? null,
    rationaleImg: question.rationale_img ?? null,
  };
}
