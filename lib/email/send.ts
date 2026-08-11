// mynclex/lib/email/send.ts
//
// The sender. Takes a queued row, renders it, hands it to Resend, and
// records what came back.
//
// ⚠ NO `resend` SDK — a plain fetch to their REST API. Three reasons,
// the first specific to this repo: node_modules lives in the PARENT
// checkout (worktrees share it via upward resolution), and `npm install`
// here has a documented history of dropping Tailwind's native
// lightningcss binary and breaking the dev server's CSS on every
// request. Second, the SDK is a thin wrapper over one POST. Third, fetch
// is native on Cloudflare Workers, which is where this runs.
//
// Doc: docs/product-plan/transactional-email.md

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueEmail } from './outbox';
import { renderOutboxRow } from './render';
import { SUPPORT_EMAIL } from './templates/wrapper';
import type { EnqueueInput, FailureClass, OutboxRow, SendOutcome } from './types';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * ⭐ THE AUTOMATIC WINDOW IS DELIBERATELY SHORT (settled with Sam,
 * 2026-08-11). Four tries spanning roughly an hour, then it stops and
 * becomes a support item.
 *
 * Sam's argument, which killed a longer schedule: a system that quietly
 * succeeds on attempt four has HIDDEN a day-long problem — you would
 * never learn Resend had a bad night, and "it silently stopped sending"
 * is the exact thing this whole layer exists to prevent. So the window
 * is short enough that anything real is still sitting on the admin page
 * where a person can see it, and long enough that a thirty-second blip
 * at 11pm fixes itself without waking anybody.
 */
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000];

/**
 * Resend's error names, sorted by what a retry could possibly achieve.
 * Verified against their published error reference, 2026-08-11.
 *
 * ⚠ There is NO error here for a bad recipient. A typo'd or non-existent
 * address is ACCEPTED by Resend and bounces afterwards, so it never
 * reaches this table at all — the row is marked SENT and the bounce is
 * only visible by reading Resend's last_event. Do not add retry rules
 * for "bad address"; there is nothing here to hang them on.
 */
const FAILURE_BY_CODE: Record<string, FailureClass> = {
  // Nothing will fix these. Dead on the first failure.
  validation_error: 'PERMANENT',
  invalid_from_address: 'PERMANENT',
  invalid_attachment: 'PERMANENT',
  missing_required_field: 'PERMANENT',
  invalid_idempotency_key: 'PERMANENT',
  invalid_idempotent_request: 'PERMANENT',

  // Hiccups.
  rate_limit_exceeded: 'TRANSIENT',
  application_error: 'TRANSIENT',
  internal_server_error: 'TRANSIENT',
  concurrent_idempotent_requests: 'TRANSIENT',

  // Out of allowance — retry tomorrow, not in ten minutes.
  daily_quota_exceeded: 'QUOTA',
  monthly_quota_exceeded: 'QUOTA',

  // Not about this email. EVERY email is failing.
  missing_api_key: 'CONFIG',
  invalid_api_key: 'CONFIG',
  restricted_api_key: 'CONFIG',
};

function classify(code: string): FailureClass {
  // Unknown codes are treated as transient. Erring toward "try again"
  // is the safer default: too tight sends nothing, and nobody ever
  // reports an email they did not know was coming.
  return FAILURE_BY_CODE[code] ?? 'TRANSIENT';
}

/** Next UTC midnight — where a quota failure waits. */
function nextUtcMidnight(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 5, 0));
}

// ─────────────────────────────────────────────────────────────────────
// The Resend call
// ─────────────────────────────────────────────────────────────────────

