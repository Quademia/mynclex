// mynclex/app/(public)/readiness/sample-verdict.ts
//
// Shared sample-verdict maths for the /readiness marketing demos — the
// cycling hero collage and the report showcase both read this, so the
// number, band and marker stay in lockstep. SAMPLE data; the four scores
// walk one band each so the page shows off the whole scale.

export const SAMPLE_SCORES = [52, 68, 79, 91];
export const VERDICT_RING_R = 52;
export const VERDICT_RING_C = 2 * Math.PI * VERDICT_RING_R;

export interface SampleBand {
  label: string;
  bg: string;
  fg: string;
  ring: string;
}

export function bandForPct(pct: number): SampleBand {
  if (pct < 60) return { label: 'Building', bg: '#fee2e2', fg: '#b91c1c', ring: '#dc2626' };
  if (pct < 75) return { label: 'Approaching', bg: '#fef3c7', fg: '#b45309', ring: '#d97706' };
  if (pct < 85) return { label: 'Ready', bg: '#edf6f5', fg: '#2d7d72', ring: '#2d7d72' };
  return { label: 'Excelling', bg: '#dcfce7', fg: '#15803d', ring: '#16a34a' };
}

/** "412 of 520 answer points" — invented, internally consistent (520-point
 *  fixed form). */
export function pointsForPct(pct: number): string {
  return `${Math.round((pct / 100) * 520)} of 520 answer points`;
}

/** Cycle period for the sample verdict, ms. */
export const VERDICT_CYCLE_MS = 8000;
