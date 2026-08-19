// mynclex/lib/email/templates/enrolment-added.ts
//
// "Your tutor has enrolled you." Two event keys share this one file —
// enrolment.tutor_added and waitlist.converted.
//
// ⭐ ONE TEMPLATE, TWO DIALS (settled with Sam, 2026-08-12). It looks
// like four emails and is not:
//
//                      | has an account      | brand new
//   -------------------|---------------------|--------------------------
//   tutor added her    | "you've been added" | + set up your account
//   she was waiting    | "a place opened up" | + set up your account
//
//   Dial 1 (`reason`) is wording. Dial 2 (`entry`) is the way in, and is
//   the only part that carries risk — under SET_UP the link in this
//   email is the ONLY way into the account.
//
// ⭐ WHY THIS EMAIL EXISTS AT ALL. Before it, a tutor adding a student
// with an existing account sent NOTHING — she learned by logging in and
// noticing a new programme in her sidebar. And a brand-new student got
// Supabase's default invite, which says "you have an account" and
// structurally cannot say what for: Supabase sees an address and a link,
// nothing else. See lib/enrolments/actions.ts.
//
// ⚠ Every non-literal value must go through esc(). These are plain
// strings; nothing escapes them for us.

import { formatMinor } from '@/lib/products/money';
import type { EmailTemplate, EnrolmentAddedPayload } from '../types';
import { BRAND, button, esc, factRow } from './wrapper';

// ─────────────────────────────────────────────────────────────────────
// Dial 1 — why she is getting this
// ─────────────────────────────────────────────────────────────────────
// The system cannot tell these apart; the student can. A waitlist
// convert answers a question she asked, possibly weeks ago, so opening
// with "you have been added" would ignore the waiting she actually did.

const REASON: Record<
  EnrolmentAddedPayload['reason'],
  { heading: string; lede: (tutor: string, what: string) => string }
> = {
  TUTOR_ADDED: {
    heading: 'You have been enrolled',
    lede: (tutor, what) => `${tutor} has enrolled you in ${what}.`,
  },
  WAITLIST_CONVERTED: {
    heading: 'A place has opened up',
    lede: (tutor, what) =>
      `Good news — a place has opened up in ${what}, and ${tutor} has enrolled you.`,
  },
};

// ─────────────────────────────────────────────────────────────────────
// Dial 2 — how she gets in
// ─────────────────────────────────────────────────────────────────────
// ⚠ The SET_UP note must not promise a second email. Since the invite
// swap (2026-08-12) there IS no second email: we mint the link and send
// it here, precisely so she does not get Supabase's bare "you have an
// account" alongside this one. If this message fails, nothing else
// arrives — which is why the tutor is told when it does.

