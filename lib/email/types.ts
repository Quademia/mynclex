// mynclex/lib/email/types.ts
//
// The shared vocabulary of the email layer. Nothing happens in this
// file — it is the dictionary every other file in lib/email/ agrees on,
// and the single place a new event key or a new status is declared.
//
// Doc: docs/product-plan/transactional-email.md

import type { Currency } from '@/lib/products/money';

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
export type EmailEventKey = 'payment.received' | 'enrolment.tutor_added' | 'waitlist.converted';

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
  attempts: number;
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
  /** Sample payloads for the admin preview — one per variant worth eyeballing. */
  previews: { label: string; payload: P }[];
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
