// mynclex/lib/cohorts/cohort-attendance-client.tsx
//
// Client island for the Sessions → Attendance sub-tab (Slice 3, roster
// sweep). Renders the summary band (next / held / avg attendance), the
// "missed ≥2 sessions" engagement flags, and the list of held sessions to
// mark. Each session opens the reusable RosterDrawer; marks persist via
// server actions with optimistic local state, and the pane refreshes on
// drawer close so the summary recomputes.
//
// Built faithfully to the CD prototype, on app tokens (navy = --primary,
// teal = --accent).

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { unitLabel } from '@/lib/curriculum/format';
import { ErrorToast } from '@/lib/toast/error-toast';
import { RosterDrawer } from './roster-drawer';
import type { RosterOption } from './roster-drawer';
import {
  markAttendanceAction,
  markAllPresentAction,
} from './attendance-actions';
import {
  cohortAttendanceStats,
  engagementFlags,
  initialsOf,
  sessionLifecycle,
  sessionTally,
} from './attendance-format';
import type {
  AttendanceSession,
  AttendanceStatus,
  CohortAttendanceData,
} from './attendance-format';

const STATUS_OPTIONS: RosterOption[] = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'EXCUSED', label: 'Excused' },
];

function optionClassName(value: string, active: boolean): string {
  return `att-opt att-opt--${value.toLowerCase()}${active ? ' is-active' : ''}`;
}

// ── date helpers (client-side; user locale) ──────────────────────────────
function parse(iso: string | null): Date | null {
  if (!iso) return null;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}
function dayNum(iso: string | null): string {
  const dt = parse(iso);
  return dt ? dt.toLocaleDateString(undefined, { day: 'numeric' }) : '—';
}
function monthShort(iso: string | null): string {
  const dt = parse(iso);
  return dt ? dt.toLocaleDateString(undefined, { month: 'short' }) : 'TBA';
}
function whenLong(iso: string | null): string {
  const dt = parse(iso);
  return dt
    ? dt.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Not scheduled';
}
function whenShort(iso: string | null): string {
  const dt = parse(iso);
  return dt
    ? dt.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : '—';
}
function timeStr(iso: string | null): string {
  const dt = parse(iso);
  return dt ? dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
}
function countdown(iso: string | null, nowMs: number): string {
  const dt = parse(iso);
  if (!dt) return 'Date TBA';
  const diff = dt.getTime() - nowMs;
  if (diff <= 0) return 'Now';
  const min = Math.round(diff / 60000);
  if (min < 60) return `In ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `In ${hr} ${hr === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hr / 24);
  return `In ${days} ${days === 1 ? 'day' : 'days'}`;
}

