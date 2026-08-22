// mynclex/lib/email/types.ts
//
// The shared vocabulary of the email layer. Nothing happens in this
// file — it is the dictionary every other file in lib/email/ agrees on,
// and the single place a new event key or a new status is declared.
//
// Doc: docs/product-plan/transactional-email.md

import type { Currency } from '@/lib/products/money';
import type { EmailAttachment } from './ics';

export type { EmailAttachment };

// ─────────────────────────────────────────────────────────────────────
// Event keys
// ─────────────────────────────────────────────────────────────────────
// dot.case, matching a row in the doc's catalog.
//
// ⚠ THE CATALOG IS A CAPTURE LIST, NOT A BUILD PLAN (settled with Sam,
// 2026-08-11). It holds 24 entries; some will never be built, and events
// will appear that were never listed. So this union carries only what is
// actually wired, and grows one entry at a time as each email is built —
// it is not seeded with the catalog. An unbuilt key in here would be a
// promise the code cannot keep, which is exactly how the EMAIL-TRIGGER
// marker convention ended up with one marker whose key is not in the
// catalog at all.
//
// ⭐ `enrolment.tutor_added` and `waitlist.converted` share ONE template
// (enrolment-added.ts) but stay two keys, settled 2026-08-12. In the
// system they are indistinguishable — both are the same function call
// producing the same enrolment row — so the difference is only what the
// student remembers: one is news, the other answers a question she asked
// weeks ago. Two keys so the admin queue reports which actually
// happened, and so changing the wording of one cannot silently change
// the other.
export type EmailEventKey =
  | 'payment.received'
  | 'payment.tutor_received'
  | 'payment.installment_due'
  | 'payment.installment_overdue'
  | 'enrolment.tutor_added'
  | 'enrolment.approved'
  | 'enrolment.rejected'
  | 'waitlist.converted'
  /**
   * ⭐ The first FAN-OUT email: one trigger, a whole cohort of recipients.
   * Every key above it has exactly one. See SessionReminderPayload.
   */
  | 'session.reminder'
  /**
   * The first email about SOMEONE'S STANDING rather than their money or
   * their place in a class — and the first onboarding: nothing else
   * welcomes a new tutor. Tutor-onboarding slice 1c.
   */
  | 'tutor.added_by_admin'
  /**
   * ⭐ The first email we send that the recipient will not want. Every
   * key above it is good news or neutral admin; this one tells someone
   * their standing with us has been withdrawn. Tutor-onboarding 1d.
   */
  | 'tutor.suspended'
  /**
   * ⭐ The counterpart, and the first pair in the catalog where one key
   * exists only because the other does. Sam spotted that suspension told
   * someone their standing was withdrawn and nothing told them when it
   * came back. Tutor-onboarding 1d.
   */
  | 'tutor.reinstated'
  /**
   * The verdict on a self-application. Tutor-onboarding slice 2b.
   *
   * ⚠ NOT an alias of tutor.added_by_admin, though the outcome is the
   * same row. That one welcomes someone an admin CHOSE; these two answer
   * someone who ASKED — and the rejection has no counterpart at all.
   * Same split, and the same reason, as enrolment.approved /
   * enrolment.rejected: shared facts, nothing else in common.
   */
  | 'tutor.application_approved'
  | 'tutor.application_rejected'
  /**
   * Acknowledgement to the applicant. Tutor-onboarding 2a-i.
   */
  | 'tutor.application_received'
  /**
   * ⭐ THE FIRST EMAIL THIS PRODUCT SENDS TO ITSELF. Every key above it
   * goes to a student or a tutor; this one tells US that a queue has
   * something in it. Recipient ≠ actor — without it the applications
   * page fills up and nobody knows, which is the whole reason the plan
   * doc lists it (§10). Tutor-onboarding 2a-i.
   */
  | 'tutor.application_submitted_admin';

// ─────────────────────────────────────────────────────────────────────
// The tutor welcome (tutor-onboarding slice 1c, dialled in slice 3)
// ─────────────────────────────────────────────────────────────────────
// ⚠ NOTHING ABOUT PLANS OR LIMITS. Tutor plans and quotas are
// deliberately unmodelled (tutor-onboarding.md §12), and admission is not
// plan assignment — so there is no tier field here to render a promise
// the software cannot keep.
//
// ⭐ ONE DIAL, NOT A SECOND EMAIL (slice 3, 2026-08-22). An admin can
// make a tutor two ways — promote somebody who already has an account,
// or invite an address that has none — and only the DOOR differs. The
// facts and the intent are identical: an admin chose you, you are a
// tutor now, write your profile. §10's test for splitting a key is
// "shared facts, nothing else in common"; that is not this. So `entry`
// turns, exactly as it does on enrolment-added, which settled the same
// fork on 2026-08-12 as "TWO DIALS, NOT FOUR EMAILS".

