// mynclex/lib/tutors/queries.ts
//
// Reads for the two TUTORS_MANAGE surfaces — the /admin/tutors directory
// (slice 1b) and the /admin/applications queue (slice 2b).
// Plan: docs/product-plan/tutor-onboarding.md §11.
//
// ⚠ WHY THIS READS THROUGH THE SERVICE ROLE, like the admin enquiries
// board does. The pages are gated on TUTORS_MANAGE above these calls, and
// nclex_tutors' own RLS would admit such an admin fine. But both surfaces
// need each person's NAME and EMAIL, which live on nclex_users — whose
// policy is `id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN')`. So
// an admin holding TUTORS_MANAGE but not SUPER_ADMIN would get rows with
// every name and email blank, through the authed client.
//
// That would work in testing and fail on delegation, silently, because
// today Sam is the only SUPER_ADMIN and nclex_admin_permissions is empty
// — the same trap the plan doc flags for the 1c lookup RPC. Permission
// gate above, RLS-bypassing read below: the repo's standard
// ownership-then-service-role shape.
//
// ⭐ BOTH LOADERS RETURN THE SAME SHAPE, AND THAT IS DELIBERATE (settled
// with Sam, 2026-08-22). They used to fetch different halves of the row —
// the directory took the public profile and programme count, the queue
// took the application payload and roles — because each page rendered its
// own drawer over its own slice. There is now ONE record drawer, and a
// half-loaded row would make it lie: a section that hides itself when a
// field is null cannot tell "they wrote no note" from "this loader did
// not ask for the note". So they differ only in WHICH ROWS they return
// and what they tally, never in what a row contains.

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type {
  TutorApplicationStats,
  TutorDecisionEntry,
  TutorDirectoryStats,
  TutorPublicProfile,
  TutorRecord,
  TutorSource,
  TutorStatus,
} from './types';

/** Every column the record drawer can render, in one place. */
const RECORD_COLUMNS = `user_id, status, source, public_profile,
  organisation, request_note,
  approved_at, approved_by, decided_at, decided_by, decision_reason,
  first_applied_at, last_applied_at, submission_count, created_at,
  decision_history`;

type TutorRecordRow = {
  user_id: string;
  status: TutorStatus;
  source: TutorSource;
  public_profile: TutorPublicProfile | null;
  organisation: string | null;
  request_note: string | null;
  approved_at: string | null;
  approved_by: string | null;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
  first_applied_at: string | null;
  last_applied_at: string | null;
  submission_count: number;
  created_at: string;
  decision_history: TutorDecisionEntry[] | null;
};

type UserIdentityRow = {
  id: string;
  name: string;
  email: string;
  phone_number: string | null;
  /**
   * Null = has never signed in. Written by /login's two paths and, since
   * slice 3, by /welcome when setup completes — which is what makes it
   * safe to read as "this invite was never accepted".
   */
  last_login_utc: string | null;
};

/**
 * Turn raw nclex_tutors rows into full records: identities resolved,
 * roles attached, programmes counted.
 *
 * Four round trips, not a join: PostgREST cannot embed nclex_users twice
 * from one table (once for the person, once for whoever decided) and has
 * no COUNT-per-group, so the counts are tallied here. At the volumes
 * these pages see — a handful of rows on dev, one on prod — that is not
 * worth an RPC.
 */
