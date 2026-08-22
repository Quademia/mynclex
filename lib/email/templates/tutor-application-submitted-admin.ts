// mynclex/lib/email/templates/tutor-application-submitted-admin.ts
//
// ⭐ THE FIRST EMAIL THIS PRODUCT SENDS TO ITSELF — slice 2a-i.
//
// Every other template in this folder writes to a student or a tutor.
// This one tells US that a queue has something in it, and it exists for
// the reason §10 states plainly: without it, /admin/applications fills up
// and nobody knows. A self-serve doorway with no notification is a door
// that opens onto a room nobody visits.
//
// ⚠ WHICH MEANS THE RULES ABOUT DISCLOSURE INVERT HERE, and it is worth
// being explicit because every other file in this folder says the
// opposite. The outward emails withhold the admin's name, withhold
// internal notes, and are written knowing a stranger reads them. This one
// is read by the person who is about to make the decision, so it carries
// the applicant's name, address, organisation and their own words —
// there is no disclosure question when the reader is us.
//
// ⚠ BUT IT IS STILL A REAL EMAIL TO A REAL INBOX. It must never carry
// anything we would not want in a support thread, and it deliberately
// carries no decision link — nothing here approves or rejects. The buttons
// live behind a login and a permission check, which is where a decision
// about a person belongs.
//
// ⓘ The address is a constant rather than a lookup of everyone holding
// TUTORS_MANAGE (Sam, 2026-08-22). A fan-out to permission holders is a
// feature nobody needs while there is one admin, and a hardcoded support
// address cannot silently go nowhere the way an unset env var can.
//
// ⚠ Every non-literal value must go through esc().

import type { EmailTemplate, TutorApplicationSubmittedAdminPayload } from '../types';
import { BRAND, button, esc } from './wrapper';

function subject(p: TutorApplicationSubmittedAdminPayload): string {
  // ⓘ Interpolated, unlike every outward subject in this folder. Those
  // avoid names because a name makes a subject collidable and buys
  // nothing at a glance. Here it buys everything: this lands in a working
  // inbox beside other notifications, and "someone applied" forces the
  // reader to open it to learn who.
  const who = esc(p.applicantName);
  return p.submissionCount > 1
    ? `Tutor application (resubmitted) — ${who}`
    : `New tutor application — ${who}`;
}

function body(p: TutorApplicationSubmittedAdminPayload): string {
  const fact = (label: string, value: string) => `
    <tr>
      <td style="padding:4px 12px 4px 0;font-family:Helvetica,Arial,sans-serif;
                 font-size:12px;text-transform:uppercase;letter-spacing:.06em;
                 color:${BRAND.muted};white-space:nowrap;vertical-align:top;">${esc(label)}</td>
      <td style="padding:4px 0;font-family:Helvetica,Arial,sans-serif;
                 font-size:14.5px;line-height:1.5;color:${BRAND.ink};">${esc(value)}</td>
    </tr>`;

  return `
    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(
        p.submissionCount > 1
          ? 'Someone has updated and resubmitted their tutor application. Their previous decision and the reason given are on their record.'
          : 'Someone has applied to teach on MyNclex.',
      )}
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      ${fact('Name', p.applicantName)}
      ${fact('Email', p.applicantEmail)}
      ${fact('Organisation', p.organisation ?? '—')}
      ${fact('Submission', `Request #${p.submissionCount}`)}
    </table>

    <div style="margin:0 0 20px;padding:12px 14px;border-left:3px solid ${BRAND.muted};
                background:#f8fafc;font-family:Helvetica,Arial,sans-serif;
                font-size:14.5px;line-height:1.6;color:${BRAND.ink};">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;
                  color:${BRAND.muted};margin:0 0 4px;">What they wrote</div>
      ${esc(p.requestNote)}
    </div>

    ${button(p.queueUrl, 'Open the applications queue')}`;
}

export const tutorApplicationSubmittedAdminTemplate: EmailTemplate<TutorApplicationSubmittedAdminPayload> =
  {
    key: 'tutor.application_submitted_admin',
    name: 'Tutor application — admin notification',
    subject,
    body,
    previews: [
      {
        label: 'First application, with an organisation',
        payload: {
          applicantName: 'Ama Boateng',
          applicantEmail: 'ama.boateng@example.com',
          organisation: 'Korle Bu Teaching Hospital',
          submissionCount: 1,
          requestNote:
            'I have been an RN for 8 years and have coached 40+ colleagues through the NCLEX-RN. I would like to run a 12-week cohort focused on pharmacology and prioritisation.',
          queueUrl: 'https://nclex.quademia.com/admin/applications',
        },
      },
      {
        // The subject and opening line both change, so this variant is
        // worth having in the preview list rather than assumed.
        label: 'Resubmission — Request #2',
        payload: {
          applicantName: 'Kwabena Ofori',
          applicantEmail: 'kwabena.ofori@example.com',
          organisation: 'Ridge Hospital, Accra',
          submissionCount: 2,
          requestNote: 'Resubmitting with the week-by-week outline you asked for.',
          queueUrl: 'https://nclex.quademia.com/admin/applications',
        },
      },
      {
        // Freelance tutors are ordinary, so the dash has to look
        // deliberate rather than like missing data.
        label: 'No organisation',
        payload: {
          applicantName: 'Efua Asante',
          applicantEmail: 'efua.asante@example.com',
          organisation: null,
          submissionCount: 1,
          requestNote: 'I tutor privately in Kumasi and would like to move online.',
          queueUrl: 'https://nclex.quademia.com/admin/applications',
        },
      },
    ],
  };

/** The line the footer prints on this email. */
export const TUTOR_APPLICATION_SUBMITTED_ADMIN_FOOTER_CONTEXT =
  'You are receiving this because you administer tutor applications on MyNclex.';
