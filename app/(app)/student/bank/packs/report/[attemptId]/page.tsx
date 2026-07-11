// mynclex/app/(app)/student/bank/packs/report/[attemptId]/page.tsx
//
// Readiness step 3 — the permanent per-sitting report (PLACEHOLDER).
//
// This is the hub the results popup + the USED pack card point at. The
// full report (§11.5: verdict band, points line, peer comparator,
// multi-axis breakdowns) is its own later slice; for now this page
// exists so the whole claim → sit → result chain is navigable and
// testable end to end, and so the window-gated review has a home.
//
// What IS real here (not placeholder):
//   • ownership + source + terminal gate at the server boundary,
//   • the headline score (persists forever, unlike the 21-day review),
//   • the 21-day REVIEW window gate — per-question review (the /session
//     runner in review mode) is reachable only while now < the credit's
//     expires_at (§11.5: "question review closes day 21, the score
//     persists forever"). The session route enforces the same gate, so a
//     bookmarked review URL can't outlive the window either.

import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { reviewWindowOpen } from '@/lib/payments/readiness-window';
import { scoreToBand } from '@/lib/payments/readiness-band';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ attemptId: string }>;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function ReadinessReportPage({ params }: PageProps) {
  const { attemptId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // The attempt — ownership is enforced by RLS (student sees only their
  // own), and we re-check source + terminal status here.
  const { data: attempt, error: aErr } = await supabase
    .from('nclex_attempts')
    .select('attempt_id, student_id, source, status, final_score')
    .eq('attempt_id', attemptId)
    .maybeSingle();
  if (aErr || !attempt) notFound();
  if (attempt.student_id !== user.id) notFound();
  if (attempt.source !== 'READINESS_PACK') notFound();

  // A still-running sitting has no report yet — send them back to resume.
  if (attempt.status === 'IN_PROGRESS') {
    redirect('/student/bank/packs');
  }

  // The credit that spent onto this sitting carries the window deadline +
  // the pack it belongs to. (One credit per sitting — attempt_id is the
  // forever link.)
  const { data: credit } = await supabase
    .from('nclex_readiness_credits')
    .select('pack_id, expires_at')
    .eq('attempt_id', attemptId)
    .eq('user_id', user.id)
    .maybeSingle();

  let packTitle = 'Readiness Pack';
  if (credit?.pack_id) {
    const { data: pack } = await supabase
      .from('nclex_readiness_packs')
      .select('title')
      .eq('pack_id', credit.pack_id)
      .maybeSingle();
    if (pack?.title) packTitle = pack.title;
  }

  const pct =
    attempt.final_score !== null ? Math.round(attempt.final_score * 100) : null;
  const band = scoreToBand(attempt.final_score);

  // Review window: open while now < expires_at. Missing deadline (edge)
  // reads as closed — never leak review past a window we can't confirm.
  const expiresAt = credit?.expires_at ?? null;
  const reviewOpen = reviewWindowOpen(expiresAt);

  return (
    <div className="rs-wrap">
      <a className="rs-report-back" href="/student/bank/packs">
        ← Back to packs
      </a>

      <div className="rs-report">
        <div className="rs-report-eyebrow">Exam complete · {packTitle}</div>

        <div className="rs-report-score">
          {pct !== null ? (
            <>
              <span className="rs-report-num">{pct}</span>
              <span className="rs-report-pct">%</span>
              {band && <span className={`rs-band rs-band-${band.tone}`}>{band.label}</span>}
            </>
          ) : (
            <span className="rs-report-unavail">Score unavailable</span>
          )}
        </div>
        <div className="rs-report-scorelabel">Your score on this one-shot exam</div>

        {/* Placeholder for the real §11.5 report. */}
        <div className="rs-report-soon">
          <div className="rs-report-soon-title">Your full report is on its way</div>
          <p>
            The detailed breakdown — your readiness band, performance by category and
            body system, and how you compare to other test-takers — is coming soon.
            Your score above is saved permanently.
          </p>
        </div>

        {/* Window-gated per-question review. */}
        <div className="rs-report-review">
          {reviewOpen ? (
            <>
              <a
                className="rs-btn rs-btn-navy"
                href={`/session/${attemptId}`}
              >
                Review your answers
              </a>
              {expiresAt && (
                <div className="rs-report-review-note">
                  Answer review is open until {fmtDate(expiresAt)}.
                </div>
              )}
            </>
          ) : (
            <>
              <button type="button" className="rs-btn rs-btn-ghost" disabled>
                Review your answers
              </button>
              <div className="rs-report-review-note">
                {expiresAt
                  ? `Answer review closed on ${fmtDate(expiresAt)}. Your score above stays on record.`
                  : 'Answer review is no longer available. Your score above stays on record.'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
