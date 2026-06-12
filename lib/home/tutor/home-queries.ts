// mynclex/lib/home/tutor/home-queries.ts
//
// Assembles the tutor Home dashboard (`/tutor`) from existing surfaces —
// no new tables. Everything is derived at read time:
//
//   • Stat bar      — programmes / cohorts / enrolled / open enquiries
//   • Attention     — open enquiries (lib/enquiries) + lagging cohorts
//                     (the Cohort Analytics completion engine)
//   • This week     — ONLINE_LIVE_SESSION activities scheduled in 7 days
//   • Programmes    — cards with a completion roll-up per programme
//   • Workspace     — Bank / Quizzes / Library counts + loose-ends
//
// Completion uses the real per-cohort analytics (so figures match the
// Analytics tab). It runs `getCohortAnalytics` once per IN_PROGRESS
// cohort — fine at v1 scale (few cohorts / students). If a tutor ever
// has enough that the home feels slow, cache this layer; see
// docs/product-plan/tutor-home.md.

import { createClient } from '@/lib/supabase/server';
import { getMyProgrammes } from '@/lib/programmes/queries';
import { getCohortsForProgramme } from '@/lib/cohorts/queries';
import { cohortStatus } from '@/lib/cohorts/format';
import { getEnquiriesForProgramme } from '@/lib/enquiries/queries';
import { getCohortAnalytics } from '@/lib/analytics/tutor/cohort-queries';
import { getMyQuizzes } from '@/lib/tutor-quiz/queries';
import { getLibraryOverviewStats } from '@/lib/library/queries';
import type {
  HomeBehindCohort,
  HomeEnquiry,
  HomeProgramme,
  HomeSession,
  HomeWorkspace,
  TutorHomeData,
} from './types';

const DAY_MS = 86_400_000;
// Cap the attention list so a flooded inbox doesn't run off the page —
// the "Open enquiries" stat tile is the overflow path to the full queue.
const MAX_ENQUIRIES_SHOWN = 6;

