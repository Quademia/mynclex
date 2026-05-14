// mynclex/lib/curriculum/quiz-selector-editor.tsx
//
// Mock + Practice quiz activity editor body (tutor-quiz Slice 2).
// Replaces the 9.3d-d static placeholder: the tutor picks one of
// their PUBLISHED quizzes of the matching kind (Mock activity ->
// Mock quiz, Practice quiz activity -> Practice quiz), and the
// chosen `quiz_id` is stored on the activity's `payload`.
//
// On mount it fetches the picker context (the dropdown options +
// the currently-linked quiz resolved by id) via a tutor-quiz
// server action. The component is stateless about *which* quiz is
// current — that lives in the parent modal's discriminated body
// state — so changing the dropdown just bubbles a new id up.
//
// A draft activity may be saved with no quiz (or with a link to a
// since-archived quiz — flagged inline); the server's publish gate
// is what blocks going Live without a valid, published quiz.

'use client';

import { useEffect, useState } from 'react';
import { getActivityQuizPickerContext } from '@/lib/tutor-quiz/actions';
import {
  formatItemCount,
  formatQuizKind,
  formatQuizMode,
} from '@/lib/tutor-quiz/format';
import type { QuizKind, QuizPickerOption } from '@/lib/tutor-quiz/types';

interface QuizSelectorEditorProps {
  type: 'MOCK' | 'PRACTICE_QUIZ';
  quizId: string | null;
  onChange: (quizId: string | null) => void;
  disabled?: boolean;
}

function quizKindFor(type: 'MOCK' | 'PRACTICE_QUIZ'): QuizKind {
  return type === 'MOCK' ? 'MOCK' : 'PRACTICE';
}

export function QuizSelectorEditor({
  type,
  quizId,
  onChange,
  disabled = false,
}: QuizSelectorEditorProps) {
  const quizKind = quizKindFor(type);
  const kindNoun = type === 'MOCK' ? 'mock' : 'practice';

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [publishedQuizzes, setPublishedQuizzes] = useState<QuizPickerOption[]>(
    [],
  );
  const [linkedQuiz, setLinkedQuiz] = useState<QuizPickerOption | null>(null);

  // Fetch once on mount with the INITIAL quiz_id. After that the
  // dropdown options are stable; later selection changes resolve
  // from `publishedQuizzes` (the only quiz that can be missing from
  // that list is an initially-linked-but-archived one, which the
  // fetch returns separately as `linkedQuiz`).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getActivityQuizPickerContext(quizKind, quizId);
      if (cancelled) return;
      if (result.ok) {
        setPublishedQuizzes(result.publishedQuizzes);
        setLinkedQuiz(result.linkedQuiz);
      } else {
        setFetchError(result.error);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dropdown options: the published quizzes, plus the
  // initially-linked quiz if it isn't already among them (archived
  // / draft / kind-mismatched — flagged inline so the link can
  // still be seen and changed rather than silently dropped).
  const options: QuizPickerOption[] =
    linkedQuiz &&
    !publishedQuizzes.some((q) => q.quiz_id === linkedQuiz.quiz_id)
      ? [linkedQuiz, ...publishedQuizzes]
      : publishedQuizzes;

  const selected = quizId
    ? (options.find((q) => q.quiz_id === quizId) ?? null)
    : null;
  // quiz_id is set but resolves to nothing — the quiz was deleted.
  const selectedMissing = quizId !== null && selected === null;
  // Selected quiz exists but isn't publishable into a Live activity.
  const selectedUnavailable =
    selected !== null && selected.status !== 'PUBLISHED';

  return (
    <div className="activity-editor-body">
      <label className="prog-field">
        <span className="prog-field-label">
          Linked quiz <span className="prog-required">*</span>
        </span>

        {loading ? (
          <p className="prog-field-help">Loading your quizzes…</p>
        ) : fetchError ? (
          <p className="activity-quiz-warn">{fetchError}</p>
        ) : options.length === 0 ? (
          <p className="prog-field-help">
            You have no published {kindNoun} quizzes yet. Create one on
            the Quizzes page and publish it — it will then appear here.
          </p>
        ) : (
          <select
            className="prog-input"
            value={quizId ?? ''}
            onChange={(e) =>
              onChange(e.target.value === '' ? null : e.target.value)
            }
            disabled={disabled}
          >
            <option value="">— No quiz selected —</option>
            {options.map((q) => (
              <option key={q.quiz_id} value={q.quiz_id}>
                {q.title} · {formatItemCount(q.item_count)}
                {q.status !== 'PUBLISHED'
                  ? ` (${q.status.toLowerCase()})`
                  : ''}
              </option>
            ))}
          </select>
        )}

        <span className="prog-field-help">
          Students launch this quiz from the activity. Only your
          published {kindNoun} quizzes can be linked.
        </span>
      </label>

      {selected && (
        <p className="activity-quiz-summary">
          {formatQuizKind(selected.quiz_kind)} ·{' '}
          {formatQuizMode(selected.mode)} ·{' '}
          {formatItemCount(selected.item_count)}
          {selectedUnavailable && (
            <span className="activity-quiz-warn">
              {' — '}this quiz is {selected.status.toLowerCase()}; publish
              it or pick another before this activity can go Live.
            </span>
          )}
        </p>
      )}

      {selectedMissing && (
        <p className="activity-quiz-warn">
          The linked quiz is no longer available. Pick another from the
          list, or clear the selection.
        </p>
      )}
    </div>
  );
}
