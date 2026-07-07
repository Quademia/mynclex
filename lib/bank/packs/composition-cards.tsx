// mynclex/lib/bank/packs/composition-cards.tsx
//
// The pack detail sidebar's Composition + Publishing cards (Slice ③),
// from the CD "Readiness Packs Admin" prototype (concept-not-source).
// Composition (fill · mix vs the §5 guideline · the blueprint meter
// vs the published NCLEX ranges) is guidance-only and never blocks;
// Publishing carries the completeness-gated toggle, the checklist,
// and the "Publish all N & publish pack" helper. The gate is also
// re-computed server-side in the actions (layered enforcement).

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { InfoToast } from '@/lib/toast/info-toast';
import {
  publishAllAndPublishPackAction,
  setPackPublishedAction,
} from './actions';
import {
  computeBlueprint,
  computeGate,
  computeMix,
} from './composition';
import type { PackRow, PackUnit } from './types';

// The CD's bar scale: the blueprint bar spans 0–25% of items, so 1
// percentage point = 4% of the bar width.
const BP_BAR_SCALE = 4;
const BP_BAR_CAP = 25;

export function PackCompositionCard({
  units,
  count,
  target,
}: {
  units:  PackUnit[];
  count:  number;
  target: number;
}) {
  const mixRows = computeMix(units, count);
  const bpRows = computeBlueprint(units);
  const fillPct = target > 0 ? Math.min(100, (count / target) * 100) : 0;

  return (
    <section className="rp-card rp-side-card">
      <div className="rp-side-card-head">
        <h3>Composition</h3>
        <span className="rp-dim">guidance — never blocks</span>
      </div>

      <div className="rp-meter-block">
        <div className="rp-meter-title-row">
          <span className="rp-meter-title">Fill</span>
          <span className="rp-meter-strong">
            {count} <span className="rp-dim">/ {target}</span>
          </span>
        </div>
        <div className="rp-fill-bar">
          <span style={{ width: `${fillPct}%` }} />
        </div>
      </div>

      <div className="rp-meter-block">
        <span className="rp-meter-title">
          Mix <span className="rp-dim">vs guideline per {target}</span>
        </span>
        {mixRows.map((m) => (
          <div key={m.label} className="rp-mix-row">
            <span className={`rp-mix-dot ${m.tone}`} />
            <span className="rp-mix-label">{m.label}</span>
            <span className="rp-mix-val">{m.value}</span>
            <span className="rp-mix-guide">{m.guide}</span>
          </div>
        ))}
      </div>

      <div className="rp-meter-block">
        <span className="rp-meter-title">
          Blueprint <span className="rp-dim">Client Needs vs NCLEX ranges</span>
        </span>
        {bpRows.map((b) => (
          <div key={b.label} className="rp-bp-row">
            <span className="rp-bp-label">{b.label}</span>
            <div className="rp-bp-bar">
              <span
                className="rp-bp-band"
                style={{
                  left: `${b.lo * BP_BAR_SCALE}%`,
                  width: `${(b.hi - b.lo) * BP_BAR_SCALE}%`,
                }}
              />
              <span
                className={`rp-bp-fill ${b.tone}`}
                style={{ width: `${Math.min(b.pct, BP_BAR_CAP) * BP_BAR_SCALE}%` }}
              />
            </div>
            <span className={`rp-bp-pct ${b.tone}`}>
              {b.tone === 'empty' ? '—' : `${Math.round(b.pct)}%`}{' '}
              <span className="rp-bp-range">{b.lo}–{b.hi}</span>
            </span>
          </div>
        ))}
        <p className="rp-meter-note">
          Shaded band = published exam range. This advises — it never blocks
          publishing.
        </p>
      </div>
    </section>
  );
}

export function PackPublishCard({
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const gate = computeGate(pack, units, count, target);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? 'Something went wrong.');
        return;
      }
      setNotice(msg);
      router.refresh();
    });
  };

  const stateLabel = pack.published
    ? 'Published — on sale & claimable'
    : gate.ok
      ? 'Draft — ready to publish'
      : 'Draft — not ready yet';

  const toggle = () => {
    if (pack.published) {
      run(
        () => setPackPublishedAction(pack.pack_id, false),
        'Pack unpublished — new sales and claims stop. Students who already own it keep full access.',
      );
      return;
    }
    if (!gate.ok) {
      const n = gate.rows.filter((r) => !r.ok).length;
      setError(
        `${n} item${n === 1 ? '' : 's'} to finish before this pack can go on sale — see the checklist.`,
      );
      return;
    }
    run(
      () => setPackPublishedAction(pack.pack_id, true),
      'Pack published — it is now on sale and claimable.',
    );
  };

  return (
    <section className="rp-card rp-side-card">
      <div className="rp-side-card-head">
        <div className="rp-pub-state">
          <h3>Publishing</h3>
          <span
            className={`rp-pub-state-label ${pack.published ? 'live' : gate.ok ? 'ready' : 'blocked'}`}
          >
            {stateLabel}
          </span>
        </div>
        <button
          type="button"
          className={`rp-pub-toggle ${pack.published ? 'on' : ''}`}
          title={
            pack.published
              ? 'Unpublish (stops new sales only)'
              : gate.ok
                ? 'Publish this pack'
                : 'Finish the checklist to publish'
          }
          disabled={pending}
          onClick={toggle}
        >
          <span className="rp-pub-knob" />
        </button>
      </div>

      <div className="rp-gate-rows">
        {gate.rows.map((r) => (
          <div key={r.label} className="rp-gate-row">
            <span className={`rp-gate-icon ${r.ok ? 'ok' : 'todo'}`}>
              {r.ok ? '✓' : '·'}
            </span>
            <span className={`rp-gate-label ${r.ok ? '' : 'todo'}`}>{r.label}</span>
          </div>
        ))}
      </div>

      {!pack.published && gate.helperOnly && (
        <button
          type="button"
          className="rp-add-btn"
          disabled={pending}
          onClick={() =>
            run(
              () => publishAllAndPublishPackAction(pack.pack_id),
              `Published ${gate.unpubQ.length} member question${gate.unpubQ.length === 1 ? '' : 's'}, then the pack — it is now on sale.`,
            )
          }
        >
          Publish all {gate.unpubQ.length} &amp; publish pack
        </button>
      )}

      <p className="rp-meter-note">
        {pack.published
          ? 'Unpublishing stops new sales and claims only — students who already own this pack keep full access, always.'
          : 'Publishing puts the pack on sale. The checklist gates the toggle, never your drafting.'}
      </p>

      <ErrorToast error={error} onDismiss={() => setError(null)} />
      <InfoToast message={notice} onDismiss={() => setNotice(null)} />
    </section>
  );
}
