// mynclex/lib/practice/report/derive.test.ts
//
// The Session Report's readings. Most of these hold a decision in place
// rather than checking arithmetic — each one is a place where the obvious
// implementation reports something subtly untrue.

import { describe, expect, it } from 'vitest';
import {
  answerPoints,
  axisRows,
  changeSummary,
  changesAgainstYou,
  countMindChanges,
  fixList,
  hasRebuildableFilters,
  isAnswered,
  landedLine,
  outcomeCounts,
  paceSeconds,
  pointsSplit,
  questionOutcome,
  questionRows,
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
    changeLog: [],
    correct: { answer: 'A' },
    answer: 'A',
    difficultyIrt: 0,
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
    const swap = [{ from: 'A', to: 'B' }];
    const built = [{ from: null, to: 'A' }];
    expect(
      changeSummary([q({ changeLog: swap }), q({ changeLog: built }), q({ changeLog: swap })]),
    ).toEqual({ changed: 2, total: 3 });
  });
});

describe('changesAgainstYou — which way the student moved', () => {
  it('⭐ counts a change that moved AWAY from the right answer', () => {
    // The reading no other surface offers, and only possible because the log
    // stores the answer before AND after each edit.
    const reading = changesAgainstYou([
      q({ correct: { answer: 'A' }, changeLog: [{ from: 'A', to: 'B' }] }),
    ]);
    expect(reading).toEqual({ changed: 1, costly: 1 });
  });

  it('does not count a change that moved TOWARD the right answer', () => {
    const reading = changesAgainstYou([
      q({ correct: { answer: 'A' }, changeLog: [{ from: 'B', to: 'A' }] }),
    ]);
    expect(reading).toEqual({ changed: 1, costly: 0 });
  });

  it('counts questions, not edits — dithering five times is one answer', () => {
    const reading = changesAgainstYou([
      q({
        correct: { answer: 'A' },
        changeLog: [
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' },
        ],
      }),
    ]);
    expect(reading).toEqual({ changed: 1, costly: 1 });
  });

  it('declines to judge direction when the key cannot be read', () => {
    // Contributes to `changed` but never to `costly`: asserting a direction
    // we cannot compute would be worse than saying less.
    const reading = changesAgainstYou([
      q({ correct: null, changeLog: [{ from: 'A', to: 'B' }] }),
    ]);
    expect(reading).toEqual({ changed: 1, costly: 0 });
  });

  it('ignores answer-building edits entirely', () => {
    const reading = changesAgainstYou([
      q({ questionType: 'SATA', correct: { answers: ['A', 'B'] }, changeLog: [{ from: ['A'], to: ['A', 'B'] }] }),
    ]);
    expect(reading).toEqual({ changed: 0, costly: 0 });
  });
});

describe('questionRows — a stem may be stored as rich JSON', () => {
  it('⭐ renders a Tiptap document as plain text, never as JSON', () => {
    // Measured: 139 of 1,853 item snapshots are JSON docs. Printing the raw
    // column would show {"type":"doc",…} in one row in thirteen.
    const doc = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A client reports chest pain.' }] }],
    });
    const [row] = questionRows([q({ stem: doc })], 'att1');
    expect(row.stem).toBe('A client reports chest pain.');
    expect(row.stem).not.toContain('{');
  });

  it('leaves a plain-text stem alone', () => {
    const [row] = questionRows([q({ stem: 'A nurse is teaching a client.' })], 'att1');
    expect(row.stem).toBe('A nurse is teaching a client.');
  });

  it('survives a null stem', () => {
    expect(questionRows([q({ stem: null })], 'att1')[0].stem).toBe('');
  });

  it('carries the outcome, time, changes and a review link', () => {
    const [row] = questionRows(
      [q({ position: 4, marks: 4, scoreAwarded: 2, timeSpentSec: 41, changeLog: [{ from: 'A', to: 'B' }] })],
      'att7',
    );
    expect(row).toMatchObject({
      position: 4,
      outcome: 'PARTIAL',
      timeSpentSec: 41,
      changes: 1,
      href: '/session/att7',
    });
  });
});

describe('pointsSplit — reuses the readiness scorer, never re-scores', () => {
  it('splits a SATA into found / missed / wrong-picked', () => {
    const split = pointsSplit([
      q({
        questionType: 'SATA',
        marks: 3,
        scoreAwarded: 1,
        correct: { answers: ['A', 'B', 'C'] },
        answer: ['A', 'B', 'Z'],
      }),
    ]);
    expect(split).toMatchObject({ found: 2, missed: 1, wrongPicked: 1, max: 3, unreadable: 0 });
  });

  it('falls back to the stored score on a shape it cannot read', () => {
    // Better a slightly coarser reading than a wrong one — and the count is
    // surfaced so a partial reading is never shown as a complete one.
    const split = pointsSplit([
      q({ questionType: 'MYSTERY_TYPE', marks: 4, scoreAwarded: 3, correct: null, answer: null }),
    ]);
    expect(split).toMatchObject({ found: 3, missed: 1, max: 4, unreadable: 1 });
  });
});

