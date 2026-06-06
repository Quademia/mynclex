// mynclex/lib/tutor-quiz/quiz-editor.tsx
//
// The /tutor/quiz/[id] editor body. One page, two zones:
//   1. "In this quiz" — the ordered list of selected questions;
//      reorder with up/down arrows, remove per row.
//   2. "Add questions" — the tutor's own published, standalone
//      questions, behind the picker filter bar; checkbox + Add.
// Above both, a header with the quiz metadata + an "Edit details"
// button that reopens <QuizFormModal> in edit mode.
//
// Item operations (add / remove / reorder) are server actions; the
// component refreshes the route after each so the server-rendered
// lists re-fetch. The picker filter bar is a GET form — submitting
// it navigates and the server page re-queries.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { QuizFormModal } from './quiz-form-modal';
import { QuizPublishControls } from './quiz-publish-controls';
import { QuizPickerFilterBar } from './quiz-picker-filters';
import { QuizIcon } from './quiz-icons';
import { HoverPeek } from '@/lib/bank/hover-peek';
import {
  addQuizItemsAction,
  moveQuizItemAction,
  removeQuizItemAction,
} from './actions';
import {
  formatDuration,
  formatMaxAttempts,
  formatPassScore,
  formatQuizKind,
  formatQuizMode,
  formatQuizStatus,
  quizStatusPillClass,
} from './format';
import type { QuizPickerFilters } from './quiz-picker-query';
import type {
  PickerQuestionRow,
  QuizFormValues,
  QuizItemRow,
  TutorQuiz,
} from './types';

function stemPreview(stem: string): string {
  const trimmed = stem.trim();
  return trimmed.length > 0 ? trimmed : '(no stem)';
}

