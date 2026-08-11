'use server';

// mynclex/app/(app)/admin/emails/actions.ts
//
// The manual half of the retry policy.
//
// ⭐ The machine tries briefly and then stops (four attempts across
// roughly an hour, in lib/email/send.ts). Anything still failing after
// that becomes a support item and waits for a person — deliberately, so
// that nothing self-heals-and-hides a real problem. This is the button
// that person presses.
//
// ⚠ A 'use server' module may export ONLY async functions. No types, no
// constants, no re-exports — a bare re-export breaks the production
// build while tsc and eslint both pass.

import { requireAdminPermission, PERM_COMMS_MANAGE } from '@/lib/access';
import { requeueEmail } from '@/lib/email/outbox';
import { deliverEmailById } from '@/lib/email/send';
import { revalidatePath } from 'next/cache';

/** Put a dead row back in the queue and attempt it straight away. */
export async function retryEmailAction(
  emailId: string
): Promise<{ ok: boolean; error?: string }> {
  await requireAdminPermission(PERM_COMMS_MANAGE);

  const requeued = await requeueEmail(emailId);
  if (!requeued.ok) return { ok: false, error: requeued.error };

  // Attempt it now rather than leaving it for a sweep: someone is
  // standing here waiting to find out whether it worked, and a button
  // that reports "queued" tells them nothing they wanted to know.
  const sent = await deliverEmailById(emailId);
  revalidatePath('/admin/emails');

  if (!sent.ok) return { ok: false, error: sent.message };
  return { ok: true };
}
