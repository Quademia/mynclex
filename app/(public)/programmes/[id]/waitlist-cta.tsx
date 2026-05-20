// mynclex/app/(public)/programmes/[id]/waitlist-cta.tsx
//
// Public "Join the waitlist" CTA (Payments Slice 4). Sits in the detail
// rail UNDER the (kept) "coming soon" online-enrolment button — that one
// is reserved for Slice 5 on-platform checkout. This is the off-platform
// path: leave name + email + an optional note, no account needed. The
// owning tutor converts the request to an enrolment from their cohort
// workspace.
//
// Only rendered for tutor-led programmes with >= 1 joinable cohort (the
// page decides). The cohort picker collapses to fixed text when there's
// just one — no needless choice.

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { joinWaitlistAction } from '@/lib/discovery/waitlist-actions';

export interface WaitlistCohortOption {
  id: string;
  label: string;
}

const CONTACT_OPTIONS: { value: string; label: string; needsPhone: boolean }[] = [
  { value: 'WHATSAPP', label: 'WhatsApp', needsPhone: true },
  { value: 'CALL', label: 'Call', needsPhone: true },
  { value: 'SMS', label: 'SMS', needsPhone: true },
  { value: 'EMAIL', label: 'Email', needsPhone: false },
];

export function WaitlistCta({
  cohorts,
  tutorName,
}: {
  cohorts: WaitlistCohortOption[];
  tutorName: string;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openForm() {
    setError(null);
    setDone(false);
    setOpen(true);
  }
  function close() {
    if (pending) return;
    setOpen(false);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await joinWaitlistAction(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
    });
  }

  return (
    <div className="wl-cta">
      <button type="button" className="wl-cta-btn" onClick={openForm}>
        Join the waitlist
      </button>
      <p className="det-cta-note">
        Not ready to pay online? Ask to join — {tutorName} will be in touch.
      </p>

      {open && (
        <WaitlistModal
          cohorts={cohorts}
          tutorName={tutorName}
          done={done}
          error={error}
          pending={pending}
          onClose={close}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function WaitlistModal({
  cohorts,
  tutorName,
  done,
  error,
  pending,
  onClose,
  onSubmit,
}: {
  cohorts: WaitlistCohortOption[];
  tutorName: string;
  done: boolean;
  error: string | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const single = cohorts.length === 1;

  // Preferred-contact checkbox state — Email pre-ticked. Phone becomes
  // required the moment a phone-based channel (WhatsApp/Call/SMS) is on.
  const [preferred, setPreferred] = useState<Set<string>>(new Set(['EMAIL']));
  const needsPhone = CONTACT_OPTIONS.some(
    (o) => o.needsPhone && preferred.has(o.value),
  );

  function togglePreferred(value: string) {
    setPreferred((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  return (
    <div className="wl-backdrop" onClick={onClose} role="presentation">
      <div
        className="wl-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wl-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="wl-done">
            <div className="wl-done-icon" aria-hidden="true">
              ✓
            </div>
            <h2 id="wl-modal-title" className="wl-modal-title">
              You&apos;re on the waitlist
            </h2>
            <p className="wl-modal-sub">
              {tutorName} can see your request and will reach out about the
              next steps. You don&apos;t need to do anything else for now.
            </p>
            <div className="wl-actions">
              <button type="button" className="wl-cta-btn" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 id="wl-modal-title" className="wl-modal-title">
              Join the waitlist
            </h2>
            <p className="wl-modal-sub">
              Leave your details and {tutorName} will get in touch. No account
              needed yet — you&apos;ll get one when you&apos;re enrolled.
            </p>

            <form action={onSubmit} className="wl-form">
              {single ? (
                <input type="hidden" name="cohortId" value={cohorts[0].id} />
              ) : null}

              <label className="wl-field">
                <span className="wl-field-label">Cohort</span>
                {single ? (
                  <span className="wl-fixed-cohort">{cohorts[0].label}</span>
                ) : (
                  <select
                    name="cohortId"
                    className="wl-input"
                    defaultValue={cohorts[0].id}
                    disabled={pending}
                  >
                    {cohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              <div className="wl-form-row">
                <label className="wl-field">
                  <span className="wl-field-label">First name</span>
                  <input
                    ref={firstFieldRef}
                    name="forename"
                    type="text"
                    className="wl-input"
                    autoComplete="given-name"
                    required
                    disabled={pending}
                  />
                </label>
                <label className="wl-field">
                  <span className="wl-field-label">Surname</span>
                  <input
                    name="surname"
                    type="text"
                    className="wl-input"
                    autoComplete="family-name"
                    required
                    disabled={pending}
                  />
                </label>
              </div>

              <label className="wl-field">
                <span className="wl-field-label">Email</span>
                <input
                  name="email"
                  type="email"
                  className="wl-input"
                  autoComplete="email"
                  required
                  disabled={pending}
                />
              </label>

              <fieldset className="wl-field wl-prefset">
                <legend className="wl-field-label">
                  How should the tutor reach you?
                </legend>
                <div className="wl-checks">
                  {CONTACT_OPTIONS.map((o) => (
                    <label key={o.value} className="wl-check">
                      <input
                        type="checkbox"
                        name="preferred"
                        value={o.value}
                        checked={preferred.has(o.value)}
                        onChange={() => togglePreferred(o.value)}
                        disabled={pending}
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="wl-field">
                <span className="wl-field-label">
                  Phone{' '}
                  <span className="wl-optional">
                    {needsPhone ? '(required)' : '(optional)'}
                  </span>
                </span>
                <input
                  name="phone"
                  type="tel"
                  className="wl-input"
                  autoComplete="tel"
                  placeholder="+233 ..."
                  required={needsPhone}
                  disabled={pending}
                />
              </label>

              <label className="wl-field">
                <span className="wl-field-label">
                  Message <span className="wl-optional">(optional)</span>
                </span>
                <textarea
                  name="message"
                  className="wl-input wl-textarea"
                  rows={3}
                  placeholder="Anything you'd like the tutor to know."
                  disabled={pending}
                />
              </label>

              {error && (
                <p className="wl-error" role="alert">
                  {error}
                </p>
              )}

              <div className="wl-actions">
                <button
                  type="button"
                  className="wl-btn-ghost"
                  onClick={onClose}
                  disabled={pending}
                >
                  Cancel
                </button>
                <button type="submit" className="wl-cta-btn" disabled={pending}>
                  {pending ? 'Sending…' : 'Join the waitlist'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
