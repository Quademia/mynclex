// mynclex/lib/payments/settle.ts
//
// One call for the callback page: confirm with Paystack (verify) then
// grant access (activate). Both halves are idempotent, so a refresh or a
// double-hit is safe.

import 'server-only';
import { verifyPayment } from './verify';
import { activatePaymentByReference } from './activate';
import type { SettleResult } from './types';

export async function settlePayment(reference: string): Promise<SettleResult> {
  const v = await verifyPayment(reference);
  if (!v.ok) {
    // PENDING / FAILED / NOT_FOUND / ERROR — nothing to activate.
    return { ok: false, status: v.status, error: v.error };
  }

  // Confirmed paid (or already paid) → grant access.
  const a = await activatePaymentByReference(reference);
  if (!a.ok) {
    return { ok: false, status: 'ERROR', error: a.error };
  }

  const status =
    a.outcome === 'INVITE_SENT'
      ? 'INVITE_SENT'
      : a.outcome === 'PENDING_APPROVAL'
        ? 'PENDING_APPROVAL'
        : a.outcome === 'ALREADY'
          ? 'ALREADY'
          : 'ACCESS_READY';
  return { ok: true, status };
}
