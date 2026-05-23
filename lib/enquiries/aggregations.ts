// mynclex/lib/enquiries/aggregations.ts
//
// Pure derivation from an array of enquiries → KPI stats. The tutor V1
// "polished inbox" and the admin V1 "operations dashboard" both need
// aggregates (hot count, avg response time, conversion rate, channel mix,
// weekly sparklines, tutor SLA scoreboard). Doing this in TS instead of
// SQL means:
//   • One DB fetch per page (the existing getEnquiriesForProgramme /
//     admin service-role read) — no extra round trips.
//   • Easy to test (pure function over a typed array).
//   • Easy to evolve as the UI adds cards.
// At v1 volumes (10s of rows per tutor, 100s for admin) this is
// trivially fast; if it ever becomes a bottleneck we can push pieces
// down to SQL without changing the call sites' shape.
//
// `now` is injected for determinism in tests. Defaults to `new Date()`.

import type { ContactChannel } from '@/lib/discovery/contact-options';
import { urgencyTier } from './format';
import type { Enquiry, EnquiryStatus } from './types';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

const ALL_CHANNELS: ContactChannel[] = ['WHATSAPP', 'CALL', 'SMS', 'EMAIL'];

function emptyChannelMix(): Record<ContactChannel, number> {
  return { WHATSAPP: 0, CALL: 0, SMS: 0, EMAIL: 0 };
}

function avgOrNull(samples: number[]): number | null {
  if (samples.length === 0) return null;
  let sum = 0;
  for (const s of samples) sum += s;
  return Math.round(sum / samples.length);
}

// ─────────────────────────────────────────────────────────────────
// Tutor V1 — KPI strip for /tutor/programme/<id>/enquiries
// ─────────────────────────────────────────────────────────────────

export type TutorEnquiryStats = {
  // Count of leads in the "hot" urgency tier (NEW or CONTACTED, < 4h old).
  // Drives the red "Needs reply now" KPI card.
  hotCount: number;
  // Open queue breakdown — both for the "Open" KPI card sub-line.
  open: { new: number; contacted: number; total: number };
  // Average seconds from created_at → contacted_at for CONTACTED + CONVERTED
  // rows received in the LAST 30 DAYS. null when there are no qualifying
  // rows yet. Compared against the previous 30-day window for the delta.
  avgResponseSec: number | null;
  avgResponsePrevSec: number | null;
  // Conversions in the current calendar month + conversion rate over the
  // last 30 days (CONVERTED / total received in that window).
  convertedThisMonth: number;
  conversionRate30d: number | null;
  // Single most-frequent channel across every preferred_contact array;
  // ties broken by the canonical order (WhatsApp, Call, SMS, Email).
  topChannel: ContactChannel | null;
  channelMix: Record<ContactChannel, number>;
};

export function computeTutorStats(
  enquiries: Enquiry[],
  now: Date = new Date(),
): TutorEnquiryStats {
  const nowMs = now.getTime();
  const thirtyDaysAgo = nowMs - 30 * MS_PER_DAY;
  const sixtyDaysAgo = nowMs - 60 * MS_PER_DAY;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let hotCount = 0;
  let nNew = 0;
  let nContacted = 0;
  let convertedThisMonth = 0;
  const channelMix = emptyChannelMix();

  const respCurr: number[] = []; // seconds, last 30d
  const respPrev: number[] = []; // seconds, prior 30d
  let receivedLast30d = 0;
  let convertedLast30d = 0;

  for (const e of enquiries) {
    const createdMs = new Date(e.created_at).getTime();

    if (e.status === 'NEW') nNew++;
    else if (e.status === 'CONTACTED') nContacted++;

    if (urgencyTier(e.created_at, e.status) === 'hot') hotCount++;

    // Channel mix — every channel ticked counts once. `topChannel` reads
    // the mix; tie-break by canonical order via ALL_CHANNELS iteration.
    for (const ch of e.preferred_contact) channelMix[ch] += 1;

    // Conversions this calendar month — uses updated_at as a proxy for
    // when the row became CONVERTED (the auto-stamp trigger updates
    // updated_at to NOW()). created_at would mis-attribute a lead that
    // arrived last month but converted this month.
    if (e.status === 'CONVERTED') {
      const updatedMs = new Date(e.updated_at).getTime();
      if (updatedMs >= monthStart) convertedThisMonth++;
    }

    // 30-day windows for avg-response + conversion-rate.
    if (createdMs >= thirtyDaysAgo) {
      receivedLast30d++;
      if (e.status === 'CONVERTED') convertedLast30d++;
    }

    if (e.contacted_at) {
      const contactedMs = new Date(e.contacted_at).getTime();
      const diffSec = Math.max(0, Math.round((contactedMs - createdMs) / 1000));
      if (createdMs >= thirtyDaysAgo) respCurr.push(diffSec);
      else if (createdMs >= sixtyDaysAgo) respPrev.push(diffSec);
    }
  }

  // Top channel — highest count, ties broken by canonical order.
  let topChannel: ContactChannel | null = null;
  let topCount = 0;
  for (const ch of ALL_CHANNELS) {
    if (channelMix[ch] > topCount) {
      topCount = channelMix[ch];
      topChannel = ch;
    }
  }

  return {
    hotCount,
    open: { new: nNew, contacted: nContacted, total: nNew + nContacted },
    avgResponseSec: avgOrNull(respCurr),
    avgResponsePrevSec: avgOrNull(respPrev),
    convertedThisMonth,
    conversionRate30d:
      receivedLast30d === 0 ? null : convertedLast30d / receivedLast30d,
    topChannel,
    channelMix,
  };
}

