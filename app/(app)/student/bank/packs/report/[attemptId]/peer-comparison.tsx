'use client';

// mynclex/app/(app)/student/bank/packs/report/[attemptId]/peer-comparison.tsx
//
// "Peer comparison" (§11.5, Slice ⑥). Aggregate-only data from a SECURITY
// DEFINER RPC (a student can't read the pack cohort under RLS). Below the
// min-N threshold it renders a locked state; once unlocked it shows the
// caller's percentile + a 10-point score histogram with their bucket in navy.
// A pack is the fairest peer set — the identical 100 questions under identical
// conditions.

import type { PeerStats } from '@/lib/payments/readiness-report';

// A "nice" top gridline value at or just above the tallest bar's count, so
// the Y-axis reads in round numbers and every bar sits below the top tick
// (headroom for the on-bar count label).
function niceTop(m: number): number {
  if (m <= 5) return m + 1;
  if (m <= 10) return Math.ceil((m + 1) / 2) * 2;
  return Math.ceil((m + 1) / 5) * 5;
}

export default function PeerComparison({ peer }: { peer: PeerStats | null }) {
  if (!peer || !peer.unlocked) {
    return (
      <div className="rs-peer-locked">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div>
          <div className="rs-peer-locked-h">Your peer comparison is on its way</div>
          <p className="rs-peer-locked-p">
            We only show it once there&rsquo;s enough data behind it to be genuinely fair — so a
            handful of early results can&rsquo;t skew where you stand. It&rsquo;ll appear here
            automatically.
          </p>
        </div>
      </div>
    );
  }

  const maxCount = Math.max(1, ...peer.buckets.map((b) => b.count));
  const top = niceTop(maxCount);
  const midTick = Math.round(top / 2);
  return (
    <div className="rs-peer">
      <div className="rs-peer-line">
        You scored higher than <strong>{peer.yourPercentile}%</strong> of nurses who sat this pack.
      </div>
      <div className="rs-peer-chart">
        {/* Y-axis: nurse-count scale, so bar heights read as real numbers. */}
        <div className="rs-peer-yaxis" aria-hidden>
          <span className="rs-peer-ytick">{top}</span>
          <span className="rs-peer-ytick">{midTick}</span>
          <span className="rs-peer-ytick">0</span>
        </div>
        <div className="rs-peer-plot">
          <div className="rs-peer-hist">
            {peer.buckets.map((b, i) => {
              const isYou = peer.yourBucket === i + 1;
              return (
                <div key={i} className="rs-peer-col">
                  <span className={`rs-peer-you${isYou ? ' is-shown' : ''}`}>YOU</span>
                  <span className="rs-peer-count">{b.count > 0 ? b.count : ''}</span>
                  <div
                    className={`rs-peer-bar${isYou ? ' is-you' : ''}`}
                    style={{ height: b.count > 0 ? `${Math.max(4, (b.count / top) * 100)}%` : '0' }}
                    title={`${b.lo}–${b.hi}%: ${b.count} nurse${b.count === 1 ? '' : 's'}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="rs-peer-axis">
            {peer.buckets.map((b, i) => (
              <span key={i} className="rs-peer-tick">
                {i % 2 === 0 ? b.lo : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="rs-peer-foot">
        Bar height = nurses in each 10-point bracket, yours in navy.
      </p>
    </div>
  );
}
