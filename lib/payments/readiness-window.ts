// mynclex/lib/payments/readiness-window.ts
//
// The one rule for "is this readiness sitting's answer-review still open?"
// (§11.5, 2b-iv). A readiness pack's score persists forever, but
// per-question review closes at the credit's 21-day deadline (expires_at).
// Both enforcement points — the /session review route and the permanent
// report page — read this single helper so the boundary can't drift
// between them, and a missing deadline reads CLOSED (never leak review
// past a window we can't confirm).
//
// Plain module (no 'use server', not a component) so the wall-clock read
// lives outside any React render — server components that read the clock
// during render trip react-hooks/purity; this helper keeps them clean.

/** True while the 21-day answer-review window is still open. Null/absent
 *  deadline → closed. */
export function reviewWindowOpen(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return Date.now() < Date.parse(expiresAt);
}
