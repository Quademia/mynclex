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
import { createClient as createSbClient } from '@supabase/supabase-js';
import { requireAdminPermission, PERM_TUTORS_MANAGE } from '@/lib/access';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { logAuthEvent } from '@/lib/auth/events';
import {
  readTurnstileTicket,
  isCaptchaRejection,
  TURNSTILE_FIELD,
  TURNSTILE_FAILED_MESSAGE,
} from '@/lib/auth/turnstile';
import { enqueueAndSend } from '@/lib/email/send';
// ⓘ Imported rather than re-typed: a second copy of the address is a
// second thing to change, and the one that gets missed is the one nobody
// is reading.
import { SUPPORT_EMAIL } from '@/lib/email/templates/wrapper';
import { TUTOR_APPLICATION_PATH } from './types';
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
 * What an address turns out to be — the new-user path's as-you-type
 * check (sub-slice 1c-ii).
 *
 * Three answers because the admin needs three different next steps, and
 * two of them are ESCAPE HATCHES rather than errors: an address that is
 * already taken is not a mistake, it means they picked the wrong branch
 * of the chooser, and the fix is one click sideways.
 */
export type EmailVerdict = {
  verdict: 'none' | 'user' | 'tutor';
  user_id: string | null;
  name: string | null;
  roles: string[];
};

/**
 * Ask about ONE exact address. Never a prefix, never a list — see the
 * migration's note: an email-existence endpoint is an enumeration vector
 * and the narrowness is what stops it becoming one.
 */
