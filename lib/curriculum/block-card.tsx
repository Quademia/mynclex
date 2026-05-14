// mynclex/lib/curriculum/block-card.tsx
//
// One block in the unit body. Renders:
//   • Block header — title + Draft/Live pill + edit / delete / up
//     / down controls
//   • Stack of in-block activity rows (sortable within the block)
//   • "+ Add activity to block" dashed button at the bottom
//
// Stateless about transitions — every interaction calls back to
// <UnitBuilder>, which owns isPending state, error toast, and
// modal orchestration. Mirrors the parent ↔ child shape used for
// activity rows.

'use client';

import type { ReactNode } from 'react';
import { ActivityRow } from './activity-row';
import { unitStatusLabel, unitStatusPillClass } from './format';
import type { ProgrammeActivity, ProgrammeBlock } from './types';

interface BlockCardProps {
  block: ProgrammeBlock;
  activities: ProgrammeActivity[];

  // Unit-body reorder of the block as a whole.
  canMoveUp: boolean;
  canMoveDown: boolean;
  reorderPending: boolean;
  onReorder: (direction: 'up' | 'down') => void;

  // Block-level actions.
  onEdit: () => void;
  onDelete: () => void;
  onAddActivity: () => void;

  // Activity-level actions inside this block.
  onActivityClick: (activity: ProgrammeActivity) => void;
  onActivityReorder: (
    activity: ProgrammeActivity,
    direction: 'up' | 'down'
  ) => void;
  onActivityDelete: (activity: ProgrammeActivity) => void;
  onActivityMoveOut: (activity: ProgrammeActivity) => void;

  // Slot for any move-into-block popover the parent might want to
  // anchor here (unused today; reserved for future overflow menus).
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

  return (
    <article className="block-card">
      <header className="block-card-head">
        <div className="block-card-head-meta">
          <span className="block-card-label">Block</span>
          <span className={`unit-pill ${unitStatusPillClass(block.is_published)}`}>
            {unitStatusLabel(block.is_published)}
          </span>
        </div>

        <h3 className="block-card-title">{block.title}</h3>

        {block.description && (
          <p className="block-card-desc">{block.description}</p>
        )}

        <div className="block-card-controls" role="group" aria-label="Block controls">
          <button
            type="button"
            className="block-card-action"
            onClick={onEdit}
            aria-label="Edit block"
            title="Edit block"
          >
            Edit
          </button>
          <button
            type="button"
            className="activity-row-arrow"
            aria-label="Move block up"
            onClick={() => onReorder('up')}
            disabled={!canMoveUp || reorderPending}
          >
            ↑
          </button>
          <button
            type="button"
            className="activity-row-arrow"
            aria-label="Move block down"
            onClick={() => onReorder('down')}
            disabled={!canMoveDown || reorderPending}
          >
            ↓
          </button>
          <button
            type="button"
            className="activity-row-delete"
            aria-label="Delete block"
            onClick={onDelete}
            title="Delete block"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="block-card-body">
        {isEmpty ? (
          <p className="block-card-empty">
            Empty block — add an activity below or it&apos;ll be removed.
          </p>
        ) : (
          <div className="activity-list" role="list">
            {activities.map((activity, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === activities.length - 1;
              return (
                <ActivityRow
                  key={activity.activity_id}
                  activity={activity}
                  canMoveUp={!isFirst}
                  canMoveDown={!isLast}
                  reorderPending={reorderPending}
                  onClick={() => onActivityClick(activity)}
                  onReorder={(direction) => onActivityReorder(activity, direction)}
                  onDelete={() => onActivityDelete(activity)}
                  onMoveOutOfBlock={() => onActivityMoveOut(activity)}
                />
              );
            })}
          </div>
        )}

        {children}

        <button
          type="button"
          className="block-card-add"
          onClick={onAddActivity}
        >
          + Add activity to block
        </button>
      </div>
    </article>
  );
}
