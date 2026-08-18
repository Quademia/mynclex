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
 * 2026-08-11). Roughly an hour, then it stops and becomes a support item.
 *
 * Sam's argument, which killed a longer schedule: a system that quietly
 * succeeds on the last attempt has HIDDEN a day-long problem — you would
 * never learn Resend had a bad night, and "it silently stopped sending"
 * is the exact thing this whole layer exists to prevent. So the window
 * is short enough that anything real is still sitting on the admin page
 * where a person can see it, and long enough that a thirty-second blip
 * at 11pm fixes itself without waking anybody.
 *
 * ⓘ FOUR DELAYS IS FIVE TRIES. Each entry schedules the NEXT attempt, so
 * the first failure buys attempt 2 and the fourth buys attempt 5; the
 * fifth failure finds no delay left and dies. This comment said "four"
 * until 2026-08-18 — harmless, but it is the number people quote.
 *
 * ⚠ These gaps are also why the drain must knock every few minutes. On an
 * hourly knock the same four delays would span four hours, which is the
 * concealment the short window exists to prevent. See the doorbell
 * migration, 20260909120000.
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
  // ⓘ These three are kept but are NOT how a bad key actually arrives on
  // a send — that is a 401 (see the failure line below). `missing_api_key`
  // is raised by our OWN guard before Resend is called at all, and
  // `restricted_api_key` was seen for real on 2026-08-11 — but from a
  // READ (fetchDeliveryStatus), not from sending. Left in place because
  // they cost nothing and the day Resend starts naming them, this is
  // already right.
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
    // ⚠⚠ 401 IS CHECKED BEFORE THE CODE TABLE, AND THAT ORDER IS THE FIX
    // (2026-08-18). Resend does NOT report a rejected key by name: every
    // bad credential — malformed, well-formed-but-wrong, or empty — comes
    // back as HTTP 401 carrying `validation_error` / "API key is invalid".
    // Probed against the live API on all three shapes; they are identical.
    //
    // Read through the table first, that lands on validation_error →
    // PERMANENT and the row DIES ON ITS FIRST ATTEMPT. Which is the exact
    // opposite of the rule for a key problem: EVERY email is failing, so
    // the queue must be held, not consumed, and drain by itself once the
    // key is fixed. ⭐ Before the drain existed this was dormant — nothing
    // re-read a failed row. Now a bad-key day would have the drain kill the
    // queue every five minutes while the sweep refills it.
    //
    // ⚠ DO NOT 'simplify' this by mapping validation_error to CONFIG in the
    // table. That name is also Resend's genuine code for a genuinely broken
    // request (bad from-address, missing field), which really is permanent;
    // reclassifying it wholesale would fill the queue with rows that can
    // never succeed and retry forever. The HTTP status is what separates
    // "our credentials were rejected" from "this email is malformed", and
    // nothing else Resend returns for a send is a 401.
    failure:
      response.status === 401
        ? 'CONFIG'
        : FAILURE_BY_CODE[code] ?? (response.status >= 500 ? 'TRANSIENT' : classify(code)),
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
  //
  // ⭐ TWO COUNTERS, ONE JOB EACH (2026-08-18). `attempts` is the honest
  // total of tries — it rises on every failure, feeds the admin page, and
  // is what the CONFIG branch below indexes its back-off by.
  // `transient_attempts` is strikes, and ONLY the TRANSIENT branch both
  // increments and reads it.
  //
  // ⚠ They were one column until 2026-08-18, and the promise directly
  // above the QUOTA branch was therefore false: five quota nights left a
  // row on its last life, so the next ordinary hiccup killed it without
  // ever retrying. Merging them again re-creates that; "just stop
  // counting quota" does not work either, because CONFIG needs a number
  // that keeps growing. See migration 20260910120000.
  let status: 'FAILED' | 'DEAD' = 'FAILED';
  let sendAfter = new Date();
  let transientAttempts = row.transient_attempts;

  if (outcome.failure === 'PERMANENT') {
    // No point waiting a day to learn what Resend already told us.
    status = 'DEAD';
  } else if (outcome.failure === 'QUOTA') {
    // Not this email's fault, and not fixable by trying sooner. It also
    // must NOT count toward the death limit — five quota failures could
    // be five days apart. ⭐ Now actually true: strikes are untouched here.
    sendAfter = nextUtcMidnight();
  } else if (outcome.failure === 'CONFIG') {
    // Every email is failing. Keep it alive so the backlog drains the
    // moment the key is fixed; never let it die of a problem that is
    // not about it.
    //
    // ⚠ This reads `attempts`, NOT strikes, and must keep doing so: it
    // wants a number that grows on every failure so the gaps widen. A
    // counter frozen at 0 would index RETRY_DELAYS_MS[-1] — undefined —
    // and put an Invalid Date into send_after. That requirement is the
    // whole reason there are two columns.
    sendAfter = new Date(Date.now() + RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]);
  } else {
    // TRANSIENT — the only class the give-up rule applies to, and now the
    // only class that spends a strike.
    transientAttempts = row.transient_attempts + 1;
    const delay = RETRY_DELAYS_MS[transientAttempts - 1];
    if (delay == null) status = 'DEAD';
    else sendAfter = new Date(Date.now() + delay);
  }

  await admin
    .from('nclex_email_outbox')
    .update({
      status,
      attempts,
      transient_attempts: transientAttempts,
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
 * ⚠ NEVER THROWS. The money landing matters more than the receipt: if
 * queueing or sending falls over, the payment must still complete. That
 * is what the admin page is for.
 *
 * ⭐ It DOES report whether the row reached the queue (`queued`), added
 * 2026-08-12 for the tutor-enrolled email. Ignoring it stays correct and
 * is what the receipt does — by the time that fires, the money has moved
 * and there is nobody to tell. But when a tutor enrols a student, the
 * tutor is *standing right there*, and a mail that never even reached
 * the queue is total silence for the student. The one person who can fix
 * it is looking at the screen for one more second; this is what lets
 * them be told.
 *
 * ⚠ `queued: true` means QUEUED, not delivered. The send runs after the
 * response under waitUntil, and its outcome surfaces on /admin/emails —
 * never synchronously here.
 */
export async function enqueueAndSend(input: EnqueueInput): Promise<{ queued: boolean }> {
  let emailId = '';
  try {
    const queued = await enqueueEmail(input);
    if (!queued.ok) {
      console.error('[email] enqueue failed', input.eventKey, input.subjectRef, queued.error);
      return { queued: false };
    }
    // Empty id = nothing to send (a suppressed example.com address, or a
    // duplicate the fingerprint refused). Both are successful outcomes:
    // there is nothing wrong for a caller to report.
    if (!queued.emailId) return { queued: true };
    emailId = queued.emailId;
  } catch (e) {
    console.error('[email] enqueue threw', input.eventKey, (e as Error).message);
    return { queued: false };
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

  return { queued: true };
}
