'use client';

// mynclex/app/(app)/student/bank/packs/report/[attemptId]/report-view.tsx
//
// The readiness results report — client shell (§11.5, step 3, Slice ①).
// Rebuilt in our tokens from the CD "v3 Responsive" prototype
// (concept-not-source): a verdict rail (desktop) / top block (mobile) + a
// single-open accordion. Slice ① fills the verdict hero + the three
// readings (outcomes + points) + the review section; the middle sections
// are labelled "coming" rows the later slices replace.
//
// Responsive is CSS (@media in readiness-student.css), per CLAUDE.md UI #3 —
// only the genuinely interactive bits live here: the count-up + ring/marker
// reveal-on-mount, the sticky mini-verdict scroll listener, and the
// accordion toggle + scroll-into-view. All entrance keyframes are CSS and
// honour prefers-reduced-motion.

import { useEffect, useRef, useState } from 'react';
import type { ReadinessReport } from '@/lib/payments/readiness-report';
import { weakestSubcategory, nextMoves } from '@/lib/payments/readiness-breakdowns';
import WhereToFocus from './where-to-focus';
import NextMoves from './next-moves';
import TrendPacing from './trend-pacing';

type SectionKey = 'results' | 'focus' | 'moves' | 'insights' | 'map' | 'review';

interface SectionMeta {
  title: string;
  sub: string;
  summary: string;
  summaryTone?: 'ok' | 'muted' | 'danger';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function daysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt) - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Count a number up from 0 to target once, on mount (cubic ease-out). */
function useCountUp(target: number, run: boolean, dur = 950): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    if (!run || prefersReducedMotion()) {
      // Defer out of the effect body (avoids a synchronous cascading render).
      raf = requestAnimationFrame(() => setN(target));
      return () => cancelAnimationFrame(raf);
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setN(Math.round(target * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, dur]);
  return n;
}

// ── module-level presentational components (not defined during render) ──

function ComingSoon({ what }: { what: string }) {
  return (
    <div className="rs-rep-soon">
      <div className="rs-rep-soon-title">{what} is on its way</div>
      <p>
        This part of your report arrives in an upcoming update. Everything above is saved
        permanently.
      </p>
    </div>
  );
}

