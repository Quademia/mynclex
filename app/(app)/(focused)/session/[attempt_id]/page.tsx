// mynclex/app/(app)/(focused)/session/[attempt_id]/page.tsx
//
// Runner entry. Loads attempt + 4 snapshot tables + answers, enforces
// Pillar 2 (no answer-key leakage) at the server boundary via column-
// level projection, and routes into <Runner mode="live"> or
// <Runner mode="review"> based on attempt status.
//
// Why projection-at-the-server (vs RLS column-level):
//   RLS on nclex_attempt_items currently allows the owning student to
//   SELECT every column, key + rationale included. Review mode
//   legitimately needs those, so we don't tighten RLS. Instead we
//   narrow the projection here per status — sealed columns omitted
//   while live, included while review. The seal becomes explicit and
//   grep-able at the only place the runner crosses the server/client
//   boundary in 4.1.

import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireActiveBankSubscription } from '@/lib/access';
import type {
  AttemptHeader,
  SealedItem,
  UnsealedItem,
  AnswerRow,
  CaseSnapshot,
  TrendSnapshot,
  PerItemUnseal,
  RunnerData,
} from '@/lib/practice/runner';
import { Runner } from './runner';
import { expireAttemptAction } from './actions';
import { resolveAttemptExitHref } from '@/lib/practice/runner/resolve-exit-href';
import { reviewWindowOpen } from '@/lib/payments/readiness-window';
import { hasDismissedPrompt } from '@/lib/practice/tutorial/completion';
import { bookmarkingOffered } from '@/lib/practice/runner/bookmarks';
import { itemStatsForAttempt } from '@/lib/practice/runner/item-stats';
import { PROMPT_KEY_PRE_EXAM_OFFER } from '@/lib/practice/tutorial/keys';

export const dynamic = 'force-dynamic';

const SEALED_ITEM_COLUMNS = [
  'attempt_item_id',
  // The source question behind this row. Needed as the BOOKMARK key —
  // bookmarks are (student, question), so they cannot be keyed by
  // attempt_item_id (flag-and-bookmark.md §3.8). Not a content leak:
  // the student is already being served the question itself.
  'item_id',
  'item_source',
  // Per-sitting flag. Comes along on the item row, so seeding the
  // runner's flag set costs no second query.
  'is_flagged',
  'position',
  'question_type',
  'stem_snapshot',
  'instruction_snapshot',
  'marks_snapshot',
  'classification_snapshot',
  'content_snapshot_json',
  'parent_case_id',
  'case_position',
  'cjmm_step',
  'trend_id',
  'shuffle_seed',
  'option_order_json',
].join(', ');

const UNSEALED_ITEM_COLUMNS =
  SEALED_ITEM_COLUMNS +
  ', correct_answer_snapshot_json, rationale_snapshot, rationale_img_snapshot';

// ── Pillar 2, extended to the WRAPPER TITLE (2026-08-03) ─────────────
// A case study's title is not a label, it is the answer to the first
// question. Real examples from the bank: "Diabetic Ketoacidosis",
// "Sepsis and Septic Shock", "Small Bowel Obstruction", "Hyponatremia
// (SIADH)" — and NGN's opening CJMM step is literally "Recognise cues".
// One even narrates the whole six-question arc ("Acute Ischaemic Stroke:
// From Cue Recognition to Post-tPA Evaluation"). Trend titles do the same
// ("Sepsis Vital-Sign Deterioration"), where "is this deteriorating?" is
// often the question being asked.
//
// ⚠ Sealed on LIVE, not on EXAM. This is deliberately NOT the §16.6
// exam-scaffold rule (`intent === 'EXAM' && isLive`, runner.tsx), because
// this is not scaffolding that teaches — it is answer content, the same
// class as the rationale and the answer key above. Nobody argues a study
// sitting should be handed the answer key because study teaches, and the
// same reasoning applies here. Study modes are sealed too; review of ANY
// finished sitting restores it, which is when the title earns its keep
// (it is how a case is recognised in History and the reports).
//
// ⚠ The stored snapshot is never touched — only what we send. The column
// stays NOT NULL and every review surface still reads it.
const SEALED_CASE_COLUMNS   = 'case_id, scenario_summary_snapshot, tabs_snapshot_json';
const UNSEALED_CASE_COLUMNS = SEALED_CASE_COLUMNS + ', title_snapshot';

const SEALED_TREND_COLUMNS   = 'trend_id, scenario_snapshot, tabs_snapshot_json';
const UNSEALED_TREND_COLUMNS = SEALED_TREND_COLUMNS + ', title_snapshot';


interface PageProps {
  params: Promise<{ attempt_id: string }>;
}