async function postToResend(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}): Promise<SendOutcome> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  // Missing config is reported as a CONFIG failure rather than thrown.
  // That keeps the queue usable on a machine with no key at all: rows
  // enqueue, sit as FAILED with a plain reason, and drain the moment the
  // key appears — which is exactly how it should behave when the key is
  // merely wrong, so there is no separate path to get right.
  if (!apiKey) {
    return {
      ok: false,
      code: 'missing_api_key',
      message: 'RESEND_API_KEY is not set in this environment.',
      failure: 'CONFIG',
    };
  }
  if (!from) {
    return {
      ok: false,
      code: 'invalid_from_address',
      message: 'EMAIL_FROM is not set in this environment.',
      failure: 'PERMANENT',
    };
  }

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Belt and braces on top of the unique index: if our own guard
        // were ever bypassed, Resend collapses the duplicate itself.
        // ⓘ If they reject the header we will see it as
        // `invalid_idempotency_key` on the admin page — the database
        // index remains the real guarantee either way.
        'Idempotency-Key': args.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        // ⭐ We send FROM noreply@ because these are auto-generated, but
        // a real person hitting Reply must not hit a wall. Reply-To
        // catches them silently and routes to support. The footer also
        // says where to write, for the people who read first.
        reply_to: [SUPPORT_EMAIL],
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    });
  } catch (e) {
    // Network-level: never reached Resend, so nothing was sent.
    return {
      ok: false,
      code: 'network_error',
      message: (e as Error).message,
      failure: 'TRANSIENT',
    };
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    /* falls through to the status check below */
  }

  if (response.ok) {
    const id = (parsed as { id?: string } | null)?.id;
    if (id) return { ok: true, providerMessageId: id };
    return {
      ok: false,
      code: 'application_error',
      message: 'Resend accepted the request but returned no message id.',
      failure: 'TRANSIENT',
    };
  }

  const err = parsed as { name?: string; message?: string } | null;
  const code = err?.name ?? `http_${response.status}`;
  return {
    ok: false,
    code,
    message: err?.message ?? `Resend returned HTTP ${response.status}.`,
    failure: FAILURE_BY_CODE[code] ?? (response.status >= 500 ? 'TRANSIENT' : classify(code)),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Attempting one row
// ─────────────────────────────────────────────────────────────────────

export type DeliverResult =
  | { ok: true; alreadySent?: boolean }
  | { ok: false; code: string; message: string };

/**
 * Try to send one outbox row and record the outcome.
 *
 * Safe to call more than once: an already-SENT row short-circuits, so
 * the inline path and a later sweep cannot double-send the same row.
 */
export async function deliverOutboxRow(row: OutboxRow): Promise<DeliverResult> {
  const admin = createServiceRoleClient();

  if (row.status === 'SENT') return { ok: true, alreadySent: true };

  const rendered = renderOutboxRow(row);
  if (!rendered) {
    // A row queued for an email nobody built. Permanent by definition,
    // and it belongs on the admin page saying so rather than throwing
    // and taking every row behind it down with it.
    await admin
      .from('nclex_email_outbox')
      .update({
        status: 'DEAD',
        attempts: row.attempts + 1,
        last_attempt_at: new Date().toISOString(),
        last_error_code: 'no_template',
        last_error_message: `No template is registered for "${row.event_key}".`,
      })
      .eq('email_id', row.email_id);
    return { ok: false, code: 'no_template', message: 'No template for this event.' };
  }

  const outcome = await postToResend({
    to: row.to_email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    // The fingerprint IS the idempotency key — the same three facts the
    // database uniqueness rule uses.
    idempotencyKey: `${row.event_key}:${row.subject_ref}:${row.stage}`,
  });

  const attempts = row.attempts + 1;
  const nowISO = new Date().toISOString();

  if (outcome.ok) {
    await admin
      .from('nclex_email_outbox')
      .update({
        status: 'SENT',
        attempts,
        last_attempt_at: nowISO,
        sent_at: nowISO,
        rendered_subject: rendered.subject,
        provider_message_id: outcome.providerMessageId,
        last_error_code: null,
        last_error_message: null,
      })
      .eq('email_id', row.email_id);
    return { ok: true };
  }

  // ⭐ THE REASON DECIDES, NOT THE COUNT.
  let status: 'FAILED' | 'DEAD' = 'FAILED';
  let sendAfter = new Date();

  if (outcome.failure === 'PERMANENT') {
    // No point waiting a day to learn what Resend already told us.
    status = 'DEAD';
  } else if (outcome.failure === 'QUOTA') {
    // Not this email's fault, and not fixable by trying sooner. It also
    // must NOT count toward the death limit — five quota failures could
    // be five days apart.
    sendAfter = nextUtcMidnight();
  } else if (outcome.failure === 'CONFIG') {
    // Every email is failing. Keep it alive so the backlog drains the
    // moment the key is fixed; never let it die of a problem that is
    // not about it.
    sendAfter = new Date(Date.now() + RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]);
  } else {
    // TRANSIENT — the only class the attempt count applies to.
    const delay = RETRY_DELAYS_MS[attempts - 1];
    if (delay == null) status = 'DEAD';
    else sendAfter = new Date(Date.now() + delay);
  }

  await admin
    .from('nclex_email_outbox')
    .update({
      status,
      attempts,
      last_attempt_at: nowISO,
      send_after: sendAfter.toISOString(),
      last_error_code: outcome.code,
      last_error_message: outcome.message,
    })
    .eq('email_id', row.email_id);

  return { ok: false, code: outcome.code, message: outcome.message };
}

/** Load one row by id and attempt it. What the inline path and Retry use. */
export async function deliverEmailById(emailId: string): Promise<DeliverResult> {
  if (!emailId) return { ok: false, code: 'not_found', message: 'No email id.' };
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('nclex_email_outbox')
    .select('*')
    .eq('email_id', emailId)
    .maybeSingle();
  if (!data) return { ok: false, code: 'not_found', message: 'Outbox row not found.' };
  return deliverOutboxRow(data as OutboxRow);
}

