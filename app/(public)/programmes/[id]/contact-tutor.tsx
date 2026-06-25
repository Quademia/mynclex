// mynclex/app/(public)/programmes/[id]/contact-tutor.tsx
//
// Universal "Contact the tutor" section (2026-06-25). Sits at the BOTTOM of
// every programme detail page (after the About sections) — whether the
// programme is enrol-able, waitlist-able, or neither. The point: contact is
// universal, not gated behind the CTA branch. A visitor can ask about
// anything (fit, schedule, pricing, joining) regardless of how they'd pay.
//
// Generalised from the old rail-only EnquiryCta: same form + modal chrome as
// waitlist-cta.tsx so the flows feel like one family, plus an optional
// "which cohort?" field when the programme has joinable cohorts (folded into
// the message server-side). Screens where contact is the PRIMARY path
// (price-hidden / no open cohort) get a rail button that anchors to #contact-
// tutor; the page owns that.
//
// Submission goes through submitEnquiryAction → nclex_submit_enquiry RPC,
// which now accepts any published programme (20260707120000) and is
// idempotent on (programme, email) while a lead is open.

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { submitEnquiryAction } from '@/lib/discovery/enquiry-actions';
import {
  CONTACT_OPTIONS,
  preferredContactNeedsPhone,
} from '@/lib/discovery/contact-options';

export interface ContactCohortOption {
  id: string;
  label: string;
}

export function ContactTutor({
  programmeId,
  tutorName,
  cohorts,
}: {
  programmeId: string;
  tutorName: string;
  // Joinable cohorts → an optional "which cohort?" field. Empty for
  // self-paced / no-cohort programmes (the field is hidden).
  cohorts: ContactCohortOption[];
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

  return (
    <section id="contact-tutor" className="det-contact">
      <div className="det-contact-card">
        <h2 className="det-contact-title">Have a question?</h2>
        <p className="det-contact-blurb">
          Message {tutorName} about anything — whether this programme is right
          for you, the schedule, pricing, or joining a future cohort. No account
          needed; they&apos;ll reply via your preferred channel.
        </p>
        <button
          type="button"
          className="pub-btn-primary det-contact-btn"
          onClick={openForm}
        >
          Message {tutorName}
        </button>
      </div>

      {open && (
        <ContactModal
          programmeId={programmeId}
          tutorName={tutorName}
          cohorts={cohorts}
          done={done}
          error={error}
          pending={pending}
          onClose={close}
          onSubmit={handleSubmit}
        />
      )}
    </section>
  );
}

function ContactModal({
  programmeId,
  tutorName,
  cohorts,
  done,
  error,
  pending,
  onClose,
  onSubmit,
}: {
  programmeId: string;
  tutorName: string;
  cohorts: ContactCohortOption[];
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
        aria-labelledby="contact-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="wl-done">
            <div className="wl-done-icon" aria-hidden="true">
              ✓
            </div>
            <h2 id="contact-modal-title" className="wl-modal-title">
              Message sent
            </h2>
            <p className="wl-modal-sub">
              {tutorName} can see your message and will reach out via your
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
            <h2 id="contact-modal-title" className="wl-modal-title">
              Message {tutorName}
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

              {cohorts.length > 0 && (
                <label className="wl-field">
                  <span className="wl-field-label">
                    Which cohort interests you?{' '}
                    <span className="wl-optional">(optional)</span>
                  </span>
                  <select
                    name="cohortInterest"
                    className="wl-input"
                    defaultValue=""
                    disabled={pending}
                  >
                    <option value="">Just asking / not sure yet</option>
                    {cohorts.map((c) => (
                      <option key={c.id} value={c.label}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

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
