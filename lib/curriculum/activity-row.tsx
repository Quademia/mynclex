// mynclex/lib/curriculum/activity-row.tsx
//
// Shared row presentation for both loose activities (in the unit body)
// and in-block activities. CD "Curriculum Workspace" restyle (.act):
// drag grip + a line-icon in a tinted square + title/pill + type label,
// with move-up/down + a ⋯ menu (Edit · Move in/out of block · Delete)
// revealed on hover. Purely presentational — every interaction is a
// callback; the parent (UnitBuilder) owns transitions + modals.

'use client';

import { CurIcon } from './cur-icon';
import { CurMenu } from './cur-menu';
import type { CurMenuItem } from './cur-menu';
import {
  ACTIVITY_TYPE_ICON,
  unitStatusLabel,
  unitStatusPillClass,
} from './format';
import type { ActivityType, ProgrammeActivity } from './types';

const TYPE_LABEL: Record<ActivityType, string> = {
  TEXT: 'Text',
  PDF: 'PDF',
  EXTERNAL_LINK: 'Link',
  ONLINE_LIVE_SESSION: 'Online live session',
  MOCK: 'Mock',
  PRACTICE_QUIZ: 'Practice quiz',
  LIBRARY_NOTE: 'Library note',
  SHELF: 'Shelf',
};

interface ActivityRowProps {
  activity: ProgrammeActivity;
  canMoveUp: boolean;
  canMoveDown: boolean;
  reorderPending: boolean;
  onClick: () => void;
  onReorder: (direction: 'up' | 'down') => void;
  onDelete: () => void;

  // Loose rows pass onMoveIntoBlock (only when hasBlocks). In-block
  // rows pass onMoveOutOfBlock. Mutually exclusive.
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
  const inBlock = !!onMoveOutOfBlock;

  const menuItems: CurMenuItem[] = [
    { label: 'Edit', icon: 'pencil', onClick },
    ...(inBlock
      ? [
          {
            label: 'Move out of block',
            icon: 'arrowLeft',
            onClick: onMoveOutOfBlock,
          } as CurMenuItem,
        ]
      : hasBlocks && onMoveIntoBlock
        ? [
            {
              label: 'Move into block',
              icon: 'chevronRight',
              onClick: onMoveIntoBlock,
            } as CurMenuItem,
          ]
        : []),
    { sep: true },
    { label: 'Delete', icon: 'trash', danger: true, onClick: onDelete },
  ];

  return (
    <div className="act" onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <span className="act-grip" aria-hidden="true">
        <CurIcon name="grip" size={16} />
      </span>
      <span className="act-icon" aria-hidden="true">
        {ACTIVITY_TYPE_ICON[activity.type]}
      </span>
      <span className="act-text">
        <span className="act-titlerow">
          <span className="act-title">{activity.title}</span>
          <span className={`unit-pill ${unitStatusPillClass(activity.is_published)} sm`}>
            {unitStatusLabel(activity.is_published)}
          </span>
        </span>
        <span className="act-type">{TYPE_LABEL[activity.type]}</span>
      </span>

      <div
        className="act-controls"
        role="group"
        aria-label="Row controls"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="cur-icon-btn"
          aria-label="Move up"
          disabled={!canMoveUp || reorderPending}
          onClick={() => onReorder('up')}
        >
          <CurIcon name="arrowUp" size={15} />
        </button>
        <button
          type="button"
          className="cur-icon-btn"
          aria-label="Move down"
          disabled={!canMoveDown || reorderPending}
          onClick={() => onReorder('down')}
        >
          <CurIcon name="arrowDown" size={15} />
        </button>
        <CurMenu items={menuItems} ariaLabel={`Actions for ${activity.title}`} />
      </div>
    </div>
  );
}
