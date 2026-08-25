// mynclex/lib/library/programme/embed-grade-action.ts
//
// Grade-only server action for the TUTOR programme-library preview's
// answerable embedded-questions player. A deliberate twin of the
// student's submitEmbedAnswer (lib/library/student/embed-player-actions)
// with ONE difference: it never writes. No nclex_library_embed_answers
// row, no attempt history, no progress write — the tutor is previewing,
// not practising.
//
// Like the student path, the answer key stays server-side until submit:
// the player loads answerable content (no key) via loadEmbedBlock, and
// this action reads the full question + grades server-side, returning
// the verdict + key + rationale for inline feedback. The note body is
// re-read here — filtered on `tutor_id`, because RLS returning a note
// does NOT mean the caller owns it (see ../tutor-scope.ts) — and the
// block membership re-checked, so the browser's claim about which
// question is in the block is never trusted.

'use server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getLibraryTutorId } from '../tutor-scope';
import { bodyToTiptap } from '../body-tiptap';
import { scoreAttempt, type BankItemAnswer } from '@/lib/scoring';
import type { QuestionType } from '@/lib/bank/classifications';
import type { BankItemCorrect } from '@/lib/bank/types';
import { EMBED_QUESTION_TYPES } from '../types';
import type { EmbedSubmitResult } from '../student/embed-player-actions';

const EMBED_TYPE_SET = new Set<string>(EMBED_QUESTION_TYPES);

// Confirm `blockId` names an embedded_questions block in the doc and
// `itemId` is one of its current questions (server-authoritative).
function blockHasItem(body: unknown, blockId: string, itemId: string): boolean {
  const doc = bodyToTiptap(body);
  for (const node of doc.content ?? []) {
    if (node.type === 'embedded_questions' && node.attrs?.id === blockId) {
      const raw = node.attrs?.item_ids;
      const ids = Array.isArray(raw)
        ? raw.filter((x): x is string => typeof x === 'string')
        : [];
      return ids.includes(itemId);
    }
  }
  return false;
}

export async function gradeEmbedAnswerPreview(args: {
  noteId: string;
  blockId: string;
  itemId: string;
  answer: BankItemAnswer;
}): Promise<EmbedSubmitResult> {
  const { noteId, blockId, itemId } = args;
  const supabase = await createClient();

  // 1. Entitlement + membership — re-read the note as its OWNER, and
  //    confirm the question really belongs to this block.
  const tutorId = await getLibraryTutorId();
  if (!tutorId) return { ok: false, error: 'Not found.' };

  const { data: note, error } = await supabase
    .from('nclex_tutor_library_notes')
    .select('body')
    .eq('note_id', noteId)
    .eq('tutor_id', tutorId)
    .maybeSingle();
  if (error || !note) return { ok: false, error: 'Not found.' };

  if (!blockHasItem((note as { body: unknown }).body, blockId, itemId)) {
    return { ok: false, error: 'Not found.' };
  }

  // 2. Read the full question (key included) via service role.
  const admin = createServiceRoleClient();
  const { data: q, error: qErr } = await admin
    .from('nclex_tutor_questions')
    .select('question_type, content, correct, rationale, rationale_img, marks')
    .eq('item_id', itemId)
    .maybeSingle();
  if (qErr || !q) return { ok: false, error: 'Question unavailable.' };

  const question = q as {
    question_type: string;
    content: unknown;
    correct: unknown;
    rationale: string | null;
    rationale_img: string | null;
    marks: number;
  };
  if (!EMBED_TYPE_SET.has(question.question_type)) {
    return { ok: false, error: 'Unsupported question type.' };
  }

  // 3. Grade server-side (reuses the runner's scorer). NO write follows.
  const result = scoreAttempt(
    question.question_type as QuestionType,
    question.correct as BankItemCorrect,
    args.answer,
  );

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