export async function checkEmailForTutorAddAction(
  email: string,
): Promise<EmailVerdict | null> {
  await requireAdminPermission(PERM_TUTORS_MANAGE);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('nclex_tutor_email_check', {
    p_email: email,
  });

  if (error) {
    console.error('[tutors] email check failed:', error.message);
    return null;
  }
  // The RPC returns no rows for an address that is not even shaped like
  // one — which is "keep typing", not "free to use". Distinguishing those
  // two is the whole point of the faint checking state.
  const row = (data ?? [])[0] as EmailVerdict | undefined;
  return row ?? null;
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
 * Take the TUTOR role away — and ONLY the TUTOR role (sub-slice 1d).
 *
 * ⭐ The mirror of grantTutorRole, and the only code that removes one.
 * ⚠ A tutor is very often somebody else's student: deleting by user_id
 * alone would revoke access to programmes they PAID for, as a
 * side-effect of a decision about their teaching. The `.eq('role',
 * 'TUTOR')` is the whole safety of this function.
 *
 * Idempotent: removing a role that is not there is success, not an
 * error — a suspension re-run must not fail on its second attempt.
 */
async function revokeTutorRole(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin
    .from('nclex_user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role', 'TUTOR');

  if (error) return { ok: false, error: error.message };
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

// ─────────────────────────────────────────────────────────────────────
// Sub-slice 1d — suspend and reinstate
// ─────────────────────────────────────────────────────────────────────
//
// ⭐ BOTH GO THROUGH nclex_tutor_record_decision, never an .update().
// The RPC writes the status and appends the history entry in ONE
// statement, which is what stops the record and its narrative drifting
// (migration 20260917120000). It also enforces the reason, the
// permission and the no-deciding-on-yourself rule at the layer that
// cannot be skipped by calling from somewhere else.
//
// ⚠ TWO WRITES, AND THE ORDER IS DELIBERATE — the record first, then
// the role, matching promoteUserToTutorAction. If the role write fails
// after a suspension, the tutor is out of the public catalogue (the
// switch that matters) and merely still has a workspace, which is
// visible and fixable. The reverse order would leave a suspended tutor
// listed and joinable.

export type TutorStandingResult =
  | { ok: true; changed: boolean; name: string }
  | { ok: false; error: string };

/**
 * Turn a plpgsql RAISE into something an admin can act on.
 *
 * The RPC's messages are precise but shaped for a log — they carry the
 * function name and a uuid. These are the three a person can actually
 * hit through the UI; anything else is a bug and keeps its raw text
 * rather than being flattened into a soothing generic.
 */
function decisionError(
  message: string,
  /**
   * Which surface is asking. Only the self-decision line differs: on the
   * directory the act is suspend/reinstate, in the queue it is deciding
   * an application, and naming the wrong one sends the admin looking for
   * a button that is not on their screen.
   */
  context: 'standing' | 'application' = 'standing',
): string {
  if (message.includes('own tutor record')) {
    return context === 'application'
      ? 'You cannot decide on your own tutor application. Ask another admin.'
      : 'You cannot suspend or reinstate your own tutor record. Ask another admin.';
  }
  if (message.includes('requires a reason')) {
    return 'A reason is required.';
  }
  if (message.includes('TUTORS_MANAGE required')) {
    return 'You no longer have permission to manage tutors.';
  }
  return message;
}

/**
 * ⭐⭐ THE STAGE THAT MAKES A DECISION EMAIL UNIQUE TO *THAT* DECISION.
 *
 * The outbox de-duplicates on `(event_key, subject_ref, stage)` and reads
 * a unique violation as SUCCESS — which is what makes Paystack's webhook
 * retries harmless. `stage` defaults to `'-'`, which outbox.ts documents
 * as "a one-off".
 *
 * ⚠ THAT DEFAULT IS WRONG WHENEVER subject_ref IS A PERSON. An enrolment
 * is approved once and a checkout gets one receipt, so `'-'` is right
 * there. But a person can be suspended, reinstated and suspended again —
 * and every one of these emails used `subject_ref = user_id` with the
 * default stage, so the SECOND one silently vanished. Not an error
 * anywhere: the insert was refused, the refusal was read as success, and
 * the action reported that it had emailed somebody it had not.
 *
 * Found 2026-08-22 when Sam suspended a tutor who had already been
 * suspended the day before and no email arrived. It had been true since
 * 1d shipped, and it is on prod. ⚠ The worst case was NOT suspension: §9
 * designs for an applicant being rejected, fixing their application and
 * being rejected again — and the rejection email is the only thing
 * carrying the new reason.
 *
 * So the stage is the decision's own timestamp, taken from the entry
 * `nclex_tutor_record_decision` just appended. Every transition appends
 * exactly one, so it identifies this decision and no other.
 *
 * ⓘ The fallback is `now()` rather than `'-'` on purpose: if the trail
 * could not be read, a stage nothing can collide with sends the email
 * twice at worst, where `'-'` would send it never. For a notice about
 * somebody's standing, duplicated beats missing.
 */
async function decisionStage(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
): Promise<string> {
  const { data } = await admin
    .from('nclex_tutors')
    .select('decision_history')
    .eq('user_id', userId)
    .maybeSingle();

  const trail = (data?.decision_history ?? []) as { at?: string }[];
  return trail[trail.length - 1]?.at ?? new Date().toISOString();
}

/** Look up a name for the toast. Never blocks the decision. */
async function tutorName(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
): Promise<string> {
  const { data } = await admin
    .from('nclex_users')
    .select('name')
    .eq('id', userId)
    .maybeSingle();
  return data?.name ?? 'That tutor';
}

/**
 * Suspend a tutor: standing to SUSPENDED, TUTOR role revoked.
 *
 * §7 — this stops new students joining, stops money in flight and closes
 * the workspace, and deliberately does NOT touch nclex_enrolments.
 * Students they already have keep their curriculum, library and quizzes:
 * those are rows the student paid for and we can serve with no tutor
 * present, and cutting them off punishes the student for the tutor's
 * conduct.
 */
export async function suspendTutorAction(
  userId: string,
  reason: string,
): Promise<TutorStandingResult> {
  await requireAdminPermission(PERM_TUTORS_MANAGE);

  // The authed client, not the service role: the RPC checks the CALLER's
  // permission and reads auth.uid() for both the actor and the
  // self-decision guard. Through the service role there is no caller.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('nclex_tutor_record_decision', {
    p_user_id: userId,
    p_to_status: 'SUSPENDED',
    p_reason: reason,
  });

  if (error) return { ok: false, error: decisionError(error.message) };

  const outcome = (data ?? [])[0] as { changed: boolean } | undefined;
  const admin = createServiceRoleClient();
  const name = await tutorName(admin, userId);

  // Already suspended — say so plainly rather than reporting a second
  // suspension that did not happen.
  if (!outcome?.changed) {
    revalidatePath('/admin/tutors');
    return { ok: true, changed: false, name };
  }

  const revoked = await revokeTutorRole(admin, userId);
  if (!revoked.ok) {
    return {
      ok: false,
      error: `${name} was suspended and has left the catalogue, but the TUTOR role could not be revoked: ${revoked.error}`,
    };
  }

  // ⓘ Told only when true, so the email does not reassure someone about
  // students they never had — the rule tutor-added-by-admin set with
  // keepsStudentRole. Counts current enrolments across every programme
  // they own; a head count is not needed, only whether there is anyone.
  const { data: theirProgrammes } = await admin
    .from('nclex_programmes')
    .select('programme_id')
    .eq('tutor_id', userId);

  let hasActiveStudents = false;
  const programmeIds = (theirProgrammes ?? []).map((p) => p.programme_id);
  if (programmeIds.length > 0) {
    const { count } = await admin
      .from('nclex_enrolments')
      .select('enrolment_id', { count: 'exact', head: true })
      .in('programme_id', programmeIds)
      .eq('status', 'ENROLLED');
    hasActiveStudents = (count ?? 0) > 0;
  }

  const { data: person } = await admin
    .from('nclex_users')
    .select('email')
    .eq('id', userId)
    .maybeSingle();

  // ⭐ enqueueAndSend: an admin is standing there and could act on a
  // failure. ⚠ But the email is NOT allowed to fail the suspension —
  // the standing change and the role revocation have already happened,
  // and reporting an error now would invite the admin to click again on
  // something that already worked. A suspension nobody was told about is
  // recoverable; an admin who believes the suspension failed is not.
  if (person?.email) {
    await enqueueAndSend({
      eventKey: 'tutor.suspended',
      subjectRef: userId,
      // A tutor can be suspended more than once. See decisionStage.
      stage: await decisionStage(admin, userId),
      toEmail: person.email,
      toUserId: userId,
      payload: {
        recipientName: name === 'That tutor' ? null : name,
        reason: reason.trim(),
        hasActiveStudents,
      },
    });
  }

  revalidatePath('/admin/tutors');
  return { ok: true, changed: true, name };
}

