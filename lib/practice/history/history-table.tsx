// mynclex/lib/practice/history/history-table.tsx
//
// The History directory — one row per sitting, newest first, paged.
//
// A SERVER component, deliberately. Every control here (type chips, state
// chips, search, paging) is a link or a plain GET form, so there is no
// client state to hold and nothing to hydrate: the filters live in the URL
// instead. That also means the back button works, a filtered view can be
// bookmarked, and the page renders identically with JavaScript disabled.
//
// The previous version was a client component whose two chip groups and
// search box rendered permanently disabled as "coming soon" placeholders,
// and whose one working control — a show-discarded checkbox — was itself
// permanently disabled, because nothing in the product writes ABANDONED.
//
// Where each row OPENS and how its result is WORDED are not decided here;
// they come from ./derive, which the dashboard's recent rail also reads.
// Two surfaces describing the same sitting must not disagree.

import Link from 'next/link';
import type {
  HistoryPage,
  HistoryQuery,
  HistoryRow,
  HistoryStateFilter,
  HistoryTypeFilter,
} from './types';
import { formatDuration, formatRelativeDate, rowTimestamp } from './format';
import {
  answeredDetail,
  attemptHref,
  attemptLinkLabel,
  canDiscard,
  describeOutcome,
  sittingKind,
  sittingKindLabel,
  sittingSummary,
} from './derive';
import { DiscardButton } from './discard-button';

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Done',
  TIMED_OUT: 'Timed out',
  IN_PROGRESS: 'Unfinished',
  ABANDONED: 'Discarded',
};

const STATUS_PILL_CLASS: Record<string, string> = {
  COMPLETED: 'hist-pill hist-pill-done',
  TIMED_OUT: 'hist-pill hist-pill-done',
  IN_PROGRESS: 'hist-pill hist-pill-resume',
  ABANDONED: 'hist-pill hist-pill-discarded',
};

const TYPE_CHIPS: Array<{ id: HistoryTypeFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'practice', label: 'Practice' },
  { id: 'pack', label: 'Packs' },
  { id: 'cat', label: 'CAT' },
];

const STATE_CHIPS: Array<{ id: HistoryStateFilter; label: string }> = [
  { id: 'all', label: 'Any state' },
  { id: 'open', label: 'Unfinished' },
  { id: 'done', label: 'Done' },
  { id: 'discarded', label: 'Discarded' },
];

/** Rebuilds the current URL with one thing changed. Any filter change
 *  resets to page 1 — staying on page 4 of a list that just shrank to one
 *  page shows an empty table and looks broken. */
