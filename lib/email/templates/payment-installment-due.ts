// mynclex/lib/email/templates/payment-installment-due.ts
//
// "Your next payment is due" — the T-7 heads-up and the T-3 nudge.
//
// ⭐ ONE TEMPLATE, TWO TONES, and the difference is deliberate. At seven
// days this is information: she is not late, nothing has gone wrong, and
// opening the relationship with a threat is how a paying student quietly
// leaves. At three days it is a nudge, the consequence is named, and the
// way out (ask your tutor for more time) is offered — because by then the
// person who has not paid is usually the person who cannot yet.
//
// ⚠ THE CONSEQUENCE LINE IS CONDITIONAL AND MUST STAY THAT WAY. On a
// programme where the tutor turned payment-gating off, nothing pauses. A
// blanket "your access will pause" would be a threat we do not carry out,
// which is worse than saying nothing.
//
// ⚠ Every non-literal value must go through esc(). These are plain
// strings; nothing escapes them for us.
//
// Doc: docs/product-plan/transactional-email.md

import { formatMinor } from '@/lib/products/money';
import type { EmailTemplate, InstallmentDuePayload } from '../types';
import { appOrigin, BRAND, button, esc, factRow } from './wrapper';

// ⭐ "1 October", not "01/10/2026" — the audience spans GH, UK and CA, and
// 01/10 reads as two different days on two sides of an ocean. A named
// month cannot be misread.
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

/** "NCLEX Intensive · Cohort 3" — the cohort half is often absent. */
function whatItIsFor(p: InstallmentDuePayload): string {
  return p.cohortName ? `${p.programmeTitle} · ${p.cohortName}` : p.programmeTitle;
}

function subject(p: InstallmentDuePayload): string {
  const money = formatMinor(p.amountMinor, p.currency);
  // ⓘ Leads with the amount, matching "Payment received — GHS 350". An
  // inbox list shows about forty characters; the number is the part she
  // is deciding about.
  return p.lead === 'T-3'
    ? `Payment due in 3 days — ${money}`
    : `Payment due ${formatDate(p.dueAtISO)} — ${money}`;
}

function body(p: InstallmentDuePayload): string {
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';
  const what = esc(whatItIsFor(p));
  const tutor = esc(p.tutorName);
  const due = esc(formatDate(p.dueAtISO));
  const money = esc(formatMinor(p.amountMinor, p.currency));

  const lede =
    p.lead === 'T-3'
      ? `Your payment for <strong>${what}</strong>, with ${tutor}, is due on <strong>${due}</strong> — that is in three days.`
      : `A heads-up that your next payment for <strong>${what}</strong>, with ${tutor}, is due on <strong>${due}</strong>.`;

  // ⚠ Only on gated programmes. See the header.
  const consequence = p.gatesAccess
    ? p.lead === 'T-3'
      ? `<p style="margin:20px 0 0;font-size:15px;line-height:1.6;color:${BRAND.ink};">
           If it has not come through by then, your access will pause until it does.
           Paying puts it back straight away.
         </p>
         <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:${BRAND.muted};">
           If you need more time, ${tutor} can extend your due date — just ask.
         </p>`
      : `<p style="margin:20px 0 0;font-size:15px;line-height:1.6;color:${BRAND.muted};">
           Paying by then keeps your access running without a break.
         </p>`
    : '';

  return `
    <p style="margin:0;font-size:16px;line-height:1.6;color:${BRAND.ink};">${greeting}</p>
    <p style="margin:16px 0 0;font-size:16px;line-height:1.6;color:${BRAND.ink};">${lede}</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="width:100%;margin:24px 0 0;border-collapse:collapse;">
      ${factRow('Amount', money)}
      ${factRow('Payment', `${esc(p.positionNo)} of ${esc(p.totalPositions)}`)}
      ${factRow('Due', due)}
    </table>

    ${button(`${appOrigin()}/checkout/installment/${encodeURIComponent(p.enrolmentId)}`, 'Pay now')}
    ${consequence}
  `;
}

export const PAYMENT_INSTALLMENT_DUE_FOOTER_CONTEXT =
  'You are receiving this because you are on a payment plan for a MyNclex programme.';

const SAMPLE: InstallmentDuePayload = {
  recipientName: 'Ama',
  programmeTitle: 'NCLEX-RN Live — The 8-Week Pass Plan',
  cohortName: 'Cohort 3',
  tutorName: 'Grace Mensah',
  currency: 'GHS',
  amountMinor: 15000,
  dueAtISO: '2026-10-01T09:00:00.000Z',
  positionNo: 2,
  totalPositions: 4,
  lead: 'T-7',
  gatesAccess: true,
  enrolmentId: '00000000-0000-4000-8000-000000000001',
};

export const paymentInstallmentDueTemplate: EmailTemplate<InstallmentDuePayload> = {
  key: 'payment.installment_due',
  name: 'Payment reminder',
  subject,
  body,
  // ⓘ Four variants because that is genuinely how many ways this renders:
  // two lead times × gated or not. The non-gated pair is the one most
  // likely to go wrong unnoticed, since nobody on the team is on such a
  // programme.
  previews: [
    { label: 'T-7 · access gated', payload: SAMPLE },
    { label: 'T-3 · access gated', payload: { ...SAMPLE, lead: 'T-3' } },
    {
      label: 'T-7 · gating off (no consequence line)',
      payload: { ...SAMPLE, gatesAccess: false },
    },
    {
      label: 'T-3 · self-paced, no cohort, gating off',
      payload: { ...SAMPLE, lead: 'T-3', gatesAccess: false, cohortName: null },
    },
  ],
};
