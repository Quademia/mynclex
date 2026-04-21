// mynclex/app/login/page.tsx

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { loginAction } from './actions';
import '../landing.css';
import '../register/auth.css';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSubmitting(true);

    const result = await loginAction(formData);

    if (!result?.ok && result?.error) {
      setError(result.error);
    }
    setSubmitting(false);
  }

  return (
    <main className="auth-main">
      <section className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to continue your NCLEX-RN prep.</p>
        </div>

        <form className="auth-form" action={handleSubmit}>
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
              autoComplete="current-password"
              required
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="auth-footer">
          Don&apos;t have an account? <Link href="/register">Create one</Link>
        </div>
      </section>
    </main>
  );
}
