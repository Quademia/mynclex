// mynclex/lib/library/analytics/scope-switcher.tsx
//
// The scope switcher control (slice 11.11c, Slice 3c) — re-scopes the
// analytics to All readers / a cohort / Self-paced. URL-driven (?scope=);
// 'all' drops the param for a clean URL.
//
// All readers + Self-paced are quick segmented buttons; the cohorts live
// in a dropdown so the control stays compact however many cohorts a tutor
// has. Client component (the dropdown opens/closes); the options + the
// active key still come from the server read.

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { EmbedScopeMeta, ScopeOption } from './types';

export function ScopeSwitcher({
  scope,
  basePath,
  extraQuery,
}: {
  scope: EmbedScopeMeta;
  basePath: string;
  /** Other params to preserve (e.g. the active tab). */
  extraQuery?: Record<string, string>;
}) {
  const self = scope.options.find((o) => o.key === 'self');
  const cohorts = scope.options.filter(
    (o) => o.key !== 'all' && o.key !== 'self',
  );

  // Nothing to split by → no switcher.
  if (cohorts.length === 0 && !self) return null;

  const hrefFor = (key: string) => {
    const params = new URLSearchParams(extraQuery ?? {});
    if (key !== 'all') params.set('scope', key);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="eqa-scope">
      <span className="eqa-scope-lbl">Scope</span>
      <div className="eqa-scope-seg">
        <Link
          href={hrefFor('all')}
          className={`eqa-scope-btn${
            scope.activeKey === 'all' ? ' is-active' : ''
          }`}
          aria-current={scope.activeKey === 'all' ? 'true' : undefined}
        >
          All readers
        </Link>
        {self && (
          <Link
            href={hrefFor('self')}
            className={`eqa-scope-btn${
              scope.activeKey === 'self' ? ' is-active' : ''
            }`}
            aria-current={scope.activeKey === 'self' ? 'true' : undefined}
          >
            Self-paced
          </Link>
        )}
      </div>
      {cohorts.length > 0 && (
        <CohortDropdown
          cohorts={cohorts}
          activeKey={scope.activeKey}
          hrefFor={hrefFor}
        />
      )}
    </div>
  );
}

function CohortDropdown({
  cohorts,
  activeKey,
  hrefFor,
}: {
  cohorts: ScopeOption[];
  activeKey: string;
  hrefFor: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  const active = cohorts.find((c) => c.key === activeKey) ?? null;

  return (
    <div className="eqa-scope-dd" ref={ref}>
      <button
        type="button"
        className={`eqa-scope-ddbtn${active ? ' is-active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="eqa-scope-ddtxt">{active ? active.label : 'By cohort'}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="eqa-scope-menu" role="menu">
          {cohorts.map((c) => (
            <Link
              key={c.key}
              href={hrefFor(c.key)}
              className={`eqa-scope-menu-item${
                c.key === activeKey ? ' is-active' : ''
              }`}
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
