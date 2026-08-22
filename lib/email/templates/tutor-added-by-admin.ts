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
// ⭐ SINCE SLICE 3 IT HAS TWO DOORS, one dial apart (`entry`). A
// PROMOTED tutor already has a password and the three things below are
// the whole email. An INVITED one has an account with NO password, so
// the profile and workspace links point behind a door they cannot open:
// that branch shows exactly one control, the setup link, and /welcome is
// the screen behind it. ⚠ Absence of `entry` means LOG_IN — rows queued
// before slice 3 must keep rendering what they sent.
//
// On the promotion branch it does exactly three things, in order:
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

/** The profile paragraph — the same words on both branches, only the
 *  cue in front of it changes ("Start with" vs "Then start with"). */
function profileLine(lead: string): string {
  return `
    <p style="margin:0 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      <strong>${esc(lead)}</strong>
      ${esc(
        'Your headline, speciality and short bio are what students see on your programme pages — until you write them, your programmes appear without an author.',
      )}
    </p>`;
}

function body(p: TutorAddedByAdminPayload): string {
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';

  // ⚠ ABSENCE IS LOG_IN, and that is a compatibility rule, not a
  // preference: renderOutboxRow renders from the frozen payload alone,
  // so every row queued before slice 3 — the ones on prod included —
  // arrives here with no `entry` at all and must still render the email
  // it actually sent.
  const isSetUp = p.entry === 'SET_UP';

  // ⓘ No fact table. Once the actor came out (see the header note) its
  // only unconditional row went with him, and a bordered box holding one
  // optional line renders EMPTY for an invited tutor. The one fact worth
  // keeping is a sentence instead.
  const keepsLine = p.keepsStudentRole
    ? ' Your student account is unchanged — you can switch between the two whenever you like.'
    : '';

  const opening = isSetUp
    ? 'You are now a tutor on MyNclex. We have created an account for you — set a password below and your tutor workspace is open, ready for you to build a programme, write questions and enrol students.'
    : `You are now a tutor on MyNclex. Your tutor workspace is open — you can build a programme, write questions and enrol students whenever you are ready.${keepsLine}`;

  const head = `
    <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${greeting}</p>

    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(opening)}
    </p>`;

  // ─────────────────────────────────────────────────────────────────
  // LOG_IN — a promotion. They have a password, so the profile is the
  // one thing worth doing first and it earns the button.
  // ─────────────────────────────────────────────────────────────────
  if (!isSetUp) {
    return `${head}

    ${profileLine('Start with your profile.')}

    ${button(p.profileUrl, 'Write your public profile')}

    <p style="margin:18px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13.5px;
              line-height:1.6;color:${BRAND.muted};">
      ${esc('Or go straight to your workspace: ')}<a href="${esc(p.workspaceUrl)}"
        style="color:${BRAND.accent};">${esc(p.workspaceUrl)}</a>
    </p>`;
  }

  // ─────────────────────────────────────────────────────────────────
  // SET_UP — an invite. ⚠ The account has NO PASSWORD, so the profile
  // and workspace links point behind a door this person cannot open.
  // Exactly one control belongs in this email, and it is the link that
  // creates the password. The profile survives as a sentence, because
  // it is still the right first move — just not yet.
  // ─────────────────────────────────────────────────────────────────
  const setUpNote = `
    <p style="margin:18px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13.5px;
              line-height:1.6;color:${BRAND.muted};">
      ${esc(
        // ⭐ Lifted near-verbatim from enrolment-added's SET_UP note,
        // which was watched working against exactly this account state
        // (created by generateLink, never confirmed, no password). The
        // reasoning is role-agnostic: /login's "Email me a sign-in code"
        // only requires the account to EXIST, so an expired link is an
        // inconvenience rather than a lock-out and nobody waits on
        // support. ⚠ Names the button as /login actually labels it.
        'The button above is your way in, and it works once. If it has already expired, ' +
          'go to the sign-in page and choose "Email me a sign-in code" — your account ' +
          'already exists, so a code will let you straight in.',
      )}
    </p>`;

  // ⚠ DEGRADE, DO NOT TRUST. `payload` is Record<string, unknown> at the
  // enqueue boundary, so nothing type-checks "SET_UP carries a link".
  // A dead button is worse than no button: the sign-in-code route below
  // is a real way in, so a missing link costs a click, not the account.
  if (!p.setUpUrl) {
    return `${head}

    <p style="margin:0 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(
        'To get in, go to the sign-in page and choose "Email me a sign-in code" — your account already exists, so a code will let you straight in.',
      )}
    </p>

    ${profileLine('Then start with your profile.')}`;
  }

  return `${head}

    ${button(p.setUpUrl, 'Set your password')}

    ${setUpNote}

    ${profileLine('Then start with your profile.')}`;
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
      // Promoted, but never a student — an account that exists for some
      // other reason. No student history to reassure them about, and
      // still LOG_IN: they have a password.
      label: 'Promoted — no student account',
      payload: {
        recipientName: 'Kwame',
        keepsStudentRole: false,
        workspaceUrl: 'https://nclex.quademia.com/tutor',
        profileUrl: 'https://nclex.quademia.com/tutor/profile',
      },
    },
    {
      // ⭐ Slice 3, the invite. The account was created FOR them by the
      // admin, so the ONLY control is the setup link.
      label: 'Invited by email — sets a password',
      payload: {
        recipientName: 'Kwame',
        keepsStudentRole: false,
        entry: 'SET_UP',
        setUpUrl: 'https://nclex.quademia.com/welcome#access_token=EXAMPLE',
        workspaceUrl: 'https://nclex.quademia.com/tutor',
        profileUrl: 'https://nclex.quademia.com/tutor/profile',
      },
    },
    {
      // ⚠ The degraded invite — SET_UP with no link. Not decorative: the
      // enqueue boundary is untyped, so this state is reachable, and the
      // preview list is where anyone would notice it renders sensibly.
      label: 'Invited — link missing (degraded)',
      payload: {
        recipientName: 'Kwame',
        keepsStudentRole: false,
        entry: 'SET_UP',
        setUpUrl: null,
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
