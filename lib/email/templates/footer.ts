// mynclex/lib/email/templates/footer.ts
//
// The shared bottom of every email. One place, so a change to how we
// identify ourselves does not have to be made in 24 files.
//
// ⚠ NO COMPANY NAME, AND NO "Ltd". Quademia Ltd is not incorporated
// (found 2026-08-10) — the parent site carries no "Ltd" on any page as a
// standing rule, and an email is a worse place to get it wrong than a
// web page, because it cannot be edited after it is read. When
// registration completes, this file is the one place to add it.
//
// ⚠ NO UNSUBSCRIBE LINK, deliberately. These are transactional emails —
// a receipt, a payment reminder — and there is nothing to unsubscribe
// FROM. Offering it on a receipt implies she can opt out of being told
// she was charged. When engagement emails arrive (catalog P3), those
// need their own footer with a real preference link; that is the point
// to split this file, not before.

import { BRAND, esc } from './wrapper';

const SITE = 'https://quademia.com';
const APP = 'https://nclex.quademia.com';
const SUPPORT = 'hello@quademia.com';

/**
 * @param context One line saying why this email reached them. Required —
 *   a transactional email should always answer "why am I getting this?",
 *   and making it a parameter stops it being forgotten.
 */
export function footer(context: string): string {
  return `
    <p style="margin:0 0 10px;font-family:Helvetica,Arial,sans-serif;font-size:12px;
              line-height:1.6;color:${BRAND.muted};">
      ${esc(context)}
    </p>
    <p style="margin:0 0 10px;font-family:Helvetica,Arial,sans-serif;font-size:12px;
              line-height:1.6;color:${BRAND.muted};">
      Questions? Reply to this email or write to
      <a href="mailto:${SUPPORT}" style="color:${BRAND.accent};text-decoration:none;">${SUPPORT}</a>.
    </p>
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND.muted};">
      <a href="${APP}" style="color:${BRAND.muted};text-decoration:underline;">MyNclex</a>
      &nbsp;·&nbsp;
      <a href="${SITE}" style="color:${BRAND.muted};text-decoration:underline;">Quademia</a>
    </p>`;
}
