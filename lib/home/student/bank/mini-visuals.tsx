// mynclex/lib/home/student/bank/mini-visuals.tsx
//
// The four signal-card visuals. Each is a preview of the real thing on
// the surface it links to, drawn at roughly 86px tall.
//
// The trajectory is the one that needed judgement. Sam's instruction
// was to adopt the CAT report's own ability-trajectory graph, and this
// draws the SAME data through the SAME derivation (trajectoryPoints —
// including the one-question shift that is the whole trick). What it
// drops is the shaded 95% confidence band: at this width the band, the
// trace and the dashed standard line collapse into a green smudge, and
// the dashed line is the one element that carries the meaning. The band
// returns in full on the report, where there is room to read it.

import { CONFIDENCE_Z } from '@/lib/cat';
import type { TrajectoryPoint } from '@/lib/practice/cat/report-derive';
import type { PeerStats } from '@/lib/payments/readiness-report';

// ── Ring ──────────────────────────────────────────────────────

const R = 30;
const CIRC = 2 * Math.PI * R;

export function Ring({
  percent,
  tone,
  label,
}: {
  percent: number;
  tone: 'accent' | 'primary';
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <svg className="bd-ring" viewBox="0 0 76 76" role="img" aria-label={label}>
      <circle cx="38" cy="38" r={R} fill="none" stroke="var(--bg-soft)" strokeWidth="8" />
      <circle
        cx="38"
        cy="38"
        r={R}
        fill="none"
        stroke={tone === 'accent' ? 'var(--accent)' : 'var(--primary)'}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={CIRC}
        strokeDashoffset={CIRC * (1 - pct / 100)}
        transform="rotate(-90 38 38)"
      />
    </svg>
  );
}

// ── Peer histogram ────────────────────────────────────────────

export function MiniHistogram({ peer }: { peer: PeerStats }) {
  const max = Math.max(1, ...peer.buckets.map((b) => b.count));
  return (
    <div
      className="bd-hist"
      role="img"
      aria-label={
        peer.yourPercentile !== null
          ? `Score distribution across ${peer.n} takers; you scored above ${peer.yourPercentile}% of them.`
          : `Score distribution across ${peer.n} takers.`
      }
    >
      {peer.buckets.map((b, i) => {
        const mine = peer.yourBucket === i + 1;
        return (
          <span
            key={`${b.lo}-${b.hi}`}
            className={`bd-hist-bar${mine ? ' is-mine' : ''}`}
            style={{ height: `${Math.max(6, (b.count / max) * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

// ── Mini trajectory ───────────────────────────────────────────

const VIEW_W = 150;
const VIEW_H = 62;
const PAD = 4;
const MIN_DOMAIN = 1.4;
const MAX_DOMAIN = 2.6;

export function MiniTrajectory({
  points,
  passed,
}: {
  points: TrajectoryPoint[];
  passed: boolean;
}) {
  if (points.length === 0) return null;

  const n = points.length;
  // Same domain clamp as the full chart, so the mini and the real one
  // don't disagree about how dramatic a trace looks.
  const spread = Math.max(
    MIN_DOMAIN,
    ...points.map((p) => Math.abs(p.theta) + CONFIDENCE_Z * p.se * 0.45),
  );
  const domain = Math.min(spread, MAX_DOMAIN);

  const x = (i: number) => PAD + (n > 1 ? i / (n - 1) : 0.5) * (VIEW_W - PAD * 2);
  const y = (t: number) => {
    const clamped = Math.max(-domain, Math.min(domain, t));
    return PAD + ((domain - clamped) / (2 * domain)) * (VIEW_H - PAD * 2);
  };

  const line = points.map((p, i) => `${x(i)},${y(p.theta)}`).join(' ');
  const zeroY = y(0);
  const stroke = passed ? 'var(--success)' : 'var(--danger)';

  return (
    <svg
      className="bd-traj"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Ability across ${n} questions, ending ${passed ? 'above' : 'below'} the passing standard.`}
    >
      {/* The passing standard — kept, and kept visible. It is the only
          element on this chart that carries the meaning. */}
      <line
        x1={PAD}
        y1={zeroY}
        x2={VIEW_W - PAD}
        y2={zeroY}
        stroke="var(--primary)"
        strokeWidth={1.2}
        strokeDasharray="4 3"
        opacity={0.6}
      />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth={2.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Where it ended up — the point the verdict is about. */}
      <circle cx={x(n - 1)} cy={y(points[n - 1].theta)} r={3.2} fill={stroke} stroke="#fff" strokeWidth={1.2} />
    </svg>
  );
}
