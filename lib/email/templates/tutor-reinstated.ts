// mynclex/lib/email/templates/tutor-reinstated.ts
//
// "Your tutor account is active again."
//
// ⭐ NOT IN THE PLAN OR THE DESIGN — Sam spotted the gap (2026-08-21).
// tutor.suspended told someone their standing was withdrawn, and nothing
// told them when it came back: a reinstated tutor would have found out by
// discovering the workspace worked again. An account that emails you when
// it takes something away and goes silent when it returns it reads as
// punitive, and leaves the person unsure whether the decision was
// reversed or they merely got lucky.
//
// It is the counterpart of tutor-suspended and deliberately mirrors it:
//
//   • SAME rule on the actor — NO admin is named. Who reversed it is our
//     provenance, on nclex_tutors.decided_by and in the trail.
//
//   • OPPOSITE rule on the button. tutor-suspended has none, because
//     every link would point at a door we had just locked. Here the door
//     is open and the workspace link IS the message — the one thing the
//     recipient wants is to get back in.
//
//   • NO REASON FIELD, and that is not an oversight. Reinstatement takes
//     no reason: the RPC requires one only for SUSPENDED and REJECTED,
//     because undoing a restriction needs no justification the way
//     imposing one does. Inventing a line like "following our review"
//     would describe a process we do not model.
//
// ⚠ It does not apologise and does not explain. We may have reinstated
// someone because we were wrong, or because they fixed something, or
// because a suspension was always meant to be temporary — the record
// does not distinguish those, so the email must not imply one. Anything
// warmer belongs in a human message from whoever made the decision.
//
// ⚠ Every non-literal value must go through esc().

import type { EmailTemplate, TutorReinstatedPayload } from '../types';
import { BRAND, button, esc } from './wrapper';

function subject(): string {
  return 'Your tutor account on MyNclex is active again';
}

function body(p: TutorReinstatedPayload): string {
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';

  // ⓘ Only told to someone who HAS programmes — the third outing for the
  // rule keepsStudentRole set in tutor-added-by-admin: never describe
  // what a person has regained when they never had it. A tutor who was
  // suspended before publishing anything would read "your programmes are
  // listed again" and go looking for programmes that do not exist.
  const programmesLine = p.hasProgrammes
    ? ' Your programmes are listed publicly again, and students can join them.'
    : '';

  return `
    <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${greeting}</p>

    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(
        `The suspension on your MyNclex tutor account has been lifted. Your tutor workspace is open again.${programmesLine}`,
      )}
    </p>

    ${button(p.workspaceUrl, 'Open your tutor workspace')}`;
}

export const tutorReinstatedTemplate: EmailTemplate<TutorReinstatedPayload> = {
  key: 'tutor.reinstated',
  name: 'Tutor reinstated',
  subject,
  body,
  previews: [
    {
      label: 'Has programmes — the common case',
      payload: {
        recipientName: 'Steven',
        hasProgrammes: true,
        workspaceUrl: 'https://nclex.quademia.com/tutor',
      },
    },
    {
      // Suspended before publishing anything: the programmes sentence
      // must not render, or it promises a catalogue they never had.
      label: 'No programmes',
      payload: {
        recipientName: 'Ama',
        hasProgrammes: false,
        workspaceUrl: 'https://nclex.quademia.com/tutor',
      },
    },
    {
      // An account with no profile name — the greeting has to stand
      // without one.
      label: 'No name on file',
      payload: {
        recipientName: null,
        hasProgrammes: true,
        workspaceUrl: 'https://nclex.quademia.com/tutor',
      },
    },
  ],
};

/** The line the footer prints on this email. */
export const TUTOR_REINSTATED_FOOTER_CONTEXT =
  'You are receiving this because the suspension on your MyNclex tutor account has been lifted.';
