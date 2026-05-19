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
import { addStudentAction } from './actions';
import {
  ENROLMENT_SOURCE_LABEL,
  ENROLMENT_STATUS_META,
  type EnrolmentRosterRow,
} from './types';

interface EnrolmentRosterViewProps {
  cohortId: string;
  cohortName: string;
  roster: EnrolmentRosterRow[];
}

export function EnrolmentRosterView({
  cohortId,
  cohortName,
  roster,
}: EnrolmentRosterViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);

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
          </div>
          {roster.map((row) => {
            const meta = ENROLMENT_STATUS_META[row.status];
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
