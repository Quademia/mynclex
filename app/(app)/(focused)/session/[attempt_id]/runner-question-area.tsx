// mynclex/app/(app)/(focused)/session/[attempt_id]/runner-question-area.tsx
//
// Middle column of the runner. Owns the meta-pill strip, the stem +
// instruction line, the per-type runner component slot, and the
// rationale block (rendered when an answer-row + unseal data exist
// for the current item).
//
// Per-type dispatch: only MCQ wired in 4.1.4. Other types (TF, SATA,
// SELECT_N, MATRIX, HIGHLIGHT, CLOZE, DRAG_DROP, BOWTIE) fall through
// to a placeholder pointing at slice 4.2.
//
// Wrapper-aware layout (case panel + question, trend dataset + question)
// lands with slices 4.3 / 4.4. For now we always render `.rn-q-wrap`.

'use client';

import type { SealedItem, UnsealedItem, AnswerRow } from '@/lib/bank/runner';
import type { QuestionType } from '@/lib/bank/classifications';
import type {
  McqContent,
  McqCorrect,
  BankItemCorrect,
} from '@/lib/bank/types';
import type { McqAnswer, BankItemAnswer } from '@/lib/scoring';
import { McqRunner, RationaleBlock } from '@/lib/bank/runner';

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MCQ:       'Multiple choice',
  TF:        'True / false',
  SATA:      'Select all that apply',
  SELECT_N:  'Select N',
  MATRIX:    'Matrix',
  HIGHLIGHT: 'Highlight',
  CLOZE:     'Cloze',
  DRAG_DROP: 'Drag-drop',
  BOWTIE:    'Bow-tie',
};

interface Classification {
  client_needs_category?:    string;
  client_needs_subcategory?: string;
  nursing_subject?:          string;
  body_system?:              string;
  difficulty?:               string;
}

export interface PerItemUnseal {
  correct:      BankItemCorrect;
  rationale:    string | null;
  rationaleImg: string | null;
  marksMax:     number;
}

interface Props {
  item:           SealedItem | UnsealedItem;
  itemMode:       'answering' | 'review';
  // Answering mode:
  pendingAnswer:  BankItemAnswer | undefined;
  onAnswerChange: (next: BankItemAnswer) => void;
  // Review mode (live just-submitted OR review-mode-from-mount):
  answerRow:      AnswerRow | undefined;
  unseal:         PerItemUnseal | undefined;
}

export function RunnerQuestionArea({
  item,
  itemMode,
  pendingAnswer,
  onAnswerChange,
  answerRow,
  unseal,
}: Props) {
  const cls = (item.classification_snapshot ?? {}) as Classification;
  const subjectPill = cls.nursing_subject || cls.body_system;
  const difficulty  = cls.difficulty;

  return (
    <div className="rn-q-wrap">
      <div className="rn-q-meta">
        <span className="rn-type-pill">
          {QUESTION_TYPE_LABELS[item.question_type] ?? item.question_type}
        </span>
        {subjectPill && <span className="rn-type-pill">{subjectPill}</span>}
        {difficulty  && <span className="rn-type-pill">Difficulty · {difficulty}</span>}
      </div>

      <div className="rn-stem">{item.stem_snapshot}</div>

      {item.instruction_snapshot && (
        <p className="rn-instruction">{item.instruction_snapshot}</p>
      )}

      <PerTypeRunner
        item={item}
        itemMode={itemMode}
        pendingAnswer={pendingAnswer}
        onAnswerChange={onAnswerChange}
        answerRow={answerRow}
        unseal={unseal}
      />

      {itemMode === 'review' && unseal && answerRow && (
        <RationaleBlock
          isCorrect={answerRow.is_correct ?? false}
          scoreAwarded={answerRow.score_awarded ?? 0}
          marksMax={unseal.marksMax}
          rationale={unseal.rationale}
          rationaleImg={unseal.rationaleImg}
        />
      )}
    </div>
  );
}


function PerTypeRunner({
  item,
  itemMode,
  pendingAnswer,
  onAnswerChange,
  answerRow,
  unseal,
}: Props) {
  if (item.question_type === 'MCQ') {
    const content = item.content_snapshot_json as unknown as McqContent;

    if (itemMode === 'answering') {
      return (
        <McqRunner
          mode="answering"
          content={content}
          selected={(pendingAnswer as McqAnswer | undefined) ?? null}
          onChange={(id) => onAnswerChange(id as BankItemAnswer)}
        />
      );
    }

    // Review — need the unseal data (correct key) and the student answer.
    const correct       = unseal?.correct as McqCorrect | undefined;
    const studentAnswer = (answerRow?.answer_json as McqAnswer | undefined) ?? null;
    if (!correct) {
      // Defensive — shouldn't happen if itemMode === 'review' is derived
      // correctly. Render the locked options without verdict so the
      // student at least sees their pick.
      return (
        <McqRunner
          mode="review"
          content={content}
          studentAnswer={studentAnswer}
          correct={{ answer: '', feedback: {} }}
        />
      );
    }
    return (
      <McqRunner
        mode="review"
        content={content}
        studentAnswer={studentAnswer}
        correct={correct}
      />
    );
  }

  // Slice 4.2 wires TF / SATA / SELECT_N / MATRIX / HIGHLIGHT / CLOZE /
  // DRAG_DROP / BOWTIE. Until then any non-MCQ item is a placeholder.
  return (
    <div className="rn-stub">
      The {QUESTION_TYPE_LABELS[item.question_type]} runner lands in slice 4.2.
      {' '}For now this question can't be answered or scored.
    </div>
  );
}
