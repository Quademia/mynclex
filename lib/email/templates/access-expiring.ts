// mynclex/lib/email/templates/access-expiring.ts
//
// "Your access to <programme> ends on <date>."
//
// ⭐⭐ WHY THIS ONE MATTERS MORE THAN IT LOOKS. A tutor may teach for four
// weeks and grant six months of access — the programme's length and its
// access window are deliberately independent (Sam, 2026-08-24). So by the
// time the window closes, the live sessions finished months ago and the
// tutor has moved on to the next cohort. The arrears reminder next door
// has a human in the loop who might notice; this has nobody. If this email
// does not tell her, NOTHING does — she finds the door locked one morning,
// long after anyone was paying attention.
//
// ⚠ FILLED IN SQL by the nightly sweep (migration 20260923120000), like
// the two installment payloads. TypeScript checks nothing about what
// actually arrives — the type is the contract, not the enforcement.
//
// ⭐ ONE KEY, TWO LEADS via `lead` (T-14 / T-3). Identical facts, and the
// only difference is how much runway is left — §10's test for splitting a
// key ("shared facts, nothing else in common") fails, so it stays one key
// with a dial, like the installment reminder it mirrors.
//
// ⚠⚠ IT MUST NEVER SAY "YOUR ACCESS TO QUADEMIA". What ends is ONE
// programme. Access is stored and checked per enrolment, so this student
// keeps her account, her question-bank subscription and every other
// programme she is on. The broader sentence would be false for anyone
// holding a bank subscription — and it is the sentence a writer reaches
// for by default, which is why this is shouted here.
//
// ⭐ IT PROMISES NO RENEW BUTTON, BECAUSE THERE IS NONE. `access_expires_at`
// is written at enrolment and never updated except by a tutor pressing
// Extend. So the call to action is the truth: ask your tutor, or enrol
// again. ⓘ That second option is real rather than a consolation — progress
// rows key on (student_id, activity_id), so everything she has done
// survives and is waiting if she comes back.
//
// ⚠ Every non-literal value must go through esc().

import type { AccessExpiringPayload, EmailTemplate } from '../types';
import { appOrigin, BRAND, button, esc, factRow } from './wrapper';

// ⭐ "4 September", not "04/09/2026" — the audience spans GH, UK and CA,
// where 04/09 reads as two different days. Same reasoning, same helper
// shape, as payment-installment-due.
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

function subject(p: AccessExpiringPayload): string {
  // ⓘ The programme is named in the subject on purpose: an inbox shows
  // about forty characters, and "your access is ending" without saying to
  // WHAT is exactly the ambiguity this template exists to avoid.
  return p.lead === 'T-3'
    ? `3 days left — ${p.programmeTitle}`
    : `Your access to ${p.programmeTitle} ends on ${formatDate(p.expiresAtISO)}`;
}

