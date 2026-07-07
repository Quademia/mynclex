// mynclex/lib/bank/packs/pack-strip.tsx
//
// The packs-area pill strip (Slice ②a) — one-click hop between the 5
// fixed packs, per the CD prototype's "tabs" navigation. Viable
// because pack count is small and fixed (the case-wrapper pill-strip
// precedent); if packs ever multiply this falls back to list → detail.
// "Reserved stock" is a disabled placeholder until Slice ③.

import Link from 'next/link';
import type { PackOverview } from './types';

export function PackStrip({
  packs,
  activeId,
}: {
  packs: PackOverview[];
  /** null = the Packs list pill is active. */
  activeId: string | null;
}) {
  return (
    <nav className="rp-strip" aria-label="Readiness packs">
      <Link href="/admin/packs" className={`rp-pill ${activeId === null ? 'active' : ''}`}>
        Packs
      </Link>
      {packs.map((p) => (
        <Link
          key={p.pack_id}
          href={`/admin/packs/${p.pack_id}`}
          className={`rp-pill ${activeId === p.pack_id ? 'active' : ''}`}
        >
          <span
            className={`rp-pill-dot ${p.published ? 'pub' : ''}`}
            title={p.published ? 'Published' : 'Not published'}
          />
          Pack {p.num}
          <span className="rp-pill-sub">{p.count}</span>
        </Link>
      ))}
      <span className="rp-pill soon" title="The reserved-stock lens ships with Slice 3">
        Reserved stock <span className="rp-pill-sub">soon</span>
      </span>
    </nav>
  );
}
