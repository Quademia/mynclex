// mynclex/lib/authoring/atoms/help-bulb.tsx
//
// A 💡 bulb help icon. Click toggles a small anchored hint card
// listing the purpose of nearby action buttons. The card has a close
// × button + Esc handler. No backdrop — this is informational, not a
// modal action, per the UI convention split (CLAUDE.md UI Conventions
// rule #2 — backdrop dialogs are for destructive/irreversible
// actions).
//
// Used by the case-study wrapper page (one bulb in wrapper mode,
// one in editor mode) and reusable for any future toolbar that
// benefits from a single help affordance over many action buttons.

'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface HelpBulbProps {
  /**
   * Title shown at the top of the hint card.
   */
  title: string;
  /**
   * The hint card body. Typically a <ul> of <li> entries, one per
   * button being explained, with the button label in <strong>.
   */
  children: ReactNode;
  /**
   * Optional custom hover/title text on the bulb itself.
   * Defaults to "What do these buttons do?".
   */
  bulbTitle?: string;
}

export function HelpBulb({ title, children, bulbTitle }: HelpBulbProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClickOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClickOutside);
    };
  }, [open]);

  return (
    <span ref={ref} className="auth-help-bulb-wrap">
      <button
        type="button"
        className={`auth-help-bulb-btn${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={bulbTitle ?? 'What do these buttons do?'}
        aria-expanded={open}
        aria-label="Help"
      >
        💡
      </button>
      {open && (
        <div className="auth-help-bulb-card" role="dialog" aria-label={title}>
          <div className="auth-help-bulb-card-head">
            <span className="auth-help-bulb-card-title">{title}</span>
            <button
              type="button"
              className="auth-help-bulb-card-close"
              onClick={() => setOpen(false)}
              aria-label="Close help"
            >
              ×
            </button>
          </div>
          <div className="auth-help-bulb-card-body">{children}</div>
        </div>
      )}
    </span>
  );
}
