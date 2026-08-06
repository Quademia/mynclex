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
    }
    setSubmitting(false);
  }

  if (sentTo) {
    // No sign-in link in here: the page below already renders one, and
    // two ways back to the same place read as two destinations.
    return (
      <>
        <p className="auth-subtitle">
          If an account exists for <strong>{sentTo}</strong>, we&apos;ve sent a
          link to reset the password. It expires in one hour.
        </p>
        <p className="auth-hint">
          Nothing arrived? Check your spam folder, and make sure you used the
          address you registered with — it may be a different one.
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

      <button type="submit" className="auth-submit" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  );
}