describe('axisRows — weakest first, and difficulty comes from the NUMBER', () => {
  const set = [
    q({ classification: { nursing_subject: 'Pharmacology' }, marks: 1, scoreAwarded: 0 }),
    q({ classification: { nursing_subject: 'Pharmacology' }, marks: 1, scoreAwarded: 1 }),
    q({ classification: { nursing_subject: 'Med-Surg' }, marks: 1, scoreAwarded: 1 }),
  ];

  it('reports landed of total per value, weakest first', () => {
    const rows = axisRows(set, 'subject');
    expect(rows[0]).toEqual({ value: 'Pharmacology', full: 1, total: 2, pct: 50 });
    expect(rows[1]).toEqual({ value: 'Med-Surg', full: 1, total: 1, pct: 100 });
  });

  it('⭐ bands difficulty from difficulty_irt, not from a stored word', () => {
    // The snapshot freezes the NUMBER (slice 10d) precisely so the shown band
    // can't go stale. Looking for a `difficulty` key would find nothing and
    // the axis would render empty.
    const rows = axisRows(
      [q({ difficultyIrt: -2, marks: 1, scoreAwarded: 1 }), q({ difficultyIrt: 2, marks: 1, scoreAwarded: 0 })],
      'difficulty',
    );
    expect(rows.map((r) => r.value)).toEqual(['Very hard', 'Very easy']);
    expect(rows[0]).toMatchObject({ full: 0, total: 1, pct: 0 });
  });

  it('ignores questions with no value on that axis', () => {
    expect(axisRows([q({ classification: {} })], 'subject')).toEqual([]);
  });

  it('breaks a tie on the larger sample, so noise sinks below signal', () => {
    // 0 of 1 and 2 of 7 are both weak percentages; only one is worth acting
    // on, so the bigger sample is listed first.
    const rows = axisRows(
      [
        q({ classification: { nursing_subject: 'Tiny' }, marks: 1, scoreAwarded: 0 }),
        ...Array.from({ length: 3 }, () =>
          q({ classification: { nursing_subject: 'Big' }, marks: 1, scoreAwarded: 0 }),
        ),
      ],
      'subject',
    );
    expect(rows[0].value).toBe('Big');
  });
});

describe('fixList — advice only where there is a sample to advise from', () => {
  it('names the weakest subject once it has three questions', () => {
    const set = Array.from({ length: 3 }, (_, i) =>
      q({ classification: { nursing_subject: 'Pharmacology' }, marks: 1, scoreAwarded: i === 0 ? 1 : 0 }),
    );
    const list = fixList(set, 'att1');
    expect(list[0]).toMatchObject({ title: 'Pharmacology', actionLabel: 'Build more of this' });
    expect(list[0].href).toContain('subject=Pharmacology');
  });

  it('⭐ leads with whichever axis is WEAKER, not with a fixed precedence', () => {
    // Seen live: a 75% subject was numbered 1 above a 0% category numbered 2,
    // under the words "in that order". The numbering is the recommendation.
    const set = [
      // Med-Surg: 3 of 4 landed (75%)
      ...Array.from({ length: 4 }, (_, i) =>
        q({
          classification: {
            nursing_subject: 'Med-Surg',
            client_needs_category: i === 3 ? 'Safe and Effective Care Environment' : 'Physiological Integrity',
          },
          marks: 1,
          scoreAwarded: i === 3 ? 0 : 1,
        }),
      ),
      // Safe and Effective: 0 of 3 landed (0%)
      ...Array.from({ length: 2 }, () =>
        q({
          classification: {
            nursing_subject: 'Fundamentals',
            client_needs_category: 'Safe and Effective Care Environment',
          },
          marks: 1,
          scoreAwarded: 0,
        }),
      ),
    ];
    const list = fixList(set, 'att1');
    expect(list[0].kind).toBe('Weakest category');
    expect(list[0].title).toBe('Safe and Effective Care Environment');
    expect(list[1].kind).toBe('Weakest subject');
  });

  it('stays silent on a one-question axis rather than inventing a weakness', () => {
    const list = fixList([q({ classification: { nursing_subject: 'Pharmacology' }, marks: 1, scoreAwarded: 0 })], 'att1');
    expect(list.some((i) => i.title === 'Pharmacology')).toBe(false);
  });

  it('offers review for unanswered questions, needing no new build', () => {
    const list = fixList([q({ submissionStatus: 'SKIPPED', scoreAwarded: null })], 'att9');
    expect(list.at(-1)).toMatchObject({ actionLabel: 'Open in review', href: '/session/att9' });
  });

  it("says so plainly when nothing at all was answered", () => {
    const list = fixList([q({ submissionStatus: 'SKIPPED', scoreAwarded: null })], 'att9');
    expect(list.at(-1)?.detail).toMatch(/Nothing in this sitting was answered/);
  });

  it('never offers a "marked" action — nothing writes a mark', () => {
    const list = fixList([q({ marks: 1, scoreAwarded: 0 })], 'att1');
    expect(JSON.stringify(list)).not.toMatch(/mark/i);
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
