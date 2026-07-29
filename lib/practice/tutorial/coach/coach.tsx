// mynclex/lib/practice/tutorial/coach/coach.tsx
//
// The coach overlay for the runner tutorial (Slice 2a — scaffold). Floats a
// coach card beside the runner control named by the current step, spotlights
// that control, and walks the student Back/Next through COACH_STEPS.
//
// It renders INSIDE the runner (sandbox only) so it can drive the real runner
// directly — switch question (onGoto), open the grid (setGridOpen) — instead
// of duplicating anything. Anchoring is by reading `[data-coach="<target>"]`
// off the live DOM, so the coach never holds refs into the runner tree.
//
// Positioning is done IMPERATIVELY (writing ring/card element styles in a
// layout effect) rather than through React state — the ring and card have to
// track the target across scroll/resize/goto, and driving that through state
// would mean a setState per frame. Only the step index is React state.
//
// Slice 2a: linear flow + anchoring + spotlight only. Gates (block Next until
// the student acts) are Slice 2b; hide/resume + jump-to-section + End tutorial
// are Slice 2c.

'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { COACH_STEPS, COACH_RECAP, COACH_SECTIONS } from './steps';
import { markTutorialCompleted } from '@/lib/practice/tutorial/completion';
import { TUTORIAL_KEY_EXAM_RUNNER } from '@/lib/practice/tutorial/keys';

interface Props {
  /** Switch the runner to the question with this key. */
  onGoto:      (key: string) => void;
  /** Open (or keep open) the question grid for grid-focused steps. */
  setGridOpen: (open: boolean) => void;
  /** Leave the tutorial (wired to the runner's exit). */
  onEnd:       () => void;
  /** Live: is the calculator open? Satisfies a `calc` gate (Slice 2b). */
  calcOpen:    boolean;
  /** Live: has the CURRENT question been submitted? Satisfies a `submit`
   *  gate. Resets to false whenever a goto switches to a fresh question. */
  currentSubmitted: boolean;
}

