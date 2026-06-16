// mynclex/lib/cohorts/attendance-format.ts
//
// Shared types + pure derivations for cohort live-session attendance
// (Slice 3). Plain module (no 'use server', no React) so both the server
// queries and the client pane/drawer can import it. The derivations are
// pure (take `nowMs` as an argument) — testable and reusable.
//
// Governing rule: "only verified completion counts." PRESENT derives a
// completion row; ABSENT is a real "missed it" signal; EXCUSED is removed
// from the percentage denominator (never penalised). See
// docs/product-plan/live-session-planner.md.

import type { UnitLabel } from '@/lib/programmes/types';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'EXCUSED';

export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  'PRESENT',
  'ABSENT',
  'EXCUSED',
];

export function isAttendanceStatus(v: unknown): v is AttendanceStatus {
  return v === 'PRESENT' || v === 'ABSENT' || v === 'EXCUSED';
}

export type AttendanceStudent = {
  userId: string;
  name: string;
};

export type AttendanceSession = {
  sessionId: string;
  markerActivityId: string;
  title: string;
  unitIndex: number;
  scheduledAt: string | null;
  // Effective duration (planner override ?? marker typical ?? null).
  durationMinutes: number | null;
  recordingUrl: string | null;
  // status keyed by studentId — only marked students appear.
  statuses: Record<string, AttendanceStatus>;
};

export type CohortAttendanceData = {
  cohort: { cohort_id: string; name: string | null; start_date: string };
  programme: { unit_label: UnitLabel };
  students: AttendanceStudent[];
  sessions: AttendanceSession[];
  // Request-time "now", stamped in the query (a plain async function) rather
  // than in component render — keeps held/upcoming derivations stable and
  // out of the React purity rules.
  nowMs: number;
};

// A scheduled session whose start+duration is in the past is "held" (and
// therefore markable); a future one is "upcoming"; one with no date is
// "unscheduled" (lives on the Schedule tab, never markable).
export type SessionLifecycle = 'held' | 'upcoming' | 'unscheduled';

const DEFAULT_DURATION_MIN = 90;
const MIN_MS = 60_000;

export function sessionLifecycle(
  s: { scheduledAt: string | null; durationMinutes: number | null },
  nowMs: number,
): SessionLifecycle {
  if (!s.scheduledAt) return 'unscheduled';
  const start = new Date(s.scheduledAt).getTime();
  if (Number.isNaN(start)) return 'unscheduled';
  const end = start + (s.durationMinutes ?? DEFAULT_DURATION_MIN) * MIN_MS;
  return end < nowMs ? 'held' : 'upcoming';
}

export type SessionTally = {
  present: number;
  absent: number;
  excused: number;
  // Denominator = present + absent (excused excluded).
  denom: number;
  pct: number;
  // The register has been started (≥1 student marked, on the current roster).
  marked: boolean;
};

export function sessionTally(
  session: AttendanceSession,
  studentIds: string[],
): SessionTally {
  let present = 0;
  let absent = 0;
  let excused = 0;
  for (const id of studentIds) {
    const st = session.statuses[id];
    if (st === 'PRESENT') present += 1;
    else if (st === 'ABSENT') absent += 1;
    else if (st === 'EXCUSED') excused += 1;
  }
  const denom = present + absent;
  return {
    present,
    absent,
    excused,
    denom,
    pct: denom ? Math.round((present / denom) * 100) : 0,
    marked: present + absent + excused > 0,
  };
}

export type CohortAttendanceStats = {
  heldCount: number;
  scheduledCount: number;
  markedHeldCount: number;
  // Mean of per-session attendance % over marked, held sessions. null when
  // none marked yet.
  avgPct: number | null;
  next: AttendanceSession | null;
};

export function cohortAttendanceStats(
  sessions: AttendanceSession[],
  students: AttendanceStudent[],
  nowMs: number,
): CohortAttendanceStats {
  const ids = students.map((s) => s.userId);
  const scheduled = sessions.filter(
    (s) => sessionLifecycle(s, nowMs) !== 'unscheduled',
  );
  const held = scheduled.filter((s) => sessionLifecycle(s, nowMs) === 'held');
  const markedHeld = held.filter((s) => sessionTally(s, ids).marked);
  const avgPct = markedHeld.length
    ? Math.round(
        markedHeld.reduce((acc, s) => acc + sessionTally(s, ids).pct, 0) /
          markedHeld.length,
      )
    : null;
  const upcoming = sessions
    .filter((s) => sessionLifecycle(s, nowMs) === 'upcoming')
    .sort(
      (a, b) =>
        new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime(),
    );
  return {
    heldCount: held.length,
    scheduledCount: scheduled.length,
    markedHeldCount: markedHeld.length,
    avgPct,
    next: upcoming[0] ?? null,
  };
}

export type EngagementFlag = {
  userId: string;
  name: string;
  missed: number;
};

// Students absent from ≥ threshold marked, held sessions — the tutor's
// "reach out" signal. Excused absences never count.
export function engagementFlags(
  sessions: AttendanceSession[],
  students: AttendanceStudent[],
  nowMs: number,
  threshold = 2,
): EngagementFlag[] {
  const held = sessions.filter((s) => sessionLifecycle(s, nowMs) === 'held');
  const flags: EngagementFlag[] = [];
  for (const stu of students) {
    let missed = 0;
    for (const s of held) {
      if (s.statuses[stu.userId] === 'ABSENT') missed += 1;
    }
    if (missed >= threshold) {
      flags.push({ userId: stu.userId, name: stu.name, missed });
    }
  }
  return flags.sort((a, b) => b.missed - a.missed);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase() || '?';
}
