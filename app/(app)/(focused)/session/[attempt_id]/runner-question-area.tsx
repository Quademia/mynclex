// mynclex/app/(app)/(focused)/session/[attempt_id]/runner-question-area.tsx
//
// Middle column of the runner. Owns the meta-pill strip, the stem +
// instruction line, the per-type runner component slot, and the
// rationale block (rendered in review mode).
//
// Props are a discriminated union on `itemMode`:
//   • answering — pendingAnswer + onAnswerChange
//   • review    — answerRow + unseal (both required, not optional)
// This pushes the "review mode but unseal not yet loaded" edge case
// up to the caller (runner.tsx), so per-type runners stay clean —
// a single `<XxxRunner mode="review" ... />` call without defensive
// fallbacks. With 9 question types coming in slice 4.2, removing
// per-type defensiveness is the difference between 1 guard and 9.
//
// Per-type dispatch: a `switch` on `item.question_type`. TS
// exhaustiveness — adding a 10th type to QuestionType errors the
// switch until handled. MCQ + TF wired today; the remaining 7
// fall through to the slice-4.2 placeholder.
//
// Wrapper-aware layout (case panel + question, trend dataset + question)
// lands with slices 4.3 / 4.4. For now we always render `.rn-q-wrap`.

'use client';

import type { SealedItem, UnsealedItem, AnswerRow } from '@/lib/bank/runner';
import type { QuestionType } from '@/lib/bank/classifications';
import type {
  McqContent,
  McqCorrect,
  TfContent,
  TfCorrect,
  BankItemCorrect,
} from '@/lib/bank/types';
import type { McqAnswer, TfAnswer, BankItemAnswer } from '@/lib/scoring';
import { McqRunner, TfRunner, RationaleBlock } from '@/lib/bank/runner';

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

interface CommonProps {
  item: SealedItem | UnsealedItem;
}

type AnsweringProps = CommonProps & {
  itemMode:       'answering';
  pendingAnswer:  BankItemAnswer | undefined;
  onAnswerChange: (next: BankItemAnswer) => void;
};

type ReviewProps = CommonProps & {
  itemMode:  'review';
  answerRow: AnswerRow;
  unseal:    PerItemUnseal;
};

type Props = AnsweringProps | ReviewProps;

export function RunnerQuestionArea(props: Props) {
  const { item } = props;
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

      <PerTypeRunner {...props} />

      {props.itemMode === 'review' && (
        <RationaleBlock
          isCorrect={props.answerRow.is_correct ?? false}
          scoreAwarded={props.answerRow.score_awarded ?? 0}
          marksMax={props.unseal.marksMax}
          rationale={props.unseal.rationale}
          rationaleImg={props.unseal.rationaleImg}
        />
      )}
    </div>
  );
}


function PerTypeRunner(props: Props) {
  const { item } = props;

  switch (item.question_type) {
    case 'MCQ': {
      const content = item.content_snapshot_json as unknown as McqContent;

      if (props.itemMode === 'answering') {
        return (
          <McqRunner
            mode="answering"
            content={content}
            selected={(props.pendingAnswer as McqAnswer | undefined) ?? null}
            onChange={(id) => props.onAnswerChange(id as BankItemAnswer)}
          />
        );
      }

      return (
        <McqRunner
          mode="review"
          content={content}
          studentAnswer={(props.answerRow.answer_json as McqAnswer | undefined) ?? null}
          correct={props.unseal.correct as McqCorrect}
        />
      );
    }

    case 'TF': {
      const content = item.content_snapshot_json as unknown as TfContent;

      if (props.itemMode === 'answering') {
        return (
          <TfRunner
            mode="answering"
            content={content}
            selected={(props.pendingAnswer as TfAnswer | undefined) ?? null}
            onChange={(id) => props.onAnswerChange(id as BankItemAnswer)}
          />
        );
      }

      return (
        <TfRunner
          mode="review"
          content={content}
          studentAnswer={(props.answerRow.answer_json as TfAnswer | undefined) ?? null}
          correct={props.unseal.correct as TfCorrect}
        />
      );
    }

    // Slice 4.2 will split each of these into its own case mirroring
    // the MCQ / TF pattern above. Until then they share the placeholder.
    case 'SATA':
    case 'SELECT_N':
    case 'MATRIX':
    case 'HIGHLIGHT':
    case 'CLOZE':
    case 'DRAG_DROP':
    case 'BOWTIE':
      return (
        <div className="rn-stub">
          The {QUESTION_TYPE_LABELS[item.question_type]} runner lands in slice 4.2.
          {' '}For now this question can't be answered or scored.
        </div>
      );
  }

  // Exhaustiveness — adding a 10th QuestionType makes item.question_type
  // not be `never` here and breaks the build until the new type is
  // handled in the switch.
  const _exhaustive: never = item.question_type;
  return _exhaustive;
}
