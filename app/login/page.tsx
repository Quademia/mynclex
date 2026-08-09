// mynclex/app/login/page.tsx
//
// Server component: reads an optional `next` return path + `email` prefill from
// the URL (used when another surface — e.g. checkout's "log in to continue" —
// sent the user here), validates `next`, and hands both to the client form.
// `next` is forwarded on the Create-one link too, so it survives if they
// register instead.
//
// ⭐ TWO DOORS, ONE PAGE, AND THE URL SAYS WHICH (slice 3e). `?mode=code`
// swaps the password form for the email-code form. Carried in the URL
// rather than in client state on purpose: it survives a reload, it survives
// the back button, and it keeps this page a server component that can read
// the pending-code cookie before rendering anything.
//
// ⭐ THE COOKIE DECIDES WHICH *STEP* OF THE CODE DOOR SHE LANDS ON, and
// that is what makes this flow work on a phone. She asks for a code,
// switches to Gmail, and the browser discards the tab behind her; coming
// back reloads this page, and reading the cookie here is what puts her on
// the code box instead of an empty email field. Asking again is what would
// trip the 3-an-hour limit, so the alternative is a student locked out
// because the app forgot where she was.

import Link from 'next/link';
import { LoginForm } from './login-form';
import { CodeForm } from './code-form';
import { safeNext } from '@/lib/auth/safe-next';
import { readPendingCodeEmail } from '@/lib/auth/code-session';
import '@/styles/tokens.css';
import '@/styles/auth.css';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string; mode?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next) ?? undefined;
  const initialEmail = typeof sp.email === 'string' ? sp.email : undefined;
  const codeMode = sp.mode === 'code';

  const registerHref = next
    ? `/register?next=${encodeURIComponent(next)}`
    : '/register';

  // Only read when it can change what renders. On the password door the
  // answer is unused, and a cookie read there would make the page dynamic
  // for nothing.
  const pendingEmail = codeMode
    ? ((await readPendingCodeEmail()) ?? undefined)
    : undefined;

  return (
    <main className="auth-main">
      <section className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">
            {codeMode
              ? 'Sign in with a code sent to your email.'
              : 'Sign in to continue your NCLEX-RN prep.'}
          </p>
        </div>

        {codeMode ? (
          <CodeForm
            next={next}
            initialEmail={initialEmail}
            pendingEmail={pendingEmail}
          />
        ) : (
          <LoginForm next={next} initialEmail={initialEmail} />
        )}

        <div className="auth-footer">
          Don&apos;t have an account? <Link href={registerHref}>Create one</Link>
        </div>
      </section>
    </main>
  );
}
