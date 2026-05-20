// mynclex/app/(public)/programmes/programmes-list.tsx
//
// Client half of the discovery list: the filter chips + card grid. The
// data is fetched server-side (page.tsx) and passed in; filtering is
// client-side since the full set is already loaded. Single-use — lives
// next to its only caller.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PublicProgramme } from '@/lib/discovery/types';
import {
  initials,
  priceParts,
  tutorAttribution,
  whenLabel,
} from '@/lib/discovery/format';

type Filter = 'all' | 'tutor-led' | 'self-paced';

function ProgrammeCard({ p }: { p: PublicProgramme }) {
  const selfPaced = p.delivery_mode === 'SELF_PACED';
  const when = whenLabel(p);
  const { ccy, amount } = priceParts(p.price_currency, p.price_minor);
  const showPrice = p.show_price_publicly;
  const attr = tutorAttribution(p.tutor_profile, p.tutor_name, p.tutor_avatar_url);

  return (
    <Link href={`/programmes/${p.programme_id}`} className="prog-card">
      <div className="tutor-row">
        <div className="avatar">
          {attr.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attr.imageUrl} alt="" />
          ) : (
            initials(attr.initialsSeed)
          )}
        </div>
        <div className="nm">
          By <strong>{attr.primaryName}</strong>
          {attr.secondaryName && (
            <span className="with"> · with {attr.secondaryName}</span>
          )}
        </div>
        <div className={`delivery-tag${selfPaced ? ' self-paced' : ''}`}>
          {selfPaced ? 'SELF-PACED' : 'TUTOR-LED'}
        </div>
      </div>

      <h2>{p.title}</h2>
      {p.tagline && <p className="desc">{p.tagline}</p>}

      <div className="price-row">
        <div className="price">
          {showPrice ? (
            <>
              {ccy && <span className="ccy">{ccy}</span>}
              {amount}
            </>
          ) : (
            <span className="price-contact">Contact for price</span>
          )}
        </div>
        <div className="when">
          <span className="k">{when.k}</span>
          {when.v}
        </div>
      </div>
    </Link>
  );
}

export function ProgrammesList({
  programmes,
}: {
  programmes: PublicProgramme[];
}) {
  const [filter, setFilter] = useState<Filter>('all');

  const tutorLed = programmes.filter((p) => p.delivery_mode === 'TUTOR_LED');
  const selfPaced = programmes.filter((p) => p.delivery_mode === 'SELF_PACED');

  const shown =
    filter === 'tutor-led'
      ? tutorLed
      : filter === 'self-paced'
        ? selfPaced
        : programmes;

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: programmes.length },
    { key: 'tutor-led', label: 'Tutor-led', count: tutorLed.length },
    { key: 'self-paced', label: 'Self-paced', count: selfPaced.length },
  ];

  return (
    <>
      <div className="disc-filters">
        <div className="left">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`chip${filter === c.key ? ' on' : ''}`}
              onClick={() => setFilter(c.key)}
            >
              {c.label} <span className="count">{c.count}</span>
            </button>
          ))}
        </div>
        <div className="right">
          {shown.length} of {programmes.length}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="disc-empty">No programmes match this filter yet.</p>
      ) : (
        <div className="prog-grid">
          {shown.map((p) => (
            <ProgrammeCard key={p.programme_id} p={p} />
          ))}
        </div>
      )}
    </>
  );
}
