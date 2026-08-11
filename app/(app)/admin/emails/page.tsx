// mynclex/app/(app)/admin/emails/page.tsx
//
// "What's stuck?" — the pull half of email monitoring.
//
// ⭐ THE USEFUL VIEW IS "STUCK", NOT "EVERYTHING EVER". An all-rows list
// is noise nobody opens, and a page nobody opens is exactly how gamma's
// email layer came to be silently half-dead. So needs-attention leads,
// and recent sends sit underneath it to answer the one other question
// support actually gets asked — "did she get it?".
//
// ⚠ This page cannot catch every failure on its own. It shows rows that
// exist; it cannot show an email that was never queued at all. The push
// half — an alarm that fires when the queue has been stuck for N hours —
// is the next small piece, and it needs a channel that is not email,
// since the thing being watched is the mailer.
//
// Gated on COMMS_MANAGE, the bucket that already covers Announcements.

import { requireAdminPermission, PERM_COMMS_MANAGE } from '@/lib/access';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fetchDeliveryStatus } from '@/lib/email/send';
import type { OutboxRow } from '@/lib/email/types';
import { EmailsView } from './emails-view';

export const dynamic = 'force-dynamic';

/** Rows that should have gone and have not. The default view. */
const NEEDS_ATTENTION = ['DEAD', 'FAILED', 'EXPIRED', 'QUEUED'];

export default async function AdminEmailsPage() {
  await requireAdminPermission(PERM_COMMS_MANAGE);

  // Service-role read. The RLS policy would also allow it for this
  // admin, but the sender writes with service role and the page should
  // see exactly what the sender sees — including rows whose recipient
  // has no account.
  const admin = createServiceRoleClient();

  const [{ data: stuckData }, { data: sentData }] = await Promise.all([
    admin
      .from('nclex_email_outbox')
      .select('*')
      .in('status', NEEDS_ATTENTION)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('nclex_email_outbox')
      .select('*')
      .eq('status', 'SENT')
      .order('sent_at', { ascending: false })
      .limit(25),
  ]);

  const stuck = (stuckData ?? []) as OutboxRow[];
  const sent = (sentData ?? []) as OutboxRow[];

  // Ask Resend what became of the ones we handed over. Best-effort: a
  // slow or unconfigured provider must not stop the page rendering.
  const delivery = await fetchDeliveryStatus(
    sent.map((r) => r.provider_message_id).filter((id): id is string => !!id)
  );

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner eml-page">
        <EmailsView stuck={stuck} sent={sent} delivery={delivery} />
      </div>
    </main>
  );
}
