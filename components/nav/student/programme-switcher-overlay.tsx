// mynclex/components/nav/student/programme-switcher-overlay.tsx
//
// Slice 10.1 — shared overlay opened from three triggers:
//   1. Picker "My Programmes" card
//   2. Topbar Programme pill (ProductSwitcher)
//   3. Sidebar "Switch programme" button (programme + cohort shells)
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

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  getMyAccessibleProgrammesAction,
  type SwitcherProgramme,
} from '@/lib/programmes/student-actions';

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
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const [, startTransition] = useTransition();

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

  function go(href: string) {
    startTransition(() => {
      router.push(href);
      onClose();
    });
  }

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
            <ul className="programme-switcher-list">
              {state.programmes.map((p) => {
                const unitNoun =
                  p.unit_label === 'WEEK' ? 'weeks' : 'modules';
                const meta = `${p.length_units} ${unitNoun} · ${
                  p.delivery_mode === 'SELF_PACED' ? 'Self-paced' : 'Tutor-led'
                }`;

                if (p.delivery_mode === 'SELF_PACED') {
                  return (
                    <li key={p.programme_id}>
                      <button
                        type="button"
                        className="programme-switcher-item is-clickable"
                        onClick={() =>
                          go(`/student/programme/${p.programme_id}/curriculum`)
                        }
                      >
                        <div className="programme-switcher-item-title">
                          {p.title}
                        </div>
                        {p.tagline && (
                          <div className="programme-switcher-item-tagline">
                            {p.tagline}
                          </div>
                        )}
                        <div className="programme-switcher-item-meta">
                          {meta}
                        </div>
                      </button>
                    </li>
                  );
                }

                // TUTOR_LED — programme card is informational; cohorts
                // below are the clickable rows.
                return (
                  <li key={p.programme_id}>
                    <div className="programme-switcher-item">
                      <div className="programme-switcher-item-title">
                        {p.title}
                      </div>
                      {p.tagline && (
                        <div className="programme-switcher-item-tagline">
                          {p.tagline}
                        </div>
                      )}
                      <div className="programme-switcher-item-meta">{meta}</div>
                      {p.cohorts.length === 0 ? (
                        <div className="programme-switcher-cohorts-empty">
                          No cohorts scheduled yet.
                        </div>
                      ) : (
                        <ul className="programme-switcher-cohorts">
                          {p.cohorts.map((c) => (
                            <li key={c.cohort_id}>
                              <button
                                type="button"
                                className="programme-switcher-cohort"
                                onClick={() =>
                                  go(
                                    `/student/cohort/${c.cohort_id}/curriculum`
                                  )
                                }
                              >
                                <span className="programme-switcher-cohort-name">
                                  {c.name ??
                                    `${c.start_date} → ${c.end_date}`}
                                </span>
                                <span className="programme-switcher-cohort-dates">
                                  {c.start_date} → {c.end_date}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
