// mynclex/lib/practice/runner/clock.ts
//
// Clock-pill helpers for the runner topbar (slice 4.5a). Per
// runner.html §8 (settled), a single format function is shared
// between the untimed-stopwatch and timed-countdown variants:
//
//   • mm:ss   for any time under 1 hour     (e.g. "14:32")
//   • h:mm:ss for any time at or over 1 hr  (e.g. "1:00:00", "2:34:18")
//
// Tier derivation per §8.4 — warnings fire conditional on the
// attempt's total duration:
//
//   • 30-min tier fires only when duration_seconds ≥ 60 min
//   • 15-min tier fires only when duration_seconds ≥ 30 min
//   •  5-min tier fires only when duration_seconds ≥ 10 min
//   •  1-min tier fires for any timed attempt
//
// The tier number itself (30/15/5/1) IS the threshold in minutes.
// `tierFor(remainingSeconds, durationSeconds)` returns the tightest
// applicable tier given those rules — null when no tier applies
// (untimed, or timed with remaining > 30 min).

const HOUR_SECONDS = 3600;
const MINUTE_SECONDS = 60;

// Format an elapsed-or-remaining duration in seconds. Negative input
// clamps to 0:00 (defensive — countdown briefly going negative on
// expiry should still render zero, not "−0:01"). Float input rounds
// to whole seconds before formatting.
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(total / HOUR_SECONDS);
  const mm = Math.floor((total % HOUR_SECONDS) / MINUTE_SECONDS);
  const ss = total % MINUTE_SECONDS;

  const ssPad = ss.toString().padStart(2, '0');

  if (hh === 0) {
    return `${mm}:${ssPad}`;
  }
  const mmPad = mm.toString().padStart(2, '0');
  return `${hh}:${mmPad}:${ssPad}`;
}


// Warning tiers — values are in minutes, ordered most-permissive to
// strictest. Pairs (tier, minDurationMin) so tier-firing depends on
// the attempt's full duration. The tier value is also the
// remaining-minutes threshold ("fires when remaining ≤ tier").
export type WarningTier = 30 | 15 | 5 | 1;

const TIER_RULES: Array<{ tier: WarningTier; minDurationMin: number }> = [
  { tier: 30, minDurationMin: 60 },  // 30-min warning needs ≥ 1 hr attempt
  { tier: 15, minDurationMin: 30 },  // 15-min warning needs ≥ 30 min attempt
  { tier:  5, minDurationMin: 10 },  //  5-min warning needs ≥ 10 min attempt
  { tier:  1, minDurationMin:  0 },  //  1-min warning fires for any timed
];

// Resolve the tightest tier currently triggered by the given remaining
// time + total duration. Returns null when no tier applies — the pill
// should render in neutral tone in that case.
//
// "Tightest" = lowest tier whose threshold has been crossed. So if 5
// minutes remain in a 60-min attempt, the result is 5 (not 30) — even
// though 30 has been "crossed" since 25 min ago, 5 is the more urgent
// signal. The escalates-only behaviour from §8.4 (tone never reverts)
// is enforced at the consumer side via a sticky max-tier-fired ref;
// this function is pure and independent of history.
export function tierFor(
  remainingSeconds: number | null,
  durationSeconds: number | null,
): WarningTier | null {
  if (remainingSeconds === null || durationSeconds === null) return null;

  const remainingMin = remainingSeconds / MINUTE_SECONDS;
  const durationMin  = durationSeconds  / MINUTE_SECONDS;

  // Iterate in tier-strictness order (1 last). Return the strictest
  // crossed tier whose minDurationMin gate is also satisfied.
  for (let i = TIER_RULES.length - 1; i >= 0; i--) {
    const { tier, minDurationMin } = TIER_RULES[i]!;
    if (durationMin < minDurationMin)         continue;
    if (remainingMin > tier)                  continue;
    return tier;
  }
  return null;
}


// Compare two tiers under the escalates-only rule. Returns true when
// `next` is at-or-stricter-than `prev` — i.e. the tone should advance.
// null is treated as the loosest possible tone (neutral). Used by the
// sticky max-tier-fired logic in the topbar.
export function tierIsStricter(
  next: WarningTier | null,
  prev: WarningTier | null,
): boolean {
  if (next === null) return false;
  if (prev === null) return true;
  // Lower number = stricter (e.g. 1 is stricter than 5).
  return next <= prev;
}