/**
 * Reinstate: standing back to APPROVED, TUTOR role re-granted.
 *
 * ⭐ THE NOTE IS OPTIONAL, AND THAT IS THE WHOLE DISTINCTION. The design
 * argued reinstatement needs no modal because "undoing a restriction
 * needs no justification the way imposing one does" — an argument about
 * REQUIRING A REASON, not about CONFIRMING. Sam asked for a confirm step
 * anyway (2026-08-21) and he is right for a different reason: this
 * button sits next to Close and fires instantly, so it is the easier of
 * the two to hit by accident, and since 1d-i a stray click leaves a
 * PERMANENT trail entry that suspending again cannot remove. State is
 * recoverable; history is not. So: confirm, but never demand a reason.
 *
 * ⚠ approved_at/by are NOT rewritten (the RPC coalesces): "who first let
 * this person in" is a permanent fact, and a reinstatement is not it.
 */
export async function reinstateTutorAction(
  userId: string,
  note?: string,
): Promise<TutorStandingResult> {
  const ctx = await requireAdminPermission(PERM_TUTORS_MANAGE);

  // Empty or whitespace becomes null: the RPC stores NULLIF(btrim(...))
  // anyway, and an empty string in the trail would render as an entry
  // with a dash where a sentence should be.
  const cleanNote = (note ?? '').trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('nclex_tutor_record_decision', {
    p_user_id: userId,
    p_to_status: 'APPROVED',
    p_reason: cleanNote,
  });

  if (error) return { ok: false, error: decisionError(error.message) };

  const outcome = (data ?? [])[0] as { changed: boolean } | undefined;
  const admin = createServiceRoleClient();
  const name = await tutorName(admin, userId);

  if (!outcome?.changed) {
    revalidatePath('/admin/tutors');
    return { ok: true, changed: false, name };
  }

  const granted = await grantTutorRole(admin, userId, ctx.user.id);
  if (!granted.ok) {
    return {
      ok: false,
      error: `${name} was reinstated and is back in the catalogue, but the TUTOR role could not be re-granted: ${granted.error}`,
    };
  }

  // The mirror of the suspension notice. ⚠ Sent AFTER the role is back:
  // the email's only content is a link into the workspace, so arriving
  // before the door reopens would invite a refusal.
  const { count: programmeCount } = await admin
    .from('nclex_programmes')
    .select('programme_id', { count: 'exact', head: true })
    .eq('tutor_id', userId);

  const { data: person } = await admin
    .from('nclex_users')
    .select('email')
    .eq('id', userId)
    .maybeSingle();

  if (person?.email) {
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nclex.quademia.com';
    await enqueueAndSend({
      eventKey: 'tutor.reinstated',
      subjectRef: userId,
      // Suspended → reinstated → suspended → reinstated is an ordinary
      // history, and every step of it has to reach the person.
      stage: await decisionStage(admin, userId),
      toEmail: person.email,
      toUserId: userId,
      payload: {
        recipientName: name === 'That tutor' ? null : name,
        hasProgrammes: (programmeCount ?? 0) > 0,
        workspaceUrl: `${origin}/tutor`,
      },
    });
  }

  revalidatePath('/admin/tutors');
  return { ok: true, changed: true, name };
}

