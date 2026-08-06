// mynclex/app/login/login-form.tsx
//
// The interactive login form. Split out from page.tsx so the page can stay a
// server component that reads `next` / `email` from the URL (a returning student
// sent here mid-checkout) and hands them in as props — no useSearchParams /
// Suspense dance. `next` rides through as a hidden field so loginAction can
// return the user to where they came from.

'use client';

import { useState } from 'react';
import { loginAction } from './actions';

export function LoginForm({
  next,
  initialEmail,
}: {
  next?: string;
  initialEmail?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Carried to /forgot-password so a student who has just failed to sign
  // in doesn't retype the address she was already struggling with.
  const [email, setEmail] = useState(initialEmail ?? '');

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSubmitting(true);

    const result = await loginAction(formData);

    // On success loginAction redirects, so we only get here on failure.
    if (!result?.ok && result?.error) {
      setError(result.error);
    }
    setSubmitting(false);
  }

  return (
    <form className="auth-form" action={handleSubmit}>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="auth-field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="auth-field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <span className="auth-hint auth-forgot">
          <a href={email ? `/forgot-password?email=${encodeURIComponent(email)}` : '/forgot-password'}>
            Forgot your password?
          </a>
        </span>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <button type="submit" className="auth-submit" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
