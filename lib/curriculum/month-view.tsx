// mynclex/lib/curriculum/month-view.tsx
//
// Curriculum "Month" view — the SHARED, presentational schedule grid
// (Claude Design "Monthly Curriculum View", Variant B "Programme
// schedule"; concept-not-source). A second, additive lens on a cohort's
// curriculum: the SAME activities the list/two-pane shows, re-drawn on a
// timeline — weeks down the side, days across.
//
//   Month band   ──  "AUGUST 2027" divider at each new calendar month
//   Week row     ──  left label ("Week 1") + day-groups
//   Day-group    ──  only days that actually carry activities ("Mon 2"),
//                    today accented; chips stacked underneath
//   Chip         ──  type-coloured, icon + title, with per-audience tags
//
// This file is audience-agnostic: it renders a normalised `MonthWeek[]`
// and is reused by both the tutor cohort-curriculum (Slice 1 — verb
// "inspect", chip click jumps back to the list to edit) and the student
// curriculum (Slice 2 — verb "do", chip taps to launch). Each audience
// builds the `MonthWeek[]` from its own data (the tutor adapter lives in
// lib/cohorts/month-model.ts) and passes the right interaction prop.
//
// Cohort-only by nature — it's driven entirely by per-cohort dates, so
// callers only mount it in a cohort context (self-paced has no timeline).

'use client';

import React, { Fragment } from 'react';
import { ACTIVITY_TYPE_ICON } from './format';
import type { ActivityType } from './types';

// ── Normalised model ────────────────────────────────────────────────

export type MonthChipVariant =
  | 'normal' // included / available
  | 'excluded' // tutor only — greyed, struck through
  | 'done' // student only — green ✓
  | 'up-next' // student only — the single forward pointer
  | 'locked'; // student only — greyed, not yet open

export type MonthChip = {
  /** activity_id — stable key + launch target. */
  id: string;
  /** The activity's unit — lets the tutor "jump to this week" in the list. */
  unitId: string;
  type: ActivityType;
  title: string;
  /** "B1" / "B2" when the activity sits in a block; null for loose. Tutor only. */
  blockRef: string | null;
  variant: MonthChipVariant;
  /** Show a "due" tag (a due date is set on this activity). */
  due: boolean;
  /** Faint "not dated yet" cue — the chip sits on a computed default day. */
  undated: boolean;
};

export type MonthDayGroup = {
  /** ISO date (YYYY-MM-DD) — group key + sort. */
  key: string;
  /** "Mon 2". */
  dateLabel: string;
  isToday: boolean;
  chips: MonthChip[];
};

export type MonthWeek = {
  /** unit_id. */
  key: string;
  /** "Week 1" / "Module 1". */
  label: string;
  /** "AUGUST 2027" on the first week of a new month, else null. */
  monthBand: string | null;
  dayGroups: MonthDayGroup[];
  /** Student only (Slice 2) — per-week completion for the rail bar. */
  progressPct?: number | null;
  /** Student only (Slice 2) — drives the left-border state. */
  state?: 'done' | 'current' | 'locked';
};

// ── Type → colour family (legend groups) ────────────────────────────

const CHIP_FAMILY: Record<ActivityType, string> = {
  ONLINE_LIVE_SESSION: 'live',
  PRACTICE_QUIZ: 'quiz',
  MOCK: 'mock',
  LIBRARY_NOTE: 'note',
  SHELF: 'shelf',
  TEXT: 'content',
  PDF: 'content',
  EXTERNAL_LINK: 'content',
};

// ── Date helpers (shared with the adapters) ─────────────────────────
// Parse YYYY-MM-DD at local noon so day arithmetic never rolls a TZ
// boundary. All placement maths are day-granular.

const MON = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function isoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "Aug 2" — short month + day, no leading zero. */
export function shortDate(d: Date): string {
  return `${MON[d.getMonth()]} ${d.getDate()}`;
}

/** "Mon 2" — day-of-week + date. */
export function dayGroupLabel(d: Date): string {
  return `${DOW[d.getDay()]} ${d.getDate()}`;
}

/** "AUG 2027" — month band divider. */
export function monthBandLabel(d: Date): string {
  return `${MON[d.getMonth()].toUpperCase()} ${d.getFullYear()}`;
}

/** Today at local noon — for isToday comparisons (client render). */
export function todayLocal(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0, 0);
}

// ── Legend ──────────────────────────────────────────────────────────

const TUTOR_LEGEND: Array<{ cls: string; label: string }> = [
  { cls: 'live', label: 'Live' },
  { cls: 'quiz', label: 'Quiz' },
  { cls: 'mock', label: 'Mock' },
  { cls: 'note', label: 'Note' },
  { cls: 'content', label: 'Content' },
  { cls: 'excluded', label: 'Excluded' },
];

const STUDENT_LEGEND: Array<{ cls: string; label: string }> = [
  { cls: 'done', label: 'Done' },
  { cls: 'live', label: 'Live' },
  { cls: 'quiz', label: 'Quiz / Mock' },
  { cls: 'note', label: 'Note' },
  { cls: 'locked', label: 'Locked' },
];

