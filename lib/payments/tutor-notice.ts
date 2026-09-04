// mynclex/lib/payments/tutor-notice.ts
//
// Freezes the facts for "a student paid you" and hands them to the email
// layer. The tutor's half of the same money the receipt reports.
//
// ⭐ WHY A SEPARATE FILE from result.ts, which builds the student's
// receipt: same reason lib/enrolments/enrol-email.ts exists. Each email
// owns its own builder, so an anchor gains ONE call rather than a block
// of lookups. The two share the *anchor*, not the payload — a receipt
// and a roster update are different emails to different people, and
// forcing one builder to produce both would make every future change to
// either one a change to both.
//
// ⭐ A SNAPSHOT, NOT A LOOKUP. Everything is resolved here and frozen, so
// a notification re-read in October still names the cohort the money was
// actually paid into, even if the tutor has since renamed it.
//
// Doc: docs/product-plan/transactional-email.md

import 'server-only';
import { formatCohortName } from '@/lib/cohorts/format';
import { appOrigin } from '@/lib/email/templates/wrapper';
import { enqueueAndSend } from '@/lib/email/send';
import type {
  ReceiptFraming,
  TutorPaymentReceivedPayload,
  TutorPaymentStanding,
} from '@/lib/email/types';
import type { FrozenStrategySnapshot } from '@/lib/strategies/types';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buildSchedule } from './schedule';
import type { Currency } from './types';

/**
 * The tutor's money ledger — every student payment across all their
 * programmes, already filtered to programme fees. Built 2026-06-12 as
 * the single global money surface (no per-programme money pages), which
 * is exactly what this email should open.
 *
 * ⚠ A FUNCTION, not the `const CTA_HREF` that used to sit here. The origin
 * is read from the environment now, and a module-scope read can run before
 * the Worker's env is bound — see appOrigin(). Making the origin dynamic
 * while leaving a constant built FROM it would have baked the fallback in
 * and looked like it worked. (2026-09-04)
 */
function ctaHref(): string {
  return `${appOrigin()}/tutor/payments`;
}
const CTA_LABEL = 'View payments';

/** The only purposes that are the tutor's money. Everything else is ours. */
const PROGRAMME_PURPOSES: string[] = ['PROGRAMME_INITIAL', 'PROGRAMME_INSTALLMENT'];

type PaymentRow = {
  payment_id: string;
  purpose: string;
  programme_id: string | null;
  cohort_id: string | null;
  enrolment_id: string | null;
  installment_index: number | null;
  currency: Currency;
  amount_minor: number;
  email: string;
  user_id: string | null;
  paid_at: string | null;
  collection_channel: 'PAYSTACK' | 'OFF_PLATFORM' | null;
  /** Null when Paystack took the money. Set when a person typed it in. */
  recorded_by_user_id: string | null;
};

const ROW_COLS = `payment_id, purpose, programme_id, cohort_id, enrolment_id,
  installment_index, currency, amount_minor, email, user_id, paid_at,
  collection_channel, recorded_by_user_id`;

/**
 * Tell the programme's tutor that money came in.
 *
 * ⚠ NEVER THROWS, and never blocks the payment. Same rule as the
 * receipt: the money landing outranks telling anyone about it.
 *
 * @param checkoutGroupId the charge — also the email's fingerprint.
 * @param framing         how far the purchase got. The caller knows it;
 *                        it is the outcome the anchor just produced.
 */
export async function sendTutorPaymentNotice(
  checkoutGroupId: string,
  framing: ReceiptFraming
): Promise<void> {
  try {
    const built = await buildTutorPaymentNotice(checkoutGroupId, framing);
    if (!built) return;
    await enqueueAndSend({
      eventKey: 'payment.tutor_received',
      // ⭐ The CHECKOUT, exactly like the receipt — one debit, one
      // notification. Safe as a bare group id with no stage because a
      // checkout can only ever target ONE programme: lib/payments/init.ts
      // refuses any programme that is not ON_PLATFORM and builds items
      // from a single target, so one charge can never owe two tutors an
      // email. If a multi-programme cart is ever built, this fingerprint
      // must gain the tutor id as its stage or the second tutor is
      // silently dropped.
      subjectRef: checkoutGroupId,
      toEmail: built.toEmail,
      toUserId: built.toUserId,
      payload: built.payload as unknown as Record<string, unknown>,
    });
  } catch (e) {
    console.error(
      '[email] tutor payment notice failed for checkout',
      checkoutGroupId,
      (e as Error).message
    );
  }
}

