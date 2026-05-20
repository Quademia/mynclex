// mynclex/app/welcome/page.tsx
//
// Invite-landing page. An off-platform-added student arrives here from
// the Supabase invite email. The link carries a one-time session: the
// browser Supabase client consumes it on mount (detectSessionInUrl),
// and onAuthStateChange's INITIAL_SESSION tells us whether a session
// actually landed.
//
//   session present  -> show the set-password form (name pre-filled
//                        from the profile the tutor created)
//   no session       -> the link was bad / expired / already used:
//                        show a friendly dead-end with a sign-in link
//
// The set-password write itself runs in finalizeWelcomeAction (server),
// which reads the session the client just established.

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { finalizeWelcomeAction } from './actions';
import '@/styles/tokens.css';
import '@/styles/auth.css';

type Phase = 'loading' | 'ready' | 'invalid';

export default function WelcomePage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [forename, setForename] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Capture the invite credentials from the URL *synchronously*, before
    // the Supabase client's detectSessionInUrl can consume and clear them.
    //
    // Crucially we drive this page ONLY from the invite link's own tokens,
    // never from a session already present in this browser. Otherwise a
    // tutor (or anyone) already logged in here would prefill as the invited
    // student — which is exactly the bug this replaces.
    const rawHash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : '';
    const hashParams = new URLSearchParams(rawHash);
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const code = new URLSearchParams(window.location.search).get('code');

    const supabase = createClient();
    let cancelled = false;

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
        // No invite credentials in the URL — a direct visit or a stale link.
        return null;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user;
    }

    establishUser().then(async (user) => {
      if (cancelled) return;
      if (!user) {
        setPhase('invalid');
        return;
      }

      setEmail(user.email ?? '');

      // Prefill the name the tutor already typed (the add-student action
      // wrote it onto the profile row). Fall back to the invite metadata.
      const { data: profile } = await supabase
        .from('nclex_users')
        .select('forename, surname')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;

      if (profile?.forename || profile?.surname) {
        setForename(profile.forename ?? '');
        setSurname(profile.surname ?? '');
      } else {
        const full = (user.user_metadata?.full_name as string | undefined) ?? '';
        const [first, ...rest] = full.split(' ');
        setForename(first ?? '');
        setSurname(rest.join(' '));
      }

      // Drop the auth token fragment from the address bar.
      window.history.replaceState(null, '', window.location.pathname);
      setPhase('ready');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSubmitting(true);
    const result = await finalizeWelcomeAction(formData);
    // On success the action redirects to /router and this line is
    // unreachable; only failures return a result here.
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
            <h1 className="auth-title">Setting things up…</h1>
            <p className="auth-subtitle">
              One moment while we verify your invite.
            </p>
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
              Your invite link may have expired or already been used. Ask your
              tutor to add you again — or sign in if you&apos;ve already set up
              your account.
            </p>
          </div>
          <div className="auth-footer">
            Already set up? <a href="/login">Sign in</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-main">
      <section className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Welcome to MyNclex 👋</h1>
          <p className="auth-subtitle">
            Set a password to finish creating your account.
          </p>
        </div>

        <form className="auth-form" action={handleSubmit}>
          <div className="auth-row">
            <div className="auth-field">
              <label htmlFor="forename">First name</label>
              <input
                id="forename"
                name="forename"
                type="text"
                value={forename}
                onChange={(e) => setForename(e.target.value)}
                autoComplete="given-name"
                required
                disabled={submitting}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="surname">Last name</label>
              <input
                id="surname"
                name="surname"
                type="text"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                autoComplete="family-name"
                required
                disabled={submitting}
              />
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} disabled readOnly />
            <span className="auth-hint">The email your tutor invited.</span>
          </div>

          <div className="auth-field">
            <label htmlFor="password">Choose a password</label>
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
            <label htmlFor="confirmPassword">Confirm password</label>
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
            {submitting ? 'Finishing setup…' : 'Finish setup & continue'}
          </button>
        </form>
      </section>
    </main>
  );
}
