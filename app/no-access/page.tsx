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
import { bankAccessForUser, ownsReadinessForUser } from '@/lib/payments/entitlements';
import type { BankAccessReason } from '@/lib/payments/entitlements';
import '@/styles/tokens.css';
import '@/styles/dashboards.css';

export const dynamic = 'force-dynamic';

/**
 * The bank wall used to say "your access may have expired, or you don't
 * have a pass yet" — one hedged sentence for three different people,
 * because nothing below it knew which (2026-09-04). It knows now.
 *
 * ⓘ 'ACTIVE' is unreachable here (a student with access is never
 * redirected to this page) but is listed so the record stays total and a
 * future reason cannot be forgotten.
 */
const BANK_COPY: Record<BankAccessReason, { title: string; body: (ended: string) => string }> = {
  LAPSED_TRIAL: {
    title: 'Your free trial has ended',
    body: (ended) =>
      `Your free trial ended on ${ended}. Choose a plan to pick up where you left off — ` +
      'your access starts again the moment you pay.',
  },
  LAPSED_PAID: {
    title: 'Your bank access has ended',
    body: (ended) =>
      `Your bank access ended on ${ended}. Choose a duration to carry on — ` +
      'your access starts again the moment you pay.',
  },
  NEVER: {
    title: 'Bank access needed',
    body: () =>
      'Practice, your dashboard and history are part of the question bank. ' +
      "You'll need a pass to get in.",
  },
  ACTIVE: {
    title: 'Bank access needed',
    body: () =>
      'Practice, your dashboard and history are part of the question bank. ' +
      "You'll need a pass to get in.",
  },
};

/** "11 September 2026" — long form, because this sits in a sentence. */
function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

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
    const [ownsReadiness, access] = await Promise.all([
      ownsReadinessForUser(supabase, user.id),
      bankAccessForUser(supabase, user.id),
    ]);
    const copy = BANK_COPY[access.reason];
    return (
      <main className="dash-main">
        <section className="dash-card">
          <div className="dash-header">
            <h1 className="dash-title">{copy.title}</h1>
            <p className="dash-subtitle">
              {copy.body(access.endedAt ? longDate(access.endedAt) : '')}
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
          <strong>What to do:</strong> contact support at support@quademia.com with your
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
