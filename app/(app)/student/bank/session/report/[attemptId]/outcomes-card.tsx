// Question outcomes — how many of the sitting's questions were completely
// landed, partly landed, or not landed at all.
//
// Three buckets, not two, because partial credit is real: a 3-of-4 SATA feeds
// the percentage above without being a question the student can do. Collapsing
// it into "correct" would make the report flatter than the truth, and
// collapsing it into "wrong" would hide the cheapest marks to convert.
//
// Skipped questions are merged into the last bucket to match the design, but
// the per-question table (slice 3) keeps them distinct — a skipped question
// isn't a wrong one.

import type { OutcomeCounts } from '@/lib/practice/report/derive';

export function OutcomesCard({ counts }: { counts: OutcomeCounts }) {
  const rows = [
    { key: 'full', label: 'Fully correct', n: counts.full, tone: 'ok' },
    { key: 'partial', label: 'Partially correct', n: counts.partial, tone: 'warn' },
    { key: 'none', label: 'All wrong or skipped', n: counts.wrongOrSkipped, tone: 'bad' },
  ];

  return (
    <section className="bsr-card">
      <h2 className="bsr-card-h">Question outcomes</h2>
      <p className="bsr-card-sub">
        How many of the {counts.total} you completely landed
      </p>

      <div className="bsr-bar" role="img" aria-label={`${counts.full} fully correct, ${counts.partial} partially correct, ${counts.wrongOrSkipped} wrong or skipped, of ${counts.total}`}>
        {rows.map((r) =>
          r.n > 0 ? (
            <span
              key={r.key}
              className={`bsr-bar-seg bsr-bar-${r.tone}`}
              style={{ flexGrow: r.n }}
            />
          ) : null,
        )}
      </div>

      <ul className="bsr-legend">
        {rows.map((r) => (
          <li key={r.key}>
            <span className={`bsr-dot bsr-dot-${r.tone}`} aria-hidden="true" />
            <span className="bsr-legend-label">{r.label}</span>
            <span className="bsr-legend-n">{r.n}</span>
          </li>
        ))}
      </ul>

      {counts.partial > 0 && (
        <p className="bsr-foot">
          A 3-of-4 SATA feeds your percentage but isn&apos;t <em>fully</em>{' '}
          correct — the same distinction the pack report makes.
        </p>
      )}
    </section>
  );
}
