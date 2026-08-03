// mynclex/app/(app)/(focused)/session/[attempt_id]/use-is-compact.ts
//
// "Is the runner in its phone layout?" — the JS half of the mobile layer
// (docs/product-plan/runner-mobile.md).
//
// Almost everything about the phone runner is CSS. This hook exists for
// the handful of decisions CSS genuinely cannot make, because they are
// about WHERE a component renders in the tree, not how it looks:
//   1. <RunnerGrid> inside a sheet rather than in .rn-body   (slice 2)
//   2. <CasePanel>/<TrendPanel> inside a sheet, with a summary
//      card standing in for them in the question column      (slice 4)
//   3. bookmark / calculator / grid actions handed to the ⋯
//      session menu instead of the topbar                    (slice 1)
//
// ⚠ 899px, not 768px. Every other surface in the product breaks at 768
// (CLAUDE.md UI #3), but the runner's own case/trend split needs 924px
// before it can lay out honestly — minmax(380,1fr) + minmax(520,720) +
// 24px gap — so it has to switch earlier than the rest of the app. Keep
// this number in step with runner-mobile.css's container query.
//
// ⚠ THIS HOOK MUST MEASURE `.rn`, NOT THE VIEWPORT — and it used to get
// that wrong. The CSS keys off the width of `.rn` (a container query);
// this file previously used matchMedia, and claimed the two "always
// agree because in production `.rn` IS the viewport". They do not. A
// classic scrollbar sits between them: measured at a 900px viewport,
// matchMedia('(max-width: 899px)') is false while `.rn` is 885px, so
// the container query fires and this hook does not. In that 15px band
// the CSS hid the case panel (`.rn-split > .rn-case { display: none }`)
// while this hook, still reporting "not compact", never rendered the
// <CaseSummaryCard> that stands in for it — so a case question showed
// NO scenario at all. Not clipped: absent. Observing the element itself
// makes the two structurally incapable of disagreeing.

'use client';

import { useEffect, useState } from 'react';

/** The compact ceiling, as a number. Keep in step with runner-mobile.css's
 *  `@container rn (max-width: 899px)` — and with the 900px lower edge of
 *  its tablet-landscape band, which assumes this is where compact ends. */
export const RN_COMPACT_MAX = 899;

/** Kept for the fallback path below, and because it documents the
 *  breakpoint in the same shape the stylesheet writes it. */
export const RN_COMPACT_QUERY = `(max-width: ${RN_COMPACT_MAX}px)`;

export function useIsCompact(): boolean {
  // Defaults to FALSE so the server and the first client render agree —
  // returning true would be a hydration mismatch on every desktop load.
  // The cost is that a phone paints the desktop tree for one frame before
  // the effect flips it; the CSS masks nearly all of it because the layout
  // itself is container-query-driven.
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    // `.rn` is rendered by runner.tsx, the same component that calls this
    // hook, so it exists by the time an effect runs.
    const rn = document.querySelector('.rn');

    if (rn && typeof ResizeObserver !== 'undefined') {
      // contentRect is the content box — the same box a `container-type:
      // size` query measures, so this and the CSS read one number.
      const ro = new ResizeObserver(([entry]) => {
        setCompact(entry.contentRect.width <= RN_COMPACT_MAX);
      });
      ro.observe(rn);
      return () => ro.disconnect();
    }

    // Fallback only: no element to observe, or no ResizeObserver. This is
    // the viewport measurement described above and can disagree with the
    // CSS by the width of a scrollbar.
    const mq = window.matchMedia(RN_COMPACT_QUERY);
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return compact;
}
