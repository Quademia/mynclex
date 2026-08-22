// mynclex/app/(public)/for-tutors/apply/guest-apply.tsx
//
// Applying with no account — sub-slice 2a-ii, the last of slice 2.
//
// ⭐ ONE DOOR (§5, as re-cut 2026-08-22). The person sees "apply to
// become a tutor" and nothing else; whether we create an account or send
// them to sign in is OUR branch, decided by the EMAIL they type, not by
// whether they happened to be signed in when they arrived.
//
// The rule this replaced routed on session state, and had no answer for
// the commonest real applicant: LOGGED OUT, BUT ALREADY HAS AN ACCOUNT.
// That is an existing MyNclex student, on her phone, tapping "become a
// tutor" — and the old rule walked her into a signup that fails after she
// had filled in the whole form.
//
// ⚠ SO THE DRAFT HAS TO SURVIVE THE BOUNCE. If we send her to sign in,
// she must not come back to an empty form and retype everything she just
// wrote — that would be the same dead end wearing better manners.
// sessionStorage, read back by <ApplyForm>, cleared once it is used.
//
// ⓘ safe-next.ts suggests preserving in-page state "by encoding it into
// the path's query string". Not here: the note runs to 4000 characters,
// which no URL should carry, and it would put an applicant's own words
// into browser history and every access log between here and the server.
// sessionStorage keeps it on their machine and dies with the tab.
//
// ⓘ The collision is discovered at signUp rather than by asking first.
// See applyAsGuestAction for why — briefly: a bare "is this email taken?"
// endpoint would be a BETTER enumeration oracle than /register, because
// /register makes an attacker solve a captcha for every address tested.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { applyAsGuestAction } from '@/lib/tutors/actions';
import { TurnstileWidget, resetTurnstile } from '@/components/auth/turnstile-widget';
import { loginHref } from '@/lib/auth/safe-next';
import { TUTOR_APPLICATION_PATH } from '@/lib/tutors/types';

/** Where a bounced draft waits. Read and cleared by <ApplyForm>. */
export const APPLY_DRAFT_KEY = 'nclex_tutor_apply_draft';

const NOTE_MIN = 40;

export function GuestApply() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passReady, setPassReady] = useState(false);
  /** Set when the address turns out to already have an account. */
  const [existingAccount, setExistingAccount] = useState<string | null>(null);

  const trimmed = note.trim();
  const noteReady = trimmed.length >= NOTE_MIN;

  async function handleSubmit(formData: FormData) {
    setError(null);
    setBusy(true);

    const result = await applyAsGuestAction(formData);

    if (result.ok) {
      // They are signed in now and the application is lodged. Refreshing
      // lands them on the PENDING state, which is the confirmation and
      // also what they will see whenever they come back.
      router.refresh();
      return;
    }

    if (result.accountExists) {
      // ⭐ Hold everything they typed, then send them to sign in. Coming
      // back with an empty form would be the dead end we removed.
      try {
        window.sessionStorage.setItem(
          APPLY_DRAFT_KEY,
          JSON.stringify({ organisation, note }),
        );
      } catch {
        // Private mode, or storage disabled. The bounce still works; they
        // just retype. Better than failing the whole submit over a draft.
      }
      setExistingAccount(email);
      setBusy(false);
      return;
    }

    setError(result.error);
    // The pass is single-use and this attempt spent it — and every error
    // here is one they fix and immediately resubmit.
    resetTurnstile();
    setBusy(false);
  }

  // ── The branch: this address already has an account ────────────────
  if (existingAccount) {
    return (
      <div className="ft-state">
        <h2 className="ft-state-title">You already have an account</h2>
        <p className="ft-state-body">
          <strong>{existingAccount}</strong> is already registered with us.
          Sign in and we will bring you straight back here — what you wrote
          has been kept.
        </p>
        {/* loginHref, not a hand-built query string — safe-next.ts exists
            so nobody re-implements the open-redirect guard, and it
            prefills the address they just typed so signing in is one
            field, not two. */}
        <Link href={loginHref(TUTOR_APPLICATION_PATH, { email: existingAccount })} className="ft-cta">
          Sign in to continue your application
        </Link>
        <p className="ft-aside" style={{ textAlign: 'left' }}>
          Not your address?{' '}
          <button
            type="button"
            className="ft-linkish"
            onClick={() => setExistingAccount(null)}
          >
            Use a different one
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form className="ft-form" action={handleSubmit}>
      <div className="ft-form-section">
        <h2 className="ft-form-section-title">About you</h2>

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
          <label htmlFor="ga-email">Email</label>
          <input
            id="ga-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={busy}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {/* Says what happens, without claiming we know whether they
              have one. The form finds that out when it submits. */}
          <span className="form-hint">
            If you already have a MyNclex account, use that address and we
            will ask you to sign in.
          </span>
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
      </div>

      <div className="ft-form-section">
        <h2 className="ft-form-section-title">Your application</h2>

        <div className="form-group">
          <label htmlFor="ga-org">
            Where do you work?{' '}
            <span className="form-hint">
              Optional — plenty of good tutors are freelance
            </span>
          </label>
          <input
            id="ga-org"
            name="organisation"
            type="text"
            value={organisation}
            onChange={(e) => setOrganisation(e.target.value)}
            placeholder="Hospital, school or practice"
            disabled={busy}
            maxLength={160}
          />
        </div>

        <div className="form-group">
          <label htmlFor="ga-note">
            Tell us about yourself{' '}
            <span className="form-hint">
              Your nursing and teaching background, and how you would run a
              programme
            </span>
          </label>
          <textarea
            id="ga-note"
            name="requestNote"
            rows={8}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How long you have been an RN, whether you have taught NCLEX before, and what a programme of yours would look like week by week."
            disabled={busy}
            maxLength={4000}
          />
          <p className="ft-counter">
            {noteReady
              ? `${trimmed.length} characters`
              : `${trimmed.length} of at least ${NOTE_MIN} characters — we need enough to review`}
          </p>
        </div>
      </div>

      {error && <p className="ft-error">{error}</p>}

      <TurnstileWidget onReadyChange={setPassReady} />

      <div className="ft-form-foot">
        <button type="submit" className="ft-cta" disabled={busy || !noteReady || !passReady}>
          {busy ? 'Creating your account…' : 'Create account and apply'}
        </button>
        <p className="ft-form-note">
          Applying does not give you a tutor account — it asks us for one.
          We review every application and email you either way.
        </p>
      </div>
    </form>
  );
}
