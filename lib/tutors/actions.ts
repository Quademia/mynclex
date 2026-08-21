// mynclex/lib/tutors/actions.ts
//
// The write side of the tutor record — sub-slice 1c.
// Plan: docs/product-plan/tutor-onboarding.md §4, §11.1c.
//
// ⭐ grantTutorRole IS THE ONLY CODE IN THE REPO THAT WRITES A TUTOR ROLE
// (§4, invariant 2). Every doorway — admin promotion now, application
// approval in 2b, invite in slice 3 — ends here. If a future path needs
// its own copy of this logic, that is the signal it was factored wrong.
//
// ⚠ WHY THE WRITES USE THE SERVICE ROLE. nclex_user_roles is gated by
// nclex_roles_admin_write (SUPER_ADMIN only) and its self-insert policy
// allows STUDENT alone, so an admin holding TUTORS_MANAGE cannot grant a
// role through the authed client. Same shape as the directory read: the
// permission gate is the TS layer above, the write bypasses RLS below.
// Every entry point here calls requireAdminPermission FIRST.

'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission, PERM_TUTORS_MANAGE } from '@/lib/access';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueAndSend } from '@/lib/email/send';
import type { TutorSource } from './types';

export type TutorSearchHit = {
  user_id: string;
  name: string;
  email: string;
  roles: string[];
  is_tutor: boolean;
};

export type AddTutorResult =
  | { ok: true; name: string; keptStudent: boolean; emailQueued: boolean }
  | { ok: false; error: string };

/**
 * Search for someone to promote. Thin wrapper over the narrow
 * SECURITY DEFINER RPC — the 2-character floor and the 10-row cap live
 * in SQL so they cannot be skipped by calling the RPC directly.
 *
 * Returns people who are ALREADY tutors too, flagged, so the UI can show
 * them disabled rather than hide them: an admin who searches for someone
 * they know exists and sees nothing reads that as a bug.
 */
export async function findUsersForTutorAddAction(
  fragment: string,
): Promise<TutorSearchHit[]> {
  await requireAdminPermission(PERM_TUTORS_MANAGE);

  // The RPC re-checks the permission itself against the CALLER, so this
  // goes through the authed client, not the service role.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('nclex_tutor_search', {
    p_fragment: fragment,
  });

  if (error) {
    console.error('[tutors] search failed:', error.message);
    return [];
  }
  return (data ?? []) as TutorSearchHit[];
}

/**
 * Grant the TUTOR role. Idempotent and ADDITIVE.
 *
 * ⚠ Never removes another role. A tutor can legitimately be a student in
 * someone else's cohort, and stripping STUDENT here would revoke access
 * to programmes they paid for.
 */
async function grantTutorRole(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  grantedBy: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: existing } = await admin
    .from('nclex_user_roles')
    .select('user_id')
    .eq('user_id', userId)
    .eq('role', 'TUTOR')
    .maybeSingle();

  // Re-running must be a no-op, not a duplicate-key error: the same
  // person can be promoted twice by two admins, or by one double-click.
  if (existing) return { ok: true };

  const { error } = await admin
    .from('nclex_user_roles')
    .insert({ user_id: userId, role: 'TUTOR', granted_by: grantedBy });

  // 23505 = someone else won the race between the check and the insert.
  // That is the outcome we wanted anyway.
  if (error && error.code !== '23505') return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Make an existing user a tutor.
 *
 * Order matters: the record first, then the role. If the role write
 * fails, an APPROVED row with no role is visible in the directory and
 * fixable; a role with no row is invisible to the surface built to
 * manage it, which is the state this whole arc exists to end.
 */
export async function promoteUserToTutorAction(userId: string): Promise<AddTutorResult> {
  const ctx = await requireAdminPermission(PERM_TUTORS_MANAGE);
  const admin = createServiceRoleClient();

  const { data: user } = await admin
    .from('nclex_users')
    .select('name, email')
    .eq('id', userId)
    .maybeSingle();

  if (!user) return { ok: false, error: 'That user no longer exists.' };

  const { data: already } = await admin
    .from('nclex_tutors')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (already) return { ok: false, error: `${user.name} is already a tutor.` };

  const { data: roles } = await admin
    .from('nclex_user_roles')
    .select('role')
    .eq('user_id', userId);
  const keptStudent = (roles ?? []).some((r) => r.role === 'STUDENT');

  const nowISO = new Date().toISOString();

  // §4.4 — every doorway writes a row, including this one, which has no
  // approval step. Admin promotion IS the decision, so approved_* and
  // decided_* are both stamped now, with the admin who clicked.
  const { error: rowError } = await admin.from('nclex_tutors').insert({
    user_id: userId,
    status: 'APPROVED',
    source: 'ADMIN_PROMOTION' satisfies TutorSource,
    approved_at: nowISO,
    approved_by: ctx.user.id,
    decided_at: nowISO,
    decided_by: ctx.user.id,
    created_at: nowISO,
    updated_at: nowISO,
  });

  if (rowError) {
    return { ok: false, error: `Could not create the tutor record: ${rowError.message}` };
  }

  const granted = await grantTutorRole(admin, userId, ctx.user.id);
  if (!granted.ok) {
    // Leave the row: it is the visible, fixable half. Say plainly which
    // half failed rather than reporting a generic error.
    return {
      ok: false,
      error: `The tutor record was created, but the TUTOR role could not be granted: ${granted.error}`,
    };
  }

  // ⭐ enqueueAndSend, not enqueueEmail: the admin is standing right
  // there. The row is queued first, so a failed send is retried by the
  // drain (claimDueEmails takes QUEUED and FAILED alike); the immediate
  // attempt is what makes it arrive now rather than on the next sweep.
  //
  // ⚠ `queued` is QUEUED, never delivered — the send runs after the
  // response under waitUntil. The toast must not claim it arrived.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nclex.quademia.com';
  const { queued } = await enqueueAndSend({
    eventKey: 'tutor.added_by_admin',
    subjectRef: userId,
    toEmail: user.email,
    toUserId: userId,
    payload: {
      recipientName: user.name ?? null,
      keepsStudentRole: keptStudent,
      workspaceUrl: `${origin}/tutor`,
      profileUrl: `${origin}/tutor/profile`,
    },
  });

  revalidatePath('/admin/tutors');

  // A failed ENQUEUE means no row exists and no drain will ever retry —
  // rare, but it must be said out loud. The promotion still stands:
  // getting the role without the email is recoverable, not being made a
  // tutor because an email failed is not.
  return { ok: true, name: user.name, keptStudent, emailQueued: queued };
}
