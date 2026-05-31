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
  /** How many times this student has answered this question (any sitting). */
  priorAttempts: number;
  /** The most recent attempt's verdict, or null if never answered. */
  lastCorrect: boolean | null;
};

export type EmbedBlockData = {
  blockId: string;
  questions: EmbedPlayQuestion[];
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
  if (block.itemIds.length === 0) return { blockId, questions: [] };

  // 3. Answerable content via service role (no student RLS on questions).
  //    Select content but NOT correct / rationale — the key stays server-side
  //    until the student submits.
  const admin = createServiceRoleClient();
  const { data: qRows } = await admin
    .from('nclex_tutor_questions')
    .select('item_id, question_type, stem, instruction, content, marks')
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
      },
    ]),
  );

  // 4. The student's prior attempts on this block (RLS = own rows).
  const { data: history } = await supabase
    .from('nclex_library_embed_answers')
    .select('item_id, is_correct, submitted_at')
    .eq('note_id', noteId)
    .eq('block_id', blockId)
    .order('submitted_at', { ascending: false });

  const hist = new Map<string, { count: number; lastCorrect: boolean }>();
  for (const h of (history ?? []) as Array<{
    item_id: string;
    is_correct: boolean;
  }>) {
    const cur = hist.get(h.item_id);
    if (cur) cur.count += 1;
    // First row seen per item is the latest (desc order).
    else hist.set(h.item_id, { count: 1, lastCorrect: h.is_correct });
  }

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
      priorAttempts: h?.count ?? 0,
      lastCorrect: h ? h.lastCorrect : null,
    });
  }

  return { blockId, questions };
}

export async function submitEmbedAnswer(args: {
  noteId: string;
  blockId: string;
  itemId: string;
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
      'item_id, question_type, stem, instruction, content, correct, rationale, rationale_img, marks',
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
  };
  if (!EMBED_TYPE_SET.has(question.question_type)) {
    return { ok: false, error: 'Unsupported question type.' };
  }

  // 3. Grade server-side (reuses the runner's scorer).
  const result = scoreAttempt(
    question.question_type as QuestionType,
    question.correct as BankItemCorrect,
    args.answer,
  );

  // 4. Append the snapshotted history row (student client — RLS enforces
  //    student_id = auth.uid()). Append-only; never updates.
  const { error: insErr } = await supabase
    .from('nclex_library_embed_answers')
    .insert({
      student_id: user.id,
      note_id: noteId,
      block_id: blockId,
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
