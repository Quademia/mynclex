// mynclex/lib/practice/history/derive.test.ts
//
// The History directory's two load-bearing rules: WHERE a row opens, and
// HOW its result may be worded. Both were wrong in the MVP, and neither
// failure was visible to tsc or to any existing test — they were rendering
// bugs on a live page, found by opening it.
//
// This folder had no tests at all before this.

import { describe, expect, it } from 'vitest';
import {
  answeredDetail,
  attemptHref,
  attemptLinkLabel,
  describeOutcome,
  sanitiseSearchTerm,
  sittingKind,
  sittingSummary,
} from './derive';
import { formatDuration, rowTimestamp } from './format';
import { UNMEASURED_SHORT_LABEL } from '@/lib/practice/cat/report-derive';
import { MIN_ITEMS } from '@/lib/cat';
import type { AnswerStats, HistoryAttempt } from './types';

function attempt(over: Partial<HistoryAttempt> = {}): HistoryAttempt {
  return {
    attempt_id: 'a1',
    created_at: '2026-07-21T10:00:00Z',
    last_activity_at: null,
    status: 'COMPLETED',
    source: 'CUSTOM_BUILT',
    mode: 'TIMED_SEQUENTIAL',
    mode_label: 'Sequential',
    requested_count: 20,
    actual_count: 20,
    final_score: 0.55,
    filters_json: {},
    cat_verdict: null,
    cat_termination_reason: null,
    cat_items_administered: null,
    ...over,
  };
}

function stats(over: Partial<AnswerStats> = {}): AnswerStats {
  return { answered: 20, served: 20, engagedSeconds: 600, ...over };
}

const CAT = { mode: 'CAT' as const, cat_verdict: 'ABOVE_STANDARD' as const };
const PACK = { source: 'READINESS_PACK' as const };

describe('sittingKind — a CAT is stored as CUSTOM_BUILT', () => {
  it('reads the MODE, not the source, for a CAT', () => {
    // The trap: source alone says CUSTOM_BUILT, so checking it first
    // makes every CAT look like an ordinary practice quiz.
    expect(sittingKind(attempt({ mode: 'CAT', source: 'CUSTOM_BUILT' }))).toBe('CAT');
  });

  it('separates a pack from a practice quiz', () => {
    expect(sittingKind(attempt(PACK))).toBe('PACK');
    expect(sittingKind(attempt())).toBe('PRACTICE');
  });
});

describe('attemptHref — each kind opens its OWN home', () => {
  it('sends a finished CAT to its result page, never the runner', () => {
    // ⭐ The defect this replaces: every row went to /session/[id], so
    // "Review" on a 100-question CAT opened the runner at question 100.
    expect(attemptHref(attempt({ ...CAT, attempt_id: 'c9' }))).toBe(
      '/student/bank/cat/result/c9',
    );
    expect(attemptLinkLabel(attempt(CAT))).toBe('CAT result');
  });

  it('sends a finished pack to its report', () => {
    expect(attemptHref(attempt({ ...PACK, attempt_id: 'p3' }))).toBe(
      '/student/bank/packs/report/p3',
    );
    expect(attemptLinkLabel(attempt(PACK))).toBe('Pack report');
  });

  it('sends a practice quiz to the runner in review — its only report', () => {
    expect(attemptHref(attempt({ attempt_id: 'q7' }))).toBe('/session/q7');
    expect(attemptLinkLabel(attempt())).toBe('Review');
  });

  it('resumes an unfinished sitting of ANY kind in the runner', () => {
    // A report page for a sitting with no result would have nothing on it.
    for (const over of [{}, CAT, PACK]) {
      const row = attempt({ ...over, status: 'IN_PROGRESS', attempt_id: 'z1' });
      expect(attemptHref(row)).toBe('/session/z1');
      expect(attemptLinkLabel(row)).toBe('Resume');
    }
  });

  it('gives a discarded sitting no link at all', () => {
    const row = attempt({ status: 'ABANDONED' });
    expect(attemptHref(row)).toBeNull();
    expect(attemptLinkLabel(row)).toBeNull();
  });
});

