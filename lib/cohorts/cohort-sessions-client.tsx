// mynclex/lib/cohorts/cohort-sessions-client.tsx
//
// Client island for the cohort Live Session Planner. Renders one row per
// live-session marker with its scheduled / unscheduled state, owns the
// schedule-editor modal (Slice 1b), and — Slice 2 — the "+ Add session"
// one-off flow + "Remove" for cohort-only sessions. The marker data is
// server-fetched (getCohortSessionsPlanner) and passed in as plain values.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { unitLabel } from '@/lib/curriculum/format';
import { ErrorToast } from '@/lib/toast/error-toast';
import { InfoToast } from '@/lib/toast/info-toast';
import { LiveSessionScheduleModal } from './live-session-schedule-modal';
import { LiveSessionAddModal } from './live-session-add-modal';
import { deleteCohortOnlyActivityAction } from './actions';
import { sendSessionReminderAction } from './live-session-actions';
import type {
  CohortSessionsPlanner,
  PlannerSession,
} from './live-session-queries';
import type { UnitLabel } from '@/lib/programmes/types';

// "Wednesday, 3 July 2026, 19:00" — in the tutor's locale + zone.
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// A class already held cannot be reminded about. Compared here as well as
// in SQL so the control is simply absent rather than present-and-refused.
function isFuture(iso: string): boolean {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t > Date.now();
}

const PLATFORM_LABEL: Record<string, string> = {
  ZOOM: 'Zoom',
  GOOGLE_MEET: 'Google Meet',
  MS_TEAMS: 'Microsoft Teams',
  OTHER: 'Other',
};