// ─────────────────────────────────────────────────────────────────
// Admin V1 — Operations dashboard for /admin/enquiries
// ─────────────────────────────────────────────────────────────────

// One row of the tutor SLA scoreboard.
export type TutorScoreRow = {
  tutorName: string;
  volume: number;
  open: number;
  oldestOpenHours: number | null;
  avgReplySec: number | null;
  conversionRate: number | null;
  slaTier: 'good' | 'warn' | 'bad' | 'na';
};

export type AdminEnquiryStats = {
  kpis: {
    volumeThisWeek: number;
    volumeLastWeek: number;
    // 8 most recent week buckets (oldest → newest). Drives the sparkline.
    weeklySpark: number[];
    // Open NEW + CONTACTED that are 'hot' tier right now.
    hotWaiting: number;
    // NEW leads older than 24h — the SLA "breach" flag in the KPI card.
    breach24hCount: number;
    avgFirstResponseSec: number | null;
    avgFirstResponsePrevSec: number | null;
    conversionRate: number | null;
    conversionRatePrev: number | null;
  };
  tutorRows: TutorScoreRow[];
  channelMix: Record<ContactChannel, number>;
};

// Tutor row + minimal embed for the admin page. Mirrors the shape the
// admin board already uses; aggregations re-use it so the page can pass
// its existing rows in without reshape.
export type AdminAggregationRow = {
  status: EnquiryStatus;
  created_at: string;
  contacted_at: string | null;
  updated_at?: string;
  preferred_contact: ContactChannel[];
  tutor_name: string | null;
};

// SLA tiering — same thresholds as the design handoff.
//   <4h  → good, <12h → warn, ≥12h → bad. null avg = na.
function slaTierFromAvgSec(avgSec: number | null): TutorScoreRow['slaTier'] {
  if (avgSec == null) return 'na';
  const h = avgSec / 3600;
  if (h < 4) return 'good';
  if (h < 12) return 'warn';
  return 'bad';
}

// Buckets a list of timestamps into N consecutive week-long windows ending
// at `now`. Returns counts ordered oldest → newest. Used for the KPI
// sparkline (default N=8 — eight weeks of trend).
function weeklyBuckets(rows: AdminAggregationRow[], now: Date, n: number): number[] {
  const buckets = new Array<number>(n).fill(0);
  const nowMs = now.getTime();
  const windowMs = n * MS_PER_WEEK;
  for (const r of rows) {
    const ms = new Date(r.created_at).getTime();
    const ageMs = nowMs - ms;
    if (ageMs < 0 || ageMs >= windowMs) continue;
    const idx = n - 1 - Math.floor(ageMs / MS_PER_WEEK);
    if (idx >= 0 && idx < n) buckets[idx] += 1;
  }
  return buckets;
}

