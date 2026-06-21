// mynclex/lib/enrolments/types.ts
//
// Shared shapes for the enrolment surfaces (Slice 1). The status +
// source string unions mirror the CHECK constraints on
// nclex_enrolments (db/schema.sql). Keep them in lock-step with the
// table — they're the TS half of the same contract.

import type { NextPaymentView } from '@/lib/payments/schedule';

// The enrolment roster lives at PROGRAMME level for both delivery
// modes (settled 2026-06-12 — payments-and-enrolment.md). Tutor-led
// shows every cohort's rows (cohort-tagged); self-paced shows the
// cohortless rows. The old RosterScope union (COHORT | PROGRAMME)
// died with the cohort-level mount — actions now take the programme
// id directly and the view branches on delivery mode, not mount.

/** One cohort of a tutor-led programme, as the roster surface needs it —
 *  the toolbar's cohort filter and the Add-student cohort picker.
 *  Cancelled cohorts stay in the filter (their rows still exist) but
 *  are excluded from the picker (enrolment is closed). */
export interface CohortOption {
  cohort_id: string;
  label: string;
  cancelled: boolean;
}

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
export type PausedReason = 'INSTALLMENT_OVERDUE' | 'TUTOR_MANUAL';

export interface EnrolmentRosterRow {
  enrolment_id: string;
  user_id: string;
  status: EnrolmentStatus;
  enrolment_source: EnrolmentSource;
  enrolled_at: string;
  name: string;
  email: string;
  // Which cohort the enrolment belongs to — NULL for self-paced rows.
  // The label is the display name (custom name or date-range autogen),
  // resolved server-side so the view never needs the cohort table.
  cohort_id: string | null;
  cohort_label: string | null;
  // Why a PAUSED row is paused — drives which actions/copy show (Give more
  // time + the futile-Resume warning apply to INSTALLMENT_OVERDUE). NULL
  // unless PAUSED.
  paused_reason: PausedReason | null;
  // The next payment owed on this enrolment (Slice 7d), or null when the
  // plan is fully paid / there's no installment plan. Drives the roster's
  // "Access · payment" column and the "Mark paid" action.
  nextPayment: NextPaymentView | null;
  // True when the student HAS a plan and has settled every payment — lets the
  // roster show "Paid in full" instead of the bare "—" used for no-plan rows.
  paymentFullyPaid: boolean;
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

/** One PENDING student-initiated waitlist lead (Slice 4), shown on the
 *  programme Enrolments page (cohort-badged — leads always belong to a
 *  cohort). forename/surname/email are self-supplied (no account yet);
 *  phone + message are optional; preferred_contact says how they want
 *  to be reached. */
export interface WaitlistEntry {
  waitlist_id: string;
  cohort_id: string;
  cohort_label: string;
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

/** Only an ENROLLED enrolment opens programme/cohort content. Every other
 *  status (and the null "no row" case) is shown but not enterable. Shared by
 *  the picker cards + the switch-popup list so the gating reads identically. */
export function canEnterStatus(status: EnrolmentStatus | null): boolean {
  return status === 'ENROLLED';
}

/** Short why-it's-locked line under a non-enterable row, keyed by status.
 *  ENROLLED never shows one. Mirrors the lifecycle tiles in
 *  payments-and-enrolment.md. Shared by the picker cards + the switch-popup. */
export const ENROLMENT_LOCKED_REASON: Record<
  Exclude<EnrolmentStatus, 'ENROLLED'>,
  string
> = {
  PENDING_APPROVAL: 'Waiting for your tutor to approve your enrolment.',
  PAUSED: 'Access paused — a payment is overdue. Your tutor can restore it.',
  REJECTED: 'Your enrolment request was declined.',
  CANCELLED: 'This enrolment was cancelled.',
  EXPIRED: 'Your access window has ended.',
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
  // Resume now confirms — it has a non-obvious consequence (an overdue student
  // gets re-paused by tonight's sweep), so the dialog spells that out.
  resume: { label: 'Resume', tone: 'primary', confirm: true, note: false },
  pause: { label: 'Pause', tone: 'neutral', confirm: true, note: false },
  reject: { label: 'Reject', tone: 'danger', confirm: true, note: true },
  cancel: { label: 'Cancel', tone: 'danger', confirm: true, note: true },
};
