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
    // ⭐⭐ THE NOTE FOR THIS FRAMING IS CHOSEN IN body(), NOT HERE.
    // Until 2026-08-19 it read "Look for a separate email inviting you to
    // set up your account" — because there was one: activate.ts called
    // inviteUserByEmail and Supabase sent its generic body alongside this
    // receipt. Two emails for one action, and the branded one pointed at
    // the bare one. Since the swap, THIS email carries the link, so what
    // the note should say depends on whether it has one — see SETUP_NOTE.
    note: null,
  },
};

// ─────────────────────────────────────────────────────────────────────
// The setup note — two wordings, because the link is not guaranteed
// ─────────────────────────────────────────────────────────────────────
// ⚠ A note that says "the button above" when no button rendered sends
// the reader hunting for a control that is not there. Two cases produce
// a SETUP_REQUIRED receipt with no link, and both are real:
//
//   • A row queued BEFORE the swap deployed, drained after it. Its
//     payload has ctaHref: null and it renders through this template.
//   • The retry branch in activate.ts, which re-queues the receipt
//     without minting a fresh link (see the comment there for why).
//
// ⭐ Neither is a lock-out, and that is the whole reason this shape is
// safe: generateLink CREATES the account the moment it is called, so by
// the time either wording is read, the account exists — and /login's
// "Email me a sign-in code" only requires that. Proven working
// 2026-08-12 against exactly this account state (invited, never
// confirmed, no password) on the tutor path.
//
// ⚠ Names the button as it is actually labelled on /login.
const SETUP_NOTE = {
  withLink:
    'The button above is your way in, and it works once. If it has already ' +
    'expired, go to the sign-in page and choose "Email me a sign-in code" — ' +
    'your account already exists, so a code will let you straight in.',
  noLink:
    'To set up your account, go to the sign-in page and choose "Email me a ' +
    'sign-in code" — your account already exists, so a code will let you ' +
    `straight in. If that does not work, write to ${SUPPORT_EMAIL} and we ` +
    'will sort it out.',
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
  BANK_TRIAL: 'Free trial',
};

// ─────────────────────────────────────────────────────────────────────
// The trial overlay — a second dimension, not more framings
// ─────────────────────────────────────────────────────────────────────
// ⭐ The free 7-day pass reuses this email whole (2026-09-04): same money
// block, same grants list, same setup-link machinery, so the copy that
// matters is fixed in ONE place rather than drifting across two files.
//
// ⭐ Why an overlay and not TRIAL_ACTIVATED / TRIAL_SETUP_REQUIRED keys:
// FRAMING's keys describe the STATE of the grant, and trial-ness is a
// property of the ORDER. They are independent, so folding them into one
// enum multiplies its entries and invites a fourth that means nothing
// (a trial can never be PENDING_APPROVAL — no tutor approves it).
//
// ⚠ Only the sentences that would be FALSE for a trial are overridden.
// "Payment received" and "your payment went through" are the false ones:
// nobody paid. The amount is not — GHS 0.00 is true, and dressing it up
// would be worse than stating it (Sam, 2026-09-04).
// ⚠ A FUNCTION SINCE 2026-09-05, where it used to be a constant. It said
// "7-day" in three places, so changing the trial's length in the admin
// catalogue would have left the first email a new trialler ever receives
// contradicting both the page she came from and the real end date printed
// lower down the same email. The length now travels ON THE ORDER
// (`trialDays`), so these sentences are built per payload.
/**
 * This order's trial length, or null when it did not carry one.
 *
 * ⚠ Null is a real state, not a gap — a row queued before `trialDays`
 * existed has none, and neither would a trial product saved with no
 * duration. Everything below drops the number rather than inventing one.
 */
function trialLengthDays(p: PaymentReceiptPayload): number | null {
  return typeof p.trialDays === 'number' && p.trialDays > 0 ? p.trialDays : null;
}

