// mynclex/lib/email/templates/tutor-application-approved.ts
//
// "You're in." The answer to an application somebody sent us —
// tutor-onboarding slice 2b.
//
// ⭐ WHY THIS IS NOT AN ALIAS OF tutor.added_by_admin. Both end at the
// same row in the same state, and the registry supports aliasing (see
// waitlist.converted). But an alias would be wrong here for the reason
// the plan doc gives for enrolment.approved / enrolment.rejected: the
// facts are shared and nothing else is. tutor.added_by_admin greets
// someone an admin CHOSE, who was not expecting us; this greets someone
// who ASKED and has been waiting for a verdict. "You have been made a
// tutor" and "your application has been approved" are not the same
// sentence, and the second is the only one that closes a loop the
// recipient opened.
//
// ⚠ NO ADMIN NAMED — the same rule as the welcome and suspension
// notices. Who approved them lives on nclex_tutors.approved_by and in the
// trail; a staff name in an outward email is a disclosure that would be
// made by accident the first time TUTORS_MANAGE is delegated.
//
// ⚠ NOTHING ABOUT PLANS, TIERS OR LIMITS. Approval puts everyone on the
// free tier and admission is NOT plan assignment (tutor-onboarding.md
// §12) — so there is no field here that could render a promise the
// software cannot keep.
//
// ⚠ Every non-literal value must go through esc().

import type { EmailTemplate, TutorApplicationApprovedPayload } from '../types';
import { BRAND, button, esc } from './wrapper';

function subject(): string {
  // No interpolation, matching every other tutor-standing subject: a name
  // makes a subject collidable and buys nothing at a glance.
  return 'Your tutor application on MyNclex has been approved';
}

function body(p: TutorApplicationApprovedPayload): string {
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';

  // ⓘ Fourth outing for the keepsStudentRole rule: say what someone keeps
  // ONLY when they had it. A role-less registrant never held STUDENT, and
  // being told they keep it would send them looking for what they lost.
  const studentLine = p.keepsStudentRole
    ? `
    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(
        'Your student account is untouched — you keep every programme you are enrolled in, and you can switch between the two from the menu.',
      )}
    </p>`
    : '';

  return `
    <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${greeting}</p>

    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(
        'We have reviewed your application and approved it. Your tutor workspace on MyNclex is open, and you can start building a programme whenever you are ready.',
      )}
    </p>

    ${studentLine}

    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc('One thing worth doing first: ')}<a href="${esc(p.profileUrl)}"
        style="color:${BRAND.accent};">${esc('fill in your public profile')}</a>${esc(
          '. It is what students see beside your programmes, and a programme with no face behind it is a harder sell.',
        )}
    </p>

    ${button(p.workspaceUrl, 'Open your tutor workspace')}`;
}

export const tutorApplicationApprovedTemplate: EmailTemplate<TutorApplicationApprovedPayload> = {
  key: 'tutor.application_approved',
  name: 'Tutor application approved',
  subject,
  body,
  previews: [
    {
      label: 'Existing student — keeps their student access',
      payload: {
        recipientName: 'Ama',
        keepsStudentRole: true,
        workspaceUrl: 'https://nclex.quademia.com/tutor',
        profileUrl: 'https://nclex.quademia.com/tutor/profile',
      },
    },
    {
      // Came in through the application form with no account: TUTOR is
      // their first and only role, so the student paragraph must not
      // render.
      label: 'Role-less applicant — TUTOR is their first role',
      payload: {
        recipientName: 'Kwabena',
        keepsStudentRole: false,
        workspaceUrl: 'https://nclex.quademia.com/tutor',
        profileUrl: 'https://nclex.quademia.com/tutor/profile',
      },
    },
    {
      label: 'No name on file',
      payload: {
        recipientName: null,
        keepsStudentRole: false,
        workspaceUrl: 'https://nclex.quademia.com/tutor',
        profileUrl: 'https://nclex.quademia.com/tutor/profile',
      },
    },
  ],
};

/** The line the footer prints on this email. */
export const TUTOR_APPLICATION_APPROVED_FOOTER_CONTEXT =
  'You are receiving this because you applied to teach on MyNclex and your application has been approved.';
