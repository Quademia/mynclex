// mynclex/lib/email/templates/enrolment-approved.ts
//
// "Your tutor confirmed your place."
//
// ⭐ THIS EMAIL WAS PROMISED BEFORE IT EXISTED. The receipt's
// PENDING_APPROVAL variant has been telling buyers "you will get another
// email as soon as your tutor approves your place" since 2026-08-18, on
// prod. This is that email. See the note on EnrolmentApprovedPayload for
// how the gap was made.
//
// ⭐ IT IS NOT A SECOND RECEIPT, and deliberately carries no money at
// all. She already has the receipt, which stated the amount and the plan;
// payment.installment_due handles what is owed next. Repeating either
// here would make three emails argue about one plan. This one says: you
// are in, here is where, here is when.
//
// ⚠ Every non-literal value must go through esc().

import type { EmailTemplate, EnrolmentApprovedPayload } from '../types';
import { BRAND, button, esc, factRow } from './wrapper';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function subject(p: EnrolmentApprovedPayload): string {
  // The place is the news, so the place leads. "for" rather than an
  // em-dash for the same reason as the tutor notice: real programme
  // titles supply their own dash.
  return `You're in — your place for ${p.programmeName} is confirmed`;
}

function body(p: EnrolmentApprovedPayload): string {
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';
  const place = p.cohortName ?? p.programmeName;

  return `
    <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${greeting}</p>
    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(`${p.tutorName} has confirmed your place in ${place}. Everything is ready — you can open it now.`)}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border:1px solid ${BRAND.line};border-radius:6px;padding:16px;background:#fbfcfd;">
      <tr>
        <td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${factRow('Programme', p.programmeName)}
            ${p.cohortName ? factRow('Cohort', p.cohortName) : ''}
            ${factRow('Tutor', p.tutorName)}
            ${
              // ⓘ Self-paced has no start date because there is nothing
              // to wait for. Saying "starts today" would be filler.
              p.startsOnISO ? factRow('Starts', formatDate(p.startsOnISO)) : ''
            }
            ${
              // ⓘ Null means lifetime access, which prints nothing —
              // "expires: never" invents an anxiety.
              p.accessExpiresAtISO ? factRow('Access until', formatDate(p.accessExpiresAtISO)) : ''
            }
          </table>
        </td>
      </tr>
    </table>

    ${button(p.actionUrl, p.actionLabel)}`;
}

const APPROVED_AT_COHORT = '2026-09-05T00:00:00.000Z';

export const enrolmentApprovedTemplate: EmailTemplate<EnrolmentApprovedPayload> = {
  key: 'enrolment.approved',
  name: 'Place confirmed',
  subject,
  body,
  previews: [
    {
      label: 'Tutor-led cohort · fixed access window',
      payload: {
        recipientName: 'Ama',
        programmeName: 'NCLEX-RN Live — The 8-Week Pass Plan',
        cohortName: 'Evenings — Tuesdays 19:00 GMT',
        tutorName: 'Steven Harris',
        startsOnISO: APPROVED_AT_COHORT,
        accessExpiresAtISO: '2026-12-05T00:00:00.000Z',
        actionUrl: 'https://nclex.quademia.com/student/cohort/56000000-0000-4000-8000-00000000000a',
        actionLabel: 'Go to your cohort',
      },
    },
    {
      // Self-paced: no cohort, no start date, and lifetime access — so
      // three of the five fact rows are correctly absent.
      label: 'Self-paced · lifetime access',
      payload: {
        recipientName: 'Kofi',
        programmeName: 'NCLEX Self-Paced Refresher',
        cohortName: null,
        tutorName: 'Steven Harris',
        startsOnISO: null,
        accessExpiresAtISO: null,
        actionUrl: 'https://nclex.quademia.com/student/programme/c1f0f031-da2f-4f1a-9ce9-e1243228b4e6',
        actionLabel: 'Go to your programme',
      },
    },
    {
      // ⓘ A buyer who paid before creating an account has no profile
      // name until /welcome, so the greeting must stand without one.
      label: 'No name on file',
      payload: {
        recipientName: null,
        programmeName: 'NCLEX 4-Week Tutor-Led Bootcamp',
        cohortName: 'August cohort',
        tutorName: 'Steven Harris',
        startsOnISO: APPROVED_AT_COHORT,
        accessExpiresAtISO: null,
        actionUrl: 'https://nclex.quademia.com/student/cohort/70000000-0000-4000-8000-000000000001',
        actionLabel: 'Go to your cohort',
      },
    },
  ],
};

/** The line the footer prints on this email. */
export const ENROLMENT_APPROVED_FOOTER_CONTEXT =
  'You are receiving this because your tutor confirmed a place you paid for on MyNclex.';
