// mynclex/lib/hints/shared/bulb.tsx
//
// The 💡 bulb shell — one of the explanation shells under lib/hints/.
// Click toggles a small anchored hint card showing the supplied title
// and body. The card has a close × button + Esc handler. No backdrop
// — this is informational, not a modal action, per CLAUDE.md UI
// Conventions rule #2 (backdrop dialogs are reserved for destructive
// or irreversible actions).
//
// This component is the SHELL only — it knows nothing about what it
// explains. The actual explanation content (title + body) lives in
// the named bulb files under lib/hints/bank/<area>-bulb.tsx (Path B
// pattern: each unique explainer is its own file that wraps the
// shell with its content baked in). Toolbars import the named bulb,
// not this shell directly.

'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface BulbProps {
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

export function Bulb({ title, children, bulbTitle }: BulbProps) {
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
