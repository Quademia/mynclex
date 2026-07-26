// mynclex/lib/overlays/practice/pre-exam-tutorial-offer.tsx
//
// The pre-exam tutorial offer (runner-tutorial Slice 3c). Shown when a
// student presses Start on an exam preflight and hasn't dismissed the
// offer: "New to the exam screen? Take the walkthrough first." Watching is
// FREE — the host defers the real Start (and thus the clock / the readiness
// credit) until the student comes back and starts for real, so nothing is
// spent by taking the tour.
//
// One identical component for every surface (custom-built session, CAT,
// readiness). The only per-surface difference is the `returnTo` address the
// host hands in (its own preflight, carrying tut_watched=1 so it isn't
// re-offered on the immediate bounce-back) and the `onProceed` start action.
//
// Neutral modal chrome (`pre-exam-offer-*` in styles/runner.css) with the
// app's generic `btn` buttons — deliberately NOT the amber auth-discard
// chrome, which reads as a warning; this is a calm offer, not a caution.
// Backdrop click = the safe option (Cancel: stay on the preflight, start
// nothing).

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { dismissPrompt } from '@/lib/practice/tutorial/completion';
import { PROMPT_KEY_PRE_EXAM_OFFER } from '@/lib/practice/tutorial/keys';

interface Props {
  /** Internal address the tutorial returns to — the host's own preflight,
   *  already carrying tut_watched=1 so the offer isn't shown again on the
   *  immediate return. */
  returnTo:  string;
  /** Start the exam for real (the host's deferred start action). */
  onProceed: () => void;
  /** Dismiss without starting (backdrop / Not now) — stays on the preflight. */
  onCancel:  () => void;
}

export function PreExamTutorialOffer({ returnTo, onProceed, onCancel }: Props) {
  const router = useRouter();
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Only the checkbox suppresses the offer for good (completion never does).
  const remember = () => {
    if (dontShowAgain) void dismissPrompt(PROMPT_KEY_PRE_EXAM_OFFER);
  };

  const onWatch = () => {
    remember();
    router.push(`/tutorial/exam?return=${encodeURIComponent(returnTo)}`);
  };

  const onStartNow = () => {
    remember();
    onProceed();
  };

  return (
    <div
      className="pre-exam-offer-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="pre-exam-offer-card"
        role="dialog"
        aria-label="See the exam screen first?"
        aria-modal="true"
      >
        <p className="pre-exam-offer-title">New to the exam screen?</p>
        <p className="pre-exam-offer-hint">
          Take a quick walkthrough of the interface first — every question type
          and tool, exactly as they appear here. It records nothing and
          won&apos;t affect this attempt.
        </p>

        <label className="pre-exam-offer-check">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
          <span>Don&apos;t show this again</span>
        </label>

        <div className="pre-exam-offer-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onStartNow}>
            Start now
          </button>
          <button type="button" className="btn btn-accent" onClick={onWatch} autoFocus>
            Take the walkthrough
          </button>
        </div>
      </div>
    </div>
  );
}
