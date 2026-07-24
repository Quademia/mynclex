// mynclex/lib/programme-quizzes/quiz-row.tsx
//
// One row on the programme Quizzes list (2026-06 Claude Design
// "grouped rows"). Kind-coloured accent edge; title links into the
// global quiz editor; kind + status pills; a meta line (mode ·
// duration · N questions) followed by the recontextualised badge
// cluster (activities-here / tags / other-programmes). Remove hands
// the row up to the parent view, which decides confirm vs blocked.

'use client';

import Link from 'next/link';
import {
  formatDuration,
  formatQuizKind,
  formatQuizMode,
  formatQuizStatus,
  quizStatusPillClass,
} from '@/lib/tutor-quiz/format';
import type { ProgrammeQuizRow } from './types';
import { ProgrammeQuizBadges } from './programme-quiz-badges';

export function QuizRow({
  quiz,
  onRemove,
  removing,
}: {
  quiz: ProgrammeQuizRow;
  onRemove: (quiz: ProgrammeQuizRow) => void;
  removing: boolean;
}) {
  const isMock = quiz.quiz_kind === 'MOCK';
  const isMuted = quiz.status === 'ARCHIVED';
  const durationLabel = formatDuration(quiz.duration_seconds);

  return (
    <div
      className={`prow ${isMock ? 'is-mock' : 'is-practice'} ${
        isMuted ? 'is-muted' : ''
      }`}
    >
      <div className="prow-body">
        <div className="prow-title-line">
          <Link href={`/tutor/quiz/${quiz.quiz_id}`} className="prow-link">
            <h3 className="prow-title">{quiz.title}</h3>
          </Link>
          <span
            className={`quiz-pill-kind quiz-pill-kind-${quiz.quiz_kind.toLowerCase()}`}
          >
            {formatQuizKind(quiz.quiz_kind)}
          </span>
          <span className={`quiz-pill ${quizStatusPillClass(quiz.status)}`}>
            {formatQuizStatus(quiz.status)}
          </span>
        </div>

        <div className="prow-subline">
          <span className="prow-meta-text">
            <span>
              {formatQuizMode(quiz.quiz_kind, quiz.mode)}
              {durationLabel ? ` · ${durationLabel}` : ''}
            </span>
            <span aria-hidden="true" className="dot-sep">
              ·
            </span>
            <span>
              <b>{quiz.item_count}</b>{' '}
              {quiz.item_count === 1 ? 'question' : 'questions'}
            </span>
          </span>
          <span className="prow-badge-sep" aria-hidden="true" />
          <ProgrammeQuizBadges
            activities={quiz.activities}
            tags={quiz.tags}
            otherProgrammes={quiz.other_programmes}
          />
        </div>
      </div>

      <div className="prow-right">
        <button
          type="button"
          className="prow-remove"
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
