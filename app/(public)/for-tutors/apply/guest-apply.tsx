// mynclex/app/(public)/for-tutors/apply/guest-apply.tsx
//
// Applying with no account — sub-slice 2a-ii.
//
// ⭐ APPLYING IS A LOGGED-OUT ACT (Sam, 2026-08-22). The person who
// reaches "For tutors" heard about MyNclex, arrived as a stranger, and
// clicked. An earlier cut of this file put a six-field form in front of
// them and discovered at submit whether they already had an account —
// which designed the page around the RARE visitor (somebody already
// signed in who decides to apply) and made the common one work for it.
//
// So: the email is the first and only thing asked. Then one of two
// things happens, and neither costs them their application.
//
// ⚠⚠ THE ANSWER TO "DOES THIS ADDRESS HAVE AN ACCOUNT?" COMES FROM THE
// SIGNUP ATTEMPT, NOT FROM A LOOKUP, and that is not a shortcut — it is
// the only safe option here. The intended design checked the email on
// step one behind a captcha. lib/auth/turnstile.ts explains why that
// cannot exist: a Turnstile token is validated exactly ONCE and Supabase
// must be the one to spend it, so our own check can only confirm that a
// token ARRIVED. A script sends any string. The thresholds do not close
// it either — they are keyed by email, which is the thing an enumerator
// varies.
//
// ⓘ Hence step two is deliberately SHORT: a name and a password. If the
// address turns out to be taken, they have lost two fields rather than a
// 400-word application, which is the harm the email-first design existed
// to prevent. That is also why there is no draft to preserve across the
// sign-in bounce any more — nobody has written one yet.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createApplicantAccountAction } from '@/lib/tutors/actions';
import { TurnstileWidget, resetTurnstile } from '@/components/auth/turnstile-widget';
import { loginHref } from '@/lib/auth/safe-next';
import { TUTOR_APPLICATION_PATH } from '@/lib/tutors/types';

type Step = 'EMAIL' | 'ACCOUNT' | 'EXISTS';

export function GuestApply() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('EMAIL');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passReady, setPassReady] = useState(false);

  const emailReady = /.+@.+\..+/.test(email.trim());

  async function createAccount(formData: FormData) {
    setError(null);
    setBusy(true);

    const result = await createApplicantAccountAction(formData);

    if (result.ok) {
      // They are signed in and hold no role — which is what an applicant
      // is. Refreshing re-renders this route as the signed-in blank form,
      // which is step three.
      router.refresh();
      return;
    }

    if (result.accountExists) {
      setStep('EXISTS');
      setBusy(false);
      return;
    }

    setError(result.error);
    // Single-use pass, spent by this attempt — and every error here is
    // one they fix and immediately resubmit.
    resetTurnstile();
    setBusy(false);
  }

  // ── Step 1: who are you? ───────────────────────────────────────────
  if (step === 'EMAIL') {
    return (
      <form
        className="ft-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (emailReady) setStep('ACCOUNT');
        }}
      >
        <div className="form-group">
          <label htmlFor="ga-email">What is your email address?</label>
          <input
            id="ga-email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          {/* ⚠ Says what will happen without claiming to know which — we
              genuinely do not, until Supabase answers. */}
          <span className="form-hint">
            If you already have a MyNclex account, we will ask you to sign
            in. If not, we will set one up.
          </span>
        </div>

        <div className="ft-form-foot">
          <button type="submit" className="ft-cta" disabled={!emailReady}>
            Continue
          </button>
        </div>
      </form>
    );
  }

  // ── The branch: this address already has an account ────────────────
  if (step === 'EXISTS') {
    return (
      <div className="ft-state">
        <h2 className="ft-state-title">You already have an account</h2>
        <p className="ft-state-body">
          <strong>{email}</strong> is already registered with us. Sign in
          and we will bring you straight back here to finish your
          application.
        </p>
        {/* loginHref, not a hand-built query string — safe-next.ts exists
            so nobody re-implements the open-redirect guard, and it
            prefills the address they just typed. */}
        <Link href={loginHref(TUTOR_APPLICATION_PATH, { email })} className="ft-cta">
          Sign in to continue
        </Link>
        <p className="ft-aside" style={{ textAlign: 'left' }}>
          Not your address?{' '}
          <button
            type="button"
            className="ft-linkish"
            onClick={() => {
              setStep('EMAIL');
              setError(null);
            }}
          >
            Use a different one
          </button>
          .
        </p>
      </div>
    );
  }

  // ── Step 2: set up the account ─────────────────────────────────────
  return (
    <form className="ft-form" action={createAccount}>
      <p className="ft-step-lead">
        Setting up an account for <strong>{email}</strong> ·{' '}
        <button
          type="button"
          className="ft-linkish"
          onClick={() => setStep('EMAIL')}
          disabled={busy}
        >
          change
        </button>
      </p>

      {/* Carried, not re-asked. */}
      <input type="hidden" name="email" value={email} />

      <div className="auth-row">
        <div className="form-group">
          <label htmlFor="ga-forename">First name</label>
          <input id="ga-forename" name="forename" type="text" autoComplete="given-name" required disabled={busy} />
        </div>
        <div className="form-group">
          <label htmlFor="ga-surname">Last name</label>
          <input id="ga-surname" name="surname" type="text" autoComplete="family-name" required disabled={busy} />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="ga-password">Choose a password</label>
        <input
          id="ga-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={busy}
        />
        <span className="form-hint">Minimum 8 characters.</span>
      </div>

      {error && <p className="ft-error">{error}</p>}

      <TurnstileWidget onReadyChange={setPassReady} />

      <div className="ft-form-foot">
        <button type="submit" className="ft-cta" disabled={busy || !passReady}>
          {busy ? 'Setting up…' : 'Continue'}
        </button>
        <p className="ft-form-note">
          Next you will write your application. Applying does not give you
          a tutor account — it asks us for one, and we review every
          application.
        </p>
      </div>
    </form>
  );
}
