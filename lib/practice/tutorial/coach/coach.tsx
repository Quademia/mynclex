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
import { COACH_STEPS, COACH_RECAP } from './steps';

interface Props {
  /** Switch the runner to the question with this key. */
  onGoto:      (key: string) => void;
  /** Open (or keep open) the question grid for grid-focused steps. */
  setGridOpen: (open: boolean) => void;
  /** Leave the tutorial (wired to the runner's exit). */
  onEnd:       () => void;
}

export function SandboxCoach({ onGoto, setGridOpen, onEnd }: Props) {
  const [step, setStep] = useState(0);
  const ringRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const s = COACH_STEPS[step];
  const total = COACH_STEPS.length;
  const hasTarget = !!s.target;

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
  }, [place, step]);

  const next = () => setStep((n) => Math.min(total - 1, n + 1));
  const back = () => setStep((n) => Math.max(0, n - 1));

  return (
    <div
      className={'tc-root' + (hasTarget ? ' has-target' : '')}
      role="dialog"
      aria-label="Tutorial coaching"
    >
      <div className="tc-dim" />
      {hasTarget && <div ref={ringRef} className="tc-ring" />}
      <div ref={cardRef} className={'tc-card' + (hasTarget ? '' : ' tc-centered')}>
        <div className="tc-head">
          <span className="tc-tag">Tutorial</span>
          <span className="tc-count">Step {step + 1} of {total}</span>
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
        <div className="tc-actions">
          <button type="button" className="tc-btn ghost" onClick={back} disabled={step === 0}>
            ← Back
          </button>
          {s.done ? (
            <button type="button" className="tc-btn primary" onClick={onEnd}>Finish</button>
          ) : (
            <button type="button" className="tc-btn primary" onClick={next}>Next →</button>
          )}
        </div>
      </div>
    </div>
  );
}
