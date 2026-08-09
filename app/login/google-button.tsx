// mynclex/app/login/google-button.tsx
//
// The Google door — slice 5d. A server component wrapping one Server Action,
// so it works with JavaScript disabled and needs no client bundle.
//
// ⭐ THE WORDS ARE "SIGN IN WITH GOOGLE", NOT "CONTINUE WITH GOOGLE", and
// that is a decision rather than a default. "Continue with" is the industry
// phrasing precisely because it papers over whether an account is about to be
// created — which is the one thing this button must not be vague about. Here
// Google signs in people who already have an account and turns everyone else
// away, so the label says what happens.
//
// ⓘ Its own <form>, sibling to the password/code form rather than inside it:
// forms cannot nest, and this posts to a different action.

import { startGoogleSignIn } from './google-actions';

export function GoogleButton({ next }: { next?: string }) {
  return (
    <>
      {/* Reads as "here is another way in", not as a step in the form above.
          The rule is the same one the code-door link follows — the primary
          door must stay the obvious thing to press. */}
      <div className="auth-or">
        <span>or</span>
      </div>

      <form action={startGoogleSignIn} className="auth-alt">
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <button type="submit" className="auth-google">
          {/* Google's own mark. aria-hidden because the button's text already
              names the provider — a screen reader announcing the logo would
              say "Google" twice. */}
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
            />
          </svg>
          Sign in with Google
        </button>
      </form>
    </>
  );
}
