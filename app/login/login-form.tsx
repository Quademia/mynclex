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
import { TurnstileWidget, resetTurnstile } from '@/components/auth/turnstile-widget';

export function LoginForm({
  next,
  initialEmail,
}: {
  next?: string;
  initialEmail?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  // Set only by the 24-hour lockout, which is long enough that "wait" is
  // not a usable answer on its own.
  const [showReset, setShowReset] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // ⭐ HOLDS THE BUTTON UNTIL A TURNSTILE PASS EXISTS. Found by testing on
  // 2026-08-08: the form renders instantly, the pass takes a moment, and
  // submitting in that gap is refused with "we could not verify your
  // browser" — the app blaming her browser for being quick. ⚠ The window
  // is WIDER for the students this product is for, not narrower: a slow
  // mobile connection means a slower widget. The widget reports true by
  // itself if it errors or never loads, so this can never become a dead
  // form — see turnstile-widget.tsx.
  const [passReady, setPassReady] = useState(false);
  // Carried to /forgot-password so a student who has just failed to sign
  // in doesn't retype the address she was already struggling with.
  const [email, setEmail] = useState(initialEmail ?? '');

  async function handleSubmit(formData: FormData) {
    setError(null);
    setShowReset(false);
    setSubmitting(true);

    const result = await loginAction(formData);

    // On success loginAction redirects, so we only get here on failure.
    if (!result?.ok && result?.error) {
      setError(result.error);
      setShowReset(result.suggestReset === true);
      // ⭐ THE PASS IS SPENT — MINT A FRESH ONE BEFORE SHE TRIES AGAIN.
      // Cloudflare consumes the token when the server checks it, so
      // without this the second attempt (with the CORRECT password) would
      // be refused for a reason the screen cannot explain. Unconditional:
      // some failure paths return before the token is checked and leave it
      // unspent, and a needless refresh costs nothing next to guessing
      // which ones those are.
      resetTurnstile();
    }
    setSubmitting(false);
  }

  // Built once — the standing "Forgot your password?" link and the one
  // offered inside a 24-hour lockout are the same destination, and both
  // carry the address she has already typed.
  const forgotHref = email
    ? `/forgot-password?email=${encodeURIComponent(email)}`
    : '/forgot-password';

  // Same idea for the code door: carry both the address she has already
  // typed and the return path she arrived with, so switching doors costs
  // her nothing and loses nothing.
  const codeHref = (() => {
    const params = new URLSearchParams({ mode: 'code' });
    if (email) params.set('email', email);
    if (next) params.set('next', next);
    return `/login?${params.toString()}`;
  })();

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
          <a href={forgotHref}>Forgot your password?</a>
        </span>
      </div>

      {error && (
        <div className="auth-error">
          {error}
          {showReset && (
            // Joined with "or" into the sentence the action left open, so
            // the screen offers a choice rather than a refusal with a
            // link stuck on the end. It works right now because the reset
            // limit is a separate counter her failed sign-ins have not
            // touched — the whole reason it is worth offering here.
            <>
              {' or '}
              <a className="auth-error-action" href={forgotHref}>
                set a new password instead
              </a>
              .
            </>
          )}
        </div>
      )}

      {/* Below the error, above the button — the last thing between her
          and submitting, and the place a challenge (when Managed mode
          decides to show one) reads as part of signing in rather than as
          an interruption. */}
      <TurnstileWidget onReadyChange={setPassReady} />

      <button
        type="submit"
        className="auth-submit"
        disabled={submitting || !passReady}
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>

      {/* ⭐ THE CODE DOOR IS A LINK, NOT A SECOND FORM COMPETING FOR
          ATTENTION (slice 3e). The password stays the primary way in — two
          forms on first paint asks a tired student to choose between doors
          before she has tried the one she already knows. It carries the
          address she has typed, so switching does not cost her retyping it,
          and `next` so a student sent here mid-checkout still gets back to
          where she came from. */}
      <div className="auth-switch">
        <a href={codeHref}>Email me a sign-in code instead</a>
      </div>
    </form>
  );
}
