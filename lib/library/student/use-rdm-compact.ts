// mynclex/lib/library/student/use-rdm-compact.ts
//
// "Is the note reader in its phone layout?" — the JS half of
// styles/library-read-mobile.css (docs/product-plan/mobile-responsive.md
// → "The library sweep").
//
// Nearly all of read mode is CSS. This exists for the decisions CSS
// cannot make, because they are about WHAT RENDERS rather than how it
// looks: whether opening a note jumps straight to the saved heading
// (desktop) or offers a Resume chip (phone), and closing the Contents
// sheet when the reader stops being compact.
//
// ⚠ MEASURE `.rdm`, NEVER THE VIEWPORT. The CSS is a container query on
// `.rdm`, so a viewport measurement can disagree with it by the width of
// a scrollbar. The runner learned this the expensive way: at a 900px
// viewport `.rn` measures 885px, so the container query fired while
// matchMedia did not, and a case question rendered with no scenario at
// all — not clipped, absent. See use-is-compact.ts for the full account.
// Observing the element makes the two structurally unable to disagree.
// ⚠ 768px, matching library-read-mobile.css's `@container rdm (max-width:
// 768px)` — keep the two in step. ⓘ The CD handoff specified 899, copied
// from the runner, where .rn-split genuinely needs 924px. The reader has
// no split, and with the desktop sidebar open the region is viewport−275,
// so 899 handed phone chrome to every viewport up to 1174px. 768 is also
// the breakpoint CLAUDE.md mandates product-wide; the whole point of this
// sweep is to remove the library's disagreement with it, not move it.

'use client';

import { useEffect, useState } from 'react';

/** Compact ceiling, shared by both library phone layers. Keep in step
 *  with library-read-mobile.css and library-student-mobile.css. */
export const RDM_COMPACT_MAX = 768;

/** One-shot read, for effects that must decide before an observer has
 *  had a chance to fire (the resume-on-open branch). Returns false when
 *  there is nothing to measure, which is the desktop-shaped answer. */
export function isCompactNow(selector: string): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector(selector);
  return !!el && el.getBoundingClientRect().width <= RDM_COMPACT_MAX;
}

export function isRdmCompactNow(): boolean {
  return isCompactNow('.rdm');
}

/** Observe one container's own width. `selector` is the container the
 *  stylesheet queries — `.rdm` for read mode, `.slm` for the list shell.
 *  Same element, same number, so CSS and JS cannot disagree. */
export function useCompactContainer(selector: string): boolean {
  // Defaults FALSE so server and first client render agree — returning
  // true would be a hydration mismatch on every desktop load.
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = document.querySelector(selector);

    if (el && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(([entry]) => {
        setCompact(entry.contentRect.width <= RDM_COMPACT_MAX);
      });
      ro.observe(el);
      return () => ro.disconnect();
    }

    // Fallback only — the viewport measurement warned about above.
    const mq = window.matchMedia(`(max-width: ${RDM_COMPACT_MAX}px)`);
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [selector]);

  return compact;
}

export function useRdmCompact(): boolean {
  return useCompactContainer('.rdm');
}
