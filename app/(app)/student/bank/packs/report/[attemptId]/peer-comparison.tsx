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

  const max = Math.max(1, ...peer.buckets.map((b) => b.count));
  return (
    <div className="rs-peer">
      <div className="rs-peer-line">
        You scored higher than <strong>{peer.yourPercentile}%</strong> of nurses who sat this pack.
      </div>
      <div className="rs-peer-hist">
        {peer.buckets.map((b, i) => {
          const isYou = peer.yourBucket === i + 1;
          return (
            <div key={i} className="rs-peer-col">
              <span className={`rs-peer-you${isYou ? ' is-shown' : ''}`}>YOU</span>
              <div
                className={`rs-peer-bar${isYou ? ' is-you' : ''}`}
                style={{ height: `${Math.max(3, Math.round((b.count / max) * 100))}%` }}
                title={`${b.lo}–${b.hi}%: ${b.count}`}
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
      <p className="rs-peer-foot">
        Each bar is a 10-point score bracket — yours in navy · {peer.n} nurses have sat this pack.
      </p>
    </div>
  );
}
