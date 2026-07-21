// mynclex/lib/products/bank-includes.ts
//
// Single source of truth for the "what a bank pass includes" bullet list.
// Both the public plan card (/bank-access) and the bank checkout page render
// from this, so their wording can never drift — a change to how CAT exams or
// readiness packs are phrased happens in one place.
//
// Data only — no JSX. Each surface owns its own markup/classes (bkc-* on the
// public landing, co-* on checkout); this owns the copy and the tone.

/** plain = a flat feature line; credit = a positive highlight (you get this);
 *  muted = a dimmed "you don't get this" line. */
export type BankIncludeTone = 'plain' | 'credit' | 'muted';

export interface BankInclude {
  key:   string;
  label: string;
  tone:  BankIncludeTone;
}

/**
 * The inclusion bullets for a bank pass. Duration/price aren't here — those
 * are shown separately (the card's day header, the checkout's line item).
 *
 * CAT (§15.5): null = unlimited (a selling point → credit), a positive N =
 * that many, 0 = none (muted). Readiness mirrors the same shape.
 */
export function bankPlanIncludes(opts: {
  catAllowance:     number | null;
  readinessCredits: number;
}): BankInclude[] {
  const { catAllowance, readinessCredits } = opts;

  const items: BankInclude[] = [
    { key: 'bank',  label: 'Full question bank',    tone: 'plain' },
    { key: 'modes', label: 'Practice & exam modes', tone: 'plain' },
  ];

  if (catAllowance === null) {
    items.push({ key: 'cat', label: 'Unlimited CAT exams', tone: 'credit' });
  } else if (catAllowance === 0) {
    items.push({ key: 'cat', label: 'No CAT exams', tone: 'muted' });
  } else {
    items.push({
      key: 'cat',
      label: `${catAllowance} CAT exam${catAllowance === 1 ? '' : 's'} included`,
      tone: 'credit',
    });
  }

  if (readinessCredits > 0) {
    items.push({
      key: 'readiness',
      label: `${readinessCredits} readiness pack${readinessCredits === 1 ? '' : 's'} included`,
      tone: 'credit',
    });
  } else {
    items.push({ key: 'readiness', label: 'No readiness packs', tone: 'muted' });
  }

  return items;
}
