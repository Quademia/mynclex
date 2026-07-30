// Your fix list — the shortest path from this report back into practice.
//
// Numbered rather than a row of equal cards: the order is the recommendation.
// Each build action opens the Builder with this sitting's content filters
// already set, and the questions served are FRESH — the pool is never carried
// across, which is the builder's own established rule.
//
// The list is deliberately short and can be empty. A sitting where everything
// was landed, or where no axis has three questions to judge from, gets no
// advice rather than manufactured advice — recommending study off a
// one-question sample is how a report loses a student's trust.

import Link from 'next/link';
import type { FixItem } from '@/lib/practice/report/derive';

export function FixList({ items }: { items: FixItem[] }) {
  if (items.length === 0) {
    return (
      <section className="bsr-card">
        <h2 className="bsr-card-h">Your fix list</h2>
        <p className="bsr-card-sub">
          Nothing stands out from this sitting — either you landed it, or it was
          too small a sample to call. Build a longer set to get a clearer read.
        </p>
      </section>
    );
  }

  return (
    <section className="bsr-card">
      <h2 className="bsr-card-h">Your fix list</h2>
      <p className="bsr-card-sub">
        {items.length === 1 ? 'One thing' : `${items.length} things`} worth doing
        next, in that order. Each build opens the Builder with the filters
        already set.
      </p>

      <ol className="bsr-fix">
        {items.map((item, i) => (
          <li key={item.kind + item.title}>
            <span className="bsr-fix-n" aria-hidden="true">
              {i + 1}
            </span>
            <div className="bsr-fix-body">
              <p className="bsr-fix-kind">{item.kind}</p>
              <p className="bsr-fix-title">{item.title}</p>
              <p className="bsr-fix-detail">{item.detail}</p>
            </div>
            <Link className="bsr-fix-action" href={item.href}>
              {item.actionLabel}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