export async function getTutorHomeData(): Promise<TutorHomeData> {
  const supabase = await createClient();

  const [{ data: { user } }, programmes] = await Promise.all([
    supabase.auth.getUser(),
    getMyProgrammes(),
  ]);

  // Greeting forename (own profile row).
  let firstName = '';
  if (user) {
    const { data: prof } = await supabase
      .from('nclex_users')
      .select('forename')
      .eq('id', user.id)
      .maybeSingle();
    firstName = (prof?.forename ?? '').trim();
  }

  // Brand-new tutor — nothing built yet.
  if (programmes.length === 0) {
    return {
      firstName,
      isFresh: true,
      stats: { programmes: 0, cohorts: 0, students: 0, enquiries: 0 },
      enquiries: [],
      behind: [],
      sessions: [],
      programmes: [],
      workspace: await getWorkspace(),
    };
  }

  const activeProgrammes = programmes.filter((p) => p.status === 'PUBLISHED');
  const programmeTitleById = new Map(
    programmes.map((p) => [p.programme_id, p.title]),
  );

  // ── Cohorts per active programme → keep the IN_PROGRESS ones ──────────
  const cohortLists = await Promise.all(
    activeProgrammes.map((p) => getCohortsForProgramme(p.programme_id)),
  );
  type ActiveCohort = { cohortId: string; programmeId: string };
  const activeCohorts: ActiveCohort[] = [];
  for (const list of cohortLists) {
    for (const c of list) {
      if (cohortStatus(c) === 'IN_PROGRESS') {
        activeCohorts.push({ cohortId: c.cohort_id, programmeId: c.programme_id });
      }
    }
  }

  // ── Completion analytics per active cohort (the backbone) ─────────────
  const analytics = await Promise.all(
    activeCohorts.map(async (c) => ({
      cohort: c,
      data: await getCohortAnalytics(c.cohortId, { includePerformance: false }),
    })),
  );

  // Distinct enrolled students across active cohorts + per-programme rollup.
  const enrolledUserIds = new Set<string>();
  type ProgRollup = { sumAvg: number; n: number; students: Set<string>; cohorts: number };
  const rollupByProgramme = new Map<string, ProgRollup>();
  const behind: HomeBehindCohort[] = [];

  for (const { cohort, data } of analytics) {
    if (!data) continue;
    const { summary } = data;
    for (const s of data.students) enrolledUserIds.add(s.userId);

    const roll = rollupByProgramme.get(cohort.programmeId) ?? {
      sumAvg: 0, n: 0, students: new Set<string>(), cohorts: 0,
    };
    roll.sumAvg += summary.avgCompletion;
    roll.n += 1;
    roll.cohorts += 1;
    for (const s of data.students) roll.students.add(s.userId);
    rollupByProgramme.set(cohort.programmeId, roll);

    // Falling-behind flag: any class member counted, and either a low
    // average or students who haven't started.
    const notStarted = summary.buckets.notstarted;
    const lagging = summary.buckets.behind + summary.buckets.risk;
    if (summary.studentCount > 0 && (summary.avgCompletion < 60 || notStarted > 0)) {
      const signal =
        notStarted > 0
          ? `avg ${summary.avgCompletion}% complete · ${notStarted} not started`
          : `avg ${summary.avgCompletion}% complete · ${lagging} falling behind`;
      behind.push({
        cohortId: cohort.cohortId,
        programmeId: cohort.programmeId,
        cohort: data.meta.cohortName,
        programme: data.meta.programmeTitle,
        signal,
        avg: summary.avgCompletion,
        sev: summary.avgCompletion < 40 ? 'high' : 'med',
      });
    }
  }
  // Worst first: high severity, then lowest average.
  behind.sort((a, b) =>
    (a.sev === b.sev ? 0 : a.sev === 'high' ? -1 : 1) || a.avg - b.avg,
  );

  // ── Programme cards ───────────────────────────────────────────────────
  const homeProgrammes: HomeProgramme[] = activeProgrammes.map((p) => {
    const roll = rollupByProgramme.get(p.programme_id);
    const avg = roll && roll.n ? Math.round(roll.sumAvg / roll.n) : 0;
    const hasData = !!roll && roll.students.size > 0;
    return {
      programmeId: p.programme_id,
      title: p.title,
      tagline: p.tagline,
      cohorts: roll?.cohorts ?? 0,
      students: roll?.students.size ?? 0,
      avg,
      health: !hasData ? 'none' : avg >= 60 ? 'on-track' : 'watch',
    };
  });

  // ── Enquiries (open, across every programme) ──────────────────────────
  const enquiryLists = await Promise.all(
    programmes.map((p) => getEnquiriesForProgramme(p.programme_id)),
  );
  const openEnquiries = enquiryLists
    .flat()
    .filter((e) => e.status === 'NEW' || e.status === 'CONTACTED')
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const enquiries: HomeEnquiry[] = openEnquiries
    .slice(0, MAX_ENQUIRIES_SHOWN)
    .map((e) => ({
      enquiryId: e.enquiry_id,
      programmeId: e.programme_id,
      name: e.name,
      programme: programmeTitleById.get(e.programme_id) ?? 'Programme',
      ago: relativeTime(e.created_at),
      fresh: e.status === 'NEW',
    }));

  // ── This week's live sessions ─────────────────────────────────────────
  const sessions = await getUpcomingSessions(supabase);

  return {
    firstName,
    isFresh: false,
    stats: {
      programmes: activeProgrammes.length,
      cohorts: activeCohorts.length,
      students: enrolledUserIds.size,
      enquiries: openEnquiries.length,
    },
    enquiries,
    behind,
    sessions,
    programmes: homeProgrammes,
    workspace: await getWorkspace(),
  };
}

