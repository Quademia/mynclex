// mynclex/lib/enrolments/types.ts
//
// Shared shapes for the enrolment surfaces (Slice 1). The status +
// source string unions mirror the CHECK constraints on
// nclex_enrolments (db/schema.sql). Keep them in lock-step with the
// table — they're the TS half of the same contract.

import type { NextPaymentView } from '@/lib/payments/schedule';

export type EnrolmentStatus =
  | 'PENDING_APPROVAL'
  | 'ENROLLED'
  | 'PAUSED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export type EnrolmentSource = 'SELF_PAID' | 'TUTOR_ADDED' | 'ADMIN_GRANT';

/** One row in the tutor's cohort roster — enrolment joined to the
 *  student's profile. */
export interface EnrolmentRosterRow {
  enrolment_id: string;
  user_id: string;
  status: EnrolmentStatus;
  enrolment_source: EnrolmentSource;
  enrolled_at: string;
  name: string;
  email: string;
  // The next payment owed on this enrolment (Slice 7d), or null when the
  // plan is fully paid / there's no installment plan. Drives the roster's
  // "Access · payment" column and the "Mark paid" action.
  nextPayment: NextPaymentView | null;
}

/** A contact channel the lead can ask to be reached on. Mirrors the
 *  preferred_contact allowed set on nclex_cohort_waitlist. */
export type PreferredContact = 'CALL' | 'SMS' | 'WHATSAPP' | 'EMAIL';

/** Display label per channel (tutor waitlist badges + the public form). */
export const PREFERRED_CONTACT_LABEL: Record<PreferredContact, string> = {
  CALL: 'Call',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
};

/** Channels that need a phone number — used by the phone-required rule. */
export const PHONE_CONTACT_METHODS: PreferredContact[] = ['CALL', 'SMS', 'WHATSAPP'];

/** One PENDING student-initiated waitlist lead (Slice 4), shown in the
 *  cohort workspace. forename/surname/email are self-supplied (no
 *  account yet); phone + message are optional; preferred_contact says
 *  how they want to be reached. */
export interface WaitlistEntry {
  waitlist_id: string;
  forename: string;
  surname: string;
  email: string;
  phone: string | null;
  preferred_contact: PreferredContact[];
  message: string | null;
  created_at: string;
}

/** Status → display label + pill class (see styles/enrolments.css). */
export const ENROLMENT_STATUS_META: Record<
  EnrolmentStatus,
  { label: string; pillClass: string }
> = {
  PENDING_APPROVAL: { label: 'Pending approval', pillClass: 'enrol-pill-pending' },
  ENROLLED: { label: 'Enrolled', pillClass: 'enrol-pill-enrolled' },
  PAUSED: { label: 'Paused', pillClass: 'enrol-pill-paused' },
  REJECTED: { label: 'Rejected', pillClass: 'enrol-pill-rejected' },
  CANCELLED: { label: 'Cancelled', pillClass: 'enrol-pill-cancelled' },
  EXPIRED: { label: 'Expired', pillClass: 'enrol-pill-expired' },
};

export const ENROLMENT_SOURCE_LABEL: Record<EnrolmentSource, string> = {
  SELF_PAID: 'Self-paid',
  TUTOR_ADDED: 'Added by you',
  ADMIN_GRANT: 'Admin grant',
};

/** The lifecycle transitions a tutor can drive from the roster (Slice 2a).
 *  EXPIRED is excluded — that's the nightly sweep's job, not a button. */
export type EnrolmentAction = 'approve' | 'reject' | 'pause' | 'resume' | 'cancel';

/** Which action buttons a roster row shows, given its current status.
 *  Terminal statuses (REJECTED / CANCELLED / EXPIRED) show none. */
export function actionsForStatus(status: EnrolmentStatus): EnrolmentAction[] {
  switch (status) {
    case 'PENDING_APPROVAL':
      return ['approve', 'reject'];
    case 'ENROLLED':
      return ['pause', 'cancel'];
    case 'PAUSED':
      return ['resume', 'cancel'];
    default:
      return [];
  }
}

/** Per-action presentation: button label, visual tone, and whether it
 *  needs a confirm dialog (access-removing) and an optional note field. */
export const ENROLMENT_ACTION_META: Record<
  EnrolmentAction,
  {
    label: string;
    tone: 'primary' | 'neutral' | 'danger';
    confirm: boolean;
    note: boolean;
  }
> = {
  approve: { label: 'Approve', tone: 'primary', confirm: false, note: false },
  resume: { label: 'Resume', tone: 'primary', confirm: false, note: false },
  pause: { label: 'Pause', tone: 'neutral', confirm: true, note: false },
  reject: { label: 'Reject', tone: 'danger', confirm: true, note: true },
  cancel: { label: 'Cancel', tone: 'danger', confirm: true, note: true },
};
