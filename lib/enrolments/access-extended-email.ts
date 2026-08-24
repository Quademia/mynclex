// mynclex/lib/enrolments/access-extended-email.ts
//
// EMAIL-TRIGGER[enrolment.access_extended] — "your tutor gave you more time".
//
// ⭐ WHY IT EXISTS. `enrolment.access_expiring` warns a student her access
// is ending. When a tutor then extends it, staying silent leaves her
// believing the door still shuts on the date we told her — so she either
// stops working or writes to ask. This is the same catch Sam made on
// tutor-onboarding 1d, where suspension told someone their standing was
// withdrawn and nothing told them when it came back.
//
// ⚠ THE ONLY ACCESS EMAIL BUILT IN TYPESCRIPT. Its two siblings are filled
// in SQL by the nightly sweep (migration 20260923120000), because they
// fire on a clock. This one fires on a button, so it is built where the
// button is — and its payload is genuinely type-checked, unlike theirs.
//
// Shaped after verdict-email.ts: read the facts under the service role
// AFTER the write has been accepted, never throw, and report the reason
// on every early return rather than going quiet.
//
// Doc: docs/product-plan/transactional-email.md

import 'server-only';
import { formatCohortName } from '@/lib/cohorts/format';
import { enqueueAndSend } from '@/lib/email/send';
import type { AccessExtendedPayload } from '@/lib/email/types';
import { createServiceRoleClient } from '@/lib/supabase/server';

type Change = {
  days: number;
  previousIso: string;
  newIso: string;
  wasExpired: boolean;
};

/**
 * Tell the student their access window moved.
 *
 * ⚠ Never throws. An extension that succeeded must not be reported as a
 * failure because the mail could not be queued — the tutor would press
 * the button again and add the days twice.
 */
export async function sendAccessExtendedEmail(
  enrolmentId: string,
  change: Change,
): Promise<void> {
  try {
    const admin = createServiceRoleClient();

    const { data: enr, error: enrErr } = await admin
      .from('nclex_enrolments')
      .select('enrolment_id, user_id, programme_id, cohort_id')
      .eq('enrolment_id', enrolmentId)
      .maybeSingle();
    if (enrErr) console.error('[email] access_extended: enrolment read failed:', enrErr.message);
    if (!enr) {
      console.error('[email] access_extended: no enrolment', enrolmentId);
      return;
    }

    const [student, prog, cohort] = await Promise.all([
      admin
        .from('nclex_users')
        .select('id, email, forename, name')
        .eq('id', enr.user_id)
        .maybeSingle(),
      admin
        .from('nclex_programmes')
        .select('programme_id, title, tutor_id')
        .eq('programme_id', enr.programme_id)
        .maybeSingle(),
      enr.cohort_id
        ? admin
            .from('nclex_cohorts')
            .select('name, start_date, end_date')
            .eq('cohort_id', enr.cohort_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (student.error) {
      console.error('[email] access_extended: student read failed:', student.error.message);
    }
    if (prog.error) {
      console.error('[email] access_extended: programme read failed:', prog.error.message);
    }

    const toEmail = (student.data?.email as string | null)?.trim();
    if (!toEmail) {
      console.error('[email] access_extended: no address for enrolment', enrolmentId);
      return;
    }
    // The subject line IS the programme name; there is no email without it.
    const programmeTitle = (prog.data?.title as string | null)?.trim();
    if (!programmeTitle) {
      console.error('[email] access_extended: no programme title for', enrolmentId);
      return;
    }

    const { data: tutor } = await admin
      .from('nclex_users')
      .select('name')
      .eq('id', prog.data?.tutor_id as string)
      .maybeSingle();

    const c = cohort.data as
      | { name: string | null; start_date: string; end_date: string }
      | null;

    const payload: AccessExtendedPayload = {
      recipientName:
        (student.data?.forename as string | null)?.trim() ||
        ((student.data?.name as string | null)?.trim().split(' ')[0] ?? null),
      programmeTitle,
      cohortName: c ? formatCohortName(c) : null,
      // ⚠ Same fallback as verdict-email.ts: a tutor with no profile row
      // becomes a generic phrase rather than an empty string, because
      // " has given you more time" reads as broken software.
      tutorName: (tutor?.name as string | null)?.trim() || 'Your tutor',
      newExpiresAtISO: change.newIso,
      previousExpiresAtISO: change.previousIso,
      wasExpired: change.wasExpired,
      days: change.days,
      programmeId: enr.programme_id as string,
      enrolmentId: enr.enrolment_id as string,
    };

    // ⚠⚠ THE STAGE NAMES THE NEW EXPIRY DATE. The outbox fingerprint is
    // (event_key, subject_ref, stage) and a tutor may extend the same
    // enrolment many times. On a bare stage the second extension would hit
    // the unique index and SILENTLY never send — nothing errors, the email
    // simply does not arrive. Dating it makes each new window its own
    // email, which is the same fix the two scheduled siblings use.
    //
    // ⓘ DATE, not timestamp: two extensions on one afternoon are one
    // change as far as the student is concerned.
    await enqueueAndSend({
      eventKey: 'enrolment.access_extended',
      subjectRef: enr.enrolment_id as string,
      stage: change.newIso.slice(0, 10),
      toEmail,
      toUserId: (student.data?.id as string) ?? null,
      payload: payload as unknown as Record<string, unknown>,
    });
  } catch (e) {
    console.error('[email] access_extended failed for', enrolmentId, (e as Error).message);
  }
}
