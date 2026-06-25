// mynclex/app/login/page.tsx
//
// Server component: reads an optional `next` return path + `email` prefill from
// the URL (used when another surface — e.g. checkout's "log in to continue" —
// sent the user here), validates `next`, and hands both to the client form.
// `next` is forwarded on the Create-one link too, so it survives if they
// register instead.

import Link from 'next/link';
import { LoginForm } from './login-form';
import { safeNext } from '@/lib/auth/safe-next';
import '@/styles/tokens.css';
import '@/styles/auth.css';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next) ?? undefined;
  const initialEmail = typeof sp.email === 'string' ? sp.email : undefined;

  const registerHref = next
    ? `/register?next=${encodeURIComponent(next)}`
    : '/register';

  return (
    <main className="auth-main">
      <section className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to continue your NCLEX-RN prep.</p>
        </div>

        <LoginForm next={next} initialEmail={initialEmail} />

        <div className="auth-footer">
          Don&apos;t have an account? <Link href={registerHref}>Create one</Link>
        </div>
      </section>
    </main>
  );
}