export function CohortSessionsClient({
  planner,
  cohortId,
  unitLabelKind,
}: {
  planner: CohortSessionsPlanner;
  cohortId: string;
  unitLabelKind: UnitLabel;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PlannerSession | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<PlannerSession | null>(null);
  const [removePending, startRemove] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── "Send reminder" ──────────────────────────────────────────────
  // ⚠ ONE PER CLASS OCCURRENCE (Sam, 2026-08-19). The limit is the outbox
  // fingerprint, not a counter here — so this state is only about what the
  // button SAYS. It starts from the server's answer and is updated in
  // place after a send, so the row settles without a full refresh.
  //
  // ⭐⭐ EVERY OUTCOME IS SPOKEN, including "0". A deliberate press that
  // silently does nothing is the bug this codebase has now shipped twice:
  // nclex_submit_enquiry shows a success tick while dropping a repeat
  // enquirer's message, and the pay-first receipt was refused by the
  // fingerprint with nobody told. Zero here is a real answer — everyone
  // has already been told — and it is said out loud.
  const [sentAt, setSentAt] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      planner.sessions
        .filter((s) => s.reminder?.manualSentAt)
        .map((s) => [s.activityId, s.reminder!.manualSentAt as string])
    )
  );
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [remindPending, startRemind] = useTransition();

  function handleSendReminder(s: PlannerSession) {
    if (!s.reminder) return;
    setRemindingId(s.activityId);
    startRemind(async () => {
      const res = await sendSessionReminderAction(s.reminder!.sessionId);
      setRemindingId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // ⚠ THREE OUTCOMES, NOT TWO. "Nobody was emailed" means opposite
      // things depending on why, and only one of them is reassuring:
      //   • no eligible students  → the class is UNANNOUNCED. Say so.
      //   • all already told      → nothing left to do. Reassure.
      // Tutors schedule before anyone enrols, so the first is an ordinary
      // early action, not a fault — and calling it "already told" would
      // report a class as announced that nobody has heard of.
      //
      // ⓘ The button is only marked spent when a send could actually have
      // reached someone. An empty cohort must not burn the one allowance.
      if (res.eligible > 0) {
        setSentAt((prev) => ({ ...prev, [s.activityId]: new Date().toISOString() }));
      }
      setNotice(
        res.eligible === 0
          ? 'Nobody to email yet — no students are enrolled in this cohort with a reachable address.'
          : res.queued === 0
            ? 'Everyone in this cohort has already been told about this class.'
            : `Reminder sent to ${res.queued} student${res.queued === 1 ? '' : 's'}.`
      );
      router.refresh();
    });
  }

  function handleRemove() {
    if (!removing) return;
    const target = removing;
    startRemove(async () => {
      const res = await deleteCohortOnlyActivityAction(cohortId, target.activityId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRemoving(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="cohort-sessions-toolbar">
        <button
          type="button"
          className="prog-btn prog-btn-primary"
          onClick={() => setAdding(true)}
        >
          + Add session
        </button>
      </div>

      {planner.sessions.length === 0 ? (
        <div className="cohort-sessions-empty">
          <p className="cohort-sessions-empty-title">No live sessions yet.</p>
          <p className="cohort-sessions-empty-sub">
            Add a one-off session for this cohort above, or add a live-session
            activity in the Curriculum to schedule it here.
          </p>
        </div>
      ) : (
        <ul className="cohort-sessions-list">
          {planner.sessions.map((s) => {
            const isScheduled = s.schedule?.scheduledAt != null;
            return (
              <li key={s.activityId} className="cohort-session-row">
                <div className="cohort-session-main">
                  <div className="cohort-session-meta">
                    <span className="cohort-session-week">
                      {unitLabel(s.unitIndex, unitLabelKind)}
                    </span>
                    {s.isCohortOnly && (
                      <span className="cohort-session-tag">Cohort-only</span>
                    )}
                  </div>
                  <h3 className="cohort-session-title">{s.title}</h3>

                  {isScheduled ? (
                    <div className="cohort-session-when">
                      <span className="cohort-session-when-date">
                        {formatWhen(s.schedule!.scheduledAt!)}
                      </span>
                      {s.schedule!.platform && (
                        <span className="cohort-session-chip">
                          {PLATFORM_LABEL[s.schedule!.platform] ??
                            s.schedule!.platform}
                        </span>
                      )}
                      {s.schedule!.recordingUrl && (
                        <span className="cohort-session-chip">
                          Recording added
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="cohort-session-unscheduled">
                      Not scheduled yet
                    </div>
                  )}
                </div>

                <div className="cohort-session-actions">
                  <span
                    className={
                      isScheduled
                        ? 'cohort-session-status is-scheduled'
                        : 'cohort-session-status is-unscheduled'
                    }
                  >
                    {isScheduled ? 'Scheduled' : 'Unscheduled'}
                  </span>
                  {/* ⓘ Only where it can do something: a class needs a date
                      to describe and must still be ahead. The SQL refuses
                      both cases anyway — this just avoids offering a
                      control whose only outcome is an error. */}
                  {isScheduled && isFuture(s.schedule!.scheduledAt!) && s.reminder && (
                    <button
                      type="button"
                      className="prog-btn prog-btn-ghost"
                      disabled={!!sentAt[s.activityId] || remindPending}
                      onClick={() => handleSendReminder(s)}
                      title={
                        sentAt[s.activityId]
                          ? `Reminder already sent ${formatWhen(sentAt[s.activityId])}. Moving the class allows another.`
                          : 'Email everyone in this cohort about this class. Once per class.'
                      }
                    >
                      {remindingId === s.activityId
                        ? 'Sending…'
                        : sentAt[s.activityId]
                          ? 'Reminder sent'
                          : 'Send reminder'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="prog-btn prog-btn-ghost"
                    onClick={() => setEditing(s)}
                  >
                    {s.schedule ? 'Edit' : 'Schedule'}
                  </button>
                  {s.isCohortOnly && (
                    <button
                      type="button"
                      className="cohort-session-remove"
                      onClick={() => setRemoving(s)}
                      title="Remove this cohort-only session"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <LiveSessionScheduleModal
          cohortId={cohortId}
          markerActivityId={editing.activityId}
          title={editing.title}
          schedule={editing.schedule}
          typicalDurationMinutes={editing.typicalDurationMinutes}
          onClose={() => setEditing(null)}
        />
      )}

      {adding && (
        <LiveSessionAddModal
          cohortId={cohortId}
          units={planner.units}
          unitLabelKind={unitLabelKind}
          onClose={() => setAdding(false)}
        />
      )}

      {removing && (
        <div
          className="prog-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Remove session"
          onClick={(e) => {
            if (e.target === e.currentTarget && !removePending) setRemoving(null);
          }}
        >
          <div className="prog-modal cohort-session-confirm">
            <header className="prog-modal-header">
              <h2 className="prog-modal-title">Remove this session?</h2>
            </header>
            <div className="prog-modal-body">
              <p className="cohort-session-confirm-text">
                <strong>{removing.title}</strong> will be removed from this
                cohort, along with its schedule. This only affects this cohort.
              </p>
            </div>
            <footer className="prog-modal-footer">
              <button
                type="button"
                className="prog-btn prog-btn-ghost"
                onClick={() => setRemoving(null)}
                disabled={removePending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="prog-btn prog-btn-danger"
                onClick={handleRemove}
                disabled={removePending}
              >
                {removePending ? 'Removing…' : 'Remove session'}
              </button>
            </footer>
          </div>
        </div>
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
      <InfoToast message={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}
