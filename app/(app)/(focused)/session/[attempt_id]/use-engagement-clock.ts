// mynclex/app/(app)/(focused)/session/[attempt_id]/use-engagement-clock.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Opts {
  /**
   * Track only for a live (STUDY, TIMED_FREE_NAV) attempt with a started
   * clock. False for every other mode / review / before Start → the hook
   * counts nothing and just returns priorEngagedSec unchanged.
   */
  enabled: boolean;
  /**
   * Engaged seconds already banked on the attempt row from earlier sittings
   * (server's engaged_seconds_used). The live total is this plus whatever is
   * accrued in THIS browser session. Read once at mount.
   */
  priorEngagedSec: number;
  /** The attempt whose engaged total we persist. */
  attemptId: string;
  /**
   * Persist the running engaged total ("used N seconds"). Fire-and-forget for
   * the passive saves (visibility-hide, pagehide); persistNow() is what the
   * runner's submit / navigation handlers call. The server RPC is monotonic +
   * mode-guarded, so a stale or out-of-order save is harmless. Must never
   * throw.
   */
  onPersist: (attemptId: string, engagedSec: number) => void | Promise<void>;
}

// The engagement clock (BUILD_LIST #6). Counts ENGAGED seconds — time the
// student is actually present and working — and freezes while the page is
// hidden (tab-switch, screen-off, backgrounded, closed). Reuses the SAME
// "away" signal as the per-question time engine (Page Visibility API) but is a
// completely separate accumulator with its own state — copy the idea, not the
// machinery. performance.now() gives a monotonic clock immune to device-clock
// changes, so away-time can never be gamed by moving the system time.
//
// The live total is: priorEngagedSec (server) + completed visible segments
// this session + the currently-open segment (if visible). It is persisted at
// the natural moments — the runner calls persistNow() on submit / navigation,
// and this hook saves on visibility-hide and pagehide. No background heartbeat:
// a device dying mid-question forgives that one question's engaged time, which
// lands in the student's favour (see BUILD_LIST #6).
export function useEngagementClock({
  enabled,
  priorEngagedSec,
  attemptId,
  onPersist,
}: Opts): { engagedSec: number; persistNow: () => void } {
  // Engaged seconds banked before this browser session (read once).
  const priorRef = useRef(priorEngagedSec);
  // Completed visible-segment seconds accrued THIS session.
  const accRef = useRef(0);
  // performance.now() when the current visible segment opened; null while
  // hidden / stopped.
  const segStartRef = useRef<number | null>(null);

  const [engagedSec, setEngagedSec] = useState(priorEngagedSec);

  // Latest-callback ref so the effect/handlers always call the current
  // onPersist without re-subscribing. Assigned post-commit — only read from
  // event handlers, so it's in time.
  const onPersistRef = useRef(onPersist);
  useEffect(() => {
    onPersistRef.current = onPersist;
  });

  // The live engaged total, including any open segment.
  const compute = useCallback(() => {
    const open =
      segStartRef.current !== null
        ? (performance.now() - segStartRef.current) / 1000
        : 0;
    return priorRef.current + accRef.current + open;
  }, []);

  const persist = useCallback(
    (value: number) => {
      void onPersistRef.current(attemptId, Math.floor(value));
    },
    [attemptId],
  );

  // Close the open segment into the accumulator (idempotent — a no-op if
  // already closed). Returns the current total.
  const closeSegment = useCallback((now: number) => {
    if (segStartRef.current !== null) {
      accRef.current += (now - segStartRef.current) / 1000;
      segStartRef.current = null;
    }
    return priorRef.current + accRef.current;
  }, []);

  // Exposed to the runner: save the up-to-the-moment total without disturbing
  // the running segment. Called on submit / navigation.
  const persistNow = useCallback(() => {
    if (!enabled) return;
    persist(compute());
  }, [enabled, persist, compute]);

  useEffect(() => {
    if (!enabled) return;

    // Open a segment now if the page is currently visible. No setState here —
    // at this instant the engaged total equals priorEngagedSec (the initial
    // state), so there is nothing to update; the tick below drives every
    // subsequent change (and setState in an effect body is disallowed anyway).
    if (!document.hidden) {
      segStartRef.current = performance.now();
    }

    // 1s display tick — only meaningful while a segment is open (visible).
    const tick = setInterval(() => {
      if (segStartRef.current !== null) setEngagedSec(compute());
    }, 1000);

    const onVisibility = () => {
      const now = performance.now();
      if (document.hidden) {
        // Stepped away → freeze: close the segment, snapshot, and persist so
        // the total survives a full close from here.
        const total = closeSegment(now);
        setEngagedSec(total);
        persist(total);
      } else {
        // Came back → resume counting.
        segStartRef.current = performance.now();
      }
    };

    const onPageHide = () => {
      const total = closeSegment(performance.now());
      persist(total);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      clearInterval(tick);
      // Bank + persist whatever segment was open on teardown (router.refresh
      // after finish tears the runner down; the finish handler has already
      // persisted, and the server RPC no-ops once terminal, so this is a safe
      // belt-and-braces).
      const total = closeSegment(performance.now());
      persist(total);
    };
  }, [enabled, compute, closeSegment, persist]);

  return { engagedSec, persistNow };
}