function AccordionSection({
  sectionKey,
  meta,
  open,
  onToggle,
  children,
}: {
  sectionKey: SectionKey;
  meta: SectionMeta;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const toneClass =
    meta.summaryTone === 'muted'
      ? ' is-muted'
      : meta.summaryTone === 'ok'
        ? ' is-ok'
        : meta.summaryTone === 'danger'
          ? ' is-danger'
          : '';
  return (
    <div className={`rs-rep-sec${open ? ' is-open' : ''}`} data-sec={sectionKey}>
      <button type="button" className="rs-rep-sec-head" onClick={onToggle}>
        <svg className="rs-rep-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path
            d="M3 1.5l4 3.5-4 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="rs-rep-sec-head-txt">
          <span className="rs-rep-sec-title">{meta.title}</span>
          <span className="rs-rep-sec-sub">{meta.sub}</span>
        </span>
        <span className={`rs-rep-sec-summary${toneClass}`}>{meta.summary}</span>
      </button>
      {open && <div className="rs-rep-sec-body">{children}</div>}
    </div>
  );
}

export default function ReadinessReportView({ report }: { report: ReadinessReport }) {
  const { pct, band, outcomes, points, packTitle, satDate, reviewOpen, expiresAt, attemptId } =
    report;

  const [mounted, setMounted] = useState(false);
  const [pastVerdict, setPastVerdict] = useState(false);
  const [openSec, setOpenSec] = useState<SectionKey | ''>('results');

  const verdictRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  // Reveal-on-mount drives the ring draw, marker slide, and count-ups.
  // Double-rAF so the initial (unrevealed) frame paints before we flip —
  // and so setState isn't called synchronously in the effect body.
  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Sticky mini-verdict: show once the verdict card has scrolled off (mobile
  // only — the bar itself is display:none above 768px in CSS). Uses an
  // IntersectionObserver rather than a scroll listener because the app shell
  // scrolls an inner container (.product-content), not window — a window
  // scroll listener never fires there.
  useEffect(() => {
    const el = verdictRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setPastVerdict(!entry.isIntersecting), {
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const count = useCountUp(pct ?? 0, mounted && pct !== null);
  const dl = daysLeft(expiresAt);
  const weakest = weakestSubcategory(report.items);
  const nm = nextMoves(report.items);
  const trend = report.trend;
  const trendCurIdx = trend.length ? Math.max(1, trend.findIndex((t) => t.isCurrent)) : 0;
  const trendDelta =
    trend.length >= 2 ? (trend[trendCurIdx]?.pct ?? trend[trend.length - 1].pct) - trend[trendCurIdx - 1].pct : null;

  const openSection = (k: SectionKey) => {
    const opening = openSec !== k;
    setOpenSec(opening ? k : '');
    if (opening) {
      window.setTimeout(() => {
        const el = mainRef.current?.querySelector<HTMLElement>(`[data-sec="${k}"]`);
        if (!el) return;
        const top = el.getBoundingClientRect().top;
        const offset = window.innerWidth < 768 ? 60 : 12;
        if (top < offset || top > window.innerHeight - 120) {
          window.scrollTo({ top: top + window.scrollY - offset, behavior: 'smooth' });
        }
      }, 120);
    }
  };

  // ── verdict ring geometry ──────────────────────────────────────────
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  const dash = ((pct ?? 0) / 100) * CIRC;

  // The ring arc adopts the band's tone so the ring, chip and strip read as
  // one verdict (solid tone, not the pale strip colour, to stay legible).
  const RING_COLOR: Record<string, string> = {
    danger: 'var(--danger)',
    warn: 'var(--warning)',
    ok: 'var(--accent)',
    strong: 'var(--success)',
  };
  const ringColor = band ? RING_COLOR[band.tone] : 'var(--accent)';

  // ── outcomes + points bar segments (percent of the whole) ──────────
  const oTotal = Math.max(1, outcomes.total);
  const segFull = (outcomes.full / oTotal) * 100;
  const segPartial = (outcomes.partial / oTotal) * 100;
  const segWrong = (outcomes.wrong / oTotal) * 100;
  const foundW = points.total > 0 ? (points.found / points.total) * 100 : 0;

  const navDefs: { key: SectionKey; label: string }[] = [
    { key: 'results', label: 'Your results' },
    { key: 'focus', label: 'Where to focus' },
    { key: 'moves', label: 'Your next moves' },
    { key: 'insights', label: 'Trend & pacing' },
    { key: 'map', label: 'Per-question map' },
    { key: 'review', label: 'Review window' },
  ];

  const sectionMeta: Record<SectionKey, SectionMeta> = {
    results: {
      title: 'Your results, three ways',
      sub: 'Question outcomes · answer points · peer comparison',
      summary: `${outcomes.full} fully correct`,
    },
    focus: {
      title: 'Where to focus',
      sub: 'Client needs · body system · difficulty · clinical judgment',
      summary: weakest ? `Weakest: ${weakest}` : 'Your remediation map',
      summaryTone: weakest ? 'danger' : 'muted',
    },
    moves: {
      title: 'Your next moves',
      sub: 'Remediation · quick wins · strengths',
      summary:
        nm.moves.length > 0
          ? `${nm.moves.length} to work on${nm.oneAway > 0 ? ` · ${nm.oneAway} quick win${nm.oneAway === 1 ? '' : 's'}` : ''}`
          : 'On track',
      summaryTone: nm.moves.length > 0 ? undefined : 'ok',
    },
    insights: {
      title: 'Trend & pacing',
      sub: 'Across packs · time per question',
      summary:
        trendDelta === null
          ? 'First sitting'
          : `${trendDelta > 0 ? `▲ +${trendDelta}` : trendDelta < 0 ? `▼ ${trendDelta}` : '±0'} pts since last`,
      summaryTone: trendDelta === null ? 'muted' : trendDelta >= 0 ? 'ok' : 'danger',
    },
    map: {
      title: 'Per-question map',
      sub: 'All 100 questions · filters · second-guessing',
      summary: 'Coming next',
      summaryTone: 'muted',
    },
    review: {
      title: 'Review window & your permanent result',
      sub: '21-day answer review · report stays forever',
      summary: reviewOpen && dl !== null ? `${dl} days left` : 'Review closed',
      summaryTone: reviewOpen ? 'ok' : 'muted',
    },
  };

  return (
    <div className="rs-rep">
      {/* sticky mini-verdict (mobile only) */}
      <div className={`rs-rep-mini${pastVerdict ? ' is-shown' : ''}`} aria-hidden={!pastVerdict}>
        {pct !== null && (
          <>
            <span className="rs-rep-mini-pct">{pct}%</span>
            {band && <span className={`rs-band rs-band-${band.tone}`}>{band.label}</span>}
          </>
        )}
        <span className="rs-rep-mini-pack">{packTitle}</span>
      </div>

      <div className="rs-rep-shell">
        {/* ── rail (desktop) / top block (mobile) ── */}
        <aside className="rs-rep-rail">
          <a className="rs-report-back" href="/student/bank/packs">
            ← Back to packs
          </a>

          <div className="rs-rep-verdict" ref={verdictRef}>
            <div className="rs-rep-verdict-head">
              {packTitle}
              {satDate && <> · {fmtDate(satDate)}</>}
            </div>

            <div className="rs-rep-ringrow">
              <div className="rs-rep-ring">
                <svg viewBox="0 0 120 120" width="120" height="120">
                  <circle cx="60" cy="60" r={R} fill="none" stroke="var(--bg-soft)" strokeWidth="12" />
                  {pct !== null && (
                    <circle
                      className="rs-rep-ring-prog"
                      cx="60"
                      cy="60"
                      r={R}
                      fill="none"
                      stroke={ringColor}
                      strokeWidth="12"
                      strokeLinecap="round"
                      transform="rotate(-90 60 60)"
                      style={{
                        strokeDasharray: CIRC,
                        strokeDashoffset: mounted ? CIRC - dash : CIRC,
                        transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.7,.3,1)',
                      }}
                    />
                  )}
                </svg>
                <div className="rs-rep-ring-num">
                  {pct !== null ? (
                    <>
                      <span className="rs-rep-ring-pct">{count}%</span>
                      <span className="rs-rep-ring-label">MEASURED</span>
                    </>
                  ) : (
                    <span className="rs-rep-ring-unavail">—</span>
                  )}
                </div>
              </div>

              <div className="rs-rep-verdict-side">
                {band && <span className={`rs-band rs-band-${band.tone}`}>{band.label}</span>}
                <p className="rs-rep-measured">
                  A <strong>measured</strong> score on the same fixed exam every taker answers — a
                  yardstick, not a prediction.
                </p>
              </div>
            </div>

            {/* band strip */}
            {pct !== null && (
              <div className="rs-rep-strip">
                <div className="rs-rep-strip-marker" style={{ left: mounted ? `${pct}%` : '50%' }}>
                  YOU
                  <svg width="12" height="7" viewBox="0 0 12 7" aria-hidden>
                    <path d="M6 7 0 0h12z" fill="var(--primary)" />
                  </svg>
                </div>
                <div className="rs-rep-strip-track">
                  <span style={{ width: '60%', background: '#fecaca' }} />
                  <span style={{ width: '15%', background: '#fde68a' }} />
                  <span style={{ width: '10%', background: '#a7d8cf' }} />
                  <span style={{ width: '15%', background: '#bbf7d0' }} />
                </div>
                <div className="rs-rep-strip-labels">
                  <span>Building</span>
                  <span className="rs-rep-strip-lr">Excelling</span>
                </div>
              </div>
            )}
          </div>

          <div className="rs-rep-stats">
            <div className="rs-rep-stat">
              <span>Fully correct</span>
              <strong>
                {outcomes.full} of {outcomes.total}
              </strong>
            </div>
            <div className="rs-rep-stat">
              <span>Answer-points found</span>
              <strong>
                {points.found} of {points.total}
              </strong>
            </div>
          </div>

          <nav className="rs-rep-nav">
            {navDefs.map((n) => (
              <button
                key={n.key}
                type="button"
                className={`rs-rep-nav-item${openSec === n.key ? ' is-active' : ''}`}
                onClick={() => openSection(n.key)}
              >
                {n.label}
              </button>
            ))}
          </nav>

          <div className={`rs-rep-reviewcard${reviewOpen ? ' is-open' : ''}`}>
            <div className="rs-rep-reviewcard-title">
              {reviewOpen && dl !== null
                ? `Review open · ${dl} day${dl === 1 ? '' : 's'} left`
                : 'Review closed'}
            </div>
            <div className="rs-rep-reviewcard-sub">
              {expiresAt
                ? reviewOpen
                  ? `Until ${fmtDate(expiresAt)}`
                  : `Closed ${fmtDate(expiresAt)}`
                : 'Your score stays on record'}
            </div>
          </div>
        </aside>

        {/* ── accordion ── */}
        <div className="rs-rep-main" ref={mainRef}>
          <AccordionSection
            sectionKey="results"
            meta={sectionMeta.results}
            open={openSec === 'results'}
            onToggle={() => openSection('results')}
          >
            <div className="rs-rep-readings">
              {/* Question outcomes */}
              <div className="rs-rep-reading">
                <div className="rs-rep-reading-h">Question outcomes</div>
                <div className="rs-rep-reading-sub">
                  How many of the {outcomes.total} you truly nailed
                </div>
                <div className="rs-rep-bar">
                  <span className="rs-rep-seg rs-seg-full" style={{ width: `${segFull}%` }} />
                  <span className="rs-rep-seg rs-seg-partial" style={{ width: `${segPartial}%` }} />
                  <span className="rs-rep-seg rs-seg-wrong" style={{ width: `${segWrong}%` }} />
                </div>
                <ul className="rs-rep-legend">
                  <li>
                    <span className="rs-dot rs-dot-full" />
                    <span>Fully correct</span>
                    <strong>{outcomes.full}</strong>
                  </li>
                  <li>
                    <span className="rs-dot rs-dot-partial" />
                    <span>Partially correct</span>
                    <strong>{outcomes.partial}</strong>
                  </li>
                  <li>
                    <span className="rs-dot rs-dot-wrong" />
                    <span>All wrong or skipped</span>
                    <strong>{outcomes.wrong}</strong>
                  </li>
                </ul>
                <p className="rs-rep-foot">
                  A 3-of-4 SATA feeds your % but isn&rsquo;t <em>fully</em> correct — this tells you
                  how many you completely landed.
                </p>
              </div>

              {/* Points */}
              <div className="rs-rep-reading">
                <div className="rs-rep-reading-h">Points — what you caught</div>
                <div className="rs-rep-reading-sub">
                  {points.total} scoreable answer-points across {outcomes.total} questions
                </div>
                <div className="rs-rep-bar">
                  <span className="rs-rep-seg rs-seg-full" style={{ width: `${foundW}%` }} />
                  <span className="rs-rep-seg rs-seg-missed" style={{ width: `${100 - foundW}%` }} />
                </div>
                <div className="rs-rep-points">
                  <div>
                    <div className="rs-rep-point-num rs-num-found">{points.found}</div>
                    <div className="rs-rep-point-lab">correct answers found</div>
                  </div>
                  <div>
                    <div className="rs-rep-point-num rs-num-missed">{points.missed}</div>
                    <div className="rs-rep-point-lab">answers missed</div>
                  </div>
                  <div>
                    <div className="rs-rep-point-num rs-num-wrong">{points.wrongPicked}</div>
                    <div className="rs-rep-point-lab">wrong picks (−1 each)</div>
                  </div>
                </div>
                <p className="rs-rep-foot">
                  Counts of what you caught on selection questions — deliberately not a grade. Your
                  verdict is the % above.
                </p>
              </div>
            </div>

            {/* Peer comparison — its own slice; placeholder keeps the shape. */}
            <div className="rs-rep-peer-soon">
              <div className="rs-rep-reading-h">Peer comparison</div>
              <p className="rs-rep-foot">
                How you compare to other nurses who sat this pack arrives in an upcoming update.
              </p>
            </div>
          </AccordionSection>

          <AccordionSection
            sectionKey="focus"
            meta={sectionMeta.focus}
            open={openSec === 'focus'}
            onToggle={() => openSection('focus')}
          >
            <WhereToFocus items={report.items} />
          </AccordionSection>

          <AccordionSection
            sectionKey="moves"
            meta={sectionMeta.moves}
            open={openSec === 'moves'}
            onToggle={() => openSection('moves')}
          >
            <NextMoves items={report.items} reviewOpen={reviewOpen} attemptId={attemptId} />
          </AccordionSection>

          <AccordionSection
            sectionKey="insights"
            meta={sectionMeta.insights}
            open={openSec === 'insights'}
            onToggle={() => openSection('insights')}
          >
            <TrendPacing trend={report.trend} />
          </AccordionSection>

          <AccordionSection
            sectionKey="map"
            meta={sectionMeta.map}
            open={openSec === 'map'}
            onToggle={() => openSection('map')}
          >
            <ComingSoon what="Your per-question map" />
          </AccordionSection>

          <AccordionSection
            sectionKey="review"
            meta={sectionMeta.review}
            open={openSec === 'review'}
            onToggle={() => openSection('review')}
          >
            <div className="rs-rep-review-grid">
              <div>
                <div className="rs-rep-review-h">Learn from every question — for 21 days</div>
                {reviewOpen ? (
                  <>
                    <p className="rs-rep-foot">
                      Work through all your questions, your answers, the correct answers and the
                      rationales while your window is open.
                    </p>
                    <a className="rs-btn rs-btn-navy" href={`/session/${attemptId}`}>
                      Review all answers &amp; rationales
                    </a>
                    {expiresAt && (
                      <div className="rs-rep-review-note">
                        Open until <strong>{fmtDate(expiresAt)}</strong>
                        {dl !== null && <> · {dl} days left</>}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="rs-rep-foot">
                      Your 21-day answer-review window has closed — the questions are a reserved
                      asset, so they&rsquo;re sealed again. Everything above is yours to keep.
                    </p>
                    <button type="button" className="rs-btn rs-btn-ghost" disabled>
                      Review closed
                    </button>
                    {expiresAt && (
                      <div className="rs-rep-review-note">
                        Review closed on <strong>{fmtDate(expiresAt)}</strong>.
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="rs-rep-permanent">
                <div className="rs-rep-permanent-h">Your result is permanent</div>
                <p>
                  Your score, band and every breakdown stay in your history <strong>forever</strong>{' '}
                  and keep feeding your Readiness Signal. You can&rsquo;t retake this pack into a
                  better number — that&rsquo;s what makes the score mean something.
                </p>
              </div>
            </div>
          </AccordionSection>
        </div>
      </div>
    </div>
  );
}
