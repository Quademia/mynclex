'use client';

// mynclex/app/(public)/bank-access/builder-demo.tsx
//
// The cinematic bank page's centrepiece: a fully-interactive SAMPLE of the
// real practice-builder. Pick pools, filter by client-needs + difficulty,
// choose intent/mode — the summary rail's match count follows every choice
// live. It mirrors the shape and mechanics of the real builder
// (lib/practice/builder) but runs on ILLUSTRATIVE numbers and does nothing
// on "Start" — it's a marketing demo, not a wired surface. Styling is
// page-scoped `.bkc-*` in styles/bank-public.css.

import { useState } from 'react';
// Public marketing demo, but the CAT length it quotes is a factual claim
// about the product — so it reads the engine's constants like every other
// surface rather than carrying its own copy of the numbers.
import { MIN_ITEMS, MAX_ITEMS } from '@/lib/cat';

type Intent = 'STUDY' | 'EXAM';

const POOLS = [
  { id: 'UNSEEN', label: 'Unseen', sub: 'Questions you have never taken', n: 1240 },
  { id: 'SEEN', label: 'Seen', sub: 'Anything you have attempted before', n: 380 },
  { id: 'CORRECT', label: 'Correct', sub: 'Ones you last got right', n: 260 },
  { id: 'INCORRECT', label: 'Incorrect', sub: 'Ones you last got wrong', n: 120 },
  { id: 'MARKED', label: 'Marked', sub: 'Flagged for review mid-quiz', n: 45 },
];
const CNC = [
  { id: 'moc', label: 'Management of Care', w: 0.17 },
  { id: 'sic', label: 'Safety & Infection Control', w: 0.11 },
  { id: 'hpm', label: 'Health Promotion', w: 0.09 },
  { id: 'psy', label: 'Psychosocial Integrity', w: 0.09 },
  { id: 'bcc', label: 'Basic Care & Comfort', w: 0.09 },
  { id: 'pht', label: 'Pharm Therapies', w: 0.16 },
  { id: 'rrp', label: 'Reduction of Risk', w: 0.14 },
  { id: 'pha', label: 'Physiological Adaptation', w: 0.15 },
];
const DIFF = [
  { id: 'easy', label: 'Easy', w: 0.34 },
  { id: 'med', label: 'Medium', w: 0.41 },
  { id: 'hard', label: 'Hard', w: 0.25 },
];
// Deliberately hardcoded, NOT read from the builder's config (Sam,
// 2026-07-24): this is a public marketing illustration of the surface, not
// the surface itself, and it must render for a signed-out visitor with no
// data behind it. The cost of that choice is that the labels below have to
// be kept in step by hand whenever the real ones move — they had already
// drifted a full naming generation before this pass. Source of truth for
// the real thing: MODES_STUDY / MODES_EXAM in
// lib/practice/builder/filter-config.ts.
const MODES: Record<Intent, { id: string; label: string; clock: string; feedback: string; nav: string }[]> = {
  STUDY: [
    { id: 'UNTIMED_LEARNING', label: 'Learning', clock: 'No clock', feedback: 'Instant feedback', nav: 'Free nav' },
    { id: 'UNTIMED_TEST', label: 'Untimed practice', clock: 'No clock', feedback: 'Feedback at end', nav: 'Free nav' },
    { id: 'TIMED_FREE_NAV', label: 'Timed practice', clock: 'Engagement-clock', feedback: 'Feedback at end', nav: 'Free nav' },
  ],
  EXAM: [
    { id: 'TIMED_SEQUENTIAL', label: 'Sequential', clock: 'Wall-clock', feedback: 'Feedback at end', nav: 'Forward only' },
    { id: 'TIMED_FREE_NAV', label: 'Free Navigation', clock: 'Wall-clock', feedback: 'Feedback at end', nav: 'Free nav' },
    { id: 'CAT', label: 'Computer Adaptive Testing (CAT)', clock: 'Wall-clock', feedback: 'Feedback at end', nav: 'Forward only' },
  ],
};

function clockPillClass(clock: string): string {
  if (clock === 'No clock') return 'bkc-pill';
  if (clock === 'Engagement-clock') return 'bkc-pill clock-eng';
  return 'bkc-pill clock-wall';
}