// ─────────────────────────────────────────────────────────────────────
// Applying (sub-slice 2a-i)
// ─────────────────────────────────────────────────────────────────────

export type SubmitApplicationResult =
  | { ok: true; created: boolean; submissionCount: number }
  | { ok: false; error: string };

/** Turn the RPC's RAISEs into something an applicant can act on. */
function applicationError(message: string): string {
  if (message.includes('suspended tutor cannot re-apply')) {
    return 'Your tutor account is currently suspended, so a new application cannot be submitted. Please contact us instead.';
  }
  if (message.includes('already a tutor')) {
    return 'You are already a tutor — there is nothing to apply for.';
  }
  if (message.includes('tell us about yourself')) {
    return 'Please tell us about yourself before submitting.';
  }
  if (message.includes('sign in to apply')) {
    return 'Your session has expired. Sign in again and your details will still be here.';
  }
  return message;
}

/**
 * Apply, or re-apply, to become a tutor.
 *
 * ⚠ NO USER ID CROSSES THIS BOUNDARY, and that is the point. The RPC
 * writes from auth.uid(), so §5's identity rule cannot be bypassed by
 * anything this action does or forgets to do — the typed email decides
 * which BRANCH of the form you were in, never whose row is written.
 *
 * ⓘ THE ROLE IS NOT GRANTED HERE. §4's third invariant: registration and
 * application never grant TUTOR. Only an admin's approval does, through
 * grantTutorRole above.
 */
