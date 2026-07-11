'use client';

// mynclex/app/(app)/student/bank/packs/report/[attemptId]/trend-pacing.tsx
//
// "Trend & pacing" (§11.5, Slice ④). Trend is built fully — a cross-pack
// sparkline of this student's readiness sittings (each pack is a comparable
// measure of the same exam standard), with a first-sitting empty state.
// Pacing is a placeholder until the per-question time engine lands (a
// separate runner arc that also serves CAT).

import type { TrendPoint } from '@/lib/payments/readiness-report';

const W = 220;
const H = 60;
const PAD = 10;

function sparkPath(pcts: number[]): { line: string; dots: { x: number; y: number }[] } {
  const n = pcts.length;
  const dots = pcts.map((p, i) => ({
    x: PAD + (n === 1 ? (W - 2 * PAD) / 2 : (i / (n - 1)) * (W - 2 * PAD)),
    y: PAD + (1 - Math.max(0, Math.min(100, p)) / 100) * (H - 2 * PAD),
  }));
  const line = dots.map((d, i) => `${i === 0 ? 'M' : 'L'} ${d.x.toFixed(1)} ${d.y.toFixed(1)}`).join(' ');
  return { line, dots };
}

function TrendCard({ trend }: { trend: TrendPoint[] }) {
  if (trend.length < 2) {
    return (
      <div className="rs-tp-card">
        <div className="rs-rep-reading-h">Readiness trend</div>
        <div className="rs-tp-empty">
          <div className="rs-tp-empty-h">This is your first yardstick</div>
          <p>
            Your trend appears when you sit another pack — each one is a fresh, comparable measure
            of the same exam.
          </p>
          <svg viewBox={`0 0 ${W} ${H}`} className="rs-tp-spark" aria-hidden>
            <line
              x1={PAD}
              y1={H / 2}
              x2={W - PAD}
              y2={H / 2}
              stroke="var(--border-strong)"
              strokeWidth="2"
              strokeDasharray="4 5"
            />
            <circle cx={PAD} cy={H / 2} r="4" fill="var(--accent)" />
            <circle cx={W - PAD} cy={H / 2} r="4" fill="none" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="2 2" />
          </svg>
        </div>
      </div>
    );
  }

  const currentIdx = Math.max(1, trend.findIndex((t) => t.isCurrent));
  const current = trend[currentIdx] ?? trend[trend.length - 1];
  const prev = trend[currentIdx - 1];
  const delta = current.pct - prev.pct;
  const deltaTone = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const { line, dots } = sparkPath(trend.map((t) => t.pct));

  return (
    <div className="rs-tp-card">
      <div className="rs-rep-reading-h">Readiness trend</div>
      <div className="rs-tp-trend-row">
        <div>
          <div className={`rs-tp-delta rs-tp-${deltaTone}`}>
            {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '±0'} pts
          </div>
          <div className="rs-tp-delta-sub">since {prev.packTitle}</div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="rs-tp-spark" aria-hidden>
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {dots.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={i === currentIdx ? 5 : 3.5}
              fill={i === currentIdx ? 'var(--primary)' : 'var(--accent)'}
              stroke="var(--white)"
              strokeWidth="2"
            />
          ))}
        </svg>
      </div>
      <div className="rs-tp-trend-foot">
        {trend.length} sittings · {trend[0].pct}% → {current.pct}%
      </div>
      <a className="rs-tp-link" href="/student/bank/packs">
        Full trajectory on your packs →
      </a>
    </div>
  );
}

export default function TrendPacing({ trend }: { trend: TrendPoint[] }) {
  return (
    <div className="rs-tp-grid">
      <TrendCard trend={trend} />
      <div className="rs-tp-card">
        <div className="rs-rep-reading-h">Pacing</div>
        <div className="rs-tp-soon">
          <p>
            Your pace per question — and where you rushed — arrives once per-question timing is
            captured. Your score and breakdowns above are complete.
          </p>
        </div>
      </div>
    </div>
  );
}
