// mynclex/lib/home/student/bank/rail.test.ts
//
// The right rail's two pure builders. Most of these tests exist to hold
// a settled wording decision in place — the prototype got each of them
// wrong in a way that would have put a word on the dashboard that the
// surface it links to contradicts.

import { describe, expect, it } from 'vitest';
import { buildDoorways } from './doorways';
import { recentItems } from './recent';
import { UNMEASURED_SHORT_LABEL } from '@/lib/practice/cat/report-derive';
import type { HistoryAttempt } from '@/lib/practice/history/types';

const when = () => '2 days ago';

function attempt(over: Partial<HistoryAttempt> = {}): HistoryAttempt {
  return {
    attempt_id: 'a1',
    created_at: '2026-07-21T10:00:00Z',
    last_activity_at: null,
    status: 'COMPLETED',
    source: 'CUSTOM_BUILT',
    mode: 'TIMED_SEQUENTIAL',
    mode_label: 'Timed · Sequential',
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

describe('recentItems — the result badge', () => {
  it('shows a practice score as a plain percentage in NEUTRAL styling', () => {
    // The prototype rendered 55% in fail-red. A practice set has no
    // pass mark, so a red pill invents a verdict.
    const [row] = recentItems([attempt({ final_score: 0.55 })], when);
    expect(row.badge).toEqual({ label: '55%', tone: 'neutral' });
  });

  it('shows a readiness pack as its BAND WORD, never "Passed"', () => {
    // Our packs have no pass/fail — they return one of four bands.
    const [row] = recentItems(
      [attempt({ source: 'READINESS_PACK', final_score: 0.78 })],
      when,
    );
    expect(row.badge?.label).toBe('Ready');
    expect(row.badge?.label).not.toBe('Passed');
  });

  it('uses the lower band words plainly rather than alarmingly', () => {
    const [low] = recentItems(
      [attempt({ source: 'READINESS_PACK', final_score: 0.4 })],
      when,
    );
    expect(low.badge).toEqual({ label: 'Building', tone: 'neutral' });
  });

  it('shows a CAT as its verdict, and never as a percentage (§13.5)', () => {
    const [row] = recentItems(
      [attempt({ mode: 'CAT', cat_verdict: 'ABOVE_STANDARD', final_score: 0.416 })],
      when,
    );
    expect(row.badge).toEqual({ label: 'Above standard', tone: 'good' });
    expect(row.badge?.label).not.toContain('%');
  });

  it('has only two CAT verdicts — there is no "At standard"', () => {
    const [below] = recentItems(
      [attempt({ mode: 'CAT', cat_verdict: 'BELOW_STANDARD' })],
      when,
    );
    expect(below.badge?.label).toBe('Below standard');
  });

  // The shared predicate exists so the report, the CAT home and this
  // row describe one sitting the same way. Re-deriving it here is how
  // they'd drift.
  it('routes a timed-out sub-minimum CAT through the shared unmeasured wording', () => {
    const [row] = recentItems(
      [
        attempt({
          mode: 'CAT',
          cat_verdict: 'BELOW_STANDARD',
          cat_termination_reason: 'TIME_LIMIT_HIT',
          cat_items_administered: 48,
        }),
      ],
      when,
    );
    expect(row.badge?.label).toBe(UNMEASURED_SHORT_LABEL);
  });

  it('still says "Below standard" for a timeout that DID reach the minimum', () => {
    const [row] = recentItems(
      [
        attempt({
          mode: 'CAT',
          cat_verdict: 'BELOW_STANDARD',
          cat_termination_reason: 'TIME_LIMIT_HIT',
          cat_items_administered: 120,
        }),
      ],
      when,
    );
    expect(row.badge?.label).toBe('Below standard');
  });

  it('reports state before result for an unfinished sitting', () => {
    const [row] = recentItems(
      [attempt({ status: 'IN_PROGRESS', final_score: null })],
      when,
    );
    expect(row.badge).toEqual({ label: 'In progress', tone: 'neutral' });
  });
});

describe('recentItems — titles and shape', () => {
  it('titles a practice quiz by MODE, with no invented subject', () => {
    const [row] = recentItems([attempt({ mode_label: 'Untimed Learning' })], when);
    expect(row.title).toBe('Untimed Learning');
  });

  it('names the other two sources for what they are', () => {
    const [pack] = recentItems([attempt({ source: 'READINESS_PACK' })], when);
    const [cat] = recentItems([attempt({ mode: 'CAT' })], when);
    expect(pack.title).toBe('Readiness pack');
    expect(cat.title).toBe('CAT sitting');
  });

  it('counts a CAT in items administered, not in questions requested', () => {
    const [row] = recentItems(
      [attempt({ mode: 'CAT', cat_items_administered: 85, requested_count: 0 })],
      when,
    );
    expect(row.meta).toContain('85 items');
  });

  it('caps at three rows', () => {
    const rows = [attempt({ attempt_id: 'a' }), attempt({ attempt_id: 'b' }), attempt({ attempt_id: 'c' }), attempt({ attempt_id: 'd' })];
    expect(recentItems(rows, when)).toHaveLength(3);
  });
});

describe('buildDoorways', () => {
  const base = {
    bankTotal: 2361,
    casesAvailable: 37,
    creditsReady: 0,
    catsTaken: 0,
    lastCatLabel: null,
    sessions: 0,
  };

  it('thousand-separates the bank total', () => {
    const [bank] = buildDoorways(base);
    expect(bank.sub).toBe('2,361 questions available');
  });

  // The count comes from an RPC that can fail; a door with no number
  // still opens, but it must not guess one.
  it('says nothing rather than guessing when the count is unavailable', () => {
    const [bank] = buildDoorways({ ...base, bankTotal: null });
    expect(bank.sub).toBeNull();
  });

  it('only draws attention to credits when some are actually waiting', () => {
    const quiet = buildDoorways(base).find((d) => d.key === 'packs')!;
    expect(quiet.sub).toBeNull();
    expect(quiet.tone).toBe('default');

    const loud = buildDoorways({ ...base, creditsReady: 3 }).find((d) => d.key === 'packs')!;
    expect(loud.sub).toBe('3 credits ready');
    expect(loud.tone).toBe('attention');
  });

  it('singularises one credit', () => {
    const one = buildDoorways({ ...base, creditsReady: 1 }).find((d) => d.key === 'packs')!;
    expect(one.sub).toBe('1 credit ready');
  });

  it('says a CAT has not been taken rather than showing an empty door', () => {
    const cat = buildDoorways(base).find((d) => d.key === 'cat')!;
    expect(cat.sub).toBe('Not taken yet');
  });

  it('pairs the CAT count with the last verdict once there is one', () => {
    const cat = buildDoorways({ ...base, catsTaken: 3, lastCatLabel: 'Above standard' }).find(
      (d) => d.key === 'cat',
    )!;
    expect(cat.sub).toBe('3 taken · Above standard');
  });

  it('opens the case bank with a real count, beside the Question Bank', () => {
    const doors = buildDoorways(base);
    const cases = doors.find((d) => d.key === 'cases')!;
    expect(cases.sub).toBe('37 cases available');
    expect(cases.href).toBe('/student/bank/cases');
    expect(cases.tone).toBe('default');
    // Same act as the Question Bank, so it sits next to it — and in the
    // same order as the sidebar.
    expect(doors.findIndex((d) => d.key === 'cases'))
      .toBe(doors.findIndex((d) => d.key === 'bank') + 1);
  });

  it('drops the case sub-line rather than inventing one when the count fails', () => {
    const cases = buildDoorways({ ...base, casesAvailable: null })
      .find((d) => d.key === 'cases')!;
    expect(cases.sub).toBeNull();
    expect(cases.href).toBe('/student/bank/cases');
  });

  // Removed 2026-07-30 with its placeholder route. The door was locked
  // because the pillar was never built; a door to nowhere earned its
  // place less than one that goes somewhere real.
  it('no longer carries a Journey Tracker door', () => {
    expect(buildDoorways(base).some((d) => d.key === 'journey')).toBe(false);
  });

  it('every remaining door goes somewhere', () => {
    for (const d of buildDoorways(base)) {
      expect(d.href, `${d.key} has no destination`).toBeTruthy();
    }
  });
});