export async function submitApplicationAction(
  organisation: string,
  requestNote: string,
): Promise<SubmitApplicationResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'Sign in to apply.' };
  }

  // ⭐ SOURCE IS DERIVED, NOT PASSED — and it is derivable exactly.
  // Every other way of getting an account here grants STUDENT on the way
  // in: /register does, the pay-first setup at /welcome does, and admin
  // promotion grants TUTOR. So somebody holding NO ROLE AT ALL can only
  // have arrived through the tutor form itself, which is what
  // REGISTRATION means (§5).
  //
  // ⚠ It used to be a parameter. A client-supplied value describing OUR
  // provenance is a fact about us that the caller gets to write — and
  // while nothing branches on source, "was already our student" is a
  // vetting signal an applicant should not be able to set for themselves.
  const { data: roleRows } = await supabase
    .from('nclex_user_roles')
    .select('role')
    .eq('user_id', user.id);

  const source: 'SELF_APPLICATION' | 'REGISTRATION' =
    (roleRows ?? []).length === 0 ? 'REGISTRATION' : 'SELF_APPLICATION';

  const { data, error } = await supabase.rpc('nclex_tutor_submit_application', {
    p_organisation: organisation,
    p_request_note: requestNote,
    p_source: source,
  });

  if (error) return { ok: false, error: applicationError(error.message) };

  const outcome = (data ?? [])[0] as
    | { created: boolean; submission_count: number }
    | undefined;

  if (!outcome) {
    return { ok: false, error: 'Could not submit your application. Please try again.' };
  }

  const count = outcome.submission_count;

  // Identity for the emails. The service role, because both templates
  // need a name and an address off nclex_users — which an ordinary user
  // cannot read beyond their own row, and the ADMIN notice needs to name
  // somebody who is not the reader.
  const admin = createServiceRoleClient();
  const { data: person } = await admin
    .from('nclex_users')
    .select('name, email')
    .eq('id', user.id)
    .maybeSingle();

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nclex.quademia.com';

  // ⚠ Stage = the submission number, for the same reason the decision
  // emails carry a timestamp: subject_ref is a PERSON here, and §9 exists
  // so a person can apply more than once. With the default '-' stage, a
  // resubmission would be de-duplicated against the first application and
  // silently send nothing. See decisionStage above for the full story.
  const stage = `s${count}`;

  if (person?.email) {
    await enqueueAndSend({
      eventKey: 'tutor.application_received',
      subjectRef: user.id,
      stage,
      toEmail: person.email,
      toUserId: user.id,
      payload: {
        recipientName: person.name || null,
        submissionCount: count,
        isResubmission: count > 1,
        applicationUrl: `${origin}${TUTOR_APPLICATION_PATH}`,
      },
    });
  }

  // ⭐ The admin notice — recipient ≠ actor (§10). Without it the queue
  // fills up and nobody knows. ⚠ toUserId is deliberately absent: the
  // recipient is a shared address, not a user of this product, and
  // attaching the APPLICANT's id to a mail they never receive would make
  // the outbox lie about who was written to.
  await enqueueAndSend({
    eventKey: 'tutor.application_submitted_admin',
    subjectRef: user.id,
    stage,
    // Sam's call, 2026-08-22: a constant, not a lookup of everyone
    // holding TUTORS_MANAGE. A fan-out to permission holders is a feature
    // nobody needs while there is one admin, and an address in the code
    // cannot silently go nowhere the way an unset env var can.
    toEmail: SUPPORT_EMAIL,
    payload: {
      applicantName: person?.name || '(no name on file)',
      applicantEmail: person?.email || user.email || '(unknown)',
      organisation: organisation.trim() || null,
      submissionCount: count,
      requestNote: requestNote.trim(),
      queueUrl: `${origin}/admin/applications`,
    },
  });

  revalidatePath(TUTOR_APPLICATION_PATH);
  revalidateTutorSurfaces();

  return { ok: true, created: outcome.created, submissionCount: count };
}

// ─────────────────────────────────────────────────────────────────────
// Applying with no account (sub-slice 2a-ii)
// ─────────────────────────────────────────────────────────────────────

export type GuestApplyResult =
  | { ok: true }
  /**
   * ⭐ NOT AN ERROR — A ROUTE. The address already has an account, so the
   * form's job now is to send them to sign in and bring them back. §5's
   * whole point: one door, and which branch you are in is decided by the
   * EMAIL, not by whether you happened to be signed in when you arrived.
   */
  | { ok: false; accountExists: true }
  | { ok: false; accountExists?: false; error: string };

/**
 * Create an account AND lodge the application, in one submit — the
 * REGISTRATION doorway of §5.
 *
 * ⭐⭐ WHY THE "DOES THIS ADDRESS HAVE AN ACCOUNT?" TEST IS THE SIGNUP
 * ATTEMPT ITSELF, and not a lookup. The design settled that this form
 * discloses a collision, matching `/register` (which returns Supabase's
 * own "User already registered") rather than `/forgot-password` (which
 * must never). The obvious implementation is to ask first — but:
 *
 *   ⚠ `lib/auth/account-lookup.ts` states in terms that NOTHING it
 *     returns may reach the user, and it is right: it is a service-role
 *     read with no gate in front of it.
 *   ⚠⚠ And a bare "is this email taken?" endpoint would be a BETTER
 *     enumeration oracle than /register, not an equal one — because
 *     /register makes an attacker solve a Turnstile challenge for every
 *     address they test, and that captcha is the thing separating a
 *     person from a script walking a list.
 *
 * So the collision is discovered exactly where /register discovers it:
 * at signUp, behind the same captcha, disclosing exactly what is already
 * disclosed. No new surface, and account-lookup's rule stays literally
 * true because this never calls it.
 *
 * ⓘ ACCOUNT AND APPLICATION ARE WRITTEN TOGETHER, per §5, and that is
 * deliberate rather than convenient: creating the account first and
 * asking for the note afterwards leaves a role-less orphan account
 * behind every person who wanders off mid-form — an account that grants
 * nothing, explains nothing, and sends its owner to /no-access forever.
 *
 * ⚠ NO ROLE IS GRANTED. §4's third invariant, and the reason 2c's router
 * split had to exist before this sub-slice could ship.
 */