const ENTRY: Record<EnrolmentAddedPayload['entry'], { note: string | null }> = {
  LOG_IN: { note: null },
  SET_UP: {
    // ⭐ Points at the CODE, and only because it was watched working
    // (2026-08-12) against exactly this account state: invited by a
    // tutor, never confirmed, no password. generateLink creates the
    // account the instant the tutor clicks, and /login's "Email me a
    // sign-in code" only requires the account to exist — so an expired
    // invite is an inconvenience, not a lock-out, and nobody needs to
    // wait on support.
    //
    // ⚠ Names the button as it is actually labelled on /login. Copy that
    // sends someone hunting for a control that isn't there is worse than
    // copy that says nothing.
    //
    // ⓘ No URL in the sentence: the footer already links MyNclex, and a
    // bare one here cannot be made clickable without restructuring how
    // this note renders.
    note:
      'The button above is your way in, and it works once. If it has already ' +
      'expired, go to the sign-in page and choose "Email me a sign-in code" — ' +
      'your account already exists, so a code will let you straight in.',
  },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Cohort 3 · NCLEX Intensive", or just the programme when self-paced. */
function whatSheJoined(p: EnrolmentAddedPayload): string {
  return p.cohortName ? `${p.programmeName} (${p.cohortName})` : p.programmeName;
}

// ⚠⚠ THIS GUARD WAS AIMED AT THE WRONG DASH, and shipped that way on
// 2026-08-12. It read "ONE em-dash, and the programme name last" —
// counting only the dashes WE write, while the programme name supplies
// its own: against a real title the subject rendered
// "You have been enrolled — NCLEX-RN Live — The 8-Week Pass Plan".
// Found 2026-08-19 by auditing every subject after the same trap was
// sprung twice more in one session.
//
// ⭐ The rule, now stated so it cannot be misread: a subject that
// interpolates a name somebody typed must READ AS ONE SENTENCE AROUND
// IT — no dash, colon or pipe of ours bolting a clause on. The title is
// arbitrary text with arbitrary punctuation, so the only safe count of
// our own separators is zero.
// ⓘ Both headings take "in" and become a real sentence, which is what
// makes zero separators achievable rather than merely desirable:
// "You have been enrolled in X" · "A place has opened up in X".
function subject(p: EnrolmentAddedPayload): string {
  return `${REASON[p.reason].heading} in ${p.programmeName}`;
}

function body(p: EnrolmentAddedPayload): string {
  const r = REASON[p.reason];
  const e = ENTRY[p.entry];
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';
  const what = whatSheJoined(p);

  return `
    <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${greeting}</p>
    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${esc(r.lede(p.tutorName, what))}</p>

    <!-- what she has -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border:1px solid ${BRAND.line};border-radius:6px;padding:16px;background:#fbfcfd;">
      <tr>
        <td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${factRow('Programme', p.programmeName)}
            ${p.cohortName ? factRow('Cohort', p.cohortName) : ''}
            ${factRow('Your tutor', p.tutorName)}
            ${
              p.accessExpiresAtISO
                ? factRow('Access until', formatDate(p.accessExpiresAtISO))
                : ''
            }
          </table>
        </td>
      </tr>
    </table>

    ${planBlock(p)}

    ${p.actionUrl && p.actionLabel ? button(p.actionUrl, p.actionLabel) : ''}

    ${
      e.note
        ? `<p style="margin:20px 0 0;padding:12px 14px;background:${BRAND.bg};
                     border-left:3px solid ${BRAND.accent};border-radius:4px;
                     font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;
                     color:${BRAND.ink};">${esc(e.note)}</p>`
        : ''
    }`;
}

/**
 * The money disclosure.
 *
 * ⭐ Deliberately states the amount and the date and then stops. Chasing
 * is payment.installment_due's job; this exists so that the first thing
 * she hears about owing anything is not the nightly sweep pausing her
 * access.
 */
function planBlock(p: EnrolmentAddedPayload): string {
  if (!p.plan) return '';
  const { currency, nextAmountMinor, nextDueISO, totalPayments, paidCount } = p.plan;
  const position = paidCount + 1;

  return `
    <h2 style="margin:24px 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:16px;
               color:${BRAND.ink};font-weight:700;">Your payment plan</h2>
    <p style="margin:0 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(
        totalPayments > 1
          ? `${p.tutorName} has set you up on a payment plan of ${totalPayments} payments.`
          : `${p.tutorName} has set up your payment.`,
      )}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border:1px solid ${BRAND.line};border-radius:6px;padding:16px;background:#fbfcfd;">
      <tr>
        <td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${factRow(
              totalPayments > 1 ? `Next payment (${position} of ${totalPayments})` : 'Amount due',
              formatMinor(nextAmountMinor, currency),
            )}
            ${factRow('Due', formatDate(nextDueISO))}
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:12px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;
              line-height:1.6;color:${BRAND.muted};">
      If you have already arranged this with your tutor directly, you can ignore it —
      they record payments they collect themselves.
    </p>`;
}

/** Answers "why am I getting this?" at the bottom of every send. */
export const ENROLMENT_ADDED_FOOTER_CONTEXT =
  'You are receiving this because a tutor enrolled you in a programme on MyNclex.';

// ─────────────────────────────────────────────────────────────────────
// Previews
// ─────────────────────────────────────────────────────────────────────
// Both dials, both ways, plus the plan block — the combinations that
// actually differ. ⚠ SET_UP cannot be produced on demand in dev: it
// needs an address with no account, and every alias on hand has one.
// These fixtures are the only routine way to look at that half.

const BASE = {
  tutorName: 'Dr Kwame Mensah',
  programmeName: 'NCLEX-RN Intensive',
  accessExpiresAtISO: '2027-02-11T00:00:00.000Z',
  actionUrl: 'https://nclex.quademia.com/login',
  actionLabel: 'Log in',
} as const;

export const enrolmentAddedTemplate: EmailTemplate<EnrolmentAddedPayload> = {
  key: 'enrolment.tutor_added',
  name: 'Enrolled by a tutor',
  subject,
  body,
  previews: [
    {
      label: 'Tutor added · existing account · cohort',
      payload: {
        ...BASE,
        reason: 'TUTOR_ADDED',
        entry: 'LOG_IN',
        recipientName: 'Ama',
        cohortName: 'Q3 Upcoming Cohort',
        plan: null,
      },
    },
    {
      label: 'Tutor added · new account · cohort',
      payload: {
        ...BASE,
        reason: 'TUTOR_ADDED',
        entry: 'SET_UP',
        recipientName: 'Ama',
        cohortName: 'Q3 Upcoming Cohort',
        plan: null,
        actionUrl: 'https://nclex.quademia.com/welcome#access_token=sample',
        actionLabel: 'Set up your account',
      },
    },
    {
      label: 'Tutor added · self-paced (no cohort) · lifetime access',
      payload: {
        ...BASE,
        reason: 'TUTOR_ADDED',
        entry: 'LOG_IN',
        recipientName: 'Ama',
        cohortName: null,
        accessExpiresAtISO: null,
        plan: null,
      },
    },
    {
      label: 'Tutor added · new account · with a payment plan',
      payload: {
        ...BASE,
        reason: 'TUTOR_ADDED',
        entry: 'SET_UP',
        recipientName: 'Ama',
        cohortName: 'Q3 Upcoming Cohort',
        actionUrl: 'https://nclex.quademia.com/welcome#access_token=sample',
        actionLabel: 'Set up your account',
        plan: {
          currency: 'GHS',
          nextAmountMinor: 200000,
          nextDueISO: '2026-09-03T00:00:00.000Z',
          totalPayments: 4,
          paidCount: 0,
        },
      },
    },
    {
      label: 'Waitlist converted · existing account',
      payload: {
        ...BASE,
        reason: 'WAITLIST_CONVERTED',
        entry: 'LOG_IN',
        recipientName: 'Ama',
        cohortName: 'Q3 Upcoming Cohort',
        plan: null,
      },
    },
    {
      label: 'Waitlist converted · new account · plan already part-paid',
      payload: {
        ...BASE,
        reason: 'WAITLIST_CONVERTED',
        entry: 'SET_UP',
        recipientName: null,
        cohortName: 'Q3 Upcoming Cohort',
        actionUrl: 'https://nclex.quademia.com/welcome#access_token=sample',
        actionLabel: 'Set up your account',
        plan: {
          currency: 'GHS',
          nextAmountMinor: 150000,
          nextDueISO: '2026-09-10T00:00:00.000Z',
          totalPayments: 3,
          paidCount: 1,
        },
      },
    },
  ],
};
