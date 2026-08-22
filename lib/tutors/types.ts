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
 * What one trail entry says.
 *
 * ⭐ The wording comes from where it LANDED plus, where it matters, where
 * it came from: APPROVED means two different events depending on whether
 * the previous status was SUSPENDED, and calling a reinstatement
 * "Approved as a tutor" would hide the suspension it undoes.
 *
 * ⓘ Lived in admin-tutors-board.tsx until 2b, when the applications
 * drawer needed the same sentences. Moved here rather than copied — two
 * renderings of one trail that could drift is exactly the bug this
 * function exists to prevent.
 */
export function trailLabel(e: TutorDecisionEntry): string {
  switch (e.to) {
    case 'APPROVED':
      return e.from === 'SUSPENDED' ? 'Reinstated' : 'Approved as a tutor';
    case 'SUSPENDED':
      return 'Suspended';
    case 'REJECTED':
      return 'Application rejected';
    case 'PENDING':
      return e.from ? 'Re-applied' : 'Applied to become a tutor';
  }
}

/** Ring colour on the timeline. PENDING is neither good nor bad. */
export function trailTone(to: TutorStatus): string {
  if (to === 'APPROVED') return 'is-good';
  if (to === 'SUSPENDED' || to === 'REJECTED') return 'is-bad';
  return '';
}

/**
 * ONE PERSON'S WHOLE TUTOR RECORD — the nclex_tutors row joined to the
 * identity that stays on nclex_users, plus the roles they hold and a live
 * programme count.
 *
 * ⭐ ONE TYPE FOR BOTH SURFACES (settled with Sam, 2026-08-22). The
 * directory and the applications queue used to have a row type each,
 * carrying the half of the record their own drawer rendered. That quietly
 * contradicted §2 — `nclex_tutors` is ONE ROW PER PERSON, and two partial
 * views of one row leave an admin to wonder which is the truth. It also
 * taxed every future column with a "which surface does this belong to?"
 * decision that would be answered inconsistently forever.
 *
 * ⚠ So a loader must never fetch a subset. A drawer section that hides
 * itself when a field is empty cannot distinguish "they wrote no note"
 * from "this page did not ask for the note" — the invisible-to-tsc
 * failure this repo keeps meeting.
 */
export type TutorRecord = {
  user_id: string;
  name: string;
  email: string;
  /** From nclex_users — a phone is not tutor-specific, so it lives there. */
  phone: string | null;
  status: TutorStatus;
  source: TutorSource;
  profile: TutorPublicProfile;
  /** Programmes they own, any status. `0` renders as an em dash. */
  programme_count: number;
  /** ── The application payload, null for doorways with no approval step. */
  organisation: string | null;
  request_note: string | null;
  /**
   * Every role they hold right now.
   *
   * ⭐ §8 branches on ROLES, not on `source` — an existing student who
   * applied keeps STUDENT and lands on /student/picker, while a role-less
   * registrant has nowhere to stand and goes to the application page.
   * Reading `source` instead would be wrong the moment someone registers
   * as a tutor from an account that already had a role.
   */
  roles: string[];
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

/**
 * Where a person applies, checks their standing, and resubmits — ONE
 * route with five states (plan doc §8). Slice 2b only *links* to it; 2a-i
 * and 2c build it.
 *
 * ⭐ It is a constant because two places outside the route itself point
 * at it — the rejection email's "Update and resubmit" button and (in 2c)
 * the /student/picker card — and the name is still open. Sam left the
 * choice between this and `/tutor-application` as "a string, not a
 * design"; keeping it here makes changing his mind a one-line edit
 * instead of a search.
 */
export const TUTOR_APPLICATION_PATH = '/for-tutors/apply';

/** Counts behind the queue's two tabs. */
export type TutorApplicationStats = {
  pending: number;
  decided: number;
};

/**
 * True when this applicant has no role at all — the §8-A case.
 *
 * Kept as a function rather than a column so there is one definition of
 * "role-less" for the callout, and it cannot drift from what the router
 * will branch on in 2c.
 */
export function isRolelessApplicant(row: TutorRecord): boolean {
  return row.roles.length === 0;
}

/**
 * Did anybody actually apply for this record?
 *
 * The same test the queue's loader uses, so the drawer's application
 * section appears for exactly the rows that page lists. An admin
 * promotion or an invite has no approval step (§5) and never stamps
 * `first_applied_at`, so there is nothing to show for one.
 */
export function hasApplication(row: TutorRecord): boolean {
  return row.first_applied_at !== null;
}

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
