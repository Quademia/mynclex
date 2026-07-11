// mynclex/lib/payments/readiness-band.ts
//
// The Readiness band — the verdict word derived from a sitting's score.
// Canonical thresholds live in bank-consumption.html §6 (settled with Sam
// 2026-07-06). This is the ONE place the mapping lives so every surface
// that shows a band (the completed pack card, the report page, and the
// future §11.5 full report) reads the same boundaries.
//
//   Building     0 – 59   (well below the bar)
//   Approaching  60 – 74
//   Ready        75 – 84   (75 = the defended pass-associated threshold)
//   Excelling    85 – 100  (past the bar with margin)
//
// Banded on the ROUNDED integer percentage so the band never contradicts
// the displayed score (a raw 0.745 shows "75%" and must read "Ready", not
// "Approaching").

export type ReadinessBand = 'BUILDING' | 'APPROACHING' | 'READY' | 'EXCELLING';

/** Tone drives the colour on chips/scores. Mirrors the doc's colour intent:
 *  Building red, Approaching amber, Ready teal-green, Excelling strong green. */
export type BandTone = 'danger' | 'warn' | 'ok' | 'strong';

export interface BandInfo {
  key: ReadinessBand;
  label: string;
  tone: BandTone;
}

/** Null score (unscored / defensive) → null band; callers hide the chip. */
export function scoreToBand(finalScore: number | null | undefined): BandInfo | null {
  if (finalScore === null || finalScore === undefined) return null;
  const pct = Math.round(finalScore * 100);
  if (pct >= 85) return { key: 'EXCELLING', label: 'Excelling', tone: 'strong' };
  if (pct >= 75) return { key: 'READY', label: 'Ready', tone: 'ok' };
  if (pct >= 60) return { key: 'APPROACHING', label: 'Approaching', tone: 'warn' };
  return { key: 'BUILDING', label: 'Building', tone: 'danger' };
}
