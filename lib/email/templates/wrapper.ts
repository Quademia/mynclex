// mynclex/lib/email/templates/wrapper.ts
//
// The outer shell every email sits inside, so they all read as coming
// from the same place. Header band, a white card, then whatever the
// template produced, then the shared footer.
//
// ⚠ EMAIL HTML IS NOT WEB HTML. Three rules this file follows and any
// new template must too:
//   1. Inline styles only. Gmail strips <style> blocks in some clients,
//      and CSS custom properties (our --primary etc.) are not supported
//      at all — so the brand colours are written here as literal hex,
//      copied from styles/tokens.css. If those tokens change, this file
//      does not follow automatically. That duplication is deliberate:
//      the alternative is an email that renders unstyled.
//   2. Tables for layout. Outlook's rendering engine is Word's.
//   3. A max width around 600px, which is what mail clients assume.

/**
 * Where a reader should actually write. Single-sourced because it is
 * used twice and the two must never disagree: the footer PRINTS it, and
 * send.ts sets it as the Reply-To header.
 *
 * ⭐ We send FROM noreply@ (these are auto-generated), so Reply-To is
 * what stops "Questions? Write to us" being a dead end for anyone who
 * just hits Reply out of habit — which most people do.
 */
export const SUPPORT_EMAIL = 'support@quademia.com';

/**
 * Where a link in an email points.
 *
 * ⭐ THIS WAS A HARDCODED PROD LITERAL UNTIL 2026-09-04, and the reasoning
 * on it was half right. The old note said: there is no request behind a
 * scheduled send — the drain runs on a cron — so an origin cannot be
 * derived the way an invite link derives one. True, and it does rule out
 * headers(). It does NOT follow that the origin is unknowable: the
 * templates render INSIDE THE WORKER (that is the whole reason
 * app/cron/email-drain/route.ts exists — pg_cron cannot execute a .ts
 * template), and a Worker with no visitor in front of it still knows
 * perfectly well which deployment it is. It just has to be told once.
 *
 * ⚠⚠ WHAT IT COST. On 2026-09-04 a tutor being pitched followed the
 * buttons in five emails sent from dev, landed on PROD where his account
 * did not exist, and spent 34 minutes there: 18 failed sign-ins and three
 * password resets that could never arrive (the reset form says "check your
 * email" whether or not an account exists, by design). He did nothing
 * wrong — every link he clicked told him to go there.
 *
 * ⚠ A FUNCTION, NEVER A MODULE-SCOPE CONST. Under OpenNext on Workers
 * process.env is bound per request; a value read at module load can run
 * before the environment is attached and would freeze `undefined` into the
 * isolate for its whole life. Same hazard as the repo's rule about never
 * building a Supabase client at module scope. footer.ts and
 * tutor-notice.ts both HAD such a const and were changed with this.
 *
 * ⓘ Server-side only, so deliberately NOT a NEXT_PUBLIC_* variable: those
 * are inlined at build time and must be declared in three places (see the
 * Known Workaround in CLAUDE.md). This one is read at runtime, so it lives
 * in .env.local and wrangler.jsonc only — no build-step entry, no redeploy
 * to change it. app/layout.tsx's metadataBase keeps NEXT_PUBLIC_SITE_URL
 * because an OG tag genuinely is baked in at build.
 *
 * ⓘ The prod literal remains the fallback on purpose: an unset variable
 * degrades to exactly the old behaviour rather than to a broken link.
 */
export function appOrigin(): string {
  return process.env.APP_ORIGIN ?? 'https://nclex.quademia.com';
}

/** Brand colours, mirrored from styles/tokens.css (see rule 1 above). */
export const BRAND = {
  primary: '#1e3a5f',
  primaryDark: '#142d4c',
  accent: '#2d7d72',
  ink: '#1f2937',
  muted: '#6b7280',
  line: '#e5e7eb',
  bg: '#f9fafb',
  card: '#ffffff',
} as const;

/**
 * Escape anything that came from a person or a database before it goes
 * into HTML. A programme called "Nursing < Level 2" would otherwise cut
 * the email off at that point.
 *
 * ⚠ Every interpolation of non-literal text in a template must pass
 * through this. There is no framework here doing it automatically —
 * these are plain strings.
 */
export function esc(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A primary call-to-action button, built the way mail clients tolerate. */
export function button(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr>
        <td align="center" bgcolor="${BRAND.accent}" style="border-radius:6px;">
          <a href="${esc(href)}"
             style="display:inline-block;padding:12px 28px;font-family:Helvetica,Arial,sans-serif;
                    font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            ${esc(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

/** A labelled row inside a facts block. `value` is escaped; `label` is ours. */
export function factRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:6px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.muted};">
        ${label}
      </td>
      <td align="right" style="padding:6px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};font-weight:600;">
        ${esc(value)}
      </td>
    </tr>`;
}

/**
 * Wrap a rendered body in the shared shell.
 * `body` and `footer` are already-built HTML — do not escape them.
 */
export function wrap(opts: { heading: string; body: string; footer: string }): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(opts.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.bg};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${BRAND.bg};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
                 style="max-width:600px;width:100%;">

            <!-- header band -->
            <tr>
              <td style="background:${BRAND.primary};border-radius:8px 8px 0 0;padding:20px 28px;">
                <span style="font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:#ffffff;">
                  Quademia
                </span>
                <span style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#c9d6e5;padding-left:8px;">
                  MyNclex
                </span>
              </td>
            </tr>

            <!-- card -->
            <tr>
              <td style="background:${BRAND.card};padding:28px;border:1px solid ${BRAND.line};border-top:none;">
                <h1 style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:20px;
                           line-height:1.3;color:${BRAND.ink};font-weight:700;">
                  ${esc(opts.heading)}
                </h1>
                ${opts.body}
              </td>
            </tr>

            <!-- footer -->
            <tr>
              <td style="background:${BRAND.card};border:1px solid ${BRAND.line};border-top:none;
                         border-radius:0 0 8px 8px;padding:20px 28px;">
                ${opts.footer}
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
