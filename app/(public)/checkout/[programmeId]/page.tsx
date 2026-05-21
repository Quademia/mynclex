// mynclex/app/(public)/checkout/[programmeId]/page.tsx
//
// On-platform programme checkout (Payments Slice 5.4a). Reached from the
// live "Enrol" button on /programmes/[id]. Server component: re-reads the
// programme from the public view and re-applies the same gates the detail
// page used to enable the button (published + on-platform + public price +
// something joinable), so a hand-typed URL can't reach checkout for a
// programme that isn't actually enrollable. The interactive part (cohort
// pick, email + dup-check, Pay) lives in the co-located client form.
//
// Upfront-full only in 5.4a. The payment-strategy and bank-opt-in cards
// render as disabled "coming soon" placeholders (Slices 7 and 5.4b).

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getPublicProgramme, getPublicCohorts } from '@/lib/discovery/queries';
import {
  formatCohortDateLong,
  initials,
  priceParts,
  tutorAttribution,
} from '@/lib/discovery/format';
import { CheckoutForm } from './checkout-form';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ programmeId: string }>;
}) {
  const { programmeId } = await params;
  const programme = await getPublicProgramme(programmeId);
  if (!programme) notFound();

  const detailHref = `/programmes/${programmeId}`;
  const selfPaced = programme.delivery_mode === 'SELF_PACED';

  // Re-apply the button's enable gate. Anything that fails it bounces back
  // to the read-only detail page rather than showing an unusable checkout.
  // (The public view already gates to PUBLISHED + active tutor, so a row
  // here is necessarily published.)
  const enrollable =
    programme.payment_collection_mode === 'ON_PLATFORM' &&
    programme.show_price_publicly &&
    programme.price_minor > 0;
  if (!enrollable) redirect(detailHref);

  // Tutor-led needs at least one joinable cohort (matches the detail page +
  // the nclex_join gate: upcoming OR late-join-allowed).
  const todayStr = new Date().toISOString().slice(0, 10);
  const cohortOptions = selfPaced
    ? []
    : (await getPublicCohorts(programmeId))
        .filter((c) => c.start_date >= todayStr || c.allow_late_join)
        .map((c) => ({
          id: c.cohort_id,
          label: c.name
            ? `${c.name} · starts ${formatCohortDateLong(c.start_date)}`
            : `Starts ${formatCohortDateLong(c.start_date)}`,
        }));
  if (!selfPaced && cohortOptions.length === 0) redirect(detailHref);

  const attr = tutorAttribution(
    programme.tutor_profile,
    programme.tutor_name,
    programme.tutor_avatar_url
  );
  const { ccy, amount } = priceParts(programme.price_currency, programme.price_minor);

  return (
    <main className="pub-content co-content">
      <Link className="det-back" href={detailHref}>
        ← Back to programme
      </Link>

      <div className="co-head">
        <div className="co-head-avatar" aria-hidden="true">
          {attr.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attr.imageUrl} alt="" />
          ) : (
            initials(attr.initialsSeed)
          )}
        </div>
        <div>
          <div className="co-head-eyebrow">YOU&apos;RE ENROLLING IN</div>
          <h1 className="co-head-title">{programme.title}</h1>
          <div className="co-head-sub">
            By {attr.primaryName}
            {attr.secondaryName ? ` · with ${attr.secondaryName}` : ''} ·{' '}
            {selfPaced ? 'self-paced' : 'tutor-led'} · secured by Paystack
          </div>
        </div>
      </div>

      <CheckoutForm
        programmeId={programmeId}
        selfPaced={selfPaced}
        cohorts={cohortOptions}
        programmeTitle={programme.title}
        currencyLabel={ccy}
        amount={amount}
      />
    </main>
  );
}
