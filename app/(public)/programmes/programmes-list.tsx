// mynclex/app/(public)/programmes/programmes-list.tsx
//
// Client half of the discovery list for the cinematic /programmes page:
// filter chips + card grid. The data is the REAL discovery read (fetched
// server-side in page.tsx, passed in); filtering is client-side over the
// already-loaded set. Card states (attribution, delivery mode, "from"
// price, hidden price → "Contact for price", when-label + tone) are all
// derived from the real row — only the styling is the new `.prc-*` skin.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PublicProgramme } from '@/lib/discovery/types';
import {
  initials,
  priceParts,
  tutorAttribution,
  whenLabel,
  lengthLabel,
  accessWindowLabel,
} from '@/lib/discovery/format';

type Filter = 'all' | 'tutor-led' | 'self-paced';

/** Tone for the "when" value — mirrors whenLabel's branches. */
function whenTone(p: PublicProgramme): 'soon' | 'live' | 'dim' | 'ok' {
  if (p.delivery_mode === 'SELF_PACED') return 'ok';
  if (p.next_cohort_start) return 'soon';
  if (p.open_cohort_count > 0) return 'live';
  return 'dim';
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  );
}

function ProgrammeCard({ p }: { p: PublicProgramme }) {
  const selfPaced = p.delivery_mode === 'SELF_PACED';
  const when = whenLabel(p);
  const tone = whenTone(p);
  const { ccy, amount } = priceParts(p.price_currency, p.headline_price_minor);
  const attr = tutorAttribution(p.tutor_profile, p.tutor_name, p.tutor_avatar_url);

  return (
    <Link href={`/programmes/${p.programme_id}`} className="prc-card">
      <div className="prc-card-tutor">
        <span className="prc-avatar">
          {attr.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attr.imageUrl} alt="" />
          ) : (
            initials(attr.initialsSeed)
          )}
        </span>
        <span className="prc-attr">
          By <strong>{attr.primaryName}</strong>
          {attr.secondaryName && <> · with {attr.secondaryName}</>}
        </span>
        <span className={`prc-tag${selfPaced ? ' self-paced' : ''}`}>{selfPaced ? 'SELF-PACED' : 'TUTOR-LED'}</span>
      </div>

      <div className="prc-card-title">{p.title}</div>
      {p.tagline && <div className="prc-card-tagline">{p.tagline}</div>}

      <div className="prc-card-meta">
        <span><CalendarIcon />{lengthLabel(p.length_units, p.unit_label)}</span>
        <span><ClockIcon />{accessWindowLabel(p.access_window_days)} access</span>
      </div>

      <div className="prc-card-price-row">
        <span className={`prc-price${p.show_price_publicly ? '' : ' contact'}`}>
          {p.show_price_publicly ? (
            <>
              {!p.headline_is_upfront && p.headline_price_minor > 0 && <span className="from">from </span>}
              {ccy && <span className="ccy">{ccy}</span>}
              {amount}
            </>
          ) : (
            'Contact for price'
          )}
        </span>
        <span className={`prc-when ${tone}`}>
          <span className="k">{when.k}</span>
          <strong>{when.v}</strong>
        </span>
      </div>
    </Link>
  );
}

export function ProgrammesList({ programmes }: { programmes: PublicProgramme[] }) {
  const [filter, setFilter] = useState<Filter>('all');

  const tutorLed = programmes.filter((p) => p.delivery_mode === 'TUTOR_LED');
  const selfPaced = programmes.filter((p) => p.delivery_mode === 'SELF_PACED');
  const shown = filter === 'tutor-led' ? tutorLed : filter === 'self-paced' ? selfPaced : programmes;

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: programmes.length },
    { key: 'tutor-led', label: 'Tutor-led', count: tutorLed.length },
    { key: 'self-paced', label: 'Self-paced', count: selfPaced.length },
  ];

  return (
    <>
      <div className="prc-list-head prc-reveal">
        <div>
          <div className="prc-eyebrow">Now open</div>
          <h2 className="prc-serif">Find your <em>programme</em></h2>
        </div>
        <div className="prc-list-tools">
          <div className="prc-filters">
            {chips.map((c) => (
              <button key={c.key} type="button" className={`prc-chip${filter === c.key ? ' on' : ''}`} onClick={() => setFilter(c.key)}>
                {c.label} <span className="prc-chip-n">{c.count}</span>
              </button>
            ))}
          </div>
          <span className="prc-shown">{shown.length} of {programmes.length}</span>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="prc-empty">No programmes match this filter yet.</p>
      ) : (
        <div className="prc-grid prc-reveal">
          {shown.map((p) => (
            <ProgrammeCard key={p.programme_id} p={p} />
          ))}
        </div>
      )}
    </>
  );
}