export type TutorAddedEntry =
  /**
   * They already had an account (an admin promotion). Every link in the
   * email sits behind the password they already have.
   */
  | 'LOG_IN'
  /**
   * Brand new — the account was created FOR them by an admin invite, and
   * `setUpUrl` is the one-time link minted by generateLink. ⚠ It is the
   * ONLY way in: there is no password to fall back on, which is why the
   * workspace and profile links must NOT be the button on this branch.
   * They point behind a door this person cannot yet open.
   */
  | 'SET_UP';

export type TutorAddedByAdminPayload = {
  /** Null when the account has no profile name yet. */
  recipientName: string | null;
  /**
   * ⚠ NO addedByName, deliberately (Sam, 2026-08-21). Which admin
   * promoted them is OUR provenance — it lives on
   * nclex_tutors.approved_by and shows in the admin directory. Putting
   * a staff member's personal name in an outward email is a
   * disclosure decision, and it would have been made by accident the
   * first time TUTORS_MANAGE was delegated.
   */
  /**
   * Whether they were already a student. Renders a reassurance ONLY when
   * true: someone who never had a student account should not be told
   * what they keep, or they will wonder what they lost.
   */
  keepsStudentRole: boolean;
  workspaceUrl: string;
  profileUrl: string;
  /**
   * Which door. ⚠ OPTIONAL, and absence means `LOG_IN` — not because
   * that reads nicer, but because `renderOutboxRow` renders from the
   * FROZEN payload alone, and every tutor.added_by_admin row queued
   * before slice 3 (including the ones on prod) has no `entry` key at
   * all. Those rows must keep rendering the email they actually sent.
   *
   * ⓘ Not a guess at the call site either: the action knows which branch
   * it just took, the same way inviteOrAttachAndEnrol returns `invited`.
   */
  entry?: TutorAddedEntry;
  /**
   * The one-time setup link, on `SET_UP` only.
   *
   * ⚠ `payload` is typed `Record<string, unknown>` at the enqueue
   * boundary, so TypeScript cannot enforce "SET_UP implies this is
   * present" where it would matter. The template therefore degrades
   * rather than trusts: with no link it prints the sign-in-code route
   * instead of a dead button, which genuinely works — the account
   * exists, so a code lets them in.
   */
  setUpUrl?: string | null;
};

// ─────────────────────────────────────────────────────────────────────
// Suspension (tutor-onboarding slice 1d)
// ─────────────────────────────────────────────────────────────────────
// ⚠ NO suspendedByName, for the same reason the welcome email carries no
// addedByName — and more so. A staff member's personal name on a conduct
// decision invites them to be contacted about it personally. Support is
// the route back; the decision is the organisation's.
export type TutorSuspendedPayload = {
  /** Null when the account has no profile name yet. */
  recipientName: string | null;
  /**
   * ⭐ Always present. The RPC refuses a suspension without one, so this
   * is not optional — and a suspension notice with no reason leaves the
   * recipient with no possible action but to write and ask why.
   */
  reason: string;
  /**
   * Whether anyone is currently enrolled with them. Renders the "your
   * students keep their access" reassurance ONLY when true, per the rule
   * keepsStudentRole set above: do not tell someone what they keep when
   * they had none, or they will wonder what they lost.
   */
  hasActiveStudents: boolean;
};

// ─────────────────────────────────────────────────────────────────────
// Reinstatement (tutor-onboarding slice 1d)
// ─────────────────────────────────────────────────────────────────────
// ⚠ NO reason field, and it is not an oversight. Reinstatement takes no
// reason — nclex_tutor_record_decision requires one only for SUSPENDED
// and REJECTED, because undoing a restriction needs no justification the
// way imposing one does. There is nothing here to render.
export type TutorReinstatedPayload = {
  /** Null when the account has no profile name yet. */
  recipientName: string | null;
  /**
   * Whether they own any programmes. Renders "your programmes are listed
   * again" ONLY when true — a tutor suspended before publishing anything
   * would otherwise go looking for a catalogue they never had.
   */
  hasProgrammes: boolean;
  workspaceUrl: string;
};

