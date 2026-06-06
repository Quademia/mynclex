// mynclex/lib/tutor-quiz/quiz-list.tsx
//
// Client component for the /tutor/quizzes grid (2026-06 Claude Design
// "Quiz UI Uplift", List A). Owns the toolbar — search · status segments
// · Kind filter · Sort — plus the "Show archived" disclosure. All
// filtering/sorting is in-memory over the server-supplied QuizListRow[]
// (the list is small; no new queries). Status segments + Kind + search
// narrow the ACTIVE grid; archived is its own disclosure (search + Kind
// reach it too, so a search finds an archived quiz).

'use client';

import { useMemo, useState } from 'react';
import { QuizCard } from './quiz-card';
import { QuizIcon } from './quiz-icons';
import type { QuizListRow } from './types';

type StatusFilter = 'all' | 'PUBLISHED' | 'DRAFT';
type KindFilter = 'all' | 'MOCK' | 'PRACTICE';
type SortKey = 'updated' | 'title' | 'questions';

export function QuizList({ quizzes }: { quizzes: QuizListRow[] }) {
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [sort, setSort] = useState<SortKey>('updated');

  const { active, archived } = useMemo(() => {
    const active: QuizListRow[] = [];
    const archived: QuizListRow[] = [];
    for (const q of quizzes) {
      if (q.status === 'ARCHIVED') archived.push(q);
      else active.push(q);
    }
    return { active, archived };
  }, [quizzes]);

  // Segment counts run over the active set (archived is the disclosure).
  const counts = useMemo(
    () => ({
      all: active.length,
      published: active.filter((q) => q.status === 'PUBLISHED').length,
      draft: active.filter((q) => q.status === 'DRAFT').length,
    }),
    [active],
  );

  const visibleActive = useMemo(() => {
    const q = query.trim().toLowerCase();
    return active
      .filter((r) => {
        if (status !== 'all' && r.status !== status) return false;
        if (kind !== 'all' && r.quiz_kind !== kind) return false;
        if (
          q &&
          !r.title.toLowerCase().includes(q) &&
          !(r.description ?? '').toLowerCase().includes(q)
        )
          return false;
        return true;
      })
      .sort((a, b) => sortQuizzes(a, b, sort));
  }, [active, query, status, kind, sort]);

  const visibleArchived = useMemo(() => {
    const q = query.trim().toLowerCase();
    return archived
      .filter((r) => {
        if (kind !== 'all' && r.quiz_kind !== kind) return false;
        if (
          q &&
          !r.title.toLowerCase().includes(q) &&
          !(r.description ?? '').toLowerCase().includes(q)
        )
          return false;
        return true;
      })
      .sort((a, b) => sortQuizzes(a, b, sort));
  }, [archived, query, kind, sort]);

  return (
    <>
      <div className="quizzes-toolbar">
        <div className="quizzes-search">
          <QuizIcon name="search" />
          <input
            type="text"
            placeholder="Search quizzes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search quizzes"
          />
        </div>

        <div className="quizzes-seg" role="group" aria-label="Status">
          <button
            type="button"
            className={status === 'all' ? 'is-active' : ''}
            onClick={() => setStatus('all')}
          >
            All <span className="ct">{counts.all}</span>
          </button>
          <button
            type="button"
            className={status === 'PUBLISHED' ? 'is-active' : ''}
            onClick={() => setStatus('PUBLISHED')}
          >
            Published <span className="ct">{counts.published}</span>
          </button>
          <button
            type="button"
            className={status === 'DRAFT' ? 'is-active' : ''}
            onClick={() => setStatus('DRAFT')}
          >
            Drafts <span className="ct">{counts.draft}</span>
          </button>
        </div>

        <label className="quizzes-select">
          <span className="lbl">Kind:</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as KindFilter)}
            aria-label="Filter by kind"
          >
            <option value="all">All</option>
            <option value="MOCK">Mock</option>
            <option value="PRACTICE">Practice</option>
          </select>
        </label>

        <div className="quizzes-spacer" />

        <label className="quizzes-select">
          <QuizIcon name="chev-up-down" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort"
          >
            <option value="updated">Recently updated</option>
            <option value="title">Title (A–Z)</option>
            <option value="questions">Most questions</option>
          </select>
        </label>
      </div>

      {visibleActive.length === 0 ? (
        <p className="quizzes-empty-filtered">
          No active quizzes match your filters.
        </p>
      ) : (
        <div className="quizzes-grid">
          {visibleActive.map((q) => (
            <QuizCard key={q.quiz_id} quiz={q} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <>
          <button
            type="button"
            className={`quizzes-archived-toggle ${showArchived ? 'is-open' : ''}`}
            onClick={() => setShowArchived((v) => !v)}
          >
            <QuizIcon name="chev-right" />
            {showArchived
              ? `Hide archived (${archived.length})`
              : `Show archived (${archived.length})`}
          </button>

          {showArchived &&
            (visibleArchived.length === 0 ? (
              <p className="quizzes-empty-filtered">
                No archived quizzes match your filters.
              </p>
            ) : (
              <div className="quizzes-grid is-archived-bank">
                {visibleArchived.map((q) => (
                  <QuizCard key={q.quiz_id} quiz={q} />
                ))}
              </div>
            ))}
        </>
      )}
    </>
  );
}

function sortQuizzes(a: QuizListRow, b: QuizListRow, sort: SortKey): number {
  if (sort === 'title') return a.title.localeCompare(b.title);
  if (sort === 'questions') return b.item_count - a.item_count;
  // 'updated' — most recent first.
  return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
}