export async function applyAsGuestAction(formData: FormData): Promise<GuestApplyResult> {
  const forename = String(formData.get('forename') ?? '').trim();
  const surname = String(formData.get('surname') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const organisation = String(formData.get('organisation') ?? '');
  const requestNote = String(formData.get('requestNote') ?? '');

  if (!forename || !surname || !email || !password) {
    return { ok: false, error: 'All fields except organisation are required.' };
  }
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  if (requestNote.trim().length < 40) {
    return { ok: false, error: 'Please tell us a little more about yourself.' };
  }

  // Same gate as every other account-creating form. ⚠ Dev runs
  // Cloudflare's TESTING pair, so this passes locally by design — it is
  // still the real code path, and prod validates for real.
  const turnstile = readTurnstileTicket(formData.get(TURNSTILE_FIELD));
  if (!turnstile.ok) {
    await logAuthEvent({
      eventType: 'REGISTER_REJECTED',
      email,
      reason: `turnstile:${turnstile.reason}`,
    });
    return { ok: false, error: TURNSTILE_FAILED_MESSAGE };
  }

  const supabase = await createClient();

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: `${forename} ${surname}` },
      captchaToken: turnstile.token,
    },
  });

  if (signUpError) {
    if (isCaptchaRejection(signUpError.message)) {
      await logAuthEvent({
        eventType: 'REGISTER_REJECTED',
        email,
        reason: `turnstile:${signUpError.message}`,
      });
      return { ok: false, error: TURNSTILE_FAILED_MESSAGE };
    }

    const alreadyRegistered = /already registered/i.test(signUpError.message);

    await logAuthEvent({
      eventType: 'REGISTER_REJECTED',
      email,
      userExists: alreadyRegistered ? true : null,
      reason: `tutor_apply_signup_failed: ${signUpError.message}`,
    });

    // The branch, not a failure. The form swaps to "sign in to continue".
    if (alreadyRegistered) return { ok: false, accountExists: true };

    return { ok: false, error: signUpError.message };
  }

  const authUser = signUpData.user;
  if (!authUser) {
    await logAuthEvent({ eventType: 'REGISTER_REJECTED', email, reason: 'no_user_returned' });
    return { ok: false, error: 'Could not create your account. Please try again.' };
  }

  // ⓘ The per-request client carries the new session from here, which is
  // what lets both of the writes below pass RLS as the new user — the
  // same mechanism /register relies on for its profile insert.
  const { error: profileError } = await supabase.from('nclex_users').insert({
    id: authUser.id,
    email,
    forename,
    surname,
    name: `${forename} ${surname}`,
    signup_source: 'MYNCLEX',
  });

  if (profileError) {
    await rollbackAuthUser(authUser.id);
    await logAuthEvent({
      eventType: 'REGISTER_REJECTED',
      email,
      reason: `tutor_apply_profile_failed: ${profileError.message}`,
    });
    return { ok: false, error: 'Could not create your account. Please try again.' };
  }

  await logAuthEvent({ eventType: 'REGISTERED', email, userId: authUser.id });

  // ⚠ NO nclex_user_roles INSERT. Not an omission — §4, invariant 3.

  const lodged = await submitApplicationAction(organisation, requestNote);

  if (!lodged.ok) {
    // ⚠ The account is REAL and STAYS. Rolling it back would delete an
    // auth user who now has a password they chose and an email they can
    // sign in with — and the failure here is the application write, not
    // the account. They land on the apply page signed in, with the form
    // in front of them and their draft in hand.
    return {
      ok: false,
      error: `Your account was created, but the application did not save: ${lodged.error} Try submitting it again below.`,
    };
  }

  return { ok: true };
}

/** Undo a half-made account. Mirrors app/register/actions.ts. */
async function rollbackAuthUser(authUserId: string): Promise<void> {
  try {
    const admin = createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    await admin.auth.admin.deleteUser(authUserId);
  } catch {
    console.error('[tutor-apply] rollback deleteUser failed for', authUserId);
  }
}

