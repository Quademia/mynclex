// mynclex/lib/strategies/format.ts
//
// Display + money helpers for the tutor payment-plan surface.
// Single-currency per programme (every plan inherits the programme's
// price_currency), so the currency is always passed in alongside a
// minor-unit amount.

import type { Currency } from '@/lib/programmes/types';
import type { PaymentStrategy, StrategyKind } from './types';

// "GHS 1,200" / "$30" / "Free". Minor units → major, grouped.
export function formatMoney(currency: Currency, minor: number): string {
  if (minor === 0) return 'Free';
  const major = minor / 100;
  const amount = Number.isInteger(major)
    ? major.toLocaleString('en-US')
    : major.toFixed(2);
  return currency === 'GHS' ? `GHS ${amount}` : `$${amount}`;
}

// System fallback label per kind (used when the tutor leaves the
// optional label blank).
export function systemLabel(kind: StrategyKind): string {
  switch (kind) {
    case 'UPFRONT_FULL':
      return 'Pay in full';
    case 'DEPOSIT_BALANCE':
      return 'Deposit + balance';
    case 'EQUAL_INSTALLMENTS':
      return 'Equal installments';
  }
}

// Tutor's label if set, else the system label.
export function planLabel(s: PaymentStrategy): string {
  const custom = (s.label ?? '').trim();
  return custom.length > 0 ? custom : systemLabel(s.kind);
}

// Equal-installments split. Each installment after the first is
// floor(total / count); the FIRST absorbs the remainder so the sum
// is exactly the total (no lost or invented pesewas/cents). Returns
// the first-payment amount and the size of each remaining payment.
export function installmentSplit(
  total: number,
  count: number
): { first: number; rest: number } {
  const rest = Math.floor(total / count);
  const first = total - rest * (count - 1);
  return { first, rest };
}

// One-line human description of a plan, for the plan card.
export function describePlan(s: PaymentStrategy, currency: Currency): string {
  const money = (m: number) => formatMoney(currency, m);
  switch (s.kind) {
    case 'UPFRONT_FULL':
      return `One payment of ${money(s.total_price_minor)}.`;
    case 'DEPOSIT_BALANCE': {
      const balance = s.total_price_minor - s.initial_price_minor;
      const days = s.balance_due_days_after_enrolment ?? 0;
      return `${money(s.initial_price_minor)} deposit now, then ${money(
        balance
      )} due ${days} day${days === 1 ? '' : 's'} after enrolling. Total ${money(
        s.total_price_minor
      )}.`;
    }
    case 'EQUAL_INSTALLMENTS': {
      const count = s.installment_count ?? 0;
      const interval = s.installment_interval_days ?? 0;
      const { first, rest } = installmentSplit(s.total_price_minor, count);
      const restNote =
        first === rest
          ? `${count} payments of ${money(rest)}`
          : `${money(first)} now, then ${count - 1} × ${money(rest)}`;
      return `${restNote} every ${interval} day${
        interval === 1 ? '' : 's'
      }. Total ${money(s.total_price_minor)}.`;
    }
  }
}
