// mynclex/lib/payments/types.ts
//
// Shared shapes for the payments domain. The "glossary" every other
// payments file agrees on. See db/migrations/20260601120000 for the
// nclex_payments table these mirror.

export type Currency = 'GHS' | 'USD';

export type PaymentPurpose =
  | 'BANK_PURCHASE'
  | 'READINESS_PURCHASE'
  | 'PROGRAMME_INITIAL'
  | 'PROGRAMME_INSTALLMENT'
  | 'BANK_OPTIN_AT_PROGRAMME';

// What the buyer is paying for. Bank purchases pick their own currency;
// a programme's currency is fixed by the programme itself. cohortId is the
// picked cohort for a tutor-led programme (null/omitted for self-paced).
export type CheckoutTarget =
  | { kind: 'BANK'; productId: string; currency: Currency }
  | { kind: 'PROGRAMME'; programmeId: string; cohortId?: string | null };

export type StartPaymentInput = {
  email: string;
  userId?: string | null;       // set when a logged-in student buys; null for pay-first guests
  target: CheckoutTarget;
  baseUrl: string;              // origin used to build the Paystack callback URL
};

export type StartPaymentResult =
  | { ok: true; reference: string; authorizationUrl: string }
  | { ok: false; error: string };

export type VerifyResult =
  | { ok: true; status: 'PAID' | 'ALREADY'; reference: string; purpose: PaymentPurpose }
  | { ok: false; status: 'PENDING' | 'FAILED' | 'NOT_FOUND' | 'ERROR'; error: string };

// settlePayment = verify + activate, for the callback page.
//   ACCESS_READY      — paid and access granted (buyer already had an account)
//   PENDING_APPROVAL  — paid; tutor-led enrolment created, awaiting tutor approval
//   INVITE_SENT       — paid; pay-first guest must finish setup via the emailed link
//   ALREADY           — already settled (idempotent re-hit)
export type SettleResult =
  | { ok: true; status: 'ACCESS_READY' | 'PENDING_APPROVAL' | 'INVITE_SENT' | 'ALREADY' }
  | { ok: false; status: 'PENDING' | 'FAILED' | 'NOT_FOUND' | 'ERROR'; error: string };