function trialOverlay(
  p: PaymentReceiptPayload,
): Partial<(typeof FRAMING)[keyof typeof FRAMING]> | null {
  const days = trialLengthDays(p);
  // "14-day" when the order carried its length, "free" when it did not —
  // so the sentence keeps a selling word either way rather than reading
  // "Your trial of the question bank".
  const length = days ? `${days}-day` : 'free';

  switch (p.framing) {
    case 'ACTIVATED':
      return {
        heading: 'Your free trial is open',
        lede: `Your ${length} trial of the question bank is ready — everything below is yours to use now.`,
        grantsHeading: 'What you now have',
      };
    case 'SETUP_REQUIRED':
      return {
        heading: 'Your free trial — one step left',
        subjectTail: 'one step left',
        lede:
          `Your ${length} trial of the question bank is reserved. To reach it, you ` +
          'need to finish setting up your account.',
        grantsHeading: 'What your trial gives you',
      };
    // PENDING_APPROVAL: unreachable for a trial — no tutor approves one.
    default:
      return null;
  }
}

function framingFor(p: PaymentReceiptPayload) {
  return { ...FRAMING[p.framing], ...(p.isTrial ? trialOverlay(p) : null) };
}

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
  const f = framingFor(p);
  // ⚠ The trial's subject drops the amount entirely. "Payment received —
  // GHS 0.00" in an inbox reads as a billing error, which is the one thing
  // a free trial must not look like.
  //
  // ⭐ The subject KEEPS "free" and inserts the number when it has one —
  // "Your free 14-day trial…". Both words earn their place in an inbox
  // line, so unlike the lede this one adds rather than substitutes; with
  // no number it falls back to "Your free trial…".
  const trialDays = trialLengthDays(p);
  const base = p.isTrial
    ? `Your free ${trialDays ? `${trialDays}-day ` : ''}trial of the question bank`
    : `Payment received — ${formatMinor(p.totalMinor, p.currency)}`;
  return f.subjectTail ? `${base} (${f.subjectTail})` : base;
}

