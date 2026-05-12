// mynclex/lib/curriculum/activity-picker.tsx
//
// Inline 3×2 activity-type picker (mockup screen 5). Replaces the
// "+ Add activity" button in place — not a modal — so the tutor
// keeps the unit body visible while choosing.
//
// 9.3b enables TEXT only; the other five tiles render disabled
// with a "Coming soon" subline. As 9.3d adds editors, the
// `enabled` set grows. No type ever disappears from the picker —
// the grid shape is part of the affordance ("these are the six
// kinds of activities you can add").

'use client';

import type { ActivityType } from './types';

// Tile copy per type. Mirrors curriculum-authoring-ux.md §6.
// Order is the mockup's 3×2 layout: row 1 Text / PDF / Link,
// row 2 Online live session / Mock / Practice quiz.
const TILE_ORDER: ActivityType[] = [
  'TEXT',
  'PDF',
  'EXTERNAL_LINK',
  'ONLINE_LIVE_SESSION',
  'MOCK',
  'PRACTICE_QUIZ',
];

const TILE_COPY: Record<
  ActivityType,
  { label: string; sub: string; icon: string }
> = {
  TEXT:                { label: 'Text content',        sub: 'Notes & reading',   icon: '📝' },
  PDF:                 { label: 'PDF upload',          sub: 'Slides / handouts', icon: '📄' },
  EXTERNAL_LINK:       { label: 'External link',       sub: 'YouTube / website', icon: '🔗' },
  ONLINE_LIVE_SESSION: { label: 'Online live session', sub: 'Tutorial / Q&A',    icon: '🎥' },
  MOCK:                { label: 'Mock assessment',     sub: 'Timed exam-style',  icon: '🎯' },
  PRACTICE_QUIZ:       { label: 'Practice quiz',       sub: 'Bank-drawn quiz',   icon: '✏️' },
};

// Types enabled in 9.3d-a. PDF / MOCK / PRACTICE_QUIZ land in
// 9.3d-b. The picker greys out anything not on this list.
const ENABLED_TYPES: ReadonlyArray<ActivityType> = [
  'TEXT',
  'EXTERNAL_LINK',
  'ONLINE_LIVE_SESSION',
];

interface ActivityPickerProps {
  onPick: (type: ActivityType) => void;
  onCancel: () => void;
}

export function ActivityPicker({ onPick, onCancel }: ActivityPickerProps) {
  return (
    <div className="activity-picker" role="group" aria-label="Pick an activity type">
      <header className="activity-picker-head">
        <h4 className="activity-picker-title">Add an activity</h4>
        <button
          type="button"
          className="activity-picker-cancel"
          onClick={onCancel}
          aria-label="Cancel"
        >
          Cancel
        </button>
      </header>

      <div className="activity-picker-grid">
        {TILE_ORDER.map((type) => {
          const copy = TILE_COPY[type];
          const enabled = ENABLED_TYPES.includes(type);
          return (
            <button
              key={type}
              type="button"
              className={
                enabled
                  ? 'activity-picker-tile'
                  : 'activity-picker-tile is-disabled'
              }
              onClick={() => enabled && onPick(type)}
              disabled={!enabled}
              aria-label={copy.label}
            >
              <span className="activity-picker-tile-icon" aria-hidden="true">
                {copy.icon}
              </span>
              <span className="activity-picker-tile-label">{copy.label}</span>
              <span className="activity-picker-tile-sub">
                {enabled ? copy.sub : 'Coming soon'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
