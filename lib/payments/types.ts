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
// a programme's currency is fixed by the programme itself.
export type CheckoutTarget =
  | { kind: 'BANK'; productId: string; currency: Currency }
  | { kind: 'PROGRAMME'; programmeId: string };

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
