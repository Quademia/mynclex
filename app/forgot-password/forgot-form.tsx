// mynclex/app/forgot-password/forgot-form.tsx
//
// The interactive half of /forgot-password. Split out from page.tsx the
// same way /login is, so the page can stay a server component that reads
// an optional `email` prefill from the URL.
//
// ⭐ THE SENT SCREEN NEVER SAYS WHETHER THE ADDRESS WAS REAL. Its copy is
// written to be true either way: "if an account exists for that address"
// — not "we've sent you an email", which would be a lie half the time and
// an enumeration oracle the other half.

'use client';

import { useState } from 'react';
import { requestResetAction } from './actions';
import { TurnstileWidget, resetTurnstile } from '@/components/auth/turnstile-widget';

export function ForgotForm({ initialEmail }: { initialEmail?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSubmitting(true);

    const typed = String(formData.get('email') ?? '').trim();
    const result = await requestResetAction(formData);

    if (result.ok) {
      setSentTo(typed);
    } else {
      setError(result.error);
      // The pass is single-use and this attempt has spent it — see the
      // note in login-form.tsx. The success branch needs no reset: it
      // swaps the form out for the sent screen entirely.
      resetTurnstile();
    }
    setSubmitting(false);
  }

  if (sentTo) {
    // No sign-in link in here: the page below already renders one, and
    // two ways back to the same place read as two destinations.
    return (
      <>
        {/* ⚠ The "If an account exists for…" opening is load-bearing, not
            hedging. It is the only thing stopping this screen from
            confirming to a stranger which addresses are registered here.
            Reword the rest freely; keep the conditional. */}
        <p className="auth-subtitle">
          If an account exists for <strong>{sentTo}</strong>, we&apos;ve sent a
          link to reset it. The link expires in one hour and can only be used
          once.
        </p>
        {/* Two causes, two clauses: it is in spam, or she used an address
            she never registered with. "Try" rather than "Check" because
            the imperative read as an instruction to go straight to spam,
            past the inbox she has already looked in. */}
        <p className="auth-hint">
          Nothing after a few minutes? Try your spam folder — and check the
          address above is the one you registered with.
        </p>
      </>
    );
  }

  return (
    <form className="auth-form" action={handleSubmit}>
      <div className="auth-field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={initialEmail ?? ''}
          required
          disabled={submitting}
        />
        <span className="auth-hint">The address you registered with.</span>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <TurnstileWidget />

      <button type="submit" className="auth-submit" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  );
}
