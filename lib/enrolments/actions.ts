// mynclex/lib/enrolments/actions.ts
//
// Server action for off-platform tutor-add enrolment (Slice 1b).
//
// The tutor types a student's name + email in the cohort workspace.
// We either invite a brand-new account (Supabase inviteUserByEmail)
// or attach an existing one, then create the ENROLLED enrolment row.
//
// Why the service role: the action makes cross-user writes the
// tutor's own client can't (read another user's profile by email,
// create that profile, add their role). We gate on tutor ownership of
// the cohort up front using the AUTHED, RLS-scoped client, then use
// the service-role client for the privileged writes.
//
// Duplicate-email rule (payments-and-enrolment.md): existing account →
// no invite, just attach + enrol. New email → invite. Notification
// email to existing users is deferred (no email worker yet); the
// Supabase invite email for new users works out of the box.
//
// Guards: a tutor can't add their own email, and can't double-enrol a
// student already active in this cohort (also enforced by the partial
// unique index — we check first for a friendly message).

'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { buildSchedule, isOverdue } from '@/lib/payments/schedule';
import type { FrozenStrategySnapshot } from '@/lib/strategies/types';

export type AddStudentResult =
  | { ok: true; invited: boolean; name: string }
  | { ok: false; error: string };

const ACTIVE_STATUSES = ['PENDING_APPROVAL', 'ENROLLED', 'PAUSED'];

