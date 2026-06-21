// mynclex/lib/curriculum/student-viewer.tsx
//
// Slice 10.1 → 10.1b — server-rendered curriculum tree the student
// sees. Same shape for self-paced and tutor-led — the producer
// query (lib/curriculum/student-queries.ts) decides the visibility
// rules; this viewer just renders what it's given.
//
// Tree shape:
//   Unit card (Week N / Module N)
//   └── Block card (optional, named)
//   │   └── Activity card × N
//   └── Loose activity card × N
//
// Slice 10.1b — the curriculum page is a course map / launcher,
// not a content reader. Each activity card shows its summary
// (type, title, description, note, estimated time) plus ONE action
// button. Content consumption (reading, PDF, link, session, quiz)
// happens on the per-type surface, never inline on this page.
//
// Slice 10.2-10.5 — the action button + per-type dispatch live in
// the shared <ActivityAction> piece (reused by the future weekly +
// calendar views). Text / External link / Live session / PDF are
// wired up; Mock + Practice quiz stay disabled pending the central
// tutor-quiz system.
//
// Slice 10.6 / 10.7 — a tutor-led activity's row reflects its
// window: LOCKED before release ("Opens <date>"), OPEN between
// release and close (with a "Due <date>" line when a due date is
// set), CLOSED past the close date ("Closed <date>"). Draft /
// excluded activities are still hidden entirely — locked/closed
// is not the same as hidden.
//
// Empty units (no visible activities, no visible blocks) render
// as a "no content yet" card — the tutor's structural intent
// stays visible even when the body is empty.
//
// Progress engine, Slices 1-3 — row state pill cascade:
//   0. Event (📅 neutral)    — ONLINE_LIVE_SESSION: an event, not a
//                              task. No completion semantics in v1 (the
//                              "only verified completion counts" rule);
//                              wins over the cascade below.
//   1. Done (green ✓)        — terminal, wins over everything
//   2. In progress (amber)   — quiz row with an IN_PROGRESS attempt
//                              (derived; never for manual types)
//   3. Up next / Start here  — the single forward-pointing row
//      (accent)                (copy depends on hasAnyDone)
//   4. Not started (muted)   — default for OPEN rows
//   5. (no pill)              — LOCKED / CLOSED rows (the 🔒 in
//                              their action area is their signal)
// See docs/product-plan/progress-engine.md §§8.1, 8.4-8.5 + Slice 3
// pill-cascade decision (2026-05-16 build session).

import {
  unitLabel,
  formatUnitTitle,
  formatWindowDate,
  isPastDue,
  ACTIVITY_TYPE_ICON,
} from './format';
import { ActivityAction } from './activity-action';
import { StudentUnitTabs } from './student-unit-tabs';
import type {
  ProgrammeActivity,
  StudentActivity,
  StudentCurriculumTree,
} from './types';

export function StudentCurriculumViewer({
  tree,
}: {
  tree: StudentCurriculumTree;
}) {
  const unitNoun = tree.programme.unit_label === 'WEEK' ? 'Weeks' : 'Modules';

  return (
    <div className="student-curriculum">
      <header className="student-curriculum-head">
        <h1 className="student-curriculum-title">{tree.programme.title}</h1>
        <p className="student-curriculum-sub">
          {unitNoun} in this programme. Tap an activity to open it.
          {tree.cohort && tree.cohort.name
            ? ` Cohort: ${tree.cohort.name}.`
            : null}
        </p>
      </header>

      {tree.units.length === 0 ? (
        <div className="student-curriculum-empty">
          No content has been published yet.
        </div>
      ) : tree.units.length === 1 ? (
        // Single unit — render the section directly, no tabs (per
        // Slice 10.8 design decision: tabs add noise when there's
        // only one unit).
        <div className="student-curriculum-units">
          <UnitSection unit={tree.units[0]} tree={tree} />
        </div>
      ) : (
        // 2+ units — wrap with the client tabs component. Children
        // are server-rendered <UnitSection> nodes, one per tab; the
        // wrapper shows only the selected one.
        // Slice 3 — pass `pct` per tab (drives the "· NN%" suffix)
        // and `defaultIndex` (Where I left off; falls back to Unit 1
        // inside the wrapper when null).
        <StudentUnitTabs
          tabs={tree.units.map((u) => ({
            index: u.unit.unit_index,
            label: unitLabel(u.unit.unit_index, tree.programme.unit_label),
            pct: u.progressPct,
          }))}
          defaultIndex={tree.whereILeftOffUnitIndex}
        >
          {tree.units.map((u) => (
            <UnitSection key={u.unit.unit_id} unit={u} tree={tree} />
          ))}
        </StudentUnitTabs>
      )}
    </div>
  );
}

