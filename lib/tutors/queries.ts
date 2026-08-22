// mynclex/lib/tutors/queries.ts
//
// Reads for the /admin/tutors directory (tutor-onboarding slice 1b).
// Plan: docs/product-plan/tutor-onboarding.md §11.
//
// ⚠ WHY THIS READS THROUGH THE SERVICE ROLE, like the admin enquiries
// board does. The page is gated on TUTORS_MANAGE above this call, and
// nclex_tutors' own RLS would admit such an admin fine. But the directory
// needs each tutor's NAME and EMAIL, which live on nclex_users — whose
// policy is `id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN')`. So
// an admin holding TUTORS_MANAGE but not SUPER_ADMIN would get rows with
// every name and email blank, through the authed client.
//
// That would work in testing and fail on delegation, silently, because
// today Sam is the only SUPER_ADMIN and nclex_admin_permissions is empty
// — the same trap the plan doc flags for the 1c lookup RPC. Permission
// gate above, RLS-bypassing read below: the repo's standard
// ownership-then-service-role shape.

import { createServiceRoleClient } from '@/lib/supabase/server';
import type {
  TutorApplicationRow,
  TutorApplicationStats,
  TutorDecisionEntry,
  TutorDirectoryRow,
  TutorDirectoryStats,
  TutorPublicProfile,
  TutorSource,
  TutorStatus,
} from './types';

