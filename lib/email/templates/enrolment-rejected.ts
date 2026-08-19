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
import { BRAND, SUPPORT_EMAIL, button, esc, factRow } from './wrapper';

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
        `Please contact ${p.tutorName} for any further details, or to talk through your options — ` +
          'including anything relating to what you have already paid.'
      )}
    </p>

    ${button(p.contactUrl, 'Contact the tutor')}

    <p style="margin:20px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;
              line-height:1.6;color:${BRAND.muted};">
      ${esc(`If you would rather not go through your tutor, write to ${SUPPORT_EMAIL} and we will help.`)}
    </p>`;
}

export const enrolmentRejectedTemplate: EmailTemplate<EnrolmentRejectedPayload> = {
  key: 'enrolment.rejected',
  name: 'Place not confirmed',
  subject,
  body,
  previews: [
    {
      label: 'Tutor-led cohort',
      payload: {
        recipientName: 'Ama',
        programmeName: 'NCLEX-RN Live — The 8-Week Pass Plan',
        cohortName: 'Evenings — Tuesdays 19:00 GMT',
        tutorName: 'Steven Harris',
        contactUrl:
          'https://nclex.quademia.com/programmes/50000000-0000-4000-8000-000000000001#contact-tutor',
      },
    },
    {
      label: 'Self-paced (no cohort)',
      payload: {
        recipientName: 'Kofi',
        programmeName: 'NCLEX Self-Paced Refresher',
        cohortName: null,
        tutorName: 'Steven Harris',
        contactUrl:
          'https://nclex.quademia.com/programmes/c1f0f031-da2f-4f1a-9ce9-e1243228b4e6#contact-tutor',
      },
    },
    {
      label: 'No name on file',
      payload: {
        recipientName: null,
        programmeName: 'NCLEX 4-Week Tutor-Led Bootcamp',
        cohortName: 'August cohort',
        tutorName: 'Steven Harris',
        contactUrl:
          'https://nclex.quademia.com/programmes/9988d69b-9a71-400d-a7ad-3965e0d7c383#contact-tutor',
      },
    },
  ],
};

/** The line the footer prints on this email. */
export const ENROLMENT_REJECTED_FOOTER_CONTEXT =
  'You are receiving this because you requested a place on a MyNclex programme.';
