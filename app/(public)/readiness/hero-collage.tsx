'use client';

// mynclex/app/(public)/readiness/hero-collage.tsx
//
// The floating SAMPLE report collage in the dark hero. The verdict card
// CYCLES through the four bands (matching the CD design) so the hero shows
// off the whole scale; the peer and trend chips are static. All sample
// data — no queries, no effect on anything.

import { useEffect, useState } from 'react';
import {
  SAMPLE_SCORES, VERDICT_RING_R, VERDICT_RING_C, VERDICT_CYCLE_MS,
  bandForPct, pointsForPct,
} from './sample-verdict';

export function HeroCollage() {
  const [mounted, setMounted] = useState(false);
  const [idx, setIdx] = useState(2); // start at 79% (Ready)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = reduce
      ? undefined
      : setInterval(() => setIdx((i) => (i + 1) % SAMPLE_SCORES.length), VERDICT_CYCLE_MS);
    return () => {
      cancelAnimationFrame(raf);
      if (t) clearInterval(t);
    };
  }, []);

  const pct = SAMPLE_SCORES[idx];
  const band = bandForPct(pct);
  const ringStyle = {
    strokeDasharray: VERDICT_RING_C,
    strokeDashoffset: mounted ? VERDICT_RING_C - (pct / 100) * VERDICT_RING_C : VERDICT_RING_C,
    transition: 'stroke-dashoffset 1s cubic-bezier(.2,.7,.3,1)',
  } as const;

  return (
    <div className="rpc-collage" aria-hidden="true">
      <div className="rpc-glass">
        <div className="rpc-glass-head">
          <span className="k">Your verdict</span>
          <span className="rpc-sample-pill">SAMPLE</span>
        </div>
        <div className="rpc-glass-verdict">
          <div className="rpc-ring-wrap">
            <svg width="104" height="104" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={VERDICT_RING_R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="12" />
              <circle
                cx="60" cy="60" r={VERDICT_RING_R} fill="none" stroke="#7fc4b9" strokeWidth="12"
                strokeLinecap="round" transform="rotate(-90 60 60)" style={ringStyle}
              />
            </svg>
            <div className="rpc-ring-mid">
              <span className="rpc-ring-pct">{pct}%</span>
              <span className="rpc-ring-cap">MEASURED</span>
            </div>
          </div>
          <div>
            <span className="rpc-band-chip" style={{ background: band.bg, color: band.fg }}>{band.label}</span>
            <div className="rpc-points">{pointsForPct(pct)} · fixed 100-question form</div>
          </div>
        </div>
        <div className="rpc-strip-wrap">
          <div className="rpc-you" style={{ left: `${mounted ? pct : 50}%`, transition: 'left 1s cubic-bezier(.2,.7,.3,1)' }}>
            <span>YOU</span>
            <svg width="10" height="6" viewBox="0 0 12 7"><path d="M6 7 0 0h12z" /></svg>
          </div>
          <div className="rpc-strip">
            <div className="s1" /><div className="s2" /><div className="s3" /><div className="s4" />
          </div>
          <div className="rpc-strip-keys"><span>Building</span><span>Excelling</span></div>
        </div>
      </div>

      <div className="rpc-chip rpc-chip-peer">
        <div className="k">PEER COMPARISON</div>
        <div className="v">Beat 72% of nurses</div>
      </div>

      <div className="rpc-chip rpc-chip-trend">
        <div>
          <div className="k">TREND</div>
          <div className="v">▲ +8 pts</div>
        </div>
        <svg viewBox="0 0 220 60" style={{ width: 110, height: 44 }}>
          <path d="M 12 46 L 110 30 L 208 14" fill="none" stroke="#2d7d72" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="46" r="3.5" fill="#2d7d72" stroke="#fff" strokeWidth="2" />
          <circle cx="110" cy="30" r="3.5" fill="#2d7d72" stroke="#fff" strokeWidth="2" />
          <circle cx="208" cy="14" r="5" fill="#1e3a5f" stroke="#fff" strokeWidth="2" />
        </svg>
      </div>
    </div>
  );
}
