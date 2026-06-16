// mynclex/lib/cohorts/student/sessions-format.ts
//
// Shared types + pure derivations for the STUDENT "My sessions" page
// (Slice 3b). Plain module (no 'use server', no React) so both the query
// and the client view import it. Reuses the cohort-side attendance helpers
// (sessionLifecycle, AttendanceStatus) — a student session is the same
// planner row, seen from the student's side with their own status attached.

import { sessionLifecycle } from '../attendance-format';
import type { AttendanceStatus } from '../attendance-format';
import type { LiveSessionPlatform } from '@/lib/curriculum/types';
import type { UnitLabel } from '@/lib/programmes/types';

export type { AttendanceStatus } from '../attendance-format';

// One scheduled session as the student sees it — the planner's connection
// details + their own tutor-marked attendance.
export type StudentSession = {
  sessionId: string;
  title: string;
  unitIndex: number;
  scheduledAt: string | null;
  durationMinutes: number | null;
  platform: LiveSessionPlatform | null;
  joinUrl: string | null;
  meetingId: string | null;
  passcode: string | null;
  joiningInstructions: string | null;
  recordingUrl: string | null;
  // The student's own tutor-marked status; null = not (yet) marked.
  myStatus: AttendanceStatus | null;
};

export type StudentSessionsData = {
  cohort: { cohortId: string; name: string | null; programmeTitle: string };
  unitLabel: UnitLabel;
  sessions: StudentSession[];
  // Request-time "now", stamped in the query (keeps held/upcoming stable).
  nowMs: number;
};

// The student's attendance record — only counts sessions the tutor has
// marked. Excused sessions are tracked but kept OUT of the "of N held"
// denominator (never penalised). Mirrors the CD prototype's record card.
export type StudentAttendanceRecord = {
  attended: number; // PRESENT
  held: number; // PRESENT + ABSENT (excused excluded)
  excused: number;
  streak: number; // consecutive PRESENT from most recent marked, back
};

export function studentAttendanceRecord(
  sessions: StudentSession[],
): StudentAttendanceRecord {
  let attended = 0;
  let held = 0;
  let excused = 0;
  for (const s of sessions) {
    if (s.myStatus == null) continue;
    if (s.myStatus === 'EXCUSED') {
      excused += 1;
      continue;
    }
    held += 1;
    if (s.myStatus === 'PRESENT') attended += 1;
  }
  return { attended, held, excused, streak: studentStreak(sessions) };
}

// Consecutive PRESENT from the most recent marked session backwards,
// skipping EXCUSED, breaking on the first ABSENT.
function studentStreak(sessions: StudentSession[]): number {
  const marked = sessions
    .filter((s) => s.myStatus != null && s.scheduledAt != null)
    .sort(
      (a, b) =>
        new Date(b.scheduledAt!).getTime() - new Date(a.scheduledAt!).getTime(),
    );
  let streak = 0;
  for (const s of marked) {
    if (s.myStatus === 'EXCUSED') continue;
    if (s.myStatus === 'PRESENT') streak += 1;
    else break;
  }
  return streak;
}

// The soonest upcoming session (for the next-session panel).
export function nextStudentSession(
  sessions: StudentSession[],
  nowMs: number,
): StudentSession | null {
  const upcoming = sessions
    .filter((s) => sessionLifecycle(s, nowMs) === 'upcoming')
    .sort(
      (a, b) =>
        new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime(),
    );
  return upcoming[0] ?? null;
}