// ─────────────────────────────────────────────────────────────────────
// The verdict on an application (tutor-onboarding slice 2b)
// ─────────────────────────────────────────────────────────────────────
// ⚠ NEITHER NAMES THE ADMIN — the third and fourth outings for the rule
// tutor-added-by-admin set. Who decided is our provenance
// (nclex_tutors.decided_by and the trail); a staff name on a refusal
// invites the applicant to take it up with that person.

export type TutorApplicationApprovedPayload = {
  /** Null when the account has no profile name yet. */
  recipientName: string | null;
  /**
   * Whether they already held STUDENT. Renders the "you keep your student
   * access" reassurance ONLY when true — the rule keepsStudentRole set in
   * tutor-added-by-admin. A role-less registrant never had it, and telling
   * them what they keep makes them wonder what they lost.
   */
  keepsStudentRole: boolean;
  workspaceUrl: string;
  profileUrl: string;
};

// ─────────────────────────────────────────────────────────────────────
// Submission (tutor-onboarding slice 2a-i)
// ─────────────────────────────────────────────────────────────────────

export type TutorApplicationReceivedPayload = {
  /** Null when the account has no profile name yet. */
  recipientName: string | null;
  /**
   * Shown as "Request #N" — a user-facing number, per §9. It is honest
   * about the fact that we know they have asked before, which is the
   * MyTeacher precedent this arc verified rather than assumed.
   */
  submissionCount: number;
  /**
   * ⚠ Whether this replaces an earlier attempt. The copy MUST differ:
   * "thanks for applying" to somebody resubmitting a rejected
   * application reads as though we lost the first one.
   */
  isResubmission: boolean;
  applicationUrl: string;
};

/**
 * ⚠ INTERNAL. The only payload in this file whose recipient is us, which
 * is why it may carry the applicant's own words — there is no disclosure
 * question when the reader is the person deciding.
 */
export type TutorApplicationSubmittedAdminPayload = {
  applicantName: string;
  applicantEmail: string;
  organisation: string | null;
  submissionCount: number;
  /** What they wrote. Saves the admin a click to triage. */
  requestNote: string;
  /** Straight into the queue. */
  queueUrl: string;
};

export type TutorApplicationRejectedPayload = {
  /** Null when the account has no profile name yet. */
  recipientName: string | null;
  /**
   * ⭐ Always present. nclex_tutor_record_decision refuses REJECTED
   * without one, so this cannot be null — and per §9 the applicant is
   * shown it, because someone re-applying without knowing what was wrong
   * wastes everyone's time.
   */
  reason: string;
  /**
   * Where to update and resubmit (§9). ⚠ A FORWARD REFERENCE while 2b is
   * built first: the route lands with 2a-i/2c, and the two release
   * together, so nothing real is ever sent to a 404.
   */
  applicationUrl: string;
};

// ─────────────────────────────────────────────────────────────────────
// The outbox row
// ─────────────────────────────────────────────────────────────────────

//   QUEUED  waiting its turn
//   SENT    handed to Resend and accepted
//   FAILED  last attempt failed; still inside the automatic retry window
//   DEAD    given up on; needs a person
//   EXPIRED went stale unsent (expires_at passed) — unused in slice 1a
export type EmailStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'DEAD' | 'EXPIRED';

export type OutboxRow = {
  email_id: string;
  event_key: string;
  subject_ref: string;
  stage: string;
  to_email: string;
  to_user_id: string | null;
  payload_json: Record<string, unknown>;
  rendered_subject: string | null;
  status: EmailStatus;
  /** Times tried, whatever the reason. The honest total. */
  attempts: number;
  /**
   * Strikes — TRANSIENT failures only, and the ONLY thing the automatic
   * give-up rule reads.
   *
   * ⭐ Separate from `attempts` because the two numbers answer different
   * questions and one column could not do both: the api-key branch needs
   * a counter that keeps GROWING (it indexes its back-off by it) while
   * the give-up rule needs one that ignores everything not the email's
   * own fault. See migration 20260910120000.
   */
  transient_attempts: number;
  last_error_code: string | null;
  last_error_message: string | null;
  send_after: string;
  expires_at: string | null;
  created_at: string;
  last_attempt_at: string | null;
  sent_at: string | null;
  provider_message_id: string | null;
};

