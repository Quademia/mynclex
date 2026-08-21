// mynclex/lib/tutors/types.ts
//
// The tutor record's TS shapes. Mirrors the nclex_tutors table created in
// tutor-onboarding slice 1a (migration 20260913120000).
// Plan: docs/product-plan/tutor-onboarding.md §3.

/**
 * Standing with us — the vetting/conduct axis, and the ONLY axis this
 * union covers.
 *
 * ⚠ There is deliberately no 'EXPIRED' here. Commercial standing is a
 * separate axis and lives on nclex_subscriptions; folding it in produces
 * the bug the plan doc records in §13 — suspend a tutor, their
 * subscription lapses, a sweep sets EXPIRED, they pay, the system sets
 * APPROVED, and a suspended tutor is teaching again.
 */
export type TutorStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

/**
 * How this person came to us. Provenance metadata only — nothing in the
 * system branches on it (plan doc §5), which is why the UI renders it as
 * a quiet dot rather than a pill competing with status.
 *
 * ⓘ A fifth value, LEGACY, existed for one migration and was retired in
 * 20260914120000. The tutors it described were datable after all —
 * nclex_user_roles.granted_at had recorded when each became a tutor — so
 * they are ADMIN_PROMOTION with real dates. Every doorway records who
 * acted, so nothing can be sourceless again.
 */
export type TutorSource =
  | 'SELF_APPLICATION'
  | 'ADMIN_PROMOTION'
  | 'ADMIN_INVITE'
  | 'REGISTRATION';

/** The public-display bag, lifted onto nclex_tutors in slice 1a. */
export type TutorPublicProfile = {
  headline?: string;
  speciality?: string;
  years_experience?: number;
  bio?: string;
  business_name?: string;
  business_logo_url?: string;
  business_bio?: string;
};

/**
 * One step in a tutor's story — added in slice 1d-i.
 *
 * ⭐ ONE SHAPE FOR THE WHOLE STORY. Every event is a status transition,
 * re-application included (it returns the row to PENDING), so
 * applied → rejected → re-applied → approved → suspended → reinstated is
 * six of these and the renderer needs no special cases.
 *
 * ⚠ This is the NARRATIVE, not the state. `TutorDirectoryRow.status` and
 * the decided_* fields remain authoritative for what is true now; these
 * entries say how it got that way. Never derive current standing by
 * reading the last entry — the column is indexed and this is not.
 *
 * `from` is null on the first entry of a row (there was no prior status)
 * and `by` is null where nobody is recorded — an application is an act of
 * the applicant, not a decision by an admin.
 */
export type TutorDecisionEntry = {
  at: string;
  by: string | null;
  from: TutorStatus | null;
  to: TutorStatus;
  reason: string | null;
};

/** A trail entry with its actor's name resolved for display. */
export type TutorTrailEntry = TutorDecisionEntry & { by_name: string | null };

/**
 * One row of the /admin/tutors directory: the tutor record joined to the
 * identity that stays on nclex_users, plus the live programme count.
 */
export type TutorDirectoryRow = {
  user_id: string;
  name: string;
  email: string;
  status: TutorStatus;
  source: TutorSource;
  profile: TutorPublicProfile;
  /** Programmes they own, any status. `0` renders as an em dash. */
  programme_count: number;
  /**
   * The permanent vetting fact — set once on first approval, never
   * overwritten.
   *
   * NULL means exactly one thing: not approved yet (a PENDING or
   * REJECTED row). It briefly meant two — that, or "predates the record"
   * — which is why retiring LEGACY was worth a migration.
   */
  approved_at: string | null;
  approved_by_name: string | null;
  /** The LAST decision of any kind, suspension included. */
  decided_at: string | null;
  decided_by_name: string | null;
  decision_reason: string | null;
  first_applied_at: string | null;
  last_applied_at: string | null;
  submission_count: number;
  created_at: string;
  /**
   * The full decision trail, oldest first, actor names resolved.
   *
   * Every row backfilled in 20260916120000 has at least the entries the
   * drawer used to derive; rows created after it accumulate one entry per
   * transition. An empty array is legitimate — a record with no
   * application date and no decision has nothing to tell.
   */
  trail: TutorTrailEntry[];
};

/** Counts for the directory's stat strip. */
export type TutorDirectoryStats = {
  approved: number;
  pending: number;
  suspended: number;
};

/** Whether the tutor has written anything students would see. */
export function hasPublicProfile(profile: TutorPublicProfile): boolean {
  return Boolean(profile.headline?.trim());
}

const SOURCE_LABELS: Record<TutorSource, string> = {
  ADMIN_PROMOTION: 'Admin promotion',
  SELF_APPLICATION: 'Self-application',
  REGISTRATION: 'Registered as tutor',
  ADMIN_INVITE: 'Invited by email',
};

export function sourceLabel(source: TutorSource): string {
  return SOURCE_LABELS[source] ?? source;
}

/** Modifier for `.adt-source`; the base class already styles the default. */
export function sourceClass(source: TutorSource): string {
  switch (source) {
    case 'SELF_APPLICATION':
      return ' is-self';
    case 'REGISTRATION':
      return ' is-reg';
    case 'ADMIN_INVITE':
      return ' is-invite';
    default:
      return '';
  }
}