describe('describeOutcome — three kinds, three vocabularies', () => {
  it('never states a CAT as a percentage (§13.5)', () => {
    // The rule that matters most here. The MVP printed final_score for
    // every row, so a CAT that PASSED at 98% confidence displayed "40%".
    const row = attempt({ ...CAT, final_score: 0.402 });
    const out = describeOutcome(row, stats());
    expect(out).toEqual({ label: 'Above standard', tone: 'good' });
    expect(out?.label).not.toMatch(/%/);
  });

  it('states a below-standard CAT as its verdict', () => {
    expect(describeOutcome(attempt({ mode: 'CAT', cat_verdict: 'BELOW_STANDARD' }))).toEqual(
      { label: 'Below standard', tone: 'low' },
    );
  });

  it('uses the shared unmeasured wording when time ran out under the minimum', () => {
    const row = attempt({
      mode: 'CAT',
      status: 'TIMED_OUT',
      cat_verdict: 'BELOW_STANDARD',
      cat_termination_reason: 'TIME_LIMIT_HIT',
      cat_items_administered: MIN_ITEMS - 1,
    });
    expect(describeOutcome(row)?.label).toBe(UNMEASURED_SHORT_LABEL);
  });

  it('still says Below standard for a timeout that DID reach the minimum', () => {
    const row = attempt({
      mode: 'CAT',
      status: 'TIMED_OUT',
      cat_verdict: 'BELOW_STANDARD',
      cat_termination_reason: 'TIME_LIMIT_HIT',
      cat_items_administered: MIN_ITEMS,
    });
    expect(describeOutcome(row)?.label).toBe('Below standard');
  });

  it('states a pack as its BAND WORD, not a percentage', () => {
    // Our packs have no pass/fail; the band is what the student saw on
    // their own report, so a percentage here would be a second scale.
    expect(describeOutcome(attempt({ ...PACK, final_score: 0.8 }))).toEqual({
      label: 'Ready',
      tone: 'good',
    });
    expect(describeOutcome(attempt({ ...PACK, final_score: 0.4 }))).toEqual({
      label: 'Building',
      tone: 'neutral',
    });
  });

  it('states a practice quiz as a plain percentage in NEUTRAL tone', () => {
    // Colouring a low practice score red would invent a verdict a
    // practice set cannot have.
    expect(describeOutcome(attempt({ final_score: 0.55 }))).toEqual({
      label: '55%',
      tone: 'neutral',
    });
  });

  it('has no result for an unfinished sitting', () => {
    expect(describeOutcome(attempt({ status: 'IN_PROGRESS', final_score: null }))).toBeNull();
  });

  it('says "Not answered" rather than scoring an untouched sitting', () => {
    // A sitting served 6 questions, none answered, scores 0 — which is
    // indistinguishable from genuinely getting six wrong. Grey, not red:
    // not answering is the absence of a result, not a bad one.
    const out = describeOutcome(
      attempt({ final_score: 0 }),
      stats({ answered: 0, served: 6 }),
    );
    expect(out).toEqual({ label: 'Not answered', tone: 'neutral' });
  });

  it('does not apply the not-answered rule to a CAT', () => {
    // A CAT has its own "didn't get far enough" concept (isUnmeasured);
    // two ways of saying it would disagree at the boundary.
    const out = describeOutcome(
      attempt({ ...CAT, final_score: 0 }),
      stats({ answered: 0, served: 6 }),
    );
    expect(out?.label).toBe('Above standard');
  });

  it('still scores normally when no stats are supplied (the dashboard rail)', () => {
    expect(describeOutcome(attempt({ final_score: 0.55 }), null)).toEqual({
      label: '55%',
      tone: 'neutral',
    });
  });
});

