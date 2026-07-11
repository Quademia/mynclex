// mynclex/lib/payments/readiness-report.ts
//
// The data loader for the permanent per-sitting readiness report (§11.5,
// step 3). One place assembles everything the report renders from the
// frozen attempt — the report page (a server component) calls this after
// auth, then acts on the gate `reason`.
//
// Almost all of it is reads over data already frozen at submit: the attempt
// (final_score, dates, pack link), its 100 delivered questions
// (nclex_attempt_items) joined to the graded responses
// (nclex_attempt_answers on attempt_item_id — after termination every item
// has exactly one answer row, incl. SKIPPED, so the join is total), and the
// credit that carries the 21-day review deadline.
//
// Slice ① computes the verdict (score + band), the question-outcome counts,
// and the points reading. Later slices extend the returned model
// (breakdowns, per-question map, trend) off the same per-item rows — this
// loader is the one read the whole report shares.

import { createClient } from '@/lib/supabase/server';
import { scoreToBand, type BandInfo } from './readiness-band';
import { reviewWindowOpen } from './readiness-window';
import { pointsDetail } from '@/lib/scoring/detail';
import type { QuestionType } from '@/lib/bank/classifications';
import type { BankItemCorrect } from '@/lib/bank/types';
import type { BankItemAnswer } from '@/lib/scoring/types';

export interface ReadinessOutcomes {
  /** Every one of the question's answer-slots correct (is_correct). */
  full: number;
  /** Some but not all credit earned (is_correct false, score > 0). */
  partial: number;
  /** No credit — wrong or skipped. */
  wrong: number;
  /** Always the delivered question count (100 for a full pack). */
  total: number;
}

export interface ReadinessPoints {
  /** Total scoreable answer-points across every question (Σ marks). */
  total: number;
  /** Correct answer-slots the student got. */
  found: number;
  /** Correct answer-slots missed (= total − found). */
  missed: number;
  /** Wrong options selected (−1 picks), selection family only. */
  wrongPicked: number;
}

/** One delivered question, flattened for the report's breakdowns + map. */
export interface ReportItem {
  position: number;
  questionType: string;
  /** L1 client-needs category (may be null / off-canonical — bucket defensively). */
  category: string | null;
  /** L2 client-needs subcategory. */
  subcategory: string | null;
  bodySystem: string | null;
  difficulty: string | null;
  /** CJMM step — non-null only on case (NGN) children. */
  cjmmStep: string | null;
  topic: string | null;
  subtopic: string | null;
  isCorrect: boolean;
  scoreAwarded: number;
  marks: number;
  answered: boolean;
}

/** One prior sitting for the cross-pack trend (chronological). */
export interface TrendPoint {
  attemptId: string;
  packTitle: string;
  pct: number;
  satDate: string | null;
  isCurrent: boolean;
}

export interface ReadinessReport {
  attemptId: string;
  packTitle: string;
  /** ended_at ISO — the sitting date. Null only on a malformed terminal row. */
  satDate: string | null;
  /** Canonical final_score, 0..1 (item-equivalent average of fractions). */
  finalScore: number | null;
  /** Rounded integer percentage, or null when unscored. */
  pct: number | null;
  band: BandInfo | null;
  /** Total delivered question count (the pack's 100). */
  questionCount: number;
  outcomes: ReadinessOutcomes;
  points: ReadinessPoints;
  /** Per-question rows in sitting order — the breakdown + map data. */
  items: ReportItem[];
  /** This student's readiness sittings across all packs, chronological. */
  trend: TrendPoint[];
  /** 21-day answer-review window — open while now < expiresAt. */
  reviewOpen: boolean;
  expiresAt: string | null;
}

export type ReadinessReportResult =
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'in_progress' }
  | { ok: true; report: ReadinessReport };

interface ItemRow {
  attempt_item_id: string;
  position: number;
  question_type: QuestionType;
  marks_snapshot: number | null;
  correct_answer_snapshot_json: unknown;
  cjmm_step: string | null;
  classification_snapshot: Record<string, unknown> | null;
}
interface AnswerRow {
  attempt_item_id: string;
  is_correct: boolean | null;
  score_awarded: number | null;
  answer_json: unknown;
  submission_status: string | null;
}

/**
 * Assemble the readiness report for one attempt, or a gate reason the page
 * turns into notFound()/redirect(). Ownership is re-checked here (RLS also
 * enforces it); source + terminal status gate the report.
 */
