// mynclex/lib/email/templates/access-expired.ts
//
// "Your access to <programme> has ended."
//
// ⭐ THE SECOND HALF OF THE PAIR. The sweep's rule (settled 2026-08-12): a
// scheduled email is a state change, warned or recorded. `access_expiring`
// is the warning; this is the record. ⚠ And unlike its sibling it comes
// out of the UPDATE itself (a data-modifying CTE in migration
// 20260923120000), so the set of these emails IS the set of students who
// actually expired — it cannot drift from the thing it reports.
//
// ⚠ FILLED IN SQL. TypeScript checks nothing about what arrives.
//
// ⚠⚠ ONE PROGRAMME ENDED, NOT AN ACCOUNT. See the shouted note on
// access-expiring.ts — the same trap, and worse here, because "your access
// has ended" is even easier to write as though everything stopped.
//
// ⭐ NO APOLOGY AND NO SALES PITCH. She reached the end of a window she
// bought; nothing went wrong and nobody failed. The email's whole job is
// to make sure the locked door is not a mystery, and to say plainly what
// gets it open. A push to re-purchase would turn a courtesy into a
// solicitation, which is the fastest way to make the next one unread.
//
// ⚠ Every non-literal value must go through esc().

import type { AccessExpiredPayload, EmailTemplate } from '../types';
import { appOrigin, BRAND, button, esc, factRow } from './wrapper';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function subject(p: AccessExpiredPayload): string {
  return `Your access to ${p.programmeTitle} has ended`;
}

function body(p: AccessExpiredPayload): string {
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';
  const title = esc(p.programmeTitle);
  const when = esc(formatDate(p.expiresAtISO));

  // ⚠ For a student paused over arrears, this is the second door closing,
  // not the first. Telling her she "has lost access" as though it were
  // news describes a day she experienced weeks ago.
  const lede = p.wasPaused
    ? `Your enrolment on <strong>${title}</strong> closed on <strong>${when}</strong>. Access had already been on hold over an unpaid instalment; that hold is now permanent.`
    : `Your access window on <strong>${title}</strong> ended on <strong>${when}</strong>, so the programme no longer opens.`;

  const whatToDo = p.tutorActive
    ? `If you would still like to finish it, ${esc(
        p.tutorName,
      )} can give you more time — just ask. Enrolling again also works.`
    : `If you would still like to finish it, get in touch with us and we will sort it out. Enrolling again also works.`;

  const href = `${appOrigin()}/programmes/${encodeURIComponent(p.programmeId)}`;

  return `
    <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${greeting}</p>

    <p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${lede}</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="width:100%;margin:24px 0;border-collapse:collapse;">
      ${factRow('Programme', title)}
      ${p.cohortName ? factRow('Cohort', esc(p.cohortName)) : ''}
      ${factRow('Access ended', when)}
    </table>

    <p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(
        'The rest of your account is unaffected — anything else you are enrolled on, and the question bank if you have it, work exactly as before.',
      )}
    </p>

    <p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(
        'Everything you completed is still saved against your account. If you come back to this programme you would carry on from where you stopped, not start again.',
      )}
    </p>

    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${whatToDo}</p>

    ${button(href, 'View the programme')}`;
}

export const accessExpiredTemplate: EmailTemplate<AccessExpiredPayload> = {
  key: 'enrolment.access_expired',
  name: 'Access ended',
  subject,
  body,
  previews: [
    {
      label: 'The ordinary case — a window simply ran out',
      payload: {
        recipientName: 'Ama',
        programmeTitle: 'NCLEX Prioritization Crash Course',
        cohortName: null,
        tutorName: 'Steven Harris',
        tutorActive: true,
        expiresAtISO: '2026-08-23T10:48:52.000Z',
        wasPaused: false,
        programmeId: '60000000-0000-4000-8000-000000000001',
        enrolmentId: '71000000-0000-4000-8000-000000000911',
      },
    },
    {
      // ⚠ Check this does not announce a loss she already lived through.
      label: 'Was already paused for arrears — the second door',
      payload: {
        recipientName: 'Kwame',
        programmeTitle: 'NCLEX 4-Week Tutor-Led Bootcamp',
        cohortName: 'March intake',
        tutorName: 'Steven Harris',
        tutorActive: true,
        expiresAtISO: '2026-08-23T10:48:52.000Z',
        wasPaused: true,
        programmeId: '60000000-0000-4000-8000-000000000002',
        enrolmentId: 'ba7d6a10-24b9-4616-b030-60eabb4efe44',
      },
    },
    {
      label: 'Suspended tutor — points at us, names nobody to chase',
      payload: {
        recipientName: null,
        programmeTitle: 'Retake Recovery Programme',
        cohortName: null,
        tutorName: 'Steven Harris',
        tutorActive: false,
        expiresAtISO: '2026-08-23T10:48:52.000Z',
        wasPaused: false,
        programmeId: '60000000-0000-4000-8000-000000000004',
        enrolmentId: '71000000-0000-4000-8000-000000000106',
      },
    },
  ],
};

/** The line the footer prints on this email. */
export const ACCESS_EXPIRED_FOOTER_CONTEXT =
  'You are receiving this because your access window on this programme has ended.';
