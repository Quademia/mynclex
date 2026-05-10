// mynclex/lib/practice/history/format.ts
//
// Display helpers for the History table. Pure functions — no I/O.

/**
 * ISO timestamp → relative date string for the When column.
 *   Today      → "Today · 14:22"
 *   Yesterday  → "Yesterday · 09:14"
 *   This year  → "Apr 30"
 *   Older      → "Apr 30, 2025"
 */
export function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();

  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  if (sameDay) return `Today · ${time}`;
  if (isYesterday) return `Yesterday · ${time}`;

  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(
    [],
    sameYear
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' }
  );
}

/**
 * final_score (0–1) → percentage string. Null score → em-dash.
 */
export function formatScore(score: number | null): string {
  if (score == null) return '—';
  return `${Math.round(score * 100)}%`;
}
