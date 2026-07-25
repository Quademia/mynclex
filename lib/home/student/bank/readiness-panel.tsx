// mynclex/lib/home/student/bank/readiness-panel.tsx
//
// Card 8 — the exam-readiness panel. Four cards across: three result
// signals plus the evidence gate, under a band headline.
//
// The gate card is deliberately NOT marked ✓/✗ like the other three:
// it isn't a result you can pass or fail, it's how much we know. That
// visual difference is the decision made legible.
//
// An unattempted signal renders as a doorway to the thing that would
// add it, never as a mark against the student.

import Link from 'next/link';
import { DashboardReadinessBulb } from '@/lib/hints/practice/dashboard-readiness-bulb';
import { MiniHistogram, MiniTrajectory, Ring } from './mini-visuals';
import type { ReadinessPanelData } from './types';
import type { ReadinessSignal } from './readiness';

const SIGNAL_HREF: Record<ReadinessSignal['key'], string> = {
  accuracy: '/student/bank/practice',
  pack: '/student/bank/packs',
  cat: '/student/bank/cat',
};

function StateMark({ state }: { state: ReadinessSignal['state'] }) {
  if (state === 'met') return <span className="bd-sig-mark is-met">✓ met</span>;
  if (state === 'not_met') return <span className="bd-sig-mark is-unmet">Not yet</span>;
  return <span className="bd-sig-mark is-none">Not attempted</span>;
}

function SignalCard({
  signal,
  visual,
  helpHref,
}: {
  signal: ReadinessSignal;
  visual: React.ReactNode;
  // When set, a small "?" opens the topic's help article (new tab, so the
  // dashboard isn't lost). Used for the CAT signal → /help/cat (cat.html §3.2).
  helpHref?: string;
}) {
  return (
    <div className={`bd-sig is-${signal.state}`}>
      {helpHref && (
        <a
          className="bd-sig-help"
          href={helpHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`How ${signal.label} works`}
          title="How CAT works"
        >
          ?
        </a>
      )}
      <div className="bd-sig-visual">{visual}</div>
      <span className="bd-eyebrow">{signal.label}</span>
      {signal.value ? (
        <strong className="bd-sig-value">{signal.value}</strong>
      ) : (
        <Link className="bd-sig-cta" href={SIGNAL_HREF[signal.key]}>
          {signal.key === 'pack' ? 'Sit a pack →' : 'Sit a CAT →'}
        </Link>
      )}
      <span className="bd-sig-note">{signal.note}</span>
      <StateMark state={signal.state} />
    </div>
  );
}

export function ReadinessPanel({ data }: { data: ReadinessPanelData }) {
  const { panel, peer, trajectory, catPassed, accuracyPct } = data;
  const [accuracy, pack, cat] = panel.signals;

  return (
    <section className="bd-card bd-readiness" aria-label="Exam readiness">
      <div className="bd-card-head">
        <h2 className="bd-card-title">Exam readiness</h2>
        <DashboardReadinessBulb />

        {panel.band ? (
          <div className="bd-band">
            <div className="bd-band-text">
              <strong className="bd-band-label">{panel.band.label}</strong>
              <span className="bd-band-sub">
                {panel.band.met} of {panel.band.attempted}{' '}
                {panel.band.attempted === 1 ? 'signal' : 'signals'} met
              </span>
            </div>
            <div
              className="bd-meter"
              role="img"
              aria-label={`Readiness band: ${panel.band.label}, step ${panel.band.step} of 3.`}
            >
              {[1, 2, 3].map((s) => (
                <span key={s} className={`bd-meter-seg${s <= panel.band!.step ? ' is-on' : ''}`} />
              ))}
            </div>
            <div className="bd-meter-ends" aria-hidden="true">
              <span>Building</span>
              <span>Ready</span>
            </div>
          </div>
        ) : (
          // The gate is shut. We say what is coming and what it will
          // mean — deliberately not "your chances".
          <div className="bd-band is-locked">
            <div className="bd-band-text">
              <strong className="bd-band-label">Not enough practice yet</strong>
              <span className="bd-band-sub">
                {panel.gate.remaining.toLocaleString()} more{' '}
                {panel.gate.remaining === 1 ? 'question' : 'questions'} to go
              </span>
            </div>
          </div>
        )}
      </div>

      {!panel.band && <p className="bd-gate-note">{data.gateBody}</p>}

      <div className="bd-sigs">
        <SignalCard
          signal={accuracy}
          visual={
            accuracyPct !== null ? (
              <Ring
                percent={accuracyPct}
                tone="accent"
                label={`Overall accuracy ${accuracyPct} percent`}
              />
            ) : (
              <Ring percent={0} tone="accent" label="No accuracy yet" />
            )
          }
        />

        <SignalCard
          signal={pack}
          helpHref="/help/readiness-packs"
          visual={
            peer && peer.unlocked ? (
              <MiniHistogram peer={peer} />
            ) : (
              <span className="bd-sig-empty" aria-hidden="true" />
            )
          }
        />

        <SignalCard
          signal={cat}
          helpHref="/help/cat"
          visual={
            trajectory.length > 0 ? (
              <MiniTrajectory points={trajectory} passed={catPassed} />
            ) : (
              <span className="bd-sig-empty" aria-hidden="true" />
            )
          }
        />

        {/* The gate — evidence, not a result. No met/unmet mark. */}
        <div className="bd-sig is-gate">
          <div className="bd-sig-visual">
            <Ring
              percent={panel.gate.percent}
              tone="primary"
              label={`${panel.gate.answered} of ${panel.gate.needed} questions answered`}
            />
          </div>
          <span className="bd-eyebrow">Questions answered</span>
          <strong className="bd-sig-value">{panel.gate.answered.toLocaleString()}</strong>
          <span className="bd-sig-note">
            {panel.gate.open
              ? 'Enough to read your picture'
              : `of ${panel.gate.needed.toLocaleString()} needed`}
          </span>
          <span className="bd-sig-mark is-none">Evidence</span>
        </div>
      </div>
    </section>
  );
}
