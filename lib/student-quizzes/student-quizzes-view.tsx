// mynclex/lib/student-quizzes/student-quizzes-view.tsx
//
// Client orchestrator for the student Quizzes page (Tutor Quiz
// Slice 6). Owns:
//   • Filter state — kind + state segmented controls.
//   • Launch-modal mount — routes between the activity-linked
//     viewer (existing <QuizLaunchViewer>) and the standalone
//     viewer (new <StandaloneQuizLaunchViewer>) based on the
//     row's primary_activity_id. Option 2 from the routing
//     decision: linked rows route through the curriculum
//     launch path; standalone rows use the new RPC.
//   • Empty-state rendering — student-friendly copy (no add CTA,
//     unlike the tutor side).

'use client';

import { useMemo, useState } from 'react';
import { QuizLaunchViewer } from '@/lib/curriculum/quiz-launch-viewer';
import { StandaloneQuizLaunchViewer } from '@/lib/curriculum/standalone-quiz-launch-viewer';
import { StudentQuizRowView } from './quiz-row';
import type {
  StudentQuizFilters,
  StudentQuizRow,
} from './types';

interface StudentQuizzesViewProps {
  programmeId: string;
  rows: StudentQuizRow[];
}

type LaunchTarget =
  | { kind: 'linked'; row: StudentQuizRow }
  | { kind: 'standalone'; row: StudentQuizRow };

export function StudentQuizzesView({
  programmeId,
  rows,
}: StudentQuizzesViewProps) {
  const [filters, setFilters] = useState<StudentQuizFilters>({
    kind: 'all',
    state: 'all',
  });
  const [launch, setLaunch] = useState<LaunchTarget | null>(null);

  const hasAnyDone = useMemo(
    () => rows.some((r) => r.state === 'DONE'),
    [rows],
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filters.kind !== 'all' && r.quiz_kind !== filters.kind) {
        return false;
      }
      if (filters.state === 'not_started') {
        if (
          r.state !== 'NOT_STARTED' &&
          r.state !== 'UP_NEXT'
        ) {
          return false;
        }
      }
      return true;
    });
  }, [rows, filters]);

  function handleLaunch(row: StudentQuizRow) {
    if (row.primary_activity_id) {
      setLaunch({ kind: 'linked', row });
    } else {
      setLaunch({ kind: 'standalone', row });
    }
  }

  function closeLaunch() {
    setLaunch(null);
  }

  const hasAny = rows.length > 0;
  const showingCount = filtered.length;
  const totalCount = rows.length;

  return (
    <div className="sq-page">
      <header className="sq-head">
        <h1 className="sq-title">Quizzes</h1>
        <p className="sq-sub">
          Mock exams &amp; practice quizzes from this programme.
          Anything linked to the curriculum appears here automatically;
          standalone practice is attached for you to take whenever
          you&apos;re ready.
        </p>
      </header>

      {hasAny && (
        <div className="sq-filters" aria-label="Filters">
          <FilterGroup
            label="Kind"
            value={filters.kind}
            options={[
              { id: 'all', label: 'All' },
              { id: 'MOCK', label: 'Mock' },
              { id: 'PRACTICE', label: 'Practice' },
            ]}
            onChange={(v) =>
              setFilters((f) => ({
                ...f,
                kind: v as StudentQuizFilters['kind'],
              }))
            }
          />
          <FilterGroup
            label="State"
            value={filters.state}
            options={[
              { id: 'all', label: 'All' },
              { id: 'not_started', label: 'Not started only' },
            ]}
            onChange={(v) =>
              setFilters((f) => ({
                ...f,
                state: v as StudentQuizFilters['state'],
              }))
            }
          />
          <span className="sq-filters-count">
            {showingCount === totalCount
              ? `${totalCount} ${totalCount === 1 ? 'quiz' : 'quizzes'}`
              : `Showing ${showingCount} of ${totalCount}`}
          </span>
        </div>
      )}

      {!hasAny ? (
        <div className="sq-empty">
          <h2 className="sq-empty-title">No quizzes yet.</h2>
          <p className="sq-empty-sub">
            This programme doesn&apos;t have practice quizzes attached
            right now. They&apos;ll appear here as your tutor adds
            them — check back soon.
          </p>
        </div>
      ) : showingCount === 0 ? (
        <div className="sq-empty">
          <h2 className="sq-empty-title">
            No quizzes match this filter.
          </h2>
          <p className="sq-empty-sub">
            Try clearing the filter to see all quizzes in this
            programme.
          </p>
        </div>
      ) : (
        <div className="sq-list">
          {filtered.map((row) => (
            <StudentQuizRowView
              key={row.quiz_id}
              row={row}
              hasAnyDone={hasAnyDone}
              onLaunch={handleLaunch}
            />
          ))}
        </div>
      )}

      {launch?.kind === 'linked' && (
        <QuizLaunchViewer
          target={{
            activity_id: launch.row.primary_activity_id!,
            title: launch.row.title,
            description: null,
            note: null,
          }}
          onClose={closeLaunch}
        />
      )}

      {launch?.kind === 'standalone' && (
        <StandaloneQuizLaunchViewer
          programmeId={programmeId}
          quizId={launch.row.quiz_id}
          fallbackTitle={launch.row.title}
          isRetake={launch.row.state === 'DONE'}
          onClose={closeLaunch}
        />
      )}
    </div>
  );
}

function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="sq-filter-group">
      <span className="sq-filter-label">{label}</span>
      <div className="sq-segmented" role="tablist" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={value === opt.id}
            className={`sq-segmented-btn ${value === opt.id ? 'is-active' : ''}`}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
