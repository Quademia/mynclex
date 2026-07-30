// mynclex/lib/practice/report/derive.ts
//
// Every number the Session Report shows, derived from the attempt's frozen
// snapshot. Pure — no I/O — so each reading can be tested against a fixture
// instead of against the database.
//
// The rule running through all of it: NEVER re-score. `score_awarded` and
// `is_correct` are written by the submit RPC and are the grade; this file
// only counts and splits them. A report that recomputed the grade could
// disagree with the runner, the History row and the dashboard, and there
// would be no way to tell which was right.

import type { FilterPayload } from '@/lib/practice/builder/types';
import type { QuestionOutcome, ReportQuestion } from './types';

/** Statuses that mean the student really answered. DRAFT does NOT — merely
 *  opening a question writes one, so counting drafts as answers would call
 *  every question the student glanced at "attempted". */
const ANSWERED_STATUSES = new Set(['SUBMITTED', 'AUTO_SUBMITTED']);

export function isAnswered(q: ReportQuestion): boolean {
  return q.submissionStatus != null && ANSWERED_STATUSES.has(q.submissionStatus);
}

/**
 * How one question turned out.
 *
 * `marks` is the question's MAX partial-credit score (5 for a 5-row matrix,
 * 1 for an MCQ), so "fully correct" is score === marks rather than score > 0
 * — a 3-of-4 SATA feeds the percentage but is not a question the student
 * landed, and conflating the two is what makes a report flatter than the
 * truth.
 */
export function questionOutcome(q: ReportQuestion): QuestionOutcome {
  if (!isAnswered(q)) return 'NOT_ANSWERED';
  const score = q.scoreAwarded ?? 0;
  if (q.marks > 0 && score >= q.marks) return 'FULL';
  if (score > 0) return 'PARTIAL';
  return 'NONE';
}

export interface OutcomeCounts {
  full: number;
  partial: number;
  /** Answered and scored zero. */
  none: number;
  /** Never submitted — skipped or never reached. */
  notAnswered: number;
  /** What the summary card calls "All wrong or skipped". */
  wrongOrSkipped: number;
  total: number;
  answered: number;
}

export function outcomeCounts(questions: readonly ReportQuestion[]): OutcomeCounts {
  let full = 0, partial = 0, none = 0, notAnswered = 0;
  for (const q of questions) {
    switch (questionOutcome(q)) {
      case 'FULL': full++; break;
      case 'PARTIAL': partial++; break;
      case 'NONE': none++; break;
      case 'NOT_ANSWERED': notAnswered++; break;
    }
  }
  return {
    full,
    partial,
    none,
    notAnswered,
    wrongOrSkipped: none + notAnswered,
    total: questions.length,
    answered: full + partial + none,
  };
}

export interface AnswerPoints {
  earned: number;
  total: number;
}

/**
 * The scoreable-points total: "41 of 52".
 *
 * Counts marks, not questions, which is why it differs from the percentage
 * above it — a 13-mark bow-tie weighs thirteen times an MCQ here and once in
 * the item-equivalent average. Both readings are on the page on purpose; the
 * page says which is which.
 */
export function answerPoints(questions: readonly ReportQuestion[]): AnswerPoints {
  let earned = 0, total = 0;
  for (const q of questions) {
    total += q.marks;
    earned += q.scoreAwarded ?? 0;
  }
  return { earned, total };
}

/**
 * Total engaged time, preferring the attempt-level figure and falling back to
 * the sum of per-question times.
 *
 * Null when nothing was recorded — and that is the important case, not an
 * edge one. Per-question timing arrived late: on dev it exists for about half
 * of all answers and the attempt-level total for 2 of 33 finished practice
 * sittings. Rendering "0m" would tell a student they finished twenty
 * questions instantly, so the caller drops the fact instead.
 */
export function totalEngagedSeconds(
  attemptLevel: number | null,
  questions: readonly ReportQuestion[],
): number | null {
  if (attemptLevel != null && attemptLevel > 0) return attemptLevel;
  let sum = 0, seen = 0;
  for (const q of questions) {
    if (q.timeSpentSec != null && q.timeSpentSec > 0) {
      sum += q.timeSpentSec;
      seen++;
    }
  }
  return seen > 0 ? sum : null;
}

/**
 * Average seconds per ANSWERED question.
 *
 * Divided by answered rather than by total: a student who answered 8 of 25
 * did not spend their time on 25 questions, and dividing by 25 would report
 * a pace three times faster than the one they actually worked at.
 */
export function paceSeconds(
  engagedSeconds: number | null,
  answered: number,
): number | null {
  if (engagedSeconds == null || answered <= 0) return null;
  return Math.round(engagedSeconds / answered);
}

/** How many answers were changed before submitting, and how many of those
 *  changes moved away from the right answer — the one reading on this page
 *  that no other surface offers. */
