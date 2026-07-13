// mynclex/lib/practice/runner/time-tracker.test.ts
import { describe, it, expect } from 'vitest';
import {
  createSegment,
  bank,
  moveTo,
  pause,
  resume,
} from './time-tracker';

describe('time-tracker — bank', () => {
  it('banks nothing when no segment is open', () => {
    const { seg, flush } = bank(createSegment(), 5000);
    expect(flush).toBeNull();
    expect(seg).toEqual({ itemId: null, startedAt: null });
  });

  it('emits whole engaged seconds and stops the clock (itemId retained)', () => {
    const open = { itemId: 'q1', startedAt: 1000 };
    const { seg, flush } = bank(open, 1000 + 14_500); // 14.5s
    expect(flush).toEqual({ itemId: 'q1', seconds: 14 }); // floor, remainder dropped
    expect(seg).toEqual({ itemId: 'q1', startedAt: null });
  });

  it('drops a sub-second segment (no flush) but still stops the clock', () => {
    const { seg, flush } = bank({ itemId: 'q1', startedAt: 1000 }, 1400); // 0.4s
    expect(flush).toBeNull();
    expect(seg).toEqual({ itemId: 'q1', startedAt: null });
  });
});

describe('time-tracker — moveTo', () => {
  it('opens a fresh segment from empty with no flush', () => {
    const { seg, flush } = moveTo(createSegment(), 'q1', 2000);
    expect(flush).toBeNull();
    expect(seg).toEqual({ itemId: 'q1', startedAt: 2000 });
  });

  it('banks the previous question then opens the next', () => {
    const open = { itemId: 'q1', startedAt: 0 };
    const { seg, flush } = moveTo(open, 'q2', 30_000); // 30s on q1
    expect(flush).toEqual({ itemId: 'q1', seconds: 30 });
    expect(seg).toEqual({ itemId: 'q2', startedAt: 30_000 });
  });

  it('closes the segment when moving to null (tracking disabled / leaving)', () => {
    const open = { itemId: 'q1', startedAt: 0 };
    const { seg, flush } = moveTo(open, null, 5000);
    expect(flush).toEqual({ itemId: 'q1', seconds: 5 });
    expect(seg).toEqual({ itemId: null, startedAt: null });
  });
});

describe('time-tracker — pause / resume (screen-away excludes the gap)', () => {
  it('pause banks the open segment and keeps itemId for resume', () => {
    const open = { itemId: 'q1', startedAt: 1000 };
    const { seg, flush } = pause(open, 1000 + 10_000);
    expect(flush).toEqual({ itemId: 'q1', seconds: 10 });
    expect(seg).toEqual({ itemId: 'q1', startedAt: null });
  });

  it('resume reopens the retained question at the current clock', () => {
    const paused = { itemId: 'q1', startedAt: null };
    expect(resume(paused, 99_000)).toEqual({ itemId: 'q1', startedAt: 99_000 });
  });

  it('resume is a no-op when already open (never resets an in-flight clock)', () => {
    const open = { itemId: 'q1', startedAt: 1000 };
    expect(resume(open, 99_000)).toBe(open);
  });

  it('resume is a no-op when there is no retained question', () => {
    const empty = createSegment();
    expect(resume(empty, 99_000)).toBe(empty);
  });

  it('a 40s away-gap is NOT counted — only engaged stretches sum', () => {
    // Enter q1 at t=0, engage 20s, screen away for 40s, back, engage 15s more.
    let seg = createSegment();
    let total = 0;

    ({ seg } = moveTo(seg, 'q1', 0));            // open q1 @0
    let r = pause(seg, 20_000);                  // engaged 20s, then away
    seg = r.seg;
    total += r.flush?.seconds ?? 0;              // +20

    seg = resume(seg, 60_000);                   // back @60s (40s gap ignored)
    r = pause(seg, 75_000);                      // engaged another 15s
    seg = r.seg;
    total += r.flush?.seconds ?? 0;              // +15

    expect(total).toBe(35); // 20 + 15 — the 40s away-gap excluded
  });
});
