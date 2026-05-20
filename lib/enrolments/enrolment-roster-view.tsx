// mynclex/lib/enrolments/enrolment-roster-view.tsx
//
// Client orchestrator for the cohort Students tab (Slice 1b).
// Owns: the roster list, the "Add student" modal (off-platform
// tutor-add), and the success/error toast. The server action does
// the invite-or-attach + enrolment insert; this just collects the
// form and reflects the result.

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addStudentAction,
  approveEnrolmentAction,
  cancelEnrolmentAction,
  convertWaitlistEntryAction,
  dismissWaitlistEntryAction,
  pauseEnrolmentAction,
  rejectEnrolmentAction,
  resumeEnrolmentAction,
  type TransitionResult,
} from './actions';
import {
  actionsForStatus,
  ENROLMENT_ACTION_META,
  ENROLMENT_SOURCE_LABEL,
  ENROLMENT_STATUS_META,
  type EnrolmentAction,
  type EnrolmentRosterRow,
  type WaitlistEntry,
} from './types';

interface EnrolmentRosterViewProps {
  cohortId: string;
  cohortName: string;
  roster: EnrolmentRosterRow[];
  waitlist: WaitlistEntry[];
}

const ACTION_PAST_TENSE: Record<EnrolmentAction, string> = {
  approve: 'Approved',
  reject: 'Rejected',
  pause: 'Paused',
  resume: 'Resumed',
  cancel: 'Cancelled',
};

