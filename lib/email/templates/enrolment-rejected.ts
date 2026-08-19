// mynclex/lib/email/templates/enrolment-rejected.ts
//
// "Your place was not confirmed."
//
// ⚠⚠ THE HARDEST EMAIL IN THE PRODUCT SO FAR, because the reader has
// PAID and is being refused. Three rules follow from that, and none of
// them is style:
//
//  1. NO REFUND IS PROMISED. nclex_reject_enrolment sets status,
//     terminal_at and tutor_note — nothing touches the money. Her payment
//     row stays ACTIVATED and payment.refunded is unbuilt. Writing "your
//     refund is on its way" would be a commitment no code keeps and no
//     process exists for. Settled with Sam 2026-08-19.
//  2. NO REASON IS INVENTED, and the tutor's stored note is NOT quoted —
//     see EnrolmentRejectedPayload. The reason comes from the tutor, in a
//     conversation, not from us guessing.
//  3. IT MUST NOT DEAD-END. "Contact your tutor" with no way to do so is
//     worse than saying nothing, so the button goes to the programme
//     page's own Contact-the-tutor form, which lands in a queue the tutor
//     already reads.
//
// ⓘ Sam, 2026-08-19: rejections are unlikely to occur — but "unlikely"
// is exactly when silence goes unnoticed for longest.
//
// ⚠ Every non-literal value must go through esc().

import type { EmailTemplate, EnrolmentRejectedPayload } from '../types';
// ⓘ No `button` import: this is the one email with no call to action.
// There is nothing for her to open — the next step is a conversation,
// so the contact details ARE the action.
import { BRAND, SUPPORT_EMAIL, esc, factRow } from './wrapper';

function subject(p: EnrolmentRejectedPayload): string {
  // ⚠ Plain and non-alarming. "Rejected" and "declined" are words that
  // land badly in a subject line read on a phone, and the body is where
  // the detail belongs.
  return `About your place in ${p.programmeName}`;
}

function body(p: EnrolmentRejectedPayload): string {
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';
  const place = p.cohortName ?? p.programmeName;

  return `
    <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${greeting}</p>
    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(
        `${p.tutorName} has not been able to confirm your place in ${place}.`
      )}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border:1px solid ${BRAND.line};border-radius:6px;padding:16px;background:#fbfcfd;">
      <tr>
        <td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${factRow('Programme', p.programmeName)}
            ${p.cohortName ? factRow('Cohort', p.cohortName) : ''}
            ${factRow('Tutor', p.tutorName)}
          </table>
        </td>
      </tr>
    </table>

    <p style="margin:20px 0 0;padding:12px 14px;background:${BRAND.bg};
              border-left:3px solid ${BRAND.accent};border-radius:4px;
              font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;
              color:${BRAND.ink};">
      ${esc(
        `Please contact ${p.tutorName} directly for any further details, or to talk through ` +
          'your options — including anything relating to what you have already paid.'
      )}
    </p>

    ${contactBlock(p)}

    <p style="margin:20px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;
              line-height:1.6;color:${BRAND.muted};">
      ${esc(`If you would rather not go through your tutor, write to ${SUPPORT_EMAIL} and we will help.`)}
    </p>`;
}

/**
 * The tutor's own contact details, as live links.
 *
 * ⭐⭐ REPLACED A BUTTON TO THE CONTACT-TUTOR FORM (Sam, 2026-08-19).
 * The form looked like the safer choice — it kept the tutor's address
 * private and landed in a queue they already read — and it was not.
 * `nclex_submit_enquiry` is idempotent on (programme, email): where an
 * open lead already exists it returns that one and NEVER INSERTS the new
 * message, while still showing a success tick. A refused student is
 * MORE likely than average to have enquired before buying, so the one
 * message that most needed to arrive was the one most likely to vanish,
 * invisibly to both of them. A mailto: cannot fail quietly.
 *
 * ⓘ Falls back to the support line alone if we somehow have no address —
 * a contact box with nothing in it is worse than no box.
 */
function contactBlock(p: EnrolmentRejectedPayload): string {
  if (!p.tutorEmail) return '';

  const rows = [
    `<tr>
       <td style="padding:6px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.muted};">Email</td>
       <td align="right" style="padding:6px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;">
         <a href="mailto:${esc(p.tutorEmail)}" style="color:${BRAND.accent};text-decoration:none;">${esc(p.tutorEmail)}</a>
       </td>
     </tr>`,
  ];

  // ⚠ Conditional because it is null for EVERY tutor today —
  // nclex_users.phone_number is empty across the board and no screen
  // collects it yet. Built now so the row appears by itself the day one
  // exists, rather than needing this file reopened.
  if (p.tutorPhone) {
    rows.push(
      `<tr>
         <td style="padding:6px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.muted};">Phone</td>
         <td align="right" style="padding:6px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;">
           <a href="tel:${esc(p.tutorPhone.replace(/[^\d+]/g, ''))}" style="color:${BRAND.accent};text-decoration:none;">${esc(p.tutorPhone)}</a>
         </td>
       </tr>`
    );
  }

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin-top:16px;border:1px solid ${BRAND.line};border-radius:6px;padding:16px;background:${BRAND.card};">
      <tr>
        <td>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;
                      color:${BRAND.ink};padding-bottom:6px;">
            ${esc(`How to reach ${p.tutorName}`)}
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${rows.join('')}
          </table>
        </td>
      </tr>
    </table>`;
}

export const enrolmentRejectedTemplate: EmailTemplate<EnrolmentRejectedPayload> = {
  key: 'enrolment.rejected',
  name: 'Place not confirmed',
  subject,
  body,
  previews: [
    {
      // ⓘ What EVERY rejection looks like today: email only, because no
      // tutor has a phone number on file.
      label: 'Tutor-led cohort · email only (today’s reality)',
      payload: {
        recipientName: 'Ama',
        programmeName: 'NCLEX-RN Live — The 8-Week Pass Plan',
        cohortName: 'Evenings — Tuesdays 19:00 GMT',
        tutorName: 'Steven Harris',
        tutorEmail: 'steven.harris@example-tutor.com',
        tutorPhone: null,
      },
    },
    {
      // What it becomes once a phone number is captured. Built ahead so
      // the row is already proven when that screen ships.
      label: 'With a phone number on file',
      payload: {
        recipientName: 'Ama',
        programmeName: 'NCLEX-RN Live — The 8-Week Pass Plan',
        cohortName: 'Evenings — Tuesdays 19:00 GMT',
        tutorName: 'Steven Harris',
        tutorEmail: 'steven.harris@example-tutor.com',
        tutorPhone: '+233 24 123 4567',
      },
    },
    {
      label: 'Self-paced (no cohort)',
      payload: {
        recipientName: 'Kofi',
        programmeName: 'NCLEX Self-Paced Refresher',
        cohortName: null,
        tutorName: 'Steven Harris',
        tutorEmail: 'steven.harris@example-tutor.com',
        tutorPhone: null,
      },
    },
    {
      label: 'No name on file',
      payload: {
        recipientName: null,
        programmeName: 'NCLEX 4-Week Tutor-Led Bootcamp',
        cohortName: 'August cohort',
        tutorName: 'Steven Harris',
        tutorEmail: 'steven.harris@example-tutor.com',
        tutorPhone: null,
      },
    },
  ],
};

/** The line the footer prints on this email. */
export const ENROLMENT_REJECTED_FOOTER_CONTEXT =
  'You are receiving this because you requested a place on a MyNclex programme.';
