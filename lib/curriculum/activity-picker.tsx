// mynclex/lib/curriculum/activity-picker.tsx
//
// Inline 3×2 activity-type picker (mockup screen 5). Replaces the
// "+ Add activity" button in place — not a modal — so the tutor
// keeps the unit body visible while choosing.
//
// 9.3b enabled TEXT; 9.3d-a added EXTERNAL_LINK + ONLINE_LIVE_SESSION;
// 9.3d-c added PDF; 9.3d-d enables MOCK + PRACTICE_QUIZ as
// placeholders (the activity saves, but the central tutor-quiz
// system that powers them ships in a later slice). No type ever
// disappears from the picker — the grid shape is part of the
// affordance ("these are the six kinds of activities you can add").

'use client';

import type { ActivityType } from './types';
import { ACTIVITY_TYPE_ICON } from './format';

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
  'LIBRARY_NOTE',
  'SHELF',
];

// Icon is sourced from ACTIVITY_TYPE_ICON (shared) — only the
// label + sub copy is picker-specific.
const TILE_COPY: Record<ActivityType, { label: string; sub: string }> = {
  TEXT:                { label: 'Text content',        sub: 'Notes & reading'   },
  PDF:                 { label: 'PDF upload',          sub: 'Slides / handouts' },
  EXTERNAL_LINK:       { label: 'External link',       sub: 'YouTube / website' },
  ONLINE_LIVE_SESSION: { label: 'Online live session', sub: 'Tutorial / Q&A'    },
  MOCK:                { label: 'Mock assessment',     sub: 'Timed exam-style'  },
  PRACTICE_QUIZ:       { label: 'Practice quiz',       sub: 'Bank-drawn quiz'   },
  LIBRARY_NOTE:        { label: 'Library note',        sub: 'Reusable note'     },
  SHELF:               { label: 'Library shelf',       sub: 'A pack of notes'   },
};

// All six types enabled as of 9.3d-d. MOCK + PRACTICE_QUIZ ship
// as placeholders (no body fields, no student-launch path until
// the tutor-quiz system lands). The picker greys out anything not
// on this list — currently nothing.
const ENABLED_TYPES: ReadonlyArray<ActivityType> = [
  'TEXT',
  'PDF',
  'EXTERNAL_LINK',
  'ONLINE_LIVE_SESSION',
  'MOCK',
  'PRACTICE_QUIZ',
  'LIBRARY_NOTE',
  'SHELF',
];

interface ActivityPickerProps {
  onPick: (type: ActivityType) => void;
  onCancel: () => void;
  // Optional override of which types to offer (defaults to the full
  // grid). The cohort-only escape valve passes the self-contained subset
  // (Text / PDF / External link) in Slice 1.
  types?: ActivityType[];
  // Optional header override (defaults to "Add an activity").
  title?: string;
}

export function ActivityPicker({
  onPick,
  onCancel,
  types,
  title,
}: ActivityPickerProps) {
  const order = types ?? TILE_ORDER;
  return (
    <div className="activity-picker" role="group" aria-label="Pick an activity type">
      <header className="activity-picker-head">
        <h4 className="activity-picker-title">{title ?? 'Add an activity'}</h4>
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
        {order.map((type) => {
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
                {ACTIVITY_TYPE_ICON[type]}
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
