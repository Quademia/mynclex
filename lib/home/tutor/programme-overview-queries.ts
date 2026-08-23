// mynclex/lib/home/tutor/programme-overview-queries.ts
//
// Assembles the tutor PROGRAMME Overview (/tutor/programme/[id]/overview)
// from existing surfaces — no new tables. It's getTutorHomeData scoped to
// ONE programme: the same read-time derivation, the same analytics engine
// (so the figures match the Analytics tab + Home).
//
// Reads (all RLS-scoped / ownership-gated to the tutor):
//   • programme row        — getMyProgrammes (header facts + Edit form values)
//   • roster               — getProgrammeRoster (students / overdue / expired)
//   • enquiries            — getEnquiriesForProgramme (open count)
//   • sections counts      — curriculum / library / quizzes / plans
//   • revenue              — getTutorPayments, filtered to this programme
//   • cohort health        — getCohortAnalytics per IN_PROGRESS cohort
//                            (TUTOR_LED only — the heavy read, like Home)
//   • self-paced progress  — getSelfPacedProgrammeAnalytics (SELF_PACED
//                            only; the mirror-image heavy read)
//
// ⭐ Self-paced avg completion used to be missing here, and this comment
// used to explain why: "it needs a programme-level (cohortless) analytics
// aggregator that isn't built yet." It is built now
// (lib/analytics/tutor/programme-queries.ts), so both modes fill the same
// KPI. Self-paced additionally reports never-started / stalled / ending-soon
// counts — the pace buckets a cohort uses mean nothing without a shared
// calendar. The summary read skips quiz performance; the full dashboard on
// /tutor/programme/[id]/progress asks for it.

import { createClient } from '@/lib/supabase/server';
import { getMyProgrammes } from '@/lib/programmes/queries';
import { getProgrammeRoster } from '@/lib/enrolments/queries';
import { getEnquiriesForProgramme } from '@/lib/enquiries/queries';
import { getUnitsForProgramme } from '@/lib/curriculum/queries';
import { getProgrammeLibrarySnapshot } from '@/lib/library/programme/queries';
import { getProgrammeQuizzes } from '@/lib/programme-quizzes/queries';
import { getPaymentPlansContext } from '@/lib/strategies/queries';
import { getTutorPayments } from '@/lib/payments/tutor/queries';
import { getCohortsForProgramme } from '@/lib/cohorts/queries';
import { cohortStatus } from '@/lib/cohorts/format';
import { getCohortAnalytics } from '@/lib/analytics/tutor/cohort-queries';
import { getSelfPacedProgrammeAnalytics } from '@/lib/analytics/tutor/programme-queries';
import type { Currency, ProgrammeFormValues } from '@/lib/programmes/types';
import type {
  CohortHealthRow,
  CohortHealthStatus,
  EnquiryPreview,
  ProgrammeOverviewData,
  RecentEnrolment,
} from './programme-overview-types';

const DAY_MS = 86_400_000;
const CURRENCY_PREFIX: Record<Currency, string> = { GHS: 'GHS ', USD: '$' };
// A running cohort younger than this reads as "Just started" regardless of
// its (necessarily low) completion — so a fresh cohort isn't flagged "watch".
const JUST_STARTED_DAYS = 10;
// Work-panel caps (the panels are short; the "View all →" link is the
// overflow path to the full queue / roster).
const MAX_ENQUIRIES = 4;
const MAX_RECENT_ENROLMENTS = 4;

