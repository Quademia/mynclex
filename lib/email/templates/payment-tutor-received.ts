// mynclex/lib/email/templates/payment-tutor-received.ts
//
// The tutor's half: a student's money landed against your programme.
//
// ⭐ NOT A RECEIPT. payment-received.ts proves a debit to the person who
// paid; this tells a different person that it happened. So the money
// block leads with WHO rather than with line items, there is no
// "keep this — it is your receipt", and the plan position matters more
// than the purchase did, because a tutor reads many of these across many
// students and needs to place each one.
//
// ⚠⚠ IT SAYS "RECORDED", NOT "PAID OUT", AND THAT IS LOAD-BEARING.
// Payment splits between QAcademy and tutors are an explicit v1 deferral
// (CLAUDE.md → Explicit Deferrals), so nothing in this product moves
// money to a tutor's own account. Any sentence implying otherwise would
// be a promise the software cannot keep — and money is the worst subject
// to be loose about. Every line here reports a RECORD.
//
// ⚠ Every non-literal value must go through esc(). These are plain
// strings; nothing escapes them for us.

import { formatMinor } from '@/lib/products/money';
import type { EmailTemplate, TutorPaymentReceivedPayload } from '../types';
import { BRAND, button, esc, factRow } from './wrapper';

// ─────────────────────────────────────────────────────────────────────
// The three framings
// ─────────────────────────────────────────────────────────────────────
// ⭐ Reused from the student's receipt rather than reinvented — the
// caller already knows which one it just produced. Each says something
// the tutor has a distinct reason to want:
//
//   ACTIVATED        nothing to do; she is on the roster.
//   PENDING_APPROVAL she is waiting on YOU. The only actionable one.
//   SETUP_REQUIRED   paid, but no account — so she is NOT on the roster,
//                    and a tutor who does not know that will go looking.
//
// ⚠ ONE EMAIL PER CHECKOUT, so whichever fires first is the only one the
// tutor ever sees. A pay-first purchase sends SETUP_REQUIRED and the
// later ACTIVATED enqueue is refused by the fingerprint — which is why
// that note has to stand on its own rather than promise a follow-up.

const FRAMING: Record<
  TutorPaymentReceivedPayload['framing'],
  { subjectTail: string | null; lede: string; note: string | null }
> = {
  ACTIVATED: {
    subjectTail: null,
    lede: 'A payment has been recorded against your programme.',
    note: null,
  },
  PENDING_APPROVAL: {
    subjectTail: 'your approval needed',
    lede: 'A payment has been recorded against your programme, and her place needs you.',
    note:
      'She has paid, but she is not enrolled until you approve her place. ' +
      'You will find her waiting on the programme’s Enrolments tab.',
  },
  SETUP_REQUIRED: {
    subjectTail: 'account not set up yet',
    lede: 'A payment has been recorded against your programme.',
    // ⚠ The one note that exists to prevent a wrong conclusion rather
    // than to prompt an action: without it, a tutor who checks the
    // roster and finds nobody reasonably decides the payment is missing.
    note:
      'She paid before creating an account, so she will not appear on your roster ' +
      'until she finishes setting it up. Nothing is needed from you — the place is ' +
      'held, and it appears as soon as she is done.',
  },
};

const METHOD_LABEL: Record<TutorPaymentReceivedPayload['method'], string> = {
  CARD: 'Paid online',
  // ⓘ A tutor recording their own money never reaches this email — see
  // the suppression rule in lib/payments/tutor-notice.ts — so a named
  // recorder here is always somebody else.
  ADMIN_RECORDED: 'Recorded by a QAcademy admin',
  // ⚠ Says only what is evidenced. The rows this covers carry no
  // recorder at all, so naming one would be invention.
  OFF_PLATFORM: 'Collected off-platform',
};

