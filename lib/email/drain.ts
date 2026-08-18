// mynclex/lib/email/drain.ts
//
// The postman. Looks in the outbox, takes what is due, and sends it.
//
// ⭐ WHY THIS EXISTS AT ALL. Every send in the product so far rides on
// somebody's request: `enqueueAndSend` writes the row and then finishes
// the send under `waitUntil`, on the tail of the visitor who caused it.
// The queue is the safety net, not the route. Two situations have no
// visitor, and in both of them nothing ever comes back for the row:
//
//   1. ⏰ THE SCHEDULED HALF. The 02:00 sweep decides an email is owed
//      and writes it. Nobody is awake, no request is in flight, so for
//      the whole time-driven half the drain is not the safety net —
//      it is the ONLY delivery path.
//   2. ⚠ THE RETRY POLICY, WHICH IS DESIGNED AND WAS NEVER RUNNING.
//      On failure `deliverOutboxRow` UPDATEs the row — status FAILED,
//      `send_after` pushed forward — and returns. Nothing re-reads it.
//      So the "four attempts across roughly an hour, then a human"
//      policy settled on 2026-08-11 has never actually retried anything;
//      the only second attempt in the product is a person clicking Retry
//      on /admin/emails. This file is the half that was missing.
//
// ⓘ It adds no sending logic. Claiming is `claimDueEmails` (written in
// slice 1a and, until now, called by nothing) and sending is
// `deliverOutboxRow` — the same function the inline path and the admin
// Retry button use. One sender, one retry policy, one set of rules to
// keep right. A separate drain that talked to Resend itself would be a
// second copy of all of it.
//
// Doc: docs/product-plan/transactional-email.md → "1b — the shape"

import 'server-only';
import { claimDueEmails } from './outbox';
import { deliverOutboxRow } from './send';

/**
 * How many rows one knock will attempt.
 *
 * ⚠ Deliberately ONE pass, not a loop that empties the tray. A Cloudflare
 * Worker is capped on subrequests per invocation, and one send costs
 * several (the Resend POST, plus the reads and the status write). Draining
 * an unbounded backlog inside a single invocation is how that cap gets hit
 * — and it would be hit by the burst case, which is exactly the case this
 * exists for.
 *
 * A backlog larger than this drains across successive knocks instead. For
 * ⏰ mail that costs nothing: nobody is waiting at 02:00, and the rows are
 * taken oldest-`send_after`-first, so the queue cannot starve.
 */
const DEFAULT_LIMIT = 25;

export type DrainFailure = {
  emailId: string;
  eventKey: string;
  code: string;
  message: string;
};

export type DrainSummary = {
  /** Rows that were due and attempted. */
  claimed: number;
  sent: number;
  failed: number;
  /** Enough to diagnose from a log line without opening the admin page. */
  failures: DrainFailure[];
};

/**
 * Send everything currently due.
 *
 * Never throws. This is called by a machine with nobody watching, so a
 * single bad row must not take the rest of the batch down with it — the
 * failure is recorded against that row (by `deliverOutboxRow`, which
 * already writes the reason and the next attempt time) and the loop
 * carries on.
 *
 * ⚠ Sequential on purpose. Firing fifty sends at once is the shape that
 * gets a low-volume Resend account rate-limited, and a burst is precisely
 * what the sweep produces. Slower is correct here; nobody is waiting.
 *
 * ⚠ NOT protected against two knocks overlapping. `claimDueEmails` selects
 * rows, it does not lock them, so two simultaneous drains would both
 * attempt the same batch. Two things blunt this and neither is a reason to
 * skip the third: `deliverOutboxRow` sends an idempotency key built from
 * the fingerprint, so Resend collapses the duplicate itself; the wasted
 * work is one extra attempt, not one extra email. The real fix is a
 * `concurrency` group on whatever does the knocking — the same guard
 * `recalibrate.yml` already carries, for the same reason.
 */
export async function drainOutbox(limit: number = DEFAULT_LIMIT): Promise<DrainSummary> {
  const rows = await claimDueEmails(limit);

  const summary: DrainSummary = {
    claimed: rows.length,
    sent: 0,
    failed: 0,
    failures: [],
  };

  for (const row of rows) {
    try {
      const result = await deliverOutboxRow(row);
      if (result.ok) {
        summary.sent += 1;
      } else {
        summary.failed += 1;
        summary.failures.push({
          emailId: row.email_id,
          eventKey: row.event_key,
          code: result.code,
          message: result.message,
        });
      }
    } catch (e) {
      // deliverOutboxRow is written not to throw, so reaching here means
      // something below it did — a network stack error, a Supabase client
      // fault. ⚠ The row's status is then whatever it was, which is
      // QUEUED or FAILED, so the next knock picks it up again. That is the
      // right outcome: an unexplained crash should not silently consume
      // somebody's email.
      summary.failed += 1;
      summary.failures.push({
        emailId: row.email_id,
        eventKey: row.event_key,
        code: 'drain_exception',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return summary;
}
