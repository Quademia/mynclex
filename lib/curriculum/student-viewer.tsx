// mynclex/lib/curriculum/student-viewer.tsx
//
// Slice 10.1 — server-rendered curriculum tree the student sees.
// Same shape for self-paced and tutor-led — the producer query
// (lib/curriculum/student-queries.ts) decides the visibility
// rules; this viewer just renders what it's given.
//
// Tree shape:
//   Unit card (Week N / Module N)
//   └── Block card (optional, named)
//   │   └── Activity card × N
//   └── Loose activity card × N
//
// Activity card renders its body inline by type:
//   - TEXT          → activity body text (only TYPE we light up in 10.1)
//   - PDF           → "PDF viewer coming" stub
//   - EXTERNAL_LINK → "External link viewer coming" stub
//   - ONLINE_LIVE_SESSION → "Live session viewer coming" stub
//   - MOCK          → "Mock quiz coming" stub
//   - PRACTICE_QUIZ → "Practice quiz coming" stub
//
// Empty units (no visible activities, no visible blocks) render
// as a "no content yet" card — the tutor's structural intent
// stays visible even when the body is empty.
//
// No progress UI, no "Start" or "Mark as done" buttons. Progress
// engine ships in a later slice (planning: 10.2+).

import {
  unitLabel,
  formatUnitTitle,
} from './format';
import type {
  ActivityPayloadExternalLink,
  ActivityPayloadOnlineLiveSession,
  ActivityPayloadPdf,
  ActivityPayloadText,
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
  return (
    <article className="student-activity" data-type={activity.type}>
      <header className="student-activity-head">
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

      <div className="student-activity-body">
        <ActivityBody activity={activity} />
      </div>
    </article>
  );
}

function ActivityBody({ activity }: { activity: ProgrammeActivity }) {
  switch (activity.type) {
    case 'TEXT': {
      const body = (activity.payload as ActivityPayloadText).body ?? '';
      if (!body.trim()) {
        return <div className="student-activity-stub">No body yet.</div>;
      }
      return <div className="student-activity-text">{body}</div>;
    }
    case 'PDF': {
      const _ = activity.payload as ActivityPayloadPdf;
      return (
        <div className="student-activity-stub">
          PDF viewer coming — the file is attached on the tutor side.
        </div>
      );
    }
    case 'EXTERNAL_LINK': {
      const _ = activity.payload as ActivityPayloadExternalLink;
      return (
        <div className="student-activity-stub">External link viewer coming.</div>
      );
    }
    case 'ONLINE_LIVE_SESSION': {
      const _ = activity.payload as ActivityPayloadOnlineLiveSession;
      return (
        <div className="student-activity-stub">Live session viewer coming.</div>
      );
    }
    case 'MOCK':
      return (
        <div className="student-activity-stub">
          Mock quiz coming — the quiz selector is in a future slice.
        </div>
      );
    case 'PRACTICE_QUIZ':
      return (
        <div className="student-activity-stub">
          Practice quiz coming — the quiz selector is in a future slice.
        </div>
      );
  }
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
