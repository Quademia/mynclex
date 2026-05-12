// mynclex/lib/curriculum/activity-row.tsx
//
// Shared row presentation for both loose activities (in the unit
// body) and in-block activities (inside a block card). Same
// shape, with the only variation being which contextual action
// is available:
//
//   • Loose row → "Move into block →" button (only when the
//     unit has at least one block)
//   • In-block row → "Move out" button
//
// The component is purely presentational — every interaction is
// a callback. Parent (UnitBuilder) owns transitions, error state,
// and the move-into-block popover state.

'use client';

import type { ActivityType, ProgrammeActivity } from './types';

const TYPE_ICON: Record<ActivityType, string> = {
  TEXT: '📝',
  PDF: '📄',
  EXTERNAL_LINK: '🔗',
  ONLINE_LIVE_SESSION: '🎥',
  MOCK: '🎯',
  PRACTICE_QUIZ: '✏️',
};

const TYPE_LABEL: Record<ActivityType, string> = {
  TEXT: 'Text',
  PDF: 'PDF',
  EXTERNAL_LINK: 'Link',
  ONLINE_LIVE_SESSION: 'Online live session',
  MOCK: 'Mock',
  PRACTICE_QUIZ: 'Practice quiz',
};

interface ActivityRowProps {
  activity: ProgrammeActivity;
  canMoveUp: boolean;
  canMoveDown: boolean;
  reorderPending: boolean;
  onClick: () => void;
  onReorder: (direction: 'up' | 'down') => void;
  onDelete: () => void;

  // Loose rows pass onMoveIntoBlock (only rendered if hasBlocks).
  // In-block rows pass onMoveOutOfBlock instead. Mutually
  // exclusive — never both on one row.
  onMoveIntoBlock?: () => void;
  hasBlocks?: boolean;
  onMoveOutOfBlock?: () => void;
}

export function ActivityRow({
  activity,
  canMoveUp,
  canMoveDown,
  reorderPending,
  onClick,
  onReorder,
  onDelete,
  onMoveIntoBlock,
  hasBlocks,
  onMoveOutOfBlock,
}: ActivityRowProps) {
  return (
    <div className="activity-row">
      <button
        type="button"
        className="activity-row-main"
        onClick={onClick}
      >
        <span className="activity-row-icon" aria-hidden="true">
          {TYPE_ICON[activity.type]}
        </span>
        <span className="activity-row-text">
          <span className="activity-row-title">{activity.title}</span>
          <span className="activity-row-meta">
            {TYPE_LABEL[activity.type]}
            {!activity.is_published && ' · Draft'}
          </span>
        </span>
      </button>

      <div
        className="activity-row-controls"
        role="group"
        aria-label="Row controls"
      >
        {onMoveIntoBlock && hasBlocks && (
          <button
            type="button"
            className="activity-row-move"
            onClick={onMoveIntoBlock}
            aria-label="Move into block"
            title="Move into a block"
          >
            ⤳
          </button>
        )}
        {onMoveOutOfBlock && (
          <button
            type="button"
            className="activity-row-move"
            onClick={onMoveOutOfBlock}
            aria-label="Move out as loose"
            title="Move out of this block"
          >
            ⤴
          </button>
        )}
        <button
          type="button"
          className="activity-row-arrow"
          aria-label="Move up"
          onClick={() => onReorder('up')}
          disabled={!canMoveUp || reorderPending}
        >
          ↑
        </button>
        <button
          type="button"
          className="activity-row-arrow"
          aria-label="Move down"
          onClick={() => onReorder('down')}
          disabled={!canMoveDown || reorderPending}
        >
          ↓
        </button>
        <button
          type="button"
          className="activity-row-delete"
          aria-label="Delete activity"
          onClick={onDelete}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
