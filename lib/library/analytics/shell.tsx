// mynclex/lib/library/analytics/shell.tsx
//
// Light chrome for the standalone "Question analytics" surface (slice
// 11.11c). A back-to-library link + the reading-lens legend in a slim
// left rail — so the analytics reads as part of the library without
// dragging in the note-organising lens sidebar. Reused by the Overview
// and (later) the per-note drill-in.
//
// The outer app chrome (global tutor sidebar + topbar) comes from
// /tutor/library/layout.tsx; this is the in-page rail beneath it.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { TIER_LABEL, TIER_ORDER } from './types';

export function EmbedAnalyticsShell({ children }: { children: ReactNode }) {
  return (
    <div className="eqa-shell">
      <aside className="eqa-side" aria-label="Question analytics">
        <Link href="/tutor/library" className="eqa-side-back">
          ← Library
        </Link>
        <div className="eqa-side-section">
          <div className="eqa-side-label">Reading lens</div>
          {TIER_ORDER.map((t) => (
            <span key={t} className="eqa-side-legend">
              <span className="eqa-swatch" data-tier={t} aria-hidden="true" />
              {TIER_LABEL[t]}
            </span>
          ))}
        </div>
      </aside>
      <main className="eqa-main">{children}</main>
    </div>
  );
}
