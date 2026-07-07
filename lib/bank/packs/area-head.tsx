// mynclex/lib/bank/packs/area-head.tsx
//
// The packs area's STICKY header band (title row + pill strip), per
// the CD prototype: it pins to the top of the `.product-content`
// scroll so the pack context (which pack, how full, the pill hops)
// stays visible while a long members list scrolls. Shared by all
// three lenses (list / detail / reserved). `top: 0` sits flush under
// the app topbar — the locked shell's only scroll region is
// .product-content (the library breadcrumb-bar precedent).

import type { ReactNode } from 'react';
import { PackStrip } from './pack-strip';
import type { PackOverview } from './types';

export function PacksAreaHead({
  title,
  right,
  packs,
  activeId,
}: {
  title: string;
  /** Right-hand slot: the meta note (detail/reserved) or the nav buttons (list). */
  right?: ReactNode;
  packs: PackOverview[];
  activeId: string | null;
}) {
  return (
    <div className="rp-sticky-head">
      <div className="rp-sticky-head-inner">
        <header className="bl-page-head rp-area-head">
          <div>
            <div className="bl-eyebrow">
              <span className="bl-surface-chip admin"><span className="dot" />Admin bank</span>
              Readiness packs
            </div>
            <h1 className="bl-page-title">{title}</h1>
          </div>
          {right}
        </header>
        <PackStrip packs={packs} activeId={activeId} />
      </div>
    </div>
  );
}
