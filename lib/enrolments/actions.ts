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
import type { Currency } from '@/lib/payments/types';
import type { FrozenStrategySnapshot } from '@/lib/strategies/types';
import type { RosterScope } from './types';

export type AddStudentResult =
  | { ok: true; invited: boolean; name: string }
  | { ok: false; error: string };

const ACTIVE_STATUSES = ['PENDING_APPROVAL', 'ENROLLED', 'PAUSED'];

// ─────────────────────────────────────────────────────────────────
// Add-with-a-payment-plan (settled 2026-06-12). The tutor optionally
// attaches one of the programme's active plans at add time — snapshot
// frozen exactly like checkout — plus "payments already received"
// (recorded as synthetic OFF_PLATFORM rows, the Mark-paid mechanism
// applied at add) and, when nothing's been received yet, a tutor-set
// first-payment grace (a plan's position 1 is due at enrolment, so
// without grace the student would be paused by that night's sweep).
// ─────────────────────────────────────────────────────────────────

type ResolvedPlan = {
  strategyId: string;
  snapshot: FrozenStrategySnapshot;
  received: number; // 0..totalPayments — synthetic rows to record
  graceUntilIso: string | null; // set when received = 0
  graceDays: number | null;
  currency: Currency;
};

// Parse + validate the plan fields from the Add Student form against the
// programme's active plans. Reads through the AUTHED client — strategy RLS
// is owner-scoped, so a foreign strategy id simply isn't found. Returns
// null when no plan was chosen (today's no-tracking behaviour).
async function resolvePlanInput(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData,
  programmeId: string,
  currency: Currency,
): Promise<{ ok: true; plan: ResolvedPlan | null } | { ok: false; error: string }> {
  const strategyId = String(formData.get('plan_strategy_id') ?? '').trim();
  if (!strategyId) return { ok: true, plan: null };

  const { data: strat } = await supabase
    .from('nclex_programme_payment_strategies')
    .select(
      `strategy_id, programme_id, kind, label, total_price_minor,
       initial_price_minor, installment_count, installment_interval_days,
       balance_due_days_after_enrolment, is_active`,
    )
    .eq('strategy_id', strategyId)
    .maybeSingle();
  if (!strat || strat.programme_id !== programmeId || !strat.is_active) {
    return { ok: false, error: 'That payment plan is not available.' };
  }

  const snapshot: FrozenStrategySnapshot = {
    strategy_id: strat.strategy_id,
    kind: strat.kind,
    label: strat.label,
    total_price_minor: strat.total_price_minor,
    initial_price_minor: strat.initial_price_minor,
    installment_count: strat.installment_count,
    installment_interval_days: strat.installment_interval_days,
    balance_due_days_after_enrolment: strat.balance_due_days_after_enrolment,
    frozen_at: new Date().toISOString(),
  };

  const totalPayments = buildSchedule(snapshot, new Date(), 0).totalPayments;

  const received = Math.trunc(Number(formData.get('plan_received') ?? 0));
  if (!Number.isFinite(received) || received < 0 || received > totalPayments) {
    return {
      ok: false,
      error: `Payments received must be between 0 and ${totalPayments} for this plan.`,
    };
  }

  // With nothing received, the first payment is due at enrolment — the
  // tutor must say how long the student has before the sweep pauses them.
  let graceDays: number | null = null;
  let graceUntilIso: string | null = null;
  if (received === 0) {
    graceDays = Math.trunc(Number(formData.get('plan_grace_days') ?? 0));
    if (!Number.isFinite(graceDays) || graceDays < 1 || graceDays > 365) {
      return {
        ok: false,
        error: 'Set how many days the student has to make their first payment (1–365).',
      };
    }
    graceUntilIso = new Date(Date.now() + graceDays * 86_400_000).toISOString();
  }

  return {
    ok: true,
    plan: { strategyId, snapshot, received, graceUntilIso, graceDays, currency },
  };
}

// The roster page an action should refresh — the cohort surface or its
// self-paced programme-level twin.
function rosterPath(scope: RosterScope): string {
  return scope.kind === 'COHORT'
    ? `/tutor/cohort/${scope.cohortId}/enrolments`
    : `/tutor/programme/${scope.programmeId}/enrolments`;
}

