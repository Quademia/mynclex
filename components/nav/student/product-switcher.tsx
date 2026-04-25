// mynclex/components/nav/student/product-switcher.tsx
//
// Topbar two-pill toggle: [Bank] [Programme]. Only rendered inside a
// product space (bank or programme), never on the picker.
//
//   - Programme student → both pills navigate.
//   - Bank-only student → Programme pill opens the upsell modal
//     instead of navigating (marketing nudge, not a hard block).

'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ProgrammeUpsellModal } from './upsell-modal';

export function ProductSwitcher({
  hasProgrammeEnrolment,
}: {
  hasProgrammeEnrolment: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [showModal, setShowModal] = useState(false);

  const inBank = pathname?.startsWith('/student/bank') ?? false;
  const inProgramme = pathname?.startsWith('/student/programme') ?? false;

  function onBankClick() {
    if (!inBank) router.push('/student/bank/dashboard');
  }

  function onProgrammeClick() {
    if (inProgramme) return;
    if (hasProgrammeEnrolment) {
      router.push('/student/programme/overview');
    } else {
      setShowModal(true);
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
      {showModal && <ProgrammeUpsellModal onClose={() => setShowModal(false)} />}
    </>
  );
}