/** Everything enqueueEmail needs. `stage` defaults to '-' (never blank). */
export type EnqueueInput = {
  eventKey: EmailEventKey;
  /** What it is ABOUT — a checkout group, an enrolment. Not the subject line. */
  subjectRef: string;
  /** Which step of a series. Omit for a one-off; it becomes '-'. */
  stage?: string;
  toEmail: string;
  /** Only when a profile exists. A pay-first buyer has none. */
  toUserId?: string | null;
  /** The frozen facts the template renders from. */
  payload: Record<string, unknown>;
  /** Don't send before this. Omit to send immediately. */
  sendAfter?: Date;
  /** If unsent by this moment, mark EXPIRED instead. Unused in slice 1a. */
  expiresAt?: Date;
};

// ─────────────────────────────────────────────────────────────────────
// The installment reminder + overdue payloads (slice 1b)
// ─────────────────────────────────────────────────────────────────────
// ⚠ THESE TWO ARE FILLED IN SQL, NOT IN TYPESCRIPT. The nightly sweep
// builds them with jsonb_build_object (migration 20260911120000), so
// TypeScript checks NOTHING about what actually arrives — this type is a
// contract with the other side of a wall, not a guarantee. A key renamed
// here and not there renders as nothing in somebody's inbox, which is
// gamma's `{{expiryDate}}` failure exactly. Keep it thin, and change both
// halves in one commit.

/** Shared by both — everything that describes the debt and who owes it. */
type InstallmentBase = {
  /** Forename. Null-safe: the template greets without a name. */
  recipientName: string | null;
  programmeTitle: string;
  /** Null for self-paced, and for cohorts the tutor never named. */
  cohortName: string | null;
  /** ⭐ Named deliberately: "a system took your access" becomes "a person". */
  tutorName: string;
  currency: Currency;
  amountMinor: number;
  /** ISO 8601, as Postgres renders a timestamptz into jsonb. */
  dueAtISO: string;
  positionNo: number;
  totalPositions: number;
  /** Builds the self-serve link: /checkout/installment/<enrolmentId>. */
  enrolmentId: string;
};

/** T-7 and T-3. One template, two tones. */
export type InstallmentDuePayload = InstallmentBase & {
  lead: 'T-7' | 'T-3';
  /**
   * Whether a missed payment actually pauses access on this programme.
   * FALSE for tutors who turned payment-gating off — and the consequence
   * line must then be omitted, because for that reader it is not true.
   */
  gatesAccess: boolean;
};

/** Sent the night the sweep acts. */
export type InstallmentOverduePayload = InstallmentBase & {
  /**
   * Whether she was actually paused in that run. FALSE on a non-gated
   * programme: she is overdue and nothing happened to her access, so the
   * email says so rather than claiming a pause that never occurred.
   */
  paused: boolean;
};

// ─────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────

/** A template turns a frozen payload into a finished email. */
export type EmailTemplate<P = Record<string, unknown>> = {
  /** Matches the event key it renders. */
  key: EmailEventKey;
  /**
   * What this email IS, in a person's words — "Payment receipt", not
   * "Payment received".
   *
   * ⚠ Deliberately not derived from `key`. The preview list shows both,
   * and a name that merely re-spells the trigger would print the same
   * words twice in a list whose only job is to be scannable at 24 rows.
   * The key says when it fires; this says what lands in the inbox.
   */
  name: string;
  subject: (payload: P) => string;
  /** The inner body. The wrapper and footer are added by render.ts. */
  body: (payload: P) => string;
  /**
   * Files to travel with the email. Optional, and absent on all eight
   * templates that predate it — an email without one behaves exactly as
   * before, which is what made adding this safe to the shared sender.
   *
   * ⭐ Built HERE rather than frozen into the payload at enqueue, because
   * an attachment is a *rendering* of the facts, not a fact. The payload
   * stays plain JSON that SQL can write, and the .ics is assembled on the
   * way out — the same reason the HTML is not stored either.
   */
  attachments?: (payload: P) => EmailAttachment[];
  /** Sample payloads for the admin preview — one per variant worth eyeballing. */
  previews: { label: string; payload: P }[];
};

