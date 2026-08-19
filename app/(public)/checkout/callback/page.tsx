// mynclex/app/(public)/checkout/callback/page.tsx
//
// Where Paystack sends the buyer's browser back after payment. Reads the
// ?reference, confirms it with Paystack via settlePayment() (verify + grant —
// both idempotent), then shows a real result screen: a status header, the
// order summary (doubling as the buyer's receipt — we have no transactional
// email yet, so we ask them to screenshot it), and the one right next step
// for that outcome.
//
// Slice 1 (2026-06-24): the redesigned screen + the receipt loader.
// Slice 2 (2026-06-24): the live bits — session-aware next-step (logged-in →
// straight in; logged-out → "log in to continue"), the PENDING auto-recheck
// island, and (via verify.ts) a genuinely declined charge now lands here as
// "didn't go through" rather than "waiting". A one-click "resend setup email"
// is deliberately NOT built — it's a transactional-email concern (deferred);
// the setup-email state offers a contact-support fallback instead.

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { settlePayment } from '@/lib/payments/settle';
import { getPaymentReceipt } from '@/lib/payments/result';
import type { Currency } from '@/lib/payments/types';
import { PendingRecheck } from './pending-recheck';

export const dynamic = 'force-dynamic';

// Renamed with the domain move (build-order item 4, 2026-08-09). The
// support@ alias on quademia.com lands in the same inbox and was
// delivery-proven on 2026-08-05; the old address still receives, so a
// receipt already in someone's inbox does not go dead.
const SUPPORT_EMAIL = 'support@quademia.com';

function money(minor: number, currency: Currency): string {
  const major = minor / 100;
  const amount = Number.isInteger(major) ? major.toLocaleString('en-US') : major.toFixed(2);
  return currency === 'GHS' ? `GHS ${amount}` : `$${amount}`;
}

type Tone = 'success' | 'info' | 'warning' | 'danger';
type IconName = 'check' | 'clock' | 'mail' | 'alert' | 'help';
type CtaLink = { href: string; label: string; external?: boolean };

function StatusIcon({ name }: { name: IconName }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'check':
      return (
        <svg {...common}>
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5v5l3 2" />
        </svg>
      );
    case 'mail':
      return (
        <svg {...common}>
          <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
          <path d="M4 7l8 6 8-6" />
        </svg>
      );
    case 'alert':
      return (
        <svg {...common}>
          <path d="M12 4l8.5 15h-17z" />
          <path d="M12 10v4" />
          <path d="M12 16.5h.01" />
        </svg>
      );
    case 'help':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.7 9.6a2.4 2.4 0 0 1 4.3 1.4c0 1.6-2 1.9-2 3.2" />
          <path d="M12 17.2h.01" />
        </svg>
      );
  }
}

