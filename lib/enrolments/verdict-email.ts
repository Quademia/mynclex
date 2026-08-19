// mynclex/lib/enrolments/verdict-email.ts
//
// Freezes the facts for the tutor's verdict on a place a student PAID
// for — approved or not — and hands them to the email layer.
//
// ⭐ WHY THIS FILE EXISTS: the same convention as enrol-email.ts and
// lib/payments/tutor-notice.ts — each email owns its builder, so an
// action gains ONE call rather than a block of lookups.
//
// ⭐ WHY BOTH VERDICTS SHARE ONE FILE while having two templates: they
// need the SAME five facts (student, programme, cohort, tutor, where to
// go next) and differ only in what is said about them. One reader, two
// writers. Splitting the reader would mean maintaining the same joins
// twice for outcomes that always change together.
//
// ⭐ A SNAPSHOT, NOT A LOOKUP. Frozen here, so a retry days later still
// names the cohort she was actually judged for.
//
// Doc: docs/product-plan/transactional-email.md

import 'server-only';
import { formatCohortName } from '@/lib/cohorts/format';
import { enqueueAndSend } from '@/lib/email/send';
import { APP_ORIGIN } from '@/lib/email/templates/wrapper';
import type { EnrolmentApprovedPayload, EnrolmentRejectedPayload } from '@/lib/email/types';
import { createServiceRoleClient } from '@/lib/supabase/server';

type Facts = {
  toEmail: string;
  toUserId: string;
  recipientName: string | null;
  programmeId: string;
  programmeName: string;
  cohortId: string | null;
  cohortName: string | null;
  cohortStartISO: string | null;
  tutorName: string;
  /** Null only if the tutor somehow has no profile row — see readFacts. */
  tutorEmail: string | null;
  /** Empty for every tutor today; no screen collects it yet. */
  tutorPhone: string | null;
  accessExpiresAtISO: string | null;
};

/**
 * Tell a student her place is confirmed.
 *
 * ⭐ THIS CLOSES A PROMISE ALREADY ON PROD — the receipt's
 * PENDING_APPROVAL variant says another email is coming when the tutor
 * approves. Until now, nothing was.
 *
 * ⚠ Never throws. The approval itself has already succeeded in the
 * database by the time this runs; an email problem must not report a
 * confirmed place as a failure.
 */
export async function sendEnrolmentApprovedEmail(enrolmentId: string): Promise<void> {
  try {
    const f = await readFacts(enrolmentId);
    if (!f) return;

    const payload: EnrolmentApprovedPayload = {
      recipientName: f.recipientName,
      programmeName: f.programmeName,
      cohortName: f.cohortName,
      tutorName: f.tutorName,
      startsOnISO: f.cohortStartISO,
      accessExpiresAtISO: f.accessExpiresAtISO,
      // Mirrors the receipt's own destination logic: the cohort when
      // there is one, else the programme.
      actionUrl: f.cohortId
        ? `${APP_ORIGIN}/student/cohort/${f.cohortId}`
        : `${APP_ORIGIN}/student/programme/${f.programmeId}`,
      actionLabel: f.cohortId ? 'Go to your cohort' : 'Go to your programme',
    };

    await enqueueAndSend({
      eventKey: 'enrolment.approved',
      // ⭐ The ENROLMENT. One place, one verdict. Shares the subject_ref
      // with enrolment.tutor_added, which is harmless — the fingerprint
      // is (event_key, subject_ref, stage), so the keys keep them apart.
      subjectRef: enrolmentId,
      toEmail: f.toEmail,
      toUserId: f.toUserId,
      payload: payload as unknown as Record<string, unknown>,
    });
  } catch (e) {
    console.error('[email] approval email failed for', enrolmentId, (e as Error).message);
  }
}

/**
 * Tell a student her place was not confirmed.
 *
 * ⚠ SAYS NOTHING ABOUT A REFUND, because nothing refunds her — see the
 * header of lib/email/templates/enrolment-rejected.ts. It points at the
 * tutor, and the footer offers support as the second route.
 *
 * ⚠ The tutor's rejection note is deliberately NOT carried. See
 * EnrolmentRejectedPayload.
 */