function UnitSection({
  unit,
  tree,
}: {
  unit: StudentCurriculumTree['units'][number];
  tree: StudentCurriculumTree;
}) {
  // Slice 11.11a — base path for the library read view a LIBRARY_NOTE
  // activity links to. Cohort route when tutor-led, programme route
  // otherwise — both have a `/library/note/[id]` read view.
  const libraryBasePath = tree.cohort
    ? `/student/cohort/${tree.cohort.cohort_id}/library`
    : `/student/programme/${tree.programme.programme_id}/library`;

  return (
    <section className="student-unit">
      <header className="student-unit-head">
        <div className="student-unit-tag">
          {unitLabel(unit.unit.unit_index, tree.programme.unit_label)}
        </div>
        <h2 className="student-unit-title">
          {formatUnitTitle(unit.unit, tree.programme.unit_label)}
        </h2>
        {unit.unit.description && (
          <p className="student-unit-desc">{unit.unit.description}</p>
        )}
      </header>

      {unit.body.length === 0 ? (
        <div className="student-unit-empty">
          No content yet for this {unitNounSingular(tree.programme.unit_label)}.
        </div>
      ) : (
        <div className="student-unit-body">
          {unit.body.map((entry) =>
            entry.kind === 'block' ? (
              <BlockCard
                key={`b-${entry.block.block_id}`}
                entry={entry}
                upNextActivityId={tree.upNextActivityId}
                hasAnyDone={tree.hasAnyDone}
                libraryBasePath={libraryBasePath}
              />
            ) : (
              <ActivityCard
                key={`a-${entry.activity.activity_id}`}
                activity={entry.activity}
                upNextActivityId={tree.upNextActivityId}
                hasAnyDone={tree.hasAnyDone}
                libraryBasePath={libraryBasePath}
              />
            )
          )}
        </div>
      )}
    </section>
  );
}

function BlockCard({
  entry,
  upNextActivityId,
  hasAnyDone,
  libraryBasePath,
}: {
  entry: Extract<
    StudentCurriculumTree['units'][number]['body'][number],
    { kind: 'block' }
  >;
  upNextActivityId: string | null;
  hasAnyDone: boolean;
  libraryBasePath: string;
}) {
  return (
    <article className="student-block">
      <header className="student-block-head">
        <h3 className="student-block-title">{entry.block.title}</h3>
        {entry.block.description && (
          <p className="student-block-desc">{entry.block.description}</p>
        )}
      </header>
      {entry.activities.length === 0 ? (
        <div className="student-block-empty">
          No activities yet in this block.
        </div>
      ) : (
        <div className="student-block-body">
          {entry.activities.map((a) => (
            <ActivityCard
              key={a.activity_id}
              activity={a}
              upNextActivityId={upNextActivityId}
              hasAnyDone={hasAnyDone}
              libraryBasePath={libraryBasePath}
            />
          ))}
        </div>
      )}
    </article>
  );
}

