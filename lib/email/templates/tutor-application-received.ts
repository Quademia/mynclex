// mynclex/lib/email/templates/tutor-application-received.ts
//
// "We have it." The receipt for a tutor application — slice 2a-i.
//
// ⭐ WHY AN ACKNOWLEDGEMENT AT ALL, when the applicant can see their
// status on screen the moment they submit. Because the screen is the
// only place that fact lives otherwise, and a person who applies and
// hears nothing for four days cannot tell "under review" from "the form
// was broken". The email is the thing they still have on Thursday.
//
// ⚠ IT PROMISES NOTHING IT CANNOT KEEP. No "we aim to respond within X
// days" — there is no SLA in the product, nobody is measured against
// one, and inventing a number here is a commitment the software has no
// way to honour. It says what happens next, not when.
//
// ⭐ THE RESUBMISSION WORDING IS NOT DECORATION. Thanking somebody for
// applying when they are resubmitting a rejected application reads as
// though we lost the first one — and this person has already been turned
// down once, so the one thing the email must get right is that we know
// who they are and what this is.
//
// ⚠ Every non-literal value must go through esc().

import type { EmailTemplate, TutorApplicationReceivedPayload } from '../types';
import { BRAND, button, esc } from './wrapper';

function subject(): string {
  return 'We have your tutor application for MyNclex';
}

function body(p: TutorApplicationReceivedPayload): string {
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';

  const opening = p.isResubmission
    ? 'Thank you for updating your tutor application. We have your new submission and it is back with us for review.'
    : 'Thank you for applying to teach on MyNclex. Your application is with us and waiting to be reviewed.';

  return `
    <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${greeting}</p>

    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(opening)}
    </p>

    <div style="margin:0 0 20px;padding:12px 14px;border-left:3px solid ${BRAND.muted};
                background:#f8fafc;font-family:Helvetica,Arial,sans-serif;
                font-size:14.5px;line-height:1.6;color:${BRAND.ink};">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;
                  color:${BRAND.muted};margin:0 0 4px;">Your reference</div>
      ${esc(`Request #${p.submissionCount}`)}
    </div>

    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(
        'We will email you once a decision has been made — whichever way it goes. You can check where it stands at any time by signing in.',
      )}
    </p>

    ${button(p.applicationUrl, 'Check your application')}`;
}

export const tutorApplicationReceivedTemplate: EmailTemplate<TutorApplicationReceivedPayload> = {
  key: 'tutor.application_received',
  name: 'Tutor application received',
  subject,
  body,
  previews: [
    {
      label: 'First application',
      payload: {
        recipientName: 'Ama',
        submissionCount: 1,
        isResubmission: false,
        applicationUrl: 'https://nclex.quademia.com/for-tutors/apply',
      },
    },
    {
      // The wording has to acknowledge the earlier attempt, not thank
      // them for a first one they did not just make.
      label: 'Resubmission — Request #2',
      payload: {
        recipientName: 'Kwabena',
        submissionCount: 2,
        isResubmission: true,
        applicationUrl: 'https://nclex.quademia.com/for-tutors/apply',
      },
    },
    {
      label: 'No name on file',
      payload: {
        recipientName: null,
        submissionCount: 1,
        isResubmission: false,
        applicationUrl: 'https://nclex.quademia.com/for-tutors/apply',
      },
    },
  ],
};

/** The line the footer prints on this email. */
export const TUTOR_APPLICATION_RECEIVED_FOOTER_CONTEXT =
  'You are receiving this because you applied to teach on MyNclex.';
