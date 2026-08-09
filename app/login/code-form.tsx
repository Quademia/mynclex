// mynclex/app/login/code-form.tsx
//
// The email-code door — build-order item 3, slice 3e. Two steps in one
// card: ask for a code, then type it. Lives beside its only caller
// (folder convention #3); the password door is login-form.tsx.
//
// ⭐ THE STEP IS SERVER-DECIDED, WHICH IS THE WHOLE POINT OF THE COOKIE.
// `pendingEmail` arrives from page.tsx, which read it out of the cookie
// slice 3c wrote. So the flow that actually happens — request a code,
// switch to Gmail, read six digits, come back to a tab the phone quietly
// discarded and reloaded — puts her back on the code box rather than an
// empty email field. Local state carries the same fact forward within a
// single page life, so the step also advances instantly after a send
// without waiting for a round trip. Two mechanisms, one truth: the cookie
// survives the reload, the state survives the click.
//
// ⭐⭐ THE WIDGET IS MOUNTED ON BOTH STEPS, AND ONLY *RESEND* WAITS FOR IT.
// The decision was "Turnstile on step 1, not step 2", which is right about
// VERIFYING — Supabase's captcha does not guard the verify endpoint at all
// (probed on dev, 2026-08-09: no pass returns `otp_expired`, not
// `captcha_failed`), so a pass there would be friction with no counterpart.
// But *resending* is not verifying. It is the same request as step 1, with
// the same cost — an email sent to an inbox that may not have asked — so it
// needs the same pass. Hence: the pass gates the resend control, never the
// code box. She is never held at the box she is actually standing at,
// waiting for Cloudflare.

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { requestCodeAction, verifyCodeAction, restartCodeAction } from './code-actions';
import { TurnstileWidget, resetTurnstile } from '@/components/auth/turnstile-widget';

/**
 * Supabase enforces 60 seconds between codes for the same person, on its
 * own, keyed per user — which is the right axis and free, so slice 3c
 * deliberately did not rebuild it. This countdown exists to SHOW that rule
 * rather than to be it: without it the resend button looks broken for a
 * minute, and a button that appears to do nothing gets pressed repeatedly,
 * which is how she reaches our own 3-an-hour limit.
 */
const RESEND_COOLDOWN_SEC = 60;

