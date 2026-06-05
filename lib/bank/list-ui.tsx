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

// Per-type pill metadata — short label, square glyph letter, and a colour
// family (one hue per type, shared lightness so the set reads as a system).
// Colours sit here (not CSS) so the whole type system is in one place.
const TYPE_PILL: Record<string, { short: string; letter: string; color: string; bg: string }> = {
  MCQ:       { short: 'MCQ',       letter: 'M', color: '#1e3a5f', bg: '#e8eef5' },
  TF:        { short: 'TF',        letter: 'T', color: '#475569', bg: '#eceff3' },
  SATA:      { short: 'SATA',      letter: 'S', color: '#235f56', bg: '#dcefe9' },
  SELECT_N:  { short: 'Select N',  letter: 'N', color: '#0e7490', bg: '#d9eef2' },
  MATRIX:    { short: 'Matrix',    letter: 'G', color: '#4338ca', bg: '#e6e6fb' },
  BOWTIE:    { short: 'Bow-tie',   letter: 'B', color: '#7c3aed', bg: '#efe6fd' },
  CLOZE:     { short: 'Cloze',     letter: 'C', color: '#b45309', bg: '#fbeedb' },
  HIGHLIGHT: { short: 'Highlight', letter: 'H', color: '#be123c', bg: '#fbe2e8' },
  DRAG_DROP: { short: 'Drag-drop', letter: 'D', color: '#15803d', bg: '#ddf0e2' },
};

/** Coloured type pill — a filled square glyph + the type's short label. */
export function TypePill({ type }: { type: string }) {
  const m = TYPE_PILL[type] ?? { short: type, letter: type.charAt(0), color: '#475569', bg: '#eceff3' };
  return (
    <span className="bl-type" style={{ background: m.bg, color: m.color }}>
      <span className="bl-type-sq" style={{ background: m.color }}>{m.letter}</span>
      {m.short}
    </span>
  );
}

/** Coloured difficulty chip (Easy / Medium / Hard); — when unset. */
export function DiffChip({ difficulty }: { difficulty: string | null }) {
  if (!difficulty) return <span className="bl-cell-mid">—</span>;
  return <span className={`bl-diff bl-diff-${difficulty}`}>{difficulty}</span>;
}

/** Magnifier glyph for the toolbar search box. */
export function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
