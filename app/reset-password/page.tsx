// mynclex/app/reset-password/page.tsx
//
// Where the reset email's link lands. The link carries a one-time
// recovery session; the browser Supabase client consumes it, and then the
// student sets a new password.
//
//   session established -> show the new-password form
//   nothing usable      -> a friendly dead end with a way to ask again
//
// The write itself runs in completeResetAction (server), which reads the
// session this page just established.
//
// ⭐ IT DRIVES ONLY OFF THE LINK'S OWN TOKENS, NEVER OFF A SESSION
// ALREADY IN THIS BROWSER. Same rule as /welcome, and here it matters
// more. Without it, anyone opening /reset-password while someone else is
// still signed in on a shared phone — an internet café, a ward computer,
// a borrowed laptop — would be handed a form that changes THAT person's
// password. A reset page that resets whoever happens to be logged in is
// an account-takeover button, not a convenience.

'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { completeResetAction } from './actions';
import '@/styles/tokens.css';
import '@/styles/auth.css';

type Phase = 'loading' | 'ready' | 'invalid';

export default function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ⭐ RUN THE HANDOFF EXACTLY ONCE. React Strict Mode (on by default in
  // dev) invokes every effect twice, which on this page is not a harmless
  // repeat: the recovery code is single-use, so the second run spends an
  // already-spent code, fails, and paints "this link didn't work" over a
  // reset that worked. That is the SAME race as the library one above,
  // just between our own two passes — turning detectSessionInUrl off
  // removes one competitor and this removes the other. A ref survives
  // Strict Mode's simulated remount, which is what makes it the guard
  // rather than state.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Read the credentials out of the URL synchronously, before the
    // Supabase client's detectSessionInUrl can consume and clear them.
    // Supabase sends one of two shapes depending on the project's flow —
    // tokens in the fragment, or a code in the query — so handle both
    // rather than betting on today's setting.
    const rawHash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : '';
    const hashParams = new URLSearchParams(rawHash);
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const code = new URLSearchParams(window.location.search).get('code');

    // ⚠ detectSessionInUrl OFF — this page owns the token, nothing else.
    // With it on (the default) the client consumes the single-use code
    // the moment it loads and wipes the address bar, so the explicit
    // exchange below arrives second and fails on an already-spent code —
    // and the page then reports "this link didn't work" for a reset that
    // in fact succeeded. Exactly what happened on the first live test,
    // 2026-08-06; the giveaway was the real URL flashing up and being
    // replaced by a bare one.
    const supabase = createClient({ detectSessionInUrl: false });

    async function establishUser() {
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) return null;
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) return null;
      } else {
        // No recovery credentials in the URL. Note this branch returns
        // null even when a perfectly good session exists in the browser —
        // see the header. A direct visit to this page is not a reset.
        return null;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user;
    }

    // ⚠ No cancelled-flag / cleanup pair here, and its absence is
    // deliberate. Strict Mode's cleanup fires between its two passes, so
    // a flag set there would cancel the ONLY run the guard above allows —
    // and the page would sit on "Checking your link…" forever. Setting
    // state after unmount is a no-op in React 18+, so there is nothing
    // left for the flag to protect against.
    establishUser().then((user) => {
      if (!user) {
        setPhase('invalid');
        return;
      }
      setEmail(user.email ?? '');
      // Drop the token fragment from the address bar, so a shared screen
      // or a pasted URL doesn't carry a live session with it.
      window.history.replaceState(null, '', window.location.pathname);
      setPhase('ready');
    });
  }, []);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSubmitting(true);
    const result = await completeResetAction(formData);
    // On success the action redirects to /router, so only failures
    // return a result here.
    if (result && !result.ok) {
      setError(result.error);
      setSubmitting(false);
    }
  }

  if (phase === 'loading') {
    return (
      <main className="auth-main">
        <section className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">Checking your link…</h1>
            <p className="auth-subtitle">One moment.</p>
          </div>
        </section>
      </main>
    );
  }

  if (phase === 'invalid') {
    return (
      <main className="auth-main">
        <section className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">This link didn&apos;t work</h1>
            <p className="auth-subtitle">
              Reset links last one hour and can only be used once. Ask for a
              fresh one and it&apos;ll work.
            </p>
          </div>
          <div className="auth-footer">
            <a href="/forgot-password">Send a new reset link</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-main">
      <section className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Choose a new password</h1>
          <p className="auth-subtitle">
            You&apos;ll be signed in straight away once it&apos;s set.
          </p>
        </div>

        <form className="auth-form" action={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} disabled readOnly />
            <span className="auth-hint">The account this link is for.</span>
          </div>

          <div className="auth-field">
            <label htmlFor="password">New password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              disabled={submitting}
            />
            <span className="auth-hint">Minimum 8 characters.</span>
          </div>

          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm new password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              disabled={submitting}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Set new password & sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}