// ─────────────────────────────────────────────────────────────────────
// The live-session reminder payload
// ─────────────────────────────────────────────────────────────────────
// ⚠ FILLED IN SQL, like the two installment payloads above — the nightly
// sweep and the tutor's button both go through ONE plpgsql builder
// (`nclex_enqueue_session_reminders`), so TypeScript checks nothing about
// what actually arrives. This type is the contract, not the enforcement.
//
// ⭐ One builder, two triggers, on purpose. Wiring the button straight to
// its own send is how the automatic path ends up written twice and the
// two drift — the same rule the payment anchors follow.

export type SessionReminderPayload = {
  /** Her forename. Null only if a profile somehow has none. */
  recipientName: string | null;
  programmeTitle: string;
  cohortName: string | null;
  tutorName: string;
  /** What the tutor called this class — the marker activity's title. */
  sessionTitle: string;
  scheduledAtISO: string;
  durationMinutes: number | null;
  /** 'Zoom' · 'Google Meet' · whatever the tutor typed. */
  platform: string | null;
  joinUrl: string | null;
  meetingId: string | null;
  passcode: string | null;
  joiningInstructions: string | null;
  /** ⭐ The .ics UID — stable across reschedules so her calendar UPDATES. */
  sessionId: string;
  /** ⭐ The .ics SEQUENCE — `updated_at` as epoch seconds, monotonic. */
  sequence: number;
  /**
   * Which trigger produced this. Wording only — a nightly reminder
   * announces itself as routine, a tutor's deliberate send should read as
   * coming from a person, because it usually carries news.
   */
  trigger: 'NIGHTLY' | 'MANUAL';
};

// ─────────────────────────────────────────────────────────────────────
// The receipt's payload
// ─────────────────────────────────────────────────────────────────────
// ⭐ A SNAPSHOT, NOT A LOOKUP. Every value here is frozen at enqueue
// time, so a receipt re-sent in October still says what she was charged
// in August, and rendering never re-reads a table that has moved on.

/**
 * How far the purchase actually got by the time the receipt was owed.
 * ⭐ This exists because of what the pay-first branch does (verified in
 * lib/payments/activate.ts, 2026-08-11): when the buyer has no account,
 * the payment is marked SETUP_REQUIRED and **nothing is granted at all**
 * — no enrolment, no subscription, no credits — until she finishes
 * /welcome, possibly days later. A receipt that listed "Enrolled in
 * Cohort 3" in that state would be stating something that has not
 * happened.
 */
export type ReceiptFraming =
  /** Granted. The line items describe what she now holds. */
  | 'ACTIVATED'
  /** Paid; the tutor still has to approve the enrolment. */
  | 'PENDING_APPROVAL'
  /** Paid with no account yet. An invite is out; nothing is granted. */
  | 'SETUP_REQUIRED';

/** One purchased thing within the charge. A checkout may contain several. */
export type ReceiptLineItem = {
  purpose:
    | 'BANK_PURCHASE'
    | 'READINESS_PURCHASE'
    | 'PROGRAMME_INITIAL'
    | 'PROGRAMME_INSTALLMENT'
    | 'BANK_OPTIN_AT_PROGRAMME';
  /** What she bought, in her words: "NCLEX Question Bank — 3 months". */
  label: string;
  amountMinor: number;
  /**
   * "What you now have", already resolved to a sentence at enqueue time.
   *
   * ⚠ Null is a legitimate value, not a gap. Under SETUP_REQUIRED a bank
   * pass has no end date to state, because the end date is computed AT
   * activation (`duration_days` from the moment of the grant, in
   * insertBankSubscriptionOnce) — so there is nothing true to say yet,
   * and inventing a date would be wrong.
   */
  grants: string | null;
};

export type PaymentReceiptPayload = {
  framing: ReceiptFraming;
  /** Their name if we have one. Pay-first buyers often have none. */
  recipientName: string | null;
  currency: Currency;
  /** The whole charge. Line items sum to this. */
  totalMinor: number;
  paidAtISO: string;
  /** Paystack's reference, or null for money the tutor collected directly. */
  reference: string | null;
  /** 'CARD' via Paystack, or 'OFF_PLATFORM' when a tutor recorded it. */
  method: 'CARD' | 'OFF_PLATFORM';
  lineItems: ReceiptLineItem[];
  /** Where to go next, when there is somewhere. Absolute URL. */
  ctaHref: string | null;
  ctaLabel: string | null;
};