function ActivityCard({
  activity,
  upNextActivityId,
  hasAnyDone,
  libraryBasePath,
}: {
  activity: StudentActivity;
  upNextActivityId: string | null;
  hasAnyDone: boolean;
  libraryBasePath: string;
}) {
  const locked = activity.openState !== 'OPEN';
  const overdue =
    activity.openState === 'OPEN' && isPastDue(activity.dueDate);

  return (
    <article
      className={
        [
          'student-activity',
          locked ? 'is-locked' : null,
          activity.isDone ? 'is-done' : null,
        ]
          .filter(Boolean)
          .join(' ')
      }
      data-type={activity.type}
    >
      <header className="student-activity-head">
        <span className="student-activity-icon" aria-hidden="true">
          {ACTIVITY_TYPE_ICON[activity.type]}
        </span>
        <span className="student-activity-type">
          {activityTypeLabel(activity.type)}
        </span>
        <h4 className="student-activity-title">{activity.title}</h4>
        {/* Slice 11.12c — shelf drift chip. Shown when the shelf's
            membership changed since the student last opened it; clears
            when they open the popup (marks seen). Sits before the state
            pill so the "Done/Up next" cascade still reads clearly. */}
        {activity.type === 'SHELF' && activity.shelfUpdate && (
          <span className="student-activity-shelf-updated" title="Your tutor changed this shelf since you last opened it">
            Updated
          </span>
        )}
        {/* Pill cascade — see header comment for full priority order.
            Computed once into a local for readability. */}
        {(() => {
          // Live session — an EVENT, not a task. No completion pill
          // (Done / Up next / Not started don't apply); a neutral event
          // chip marks it so the absent task-pill reads as deliberate.
          // See docs/product-plan/live-session-planner.md.
          if (activity.type === 'ONLINE_LIVE_SESSION') {
            // Slice 3b — once the tutor marks attendance, reflect it on the
            // event row (Attended / Missed / Excused). Until then (and for
            // upcoming sessions), the neutral 📅 event chip. The completion
            // % is unchanged — attendance-in-% is a later coordinated pass.
            if (activity.attendance === 'PRESENT') {
              return (
                <span className="student-activity-state is-attended">
                  <span className="student-activity-state-icon" aria-hidden="true">
                    ✓
                  </span>
                  <span className="student-activity-state-label">Attended</span>
                </span>
              );
            }
            if (activity.attendance === 'ABSENT') {
              return (
                <span className="student-activity-state is-missed">
                  <span className="student-activity-state-icon" aria-hidden="true">
                    ✕
                  </span>
                  <span className="student-activity-state-label">Missed</span>
                </span>
              );
            }
            if (activity.attendance === 'EXCUSED') {
              return (
                <span className="student-activity-state is-excused">
                  <span className="student-activity-state-icon" aria-hidden="true">
                    –
                  </span>
                  <span className="student-activity-state-label">Excused</span>
                </span>
              );
            }
            return (
              <span className="student-activity-state is-event">
                <span
                  className="student-activity-state-icon"
                  aria-hidden="true"
                >
                  📅
                </span>
                <span className="student-activity-state-label">Event</span>
              </span>
            );
          }
          if (activity.isDone) {
            return (
              <span className="student-activity-state is-done">
                <span className="student-activity-state-icon" aria-hidden="true">
                  ✓
                </span>
                <span className="student-activity-state-label">Done</span>
              </span>
            );
          }
          if (activity.isInProgress) {
            return (
              <span className="student-activity-state is-in-progress">
                <span className="student-activity-state-dot" aria-hidden="true" />
                <span className="student-activity-state-label">In progress</span>
              </span>
            );
          }
          if (activity.activity_id === upNextActivityId) {
            // Copy flips on whether the student has ANY DONE row in
            // the programme (§8.1) — empty slate gets the welcoming
            // "Start here", any progress flips to forward-looking
            // "Up next". upNextActivityId is only ever set on an
            // OPEN row (the derivation skips LOCKED / CLOSED), so
            // no extra guard needed here.
            return (
              <span className="student-activity-state is-up-next">
                <span className="student-activity-state-dot" aria-hidden="true" />
                <span className="student-activity-state-label">
                  {hasAnyDone ? 'Up next' : 'Start here'}
                </span>
              </span>
            );
          }
          if (activity.openState === 'OPEN') {
            return (
              <span className="student-activity-state is-not-started">
                <span className="student-activity-state-dot" aria-hidden="true" />
                <span className="student-activity-state-label">Not started</span>
              </span>
            );
          }
          // LOCKED / CLOSED — no pill. The 🔒 in the action area
          // is the relevant signal.
          return null;
        })()}
      </header>

      {activity.description && (
        <p className="student-activity-desc">{activity.description}</p>
      )}
      {activity.note && (
        <p className="student-activity-note">
          <strong>Note:</strong> {activity.note}
        </p>
      )}

      {/* Slice 11.12b — shelf progress meta ("N of M notes done"). The
          shelf rolls up to DONE (the pill above) once all are read. */}
      {activity.type === 'SHELF' && activity.shelfMembers && (
        <p className="student-activity-shelf-meta">
          {activity.shelfMembers.length === 0
            ? 'No notes available yet'
            : `${activity.shelfMembers.filter((m) => m.isDone).length} of ${activity.shelfMembers.length} note${activity.shelfMembers.length === 1 ? '' : 's'} done`}
        </p>
      )}

      {activity.openState === 'OPEN' && (
        <>
          {activity.dueDate && (
            <p
              className={
                overdue
                  ? 'student-activity-due is-overdue'
                  : 'student-activity-due'
              }
            >
              Due {formatWindowDate(activity.dueDate)}
              {overdue ? ' · overdue' : ''}
            </p>
          )}
          <ActivityAction activity={activity} libraryBasePath={libraryBasePath} />
        </>
      )}

      {activity.openState === 'LOCKED' && (
        <div className="student-activity-locked">
          <span aria-hidden="true">🔒</span>
          <span>
            {activity.releaseDate
              ? `Opens ${formatWindowDate(activity.releaseDate)}`
              : 'Opens later'}
          </span>
        </div>
      )}

      {activity.openState === 'CLOSED' && (
        <div className="student-activity-locked">
          <span aria-hidden="true">🔒</span>
          <span>
            {activity.closeDate
              ? `Closed ${formatWindowDate(activity.closeDate)}`
              : 'Closed'}
          </span>
        </div>
      )}
    </article>
  );
}

function activityTypeLabel(type: ProgrammeActivity['type']): string {
  switch (type) {
    case 'TEXT':
      return 'Reading';
    case 'PDF':
      return 'PDF';
    case 'EXTERNAL_LINK':
      return 'External link';
    case 'ONLINE_LIVE_SESSION':
      return 'Live session';
    case 'MOCK':
      return 'Mock';
    case 'PRACTICE_QUIZ':
      return 'Practice quiz';
    case 'LIBRARY_NOTE':
      return 'Library note';
    case 'SHELF':
      return 'Shelf';
  }
}

function unitNounSingular(label: 'WEEK' | 'MODULE'): string {
  return label === 'WEEK' ? 'week' : 'module';
}