function hrefWith(query: HistoryQuery, patch: Partial<HistoryQuery>): string {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.type !== 'all') params.set('type', next.type);
  if (next.state !== 'all') params.set('state', next.state);
  if (next.q) params.set('q', next.q);
  const resetPage = patch.page === undefined;
  const page = resetPage ? 1 : next.page;
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/student/bank/history?${qs}` : '/student/bank/history';
}

function ResultCell({ row }: { row: HistoryRow }) {
  const outcome = describeOutcome(row.attempt, row.stats);
  const detail = answeredDetail(row.attempt, row.stats);

  if (!outcome) return <span className="hist-result-none">—</span>;

  return (
    <>
      <span className={`hist-outcome hist-outcome-${outcome.tone}`}>
        {outcome.label}
      </span>
      {detail && <span className="hist-result-detail">{detail}</span>}
    </>
  );
}

function ActionCell({ row }: { row: HistoryRow }) {
  const href = attemptHref(row.attempt);
  const label = attemptLinkLabel(row.attempt);

  if (!href || !label) {
    return <span className="hist-action-empty">discarded</span>;
  }
  return (
    <>
      <Link className="hist-action-link" href={href}>
        {label} →
      </Link>
      {/* Only ever on an unfinished practice row — canDiscard mirrors the
          database function, so the button is never offered for something
          the database would then refuse. */}
      {canDiscard(row.attempt) && (
        <DiscardButton
          attemptId={row.attempt.attempt_id}
          sessionLabel={sittingSummary(row.attempt)}
        />
      )}
    </>
  );
}

function Chips<T extends string>({
  chips,
  active,
  query,
  param,
  label,
}: {
  chips: Array<{ id: T; label: string }>;
  active: T;
  query: HistoryQuery;
  param: 'type' | 'state';
  label: string;
}) {
  return (
    <div className="hist-seg" role="group" aria-label={label}>
      {chips.map((c) => (
        <Link
          key={c.id}
          href={hrefWith(query, { [param]: c.id } as Partial<HistoryQuery>)}
          className={c.id === active ? 'on' : undefined}
          aria-current={c.id === active ? 'true' : undefined}
        >
          {c.label}
        </Link>
      ))}
    </div>
  );
}

export function HistoryTable({
  page,
  query,
}: {
  page: HistoryPage;
  query: HistoryQuery;
}) {
  const { rows, total, pageSize, totalUnfiltered } = page;
  const first = total === 0 ? 0 : (page.page - 1) * pageSize + 1;
  const last = Math.min(page.page * pageSize, total);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const filtered =
    query.type !== 'all' || query.state !== 'all' || query.q.length > 0;

  return (
    <div className="hist-bank">
      <div className="hist-filter-row">
        <Chips
          chips={TYPE_CHIPS}
          active={query.type}
          query={query}
          param="type"
          label="Filter by type"
        />
        <Chips
          chips={STATE_CHIPS}
          active={query.state}
          query={query}
          param="state"
          label="Filter by state"
        />

        {/* A plain GET form: no JS needed, and the result is a normal URL.
            Hidden fields carry the chip selections through, or searching
            would silently clear them. */}
        <form className="hist-search-form" action="/student/bank/history">
          {query.type !== 'all' && (
            <input type="hidden" name="type" value={query.type} />
          )}
          {query.state !== 'all' && (
            <input type="hidden" name="state" value={query.state} />
          )}
          <input
            className="hist-search"
            type="search"
            name="q"
            defaultValue={query.q}
            placeholder="Search topic, tag, category…"
            aria-label="Search past sessions by topic, tag or category"
            maxLength={60}
          />
          <button className="hist-search-go" type="submit">
            Search
          </button>
        </form>
      </div>

      {/* The count line always names the true total, so the rows on screen
          can never be mistaken for the whole list — the mistake that had
          the dashboard reporting a 50-row query limit as a lifetime total. */}
      <p className="hist-count">
        {total === 0
          ? 'No matching sessions'
          : `Showing ${first}–${last} of ${total}`}
        {filtered && totalUnfiltered > total && (
          <>
            {' · '}
            <Link
              className="hist-clear"
              href={hrefWith(query, { type: 'all', state: 'all', q: '' })}
            >
              Clear filters
            </Link>
          </>
        )}
      </p>

      {rows.length === 0 ? (
        <div className="hist-empty">
          {totalUnfiltered === 0
            ? 'No sessions yet — your first quiz from the Question Bank will land here.'
            : 'Nothing matches those filters. Try widening them, or clear them to see everything.'}
        </div>
      ) : (
        <div className="hist-card">
          <table className="hist-table">
            <thead>
              <tr>
                <th>When</th>
                {/* The identifying column, so it gets first claim on the
                    width rather than whatever the nowrap columns leave. */}
                <th className="hist-col-session">Session</th>
                <th>Type</th>
                <th>Result</th>
                <th>Time</th>
                <th>State</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const a = row.attempt;
                const when = rowTimestamp(a);
                const duration = formatDuration(row.stats?.engagedSeconds ?? null);
                return (
                  <tr key={a.attempt_id}>
                    <td className="hist-when" data-label="When">
                      {when.prefix && (
                        <span className="hist-when-prefix">{when.prefix} </span>
                      )}
                      {formatRelativeDate(when.iso)}
                    </td>
                    <td className="hist-session" data-label="Session">
                      {sittingSummary(a)}
                    </td>
                    <td data-label="Type">
                      <span className="hist-pill hist-pill-source">
                        {sittingKindLabel(sittingKind(a))}
                      </span>
                      {/* A CAT's mode IS its type — printing both reads
                          "CAT · CAT". */}
                      {sittingKind(a) !== 'CAT' && (
                        <span className="hist-pill hist-pill-mode">
                          {a.mode_label}
                        </span>
                      )}
                    </td>
                    <td className="hist-result" data-label="Result">
                      <ResultCell row={row} />
                    </td>
                    <td className="hist-time" data-label="Time">
                      {duration ?? <span className="hist-result-none">—</span>}
                    </td>
                    <td data-label="State">
                      <span className={STATUS_PILL_CLASS[a.status]}>
                        {STATUS_LABEL[a.status] ?? a.status}
                      </span>
                    </td>
                    <td className="hist-action-cell">
                      <ActionCell row={row} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {lastPage > 1 && (
        <nav className="hist-pager" aria-label="History pages">
          {page.page > 1 ? (
            <Link
              className="hist-pager-link"
              href={hrefWith(query, { page: page.page - 1 })}
            >
              ← Newer
            </Link>
          ) : (
            <span className="hist-pager-link is-off">← Newer</span>
          )}
          <span className="hist-pager-at">
            Page {page.page} of {lastPage}
          </span>
          {page.page < lastPage ? (
            <Link
              className="hist-pager-link"
              href={hrefWith(query, { page: page.page + 1 })}
            >
              Older →
            </Link>
          ) : (
            <span className="hist-pager-link is-off">Older →</span>
          )}
        </nav>
      )}

      <p className="hist-note">
        <strong>Note.</strong> Unfinished sessions pick up where you left
        off. A practice quiz opens in review; a readiness pack opens its
        report and a CAT its result page. Time is only shown for sessions
        recorded after per-question timing was added.
      </p>
    </div>
  );
}
