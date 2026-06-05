// mynclex/lib/bank/list-ui.tsx
//
// Shared presentational primitives for the redesigned bank LIST surfaces
// (Trend datasets, Case studies, and — later — the Question Bank). Extracted
// from the Trends client once the Cases list became the second consumer.
//
// Styles: styles/bank-list.css (`bl-*`). These are pure presentational
// helpers — safe to use from any client list component.

import type { ReactNode } from 'react';

/**
 * Attached-question breakdown for a wrapper row: the count, a mini progress
 * bar, and published/draft pills.
 *
 *   total     — questions attached to this wrapper
 *   published — how many of them are published (live)
 *   denom     — optional fixed slot count; cases pass 6 ("N of 6", bar ÷ 6).
 *               Trends omit it (open-ended, bar ÷ total).
 */
export function AttachedBar({
  total,
  published,
  denom,
}: {
  total: number;
  published: number;
  denom?: number;
}) {
  const pct = total ? Math.round((published / (denom ?? total)) * 100) : 0;
  const draft = Math.max(0, total - published);
  return (
    <span className="bl-attbar">
      <span className="count">{total}{denom ? ` of ${denom}` : ''}</span>
      <span className="bl-minibar"><span className="fill" style={{ width: `${pct}%` }} /></span>
      {published > 0 && <span className="bl-qpill pub">{published} published</span>}
      {draft > 0 && <span className="bl-qpill draft">{draft} draft</span>}
    </span>
  );
}

/**
 * Delivery health — does this wrapper actually reach students?
 *   ok    → published & delivering (✓ Live)
 *   warn  → published but reaches nobody (▲ <reason>)
 *   ghost → draft; health N/A (—)
 */
export function HealthFlag({ state, text }: { state: 'ok' | 'warn' | 'ghost'; text?: ReactNode }) {
  if (state === 'ok') return <span className="bl-health ok"><span className="ico">✓</span>{text ?? 'Live'}</span>;
  if (state === 'ghost') return <span className="bl-health ghost">{text ?? '—'}</span>;
  return <span className="bl-health"><span className="ico">▲</span>{text}</span>;
}

/** Magnifier glyph for the toolbar search box. */
export function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