export function computeAdminStats(
  rows: AdminAggregationRow[],
  now: Date = new Date(),
): AdminEnquiryStats {
  const nowMs = now.getTime();
  const thisWeekStart = nowMs - MS_PER_WEEK;
  const lastWeekStart = nowMs - 2 * MS_PER_WEEK;
  const thirtyDaysAgo = nowMs - 30 * MS_PER_DAY;
  const sixtyDaysAgo = nowMs - 60 * MS_PER_DAY;

  let volumeThisWeek = 0;
  let volumeLastWeek = 0;
  let hotWaiting = 0;
  let breach24hCount = 0;

  const respCurr: number[] = [];
  const respPrev: number[] = [];
  let receivedLast30d = 0;
  let convertedLast30d = 0;
  let receivedPrev30d = 0;
  let convertedPrev30d = 0;

  const channelMix = emptyChannelMix();

  // Tutor groupings.
  type TutorAccumulator = {
    name: string;
    volume: number;
    open: number;
    oldestOpenMs: number | null;
    respSamples: number[];
    received: number;
    converted: number;
  };
  const byTutor = new Map<string, TutorAccumulator>();
  const ensureTutor = (name: string): TutorAccumulator => {
    let acc = byTutor.get(name);
    if (!acc) {
      acc = {
        name,
        volume: 0,
        open: 0,
        oldestOpenMs: null,
        respSamples: [],
        received: 0,
        converted: 0,
      };
      byTutor.set(name, acc);
    }
    return acc;
  };

  for (const r of rows) {
    const createdMs = new Date(r.created_at).getTime();
    const ageHours = (nowMs - createdMs) / MS_PER_HOUR;

    if (createdMs >= thisWeekStart) volumeThisWeek++;
    else if (createdMs >= lastWeekStart) volumeLastWeek++;

    if (urgencyTier(r.created_at, r.status) === 'hot') hotWaiting++;
    if (r.status === 'NEW' && ageHours >= 24) breach24hCount++;

    for (const ch of r.preferred_contact) channelMix[ch] += 1;

    if (createdMs >= thirtyDaysAgo) {
      receivedLast30d++;
      if (r.status === 'CONVERTED') convertedLast30d++;
    } else if (createdMs >= sixtyDaysAgo) {
      receivedPrev30d++;
      if (r.status === 'CONVERTED') convertedPrev30d++;
    }

    if (r.contacted_at) {
      const contactedMs = new Date(r.contacted_at).getTime();
      const diffSec = Math.max(0, Math.round((contactedMs - createdMs) / 1000));
      if (createdMs >= thirtyDaysAgo) respCurr.push(diffSec);
      else if (createdMs >= sixtyDaysAgo) respPrev.push(diffSec);
    }

    // Per-tutor accumulation. Rows without a tutor_name (orphan / deleted
    // user) are bucketed under '—' so they're still surfaced.
    const acc = ensureTutor(r.tutor_name ?? '—');
    acc.volume++;
    if (r.status === 'NEW' || r.status === 'CONTACTED') {
      acc.open++;
      if (acc.oldestOpenMs == null || createdMs < acc.oldestOpenMs) {
        acc.oldestOpenMs = createdMs;
      }
    }
    if (r.contacted_at) {
      const contactedMs = new Date(r.contacted_at).getTime();
      acc.respSamples.push(Math.max(0, Math.round((contactedMs - createdMs) / 1000)));
    }
    if (createdMs >= thirtyDaysAgo) {
      acc.received++;
      if (r.status === 'CONVERTED') acc.converted++;
    }
  }

  const tutorRows: TutorScoreRow[] = Array.from(byTutor.values())
    .map((acc) => {
      const avgReplySec = avgOrNull(acc.respSamples);
      return {
        tutorName: acc.name,
        volume: acc.volume,
        open: acc.open,
        oldestOpenHours:
          acc.oldestOpenMs == null
            ? null
            : Math.round((nowMs - acc.oldestOpenMs) / MS_PER_HOUR),
        avgReplySec,
        conversionRate: acc.received === 0 ? null : acc.converted / acc.received,
        slaTier: slaTierFromAvgSec(avgReplySec),
      };
    })
    // Tutors with open work first (oldest first), then by volume desc as
    // tiebreaker, then alphabetical. Surfaces "who needs my attention now".
    .sort((a, b) => {
      if (a.open !== b.open) return b.open - a.open;
      if (a.volume !== b.volume) return b.volume - a.volume;
      return a.tutorName.localeCompare(b.tutorName);
    });

  return {
    kpis: {
      volumeThisWeek,
      volumeLastWeek,
      weeklySpark: weeklyBuckets(rows, now, 8),
      hotWaiting,
      breach24hCount,
      avgFirstResponseSec: avgOrNull(respCurr),
      avgFirstResponsePrevSec: avgOrNull(respPrev),
      conversionRate:
        receivedLast30d === 0 ? null : convertedLast30d / receivedLast30d,
      conversionRatePrev:
        receivedPrev30d === 0 ? null : convertedPrev30d / receivedPrev30d,
    },
    tutorRows,
    channelMix,
  };
}