export function CodeForm({
  next,
  initialEmail,
  pendingEmail,
}: {
  next?: string;
  initialEmail?: string;
  /** Set when a code is already outstanding — see the header. */
  pendingEmail?: string;
}) {
  const [sentTo, setSentTo] = useState<string | undefined>(pendingEmail);
  const [email, setEmail] = useState(pendingEmail ?? initialEmail ?? '');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passReady, setPassReady] = useState(false);
  // 0 means "resend is available now". Deliberately starts at 0 even when
  // we arrive holding a pending address: after a reload we have no idea how
  // long ago the code was sent, and guessing high would lock her out of a
  // resend she is entitled to. Guessing low costs nothing — Supabase
  // refuses an early one on its own.
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Move the cursor to the code box the moment it appears, so she comes
  // back from her inbox and types. Only on the transition into the step —
  // stealing focus on every re-render would fight her while she types.
  useEffect(() => {
    if (sentTo) codeRef.current?.focus();
  }, [sentTo]);

  async function send(formData: FormData, isResend: boolean) {
    setError(null);
    setNotice(null);
    setSubmitting(true);

    const result = await requestCodeAction(formData);

    if (result.ok) {
      setSentTo(String(formData.get('email') ?? '').trim().toLowerCase());
      setCooldown(RESEND_COOLDOWN_SEC);
      // ⚠ Says "sent", and cannot honestly promise more. requestCodeAction
      // answers identically whether the address exists, so this sentence is
      // the same for a real student and for someone fishing — which is the
      // entire design. It is also why the wording is about what we did, not
      // about what will arrive.
      if (isResend) setNotice('We’ve sent another code.');
    } else {
      setError(result.error);
    }

    // The pass is single-use and spent by the attempt — mint a fresh one
    // either way. Unconditional for the reason login-form.tsx gives: some
    // failure paths return before the token is checked, and a needless
    // refresh is cheaper than working out which.
    resetTurnstile();
    setSubmitting(false);
  }

  async function handleRequest(formData: FormData) {
    await send(formData, false);
  }

  async function handleResend() {
    if (cooldown > 0 || !passReady || !sentTo) return;
    const fd = new FormData();
    fd.set('email', sentTo);
    // The pass rides in the hidden field Cloudflare maintains inside the
    // form element, so a resend triggered by a button outside the normal
    // submit has to fetch it by hand.
    const field = document.querySelector<HTMLInputElement>(
      'input[name="cf-turnstile-response"]'
    );
    if (field?.value) fd.set('cf-turnstile-response', field.value);
    await send(fd, true);
  }

  async function handleRestart() {
    await restartCodeAction();
    setSentTo(undefined);
    setEmail('');
    setError(null);
    setNotice(null);
    setCooldown(0);
  }

  async function handleVerify(formData: FormData) {
    setError(null);
    setNotice(null);
    setSubmitting(true);

    const result = await verifyCodeAction(formData);

    // On success verifyCodeAction redirects, so reaching here means failure.
    if (result && !result.ok) {
      setError(result.error);
      // The pending address is gone (expired cookie, or she arrived here
      // some other way). Showing the code box again would be showing a box
      // that cannot work, so fall back to asking for the address.
      if (result.restart) {
        setSentTo(undefined);
        setEmail('');
      }
    }
    setSubmitting(false);
  }

  const passwordHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login';

  // ── Step 1: which address? ────────────────────────────────────────────
  if (!sentTo) {
    return (
      <form className="auth-form" action={handleRequest}>
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <div className="auth-field">
          <label htmlFor="code-email">Email</label>
          <input
            id="code-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <span className="auth-hint">
            We’ll email you a 6-digit code. No password needed.
          </span>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <TurnstileWidget onReadyChange={setPassReady} />

        <button
          type="submit"
          className="auth-submit"
          disabled={submitting || !passReady}
        >
          {submitting ? 'Sending…' : 'Email me a code'}
        </button>

        <div className="auth-switch">
          <Link href={passwordHref}>Use your password instead</Link>
        </div>
      </form>
    );
  }

  // ── Step 2: the code ──────────────────────────────────────────────────
  return (
    <form className="auth-form" action={handleVerify}>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <p className="auth-sent">
        We’ve sent a code to <strong>{sentTo}</strong>.
      </p>

      <div className="auth-field">
        <label htmlFor="code">6-digit code</label>
        <input
          id="code"
          name="code"
          ref={codeRef}
          className="auth-code-input"
          type="text"
          /* ⭐ THE THREE ATTRIBUTES THAT MATTER MOST ON A PHONE, and they
             are worth more than the styling above them. `one-time-code`
             is what makes iOS and Android offer the code straight from the
             notification — it pairs with the wording in the email template,
             which puts the digits next to the word "code" so the OS can
             find them. `numeric` brings up the number pad instead of a
             full keyboard. `off` on autocorrect stops a helpful phone
             rewriting six digits into something else. */
          inputMode="numeric"
          autoComplete="one-time-code"
          autoCorrect="off"
          spellCheck={false}
          maxLength={12}
          placeholder="123456"
          /* ⓘ React 19 RESETS THIS FIELD after every action, so a failed
             attempt clears it and she retypes — which is the behaviour we
             want (a wrong code should not sit there looking accepted), but
             it is React's doing rather than ours, and worth naming because
             it is invisible in this file. Found while testing on 2026-08-09:
             repeated submits appeared to do nothing, because the cleared
             field made `required` below block the submit silently before
             the action ever ran. */
          required
        />
        <span className="auth-hint">
          {/* Deliberately not "check your spam folder" as an instruction —
              Sam's copy call on /forgot-password: an imperative sends
              people past the inbox they have already checked. */}
          It can take a moment to arrive. Worth a look in spam if it doesn’t.
        </span>
      </div>

      {error && <div className="auth-error">{error}</div>}
      {notice && <div className="auth-notice">{notice}</div>}

      {/* Mounted here for the resend, not for the code — see the header.
          Usually silent and zero-height, so it costs her nothing visually. */}
      <TurnstileWidget onReadyChange={setPassReady} />

      {/* ⚠ NOT gated on passReady. Verifying needs no pass, and holding this
          button while Cloudflare thinks would be stopping her at the one
          box this whole slice exists to get her through. */}
      <button type="submit" className="auth-submit" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="auth-switch">
        <button
          type="button"
          className="auth-linkbtn"
          onClick={handleResend}
          disabled={submitting || cooldown > 0 || !passReady}
        >
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
        </button>
        <span className="auth-switch-sep">·</span>
        {/* ⚠ A button calling the action directly, NOT a nested <form> —
            HTML forbids one form inside another and browsers drop the
            inner one, so the control would silently stop working.
            And not a plain link either: clearing the cookie needs an
            action (Next.js forbids writing cookies during a render), and a
            link would leave the old address alive to reappear on reload. */}
        <button
          type="button"
          className="auth-linkbtn"
          disabled={submitting}
          onClick={handleRestart}
        >
          Use a different address
        </button>
      </div>

      <div className="auth-switch">
        <Link href={passwordHref}>Use your password instead</Link>
      </div>
    </form>
  );
}
