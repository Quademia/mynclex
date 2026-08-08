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

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    // ⓘ NO run-once ref guard here, deliberately. Strict Mode invokes
    // this twice in dev, and that is now harmless — nothing below spends
    // a single-use token; it only listens. A guard would actively break
    // it: Strict Mode's cleanup fires between the two passes, so the
    // first pass's subscription and timer would be torn down while the
    // second pass skipped setting up replacements, and the page would
    // wait on "Checking your link…" for a session nobody was listening
    // for. Let it run twice and let each cleanup pair with its own setup.

    // ⭐ TWO LINK SHAPES, AND THE LIBRARY HANDLES EXACTLY ONE OF THEM.
    // Verified against the installed @supabase/auth-js + @supabase/ssr
    // source on 2026-08-06, after two failed fixes built on guesses:
    //
    //   ?code=…            PKCE. THE LIBRARY OWNS IT. It consumes the
    //                      code the instant any client is constructed,
    //                      and the code is single-use — so we must NOT
    //                      exchange it ourselves. Doing that is what made
    //                      this page report "this link didn't work" for
    //                      resets that had actually succeeded. We only
    //                      wait for the session it produces.
    //                      ⓘ This is the shape real reset emails use.
    //
    //   #access_token=…    Implicit. THE LIBRARY REFUSES IT. createBrowserClient
    //                      hard-sets flowType:'pkce', and GoTrueClient
    //                      throws "Not a valid PKCE flow url." for an
    //                      implicit callback under that flowType —
    //                      silently, since the error only reaches its own
    //                      debug channel. So here we MUST do the work.
    //                      Reached by admin-generated recovery links.
    //                      (This is also why /welcome works: it always
    //                      calls setSession itself and never leans on the
    //                      library's URL detection.)
    //
    // Reading the URL is also the gate that keeps this page from
    // resetting whoever happens to be signed in on a shared device: no
    // token in the address means not a reset, however valid the session
    // sitting in the browser is.
    const rawHash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : '';
    const hashParams = new URLSearchParams(rawHash);
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const code = new URLSearchParams(window.location.search).get('code');
    const arrivedFromLink = Boolean((accessToken && refreshToken) || code);

    function accept(user: { email?: string | null }) {
      setEmail(user.email ?? '');
      // Drop the token from the address bar so a shared screen or a
      // pasted URL doesn't carry a live session with it. (The library
      // usually does this too; doing it again is harmless.)
      window.history.replaceState(null, '', window.location.pathname);
      setPhase('ready');
    }

    let settled = false;
    let unsubscribe: (() => void) | null = null;

    function settle(user: { email?: string | null } | null) {
      if (settled) return;
      settled = true;
      if (user) accept(user);
      else setPhase('invalid');
    }

    // A direct visit skips all of this and simply lets the deadline below
    // fire immediately — one path to 'invalid' rather than two, which is
    // also what keeps setPhase out of the effect body (react-hooks'
    // set-state-in-effect rule, and it is right: a synchronous setState
    // here renders twice for no reason).
    if (arrivedFromLink) {
      const supabase = createClient();

      if (accessToken && refreshToken) {
        // Implicit shape — ours to establish, because the library will
        // not touch it (see above). Strict Mode runs this twice; setting
        // the same session twice is idempotent, which is exactly why the
        // /welcome page has survived the same double-run for months.
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ data, error }) => settle(error ? null : (data.user ?? null)));
      } else {
        // PKCE shape — the library is already exchanging. Two ways to
        // hear the result, because neither is reliable alone: getUser()
        // catches the case where it finished before this effect ran, and
        // the subscription catches the far more common case where it has
        // not finished yet. Neither one spends the code.
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
          if (session?.user) settle(session.user);
        });
        unsubscribe = () => sub.subscription.unsubscribe();

        supabase.auth.getUser().then(({ data }) => {
          if (data.user) settle(data.user);
        });
      }
    }

    // ⚠ A deadline is required, not defensive padding. If the exchange
    // fails — an expired link, a code already spent, a link opened in a
    // different browser from the one that asked for it — the library
    // reports it to its own console and simply never emits a session, so
    // without this the page would wait on "Checking your link…" forever.
    // Ten seconds is long enough for a slow phone on mobile data and
    // short enough not to feel broken; a direct visit needs none of it.
    const deadline = setTimeout(() => settle(null), arrivedFromLink ? 10_000 : 0);

    return () => {
      clearTimeout(deadline);
      unsubscribe?.();
    };
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
            {/* "No longer works", not "invalid". The link WAS good — she
                got a real email from us and it worked until it didn't.
                "Invalid" reads as an accusation, or worse, as though the
                email had been a phishing attempt she was right to
                distrust; "no longer" carries the reassurance that it once
                worked. The cause is deliberately left open because this
                screen covers four of them (expired, already used, opened
                in a different browser, timed out waiting) and naming only
                expiry would send some students chasing the wrong fix. */}
            <h1 className="auth-title">This link no longer works</h1>
            <p className="auth-subtitle">
              It may have expired, or already been used. Request a new one to
              continue.
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
