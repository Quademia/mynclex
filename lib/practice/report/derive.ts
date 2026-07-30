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

import { pointsDetail } from '@/lib/scoring/detail';
import { displayBand } from '@/lib/bank/difficulty';
import { richTextToPlain } from '@/lib/authoring/rich-doc';
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
  for (const q of questions) if (countMindChanges(q.changeLog) > 0) changed++;
  return { changed, total: questions.length };
}

// ── The per-question table ────────────────────────────────────

export interface QuestionRow {
  position: number;
  /** Plain text, whatever the stem was stored as. */
  stem: string;
  subject: string | null;
  outcome: QuestionOutcome;
  timeSpentSec: number | null;
  changes: number;
  /** Where this question opens for review. */
  href: string;
}

/**
 * The rows of "Every question", in the order they were sat.
 *
 * ⚠ Stems must go through richTextToPlain. The bank's authoring surface went
 * rich, so a stem snapshot is EITHER plain text OR a Tiptap JSON document —
 * measured on dev: 139 of 1,853 item snapshots (7.5%) are JSON. Rendering the
 * column value directly would print `{"type":"doc",…}` into the table for one
 * row in thirteen. That helper exists for exactly this and is deliberately
 * free of any @tiptap import, so it is safe in server code.
 *
 * Only DISPLAY data is returned. The frozen answer keys stay behind, so the
 * client table can render without them ever entering the browser bundle.
 */
