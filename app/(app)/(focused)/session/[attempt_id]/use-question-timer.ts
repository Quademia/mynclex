// mynclex/app/(app)/(focused)/session/[attempt_id]/use-question-timer.ts
'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  createSegment,
  moveTo,
  pause,
  resume,
  type Segment,
  type TimeFlush,
} from '@/lib/practice/runner/time-tracker';

interface Opts {
  /** attempt_item_id of the question currently on screen, or null. */
  activeItemId: string | null;
  /** Track only while the attempt is live and its clock has started. */
  enabled: boolean;
  /**
   * Persist a banked interval ("+seconds on itemId"). Fire-and-forget for
   * the passive triggers (nav, visibility, unmount); flushActive() awaits
   * it so the finish handlers can guarantee the last segment lands before
   * the attempt goes terminal. Must never throw.
   */
  onFlush: (itemId: string, seconds: number) => void | Promise<void>;
}

// Wires the pure engaged-time tracker (lib/practice/runner/time-tracker)
// to the live runner: opens a new segment when the active question
// changes, pauses on screen-away (Page Visibility) and page-hide, and
// banks the final segment on unmount. performance.now() gives a monotonic
// clock immune to device-clock changes. Returns flushActive() for the
// finish handlers to bank the current segment BEFORE completing the
// attempt — the additive RPC no-ops once the attempt is terminal, so a
// late passive flush would otherwise be lost.
export function useQuestionTimer({ activeItemId, enabled, onFlush }: Opts): {
  flushActive: () => Promise<void>;
} {
  const segRef = useRef<Segment>(createSegment());
  // Latest-callback ref so the effects/handlers always call the current
  // onFlush without re-subscribing. Assigned in an effect (not during
  // render) — it's only ever read post-commit, so this is in time.
  const onFlushRef = useRef(onFlush);
  useEffect(() => {
    onFlushRef.current = onFlush;
  });

  const emit = useCallback((flush: TimeFlush | null) => {
    if (flush) void onFlushRef.current(flush.itemId, flush.seconds);
  }, []);

  // Active-question changes: bank the previous segment, open the new one.
  // When disabled (review mode, or before Start) the target is null so
  // nothing is counted.
  useEffect(() => {
    const now = performance.now();
    const target = enabled ? activeItemId : null;
    const { seg, flush } = moveTo(segRef.current, target, now);
    segRef.current = seg;
    emit(flush);
  }, [activeItemId, enabled, emit]);

  // Screen-away pause / resume + page-hide final flush.
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      const now = performance.now();
      if (document.hidden) {
        const { seg, flush } = pause(segRef.current, now);
        segRef.current = seg;
        emit(flush);
      } else {
        segRef.current = resume(segRef.current, now);
      }
    };
    const onPageHide = () => {
      const now = performance.now();
      const { seg, flush } = pause(segRef.current, now);
      segRef.current = seg;
      emit(flush);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [enabled, emit]);

  // Final flush on unmount (router.refresh() after finish tears the runner
  // down; this banks whatever segment was still open).
  useEffect(() => {
    return () => {
      const now = performance.now();
      const { flush } = pause(segRef.current, now);
      emit(flush);
    };
  }, [emit]);

  // Bank the current segment now and await the write, then reopen so time
  // keeps counting if the sitting continues. Called by the finish handlers
  // just before completeAttemptAction / expireAttemptAction.
  const flushActive = useCallback(async () => {
    const now = performance.now();
    const { seg, flush } = pause(segRef.current, now);
    if (flush) await onFlushRef.current(flush.itemId, flush.seconds);
    segRef.current = resume(seg, now);
  }, []);

  return { flushActive };
}
