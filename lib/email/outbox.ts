// mynclex/lib/email/outbox.ts
//
// The only door into the email queue.
//
// "There should be an email for this." Writes one row. If a row with the
// same fingerprint already exists, it quietly does nothing and reports
// that it was already there.
//
// ⭐ THE CONSEQUENCE WORTH STATING OUT LOUD: enqueuing is safe to attempt
// repeatedly. Any path may claim a receipt is owed for a checkout as
// often as it likes — the first wins, the rest are no-ops. That is what
// lets Paystack's callback and the tutor's "mark paid" button both point
// at the same email without either knowing the other exists, and what
// makes Paystack's webhook retries harmless.
//
// The refusal is done by the DATABASE (the unique index on event_key +
// subject_ref + stage), not by a lookup here. "Check whether it exists,
// then insert" loses the race when two retries land in the same moment,
// which is the exact situation this protects against — so the insert is
// simply attempted and a unique violation is read as success.
//
// Doc: docs/product-plan/transactional-email.md

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { EnqueueInput, OutboxRow } from './types';

export type EnqueueResult =
  | { ok: true; emailId: string; created: boolean }
  | { ok: false; error: string };

/** Postgres unique-violation. Here it means "already queued", i.e. success. */
const UNIQUE_VIOLATION = '23505';

/**
 * Queue one email.
 *
 * Never throws: a failure to enqueue must not take down the payment that
 * triggered it. The caller logs and carries on — the money landing is
 * more important than the receipt, and the admin page exists precisely
 * so a missing row can be found later.
 */
export async function enqueueEmail(input: EnqueueInput): Promise<EnqueueResult> {
  const stage = (input.stage ?? '-').trim();
  // The blank-stage trap is enforced by a CHECK too; caught here so the
  // caller gets a sentence instead of a database error.
  if (stage === '') return { ok: false, error: 'Stage may not be blank — use "-" for a one-off.' };

  const toEmail = input.toEmail.trim().toLowerCase();
  if (!toEmail) return { ok: false, error: 'No recipient address.' };

  // ⚠ Addresses on the reserved example.com never accept mail, so every
  // one is a guaranteed hard bounce. Dev's seed data holds 18 of them,
  // and a table scan that hit them all would post a ~90% bounce rate on
  // a low-volume Resend account — the ratio automated abuse detection
  // watches. Declining to queue an address that cannot receive is not a
  // hole in the sending path: it is not a test of anything.
  if (toEmail.endsWith('@example.com') || toEmail.endsWith('.example.com')) {
    return { ok: true, emailId: '', created: false };
  }

  const admin = createServiceRoleClient();

  const { data, error } = await admin
    .from('nclex_email_outbox')
    .insert({
      event_key: input.eventKey,
      subject_ref: input.subjectRef,
      stage,
      to_email: toEmail,
      to_user_id: input.toUserId ?? null,
      payload_json: input.payload,
      send_after: (input.sendAfter ?? new Date()).toISOString(),
      expires_at: input.expiresAt?.toISOString() ?? null,
    })
    .select('email_id')
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // Already queued by an earlier pass, a concurrent one, or the other
      // anchor. Exactly what the fingerprint is for.
      const { data: existing } = await admin
        .from('nclex_email_outbox')
        .select('email_id')
        .eq('event_key', input.eventKey)
        .eq('subject_ref', input.subjectRef)
        .eq('stage', stage)
        .maybeSingle();
      return { ok: true, emailId: existing?.email_id ?? '', created: false };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, emailId: data.email_id, created: true };
}

/**
 * Rows the sender should attempt right now: queued or mid-retry, and due.
 *
 * ⚠ EXPIRED is applied here rather than silently skipped, so a stale row
 * ends up visible on the admin page with a reason instead of quietly
 * never going. (No email sets expires_at in slice 1a; the handling
 * exists so slice 1b's per-email policy is a value, not a code change.)
 */
export async function claimDueEmails(limit = 25): Promise<OutboxRow[]> {
  const admin = createServiceRoleClient();
  const nowISO = new Date().toISOString();

  const { data, error } = await admin
    .from('nclex_email_outbox')
    .select('*')
    .in('status', ['QUEUED', 'FAILED'])
    .lte('send_after', nowISO)
    .order('send_after', { ascending: true })
    .limit(limit);

  if (error || !data) return [];

  const rows = data as OutboxRow[];
  const live: OutboxRow[] = [];
  const stale: string[] = [];
  for (const row of rows) {
    if (row.expires_at && row.expires_at < nowISO) stale.push(row.email_id);
    else live.push(row);
  }

  if (stale.length > 0) {
    await admin
      .from('nclex_email_outbox')
      .update({
        status: 'EXPIRED',
        last_error_code: 'expired',
        last_error_message: 'Passed its send-by time before it could be sent.',
      })
      .in('email_id', stale);
  }

  return live;
}

/** One row by id — what the Retry button and the admin drill-in read. */
export async function getOutboxRow(emailId: string): Promise<OutboxRow | null> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('nclex_email_outbox')
    .select('*')
    .eq('email_id', emailId)
    .maybeSingle();
  return (data as OutboxRow | null) ?? null;
}

/**
 * Put a DEAD row back in the queue. The manual half of the retry policy:
 * the machine tries briefly and then stops, and a person decides whether
 * it goes again.
 *
 * Attempts are reset so the row gets a fresh automatic window rather
 * than dying again on the next tick.
 */
export async function requeueEmail(emailId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from('nclex_email_outbox')
    .update({
      status: 'QUEUED',
      attempts: 0,
      send_after: new Date().toISOString(),
      last_error_code: null,
      last_error_message: null,
    })
    .eq('email_id', emailId)
    .in('status', ['DEAD', 'FAILED', 'EXPIRED']);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
