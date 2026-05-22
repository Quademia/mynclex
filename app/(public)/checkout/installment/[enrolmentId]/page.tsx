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

  // RLS scopes this to the caller's own enrolments — others' ids 404.
  const { data: enr } = await supabase
    .from('nclex_enrolments')
    .select('enrolment_id, programme_id, status, enrolled_at, strategy_snapshot_json')
    .eq('enrolment_id', enrolmentId)
    .maybeSingle();
  if (!enr) notFound();

  const backHref = '/student/picker';
  // Only an active-ish enrolment with a frozen plan can take a payment.
  const snapshot = enr.strategy_snapshot_json as FrozenStrategySnapshot | null;
  if (!['ENROLLED', 'PAUSED'].includes(enr.status) || !snapshot) redirect(backHref);

  const { data: prog } = await supabase
    .from('nclex_programmes')
    .select('title, price_currency')
    .eq('programme_id', enr.programme_id)
    .maybeSingle();
  if (!prog) notFound();

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
            isOverdue: schedule.next.dueDate.getTime() < Date.now(),
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