export function SandboxCoach({ onGoto, setGridOpen, onEnd, calcOpen, currentSubmitted }: Props) {
  const [step, setStep] = useState(0);
  // Slice 2c coach controls.
  const [hidden, setHidden] = useState(false);   // coaching collapsed → free explore
  const [jumpOpen, setJumpOpen] = useState(false); // section dropdown open
  const ringRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const s = COACH_STEPS[step];
  const total = COACH_STEPS.length;
  const hasTarget = !!s.target;

  // Record completion when the walkthrough reaches its final step (Slice 3b).
  // This is the tutorial's ONLY database write — and it no-ops server-side
  // for a logged-out visitor. A ref keeps it to at most once per mount,
  // however the student arrives at the done step (Next, or jump-to-section).
  const completedRef = useRef(false);
  useEffect(() => {
    if (s.done && !completedRef.current) {
      completedRef.current = true;
      void markTutorialCompleted(TUTORIAL_KEY_EXAM_RUNNER);
    }
  }, [s.done]);

  // Apply the step's runner side effects: switch question, open the grid.
  useEffect(() => {
    if (s.gotoKey) onGoto(s.gotoKey);
    if (s.grid) setGridOpen(true);
    // Keyed on `step` only — onGoto/setGridOpen are stable and re-running on
    // their identity would fire spurious gotos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Bring the target into view once when the step changes.
  useLayoutEffect(() => {
    if (!s.target) return;
    document
      .querySelector<HTMLElement>(`[data-coach="${s.target}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [step, s.target]);

  // Position the spotlight ring over the target and the card beside it, by
  // writing element styles directly (no setState). Re-runs on layout change,
  // resize and scroll.
  const place = useCallback(() => {
    const card = cardRef.current;
    const ring = ringRef.current;
    const target = s.target
      ? document.querySelector<HTMLElement>(`[data-coach="${s.target}"]`)
      : null;

    if (!target) {
      // Centred card (via CSS) — clear any inline position left by a prior step.
      if (card) { card.style.top = ''; card.style.left = ''; }
      return;
    }

    const r = target.getBoundingClientRect();
    if (ring) {
      ring.style.top = `${r.top}px`;
      ring.style.left = `${r.left}px`;
      ring.style.width = `${r.width}px`;
      ring.style.height = `${r.height}px`;
    }
    if (card) {
      const gap = 14;
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let top: number;
      if (r.bottom + gap + ch <= vh - 8) top = r.bottom + gap;
      else if (r.top - gap - ch >= 8)    top = r.top - gap - ch;
      else top = Math.max(8, Math.min(vh - ch - 8, r.bottom + gap));
      let left = r.left + r.width / 2 - cw / 2;
      left = Math.max(8, Math.min(vw - cw - 8, left));
      card.style.top = `${top}px`;
      card.style.left = `${left}px`;
    }
  }, [s.target]);

  useLayoutEffect(() => {
    place();
    // A goto re-renders the runner a beat later; catch the settled layout.
    const raf = requestAnimationFrame(place);
    const t = setTimeout(place, 90);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
    // `hidden` is a dep so un-hiding re-measures + repositions the card/ring.
  }, [place, step, hidden]);

  // Gate (Slice 2b): a step can require the student to actually DO the thing
  // before Next unlocks. Derived from live runner state — no latch needed:
  // `currentSubmitted` stays true once answered (and resets on the next
  // goto), and the calc gate is met while the calculator is open.
  const gateSatisfied =
    !s.gate || (s.gate === 'calc' ? calcOpen : currentSubmitted);

  const next = () => setStep((n) => Math.min(total - 1, n + 1));
  const back = () => setStep((n) => Math.max(0, n - 1));

  // Coach controls (Slice 2c).
  const hide = () => { setJumpOpen(false); setHidden(true); };
  const resume = () => {
    setHidden(false);
    // Re-anchor the guided context: the student may have navigated elsewhere
    // while free-exploring, so put them back on this step's question.
    if (s.gotoKey) onGoto(s.gotoKey);
    if (s.grid) setGridOpen(true);
  };
  const jumpTo = (start: number) => { setJumpOpen(false); setStep(start); };

  // Hidden: coaching collapsed to a strip. No dim, no spotlight — the whole
  // runner is free to explore. The "Nothing is recorded" badge stays up in
  // the topbar regardless, so the sandbox-safety cue never disappears.
  if (hidden) {
    return (
      <div className="tc-strip" role="dialog" aria-label="Tutorial coaching (hidden)">
        <span className="tc-strip-label">Coaching hidden — explore freely.</span>
        <button type="button" className="tc-btn primary" onClick={resume}>Resume</button>
        <button type="button" className="tc-btn ghost" onClick={onEnd}>End tutorial</button>
      </div>
    );
  }

  return (
    // Two sibling layers with deliberately different z-indexes: the scrim
    // (dim + ring) sits BELOW the calculator (z 50) so an opened calc shows
    // bright, while the card sits ABOVE it so its Next button is never buried
    // behind the calc during the calculator gate.
    <>
      <div
        className={'tc-scrim' + (hasTarget ? ' has-target' : '')}
        aria-hidden="true"
      >
        <div className="tc-dim" />
        {hasTarget && <div ref={ringRef} className="tc-ring" />}
      </div>
      <div
        ref={cardRef}
        className={'tc-card' + (hasTarget ? '' : ' tc-centered')}
        role="dialog"
        aria-label="Tutorial coaching"
      >
        <div className="tc-head">
          <span className="tc-tag">Tutorial</span>
          <span className="tc-count">Step {step + 1} of {total}</span>
          <div className="tc-head-actions">
            <button type="button" className="tc-mini" onClick={hide}>Hide</button>
            <button type="button" className="tc-mini" onClick={onEnd}>End</button>
          </div>
        </div>

        <div className="tc-jump">
          <button
            type="button"
            className="tc-jump-btn"
            onClick={() => setJumpOpen((o) => !o)}
            aria-expanded={jumpOpen}
          >
            <span>Jump to section</span>
            <span className="tc-jump-caret" aria-hidden="true">{jumpOpen ? '▴' : '▾'}</span>
          </button>
          {jumpOpen && (
            <ul className="tc-jump-menu" role="menu">
              {COACH_SECTIONS.map((sec) => (
                <li key={sec.label + sec.start}>
                  <button
                    type="button"
                    role="menuitem"
                    className={'tc-jump-item' + (sec.sub ? ' sub' : '') + (step === sec.start ? ' on' : '')}
                    onClick={() => jumpTo(sec.start)}
                  >
                    {sec.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="tc-title">{s.title}</div>
        <div className="tc-body">{s.body}</div>
        {s.done && (
          <ul className="tc-recap">
            {COACH_RECAP.map((r) => (
              <li key={r.k}><b>{r.k}:</b> {r.v}</li>
            ))}
          </ul>
        )}
        {s.gate && !gateSatisfied && s.gateMsg && (
          <div className="tc-gate">{s.gateMsg}</div>
        )}
        <div className="tc-actions">
          <button type="button" className="tc-btn ghost" onClick={back} disabled={step === 0}>
            ← Back
          </button>
          {s.done ? (
            <button type="button" className="tc-btn primary" onClick={onEnd}>Finish</button>
          ) : (
            <button
              type="button"
              className="tc-btn primary"
              onClick={next}
              disabled={!gateSatisfied}
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </>
  );
}
