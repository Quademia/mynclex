// mynclex/lib/curriculum/month-dates.ts
//
// Pure date helpers for the curriculum Month view. Deliberately NOT a
// 'use client' module — the adapters that bucket activities by date run
// on BOTH sides (the tutor adapter inside a client component, the student
// adapter inside a server component), so these must be callable from the
// server. (They lived in month-view.tsx initially; calling them from the
// server threw "Attempted to call ... from the server but ... is on the
// client.")
//
// Day-granular only. Parse YYYY-MM-DD at local noon so day arithmetic
// never rolls a TZ boundary. Ghana is UTC, so a server-side "today" lands
// on the same calendar day as the user's.

const MON = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function isoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "Aug 2" — short month + day, no leading zero. */
export function shortDate(d: Date): string {
  return `${MON[d.getMonth()]} ${d.getDate()}`;
}

/** "Mon 2" — day-of-week + date. */
export function dayGroupLabel(d: Date): string {
  return `${DOW[d.getDay()]} ${d.getDate()}`;
}

/** "AUG 2027" — month band divider. */
export function monthBandLabel(d: Date): string {
  return `${MON[d.getMonth()].toUpperCase()} ${d.getFullYear()}`;
}

/** Today at local noon — for isToday comparisons. */
export function todayLocal(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0, 0);
}