export async function sendEnrolmentRejectedEmail(enrolmentId: string): Promise<void> {
  try {
    const f = await readFacts(enrolmentId);
    if (!f) return;

    // ⚠ Without an address there is no way to reach the tutor, and the
    // email's whole second half is "talk to them". Rather than print a
    // contact block with nothing in it, fall back to support alone —
    // the template already handles a null address that way.
    if (!f.tutorEmail) {
      console.error('[email] rejection: no tutor address for enrolment', enrolmentId);
    }

    const payload: EnrolmentRejectedPayload = {
      recipientName: f.recipientName,
      programmeName: f.programmeName,
      cohortName: f.cohortName,
      tutorName: f.tutorName,
      tutorEmail: f.tutorEmail ?? '',
      tutorPhone: f.tutorPhone,
    };

    await enqueueAndSend({
      eventKey: 'enrolment.rejected',
      subjectRef: enrolmentId,
      toEmail: f.toEmail,
      toUserId: f.toUserId,
      payload: payload as unknown as Record<string, unknown>,
    });
  } catch (e) {
    console.error('[email] rejection email failed for', enrolmentId, (e as Error).message);
  }
}

// ─────────────────────────────────────────────────────────────────────

/**
 * Everything both verdicts need, in one read.
 *
 * ⚠ Runs under the SERVICE ROLE and after the transition RPC has already
 * enforced ownership. It is not a second gate — by the time it runs, the
 * database has accepted the change.
 */
async function readFacts(enrolmentId: string): Promise<Facts | null> {
  const admin = createServiceRoleClient();

  const { data: enr, error: enrErr } = await admin
    .from('nclex_enrolments')
    .select('enrolment_id, user_id, programme_id, cohort_id, access_expires_at')
    .eq('enrolment_id', enrolmentId)
    .maybeSingle();
  if (enrErr) console.error('[email] verdict: enrolment read failed:', enrErr.message);
  if (!enr) {
    console.error('[email] verdict: no enrolment', enrolmentId);
    return null;
  }

  const [student, prog, cohort] = await Promise.all([
    admin.from('nclex_users').select('id, email, forename, name').eq('id', enr.user_id).maybeSingle(),
    admin
      .from('nclex_programmes')
      .select('programme_id, title, tutor_id')
      .eq('programme_id', enr.programme_id)
      .maybeSingle(),
    enr.cohort_id
      ? admin
          .from('nclex_cohorts')
          .select('cohort_id, name, start_date, end_date')
          .eq('cohort_id', enr.cohort_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  // ⚠ Report the reason rather than returning a bare null. The enrolment
  // email cost a test run on 2026-08-12 by staying silent here — an
  // unexplained silence inside the layer built to end unexplained
  // silences.
  if (student.error) console.error('[email] verdict: student read failed:', student.error.message);
  if (prog.error) console.error('[email] verdict: programme read failed:', prog.error.message);

  const toEmail = (student.data?.email as string | null)?.trim();
  if (!toEmail) {
    console.error('[email] verdict: no address for student on enrolment', enrolmentId);
    return null;
  }
  // The subject line IS the programme name; there is no email without it.
  const programmeName = (prog.data?.title as string | null)?.trim();
  if (!programmeName) {
    console.error('[email] verdict: no programme title for enrolment', enrolmentId);
    return null;
  }

  // ⭐ email + phone as well as the name: the rejection email hands them
  // to the student directly. See EnrolmentRejectedPayload.
  const { data: tutor } = await admin
    .from('nclex_users')
    .select('name, email, phone_number')
    .eq('id', prog.data?.tutor_id as string)
    .maybeSingle();

  const c = cohort.data as
    | { cohort_id: string; name: string | null; start_date: string; end_date: string }
    | null;

  return {
    toEmail,
    toUserId: student.data?.id as string,
    recipientName:
      (student.data?.forename as string | null)?.trim() ||
      ((student.data?.name as string | null)?.trim().split(' ')[0] ?? null),
    programmeId: enr.programme_id as string,
    programmeName,
    cohortId: c?.cohort_id ?? null,
    cohortName: c ? formatCohortName(c) : null,
    cohortStartISO: c ? new Date(`${c.start_date}T00:00:00Z`).toISOString() : null,
    // ⚠ Same fallback as enrol-email.ts: a tutor with no profile row
    // becomes the product name rather than an empty string, because
    // " has confirmed your place" reads as broken software.
    tutorName: (tutor?.name as string | null)?.trim() || 'Your tutor',
    tutorEmail: (tutor?.email as string | null)?.trim() || null,
    tutorPhone: (tutor?.phone_number as string | null)?.trim() || null,
    accessExpiresAtISO: (enr.access_expires_at as string | null) ?? null,
  };
}
