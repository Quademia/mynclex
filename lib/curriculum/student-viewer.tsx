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
// button. The button is disabled here — the actual viewer for each
// type lands in its own slice and flips that type's button live.
// Content consumption (reading, PDF, link, session, quiz) happens
// on the per-type surface, never inline on this page.
//
// Empty units (no visible activities, no visible blocks) render
// as a "no content yet" card — the tutor's structural intent
// stays visible even when the body is empty.
//
// No progress UI, no "Start" or "Mark as done" state. The progress
// engine ships in a later slice.

import {
  unitLabel,
  formatUnitTitle,
  activityActionLabel,
  activityEstimatedMinutes,
  ACTIVITY_TYPE_ICON,
} from './format';
import type {
  ProgrammeActivity,
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
      ) : (
        <div className="student-curriculum-units">
          {tree.units.map((u) => (
            <section className="student-unit" key={u.unit.unit_id}>
              <header className="student-unit-head">
                <div className="student-unit-tag">
                  {unitLabel(u.unit.unit_index, tree.programme.unit_label)}
                </div>
                <h2 className="student-unit-title">
                  {formatUnitTitle(u.unit, tree.programme.unit_label)}
                </h2>
                {u.unit.description && (
                  <p className="student-unit-desc">{u.unit.description}</p>
                )}
              </header>

              {u.body.length === 0 ? (
                <div className="student-unit-empty">
                  No content yet for this {unitNounSingular(tree.programme.unit_label)}.
                </div>
              ) : (
                <div className="student-unit-body">
                  {u.body.map((entry, idx) =>
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
          ))}
        </div>
      )}
    </div>
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

function ActivityCard({ activity }: { activity: ProgrammeActivity }) {
  const estMinutes = activityEstimatedMinutes(activity);

  return (
    <article className="student-activity" data-type={activity.type}>
      <header className="student-activity-head">
        <span className="student-activity-icon" aria-hidden="true">
          {ACTIVITY_TYPE_ICON[activity.type]}
        </span>
        <span className="student-activity-type">
          {activityTypeLabel(activity.type)}
        </span>
        <h4 className="student-activity-title">{activity.title}</h4>
      </header>

      {activity.description && (
        <p className="student-activity-desc">{activity.description}</p>
      )}
      {activity.note && (
        <p className="student-activity-note">
          <strong>Note:</strong> {activity.note}
        </p>
      )}

      <div className="student-activity-action">
        {estMinutes != null && (
          <span className="student-activity-est">~{estMinutes} min</span>
        )}
        {/* Disabled until this type's viewer slice lands. */}
        <button type="button" className="student-activity-launch" disabled>
          {activityActionLabel(activity.type)}
        </button>
      </div>
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
