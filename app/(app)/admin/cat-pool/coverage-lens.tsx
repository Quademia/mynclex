'use client';

// mynclex/app/(app)/admin/cat-pool/coverage-lens.tsx
//
// The Coverage lens. Client-side only because of the Set ⟷ Calibrated toggle —
// both spreads are computed on the server and handed over, so switching is a
// re-render, not a fetch.

import { useState } from 'react';
import type { SpreadRow, BlueprintRow, StatCard, SupplyRow, SpreadMode } from '@/lib/bank/cat-pool/coverage';

export function CoverageLens({
  statCards,
  setSpread,
  calibratedSpread,
  blueprintRows,
  supplyRows,
  calibratedCount,
}: {
  statCards: StatCard[];
  setSpread: SpreadRow[];
  calibratedSpread: SpreadRow[];
  blueprintRows: BlueprintRow[];
  supplyRows: SupplyRow[];
  calibratedCount: number;
}) {
  const [mode, setMode] = useState<SpreadMode>('set');
  const rows = mode === 'set' ? setSpread : calibratedSpread;

  return (
    <>
      <div className="cp-stats">
        {statCards.map((s) => (
          <div key={s.key} className="cp-stat">
            <div className="cp-stat-label">{s.label}</div>
            <div className="cp-stat-value">
              <span className="cp-stat-num">{s.value.toLocaleString()}</span>
              <span className="cp-stat-target">/ {s.target.toLocaleString()}</span>
            </div>
            <div className="cp-bar">
              <span
                className={`cp-bar-fill${s.met ? ' is-met' : ''}`}
                style={{ width: `${s.barPct}%` }}
              />
            </div>
            <div className="cp-stat-note">{s.note}</div>
          </div>
        ))}
      </div>

      <div className="cp-row">
        <section className="cp-card">
          <div className="cp-card-head">
            <h3>Difficulty spread</h3>
            <div className="cp-card-head-right">
              <span className="cp-subhead">
                {mode === 'set'
                  ? 'as set by curators'
                  : `${calibratedCount.toLocaleString()} measured`}
              </span>
              <div className="cp-toggle" role="group" aria-label="Difficulty source">
                <button
                  type="button"
                  onClick={() => setMode('set')}
                  aria-pressed={mode === 'set'}
                  className={mode === 'set' ? 'is-on' : ''}
                >
                  Set
                </button>
                <button
                  type="button"
                  onClick={() => setMode('calibrated')}
                  aria-pressed={mode === 'calibrated'}
                  className={mode === 'calibrated' ? 'is-on' : ''}
                >
                  Calibrated
                </button>
              </div>
            </div>
          </div>

          <div className="cp-meter-list">
            {rows.map((d) => (
              <div key={d.band} className="cp-meter cp-meter--spread">
                <span className="cp-meter-label">{d.band}</span>
                <div className="cp-track">
                  <span
                    className={`cp-track-fill${d.thin ? ' is-thin' : ''}${
                      mode === 'calibrated' ? ' is-calibrated' : ''
                    }`}
                    style={{ width: `${d.barPct}%` }}
                  />
                  <span className="cp-track-marker" style={{ left: `${d.markerPct}%` }} />
                </div>
                <span className={`cp-meter-value${d.thin ? ' is-thin' : ''}`}>
                  {d.count.toLocaleString()} <span className="cp-meter-gap">{d.gapLabel}</span>
                </span>
              </div>
            ))}
          </div>

          <p className="cp-note">
            {mode === 'set'
              ? 'The marker is an even fifth of the standalone target. A band well short of it runs out first for students who settle there.'
              : 'Bands derived from the measured difficulty, for the items recalibration has actually scored. Everything else is still a curator seed.'}
          </p>
        </section>

        <section className="cp-card">
          <div className="cp-card-head">
            <h3>Blueprint coverage</h3>
            <span className="cp-subhead">Client Needs vs NCLEX ranges</span>
          </div>

          <div className="cp-meter-list">
            {blueprintRows.map((b) => (
              <div key={b.subcategory} className="cp-meter cp-meter--bp">
                <span className="cp-meter-label" title={b.subcategory}>{b.label}</span>
                <div className="cp-track">
                  <span
                    className="cp-track-band"
                    style={{ left: `${b.bandLeft}%`, width: `${b.bandWidth}%` }}
                  />
                  <span
                    className={`cp-track-fill${b.inRange ? '' : ' is-thin'}`}
                    style={{ width: `${b.fillWidth}%` }}
                  />
                </div>
                <span className={`cp-meter-value${b.inRange ? '' : ' is-thin'}`}>
                  {b.pct}% <span className="cp-meter-gap">{b.rangeLabel}</span>
                </span>
              </div>
            ))}
          </div>

          <p className="cp-note">
            Shaded band = published exam range. Advisory — the pool is adaptive, so balance is
            a supply question, not a per-sitting one.
          </p>
        </section>
      </div>

      <section className="cp-card">
        <div className="cp-card-head">
          <h3>Wrapper supply</h3>
          <span className="cp-subhead">children inherit their wrapper&rsquo;s reservation</span>
        </div>
        <div className="cp-supply">
          {supplyRows.map((w) => (
            <div key={w.key} className="cp-supply-row">
              <span className={`cp-dot is-${w.tone}`} />
              <span className="cp-supply-label">{w.label}</span>
              <span className="cp-supply-value">{w.value}</span>
              <span className="cp-supply-guide">{w.guide}</span>
            </div>
          ))}
        </div>
        <p className="cp-note">
          A sitting takes 3 cases and about 2 trends. Reserving a wrapper reserves every child
          question with it — never tick children individually.
        </p>
      </section>
    </>
  );
}