export function EnrolmentRosterView({
  cohortId,
  cohortName,
  roster,
  waitlist,
}: EnrolmentRosterViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);

  // Which row is mid-transition (disables that row's buttons), and the
  // pending confirm dialog (for access-removing actions).
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    action: EnrolmentAction;
    row: EnrolmentRosterRow;
  } | null>(null);

  // Waitlist: which lead is mid-action, and the pending dismiss confirm.
  const [wlBusyId, setWlBusyId] = useState<string | null>(null);
  const [wlDismiss, setWlDismiss] = useState<WaitlistEntry | null>(null);

  function leadName(entry: WaitlistEntry) {
    return `${entry.forename} ${entry.surname}`.trim();
  }

  function runConvert(entry: WaitlistEntry) {
    setWlBusyId(entry.waitlist_id);
    startTransition(async () => {
      const res = await convertWaitlistEntryAction(cohortId, entry.waitlist_id);
      setWlBusyId(null);
      if (!res.ok) {
        setToast({ tone: 'error', message: res.error });
        return;
      }
      setToast({
        tone: 'success',
        message: res.invited
          ? `Enrolled ${res.name} — invite sent to set up their account.`
          : `Enrolled ${res.name} (existing MyNclex account).`,
      });
      router.refresh();
    });
  }

  function runDismiss(entry: WaitlistEntry) {
    setWlBusyId(entry.waitlist_id);
    startTransition(async () => {
      const res = await dismissWaitlistEntryAction(cohortId, entry.waitlist_id);
      setWlBusyId(null);
      setWlDismiss(null);
      if (!res.ok) {
        setToast({ tone: 'error', message: res.error });
        return;
      }
      setToast({ tone: 'success', message: `Dismissed ${leadName(entry)}'s request.` });
      router.refresh();
    });
  }

  const ACTION_FN: Record<
    EnrolmentAction,
    (cohortId: string, enrolmentId: string, note?: string) => Promise<TransitionResult>
  > = {
    approve: approveEnrolmentAction,
    reject: rejectEnrolmentAction,
    pause: pauseEnrolmentAction,
    resume: resumeEnrolmentAction,
    cancel: cancelEnrolmentAction,
  };

  function runAction(action: EnrolmentAction, row: EnrolmentRosterRow, note?: string) {
    setBusyId(row.enrolment_id);
    startTransition(async () => {
      const res = await ACTION_FN[action](cohortId, row.enrolment_id, note);
      setBusyId(null);
      setConfirm(null);
      if (!res.ok) {
        setToast({ tone: 'error', message: res.error });
        return;
      }
      setToast({
        tone: 'success',
        message: `${ACTION_PAST_TENSE[action]} ${row.name}.`,
      });
      router.refresh();
    });
  }

  function onActionClick(action: EnrolmentAction, row: EnrolmentRosterRow) {
    if (ENROLMENT_ACTION_META[action].confirm) {
      setConfirm({ action, row });
    } else {
      runAction(action, row);
    }
  }

  function openAdd() {
    setFormError(null);
    setAddOpen(true);
  }
  function closeAdd() {
    if (pending) return;
    setAddOpen(false);
    setFormError(null);
  }

  function handleSubmit(formData: FormData) {
    setFormError(null);
    startTransition(async () => {
      const res = await addStudentAction(cohortId, formData);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      setAddOpen(false);
      setToast({
        tone: 'success',
        message: res.invited
          ? `Invited ${res.name} — they'll get an email to set up their account.`
          : `Enrolled ${res.name} (existing MyNclex account).`,
      });
      router.refresh();
    });
  }

  const hasStudents = roster.length > 0;

  return (
    <div className="enrol-page">
      <header className="enrol-head">
        <div className="enrol-head-titles">
          <h1 className="enrol-title">Students</h1>
          <p className="enrol-sub">
            Enrolled students for {cohortName}. Add a student directly
            by name and email — new students get an invite to set up
            their account.
          </p>
        </div>
        {hasStudents && (
          <button
            type="button"
            className="enrol-btn enrol-btn-primary"
            onClick={openAdd}
            disabled={pending}
          >
            + Add student
          </button>
        )}
      </header>

      {waitlist.length > 0 && (
        <section className="enrol-waitlist">
          <div className="enrol-waitlist-head">
            <h2 className="enrol-waitlist-title">
              Waitlist requests
              <span className="enrol-waitlist-count">{waitlist.length}</span>
            </h2>
            <p className="enrol-waitlist-sub">
              People who asked to join this cohort from the public page.
              Convert once they&apos;ve paid you (or you&apos;re ready to
              let them in) — they&apos;ll be enrolled and emailed an invite
              to set up their account.
            </p>
          </div>
          <div className="enrol-waitlist-list">
            {waitlist.map((entry) => {
              const rowBusy = wlBusyId === entry.waitlist_id && pending;
              return (
                <div className="enrol-wl-card" key={entry.waitlist_id}>
                  <div className="enrol-wl-main">
                    <div className="enrol-wl-id">
                      <span className="enrol-wl-name">{leadName(entry)}</span>
                      <span className="enrol-wl-email">{entry.email}</span>
                    </div>
                    {entry.message && (
                      <p className="enrol-wl-message">{entry.message}</p>
                    )}
                    <span className="enrol-wl-date">
                      Requested {new Date(entry.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="enrol-wl-actions">
                    <button
                      type="button"
                      className="enrol-action enrol-action-primary"
                      onClick={() => runConvert(entry)}
                      disabled={pending}
                    >
                      {rowBusy ? '…' : 'Convert to enrolment'}
                    </button>
                    <button
                      type="button"
                      className="enrol-action enrol-action-neutral"
                      onClick={() => setWlDismiss(entry)}
                      disabled={pending}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!hasStudents ? (
        <div className="enrol-empty">
          <h2 className="enrol-empty-title">No students enrolled yet.</h2>
          <p className="enrol-empty-sub">
            Add a student you&apos;re bringing in off-platform — type
            their name and email and they&apos;ll be enrolled right
            away.
          </p>
          <button
            type="button"
            className="enrol-btn enrol-btn-primary"
            onClick={openAdd}
            disabled={pending}
          >
            + Add student
          </button>
        </div>
      ) : (
        <div className="enrol-roster">
          <div className="enrol-roster-head" role="row">
            <span role="columnheader">Student</span>
            <span role="columnheader">Email</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Source</span>
            <span role="columnheader">Enrolled</span>
            <span role="columnheader">Actions</span>
          </div>
          {roster.map((row) => {
            const meta = ENROLMENT_STATUS_META[row.status];
            const actions = actionsForStatus(row.status);
            const rowBusy = busyId === row.enrolment_id && pending;
            return (
              <div className="enrol-row" role="row" key={row.enrolment_id}>
                <span className="enrol-row-name">{row.name}</span>
                <span className="enrol-row-email">{row.email}</span>
                <span>
                  <span className={`enrol-pill ${meta.pillClass}`}>
                    {meta.label}
                  </span>
                </span>
                <span className="enrol-row-source">
                  {ENROLMENT_SOURCE_LABEL[row.enrolment_source]}
                </span>
                <span className="enrol-row-date">
                  {new Date(row.enrolled_at).toLocaleDateString()}
                </span>
                <span className="enrol-row-actions">
                  {actions.length === 0 ? (
                    <span className="enrol-row-actions-none">—</span>
                  ) : (
                    actions.map((action) => {
                      const am = ENROLMENT_ACTION_META[action];
                      return (
                        <button
                          key={action}
                          type="button"
                          className={`enrol-action enrol-action-${am.tone}`}
                          onClick={() => onActionClick(action, row)}
                          disabled={pending}
                        >
                          {rowBusy ? '…' : am.label}
                        </button>
                      );
                    })
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {addOpen && (
        <AddStudentModal
          pending={pending}
          error={formError}
          onClose={closeAdd}
          onSubmit={handleSubmit}
        />
      )}

      {confirm && (
        <TransitionConfirm
          action={confirm.action}
          row={confirm.row}
          pending={pending}
          onClose={() => {
            if (!pending) setConfirm(null);
          }}
          onConfirm={(note) => runAction(confirm.action, confirm.row, note)}
        />
      )}

      {wlDismiss && (
        <WaitlistDismissConfirm
          name={leadName(wlDismiss)}
          pending={pending}
          onClose={() => {
            if (!pending) setWlDismiss(null);
          }}
          onConfirm={() => runDismiss(wlDismiss)}
        />
      )}

      {toast && (
        <EnrolToast
          tone={toast.tone}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

function AddStudentModal({
  pending,
  error,
  onClose,
  onSubmit,
}: {
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const firstFieldRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  return (
    <div
      className="enrol-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="enrol-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="enrol-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="enrol-modal-title" className="enrol-modal-title">
          Add student
        </h2>
        <p className="enrol-modal-sub">
          Enrol a student directly. If they already have a MyNclex
          account they&apos;re attached straight away; otherwise they
          get an email to set up their account.
        </p>

        <form action={onSubmit} className="enrol-form">
          <div className="enrol-form-row">
            <label className="enrol-field">
              <span className="enrol-field-label">First name</span>
              <input
                ref={firstFieldRef}
                name="forename"
                type="text"
                className="enrol-input"
                autoComplete="off"
                required
                disabled={pending}
              />
            </label>
            <label className="enrol-field">
              <span className="enrol-field-label">Surname</span>
              <input
                name="surname"
                type="text"
                className="enrol-input"
                autoComplete="off"
                required
                disabled={pending}
              />
            </label>
          </div>
          <label className="enrol-field">
            <span className="enrol-field-label">Email</span>
            <input
              name="email"
              type="email"
              className="enrol-input"
              autoComplete="off"
              required
              disabled={pending}
            />
          </label>

          {error && (
            <p className="enrol-form-error" role="alert">
              {error}
            </p>
          )}

          <div className="enrol-modal-actions">
            <button
              type="button"
              className="enrol-btn enrol-btn-ghost"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="enrol-btn enrol-btn-primary"
              disabled={pending}
            >
              {pending ? 'Adding…' : 'Add student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const CONFIRM_COPY: Record<
  'pause' | 'reject' | 'cancel',
  { title: (name: string) => string; body: string; confirmLabel: string }
> = {
  pause: {
    title: (name) => `Pause ${name}'s access?`,
    body: "They'll temporarily lose access to this cohort. You can resume them at any time.",
    confirmLabel: 'Pause access',
  },
  reject: {
    title: (name) => `Reject ${name}'s request?`,
    body: 'This declines their pending enrolment request. You can add them again later.',
    confirmLabel: 'Reject request',
  },
  cancel: {
    title: (name) => `Cancel ${name}'s enrolment?`,
    body: "They'll lose access to this cohort. You can add them again later.",
    confirmLabel: 'Cancel enrolment',
  },
};

function TransitionConfirm({
  action,
  row,
  pending,
  onClose,
  onConfirm,
}: {
  action: EnrolmentAction;
  row: EnrolmentRosterRow;
  pending: boolean;
  onClose: () => void;
  onConfirm: (note?: string) => void;
}) {
  const [note, setNote] = useState('');
  const meta = ENROLMENT_ACTION_META[action];
  // Only the confirm-gated actions reach this dialog.
  const copy = CONFIRM_COPY[action as 'pause' | 'reject' | 'cancel'];

  return (
    <div className="enrol-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="enrol-modal enrol-modal-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="enrol-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="enrol-confirm-title" className="enrol-modal-title">
          {copy.title(row.name)}
        </h2>
        <p className="enrol-modal-sub">{copy.body}</p>

        {meta.note && (
          <label className="enrol-field">
            <span className="enrol-field-label">Note (optional)</span>
            <textarea
              className="enrol-input enrol-textarea"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason — kept for your records and refund handling."
              disabled={pending}
            />
          </label>
        )}

        <div className="enrol-modal-actions">
          <button
            type="button"
            className="enrol-btn enrol-btn-ghost"
            onClick={onClose}
            disabled={pending}
          >
            Keep as is
          </button>
          <button
            type="button"
            className={`enrol-btn ${
              meta.tone === 'danger' ? 'enrol-btn-danger' : 'enrol-btn-primary'
            }`}
            onClick={() => onConfirm(meta.note ? note : undefined)}
            disabled={pending}
          >
            {pending ? 'Working…' : copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function WaitlistDismissConfirm({
  name,
  pending,
  onClose,
  onConfirm,
}: {
  name: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="enrol-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="enrol-modal enrol-modal-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="enrol-wl-dismiss-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="enrol-wl-dismiss-title" className="enrol-modal-title">
          Dismiss {name}&apos;s request?
        </h2>
        <p className="enrol-modal-sub">
          This removes their waitlist request from the list. It doesn&apos;t
          notify them, and they can ask to join again from the public page.
        </p>
        <div className="enrol-modal-actions">
          <button
            type="button"
            className="enrol-btn enrol-btn-ghost"
            onClick={onClose}
            disabled={pending}
          >
            Keep request
          </button>
          <button
            type="button"
            className="enrol-btn enrol-btn-primary"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Working…' : 'Dismiss request'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EnrolToast({
  tone,
  message,
  onDismiss,
}: {
  tone: 'success' | 'error';
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(id);
  }, [message, onDismiss]);

  return (
    <div
      className={`enrol-toast enrol-toast-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <span className="enrol-toast-icon" aria-hidden="true">
        {tone === 'success' ? '✓' : '!'}
      </span>
      <span className="enrol-toast-message">{message}</span>
      <button
        type="button"
        className="enrol-toast-close"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  );
}
