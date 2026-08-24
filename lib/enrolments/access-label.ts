// mynclex/lib/enrolments/access-label.ts
//
// How long is left on an enrolment's access window, in words.
//
// ⭐ WHY IT MOVED HERE (2026-08-24). This was private to
// lib/analytics/tutor/analytics-view.tsx, where the Progress page renders
// its Access column. The enrolments roster now shows the same fact beside
// the button that changes it, and two screens describing one date is
// exactly how they start disagreeing — one saying "8w left" while the
// other says "2 months". Written once, imported twice.
//
// ⓘ It lives in lib/enrolments/ rather than lib/analytics/ because the
// access window is an ENROLMENT fact that analytics reads, so the
// dependency points consumer → producer, the same way lib/practice/
// imports from lib/bank/ and never the reverse.

/**
 * Access-window remainder, sized for a narrow table column.
 *
 * ⚠ NULL MEANS LIFETIME, AND MUST NOT RENDER AS AN EM-DASH. "No expiry" is
 * a real answer about this student, not missing data — an em-dash would
 * report the one unambiguous case as the ambiguous one.
 *
 * ⚠ Compact units on purpose. Spelled out ("10 months left") this wraps
 * onto three lines in the column and reads as noise; the Progress drawer,
 * which has the width, spells it out instead.
 */
export function accessLabel(days: number | null): string {
  if (days == null) return 'Lifetime';
  if (days === 0) return 'ends today';
  if (days < 14) return `${days}d left`;
  if (days < 60) return `${Math.round(days / 7)}w left`;
  return `${Math.round(days / 30)}mo left`;
}

/**
 * Whole days from now until `iso`, or null for a lifetime window.
 *
 * ⚠ Negative when the window has already closed — callers deciding what to
 * SHOW must handle that themselves rather than clamping here. A roster row
 * for a student who expired yesterday is a real state (the sweep runs at
 * 02:00, so a browser can see it before the sweep does), and silently
 * flooring it to 0 would print "ends today" about a door that is shut.
 */
export function daysUntil(iso: string | null): number | null {
  if (iso == null) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.ceil((then - Date.now()) / 86_400_000);
}
