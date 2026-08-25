// mynclex/app/(public)/checkout/installment/[enrolmentId]/page.tsx
//
// Pay a later installment / balance on an existing enrolment (Slice 7d).
// Reached from the student's programme row "Pay" button. Logged-in only and
// owner-only: the enrolment is read through the student's RLS-scoped client,
// so a hand-typed id for someone else's enrolment simply isn't found. The
// next payment + amount are computed server-side from the frozen plan and
// re-validated again at charge time in init.ts.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { buildSchedule } from '@/lib/payments/schedule';
import type { Currency } from '@/lib/payments/types';
import type { FrozenStrategySnapshot } from '@/lib/strategies/types';
import { InstallmentCheckout } from './installment-checkout';

export const dynamic = 'force-dynamic';

export default async function InstallmentCheckoutPage({
  params,
}: {
  params: Promise<{ enrolmentId: string }>;
}) {
  const { enrolmentId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // The `user_id` filter is what makes this the caller's own enrolment
  // — RLS is not, despite what this comment used to claim. A tutor may
  // read every enrolment on their own programmes, so without it a tutor
  // could open one of their students' installment checkouts and read
  // that student's amount and schedule. (Paying was always refused —
  // lib/payments/init.ts re-checks ownership against the service-role
  // client — but the page rendered.) See lib/enrolments/queries.ts.
  const { data: enr } = await supabase
    .from('nclex_enrolments')
    .select('enrolment_id, programme_id, status, enrolled_at, strategy_snapshot_json')
    .eq('enrolment_id', enrolmentId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!enr) notFound();

  const backHref = '/student/picker';
  // Only an active-ish enrolment with a frozen plan can take a payment.
  const snapshot = enr.strategy_snapshot_json as FrozenStrategySnapshot | null;
  if (!['ENROLLED', 'PAUSED'].includes(enr.status) || !snapshot) redirect(backHref);

  const { data: prog } = await supabase
    .from('nclex_programmes')
    .select('title, price_currency, payment_collection_mode')
    .eq('programme_id', enr.programme_id)
    .maybeSingle();
  if (!prog) notFound();

  // Tutor-collection programmes are tracking-only (add-with-plan,
  // 2026-06-12): the schedule shows what's owed, but money goes to the
  // tutor directly — there's nothing to pay online here. init.ts enforces
  // the same rule at charge time.
  if (prog.payment_collection_mode !== 'ON_PLATFORM') {
    return (
      <main className="pub-content co-content">
        <Link className="det-back" href={backHref}>
          ← Back to my programmes
        </Link>
        <section className="co-card">
          <h2>Your tutor collects payments directly</h2>
          <p className="co-card-desc">
            This programme doesn&apos;t take online payment. Pay your tutor the
            way you agreed with them — they&apos;ll record it on your schedule.
          </p>
          <Link className="co-dup-btn" href={backHref}>
            Back to my programmes →
          </Link>
        </section>
      </main>
    );
  }

  // Settled payments so far (own PAID/ACTIVATED programme rows).
  const { count } = await supabase
    .from('nclex_payments')
    .select('payment_id', { count: 'exact', head: true })
    .eq('enrolment_id', enr.enrolment_id)
    .in('purpose', ['PROGRAMME_INITIAL', 'PROGRAMME_INSTALLMENT'])
    .in('status', ['PAID', 'ACTIVATED']);

  const schedule = buildSchedule(snapshot, new Date(enr.enrolled_at), count ?? 0);
  const currency = prog.price_currency as Currency;

  return (
    <main className="pub-content co-content">
      <Link className="det-back" href={backHref}>
        ← Back to my programmes
      </Link>

      <div className="co-head">
        <div>
          <div className="co-head-eyebrow">PROGRAMME PAYMENT</div>
          <h1 className="co-head-title">{prog.title}</h1>
          <div className="co-head-sub">Secured by Paystack</div>
        </div>
      </div>

      {schedule.next ? (
        <InstallmentCheckout
          enrolmentId={enr.enrolment_id}
          programmeTitle={prog.title}
          currency={currency}
          next={{
            enrolmentId: enr.enrolment_id,
            index: schedule.next.index,
            totalPayments: schedule.totalPayments,
            amountMinor: schedule.next.amountMinor,
            currency,
            dueDateIso: schedule.next.dueDate.toISOString(),
            // See the same note in the runner's page.tsx: `react-hooks/purity`
            // treats this as a browser render. It is an async SERVER component
            // — the clock is read once per request, server-side, to decide
            // whether an instalment is overdue.
            // eslint-disable-next-line react-hooks/purity
            isOverdue: schedule.next.dueDate.getTime() < Date.now(),
            graceUntilIso: null,
          }}
          accountEmail={user.email ?? null}
        />
      ) : (
        <section className="co-card">
          <h2>You&apos;re all paid up</h2>
          <p className="co-card-desc">
            Every payment for this programme has been settled — there&apos;s nothing
            left to pay.
          </p>
          <Link className="co-dup-btn" href={backHref}>
            Back to my programmes →
          </Link>
        </section>
      )}
    </main>
  );
}
