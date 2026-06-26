// mynclex/app/(public)/checkout/programme/[id]/page.tsx
//
// On-platform programme checkout. Reached from the live "Enrol" button on
// /programmes/[id]. Server component: re-reads the programme from the public
// view and re-applies the same gates the detail page used to enable the
// button, so a hand-typed URL can't reach checkout for a programme that
// isn't enrollable. The interactive part (cohort, bank opt-in, email, Pay)
// is the co-located client component, which renders the shared CheckoutShell.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPublicProgramme, getPublicCohorts } from '@/lib/discovery/queries';
import { getCheckoutPlansByScope } from '@/lib/strategies/public-queries';
import { formatCohortDateLong, initials, tutorAttribution } from '@/lib/discovery/format';
import { ProgrammeCheckout, type BankTier } from './programme-checkout';

export const dynamic = 'force-dynamic';

export default async function ProgrammeCheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const programme = await getPublicProgramme(id);
  if (!programme) notFound();

  const detailHref = `/programmes/${id}`;
  const selfPaced = programme.delivery_mode === 'SELF_PACED';

  // Re-apply the button's enable gate. (The public view already gates to
  // PUBLISHED + active tutor, so a row here is necessarily published.)
  const enrollable =
    programme.payment_collection_mode === 'ON_PLATFORM' &&
    programme.show_price_publicly &&
    programme.headline_price_minor > 0;
  if (!enrollable) redirect(detailHref);

  const todayStr = new Date().toISOString().slice(0, 10);
  const cohortOptions = selfPaced
    ? []
    : (await getPublicCohorts(id))
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

  // Bank opt-in: the 5 paid duration tiers + the configured discount, priced
  // in the PROGRAMME's currency (one charge, one currency).
  const supabase = await createClient();
  const currency = programme.price_currency;
  const [{ data: products }, { data: cfg }, { data: { user } }, scopedPlans] = await Promise.all([
    supabase
      .from('nclex_products')
      .select('product_id, duration_days, price_minor_ghs, price_minor_usd')
      .eq('pack_type', 'BANK_DURATION')
      .eq('kind', 'PAID')
      .eq('status', 'ACTIVE')
      .order('sort_order', { ascending: true }),
    supabase.from('nclex_config').select('value').eq('key', 'bank_optin_discount').maybeSingle(),
    supabase.auth.getUser(),
    getCheckoutPlansByScope(id),
  ]);

  const rawDiscount = Number(cfg?.value);
  const discount = Number.isFinite(rawDiscount) && rawDiscount >= 0 && rawDiscount < 1 ? rawDiscount : 0;
  const bankTiers: BankTier[] = discount
    ? (products ?? []).map((p) => {
        const standalone = currency === 'GHS' ? p.price_minor_ghs : p.price_minor_usd;
        return {
          productId: p.product_id,
          days: p.duration_days ?? 0,
          standaloneMinor: standalone,
          discountedMinor: Math.round(standalone * (1 - discount)),
        };
      })
    : [];

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

      <ProgrammeCheckout
        programmeId={id}
        selfPaced={selfPaced}
        cohorts={cohortOptions}
        programmeTitle={programme.title}
        currency={currency}
        programmeMinor={programme.headline_price_minor}
        defaultPlans={scopedPlans.defaultPlans}
        plansByCohort={scopedPlans.byCohort}
        bankTiers={bankTiers}
        discountPct={Math.round(discount * 100)}
        accountEmail={user?.email ?? null}
      />
    </main>
  );
}
