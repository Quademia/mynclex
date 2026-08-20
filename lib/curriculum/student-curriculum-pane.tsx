// mynclex/lib/curriculum/student-curriculum-pane.tsx
//
// Student curriculum — two-pane master/detail (2026-06 redesign, CD
// "Student Curriculum"). Replaces the old horizontal <StudentUnitTabs>
// strip. A left UNIT RAIL (status + progress per unit) and a right
// DETAIL pane showing the selected unit's activities. One unit visible
// at a time, same as the tabs — just a richer presentation.
//
// "Unit" is the generic; the programme picks the word. Tutor-led cohorts
// label units WEEK, self-paced programmes label them MODULE, and the rail
// items arrive already carrying it ("Week 1" / "Module 1"). The back link
// and the rail's spoken names derive the plural from those labels rather
// than hardcoding one — see `unitsLabel` below.
//
// Selected unit rides the existing `?unit=N` URL state (1-based), so
// refresh + deep links preserve position. Desktop always shows BOTH
// panes (the right pane defaults to "where I left off"); switching is a
// rail click.
//
// Mobile (≤768px) — DRILL-IN (per the 2026-06-21 design call; CD's
// horizontal week-strip was rejected as cramped on a phone). The
// PRESENCE of `?unit` is the "entered a unit" signal:
//   • no `?unit`  → show the unit LIST (rail full-width), detail hidden.
//   • `?unit=N`   → show that unit's DETAIL full-width + a "← Weeks" /
//                   "← Modules" back link; rail hidden.
// The desktop/mobile switch is pure CSS (the `is-entered` class + the
// ≤768 media block in styles/student-curriculum.css); this component
// just owns the class + the URL transitions. Because we enter with a
// history push, the phone's own back button returns to the list too.
//
// Children = one server-rendered <UnitSection> per unit, in unit order
// (the server viewer pairs them with `rail`). All sections stay mounted
// (hidden via the `hidden` attr) so in-progress per-activity UI state
// survives a unit switch — same reasoning as the old tabs wrapper.

'use client';

import React, { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface RailUnit {
  /** 1-based index, matches `?unit=N`. */
  index: number;
  /** Short label — "Week 1" / "Module 1". */
  label: string;
  /** Unit title (already formatted). */
  title: string;
  /** 0..100 completion, or null when the unit has no activities. */
  pct: number | null;
  /**
   * Rail status badge:
   *   done    — 100% complete (✓)
   *   up-next — holds the programme's "Up next" activity (and not 100%)
   *   locked  — has activities but none currently OPEN (🔒)
   *   open    — in progress / not started, or empty unit (no badge)
   */
  status: 'done' | 'up-next' | 'locked' | 'open';
}

interface Props {
  rail: RailUnit[];
  children: React.ReactNode;
  /**
   * 1-based default unit when `?unit=N` is absent — the "where I left
   * off" pick from the server. Falls back to 1 when null / out of range.
   * Drives only the DESKTOP right pane; mobile defaults to the list.
   */
  defaultIndex?: number | null;
}

export function StudentCurriculumPane({
  rail,
  children,
  defaultIndex = null,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const fallback =
    defaultIndex !== null &&
    Number.isFinite(defaultIndex) &&
    defaultIndex >= 1 &&
    defaultIndex <= rail.length
      ? defaultIndex
      : 1;

  const rawUnit = sp.get('unit');
  // Mobile drill-in: an explicit `?unit` means the student has entered a
  // week. Desktop ignores this (always shows both panes).
  const entered = rawUnit !== null;
  const parsed = rawUnit ? parseInt(rawUnit, 10) : fallback;
  const selected =
    Number.isFinite(parsed) && parsed >= 1 && parsed <= rail.length
      ? parsed
      : fallback;

  const sections = React.Children.toArray(children);

  const detailScrollRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);

  // Land at the top of the detail when the selected unit changes
  // (desktop has its own detail scroll; mobile scrolls the page).
  useEffect(() => {
    if (detailScrollRef.current) detailScrollRef.current.scrollTop = 0;
  }, [selected]);

  function selectUnit(index: number) {
    const params = new URLSearchParams(sp.toString());
    // First selection (from the no-`?unit` state) pushes so the phone's
    // back button returns to the list; switching between weeks replaces
    // so desktop doesn't accumulate a history entry per click.
    const entering = !params.has('unit');
    params.set('unit', String(index));
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (entering) router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
    // Mobile: bring the detail into view as it replaces the list.
    paneRef.current?.scrollIntoView({ block: 'start' });
  }

  function backToList() {
    const params = new URLSearchParams(sp.toString());
    params.delete('unit');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    paneRef.current?.scrollIntoView({ block: 'start' });
  }

  // The rail's own labels already carry the programme's unit noun — "Week 1"
  // on a tutor-led cohort, "Module 1" on a self-paced one — so the heading can
  // be derived from data the component already has, with no new prop threaded
  // through every caller.
  //
  // ⚠ This is why it mattered: the back link below is `display: none` on
  // desktop and only appears in the phone drill-in, so a self-paced student
  // was the only person who could see it, and it told her "← Weeks" while
  // every other word on the page said Module.
  //
  // `+ 's'` is safe because the noun is not free text: nclex_programmes has
  // CHECK (unit_label IN ('WEEK','MODULE')). A third value would need a
  // migration, which is the moment to revisit this.
  const unitNoun = rail[0]?.label.trim().split(/\s+/)[0] ?? 'Unit';
  const unitsLabel = `${unitNoun}s`;

  return (
    <div className={'scp' + (entered ? ' is-entered' : '')} ref={paneRef}>
      <aside className="scp-rail" aria-label={unitsLabel}>
        <div className="scp-rail-list" role="tablist" aria-label={unitsLabel}>
          {rail.map((u) => {
            const isActive = u.index === selected;
            return (
              <button
                key={u.index}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={'scp-rail-item' + (isActive ? ' is-active' : '')}
                onClick={() => selectUnit(u.index)}
              >
                <span className="scp-rail-item-top">
                  <span className="scp-rail-item-label">{u.label}</span>
                  {u.status === 'done' && (
                    <span className="scp-rail-flag is-done">✓ Done</span>
                  )}
                  {u.status === 'up-next' && (
                    <span className="scp-rail-flag is-up-next">Up next</span>
                  )}
                  {u.status === 'locked' && (
                    <span
                      className="scp-rail-flag is-locked"
                      title="Opens later"
                      aria-label="Locked"
                    >
                      🔒
                    </span>
                  )}
                </span>
                <span className="scp-rail-item-title">{u.title}</span>
                <span className="scp-rail-item-prog">
                  <span className="scp-rail-bar">
                    <span
                      className="scp-rail-bar-fill"
                      style={{ width: `${u.pct ?? 0}%` }}
                    />
                  </span>
                  <span className="scp-rail-pct">
                    {u.pct == null ? '—' : `${u.pct}%`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="scp-detail">
        <button type="button" className="scp-back" onClick={backToList}>
          ← {unitsLabel}
        </button>
        <div className="scp-detail-scroll" ref={detailScrollRef}>
          {sections.map((node, i) => (
            <div
              key={i}
              role="tabpanel"
              hidden={selected !== i + 1}
              aria-hidden={selected !== i + 1}
            >
              {node}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
