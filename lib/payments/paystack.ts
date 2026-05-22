// mynclex/lib/payments/paystack.ts
//
// The ONLY file that talks to Paystack. Isolates the secret key and the
// two HTTP calls we make: initialize (start a transaction) and verify
// (confirm one). Server-only — the secret key never reaches the browser.
//
// PAYSTACK_SECRET_KEY: test key (sk_test_…) in .env.local for dev; live
// key as a Cloudflare Worker secret in prod.

import 'server-only';

const PAYSTACK_BASE = 'https://api.paystack.co';

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error('PAYSTACK_SECRET_KEY is not set');
  }
  return key;
}

export type PaystackInitParams = {
  email: string;
  amountMinor: number;          // smallest currency unit (pesewas / cents)
  currency: string;             // 'GHS' | 'USD'
  reference: string;            // our own reference, stored on the payment row
  callbackUrl: string;          // where Paystack redirects the browser back to
  metadata?: Record<string, unknown>;
};

type PaystackInitResponse = {
  status: boolean;
  message: string;
  data: { authorization_url: string; access_code: string; reference: string };
};

type PaystackVerifyResponse = {
  status: boolean;
  message: string;
  data: {
    status: string;             // 'success' when paid
    amount: number;             // smallest unit, what was actually charged
    currency: string;
    reference: string;
    customer?: { email?: string };
  };
};

export async function paystackInitialize(p: PaystackInitParams): Promise<PaystackInitResponse> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: p.email,
      amount: p.amountMinor,
      currency: p.currency,
      reference: p.reference,
      callback_url: p.callbackUrl,
      metadata: p.metadata ?? {},
    }),
  });

  const data = (await res.json()) as PaystackInitResponse;
  if (!res.ok || !data?.status) {
    throw new Error(data?.message || 'Paystack initialize failed');
  }
  return data;
}

export async function paystackVerify(reference: string): Promise<PaystackVerifyResponse> {
  const res = await fetch(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const data = (await res.json()) as PaystackVerifyResponse;
  if (!res.ok || !data?.status) {
    throw new Error(data?.message || 'Paystack verify failed');
  }
  return data;
}
