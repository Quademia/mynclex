// mynclex/lib/email/templates/inactivity-nudge.ts
//
// "You haven't been back in a while."
//
// ⭐ WHY IT EXISTS. A self-paced programme only works as a business
// because it does not consume the tutor's hours. The tutor's Progress page
// (progress-engine.md §6.4) shows who has gone quiet — but a list of
// people to chase, with nothing chasing them, just moves the labour onto
// the tutor and turns a low-touch product into a high-touch one at a
// low-touch price. This is what tries first, so the tutor is only ever
// looking at the students it failed to revive.
//
// ⚠ FILLED IN SQL by the nightly sweep (migration 20260922120000), like
// the two installment payloads and the session reminder. TypeScript checks
// nothing about what actually arrives — this type is the contract, not the
// enforcement.
//
// ⭐ ONE KEY, TWO TONES via `reason`. Someone who never began needs "here
// is how to start"; someone who stopped at unit three needs "carry on".
// Different words, but identical facts and identical intent — so §10's
// test for splitting a key ("shared facts, nothing else in common")
// fails, and it stays one key with a dial. Same shape as `entry` on
// tutor.added_by_admin and the enrolment-added dial before it.
//
// ⚠ IT NAMES THE TUTOR, NOT US. The student bought a named person's
// programme, and the thing that should pull them back is that somebody
// is expecting them — not that a platform noticed. But it is careful not
// to claim the tutor *sent* it: "Steven's programme is still waiting",
// never "Steven asked me to write". Putting words in a tutor's mouth is
// the one thing this email must not do.
//
// ⚠ NO GUILT, AND NO STREAK-BREAKING. The audience is working nurses on
// rotating shifts — the exact people for whom "you've fallen behind"
// is both untrue (there is no shared schedule to be behind) and the
// reason they chose self-paced in the first place.
//
// ⚠ Every non-literal value must go through esc().

import type { EmailTemplate, InactivityNudgePayload } from '../types';
import { APP_ORIGIN, BRAND, button, esc } from './wrapper';

function subject(p: InactivityNudgePayload): string {
  return p.reason === 'NOT_STARTED'
    ? `Ready when you are — ${p.programmeTitle}`
    : `Pick up where you left off — ${p.programmeTitle}`;
}

/** Rounded to the unit a person would actually say out loud. */
function silentPhrase(days: number): string {
  if (days < 21) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

function body(p: InactivityNudgePayload): string {
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';
  const notStarted = p.reason === 'NOT_STARTED';

  // ⚠ The two openings differ in what they can truthfully claim. For a
  // student who never began there is no "where you left off" to return
  // to, and pretending otherwise is the sort of small lie that tells a
  // reader an email is automated.
  const opening = notStarted
    ? `You signed up for ${esc(p.programmeTitle)} ${esc(
        silentPhrase(p.silentDays),
      )} ago and haven't started yet. That is completely fine — but the first step is the one that never gets easier to put off, so here is the door.`
    : `You haven't been back to ${esc(p.programmeTitle)} in about ${esc(
        silentPhrase(p.silentDays),
      )}. Everything you have done is saved exactly where you left it.`;

  // ⓘ The tutor is named as the person whose programme it is — not as the
  // sender. See the header note.
  const tutorLine = notStarted
    ? `${esc(p.tutorName)} built it to be worked through at your own pace, so there is no schedule to catch up on and nothing to rejoin.`
    : `There is no catching up to do — ${esc(
        p.tutorName,
      )} designed it to be picked up whenever you have an hour.`;

  // ⚠ The second nudge says LESS, not more. If the first one did not land,
  // repeating it louder is how an unread email becomes an unsubscribed
  // one. It only adds the one thing that might actually have changed the
  // reader's mind: that we will stop.
  const closing =
    p.nudgeNumber >= 2
      ? `<p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:14px;
                   line-height:1.6;color:${BRAND.muted};">
           ${esc(
             'This is the last reminder we will send about this — your access is unaffected either way, and it will be there whenever you are ready.',
           )}
         </p>`
      : '';

  const href = `${APP_ORIGIN}/student/programme/${encodeURIComponent(
    p.programmeId,
  )}/curriculum`;

  return `
    <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${greeting}</p>

    <p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${opening}</p>

    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${tutorLine}</p>

    ${button(href, notStarted ? 'Start the programme' : 'Carry on where you left off')}

    ${closing}`;
}

export const inactivityNudgeTemplate: EmailTemplate<InactivityNudgePayload> = {
  key: 'progress.inactivity_nudge',
  name: 'Inactivity nudge',
  subject,
  body,
  previews: [
    {
      label: 'Stalled — first nudge (the common case)',
      payload: {
        recipientName: 'Ama',
        programmeTitle: 'NCLEX Prioritization Crash Course',
        tutorName: 'Steven Harris',
        programmeId: '60000000-0000-4000-8000-000000000001',
        reason: 'STALLED',
        silentDays: 16,
        nudgeNumber: 1,
      },
    },
    {
      // ⚠ The variant most likely to read wrong: there is no "where you
      // left off", so every phrase implying a return has to be absent.
      label: 'Never started — first nudge',
      payload: {
        recipientName: 'Kwame',
        programmeTitle: 'NCLEX Self-Paced Refresher',
        tutorName: 'Steven Harris',
        programmeId: 'c1f0f031-da2f-4f1a-9ce9-e1243228b4e6',
        reason: 'NOT_STARTED',
        silentDays: 54,
        nudgeNumber: 1,
      },
    },
    {
      // The last one we send — check the sign-off reads as a courtesy
      // rather than a threat.
      label: 'Stalled — second and final nudge',
      payload: {
        recipientName: 'Ama',
        programmeTitle: 'NCLEX Prioritization Crash Course',
        tutorName: 'Steven Harris',
        programmeId: '60000000-0000-4000-8000-000000000001',
        reason: 'STALLED',
        silentDays: 47,
        nudgeNumber: 2,
      },
    },
    {
      // Months of silence: check the rounding says "2 months", not "68 days".
      label: 'Never started — months later, final nudge',
      payload: {
        recipientName: null,
        programmeTitle: 'Pharmacology Made Simple — Self-Paced',
        tutorName: 'Steven Harris',
        programmeId: 'aaaa0001-0000-4000-8000-000000000001',
        reason: 'NOT_STARTED',
        silentDays: 68,
        nudgeNumber: 2,
      },
    },
  ],
};

/** The line the footer prints on this email. */
export const INACTIVITY_NUDGE_FOOTER_CONTEXT =
  'You are receiving this because you are enrolled on this programme and have not worked on it for a while.';