export async function getReadinessReport(
  attemptId: string,
  userId: string,
): Promise<ReadinessReportResult> {
  const supabase = await createClient();

  const { data: attempt, error: aErr } = await supabase
    .from('nclex_attempts')
    .select('attempt_id, student_id, source, status, final_score, ended_at, readiness_pack_id')
    .eq('attempt_id', attemptId)
    .maybeSingle();

  if (aErr || !attempt) return { ok: false, reason: 'not_found' };
  if (attempt.student_id !== userId) return { ok: false, reason: 'not_found' };
  if (attempt.source !== 'READINESS_PACK') return { ok: false, reason: 'not_found' };
  // A still-running sitting has no report yet.
  if (attempt.status === 'IN_PROGRESS') return { ok: false, reason: 'in_progress' };

  // The credit carries the review deadline + the pack it belongs to.
  const { data: credit } = await supabase
    .from('nclex_readiness_credits')
    .select('pack_id, expires_at')
    .eq('attempt_id', attemptId)
    .eq('user_id', userId)
    .maybeSingle();

  let packTitle = 'Readiness Pack';
  if (credit?.pack_id) {
    const { data: pack } = await supabase
      .from('nclex_readiness_packs')
      .select('title')
      .eq('pack_id', credit.pack_id)
      .maybeSingle();
    if (pack?.title) packTitle = pack.title;
  }

  // The 100 delivered questions + their graded responses.
  const [{ data: items }, { data: answers }] = await Promise.all([
    supabase
      .from('nclex_attempt_items')
      .select(
        'attempt_item_id, position, question_type, marks_snapshot, correct_answer_snapshot_json, cjmm_step, classification_snapshot',
      )
      .eq('attempt_id', attemptId)
      .order('position'),
    supabase
      .from('nclex_attempt_answers')
      .select('attempt_item_id, is_correct, score_awarded, answer_json, submission_status')
      .eq('attempt_id', attemptId),
  ]);

  const itemRows = (items ?? []) as ItemRow[];
  const answerByItem = new Map<string, AnswerRow>();
  for (const a of (answers ?? []) as AnswerRow[]) answerByItem.set(a.attempt_item_id, a);

  const outcomes: ReadinessOutcomes = { full: 0, partial: 0, wrong: 0, total: 0 };
  const points: ReadinessPoints = { total: 0, found: 0, missed: 0, wrongPicked: 0 };
  const reportItems: ReportItem[] = [];

  for (const item of itemRows) {
    outcomes.total += 1;
    const ans = answerByItem.get(item.attempt_item_id);
    const score = ans?.score_awarded ?? 0;
    const marks = item.marks_snapshot ?? 1;
    const isCorrect = ans?.is_correct === true;

    // Question outcome — all-or-nothing correct vs partial vs none.
    if (isCorrect) outcomes.full += 1;
    else if (score > 0) outcomes.partial += 1;
    else outcomes.wrong += 1;

    // Points detail — found/missed/wrong recomputed from the frozen key +
    // answer; falls back to the stored score if a shape can't be read.
    points.total += marks;
    const detail = pointsDetail(
      item.question_type,
      item.correct_answer_snapshot_json as BankItemCorrect,
      (ans?.answer_json ?? null) as BankItemAnswer | null,
    );
    if (detail) {
      points.found += Math.min(detail.found, marks);
      points.wrongPicked += detail.wrongPicked;
    } else {
      points.found += Math.min(Math.max(0, score), marks);
    }

    const cls = item.classification_snapshot ?? {};
    const str = (v: unknown): string | null =>
      typeof v === 'string' && v.trim() !== '' ? v : null;
    reportItems.push({
      position: item.position,
      questionType: item.question_type,
      category: str(cls.client_needs_category),
      subcategory: str(cls.client_needs_subcategory),
      bodySystem: str(cls.body_system),
      difficulty: str(cls.difficulty),
      cjmmStep: str(item.cjmm_step),
      topic: str(cls.topic),
      subtopic: str(cls.subtopic),
      isCorrect,
      scoreAwarded: score,
      marks,
      answered: ans != null && ans.submission_status !== 'SKIPPED',
    });
  }
  points.missed = Math.max(0, points.total - points.found);

  // Cross-pack trend — this student's own terminal readiness sittings with a
  // score, chronological (own-rows read; each pack is a comparable measure of
  // the same exam standard). Needs ≥2 to mean anything (else the empty state).
  const { data: history } = await supabase
    .from('nclex_attempts')
    .select('attempt_id, readiness_pack_id, final_score, ended_at')
    .eq('student_id', userId)
    .eq('source', 'READINESS_PACK')
    .in('status', ['COMPLETED', 'TIMED_OUT'])
    .not('final_score', 'is', null)
    .order('ended_at', { ascending: true });

  const histRows = (history ?? []) as {
    attempt_id: string;
    readiness_pack_id: string | null;
    final_score: number;
    ended_at: string | null;
  }[];
  const packIds = [...new Set(histRows.map((h) => h.readiness_pack_id).filter(Boolean))] as string[];
  const titleById = new Map<string, string>();
  if (packIds.length) {
    const { data: packs } = await supabase
      .from('nclex_readiness_packs')
      .select('pack_id, title')
      .in('pack_id', packIds);
    for (const p of packs ?? []) titleById.set(p.pack_id, p.title);
  }
  const trend: TrendPoint[] = histRows.map((h) => ({
    attemptId: h.attempt_id,
    packTitle: (h.readiness_pack_id && titleById.get(h.readiness_pack_id)) || 'Readiness Pack',
    pct: Math.round(h.final_score * 100),
    satDate: h.ended_at,
    isCurrent: h.attempt_id === attemptId,
  }));

  const finalScore = attempt.final_score;
  const expiresAt = credit?.expires_at ?? null;

  return {
    ok: true,
    report: {
      attemptId,
      packTitle,
      satDate: attempt.ended_at ?? null,
      finalScore,
      pct: finalScore !== null ? Math.round(finalScore * 100) : null,
      band: scoreToBand(finalScore),
      questionCount: outcomes.total,
      outcomes,
      points,
      items: reportItems,
      trend,
      reviewOpen: reviewWindowOpen(expiresAt),
      expiresAt,
    },
  };
}
