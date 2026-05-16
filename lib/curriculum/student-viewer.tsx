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
// Progress engine, Slice 1 — a DONE activity gets a small ✓ tick
// in its row header. Same tick for QUIZ_ATTEMPT and MANUAL sources
// (per docs/product-plan/progress-engine.md §8.4). The "Mark as
// done" button on MANUAL types ships in Slice 2; soft guidance
// labels (Up next / Start here) and the unit-tab % ship in Slice 3.

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
        <StudentUnitTabs
          tabs={tree.units.map((u) => ({
            index: u.unit.unit_index,
            label: unitLabel(u.unit.unit_index, tree.programme.unit_label),
          }))}
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
              />
            ) : (
              <ActivityCard
                key={`a-${entry.activity.activity_id}`}
                activity={entry.activity}
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
}: {
  entry: Extract<
    StudentCurriculumTree['units'][number]['body'][number],
    { kind: 'block' }
  >;
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
            <ActivityCard key={a.activity_id} activity={a} />
          ))}
        </div>
      )}
    </article>
  );
}

function ActivityCard({ activity }: { activity: StudentActivity }) {
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
        {activity.isDone && (
          <span
            className="student-activity-done-tick"
            aria-label="Completed"
            title="Completed"
          >
            ✓
          </span>
        )}
      </header>

      {activity.description && (
        <p className="student-activity-desc">{activity.description}</p>
      )}
      {activity.note && (
        <p className="student-activity-note">
          <strong>Note:</strong> {activity.note}
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
          <ActivityAction activity={activity} />
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
  }
}

function unitNounSingular(label: 'WEEK' | 'MODULE'): string {
  return label === 'WEEK' ? 'week' : 'module';
}
