// mynclex/lib/programmes/programme-list.tsx
//
// Client component for the whole Programmes page body — owns the
// delivery-mode SEGMENT (All / Tutored / Self-paced), the search /
// status-filter / sort controls, and the "Show archived" toggle.
//
// The two delivery modes are the SAME object underneath (one
// nclex_programmes table) but presented separately at the front so a
// tutor instantly sees "these run in cohorts; these don't." The segment
// filters the list AND swaps the create button(s): both on All, one each
// on the mode tabs. Counts are computed client-side from the rows the
// page already fetched — no extra query.
//
// Rows split into an active bank (DRAFT + PUBLISHED) and a hidden bank
// (ARCHIVED); CANCELLED no longer exists at the programme layer
// post-9.2a (cancellation moved to nclex_cohorts).

'use client';

import { useCallback, useMemo, useState } from 'react';
import { ProgrammeCard } from './programme-card';
import { NewProgrammeTrigger } from './new-programme-trigger';
import { ProgrammesEmpty } from './empty-state';
import { ProgIcon } from './prog-icon';
import type { ProgrammeCardRow } from './types';

type Segment = 'all' | 'tutored' | 'selfpaced';
type StatusFilter = 'all' | 'live' | 'draft';
type SortKey = 'updated' | 'name' | 'students';

const SEGMENTS: Array<{ key: Segment; label: string; dot?: string }> = [
  { key: 'all', label: 'All' },
  { key: 'tutored', label: 'Tutored', dot: 'is-tutored' },
  { key: 'selfpaced', label: 'Self-paced', dot: 'is-selfpaced' },
];

const SEG_HINT: Record<Segment, string> = {
  all: 'Tutored programmes run in cohorts · self-paced ones don’t.',
  tutored: 'Runs in scheduled cohorts with live sessions.',
  selfpaced: 'Evergreen — students enrol any time, no cohorts.',
};

const FILTERS: Array<[StatusFilter, string]> = [
  ['all', 'All'],
  ['live', 'Live'],
  ['draft', 'Draft'],
];

function inSegment(p: ProgrammeCardRow, segment: Segment): boolean {
  if (segment === 'all') return true;
  if (segment === 'tutored') return p.delivery_mode === 'TUTOR_LED';
  return p.delivery_mode === 'SELF_PACED';
}

export function ProgrammeList({ programmes }: { programmes: ProgrammeCardRow[] }) {
  const [segment, setSegment] = useState<Segment>('all');
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

  // Segment counts (active rows only) — drive the tab badges.
  const counts = useMemo<Record<Segment, number>>(
    () => ({
      all: active.length,
      tutored: active.filter((p) => p.delivery_mode === 'TUTOR_LED').length,
      selfpaced: active.filter((p) => p.delivery_mode === 'SELF_PACED').length,
    }),
    [active],
  );

  const q = query.trim().toLowerCase();
  const matches = useCallback(
    (p: ProgrammeCardRow) =>
      !q ||
      p.title.toLowerCase().includes(q) ||
      (p.tagline ?? '').toLowerCase().includes(q),
    [q],
  );

  const shownActive = useMemo(() => {
    let list = active.filter((p) => inSegment(p, segment) && matches(p));
    if (filter === 'live') list = list.filter((p) => p.status === 'PUBLISHED');
    else if (filter === 'draft') list = list.filter((p) => p.status === 'DRAFT');
    list = list.slice();
    if (sort === 'name') list.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'students') list.sort((a, b) => b.students - a.students);
    // 'updated' keeps the server order (getMyProgrammes orders by updated_at desc).
    return list;
  }, [active, segment, matches, filter, sort]);

  const shownArchived = useMemo(
    () => archived.filter((p) => inSegment(p, segment) && matches(p)),
    [archived, segment, matches],
  );

  // Whole-account empty → onboarding for a brand-new tutor (both modes).
  const totalEmpty = programmes.length === 0;
  // A mode tab with genuinely nothing in it (active OR archived) and no
  // search/filter narrowing → that mode's "create your first" prompt.
  const segmentTotal = useMemo(
    () => programmes.filter((p) => inSegment(p, segment)).length,
    [programmes, segment],
  );
  const filtersActive = q !== '' || filter !== 'all';
  const showSegmentEmpty = segmentTotal === 0 && !filtersActive;

  return (
    <div className="programmes-page">
      <header className="programmes-head">
        <div>
          <h1 className="programmes-title">Programmes</h1>
          <p className="programmes-sub">
            Every programme you run — manage cohorts, pricing and publishing.
          </p>
        </div>
        {!totalEmpty && (
          <div className="programmes-create">
            {(segment === 'all' || segment === 'tutored') && (
              <NewProgrammeTrigger mode="TUTOR_LED" variant="header" />
            )}
            {(segment === 'all' || segment === 'selfpaced') && (
              <NewProgrammeTrigger mode="SELF_PACED" variant="header" />
            )}
          </div>
        )}
      </header>

      {totalEmpty ? (
        <ProgrammesEmpty segment="all" />
      ) : (
        <>
          {/* Delivery-mode segmented control */}
          <div className="programmes-modebar">
            <div
              className="programmes-segments"
              role="tablist"
              aria-label="Delivery mode"
            >
              {SEGMENTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={segment === s.key}
                  className={segment === s.key ? 'active' : ''}
                  onClick={() => setSegment(s.key)}
                >
                  {s.dot && <span className={`seg-dot ${s.dot}`} />}
                  {s.label}
                  <span className="seg-count">{counts[s.key]}</span>
                </button>
              ))}
            </div>
            <span className="programmes-modebar-hint">
              <ProgIcon name="info" size={13} /> {SEG_HINT[segment]}
            </span>
          </div>

          {showSegmentEmpty ? (
            <ProgrammesEmpty segment={segment} />
          ) : (
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
                <div
                  className="programmes-filter"
                  role="tablist"
                  aria-label="Filter by status"
                >
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
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                  >
                    <option value="updated">Recently updated</option>
                    <option value="name">Name A–Z</option>
                    <option value="students">Most students</option>
                  </select>
                </label>
              </div>

              {/* Active grid */}
              {shownActive.length === 0 ? (
                <p className="programmes-no-match">
                  {filtersActive
                    ? 'No programmes match your filters.'
                    : 'No active programmes here — see archived below.'}
                </p>
              ) : (
                <div className="programmes-grid">
                  {shownActive.map((p) => (
                    <ProgrammeCard key={p.programme_id} programme={p} />
                  ))}
                  {segment !== 'all' && (
                    <NewProgrammeTrigger
                      mode={segment === 'tutored' ? 'TUTOR_LED' : 'SELF_PACED'}
                      variant="card"
                    />
                  )}
                </div>
              )}

              {/* Archived */}
              {shownArchived.length > 0 && (
                <div className="programmes-archived">
                  <button
                    type="button"
                    className={
                      'programmes-archived-toggle' +
                      (showArchived ? ' is-open' : '')
                    }
                    onClick={() => setShowArchived((v) => !v)}
                  >
                    <ProgIcon name="chevronRight" size={15} /> Show archived (
                    {shownArchived.length})
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
          )}
        </>
      )}
    </div>
  );
}
