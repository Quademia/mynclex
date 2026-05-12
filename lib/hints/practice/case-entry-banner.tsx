// mynclex/lib/hints/practice/case-entry-banner.tsx
//
// Non-modal hint banner that fires when the student enters a case-block
// in the runner. Explains the case-block concept ("the chart panel
// applies to the next 6 questions") so a first-time student understands
// the multi-question reasoning chain.
//
// Why this lives in lib/hints/practice/ (not lib/overlays/practice/ or
// lib/practice/runner/case/):
//   • lib/overlays/ is for modal *confirmations* (delete, discard) where
//     a decision is required. This banner asks for nothing — it just
//     explains. So it's a hint, not an overlay.
//   • lib/hints/ is for explanation surfaces. Today it holds
//     click-to-toggle bulbs (hints/shared/bulb.tsx); the case-entry
//     banner is a different shell within the same category — auto-firing
//     and time-decaying instead of click-toggled.
//   • lib/practice/runner/case/ is for runner-internal case-block
//     mechanics (panel, chart-tab body, CJMM strip). The banner is
//     adjacent to those but explanation-shaped, so it lives in the
//     hints umbrella per CLAUDE.md #12.
//
// Behaviour:
//   • Renders into the runner main column above .rn-split.
//   • Auto-fades after AUTO_FADE_MS, then unmounts.
//   • Click × to dismiss immediately.
//   • Caller controls when the banner appears via the `caseId` key —
//     remounting the component on each new case re-fires the banner.

'use client';

import { useEffect, useState } from 'react';

const AUTO_FADE_MS    = 4000;
const FADE_DURATION_MS = 360;

interface Props {
  totalChildren: number;
  onDismiss?:    () => void;
}

export function CaseEntryBanner({ totalChildren, onDismiss }: Props) {
  const [phase, setPhase] = useState<'visible' | 'fading'>('visible');

  // Schedule the auto-fade. The fade-out animation runs FADE_DURATION_MS;
  // after that the parent unmounts via onDismiss.
  useEffect(() => {
    const fadeTimer    = window.setTimeout(() => setPhase('fading'), AUTO_FADE_MS);
    const unmountTimer = window.setTimeout(
      () => { onDismiss?.(); },
      AUTO_FADE_MS + FADE_DURATION_MS,
    );
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(unmountTimer);
    };
  }, [onDismiss]);

  return (
    <div
      className={'rn-case-banner' + (phase === 'fading' ? ' fading' : '')}
      role="status"
      aria-live="polite"
    >
      <span className="icon" aria-hidden="true">i</span>
      <div className="body">
        <strong>Case study.</strong>{' '}
        The chart panel on the left applies to the next {totalChildren} questions.
        Use it as you reason through each step.
      </div>
      <button
        type="button"
        className="dismiss"
        aria-label="Dismiss"
        onClick={() => onDismiss?.()}
      >
        ×
      </button>
    </div>
  );
}
