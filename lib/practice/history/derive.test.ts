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
  reportHref,
  reportLinkLabel,
  resumeHref,
  reviewClosedForPack,
  reviewHref,
  canDiscard,
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

describe('the row actions — the SAME pair on every finished sitting', () => {
  // Previously one link whose destination depended on kind, so a pack and a
  // CAT advertised their report while a practice quiz advertised the runner —
  // leaving the practice report reachable only by clicking the result cell.

  it('reports each kind to its own report page', () => {
    expect(reportHref(attempt({ ...CAT, attempt_id: 'c9' }))).toBe(
      '/student/bank/cat/result/c9',
    );
    expect(reportHref(attempt({ ...PACK, attempt_id: 'p3' }))).toBe(
      '/student/bank/packs/report/p3',
    );
    expect(reportHref(attempt({ attempt_id: 'q7' }))).toBe(
      '/student/bank/session/report/q7',
    );
  });

  it('labels the report link uniformly, since the Type pill says the kind', () => {
    expect(reportLinkLabel()).toBe('Report');
  });

  it('offers review of the answers for all three kinds', () => {
    for (const over of [{}, CAT, PACK]) {
      expect(reviewHref(attempt({ ...over, attempt_id: 'z1' }), true)).toBe('/session/z1');
    }
  });

  it('⭐ withholds review on a pack whose 21-day window has CLOSED', () => {
    // /session/[id] redirects an expired pack to its report, so offering
    // Review there would be a link that bounces — the same defect the
    // dashboard rail carried.
    const row = attempt({ ...PACK, attempt_id: 'p9' });
    expect(reviewHref(row, false)).toBeNull();
    expect(reviewClosedForPack(row, false)).toBe(true);
  });

  it('⭐ treats an UNKNOWN pack window as closed, mirroring the runner', () => {
    // The runner does reviewWindowOpen(credit?.expires_at ?? null), so a
    // MISSING credit row is expired to it. Measured on dev: most pack
    // attempts have no credit row at all, so a permissive default here would
    // have offered Review on nearly every pack row and bounced every one.
    const row = attempt({ ...PACK, attempt_id: 'p9' });
    expect(reviewHref(row, null)).toBeNull();
    expect(reviewClosedForPack(row, null)).toBe(true);
  });

  it('never applies the pack window to a practice quiz or a CAT', () => {
    expect(reviewHref(attempt({ attempt_id: 'q1' }), false)).toBe('/session/q1');
    expect(reviewHref(attempt({ ...CAT, attempt_id: 'c1' }), false)).toBe('/session/c1');
    expect(reviewClosedForPack(attempt(), false)).toBe(false);
  });

  it('offers only Resume while a sitting of any kind is unfinished', () => {
    // A report for a sitting with no result would have nothing on it.
    for (const over of [{}, CAT, PACK]) {
      const row = attempt({ ...over, status: 'IN_PROGRESS', attempt_id: 'z1' });
      expect(resumeHref(row)).toBe('/session/z1');
      expect(reportHref(row)).toBeNull();
      expect(reviewHref(row, true)).toBeNull();
    }
  });

  it('gives a discarded sitting nothing at all', () => {
    const row = attempt({ status: 'ABANDONED' });
    expect(resumeHref(row)).toBeNull();
    expect(reportHref(row)).toBeNull();
    expect(reviewHref(row, true)).toBeNull();
    expect(reviewClosedForPack(row, false)).toBe(false);
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

describe('canDiscard — must agree with nclex_discard_attempt', () => {
  // These four cases are the same four the database function enforces,
  // proven against real rows under rollback. If they drift, the page
  // offers a button the database then refuses — worse than no button.

  it('allows an unfinished practice sitting', () => {
    expect(canDiscard(attempt({ status: 'IN_PROGRESS' }))).toBe(true);
  });

  it('refuses a FINISHED sitting — it is a record with a report', () => {
    expect(canDiscard(attempt({ status: 'COMPLETED' }))).toBe(false);
    expect(canDiscard(attempt({ status: 'TIMED_OUT' }))).toBe(false);
  });

  it('refuses an unfinished PACK — discarding forfeits a paid credit', () => {
    expect(canDiscard(attempt({ ...PACK, status: 'IN_PROGRESS' }))).toBe(false);
  });

  it('refuses an unfinished CAT — an exam has its own lifecycle', () => {
    expect(canDiscard(attempt({ mode: 'CAT', status: 'IN_PROGRESS' }))).toBe(false);
  });

  it('refuses an already-discarded sitting', () => {
    expect(canDiscard(attempt({ status: 'ABANDONED' }))).toBe(false);
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