// ─────────────────────────────────────────────────────────────────────
// Reading the other half of the picture
// ─────────────────────────────────────────────────────────────────────

/**
 * Ask Resend what actually happened to emails we handed over.
 *
 * ⭐ THIS IS WHY DEFERRING THE BOUNCE WEBHOOK IS AFFORDABLE. Our table
 * knows we handed the email over; it cannot know the recipient's mail
 * server rejected it half a minute later, because that outcome never
 * comes back through the send call. Resend does know — and exposes it as
 * `last_event` — so the admin page PULLS it per row on demand instead of
 * us building a public endpoint with signature verification to be
 * PUSHED it. Sam's question, 2026-08-11.
 *
 * ⚠ Best-effort by design. If Resend is slow or unreachable the page
 * still renders: a monitoring view that fails to load because a third
 * party is down is not monitoring.
 *
 * ⭐ BUT IT REPORTS WHY IT CAME BACK EMPTY. Returning a bare {} on
 * failure makes "Resend has not told us yet" look identical to "we could
 * not ask", and a column that quietly stops answering is precisely the
 * silence this whole layer exists to detect. Found the hard way on
 * 2026-08-11: a send-only Resend key sends perfectly and cannot read
 * anything back, so every row read "Handed over" for ever with no hint
 * as to why.
 *
 * @returns statuses keyed by message id, plus `error` when the lookup
 *          itself could not be performed.
 */
export async function fetchDeliveryStatus(
  messageIds: string[]
): Promise<{ statuses: Record<string, string>; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (messageIds.length === 0) return { statuses: {} };
  if (!apiKey) {
    return { statuses: {}, error: 'No Resend key is set in this environment.' };
  }

  const results = await Promise.allSettled(
    messageIds.map(async (id) => {
      const res = await fetch(`${RESEND_ENDPOINT}/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { name?: string; message?: string } | null;
        const err = new Error(body?.message ?? `Resend returned HTTP ${res.status}.`);
        err.name = body?.name ?? `http_${res.status}`;
        throw err;
      }
      const body = (await res.json()) as { last_event?: string };
      return [id, body.last_event ?? ''] as const;
    })
  );

  const statuses: Record<string, string> = {};
  let firstError: Error | undefined;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value[1]) statuses[r.value[0]] = r.value[1];
    } else if (!firstError) {
      firstError = r.reason as Error;
    }
  }

  // Only report an error if NOTHING came back — a single slow lookup
  // among twenty successful ones is noise, not a fault worth a banner.
  if (Object.keys(statuses).length === 0 && firstError) {
    const restricted = firstError.name === 'restricted_api_key';
    return {
      statuses,
      error: restricted
        ? 'This Resend key can only send, not read. Delivery status needs a full-access key.'
        : firstError.message,
    };
  }
  return { statuses };
}

// ─────────────────────────────────────────────────────────────────────
// The instant path
// ─────────────────────────────────────────────────────────────────────

/**
 * Queue an email and start sending it immediately, WITHOUT making the
 * caller wait for Resend.
 *
 * ⭐ Why instant rather than queue-and-flush (settled with Sam,
 * 2026-08-11): a receipt arriving 5–15 minutes after payment is a worse
 * product than one arriving in three seconds, and a scheduled flusher
 * cannot beat that — GitHub's schedules run late under load. So the
 * happy path sends now and the queue is the safety net underneath it,
 * not the normal route.
 *
 * `waitUntil` is what stops that costing the buyer anything: her success
 * page returns at once and the Worker keeps the send alive after the
 * response has gone. Available here because next.config.ts already calls
 * initOpenNextCloudflareForDev(), so it behaves the same on localhost.
 *
 * ⚠ NEVER THROWS, and never returns a failure that a caller should act
 * on. The money landing matters more than the receipt: if queueing or
 * sending falls over, the payment must still complete. That is what the
 * admin page is for.
 */
export async function enqueueAndSend(input: EnqueueInput): Promise<void> {
  let emailId = '';
  try {
    const queued = await enqueueEmail(input);
    if (!queued.ok) {
      console.error('[email] enqueue failed', input.eventKey, input.subjectRef, queued.error);
      return;
    }
    // Empty id = nothing to send (a suppressed example.com address).
    if (!queued.emailId) return;
    emailId = queued.emailId;
  } catch (e) {
    console.error('[email] enqueue threw', input.eventKey, (e as Error).message);
    return;
  }

  const attempt = deliverEmailById(emailId).catch((e: Error) => {
    console.error('[email] send threw', emailId, e.message);
    return { ok: false as const, code: 'threw', message: e.message };
  });

  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(attempt);
  } catch {
    // No Worker context (a script, a test). Fall back to awaiting the
    // send — slower for the caller, but nothing is dropped, and the row
    // is already safely queued either way.
    await attempt;
  }
}
