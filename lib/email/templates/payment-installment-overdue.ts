// mynclex/lib/email/templates/payment-installment-overdue.ts
//
// The night the sweep acts. Two readers, one template.
//
// ⭐ PAST TENSE, NOT FUTURE, AND THAT IS NOT A STYLE CHOICE. Detecting
// overdue and pausing are the same instant — the sweep never notices
// somebody is late and leaves them enrolled — so "you will be paused" is
// never a true sentence. By the time this email exists it has happened.
// She reads it at breakfast, hours after 02:00, and it is simply true.
//
// ⭐ THE MOST IMPORTANT LINE IS "PAYING PUTS IT BACK IMMEDIATELY", and it
// is true: activate.ts recomputes the schedule after a payment lands and
// clears the pause itself. The worst version of this email is one that
// leaves her thinking she must email somebody and wait.
//
// ⚠ `paused` DECIDES WHICH EMAIL THIS IS. On a programme where the tutor
// turned payment-gating off, nothing happened to her access, and claiming
// otherwise would be a lie that costs the tutor a student. Do not collapse
// the two branches to save lines.
//
// ⚠ Every non-literal value must go through esc().
//
// Doc: docs/product-plan/transactional-email.md

import { formatMinor } from '@/lib/products/money';
import type { EmailTemplate, InstallmentOverduePayload } from '../types';
import { APP_ORIGIN, BRAND, button, esc, factRow } from './wrapper';

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

function whatItIsFor(p: InstallmentOverduePayload): string {
  return p.cohortName ? `${p.programmeTitle} · ${p.cohortName}` : p.programmeTitle;
}

// ⭐ THE SUBJECT LEADS WITH A LABEL (Sam, 2026-08-18). "Access paused:"
// first, so the reader knows this one matters before deciding whether to
// open it — and then the PROGRAMME, because that is what she has to act on.
//
// ⚠ Do not restore the fuller sentence ("your access to X is paused").
// After the label those words repeat themselves, and they cost ~25
// characters — enough to push the programme name past a phone's ~45-char
// truncation, so the reader would see the alarm and not which programme it
// was about. Measured, not guessed: 82 chars became 57.
function subject(p: InstallmentOverduePayload): string {
  return p.paused
    ? `Access paused: ${p.programmeTitle}`
    : `Payment overdue — ${formatMinor(p.amountMinor, p.currency)}`;
}

function body(p: InstallmentOverduePayload): string {
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';
  const what = esc(whatItIsFor(p));
  const tutor = esc(p.tutorName);
  const due = esc(formatDate(p.dueAtISO));
  const money = esc(formatMinor(p.amountMinor, p.currency));
  const position = `${esc(p.positionNo)} of ${esc(p.totalPositions)}`;

  const lede = p.paused
    ? `Payment ${position} (<strong>${money}</strong>) for <strong>${what}</strong>, with ${tutor},
       was due on ${due} and has not come through — so your access is paused for now.`
    : `Payment ${position} (<strong>${money}</strong>) for <strong>${what}</strong>, with ${tutor},
       was due on ${due} and has not come through.`;

  // ⭐ The reassurance differs because the situation does. One reader has
  // lost something and needs to know it is recoverable; the other has lost
  // nothing and needs to know that plainly, without being alarmed by an
  // email about money.
  const reassurance = p.paused
    ? `<p style="margin:20px 0 0;font-size:16px;line-height:1.6;color:${BRAND.ink};">
         <strong>Paying puts it back immediately — you do not need to ask anyone.</strong>
       </p>`
    : `<p style="margin:20px 0 0;font-size:16px;line-height:1.6;color:${BRAND.ink};">
         <strong>Your access is unaffected</strong> — nothing has changed on your account.
       </p>`;

  const nothingLost = p.paused
    ? `<p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:${BRAND.muted};">
         Nothing is lost. Your progress, your answers and your place are all still there.
       </p>`
    : '';

  return `
    <p style="margin:0;font-size:16px;line-height:1.6;color:${BRAND.ink};">${greeting}</p>
    <p style="margin:16px 0 0;font-size:16px;line-height:1.6;color:${BRAND.ink};">${lede}</p>

    ${reassurance}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="width:100%;margin:24px 0 0;border-collapse:collapse;">
      ${factRow('Amount', money)}
      ${factRow('Payment', position)}
      ${factRow('Was due', due)}
    </table>

    ${button(
      `${APP_ORIGIN}/checkout/installment/${encodeURIComponent(p.enrolmentId)}`,
      p.paused ? 'Pay now and get back in' : 'Pay now'
    )}

    ${nothingLost}

    <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:${BRAND.muted};">
      If money is the problem, talk to ${tutor}. ${
        p.paused
          ? 'She can extend your due date or restore your access while you sort it out.'
          : 'She can extend your due date while you sort it out.'
      }
    </p>
  `;
}

export const PAYMENT_INSTALLMENT_OVERDUE_FOOTER_CONTEXT =
  'You are receiving this because a payment on your MyNclex programme is past its due date.';

const SAMPLE: InstallmentOverduePayload = {
  recipientName: 'Ama',
  programmeTitle: 'NCLEX-RN Live — The 8-Week Pass Plan',
  cohortName: 'Cohort 3',
  tutorName: 'Grace Mensah',
  currency: 'GHS',
  amountMinor: 15000,
  dueAtISO: '2026-10-01T09:00:00.000Z',
  positionNo: 2,
  totalPositions: 4,
  paused: true,
  enrolmentId: '00000000-0000-4000-8000-000000000001',
};

export const paymentInstallmentOverdueTemplate: EmailTemplate<InstallmentOverduePayload> = {
  key: 'payment.installment_overdue',
  name: 'Access paused / payment overdue',
  subject,
  body,
  previews: [
    { label: 'Paused — access is gated', payload: SAMPLE },
    {
      label: 'NOT paused — tutor turned gating off',
      payload: { ...SAMPLE, paused: false },
    },
    {
      label: 'Paused · self-paced, no cohort, no name',
      payload: { ...SAMPLE, cohortName: null, recipientName: null },
    },
  ],
};