export function questionRows(
  questions: readonly ReportQuestion[],
  attemptId: string,
): QuestionRow[] {
  return questions.map((q) => ({
    position: q.position,
    stem: richTextToPlain(q.stem).trim(),
    subject: (q.classification.nursing_subject as string | null) ?? null,
    outcome: questionOutcome(q),
    timeSpentSec: q.timeSpentSec,
    changes: countMindChanges(q.changeLog),
    // The runner opens at the attempt; there is no per-question deep link
    // yet (the same gap the case bank recorded). One destination for every
    // row is honest; a link that silently lands elsewhere is not.
    href: `/session/${attemptId}`,
  }));
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
function isRealChange(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const { from, to } = entry as { from?: unknown; to?: unknown };
  if (from == null) return false; // the first answer is not a change

  if (Array.isArray(from) && Array.isArray(to)) {
    const kept = new Set(to.map((v) => JSON.stringify(v)));
    return from.some((v) => !kept.has(JSON.stringify(v)));
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
    return replaced || removed;
  }

  return JSON.stringify(from) !== JSON.stringify(to);
}

export function countMindChanges(log: unknown): number {
  if (!Array.isArray(log)) return 0;
  return log.filter(isRealChange).length;
}

/** How many correct answer-slots a given answer shape would have found.
 *  Null when the shape can't be read, so the caller declines to judge rather
 *  than guessing a direction. */
function foundFor(q: ReportQuestion, answer: unknown): number | null {
  if (!q.correct) return null;
  const detail = pointsDetail(
    q.questionType as Parameters<typeof pointsDetail>[0],
    q.correct as Parameters<typeof pointsDetail>[1],
    (answer ?? null) as Parameters<typeof pointsDetail>[2],
  );
  return detail ? detail.found : null;
}

export interface ChangeReading {
  /** Questions whose answer was genuinely changed at least once. */
  changed: number;
  /** Of those, the ones where a change moved AWAY from the right answer. */
  costly: number;
}

/**
 * ⭐ "4 answers changed — 3 of them away from the right answer."
 *
 * The one reading on this page no other surface offers, and the only reason
 * it's possible is that the edit log stores the answer BEFORE and AFTER each
 * edit. Scoring both through the shared pointsDetail() says which direction
 * the student moved: fewer correct slots after than before means that change
 * cost them.
 *
 * Counts QUESTIONS, not edits — "4 answers changed" means four questions, so
 * a student who dithered five times on one question is one changed answer,
 * not five.
 *
 * Declines to judge when a shape can't be read: a question with an
 * unparseable key contributes to `changed` but never to `costly`, because
 * asserting a direction we cannot compute would be worse than saying less.
 */
export function changesAgainstYou(questions: readonly ReportQuestion[]): ChangeReading {
  let changed = 0;
  let costly = 0;

  for (const q of questions) {
    const log = Array.isArray(q.changeLog) ? q.changeLog : [];
    let qChanged = 0;
    let qCostly = 0;

    for (const entry of log) {
      if (!isRealChange(entry)) continue;
      qChanged++;
      const { from, to } = entry as { from?: unknown; to?: unknown };
      const before = foundFor(q, from);
      const after = foundFor(q, to);
      if (before != null && after != null && after < before) qCostly++;
    }

    if (qChanged > 0) changed++;
    if (qCostly > 0) costly++;
  }

  return { changed, costly };
}

// ── Answer points: found / missed / wrong-picked ──────────────

export interface PointsSplit {
  found: number;
  missed: number;
  wrongPicked: number;
  max: number;
  /** Questions whose key or answer couldn't be read, so they contributed
   *  their stored score instead of a split. Surfaced so a partial reading is
   *  never presented as a complete one. */
  unreadable: number;
}

/**
 * The finer split behind "41 of 52": how many correct answer-slots the
 * student found, how many they missed, and how many wrong options they
 * picked.
 *
 * Reuses `pointsDetail` from lib/scoring — written for the readiness report,
 * and NOT a re-score: it derives the split from the frozen key and answer
 * while the grade stays whatever the submit RPC wrote. Sharing it means the
 * two reports cannot describe one answer two ways.
 *
 * When it can't read a shape it returns null; that question then contributes
 * its stored `score_awarded` as `found`, and is counted in `unreadable` so
 * the caller can stay honest about the gap.
 */
export function pointsSplit(questions: readonly ReportQuestion[]): PointsSplit {
  let found = 0, missed = 0, wrongPicked = 0, max = 0, unreadable = 0;

  for (const q of questions) {
    max += q.marks;
    const detail = q.correct
      ? pointsDetail(
          q.questionType as Parameters<typeof pointsDetail>[0],
          q.correct as Parameters<typeof pointsDetail>[1],
          (q.answer ?? null) as Parameters<typeof pointsDetail>[2],
        )
      : null;

    if (!detail) {
      unreadable++;
      const scored = q.scoreAwarded ?? 0;
      found += scored;
      missed += Math.max(0, q.marks - scored);
      continue;
    }

    found += detail.found;
    missed += detail.missed;
    wrongPicked += detail.wrongPicked;
  }

  return { found, missed, wrongPicked, max, unreadable };
}

// ── Where you slipped: per-axis breakdown ─────────────────────

export type AxisKey = 'client_needs' | 'subject' | 'difficulty' | 'question_type';

export const AXIS_LABEL: Record<AxisKey, string> = {
  client_needs: 'Client needs',
  subject: 'Subject',
  difficulty: 'Difficulty',
  question_type: 'Question type',
};

/** Tab order, and therefore which axis opens by default — the first with any
 *  rows. Exported so the rail's jump list and the switcher itself agree on
 *  which axis the student will land on; two copies of this order would let the
 *  rail advertise a count from a different pane. */
export const AXIS_ORDER: readonly AxisKey[] = [
  'client_needs',
  'subject',
  'difficulty',
  'question_type',
];

/** How many rows the switcher will show when it opens. */
export function defaultAxisRowCount(axes: Record<AxisKey, AxisRow[]>): number {
  const first = AXIS_ORDER.find((a) => axes[a].length > 0);
  return first ? axes[first].length : 0;
}

export interface AxisRow {
  value: string;
  /** Questions fully landed. */
  full: number;
  /** Questions in this sitting carrying this value. */
  total: number;
  /** 0–100. */
  pct: number;
}

/**
 * The value a question carries on one axis.
 *
 * ⚠ Difficulty is the awkward one. The snapshot freezes `difficulty_irt` —
 * the measured NUMBER — not the curator's word, which is the whole point of
 * slice 10d: the word goes stale when recalibration moves the number, so the
 * shown band is derived from the number instead. Looking for a `difficulty`
 * key here would find nothing at all and the axis would render empty.
 */
function axisValue(q: ReportQuestion, axis: AxisKey): string | null {
  switch (axis) {
    case 'client_needs':
      return (q.classification.client_needs_category as string | null) ?? null;
    case 'subject':
      return (q.classification.nursing_subject as string | null) ?? null;
    case 'question_type':
      return q.questionType || null;
    case 'difficulty':
      return displayBand(q.difficultyIrt);
  }
}

/**
 * Per-value performance on one axis, WEAKEST FIRST.
 *
 * Ties break on the larger sample, so "2 of 7" is listed above "0 of 1" —
 * both are 0–29%, but one is worth acting on and the other is noise. The
 * page carries the small-sample caveat for the same reason: with 25
 * questions spread over five categories, these are pointers, not
 * measurements, and the design's own wording says so.
 */
export function axisRows(
  questions: readonly ReportQuestion[],
  axis: AxisKey,
): AxisRow[] {
  const buckets = new Map<string, { full: number; total: number }>();

  for (const q of questions) {
    const value = axisValue(q, axis);
    if (!value) continue;
    const b = buckets.get(value) ?? { full: 0, total: 0 };
    b.total++;
    if (questionOutcome(q) === 'FULL') b.full++;
    buckets.set(value, b);
  }

  return [...buckets.entries()]
    .map(([value, b]) => ({
      value,
      full: b.full,
      total: b.total,
      pct: b.total > 0 ? Math.round((b.full / b.total) * 100) : 0,
    }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total || a.value.localeCompare(b.value));
}

export function allAxisRows(
  questions: readonly ReportQuestion[],
): Record<AxisKey, AxisRow[]> {
  return {
    client_needs: axisRows(questions, 'client_needs'),
    subject: axisRows(questions, 'subject'),
    difficulty: axisRows(questions, 'difficulty'),
    question_type: axisRows(questions, 'question_type'),
  };
}

// ── The fix list ──────────────────────────────────────────────

export interface FixItem {
  /** Short kind, for the eyebrow. */
  kind: string;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
}

/** Below this, a bucket is one or two questions and its percentage means
 *  nothing — recommending study off it would be inventing a weakness. */
const MIN_SAMPLE_FOR_ADVICE = 3;

/**
 * Up to three things worth doing next, in the order worth doing them.
 *
 * Each build action goes to the Builder pre-seeded with CONTENT filters only,
 * via the same deep link the readiness report uses — so the questions served
 * are fresh, per the builder's own rule.
 *
 * ⚠ The design's third item ("3 questions you marked") is deliberately absent:
 * nothing in the product writes a mark. `nclex_question_marks` has zero rows
 * and no write path exists anywhere in the codebase, so the card would be
 * permanently empty. It returns when marking is built.
 *
 * Also absent, and worth a decision rather than a silent workaround: a
 * "re-quiz what you got wrong" action. The Builder HAS an INCORRECT pool
 * chip, but its deep-link prefill deliberately honours content axes only and
 * forces the pool to UNSEEN. Bending that here would contradict a considered
 * rule from one call site.
 */
export function fixList(
  questions: readonly ReportQuestion[],
  attemptId: string,
): FixItem[] {
  const counts = outcomeCounts(questions);

  // 1–2 · the weakest content axes with a sample worth acting on. Subject and
  // client-needs are both offered because a student thinks in subjects while
  // the exam blueprint is written in client needs.
  //
  // ⭐ SORTED BY HOW WEAK THEY ARE, not by which axis they came from. Seen
  // live on a real report: a 75% subject was listed as item 1 above a 0%
  // category as item 2, under the words "in that order" — the numbering IS
  // the recommendation, so a fixed axis precedence gets it exactly backwards
  // whenever the second axis is the worse one.
  const weakSubject = axisRows(questions, 'subject').find(
    (r) => r.total >= MIN_SAMPLE_FOR_ADVICE && r.pct < 100,
  );
  const weakCnc = axisRows(questions, 'client_needs').find(
    (r) => r.total >= MIN_SAMPLE_FOR_ADVICE && r.pct < 100,
  );

  const axisCandidates: Array<{ pct: number; item: FixItem }> = [];
  if (weakSubject) {
    axisCandidates.push({
      pct: weakSubject.pct,
      item: {
        kind: 'Weakest subject',
        title: weakSubject.value,
        detail: `${weakSubject.full} of ${weakSubject.total} landed — the subject with most room in this build.`,
        actionLabel: 'Build more of this',
        href: rebuildHref({ nursing_subject: [weakSubject.value] }),
      },
    });
  }
  if (weakCnc) {
    axisCandidates.push({
      pct: weakCnc.pct,
      item: {
        kind: 'Weakest category',
        title: weakCnc.value,
        detail: `${weakCnc.full} of ${weakCnc.total} landed. This is an exam blueprint category, so it is worth balancing.`,
        actionLabel: 'Build more of this',
        href: rebuildHref({ client_needs_category: [weakCnc.value] }),
      },
    });
  }

  const items: FixItem[] = axisCandidates
    .sort((a, b) => a.pct - b.pct)
    .map((c) => c.item);

  // 3 · unanswered questions are the cheapest thing to fix, and they need no
  // new build at all — they are already sitting in this attempt.
  if (counts.notAnswered > 0) {
    items.push({
      kind: 'Left blank',
      title: `${counts.notAnswered} you didn't answer`,
      detail:
        counts.notAnswered === counts.total
          ? 'Nothing in this sitting was answered, so there is no score to read yet.'
          : 'These scored nothing because they were skipped, not because they were wrong.',
      actionLabel: 'Open in review',
      href: `/session/${attemptId}`,
    });
  }

  return items;
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
