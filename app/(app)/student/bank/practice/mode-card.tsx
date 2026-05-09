// mynclex/app/(app)/student/bank/practice/mode-card.tsx
//
// The rich Mode card from the design — adopted as-is conceptually.
// Three pills under the mode name showing Clock / Feedback / Nav so
// the student sees what each mode actually means without reading docs.
//
// Beyond §17 of the planning doc but a clear improvement — keep.

'use client';

import type { ModeDef } from '@/lib/practice/builder/filter-config';

interface ModeCardProps {
  mode: ModeDef;
  active: boolean;
  onClick: () => void;
}

export function ModeCard({ mode, active, onClick }: ModeCardProps) {
  const clockLabel =
    mode.clock === 'engagement' ? 'Engagement-clock'
    : mode.clock === 'wall'     ? 'Wall-clock'
    :                              'No clock';

  return (
    <button
      type="button"
      onClick={onClick}
      className={'bk-mode-card' + (active ? ' on' : '')}
    >
      <div className="bk-mode-row">
        <span className="bk-mode-icon">
          <ModeIcon id={mode.id} />
        </span>
        <span className="bk-mode-label">{mode.label}</span>
        {active && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12l3 3 5-6" />
          </svg>
        )}
      </div>
      <div className="bk-mode-pills">
        <span className={'bk-pill clock-' + mode.clock}>{clockLabel}</span>
        <span className="bk-pill feedback">Feedback: {mode.feedback}</span>
        <span className="bk-pill nav">Nav: {mode.nav}</span>
      </div>
      <div className="bk-mode-desc">{mode.desc}</div>
    </button>
  );
}

function ModeIcon({ id }: { id: string }) {
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (id === 'UNTIMED_LEARNING')
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
        <path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2zM22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8z" />
      </svg>
    );
  if (id === 'UNTIMED_TEST')
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  if (id === 'TIMED_FREE_NAV')
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5M9 2h6" />
      </svg>
    );
  if (id === 'TIMED_SEQUENTIAL')
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5M9 2h6M16 13h-4" />
      </svg>
    );
  if (id === 'CAT')
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
        <path d="M3 17l4-6 4 4 5-8 5 7" />
        <circle cx="3" cy="17" r="1.4" fill="currentColor" />
      </svg>
    );
  return null;
}
