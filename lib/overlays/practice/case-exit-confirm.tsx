// mynclex/lib/overlays/practice/case-exit-confirm.tsx
//
// Centred confirmation dialog shown when a student in a free-batched
// archetype (UT, TFN both intents) tries to leave a case-block mid-flight
// — i.e. clicks a grid cell outside the case, or clicks Prev backward
// past the case boundary, while at least one case-child is still
// unanswered. UL doesn't surface this (per-Q rationale provides natural
// rhythm); Sequential locks Prev + grid in 4.5c, so the warning never
// triggers.
//
// Per-attempt suppression checkbox lets a student dismiss for the rest
// of the quiz. Resets at next attempt, matching the hide-clock toggle's
// per-attempt scope (slice 4.5a §8.5).
//
// Layout mirrors lib/overlays/practice/finish-with-blanks-confirm.tsx —
// same backdrop + centred panel pattern, reuses the auth-discard-* class
// family. Backdrop click maps to "Stay in case" (the safe / non-
// destructive option per CLAUDE.md UI conventions §2).

'use client';

import { useState } from 'react';

interface Props {
  answeredInCase: number;
  totalChildren:  number;
  onCancel:       () => void;                       // "Stay in case"
  onLeaveAnyway:  (suppressForAttempt: boolean) => void;
}

export function CaseExitConfirm({
  answeredInCase,
  totalChildren,
  onCancel,
  onLeaveAnyway,
}: Props) {
  const [suppress, setSuppress] = useState(false);

  return (
    <div
      className="auth-discard-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="auth-discard-confirm"
        role="alertdialog"
        aria-label="Leaving this case study"
        aria-modal="true"
      >
        <p className="auth-discard-confirm-title">Leaving this case study</p>
        <p className="auth-discard-confirm-hint">
          Cases are designed to be answered in sequence. You&apos;ve answered{' '}
          <strong>{answeredInCase}</strong> of <strong>{totalChildren}</strong>.
          You can leave and come back later, but the case&apos;s narrative makes
          more sense answered in order.
        </p>
        <label
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        8,
            fontSize:   13,
            marginTop:  10,
            color:      'var(--text-muted)',
            cursor:     'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={suppress}
            onChange={(e) => setSuppress(e.target.checked)}
          />
          Don&apos;t show this again this quiz
        </label>
        <div className="auth-discard-confirm-actions">
          <button
            type="button"
            className="auth-btn auth-btn-ghost"
            onClick={onCancel}
          >
            Stay in case
          </button>
          <button
            type="button"
            className="auth-btn auth-btn-primary"
            onClick={() => onLeaveAnyway(suppress)}
          >
            Leave anyway
          </button>
        </div>
      </div>
    </div>
  );
}
