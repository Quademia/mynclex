// mynclex/lib/practice/report/derive.test.ts
//
// The Session Report's readings. Most of these hold a decision in place
// rather than checking arithmetic — each one is a place where the obvious
// implementation reports something subtly untrue.

import { describe, expect, it } from 'vitest';
import {
  answerPoints,
  changeSummary,
  countMindChanges,
  hasRebuildableFilters,
  isAnswered,
  landedLine,
  outcomeCounts,
  paceSeconds,
  questionOutcome,
  rebuildHref,
  totalEngagedSeconds,
} from './derive';
import type { ReportQuestion } from './types';

function q(over: Partial<ReportQuestion> = {}): ReportQuestion {
  return {
    position: 1,
    itemId: 'Q_00001',
    questionType: 'MCQ',
    classification: {},
    stem: 'A client…',
    marks: 1,
    scoreAwarded: 1,
    submissionStatus: 'SUBMITTED',
    timeSpentSec: 30,
    answerChanges: 0,
    ...over,
  };
}

describe('isAnswered — a DRAFT is not an answer', () => {
  it('counts submitted and auto-submitted', () => {
    expect(isAnswered(q({ submissionStatus: 'SUBMITTED' }))).toBe(true);
    expect(isAnswered(q({ submissionStatus: 'AUTO_SUBMITTED' }))).toBe(true);
  });

  it('does not count DRAFT, SKIPPED or nothing at all', () => {
    // ⚠ Merely opening a question writes a DRAFT row — proven live on the
    // case bank. Counting drafts would call every question the student
    // glanced at "attempted".
    expect(isAnswered(q({ submissionStatus: 'DRAFT' }))).toBe(false);
    expect(isAnswered(q({ submissionStatus: 'SKIPPED' }))).toBe(false);
    expect(isAnswered(q({ submissionStatus: null }))).toBe(false);
  });
});

describe('questionOutcome — full means FULL marks', () => {
  it('needs the whole mark, not just a positive score', () => {
    // A 3-of-4 SATA feeds the percentage but is not a question the student
    // landed. Treating score > 0 as correct flatters the report.
    expect(questionOutcome(q({ marks: 4, scoreAwarded: 4 }))).toBe('FULL');
    expect(questionOutcome(q({ marks: 4, scoreAwarded: 3 }))).toBe('PARTIAL');
    expect(questionOutcome(q({ marks: 4, scoreAwarded: 0 }))).toBe('NONE');
  });

  it('separates skipped from wrong', () => {
    expect(questionOutcome(q({ submissionStatus: 'SKIPPED', scoreAwarded: null }))).toBe(
      'NOT_ANSWERED',
    );
  });

  it('treats a submitted null score as zero, not as skipped', () => {
    expect(questionOutcome(q({ scoreAwarded: null }))).toBe('NONE');
  });
});

describe('outcomeCounts', () => {
  const set = [
    q({ marks: 1, scoreAwarded: 1 }),
    q({ marks: 4, scoreAwarded: 2 }),
    q({ marks: 1, scoreAwarded: 0 }),
    q({ submissionStatus: 'SKIPPED', scoreAwarded: null }),
  ];

  it('counts each outcome, and merges the summary bucket', () => {
    const c = outcomeCounts(set);
    expect(c).toMatchObject({
      full: 1,
      partial: 1,
      none: 1,
      notAnswered: 1,
      wrongOrSkipped: 2,
      total: 4,
      answered: 3,
    });
  });

  it('answered excludes the skipped one, so pace is not diluted', () => {
    expect(outcomeCounts(set).answered).toBe(3);
  });
});

describe('answerPoints — marks, not questions', () => {
  it('sums the marks and the score', () => {
    // 52 scoreable points across 25 questions is only possible because a
    // bow-tie carries 13 and an MCQ carries 1.
    const p = answerPoints([q({ marks: 13, scoreAwarded: 9 }), q({ marks: 1, scoreAwarded: 0 })]);
    expect(p).toEqual({ earned: 9, total: 14 });
  });

  it('treats an unsubmitted question as zero earned but still scoreable', () => {
    const p = answerPoints([q({ marks: 5, scoreAwarded: null, submissionStatus: null })]);
    expect(p).toEqual({ earned: 0, total: 5 });
  });
});

describe('totalEngagedSeconds — absent time is not zero time', () => {
  it('prefers the attempt-level figure', () => {
    expect(totalEngagedSeconds(600, [q({ timeSpentSec: 5 })])).toBe(600);
  });

  it('falls back to summing per-question time', () => {
    expect(totalEngagedSeconds(null, [q({ timeSpentSec: 30 }), q({ timeSpentSec: 45 })])).toBe(75);
  });

  it('returns null when NOTHING was recorded', () => {
    // The common case on older sittings, not an edge case: timing arrived
    // late, so most historical attempts have none. "0m" would claim the
    // student finished instantly.
    expect(totalEngagedSeconds(null, [q({ timeSpentSec: null }), q({ timeSpentSec: 0 })])).toBeNull();
    expect(totalEngagedSeconds(0, [q({ timeSpentSec: null })])).toBeNull();
  });
});

