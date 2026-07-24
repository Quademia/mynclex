// mynclex/lib/overlays/programme-quizzes/add-existing-picker.tsx
//
// "Add existing" picker overlay (Tutor Quiz Slice 5, §9.4.1).
// Modal-style: dimmed backdrop, centered card, backdrop click =
// Cancel. Hard-scoped to the tutor's own PUBLISHED quizzes not
// already attached — the parent view passes the eligible set in.
//
// Two empty-state variants are rendered from the same component
// based on the candidate list:
//   • zero candidates AND the tutor has at least one PUBLISHED
//     quiz somewhere → "everything's already attached"
//   • zero candidates AND no PUBLISHED quizzes at all → covered
//     by the same copy variant in v1 ("nothing to attach"); the
//     two-flavour split is design-only (the action sets aren't
//     different enough to justify two surfaces).

'use client';

import { useMemo, useState } from 'react';
import {
  formatItemCount,
  formatQuizKind,
  formatQuizMode,
} from '@/lib/tutor-quiz/format';
import type { PickerQuizRow } from '@/lib/programme-quizzes/types';

type KindFilter = 'all' | 'MOCK' | 'PRACTICE';

interface AddExistingPickerProps {
  candidates: PickerQuizRow[];
  pending: boolean;
  /** Validation/server error message to show inline (no separate toast). */
  errorMessage: string | null;
  onErrorClear: () => void;
  onClose: () => void;
  onAdd: (quizIds: string[]) => void;
}

export function AddExistingPicker({
  candidates,
  pending,
  errorMessage,
  onErrorClear,
  onClose,
  onAdd,
}: AddExistingPickerProps) {
  const [filter, setFilter] = useState<KindFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (filter === 'all') return candidates;
    return candidates.filter((q) => q.quiz_kind === filter);
  }, [candidates, filter]);

  function toggle(quizId: string) {
    onErrorClear();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(quizId)) next.delete(quizId);
      else next.add(quizId);
      return next;
    });
  }

  const count = selected.size;
  const addLabel =
    count === 0
      ? 'Add to programme'
      : count === 1
        ? 'Add 1 quiz'
        : `Add ${count} quizzes`;

  const noCandidates = candidates.length === 0;

  return (
    <div
      className="prog-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pq-picker-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="pq-picker-modal">
        <div className="pq-picker-head">
          <div>
            <h2 className="pq-picker-title" id="pq-picker-title">
              Add existing quizzes
            </h2>
            <p className="pq-picker-sub">
              Pick from your published quizzes. Drafts and archived
              quizzes aren&apos;t shown — finish them on the Quizzes
              page first.
            </p>
          </div>
          <button
            type="button"
            className="pq-picker-close"
            aria-label="Close"
            onClick={onClose}
            disabled={pending}
          >
            ✕
          </button>
        </div>

        <div className="pq-picker-body">
          {!noCandidates && (
            <div className="pq-picker-controls">
              <div
                className="pq-segmented"
                role="tablist"
                aria-label="Filter by kind"
              >
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'MOCK', label: 'Mock' },
                    { id: 'PRACTICE', label: 'Practice' },
                  ] as Array<{ id: KindFilter; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={filter === opt.id}
                    className={`pq-segmented-btn ${filter === opt.id ? 'is-active' : ''}`}
                    onClick={() => setFilter(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="pq-picker-count">
                {filtered.length === 0
                  ? 'No matches'
                  : filtered.length === 1
                    ? '1 quiz available'
                    : `${filtered.length} quizzes available`}
              </span>
            </div>
          )}

          {noCandidates ? (
            <div className="pq-picker-empty">
              <p className="pq-picker-empty-title">
                You don&apos;t have any quizzes to attach yet.
              </p>
              <p className="pq-picker-empty-sub">
                Either every published quiz is already in this
                programme, or you haven&apos;t published one yet. Use
                <strong> New quiz</strong> to build one for this
                programme directly.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="pq-picker-empty">
              <p className="pq-picker-empty-title">
                No quizzes match this filter.
              </p>
              <p className="pq-picker-empty-sub">
                Try a different kind or switch back to <strong>All</strong>.
              </p>
            </div>
          ) : (
            <ul className="pq-picker-list">
              {filtered.map((q) => {
                const isSel = selected.has(q.quiz_id);
                return (
                  <li
                    key={q.quiz_id}
                    className={`pq-picker-row ${isSel ? 'is-selected' : ''}`}
                  >
                    <label className="pq-picker-row-label">
                      <input
                        type="checkbox"
                        className="pq-picker-check"
                        checked={isSel}
                        onChange={() => toggle(q.quiz_id)}
                        disabled={pending}
                      />
                      <span className="pq-picker-row-body">
                        <span className="pq-picker-row-title">
                          {q.title}
                        </span>
                        <span className="pq-picker-row-meta">
                          <span
                            className={`quiz-pill-kind quiz-pill-kind-${q.quiz_kind.toLowerCase()}`}
                          >
                            {formatQuizKind(q.quiz_kind)}
                          </span>
                          <span>{formatQuizMode(q.quiz_kind, q.mode)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatItemCount(q.item_count)}</span>
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {errorMessage && (
            <p className="pq-picker-error" role="alert">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="pq-picker-foot">
          <span className="pq-picker-foot-count">
            {count === 0
              ? 'Nothing selected'
              : count === 1
                ? '1 selected'
                : `${count} selected`}
          </span>
          <div className="pq-picker-foot-actions">
            <button
              type="button"
              className="pq-btn pq-btn-ghost"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="pq-btn pq-btn-primary"
              disabled={count === 0 || pending}
              onClick={() => onAdd([...selected])}
            >
              {pending && count > 0 ? 'Adding…' : addLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