export function CohortAttendanceClient({
  cohortId,
  data,
  nowMs,
}: {
  cohortId: string;
  data: CohortAttendanceData;
  nowMs: number;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<
    Record<string, Record<string, AttendanceStatus>>
  >({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const ids = data.students.map((s) => s.userId);
  const unitKind = data.programme.unit_label;
  const total = data.students.length;

  // Merge an optimistic override map over the server statuses.
  function effective(session: AttendanceSession): Record<string, AttendanceStatus> {
    return { ...session.statuses, ...(overrides[session.sessionId] ?? {}) };
  }

  function setOverride(
    sessionId: string,
    studentId: string,
    value: AttendanceStatus | null,
  ) {
    setOverrides((o) => {
      const sess = { ...(o[sessionId] ?? {}) };
      if (value === null) delete sess[studentId];
      else sess[studentId] = value;
      return { ...o, [sessionId]: sess };
    });
  }

  function mark(session: AttendanceSession, studentId: string, value: string) {
    if (value !== 'PRESENT' && value !== 'ABSENT' && value !== 'EXCUSED') return;
    const status = value;
    const prev = effective(session)[studentId] ?? null;
    setOverride(session.sessionId, studentId, status);
    startTransition(async () => {
      const res = await markAttendanceAction(session.sessionId, studentId, status);
      if (!res.ok) {
        setOverride(session.sessionId, studentId, prev);
        setError(res.error);
      }
    });
  }

  function markAll(session: AttendanceSession) {
    const prev = overrides[session.sessionId];
    setOverrides((o) => ({
      ...o,
      [session.sessionId]: Object.fromEntries(
        ids.map((id) => [id, 'PRESENT' as AttendanceStatus]),
      ),
    }));
    startTransition(async () => {
      const res = await markAllPresentAction(cohortId, session.sessionId);
      if (!res.ok) {
        setOverrides((o) => ({ ...o, [session.sessionId]: prev ?? {} }));
        setError(res.error);
      }
    });
  }

  function closeDrawer() {
    setOpenId(null);
    router.refresh();
  }

  // Merged view for all derivations.
  const merged: AttendanceSession[] = data.sessions.map((s) => ({
    ...s,
    statuses: effective(s),
  }));
  const stats = cohortAttendanceStats(merged, data.students, nowMs);
  const flags = engagementFlags(merged, data.students, nowMs);
  const heldDesc = merged
    .filter((s) => sessionLifecycle(s, nowMs) === 'held')
    .sort(
      (a, b) =>
        (b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0) -
        (a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0),
    );

  const openSession = openId
    ? merged.find((s) => s.sessionId === openId) ?? null
    : null;
  const openTally = openSession ? sessionTally(openSession, ids) : null;

  return (
    <div className="att">
      {/* ── summary band ── */}
      <div className="att-band">
        <div className="att-next">
          <div className="att-next-eyebrow">Next session</div>
          {stats.next ? (
            <>
              <div className="att-next-title">{stats.next.title}</div>
              <div className="att-next-when">
                {whenLong(stats.next.scheduledAt)} · {timeStr(stats.next.scheduledAt)}
              </div>
              <span className="att-next-countdown">
                {countdown(stats.next.scheduledAt, nowMs)}
              </span>
            </>
          ) : (
            <div className="att-next-none">No upcoming sessions scheduled.</div>
          )}
        </div>

        <div className="att-stat">
          <div className="att-stat-label">Sessions held</div>
          <div className="att-stat-num">{stats.heldCount}</div>
          <div className="att-stat-sub">of {stats.scheduledCount} scheduled</div>
        </div>

        <div className="att-stat">
          <div className="att-stat-label">Avg. attendance</div>
          <div className="att-stat-num att-stat-num-green">
            {stats.avgPct == null ? '—' : `${stats.avgPct}%`}
          </div>
          <div className="att-stat-sub">across marked sessions</div>
        </div>
      </div>

      {/* ── engagement flags ── */}
      {flags.length > 0 && (
        <div className="att-flags">
          <div className="att-flags-head">
            <span aria-hidden>⚠️</span>
            <span>
              {flags.length} {flags.length === 1 ? 'student has' : 'students have'}{' '}
              missed 2 or more sessions
            </span>
          </div>
          <div className="att-flags-chips">
            {flags.map((f) => (
              <span key={f.userId} className="att-flag-chip">
                <span className="att-flag-avatar">{initialsOf(f.name)}</span>
                <span className="att-flag-name">{f.name}</span>
                <span className="att-flag-missed">{f.missed} missed</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── sessions to mark ── */}
      <div className="att-section-label">Sessions to mark</div>
      {heldDesc.length === 0 ? (
        <div className="att-empty">
          <p className="att-empty-title">No sessions to mark yet.</p>
          <p className="att-empty-sub">
            Attendance opens once a scheduled session&apos;s time has passed.
            Schedule sessions on the Schedule tab.
          </p>
        </div>
      ) : (
        <ul className="att-list">
          {heldDesc.map((s) => {
            const tally = sessionTally(s, ids);
            return (
              <li
                key={s.sessionId}
                className={tally.marked ? 'att-card' : 'att-card att-card-pending'}
              >
                <div className="att-card-date">
                  <span className="att-card-week">
                    {unitLabel(s.unitIndex, unitKind)}
                  </span>
                  <span className="att-card-day">{dayNum(s.scheduledAt)}</span>
                  <span className="att-card-month">{monthShort(s.scheduledAt)}</span>
                </div>

                <div className="att-card-main">
                  <div className="att-card-title">{s.title}</div>
                  <div className="att-card-when">
                    <span>
                      {whenShort(s.scheduledAt)} · {timeStr(s.scheduledAt)}
                    </span>
                    <span
                      className={
                        s.recordingUrl
                          ? 'att-rec att-rec-on'
                          : 'att-rec att-rec-off'
                      }
                    >
                      {s.recordingUrl ? '● Recording' : '○ No recording'}
                    </span>
                  </div>
                </div>

                <div className="att-card-actions">
                  {tally.marked ? (
                    <div className="att-card-result">
                      <div className="att-card-present">
                        {tally.present} of {total} present
                      </div>
                      <span className="att-rate">
                        <span
                          className="att-rate-fill"
                          style={{
                            width: `${total ? Math.round((tally.present / total) * 100) : 0}%`,
                          }}
                        />
                      </span>
                    </div>
                  ) : (
                    <span className="att-pending-pill">Attendance pending</span>
                  )}
                  <button
                    type="button"
                    className={
                      tally.marked
                        ? 'prog-btn prog-btn-ghost'
                        : 'prog-btn prog-btn-primary'
                    }
                    onClick={() => setOpenId(s.sessionId)}
                  >
                    {tally.marked ? 'Edit attendance' : 'Take attendance'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {openSession && openTally && (
        <RosterDrawer
          eyebrow={`${unitLabel(openSession.unitIndex, unitKind)} · take attendance`}
          title={openSession.title}
          subtitle={whenLong(openSession.scheduledAt)}
          summary={
            <>
              {openTally.present} of {total} present
              {openTally.excused > 0 && ` · ${openTally.excused} excused`}
            </>
          }
          modeNote="Mark all present, then un-tick the no-shows."
          people={data.students.map((s) => ({ id: s.userId, name: s.name }))}
          statuses={effective(openSession)}
          options={STATUS_OPTIONS}
          optionClassName={optionClassName}
          onMark={(studentId, value) => mark(openSession, studentId, value)}
          onMarkAll={() => markAll(openSession)}
          markAllLabel="Mark all present"
          footerNote="Saved automatically · only you can mark this"
          onClose={closeDrawer}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
