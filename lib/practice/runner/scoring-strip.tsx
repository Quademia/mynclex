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
import { statsDisplay, type ItemStats } from './item-stats';

interface Props {
  questionType: QuestionType;
  scoreAwarded: number;
  marksMax:     number;
  /** From pointsDetail(); null when the answer shape couldn't be read. */
  detail:       PointsDetail | null;
  /** Engaged seconds on this question; null on sittings that predate the
   *  time engine, which stay reviewable forever. */
  timeSpentSec: number | null;
  /** How other students answered it. Undefined when too few have — the
   *  segment then disappears rather than showing a placeholder, so a
   *  student is never taught to look for a number that mostly isn't
   *  there. Self-gating: it appears on its own as the bank fills. */
  stats?: ItemStats;
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
  stats,
}: Props) {
  const verdict = verdictFor(scoreAwarded, marksMax);
  const breakdown = detail ? breakdownText(detail) : null;
  const others = stats ? statsDisplay(stats, marksMax) : null;

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
      {(timeSpentSec !== null || others) && (
        <span className="rn-strip-meta">
          {timeSpentSec !== null && (
            <span className="rn-strip-time">
              <span className="glyph" aria-hidden="true">◷</span>
              {formatDuration(timeSpentSec)}
            </span>
          )}
          {timeSpentSec !== null && others && (
            <span className="rn-strip-sep" aria-hidden="true" />
          )}
          {others && (
            /* The title carries the full split and the count. The visible
             * text stays two figures because a strip is a strip — but the
             * sentence a student can reach says WHO the percentage is of,
             * which is the part a bare "41% correct" leaves them to guess. */
            <span className="rn-strip-others" title={othersTitle(others)}>
              <strong>{others.fullPct}%</strong> correct
              {others.partialPct !== null && (
                <>
                  {' · '}
                  <strong>{others.partialPct}%</strong> partial
                </>
              )}
            </span>
          )}
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

/**
 * The hover sentence behind the percentages.
 *
 * Names the population explicitly — "students who have answered this
 * question" — rather than reaching for a collective noun. "Cohort" is
 * taken here and would point at the wrong set; there is no other word
 * that is both short and true, so the sentence does the naming.
 *
 * Ends by saying a low figure means a hard question. Without that, a
 * student who has just got one wrong reads "18% correct" as a comment on
 * themselves rather than on the item.
 */
function othersTitle(d: ReturnType<typeof statsDisplay> & object): string {
  const who = `${d.nStudents} students who have answered this question`;
  const parts =
    d.partialPct !== null
      // ⚠ The "none" share is the REMAINDER, not d.zeroPct. All three are
      // rounded independently, which is fine in the strip — nobody adds
      // two figures sitting side by side — but this sentence lists all
      // three, and a reader can. Seen totalling 101% (30 / 47 / 24). The
      // two shares shown in the strip stay exactly as rendered; the one
      // that only appears here absorbs the rounding, which is what a
      // residual is for.
      ? `${d.fullPct}% earned full marks, ${d.partialPct}% earned partial credit, ${100 - d.fullPct - d.partialPct}% earned none`
      // ⚠ The complement, NOT the zero share. "Did not" means "did not get
      // full marks", which is zero AND partial. They look identical on a
      // one-mark question, where partial is impossible — but marksMax comes
      // from the ATTEMPT SNAPSHOT while the counts aggregate across every
      // attempt, so a question edited from one mark to several after
      // someone answered it has partial answers this branch would silently
      // drop. Seen doing exactly that: "41% got it right, 18% did not".
      : `${d.fullPct}% got it right, ${100 - d.fullPct}% did not`;
  return `Of the ${who}: ${parts}. A low figure means a hard question, not a judgement of your answer.`;
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