// Hover-peek panel for a picker question — the FULL stem (unclamped) +
// its classification, so a tutor can read/vet a question without
// opening it. The row's stem stays 2-line clamped; this just reveals
// the rest on hover. Reuses the bank's HoverPeek primitive + CSS.
function PickerPeekPanel({ q }: { q: PickerQuestionRow }) {
  const chips = [
    q.client_needs_category,
    q.client_needs_subcategory,
    q.nursing_subject,
    q.body_system,
    q.topic,
  ].filter((c): c is string => Boolean(c));
  const tags = q.tags ?? [];

  return (
    <>
      <div className="hover-peek-kicker">
        {q.question_type}
        {q.difficulty ? ` · ${q.difficulty}` : ''}
      </div>
      <p className="hover-peek-body">{stemPreview(q.stem)}</p>
      {(chips.length > 0 || tags.length > 0) && (
        <div className="hover-peek-chips">
          {chips.map((c) => (
            <span key={c} className="hover-peek-chip">
              {c}
            </span>
          ))}
          {tags.map((t) => (
            <span key={`tag-${t}`} className="hover-peek-chip">
              #{t}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

export function QuizEditor({
  quiz,
  items,
  pickerQuestions,
  pickerFilters,
  pickerTagOptions,
  usedCount,
}: {
  quiz: TutorQuiz;
  items: QuizItemRow[];
  pickerQuestions: PickerQuestionRow[];
  pickerFilters: QuizPickerFilters;
  pickerTagOptions: string[];
  /** How many programmes this quiz is attached to (for the zone badge). */
  usedCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const baseUrl = `/tutor/quiz/${quiz.quiz_id}`;
  const addedItemIds = new Set(items.map((i) => i.item_id));

  const editInitial: QuizFormValues = {
    title: quiz.title,
    description: quiz.description,
    quiz_kind: quiz.quiz_kind,
    mode: quiz.mode,
    duration_seconds: quiz.duration_seconds,
    pass_score: quiz.pass_score,
    max_attempts: quiz.max_attempts,
    status: quiz.status,
  };

  // Header meta — laid out as labelled stat chips (Mode / Duration /
  // Pass / Attempts). Duration only shows for timed modes.
  const isMock = quiz.quiz_kind === 'MOCK';
  const durationLabel = formatDuration(quiz.duration_seconds);
  const passLabel = formatPassScore(quiz.pass_score);

  function runItemAction(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong.');
        return;
      }
      router.refresh();
    });
  }

  function toggleSelected(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function handleAddSelected() {
    if (selected.size === 0) return;
    const ids = [...selected];
    startTransition(async () => {
      const result = await addQuizItemsAction(quiz.quiz_id, ids);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <>
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="quiz-editor-head">
        <div className="quiz-editor-head-top">
          <div className="quiz-editor-head-main">
            <div className="quiz-editor-title-row">
              <span
                className={`quiz-kind-tag ${isMock ? 'is-mock' : 'is-practice'}`}
              >
                <QuizIcon name={isMock ? 'target' : 'sparkles'} />
                {formatQuizKind(quiz.quiz_kind)}
              </span>
              <h1 className="quiz-editor-title">{quiz.title}</h1>
              <span className={`quiz-pill ${quizStatusPillClass(quiz.status)}`}>
                {formatQuizStatus(quiz.status)}
              </span>
            </div>
            {quiz.description && (
              <p className="quiz-editor-desc">{quiz.description}</p>
            )}
          </div>
          <div className="quiz-editor-head-actions">
            <button
              type="button"
              className="quiz-btn quiz-btn-ghost"
              onClick={() => setEditOpen(true)}
            >
              <QuizIcon name="pencil" />
              Edit details
            </button>
            <QuizPublishControls
              quizId={quiz.quiz_id}
              status={quiz.status}
              itemCount={items.length}
            />
          </div>
        </div>

        <div className="quiz-editor-metachips">
          <div className="chip">
            <span className="k">
              <QuizIcon name="list" />
              Mode
            </span>
            <span className="v">{formatQuizMode(quiz.mode)}</span>
          </div>
          {durationLabel && (
            <div className="chip">
              <span className="k">
                <QuizIcon name="timer" />
                Duration
              </span>
              <span className="v">{durationLabel}</span>
            </div>
          )}
          <div className="chip">
            <span className="k">
              <QuizIcon name="target" />
              Pass score
            </span>
            <span className="v">{passLabel ?? 'Ungraded'}</span>
          </div>
          <div className="chip">
            <span className="k">
              <QuizIcon name="repeat" />
              Attempts
            </span>
            <span className="v">{formatMaxAttempts(quiz.max_attempts)}</span>
          </div>
        </div>
      </header>

      <div className="quiz-editor-columns">
      {/* ── Left column: the quiz (selected questions) ───────── */}
      <section className="quiz-zone quiz-col-selected">
        <div className="quiz-zone-head">
          <div className="quiz-zone-head-l">
            <h2 className="quiz-zone-title">
              In this quiz <span className="quiz-zone-count">{items.length}</span>
            </h2>
            <p className="quiz-zone-hint">
              Use the arrows to reorder. Students see them in this order.
            </p>
          </div>
          {usedCount > 0 && (
            <span className="quiz-zone-used">
              <QuizIcon name="programmes" />
              <b>{usedCount}</b>&nbsp;{usedCount === 1 ? 'programme' : 'programmes'}
            </span>
          )}
        </div>

        {items.length === 0 ? (
          <p className="quiz-zone-empty">
            No questions yet. Add some from your bank below.
          </p>
        ) : (
          <ol className="quiz-item-list">
            {items.map((item, index) => (
              <li key={item.quiz_item_id} className="quiz-item-row">
                <div className="quiz-item-handle">
                  <span className="quiz-item-grip" aria-hidden="true">
                    <QuizIcon name="grip" />
                  </span>
                  <span className="quiz-item-position">{item.position}</span>
                </div>
                <div className="quiz-item-body">
                  <div className="quiz-item-line">
                    <span className="quiz-type-chip">
                      {item.question_type}
                    </span>
                    {item.difficulty && (
                      <span
                        className={`quiz-diff-chip is-${item.difficulty.toLowerCase()}`}
                      >
                        {item.difficulty}
                      </span>
                    )}
                    {item.client_needs_category && (
                      <span className="quiz-item-cat">
                        {item.client_needs_category}
                      </span>
                    )}
                  </div>
                  <p className="quiz-item-stem">
                    {stemPreview(item.stem)}
                  </p>
                </div>
                <div className="quiz-item-actions">
                  <button
                    type="button"
                    className="quiz-icon-btn"
                    aria-label="Move up"
                    title="Move up"
                    disabled={isPending || index === 0}
                    onClick={() =>
                      runItemAction(() =>
                        moveQuizItemAction(item.quiz_item_id, 'up'),
                      )
                    }
                  >
                    <QuizIcon name="arrow-up" />
                  </button>
                  <button
                    type="button"
                    className="quiz-icon-btn"
                    aria-label="Move down"
                    title="Move down"
                    disabled={isPending || index === items.length - 1}
                    onClick={() =>
                      runItemAction(() =>
                        moveQuizItemAction(item.quiz_item_id, 'down'),
                      )
                    }
                  >
                    <QuizIcon name="arrow-down" />
                  </button>
                  <button
                    type="button"
                    className="quiz-icon-btn quiz-icon-btn-danger"
                    aria-label="Remove from quiz"
                    title="Remove from quiz"
                    disabled={isPending}
                    onClick={() =>
                      runItemAction(() =>
                        removeQuizItemAction(item.quiz_item_id),
                      )
                    }
                  >
                    <QuizIcon name="x" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── Right column: question picker ────────────────────── */}
      <section className="quiz-zone quiz-col-picker">
        <div className="quiz-zone-head">
          <div className="quiz-zone-head-l">
            <h2 className="quiz-zone-title">Add questions</h2>
            <p className="quiz-zone-hint">
              Your published, standalone questions. Filter, tick the ones
              you want, then Add.
            </p>
          </div>
        </div>

        <QuizPickerFilterBar
          values={pickerFilters}
          baseUrl={baseUrl}
          tagOptions={pickerTagOptions}
        />

        {pickerQuestions.length === 0 ? (
          <p className="quiz-zone-empty">
            No published standalone questions match. Adjust the filters,
            or publish more questions in your bank first.
          </p>
        ) : (
          <>
            <div className="quiz-picker-bar">
              <span className="quiz-picker-count">
                {selected.size === 0
                  ? `${pickerQuestions.length} shown`
                  : `${selected.size} selected`}
              </span>
              <button
                type="button"
                className="quiz-btn quiz-btn-primary"
                disabled={selected.size === 0 || isPending}
                onClick={handleAddSelected}
              >
                {isPending && selected.size > 0
                  ? 'Adding…'
                  : selected.size > 0
                    ? `Add ${selected.size} selected`
                    : 'Add selected'}
              </button>
            </div>

            <ul className="quiz-picker-list">
              {pickerQuestions.map((q) => {
                const alreadyAdded = addedItemIds.has(q.item_id);
                const isChecked = selected.has(q.item_id);
                return (
                  <li
                    key={q.item_id}
                    className={`quiz-picker-row ${
                      isChecked ? 'is-checked' : ''
                    } ${alreadyAdded ? 'is-added' : ''}`}
                  >
                    <label className="quiz-picker-check">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={alreadyAdded || isPending}
                        onChange={() => toggleSelected(q.item_id)}
                      />
                    </label>
                    <div className="quiz-item-body">
                      <div className="quiz-item-line">
                        <span className="quiz-type-chip">
                          {q.question_type}
                        </span>
                        {q.difficulty && (
                          <span
                            className={`quiz-diff-chip is-${q.difficulty.toLowerCase()}`}
                          >
                            {q.difficulty}
                          </span>
                        )}
                        {q.client_needs_category && (
                          <span className="quiz-item-cat">
                            {q.client_needs_category}
                          </span>
                        )}
                      </div>
                      <HoverPeek
                        className="quiz-item-stem"
                        panel={<PickerPeekPanel q={q} />}
                      >
                        {stemPreview(q.stem)}
                      </HoverPeek>
                    </div>
                    {alreadyAdded && (
                      <span className="quiz-picker-added">Added</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
      </div>

      <ErrorToast error={error} onDismiss={() => setError(null)} />

      {editOpen && (
        <QuizFormModal
          mode="edit"
          quizId={quiz.quiz_id}
          initial={editInitial}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}
