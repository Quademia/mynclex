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
//
// Progress engine, Slice 3:
//   • `pct` per tab adds a "· NN%" suffix to the label.
//   • `defaultIndex` lets the server tell us which tab to land on
//     when no `?unit=N` is set ("Where I left off" resume-first
//     rule per §6.1). Falls back to 1 if null or out of range.

'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface UnitTabMeta {
  /** 1-based index, matches `?unit=N` */
  index: number;
  /** Short label for the tab — e.g. "Week 1" or "Module 1". */
  label: string;
  /**
   * Progress engine Slice 3 — 0..100 integer of completion in this
   * unit, or null when the unit has no activities. Drives the
   * "· NN%" suffix appended to the label.
   */
  pct?: number | null;
}

interface Props {
  tabs:     UnitTabMeta[];
  children: React.ReactNode;
  /**
   * 1-based default tab when `?unit=N` is not in the URL — the
   * "Where I left off" pick from the server (per §6.1 resume-first).
   * Falls back to 1 when null or out of range. URL state always
   * wins — a user with a `?unit=N` in the address bar stays put.
   */
  defaultIndex?: number | null;
}

export function StudentUnitTabs({
  tabs,
  children,
  defaultIndex = null,
}: Props) {
  const router    = useRouter();
  const pathname  = usePathname();
  const sp        = useSearchParams();

  const fallback =
    defaultIndex !== null &&
    Number.isFinite(defaultIndex) &&
    defaultIndex >= 1 &&
    defaultIndex <= tabs.length
      ? defaultIndex
      : 1;

  const raw    = sp.get('unit');
  const parsed = raw ? parseInt(raw, 10) : fallback;
  const selected =
    Number.isFinite(parsed) && parsed >= 1 && parsed <= tabs.length
      ? parsed
      : fallback;

  // Children should be one node per tab, in the same order as `tabs`.
  // If there's a mismatch, fall through to rendering nothing for
  // out-of-range — defensive only; the server viewer pairs them.
  const sections = React.Children.toArray(children);

  function onPick(index: number) {
    const next = new URLSearchParams(sp.toString());
    // Clean URL when the picked tab matches whatever the current
    // default would resolve to (Slice 3: "Where I left off"; pre-3:
    // always Unit 1). Otherwise the URL pins ?unit=N as an
    // explicit override.
    if (index === fallback) next.delete('unit');
    else                    next.set('unit', String(index));
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
              <span className="student-unit-tab-label">{t.label}</span>
              {t.pct !== null && t.pct !== undefined && (
                <span className="student-unit-tab-pct">· {t.pct}%</span>
              )}
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