export async function addStudentAction(
  cohortId: string,
  formData: FormData,
): Promise<AddStudentResult> {
  const forename = String(formData.get('forename') ?? '').trim();
  const surname = String(formData.get('surname') ?? '').trim();
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();

  if (!forename || !surname || !email) {
    return { ok: false, error: 'Name and email are all required.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }

  const supabase = await createClient();
  const {
    data: { user: tutor },
  } = await supabase.auth.getUser();
  if (!tutor) return { ok: false, error: 'Not signed in.' };

  if (email === (tutor.email ?? '').toLowerCase()) {
    return {
      ok: false,
      error: "You can't enrol yourself in your own cohort.",
    };
  }

  // Ownership gate (RLS-scoped): the row returns only for the owning
  // tutor / SUPER_ADMIN. Pull the parent programme in the same trip.
  const { data: cohortRow } = await supabase
    .from('nclex_cohorts')
    .select(
      `cohort_id, programme_id, cancelled_at,
       nclex_programmes!inner(programme_id, delivery_mode)`,
    )
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (!cohortRow) {
    return { ok: false, error: 'Cohort not found, or not one of yours.' };
  }
  if (cohortRow.cancelled_at) {
    return {
      ok: false,
      error: 'This cohort is cancelled — enrolment is closed.',
    };
  }
  const programmeRaw = (
    cohortRow as typeof cohortRow & {
      nclex_programmes:
        | { programme_id: string; delivery_mode: string }
        | { programme_id: string; delivery_mode: string }[]
        | null;
    }
  ).nclex_programmes;
  const programme = Array.isArray(programmeRaw)
    ? programmeRaw[0]
    : programmeRaw;
  if (!programme) {
    return { ok: false, error: 'Programme not found.' };
  }

  const admin = createServiceRoleClient();
  const res = await inviteOrAttachAndEnrol(admin, {
    forename,
    surname,
    email,
    programmeId: programme.programme_id,
    cohortId,
    tutorId: tutor.id,
  });
  if (!res.ok) return res;

  revalidatePath(`/tutor/cohort/${cohortId}/enrolments`);
  return { ok: true, invited: res.invited, name: `${forename} ${surname}` };
}

// ─────────────────────────────────────────────────────────────────
// Shared invite-or-attach + enrol (used by Add-student AND Convert-
// waitlist). Caller MUST have already proven the acting tutor owns the
// cohort. Existing account → attach + enrol; new email → Supabase
// invite + profile + STUDENT role, then enrol. Returns the new
// enrolment's id so the waitlist convert path can link it.
// ─────────────────────────────────────────────────────────────────
async function inviteOrAttachAndEnrol(
  admin: ReturnType<typeof createServiceRoleClient>,
  args: {
    forename: string;
    surname: string;
    email: string; // already trimmed + lower-cased + validated
    programmeId: string;
    cohortId: string;
    tutorId: string;
  },
): Promise<
  { ok: true; invited: boolean; enrolmentId: string } | { ok: false; error: string }
> {
  const { forename, surname, email, programmeId, cohortId, tutorId } = args;
  const fullName = [forename, surname].filter(Boolean).join(' ');

  // Existing account? nclex_users.email is unique; a tutor-added or
  // self-registered student always has a profile row.
  const { data: existing } = await admin
    .from('nclex_users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  let studentId: string;
  let invited = false;

  if (existing) {
    studentId = existing.id;
    await ensureStudentRole(admin, studentId);
  } else {
    const h = await headers();
    const origin = h.get('origin') ?? 'http://localhost:3000';

    const { data: inviteData, error: inviteErr } =
      await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${origin}/welcome`,
        data: { full_name: fullName },
      });
    if (inviteErr || !inviteData?.user) {
      return {
        ok: false,
        error: inviteErr?.message ?? 'Could not send the invite.',
      };
    }
    studentId = inviteData.user.id;
    invited = true;

    const { error: profileErr } = await admin.from('nclex_users').insert({
      id: studentId,
      email,
      forename,
      surname,
      name: fullName,
      signup_source: 'TUTOR_INVITE',
    });
    if (profileErr) {
      await admin.auth.admin.deleteUser(studentId);
      return { ok: false, error: 'Could not create the student profile.' };
    }

    const roleErr = await ensureStudentRole(admin, studentId);
    if (roleErr) {
      await admin.from('nclex_users').delete().eq('id', studentId);
      await admin.auth.admin.deleteUser(studentId);
      return { ok: false, error: 'Could not assign the student role.' };
    }
  }

  // Friendly pre-check for the active-enrolment guard (the partial
  // unique index is the hard backstop).
  const { data: dup } = await admin
    .from('nclex_enrolments')
    .select('enrolment_id')
    .eq('user_id', studentId)
    .eq('cohort_id', cohortId)
    .in('status', ACTIVE_STATUSES)
    .maybeSingle();
  if (dup) {
    return {
      ok: false,
      error: 'This student is already enrolled in this cohort.',
    };
  }

  const { data: enrolRow, error: enrolErr } = await admin
    .from('nclex_enrolments')
    .insert({
      user_id: studentId,
      programme_id: programmeId,
      cohort_id: cohortId,
      status: 'ENROLLED',
      enrolment_source: 'TUTOR_ADDED',
      enrolled_by_user_id: tutorId,
      // access_expires_at left NULL = lifetime (programmes have no
      // access_window_days column until the discovery slice).
    })
    .select('enrolment_id')
    .single();
  if (enrolErr || !enrolRow) {
    if (enrolErr?.code === '23505') {
      return {
        ok: false,
        error: 'This student is already enrolled in this cohort.',
      };
    }
    return { ok: false, error: enrolErr?.message ?? 'Could not enrol the student.' };
  }

  return { ok: true, invited, enrolmentId: enrolRow.enrolment_id };
}

// ─────────────────────────────────────────────────────────────────
// Slice 2a — lifecycle transitions
//
// Five thin wrappers over the SECURITY DEFINER RPCs. The RPC enforces
// ownership (programme tutor or SUPER_ADMIN) and the legal source
// status, so these actions stay minimal: call, revalidate, report.
// We surface a generic message on failure (the buttons are status-
// gated, so a raw RPC error here means stale UI or a real fault) and
// log the detail for debugging.
// ─────────────────────────────────────────────────────────────────

export type TransitionResult = { ok: true } | { ok: false; error: string };

async function callTransition(
  cohortId: string,
  rpc: string,
  params: Record<string, unknown>,
): Promise<TransitionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { error } = await supabase.rpc(rpc, params);
  if (error) {
    console.error(`Enrolment transition ${rpc} failed:`, error.message);
    return {
      ok: false,
      error: 'Could not update this student. Refresh the page and try again.',
    };
  }

  revalidatePath(`/tutor/cohort/${cohortId}/enrolments`);
  return { ok: true };
}

export async function approveEnrolmentAction(
  cohortId: string,
  enrolmentId: string,
): Promise<TransitionResult> {
  return callTransition(cohortId, 'nclex_approve_enrolment', {
    p_enrolment_id: enrolmentId,
  });
}

export async function rejectEnrolmentAction(
  cohortId: string,
  enrolmentId: string,
  note?: string,
): Promise<TransitionResult> {
  return callTransition(cohortId, 'nclex_reject_enrolment', {
    p_enrolment_id: enrolmentId,
    p_note: note?.trim() ? note.trim() : null,
  });
}

export async function pauseEnrolmentAction(
  cohortId: string,
  enrolmentId: string,
): Promise<TransitionResult> {
  return callTransition(cohortId, 'nclex_pause_enrolment', {
    p_enrolment_id: enrolmentId,
  });
}

export async function resumeEnrolmentAction(
  cohortId: string,
  enrolmentId: string,
): Promise<TransitionResult> {
  return callTransition(cohortId, 'nclex_unpause_enrolment', {
    p_enrolment_id: enrolmentId,
  });
}

export async function cancelEnrolmentAction(
  cohortId: string,
  enrolmentId: string,
  note?: string,
): Promise<TransitionResult> {
  return callTransition(cohortId, 'nclex_cancel_enrolment', {
    p_enrolment_id: enrolmentId,
    p_note: note?.trim() ? note.trim() : null,
  });
}

// ─────────────────────────────────────────────────────────────────
// Slice 7d — mark an installment paid off-platform
//
// For when a student pays the tutor directly (cash / bank transfer).
// Records a synthetic ACTIVATED PROGRAMME_INSTALLMENT payment for the
// next scheduled position — no Paystack — and, if the student was paused
// for an overdue installment and is now caught up, lifts the pause. A
// TUTOR_MANUAL pause is never auto-lifted. Reuses the schedule engine so
// the "next payment + amount" is identical to what the student would pay.
//
// Ownership: the parent programme is read through the AUTHED client (RLS
// returns it only for the owning tutor / SUPER_ADMIN); the privileged
// writes then run under the service role, matching addStudentAction.
// ─────────────────────────────────────────────────────────────────

export async function markInstallmentPaidAction(
  cohortId: string,
  enrolmentId: string,
): Promise<TransitionResult> {
  const supabase = await createClient();
  const {
    data: { user: tutor },
  } = await supabase.auth.getUser();
  if (!tutor) return { ok: false, error: 'Not signed in.' };

  const admin = createServiceRoleClient();
  const { data: enr } = await admin
    .from('nclex_enrolments')
    .select(
      'enrolment_id, programme_id, user_id, status, enrolled_at, strategy_id, strategy_snapshot_json',
    )
    .eq('enrolment_id', enrolmentId)
    .maybeSingle();
  if (!enr) return { ok: false, error: 'Enrolment not found.' };

  // Ownership gate: the row returns only for the owning tutor / SUPER_ADMIN.
  const { data: owned } = await supabase
    .from('nclex_programmes')
    .select('programme_id, price_currency')
    .eq('programme_id', enr.programme_id)
    .maybeSingle();
  if (!owned) return { ok: false, error: 'Not your programme.' };

  if (!['ENROLLED', 'PAUSED'].includes(enr.status)) {
    return { ok: false, error: 'This enrolment is not active.' };
  }
  const snapshot = enr.strategy_snapshot_json as FrozenStrategySnapshot | null;
  if (!snapshot) return { ok: false, error: 'This enrolment has no instalment plan.' };

  const { count } = await admin
    .from('nclex_payments')
    .select('payment_id', { count: 'exact', head: true })
    .eq('enrolment_id', enr.enrolment_id)
    .in('purpose', ['PROGRAMME_INITIAL', 'PROGRAMME_INSTALLMENT'])
    .in('status', ['PAID', 'ACTIVATED']);
  const paid = count ?? 0;

  const schedule = buildSchedule(snapshot, new Date(enr.enrolled_at), paid);
  if (!schedule.next) return { ok: false, error: 'This plan is already fully paid.' };
  const next = schedule.next;

  const { data: profile } = await admin
    .from('nclex_users')
    .select('email')
    .eq('id', enr.user_id)
    .maybeSingle();
  if (!profile?.email) return { ok: false, error: 'Could not find the student account.' };

  const now = new Date().toISOString();
  const { error: insErr } = await admin.from('nclex_payments').insert({
    paystack_reference: null,
    checkout_group_id: crypto.randomUUID(),
    user_id: enr.user_id,
    email: profile.email,
    purpose: 'PROGRAMME_INSTALLMENT',
    programme_id: enr.programme_id,
    cohort_id: null, // cohort_scope CHECK: cohort_id only on PROGRAMME_INITIAL.
    strategy_id: enr.strategy_id,
    installment_index: next.index,
    currency: owned.price_currency,
    amount_minor: next.amountMinor,
    status: 'ACTIVATED',
    // No money reached QAcademy — the tutor collected this directly. Stamp it
    // explicitly + record who, for reconciliation (vs inferring from a null
    // paystack_reference).
    collection_channel: 'OFF_PLATFORM',
    recorded_by_user_id: tutor.id,
    paid_at: now,
    activated_at: now,
    enrolment_id: enr.enrolment_id,
  });
  if (insErr) {
    // The one-settled-per-position unique index already had this covered.
    if (insErr.code === '23505') {
      return { ok: false, error: 'That payment is already recorded.' };
    }
    console.error('mark installment paid failed:', insErr.message);
    return { ok: false, error: 'Could not record the payment. Refresh and try again.' };
  }

  // Auto-unpause only an installment-overdue pause, only once caught up.
  if (enr.status === 'PAUSED') {
    const after = buildSchedule(snapshot, new Date(enr.enrolled_at), paid + 1);
    if (!isOverdue(after, new Date())) {
      await admin
        .from('nclex_enrolments')
        .update({ status: 'ENROLLED', paused_at: null, paused_reason: null, updated_at: now })
        .eq('enrolment_id', enr.enrolment_id)
        .eq('paused_reason', 'INSTALLMENT_OVERDUE');
    }
  }

  revalidatePath(`/tutor/cohort/${cohortId}/enrolments`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────
// Slice 7d follow-up — "give more time" (grace)
//
// Lets a tutor defer an overdue student's pause WITHOUT recording a payment.
// Sets installment_grace_until (the sweep skips a graced enrolment), appends
// to grace_history_json (audit), and lifts an INSTALLMENT_OVERDUE pause as
// part of the grant. The installment stays unpaid and on-platform — grace
// only moves the pause deadline, it does not advance the schedule. A
// TUTOR_MANUAL pause is left as-is (that's the tutor's separate decision).
// ─────────────────────────────────────────────────────────────────

export async function giveMoreTimeAction(
  cohortId: string,
  enrolmentId: string,
  days: number,
): Promise<TransitionResult> {
  const supabase = await createClient();
  const {
    data: { user: tutor },
  } = await supabase.auth.getUser();
  if (!tutor) return { ok: false, error: 'Not signed in.' };

  const d = Math.trunc(days);
  if (!Number.isFinite(d) || d < 1 || d > 365) {
    return { ok: false, error: 'Enter a number of days between 1 and 365.' };
  }

  const admin = createServiceRoleClient();
  const { data: enr } = await admin
    .from('nclex_enrolments')
    .select('enrolment_id, programme_id, status, paused_reason, grace_history_json')
    .eq('enrolment_id', enrolmentId)
    .maybeSingle();
  if (!enr) return { ok: false, error: 'Enrolment not found.' };

  const { data: owned } = await supabase
    .from('nclex_programmes')
    .select('programme_id')
    .eq('programme_id', enr.programme_id)
    .maybeSingle();
  if (!owned) return { ok: false, error: 'Not your programme.' };

  if (!['ENROLLED', 'PAUSED'].includes(enr.status)) {
    return { ok: false, error: 'This enrolment is not active.' };
  }

  const now = new Date();
  const graceUntil = new Date(now.getTime() + d * 86_400_000);
  const history = Array.isArray(enr.grace_history_json) ? enr.grace_history_json : [];
  history.push({
    granted_at: now.toISOString(),
    granted_by: tutor.id,
    days: d,
    grace_until: graceUntil.toISOString(),
  });

  const update: Record<string, unknown> = {
    installment_grace_until: graceUntil.toISOString(),
    grace_history_json: history,
    updated_at: now.toISOString(),
  };
  // Granting time also lifts an overdue pause (never a manual one).
  if (enr.status === 'PAUSED' && enr.paused_reason === 'INSTALLMENT_OVERDUE') {
    update.status = 'ENROLLED';
    update.paused_at = null;
    update.paused_reason = null;
  }

  const { error } = await admin
    .from('nclex_enrolments')
    .update(update)
    .eq('enrolment_id', enr.enrolment_id);
  if (error) {
    console.error('give more time failed:', error.message);
    return { ok: false, error: 'Could not extend the deadline. Refresh and try again.' };
  }

  revalidatePath(`/tutor/cohort/${cohortId}/enrolments`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────
// Slice 4 — waitlist convert / dismiss
//
// convert: turn a PENDING waitlist lead into an ENROLLED enrolment via
// the same invite-or-attach path as Add-student, then mark the lead
// CONVERTED and link the enrolment. dismiss: mark the lead DISMISSED.
//
// Ownership is gated by reading the waitlist row through the AUTHED
// (RLS-scoped) client first — the row returns only for the owning tutor
// or SUPER_ADMIN. The status-changing writes then run under the service
// role (the table has no tutor-write policy; convert must also create a
// user the tutor's own client can't), exactly as Add-student does.
// ─────────────────────────────────────────────────────────────────

export type ConvertWaitlistResult =
  | { ok: true; invited: boolean; name: string }
  | { ok: false; error: string };

export async function convertWaitlistEntryAction(
  cohortId: string,
  waitlistId: string,
): Promise<ConvertWaitlistResult> {
  const supabase = await createClient();
  const {
    data: { user: tutor },
  } = await supabase.auth.getUser();
  if (!tutor) return { ok: false, error: 'Not signed in.' };

  // Ownership gate + payload, in one RLS-scoped read.
  const { data: lead } = await supabase
    .from('nclex_cohort_waitlist')
    .select('waitlist_id, cohort_id, programme_id, forename, surname, email, status')
    .eq('waitlist_id', waitlistId)
    .maybeSingle();
  if (!lead) {
    return { ok: false, error: 'Waitlist entry not found, or not one of yours.' };
  }
  if (lead.status !== 'PENDING') {
    return { ok: false, error: 'This waitlist entry has already been handled.' };
  }

  const admin = createServiceRoleClient();

  // Cohort still joinable? (cancelled cohorts can't take enrolments.)
  const { data: cohortRow } = await admin
    .from('nclex_cohorts')
    .select('cancelled_at')
    .eq('cohort_id', lead.cohort_id)
    .maybeSingle();
  if (!cohortRow) return { ok: false, error: 'Cohort not found.' };
  if (cohortRow.cancelled_at) {
    return { ok: false, error: 'This cohort is cancelled — enrolment is closed.' };
  }

  const fullName = [lead.forename, lead.surname].filter(Boolean).join(' ');
  const res = await inviteOrAttachAndEnrol(admin, {
    forename: lead.forename,
    surname: lead.surname,
    email: lead.email,
    programmeId: lead.programme_id,
    cohortId: lead.cohort_id,
    tutorId: tutor.id,
  });
  if (!res.ok) return res;

  const { error: markErr } = await admin
    .from('nclex_cohort_waitlist')
    .update({
      status: 'CONVERTED',
      converted_enrolment_id: res.enrolmentId,
      handled_by_user_id: tutor.id,
      handled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('waitlist_id', waitlistId);
  if (markErr) {
    // The enrolment exists; only the lead bookkeeping failed. Surface a
    // soft note rather than implying nothing happened.
    console.error('Waitlist convert: enrolment created but mark failed:', markErr.message);
  }

  revalidatePath(`/tutor/cohort/${cohortId}/enrolments`);
  return { ok: true, invited: res.invited, name: fullName };
}

export async function dismissWaitlistEntryAction(
  cohortId: string,
  waitlistId: string,
): Promise<TransitionResult> {
  const supabase = await createClient();
  const {
    data: { user: tutor },
  } = await supabase.auth.getUser();
  if (!tutor) return { ok: false, error: 'Not signed in.' };

  const { data: lead } = await supabase
    .from('nclex_cohort_waitlist')
    .select('waitlist_id, status')
    .eq('waitlist_id', waitlistId)
    .maybeSingle();
  if (!lead) {
    return { ok: false, error: 'Waitlist entry not found, or not one of yours.' };
  }
  if (lead.status !== 'PENDING') {
    return { ok: false, error: 'This waitlist entry has already been handled.' };
  }

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from('nclex_cohort_waitlist')
    .update({
      status: 'DISMISSED',
      handled_by_user_id: tutor.id,
      handled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('waitlist_id', waitlistId);
  if (error) {
    console.error('Waitlist dismiss failed:', error.message);
    return { ok: false, error: 'Could not dismiss this entry. Refresh and try again.' };
  }

  revalidatePath(`/tutor/cohort/${cohortId}/enrolments`);
  return { ok: true };
}

// Adds the STUDENT role if the user doesn't already have it. Returns
// an error object on failure, undefined on success. (A tutor or admin
// can legitimately be a student in someone else's cohort, so we never
// remove other roles.)
async function ensureStudentRole(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
): Promise<{ message: string } | undefined> {
  const { data: roleRow } = await admin
    .from('nclex_user_roles')
    .select('user_id')
    .eq('user_id', userId)
    .eq('role', 'STUDENT')
    .maybeSingle();
  if (roleRow) return undefined;

  const { error } = await admin
    .from('nclex_user_roles')
    .insert({ user_id: userId, role: 'STUDENT' });
  return error ? { message: error.message } : undefined;
}
