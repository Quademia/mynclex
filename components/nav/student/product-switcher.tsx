// mynclex/components/nav/student/product-switcher.tsx
//
// Topbar two-pill toggle: [Bank] [Programme]. Only rendered inside
// a product space (bank or programme), never on the picker.
//
//   - Bank pill — always navigates to /student/bank/dashboard
//     when not already in Bank.
//   - Programme pill (Slice 10.1) — opens the
//     <ProgrammeSwitcherOverlay> regardless of current context.
//     Click from Bank → switch into a programme. Click from
//     inside Programme A → switch to Programme B (or stay).
//     Always-overlay behaviour: predictable, students don't have
//     to remember when it routes vs when it opens.
//   - Bank-only student (hasProgrammeEnrolment=false) → Programme
//     pill opens the upsell modal instead.

'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ProgrammeUpsellModal } from './upsell-modal';
import { ProgrammeSwitcherOverlay } from './programme-switcher-overlay';

export function ProductSwitcher({
  hasProgrammeEnrolment,
}: {
  hasProgrammeEnrolment: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [showUpsell, setShowUpsell] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);

  const inBank = pathname?.startsWith('/student/bank') ?? false;
  // Programme space spans two URL roots after slice 10.1's
  // overlay refactor: the per-programme detail tree and the
  // cohort sibling tree. The dropped /student/programmes route
  // is no longer part of the space.
  const inProgramme =
    pathname?.startsWith('/student/programme/') ||
    pathname?.startsWith('/student/cohort/') ||
    false;

  function onBankClick() {
    if (!inBank) router.push('/student/bank/dashboard');
  }

  function onProgrammeClick() {
    if (hasProgrammeEnrolment) {
      setShowSwitcher(true);
    } else {
      setShowUpsell(true);
    }
  }

  return (
    <>
      <div className="product-switcher" role="group" aria-label="Product switcher">
        <button
          type="button"
          className={inBank ? 'switcher-pill active' : 'switcher-pill'}
          aria-current={inBank ? 'page' : undefined}
          onClick={onBankClick}
        >
          Bank
        </button>
        <button
          type="button"
          className={inProgramme ? 'switcher-pill active' : 'switcher-pill'}
          aria-current={inProgramme ? 'page' : undefined}
          onClick={onProgrammeClick}
        >
          Programme
        </button>
      </div>
      {showUpsell && (
        <ProgrammeUpsellModal onClose={() => setShowUpsell(false)} />
      )}
      <ProgrammeSwitcherOverlay
        open={showSwitcher}
        onClose={() => setShowSwitcher(false)}
      />
    </>
  );
}