async function hydrateRecords(
  admin: ReturnType<typeof createServiceRoleClient>,
  raw: TutorRecordRow[],
): Promise<TutorRecord[]> {
  if (raw.length === 0) return [];

  // Identities: the people themselves plus whoever decided on them. One
  // fetch for both sets, since a decider is very often also a tutor.
  const identityIds = new Set<string>();
  for (const r of raw) {
    identityIds.add(r.user_id);
    if (r.approved_by) identityIds.add(r.approved_by);
    if (r.decided_by) identityIds.add(r.decided_by);
    // ⚠ The trail's actors too, not just the latest decision. Someone
    // suspended by one admin and reinstated by another has a name in the
    // history that appears in neither scalar column — miss these and the
    // drawer renders an unattributed entry for a decision we do know the
    // author of. Same fetch, no extra round trip.
    for (const e of r.decision_history ?? []) {
      if (e.by) identityIds.add(e.by);
    }
  }

  const { data: users } = await admin
    .from('nclex_users')
    .select('id, name, email, phone_number, last_login_utc')
    .in('id', [...identityIds]);

  const byId = new Map(((users ?? []) as UserIdentityRow[]).map((u) => [u.id, u]));

  const subjectIds = raw.map((r) => r.user_id);

  // Roles, for §8's branching. The callout has to say something different
  // to an existing student than to someone with no roles at all, and
  // getting that wrong tells an admin the applicant will land somewhere
  // they will not.
  const { data: roleRows } = await admin
    .from('nclex_user_roles')
    .select('user_id, role')
    .in('user_id', subjectIds);

  const rolesByUser = new Map<string, string[]>();
  for (const r of (roleRows ?? []) as { user_id: string; role: string }[]) {
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r.role);
    rolesByUser.set(r.user_id, list);
  }

  // Programme counts. Every programme they own, whatever its status — the
  // column answers "is this account carrying live work?", which a draft
  // still counts towards when you are deciding to suspend someone.
  const { data: programmes } = await admin
    .from('nclex_programmes')
    .select('tutor_id')
    .in('tutor_id', subjectIds);

  const counts = new Map<string, number>();
  for (const p of (programmes ?? []) as { tutor_id: string }[]) {
    counts.set(p.tutor_id, (counts.get(p.tutor_id) ?? 0) + 1);
  }

  return raw.map((r) => {
    const self = byId.get(r.user_id);
    return {
      user_id: r.user_id,
      // A tutor record cannot outlive its user (the FK cascades), so a
      // missing identity means the service-role read was truncated
      // rather than that the person is gone. Show the id, don't crash.
      name: self?.name ?? '(unknown user)',
      email: self?.email ?? r.user_id,
      phone: self?.phone_number ?? null,
      status: r.status,
      source: r.source,
      profile: r.public_profile ?? {},
      programme_count: counts.get(r.user_id) ?? 0,
      // ⚠ BOTH halves. Dropping the source check turns "this invite was
      // never accepted" into "this person has not logged in lately",
      // which is a different claim about a different set of people.
      invite_pending: r.source === 'ADMIN_INVITE' && !self?.last_login_utc,
      organisation: r.organisation,
      request_note: r.request_note,
      approved_at: r.approved_at,
      approved_by_name: r.approved_by ? (byId.get(r.approved_by)?.name ?? null) : null,
      decided_at: r.decided_at,
      decided_by_name: r.decided_by ? (byId.get(r.decided_by)?.name ?? null) : null,
      decision_reason: r.decision_reason,
      first_applied_at: r.first_applied_at,
      last_applied_at: r.last_applied_at,
      submission_count: r.submission_count,
      created_at: r.created_at,
      roles: (rolesByUser.get(r.user_id) ?? []).sort(),
      // Oldest first — the column is appended to, so array order is
      // already chronological and must not be re-sorted by date: two
      // decisions in the same second would swap, and the order they
      // happened in is the one thing a trail must not get wrong.
      trail: (r.decision_history ?? []).map((e) => ({
        ...e,
        by_name: e.by ? (byId.get(e.by)?.name ?? null) : null,
      })),
    };
  });
}

