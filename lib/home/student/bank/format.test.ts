// mynclex/lib/home/student/bank/format.test.ts
//
// The Bank Dashboard's pure derivations. Several of these exist to hold
// an honesty decision in place — the access bar must not invent a
// denominator, and the streak strip must not disagree with the number
// printed beside it. Those are the cases worth a test.

import { describe, expect, it } from 'vitest';
import { accessCard, bankStreak, streakCaption, todayLabel } from './format';
import { activeDayFlags, studyStreak } from '../streak';

const DAY = 86_400_000;
/** Thursday 23 July 2026, midday UTC. */
const NOW = Date.UTC(2026, 6, 23, 12, 0, 0);
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

describe('todayLabel', () => {
  it('renders weekday, day and month with the comma the design shows', () => {
    expect(todayLabel(new Date(NOW))).toBe('Thursday, 23 July');
  });
});

describe('accessCard', () => {
  it('derives the bar from the window that produced the number', () => {
    const card = accessCard(42, 90);
    expect(card).toEqual({
      daysLeft: 42,
      windowDays: 90,
      label: 'Bank 90-day',
      percentLeft: 47,
    });
  });

  it('names which pass is counting down, so stacked passes are legible', () => {
    expect(accessCard(59, 60)?.label).toBe('Bank 60-day');
    expect(accessCard(12, 30)?.label).toBe('Bank 30-day');
  });

  // The honesty case: a legacy row with no started_at gives no window,
  // and a bar without a real denominator would be a made-up picture of
  // how much access is left.
  it('shows no bar when there is no window length', () => {
    const card = accessCard(42, null);
    expect(card?.percentLeft).toBeNull();
    expect(card?.label).toBe('Bank access');
  });

  it('clamps rather than overflowing when days exceed the window', () => {
    expect(accessCard(95, 90)?.percentLeft).toBe(100);
  });

  it('returns null when there is nothing counting down', () => {
    expect(accessCard(null, 90)).toBeNull();
  });
});

describe('streakCaption', () => {
  it('invites a first streak', () => {
    expect(streakCaption(0, 0)).toBe('Answer a question today to start your streak');
  });

  it('distinguishes a lapsed streak from never having had one', () => {
    expect(streakCaption(0, 6)).toContain('lapsed');
  });

  it('celebrates matching or beating the best rather than reporting a gap of 0', () => {
    expect(streakCaption(6, 6)).toBe('Your best run yet — keep it alive today');
  });

  it('counts the gap to the best, singular and plural', () => {
    expect(streakCaption(5, 6)).toBe('1 day off your best — keep it alive today');
    expect(streakCaption(2, 6)).toBe('4 days off your best — keep it alive today');
  });
});

describe('bankStreak', () => {
  it('holds the run when the last study day was yesterday (a day of grace)', () => {
    const s = bankStreak([daysAgo(1), daysAgo(2)], NOW);
    expect(s.current).toBe(2);
  });

  it('counts several attempts on one day as one day', () => {
    const sameDay = [daysAgo(0), daysAgo(0), daysAgo(0)];
    expect(bankStreak(sameDay, NOW).current).toBe(1);
  });

  // The strip and the number come from one feed precisely so they
  // cannot tell different stories; this pins that down.
  it('draws a week strip that agrees with the current run', () => {
    const s = bankStreak([daysAgo(0), daysAgo(1), daysAgo(4)], NOW);
    expect(s.days).toEqual([false, false, true, false, false, true, true]);
    expect(s.current).toBe(2);
    expect(s.days[6]).toBe(true); // today, the last cell
  });

  it('is empty but not broken for a student with no bank attempts', () => {
    const s = bankStreak([], NOW);
    expect(s).toMatchObject({ current: 0, best: 0 });
    expect(s.days).toEqual([false, false, false, false, false, false, false]);
  });
});

describe('studyStreak (shared with the programme home)', () => {
  it('drops the run once the gap exceeds the day of grace', () => {
    expect(studyStreak([daysAgo(2), daysAgo(3)], NOW)).toEqual({ current: 0, best: 2 });
  });

  it('remembers the longest run even when the current one is shorter', () => {
    const times = [
      daysAgo(10), daysAgo(9), daysAgo(8), daysAgo(7), // a run of 4
      daysAgo(1), daysAgo(0), // and the current run of 2
    ];
    expect(studyStreak(times, NOW)).toEqual({ current: 2, best: 4 });
  });

  it('ignores timestamps it cannot parse rather than throwing', () => {
    expect(studyStreak(['not-a-date', daysAgo(0)], NOW)).toEqual({ current: 1, best: 1 });
  });
});

describe('activeDayFlags', () => {
  it('runs oldest-first and ends on today', () => {
    expect(activeDayFlags([daysAgo(6), daysAgo(0)], NOW, 7)).toEqual([
      true, false, false, false, false, false, true,
    ]);
  });

  it('ignores activity older than the window', () => {
    expect(activeDayFlags([daysAgo(30)], NOW, 7)).toEqual([
      false, false, false, false, false, false, false,
    ]);
  });
});
