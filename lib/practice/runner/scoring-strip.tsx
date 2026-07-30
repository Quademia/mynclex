// mynclex/lib/practice/runner/scoring-strip.tsx
//
// The review scoring strip — one line above the rationale carrying how
// the question was marked. Design: "Runner Review Scoring Line" (Claude
// Design, 2026-07-30), built with Sam.
//
//   [◐ PARTIAL CREDIT]  1 / 3 marks · 2 of 3 found · 1 wrong  |  rule    ◷ 1m 52s
//
// It exists because the old header said one word ("wrong") next to a
// number that disagreed with it ("1 / 3"). The strip replaces that word
// with the three-state verdict AND shows the working, so a partial score
// stops being a mystery: which marks were found, which rule applied.
//
// Every figure here is already on the page — no query, no new data. The
// cohort figure (a later slice) is the only part that needs a round trip.
//
// ⚠ Runner only. The tutor-library embeds keep the simpler rationale
// header: they have no time on the row and no attempt to scope a cohort
// against.

'use client';

import type { QuestionType } from '@/lib/bank/classifications';
import { verdictFor, VERDICT_LABEL, type Verdict } from '@/lib/scoring';
import { scoringRuleText } from '@/lib/scoring/rules-copy';
import type { PointsDetail } from '@/lib/scoring/detail';

interface Props {
  questionType: QuestionType;
  scoreAwarded: number;
  marksMax:     number;
  /** From pointsDetail(); null when the answer shape couldn't be read. */
  detail:       PointsDetail | null;
  /** Engaged seconds on this question; null on sittings that predate the
   *  time engine, which stay reviewable forever. */
  timeSpentSec: number | null;
}

const VERDICT_CLASS: Record<Verdict, string> = {
  CORRECT: 'ok',
  PARTIAL: 'part',
  WRONG:   'no',
};

const VERDICT_GLYPH: Record<Verdict, string> = {
  CORRECT: '✓',
  PARTIAL: '◐',
  WRONG:   '✕',
};

export function ScoringStrip({
  questionType,
  scoreAwarded,
  marksMax,
  detail,
  timeSpentSec,
}: Props) {
  const verdict = verdictFor(scoreAwarded, marksMax);
  const breakdown = detail ? breakdownText(detail) : null;

  return (
    <div className="rn-strip">
      <span className={'rn-strip-verdict ' + VERDICT_CLASS[verdict]}>
        <span className="glyph" aria-hidden="true">{VERDICT_GLYPH[verdict]}</span>
        {VERDICT_LABEL[verdict]}
      </span>

      <span className="rn-strip-score">
        {formatScore(scoreAwarded)} / {marksMax} {marksMax === 1 ? 'mark' : 'marks'}
        {breakdown && <span className="sub"> · {breakdown}</span>}
      </span>

      <span className="rn-strip-sep" aria-hidden="true" />

      <span className="rn-strip-rule">{scoringRuleText(questionType)}</span>

      {/* Right-hand meta group. Absent entirely when there is nothing to
       *  put in it — an empty segment is worse than no segment. */}
      {timeSpentSec !== null && (
        <span className="rn-strip-meta">
          <span className="rn-strip-time">
            <span className="glyph" aria-hidden="true">◷</span>
            {formatDuration(timeSpentSec)}
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * "2 of 3 found · 1 wrong pick".
 *
 * The wrong-pick half only appears when there were any — most types have
 * no wrong-pick penalty at all (see rules-copy.ts), so a permanent
 * "0 wrong" would imply a penalty that does not exist for them.
 */
function breakdownText(d: PointsDetail): string {
  const found = `${d.found} of ${d.max} found`;
  if (d.wrongPicked <= 0) return found;
  const picks = d.wrongPicked === 1 ? 'wrong pick' : 'wrong picks';
  return `${found} · ${d.wrongPicked} ${picks}`;
}

/** Strip trailing zeros so 1.0/1 reads as "1 / 1" rather than "1.0 / 1". */
function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

/** 24s · 1m 52s · 2m 06s — seconds zero-padded once minutes appear. */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  if (sec < 60) return `${sec}s`;
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${mins}m ${String(rem).padStart(2, '0')}s`;
}
