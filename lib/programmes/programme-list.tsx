// mynclex/lib/programmes/programme-list.tsx
//
// Client component — owns the "Show archived (N)" toggle state.
// Splits the server-supplied programmes into an active bank
// (DRAFT + PUBLISHED) and a hidden bank (ARCHIVED + CANCELLED).
// Hidden bank renders only when the toggle is on.

'use client';

import { useMemo, useState } from 'react';
import { ProgrammeCard } from './programme-card';
import type { ProgrammeListRow } from './types';

export function ProgrammeList({ programmes }: { programmes: ProgrammeListRow[] }) {
  const [showArchived, setShowArchived] = useState(false);

  const { active, hidden } = useMemo(() => {
    const active: ProgrammeListRow[] = [];
    const hidden: ProgrammeListRow[] = [];
    for (const p of programmes) {
      if (p.status === 'ARCHIVED' || p.status === 'CANCELLED') hidden.push(p);
      else active.push(p);
    }
    return { active, hidden };
  }, [programmes]);

  return (
    <>
      <div className="programmes-grid">
        {active.map((p) => (
          <ProgrammeCard key={p.programme_id} programme={p} />
        ))}
      </div>

      {hidden.length > 0 && (
        <>
          <button
            type="button"
            className="programmes-archived-toggle"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived
              ? `Hide archived (${hidden.length})`
              : `Show archived (${hidden.length})`}
          </button>

          {showArchived && (
            <div className="programmes-grid is-archived-bank">
              {hidden.map((p) => (
                <ProgrammeCard key={p.programme_id} programme={p} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
