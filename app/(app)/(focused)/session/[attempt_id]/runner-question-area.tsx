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
// HIGHLIGHT, CLOZE, and DRAG_CLOZE are special: the per-type runner
// takes over stem rendering. HIGHLIGHT's stem holds the [[bracketed]]
// clickable chunks; CLOZE's stem holds the {N} blank markers that become
// inline dropdowns; DRAG_CLOZE's stem holds [N] markers that become
// inline drop boxes. For all three we skip the regular `.rn-stem` render
// in RunnerQuestionArea and the instruction moves to ABOVE the stem (the
// student needs to know what they're doing before they read). DRAG_ORDER
// renders normally — its slot list sits below the stem like a regular
// options block.
//
// Wrapper-aware layout (case panel + question — slice 4.3 / trend
// dataset + question — slice 4.4) places the question column inside a
// `.rn-split` grid. The wrapper still owns `.rn-q-wrap`; the column's
// minmax sizing clamps it. Case-childs supply a CJMM strip via the
// `topSlot` prop, which renders at the top of the wrap above
// `.rn-q-meta`.

'use client';

import type { SealedItem, UnsealedItem, AnswerRow, PerItemUnseal } from '@/lib/practice/runner';
export type { PerItemUnseal };
import type { QuestionType } from '@/lib/bank/classifications';
import { displayBand } from '@/lib/bank/difficulty';
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
  MatrixMrContent,
  MatrixMrCorrect,
  HighlightContent,
  HighlightCorrect,
  ClozeContent,
  ClozeCorrect,
  DragClozeContent,
  DragClozeCorrect,
  DragOrderContent,
  DragOrderCorrect,
  BowtieContent,
  BowtieCorrect,
} from '@/lib/bank/types';
import type {
  McqAnswer,
  TfAnswer,
  SataAnswer,
  SelectNAnswer,
  MatrixAnswer,
  MatrixMrAnswer,
  HighlightAnswer,
  ClozeAnswer,
  DragClozeAnswer,
  DragOrderAnswer,
  BowtieAnswer,
  BankItemAnswer,
} from '@/lib/scoring';
import {
  McqRunner,
  TfRunner,
  SataRunner,
  SelectNRunner,
  MatrixRunner,
  MatrixMrRunner,
  HighlightRunner,
  ClozeRunner,
  DragClozeRunner,
  DragOrderRunner,
  BowtieRunner,
  RationaleBlock,
} from '@/lib/practice/runner';
import { RichRender } from '@/lib/authoring/rich-render';
import { parseRichDoc } from '@/lib/authoring/rich-doc';
import { bankImageRenderer } from '@/lib/authoring/bank-image-render';
import type { BankImageResolver } from '@/lib/authoring/bank-image-view';
import { orderedOptions } from '@/lib/practice/runner/option-order';

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MCQ:       'Multiple choice',
  TF:        'True / false',
  SATA:      'Select all that apply',
  SELECT_N:  'Select N',
  MATRIX:    'Matrix',
  MATRIX_MR: 'Matrix (multiple response)',
  HIGHLIGHT: 'Highlight',
  CLOZE:     'Cloze',
  DRAG_CLOZE: 'Drag-and-drop cloze',
  DRAG_ORDER: 'Drag to order',
  BOWTIE:    'Bow-tie',
};

interface Classification {
  client_needs_category?:    string;
  client_needs_subcategory?: string;
  nursing_subject?:          string;
  body_system?:              string;
  difficulty?:               string;
  // §5.5 — the derived band uses these when the snapshot carries them.
  // The create-attempt RPCs don't populate them yet (CAT Slice 10c), so
  // today displayBand() falls back to the curator label above.
  difficulty_irt?:           number | null;
  difficulty_source?:        string | null;
}

