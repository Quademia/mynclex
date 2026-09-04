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

import { appOrigin, BRAND, SUPPORT_EMAIL, esc } from './wrapper';

const SITE = 'https://quademia.com';

// ⚠ `const APP = APP_ORIGIN` used to sit here, and this footer is on EVERY
// email — so it was the single most-followed wrong link in the product
// (2026-09-04). It is now read per render, not at module load: see the
// module-scope warning on appOrigin(). SITE stays a literal because
// quademia.com is the marketing site and has no per-environment twin.

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
      <!-- ⚠ Do NOT restore "Reply to this email" here. We send from
           noreply@, so that sentence would be false. Anyone who replies
           anyway is caught by the Reply-To header set in send.ts — this
           line is for the people who read before they click. -->
      Questions? Write to
      <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND.accent};text-decoration:none;">${SUPPORT_EMAIL}</a>.
    </p>
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND.muted};">
      <a href="${appOrigin()}" style="color:${BRAND.muted};text-decoration:underline;">MyNclex</a>
      &nbsp;·&nbsp;
      <a href="${SITE}" style="color:${BRAND.muted};text-decoration:underline;">Quademia</a>
    </p>`;
}
