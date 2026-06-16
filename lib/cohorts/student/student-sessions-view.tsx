// mynclex/lib/cohorts/student/student-sessions-view.tsx
//
// The student "My sessions" page (Slice 3b) — the read-only personalised
// mirror of the tutor Sessions tab. Attendance record card (+ streak), a
// next-session panel (join details), and a List ⇄ Timeline toggle over the
// student's own sessions. Read-only: a student never marks anything (the
// card says so). Built from the CD "Sessions & Attendance" prototype, on
// app navy/teal tokens; responsive (the rail stacks under the main column
// on narrow screens via CSS).

'use client';

import { useState } from 'react';
import { unitLabel } from '@/lib/curriculum/format';
import { sessionLifecycle } from '../attendance-format';
import {
  nextStudentSession,
  studentAttendanceRecord,
} from './sessions-format';
import type { StudentSession, StudentSessionsData } from './sessions-format';

const PLATFORM_LABEL: Record<string, string> = {
  ZOOM: 'Zoom',
  GOOGLE_MEET: 'Google Meet',
  MS_TEAMS: 'Microsoft Teams',
  OTHER: 'the link',
};

// ── date helpers (client; user locale) ───────────────────────────────────
function parse(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
function dayNum(iso: string | null): string {
  const d = parse(iso);
  return d ? d.toLocaleDateString(undefined, { day: 'numeric' }) : '—';
}
function monthShort(iso: string | null): string {
  const d = parse(iso);
  return d ? d.toLocaleDateString(undefined, { month: 'short' }) : 'TBA';
}
function whenLong(iso: string | null): string {
  const d = parse(iso);
  return d
    ? d.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : 'Date to be announced';
}
function whenShort(iso: string | null): string {
  const d = parse(iso);
  return d
    ? d.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : 'Date TBA';
}
function timeStr(iso: string | null): string {
  const d = parse(iso);
  return d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
}
function countdown(iso: string | null, nowMs: number): string {
  const d = parse(iso);
  if (!d) return 'Date TBA';
  const diff = d.getTime() - nowMs;
  if (diff <= 0) return 'Starting now';
  const min = Math.round(diff / 60000);
  if (min < 60) return `In ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `In ${hr} ${hr === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hr / 24);
  return `In ${days} ${days === 1 ? 'day' : 'days'}`;
}

const PAST_BADGE: Record<
  string,
  { cls: string; icon: string; label: string }
> = {
  PRESENT: { cls: 'ss-you-present', icon: '✓', label: 'You attended' },
  ABSENT: { cls: 'ss-you-absent', icon: '✕', label: 'You missed this' },
  EXCUSED: { cls: 'ss-you-excused', icon: '–', label: 'Excused' },
};

export function StudentSessionsView({ data }: { data: StudentSessionsData }) {
  const [layout, setLayout] = useState<'list' | 'timeline'>('list');
  const { nowMs, unitLabel: unitKind } = data;

  const record = studentAttendanceRecord(data.sessions);
  const next = nextStudentSession(data.sessions, nowMs);

  const upcoming = data.sessions
    .filter((s) => sessionLifecycle(s, nowMs) !== 'held')
    .sort(
      (a, b) =>
        (a.scheduledAt ? new Date(a.scheduledAt).getTime() : Infinity) -
        (b.scheduledAt ? new Date(b.scheduledAt).getTime() : Infinity),
    );
  const past = data.sessions
    .filter((s) => sessionLifecycle(s, nowMs) === 'held')
    .sort(
      (a, b) =>
        (b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0) -
        (a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0),
    );

  return (
    <div className="ss">
      <header className="ss-head">
        <div className="ss-eyebrow">{data.cohort.programmeTitle}</div>
        <h1 className="ss-title">My sessions</h1>
      </header>

      {/* attendance record card */}
      <div className="ss-record">
        <div className="ss-record-cell">
          <div className="ss-record-label">Your attendance</div>
          <div className="ss-record-num">
            {record.attended}{' '}
            <span className="ss-record-of">of {record.held} held</span>
          </div>
        </div>
        <div className="ss-record-divider" />
        <div className="ss-record-cell">
          <div className="ss-record-label">Streak</div>
          <div className="ss-record-num">
            🔥 {record.streak}{' '}
            <span className="ss-record-of">in a row</span>
          </div>
        </div>
        <div className="ss-record-note">
          Marked by your tutor · you can&apos;t self-check in
        </div>
      </div>

      <div className="ss-viewtoggle">
        <span className="ss-viewtoggle-label">View</span>
        <button
          type="button"
          className={layout === 'list' ? 'ss-seg active' : 'ss-seg'}
          onClick={() => setLayout('list')}
        >
          List
        </button>
        <button
          type="button"
          className={layout === 'timeline' ? 'ss-seg active' : 'ss-seg'}
          onClick={() => setLayout('timeline')}
        >
          Timeline
        </button>
      </div>

      <div className="ss-grid">
        <div className="ss-main">
          {data.sessions.length === 0 ? (
            <div className="ss-empty">
              <p className="ss-empty-title">No live sessions yet.</p>
              <p className="ss-empty-sub">
                Your tutor hasn&apos;t scheduled any sessions for this cohort
                yet. They&apos;ll appear here once they do.
              </p>
            </div>
          ) : layout === 'list' ? (
            <ListView upcoming={upcoming} past={past} nowMs={nowMs} />
          ) : (
            <TimelineView
              sessions={[...data.sessions].sort(
                (a, b) =>
                  (a.scheduledAt ? new Date(a.scheduledAt).getTime() : Infinity) -
                  (b.scheduledAt ? new Date(b.scheduledAt).getTime() : Infinity),
              )}
              nowMs={nowMs}
              unitKind={unitKind}
            />
          )}
        </div>

        <aside className="ss-rail">
          <NextSessionPanel next={next} nowMs={nowMs} unitKind={unitKind} />
        </aside>
      </div>
    </div>
  );
}

function ListView({
  upcoming,
  past,
  nowMs,
}: {
  upcoming: StudentSession[];
  past: StudentSession[];
  nowMs: number;
}) {
  return (
    <>
      <div className="ss-section-label">Upcoming</div>
      {upcoming.length === 0 ? (
        <p className="ss-none">No upcoming sessions.</p>
      ) : (
        <div className="ss-list">
          {upcoming.map((s) => (
            <div key={s.sessionId} className="ss-row">
              <div className="ss-row-date">
                <span className="ss-row-day">{dayNum(s.scheduledAt)}</span>
                <span className="ss-row-month">{monthShort(s.scheduledAt)}</span>
              </div>
              <div className="ss-row-main">
                <div className="ss-row-title">{s.title}</div>
                <div className="ss-row-when">
                  {s.scheduledAt
                    ? `${whenLong(s.scheduledAt)} · ${timeStr(s.scheduledAt)}`
                    : 'Date to be announced'}
                </div>
              </div>
              <span className="ss-countdown">{countdown(s.scheduledAt, nowMs)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="ss-section-label ss-section-label-mt">Past</div>
      {past.length === 0 ? (
        <p className="ss-none">No past sessions yet.</p>
      ) : (
        <div className="ss-list">
          {past.map((s) => {
            const badge = s.myStatus ? PAST_BADGE[s.myStatus] : null;
            return (
              <div key={s.sessionId} className="ss-row">
                {badge ? (
                  <span className={`ss-you ${badge.cls}`} aria-hidden="true">
                    {badge.icon}
                  </span>
                ) : (
                  <span className="ss-you ss-you-pending" aria-hidden="true">
                    ·
                  </span>
                )}
                <div className="ss-row-main">
                  <div className="ss-row-title">{s.title}</div>
                  <div className="ss-row-when">
                    {whenShort(s.scheduledAt)} ·{' '}
                    {badge ? badge.label : 'Attendance not marked yet'}
                  </div>
                </div>
                {s.recordingUrl ? (
                  <a
                    href={s.recordingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ss-rec-link"
                  >
                    Watch recording ↗
                  </a>
                ) : (
                  <span className="ss-rec-none">No recording</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function TimelineView({
  sessions,
  nowMs,
  unitKind,
}: {
  sessions: StudentSession[];
  nowMs: number;
  unitKind: StudentSessionsData['unitLabel'];
}) {
  return (
    <div className="ss-timeline">
      {sessions.map((s) => {
        const life = sessionLifecycle(s, nowMs);
        let dotClass = 'ss-dot-upcoming';
        let pill = countdown(s.scheduledAt, nowMs);
        let pillClass = 'ss-tl-pill-upcoming';
        if (life === 'held') {
          if (s.myStatus === 'PRESENT') {
            dotClass = 'ss-dot-present';
            pill = 'Attended';
            pillClass = 'ss-tl-pill-present';
          } else if (s.myStatus === 'EXCUSED') {
            dotClass = 'ss-dot-excused';
            pill = 'Excused';
            pillClass = 'ss-tl-pill-excused';
          } else if (s.myStatus === 'ABSENT') {
            dotClass = 'ss-dot-absent';
            pill = 'Missed';
            pillClass = 'ss-tl-pill-absent';
          } else {
            dotClass = 'ss-dot-upcoming';
            pill = 'Not marked';
            pillClass = 'ss-tl-pill-muted';
          }
        } else if (life === 'unscheduled') {
          dotClass = 'ss-dot-upcoming';
          pill = 'Date TBA';
          pillClass = 'ss-tl-pill-muted';
        }
        return (
          <div key={s.sessionId} className="ss-tl-item">
            <span className={`ss-tl-dot ${dotClass}`} aria-hidden="true" />
            <div className="ss-tl-card">
              <div className="ss-tl-row1">
                <span className="ss-tl-week">{unitLabel(s.unitIndex, unitKind)}</span>
                <span className={`ss-tl-pill ${pillClass}`}>{pill}</span>
              </div>
              <div className="ss-tl-title">{s.title}</div>
              <div className="ss-tl-when">
                {s.scheduledAt
                  ? `${whenShort(s.scheduledAt)} · ${timeStr(s.scheduledAt)}`
                  : 'To be announced'}
                {life === 'held' && s.recordingUrl && (
                  <>
                    {' · '}
                    <a
                      href={s.recordingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ss-rec-link"
                    >
                      Recording ↗
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NextSessionPanel({
  next,
  nowMs,
  unitKind,
}: {
  next: StudentSession | null;
  nowMs: number;
  unitKind: StudentSessionsData['unitLabel'];
}) {
  if (!next) {
    return (
      <div className="ss-next ss-next-empty">
        <div className="ss-next-eyebrow">Next session</div>
        <p className="ss-next-none">No upcoming sessions scheduled.</p>
      </div>
    );
  }
  const platformLabel = next.platform ? PLATFORM_LABEL[next.platform] : null;
  return (
    <div className="ss-next">
      <div className="ss-next-head">
        Next session · {countdown(next.scheduledAt, nowMs)}
      </div>
      <div className="ss-next-body">
        <div className="ss-next-week">{unitLabel(next.unitIndex, unitKind)}</div>
        <h2 className="ss-next-title">{next.title}</h2>
        <div className="ss-next-when">{whenLong(next.scheduledAt)}</div>
        <div className="ss-next-time">{timeStr(next.scheduledAt)} · your time</div>

        {next.joinUrl ? (
          <a
            href={next.joinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ss-next-join"
          >
            Join {platformLabel ? `on ${platformLabel}` : 'the session'} ↗
          </a>
        ) : (
          <div className="ss-next-nojoin">Join link to be added</div>
        )}

        {(next.meetingId || next.passcode) && (
          <div className="ss-next-creds">
            {next.meetingId && (
              <div className="ss-next-cred">
                <div className="ss-next-cred-label">Meeting ID</div>
                <div className="ss-next-cred-val">{next.meetingId}</div>
              </div>
            )}
            {next.passcode && (
              <div className="ss-next-cred">
                <div className="ss-next-cred-label">Passcode</div>
                <div className="ss-next-cred-val">{next.passcode}</div>
              </div>
            )}
          </div>
        )}

        {next.joiningInstructions && (
          <div className="ss-next-instructions">{next.joiningInstructions}</div>
        )}
      </div>
    </div>
  );
}