// ─────────────────────────────────────────────────────────────────────
// The tutor's half of the same money
// ─────────────────────────────────────────────────────────────────────
// ⭐ EVERY PAYMENT NOTIFIES BOTH SIDES. The student gets the receipt
// above; the tutor gets this. Two emails, one anchor, two audiences —
// the tutor does not want a receipt, and the student does not want a
// roster update.
//
// ⭐ PROGRAMME MONEY ONLY. A single checkout can carry a bank pass or
// readiness credits alongside the programme fee; that money is
// QAcademy's, not the tutor's, so those lines are excluded from both the
// list and the total. `amountMinor` here is therefore NOT
// PaymentReceiptPayload.totalMinor for the same checkout, and the two
// disagreeing is correct.
//
// ⚠ IT SAYS "RECORDED", NEVER "PAID OUT". Payment splits between
// QAcademy and tutors are an explicit v1 deferral (CLAUDE.md), so this
// email must not imply money has reached the tutor's own account. It
// reports that a payment was recorded against their programme, which is
// the only thing the system actually knows.

/**
 * Where the student's plan stands AFTER this payment, read from the
 * enrolment's frozen snapshot — the same source the nightly sweep uses,
 * so the tutor is never quoted a schedule the sweep disagrees with.
 *
 * ⓘ Null when there is no plan to report: a pay-first buyer has no
 * enrolment yet, and an UPFRONT_FULL purchase has no schedule to stand
 * anywhere in.
 */
export type TutorPaymentStanding = {
  /** Zero means paid in full, and the template says so in words. */
  remainingMinor: number;
  /** Null once fully paid — there is no next date. */
  nextDueISO: string | null;
  paidCount: number;
  totalPayments: number;
  /**
   * Whether `nextDueISO` had ALREADY PASSED when the money arrived.
   *
   * ⚠ FROZEN AT ENQUEUE, NOT ASKED AT RENDER. The template renders from
   * the payload alone and may run on a retry hours later, so evaluating
   * "is this in the past?" there would answer against a different `now`
   * than the payment did — the same email could then say two different
   * things about one moment. Both are one boolean here instead.
   */
  nextDueOverdue: boolean;
  /**
   * She is paused RIGHT NOW for arrears, and this payment did not lift
   * it — the gate asks "are you current?", not "did you just pay", so
   * one instalment against two missed leaves the door shut.
   *
   * ⚠ Named for arrears specifically. A TUTOR_MANUAL pause is the
   * tutor's own decision and has nothing to do with this money; folding
   * the two together would explain their own action back to them as a
   * payment problem.
   */
  accessPausedForArrears: boolean;
};

export type TutorPaymentReceivedPayload = {
  /**
   * ⭐ Reuses the STUDENT's framing rather than inventing a second dial.
   * The caller already computed it, and each value is a fact the tutor
   * has a distinct reason to want:
   *   ACTIVATED        — she is on your roster, nothing to do.
   *   PENDING_APPROVAL — she is waiting on YOU. Actionable.
   *   SETUP_REQUIRED   — paid, but no account yet, so she will not
   *                      appear on the roster until she finishes.
   *
   * ⚠ ONE EMAIL PER CHECKOUT, so the FIRST framing is the only one the
   * tutor ever sees. A pay-first purchase enqueues SETUP_REQUIRED, and
   * the ACTIVATED enqueue days later is refused by the fingerprint.
   * That is why the SETUP_REQUIRED wording has to explain the roster
   * gap on its own — no follow-up is coming to correct it.
   */
  framing: ReceiptFraming;
  /** The tutor's forename, for the greeting. Null greets without a name. */
  tutorName: string | null;
  /**
   * Who paid. Falls back to the address when there is no profile — a
   * pay-first buyer genuinely has no name yet, and the tutor can still
   * identify her by the email below.
   */
  studentName: string;
  studentEmail: string;
  programmeTitle: string;
  /** Null on a self-paced programme, which has no cohort. */
  cohortName: string | null;
  currency: Currency;
  /** Programme lines in this checkout only. See the note above. */
  amountMinor: number;
  paidAtISO: string;
  /**
   * How the money was recorded.
   *
   *   CARD           she paid online through the platform.
   *   ADMIN_RECORDED a Quademia admin typed it in on the tutor's behalf.
   *   OFF_PLATFORM   collected outside the platform, recorder unknown.
   *
   * ⚠ THE THIRD VALUE IS NOT DEFENSIVE PADDING — dev holds six such rows
   * (checked 2026-08-19): `collection_channel = 'OFF_PLATFORM'` with
   * `recorded_by_user_id` NULL, from before that column was populated.
   * Folding them in with ADMIN_RECORDED would have this email name a
   * party nobody can evidence, about money. Today's Mark-paid always
   * stamps a recorder, so new rows never land here — but old ones exist
   * and the honest answer is to say less.
   *
   * ⓘ There is no value for "the tutor recorded it": that case never
   * reaches this email at all — see the suppression rule in
   * lib/payments/tutor-notice.ts.
   */
  method: 'CARD' | 'ADMIN_RECORDED' | 'OFF_PLATFORM';
  /** "Payment 2 of 4" · "Deposit" · "Paid in full". Null when unknown. */
  planPosition: string | null;
  standing: TutorPaymentStanding | null;
  ctaHref: string;
  ctaLabel: string;
};

