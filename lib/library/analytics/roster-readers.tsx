// mynclex/lib/library/analytics/roster-readers.tsx
//
// The per-note Roster + Readers tabs (slice 11.11c, Slice 3a). Roster =
// a reader × block heatmap (first-try accuracy per block), grouped by
// cohort / self-paced. Readers = a flat list with each reader's progress
// + overall accuracy. Read-only here; the per-reader drill-in + the scope
// switcher land in Slice 3b. Concept from the CD "Question analytics"
// prototype, rebuilt in the app shell.

import Link from 'next/link';
import type { EmbedNoteReaders } from './types';

export function RosterTab({ data }: { data: EmbedNoteReaders }) {
  const gridCols = `minmax(140px, 1.4fr) repeat(${data.cols.length}, 1fr) 64px`;
  const base = `/tutor/library/analytics/note/${data.noteId}`;
  return (
    <div className="eqa-roster-wrap">
      <p className="eqa-roster-note">
        Each cell is one reader&apos;s first-attempt accuracy on that block. A
        dot means they haven&apos;t reached it yet.
      </p>
      <div className="eqa-roster">
        <div className="eqa-roster-head" style={{ gridTemplateColumns: gridCols }}>
          <div>Reader</div>
          {data.cols.map((c, i) => (
            <div key={i} className="eqa-roster-col" title={c.title}>
              {c.label}
            </div>
          ))}
          <div className="eqa-roster-col">Note</div>
        </div>
        {data.groups.map((g) => (
          <div key={g.key}>
            <div className="eqa-roster-group">
              <span className="eqa-group-dot" data-kind={g.kind} aria-hidden="true" />
              {g.label} · {g.count}
            </div>
            {g.rows.map((r) => (
              <Link
                key={r.studentId}
                href={`${base}?reader=${r.studentId}&from=roster`}
                className="eqa-roster-row"
                style={{ gridTemplateColumns: gridCols }}
              >
                <div className="eqa-roster-name">{r.name}</div>
                {r.cells.map((cell, i) => (
                  <div key={i} className="eqa-roster-cellwrap">
                    {cell.pct === null ? (
                      <span className="eqa-cell eqa-cell--empty">·</span>
                    ) : (
                      <span className="eqa-cell" data-tier={cell.tier ?? 'holding'}>
                        {cell.pct}
                      </span>
                    )}
                  </div>
                ))}
                <div className="eqa-roster-cellwrap">
                  <span
                    className="eqa-roster-overall"
                    data-tier={r.tier ?? 'holding'}
                  >
                    {r.overallPct === null ? '—' : `${r.overallPct}%`}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReadersTab({ data }: { data: EmbedNoteReaders }) {
  return (
    <div className="eqa-readers">
      {data.readers.map((r) => (
        <Link
          key={r.studentId}
          href={`/tutor/library/analytics/note/${data.noteId}?reader=${r.studentId}&from=readers`}
          className="eqa-reader-row"
        >
          <div className="eqa-reader-id">
            <span
              className="eqa-reader-avatar"
              data-kind={r.isCohort ? 'cohort' : 'self'}
              aria-hidden="true"
            >
              {r.initials}
            </span>
            <div className="eqa-reader-idtext">
              <div className="eqa-reader-name">{r.name}</div>
              <span
                className="eqa-reader-badge"
                data-kind={r.isCohort ? 'cohort' : 'self'}
              >
                {r.segmentLabel}
              </span>
            </div>
          </div>
          <div className="eqa-reader-prog">
            <div className="eqa-reader-prog-n">
              {r.blocksReached} / {r.totalBlocks}
            </div>
            <div className="eqa-reader-prog-l">blocks done</div>
          </div>
          <div className="eqa-reader-acc">
            <div className="eqa-bar">
              <span
                className="eqa-bar-fill"
                data-tier={r.tier ?? 'holding'}
                style={{ width: `${r.overallPct ?? 0}%` }}
              />
            </div>
            <span className="eqa-reader-pct" data-tier={r.tier ?? 'holding'}>
              {r.overallPct === null ? '—' : `${r.overallPct}%`}
            </span>
          </div>
          <div className="eqa-reader-retried">{r.retriedLabel}</div>
        </Link>
      ))}
    </div>
  );
}
