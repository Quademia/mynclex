// mynclex/lib/curriculum/student-unit-tabs.tsx
//
// Slice 10.8 — tabbed presentation of the student curriculum.
// One unit visible at a time, switched via a horizontal tab strip
// at the top. Pure UI restructure — wraps the existing per-unit
// render unchanged.
//
// Receives pre-rendered children (one server-component section per
// unit) and shows only the selected one. The selected index is
// driven by `?unit=N` (1-based) so refresh and direct links
// preserve state.
//
// Server viewer decides when to mount this wrapper:
//   • 0 units → empty message (no tabs)
//   • 1 unit  → render the single unit directly (no tabs)
//   • 2+ units → wrap with this component
//
// Hide-via-CSS over conditional-render: keeps every unit mounted so
// in-progress per-activity UI state (open modal, opened menu) isn't
// destroyed by switching tabs. Cost is negligible — these are
// static activity rows.

'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface UnitTabMeta {
  /** 1-based index, matches `?unit=N` */
  index: number;
  /** Short label for the tab — e.g. "Week 1" or "Module 1". */
  label: string;
}

interface Props {
  tabs:     UnitTabMeta[];
  children: React.ReactNode;
}

export function StudentUnitTabs({ tabs, children }: Props) {
  const router    = useRouter();
  const pathname  = usePathname();
  const sp        = useSearchParams();

  const raw    = sp.get('unit');
  const parsed = raw ? parseInt(raw, 10) : 1;
  const selected =
    Number.isFinite(parsed) && parsed >= 1 && parsed <= tabs.length
      ? parsed
      : 1;

  // Children should be one node per tab, in the same order as `tabs`.
  // If there's a mismatch, fall through to rendering nothing for
  // out-of-range — defensive only; the server viewer pairs them.
  const sections = React.Children.toArray(children);

  function onPick(index: number) {
    const next = new URLSearchParams(sp.toString());
    if (index === 1) next.delete('unit');
    else             next.set('unit', String(index));
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="student-unit-tabs">
      <div
        className="student-unit-tabs-strip"
        role="tablist"
        aria-label="Programme units"
      >
        {tabs.map((t) => {
          const isActive = selected === t.index;
          return (
            <button
              key={t.index}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={
                isActive
                  ? 'student-unit-tab is-active'
                  : 'student-unit-tab'
              }
              onClick={() => onPick(t.index)}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="student-unit-tab-panels">
        {sections.map((node, i) => (
          <div
            key={i}
            role="tabpanel"
            aria-hidden={selected !== i + 1}
            hidden={selected !== i + 1}
          >
            {node}
          </div>
        ))}
      </div>
    </div>
  );
}
