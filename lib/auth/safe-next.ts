// mynclex/lib/auth/safe-next.ts
//
// Shared "return here after login" plumbing. The capability itself lives in the
// canonical login (the login page + loginAction); ANY surface that wants to
// send a user to log in and bring them back uses these helpers, so nobody
// re-implements the open-redirect guard.
//
// `next` is honoured ONLY when it's a safe, in-app, absolute path: a single
// leading "/" that isn't "//" or "/\" (protocol-relative / backslash forms that
// browsers treat as off-site) and carries no whitespace. That blocks
// ?next=https://evil.com from turning login into an open redirector. It
// restores the ROUTE only — not in-page client state (e.g. a half-filled form);
// preserve that per-surface by encoding it into the path's query string.
//
// This is authentication-FLOW plumbing — distinct from lib/access/, which holds
// authorization gates (role/permission checks).

// Validate a candidate return path. Returns the path if it's a safe in-app
// absolute path, else null. Use everywhere a `next` value is read (the login
// page, the login action, any link builder).
export function safeNext(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v.startsWith('/')) return null; // must be an in-app absolute path
  if (v.startsWith('//') || v.startsWith('/\\')) return null; // not off-site
  if (/\s/.test(v)) return null; // no smuggled whitespace / newlines
  return v;
}

// Build a /login link that returns to `path` after a successful sign-in.
// `path` should be an in-app absolute path (e.g. "/checkout/programme/123").
// Optionally prefill the login email field. Falls back to a bare /login when
// `path` isn't a safe internal path.
export function loginHref(path: string, opts?: { email?: string }): string {
  const safe = safeNext(path);
  const params = new URLSearchParams();
  if (safe) params.set('next', safe);
  if (opts?.email) params.set('email', opts.email);
  const qs = params.toString();
  return qs ? `/login?${qs}` : '/login';
}