// Freeze the access-window expiry at enrolment time, mirroring the paid
// path (lib/payments/activate.ts). NULL window = lifetime-of-tutor-sub.
// The nightly sweep reads the frozen column.
function freezeAccessExpiry(accessWindowDays: number | null): string | null {
  return accessWindowDays != null
    ? new Date(Date.now() + accessWindowDays * 86_400_000).toISOString()
    : null;
}

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
       nclex_programmes!inner(programme_id, delivery_mode, access_window_days, price_currency)`,
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
  type ProgRef = {
    programme_id: string;
    delivery_mode: string;
    access_window_days: number | null;
    price_currency: Currency;
  };
  const programmeRaw = (
    cohortRow as typeof cohortRow & {
      nclex_programmes: ProgRef | ProgRef[] | null;
    }
  ).nclex_programmes;
  const programme = Array.isArray(programmeRaw)
    ? programmeRaw[0]
    : programmeRaw;
  if (!programme) {
    return { ok: false, error: 'Programme not found.' };
  }

  const planRes = await resolvePlanInput(
    supabase,
    formData,
    programme.programme_id,
    programme.price_currency,
  );
  if (!planRes.ok) return planRes;

  const admin = createServiceRoleClient();
  const res = await inviteOrAttachAndEnrol(admin, {
    forename,
    surname,
    email,
    programmeId: programme.programme_id,
    cohortId,
    accessWindowDays: programme.access_window_days,
    plan: planRes.plan,
    tutorId: tutor.id,
  });
  if (!res.ok) return res;

  revalidatePath(`/tutor/cohort/${cohortId}/enrolments`);
  return { ok: true, invited: res.invited, name: `${forename} ${surname}` };
}

/**
 * Self-paced twin of addStudentAction — the programme is the enrolment
 * container, so the tutor adds students from the programme-level
 * Enrolments tab and the row is created with cohort_id = NULL. Same
 * invite-or-attach mechanics, same ownership-then-service-role split.
 */
export async function addSelfPacedStudentAction(
  programmeId: string,
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
      error: "You can't enrol yourself in your own programme.",
    };
  }

  // Ownership gate (RLS-scoped): the programme returns only for the
  // owning tutor / SUPER_ADMIN. Must be self-paced (tutor-led enrolment
  // goes through a cohort) and not archived (the cohort path's
  // "cancelled cohort" analogue).
  const { data: prog } = await supabase
    .from('nclex_programmes')
    .select('programme_id, delivery_mode, status, access_window_days, price_currency')
    .eq('programme_id', programmeId)
    .maybeSingle();
  if (!prog) {
    return { ok: false, error: 'Programme not found, or not one of yours.' };
  }
  if (prog.delivery_mode !== 'SELF_PACED') {
    return {
      ok: false,
      error: 'This programme is tutor-led — add students from a cohort.',
    };
  }
  if (prog.status === 'ARCHIVED') {
    return {
      ok: false,
      error: 'This programme is archived — enrolment is closed.',
    };
  }

  const planRes = await resolvePlanInput(
    supabase,
    formData,
    programmeId,
    prog.price_currency as Currency,
  );
  if (!planRes.ok) return planRes;

  const admin = createServiceRoleClient();
  const res = await inviteOrAttachAndEnrol(admin, {
    forename,
    surname,
    email,
    programmeId,
    cohortId: null,
    accessWindowDays: prog.access_window_days,
    plan: planRes.plan,
    tutorId: tutor.id,
  });
  if (!res.ok) return res;

  revalidatePath(`/tutor/programme/${programmeId}/enrolments`);
  return { ok: true, invited: res.invited, name: `${forename} ${surname}` };
}

// ─────────────────────────────────────────────────────────────────
// Shared invite-or-attach + enrol (used by Add-student — cohort AND
// self-paced — plus Convert-waitlist). Caller MUST have already proven
// the acting tutor owns the container (cohort or self-paced programme).
// Existing account → attach + enrol; new email → Supabase invite +
// profile + STUDENT role, then enrol. cohortId NULL = self-paced row.
// Returns the new enrolment's id so the waitlist convert path can
// link it.
// ─────────────────────────────────────────────────────────────────
async function inviteOrAttachAndEnrol(
  admin: ReturnType<typeof createServiceRoleClient>,
  args: {
    forename: string;
    surname: string;
    email: string; // already trimmed + lower-cased + validated
    programmeId: string;
    cohortId: string | null; // NULL = self-paced (programme is the container)
    accessWindowDays: number | null; // programme's window; NULL = lifetime
    plan?: ResolvedPlan | null; // optional payment plan to freeze on (2026-06-12)
    tutorId: string;
  },
): Promise<
  { ok: true; invited: boolean; enrolmentId: string } | { ok: false; error: string }
> {
  const { forename, surname, email, programmeId, cohortId, accessWindowDays, tutorId } = args;
  const plan = args.plan ?? null;
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
  // unique indexes are the hard backstop). Tutor-led keys on the
  // cohort; self-paced keys on the programme's cohortless rows.
  const container = cohortId ? 'cohort' : 'programme';
  let dupQuery = admin
    .from('nclex_enrolments')
    .select('enrolment_id')
    .eq('user_id', studentId)
    .in('status', ACTIVE_STATUSES);
  dupQuery = cohortId
    ? dupQuery.eq('cohort_id', cohortId)
    : dupQuery.eq('programme_id', programmeId).is('cohort_id', null);
  const { data: dup } = await dupQuery.maybeSingle();
  if (dup) {
    return {
      ok: false,
      error: `This student is already enrolled in this ${container}.`,
    };
  }

  const nowIso = new Date().toISOString();
  const { data: enrolRow, error: enrolErr } = await admin
    .from('nclex_enrolments')
    .insert({
      user_id: studentId,
      programme_id: programmeId,
      cohort_id: cohortId,
      status: 'ENROLLED',
      enrolment_source: 'TUTOR_ADDED',
      enrolled_by_user_id: tutorId,
      // Frozen from the programme's access window at enrolment time,
      // exactly like the paid path — NULL = lifetime-of-tutor-sub.
      access_expires_at: freezeAccessExpiry(accessWindowDays),
      // Plan frozen identically to checkout, so the schedule engine /
      // sweep / tile / Mark-paid can't tell a hand-added student apart.
      strategy_id: plan?.strategyId ?? null,
      strategy_snapshot_json: plan?.snapshot ?? null,
      // First-payment grace (0 received): position 1 is due at enrolment,
      // so without this the sweep would pause the student tonight.
      installment_grace_until: plan?.graceUntilIso ?? null,
      grace_history_json: plan?.graceUntilIso
        ? [
            {
              granted_at: nowIso,
              granted_by: tutorId,
              days: plan.graceDays,
              grace_until: plan.graceUntilIso,
              at_add: true,
            },
          ]
        : [],
    })
    .select('enrolment_id')
    .single();
  if (enrolErr || !enrolRow) {
    if (enrolErr?.code === '23505') {
      return {
        ok: false,
        error: `This student is already enrolled in this ${container}.`,
      };
    }
    return { ok: false, error: enrolErr?.message ?? 'Could not enrol the student.' };
  }

  // "Payments already received" — money the tutor took by hand before the
  // add. Recorded as synthetic OFF_PLATFORM rows (the Mark-paid mechanism
  // applied at add time) so the schedule starts at the right position and
  // the books reflect reality. Amounts come from the schedule engine, same
  // as Mark-paid. Positions are PROGRAMME_INSTALLMENT rows carrying their
  // index (incl. position 1 — tutor-added enrolments have no checkout, so
  // no PROGRAMME_INITIAL row exists; paid-count logic reads both purposes
  // and never the index, so the schedule is unaffected).
  if (plan && plan.received > 0) {
    const schedule = buildSchedule(plan.snapshot, new Date(nowIso), 0);
    const groupId = crypto.randomUUID();
    const rows = schedule.payments.slice(0, plan.received).map((p) => ({
      paystack_reference: null,
      checkout_group_id: groupId,
      user_id: studentId,
      email,
      purpose: 'PROGRAMME_INSTALLMENT',
      programme_id: programmeId,
      cohort_id: null, // cohort_scope CHECK: cohort_id only on PROGRAMME_INITIAL.
      strategy_id: plan.strategyId,
      installment_index: p.index,
      currency: plan.currency,
      amount_minor: p.amountMinor,
      status: 'ACTIVATED',
      collection_channel: 'OFF_PLATFORM',
      recorded_by_user_id: tutorId,
      paid_at: nowIso,
      activated_at: nowIso,
      enrolment_id: enrolRow.enrolment_id,
    }));
    const { error: payErr } = await admin.from('nclex_payments').insert(rows);
    if (payErr) {
      // Roll the enrolment back rather than leave a half-recorded student
      // (the tutor would re-add with the right numbers).
      await admin.from('nclex_enrolments').delete().eq('enrolment_id', enrolRow.enrolment_id);
      console.error('add-with-plan: received-payments insert failed:', payErr.message);
      return { ok: false, error: 'Could not record the received payments. Try again.' };
    }
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
  scope: RosterScope,
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

  revalidatePath(rosterPath(scope));
  return { ok: true };
}

export async function approveEnrolmentAction(
  scope: RosterScope,
  enrolmentId: string,
): Promise<TransitionResult> {
  return callTransition(scope, 'nclex_approve_enrolment', {
    p_enrolment_id: enrolmentId,
  });
}

export async function rejectEnrolmentAction(
  scope: RosterScope,
  enrolmentId: string,
  note?: string,
): Promise<TransitionResult> {
  return callTransition(scope, 'nclex_reject_enrolment', {
    p_enrolment_id: enrolmentId,
    p_note: note?.trim() ? note.trim() : null,
  });
}

export async function pauseEnrolmentAction(
  scope: RosterScope,
  enrolmentId: string,
): Promise<TransitionResult> {
  return callTransition(scope, 'nclex_pause_enrolment', {
    p_enrolment_id: enrolmentId,
  });
}

export async function resumeEnrolmentAction(
  scope: RosterScope,
  enrolmentId: string,
): Promise<TransitionResult> {
  return callTransition(scope, 'nclex_unpause_enrolment', {
    p_enrolment_id: enrolmentId,
  });
}

export async function cancelEnrolmentAction(
  scope: RosterScope,
  enrolmentId: string,
  note?: string,
): Promise<TransitionResult> {
  return callTransition(scope, 'nclex_cancel_enrolment', {
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
  scope: RosterScope,
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

  revalidatePath(rosterPath(scope));
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
  scope: RosterScope,
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

  revalidatePath(rosterPath(scope));
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
  // The programme's access window rides along for the expiry freeze.
  const { data: cohortRow } = await admin
    .from('nclex_cohorts')
    .select('cancelled_at, nclex_programmes!inner(access_window_days)')
    .eq('cohort_id', lead.cohort_id)
    .maybeSingle();
  if (!cohortRow) return { ok: false, error: 'Cohort not found.' };
  if (cohortRow.cancelled_at) {
    return { ok: false, error: 'This cohort is cancelled — enrolment is closed.' };
  }
  const convProgRaw = (
    cohortRow as typeof cohortRow & {
      nclex_programmes:
        | { access_window_days: number | null }
        | { access_window_days: number | null }[]
        | null;
    }
  ).nclex_programmes;
  const convProg = Array.isArray(convProgRaw) ? convProgRaw[0] : convProgRaw;

  const fullName = [lead.forename, lead.surname].filter(Boolean).join(' ');
  const res = await inviteOrAttachAndEnrol(admin, {
    forename: lead.forename,
    surname: lead.surname,
    email: lead.email,
    programmeId: lead.programme_id,
    cohortId: lead.cohort_id,
    accessWindowDays: convProg?.access_window_days ?? null,
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

// ─────────────────────────────────────────────────────────────────
// Per-student payment history (2026-06-12). Read-only readout behind
// the roster's payment pill: the full schedule (every position with
// its state) + money totals + grace history + any refunded rows. The
// data has always existed (frozen snapshot + payment rows + the
// schedule engine) — this is the first surface that presents it.
//
// Ownership mirrors markInstallmentPaidAction: enrolment read via the
// service role, then the parent programme read through the AUTHED
// client (RLS returns it only for the owning tutor / SUPER_ADMIN).
// ─────────────────────────────────────────────────────────────────

export type PaymentHistoryItem = {
  index: number;
  amountMinor: number; // the row's real amount when paid; the plan's amount otherwise
  dueDateIso: string;
  state: 'PAID' | 'DUE' | 'UPCOMING';
  paidAtIso: string | null;
  channel: 'PAYSTACK' | 'OFF_PLATFORM' | null;
  isOverdue: boolean; // DUE only
  graceUntilIso: string | null; // DUE only — an active tutor-granted extension
};

export type PaymentHistoryView = {
  planName: string;
  currency: Currency;
  totalMinor: number;
  receivedMinor: number;
  remainingMinor: number;
  paidCount: number;
  totalPayments: number;
  enrolledAtIso: string;
  items: PaymentHistoryItem[];
  graceHistory: { grantedAtIso: string; days: number; graceUntilIso: string }[];
  refunded: { amountMinor: number; whenIso: string | null }[];
};

export type PaymentHistoryResult =
  | { ok: true; history: PaymentHistoryView }
  | { ok: false; error: string };

export async function getPaymentHistoryAction(
  enrolmentId: string,
): Promise<PaymentHistoryResult> {
  const supabase = await createClient();
  const {
    data: { user: tutor },
  } = await supabase.auth.getUser();
  if (!tutor) return { ok: false, error: 'Not signed in.' };

  const admin = createServiceRoleClient();
  const { data: enr } = await admin
    .from('nclex_enrolments')
    .select(
      `enrolment_id, programme_id, status, enrolled_at,
       strategy_snapshot_json, installment_grace_until, grace_history_json`,
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

  const snapshot = enr.strategy_snapshot_json as FrozenStrategySnapshot | null;
  if (!snapshot) return { ok: false, error: 'This enrolment has no payment plan.' };
  const currency = owned.price_currency as Currency;

  const { data: payRows } = await admin
    .from('nclex_payments')
    .select(
      'amount_minor, status, paid_at, activated_at, collection_channel, installment_index',
    )
    .eq('enrolment_id', enr.enrolment_id)
    .in('purpose', ['PROGRAMME_INITIAL', 'PROGRAMME_INSTALLMENT']);

  type PayRow = {
    amount_minor: number;
    status: string;
    paid_at: string | null;
    activated_at: string | null;
    collection_channel: 'PAYSTACK' | 'OFF_PLATFORM' | null;
    installment_index: number | null;
  };
  const rows = (payRows ?? []) as PayRow[];

  // Settled rows map onto schedule positions 1..k in order — the initial
  // checkout row has a NULL index (implicitly position 1); synthetic and
  // tile rows carry theirs. Sort by (index, when) and zip with positions.
  const settled = rows
    .filter((r) => r.status === 'PAID' || r.status === 'ACTIVATED')
    .sort(
      (a, b) =>
        (a.installment_index ?? 1) - (b.installment_index ?? 1) ||
        (a.paid_at ?? '').localeCompare(b.paid_at ?? ''),
    );

  const now = new Date();
  const schedule = buildSchedule(snapshot, new Date(enr.enrolled_at), settled.length);
  const graceUntil = enr.installment_grace_until
    ? new Date(enr.installment_grace_until)
    : null;
  const graceActive = graceUntil != null && graceUntil.getTime() > now.getTime();

  const items: PaymentHistoryItem[] = schedule.payments.map((p) => {
    if (p.index <= settled.length) {
      const row = settled[p.index - 1];
      return {
        index: p.index,
        amountMinor: row.amount_minor,
        dueDateIso: p.dueDate.toISOString(),
        state: 'PAID' as const,
        paidAtIso: row.paid_at ?? row.activated_at,
        channel: row.collection_channel ?? 'PAYSTACK',
        isOverdue: false,
        graceUntilIso: null,
      };
    }
    const isNext = p.index === settled.length + 1;
    return {
      index: p.index,
      amountMinor: p.amountMinor,
      dueDateIso: p.dueDate.toISOString(),
      state: isNext ? ('DUE' as const) : ('UPCOMING' as const),
      paidAtIso: null,
      channel: null,
      isOverdue: isNext && p.dueDate.getTime() < now.getTime() && !graceActive,
      graceUntilIso: isNext && graceActive ? graceUntil!.toISOString() : null,
    };
  });

  const receivedMinor = settled.reduce((sum, r) => sum + r.amount_minor, 0);

  type GraceEntry = { granted_at?: string; days?: number; grace_until?: string };
  const graceHistory = (Array.isArray(enr.grace_history_json)
    ? (enr.grace_history_json as GraceEntry[])
    : []
  )
    .filter((g) => g.granted_at && g.grace_until)
    .map((g) => ({
      grantedAtIso: g.granted_at!,
      days: g.days ?? 0,
      graceUntilIso: g.grace_until!,
    }));

  return {
    ok: true,
    history: {
      planName: (snapshot.label ?? '').trim() || systemPlanName(snapshot.kind),
      currency,
      totalMinor: schedule.totalMinor,
      receivedMinor,
      remainingMinor: Math.max(0, schedule.totalMinor - receivedMinor),
      paidCount: settled.length,
      totalPayments: schedule.totalPayments,
      enrolledAtIso: enr.enrolled_at,
      items,
      graceHistory,
      refunded: rows
        .filter((r) => r.status === 'REFUNDED')
        .map((r) => ({ amountMinor: r.amount_minor, whenIso: r.paid_at })),
    },
  };
}

// Local mirror of lib/strategies/format.ts systemLabel — that module is
// client-shared; this file is 'use server' and only needs the one string.
function systemPlanName(kind: FrozenStrategySnapshot['kind']): string {
  switch (kind) {
    case 'UPFRONT_FULL':
      return 'Pay in full';
    case 'DEPOSIT_BALANCE':
      return 'Deposit + balance';
    case 'EQUAL_INSTALLMENTS':
      return 'Equal installments';
  }
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
