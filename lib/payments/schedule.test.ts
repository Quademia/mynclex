// mynclex/lib/payments/schedule.test.ts
//
// Covers the 7d schedule engine across all three plan kinds, the paid-count
// progression, computed due-dates, the cent-exact installment split, and the
// overdue boundary. The nightly SQL sweep mirrors this arithmetic — if these
// expectations change, the sweep migration must change with them.

import { describe, it, expect } from 'vitest';
import { buildSchedule, isOverdue } from './schedule';
import type { FrozenStrategySnapshot } from '@/lib/strategies/types';

const ANCHOR = new Date('2026-06-01T00:00:00.000Z');
const DAY = 86_400_000;

function snap(over: Partial<FrozenStrategySnapshot>): FrozenStrategySnapshot {
  return {
    strategy_id: 's1',
    kind: 'UPFRONT_FULL',
    label: null,
    total_price_minor: 300000,
    initial_price_minor: 300000,
    installment_count: null,
    installment_interval_days: null,
    balance_due_days_after_enrolment: null,
    frozen_at: ANCHOR.toISOString(),
    ...over,
  };
}

describe('buildSchedule — UPFRONT_FULL', () => {
  it('is a single payment, fully paid once the initial is in', () => {
    const s = buildSchedule(snap({}), ANCHOR, 1);
    expect(s.totalPayments).toBe(1);
    expect(s.payments[0]).toMatchObject({ index: 1, amountMinor: 300000, isInitial: true });
    expect(s.isFullyPaid).toBe(true);
    expect(s.next).toBeNull();
    expect(s.totalMinor).toBe(300000);
  });

  it('never reports overdue (no later positions)', () => {
    const s = buildSchedule(snap({}), ANCHOR, 1);
    expect(isOverdue(s, new Date('2030-01-01T00:00:00Z'))).toBe(false);
  });
});

describe('buildSchedule — DEPOSIT_BALANCE', () => {
  const dep = snap({
    kind: 'DEPOSIT_BALANCE',
    total_price_minor: 320000,
    initial_price_minor: 150000,
    balance_due_days_after_enrolment: 30,
  });

  it('splits into deposit (now) + balance (anchor + N days)', () => {
    const s = buildSchedule(dep, ANCHOR, 1);
    expect(s.totalPayments).toBe(2);
    expect(s.payments[0]).toMatchObject({ index: 1, amountMinor: 150000, isInitial: true });
    expect(s.payments[1]).toMatchObject({ index: 2, amountMinor: 170000, isInitial: false });
    expect(s.payments[1].dueDate.getTime()).toBe(ANCHOR.getTime() + 30 * DAY);
    expect(s.totalMinor).toBe(320000);
  });

  it('after the deposit, the balance is next', () => {
    const s = buildSchedule(dep, ANCHOR, 1);
    expect(s.isFullyPaid).toBe(false);
    expect(s.next?.index).toBe(2);
    expect(s.next?.amountMinor).toBe(170000);
  });

  it('is overdue once the balance due-date has passed and it is unpaid', () => {
    const s = buildSchedule(dep, ANCHOR, 1);
    expect(isOverdue(s, new Date(ANCHOR.getTime() + 29 * DAY))).toBe(false);
    expect(isOverdue(s, new Date(ANCHOR.getTime() + 31 * DAY))).toBe(true);
  });

  it('is never overdue once fully paid', () => {
    const s = buildSchedule(dep, ANCHOR, 2);
    expect(s.isFullyPaid).toBe(true);
    expect(s.next).toBeNull();
    expect(isOverdue(s, new Date('2030-01-01T00:00:00Z'))).toBe(false);
  });
});

describe('buildSchedule — EQUAL_INSTALLMENTS', () => {
  const inst = snap({
    kind: 'EQUAL_INSTALLMENTS',
    total_price_minor: 400000,
    initial_price_minor: 100000,
    installment_count: 4,
    installment_interval_days: 30,
  });

  it('lays out N evenly-spaced positions anchored at enrolment', () => {
    const s = buildSchedule(inst, ANCHOR, 1);
    expect(s.totalPayments).toBe(4);
    expect(s.payments.map((p) => p.amountMinor)).toEqual([100000, 100000, 100000, 100000]);
    expect(s.payments[0].dueDate.getTime()).toBe(ANCHOR.getTime());
    expect(s.payments[1].dueDate.getTime()).toBe(ANCHOR.getTime() + 30 * DAY);
    expect(s.payments[2].dueDate.getTime()).toBe(ANCHOR.getTime() + 60 * DAY);
    expect(s.payments[3].dueDate.getTime()).toBe(ANCHOR.getTime() + 90 * DAY);
  });

  it('advances the next pointer as positions are paid', () => {
    expect(buildSchedule(inst, ANCHOR, 1).next?.index).toBe(2);
    expect(buildSchedule(inst, ANCHOR, 3).next?.index).toBe(4);
    expect(buildSchedule(inst, ANCHOR, 4).next).toBeNull();
  });

  it('flags overdue when the next installment is past due', () => {
    // Paid 1, so installment 2 (due anchor + 30d) is next.
    const s = buildSchedule(inst, ANCHOR, 1);
    expect(isOverdue(s, new Date(ANCHOR.getTime() + 45 * DAY))).toBe(true);
    // Caught up to 2 → installment 3 (due +60d) not yet reached at +45d.
    const s2 = buildSchedule(inst, ANCHOR, 2);
    expect(isOverdue(s2, new Date(ANCHOR.getTime() + 45 * DAY))).toBe(false);
  });

  it('splits cents exactly — the first payment absorbs the remainder', () => {
    const odd = snap({
      kind: 'EQUAL_INSTALLMENTS',
      total_price_minor: 100001,
      initial_price_minor: 25001,
      installment_count: 4,
      installment_interval_days: 30,
    });
    const s = buildSchedule(odd, ANCHOR, 0);
    expect(s.payments.map((p) => p.amountMinor)).toEqual([25001, 25000, 25000, 25000]);
    expect(s.totalMinor).toBe(100001);
  });
});

describe('buildSchedule — guards', () => {
  it('clamps paidCount into range', () => {
    const dep = snap({ kind: 'DEPOSIT_BALANCE', total_price_minor: 200000, initial_price_minor: 100000, balance_due_days_after_enrolment: 14 });
    expect(buildSchedule(dep, ANCHOR, 5).paidCount).toBe(2);
    expect(buildSchedule(dep, ANCHOR, -3).paidCount).toBe(0);
  });

  it('a payment due exactly now is not yet overdue (exclusive boundary)', () => {
    const dep = snap({ kind: 'DEPOSIT_BALANCE', total_price_minor: 200000, initial_price_minor: 100000, balance_due_days_after_enrolment: 10 });
    const s = buildSchedule(dep, ANCHOR, 1);
    expect(isOverdue(s, new Date(ANCHOR.getTime() + 10 * DAY))).toBe(false);
  });
});
