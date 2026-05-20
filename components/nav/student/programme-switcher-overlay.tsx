// mynclex/components/nav/student/programme-switcher-overlay.tsx
//
// In-app "switch programme" popup, opened from two triggers:
//   1. Topbar Programme pill (ProductSwitcher)
//   2. Sidebar "Switch programme" button (programme + cohort shells)
// The picker lists programmes inline (it no longer opens this popup) —
// the popup is now purely for switching while already inside a
// programme. Row rendering is shared via <ProgrammeList>.
//
// Lazy data fetch: when `open` flips to true, the overlay fires
// getMyAccessibleProgrammesAction(). Loading + error states
// rendered inline. Closes on backdrop click, ESC, or after
// clicking a programme/cohort row (which routes away).
//
// Per CLAUDE.md UI convention 2 the overlay is centered with
// dimmed backdrop — same pattern as the curator's destructive
// confirms. No type-to-confirm; this is non-destructive.

'use client';

import { useEffect, useState } from 'react';
import {
  getMyAccessibleProgrammesAction,
  type SwitcherProgramme,
} from '@/lib/programmes/student-actions';
import { ProgrammeList } from './programme-list';

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; programmes: SwitcherProgramme[] }
  | { kind: 'error'; message: string };

export function ProgrammeSwitcherOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [state, setState] = useState<LoadState>({ kind: 'idle' });

  // Lazy fetch when the overlay opens. Always refetch on each open
  // so the list reflects the latest published programmes / cohorts.
  useEffect(() => {
    if (!open) return;
    setState({ kind: 'loading' });
    let cancelled = false;
    getMyAccessibleProgrammesAction()
      .then((result) => {
        if (cancelled) return;
        setState({ kind: 'loaded', programmes: result.programmes });
      })
      .catch(() => {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: 'Could not load your programmes. Try again.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="programme-switcher-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Switch programme"
    >
      <div
        className="programme-switcher-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="programme-switcher-head">
          <h2>Choose a programme</h2>
          <button
            type="button"
            className="programme-switcher-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="programme-switcher-body">
          {state.kind === 'loading' && (
            <div className="programme-switcher-loading">Loading…</div>
          )}
          {state.kind === 'error' && (
            <div className="programme-switcher-error">{state.message}</div>
          )}
          {state.kind === 'loaded' && state.programmes.length === 0 && (
            <div className="programme-switcher-empty">
              No programmes available yet.
            </div>
          )}
          {state.kind === 'loaded' && state.programmes.length > 0 && (
            <ProgrammeList programmes={state.programmes} onNavigate={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}