// ─────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  // Fixed locale, explicit UTC. The server's zone is not the reader's,
  // and a money email that shows different dates to different readers is
  // one nobody can quote back at us.
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function subject(p: TutorPaymentReceivedPayload): string {
  const f = FRAMING[p.framing];
  // Who and how much, first. A tutor scanning an inbox of these needs
  // the two facts that tell them apart before the programme name.
  //
  // ⚠ "for", NOT an em-dash, and this is not a style preference. Real
  // programme titles contain em-dashes — dev holds "NCLEX-RN Live — The
  // 8-Week Pass Plan" and "Maternity & Newborn — Revision Notes" — so
  // the obvious `paid GHS 1,250 — <title>` renders TWO em-dashes in one
  // subject and reads as a mistake. The receipt hit the same trap from
  // the other direction (see the subjectTail note in
  // payment-received.ts); here the title supplies the second dash, so
  // no amount of care on our side avoids it. A preposition cannot
  // collide with anything a tutor types.
  const base = `${p.studentName} paid ${formatMinor(p.amountMinor, p.currency)} for ${p.programmeTitle}`;
  return f.subjectTail ? `${base} (${f.subjectTail})` : base;
}

/**
 * Where the plan stands, in one sentence.
 *
 * ⓘ Returns '' when there is no plan to report — a pay-first buyer has
 * no enrolment yet, so there is genuinely nothing true to say, and an
 * empty section is better than an invented one.
 */
function standingLine(p: TutorPaymentReceivedPayload): string {
  if (!p.standing) return '';
  const s = p.standing;

  const words =
    s.remainingMinor <= 0
      ? 'Paid in full — nothing further is due.'
      : `${formatMinor(s.remainingMinor, p.currency)} still to come` +
        (s.nextDueISO ? `, next due ${formatDate(s.nextDueISO)}.` : '.');

  return `
    <h2 style="margin:24px 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:16px;
               color:${BRAND.ink};font-weight:700;">Where the plan stands</h2>
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">
      ${esc(`${s.paidCount} of ${s.totalPayments} payments received. ${words}`)}
    </p>`;
}