export function BuilderDemo() {
  const [pools, setPools] = useState<string[]>(['UNSEEN']);
  const [cnc, setCnc] = useState<string[]>([]);
  const [diff, setDiff] = useState<string[]>([]);
  const [intent, setIntent] = useState<Intent>('STUDY');
  const [mode, setMode] = useState('UNTIMED_LEARNING');
  const [count, setCount] = useState(25);

  const isCat = mode === 'CAT';

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const poolSum = POOLS.filter((p) => pools.includes(p.id)).reduce((a, p) => a + p.n, 0);
  const cncFrac = cnc.length === 0 ? 1 : CNC.filter((c) => cnc.includes(c.id)).reduce((a, c) => a + c.w, 0);
  const diffFrac = diff.length === 0 ? 1 : DIFF.filter((d) => diff.includes(d.id)).reduce((a, d) => a + d.w, 0);
  const total = Math.round(poolSum * cncFrac * diffFrac);

  const setIntentSafe = (next: Intent) => {
    const list = MODES[next];
    const keep = list.find((m) => m.id === mode);
    setIntent(next);
    setMode(keep ? keep.id : list[0].id);
  };

  const modeLabel = MODES[intent].find((m) => m.id === mode)!.label;
  const cncMeta = isCat ? "doesn't apply in CAT" : cnc.length === 0 ? `any of ${CNC.length}` : `${cnc.length} of ${CNC.length}`;
  const diffMeta = isCat ? "doesn't apply in CAT" : diff.length === 0 ? 'any of 3' : `${diff.length} of 3`;

  const err = !isCat && total === 0;
  const warn = !isCat && total > 0 && total < 10;
  const shownCount = Math.min(count, total || count);

  const disabled = !isCat && (pools.length === 0 || total === 0);
  const startLabel = isCat ? 'Go to CAT' : intent === 'EXAM' ? `Start Exam · ${modeLabel}` : `Start Quiz · ${modeLabel}`;
  const startNote = disabled
    ? pools.length === 0
      ? 'Pick at least one pool to draw from.'
      : 'No questions match these filters. Loosen your filters.'
    : isCat
      ? 'Wall-clock timer · single sitting · cannot be resumed.'
      : intent === 'EXAM'
        ? 'Wall-clock timer · single sitting · the clock keeps running if you leave.'
        : 'You can pause and resume. Progress saves automatically.';

  return (
    <section id="builder" className="bkc-builder">
      <span className="bkc-builder-glow" />
      <div className="bkc-builder-inner">
        <div className="bkc-builder-head bkc-reveal">
          <div className="bkc-eyebrow plain">Build your own sets</div>
          <h2>Your bank, <span className="bkc-accent">your rules</span></h2>
          <p>
            This is the real quiz builder. Draw from any slice of your history, filter by client needs
            and difficulty, pick a mode — and watch the live count follow every choice. Try it.
          </p>
        </div>

        <div className="bkc-frame bkc-reveal">
          <div className="bkc-frame-bar">
            <span className="bkc-frame-logo">M</span>
            <span className="bkc-frame-title">Build a practice quiz</span>
            <span className="bkc-frame-hint">The count on the right updates as you go.</span>
          </div>

          <div className="bkc-frame-body">
            {/* main column */}
            <div className="bkc-builder-main">
              {/* pools */}
              <div>
                <div className="bkc-blk-h">Question pool</div>
                <div className="bkc-blk-sub">Pick the slice of your history to draw from. Combinable — overlap is intentional.</div>
                <div className="bkc-pool-grid">
                  {POOLS.map((p) => {
                    const on = pools.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`bkc-pool${on && !isCat ? ' on' : ''}${isCat ? ' disabled' : ''}`}
                        onClick={isCat ? undefined : () => toggle(pools, setPools, p.id)}
                      >
                        <span className="bkc-pool-top">
                          <span className="bkc-pool-check">✓</span>
                          <span className="bkc-pool-label">{p.label}</span>
                        </span>
                        <span className="bkc-pool-sub">{p.sub} · {p.n.toLocaleString()}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* content filters */}
              <div>
                <div className="bkc-blk-h">Content filters</div>
                <div className="bkc-blk-sub">Within an axis: <em>or</em> · across axes: <em>and</em>. Leave empty for &quot;any&quot;.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                  <div>
                    <div className="bkc-axis-h">Client Needs Category <span className="bkc-axis-meta">· {cncMeta}</span></div>
                    <div className="bkc-chips">
                      {CNC.map((c) => {
                        const on = cnc.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={`bkc-cchip${on && !isCat ? ' on' : ''}${isCat ? ' disabled' : ''}`}
                            onClick={isCat ? undefined : () => toggle(cnc, setCnc, c.id)}
                          >
                            {c.label} <span className="bkc-cchip-n">{Math.round(poolSum * c.w * diffFrac).toLocaleString()}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="bkc-axis-h">Difficulty <span className="bkc-axis-meta">· {diffMeta}</span></div>
                    <div className="bkc-chips">
                      {DIFF.map((d) => {
                        const on = diff.includes(d.id);
                        return (
                          <button
                            key={d.id}
                            type="button"
                            className={`bkc-cchip${on && !isCat ? ' on' : ''}${isCat ? ' disabled' : ''}`}
                            onClick={isCat ? undefined : () => toggle(diff, setDiff, d.id)}
                          >
                            {d.label} <span className="bkc-cchip-n">{Math.round(poolSum * d.w * cncFrac).toLocaleString()}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* intent + mode */}
              <div>
                <div className="bkc-intent-row">
                  <div className="bkc-blk-h">Intent &amp; mode</div>
                  <div className="bkc-seg">
                    <button type="button" className={intent === 'STUDY' ? 'on' : ''} onClick={() => setIntentSafe('STUDY')}>Study</button>
                    <button type="button" className={intent === 'EXAM' ? 'on' : ''} onClick={() => setIntentSafe('EXAM')}>Exam</button>
                  </div>
                </div>
                <div className="bkc-mode-grid">
                  {MODES[intent].map((m) => {
                    const on = mode === m.id;
                    return (
                      <button key={m.id} type="button" className={`bkc-mode${on ? ' on' : ''}`} onClick={() => setMode(m.id)}>
                        <span className="bkc-mode-top">
                          <span className="bkc-mode-label">{m.label}</span>
                          <span className="bkc-mode-dot">●</span>
                        </span>
                        <span className="bkc-mode-pills">
                          <span className={clockPillClass(m.clock)}>{m.clock}</span>
                          <span className="bkc-pill">{m.feedback}</span>
                          <span className="bkc-pill">{m.nav}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {isCat && (
                  <div className="bkc-cat-note">ⓘ CAT pulls from the full bank to simulate the real exam — pool and content filters don&apos;t apply.</div>
                )}
              </div>
            </div>

            {/* summary rail */}
            <div className="bkc-rail">
              <div className="bkc-rail-h">Your quiz</div>
              <div className={`bkc-match${err ? ' err' : warn ? ' warn' : ''}`}>
                <strong>{isCat ? `${MIN_ITEMS}–${MAX_ITEMS}` : total.toLocaleString()}</strong>
                <span>{isCat ? 'adaptive — the engine picks each question live' : 'questions match your filters'}</span>
              </div>

              {!isCat ? (
                <div>
                  <div className="bkc-len-row">
                    <span className="bkc-len-k">Quiz length</span>
                    <span className="bkc-len-v">{shownCount} Q</span>
                  </div>
                  <div className="bkc-presets">
                    {[10, 25, 50, 75].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`bkc-preset${count === n ? ' on' : ''}${n > total ? ' disabled' : ''}`}
                        onClick={n > total ? undefined : () => setCount(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bkc-cat-len">
                  <div className="k">CAT length</div>
                  <div className="v">85–150 questions</div>
                  <div className="s">Terminates when confidence is reached.</div>
                </div>
              )}

              <div className="bkc-recap">
                {isCat ? (
                  <>
                    <RecapRow k="Source" v="Full bank" />
                    <RecapRow k="Mode" v="CAT (adaptive)" />
                    <RecapRow k="Intent" v="Exam" />
                  </>
                ) : (
                  <>
                    <RecapRow
                      k="Pool"
                      v={pools.length === 0 ? 'No pool picked' : POOLS.filter((p) => pools.includes(p.id)).map((p) => p.label).join(' · ')}
                      tone={pools.length === 0 ? 'err' : undefined}
                    />
                    <RecapRow k="Client needs" v={cnc.length === 0 ? 'Any' : `${cnc.length} selected`} tone={cnc.length === 0 ? 'muted' : undefined} />
                    <RecapRow
                      k="Difficulty"
                      v={diff.length === 0 ? 'Any' : DIFF.filter((d) => diff.includes(d.id)).map((d) => d.label).join(', ')}
                      tone={diff.length === 0 ? 'muted' : undefined}
                    />
                    <RecapRow k="Mode" v={`${intent === 'STUDY' ? 'Study' : 'Exam'} · ${modeLabel}`} />
                  </>
                )}
              </div>

              <button type="button" className={`bkc-start${disabled ? ' disabled' : ''}`} disabled={disabled}>{startLabel} →</button>
              <div className="bkc-start-note">{startNote}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RecapRow({ k, v, tone }: { k: string; v: string; tone?: 'muted' | 'err' }) {
  return (
    <div className="bkc-recap-row">
      <span className="bkc-recap-k">{k}</span>
      <span className={`bkc-recap-v${tone ? ` ${tone}` : ''}`}>{v}</span>
    </div>
  );
}
