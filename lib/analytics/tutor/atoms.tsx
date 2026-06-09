// mynclex/lib/analytics/tutor/atoms.tsx
//
// Presentational atoms for the cohort analytics dashboard (ported from the
// CD handoff's components.jsx). Pure — no state — so they compose freely
// inside the client view. Styling lives in styles/analytics.css (.an-*).

import type { CompletionStatus } from './types';
import type { ActivityType } from '@/lib/curriculum/types';

/** Per-type label + glyph for the activity list / drawer timeline. */
export const ACTIVITY_META: Record<
  ActivityType,
  { label: string; glyph: string; quiz: boolean }
> = {
  TEXT: { label: 'Reading', glyph: '¶', quiz: false },
  PDF: { label: 'PDF', glyph: '⎙', quiz: false },
  EXTERNAL_LINK: { label: 'Link', glyph: '↗', quiz: false },
  ONLINE_LIVE_SESSION: { label: 'Live session', glyph: '◉', quiz: false },
  LIBRARY_NOTE: { label: 'Library note', glyph: '❏', quiz: false },
  SHELF: { label: 'Shelf', glyph: '▤', quiz: false },
  MOCK: { label: 'Mock', glyph: '◆', quiz: true },
  PRACTICE_QUIZ: { label: 'Practice quiz', glyph: '◇', quiz: true },
};

export const STATUS_LABEL: Record<CompletionStatus, string> = {
  ontrack: 'On track',
  behind: 'Behind',
  risk: 'At risk',
  notstarted: 'Not started',
};

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function Avatar({ name }: { name: string }) {
  return <span className="an-avatar" aria-hidden>{initials(name)}</span>;
}

/** SVG donut showing a 0–100 percentage. */
export function Dial({
  pct,
  size = 104,
  stroke = 11,
}: {
  pct: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * circ;
  const c = size / 2;
  return (
    <div className="an-dial" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--bg-soft)" strokeWidth={stroke} />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
      <div className="pct">
        <b>{pct}%</b>
        <span>avg complete</span>
      </div>
    </div>
  );
}

/** Tiny line chart of a values series (weekly completion volume). */
export function Sparkline({
  values,
  w = 120,
  h = 28,
}: {
  values: number[];
  w?: number;
  h?: number;
}) {
  if (values.length === 0) return <svg width={w} height={h} />;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const pts = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`)
    .join(' ');
  const last = values[values.length - 1];
  const lastX = (values.length - 1) * step;
  const lastY = h - (last / max) * (h - 4) - 2;
  return (
    <svg width={w} height={h} aria-hidden>
      {values.length > 1 && (
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      )}
      <circle cx={lastX} cy={lastY} r={2.5} fill="var(--accent)" />
    </svg>
  );
}

export function CompletionBar({ pct, status }: { pct: number; status: CompletionStatus }) {
  return (
    <div className="an-bar">
      <div className="track">
        <div className={`fill an-fill-${status}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="pct">{pct}%</span>
    </div>
  );
}

export function StatusPill({ status }: { status: CompletionStatus }) {
  return <span className={`an-pill ${status}`}>{STATUS_LABEL[status]}</span>;
}

/**
 * Quiz score chip (Phase 2, teal). pass: true → green, false → red,
 * null → neutral teal (ungraded). score null → faint dash.
 */
export function ScoreChip({
  score,
  pass = null,
}: {
  score: number | null;
  pass?: boolean | null;
}) {
  if (score == null) return <span className="an-score none">—</span>;
  const tone = pass === true ? 'pass' : pass === false ? 'fail' : 'ungraded';
  return <span className={`an-score ${tone}`}>{score}%</span>;
}