interface CommonProps {
  item:     SealedItem | UnsealedItem;
  // Optional render slot above the q-meta strip. Case-childs (slice
  // 4.3) pass a <CjmmStrip />. Trend questions don't use this — their
  // dataset panel sits beside the question, not above it.
  topSlot?: React.ReactNode;
  // Trend questions render an inline "⤬ Trend" pill in the q-meta
  // strip (slice 4.4). The dataset itself lives in <TrendPanel> on
  // the left of the .rn-split. Standalones / case-childs leave this
  // false.
  trendBadge?: boolean;
  // Slice 8 — the attempt-bound signed-URL resolver for bankImage
  // nodes in the frozen stem (runner.tsx builds the closure, same one
  // the case/trend panels get). Optional: without it an image node
  // renders nothing (pre-Slice-8 behaviour).
  resolveImageUrl?: BankImageResolver;
  // §16.6 — during a LIVE exam, suppress the classification pills that
  // leak the engine's opinion of the candidate / the item's difficulty:
  // the subject chip and the "Difficulty · N" pill. Set by runner.tsx only
  // for exam-intent live attempts; false in study and in all review.
  examLive?: boolean;
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
  // §5.5 — show the curator label while CURATOR_LABEL, the band derived
  // from difficulty_irt once EMPIRICAL. displayBand is the single authority
  // so the shown difficulty never drifts from what the engine uses.
  const difficulty  = displayBand({
    label:  cls.difficulty,
    irt:    cls.difficulty_irt,
    source: cls.difficulty_source,
  });

