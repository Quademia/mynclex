// mynclex/lib/home/student/bank/recent.ts
//
// Card 7 — the last three things the student did, and how each one's
// result is allowed to be described.
//
// Three sources, three different kinds of result, and getting any of
// them wrong puts a word on the dashboard that the surface it links to
// will contradict:
//
//   • a practice quiz  → a percentage, in NEUTRAL styling. A practice
//     set has no pass mark, so colouring a low score red invents a
//     verdict. (The design showed "55%" in fail-red.)
//   • a readiness pack → the BAND WORD it actually earned — Building /
//     Approaching / Ready / Excelling. Our packs have no pass/fail at
//     all, so the design's green "Passed" pill is a word the student
//     has never seen on their own pack report.
//   • a CAT            → the verdict, which is BINARY (above or below
//     standard; there is no "At"), routed through the shared
//     isUnmeasured() so a sitting that ran out of time under the
//     item minimum reads the same here as it does on the report and
//     on the CAT home.

import { describeOutcome } from '@/lib/practice/history/derive';
import type { HistoryAttempt } from '@/lib/practice/history/types';
import type { RecentBadgeTone, RecentItem } from './types';

/** How many rows the rail shows. */
export const RECENT_LIMIT = 3;

function badgeFor(
  row: HistoryAttempt,
): { label: string; tone: RecentBadgeTone } | null {
  // State before result. An unfinished sitting has no score to show,
  // and leaving the pill off entirely makes the row look broken —
  // "In progress" is both true and the thing the student wants to know.
  if (row.status === 'IN_PROGRESS') return { label: 'In progress', tone: 'neutral' };
  if (row.status === 'ABANDONED') return { label: 'Abandoned', tone: 'neutral' };

  // The three per-kind result rules (CAT verdict · pack band · practice
  // percentage, and never a percentage on a CAT) now live in one shared
  // place, because the History page was applying different ones — it
  // printed a raw percentage for everything. Moved out rather than
  // copied: two surfaces describing the same sitting must not be able
  // to disagree. No answer counts are passed, so no "Not answered"
  // state here — that needs a per-attempt read the rail doesn't do.
  return describeOutcome(row);
}

function iconFor(row: HistoryAttempt): string {
  if (row.mode === 'CAT') return '🧠';
  if (row.source === 'READINESS_PACK') return '🎯';
  return '📝';
}

function titleFor(row: HistoryAttempt): string {
  if (row.mode === 'CAT') return 'CAT sitting';
  if (row.source === 'READINESS_PACK') return 'Readiness pack';
  // Mode-only, for the same reason as the resume banner: a filter-built
  // quiz has no single subject to name.
  return row.mode_label;
}

function hrefFor(row: HistoryAttempt): string | null {
  if (row.mode === 'CAT') return `/student/bank/cat/result/${row.attempt_id}`;
  if (row.source === 'READINESS_PACK') return `/student/bank/packs/report/${row.attempt_id}`;
  // A finished practice quiz has no standalone report surface today —
  // History is where it is reviewed.
  return '/student/bank/history';
}

/**
 * @param whenLabel injected so the caller owns relative-time
 *   formatting (and so this stays pure and testable).
 */
export function recentItems(
  rows: HistoryAttempt[],
  whenLabel: (iso: string) => string,
  limit = RECENT_LIMIT,
): RecentItem[] {
  return rows.slice(0, limit).map((row) => {
    const count =
      row.mode === 'CAT' ? row.cat_items_administered ?? row.requested_count : row.requested_count;
    return {
      key: row.attempt_id,
      icon: iconFor(row),
      title: titleFor(row),
      meta: `${whenLabel(row.created_at)} · ${count} ${row.mode === 'CAT' ? 'items' : 'Q'}`,
      badge: badgeFor(row),
      href: hrefFor(row),
    };
  });
}
