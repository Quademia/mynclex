// mynclex/app/register/page.tsx
//
// Register page — student self-signup.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { registerAction } from './actions';
import { TurnstileWidget, resetTurnstile } from '@/components/auth/turnstile-widget';
import '@/styles/tokens.css';
import '@/styles/auth.css';

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSubmitting(true);

    const result = await registerAction(formData);

    if (!result?.ok && result?.error) {
      setError(result.error);
      // Single-use pass, spent by this attempt — see login-form.tsx. It
      // matters most on this form: "User already registered" and "Passwords
      // do not match" are both errors she fixes and immediately resubmits.
      resetTurnstile();
    }
    setSubmitting(false);
  }

  return (
    <main className="auth-main">
      <section className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">NCLEX-RN prep, built for internationally-trained nurses.</p>
        </div>

        <form className="auth-form" action={handleSubmit}>
          <div className="auth-row">
            <div className="auth-field">
              <label htmlFor="forename">First name</label>
              <input
                id="forename"
                name="forename"
                type="text"
                autoComplete="given-name"
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="surname">Last name</label>
              <input
                id="surname"
                name="surname"
                type="text"
                autoComplete="family-name"
                required
              />
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <span className="auth-hint">Minimum 8 characters.</span>
          </div>

          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <TurnstileWidget />

          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? <Link href="/login">Sign in</Link>
        </div>
      </section>
    </main>
  );
}
