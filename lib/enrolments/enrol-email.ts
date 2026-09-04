// mynclex/lib/enrolments/enrol-email.ts
//
// Freezes the facts for "your tutor has enrolled you" and hands them to
// the email layer.
//
// ⭐ WHY THIS FILE EXISTS AT ALL, rather than the code living in
// actions.ts: the same reason lib/payments/result.ts holds
// sendPaymentReceipt. Each domain owns its own email builder, so an
// action gains ONE call rather than a block of lookups, and the shape of
// the payload sits next to the domain that knows what the words mean.
//
// ⭐ A SNAPSHOT, NOT A LOOKUP. Everything the template needs is resolved
// here and frozen into the payload, so a resend in October still names
// the cohort she was actually put into — even if the tutor has since
// renamed it, or the programme's access window has changed.
//
// Doc: docs/product-plan/transactional-email.md

import { appOrigin } from '@/lib/email/templates/wrapper';
import { enqueueAndSend } from '@/lib/email/send';
import type { EnrolmentAddedPayload, EnrolmentReason } from '@/lib/email/types';
import { buildSchedule } from '@/lib/payments/schedule';
import type { Currency } from '@/lib/payments/types';
import type { FrozenStrategySnapshot } from '@/lib/strategies/types';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Matches lib/payments/result.ts — an emailed link points at the real
// app, since the person reading it is not the person who ran the code.
//
// ⓘ The asymmetry this note used to describe is GONE (2026-09-04). It read:
// "the SET_UP link is minted by generateLink with the REQUEST's origin, so
// on localhost it points at localhost, while this LOG_IN link points at
// production either way." That split is exactly what stranded a tutor on
// prod — one working link in an email whose every other link went
// elsewhere. Both halves now follow the environment; see appOrigin().

type AdminClient = ReturnType<typeof createServiceRoleClient>;

export type EnrolEmailArgs = {
  /** Dial 1 — added out of the blue, or a place she waited for. */
  reason: EnrolmentReason;
  /**
   * Dial 2. True = brand new, so `setUpUrl` is her ONLY way in.
   * Comes straight from the branch inviteOrAttachAndEnrol just took.
   */
  invited: boolean;
  /** The one-time link we minted, when invited. Ignored otherwise. */
  setUpUrl: string | null;
  enrolmentId: string;
  toEmail: string;
  /** Null for a brand-new student — no profile row exists yet. */
  toUserId: string | null;
  recipientName: string | null;
  programmeId: string;
  cohortId: string | null;
  tutorId: string;
  /** Already frozen by the caller. Null = lifetime. */
  accessExpiresAtISO: string | null;
  /** The plan the tutor attached, if any. */
  plan: {
    snapshot: FrozenStrategySnapshot;
    received: number;
    currency: Currency;
  } | null;
};

/**
 * Queue the enrolment email. Returns whether it reached the queue —
 * NOT whether it was delivered (see enqueueAndSend).
 *
 * ⚠ Never throws. An enrolment that succeeded must not be reported as
 * failed because a name lookup fell over; the caller surfaces the
 * `false` as a warning beside a successful add, never as an error.
 */