/** Every tutor record, newest first. */
export async function loadTutorDirectory(): Promise<{
  rows: TutorRecord[];
  stats: TutorDirectoryStats;
}> {
  const admin = createServiceRoleClient();

  const { data: records } = await admin
    .from('nclex_tutors')
    .select(RECORD_COLUMNS)
    .order('created_at', { ascending: false });

  const rows = await hydrateRecords(admin, (records ?? []) as unknown as TutorRecordRow[]);

  return {
    rows,
    stats: {
      approved: rows.filter((r) => r.status === 'APPROVED').length,
      pending: rows.filter((r) => r.status === 'PENDING').length,
      suspended: rows.filter((r) => r.status === 'SUSPENDED').length,
    },
  };
}

/**
 * The signed-in caller's OWN tutor record, or null if they have never
 * applied and were never made one (sub-slice 2a-i).
 *
 * ⭐ THE ONE READ IN THIS FILE THAT IS NOT AN ADMIN READ, and the only
 * one that must NOT use the service role — `nclex_tutors_self_read`
 * already admits `user_id = auth.uid()`.
 *
 * ⚠⚠ BUT IT STILL FILTERS EXPLICITLY, AND THE FIRST VERSION DID NOT.
 * This function was written to lean on RLS alone: no `.eq()`, just
 * `.maybeSingle()`, on the reasoning that the policy narrows the result
 * to the caller's own row. **That policy is
 * `user_id = auth.uid() OR nclex_user_has_permission('TUTORS_MANAGE')`.**
 * For an admin the OR matches EVERY row, `.maybeSingle()` gets a
 * multi-row result, and it returns null — so /for-tutors/apply showed an
 * approved tutor who happens to be an admin a blank application form,
 * as though they had never applied.
 *
 * Caught in the browser on 2026-08-22, not by tsc, not by lint, and not
 * by anything that would have failed for an ordinary user. ⭐ The general
 * shape is one this repo keeps meeting from the other direction: an RLS
 * policy with an OR in it is not a WHERE clause. Say what you mean in the
 * query; let the policy be the thing that stops you being wrong.
 */
export async function loadMyTutorRecord(): Promise<{
  status: TutorStatus;
  source: TutorSource;
  organisation: string | null;
  request_note: string | null;
  submission_count: number;
  decision_reason: string | null;
  decided_at: string | null;
  first_applied_at: string | null;
  last_applied_at: string | null;
} | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from('nclex_tutors')
    .select(
      `status, source, organisation, request_note, submission_count,
       decision_reason, decided_at, first_applied_at, last_applied_at`,
    )
    // The line that was missing. See above.
    .eq('user_id', user.id)
    .maybeSingle();

  return data ?? null;
}

/**
 * The /admin/applications queue (sub-slice 2b): everything still waiting,
 * plus every application ever decided.
 *
 * ⚠ WHICH ROWS COUNT AS APPLICATIONS, and why it is not `status IN
 * ('PENDING','REJECTED')`. An approved applicant's row becomes APPROVED
 * and is then indistinguishable from an admin promotion by status alone —
 * so the Decided tab would lose every approval it ever made, which is the
 * one thing an admin looks back for ("did I already say yes to this
 * person?"). The real test is **did anybody apply**: `first_applied_at IS
 * NOT NULL`. Admin promotions and invites have no approval step (§5) and
 * never set it, so they stay in the directory where they belong.
 */
export async function loadTutorApplications(): Promise<{
  rows: TutorRecord[];
  stats: TutorApplicationStats;
}> {
  const admin = createServiceRoleClient();

  const { data: records } = await admin
    .from('nclex_tutors')
    .select(RECORD_COLUMNS)
    .not('first_applied_at', 'is', null)
    // Oldest application first: whoever has waited longest is the one an
    // admin should meet first. The Decided tab re-sorts by decision date
    // in the component.
    .order('last_applied_at', { ascending: true });

  const rows = await hydrateRecords(admin, (records ?? []) as unknown as TutorRecordRow[]);

  return {
    rows,
    stats: {
      pending: rows.filter((r) => r.status === 'PENDING').length,
      decided: rows.filter((r) => r.status !== 'PENDING').length,
    },
  };
}
