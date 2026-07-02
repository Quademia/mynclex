// mynclex/lib/practice/runner/types/matrix-mr.tsx
//
// MATRIX_MR runner — rows × columns grid where each row may have ONE OR
// MORE correct columns (checkbox per cell). Mirror of the MATRIX runner;
// the difference is the per-cell control (checkbox vs radio) and the
// answer shape (columnId[] per row vs a single columnId).
//
// Layout: each row is its own CSS Grid sharing the template
//   `minmax(180px, 30%) repeat(N, 1fr)`
// where N = content.columns.length. Per-row aria role is `group`.
// The `.multi` modifier on `.rn-matrix` swaps the cell glyph to a square
// (checkbox affordance) instead of a circle (radio).
//
// Review states reuse the per-option pattern from SATA, applied per cell:
//   right   — student picked AND it's correct
//   wrong   — student picked AND it's not correct
//   missed  — student did NOT pick AND it's correct
//   (none)  — student did NOT pick AND it's not correct
//
// Per-row feedback (correct.feedback[rowId]) renders below each row in
// review mode as a muted italic line.

'use client';

import type { MatrixMrContent, MatrixMrCorrect } from '@/lib/bank/types';
import type { MatrixMrAnswer } from '@/lib/scoring';
import { RichRender } from '@/lib/authoring/rich-render';
import { parseRichDoc, richTextToPlain } from '@/lib/authoring/rich-doc';

type MatrixMrRunnerProps = {
  content: MatrixMrContent;
} & (
  | {
      mode:     'answering';
      selected: MatrixMrAnswer;
      onChange: (next: MatrixMrAnswer) => void;
    }
  | {
      mode:          'review';
      studentAnswer: MatrixMrAnswer;
      correct:       MatrixMrCorrect;
    }
);

// Submit gate — every row must have at least one pick (Q3, hard gate).
export function isMatrixMrComplete(
  answer:  MatrixMrAnswer | undefined,
  content: MatrixMrContent,
): boolean {
  if (!answer) return false;
  return content.rows.every((r) => (answer[r.id]?.length ?? 0) > 0);
}

export function MatrixMrRunner(props: MatrixMrRunnerProps) {
  const { content } = props;
  const isReview = props.mode === 'review';

  const studentCells: MatrixMrAnswer = isReview ? props.studentAnswer : props.selected;
  const correctCells = isReview ? props.correct.cells    : null;
  const feedback     = isReview ? props.correct.feedback : null;

  function toggle(rowId: string, colId: string) {
    if (isReview) return;
    const cur = props.selected[rowId] ?? [];
    const next = cur.includes(colId)
      ? cur.filter((c) => c !== colId)
      : [...cur, colId];
    const nextAnswer = { ...props.selected };
    if (next.length > 0) nextAnswer[rowId] = next;
    else delete nextAnswer[rowId];
    props.onChange(nextAnswer);
  }

  const gridTpl = `minmax(180px, 30%) repeat(${content.columns.length}, 1fr)`;

  return (
    <div className="rn-matrix multi">
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
        const studentPicks = studentCells[row.id] ?? [];
        const correctPicks = correctCells?.[row.id] ?? [];
        return (
          <div key={row.id} className="rn-matrix-row-block">
            <div
              className="rn-matrix-row"
              style={{ gridTemplateColumns: gridTpl }}
              role={isReview ? undefined : 'group'}
              aria-label={richTextToPlain(row.text)}
            >
              <div className="rn-matrix-row-label">
                <RichRender doc={parseRichDoc(row.text)} inline />
              </div>
              {content.columns.map((col) => {
                const isPicked      = studentPicks.includes(col.id);
                const isCorrectCell = isReview && correctPicks.includes(col.id);
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
                    role={isReview ? undefined : 'checkbox'}
                    aria-checked={!isReview ? isPicked : undefined}
                    aria-label={`${richTextToPlain(row.text)} — ${richTextToPlain(col.text)}`}
                    disabled={isReview}
                    onClick={isReview ? undefined : () => toggle(row.id, col.id)}
                  />
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
