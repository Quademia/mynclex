// mynclex/lib/home/student/next-session-card.tsx
//
// The navy "Next live session" rail card on the Student Overview (cohort
// mode). A client component so the date / time / countdown format in the
// student's OWN timezone — matching the Sessions page (also client-side),
// not the Worker's UTC. The countdown is computed from the server-stamped
// `nowMs` (deterministic — no hydration mismatch).

'use client';

import Link from 'next/link';
import type { OverviewNextSession } from './types';

const PLATFORM_LABEL: Record<string, string> = {
  ZOOM: 'Zoom',
  GOOGLE_MEET: 'Google Meet',
  MS_TEAMS: 'Microsoft Teams',
  OTHER: 'Online',
};

function formatWhen(scheduledAt: string, durationMinutes: number | null): string {
  const start = new Date(scheduledAt);
  if (Number.isNaN(start.getTime())) return 'Date to be announced';
  const date = start.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const startTime = start.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  if (durationMinutes && durationMinutes > 0) {
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    const endTime = end.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${date} · ${startTime}–${endTime}`;
  }
  return `${date} · ${startTime}`;
}

function formatCountdown(scheduledAt: string, nowMs: number): string {
  const diff = new Date(scheduledAt).getTime() - nowMs;
  if (Number.isNaN(diff)) return '';
  if (diff <= 0) return 'now';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs} hour${hrs === 1 ? '' : 's'}`;
  const days = Math.round(hrs / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

export function NextSessionCard({
  next,
  nowMs,
  sessionsHref,
}: {
  next: OverviewNextSession | null;
  nowMs: number;
  sessionsHref: string;
}) {
  // No upcoming session — a quiet placeholder (still the navy card so the
  // rail keeps its anchor).
  if (!next) {
    return (
      <section className="sho-card sho-rail-feature">
        <div className="sho-feature-eyebrow">Live sessions</div>
        <div className="sho-feature-empty">No upcoming sessions scheduled.</div>
        <Link className="sho-feature-btn" href={sessionsHref}>
          View sessions
        </Link>
      </section>
    );
  }

  const scheduled = next.scheduledAt;
  const countdown = scheduled ? formatCountdown(scheduled, nowMs) : null;
  const platform = next.platform ? PLATFORM_LABEL[next.platform] ?? 'Online' : null;

  return (
    <section className="sho-card sho-rail-feature">
      <div className="sho-feature-eyebrow">
        Next live session{countdown ? ` · ${countdown}` : ''}
      </div>
      <div className="sho-feature-title">{next.title}</div>
      <div className="sho-feature-meta">
        {scheduled ? formatWhen(scheduled, next.durationMinutes) : 'Date to be announced'}
        {platform ? (
          <>
            <br />
            {platform}
          </>
        ) : null}
      </div>
      {next.joinUrl ? (
        <a
          className="sho-feature-btn"
          href={next.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Join session
        </a>
      ) : (
        <Link className="sho-feature-btn" href={sessionsHref}>
          Session details
        </Link>
      )}
    </section>
  );
}
