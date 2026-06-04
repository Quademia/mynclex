// mynclex/lib/programmes/programme-list.tsx
//
// Client component for the Programmes list body — owns the search /
// status-filter / sort controls and the "Show archived" toggle. Splits
// the server-supplied rows into an active bank (DRAFT + PUBLISHED) and a
// hidden bank (ARCHIVED); CANCELLED no longer exists at the programme
// layer post-9.2a (cancellation moved to nclex_cohorts).
//
// CD uplift: filter/sort row, richer cards (ProgrammeCard), a dashed
// "+ New programme" tile at the end of the grid, and a rotating-chevron
// archived disclosure.

'use client';

import { useCallback, useMemo, useState } from 'react';
import { ProgrammeCard } from './programme-card';
import { NewProgrammeTrigger } from './new-programme-trigger';
import { ProgIcon } from './prog-icon';
import type { ProgrammeCardRow } from './types';

type StatusFilter = 'all' | 'live' | 'draft';
type SortKey = 'updated' | 'name' | 'students';

const FILTERS: Array<[StatusFilter, string]> = [
  ['all', 'All'],
  ['live', 'Live'],
  ['draft', 'Draft'],
];

export function ProgrammeList({ programmes }: { programmes: ProgrammeCardRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('updated');
  const [showArchived, setShowArchived] = useState(false);

  const { active, archived } = useMemo(() => {
    const active: ProgrammeCardRow[] = [];
    const archived: ProgrammeCardRow[] = [];
    for (const p of programmes) {
      if (p.status === 'ARCHIVED') archived.push(p);
      else active.push(p);
    }
    return { active, archived };
  }, [programmes]);

  const q = query.trim().toLowerCase();
  const matches = useCallback(
    (p: ProgrammeCardRow) =>
      !q ||
      p.title.toLowerCase().includes(q) ||
      (p.tagline ?? '').toLowerCase().includes(q),
    [q],
  );

  const shownActive = useMemo(() => {
    let list = active.filter(matches);
    if (filter === 'live') list = list.filter((p) => p.status === 'PUBLISHED');
    else if (filter === 'draft') list = list.filter((p) => p.status === 'DRAFT');
    list = list.slice();
    if (sort === 'name') list.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'students') list.sort((a, b) => b.students - a.students);
    // 'updated' keeps the server order (getMyProgrammes orders by updated_at desc).
    return list;
  }, [active, matches, filter, sort]);

  const shownArchived = useMemo(() => archived.filter(matches), [archived, matches]);

  return (
    <>
      {/* Filter / sort */}
      <div className="programmes-controls">
        <div className="programmes-search">
          <ProgIcon name="search" size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search programmes"
            aria-label="Search programmes"
          />
        </div>
        <div className="programmes-filter" role="tablist" aria-label="Filter by status">
          {FILTERS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={filter === k}
              className={filter === k ? 'active' : ''}
              onClick={() => setFilter(k)}
            >
              {l}
            </button>
          ))}
        </div>
        <label className="programmes-sort">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="updated">Recently updated</option>
            <option value="name">Name A–Z</option>
            <option value="students">Most students</option>
          </select>
        </label>
      </div>

      {/* Active grid */}
      <div className="programmes-grid">
        {shownActive.map((p) => (
          <ProgrammeCard key={p.programme_id} programme={p} />
        ))}
        <NewProgrammeTrigger variant="card" />
      </div>

      {shownActive.length === 0 && (
        <p className="programmes-no-match">No programmes match your search.</p>
      )}

      {/* Archived */}
      {shownArchived.length > 0 && (
        <div className="programmes-archived">
          <button
            type="button"
            className={'programmes-archived-toggle' + (showArchived ? ' is-open' : '')}
            onClick={() => setShowArchived((v) => !v)}
          >
            <ProgIcon name="chevronRight" size={15} /> Show archived ({shownArchived.length})
          </button>
          {showArchived && (
            <div className="programmes-grid programmes-archived-grid">
              {shownArchived.map((p) => (
                <ProgrammeCard key={p.programme_id} programme={p} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