function body(p: PaymentReceiptPayload): string {
  const f = framingFor(p);
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';
  const grants = grantsList(p.lineItems);
  const hasCta = !!(p.ctaHref && p.ctaLabel);

  // Only SETUP_REQUIRED varies by whether a button rendered. The other
  // two framings are fixed: ACTIVATED has no note, and PENDING_APPROVAL
  // has no button.
  const note =
    p.framing === 'SETUP_REQUIRED' ? (hasCta ? SETUP_NOTE.withLink : SETUP_NOTE.noLink) : f.note;

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
            ${factRow(
              'Method',
              // ⚠ A trial's collection_channel is 'NONE' and maps to 'CARD'
              // upstream, so without this the receipt would claim a card was
              // charged. The amount can honestly read 0.00; the method cannot
              // honestly read "Card".
              p.isTrial
                ? 'Free trial — no payment taken'
                : p.method === 'CARD'
                  ? 'Card'
                  : 'Paid directly to your tutor'
            )}
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

    ${hasCta ? button(p.ctaHref as string, p.ctaLabel as string) : ''}

    ${
      note
        ? `<p style="margin:20px 0 0;padding:12px 14px;background:${BRAND.bg};
                     border-left:3px solid ${BRAND.accent};border-radius:4px;
                     font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;
                     color:${BRAND.ink};">${esc(note)}</p>`
        : ''
    }

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
      // ⚠⚠ THE VARIANT THAT WAS A FALSE STATEMENT UNTIL 2026-08-19.
      // A paused student's grants line read "Enrolled in <cohort>",
      // because result.ts branched on PENDING_APPROVAL and let every
      // other status fall through. She had just paid, was still locked
      // out, and this told her she was in. Fixed at the source; this
      // fixture is here so it cannot come back unseen.
      //
      // ⓘ The wording is FROZEN AT ENQUEUE by result.ts, not chosen
      // here — so this preview is a sample of what that produces, and a
      // change there must be mirrored here or the two drift.
      label: 'Instalment · still paused (arrears not cleared)',
      payload: {
        framing: 'ACTIVATED',
        recipientName: 'Ama',
        currency: 'GHS',
        totalMinor: 100000,
        paidAtISO: PAID_AT,
        reference: null,
        method: 'OFF_PLATFORM',
        lineItems: [
          {
            purpose: 'PROGRAMME_INSTALLMENT',
            label: 'NCLEX 4-Week Tutor-Led Bootcamp — Payment 2 of 4',
            amountMinor: 100000,
            grants:
              'Access to Q3 Upcoming Cohort is paused until the plan is up to date · ' +
              'GHS 2,000 remaining, the next payment was due 6 June 2026',
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
      //
      // ⭐⭐ Since 2026-08-19 it also carries the ONLY way into the
      // account it just paid for. The href here is a shape, not a real
      // link — the live one is a one-time token minted by generateLink.
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
        ctaHref: 'https://nclex.quademia.com/welcome#example-one-time-link',
        ctaLabel: 'Set up your account',
      },
    },
    {
      // ⚠ THE SAME STATE WITH NO LINK — the wording that has to stand on
      // its own. Two things produce it: a receipt queued before the
      // 2026-08-19 swap and drained after it, and activate.ts's retry
      // branch. Without this fixture the first person to read a
      // buttonless setup receipt would be a customer.
      label: 'Setup required · no link (pre-swap row, or a retry)',
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
    // ⚠⚠ THE TRIAL HAD NO FIXTURE AT ALL until 2026-09-05, though it is a
    // whole second dimension over the framings above and ships the first
    // email a new trialler ever receives. Exactly the gap the note at the
    // top of this section warns about — three variants, none of them
    // viewable, on the busiest door into the product. Three now: the two
    // live states, plus the no-number fallback.
    {
      label: 'Trial · activated',
      payload: {
        framing: 'ACTIVATED',
        recipientName: 'Ama',
        currency: 'GHS',
        totalMinor: 0,
        paidAtISO: PAID_AT,
        // A trial never reaches Paystack, so there is no reference to print.
        reference: null,
        method: 'CARD',
        lineItems: [
          {
            purpose: 'BANK_TRIAL',
            label: 'Free trial — 7 days',
            amountMinor: 0,
            grants: 'Bank access until 18 August 2026',
          },
        ],
        ctaHref: 'https://nclex.quademia.com/student/bank',
        ctaLabel: 'Start practising',
        isTrial: true,
        trialDays: 7,
      },
    },
    {
      // The trial's own pay-first branch: she asked for it while logged
      // out, so nothing is granted yet and there is no end date to state.
      // The LENGTH is therefore the only thing this email can say about how
      // much time she is being offered — which is why it travels on the
      // order rather than being read from the catalogue at send time.
      label: 'Trial · setup required (asked for it logged out)',
      payload: {
        framing: 'SETUP_REQUIRED',
        recipientName: null,
        currency: 'GHS',
        totalMinor: 0,
        paidAtISO: PAID_AT,
        reference: null,
        method: 'CARD',
        lineItems: [
          {
            purpose: 'BANK_TRIAL',
            label: 'Free trial — 7 days',
            amountMinor: 0,
            grants: null,
          },
        ],
        ctaHref: 'https://nclex.quademia.com/welcome#example-one-time-link',
        ctaLabel: 'Set up your account',
        isTrial: true,
        trialDays: 7,
      },
    },
    {
      // ⚠ THE WORDING WITH NO NUMBER — what a row queued before
      // `trialDays` existed renders as when it drains after this shipped,
      // and what a trial product saved with no duration would produce.
      // "free" stands in for the number: vaguer, never wrong. Same reason
      // the buttonless setup receipt above has a fixture of its own.
      label: 'Trial · no length on the order (pre-field row)',
      payload: {
        framing: 'ACTIVATED',
        recipientName: 'Ama',
        currency: 'GHS',
        totalMinor: 0,
        paidAtISO: PAID_AT,
        reference: null,
        method: 'CARD',
        lineItems: [
          {
            purpose: 'BANK_TRIAL',
            label: 'Free trial',
            amountMinor: 0,
            grants: 'Bank access until 18 August 2026',
          },
        ],
        ctaHref: 'https://nclex.quademia.com/student/bank',
        ctaLabel: 'Start practising',
        isTrial: true,
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