export async function getProgrammeOverview(
  programmeId: string,
): Promise<ProgrammeOverviewData | null> {
  // Header facts + Edit-form values + ownership proof in one go. RLS scopes
  // getMyProgrammes to the tutor's own programmes, so a miss here = not
  // owned / stale id → the page 404s.
  const programmes = await getMyProgrammes();
  const p = programmes.find((row) => row.programme_id === programmeId);
  if (!p) return null;

  const tutored = p.delivery_mode === 'TUTOR_LED';

  // Independent reads run together.
  const [roster, enquiries, units, library, quizzes, plansCtx, payments] =
    await Promise.all([
      getProgrammeRoster(programmeId),
      getEnquiriesForProgramme(programmeId),
      getUnitsForProgramme(programmeId),
      getProgrammeLibrarySnapshot(programmeId),
      getProgrammeQuizzes(programmeId),
      getPaymentPlansContext(programmeId),
      getTutorPayments(),
    ]);

  // ── Roster-derived figures (students / overdue / paused / expired) ─────
  const enrolledIds = new Set<string>();
  const newThisWeekIds = new Set<string>();
  let overdue = 0;
  let pausedManual = 0;
  let expired = 0;
  const weekAgo = Date.now() - 7 * DAY_MS;
  for (const r of roster ?? []) {
    if (r.status === 'ENROLLED') {
      enrolledIds.add(r.user_id);
      if (new Date(r.enrolled_at).getTime() >= weekAgo) {
        newThisWeekIds.add(r.user_id);
      }
    } else if (r.status === 'PAUSED') {
      if (r.paused_reason === 'INSTALLMENT_OVERDUE') overdue += 1;
      else pausedManual += 1;
    } else if (r.status === 'EXPIRED') {
      expired += 1;
    }
  }
  const studentsEnrolled = enrolledIds.size;

  // Recently-enrolled list (self-paced panel) — roster is already newest
  // first; keep the live (enrolled / paused) rows.
  const recentEnrolments: RecentEnrolment[] = (roster ?? [])
    .filter((r) => r.status === 'ENROLLED' || r.status === 'PAUSED')
    .slice(0, MAX_RECENT_ENROLMENTS)
    .map((r) => ({
      enrolmentId: r.enrolment_id,
      name: r.name,
      initials: initialsOf(r.name),
      agoLabel: `Enrolled ${relativeTime(r.enrolled_at)}`,
      detail: r.paymentFullyPaid
        ? 'Paid in full'
        : r.nextPayment
          ? 'On a payment plan'
          : null,
      status: r.status,
    }));

  // ── Open enquiries (NEW / CONTACTED — same rule as Home) ───────────────
  const openEnquiries = enquiries.filter(
    (e) => e.status === 'NEW' || e.status === 'CONTACTED',
  );
  const enquiriesOpen = openEnquiries.length;
  const enquiryPreviews: EnquiryPreview[] = openEnquiries
    .slice(0, MAX_ENQUIRIES)
    .map((e) => ({
      enquiryId: e.enquiry_id,
      name: e.name,
      initials: initialsOf(e.name),
      agoLabel: relativeTime(e.created_at),
      message: e.message ?? '',
      fresh: e.status === 'NEW',
    }));

  // ── Sections counts ────────────────────────────────────────────────────
  const curriculumActivities = units.reduce((sum, u) => sum + u.activity_count, 0);
  const quizMock = quizzes.filter((q) => q.quiz_kind === 'MOCK').length;
  const quizPractice = quizzes.filter((q) => q.quiz_kind === 'PRACTICE').length;
  const activePlans = (plansCtx?.strategies ?? []).filter((s) => s.is_active).length;

  // ── Revenue (received, this programme, its own currency) ───────────────
  let revenueMinor = 0;
  for (const row of payments.rows) {
    if (row.programmeId === programmeId && row.status === 'received') {
      revenueMinor += row.amountMinor;
    }
  }
  const revenueLabel =
    revenueMinor > 0 ? formatMoneyMinor(revenueMinor, p.price_currency) : null;

  // ── Cohort health + completion KPI (TUTOR_LED only) ────────────────────
  const cohorts: CohortHealthRow[] = [];
  let cohortsActive = 0;
  let cohortsNeedAttention = 0;
  let avgCompletion: number | null = null;
  let nextSessionLabel: string | null = null;
  let studentsNotStarted: number | null = null;
  let studentsStalled: number | null = null;
  let studentsEndingSoon: number | null = null;

  if (tutored) {
    const cohortList = await getCohortsForProgramme(programmeId);
    const inProgress = cohortList.filter((c) => cohortStatus(c) === 'IN_PROGRESS');
    cohortsActive = inProgress.length;

    const analytics = await Promise.all(
      inProgress.map(async (c) => ({
        cohort: c,
        data: await getCohortAnalytics(c.cohort_id, { includePerformance: false }),
      })),
    );

    const completionValues: number[] = [];
    for (const { cohort, data } of analytics) {
      if (!data) continue;
      const { summary } = data;
      const daysSinceStart = Math.floor(
        (Date.now() - new Date(`${cohort.start_date}T00:00:00Z`).getTime()) / DAY_MS,
      );
      const lagging = summary.buckets.behind + summary.buckets.risk;
      const status = cohortHealthStatus(
        summary.studentCount,
        summary.avgCompletion,
        daysSinceStart,
      );
      cohorts.push({
        cohortId: cohort.cohort_id,
        name: cohort.name ?? formatMonthYearRange(cohort.start_date, cohort.end_date),
        dateRange: formatMonthYearRange(cohort.start_date, cohort.end_date),
        students: summary.studentCount,
        completionPct: summary.avgCompletion,
        laggingCount: lagging,
        status,
      });
      if (summary.studentCount > 0) completionValues.push(summary.avgCompletion);
      if (status === 'watch') cohortsNeedAttention += 1;
    }

    // Worst-first: watch → just-started → on-track → no-data, then lowest %.
    const rank: Record<CohortHealthStatus, number> = {
      watch: 0,
      'just-started': 1,
      'on-track': 2,
      'no-data': 3,
    };
    cohorts.sort(
      (a, b) => rank[a.status] - rank[b.status] || a.completionPct - b.completionPct,
    );

    avgCompletion = completionValues.length
      ? Math.round(
          completionValues.reduce((acc, n) => acc + n, 0) / completionValues.length,
        )
      : null;

    nextSessionLabel = await getNextSessionLabel(programmeId);
  } else {
    // SELF_PACED — the same figures the Progress page leads with, read from
    // the same aggregator so the summary and the dashboard cannot disagree.
    const spa = await getSelfPacedProgrammeAnalytics(programmeId);
    if (spa && spa.summary.studentCount > 0) {
      avgCompletion = spa.summary.avgCompletion;
      studentsNotStarted = spa.summary.engagement?.notstarted ?? 0;
      studentsStalled = spa.summary.engagement?.stalled ?? 0;
      studentsEndingSoon = spa.summary.endingSoon ?? 0;
    }
  }

  const formValues: ProgrammeFormValues = {
    title: p.title,
    tagline: p.tagline,
    description: p.description,
    delivery_mode: p.delivery_mode,
    unit_label: p.unit_label,
    length_units: p.length_units,
    price_currency: p.price_currency,
    show_price_publicly: p.show_price_publicly,
    payment_collection_mode: p.payment_collection_mode,
    access_window_days: p.access_window_days,
    payment_gates_access: p.payment_gates_access,
    upfront_total_minor: p.upfront_total_minor ?? 0,
  };

  return {
    header: {
      programmeId: p.programme_id,
      title: p.title,
      tagline: p.tagline,
      deliveryMode: p.delivery_mode,
      status: p.status,
      lengthUnits: p.length_units,
      unitLabel: p.unit_label,
      priceMinor: p.upfront_total_minor,
      currency: p.price_currency,
      paymentGatesAccess: p.payment_gates_access,
      formValues,
      nextSessionLabel,
      revenueLabel,
    },
    kpis: {
      studentsEnrolled,
      studentsNewThisWeek: newThisWeekIds.size,
      cohortsActive,
      cohortsNeedAttention,
      avgCompletion,
      enrolmentsOverdue: overdue,
      enquiriesOpen,
      studentsNotStarted,
      studentsStalled,
      studentsEndingSoon,
    },
    sections: {
      curriculum: {
        units: units.length,
        activities: curriculumActivities,
        unitLabel: p.unit_label,
      },
      library: {
        notes: library?.notes.length ?? 0,
        shelves: library?.shelves.length ?? 0,
      },
      quizzes: { total: quizzes.length, mock: quizMock, practice: quizPractice },
      payments: { plans: activePlans, mode: p.payment_collection_mode },
      enrolments: { active: studentsEnrolled, expired },
    },
    cohorts,
    enquiries: enquiryPreviews,
    enrolmentHealth: {
      active: studentsEnrolled,
      overdue,
      paused: pausedManual,
      expired,
      recent: recentEnrolments,
    },
  };
}

