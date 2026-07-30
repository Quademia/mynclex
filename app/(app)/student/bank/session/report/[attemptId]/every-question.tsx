// Every question — the sitting, question by question, in the order it was sat.
//
// A client island for two reasons only: the outcome filter and the show-more
// disclosure. Every row is computed on the server, so the frozen answer keys
// the outcomes were derived from never enter the browser bundle.
//
// Deliberately absent: the design's "Marked" filter chip. Nothing in the
// product writes a mark — zero rows, no write path anywhere — so the chip
// would always read "Marked 0". It returns when marking is built.
//
// Responsive is CSS (session-report.css): at ≤768px the table reflows into one
// card per question with the stem on its own line and a full-width review
// action, rather than a six-column table squeezed into 375px.

'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { QuestionRow } from '@/lib/practice/report/derive';
import type { ChangeReading } from '@/lib/practice/report/derive';
import type { QuestionOutcome } from '@/lib/practice/report/types';
import { formatDuration } from '@/lib/practice/history/format';

type Filter = 'all' | 'wrong' | 'partial' | 'blank';

const OUTCOME_LABEL: Record<QuestionOutcome, string> = {
  FULL: 'Correct',
  PARTIAL: 'Partial',
  NONE: 'Wrong',
  NOT_ANSWERED: 'Not answered',
};

const OUTCOME_TONE: Record<QuestionOutcome, string> = {
  FULL: 'ok',
  PARTIAL: 'warn',
  NONE: 'bad',
  // Grey, never red. Not answering is the absence of a result, not a bad one —
  // the same rule the History row follows.
  NOT_ANSWERED: 'muted',
};

/** How many rows show before the disclosure. Enough to see the shape of the
 *  sitting without a 25-row table pushing the fix list off the screen. */
const INITIAL_ROWS = 8;

export function EveryQuestion({
  rows,
  changes,
}: {
  rows: QuestionRow[];
  changes: ChangeReading;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState(false);

  const counts = useMemo(
    () => ({
      all: rows.length,
      wrong: rows.filter((r) => r.outcome === 'NONE').length,
      partial: rows.filter((r) => r.outcome === 'PARTIAL').length,
      blank: rows.filter((r) => r.outcome === 'NOT_ANSWERED').length,
    }),
    [rows],
  );

  const matching = useMemo(() => {
    switch (filter) {
      case 'wrong': return rows.filter((r) => r.outcome === 'NONE');
      case 'partial': return rows.filter((r) => r.outcome === 'PARTIAL');
      case 'blank': return rows.filter((r) => r.outcome === 'NOT_ANSWERED');
      default: return rows;
    }
  }, [rows, filter]);

  const visible = expanded ? matching : matching.slice(0, INITIAL_ROWS);
  const hidden = matching.length - visible.length;

  const chips: Array<{ id: Filter; label: string; n: number }> = [
    { id: 'all', label: 'All', n: counts.all },
    { id: 'wrong', label: 'Wrong', n: counts.wrong },
    { id: 'partial', label: 'Partial', n: counts.partial },
    { id: 'blank', label: 'Not answered', n: counts.blank },
  ];

  return (
    <section className="bsr-card">
      <div className="bsr-card-head">
        <div>
          <h2 className="bsr-card-h">Every question</h2>
          <p className="bsr-card-sub">
            In the order you sat them. Outcome, time, and whether you changed
            your mind.
          </p>
        </div>
        <div className="bsr-tabs" role="group" aria-label="Filter questions">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              className={c.id === filter ? 'on' : undefined}
              onClick={() => setFilter(c.id)}
              // A chip matching nothing is shown but unavailable, so the
              // student can see the count is zero rather than wonder.
              disabled={c.n === 0 && c.id !== 'all'}
              aria-pressed={c.id === filter}
            >
              {c.label} {c.n}
            </button>
          ))}
        </div>
      </div>

      {matching.length === 0 ? (
        <p className="bsr-foot">Nothing in this sitting matches that filter.</p>
      ) : (
        <table className="bsr-qtable">
          <thead>
            <tr>
              <th>#</th>
              <th>Question</th>
              <th>Subject</th>
              <th>Outcome</th>
              <th>Time</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.position}>
                <td className="bsr-q-n" data-label="#">{r.position}</td>
                <td className="bsr-q-stem" data-label="Question">
                  {/* The clamp lives on this inner span, not on the cell:
                      `display: -webkit-box` on a <td> replaces its table-cell
                      display and the clamp stops working cleanly — it left a
                      sliver of a cut third line on screen. */}
                  <span className="bsr-q-stem-text">
                    {r.stem || <span className="bsr-result-none">No stem recorded</span>}
                  </span>
                  {r.changes > 0 && (
                    <span
                      className="bsr-q-changed"
                      title={`You changed this answer ${r.changes === 1 ? 'once' : `${r.changes} times`}`}
                    >
                      changed
                    </span>
                  )}
                </td>
                <td className="bsr-q-subject" data-label="Subject">
                  {r.subject ?? '—'}
                </td>
                <td data-label="Outcome">
                  <span className={`bsr-pill bsr-pill-${OUTCOME_TONE[r.outcome]}`}>
                    {OUTCOME_LABEL[r.outcome]}
                  </span>
                </td>
                <td className="bsr-q-time" data-label="Time">
                  {formatDuration(r.timeSpentSec) ?? (
                    <span className="bsr-result-none">—</span>
                  )}
                </td>
                <td className="bsr-q-action">
                  <Link className="bsr-q-review" href={r.href}>
                    Review →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {hidden > 0 && (
        <button
          type="button"
          className="bsr-more"
          onClick={() => setExpanded(true)}
        >
          Show the other {hidden} →
        </button>
      )}

      {/* ⭐ The reading no other surface offers. Only stated when there is
          something to state, and the second clause only when we could
          actually determine a direction. */}
      {changes.changed > 0 && (
        <p className="bsr-foot">
          You changed{' '}
          {changes.changed === 1 ? 'one answer' : `${changes.changed} answers`}{' '}
          before submitting
          {changes.costly > 0 && (
            <>
              {' '}— {changes.costly} of {changes.changed === 1 ? 'them' : 'those'} moved
              away from the right answer
            </>
          )}
          .
        </p>
      )}
    </section>
  );
}
