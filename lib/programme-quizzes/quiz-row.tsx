// mynclex/lib/programme-quizzes/quiz-row.tsx
//
// One row on the programme Quizzes list. Title links into the
// global quiz editor (same target as the global Quizzes card).
// Status + kind pills reuse the .quiz-pill cadence established
// in Slice 1. Remove button hands the row up to the parent view,
// which decides confirm vs blocked.

'use client';

import Link from 'next/link';
import {
  formatItemCount,
  formatQuizKind,
  formatQuizMode,
  formatQuizStatus,
  quizStatusPillClass,
} from '@/lib/tutor-quiz/format';
import type { ProgrammeQuizRow } from './types';
import { SourceHint } from './source-hint';

export function QuizRow({
  quiz,
  onRemove,
  removing,
}: {
  quiz: ProgrammeQuizRow;
  onRemove: (quiz: ProgrammeQuizRow) => void;
  removing: boolean;
}) {
  const isMuted = quiz.status === 'ARCHIVED';

  return (
    <div className={`pq-row ${isMuted ? 'is-muted' : ''}`}>
      <div className="pq-row-body">
        <div className="pq-row-title-line">
          <Link
            href={`/tutor/quiz/${quiz.quiz_id}`}
            className="pq-row-link"
          >
            <h3 className="pq-row-title">{quiz.title}</h3>
          </Link>
          <span className={`quiz-pill pq-pill-${quiz.quiz_kind.toLowerCase()}`}>
            {formatQuizKind(quiz.quiz_kind)}
          </span>
          <span className={`quiz-pill ${quizStatusPillClass(quiz.status)}`}>
            {formatQuizStatus(quiz.status)}
          </span>
        </div>

        <div className="pq-row-meta">
          <span>{formatQuizMode(quiz.mode)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatItemCount(quiz.item_count)}</span>
        </div>

        <SourceHint hint={quiz.source_hint} />
      </div>

      <div className="pq-row-right">
        <button
          type="button"
          className="pq-row-remove"
          onClick={() => onRemove(quiz)}
          disabled={removing}
          aria-label={`Remove ${quiz.title} from this programme`}
        >
          {removing ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </div>
  );
}
