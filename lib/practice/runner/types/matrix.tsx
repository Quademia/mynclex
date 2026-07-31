// mynclex/lib/bank/runner/types/matrix.tsx
//
// MATRIX runner — rows × columns grid where each row picks exactly one
// column. Examples: "For each finding, mark Anticipated / Not anticipated"
// or "For each medication, mark Hold / Give as scheduled".
//
// Layout: each row is its own CSS Grid sharing the template
//   `minmax(180px, 30%) repeat(N, 1fr)`
// where N = content.columns.length. Per-row aria role is `radiogroup`.
//
// Review states reuse the per-option pattern from SATA:
//   right   — student picked AND it's correct
//   wrong   — student picked AND it's not correct
//   missed  — student did NOT pick AND it's correct
//   (none)  — student did NOT pick AND it's not correct
//
// Per-row feedback (correct.feedback[rowId]) renders below each row in
// review mode as a muted italic line.

'use client';

import type { MatrixContent, MatrixCorrect } from '@/lib/bank/types';
import type { MatrixAnswer } from '@/lib/scoring';
import { RichRender } from '@/lib/authoring/rich-render';
import { parseRichDoc, richTextToPlain } from '@/lib/authoring/rich-doc';

type MatrixRunnerProps = {
  content: MatrixContent;
} & (
  | {
      mode:     'answering';
      selected: MatrixAnswer;
      onChange: (next: MatrixAnswer) => void;
    }
  | {
      mode:          'review';
      studentAnswer: MatrixAnswer;
      correct:       MatrixCorrect;
    }
);

// Submit gate — every row must have a pick. Same "must-complete-every-
// part" rule as SELECT_N (per Sam, 2026-05-07).
export function isMatrixComplete(
  answer:  MatrixAnswer | undefined,
  content: MatrixContent,
): boolean {
  if (!answer) return false;
  return content.rows.every((r) => Boolean(answer[r.id]));
}

export function MatrixRunner(props: MatrixRunnerProps) {
  const { content } = props;
  const isReview = props.mode === 'review';

  const studentCells: MatrixAnswer = isReview ? props.studentAnswer : props.selected;
  const correctCells = isReview ? props.correct.cells    : null;
  const feedback     = isReview ? props.correct.feedback : null;

  function pick(rowId: string, colId: string) {
    if (isReview) return;
    props.onChange({ ...props.selected, [rowId]: colId });
  }

  const gridTpl = `minmax(180px, 30%) repeat(${content.columns.length}, 1fr)`;

  return (
    <div className="rn-matrix">
      {/* Header row */}
      <div className="rn-matrix-row head" style={{ gridTemplateColumns: gridTpl }}>
        <div className="rn-matrix-row-label-head">
          <RichRender doc={parseRichDoc(content.row_label)} inline />
        </div>
        {content.columns.map((col) => (
          <div key={col.id} className="rn-matrix-col-head">
            <RichRender doc={parseRichDoc(col.text)} inline />
          </div>
        ))}
      </div>

      {content.rows.map((row) => {
        const studentPick = studentCells[row.id];
        const correctPick = correctCells?.[row.id];
        return (
          <div key={row.id} className="rn-matrix-row-block">
            <div
              className="rn-matrix-row"
              style={{ gridTemplateColumns: gridTpl }}
              role={isReview ? undefined : 'radiogroup'}
              aria-label={richTextToPlain(row.text)}
            >
              <div className="rn-matrix-row-label">
                <RichRender doc={parseRichDoc(row.text)} inline />
              </div>
              {content.columns.map((col) => {
                const isPicked      = studentPick === col.id;
                const isCorrectCell = isReview && correctPick === col.id;
                const cls = ['rn-matrix-cell'];
                if (isReview) {
                  cls.push('locked');
                  if      (isCorrectCell && isPicked)  cls.push('right');
                  else if (!isCorrectCell && isPicked) cls.push('wrong');
                  else if (isCorrectCell && !isPicked) cls.push('missed');
                } else if (isPicked) {
                  cls.push('sel');
                }
                return (
                  <button
                    key={col.id}
                    type="button"
                    className={cls.join(' ')}
                    role={isReview ? undefined : 'radio'}
                    aria-checked={!isReview ? isPicked : undefined}
                    aria-label={`${richTextToPlain(row.text)} — ${richTextToPlain(col.text)}`}
                    disabled={isReview}
                    onClick={isReview ? undefined : () => pick(row.id, col.id)}
                  >
                    {/* The column name, repeated inside every cell. Hidden
                        above 900px, where the header row names it once —
                        but the phone layout stacks each row into a card and
                        drops that header, so without this the cells would be
                        unlabelled buttons. Plain text, not RichRender: this
                        is a 44px chip label, not a content slot.
                        (docs/product-plan/runner-mobile.md, slice 5) */}
                    <span className="rn-matrix-cell-label">{richTextToPlain(col.text)}</span>
                  </button>
                );
              })}
            </div>
            {isReview && feedback?.[row.id] && (
              <div className="rn-matrix-row-foot">
                <RichRender doc={parseRichDoc(feedback[row.id])} inline />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