// ── Component ────────────────────────────────────────────────────────

interface Props {
  weeks: MonthWeek[];
  /** "Aug 2 → Sep 26 · 8 weeks". */
  rangeLabel: string;
  audience: 'tutor' | 'student';
  /**
   * Tutor (Slice 1) — chip click jumps to that activity's week in the
   * list view to edit it. Omitted for the student.
   */
  onChipClick?: (chip: MonthChip) => void;
  /**
   * Student (Slice 2) — wrap a chip in its own launch trigger. Receives
   * the shared chip skin (`className` + `inner`); returns the clickable
   * element (e.g. an <ActivityAction> chip). When provided it wins over
   * `onChipClick`. Locked/closed chips are rendered plain by the caller.
   */
  renderChip?: (args: {
    chip: MonthChip;
    className: string;
    inner: React.ReactNode;
  }) => React.ReactNode;
}

export function CurriculumMonthView({
  weeks,
  rangeLabel,
  audience,
  onChipClick,
  renderChip,
}: Props) {
  const legend = audience === 'tutor' ? TUTOR_LEGEND : STUDENT_LEGEND;

  return (
    <div className="cmv">
      <div className="cmv-band">
        <div className="cmv-band-head">
          <span className="cmv-band-title">Programme schedule</span>
          <span className="cmv-band-range">{rangeLabel}</span>
        </div>
        <div className="cmv-legend">
          {legend.map((l) => (
            <span key={l.cls} className="cmv-legend-item">
              <span className={`cmv-legend-sw is-${l.cls}`} aria-hidden="true" />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      <div className="cmv-scroll">
        {weeks.map((w) => (
          <Fragment key={w.key}>
            {w.monthBand && <div className="cmv-monthband">{w.monthBand}</div>}
            <div
              className={
                'cmv-week' + (w.state ? ` is-${w.state}` : '')
              }
            >
              <div className="cmv-week-label">
                <span className="cmv-week-num">{w.label}</span>
                {audience === 'student' && w.progressPct != null && (
                  <span className="cmv-week-bar" aria-hidden="true">
                    <span
                      className="cmv-week-bar-fill"
                      style={{ width: `${w.progressPct}%` }}
                    />
                  </span>
                )}
              </div>

              <div className="cmv-daygroups">
                {w.dayGroups.length === 0 ? (
                  <span className="cmv-week-empty">
                    No scheduled activities
                  </span>
                ) : (
                  w.dayGroups.map((dg) => (
                    <div key={dg.key} className="cmv-daygroup">
                      <span
                        className={
                          'cmv-daylabel' + (dg.isToday ? ' is-today' : '')
                        }
                      >
                        {dg.dateLabel}
                      </span>
                      {dg.chips.map((chip) => (
                        <Chip
                          key={chip.id}
                          chip={chip}
                          onClick={onChipClick}
                          renderChip={renderChip}
                        />
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Chip({
  chip,
  onClick,
  renderChip,
}: {
  chip: MonthChip;
  onClick?: (chip: MonthChip) => void;
  renderChip?: (args: {
    chip: MonthChip;
    className: string;
    inner: React.ReactNode;
  }) => React.ReactNode;
}) {
  const family = CHIP_FAMILY[chip.type];
  const cls =
    `cmv-chip is-${family} is-${chip.variant}` +
    (chip.undated ? ' is-undated' : '');

  const inner = (
    <>
      <span className="cmv-chip-ic" aria-hidden="true">
        {chip.variant === 'done' ? '✓' : ACTIVITY_TYPE_ICON[chip.type]}
      </span>
      {chip.variant === 'excluded' && (
        <span className="cmv-chip-tag is-excl">excl</span>
      )}
      {chip.variant === 'up-next' && (
        <span className="cmv-chip-tag is-upnext" title="Up next">
          ↑
        </span>
      )}
      {chip.due && (
        <span className="cmv-chip-tag is-due" title="Has a due date">
          due
        </span>
      )}
      <span className="cmv-chip-title">{chip.title}</span>
      {chip.blockRef && <span className="cmv-chip-block">{chip.blockRef}</span>}
      {chip.undated && (
        <span
          className="cmv-chip-undated"
          title="Not dated yet — shown on the week start"
          aria-label="Not dated yet"
        >
          ·
        </span>
      )}
    </>
  );

  // Student (Slice 2) — the caller owns the chip's clickable wrapper.
  if (renderChip) {
    return <>{renderChip({ chip, className: cls, inner })}</>;
  }

  // Tutor (Slice 1) — chip click jumps to the list (locked never clickable).
  const clickable = !!onClick && chip.variant !== 'locked';
  if (clickable) {
    return (
      <button
        type="button"
        className={cls}
        onClick={() => onClick!(chip)}
        title={chip.title}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={cls} title={chip.title}>
      {inner}
    </div>
  );
}