// ── Live sessions: ONLINE_LIVE_SESSION activities, next 7 days ───────────
// scheduled_at is a UTC ISO timestamp in the activity payload, set at the
// programme-template level (so it's shared across a programme's cohorts) —
// hence labelled by programme, not cohort. RLS scopes the read to the
// tutor's own programmes. Day/time use the server clock (UTC on the
// Cloudflare runtime ≈ the GHA-core-audience zone); revisit for multi-TZ.
async function getUpcomingSessions(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<HomeSession[]> {
  const { data, error } = await supabase
    .from('nclex_programme_activities')
    .select(
      `activity_id, title, payload,
       nclex_programme_units!inner( nclex_programmes!inner( programme_id, title ) )`,
    )
    .eq('type', 'ONLINE_LIVE_SESSION');

  if (error || !data) return [];

  const now = new Date();
  const todayMid = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: HomeSession[] = [];

  for (const row of data as Array<{
    activity_id: string;
    title: string;
    payload: unknown;
    nclex_programme_units: unknown;
  }>) {
    const scheduledAt =
      payloadString(row.payload, 'scheduled_at');
    if (!scheduledAt) continue;
    const when = new Date(scheduledAt);
    const ms = when.getTime();
    if (Number.isNaN(ms) || ms < now.getTime()) continue; // past → skip

    const dayMid = Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate());
    const offset = Math.round((dayMid - todayMid) / DAY_MS);
    if (offset < 0 || offset > 6) continue; // outside the 7-day window

    const prog = programmeFromEmbed(row.nclex_programme_units);
    out.push({
      activityId: row.activity_id,
      title: row.title,
      programmeId: prog.programmeId,
      programme: prog.title,
      dayLabel: dayLabel(offset, when),
      timeLabel: timeLabel(when),
      offset,
    });
  }

  out.sort((a, b) => a.offset - b.offset || a.timeLabel.localeCompare(b.timeLabel));
  return out;
}

// ── Workspace counts (Bank / Quizzes / Library) ──────────────────────────
async function getWorkspace(): Promise<HomeWorkspace> {
  const supabase = await createClient();
  const [bankTotal, bankDrafts, quizzes, lib] = await Promise.all([
    supabase
      .from('nclex_tutor_questions')
      .select('item_id', { count: 'exact', head: true }),
    supabase
      .from('nclex_tutor_questions')
      .select('item_id', { count: 'exact', head: true })
      .eq('is_published', false),
    getMyQuizzes(),
    getLibraryOverviewStats(),
  ]);

  const bankCount = bankTotal.count ?? 0;
  const draftCount = bankDrafts.count ?? 0;
  const quizUnlinked = quizzes.filter((q) => q.used_in_programmes === 0).length;

  return {
    bank: {
      count: bankCount,
      unit: bankCount === 1 ? 'question' : 'questions',
      signal: draftCount > 0 ? `${draftCount} draft${draftCount === 1 ? '' : 's'}` : 'All published',
      loose: draftCount > 0,
    },
    quizzes: {
      count: quizzes.length,
      unit: quizzes.length === 1 ? 'quiz' : 'quizzes',
      signal: quizUnlinked > 0 ? `${quizUnlinked} not in a programme` : 'All in a programme',
      loose: quizUnlinked > 0,
    },
    library: {
      count: lib.total_notes,
      unit: lib.total_notes === 1 ? 'note' : 'notes',
      signal:
        lib.used_nowhere > 0
          ? `${lib.used_nowhere} used nowhere`
          : lib.drafts > 0
            ? `${lib.drafts} draft${lib.drafts === 1 ? '' : 's'}`
            : 'All in use',
      loose: lib.used_nowhere > 0 || lib.drafts > 0,
    },
  };
}

// ── helpers ──────────────────────────────────────────────────────────────

function payloadString(payload: unknown, key: string): string | null {
  if (payload && typeof payload === 'object') {
    const v = (payload as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

function programmeFromEmbed(unitsEmbed: unknown): { programmeId: string; title: string } {
  const unit = Array.isArray(unitsEmbed) ? unitsEmbed[0] : unitsEmbed;
  if (unit && typeof unit === 'object') {
    const prog = (unit as Record<string, unknown>).nclex_programmes;
    const p = Array.isArray(prog) ? prog[0] : prog;
    if (p && typeof p === 'object') {
      const rec = p as Record<string, unknown>;
      return {
        programmeId: typeof rec.programme_id === 'string' ? rec.programme_id : '',
        title: typeof rec.title === 'string' ? rec.title : 'Programme',
      };
    }
  }
  return { programmeId: '', title: 'Programme' };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayLabel(offset: number, when: Date): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return WEEKDAYS[when.getUTCDay()];
}

function timeLabel(when: Date): string {
  let h = when.getUTCHours();
  const m = when.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}