// ── Next scheduled live session across this programme's cohorts ──────────
// RLS scopes the read to the tutor's own cohorts (they own the parent
// programme). UTC server clock, like home-queries.getUpcomingSessions.
async function getNextSessionLabel(programmeId: string): Promise<string | null> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from('nclex_cohort_live_sessions')
    .select('scheduled_at, nclex_cohorts!inner(programme_id)')
    .eq('nclex_cohorts.programme_id', programmeId)
    .not('scheduled_at', 'is', null)
    .gt('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(1);

  const iso = (data as Array<{ scheduled_at: string | null }> | null)?.[0]?.scheduled_at;
  return iso ? formatNextSession(iso) : null;
}

// ── health classification ────────────────────────────────────────────────
function cohortHealthStatus(
  studentCount: number,
  avgCompletion: number,
  daysSinceStart: number,
): CohortHealthStatus {
  if (studentCount === 0) return 'no-data';
  if (daysSinceStart <= JUST_STARTED_DAYS) return 'just-started';
  return avgCompletion >= 60 ? 'on-track' : 'watch';
}

// ── formatters ─────────────────────────────────────────────────────────
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatMoneyMinor(minor: number, currency: Currency): string {
  return `${CURRENCY_PREFIX[currency]}${Math.round(minor / 100).toLocaleString()}`;
}

// "Ama Osei" → "AO"; single name → first two letters; empty → "?".
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ISO → "2h ago" / "Yesterday" / "3 days ago" / "2 weeks ago". Mirrors the
// tutor Home's relativeTime (kept local — home-queries doesn't export it).
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

// "2026-03-14" + "2026-06-20" → "Mar – Jun 2026" (or "Mar 2026 – Jan 2027"
// when the years differ). Component-parsed to dodge the new-Date UTC shift.
function formatMonthYearRange(startIso: string, endIso: string): string {
  const [sy, sm] = startIso.split('-').map(Number);
  const [ey, em] = endIso.split('-').map(Number);
  if (sy === ey) return `${MONTHS[sm - 1]} – ${MONTHS[em - 1]} ${ey}`;
  return `${MONTHS[sm - 1]} ${sy} – ${MONTHS[em - 1]} ${ey}`;
}

// ISO timestamp → "Wed 25 Jun, 7:00 PM" (UTC, matching home-queries).
function formatNextSession(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = WEEKDAYS[d.getUTCDay()];
  const date = d.getUTCDate();
  const month = MONTHS[d.getUTCMonth()];
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${day} ${date} ${month}, ${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}
