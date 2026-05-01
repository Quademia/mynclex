// mynclex/lib/authoring/bank-counts.tsx
//
// Composition-counts strip shown above the filter bar — four chips
// (Total / Standalone / Case-linked / Trend-linked) as filtered/total.
//
// "Filtered" applies non-membership filters only (search/type/category/
// difficulty/status). The membership filter is excluded from these
// counts so all four chips stay informative even when the curator
// picks a membership — they tell you what each bucket would be like
// without the membership clamp.
//
// Reuses the .bank-counts-row, .bank-count-item, .bank-count-label,
// .bank-count-value CSS classes from styles/dashboards.css.

import type { ReactNode } from 'react';

export interface BankCompositionCounts {
  total:       { filtered: number; total: number };
  standalone:  { filtered: number; total: number };
  caseLinked:  { filtered: number; total: number };
  trendLinked: { filtered: number; total: number };
}

export function BankCounts({ counts }: { counts: BankCompositionCounts }) {
  return (
    <div className="bank-counts-row">
      <CountItem label="Total"        bucket={counts.total} />
      <CountItem label="Standalone"   bucket={counts.standalone} />
      <CountItem label="Case-linked"  bucket={counts.caseLinked} />
      <CountItem label="Trend-linked" bucket={counts.trendLinked} />
    </div>
  );
}

function CountItem({
  label,
  bucket,
}: {
  label: ReactNode;
  bucket: { filtered: number; total: number };
}) {
  return (
    <span className="bank-count-item">
      <span className="bank-count-label">{label}</span>
      <span className="bank-count-value">
        {bucket.filtered}/{bucket.total}
      </span>
    </span>
  );
}