type TutorRecordRow = {
  user_id: string;
  status: TutorStatus;
  source: TutorSource;
  public_profile: TutorPublicProfile | null;
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

/** The applications queue reads the payload columns, not the profile. */
type ApplicationRecordRow = {
  user_id: string;
  status: TutorStatus;
  source: TutorSource;
  organisation: string | null;
  request_note: string | null;
  submission_count: number;
  first_applied_at: string | null;
  last_applied_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
  decision_history: TutorDecisionEntry[] | null;
};

type UserIdentityRow = {
  id: string;
  name: string;
  email: string;
  phone_number: string | null;
};

/**
 * Every tutor record, newest first, with identity, decision-maker names
 * and a live programme count.
 *
 * Four round trips, not a join: PostgREST cannot embed nclex_users twice
 * from one table (once for the tutor, once for whoever decided) and has
 * no COUNT-per-group, so the counts are tallied here. At the volumes this
 * page sees — five rows on dev, one on prod — that is not worth an RPC.
 */
export async function loadTutorDirectory(): Promise<{
  rows: TutorDirectoryRow[];
  stats: TutorDirectoryStats;
}> {
  const admin = createServiceRoleClient();

  const { data: records } = await admin
    .from('nclex_tutors')
    .select(
      `user_id, status, source, public_profile,
       approved_at, approved_by, decided_at, decided_by, decision_reason,
       first_applied_at, last_applied_at, submission_count, created_at,
       decision_history`,
    )
    .order('created_at', { ascending: false });

  const tutorRows = (records ?? []) as TutorRecordRow[];
  if (tutorRows.length === 0) {
    return { rows: [], stats: { approved: 0, pending: 0, suspended: 0 } };
  }

  // Identities: the tutors themselves plus whoever decided on them. One
  // fetch for both sets, since a decider is very often also a tutor.
  const identityIds = new Set<string>();
  for (const r of tutorRows) {
    identityIds.add(r.user_id);
    if (r.approved_by) identityIds.add(r.approved_by);
    if (r.decided_by) identityIds.add(r.decided_by);
    // ⚠ The trail's actors too, not just the latest decision. A tutor
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
    .select('id, name, email')
    .in('id', [...identityIds]);

  const byId = new Map(
    ((users ?? []) as { id: string; name: string; email: string }[]).map((u) => [u.id, u]),
  );

  // Programme counts. Every programme a tutor owns, whatever its status —
  // the column answers "is this account carrying live work?", which a
  // draft still counts towards when you are deciding to suspend someone.
  const { data: programmes } = await admin
    .from('nclex_programmes')
    .select('tutor_id')
    .in('tutor_id', tutorRows.map((r) => r.user_id));

  const counts = new Map<string, number>();
  for (const p of (programmes ?? []) as { tutor_id: string }[]) {
    counts.set(p.tutor_id, (counts.get(p.tutor_id) ?? 0) + 1);
  }

  const rows: TutorDirectoryRow[] = tutorRows.map((r) => {
    const self = byId.get(r.user_id);
    return {
      user_id: r.user_id,
      // A tutor record cannot outlive its user (the FK cascades), so a
      // missing identity means the service-role read was truncated
      // rather than that the person is gone. Show the id, don't crash.
      name: self?.name ?? '(unknown user)',
      email: self?.email ?? r.user_id,
      status: r.status,
      source: r.source,
      profile: r.public_profile ?? {},
      programme_count: counts.get(r.user_id) ?? 0,
      approved_at: r.approved_at,
      approved_by_name: r.approved_by ? (byId.get(r.approved_by)?.name ?? null) : null,
      decided_at: r.decided_at,
      decided_by_name: r.decided_by ? (byId.get(r.decided_by)?.name ?? null) : null,
      decision_reason: r.decision_reason,
      first_applied_at: r.first_applied_at,
      last_applied_at: r.last_applied_at,
      submission_count: r.submission_count,
      created_at: r.created_at,
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

  const stats: TutorDirectoryStats = {
    approved: rows.filter((r) => r.status === 'APPROVED').length,
    pending: rows.filter((r) => r.status === 'PENDING').length,
    suspended: rows.filter((r) => r.status === 'SUSPENDED').length,
  };

  return { rows, stats };
}

/**
 * The /admin/applications queue (sub-slice 2b): every row that has ever
 * been decided *as an application*, plus everything still waiting.
 *
 * ⚠ WHICH ROWS COUNT AS APPLICATIONS, and why it is not `status IN
 * ('PENDING','REJECTED')`. An approved applicant's row becomes APPROVED
 * and is then indistinguishable from an admin promotion by status alone —
 * so the Decided tab would lose every approval it ever made, which is the
 * one thing an admin looks back for ("did I already say yes to this
 * person?"). The real test is **did anybody apply**: `first_applied_at IS
 * NOT NULL`. Admin promotions and invites have no approval step (§5) and
 * never set it, so they stay in the directory where they belong.
 *
 * ⓘ Same service-role reasoning as loadTutorDirectory above — this page
 * needs names and emails off nclex_users, which is SUPER_ADMIN-only.
 */
export async function loadTutorApplications(): Promise<{
  rows: TutorApplicationRow[];
  stats: TutorApplicationStats;
}> {
  const admin = createServiceRoleClient();

  const { data: records } = await admin
    .from('nclex_tutors')
    .select(
      `user_id, status, source, organisation, request_note,
       submission_count, first_applied_at, last_applied_at,
       decided_at, decided_by, decision_reason, decision_history`,
    )
    .not('first_applied_at', 'is', null)
    // Oldest application first in the pending queue: a person who has
    // waited longest should be the one an admin meets first. The Decided
    // tab re-sorts by decision date in the component.
    .order('last_applied_at', { ascending: true });

  const appRows = (records ?? []) as ApplicationRecordRow[];
  if (appRows.length === 0) {
    return { rows: [], stats: { pending: 0, decided: 0 } };
  }

  // Identities: the applicants plus whoever decided on them, and the
  // trail's actors — a re-applied row can carry a decider who appears in
  // no scalar column.
  const identityIds = new Set<string>();
  for (const r of appRows) {
    identityIds.add(r.user_id);
    if (r.decided_by) identityIds.add(r.decided_by);
    for (const e of r.decision_history ?? []) {
      if (e.by) identityIds.add(e.by);
    }
  }

  const { data: users } = await admin
    .from('nclex_users')
    .select('id, name, email, phone_number')
    .in('id', [...identityIds]);

  const byId = new Map(
    ((users ?? []) as UserIdentityRow[]).map((u) => [u.id, u]),
  );

  // Roles, for §8's branching. One fetch for every applicant rather than
  // per-row: the callout has to say something different to an existing
  // student than to someone with no roles at all, and getting that wrong
  // tells an admin the applicant will land somewhere they will not.
  const { data: roleRows } = await admin
    .from('nclex_user_roles')
    .select('user_id, role')
    .in('user_id', appRows.map((r) => r.user_id));

  const rolesByUser = new Map<string, string[]>();
  for (const r of (roleRows ?? []) as { user_id: string; role: string }[]) {
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r.role);
    rolesByUser.set(r.user_id, list);
  }

  const rows: TutorApplicationRow[] = appRows.map((r) => {
    const self = byId.get(r.user_id);
    return {
      user_id: r.user_id,
      name: self?.name ?? '(unknown user)',
      email: self?.email ?? r.user_id,
      phone: self?.phone_number ?? null,
      status: r.status,
      source: r.source,
      organisation: r.organisation,
      request_note: r.request_note,
      submission_count: r.submission_count,
      first_applied_at: r.first_applied_at,
      last_applied_at: r.last_applied_at,
      decided_at: r.decided_at,
      decided_by_name: r.decided_by ? (byId.get(r.decided_by)?.name ?? null) : null,
      decision_reason: r.decision_reason,
      roles: (rolesByUser.get(r.user_id) ?? []).sort(),
      // Append-ordered; never re-sorted by date (see loadTutorDirectory).
      trail: (r.decision_history ?? []).map((e) => ({
        ...e,
        by_name: e.by ? (byId.get(e.by)?.name ?? null) : null,
      })),
    };
  });

  return {
    rows,
    stats: {
      pending: rows.filter((r) => r.status === 'PENDING').length,
      decided: rows.filter((r) => r.status !== 'PENDING').length,
    },
  };
}