  return (
    <div className="rn-q-wrap" data-coach="answerarea">
      {props.topSlot}
      <div className="rn-q-meta">
        <span className="rn-type-pill">
          {QUESTION_TYPE_LABELS[item.question_type] ?? item.question_type}
        </span>
        {props.trendBadge && (
          <span className="rn-trend-pill">
            <span className="glyph" aria-hidden="true">⤬</span>
            Trend
          </span>
        )}
        {!props.examLive && subjectPill && <span className="rn-type-pill">{subjectPill}</span>}
        {!props.examLive && difficulty  && <span className="rn-type-pill">Difficulty · {difficulty}</span>}
      </div>

      {/* HIGHLIGHT, CLOZE, and DRAG_DROP-SENTENCE render their own stem
       *  (interactive chunks / inline dropdowns / inline drop boxes).
       *  For these, instruction moves above the stem so the student
       *  knows what to do before reading. DRAG_ORDER renders normally —
       *  slot list sits below the stem. All other types render stem
       *  here, then instruction. */}
      {(() => {
        const isStemTakeover =
          item.question_type === 'HIGHLIGHT' ||
          item.question_type === 'CLOZE' ||
          item.question_type === 'DRAG_CLOZE';

        if (isStemTakeover) {
          return item.instruction_snapshot ? (
            <p className="rn-instruction">
              <RichRender doc={parseRichDoc(item.instruction_snapshot)} inline />
            </p>
          ) : null;
        }
        return (
          <>
            <div className="rn-stem">
              <RichRender
                doc={parseRichDoc(item.stem_snapshot)}
                custom={bankImageRenderer(props.resolveImageUrl)}
              />
            </div>
            {item.instruction_snapshot && (
              <p className="rn-instruction">
                <RichRender doc={parseRichDoc(item.instruction_snapshot)} inline />
              </p>
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
      const raw = item.content_snapshot_json as unknown as McqContent;
      const content: McqContent = {
        ...raw,
        options: orderedOptions(raw.options, item.option_order_json),
      };

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
      const raw = item.content_snapshot_json as unknown as SataContent;
      const content: SataContent = {
        ...raw,
        options: orderedOptions(raw.options, item.option_order_json),
      };

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
      const raw = item.content_snapshot_json as unknown as SelectNContent;
      const content: SelectNContent = {
        ...raw,
        options: orderedOptions(raw.options, item.option_order_json),
      };

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

    case 'MATRIX_MR': {
      const content = item.content_snapshot_json as unknown as MatrixMrContent;

      if (props.itemMode === 'answering') {
        return (
          <MatrixMrRunner
            mode="answering"
            content={content}
            selected={(props.pendingAnswer as MatrixMrAnswer | undefined) ?? {}}
            onChange={(next) => props.onAnswerChange(next as BankItemAnswer)}
          />
        );
      }

      return (
        <MatrixMrRunner
          mode="review"
          content={content}
          studentAnswer={(props.answerRow.answer_json as MatrixMrAnswer | undefined) ?? {}}
          correct={props.unseal.correct as MatrixMrCorrect}
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
            resolveImageUrl={props.resolveImageUrl}
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
          resolveImageUrl={props.resolveImageUrl}
          content={content}
          studentAnswer={(props.answerRow.answer_json as HighlightAnswer | undefined) ?? []}
          correct={props.unseal.correct as HighlightCorrect}
        />
      );
    }

    case 'CLOZE': {
      const raw = item.content_snapshot_json as unknown as ClozeContent;
      const order = (item.option_order_json ?? {}) as Record<string, unknown>;
      const content: ClozeContent = {
        ...raw,
        blanks: raw.blanks.map((b) => ({
          ...b,
          choices: orderedOptions(b.choices, order[b.id]),
        })),
      };

      if (props.itemMode === 'answering') {
        return (
          <ClozeRunner
            mode="answering"
            stem={item.stem_snapshot}
            resolveImageUrl={props.resolveImageUrl}
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
          resolveImageUrl={props.resolveImageUrl}
          content={content}
          studentAnswer={(props.answerRow.answer_json as ClozeAnswer | undefined) ?? {}}
          correct={props.unseal.correct as ClozeCorrect}
        />
      );
    }

    case 'DRAG_CLOZE': {
      const raw = item.content_snapshot_json as unknown as DragClozeContent;
      const content: DragClozeContent = {
        ...raw,
        tokens: orderedOptions(raw.tokens, item.option_order_json),
      };

      if (props.itemMode === 'answering') {
        return (
          <DragClozeRunner
            mode="answering"
            stem={item.stem_snapshot}
            resolveImageUrl={props.resolveImageUrl}
            content={content}
            selected={(props.pendingAnswer as DragClozeAnswer | undefined) ?? {}}
            onChange={(next) => props.onAnswerChange(next as BankItemAnswer)}
          />
        );
      }

      return (
        <DragClozeRunner
          mode="review"
          stem={item.stem_snapshot}
          resolveImageUrl={props.resolveImageUrl}
          content={content}
          studentAnswer={(props.answerRow.answer_json as DragClozeAnswer | undefined) ?? {}}
          correct={props.unseal.correct as DragClozeCorrect}
        />
      );
    }

    case 'DRAG_ORDER': {
      const raw = item.content_snapshot_json as unknown as DragOrderContent;
      const content: DragOrderContent = {
        ...raw,
        tokens: orderedOptions(raw.tokens, item.option_order_json),
      };

      if (props.itemMode === 'answering') {
        return (
          <DragOrderRunner
            mode="answering"
            stem={item.stem_snapshot}
            content={content}
            selected={(props.pendingAnswer as DragOrderAnswer | undefined) ?? {}}
            onChange={(next) => props.onAnswerChange(next as BankItemAnswer)}
          />
        );
      }

      return (
        <DragOrderRunner
          mode="review"
          stem={item.stem_snapshot}
          content={content}
          studentAnswer={(props.answerRow.answer_json as DragOrderAnswer | undefined) ?? {}}
          correct={props.unseal.correct as DragOrderCorrect}
        />
      );
    }

    case 'BOWTIE': {
      const raw = item.content_snapshot_json as unknown as BowtieContent;
      const order = (item.option_order_json ?? {}) as Record<string, unknown>;
      const content: BowtieContent = {
        ...raw,
        left:   { ...raw.left,   tokens: orderedOptions(raw.left.tokens,   order.left) },
        centre: { ...raw.centre, tokens: orderedOptions(raw.centre.tokens, order.centre) },
        right:  { ...raw.right,  tokens: orderedOptions(raw.right.tokens,  order.right) },
      };
      const emptyBowtieAnswer: BowtieAnswer = { left: [], centre: null, right: [] };

      if (props.itemMode === 'answering') {
        return (
          <BowtieRunner
            mode="answering"
            content={content}
            selected={(props.pendingAnswer as BowtieAnswer | undefined) ?? emptyBowtieAnswer}
            onChange={(next) => props.onAnswerChange(next as BankItemAnswer)}
          />
        );
      }

      return (
        <BowtieRunner
          mode="review"
          content={content}
          studentAnswer={(props.answerRow.answer_json as BowtieAnswer | undefined) ?? emptyBowtieAnswer}
          correct={props.unseal.correct as BowtieCorrect}
        />
      );
    }
  }

  // Exhaustiveness — adding a 10th QuestionType makes item.question_type
  // not be `never` here and breaks the build until the new type is
  // handled in the switch.
  const _exhaustive: never = item.question_type;
  return _exhaustive;
}