function body(p: AccessExpiringPayload): string {
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';
  const title = esc(p.programmeTitle);
  const when = esc(formatDate(p.expiresAtISO));

  const lede =
    p.lead === 'T-3'
      ? `Your access to <strong>${title}</strong> ends on <strong>${when}</strong> — that is in three days.`
      : `A heads-up: your access to <strong>${title}</strong> ends on <strong>${when}</strong>, about two weeks from now.`;

  // ⚠ For a student already paused over arrears, "you will lose access" is
  // not news — she lost it weeks ago. What is new is that it becomes
  // permanent, and that paying now still rescues it. Saying the generic
  // sentence to her reads as an email that does not know who it is
  // writing to.
  const situation = p.wasPaused
    ? `<p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
                 line-height:1.6;color:${BRAND.ink};">
         Your access is currently on hold over an unpaid instalment. Settling it
         before ${when} restores everything; after that date the enrolment closes
         for good.
       </p>`
    : `<p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
                 line-height:1.6;color:${BRAND.ink};">
         After that, the lessons, notes and quizzes on this programme stop opening.
         Nothing else about your account changes — anything else you are enrolled
         on, and the question bank if you have it, carry on exactly as they are.
       </p>`;

  // ⭐ Only names the tutor when the tutor can actually answer. A suspended
  // tutor's students still expire (the window is what they bought), so they
  // still get warned — but pointing them at somebody who cannot reply would
  // be worse than not naming anyone.
  const whatToDo = p.tutorActive
    ? `If you would like more time, ${esc(
        p.tutorName,
      )} can extend your access — just ask. You can also enrol again at any point.`
    : `If you would like more time, get in touch with us and we will sort it out. You can also enrol again at any point.`;

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
      ${factRow('Access ends', when)}
    </table>

    ${situation}

    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${whatToDo}</p>

    ${button(href, 'Open the programme')}

    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:14px;
              line-height:1.6;color:${BRAND.muted};">
      ${esc(
        'If you do come back later, everything you have completed is still saved against your account — you would pick up where you left off, not start again.',
      )}
    </p>`;
}

export const accessExpiringTemplate: EmailTemplate<AccessExpiringPayload> = {
  key: 'enrolment.access_expiring',
  name: 'Access expiring',
  subject,
  body,
  previews: [
    {
      label: 'T-14 — the common case',
      payload: {
        recipientName: 'Ama',
        programmeTitle: 'NCLEX Prioritization Crash Course',
        cohortName: null,
        tutorName: 'Steven Harris',
        tutorActive: true,
        expiresAtISO: '2026-09-07T16:48:52.000Z',
        lead: 'T-14',
        wasPaused: false,
        programmeId: '60000000-0000-4000-8000-000000000001',
        enrolmentId: '71000000-0000-4000-8000-000000000911',
      },
    },
    {
      label: 'T-3 — the last call, on a cohort programme',
      payload: {
        recipientName: 'Kwame',
        programmeTitle: 'NCLEX 4-Week Tutor-Led Bootcamp',
        cohortName: 'March intake',
        tutorName: 'Steven Harris',
        tutorActive: true,
        expiresAtISO: '2026-08-27T16:48:52.000Z',
        lead: 'T-3',
        wasPaused: false,
        programmeId: '60000000-0000-4000-8000-000000000002',
        enrolmentId: 'b0fe4e20-3886-4c90-abcf-8a9e2797afa2',
      },
    },
    {
      // ⚠ The variant most likely to read wrong: she has NOT had access
      // for weeks, so any sentence implying she is about to lose something
      // she currently enjoys is false to her.
      label: 'Already paused for arrears — T-3',
      payload: {
        recipientName: 'Akosua',
        programmeTitle: 'NCLEX-RN Live — The 8-Week Pass Plan',
        cohortName: 'Cohort 2',
        tutorName: 'Steven Harris',
        tutorActive: true,
        expiresAtISO: '2026-08-27T16:48:52.000Z',
        lead: 'T-3',
        wasPaused: true,
        programmeId: '60000000-0000-4000-8000-000000000003',
        enrolmentId: 'ba7d6a10-24b9-4616-b030-60eabb4efe44',
      },
    },
    {
      // The tutor cannot answer — check that nobody is pointed at them.
      label: 'Suspended tutor — nobody to ask, so it points at us',
      payload: {
        recipientName: null,
        programmeTitle: 'Retake Recovery Programme',
        cohortName: null,
        tutorName: 'Steven Harris',
        tutorActive: false,
        expiresAtISO: '2026-09-07T16:48:52.000Z',
        lead: 'T-14',
        wasPaused: false,
        programmeId: '60000000-0000-4000-8000-000000000004',
        enrolmentId: '71000000-0000-4000-8000-000000000106',
      },
    },
  ],
};

/** The line the footer prints on this email. */
export const ACCESS_EXPIRING_FOOTER_CONTEXT =
  'You are receiving this because your access window on this programme is close to ending.';
