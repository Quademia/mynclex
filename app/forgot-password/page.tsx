// mynclex/app/forgot-password/page.tsx
//
// Server component. Reads an optional `email` prefill from the URL so the
// login form can carry across whatever the student already typed — she
// has just failed to sign in, and retyping the address is the last thing
// she needs.

import Link from 'next/link';
import { ForgotForm } from './forgot-form';
import '@/styles/tokens.css';
import '@/styles/auth.css';

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const sp = await searchParams;
  const initialEmail = typeof sp.email === 'string' ? sp.email : undefined;

  return (
    <main className="auth-main">
      <section className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Reset your password</h1>
          <p className="auth-subtitle">
            Enter your email and we&apos;ll send you a link to set a new one.
          </p>
        </div>

        <ForgotForm initialEmail={initialEmail} />

        <div className="auth-footer">
          Remembered it? <Link href="/login">Sign in</Link>
        </div>
      </section>
    </main>
  );
}
