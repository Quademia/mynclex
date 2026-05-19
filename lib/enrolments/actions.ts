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
        data: { full_name: `${forename} ${surname}` },
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
      name: `${forename} ${surname}`,
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

  const { error: enrolErr } = await admin.from('nclex_enrolments').insert({
    user_id: studentId,
    programme_id: programme.programme_id,
    cohort_id: cohortId,
    status: 'ENROLLED',
    enrolment_source: 'TUTOR_ADDED',
    enrolled_by_user_id: tutor.id,
    // access_expires_at left NULL = lifetime (programmes have no
    // access_window_days column until the discovery slice).
  });
  if (enrolErr) {
    if (enrolErr.code === '23505') {
      return {
        ok: false,
        error: 'This student is already enrolled in this cohort.',
      };
    }
    return { ok: false, error: enrolErr.message };
  }

  revalidatePath(`/tutor/cohort/${cohortId}/students`);
  return { ok: true, invited, name: `${forename} ${surname}` };
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
