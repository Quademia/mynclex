// mynclex/lib/bank/packs/detail-body.tsx
//
// Client host for the pack detail (Slice ②b): the detail header
// (title/meta + the "+ Add questions" button, per the CD prototype) +
// the two-column body + the picker slide-over. Exists because the
// header button and the member rows' ⊕ share one piece of state —
// where the picker inserts (null = append at the end).

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackMembersList } from './members-list';
import { PackBasicsCard } from './basics-card';
import { PackCompositionCard, PackPublishCard } from './composition-cards';
import { PackPicker, type PickerInsertAt } from './picker';
import type { PackRow, PackUnit } from './types';

export function PackDetailBody({
  pack,
  units,
  count,
  target,
}: {
  pack:   PackRow;
  units:  PackUnit[];
  count:  number;
  target: number;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [insertAt, setInsertAt] = useState<PickerInsertAt | null>(null);

  const openAtEnd = () => {
    setInsertAt(null);
    setPickerOpen(true);
  };
  const openAbove = (linkId: string, pos: number) => {
    setInsertAt({ linkId, pos });
    setPickerOpen(true);
  };

  return (
    <>
      <div className="rp-detail-head">
        <div className="rp-detail-head-main">
          <div className="rp-detail-title">
            <h2>{pack.title}</h2>
            <span className={`rp-status ${pack.status}`}>
              {pack.published ? 'published' : pack.status}
            </span>
          </div>
          <div className="rp-detail-meta">
            <span className="rp-mono">{pack.pack_id}</span>
            <span>{count} of {target} positions filled</span>
            <span>⏱ {formatTimeLimit(pack.time_limit_sec)}</span>
          </div>
        </div>
        <button type="button" className="rp-add-btn" onClick={openAtEnd}>
          + Add questions
        </button>
      </div>

      <div className="rp-detail-cols">
        <PackMembersList
          packId={pack.pack_id}
          units={units}
          count={count}
          target={target}
          onInsertAbove={openAbove}
          onAddQuestions={openAtEnd}
        />
        <aside className="rp-detail-side">
          <PackCompositionCard units={units} count={count} target={target} />
          <PackPublishCard pack={pack} units={units} count={count} target={target} />
          <PackBasicsCard pack={pack} memberCount={count} />
        </aside>
      </div>

      <PackPicker
        packId={pack.pack_id}
        packTitle={pack.title}
        open={pickerOpen}
        insertAt={insertAt}
        onSwitchToEnd={() => setInsertAt(null)}
        onClose={() => setPickerOpen(false)}
        onChanged={() => router.refresh()}
      />
    </>
  );
}

function formatTimeLimit(sec: number | null): string {
  if (!sec || sec <= 0) return 'No time limit set';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}
