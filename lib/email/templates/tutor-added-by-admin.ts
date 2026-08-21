// mynclex/lib/email/templates/tutor-added-by-admin.ts
//
// "You're now a tutor on MyNclex."
//
// ⭐ THE FIRST THING A NEW TUTOR EVER READS FROM US. Every other email in
// this folder reaches someone mid-relationship — they bought something,
// they enrolled, their class is tomorrow. This one arrives to a person
// who was, until a moment ago, a student or a stranger, and it is the
// entire onboarding: there is no welcome screen behind it, no tour, and
// nobody walks them in.
//
// So it does exactly three things, in order:
//   1. says what happened — plainly, and without naming the admin who
//      did it (Sam, 2026-08-21). Who ticked the box is OUR provenance,
//      visible in the directory and in nclex_tutors.approved_by; to the
//      recipient it is a staff member's personal name they have no
//      reason to need. Harmless while Sam is the only admin, and an
//      outward disclosure made by accident the moment TUTORS_MANAGE is
//      delegated. Compare enrolment-rejected, which DOES disclose a
//      tutor's address — argued through and accepted, because a student
//      who paid them needs to reach them. There is no such need here.
//   2. names the ONE thing worth doing first — writing the public
//      profile, because a tutor with no headline shows up to students as
//      a blank, and the admin directory literally lists that gap as a
//      column ("Profile not filled in yet");
//   3. gets out of the way with one button.
//
// ⚠ IT PROMISES NOTHING ABOUT PLANS OR LIMITS. Tutor plans and quotas
// are deliberately unmodelled (plan doc §12) and admission is not plan
// assignment — so a line like "you're on the free tier" would describe
// machinery that does not exist. The handoff's confirm receipt carried
// that claim and it was cut for the same reason.
//
// ⚠ Every non-literal value must go through esc().

import type { EmailTemplate, TutorAddedByAdminPayload } from '../types';
import { BRAND, button, esc } from './wrapper';

function subject(): string {
  // No interpolation at all, so the "no separator of our own" trap
  // (sprung twice in one session on programme titles) cannot fire here.
  // A name would make it warmer and would also make it collidable; the
  // greeting carries the name instead, where nothing can break it.
  return 'You are now a tutor on MyNclex';
}

function body(p: TutorAddedByAdminPayload): string {
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';

  // ⓘ No fact table. Once the actor came out (see the header note) its
  // only unconditional row went with him, and a bordered box holding one
  // optional line renders EMPTY for an invited tutor. The one fact worth
  // keeping is a sentence instead.
  const keepsLine = p.keepsStudentRole
    ? ' Your student account is unchanged — you can switch between the two whenever you like.'
    : '';

  return `
    <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${greeting}</p>

    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(
        `You are now a tutor on MyNclex. Your tutor workspace is open — you can build a programme, write questions and enrol students whenever you are ready.${keepsLine}`,
      )}
    </p>

    <p style="margin:0 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      <strong>Start with your profile.</strong>
      ${esc(
        'Your headline, speciality and short bio are what students see on your programme pages — until you write them, your programmes appear without an author.',
      )}
    </p>

    ${button(p.profileUrl, 'Write your public profile')}

    <p style="margin:18px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13.5px;
              line-height:1.6;color:${BRAND.muted};">
      ${esc('Or go straight to your workspace: ')}<a href="${esc(p.workspaceUrl)}"
        style="color:${BRAND.accent};">${esc(p.workspaceUrl)}</a>
    </p>`;
}

export const tutorAddedByAdminTemplate: EmailTemplate<TutorAddedByAdminPayload> = {
  key: 'tutor.added_by_admin',
  name: 'Made a tutor',
  subject,
  body,
  previews: [
    {
      label: 'Promoted — was already a student',
      payload: {
        recipientName: 'Ama',
        keepsStudentRole: true,
        workspaceUrl: 'https://nclex.quademia.com/tutor',
        profileUrl: 'https://nclex.quademia.com/tutor/profile',
      },
    },
    {
      // Invited by email (slice 3): the account was created FOR them, so
      // there is no student history to reassure them about.
      label: 'No student account',
      payload: {
        recipientName: 'Kwame',
        keepsStudentRole: false,
        workspaceUrl: 'https://nclex.quademia.com/tutor',
        profileUrl: 'https://nclex.quademia.com/tutor/profile',
      },
    },
    {
      // A pay-first or seeded account may have no profile name yet, so
      // the greeting has to stand without one.
      label: 'No name on file',
      payload: {
        recipientName: null,
        keepsStudentRole: true,
        workspaceUrl: 'https://nclex.quademia.com/tutor',
        profileUrl: 'https://nclex.quademia.com/tutor/profile',
      },
    },
  ],
};

/** The line the footer prints on this email. */
export const TUTOR_ADDED_BY_ADMIN_FOOTER_CONTEXT =
  'You are receiving this because a MyNclex administrator made you a tutor.';