describe('paceSeconds — divided by what was ANSWERED', () => {
  it('averages over answered questions', () => {
    expect(paceSeconds(600, 10)).toBe(60);
  });

  it('does not dilute the pace across questions never attempted', () => {
    // 8 answered of 25 in 400s is 50s per question worked, not 16s.
    expect(paceSeconds(400, 8)).toBe(50);
  });

  it('is null with no time or nothing answered', () => {
    expect(paceSeconds(null, 10)).toBeNull();
    expect(paceSeconds(600, 0)).toBeNull();
  });
});

describe('countMindChanges — composing an answer is not changing your mind', () => {
  // Shapes taken from real dev rows, not invented.

  it('⭐ does not count building up a multi-slot answer', () => {
    // A four-row matrix, answered straightforwardly one row at a time. The
    // log has four entries; the student changed their mind zero times.
    // Counting log.length would report four.
    const log = [
      { at: 't1', from: null, to: { s1: 't3' } },
      { at: 't2', from: { s1: 't3' }, to: { s1: 't3', s2: 't1' } },
      { at: 't3', from: { s1: 't3', s2: 't1' }, to: { s1: 't3', s2: 't1', s4: 't2' } },
      { at: 't4', from: { s1: 't3', s2: 't1', s4: 't2' }, to: { s1: 't3', s2: 't1', s3: 't4', s4: 't2' } },
    ];
    expect(countMindChanges(log)).toBe(0);
  });

  it('does not count ticking successive SATA boxes', () => {
    const log = [
      { from: null, to: ['F'] },
      { from: ['F'], to: ['F', 'D'] },
      { from: ['F', 'D'], to: ['F', 'D', 'C'] },
    ];
    expect(countMindChanges(log)).toBe(0);
  });

  it('counts a replaced slot value', () => {
    const log = [
      { from: null, to: { s1: 't3' } },
      { from: { s1: 't3' }, to: { s1: 't1' } },
    ];
    expect(countMindChanges(log)).toBe(1);
  });

  it('counts a removed slot and a deselected option', () => {
    expect(countMindChanges([{ from: { s1: 'a', s2: 'b' }, to: { s1: 'a' } }])).toBe(1);
    expect(countMindChanges([{ from: ['F', 'D'], to: ['F'] }])).toBe(1);
  });

  it('counts a swapped single answer', () => {
    expect(countMindChanges([{ from: 'A', to: 'B' }])).toBe(1);
  });

  it('never counts the first answer, whose `from` is null', () => {
    expect(countMindChanges([{ from: null, to: 'A' }])).toBe(0);
  });

  it('survives a missing, empty or malformed log', () => {
    expect(countMindChanges(null)).toBe(0);
    expect(countMindChanges([])).toBe(0);
    expect(countMindChanges('nonsense')).toBe(0);
    expect(countMindChanges([null, 42])).toBe(0);
  });
});

describe('changeSummary', () => {
  it('counts questions whose answer was changed at least once', () => {
    expect(changeSummary([q({ answerChanges: 3 }), q({ answerChanges: 0 }), q({ answerChanges: 1 })]))
      .toEqual({ changed: 2, total: 3 });
  });
});

describe('landedLine — factual, and nothing else', () => {
  it('states the count without naming a cause', () => {
    const line = landedLine(outcomeCounts([q(), q({ marks: 1, scoreAwarded: 0 })]));
    expect(line).toBe('You landed 1 of 2.');
    // The cut clauses: no dominant-axis story off a handful of questions,
    // and no comparison to previous sittings (that is the analytics page).
    expect(line).not.toMatch(/average|where this session went|weakest/i);
  });
});

describe('rebuildHref — reuses the readiness deep-link convention', () => {
  it('carries every content axis', () => {
    const href = rebuildHref({
      client_needs_category: ['Safe and Effective Care Environment'],
      nursing_subject: ['Pharmacology', 'Med-Surg'],
      difficulty: ['Hard'],
      tags: ['cardiac'],
    });
    expect(href).toContain('/student/bank/practice?');
    expect(href).toContain('cnc=Safe+and+Effective+Care+Environment');
    expect(href).toContain('subject=Pharmacology');
    expect(href).toContain('subject=Med-Surg');
    expect(href).toContain('diff=Hard');
    expect(href).toContain('tag=cardiac');
  });

  it('⭐ never carries the pool, so a rebuild serves FRESH questions', () => {
    // The builder page's own comment: pools stay UNSEEN so practice serves
    // fresh questions. Re-running the identical items is a memory test —
    // Review is what shows you the same questions again.
    const href = rebuildHref({
      nursing_subject: ['Pharmacology'],
      pool_history: ['INCORRECT'],
      pool_marked: true,
    });
    expect(href).not.toMatch(/pool|marked|INCORRECT/i);
    expect(href).toContain('subject=Pharmacology');
  });

  it('falls back to the bare builder when nothing was filtered', () => {
    expect(rebuildHref({})).toBe('/student/bank/practice');
    expect(rebuildHref({ pool_history: ['UNSEEN'] })).toBe('/student/bank/practice');
  });

  it('knows when there is nothing to reproduce', () => {
    // A filterless build has no "same" to build again, so the caller offers
    // a plain "Build another" rather than promising sameness.
    expect(hasRebuildableFilters({})).toBe(false);
    expect(hasRebuildableFilters({ pool_history: ['UNSEEN'] })).toBe(false);
    expect(hasRebuildableFilters({ difficulty: ['Hard'] })).toBe(true);
  });
});