/**
 * "We're not taking you on as a tutor — but you can use MyNclex as a
 * student." One button, and it is sub-slice 2c's whole point (§8).
 *
 * ⭐ A REJECTION SHOULD NOT BE A DEAD END. Someone who applied to teach
 * clearly wants to be here; sending them to a page that says no and
 * nothing else throws away a person who was ready to pay us.
 *
 * ⭐⭐ NO SERVICE ROLE, AND NO MIGRATION — because `nclex_roles_self_insert
 * _student` already permits exactly this and nothing more:
 * `user_id = auth.uid() AND role = 'STUDENT'`. The policy cannot be
 * talked into granting TUTOR, so the database enforces the shape of this
 * action rather than trusting it. That is the opposite of the arrangement
 * grantTutorRole needs, and the reason this one is three lines.
 *
 * ⚠ THE TUTOR RECORD IS NOT DELETED OR ALTERED. They remain a rejected
 * applicant who is now also a student — §9 lets them come back and
 * resubmit later, and that needs the row, the reason and the count
 * intact. Converting is additive, like every other role grant here.
 */
export async function convertToStudentAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: 'Sign in first.' };

  // ⚠ Only from REJECTED. Offered nowhere else, but the check belongs at
  // the layer that cannot be skipped: a PENDING applicant taking this
  // would give themselves a role while we are still deciding, and an
  // APPROVED tutor has one already.
  const { data: record } = await supabase
    .from('nclex_tutors')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (record?.status !== 'REJECTED') {
    return { ok: false, error: 'That offer does not apply to your account.' };
  }

  const { error } = await supabase
    .from('nclex_user_roles')
    .insert({ user_id: user.id, role: 'STUDENT' });

  // 23505 = they already had it (a second click, or two tabs). That is
  // the outcome we wanted, so it is success.
  if (error && error.code !== '23505') {
    return { ok: false, error: 'Could not set up your student account. Please try again.' };
  }

  revalidatePath(TUTOR_APPLICATION_PATH);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// The applications queue (sub-slice 2b)
// ─────────────────────────────────────────────────────────────────────
// ⭐ NO NEW MIGRATION, AND THAT IS THE TEST PASSING. The plan doc says
// "approve is 1c's action with a different trigger — if it needs new
// code, 1c was built too narrowly". It did not: 1d's
// nclex_tutor_record_decision already accepts APPROVED and REJECTED with
// every guard (permission, not-on-yourself, reason-required, idempotent,
// and the refusal to move anything to PENDING), and grantTutorRole is
// right here. These two actions are wiring.
//
// ⚠ Both revalidate BOTH surfaces. A decision made in the queue changes
// the directory too — an approval adds a tutor to it — and an admin who
// approves someone, then clicks through to /admin/tutors expecting to see
// them, would otherwise meet a stale list and conclude it failed.

/** Refresh both pages a decision is visible on. */
function revalidateTutorSurfaces(): void {
  revalidatePath('/admin/applications');
  revalidatePath('/admin/tutors');
}

/**
 * Approve a tutor application: standing to APPROVED, TUTOR granted.
 *
 * ⚠ NO PLAN, NO TIER, NO EXPIRY IS SET HERE. Admission is not plan
 * assignment (§12): approval puts everyone on the free tier by doing
 * nothing at all, because nothing in this table holds money.
 */