export async function sendEnrolmentAddedEmail(args: EnrolEmailArgs): Promise<{ queued: boolean }> {
  try {
    const admin = createServiceRoleClient();
    const names = await readNames(admin, args);
    // A programme with no name is not a thing we can write an email
    // about — the subject line IS the programme name. Better to leave
    // the row unqueued and tell the tutor than to send "You have been
    // enrolled — ".
    //
    // ⚠ This return used to be SILENT, and cost a test run on 2026-08-12:
    // an enrolment succeeded, no row was queued, and nothing anywhere
    // said why. In the one layer built to stop unexplained silence, an
    // unexplained silence.
    if (!names) {
      console.error(
        '[email] enrolment email: could not read the names for',
        args.enrolmentId,
        'programme',
        args.programmeId,
      );
      return { queued: false };
    }

    const payload: EnrolmentAddedPayload = {
      reason: args.reason,
      entry: args.invited ? 'SET_UP' : 'LOG_IN',
      recipientName: args.recipientName,
      tutorName: names.tutorName,
      programmeName: names.programmeName,
      cohortName: names.cohortName,
      accessExpiresAtISO: args.accessExpiresAtISO,
      plan: planLine(args.plan),
      ...entryLink(args),
    };

    return await enqueueAndSend({
      // Two keys, one template — the queue reports which actually happened.
      eventKey: args.reason === 'WAITLIST_CONVERTED' ? 'waitlist.converted' : 'enrolment.tutor_added',
      // ⭐ The ENROLMENT, so one enrolment can only ever produce one of
      // these. Remove a student and re-add her and it is a new enrolment
      // id, so she is correctly told again.
      subjectRef: args.enrolmentId,
      toEmail: args.toEmail,
      toUserId: args.toUserId,
      payload: payload as unknown as Record<string, unknown>,
    });
  } catch (e) {
    console.error('[email] enrolment email failed for', args.enrolmentId, (e as Error).message);
    return { queued: false };
  }
}

/**
 * ⚠ The tutor's name is read from nclex_users, not from auth. A tutor
 * who somehow has no profile row falls back to the product name rather
 * than to an empty string — "MyNclex has enrolled you" is odd but true,
 * whereas " has enrolled you" reads as broken software.
 */
async function readNames(
  admin: AdminClient,
  args: EnrolEmailArgs,
): Promise<{ programmeName: string; cohortName: string | null; tutorName: string } | null> {
  const [prog, tutor, cohort] = await Promise.all([
    admin
      .from('nclex_programmes')
      .select('title')
      .eq('programme_id', args.programmeId)
      .maybeSingle(),
    admin.from('nclex_users').select('name').eq('id', args.tutorId).maybeSingle(),
    args.cohortId
      ? admin.from('nclex_cohorts').select('name').eq('cohort_id', args.cohortId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // ⚠ Inspect the ERRORS, not just the data. Reading `.data?.title` alone
  // turns "the query failed" and "the programme has no title" into the
  // same null — the same defect the receipt's delivery column had on
  // 08-11, where "Resend hasn't said" and "we couldn't ask" rendered
  // identically.
  if (prog.error) console.error('[email] programme read failed:', prog.error.message);
  if (tutor.error) console.error('[email] tutor read failed:', tutor.error.message);

  const programmeName = prog.data?.title?.trim();
  if (!programmeName) return null;

  return {
    programmeName,
    cohortName: (cohort.data as { name?: string } | null)?.name?.trim() ?? null,
    tutorName: tutor.data?.name?.trim() || 'Your tutor',
  };
}

/**
 * The next payment due, resolved from the same schedule engine the sweep
 * and the tile use — so the date in this email is the date her access
 * actually turns on.
 *
 * ⓘ Returns null for a fully-paid plan: there is nothing to disclose,
 * and "next payment: none" is noise.
 */
function planLine(plan: EnrolEmailArgs['plan']): EnrolmentAddedPayload['plan'] {
  if (!plan) return null;
  const schedule = buildSchedule(plan.snapshot, new Date(), plan.received);
  if (!schedule.next) return null;

  return {
    currency: plan.currency,
    nextAmountMinor: schedule.next.amountMinor,
    nextDueISO: schedule.next.dueDate.toISOString(),
    totalPayments: schedule.totalPayments,
    paidCount: schedule.paidCount,
  };
}

/**
 * Dial 2, resolved to a button.
 *
 * ⚠ Under SET_UP with no minted link, we deliberately fall back to the
 * sign-in page rather than sending a dead button. She has no password,
 * so that page is not much use — but the alternative is a link that
 * looks like the way in and is not, and the tutor is being told the mail
 * had a problem in the same breath.
 */
function entryLink(args: EnrolEmailArgs): { actionUrl: string; actionLabel: string } {
  if (args.invited && args.setUpUrl) {
    return { actionUrl: args.setUpUrl, actionLabel: 'Set up your account' };
  }
  return { actionUrl: `${appOrigin()}/login`, actionLabel: 'Log in' };
}
