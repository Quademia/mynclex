'use client';

// mynclex/app/(public)/readiness/report-showcase.tsx
//
// "What you get back" — the four interactive feature demos of the results
// report: (01) the measured verdict, (02) the four-axis focus map, (03) the
// per-question map, (04) trend + pacing. Client-only because it's live:
// the verdict cycles through the four bands, and the axis tabs / map
// filters respond to taps.
//
// EVERYTHING HERE IS SAMPLE DATA — invented, internally consistent, and
// labelled SAMPLE. No queries, no props, no effect on anything. It mirrors
// what readiness-packs.md §11.5 settled the real report shows; it will need
// re-syncing if that design moves.

import { useEffect, useMemo, useState } from 'react';
import {
  SAMPLE_SCORES, VERDICT_RING_R, VERDICT_RING_C, VERDICT_CYCLE_MS,
  bandForPct, pointsForPct,
} from './sample-verdict';

type Axis = 'needs' | 'systems' | 'difficulty' | 'cjmm';
type MapFilter = 'all' | 'full' | 'partial' | 'wrong' | 'changed';

const AXES: Record<Axis, { name: string; got: number; total: number }[]> = {
  needs: [
    { name: 'Management of Care', got: 12, total: 14 },
    { name: 'Pharmacological & Parenteral Therapies', got: 13, total: 18 },
    { name: 'Safety & Infection Control', got: 7, total: 9 },
    { name: 'Health Promotion & Maintenance', got: 7, total: 9 },
    { name: 'Psychosocial Integrity', got: 5, total: 8 },
    { name: 'Reduction of Risk Potential', got: 12, total: 18 },
    { name: 'Physiological Adaptation', got: 9, total: 16 },
  ],
  systems: [
    { name: 'Cardiovascular', got: 9, total: 12 },
    { name: 'Respiratory', got: 7, total: 10 },
    { name: 'Neurological', got: 6, total: 9 },
    { name: 'Gastrointestinal', got: 8, total: 11 },
    { name: 'Renal & urinary', got: 5, total: 9 },
    { name: 'Endocrine', got: 6, total: 8 },
    { name: 'Hearing & vision', got: 2, total: 3 },
  ],
  difficulty: [
    { name: 'Easy', got: 30, total: 34 },
    { name: 'Medium', got: 27, total: 41 },
    { name: 'Hard', got: 12, total: 25 },
  ],
  cjmm: [
    { name: 'Recognize cues', got: 8, total: 10 },
    { name: 'Analyze cues', got: 6, total: 9 },
    { name: 'Prioritize hypotheses', got: 5, total: 8 },
    { name: 'Generate solutions', got: 6, total: 8 },
    { name: 'Take actions', got: 7, total: 10 },
    { name: 'Evaluate outcomes', got: 4, total: 7 },
  ],
};
const FOOT: Record<Axis, string> = {
  needs: 'The NCLEX client-needs blueprint — in your real report each category drills into subcategories and exact topics to review.',
  systems: 'Weakest first. Thin slices always show the raw count (e.g. “2 of 3”) — never a stretched percentage.',
  difficulty: 'How you held up as the questions got harder.',
  cjmm: 'The NGN clinical-judgment steps — your case-study questions carry these.',
};
const TABS: { k: Axis; label: string }[] = [
  { k: 'needs', label: 'Client needs' },
  { k: 'systems', label: 'Body system' },
  { k: 'difficulty', label: 'Difficulty' },
  { k: 'cjmm', label: 'Clinical judgment' },
];

/** Deterministic outcome layout for the 100-cell map (seeded shuffle, so
 *  it never flickers between renders). */
function buildCells() {
  const arr: string[] = [];
  for (let i = 0; i < 64; i++) arr.push('full');
  for (let i = 0; i < 17; i++) arr.push('partial');
  for (let i = 0; i < 19; i++) arr.push('wrong');
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const changed = new Set([7, 18, 33, 41, 62, 78, 91]);
  return arr.map((outcome, i) => ({ outcome, changed: changed.has(i) }));
}

