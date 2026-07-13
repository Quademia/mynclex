// mynclex/lib/practice/runner/time-tracker.ts
//
// Pure per-question engaged-time accumulator for the runner — the
// "per-question time engine" (attempt-creation §6.3.2). Deliberate
// sibling to clock.ts: clock.ts is the ATTEMPT clock (topbar countdown /
// stopwatch, wall-clock, governs the exam); this is the PER-QUESTION
// engine (engagement time, pauses on screen-away, feeds the report /
// analytics). The two are independent and, by design, do NOT sum.
//
// Intentionally pure and browser-free — the caller supplies a monotonic
// timestamp (performance.now(), in ms) on every call — so the segment
// logic is unit-testable without a DOM. The React wiring (Page-Visibility
// listener, active-item tracking, network flush) lives in the
// use-question-timer hook next to runner.tsx.
//
// Model: at most one "engaged segment" is open at a time — the stretch
// where a single question is the active one AND the screen is visible.
// Banking a segment yields whole seconds of engaged time for that
// question (sub-second remainder dropped — ≤1s per segment, negligible
// over a sitting). The server accumulates deltas additively, so the
// tracker only ever emits "+N seconds for item X" and forgets it.

export interface Segment {
  /** The question whose engaged time is currently being counted, or null. */
  itemId:    string | null;
  /** Monotonic ms timestamp the open segment began; null when paused/closed. */
  startedAt: number | null;
}

/** A banked interval ready to persist: "+seconds engaged on itemId". */
export interface TimeFlush {
  itemId:  string;
  seconds: number;
}

export function createSegment(): Segment {
  return { itemId: null, startedAt: null };
}

// Bank the currently-open segment (if any): returns the whole seconds
// engaged and a segment with the clock stopped (itemId retained so a
// later resume() reopens the same question). Emits a flush only when an
// item was open and at least a whole second elapsed.
export function bank(seg: Segment, nowMs: number): { seg: Segment; flush: TimeFlush | null } {
  if (seg.itemId === null || seg.startedAt === null) {
    return { seg, flush: null };
  }
  const seconds = Math.floor((nowMs - seg.startedAt) / 1000);
  const stopped: Segment = { itemId: seg.itemId, startedAt: null };
  if (seconds < 1) {
    return { seg: stopped, flush: null };
  }
  return { seg: stopped, flush: { itemId: seg.itemId, seconds } };
}

// Switch the active question: bank the previous segment, then open a
// fresh one for `itemId` (or leave closed when itemId is null — e.g.
// leaving the runner or tracking disabled).
export function moveTo(
  seg: Segment,
  itemId: string | null,
  nowMs: number,
): { seg: Segment; flush: TimeFlush | null } {
  const { flush } = bank(seg, nowMs);
  const next: Segment =
    itemId === null ? { itemId: null, startedAt: null } : { itemId, startedAt: nowMs };
  return { seg: next, flush };
}

// Pause (the screen went away): bank the open segment but keep itemId so
// resume() can reopen the same question.
export function pause(seg: Segment, nowMs: number): { seg: Segment; flush: TimeFlush | null } {
  return bank(seg, nowMs);
}

// Resume (the screen came back): reopen the retained question, but only
// when genuinely paused (startedAt null). Idempotent when already open —
// never resets an in-flight segment's clock — and a no-op when there is
// no retained question.
export function resume(seg: Segment, nowMs: number): Segment {
  if (seg.itemId === null || seg.startedAt !== null) return seg;
  return { itemId: seg.itemId, startedAt: nowMs };
}