/**
 * Assemble the payload, or null when this payment owes no tutor an
 * email. Exported for the same reason buildPaymentReceiptEmail is: it is
 * the half worth reading in isolation.
 */
export async function buildTutorPaymentNotice(
  checkoutGroupId: string,
  framing: ReceiptFraming
): Promise<{ payload: TutorPaymentReceivedPayload; toEmail: string; toUserId: string } | null> {
  const admin = createServiceRoleClient();

  const { data: payRows, error: rowsErr } = await admin
    .from('nclex_payments')
    .select(ROW_COLS)
    .eq('checkout_group_id', checkoutGroupId);
  // ⚠ Inspect the error, not just the emptiness. A failed read and a
  // bank-only checkout both produce zero programme rows, and only one of
  // them is a reason to stay quiet.
  if (rowsErr) {
    console.error('[email] tutor notice: payment read failed:', rowsErr.message);
    return null;
  }

  const rows = ((payRows ?? []) as PaymentRow[]).filter((r) =>
    PROGRAMME_PURPOSES.includes(r.purpose)
  );
  // Bank or readiness only. QAcademy's money — no tutor is involved.
  if (rows.length === 0) return null;

  const first = rows[0];
  if (!first.programme_id) return null;

  const { data: prog, error: progErr } = await admin
    .from('nclex_programmes')
    .select('programme_id, title, tutor_id')
    .eq('programme_id', first.programme_id)
    .maybeSingle();
  if (progErr) console.error('[email] tutor notice: programme read failed:', progErr.message);
  // The subject line IS the programme name. Without one there is no
  // email to write, and a silent return here is the defect the enrolment
  // email had on 2026-08-12 — so it says why.
  if (!prog?.title?.trim()) {
    console.error('[email] tutor notice: no programme title for checkout', checkoutGroupId);
    return null;
  }

  // ─── the suppression rule ──────────────────────────────────────────
  // ⭐⭐ THE RECIPIENT MUST NOT BE THE ACTOR (settled with Sam,
  // 2026-08-19). The catalog said this fires on "Paystack success OR
  // tutor mark-paid", both anchors. Read against the code that is wrong
  // twice over: a tutor who hits "Mark paid", and a tutor who records
  // "payments already received" while adding a student, is being emailed
  // a fact they typed in thirty seconds ago. The first noisy
  // transactional email is how people start ignoring the rest.
  //
  // ⭐ But it is NOT "skip the mark-paid anchor". A SUPER_ADMIN may
  // record a payment on a tutor's programme (the ownership gate in
  // lib/enrolments/actions.ts permits it), and there it IS news. So the
  // test is who recorded it, not which door it came through.
  //
  // ⭐ Reading recorded_by_user_id off the ROW rather than taking it as
  // an argument is deliberate: the rule lives in one place and no anchor
  // can get it wrong by forgetting to pass it. Paystack leaves the
  // column null, so an online payment always sends.
  //
  // ⚠ Consequence, and it is intended: a tutor running an OFF_PLATFORM
  // programme — they collect the cash by hand and add the students —
  // receives none of these at all. Correct. They are holding the money.
  if (first.recorded_by_user_id && first.recorded_by_user_id === prog.tutor_id) return null;

  const { data: tutor, error: tutorErr } = await admin
    .from('nclex_users')
    .select('id, email, forename, name')
    .eq('id', prog.tutor_id)
    .maybeSingle();
  if (tutorErr) console.error('[email] tutor notice: tutor read failed:', tutorErr.message);
  if (!tutor?.email) {
    console.error('[email] tutor notice: no address for tutor', prog.tutor_id);
    return null;
  }

  // ─── who paid ──────────────────────────────────────────────────────
  // The address is what we always have. The name is a lookup that
  // legitimately comes back empty for a pay-first buyer, who has no
  // profile row until she finishes /welcome.
  const studentEmail = first.email;
  const { data: student } = await admin
    .from('nclex_users')
    .select('name, forename')
    .ilike('email', studentEmail.trim().toLowerCase())
    .maybeSingle();
  const studentName =
    (student?.name as string | null)?.trim() ||
    (student?.forename as string | null)?.trim() ||
    studentEmail;

  // ─── the plan ──────────────────────────────────────────────────────
  const enrolmentId = rows.find((r) => r.enrolment_id)?.enrolment_id ?? null;
  const { data: enr } = enrolmentId
    ? await admin
        .from('nclex_enrolments')
        .select('enrolment_id, status, paused_reason, cohort_id, enrolled_at, strategy_snapshot_json')
        .eq('enrolment_id', enrolmentId)
        .maybeSingle()
    : { data: null };
  const enrolment = enr as Enrolment | null;

  // ⚠ The cohort comes from the ENROLMENT first. A PROGRAMME_INSTALLMENT
  // row carries cohort_id = NULL by the cohort_scope CHECK, so reading
  // only the payment row loses the cohort on every instalment — the same
  // trap that produced "Enrolled in Payment 2 of 4" on the receipt.
  const cohortId = enrolment?.cohort_id ?? first.cohort_id ?? null;
  const cohortName = cohortId ? await readCohortName(admin, cohortId) : null;

  const standing = await readStanding(admin, enrolment);

  // ─── the payload ───────────────────────────────────────────────────
  // The programme lines of this checkout, and nothing else. A bank
  // add-on bought in the same breath is QAcademy's money.
  const amountMinor = rows.reduce((sum, r) => sum + r.amount_minor, 0);

  return {
    toEmail: tutor.email as string,
    toUserId: tutor.id as string,
    payload: {
      framing,
      tutorName:
        (tutor.forename as string | null)?.trim() ||
        ((tutor.name as string | null)?.trim().split(' ')[0] ?? null),
      studentName,
      studentEmail,
      programmeTitle: prog.title.trim(),
      cohortName,
      currency: first.currency,
      amountMinor,
      paidAtISO: first.paid_at ?? new Date().toISOString(),
      method: paymentMethod(first),
      planPosition: planPosition(rows, standing),
      standing,
      ctaHref: ctaHref(),
      ctaLabel: CTA_LABEL,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createServiceRoleClient>;

/** The enrolment facts this email needs. Read once, used by two readers. */
type Enrolment = {
  enrolment_id: string;
  status: string;
  /** 'INSTALLMENT_OVERDUE' | 'TUTOR_MANUAL' | null. */
  paused_reason: string | null;
  cohort_id: string | null;
  enrolled_at: string;
  strategy_snapshot_json: FrozenStrategySnapshot | null;
};

/**
 * How to describe the way this money arrived.
 *
 * ⚠ THE OFF_PLATFORM SPLIT IS NOT HYPOTHETICAL. Dev holds six settled
 * programme payments with `collection_channel = 'OFF_PLATFORM'` and NO
 * `recorded_by_user_id` (checked 2026-08-19) — rows written before that
 * column was populated. Today's Mark-paid always stamps a recorder, so
 * nothing new lands there, but reading the channel alone would tell a
 * tutor "a Quademia admin recorded this" about six payments where
 * nobody can say who did. On money, say less rather than more.
 *
 * ⓘ By the time this runs, a recorder who IS the tutor has already been
 * turned away, so a named recorder can only be somebody else.
 */
function paymentMethod(row: PaymentRow): 'CARD' | 'ADMIN_RECORDED' | 'OFF_PLATFORM' {
  if (row.collection_channel !== 'OFF_PLATFORM') return 'CARD';
  return row.recorded_by_user_id ? 'ADMIN_RECORDED' : 'OFF_PLATFORM';
}

async function readCohortName(admin: AdminClient, cohortId: string): Promise<string | null> {
  const { data } = await admin
    .from('nclex_cohorts')
    .select('cohort_id, name, start_date, end_date')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (!data) return null;
  return formatCohortName(data as { name: string | null; start_date: string; end_date: string });
}

/**
 * Where the plan stands now that this payment is in.
 *
 * ⭐ Read from the enrolment's FROZEN snapshot through buildSchedule —
 * the same engine the nightly sweep uses to decide who gets paused. A
 * tutor must never be quoted a schedule the sweep disagrees with, and a
 * second copy of the arithmetic is how that eventually happens.
 *
 * ⓘ Null is a legitimate answer, not a gap: a pay-first buyer has no
 * enrolment yet, and an enrolment with no snapshot has no plan to stand
 * anywhere in.
 */
async function readStanding(
  admin: AdminClient,
  enrolment: Enrolment | null
): Promise<TutorPaymentStanding | null> {
  if (!enrolment?.strategy_snapshot_json) return null;

  // Counted AFTER the anchor recorded this payment, so this one is
  // included — which is what makes "remaining" the figure the tutor
  // wants: what is still owed, not what was owed a moment ago.
  const { count } = await admin
    .from('nclex_payments')
    .select('payment_id', { count: 'exact', head: true })
    .eq('enrolment_id', enrolment.enrolment_id)
    .in('purpose', PROGRAMME_PURPOSES)
    .in('status', ['PAID', 'ACTIVATED']);

  const schedule = buildSchedule(
    enrolment.strategy_snapshot_json,
    new Date(enrolment.enrolled_at),
    count ?? 0
  );
  const remainingMinor = schedule.payments
    .slice(schedule.paidCount)
    .reduce((sum, p) => sum + p.amountMinor, 0);

  return {
    remainingMinor,
    nextDueISO: schedule.next?.dueDate.toISOString() ?? null,
    paidCount: schedule.paidCount,
    totalPayments: schedule.totalPayments,
    // ⭐ Both answered HERE, at the moment the money moved, and frozen.
    // See the note on TutorPaymentStanding for why the template must
    // not ask these questions itself.
    nextDueOverdue: schedule.next ? schedule.next.dueDate.getTime() < Date.now() : false,
    // ⚠ Read AFTER the anchor has done its auto-unpause, so a payment
    // that DID catch her up reports false — which is the whole point.
    // Arrears only: a TUTOR_MANUAL pause is not this payment's business.
    accessPausedForArrears:
      enrolment.status === 'PAUSED' && enrolment.paused_reason === 'INSTALLMENT_OVERDUE',
  };
}

/**
 * "Payment 2 of 4" · "Paid in full".
 *
 * ⓘ The denominator comes from the schedule `readStanding` already
 * built, NOT from a second read of the strategy row. The live strategy
 * can be edited after enrolment; the frozen snapshot is what the student
 * actually owes, and two readers of the same number is how they
 * eventually disagree.
 *
 * ⓘ A DEPOSIT_BALANCE plan renders "Payment 1 of 2" rather than
 * "Deposit" — the receipt uses the word because the student knows what
 * she chose, whereas the tutor is scanning many payments across many
 * plans and the position is what tells them where this one sits.
 *
 * Falls back to the bare index when there is no plan to count against
 * (a pay-first buyer, who has no enrolment yet): a partial truth beats a
 * wrong denominator.
 */
function planPosition(rows: PaymentRow[], standing: TutorPaymentStanding | null): string | null {
  // ⚠ The HIGHEST index, not the first row's. One group can carry
  // several positions — "payments already received" backfills every
  // settled position at once (lib/enrolments/actions.ts) — and the
  // furthest one is where the plan has actually reached. Reading
  // rows[0] would report "Payment 1 of 4" beside a total covering two.
  const indices = rows
    .map((r) => r.installment_index)
    .filter((n): n is number => typeof n === 'number');
  const index =
    indices.length > 0
      ? Math.max(...indices)
      : rows.some((r) => r.purpose === 'PROGRAMME_INITIAL')
        ? 1
        : null;
  if (index == null) return null;

  if (!standing) return `Payment ${index}`;
  // A one-position plan is UPFRONT_FULL — "Payment 1 of 1" says less
  // than the thing it means.
  if (standing.totalPayments === 1) return 'Paid in full';
  return `Payment ${index} of ${standing.totalPayments}`;
}
