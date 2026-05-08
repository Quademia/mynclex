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
// switch until handled. MCQ + TF + SATA + SELECT_N + MATRIX +
// HIGHLIGHT wired today; the remaining 3 fall through to the
// slice-4.2 placeholder.
//
// HIGHLIGHT, CLOZE, and DRAG_DROP-SENTENCE are special: the per-type
// runner takes over stem rendering. HIGHLIGHT's stem holds the
// [[bracketed]] clickable chunks; CLOZE's stem holds the {N} blank
// markers that become inline dropdowns; DRAG_DROP-SENTENCE's stem
// holds [N] markers that become inline drop boxes. For all three we
// skip the regular `.rn-stem` render in RunnerQuestionArea and the
// instruction moves to ABOVE the stem (the student needs to know
// what they're doing before they read). DRAG_DROP-ORDERED renders
// normally — its slot list sits below the stem like a regular options
// block.
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
  SataContent,
  SataCorrect,
  SelectNContent,
  SelectNCorrect,
  MatrixContent,
  MatrixCorrect,
  HighlightContent,
  HighlightCorrect,
  ClozeContent,
  ClozeCorrect,
  DragDropContent,
  DragDropCorrect,
  BankItemCorrect,
} from '@/lib/bank/types';
import type {
  McqAnswer,
  TfAnswer,
  SataAnswer,
  SelectNAnswer,
  MatrixAnswer,
  HighlightAnswer,
  ClozeAnswer,
  DragDropAnswer,
  BankItemAnswer,
} from '@/lib/scoring';
import {
  McqRunner,
  TfRunner,
  SataRunner,
  SelectNRunner,
  MatrixRunner,
  HighlightRunner,
  ClozeRunner,
  DragDropRunner,
  RationaleBlock,
} from '@/lib/bank/runner';

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

      {/* HIGHLIGHT, CLOZE, and DRAG_DROP-SENTENCE render their own stem
       *  (interactive chunks / inline dropdowns / inline drop boxes).
       *  For these, instruction moves above the stem so the student
       *  knows what to do before reading. DRAG_DROP-ORDERED renders
       *  normally — slot list sits below the stem. All other types
       *  render stem here, then instruction. */}
      {(() => {
        const isStemTakeover =
          item.question_type === 'HIGHLIGHT' ||
          item.question_type === 'CLOZE' ||
          (item.question_type === 'DRAG_DROP' &&
            (item.content_snapshot_json as unknown as DragDropContent).subtype === 'SENTENCE');

        if (isStemTakeover) {
          return item.instruction_snapshot ? (
            <p className="rn-instruction">{item.instruction_snapshot}</p>
          ) : null;
        }
        return (
          <>
            <div className="rn-stem">{item.stem_snapshot}</div>
            {item.instruction_snapshot && (
              <p className="rn-instruction">{item.instruction_snapshot}</p>
            )}
          </>
        );
      })()}

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

    case 'SATA': {
      const content = item.content_snapshot_json as unknown as SataContent;

      if (props.itemMode === 'answering') {
        return (
          <SataRunner
            mode="answering"
            content={content}
            selected={(props.pendingAnswer as SataAnswer | undefined) ?? []}
            onChange={(next) => props.onAnswerChange(next as BankItemAnswer)}
          />
        );
      }

      return (
        <SataRunner
          mode="review"
          content={content}
          studentAnswer={(props.answerRow.answer_json as SataAnswer | undefined) ?? []}
          correct={props.unseal.correct as SataCorrect}
        />
      );
    }

    case 'SELECT_N': {
      const content = item.content_snapshot_json as unknown as SelectNContent;

      if (props.itemMode === 'answering') {
        return (
          <SelectNRunner
            mode="answering"
            content={content}
            selected={(props.pendingAnswer as SelectNAnswer | undefined) ?? []}
            onChange={(next) => props.onAnswerChange(next as BankItemAnswer)}
          />
        );
      }

      return (
        <SelectNRunner
          mode="review"
          content={content}
          studentAnswer={(props.answerRow.answer_json as SelectNAnswer | undefined) ?? []}
          correct={props.unseal.correct as SelectNCorrect}
        />
      );
    }

    case 'MATRIX': {
      const content = item.content_snapshot_json as unknown as MatrixContent;

      if (props.itemMode === 'answering') {
        return (
          <MatrixRunner
            mode="answering"
            content={content}
            selected={(props.pendingAnswer as MatrixAnswer | undefined) ?? {}}
            onChange={(next) => props.onAnswerChange(next as BankItemAnswer)}
          />
        );
      }

      return (
        <MatrixRunner
          mode="review"
          content={content}
          studentAnswer={(props.answerRow.answer_json as MatrixAnswer | undefined) ?? {}}
          correct={props.unseal.correct as MatrixCorrect}
        />
      );
    }

    case 'HIGHLIGHT': {
      const content = item.content_snapshot_json as unknown as HighlightContent;

      if (props.itemMode === 'answering') {
        return (
          <HighlightRunner
            mode="answering"
            stem={item.stem_snapshot}
            content={content}
            selected={(props.pendingAnswer as HighlightAnswer | undefined) ?? []}
            onChange={(next) => props.onAnswerChange(next as BankItemAnswer)}
          />
        );
      }

      return (
        <HighlightRunner
          mode="review"
          stem={item.stem_snapshot}
          content={content}
          studentAnswer={(props.answerRow.answer_json as HighlightAnswer | undefined) ?? []}
          correct={props.unseal.correct as HighlightCorrect}
        />
      );
    }

    case 'CLOZE': {
      const content = item.content_snapshot_json as unknown as ClozeContent;

      if (props.itemMode === 'answering') {
        return (
          <ClozeRunner
            mode="answering"
            stem={item.stem_snapshot}
            content={content}
            selected={(props.pendingAnswer as ClozeAnswer | undefined) ?? {}}
            onChange={(next) => props.onAnswerChange(next as BankItemAnswer)}
          />
        );
      }

      return (
        <ClozeRunner
          mode="review"
          stem={item.stem_snapshot}
          content={content}
          studentAnswer={(props.answerRow.answer_json as ClozeAnswer | undefined) ?? {}}
          correct={props.unseal.correct as ClozeCorrect}
        />
      );
    }

    case 'DRAG_DROP': {
      const content = item.content_snapshot_json as unknown as DragDropContent;

      if (props.itemMode === 'answering') {
        return (
          <DragDropRunner
            mode="answering"
            stem={item.stem_snapshot}
            content={content}
            selected={(props.pendingAnswer as DragDropAnswer | undefined) ?? {}}
            onChange={(next) => props.onAnswerChange(next as BankItemAnswer)}
          />
        );
      }

      return (
        <DragDropRunner
          mode="review"
          stem={item.stem_snapshot}
          content={content}
          studentAnswer={(props.answerRow.answer_json as DragDropAnswer | undefined) ?? {}}
          correct={props.unseal.correct as DragDropCorrect}
        />
      );
    }

    // BOWTIE — last per-type runner in slice 4.2, lands next.
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