export default async function SessionPage({ params }: PageProps) {
  const { attempt_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  let { data: attempt, error: aErr } = await supabase
    .from('nclex_attempts')
    .select('*')
    .eq('attempt_id', attempt_id)
    .maybeSingle();
  if (aErr || !attempt) notFound();

  // Bank entitlement gate (Slice 5.6): a bank (CUSTOM_BUILT) attempt needs
  // active bank access — full-lock on lapse covers the runner too, including
  // review of past attempts. Programme/tutor-quiz attempts (PROGRAMME_ASSIGNED)
  // are gated by enrolment elsewhere, so they're not touched here.
  if (attempt.source === 'CUSTOM_BUILT') {
    await requireActiveBankSubscription();
  }

  // Lazy expire detection (slice 4.5a — runner.html §8.6 + attempt-creation
  // §6.1.3). When a timed attempt has already run out its clock, the row may
  // still be IN_PROGRESS because the cron sweep hasn't fired yet (slice 2.4
  // will add it). Detect on page load and finalise inline: expireAttemptAction
  // iterates DRAFT rows, scores each in TS via scoreAttempt, AUTO_SUBMITs them,
  // then flips status to TIMED_OUT. The page re-fetches with the flipped
  // status and renders review naturally — no special "exam ended" view (per
  // the revised §6.1.3 rule).
  //
  // TWO clock kinds, TWO expiry tests (BUILD_LIST #6, 2026-07-25):
  //   • EXAM wall clock — expired once `now >= started_at + duration`.
  //   • STUDY engagement clock (TIMED_FREE_NAV) — expired once the ENGAGED
  //     total has reached the budget: `engaged_seconds_used >= duration`.
  //     The wall-clock test MUST NOT apply here — an engagement attempt
  //     reopened days later has almost always passed `started_at + duration`
  //     in wall time while barely touching its engaged budget, so the old
  //     test would wrongly kill it on return. That is the whole bug this
  //     slice fixes.
  //
  // Untimed attempts (duration_seconds NULL) skip this — they only end
  // via deliberate Finish or orphan cleanup.
  if (
    attempt.status === 'IN_PROGRESS' &&
    attempt.duration_seconds !== null &&
    attempt.started_at !== null
  ) {
    const isEngagementClock =
      attempt.intent === 'STUDY' && attempt.mode === 'TIMED_FREE_NAV';

    const expired = isEngagementClock
      ? (attempt.engaged_seconds_used ?? 0) >= attempt.duration_seconds
      : Date.now() >= Date.parse(attempt.started_at) + attempt.duration_seconds * 1000;

    if (expired) {
      const r = await expireAttemptAction(attempt_id);
      if (!r.ok) notFound();

      const refetch = await supabase
        .from('nclex_attempts')
        .select('*')
        .eq('attempt_id', attempt_id)
        .maybeSingle();
      if (refetch.error || !refetch.data) notFound();
      attempt = refetch.data;
    }
  }

  // ABANDONED has no rows underneath (discard hard-deletes per slice 2.2b).
  // Bounce back to Practice rather than render a broken runner.
  if (attempt.status === 'ABANDONED') {
    redirect('/student/bank/practice');
  }

  // Readiness review-window gate (2b-iv, §11.5). A terminal readiness
  // sitting is reviewable per-question only while its 21-day window runs;
  // the score persists forever but per-question review closes at the
  // credit's expires_at. Past that, send them to the permanent report
  // page (which shows the score + an "answer review closed" note). The
  // report page enforces the same boundary, so neither a bookmarked
  // /session URL nor the report can outlive the window. Live sittings are
  // untouched — the shot is still in progress.
  if (attempt.source === 'READINESS_PACK' && attempt.status !== 'IN_PROGRESS') {
    const { data: credit } = await supabase
      .from('nclex_readiness_credits')
      .select('expires_at')
      .eq('attempt_id', attempt_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!reviewWindowOpen(credit?.expires_at ?? null)) {
      redirect(`/student/bank/packs/report/${attempt_id}`);
    }
  }

  const isLive = attempt.status === 'IN_PROGRESS';
  const itemColumns  = isLive ? SEALED_ITEM_COLUMNS  : UNSEALED_ITEM_COLUMNS;
  const caseColumns  = isLive ? SEALED_CASE_COLUMNS  : UNSEALED_CASE_COLUMNS;
  const trendColumns = isLive ? SEALED_TREND_COLUMNS : UNSEALED_TREND_COLUMNS;

  const [items, cases, trends, answers] = await Promise.all([
    supabase
      .from('nclex_attempt_items')
      .select(itemColumns)
      .eq('attempt_id', attempt_id)
      .order('position', { ascending: true }),
    supabase
      .from('nclex_attempt_case_snapshots')
      .select(caseColumns)
      .eq('attempt_id', attempt_id),
    supabase
      .from('nclex_attempt_trend_snapshots')
      .select(trendColumns)
      .eq('attempt_id', attempt_id),
    supabase
      .from('nclex_attempt_answers')
      .select(
        'attempt_item_id, answer_json, submission_status, is_correct, ' +
        'score_awarded, time_spent_sec, submitted_at',
      )
      .eq('attempt_id', attempt_id),
  ]);

  if (items.error || cases.error || trends.error || answers.error) {
    notFound();
  }

  // How other students answered each question — review only, and one call
  // for the whole sitting rather than one per question. Not part of the
  // Promise.all above because it is decoration: it must never be able to
  // fail the page, and itemStatsForAttempt swallows errors to a {} for
  // that reason. Live mode never asks — the figure belongs beside a
  // verdict, and live has none until submit.
  const itemStats = isLive ? {} : await itemStatsForAttempt(supabase, attempt_id);

  // Resume support (slice 4.6a fix). For UL students returning to an
  // in-progress attempt, items the student already submitted need their
  // unseal data restored so per-Q feedback re-renders. The main items
  // query is sealed by Pillar 2; we fetch the unseal columns here in a
  // narrow follow-up scoped to ONLY items whose answer row is finalised
  // (SUBMITTED / AUTO_SUBMITTED / SKIPPED — never DRAFT). Pillar 2 holds:
  // not-yet-answered items never enter this set.
  let seededUnseal: Record<string, PerItemUnseal> = {};
  if (isLive) {
    const finalisedIds = ((answers.data ?? []) as unknown as AnswerRow[])
      .filter((a) => a.submission_status !== 'DRAFT')
      .map((a) => a.attempt_item_id);

    if (finalisedIds.length > 0) {
      const { data: unsealRows, error: unsealErr } = await supabase
        .from('nclex_attempt_items')
        .select(
          'attempt_item_id, correct_answer_snapshot_json, rationale_snapshot, rationale_img_snapshot, marks_snapshot',
        )
        .eq('attempt_id', attempt_id)
        .in('attempt_item_id', finalisedIds);

      if (unsealErr) notFound();
      for (const r of (unsealRows ?? []) as unknown as Array<{
        attempt_item_id:              string;
        correct_answer_snapshot_json: PerItemUnseal['correct'];
        rationale_snapshot:           string | null;
        rationale_img_snapshot:       string | null;
        marks_snapshot:               number;
      }>) {
        seededUnseal[r.attempt_item_id] = {
          correct:      r.correct_answer_snapshot_json,
          rationale:    r.rationale_snapshot,
          rationaleImg: r.rationale_img_snapshot,
          marksMax:     r.marks_snapshot,
        };
      }
    }
  }

  // Slice 3a — exit URL for the topbar ← Exit button. Server-side so
  // the click is a sync push (no spinner). Same resolver the results
  // popup calls on-demand.
  const exitHref = await resolveAttemptExitHref(supabase, {
    source:                attempt.source,
    programme_activity_id: attempt.programme_activity_id,
    mode:                  attempt.mode,
    filters_json:          attempt.filters_json,
  });

  // Runner tutorial Slice 3c: the pre-exam walkthrough offer shows on the
  // preflight (a live attempt that hasn't started). Read the dismissal flag
  // only in that case — no query on review or already-running attempts.
  const offerDismissed =
    isLive && attempt.started_at === null
      ? await hasDismissedPrompt(PROMPT_KEY_PRE_EXAM_OFFER)
      : false;

  // Bookmarks (flag-and-bookmark.md §3.7). A bookmark is (student,
  // question), so a question met in an earlier sitting ARRIVES ALREADY
  // BOOKMARKED — this is a load, not a rule to enforce. Skip it and the
  // control renders "off" for a bookmarked question, the student taps,
  // and the insert hits the unique index.
  //
  // Scoped to this attempt's items rather than fetching the student's
  // whole bookmark set: the runner only ever renders these questions,
  // and an unbounded IN-list is how the 1,000-row cap bites.
  const canBookmark = bookmarkingOffered(attempt as AttemptHeader);

  let bookmarkedItemIds: string[] = [];
  if (canBookmark) {
    const attemptItemIds = ((items.data ?? []) as unknown as SealedItem[])
      .map((i) => i.item_id)
      .filter(Boolean);

    if (attemptItemIds.length > 0) {
      const { data: marks } = await supabase
        .from('nclex_question_marks')
        .select('target_id')
        .eq('student_id',    user.id)
        .eq('target_kind',   'QUESTION')
        .eq('target_source', 'BANK')
        .in('target_id',     attemptItemIds);

      bookmarkedItemIds = (marks ?? []).map((m) => m.target_id as string);
    }
  }

  // Multi-line / concatenated select strings defeat supabase-js's row-
  // shape inference (returns GenericStringError[]); cast through unknown.
  const data: RunnerData = isLive
    ? {
        mode:    'live',
        attempt: attempt as AttemptHeader,
        items:   (items.data   ?? []) as unknown as SealedItem[],
        cases:   (cases.data   ?? []) as unknown as CaseSnapshot[],
        trends:  (trends.data  ?? []) as unknown as TrendSnapshot[],
        answers: (answers.data ?? []) as unknown as AnswerRow[],
        seededUnseal,
        exitHref,
        offerDismissed,
        bookmarkedItemIds,
        canBookmark,
      }
    : {
        mode:    'review',
        attempt: attempt as AttemptHeader,
        items:   (items.data   ?? []) as unknown as UnsealedItem[],
        cases:   (cases.data   ?? []) as unknown as CaseSnapshot[],
        trends:  (trends.data  ?? []) as unknown as TrendSnapshot[],
        answers: (answers.data ?? []) as unknown as AnswerRow[],
        itemStats,
        exitHref,
        bookmarkedItemIds,
        canBookmark,
      };

  return <Runner data={data} />;
}
