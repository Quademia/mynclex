// Where you slipped — the same sitting cut four ways.
//
// The only CLIENT component on the report: switching axis is a view change,
// not a data change, so all four breakdowns are computed on the server and
// handed down as plain numbers. That keeps the switch instant (no round trip)
// and — deliberately — keeps the frozen answer KEYS the split was derived from
// out of the browser bundle entirely.
//
// Weakest value first, because the reason to open this card is to find what to
// work on. The caveat is not decoration: with 25 questions spread across five
// categories these are samples of three or four, and the design's own wording
// called them pointers rather than measurements.

'use client';

import { useState } from 'react';
import { AXIS_LABEL, type AxisKey, type AxisRow } from '@/lib/practice/report/derive';

const ORDER: AxisKey[] = ['client_needs', 'subject', 'difficulty', 'question_type'];

export function WhereYouSlipped({ axes }: { axes: Record<AxisKey, AxisRow[]> }) {
  // Open on the first axis that actually has rows: a sitting built entirely
  // from one subject has nothing to say on the subject axis, and landing on an
  // empty pane reads as broken.
  const firstWithRows = ORDER.find((a) => axes[a].length > 0) ?? 'client_needs';
  const [axis, setAxis] = useState<AxisKey>(firstWithRows);
  const rows = axes[axis];

  return (
    <section className="bsr-card">
      <div className="bsr-card-head">
        <div>
          <h2 className="bsr-card-h">Where you slipped</h2>
          <p className="bsr-card-sub">Weakest first, within what you built</p>
        </div>
        <div className="bsr-tabs" role="tablist" aria-label="Breakdown axis">
          {ORDER.map((a) => (
            <button
              key={a}
              type="button"
              role="tab"
              aria-selected={a === axis}
              className={a === axis ? 'on' : undefined}
              onClick={() => setAxis(a)}
              disabled={axes[a].length === 0}
              title={axes[a].length === 0 ? 'Nothing in this sitting carries this axis' : undefined}
            >
              {AXIS_LABEL[a]}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="bsr-foot">Nothing in this sitting carries this axis.</p>
      ) : (
        <ul className="bsr-axis">
          {rows.map((r) => (
            <li key={r.value}>
              <div className="bsr-axis-top">
                <span className="bsr-axis-name">{r.value}</span>
                <span className="bsr-axis-n">
                  {r.full} of {r.total} · {r.pct}%
                </span>
              </div>
              <div className="bsr-axis-track">
                <span
                  className={`bsr-axis-fill ${
                    r.pct >= 75 ? 'is-ok' : r.pct >= 50 ? 'is-warn' : 'is-bad'
                  }`}
                  style={{ width: `${r.pct}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="bsr-foot">
        Partial credit counts here the same way it counts toward your
        percentage. These are small samples — pointers, not measurements.
      </p>
    </section>
  );
}