export function ReportShowcase() {
  const [mounted, setMounted] = useState(false);
  const [scoreIdx, setScoreIdx] = useState(2); // start at 79% (Ready)
  const [axis, setAxis] = useState<Axis>('needs');
  const [filter, setFilter] = useState<MapFilter>('all');

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = reduce
      ? undefined
      : setInterval(() => setScoreIdx((i) => (i + 1) % SAMPLE_SCORES.length), VERDICT_CYCLE_MS);
    return () => {
      cancelAnimationFrame(raf);
      if (t) clearInterval(t);
    };
  }, []);

  const pct = SAMPLE_SCORES[scoreIdx];
  const band = bandForPct(pct);
  const pointsLine = pointsForPct(pct);
  const ringStyle = {
    strokeDasharray: VERDICT_RING_C,
    strokeDashoffset: mounted ? VERDICT_RING_C - (pct / 100) * VERDICT_RING_C : VERDICT_RING_C,
    transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.7,.3,1)',
  } as const;
  const youLeft = mounted ? pct : 50;

  const cells = useMemo(() => buildCells(), []);
  const counts = useMemo(
    () => ({
      all: 100,
      full: cells.filter((c) => c.outcome === 'full').length,
      partial: cells.filter((c) => c.outcome === 'partial').length,
      wrong: cells.filter((c) => c.outcome === 'wrong').length,
      changed: cells.filter((c) => c.changed).length,
    }),
    [cells],
  );
  const mapChips: { k: MapFilter; label: string }[] = [
    { k: 'all', label: `All · ${counts.all}` },
    { k: 'full', label: `Correct · ${counts.full}` },
    { k: 'partial', label: `Partial · ${counts.partial}` },
    { k: 'wrong', label: `Wrong · ${counts.wrong}` },
    { k: 'changed', label: `Changed · ${counts.changed}` },
  ];

  // trend sparkline
  const trend = [62, 71, 79];
  const W = 220, H = 60, PAD = 12;
  const dots = trend.map((p, i) => ({
    x: PAD + (i / (trend.length - 1)) * (W - 2 * PAD),
    y: PAD + (1 - p / 100) * (H - 2 * PAD),
    last: i === trend.length - 1,
  }));
  const trendPath = dots.map((d, i) => `${i === 0 ? 'M' : 'L'} ${d.x.toFixed(1)} ${d.y.toFixed(1)}`).join(' ');

  return (
    <section className="rpc-features">
      <div className="rpc-inner">
        <div className="rpc-feat-intro rpc-reveal">
          <div className="rpc-eyebrow">What you get back</div>
          <h2>
            Not a number.<br />
            A <span className="rpc-serif">full diagnosis.</span>
          </h2>
          <p>
            Every sitting returns your measured score and band, a four-axis remediation map, a
            per-question map of all 100 questions, your cross-pack trend and pacing — and the moves
            to make next.
          </p>
        </div>

        {/* 01 — verdict */}
        <div className="rpc-feat-row rpc-reveal">
          <div className="rpc-feat-copy">
            <div className="rpc-feat-num">01</div>
            <div className="rpc-kicker">THE VERDICT</div>
            <h3>A measured score and a band, on a fixed yardstick</h3>
            <p>
              Every nurse answers the same fixed 100-question form, so your percentage is a real
              yardstick — not a prediction. Partial credit on NGN items is already in the maths, and
              your band tells you where that lands you: Building, Approaching, Ready, or Excelling.
            </p>
          </div>
          <div className="rpc-card rpc-feat-card">
            <div className="rpc-vcard">
              <div className="rpc-ring-wrap">
                <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r={VERDICT_RING_R} fill="none" stroke="#eef0f3" strokeWidth="12" />
                  <circle
                    cx="60" cy="60" r={VERDICT_RING_R} fill="none" stroke={band.ring} strokeWidth="12"
                    strokeLinecap="round" transform="rotate(-90 60 60)" style={ringStyle}
                  />
                </svg>
                <div className="rpc-ring-mid">
                  <span className="rpc-ring-pct">{pct}%</span>
                  <span className="rpc-ring-cap">MEASURED</span>
                </div>
              </div>
              <div className="rpc-side">
                <span className="rpc-band-chip" style={{ background: band.bg, color: band.fg }}>
                  {band.label}
                </span>
                <div className="rpc-points">{pointsLine} earned</div>
                <div className="rpc-strip-wrap">
                  <div className="rpc-you" style={{ left: `${youLeft}%` }}>
                    <span>YOU</span>
                    <svg width="10" height="6" viewBox="0 0 12 7" aria-hidden="true">
                      <path d="M6 7 0 0h12z" />
                    </svg>
                  </div>
                  <div className="rpc-strip">
                    <div className="s1" /><div className="s2" /><div className="s3" /><div className="s4" />
                  </div>
                  <div className="rpc-strip-keys"><span>Building</span><span>Excelling</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 02 — where to focus */}
        <div className="rpc-feat-row rev rpc-reveal">
          <div className="rpc-card rpc-feat-card">
            <div className="rpc-tabs">
              {TABS.map((t) => (
                <button
                  key={t.k}
                  type="button"
                  className={`rpc-tab${axis === t.k ? ' on' : ''}`}
                  onClick={() => setAxis(t.k)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="rpc-bars">
              {AXES[axis].map((r) => {
                const frac = r.got / r.total;
                const p = Math.round(frac * 100);
                const thin = r.total <= 3;
                const tone = thin ? 'thin' : frac < 0.6 ? 'bad' : frac < 0.8 ? 'mid' : 'good';
                return (
                  <div key={r.name}>
                    <div className="rpc-bar-head">
                      <span className="rpc-bar-name">{r.name}</span>
                      <span className={`rpc-bar-val ${tone}`}>
                        {thin ? `${r.got} of ${r.total}` : `${r.got} of ${r.total} · ${p}%`}
                      </span>
                    </div>
                    <div className="rpc-bar-track">
                      <div className={`rpc-bar-fill ${tone}`} style={{ width: `${mounted ? Math.max(3, p) : 0}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="rpc-card-foot">{FOOT[axis]}</p>
          </div>
          <div className="rpc-feat-copy">
            <div className="rpc-feat-num">02</div>
            <div className="rpc-kicker">WHERE TO FOCUS</div>
            <h3>Your remediation map, on four axes</h3>
            <p>
              Client needs, body system, difficulty and NGN clinical judgment — try the tabs. In
              your real report the client-needs axis drills two levels deep, down to the exact topics
              to review, with one-tap practice links into the bank.
            </p>
          </div>
        </div>

        {/* 03 — per-question map */}
        <div className="rpc-feat-row rpc-reveal">
          <div className="rpc-feat-copy">
            <div className="rpc-feat-num">03</div>
            <div className="rpc-kicker">EVERY QUESTION, MAPPED</div>
            <h3>All 100 questions, cell by cell</h3>
            <p>
              Filter by outcome, spot your second-guessing (changed answers carry a white dot — you
              changed 7, three of them right→wrong), and tap any cell for its category, difficulty,
              time spent and a jump into review.
            </p>
          </div>
          <div className="rpc-card rpc-feat-card">
            <div className="rpc-chips">
              {mapChips.map((ch) => (
                <button
                  key={ch.k}
                  type="button"
                  className={`rpc-mapchip${filter === ch.k ? ' on' : ''}`}
                  onClick={() => setFilter(ch.k)}
                >
                  {ch.label}
                </button>
              ))}
            </div>
            <div className="rpc-grid">
              {cells.map((c, i) => {
                const match = filter === 'all' || (filter === 'changed' ? c.changed : c.outcome === filter);
                return (
                  <div key={i} className={`rpc-cell ${c.outcome}${match ? '' : ' dim'}`} title={`Q${i + 1}`}>
                    {i + 1}
                    {c.changed && <span className="rpc-cell-dot" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 04 — trend + pacing */}
        <div className="rpc-feat-row rev rpc-reveal">
          <div className="rpc-mini-stack">
            <div className="rpc-card rpc-mini">
              <div className="k">Readiness trend</div>
              <div className="rpc-trend-row">
                <div>
                  <div className="rpc-trend-big">▲ +8 pts</div>
                  <div className="rpc-trend-sub">since Pack 1</div>
                </div>
                <svg viewBox="0 0 220 60" style={{ flex: 1, minWidth: 0, height: 58 }} aria-hidden="true">
                  <path d={trendPath} fill="none" stroke="#2d7d72" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  {dots.map((d, i) => (
                    <circle key={i} cx={d.x} cy={d.y} r={d.last ? 5 : 3.5} fill={d.last ? '#1e3a5f' : '#2d7d72'} stroke="#fff" strokeWidth="2" />
                  ))}
                </svg>
              </div>
            </div>
            <div className="rpc-card rpc-mini">
              <div className="k">Pacing</div>
              <div className="rpc-pace-line">
                <span className="rpc-pace-big">1m 41s</span>
                <span className="rpc-pace-sub">average per answered question · 31m to spare</span>
              </div>
              <div className="rpc-pace-bars">
                <div className="rpc-pace-bar">
                  <span className="lbl">You</span>
                  <span className="track"><span className="fill you" style={{ width: '84%' }} /></span>
                </div>
                <div className="rpc-pace-bar">
                  <span className="lbl mute">Exam pace</span>
                  <span className="track"><span className="fill exam" style={{ width: '100%' }} /></span>
                </div>
              </div>
            </div>
          </div>
          <div className="rpc-feat-copy">
            <div className="rpc-feat-num">04</div>
            <div className="rpc-kicker">TREND &amp; PACING</div>
            <h3>Watch yourself trend up, at exam pace</h3>
            <p>
              Each pack is a fresh, comparable measure of the same standard — so sittings chart a
              real trajectory. Pacing shows your average per question against the exam budget, with
              rushed questions flagged on the map.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