describe('answeredDetail — separates "did badly" from "did not finish"', () => {
  it('reports a part-answered sitting', () => {
    expect(answeredDetail(attempt(), stats({ answered: 8, served: 20 }))).toBe(
      '8 of 20 answered',
    );
  });

  it('says nothing when everything was answered', () => {
    expect(answeredDetail(attempt(), stats({ answered: 20, served: 20 }))).toBeNull();
  });

  it('says nothing for a CAT, which has no target length', () => {
    expect(answeredDetail(attempt(CAT), stats({ answered: 40, served: 60 }))).toBeNull();
  });

  it('says nothing for an unfinished sitting — the state pill covers it', () => {
    const row = attempt({ status: 'IN_PROGRESS' });
    expect(answeredDetail(row, stats({ answered: 3, served: 20 }))).toBeNull();
  });

  it('says nothing with no stats at all', () => {
    expect(answeredDetail(attempt(), null)).toBeNull();
  });
});

describe('sittingSummary — only a practice quiz was built from filters', () => {
  it('names a pack rather than summarising empty filters', () => {
    // Running a pack through the filter summariser produced a bare
    // "25 Q" — the least informative thing on the row.
    expect(sittingSummary(attempt(PACK))).toBe('Readiness pack');
  });

  it('reports a CAT by items administered, since its length is variable', () => {
    expect(sittingSummary(attempt({ mode: 'CAT', cat_items_administered: 85 }))).toBe(
      'CAT sitting · 85 items',
    );
    expect(sittingSummary(attempt({ mode: 'CAT', cat_items_administered: null }))).toBe(
      'CAT sitting',
    );
  });

  it('summarises a practice quiz from its saved filters', () => {
    const row = attempt({
      filters_json: { nursing_subject: ['Pharmacology'] },
      actual_count: 25,
    });
    expect(sittingSummary(row)).toBe('Pharmacology · 25 Q');
  });

  it('counts what the sitting ACTUALLY held, not what was asked for', () => {
    // The pool can come up short; showing the request overstates it.
    const row = attempt({ requested_count: 25, actual_count: 18 });
    expect(sittingSummary(row)).toBe('18 Q');
  });
});

describe('sanitiseSearchTerm — search syntax must not leak from the box', () => {
  it('keeps an ordinary term intact', () => {
    expect(sanitiseSearchTerm('  cardiac  ')).toBe('cardiac');
  });

  it('strips the characters PostgREST reads as or=() syntax', () => {
    // A comma or bracket would be parsed as part of the filter list and
    // change which rows match, rather than failing loudly.
    expect(sanitiseSearchTerm('safe, effective (care)')).toBe('safe effective care');
    expect(sanitiseSearchTerm('a*b')).toBe('a b');
  });

  it('reduces a term of pure punctuation to nothing', () => {
    // The caller skips the search entirely on an empty result. Left
    // as-is, the wildcards would build `**` and quietly match everything.
    expect(sanitiseSearchTerm('(),*')).toBe('');
  });
});

describe('formatDuration — absent time is not zero time', () => {
  it('renders nothing when no time was recorded', () => {
    // Most sittings predate per-question timing. "0m" would claim the
    // student finished twenty questions instantly.
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(0)).toBeNull();
  });

  it('renders seconds, minutes and hours', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(600)).toBe('10m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(4320)).toBe('1h 12m');
  });
});

describe('rowTimestamp — an unfinished sitting is described by its last touch', () => {
  it('leads with "Left off" and the last activity while unfinished', () => {
    const row = attempt({
      status: 'IN_PROGRESS',
      created_at: '2026-07-01T10:00:00Z',
      last_activity_at: '2026-07-20T10:00:00Z',
    });
    expect(rowTimestamp(row)).toEqual({
      iso: '2026-07-20T10:00:00Z',
      prefix: 'Left off',
    });
  });

  it('falls back to created_at when no activity was recorded', () => {
    const row = attempt({ status: 'IN_PROGRESS', last_activity_at: null });
    expect(rowTimestamp(row)).toEqual({ iso: row.created_at, prefix: null });
  });

  it('uses the start date for a finished sitting', () => {
    const row = attempt({ last_activity_at: '2026-07-25T10:00:00Z' });
    expect(rowTimestamp(row)).toEqual({ iso: row.created_at, prefix: null });
  });
});