export async function approveApplicationAction(
  userId: string,
): Promise<TutorStandingResult> {
  const ctx = await requireAdminPermission(PERM_TUTORS_MANAGE);
  const admin = createServiceRoleClient();

  // Read the roles BEFORE granting, or the email's reassurance is always
  // true: after grantTutorRole every approved applicant looks like
  // someone who "keeps" something. The distinction the copy depends on —
  // existing student vs role-less registrant — exists only until the
  // write lands.
  const { data: rolesBefore } = await admin
    .from('nclex_user_roles')
    .select('role')
    .eq('user_id', userId);
  const keptStudent = (rolesBefore ?? []).some((r) => r.role === 'STUDENT');

  // The authed client: the RPC reads auth.uid() for the actor and for the
  // self-decision guard, and through the service role there is no caller.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('nclex_tutor_record_decision', {
    p_user_id: userId,
    p_to_status: 'APPROVED',
    p_reason: null,
  });

  if (error) return { ok: false, error: decisionError(error.message, 'application') };

  const outcome = (data ?? [])[0] as { changed: boolean } | undefined;
  const name = await tutorName(admin, userId);

  // Already approved — two admins on the same queue, or a double-click.
  // Say so rather than reporting a decision that did not happen.
  if (!outcome?.changed) {
    revalidateTutorSurfaces();
    return { ok: true, changed: false, name };
  }

  const granted = await grantTutorRole(admin, userId, ctx.user.id);
  if (!granted.ok) {
    return {
      ok: false,
      error: `${name}'s application was approved, but the TUTOR role could not be granted: ${granted.error}`,
    };
  }

  const { data: person } = await admin
    .from('nclex_users')
    .select('email')
    .eq('id', userId)
    .maybeSingle();

  // ⚠ Sent AFTER the role lands, like the reinstatement notice: its whole
  // content is a way into the workspace, and arriving first would invite
  // a refusal at the door. And as there, a failed email must NOT fail the
  // approval — the standing and the role are already written, and an
  // error now invites the admin to click again on something that worked.
  if (person?.email) {
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nclex.quademia.com';
    await enqueueAndSend({
      eventKey: 'tutor.application_approved',
      subjectRef: userId,
      // Rejected, resubmitted, approved — and possibly round again.
      stage: await decisionStage(admin, userId),
      toEmail: person.email,
      toUserId: userId,
      payload: {
        recipientName: name === 'That tutor' ? null : name,
        keepsStudentRole: keptStudent,
        workspaceUrl: `${origin}/tutor`,
        profileUrl: `${origin}/tutor/profile`,
      },
    });
  }

  revalidateTutorSurfaces();
  return { ok: true, changed: true, name };
}

/**
 * Reject a tutor application, with a reason the applicant will read.
 *
 * ⚠ NOT TERMINAL (§6, §9). The row stays, `decision_reason` is kept so a
 * re-applicant knows what to fix, and REJECTED → PENDING is allowed by
 * the CHECK — through the applicant's own resubmission, never through
 * this function or any other admin path.
 */
export async function rejectApplicationAction(
  userId: string,
  reason: string,
): Promise<TutorStandingResult> {
  await requireAdminPermission(PERM_TUTORS_MANAGE);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('nclex_tutor_record_decision', {
    p_user_id: userId,
    p_to_status: 'REJECTED',
    p_reason: reason,
  });

  if (error) return { ok: false, error: decisionError(error.message, 'application') };

  const outcome = (data ?? [])[0] as { changed: boolean } | undefined;
  const admin = createServiceRoleClient();
  const name = await tutorName(admin, userId);

  if (!outcome?.changed) {
    revalidateTutorSurfaces();
    return { ok: true, changed: false, name };
  }

  // ⚠ DEFENSIVE, and idempotent when there is nothing to remove. The
  // queue only offers Reject on a PENDING row, which never holds TUTOR —
  // but the RPC accepts APPROVED → REJECTED, so any future caller that
  // rejects an approved tutor must not leave them holding the role their
  // rejection just took away. Costs one no-op delete on the normal path.
  const revoked = await revokeTutorRole(admin, userId);
  if (!revoked.ok) {
    return {
      ok: false,
      error: `${name}'s application was rejected, but the TUTOR role could not be removed: ${revoked.error}`,
    };
  }

  const { data: person } = await admin
    .from('nclex_users')
    .select('email')
    .eq('id', userId)
    .maybeSingle();

  if (person?.email) {
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nclex.quademia.com';
    await enqueueAndSend({
      eventKey: 'tutor.application_rejected',
      subjectRef: userId,
      // ⚠ THE ONE THIS BUG WOULD HAVE HURT MOST. §9 exists so a rejected
      // applicant can fix their application and resubmit — so a second
      // rejection is expected, and this email is the only thing carrying
      // the new reason.
      stage: await decisionStage(admin, userId),
      toEmail: person.email,
      toUserId: userId,
      payload: {
        recipientName: name === 'That tutor' ? null : name,
        // The RPC has already refused a blank one; trim to match what it
        // stored, so the email and the record read identically.
        reason: reason.trim(),
        applicationUrl: `${origin}${TUTOR_APPLICATION_PATH}`,
      },
    });
  }

  revalidateTutorSurfaces();
  return { ok: true, changed: true, name };
}
