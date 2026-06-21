// mynclex/lib/cohorts/roster-drawer.tsx
//
// RosterDrawer — a generic, body-portaled right-side slide-over for
// "mark a status for each person across a roster." Built for the
// live-session attendance roster sweep (Slice 3), but deliberately
// decoupled from attendance: it knows nothing about sessions, students,
// or PRESENT/ABSENT. The caller passes the people, their current status,
// the available options, and callbacks; the drawer owns the chrome
// (backdrop · panel · header · scroll · sticky footer), the per-row
// layout (avatar · name · segmented control), "mark all", and close
// behaviour (backdrop click / ✕ / Escape).
//
// Per-option colour is delegated to the caller via optionClassName so the
// drawer stays visual-language-agnostic — any future "roster marking"
// surface can reuse it as-is. Lives in lib/cohorts/ for now (its only
// caller); lift to a shared folder when a second consumer appears.

'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export type RosterPerson = {
  id: string;
  name: string;
  /** Optional override; computed from name when omitted. */
  initials?: string;
};

export type RosterOption = {
  value: string;
  label: string;
  /** title/aria for an icon-only (short label) button. */
  title?: string;
};

export type RosterDrawerProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** e.g. "10 of 12 present · 1 excused". */
  summary?: React.ReactNode;
  /** A line above the list, e.g. "Tap a status for each student." */
  modeNote?: string;
  people: RosterPerson[];
  /** personId → option.value (absent key = unmarked). */
  statuses: Record<string, string>;
  options: RosterOption[];
  /** Class for an option button given its value + whether it's selected. */
  optionClassName: (value: string, active: boolean) => string;
  onMark: (personId: string, value: string) => void;
  onMarkAll?: () => void;
  markAllLabel?: string;
  footerNote?: string;
  onClose: () => void;
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase() || '?';
}

export function RosterDrawer({
  eyebrow,
  title,
  subtitle,
  summary,
  modeNote,
  people,
  statuses,
  options,
  optionClassName,
  onMark,
  onMarkAll,
  markAllLabel,
  footerNote,
  onClose,
}: RosterDrawerProps) {
  // Escape closes; backdrop click closes (see onClick below).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The caller gates this drawer behind a click (open state starts closed),
  // so it never renders during SSR and document is always available. The
  // belt-and-braces guard keeps createPortal safe (matches the audit /
  // payment drawers).
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="rd-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="rd-panel">
        <header className="rd-head">
          <div className="rd-head-row">
            <div className="rd-head-text">
              {eyebrow && <div className="rd-eyebrow">{eyebrow}</div>}
              <h2 className="rd-title">{title}</h2>
              {subtitle && <div className="rd-subtitle">{subtitle}</div>}
            </div>
            <button
              type="button"
              className="rd-close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          {summary != null && <div className="rd-summary">{summary}</div>}
        </header>

        {(modeNote || onMarkAll) && (
          <div className="rd-subbar">
            {modeNote && <span className="rd-modenote">{modeNote}</span>}
            {onMarkAll && (
              <button type="button" className="rd-markall" onClick={onMarkAll}>
                {markAllLabel ?? 'Mark all'}
              </button>
            )}
          </div>
        )}

        <div className="rd-list">
          {people.map((p) => {
            const current = statuses[p.id];
            return (
              <div key={p.id} className="rd-row">
                <span className="rd-avatar">{p.initials ?? initialsFrom(p.name)}</span>
                <span className="rd-name">{p.name}</span>
                <div className="rd-seg" role="group" aria-label={`Status for ${p.name}`}>
                  {options.map((o) => {
                    const active = current === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        className={optionClassName(o.value, active)}
                        aria-pressed={active}
                        title={o.title ?? o.label}
                        onClick={() => onMark(p.id, o.value)}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {people.length === 0 && (
            <p className="rd-empty">No one on the roster yet.</p>
          )}
        </div>

        <footer className="rd-foot">
          {footerNote && <span className="rd-footnote">{footerNote}</span>}
          <button type="button" className="rd-done" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
