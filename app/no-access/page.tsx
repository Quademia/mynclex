// mynclex/app/no-access/page.tsx
//
// The reason-aware access wall (2026-07-09). Gates that block entry
// redirect here with a `?need=<reason>`, and this page renders the right
// explanation + call-to-action for that reason — instead of each gate
// hard-redirecting to a bespoke target (e.g. straight to the bank sell
// page with no context). Two tones, driven by the reason:
//
//   - an ACTIONABLE gap (need=bank) → "here's what's locked and how to
//     unlock it", with a CTA — and, if the student happens to own
//     readiness packs, a link so they're never stranded on a bank-sell
//     message.
//   - a genuine DENIAL (no reason / an unknown role failure) → a calm
//     dead-end: nothing to buy, just contact support / sign out.
//
// New blocked-entry cases (programme-not-enrolled, expired windows, …)
// add a `need` value here rather than a new redirect target in the gate.
// Same shape as the payment result screen: outcome → tone + copy + CTA.

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ownsReadinessForUser } from '@/lib/payments/entitlements';
import '@/styles/tokens.css';
import '@/styles/dashboards.css';

export const dynamic = 'force-dynamic';

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ need?: string }>;
}) {
  const { need } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // ── Actionable gap: bank access needed ──────────────────────────────
  if (need === 'bank') {
    const ownsReadiness = await ownsReadinessForUser(supabase, user.id);
    return (
      <main className="dash-main">
        <section className="dash-card">
          <div className="dash-header">
            <h1 className="dash-title">Bank access needed</h1>
            <p className="dash-subtitle">
              Practice, your dashboard, history and the Journey Tracker are part of the
              question bank. Your access may have expired, or you don&apos;t have a pass yet.
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '4px' }}>
            <Link className="btn btn-accent" href="/bank-access">
              See bank plans
            </Link>
            <Link className="btn" href="/student">
              Back to home
            </Link>
          </div>

          {ownsReadiness && (
            <div className="dash-note" style={{ marginTop: '18px' }}>
              Your readiness packs are still available —{' '}
              <Link href="/student/bank/packs">go to your packs →</Link>
            </div>
          )}
        </section>
      </main>
    );
  }

  // ── Genuine denial: no role / not permitted here ────────────────────
  return (
    <main className="dash-main">
      <section className="dash-card">
        <div className="dash-header">
          <h1 className="dash-title">Account not ready</h1>
          <p className="dash-subtitle">Your account has no roles assigned yet.</p>
        </div>

        <div className="dash-note">
          <strong>What to do:</strong> contact support at support@qacademynurses.com with your
          email address ({user.email}) and we&apos;ll sort this out.
        </div>

        <form method="POST" action="/logout" style={{ marginTop: '20px' }}>
          <button type="submit" className="dash-signout">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
