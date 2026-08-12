// mynclex/lib/email/templates/payment-received.ts
//
// The receipt. The loudest silence in the product until now: someone
// pays and hears nothing.
//
// ⭐ ONE EMAIL PER CHARGE, NOT PER PAYMENT ROW. A student who buys a
// programme place and ticks bank access at the same checkout produces
// TWO rows in nclex_payments from ONE card debit (three such groups
// exist on dev). Keyed per row she would get two receipts for one
// charge — the "have I been charged twice?" alarm the fingerprint exists
// to prevent. So: one money block, and the purchases are LINE ITEMS.
//
// ⚠ NO PLACEHOLDER SUBSTITUTION, unlike gamma's `{{name}}` templates.
// Gamma needs it because its templates are strings inside a Worker. Ours
// are .ts files with a typed payload, so plain interpolation is strictly
// better: the doc asks each template to declare "the list of values it
// requires ... so rendering one without a value it needs is caught", and
// the TYPE IS that list, checked at build time rather than discovered in
// someone's inbox.
//
// ⚠ Every non-literal value must go through esc(). These are plain
// strings; nothing escapes them for us.

import { formatMinor } from '@/lib/products/money';
import type { EmailTemplate, PaymentReceiptPayload, ReceiptLineItem } from '../types';
import { BRAND, SUPPORT_EMAIL, button, esc, factRow } from './wrapper';

// ─────────────────────────────────────────────────────────────────────
// The three framings
// ─────────────────────────────────────────────────────────────────────
// ⭐ Why the receipt varies by more than its line items: the pay-first
// branch grants NOTHING at payment time. lib/payments/activate.ts marks
// the group SETUP_REQUIRED, sends one invite, and creates no enrolment,
// no subscription and no credits until she finishes /welcome — possibly
// days later. "Enrolled in Cohort 3" in that state is a false statement.
//
// So the money half is always the same (that is the receipt's job —
// proof of the debit) and the "what this gets you" half is state-aware.

const FRAMING: Record<
  PaymentReceiptPayload['framing'],
  {
    heading: string;
    /**
     * Trails the amount in the subject line, so the amount stays right
     * after "Payment received" where the eye looks for it.
     * ⚠ Not folded into `heading`: doing that gave
     * "Payment received — one step left — GHS 350", two em-dashes in one
     * subject, which reads as a mistake.
     */
    subjectTail: string | null;
    lede: string;
    grantsHeading: string;
    note: string | null;
  }
> = {
  ACTIVATED: {
    heading: 'Payment received',
    subjectTail: null,
    lede: 'Thank you — your payment went through and everything below is ready to use.',
    grantsHeading: 'What you now have',
    note: null,
  },
  PENDING_APPROVAL: {
    heading: 'Payment received',
    subjectTail: null,
    lede: 'Thank you — your payment went through. Your tutor is reviewing your enrolment now.',
    grantsHeading: 'What you have paid for',
    note:
      'You will get another email as soon as your tutor approves your place. ' +
      'Nothing further is needed from you.',
  },
  SETUP_REQUIRED: {
    heading: 'Payment received — one step left',
    subjectTail: 'one step left',
    lede:
      'Thank you — your payment went through. To reach what you have bought, ' +
      'you need to finish setting up your account.',
    grantsHeading: 'What you have paid for',
    // ⚠ Deliberately does not promise the setup email has arrived. If
    // inviteUserByEmail failed (activate.ts), this receipt is the ONLY
    // message that reaches her — she has paid, has no account, and no
    // invite is coming — so it must tell her what to do about that.
    note:
      'Look for a separate email inviting you to set up your account. ' +
      'If it has not arrived within a few minutes, check your spam folder — ' +
      `and if it is not there either, write to ${SUPPORT_EMAIL} and we will sort it out.`,
  },
};

// ─────────────────────────────────────────────────────────────────────
// The five line items
// ─────────────────────────────────────────────────────────────────────
// Each renders one purchased thing. The `grants` sentence is resolved at
// ENQUEUE time (frozen into the payload), not here — this file only
// decides how it looks. That is why a bank pass can legitimately arrive
// with grants === null under SETUP_REQUIRED: its end date is computed at
// activation, so there is genuinely no date to state yet.
//
// ⓘ Adding a sixth purpose later is one entry in PURPOSE_LABEL plus
// whatever sentence the enqueue side freezes — not a new email.

const PURPOSE_LABEL: Record<ReceiptLineItem['purpose'], string> = {
  BANK_PURCHASE: 'Question bank',
  READINESS_PURCHASE: 'Readiness packs',
  PROGRAMME_INITIAL: 'Programme',
  PROGRAMME_INSTALLMENT: 'Programme payment',
  BANK_OPTIN_AT_PROGRAMME: 'Question bank',
};

