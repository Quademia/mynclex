// mynclex/lib/home/student/bank/doorways.ts
//
// Card 9 — "Where to next". Five doors, each carrying a live figure.
//
// The rule that shapes this file: a door may only say something we can
// actually count. Where we can't, it opens with no sub-line rather
// than a plausible-sounding one. The Journey Tracker is the sharp case
// — that pillar is not built, so its door is LOCKED rather than
// carrying the prototype's invented "Phase 3 of 7".

import type { Doorway } from './types';

export type DoorwayCounts = {
  /** Questions eligible for this student, or null if the count failed. */
  bankTotal: number | null;
  /** Readiness credits claimed and waiting to be used. */
  creditsReady: number;
  /** Completed CAT sittings. */
  catsTaken: number;
  /** Last CAT's verdict, already worded for display. Null if none. */
  lastCatLabel: string | null;
  /** Past sessions in the bank history feed. */
  sessions: number;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function buildDoorways(c: DoorwayCounts): Doorway[] {
  const cat: string[] = [];
  if (c.catsTaken > 0) cat.push(plural(c.catsTaken, 'taken', 'taken'));
  if (c.lastCatLabel) cat.push(c.lastCatLabel);

  return [
    {
      key: 'bank',
      title: 'Question Bank',
      sub: c.bankTotal !== null ? `${c.bankTotal.toLocaleString()} questions available` : null,
      href: '/student/bank/practice',
      tone: 'default',
    },
    {
      key: 'packs',
      title: 'Readiness Packs',
      // Only shout when something is actually waiting.
      sub: c.creditsReady > 0 ? `${plural(c.creditsReady, 'credit')} ready` : null,
      href: '/student/bank/packs',
      tone: c.creditsReady > 0 ? 'attention' : 'default',
    },
    {
      key: 'cat',
      title: 'CAT',
      sub: cat.length ? cat.join(' · ') : 'Not taken yet',
      href: '/student/bank/cat',
      tone: 'default',
    },
    {
      key: 'history',
      title: 'History',
      sub: c.sessions > 0 ? plural(c.sessions, 'past session') : null,
      href: '/student/bank/history',
      tone: 'default',
    },
    {
      key: 'journey',
      title: 'Journey Tracker',
      sub: 'Coming soon',
      href: null,
      tone: 'locked',
    },
  ];
}
