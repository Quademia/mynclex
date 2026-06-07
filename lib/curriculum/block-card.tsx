// mynclex/lib/curriculum/block-card.tsx
//
// One block in the unit body. CD "Curriculum Workspace" restyle (.blk):
// a tinted header band (grip + "Block" label + title + pill + move/⋯
// controls), an optional description, then the in-block activity rows
// and a dashed "Add activity to block". Stateless about transitions —
// every interaction calls back to <UnitBuilder>.

'use client';

import type { ReactNode } from 'react';
import { ActivityRow } from './activity-row';
import { CurIcon } from './cur-icon';
import { CurMenu } from './cur-menu';
import type { CurMenuItem } from './cur-menu';
import { unitStatusLabel, unitStatusPillClass } from './format';
import type { ProgrammeActivity, ProgrammeBlock } from './types';

interface BlockCardProps {
  block: ProgrammeBlock;
  activities: ProgrammeActivity[];

  canMoveUp: boolean;
  canMoveDown: boolean;
  reorderPending: boolean;
  onReorder: (direction: 'up' | 'down') => void;

  onEdit: () => void;
  onDelete: () => void;
  onAddActivity: () => void;

  onActivityClick: (activity: ProgrammeActivity) => void;
  onActivityReorder: (activity: ProgrammeActivity, direction: 'up' | 'down') => void;
  onActivityDelete: (activity: ProgrammeActivity) => void;
  onActivityMoveOut: (activity: ProgrammeActivity) => void;

  // Slot for an inline activity-type picker scoped to this block.
  children?: ReactNode;
}

export function BlockCard({
  block,
  activities,
  canMoveUp,
  canMoveDown,
  reorderPending,
  onReorder,
  onEdit,
  onDelete,
  onAddActivity,
  onActivityClick,
  onActivityReorder,
  onActivityDelete,
  onActivityMoveOut,
  children,
}: BlockCardProps) {
  const isEmpty = activities.length === 0;

  const menuItems: CurMenuItem[] = [
    { label: 'Edit block', icon: 'pencil', onClick: onEdit },
    {
      label: 'Move up',
      icon: 'arrowUp',
      disabled: !canMoveUp || reorderPending,
      onClick: () => onReorder('up'),
    },
    {
      label: 'Move down',
      icon: 'arrowDown',
      disabled: !canMoveDown || reorderPending,
      onClick: () => onReorder('down'),
    },
    { sep: true },
    { label: 'Delete block', icon: 'trash', danger: true, onClick: onDelete },
  ];

  return (
    <article className="blk">
      <header className="blk-head">
        <span className="blk-grip" aria-hidden="true">
          <CurIcon name="grip" size={16} />
        </span>
        <span className="blk-titlewrap">
          <span className="blk-label">Block</span>
          <span className="blk-title">{block.title}</span>
          <span className={`unit-pill ${unitStatusPillClass(block.is_published)} sm`}>
            {unitStatusLabel(block.is_published)}
          </span>
        </span>
        <div className="blk-controls" role="group" aria-label="Block controls">
          <button
            type="button"
            className="cur-icon-btn"
            aria-label="Move block up"
            disabled={!canMoveUp || reorderPending}
            onClick={() => onReorder('up')}
          >
            <CurIcon name="arrowUp" size={15} />
          </button>
          <button
            type="button"
            className="cur-icon-btn"
            aria-label="Move block down"
            disabled={!canMoveDown || reorderPending}
            onClick={() => onReorder('down')}
          >
            <CurIcon name="arrowDown" size={15} />
          </button>
          <CurMenu items={menuItems} ariaLabel={`Actions for block ${block.title}`} />
        </div>
      </header>

      {block.description && <p className="blk-desc">{block.description}</p>}

      <div className="blk-body">
        {isEmpty ? (
          <p className="blk-empty">
            Empty block — add an activity below or it&apos;ll be removed.
          </p>
        ) : (
          activities.map((activity, idx) => (
            <ActivityRow
              key={activity.activity_id}
              activity={activity}
              canMoveUp={idx > 0}
              canMoveDown={idx < activities.length - 1}
              reorderPending={reorderPending}
              onClick={() => onActivityClick(activity)}
              onReorder={(direction) => onActivityReorder(activity, direction)}
              onDelete={() => onActivityDelete(activity)}
              onMoveOutOfBlock={() => onActivityMoveOut(activity)}
            />
          ))
        )}

        {children}

        <button type="button" className="blk-add" onClick={onAddActivity}>
          <CurIcon name="plus" size={14} /> Add activity to block
        </button>
      </div>
    </article>
  );
}
