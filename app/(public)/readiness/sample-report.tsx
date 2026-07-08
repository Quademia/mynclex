// mynclex/app/(public)/readiness/sample-report.tsx
//
// "What you get back" — a STATIC illustration of the report a sitting
// returns. No data, no queries, no state: every number here is invented
// and the panel is labelled SAMPLE.
//
// Why static: the design prototype carried a Client needs / Body system /
// Difficulty tab switcher. That was a demo affordance for reviewing the
// design, not a feature (Sam, 2026-07-08) — a marketing page has no
// business shipping interactive state to show off a breakdown. Frozen on
// Client needs; a non-functional tab strip would be worse than none.
//
// Every element illustrated here is SETTLED in readiness-packs.md §11.5 —
// the four bands, the points line beside the headline %, the peer
// comparator behind a min-N gate, the multi-axis breakdown, and the
// thin-slice honesty rule. We are not advertising anything unbuilt by
// decision, only unbuilt by schedule. It will need re-syncing when the
// real results page lands.

const SAMPLE_SCORE_PCT = 79;
const RING_RADIUS = 58;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // 364.4

/** Invented, but internally consistent: 412 / 520 = 79.2%. */
const SAMPLE_POINTS = { earned: 412, total: 520 };

/**
 * The thin-slice honesty rule (§11.5): a category with almost no
 * questions in it must show its raw fraction, never a percentage that
 * pretends to precision it hasn't earned.
 */
const THIN_SLICE_MAX = 3;

const CLIENT_NEEDS = [
  { name: 'Management of Care',                    got: 12, total: 14 },
  { name: 'Pharmacological & Parenteral Therapies', got: 13, total: 18 },
  { name: 'Safety & Infection Control',            got: 7,  total: 9  },
  { name: 'Health Promotion & Maintenance',        got: 7,  total: 9  },
  { name: 'Basic Care & Comfort',                  got: 7,  total: 8  },
  { name: 'Psychosocial Integrity',                got: 5,  total: 8  },
  { name: 'Reduction of Risk Potential',           got: 12, total: 18 },
  { name: 'Physiological Adaptation',              got: 9,  total: 16 },
];

function toneFor(got: number, total: number): { cls: string; pct: number; label: string } {
  const pct = Math.round((got / total) * 100);
  if (total <= THIN_SLICE_MAX) {
    return { cls: 'thin', pct, label: `${got} of ${total}` };
  }
  const cls = pct < 60 ? 'bad' : pct < 80 ? 'mid' : 'good';
  return { cls, pct, label: `${got} of ${total} · ${pct}%` };
}

export function SampleReport() {
  const dash = (SAMPLE_SCORE_PCT / 100) * RING_CIRCUMFERENCE;

  return (
    <section className="rdp-section">
      <div className="rdp-eyebrow">What you get back</div>
      <h2>A measured verdict, not a guess</h2>
      <p className="rdp-section-lede">
        Because every nurse sits the same fixed exam, your score is a real yardstick.
        Here&apos;s the report a sitting returns.
      </p>

      <div className="rdp-report">
        <div className="rdp-report-head">
          <div className="rdp-report-who">
            <strong>Readiness Pack 2</strong>
            <span>· Your report</span>
          </div>
          <span className="rdp-sample-pill">SAMPLE</span>
        </div>

        <div className="rdp-report-body">
          <div className="rdp-verdict">
            <svg className="rdp-ring" width="150" height="150" viewBox="0 0 150 150" aria-hidden="true">
              <circle cx="75" cy="75" r={RING_RADIUS} fill="none" className="rdp-ring-track" strokeWidth="15" />
              <circle
                cx="75" cy="75" r={RING_RADIUS} fill="none" className="rdp-ring-fill"
                strokeWidth="15" strokeLinecap="round"
                strokeDasharray={`${dash} ${RING_CIRCUMFERENCE}`}
                transform="rotate(-90 75 75)"
              />
              <text x="75" y="72" textAnchor="middle" className="rdp-ring-pct">{SAMPLE_SCORE_PCT}%</text>
              <text x="75" y="92" textAnchor="middle" className="rdp-ring-cap">MEASURED SCORE</text>
            </svg>

            <div className="rdp-verdict-copy">
              <div className="rdp-verdict-chips">
                <span className="rdp-band-chip">Band: Ready</span>
                <span className="rdp-points">
                  {SAMPLE_POINTS.earned} of {SAMPLE_POINTS.total} points earned
                </span>
              </div>
              <p>
                A <strong>measured</strong> score on the same fixed exam every taker answers —
                not a prediction, a yardstick. Partial credit on NGN items is already in the
                maths, so the points line carries the answer-level detail behind the headline.
              </p>

              <div className="rdp-bands">
                <div className="rdp-you" style={{ left: `${SAMPLE_SCORE_PCT}%` }}>
                  <span>YOU</span>
                  <svg width="12" height="7" viewBox="0 0 12 7" aria-hidden="true">
                    <path d="M6 7 0 0h12z" fill="currentColor" />
                  </svg>
                </div>
                <div className="rdp-band-strip">
                  <div className="b1" /><div className="b2" /><div className="b3" /><div className="b4" />
                </div>
                <div className="rdp-band-keys">
                  <span>Building</span>
                  <span>Approaching</span>
                  <span className="on">Ready</span>
                  <span>Excelling</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rdp-report-panels">
            <div className="rdp-panel">
              <div className="rdp-panel-key">Peer comparison</div>
              <div className="rdp-peer-line">
                You scored higher than <strong>72%</strong> of nurses who sat this pack.
              </div>
              <svg className="rdp-curve" width="100%" height="84" viewBox="0 0 320 84"
                preserveAspectRatio="none" aria-hidden="true">
                <path d="M6,76 C74,76 96,20 160,18 C224,16 250,76 314,76 L314,80 L6,80 Z" className="rdp-curve-fill" />
                <path d="M6,76 C74,76 96,20 160,18 C224,16 250,76 314,76" fill="none" className="rdp-curve-line" />
                <line x1="224" y1="14" x2="224" y2="80" className="rdp-curve-mark" strokeDasharray="3 3" />
                <circle cx="224" cy="34" r="4" className="rdp-curve-dot" />
              </svg>
              <div className="rdp-panel-foot">
                Your comparison appears once enough nurses have sat the same pack.
              </div>
            </div>

            <div className="rdp-panel">
              <div className="rdp-panel-key">Where to focus next · Client needs</div>
              <div className="rdp-bars">
                {CLIENT_NEEDS.map((r) => {
                  const t = toneFor(r.got, r.total);
                  return (
                    <div key={r.name} className="rdp-bar-row">
                      <div className="rdp-bar-head">
                        <span className="rdp-bar-name">{r.name}</span>
                        <span className={`rdp-bar-val ${t.cls}`}>{t.label}</span>
                      </div>
                      <div className="rdp-bar-track">
                        <div className={`rdp-bar-fill ${t.cls}`} style={{ width: `${t.pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="rdp-panel-foot">
                Thin slices always show the raw count (e.g. &ldquo;2 of 3&rdquo;) — never a
                stretched percentage.
              </div>
            </div>
          </div>
        </div>

        <div className="rdp-report-foot">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <div>
            Work through every question and rationale for <strong>21 days</strong> after you
            finish. Your score, band and breakdown stay in your history <strong>forever</strong>{' '}
            — you can&apos;t retake into a better number.
          </div>
        </div>
      </div>
    </section>
  );
}