// ─────────────────────────────────────────────────────────────────────
// The tutor-enrolled payload
// ─────────────────────────────────────────────────────────────────────
// ⭐ TWO DIALS, NOT FOUR EMAILS (settled with Sam, 2026-08-12).
//
//   Dial 1 — `reason`: why she is getting this. Wording only.
//   Dial 2 — `entry`:  how she gets in. The real work.
//
// Dial 2 is not a guess: inviteOrAttachAndEnrol already returns
// `invited`, because it is the branch it just took.

export type EnrolmentReason = 'TUTOR_ADDED' | 'WAITLIST_CONVERTED';

export type EnrolmentEntry =
  /** She has an account. The link is a plain sign-in. */
  | 'LOG_IN'
  /**
   * Brand new. `actionUrl` is a one-time link minted by us via
   * generateLink, and it is the ONLY way into the account — there is no
   * password to fall back on.
   */
  | 'SET_UP';

export type EnrolmentAddedPayload = {
  reason: EnrolmentReason;
  entry: EnrolmentEntry;
  /** Always known here — the tutor typed it, or the lead left it. */
  recipientName: string | null;
  /**
   * Who added her. ⚠ Not decoration: "you have been enrolled" from
   * nobody in particular is indistinguishable from a phishing email.
   */
  tutorName: string;
  programmeName: string;
  /** Tutor-led only. Null on a self-paced programme, which has no cohort. */
  cohortName: string | null;
  /** Frozen at enrolment. Null = lifetime, and prints nothing. */
  accessExpiresAtISO: string | null;
  /**
   * The money line, when the tutor attached a payment plan.
   *
   * ⭐ Present because otherwise the FIRST thing she ever hears about
   * owing money is her access being paused by the nightly sweep. The
   * chasing belongs to payment.installment_due; this is only the
   * disclosure that a plan exists at all.
   */
  plan: {
    currency: Currency;
    /** The next payment due, in minor units. */
    nextAmountMinor: number;
    /** When it is due. Already resolved from the frozen schedule. */
    nextDueISO: string;
    /** Total number of payments in the plan, for "1 of 4". */
    totalPayments: number;
    /** How many are already recorded as received. */
    paidCount: number;
  } | null;
  actionUrl: string;
  actionLabel: string;
};

// ─────────────────────────────────────────────────────────────────────
// The tutor's verdict on a place she paid for
// ─────────────────────────────────────────────────────────────────────
// ⭐⭐ THESE TWO CLOSE A PROMISE THAT WAS ALREADY SHIPPED. The receipt's
// PENDING_APPROVAL variant has told buyers, on prod since 2026-08-18:
// "You will get another email as soon as your tutor approves your
// place." No such email existed. Five dev enrolments were sitting in
// that state having been told so.
//
// ⭐ How the gap was made, since it was not carelessness: on 2026-08-10
// `enrolment.confirmed` was deliberately FOLDED INTO `payment.received`
// — right, because on a normal checkout the money and the place land in
// the same instant for the same person. But that only holds on the
// ACTIVATED path. On the PENDING_APPROVAL path the place is confirmed
// LATER, BY A HUMAN, and that second moment went out of the catalog
// with the row that was deleted.
//
// ⓘ Only ever reached by a PAID checkout. A tutor-added enrolment is
// created ENROLLED and never passes through PENDING_APPROVAL — so the
// audience for these is exactly the audience the receipt promised.
//
// ⚠ TWO KEYS, TWO TEMPLATES — deliberately NOT the one-file-two-dials
// shape that enrolment.tutor_added and waitlist.converted share. Those
// are one event with a different backstory; these are opposite outcomes
// with different content, different destination and different footer.