export interface ChangeSummary {
  changed: number;
  total: number;
}

export function changeSummary(questions: readonly ReportQuestion[]): ChangeSummary {
  let changed = 0;
  for (const q of questions) if (q.answerChanges > 0) changed++;
  return { changed, total: questions.length };
}

/**
 * ⭐ How many times the student CHANGED THEIR MIND on one question.
 *
 * `answer_changes_json` is an append-only log of every edit, and counting its
 * length — the obvious implementation — is wrong in a way that looks right.
 * Inspected against real rows: the first entry is always `from: null` (the
 * initial answer, not a change), and BUILDING UP a multi-slot answer appends
 * one entry per slot. A four-row matrix answered straightforwardly logs four
 * entries; a SATA where the student ticks three boxes logs three. Reporting
 * that as "you changed your mind four times" would be nonsense, and nothing
 * in the data would flag it.
 *
 * A real change is a REPLACEMENT or a REMOVAL:
 *   • object answers (matrix, cloze, drag) — a key present in both `from` and
 *     `to` whose value differs
 *   • array answers (SATA, select-N, highlight) — an element in `from` that
 *     is gone from `to` (a deselection). Growth alone is composition.
 *   • scalar answers (MCQ, T/F) — a different value
 *
 * Additive edits are how a multi-part answer gets built, so they are not
 * changes of mind however many there are.
 */
export function countMindChanges(log: unknown): number {
  if (!Array.isArray(log)) return 0;
  let changes = 0;

  for (const entry of log) {
    if (!entry || typeof entry !== 'object') continue;
    const { from, to } = entry as { from?: unknown; to?: unknown };
    if (from == null) continue; // the first answer is not a change

    if (Array.isArray(from) && Array.isArray(to)) {
      const kept = new Set(to.map((v) => JSON.stringify(v)));
      if (from.some((v) => !kept.has(JSON.stringify(v)))) changes++;
      continue;
    }

    if (typeof from === 'object' && typeof to === 'object' && to !== null) {
      const before = from as Record<string, unknown>;
      const after = to as Record<string, unknown>;
      const replaced = Object.keys(before).some(
        (k) => k in after && JSON.stringify(after[k]) !== JSON.stringify(before[k]),
      );
      // A key present before and absent after is a removal, which is also a
      // change — not just a value swap.
      const removed = Object.keys(before).some((k) => !(k in after));
      if (replaced || removed) changes++;
      continue;
    }

    if (JSON.stringify(from) !== JSON.stringify(to)) changes++;
  }

  return changes;
}

/** "You landed 15 of 25." Factual, and nothing else.
 *
 *  An earlier design draft continued "— pharmacology is where this session
 *  went", and compared the sitting to the student's recent average. Both were
 *  cut: naming the story of a sitting off seven questions is exactly the
 *  over-claim the page's own small-sample caveat warns about, and a
 *  cross-sitting comparison belongs on the analytics surface. The fix list
 *  makes the suggestion; the headline states the fact. */
export function landedLine(counts: OutcomeCounts): string {
  return `You landed ${counts.full} of ${counts.total}.`;
}

/**
 * "Build the same again" → the Builder, pre-seeded with this sitting's
 * content filters.
 *
 * Reuses the deep-link convention the readiness report already established
 * (`?cnc=&subcat=&body=&diff=`, extended here to the remaining content axes),
 * rather than inventing a second way to pre-seed the Builder.
 *
 * ⭐ POOLS ARE DELIBERATELY NOT CARRIED. The builder page's own comment says
 * why: pools stay UNSEEN so practice serves FRESH questions. Re-running the
 * identical 25 items would be a memory test, not practice — and if a student
 * does want the same questions, that is what Review is for.
 */
export function rebuildHref(filters: FilterPayload): string {
  const params = new URLSearchParams();
  const add = (key: string, values: string[] | undefined) => {
    for (const v of values ?? []) params.append(key, v);
  };

  add('cnc', filters.client_needs_category);
  add('subcat', filters.client_needs_subcategory);
  add('body', filters.body_system);
  add('diff', filters.difficulty);
  add('subject', filters.nursing_subject);
  add('topic', filters.topic);
  add('subtopic', filters.subtopic);
  add('tag', filters.tags);
  add('qtype', filters.question_type);

  const qs = params.toString();
  return qs ? `/student/bank/practice?${qs}` : '/student/bank/practice';
}

/** True when this sitting carried any content filter at all — i.e. when
 *  "Build the same again" would reproduce something more specific than "the
 *  whole bank". A filterless build has nothing to reproduce, so the caller
 *  offers a plain "Build another" instead of promising sameness. */
export function hasRebuildableFilters(filters: FilterPayload): boolean {
  return rebuildHref(filters).includes('?');
}