function body(p: TutorPaymentReceivedPayload): string {
  const f = FRAMING[p.framing];
  const greeting = p.tutorName ? `Hi ${esc(p.tutorName)},` : 'Hi,';

  return `
    <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${greeting}</p>
    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${esc(f.lede)}</p>

    <!-- the money block: the amount, then who it came from -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border:1px solid ${BRAND.line};border-radius:6px;padding:16px;background:#fbfcfd;">
      <tr>
        <td>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;
                      color:${BRAND.ink};line-height:1.2;">
            ${esc(formatMinor(p.amountMinor, p.currency))}
          </div>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;
                      color:${BRAND.muted};padding-top:4px;">
            from ${esc(p.studentName)}
          </div>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="margin-top:14px;border-top:1px solid ${BRAND.line};padding-top:8px;">
            ${factRow('Student', p.studentEmail)}
            ${factRow('Programme', p.programmeTitle)}
            ${p.cohortName ? factRow('Cohort', p.cohortName) : ''}
            ${p.planPosition ? factRow('Position', p.planPosition) : ''}
            ${factRow('Date', formatDate(p.paidAtISO))}
            ${factRow('How', METHOD_LABEL[p.method])}
          </table>
        </td>
      </tr>
    </table>

    ${standingLine(p)}

    ${
      f.note
        ? `<p style="margin:20px 0 0;padding:12px 14px;background:${BRAND.bg};
                     border-left:3px solid ${BRAND.accent};border-radius:4px;
                     font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;
                     color:${BRAND.ink};">${esc(f.note)}</p>`
        : ''
    }

    ${button(p.ctaHref, p.ctaLabel)}`;
}

// ─────────────────────────────────────────────────────────────────────
// Previews
// ─────────────────────────────────────────────────────────────────────
// ⚠ Most of these branches will not occur on dev for weeks at a time —
// an admin-recorded payment and a pay-first programme purchase are both
// rare. Without fixtures the first person to see a broken variant is a
// tutor. Rendered by /admin/emails/preview.

const PAID_AT = '2026-08-19T14:05:00.000Z';

export const paymentTutorReceivedTemplate: EmailTemplate<TutorPaymentReceivedPayload> = {
  key: 'payment.tutor_received',
  name: 'Student payment (tutor)',
  subject,
  body,
  previews: [
    {
      // ⚠ Deliberately carries an em-dash in the title, because real
      // ones do ("NCLEX-RN Live — The 8-Week Pass Plan" is on dev). It
      // is the fixture that keeps the subject line honest — see the note
      // on subject().
      label: 'Instalment · mid-plan · cohort',
      payload: {
        framing: 'ACTIVATED',
        tutorName: 'Grace',
        studentName: 'Ama Mensah',
        studentEmail: 'ama.mensah@gmail.com',
        programmeTitle: 'NCLEX-RN Live — The 8-Week Pass Plan',
        cohortName: 'Weekends — Saturdays 10:00 GMT',
        currency: 'GHS',
        amountMinor: 20000,
        paidAtISO: PAID_AT,
        method: 'CARD',
        planPosition: 'Payment 2 of 4',
        standing: {
          remainingMinor: 40000,
          nextDueISO: '2026-10-05T00:00:00.000Z',
          paidCount: 2,
          totalPayments: 4,
        },
        ctaHref: 'https://nclex.quademia.com/tutor/payments',
        ctaLabel: 'View payments',
      },
    },
    {
      label: 'Final instalment · paid in full',
      payload: {
        framing: 'ACTIVATED',
        tutorName: 'Grace',
        studentName: 'Ama Mensah',
        studentEmail: 'ama.mensah@gmail.com',
        programmeTitle: 'NCLEX Intensive',
        cohortName: 'Cohort 3',
        currency: 'GHS',
        amountMinor: 20000,
        paidAtISO: PAID_AT,
        method: 'CARD',
        planPosition: 'Payment 4 of 4',
        standing: {
          remainingMinor: 0,
          nextDueISO: null,
          paidCount: 4,
          totalPayments: 4,
        },
        ctaHref: 'https://nclex.quademia.com/tutor/payments',
        ctaLabel: 'View payments',
      },
    },
    {
      // Self-paced: no cohort exists, so the row is absent rather than
      // printed empty.
      label: 'Upfront · self-paced (no cohort)',
      payload: {
        framing: 'ACTIVATED',
        tutorName: 'Grace',
        studentName: 'Kofi Boateng',
        studentEmail: 'kofi.boateng@gmail.com',
        programmeTitle: 'NCLEX Self-Study Track',
        cohortName: null,
        currency: 'GHS',
        amountMinor: 60000,
        paidAtISO: PAID_AT,
        method: 'CARD',
        planPosition: 'Paid in full',
        standing: {
          remainingMinor: 0,
          nextDueISO: null,
          paidCount: 1,
          totalPayments: 1,
        },
        ctaHref: 'https://nclex.quademia.com/tutor/payments',
        ctaLabel: 'View payments',
      },
    },
    {
      label: 'Awaiting the tutor’s approval',
      payload: {
        framing: 'PENDING_APPROVAL',
        tutorName: 'Grace',
        studentName: 'Ama Mensah',
        studentEmail: 'ama.mensah@gmail.com',
        programmeTitle: 'NCLEX Intensive',
        cohortName: 'Cohort 3',
        currency: 'GHS',
        amountMinor: 60000,
        paidAtISO: PAID_AT,
        method: 'CARD',
        planPosition: 'Payment 1 of 4',
        standing: {
          remainingMinor: 60000,
          nextDueISO: '2026-09-05T00:00:00.000Z',
          paidCount: 1,
          totalPayments: 4,
        },
        ctaHref: 'https://nclex.quademia.com/tutor/payments',
        ctaLabel: 'View payments',
      },
    },
    {
      // ⭐ The branch that can say least: no name (no profile yet) and no
      // standing (no enrolment yet). The address is all we have, and the
      // note is the whole point of the email.
      label: 'Pay-first · no account yet',
      payload: {
        framing: 'SETUP_REQUIRED',
        tutorName: 'Grace',
        studentName: 'a.owusu@gmail.com',
        studentEmail: 'a.owusu@gmail.com',
        programmeTitle: 'NCLEX Intensive',
        cohortName: 'Cohort 3',
        currency: 'GHS',
        amountMinor: 60000,
        paidAtISO: PAID_AT,
        method: 'CARD',
        planPosition: 'Payment 1',
        standing: null,
        ctaHref: 'https://nclex.quademia.com/tutor/payments',
        ctaLabel: 'View payments',
      },
    },
    {
      label: 'Recorded by an admin (not the tutor)',
      payload: {
        framing: 'ACTIVATED',
        tutorName: 'Grace',
        studentName: 'Ama Mensah',
        studentEmail: 'ama.mensah@gmail.com',
        programmeTitle: 'NCLEX Intensive',
        cohortName: 'Cohort 3',
        currency: 'GHS',
        amountMinor: 20000,
        paidAtISO: PAID_AT,
        method: 'ADMIN_RECORDED',
        planPosition: 'Payment 3 of 4',
        standing: {
          remainingMinor: 20000,
          nextDueISO: '2026-11-05T00:00:00.000Z',
          paidCount: 3,
          totalPayments: 4,
        },
        ctaHref: 'https://nclex.quademia.com/tutor/payments',
        ctaLabel: 'View payments',
      },
    },
    {
      // ⚠ A real state, not a hypothetical: six settled dev rows are
      // OFF_PLATFORM with no recorder stamped. This variant exists so
      // the wording for them is something a person has actually read.
      label: 'Off-platform, recorder unknown',
      payload: {
        framing: 'ACTIVATED',
        tutorName: 'Grace',
        studentName: 'Ama Mensah',
        studentEmail: 'ama.mensah@gmail.com',
        programmeTitle: 'NCLEX Intensive',
        cohortName: 'Cohort 3',
        currency: 'GHS',
        amountMinor: 100000,
        paidAtISO: PAID_AT,
        method: 'OFF_PLATFORM',
        planPosition: 'Payment 2 of 4',
        standing: {
          remainingMinor: 200000,
          nextDueISO: '2026-10-05T00:00:00.000Z',
          paidCount: 2,
          totalPayments: 4,
        },
        ctaHref: 'https://nclex.quademia.com/tutor/payments',
        ctaLabel: 'View payments',
      },
    },
    {
      label: 'USD (dollar voice)',
      payload: {
        framing: 'ACTIVATED',
        tutorName: 'Grace',
        studentName: 'Jeannie Alvarez',
        studentEmail: 'jeannie.alvarez@gmail.com',
        programmeTitle: 'NCLEX Intensive',
        cohortName: 'Cohort 3',
        currency: 'USD',
        amountMinor: 12000,
        paidAtISO: PAID_AT,
        method: 'CARD',
        planPosition: 'Payment 2 of 4',
        standing: {
          remainingMinor: 24000,
          nextDueISO: '2026-10-05T00:00:00.000Z',
          paidCount: 2,
          totalPayments: 4,
        },
        ctaHref: 'https://nclex.quademia.com/tutor/payments',
        ctaLabel: 'View payments',
      },
    },
  ],
};

/**
 * The line the footer prints on this email.
 *
 * ⚠ Names the programme relationship, not "a payment was made with this
 * address" — the tutor did not pay, and the receipt's wording would read
 * as a charge against them.
 */
export const PAYMENT_TUTOR_RECEIVED_FOOTER_CONTEXT =
  'You are receiving this because a student paid for a programme you run on MyNclex.';
