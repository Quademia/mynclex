// mynclex/components/nav/student/programme-switcher-trigger.tsx
//
// Slice 10.1 — thin client wrapper used wherever a UI element
// should open the <ProgrammeSwitcherOverlay>. Wraps the trigger
// button + owns the overlay open state. The visual is supplied
// by the parent via `className` + `children` so the trigger
// adapts to its host (picker card, sidebar item, future surfaces).
//
// Topbar Programme pill (ProductSwitcher) does NOT use this
// wrapper — it manages overlay state inline because the pill is
// part of a larger toggle group that needs to coordinate the
// Bank/Programme pill's active state.

'use client';

import { useState } from 'react';
import { ProgrammeSwitcherOverlay } from './programme-switcher-overlay';

export function ProgrammeSwitcherTrigger({
  className,
  ariaLabel,
  children,
}: {
  className?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <ProgrammeSwitcherOverlay open={open} onClose={() => setOpen(false)} />
    </>
  );
}
