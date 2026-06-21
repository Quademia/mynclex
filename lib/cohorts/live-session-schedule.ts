// mynclex/lib/cohorts/live-session-schedule.ts
//
// Shared (non-'use server') validation for a live-session planner schedule.
// Used by BOTH setLiveSessionScheduleAction (edit) and
// createCohortOnlyLiveSessionAction (the atomic "+ Add session" create), so
// the rules live in one place. Kept out of the 'use server' action files
// because those may only export async Server Actions.
//
// URLs are FORGIVING: a bare host like "zoom.com" gets an implicit
// "https://" so tutors don't have to type the scheme. We still validate the
// result is a real http(s) link — the join URL becomes a clickable button
// for students, so a non-web scheme (javascript:, etc.) must be rejected.

import { validateHttpUrl, validateScheduledAt } from '@/lib/curriculum/activity-payload';
import type { LiveSessionPlatform } from '@/lib/curriculum/types';

export type LiveSessionScheduleInput = {
  scheduledAt: string | null; // UTC ISO, or null = no date set yet
  durationMinutes: number | null;
  platform: LiveSessionPlatform | null;
  joinUrl: string | null;
  meetingId: string | null;
  passcode: string | null;
  joiningInstructions: string | null;
  recordingUrl: string | null;
};

// The validated DB column shape for nclex_cohort_live_sessions (minus the
// keys + updated_at, which the actions add).
export type LiveSessionScheduleRow = {
  scheduled_at: string | null;
  duration_minutes: number | null;
  platform: LiveSessionPlatform | null;
  join_url: string | null;
  meeting_id: string | null;
  passcode: string | null;
  joining_instructions: string | null;
  recording_url: string | null;
};

const PLATFORMS: ReadonlySet<LiveSessionPlatform> = new Set<LiveSessionPlatform>([
  'ZOOM',
  'GOOGLE_MEET',
  'MS_TEAMS',
  'OTHER',
]);

function cleanText(v: string | null, max: number): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t.slice(0, max);
}

// Add an implicit https:// to a bare host/path. Anything that already
// carries a scheme (http:, https:, or — so it can be rejected —
// javascript: etc.) is left untouched for validateHttpUrl to judge.
export function normalizeUrl(value: string): string {
  const t = value.trim();
  if (t === '') return t;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return t; // already has a scheme
  return `https://${t}`;
}

export function validateScheduleInput(
  input: LiveSessionScheduleInput
):
  | { ok: true; row: LiveSessionScheduleRow }
  | { ok: false; error: string } {
  let scheduledIso: string | null = null;
  if (input.scheduledAt != null && input.scheduledAt.trim() !== '') {
    const when = validateScheduledAt(input.scheduledAt);
    if (!when.ok) return { ok: false, error: when.error };
    scheduledIso = when.iso;
  }

  let duration: number | null = null;
  if (input.durationMinutes != null) {
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
      return {
        ok: false,
        error: 'Duration must be a positive whole number of minutes.',
      };
    }
    duration = input.durationMinutes;
  }

  let platform: LiveSessionPlatform | null = null;
  if (input.platform != null) {
    if (!PLATFORMS.has(input.platform)) {
      return { ok: false, error: 'Unknown meeting platform.' };
    }
    platform = input.platform;
  }

  let joinUrl: string | null = null;
  if (input.joinUrl != null && input.joinUrl.trim() !== '') {
    const u = validateHttpUrl(normalizeUrl(input.joinUrl), 'Join URL');
    if (!u.ok) return { ok: false, error: u.error };
    joinUrl = u.url;
  }

  let recordingUrl: string | null = null;
  if (input.recordingUrl != null && input.recordingUrl.trim() !== '') {
    const u = validateHttpUrl(normalizeUrl(input.recordingUrl), 'Recording URL');
    if (!u.ok) return { ok: false, error: u.error };
    recordingUrl = u.url;
  }

  return {
    ok: true,
    row: {
      scheduled_at: scheduledIso,
      duration_minutes: duration,
      platform,
      join_url: joinUrl,
      meeting_id: cleanText(input.meetingId, 200),
      passcode: cleanText(input.passcode, 200),
      joining_instructions: cleanText(input.joiningInstructions, 2000),
      recording_url: recordingUrl,
    },
  };
}