export default async function CheckoutCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const sp = await searchParams;
  const reference = (sp.reference ?? sp.trxref ?? '').trim();
  const result = reference ? await settlePayment(reference) : null;
  const receipt = reference ? await getPaymentReceipt(reference) : null;

  // Is the buyer signed in on this device? Drives the next-step: a logged-in
  // buyer goes straight to what they unlocked; a guest is sent to log in
  // first (the deep-link target is auth-gated anyway). getUser revalidates the
  // token — never getSession (rule #4).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const loggedIn = !!user;

  const isPending = !!result && !result.ok && result.status === 'PENDING';

  // ── view model ──────────────────────────────────────────────────────
  let tone: Tone = 'danger';
  let icon: IconName = 'help';
  let pill = '';
  let heading = 'No payment found';
  let body = 'We could not find a payment to confirm.';
  let showReceipt = false;
  let receiptTitle = 'Payment summary';
  let showScreenshot = false;
  let primary: CtaLink | null = { href: '/programmes', label: 'Back to programmes' };
  let secondary: CtaLink | null = null;
  let note: string | null = null;

  const dest = receipt?.destinationHref ?? '/student';

  if (result?.ok) {
    showReceipt = !!receipt;
    showScreenshot = true;
    if (result.status === 'PENDING_APPROVAL') {
      tone = 'info';
      icon = 'clock';
      pill = 'Awaiting tutor';
      heading = 'Payment received';
      body =
        'Your enrolment is in — your tutor approves it shortly (usually within 24 hours), and the programme unlocks once they do.';
      primary = loggedIn
        ? { href: dest, label: 'Track your enrolment' }
        : { href: '/login', label: 'Log in to track your enrolment' };
    } else if (result.status === 'INVITE_SENT' && result.setupEmailQueued === false) {
      // ⭐⭐ THE STATE THAT COULD NOT EXIST BEFORE 2026-08-19. While the
      // setup link travelled in Supabase's own invite, a failure of OUR
      // receipt cost her nothing — the way in was already sent by another
      // system. Since the swap this email carries the link, so when it
      // does not reach the queue there is nothing behind it, and telling
      // her "check your email" would be a plain falsehood.
      //
      // ⭐ But she is NOT locked out, and that is the only reason this
      // page can be useful rather than apologetic: generateLink CREATED
      // the account before the email was ever attempted. So the honest
      // instruction is the one that works — the sign-in code — not
      // "contact support and wait".
      //
      // ⚠ Names the /login control exactly as it is labelled there.
      tone = 'warning';
      icon = 'alert';
      pill = 'Set up your account';
      heading = 'Payment received — one step left';
      body = receipt?.email
        ? `Your payment is safe and your account has been created for ${receipt.email}, but we could not send the setup email. You can still get in: go to the sign-in page and choose "Email me a sign-in code".`
        : 'Your payment is safe and your account has been created, but we could not send the setup email. You can still get in: go to the sign-in page and choose "Email me a sign-in code".';
      primary = { href: '/login', label: 'Go to sign in' };
      secondary = {
        href: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
          'My setup email — ' + (receipt?.reference ?? reference)
        )}`,
        label: 'Email support',
        external: true,
      };
      note =
        'Take a screenshot of this page. If the sign-in code does not arrive either, send it to support and we will finish the setup for you.';
    } else if (result.status === 'INVITE_SENT') {
      tone = 'info';
      icon = 'mail';
      pill = 'Check your email';
      heading = 'Payment received — one step left';
      // ⚠ ONE email now, not two. Until 2026-08-19 this said "a setup
      // link" while a receipt arrived beside it, so she was looking for
      // the wrong message — the branded one she had already opened was
      // the one to keep. It is now the same email: receipt and way in.
      body = receipt?.email
        ? `We've emailed your receipt to ${receipt.email}, and it carries the link that finishes setting up your account. Open it to unlock your access.`
        : 'We have emailed your receipt, and it carries the link that finishes setting up your account — your access unlocks once you open it.';
      if (receipt?.isTutorLed) {
        body += ' Once you finish setup, your tutor approves your place (usually within 24 hours).';
      }
      primary = null;
      // EMAIL-TRIGGER[payment.setup_link_resend]: a one-click "resend
      // setup email" is still deferred — but the reason has changed. It
      // was "re-sending isn't cleanly available without our own mailer";
      // we now have one, so it is a slice, not a blocker. Until then the
      // sign-in code is the self-service path and support is the backstop.
      secondary = {
        href: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
          'My setup email — ' + (receipt?.reference ?? reference)
        )}`,
        label: 'Email support',
        external: true,
      };
      note =
        "Can't find it? Check your spam folder. If the link has expired, go to the sign-in page and choose \"Email me a sign-in code\" — your account already exists.";
    } else {
      // ACCESS_READY or ALREADY.
      tone = 'success';
      icon = 'check';
      // A readiness-only order grants credits, not access — the claim UI
      // (Slice ②b.2) isn't live yet, so say the credits are ready and the
      // packs come next; don't promise "access".
      const readinessOnly = !!receipt?.isReadinessOnly;
      pill =
        result.status === 'ALREADY'
          ? 'Already confirmed'
          : readinessOnly
            ? 'Credits ready'
            : 'Access ready';
      heading = result.status === 'ALREADY' ? 'Payment already confirmed' : "You're in";
      if (result.status === 'ALREADY') {
        body = readinessOnly
          ? 'This payment was already confirmed and your pack credits are on your account.'
          : 'This payment was already confirmed and your access is set up.';
      } else {
        body = readinessOnly
          ? 'Your payment is confirmed and your pack credits are on your account. Choosing your packs opens shortly.'
          : 'Your payment is confirmed and your access is ready.';
      }
      primary = loggedIn
        ? { href: dest, label: receipt?.destinationLabel ?? 'Go to my learning' }
        : { href: '/login', label: 'Log in to continue' };
    }
  } else if (result) {
    if (result.status === 'PENDING') {
      tone = 'warning';
      icon = 'clock';
      pill = 'Waiting';
      heading = 'Waiting for confirmation';
      body = "We haven't seen a completed payment yet. If you've just paid, refresh in a moment.";
      showReceipt = !!receipt;
      receiptTitle = 'Order summary';
      primary = { href: `/checkout/callback?reference=${encodeURIComponent(reference)}`, label: 'Refresh' };
      secondary = { href: '/programmes', label: 'Back to programmes' };
    } else if (result.status === 'FAILED') {
      tone = 'danger';
      icon = 'alert';
      pill = 'Payment failed';
      heading = "Payment didn't go through";
      body = result.error || 'Your payment could not be completed. You were not charged.';
      primary = receipt?.retryHref
        ? { href: receipt.retryHref, label: 'Try again' }
        : { href: '/programmes', label: 'Back to programmes' };
      secondary = { href: `mailto:${SUPPORT_EMAIL}`, label: 'Contact support', external: true };
      if (reference) note = `Reference: ${reference}`;
    } else if (result.status === 'NOT_FOUND') {
      tone = 'warning';
      icon = 'help';
      pill = '';
      heading = 'No payment found';
      body = 'We could not find a payment to confirm. If you just paid, give it a moment and refresh.';
      primary = { href: '/programmes', label: 'Back to programmes' };
    } else {
      // ERROR.
      tone = 'danger';
      icon = 'alert';
      pill = 'Something went wrong';
      heading = 'Something went wrong';
      body = result.error || 'We hit a problem confirming this payment.';
      primary = receipt?.retryHref
        ? { href: receipt.retryHref, label: 'Try again' }
        : { href: '/programmes', label: 'Back to programmes' };
      secondary = { href: `mailto:${SUPPORT_EMAIL}`, label: 'Contact support', external: true };
      if (reference) note = `Reference: ${reference}`;
    }
  }

  const renderCta = (cta: CtaLink, kind: 'btn' | 'ghost') => {
    const cls = kind === 'btn' ? 'cr-btn' : 'cr-btn-ghost';
    if (cta.external) {
      return (
        <a className={cls} href={cta.href}>
          {cta.label}
        </a>
      );
    }
    return (
      <Link className={cls} href={cta.href}>
        {cta.label}
        {kind === 'btn' ? ' →' : ''}
      </Link>
    );
  };

  return (
    <main className="pub-content co-content">
      <div className={`cr-card cr-tone-${tone}`}>
        <div className="cr-head">
          <div className="cr-icon" aria-hidden="true">
            <StatusIcon name={icon} />
          </div>
          <div className="cr-head-main">
            <h1 className="cr-heading">{heading}</h1>
            <p className="cr-body">{body}</p>
          </div>
          {pill && <span className="cr-pill">{pill}</span>}
        </div>

        {showReceipt && receipt && (
          <div className="cr-receipt">
            <div className="cr-receipt-title">{receiptTitle}</div>
            {receipt.lines.map((l) => (
              <div className="cr-line" key={l.key}>
                <div className="cr-line-main">
                  <div className="cr-line-name">{l.name}</div>
                  {l.meta && <div className="cr-line-meta">{l.meta}</div>}
                </div>
                <div className="cr-line-amt">{money(l.amountMinor, receipt.currency)}</div>
              </div>
            ))}
            <div className="cr-total">
              <span>Total</span>
              <span className="cr-total-v">{money(receipt.totalMinor, receipt.currency)}</span>
            </div>
            <div className="cr-ref">
              <span>Reference</span>
              <code>{receipt.reference}</code>
            </div>
          </div>
        )}

        {showScreenshot && (
          <p className="cr-shot">
            <span aria-hidden="true">📸</span> Take a screenshot of this page for your records.
          </p>
        )}

        {isPending && <PendingRecheck />}

        {(primary || secondary) && (
          <div className="cr-actions">
            {primary && renderCta(primary, 'btn')}
            {secondary && renderCta(secondary, 'ghost')}
          </div>
        )}

        {note && <p className="cr-note">{note}</p>}
      </div>
    </main>
  );
}
