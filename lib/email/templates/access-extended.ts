// mynclex/lib/email/templates/access-extended.ts
//
// "You have more time on <programme>."
//
// ⭐ WHY IT EXISTS — and it is the same catch Sam made once before. On
// tutor-onboarding 1d he noticed that suspension told someone their
// standing had been withdrawn and NOTHING told them when it came back, so
// `tutor.reinstated` was built for no reason other than that
// `tutor.suspended` existed. Warning a student that her access is ending
// and then saying nothing when a tutor gives it back is that shape
// exactly. (2026-08-24.)
//
// ⚠ THE ONLY ONE OF THE THREE THAT IS EVENT-DRIVEN. Its two siblings are
// filled in SQL by the nightly sweep; this one is enqueued by app code in
// lib/enrolments/actions.ts the moment a tutor presses Extend. So its
// payload IS type-checked at the boundary, unlike theirs.
//
// ⭐ ONE KEY, TWO TONES via `wasExpired`. "Extended" and "restored" are
// different sentences — one continues something live, the other reopens a
// door that had shut — but the facts and the intent are identical and a
// tutor did the same thing in both cases. §10's test for splitting a key
// ("shared facts, nothing else in common") fails, so it stays one key with
// a dial. Same call as `paused` on the overdue email.
//
// ⚠ IT NAMES THE TUTOR AS THE PERSON WHO DID IT, because they did — this
// is the one email in the access set where the tutor is genuinely the
// actor rather than merely the programme's owner. ⓘ Note the contrast
// with the inactivity nudge, which is careful NOT to imply the tutor sent
// it: there, we acted; here, they did.
//
// ⓘ NO SWITCH GOVERNS THIS ONE (Sam). A switch exists to stop what the
// system does on its own. This fires two seconds after a human pressed a
// button, and silencing it would leave that human believing their student
// had been told.
//
// ⚠ Every non-literal value must go through esc().

import type { AccessExtendedPayload, EmailTemplate } from '../types';
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

function subject(p: AccessExtendedPayload): string {
  return p.wasExpired
    ? `Your access to ${p.programmeTitle} is back`
    : `More time on ${p.programmeTitle}`;
}

function body(p: AccessExtendedPayload): string {
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';
  const title = esc(p.programmeTitle);
  const tutor = esc(p.tutorName);
  const until = esc(formatDate(p.newExpiresAtISO));

  // ⚠ The restored branch must not congratulate her on something she did
  // not do, and must acknowledge the gap — she has been locked out and
  // knows it. The extended branch is lighter: nothing was ever interrupted.
  const lede = p.wasExpired
    ? `${tutor} has reopened your access to <strong>${title}</strong>. It had ended, and it is now live again until <strong>${until}</strong>.`
    : `${tutor} has given you more time on <strong>${title}</strong>. Your access now runs until <strong>${until}</strong>.`;

  const href = `${appOrigin()}/student/programme/${encodeURIComponent(
    p.programmeId,
  )}/curriculum`;

  return `
    <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${greeting}</p>

    <p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${lede}</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="width:100%;margin:24px 0;border-collapse:collapse;">
      ${factRow('Programme', title)}
      ${p.cohortName ? factRow('Cohort', esc(p.cohortName)) : ''}
      ${factRow('Access now runs to', until)}
      ${factRow('Time added', `${esc(p.days)} days`)}
    </table>

    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${
        p.wasExpired
          ? esc(
              'Everything you had completed was kept while it was closed, so you can carry on from exactly where you stopped.',
            )
          : esc('Nothing else changes — carry on where you left off.')
      }
    </p>

    ${button(href, p.wasExpired ? 'Pick up where you left off' : 'Open the programme')}`;
}

export const accessExtendedTemplate: EmailTemplate<AccessExtendedPayload> = {
  key: 'enrolment.access_extended',
  name: 'Access extended',
  subject,
  body,
  previews: [
    {
      label: 'Extended — a live window pushed out',
      payload: {
        recipientName: 'Ama',
        programmeTitle: 'NCLEX Prioritization Crash Course',
        cohortName: null,
        tutorName: 'Steven Harris',
        newExpiresAtISO: '2026-12-04T16:48:52.000Z',
        previousExpiresAtISO: '2026-09-04T16:48:52.000Z',
        wasExpired: false,
        days: 91,
        programmeId: '60000000-0000-4000-8000-000000000001',
        enrolmentId: '71000000-0000-4000-8000-000000000911',
      },
    },
    {
      // ⚠ The variant that must acknowledge the gap rather than pretend
      // nothing happened — she has been locked out and knows it.
      label: 'Restored — a closed door reopened',
      payload: {
        recipientName: 'Kwame',
        programmeTitle: 'NCLEX 4-Week Tutor-Led Bootcamp',
        cohortName: 'March intake',
        tutorName: 'Steven Harris',
        newExpiresAtISO: '2026-11-24T16:48:52.000Z',
        previousExpiresAtISO: '2026-08-23T10:48:52.000Z',
        wasExpired: true,
        days: 90,
        programmeId: '60000000-0000-4000-8000-000000000002',
        enrolmentId: 'ba7d6a10-24b9-4616-b030-60eabb4efe44',
      },
    },
    {
      // A first extension has no earlier entry to quote, and no profile name.
      label: 'No profile name, first ever extension',
      payload: {
        recipientName: null,
        programmeTitle: 'Retake Recovery Programme',
        cohortName: null,
        tutorName: 'Steven Harris',
        newExpiresAtISO: '2027-02-01T16:48:52.000Z',
        previousExpiresAtISO: null,
        wasExpired: false,
        days: 30,
        programmeId: '60000000-0000-4000-8000-000000000004',
        enrolmentId: '71000000-0000-4000-8000-000000000106',
      },
    },
  ],
};

/** The line the footer prints on this email. */
export const ACCESS_EXTENDED_FOOTER_CONTEXT =
  'You are receiving this because your tutor changed the access window on a programme you are enrolled on.';
