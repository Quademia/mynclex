// mynclex/lib/practice/launchers/resume-banner.tsx
//
// Pure presentation. Renders the warm-amber Resume banner above the
// Builder's tab strip when the student has an unfinished session of
// any intent (slice 4.6b — was STUDY-only before; EXAM became
// resumable in 4.5a per attempt-creation §6.1.3 revised). Behaviour
// callbacks (onResume, onStartFresh) are passed in — this component
// knows nothing about routes or RPCs.
//
// Sub-line copy is mode-aware: timed attempts get a "clock kept
// running" framing, untimed attempts a softer "pick up where you
// left off." The data fetch in get-resumable-attempt.ts excludes
// CAT (which can't be resumed) — this component renders whatever
// it's given.

'use client';

import type { ResumableAttempt } from './types';

const TIMED_MODES: ReadonlyArray<ResumableAttempt['mode']> = [
  'TIMED_FREE_NAV',
  'TIMED_SEQUENTIAL',
];

interface ResumeBannerProps {
  attempt: ResumableAttempt;
  onResume: () => void;
  /** Discards the unfinished attempt + dismisses the banner. */
  onStartFresh: () => Promise<void> | void;
  /** True while the Start-fresh discard is in flight. */
  pending?: boolean;
}

export function ResumeBanner({
  attempt,
  onResume,
  onStartFresh,
  pending = false,
}: ResumeBannerProps) {
  const when = formatWhen(attempt.last_activity_at);
  const isTimed = TIMED_MODES.includes(attempt.mode);

  return (
    <div className="bk-resume" role="status">
      <div className="bk-resume-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </div>
      <div className="bk-resume-body">
        <div className="bk-resume-head">
          You have an unfinished quiz from {when} — {attempt.done} of {attempt.total} done.
        </div>
        <div className="bk-resume-sub">
          {isTimed
            ? 'Resume soon — the clock kept running while you were away.'
            : 'Pick up exactly where you left off.'}
        </div>
      </div>
      <div className="bk-resume-actions">
        <button
          type="button"
          className="btn btn-accent btn-sm"
          onClick={onResume}
          disabled={pending}
        >
          Resume →
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => { void onStartFresh(); }}
          disabled={pending}
        >
          {pending ? 'Discarding…' : 'Start fresh'}
        </button>
      </div>
    </div>
  );
}

/**
 * Compact "from {when}" formatter. Returns relative for recent
 * activity (under 24h) and an absolute date+time otherwise.
 *
 * Examples: "just now", "12 minutes ago", "3 hours ago",
 * "yesterday at 14:32", "Mon, Apr 28 at 14:32".
 */
function formatWhen(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const mins = Math.floor(diffMs / 60_000);

  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins} minute${mins === 1 ? '' : 's'} ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  // Older than 24h — date + time
  const sameYear = then.getFullYear() === now.getFullYear();
  const dayLabel = sameYear
    ? then.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : then.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const timeLabel = then.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${dayLabel} at ${timeLabel}`;
}
