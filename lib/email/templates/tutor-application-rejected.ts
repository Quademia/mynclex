// mynclex/lib/email/templates/tutor-application-rejected.ts
//
// The second email we send that nobody wants — tutor-onboarding slice 2b.
//
// ⭐ IT MUST NOT READ AS A DEAD END, because it is not one. §6 makes
// REJECTED explicitly non-terminal and §9 lets the person update and
// resubmit; the CHECK constraint was written to allow REJECTED → PENDING
// for exactly this. An email that closes the door would contradict the
// schema — and would leave someone believing a decision was final when
// the product is built to reverse it.
//
// ⚠ THE REASON IS ALWAYS SHOWN, and that is a deliberate cost.
// nclex_tutor_record_decision refuses a rejection without one, and §9
// keeps decision_reason precisely so a re-applicant knows what to fix.
// The admin writes it knowing the subject will read it — settled in 1d-i
// as visibility option (i).
//
// ⚠ NO ADMIN NAMED, and here most of all. A refusal with a personal name
// on it invites the applicant to take it up with that individual rather
// than with us.
//
// ⚠ NO CONVERSION OFFER HERE. §8 gives a rejected applicant a "use
// MyNclex as a student instead" button — on their application PAGE, where
// one click grants the role. An email cannot grant anything, so offering
// it here would either be a dead link or a second doorway to keep in
// step. The page owns that; this points at the page.
//
// ⚠ Every non-literal value must go through esc(). The reason is
// admin-typed free text, so this matters more here than anywhere else.

import type { EmailTemplate, TutorApplicationRejectedPayload } from '../types';
import { BRAND, SUPPORT_EMAIL, button, esc } from './wrapper';

function subject(): string {
  // ⓘ Deliberately not "rejected". The subject is read on a lock screen
  // by someone who has been waiting, and the word does the whole
  // decision's work before they can open anything. "An update on" is
  // accurate, not evasive — the first line of the body says it plainly.
  return 'An update on your tutor application for MyNclex';
}

function body(p: TutorApplicationRejectedPayload): string {
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';

  return `
    <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${greeting}</p>

    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(
        'Thank you for applying to teach on MyNclex. We have reviewed your application and are not able to take you on as a tutor at this time.',
      )}
    </p>

    <div style="margin:0 0 20px;padding:12px 14px;border-left:3px solid ${BRAND.muted};
                background:#f8fafc;font-family:Helvetica,Arial,sans-serif;
                font-size:14.5px;line-height:1.6;color:${BRAND.ink};">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;
                  color:${BRAND.muted};margin:0 0 4px;">Reason given</div>
      ${esc(p.reason)}
    </div>

    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      <strong>This is not final.</strong>
      ${esc(
        'You can update your application and send it back to us — the form comes back pre-filled, so you only need to change what matters.',
      )}
    </p>

    ${button(p.applicationUrl, 'Update and resubmit')}

    <p style="margin:20px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc('If anything here is unclear, reply to this email and it will reach us at ')}<a
        href="mailto:${esc(SUPPORT_EMAIL)}" style="color:${BRAND.accent};">${esc(SUPPORT_EMAIL)}</a>.
    </p>`;
}

export const tutorApplicationRejectedTemplate: EmailTemplate<TutorApplicationRejectedPayload> = {
  key: 'tutor.application_rejected',
  name: 'Tutor application rejected',
  subject,
  body,
  previews: [
    {
      label: 'A fixable reason — the common case',
      payload: {
        recipientName: 'Kwabena',
        reason:
          'We need to see an active RN licence number and at least two years of NCLEX teaching before we can list a programme under your name.',
        applicationUrl: 'https://nclex.quademia.com/for-tutors/apply',
      },
    },
    {
      // A long, multi-sentence reason: the block has to hold its shape
      // and stay readable rather than becoming a wall.
      label: 'A long reason',
      payload: {
        recipientName: 'Ama',
        reason:
          'Your application did not include any detail about how you would structure a programme, and the organisation you named could not be verified. We would look again at an application that sets out a week-by-week outline and gives us a way to confirm your current post.',
        applicationUrl: 'https://nclex.quademia.com/for-tutors/apply',
      },
    },
    {
      label: 'No name on file',
      payload: {
        recipientName: null,
        reason: 'We are not taking on new tutors in this speciality at the moment.',
        applicationUrl: 'https://nclex.quademia.com/for-tutors/apply',
      },
    },
  ],
};

/** The line the footer prints on this email. */
export const TUTOR_APPLICATION_REJECTED_FOOTER_CONTEXT =
  'You are receiving this because you applied to teach on MyNclex.';
