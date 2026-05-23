// mynclex/app/(public)/programmes/[id]/enquiry-cta.tsx
//
// Public "Contact tutor" CTA (Slice 8a). Sits in the detail rail for
// programmes with no on-page commitment path — off-platform self-paced
// (no cohorts to waitlist against) and price-hidden programmes of any
// delivery mode (the tutor wants a conversation before quoting). The
// page decides eligibility; this just renders the button + modal.
//
// Modal shape mirrors waitlist-cta.tsx (same chrome, same contact-
// preference checkbox group, same conditional-phone-required, same
// "thanks — we'll be in touch" success screen) so the two flows feel
// like the same family. CONTACT_OPTIONS is imported from the shared
// module so the two forms can't drift.
//
// Submission goes through submitEnquiryAction → nclex_submit_enquiry
// RPC, which is anon-grantable, validates programme eligibility, and
// is idempotent on (programme, email).

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { submitEnquiryAction } from '@/lib/discovery/enquiry-actions';
import {
  CONTACT_OPTIONS,
  preferredContactNeedsPhone,
} from '@/lib/discovery/contact-options';

export function EnquiryCta({
  programmeId,
  tutorName,
  reason,
}: {
  programmeId: string;
  tutorName: string;
  // Short copy explaining why we're showing this instead of an Enrol
  // button — flips between the price-hidden case ("Reach out about
  // pricing and joining") and the off-platform-with-price case ("This
  // tutor collects fees directly — reach out to enrol").
  reason: 'PRICE_HIDDEN' | 'OFF_PLATFORM';
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
      const res = await submitEnquiryAction(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
    });
  }

  const blurb =
    reason === 'PRICE_HIDDEN'
      ? `${tutorName} prefers to talk before sharing the price. Leave your details and they'll be in touch.`
      : `${tutorName} collects fees directly — reach out and they'll guide you through enrolling.`;

  return (
    <div className="wl-cta">
      <h3 className="wl-cta-title">Contact {tutorName}</h3>
      <p className="wl-cta-blurb">{blurb}</p>
      <button type="button" className="wl-cta-btn" onClick={openForm}>
        Contact tutor
      </button>

      {open && (
        <EnquiryModal
          programmeId={programmeId}
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

function EnquiryModal({
  programmeId,
  tutorName,
  done,
  error,
  pending,
  onClose,
  onSubmit,
}: {
  programmeId: string;
  tutorName: string;
  done: boolean;
  error: string | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Preferred-contact checkbox state — Email pre-ticked. Phone becomes
  // required the moment a phone-based channel (WhatsApp/Call/SMS) is on.
  const [preferred, setPreferred] = useState<Set<string>>(new Set(['EMAIL']));
  const needsPhone = preferredContactNeedsPhone(preferred);

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
        aria-labelledby="enquiry-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="wl-done">
            <div className="wl-done-icon" aria-hidden="true">
              ✓
            </div>
            <h2 id="enquiry-modal-title" className="wl-modal-title">
              Message sent
            </h2>
            <p className="wl-modal-sub">
              {tutorName} can see your enquiry and will reach out via your
              preferred channel. No need to do anything else for now.
            </p>
            <div className="wl-actions">
              <button type="button" className="wl-cta-btn" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 id="enquiry-modal-title" className="wl-modal-title">
              Contact {tutorName}
            </h2>
            <p className="wl-modal-sub">
              Leave your details and {tutorName} will get back to you. No
              account needed — you&apos;ll get one if you enrol later.
            </p>

            <form action={onSubmit} className="wl-form">
              <input type="hidden" name="programmeId" value={programmeId} />

              <label className="wl-field">
                <span className="wl-field-label">Your name</span>
                <input
                  ref={firstFieldRef}
                  name="name"
                  type="text"
                  className="wl-input"
                  autoComplete="name"
                  required
                  disabled={pending}
                />
              </label>

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
                  placeholder="Anything you'd like the tutor to know — questions, schedule, anything."
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
                  {pending ? 'Sending…' : 'Send message'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
