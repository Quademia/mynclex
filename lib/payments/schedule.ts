// mynclex/lib/payments/schedule.ts
//
// The payment-schedule engine (Slice 7d). One pure function that turns a
// frozen plan snapshot + the enrolment's anchor date + how many payments the
// student has made into the concrete schedule: every payment's position,
// amount, and due-date, plus which one is next and whether they're done.
//
// This is the single source of truth for "what does this student owe and
// when." The student tile, the installment checkout, the auto-unpause check,
// and the tutor surface all read it. The nightly SQL sweep mirrors the SAME
// arithmetic in plpgsql (it can't import TS) — keep the two in lockstep: the
// rules here and the rules in the 7d sweep migration must agree.
//
// Position numbering is 1-based across the whole plan: position 1 is the
// initial payment taken at checkout (full / deposit / installment 1),
// positions 2..N are the later charges. On nclex_payments the initial row is
// PROGRAMME_INITIAL with installment_index NULL (it's implicitly position 1);
// each later PROGRAMME_INSTALLMENT row carries installment_index = its
// position (2..N), per the installment_index_scope CHECK. `paidCount` is just
// the number of ACTIVATED programme payment rows — it doesn't read the index.
//
// Due dates are COMPUTED, never stored: each is the anchor date plus a number
// of days drawn from the plan's rhythm. The anchor is the enrolment date (when
// the first amount was paid) — identical for self-paced and tutored.

import { installmentSplit } from '@/lib/strategies/format';
import type { FrozenStrategySnapshot } from '@/lib/strategies/types';
import type { Currency } from './types';

const MS_PER_DAY = 86_400_000;

function addDays(anchor: Date, days: number): Date {
  return new Date(anchor.getTime() + days * MS_PER_DAY);
}

export type ScheduledPayment = {
  // 1-based position in the plan; also the installment_index on the payment.
  index: number;
  amountMinor: number;
  dueDate: Date;
  // Position 1 — paid at checkout. The others are paid later from the tile.
  isInitial: boolean;
};

export type PaymentSchedule = {
  totalPayments: number;
  paidCount: number;
  // Every position, in order (paid and unpaid alike).
  payments: ScheduledPayment[];
  // The next unpaid position, or null once fully paid.
  next: ScheduledPayment | null;
  isFullyPaid: boolean;
  // Sum of every position — equals the plan's total_price_minor.
  totalMinor: number;
};

// Build the full schedule of positions from the plan's rhythm + anchor.
// Pure shape derivation — no notion of "paid" yet.
function positionsFor(snapshot: FrozenStrategySnapshot, anchor: Date): ScheduledPayment[] {
  switch (snapshot.kind) {
    case 'UPFRONT_FULL':
      return [
        { index: 1, amountMinor: snapshot.total_price_minor, dueDate: anchor, isInitial: true },
      ];

    case 'DEPOSIT_BALANCE': {
      const deposit = snapshot.initial_price_minor;
      const balance = snapshot.total_price_minor - deposit;
      const days = snapshot.balance_due_days_after_enrolment ?? 0;
      return [
        { index: 1, amountMinor: deposit, dueDate: anchor, isInitial: true },
        { index: 2, amountMinor: balance, dueDate: addDays(anchor, days), isInitial: false },
      ];
    }

    case 'EQUAL_INSTALLMENTS': {
      const count = snapshot.installment_count ?? 1;
      const interval = snapshot.installment_interval_days ?? 0;
      const { first, rest } = installmentSplit(snapshot.total_price_minor, count);
      const out: ScheduledPayment[] = [];
      for (let k = 1; k <= count; k += 1) {
        out.push({
          index: k,
          amountMinor: k === 1 ? first : rest,
          dueDate: k === 1 ? anchor : addDays(anchor, (k - 1) * interval),
          isInitial: k === 1,
        });
      }
      return out;
    }
  }
}

// The schedule engine. `paidCount` is how many positions the student has
// already settled — caller derives it from the count of ACTIVATED programme
// payment rows (PROGRAMME_INITIAL + PROGRAMME_INSTALLMENT) for the enrolment.
export function buildSchedule(
  snapshot: FrozenStrategySnapshot,
  anchor: Date,
  paidCount: number
): PaymentSchedule {
  const payments = positionsFor(snapshot, anchor);
  const totalPayments = payments.length;
  const clampedPaid = Math.max(0, Math.min(paidCount, totalPayments));
  const isFullyPaid = clampedPaid >= totalPayments;
  return {
    totalPayments,
    paidCount: clampedPaid,
    payments,
    next: isFullyPaid ? null : payments[clampedPaid],
    isFullyPaid,
    totalMinor: payments.reduce((sum, p) => sum + p.amountMinor, 0),
  };
}

// True when the next unpaid payment's due-date is in the past — i.e. the
// student is behind. The boundary is exclusive: a payment due exactly now is
// not yet overdue. This is the condition the nightly sweep uses to PAUSE.
export function isOverdue(schedule: PaymentSchedule, asOf: Date): boolean {
  return schedule.next != null && schedule.next.dueDate.getTime() < asOf.getTime();
}

// Serialisable view of "what does this student owe next," for the student
// tile / installment checkout / future payments page. Dates cross the
// server→client boundary as ISO strings. null when the plan is fully paid.
export type NextPaymentView = {
  enrolmentId: string;
  index: number;
  totalPayments: number;
  amountMinor: number;
  currency: Currency;
  dueDateIso: string;
  isOverdue: boolean;
  // An active tutor-granted grace deadline (Slice 7d follow-up). When set,
  // the payment is past its original due date but the tutor has deferred the
  // pause to this date, so `isOverdue` is suppressed and the UI shows
  // "extended to <date>" rather than a red "overdue".
  graceUntilIso: string | null;
};

export function nextPaymentView(
  snapshot: FrozenStrategySnapshot,
  enrolledAt: Date,
  paidCount: number,
  currency: Currency,
  enrolmentId: string,
  asOf: Date = new Date(),
  graceUntil: Date | null = null
): NextPaymentView | null {
  const schedule = buildSchedule(snapshot, enrolledAt, paidCount);
  if (!schedule.next) return null;
  const graceActive = graceUntil != null && graceUntil.getTime() > asOf.getTime();
  return {
    enrolmentId,
    index: schedule.next.index,
    totalPayments: schedule.totalPayments,
    amountMinor: schedule.next.amountMinor,
    currency,
    dueDateIso: schedule.next.dueDate.toISOString(),
    // Grace defers the pause, so a graced payment isn't shown as overdue.
    isOverdue: isOverdue(schedule, asOf) && !graceActive,
    graceUntilIso: graceActive ? graceUntil.toISOString() : null,
  };
}