function lineItemRow(item: ReceiptLineItem, currency: PaymentReceiptPayload['currency']): string {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${BRAND.line};
                 font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};">
        <div style="font-weight:600;">${esc(item.label)}</div>
        <div style="font-size:12px;color:${BRAND.muted};padding-top:2px;">
          ${esc(PURPOSE_LABEL[item.purpose])}
        </div>
      </td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid ${BRAND.line};
                 font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};
                 font-weight:600;white-space:nowrap;">
        ${esc(formatMinor(item.amountMinor, currency))}
      </td>
    </tr>`;
}

function grantsList(items: ReceiptLineItem[]): string {
  const withGrants = items.filter((i) => i.grants);
  if (withGrants.length === 0) return '';
  return withGrants
    .map(
      (i) => `
        <li style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.7;color:${BRAND.ink};">
          ${esc(i.grants ?? '')}
        </li>`
    )
    .join('');
}

// ─────────────────────────────────────────────────────────────────────

function formatPaidAt(iso: string): string {
  // Fixed locale and an explicit UTC zone: the server's zone is not the
  // reader's, and a receipt that says a different date to different
  // readers is a receipt nobody can quote back at us.
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function subject(p: PaymentReceiptPayload): string {
  const f = FRAMING[p.framing];
  const base = `Payment received — ${formatMinor(p.totalMinor, p.currency)}`;
  return f.subjectTail ? `${base} (${f.subjectTail})` : base;
}

function body(p: PaymentReceiptPayload): string {
  const f = FRAMING[p.framing];
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';
  const grants = grantsList(p.lineItems);

  return `
    <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${greeting}</p>
    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${esc(f.lede)}</p>

    <!-- the money half — identical for every purpose -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border:1px solid ${BRAND.line};border-radius:6px;padding:16px;background:#fbfcfd;">
      <tr>
        <td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${p.lineItems.map((i) => lineItemRow(i, p.currency)).join('')}
            <tr>
              <td style="padding:12px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;
                         color:${BRAND.ink};font-weight:700;">Total paid</td>
              <td align="right" style="padding:12px 0 0;font-family:Helvetica,Arial,sans-serif;
                         font-size:15px;color:${BRAND.ink};font-weight:700;white-space:nowrap;">
                ${esc(formatMinor(p.totalMinor, p.currency))}
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="margin-top:14px;border-top:1px solid ${BRAND.line};padding-top:8px;">
            ${factRow('Date', formatPaidAt(p.paidAtISO))}
            ${factRow('Method', p.method === 'CARD' ? 'Card' : 'Paid directly to your tutor')}
            ${p.reference ? factRow('Reference', p.reference) : ''}
          </table>
        </td>
      </tr>
    </table>

    ${
      grants
        ? `<h2 style="margin:24px 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:16px;
                      color:${BRAND.ink};font-weight:700;">${esc(f.grantsHeading)}</h2>
           <ul style="margin:0;padding-left:20px;">${grants}</ul>`
        : ''
    }

    ${
      f.note
        ? `<p style="margin:20px 0 0;padding:12px 14px;background:${BRAND.bg};
                     border-left:3px solid ${BRAND.accent};border-radius:4px;
                     font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;
                     color:${BRAND.ink};">${esc(f.note)}</p>`
        : ''
    }

    ${p.ctaHref && p.ctaLabel ? button(p.ctaHref, p.ctaLabel) : ''}

    <p style="margin:20px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;
              line-height:1.6;color:${BRAND.muted};">
      Keep this email — it is your receipt.
    </p>`;
}

// ─────────────────────────────────────────────────────────────────────
// Previews
// ─────────────────────────────────────────────────────────────────────
// ⚠ A template that branches five ways is a template where four branches
// are untested on any given day. Three of these purposes have never once
// appeared in a combined checkout on dev, so without these fixtures the
// first person to see a broken variant would be a customer. Rendered by
// /admin/emails/preview.

const PAID_AT = '2026-08-11T10:30:00.000Z';

export const paymentReceivedTemplate: EmailTemplate<PaymentReceiptPayload> = {
  key: 'payment.received',
  name: 'Payment receipt',
  subject,
  body,
  previews: [
    {
      label: 'Activated · bank pass',
      payload: {
        framing: 'ACTIVATED',
        recipientName: 'Ama',
        currency: 'GHS',
        totalMinor: 35000,
        paidAtISO: PAID_AT,
        reference: 'nclx_9f2b41',
        method: 'CARD',
        lineItems: [
          {
            purpose: 'BANK_PURCHASE',
            label: 'NCLEX Question Bank — 3 months',
            amountMinor: 35000,
            grants: 'Bank access until 12 November 2026',
          },
        ],
        ctaHref: 'https://nclex.quademia.com/student/bank',
        ctaLabel: 'Start practising',
      },
    },
    {
      label: 'Activated · readiness packs',
      payload: {
        framing: 'ACTIVATED',
        recipientName: 'Ama',
        currency: 'GHS',
        totalMinor: 15000,
        paidAtISO: PAID_AT,
        reference: 'nclx_7c1a08',
        method: 'CARD',
        lineItems: [
          {
            purpose: 'READINESS_PURCHASE',
            label: 'Readiness — 3 packs',
            amountMinor: 15000,
            grants: '3 readiness packs added to your account',
          },
        ],
        ctaHref: 'https://nclex.quademia.com/student/readiness',
        ctaLabel: 'Open readiness',
      },
    },
    {
      label: 'Activated · combined checkout (2 line items)',
      payload: {
        framing: 'ACTIVATED',
        recipientName: 'Ama',
        currency: 'GHS',
        totalMinor: 95000,
        paidAtISO: PAID_AT,
        reference: 'nclx_3de5c2',
        method: 'CARD',
        lineItems: [
          {
            purpose: 'PROGRAMME_INITIAL',
            label: 'NCLEX Intensive — Cohort 3',
            amountMinor: 60000,
            grants: 'Enrolled in Cohort 3 · GHS 150 remaining, next due 5 September 2026',
          },
          {
            purpose: 'BANK_OPTIN_AT_PROGRAMME',
            label: 'Question bank with your programme',
            amountMinor: 35000,
            grants: 'Bank access alongside your programme',
          },
        ],
        ctaHref: 'https://nclex.quademia.com/student/cohort',
        ctaLabel: 'Go to your programme',
      },
    },
    {
      label: 'Activated · installment (tutor recorded it)',
      payload: {
        framing: 'ACTIVATED',
        recipientName: 'Ama',
        currency: 'GHS',
        totalMinor: 20000,
        paidAtISO: PAID_AT,
        reference: null,
        method: 'OFF_PLATFORM',
        lineItems: [
          {
            purpose: 'PROGRAMME_INSTALLMENT',
            label: 'NCLEX Intensive — Payment 2 of 4',
            amountMinor: 20000,
            // Mirrors what buildPaymentReceiptEmail actually produces —
            // the cohort comes from the enrolment, so it is present even
            // though an installment payment row carries no cohort_id.
            grants: 'Enrolled in Cohort 3 · GHS 400 remaining, next due 5 October 2026',
          },
        ],
        ctaHref: 'https://nclex.quademia.com/student/cohort',
        ctaLabel: 'Go to your programme',
      },
    },
    {
      label: 'Awaiting tutor approval',
      payload: {
        framing: 'PENDING_APPROVAL',
        recipientName: 'Ama',
        currency: 'GHS',
        totalMinor: 60000,
        paidAtISO: PAID_AT,
        reference: 'nclx_a41f77',
        method: 'CARD',
        lineItems: [
          {
            purpose: 'PROGRAMME_INITIAL',
            label: 'NCLEX Intensive — Cohort 3',
            amountMinor: 60000,
            grants: 'A place in Cohort 3, once your tutor approves it',
          },
        ],
        ctaHref: null,
        ctaLabel: null,
      },
    },
    {
      // ⭐ The branch that cannot say what the others say: no name (she
      // has no profile), and no end date on the bank pass, because
      // activation has not happened and that is when it is computed.
      label: 'Setup required (pay-first, no account yet)',
      payload: {
        framing: 'SETUP_REQUIRED',
        recipientName: null,
        currency: 'GHS',
        totalMinor: 35000,
        paidAtISO: PAID_AT,
        reference: 'nclx_51b0e9',
        method: 'CARD',
        lineItems: [
          {
            purpose: 'BANK_PURCHASE',
            label: 'NCLEX Question Bank — 3 months',
            amountMinor: 35000,
            grants: null,
          },
        ],
        ctaHref: null,
        ctaLabel: null,
      },
    },
    {
      label: 'Activated · USD (dollar voice)',
      payload: {
        framing: 'ACTIVATED',
        recipientName: 'Jeannie',
        currency: 'USD',
        totalMinor: 4800,
        paidAtISO: PAID_AT,
        reference: 'nclx_88c3aa',
        method: 'CARD',
        lineItems: [
          {
            purpose: 'BANK_PURCHASE',
            label: 'NCLEX Question Bank — 3 months',
            amountMinor: 4800,
            grants: 'Bank access until 12 November 2026',
          },
        ],
        ctaHref: 'https://nclex.quademia.com/student/bank',
        ctaLabel: 'Start practising',
      },
    },
  ],
};

/** The line the footer prints on this email. */
export const PAYMENT_RECEIVED_FOOTER_CONTEXT =
  'You are receiving this because a payment was made with this email address on MyNclex.';
