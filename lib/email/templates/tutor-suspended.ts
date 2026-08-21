// mynclex/lib/email/templates/tutor-suspended.ts
//
// "Your tutor account has been suspended."
//
// ⭐ THE FIRST EMAIL WE SEND THAT THE RECIPIENT WILL NOT WANT. Everything
// else in this folder is good news or neutral admin — a payment landed, a
// class is tomorrow, you have been made a tutor. This one tells someone
// their standing with us has been taken away, and the tone rule that
// follows is: say exactly what happened, say what it does and does not
// affect, and do not soften it into vagueness. A person who cannot tell
// from the email whether they still have students will assume the worst.
//
// Four decisions, each with a reason:
//
//   1. ⭐ IT CARRIES THE REASON. Telling someone they are suspended
//      without saying why is both unkind and useless — their only
//      possible next action is to write and ask. We already settled that
//      reasons are written as if the subject will read them (the suspend
//      form says so on the label: "kept on the record — shown if they
//      ever re-apply"), so this sends what was already theirs to see.
//
//   2. ⚠ IT NAMES NO ADMIN. Same rule as tutor-added-by-admin, and
//      stronger here: putting a staff member's personal name on a conduct
//      decision invites them to be contacted about it personally. The
//      decision is the organisation's, and support is the route back.
//
//   3. ⭐ IT SAYS WHAT DID NOT CHANGE. §7's whole point is that
//      suspension separates materials from live delivery — the students
//      they already have keep their curriculum, library and quizzes. That
//      is the first thing a suspended tutor will be asked by their own
//      students, and if we do not tell them they will answer wrongly.
//      Rendered ONLY when they actually have students, per the rule the
//      welcome email set: do not tell someone what they keep when they
//      had none, or they will wonder what they lost.
//
//   4. NO BUTTON. There is nothing for them to do — the workspace is
//      closed and there is no appeals surface. A call-to-action here
//      would be a link to a door we just locked.
//
// ⚠ Every non-literal value must go through esc(). The reason is
// admin-typed free text, so this matters more here than anywhere else in
// the folder.

import type { EmailTemplate, TutorSuspendedPayload } from '../types';
import { BRAND, SUPPORT_EMAIL, esc } from './wrapper';

function subject(): string {
  // No interpolation, deliberately — same reasoning as the welcome
  // email. A name would make it collidable, and this is not a subject
  // line anyone should have to parse twice.
  return 'Your tutor account on MyNclex has been suspended';
}

function body(p: TutorSuspendedPayload): string {
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';

  const studentsLine = p.hasActiveStudents
    ? `
    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      <strong>Your current students keep their access.</strong>
      ${esc(
        'Everyone already enrolled with you can still open their curriculum, library and quizzes. Their materials are not affected by this.',
      )}
    </p>`
    : '';

  return `
    <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${greeting}</p>

    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(
        'Your tutor account on MyNclex has been suspended. Your tutor workspace is closed, your programmes are no longer listed publicly, and no new students can join them.',
      )}
    </p>

    <div style="margin:0 0 20px;padding:12px 14px;border-left:3px solid ${BRAND.muted};
                background:#f8fafc;font-family:Helvetica,Arial,sans-serif;
                font-size:14.5px;line-height:1.6;color:${BRAND.ink};">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;
                  color:${BRAND.muted};margin:0 0 4px;">Reason given</div>
      ${esc(p.reason)}
    </div>

    ${studentsLine}

    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc('If you think this is a mistake, or you would like to discuss it, reply to this email and it will reach us at ')}<a
        href="mailto:${esc(SUPPORT_EMAIL)}" style="color:${BRAND.accent};">${esc(SUPPORT_EMAIL)}</a>.
    </p>`;
}

export const tutorSuspendedTemplate: EmailTemplate<TutorSuspendedPayload> = {
  key: 'tutor.suspended',
  name: 'Tutor suspended',
  subject,
  body,
  previews: [
    {
      label: 'Has students — the common case',
      payload: {
        recipientName: 'Steven',
        reason: 'Repeated missed live sessions with no notice to the cohort.',
        hasActiveStudents: true,
      },
    },
    {
      // A tutor suspended before anyone enrolled: the reassurance
      // paragraph must not render, or it invents students they never had.
      label: 'No students yet',
      payload: {
        recipientName: 'Ama',
        reason: 'Credentials could not be verified with the awarding body.',
        hasActiveStudents: false,
      },
    },
    {
      // The reason is admin-typed free text. This preview exists to keep
      // a long, multi-sentence one from breaking the layout.
      label: 'No name on file, long reason',
      payload: {
        recipientName: null,
        reason:
          'Several students reported that programme content was copied from a third-party question bank. We have paused new enrolments while we look into it, and will be in touch once we have spoken to you.',
        hasActiveStudents: true,
      },
    },
  ],
};

/** The line the footer prints on this email. */
export const TUTOR_SUSPENDED_FOOTER_CONTEXT =
  'You are receiving this because your tutor account on MyNclex has been suspended.';
