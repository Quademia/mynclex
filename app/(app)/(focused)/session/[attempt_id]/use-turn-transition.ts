// mynclex/app/(app)/(focused)/session/[attempt_id]/use-turn-transition.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  transitionPhase,
  nextThresholdMs,
  type TurnStatus,
  type TransitionPhase,
} from '@/lib/practice/cat/turn-transition';

// Drives the pure CAT transition machine (lib/practice/cat/turn-transition)
// with a real clock (slice 6c). The runner calls begin() when a turn is
// submitted, fail() if it errors, and reset() when the next question arrives.
//
// It schedules a setTimeout toward each escalation threshold rather than
// ticking every frame: the phase only CHANGES at 300ms / 3s / 10s, so between
// them there is nothing to re-render. performance.now() is the monotonic clock
// (immune to device-clock changes), consistent with useQuestionTimer.
export function useTurnTransition(): {
  phase: TransitionPhase;
  begin: () => void;
  fail: () => void;
  reset: () => void;
} {
  const [status, setStatus] = useState<TurnStatus>({ kind: 'idle' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const begin = useCallback(() => {
    clear();
    const start = performance.now();
    setStatus({ kind: 'running', elapsedMs: 0 });

    // Re-fire just past each threshold, recompute the real elapsed, and
    // schedule the next. Stops once nextThresholdMs returns null (past 10s —
    // nothing more to escalate to, and no reason to keep a timer alive).
    const tick = () => {
      const elapsed = performance.now() - start;
      setStatus({ kind: 'running', elapsedMs: elapsed });
      const next = nextThresholdMs(elapsed);
      if (next === null) return;
      timerRef.current = setTimeout(tick, Math.max(0, next - elapsed) + 1);
    };
    const first = nextThresholdMs(0);
    if (first !== null) timerRef.current = setTimeout(tick, first + 1);
  }, [clear]);

  const fail = useCallback(() => {
    clear();
    setStatus({ kind: 'error' });
  }, [clear]);

  const reset = useCallback(() => {
    clear();
    setStatus({ kind: 'idle' });
  }, [clear]);

  // Never leak a pending timer if the runner unmounts mid-turn.
  useEffect(() => clear, [clear]);

  return { phase: transitionPhase(status), begin, fail, reset };
}
