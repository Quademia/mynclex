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
// ⚠ The CSS keys off the width of `.rn` (a container query) while this
// keys off the viewport. In production `.rn` IS the viewport so they
// always agree. They only diverge when the runner is rendered inside a
// narrow frame, where the CSS would go compact and this would not.
// Nothing ships that way today.

'use client';

import { useEffect, useState } from 'react';

export const RN_COMPACT_QUERY = '(max-width: 899px)';

export function useIsCompact(): boolean {
  // Defaults to FALSE so the server and the first client render agree —
  // returning true would be a hydration mismatch on every desktop load.
  // The cost is that a phone paints the desktop tree for one frame before
  // the effect flips it; the CSS masks nearly all of it because the layout
  // itself is container-query-driven.
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(RN_COMPACT_QUERY);
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return compact;
}