/** Shared by both verdicts — who, what place, and who decided. */
type EnrolmentVerdictBase = {
  /** Forename. Null-safe: the template greets without a name. */
  recipientName: string | null;
  programmeName: string;
  /** Null on a self-paced programme, which has no cohort. */
  cohortName: string | null;
  /**
   * ⚠ Not decoration. A verdict on money already paid, arriving from
   * nobody in particular, is indistinguishable from a phishing email.
   */
  tutorName: string;
};

export type EnrolmentApprovedPayload = EnrolmentVerdictBase & {
  /** The cohort's start date. Null for self-paced — it starts now. */
  startsOnISO: string | null;
  /** Frozen at enrolment. Null = lifetime, and prints nothing. */
  accessExpiresAtISO: string | null;
  actionUrl: string;
  actionLabel: string;
};

// ⚠ NO REFUND IS PROMISED, AND NO REFUND HAPPENS. nclex_reject_enrolment
// sets status, terminal_at and tutor_note — nothing else. Her payment row
// stays ACTIVATED and `payment.refunded` is unbuilt, so the money has no
// automatic next step. Settled with Sam 2026-08-19: point her at the
// tutor for the conversation rather than write a commitment the software
// cannot keep. The footer already offers support as the second route.
export type EnrolmentRejectedPayload = EnrolmentVerdictBase & {
  /**
   * ⭐⭐ THE TUTOR'S REAL ADDRESS, DELIBERATELY (Sam, 2026-08-19):
   * "we have to ensure communication is easy".
   *
   * ⚠ This REPLACED a button to the programme page's Contact-the-tutor
   * form, which looked safer and was not. That RPC is idempotent on
   * (programme, email): if an open lead already exists for the pair it
   * returns the existing one and NEVER INSERTS the new message, while
   * still showing her a green tick. A refused student is more likely
   * than average to have enquired before buying, so the one message
   * that most needs to arrive was the one most likely to vanish — with
   * neither side able to tell. A mailto cannot fail silently.
   *
   * ⓘ It is a real disclosure: the tutor's account address, which may
   * be personal, reaches a student who has been refused. Accepted
   * knowingly — tutors are manually vetted in v1 and she has paid them
   * money. If tutors ever get a separate public contact address, this
   * is the field that should read it instead.
   */
  tutorEmail: string;
  /**
   * ⚠ NULL FOR EVERY TUTOR TODAY, and that is not a bug. `phone_number`
   * exists on nclex_users but is empty for all of them (checked
   * 2026-08-19), and no screen collects it — tutor/profile calls contact
   * fields "separate future work". Built conditional so the line appears
   * by itself the day a number exists, rather than needing this email
   * reopened.
   */
  tutorPhone: string | null;
  /**
   * ⚠ THE TUTOR'S NOTE IS DELIBERATELY ABSENT, and this is why the field
   * does not exist here. `nclex_reject_enrolment` stores `p_note` in
   * `tutor_note`, and NOTHING in the app has ever displayed it — so no
   * tutor has been given any reason to think it is read by a student.
   * A tutor who typed "didn't pay last time, avoid" into what reads as
   * an internal box must not have it mailed to the person it is about.
   * To include it, relabel that box in the roster UI first.
   */
  tutorNoteIsNotSent?: never;
};

// ─────────────────────────────────────────────────────────────────────
// Send outcomes
// ─────────────────────────────────────────────────────────────────────

/**
 * ⭐ THE REASON DECIDES THE RETRY, NOT A COUNT (settled 2026-08-11).
 * Resend returns a named code on every rejection, and the codes divide
 * cleanly by what a retry could possibly achieve.
 */
export type FailureClass =
  /** Nothing will fix it. DEAD on the first failure — no waiting a day. */
  | 'PERMANENT'
  /** A hiccup. Retry with widening gaps; the attempt count backstops it. */
  | 'TRANSIENT'
  /** Out of quota. Retry, but tomorrow — not in ten minutes. */
  | 'QUOTA'
  /** Our key is wrong. EVERY email is failing; retry and shout. */
  | 'CONFIG';

export type SendOutcome =
  | { ok: true; providerMessageId: string }
  | { ok: false; code: string; message: string; failure: FailureClass };
