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
 *
 * ⚠ Not for a CAT. §13.5 forbids a raw percentage fronting an adaptive
 * sitting — go through describeOutcome() in ./derive, which knows the
 * difference between the three kinds of sitting.
 */
export function formatScore(score: number | null): string {
  if (score == null) return '—';
  return `${Math.round(score * 100)}%`;
}

/**
 * Engaged seconds → a short human duration ("8m", "1h 12m", "45s").
 *
 * Null in, null out — and that matters. Time was only recorded from the
 * time engine onward, so most older sittings have none; rendering those
 * as "0m" would claim the student finished twenty questions instantly.
 * The caller shows nothing at all instead.
 */
export function formatDuration(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;

  if (seconds < 60) return `${Math.round(seconds)}s`;

  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;

  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m`;
}

/**
 * The date a row should lead with. An unfinished sitting is described by
 * when it was last touched, not when it was created: "left off 2 days
 * ago" is the thing a student acts on, while "started 3 weeks ago" is
 * trivia about a session they abandoned mid-way.
 */
export function rowTimestamp(row: {
  status: string;
  created_at: string;
  last_activity_at: string | null;
}): { iso: string; prefix: string | null } {
  if (row.status === 'IN_PROGRESS' && row.last_activity_at) {
    return { iso: row.last_activity_at, prefix: 'Left off' };
  }
  return { iso: row.created_at, prefix: null };
}
